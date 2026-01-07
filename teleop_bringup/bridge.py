import asyncio
import json
import logging
import os
import platform
import sys
import time

# WebRTC & Network
import aiohttp
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCConfiguration, RTCIceServer
from aiortc.contrib.media import MediaPlayer, MediaRelay

# ROS2
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Joy
from asyncio import subprocess

# === KONFIGURACJA ===
SIGNALING_URL = os.getenv('SIGNALING_URL', 'wss://rafal.tail692f2a.ts.net/ws')
ROBOT_ID = os.getenv('ROBOT_ID', 'robot_1')
CAMERA_DEVICE = '/dev/video0'

# SZTYWNE OPCJE - wymuszają natychmiastowy start
CAMERA_OPTIONS = {
    "framerate": "20",          # Stabilne 20 FPS
    "video_size": "640x480",
    "pixel_format": "mjpeg",    # Format bez buforowania międzyklatkowego
    "fflags": "nobuffer",       # Zero bufora
    "flags": "low_delay",       # Tryb niskiego opóźnienia
    "probesize": "32",          # Nie analizuj pliku (start natychmiastowy)
    "analyzeduration": "0",     # Nie czekaj na kodek
    "max_delay": "0",           # Wymuś brak opóźnienia
    "reorder_queue_size": "0"   # Nie kolejkuj pakietów
}

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Bridge")

class ROS2BridgeNode(Node):
    def __init__(self):
        super().__init__('python_webrtc_bridge')
        topic_name = f'/{ROBOT_ID}/joy' if ROBOT_ID else '/g1pilot/joy'
        self.publisher_ = self.create_publisher(Joy, topic_name, 10)
        logger.info(f"ROS2 Node Started. Publishing to: {topic_name}")
        self.default_axes = [0.0] * 8
        self.default_buttons = [0] * 12

    def publish_joy(self, axes, buttons):
        msg = Joy()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = "webrtc_input"
        msg.axes = axes
        msg.buttons = buttons
        self.publisher_.publish(msg)

    async def handle_joystick_data(self, data):
        linear = float(data.get('linear', 0.0))
        angular = float(data.get('angular', 0.0))
        axes = list(self.default_axes)
        buttons = list(self.default_buttons)
        axes[1] = linear * -1.0 
        axes[2] = angular
        buttons[8] = 1 if (abs(linear) > 0.05 or abs(angular) > 0.05) else 0
        self.publish_joy(axes, buttons)

    async def handle_button_command(self, command):
        buttons = list(self.default_buttons)
        axes = list(self.default_axes)
        if command == "forward_rover": buttons[6] = 1
        elif command in ["stop_rover", "backward_rover"]: buttons[5] = 1
        self.publish_joy(axes, buttons)
        # To jest jedyny dozwolony sleep - logiczny dla ROS, nie blokuje wideo
        await asyncio.sleep(0.1) 
        buttons[6] = 0
        buttons[5] = 0
        self.publish_joy(axes, buttons)

class WebRTCClient:
    def __init__(self, ros_node):
        self.ros_node = ros_node
        self.pc = None
        self.ws = None
        self.username = ROBOT_ID
        self.peers = {} 
        
        # Inicjalizacja zmiennych kamery
        self.cam_player = None
        self.cam_relay = None
        
        # === KROK 1: URUCHOM KAMERĘ ZANIM POŁĄCZYSZ SIĘ Z SIECIĄ ===
        # To gwarantuje, że obraz jest gotowy zanim klient o niego poprosi
        self._force_start_camera()

    def _force_start_camera(self):
        """Uruchamia kamerę w trybie blokującym/sztywnym"""
        if os.path.exists(CAMERA_DEVICE):
            try:
                logger.info(f"Otwieranie kamery: {CAMERA_DEVICE}...")
                
                # Wybór sterownika w zależności od systemu
                fmt = "v4l2" if platform.system() == "Linux" else "dshow"
                src = CAMERA_DEVICE if platform.system() == "Linux" else "video=Integrated Camera"
                
                # 1. Utwórz MediaPlayer
                self.cam_player = MediaPlayer(src, format=fmt, options=CAMERA_OPTIONS)
                
                # 2. Utwórz Relay (rozdzielacz sygnału)
                self.cam_relay = MediaRelay()
                
                # 3. Sprawdzenie czy obiekt wideo istnieje
                if self.cam_player and self.cam_player.video:
                    logger.info("Kamera ZAINICJALIZOWANA POPRAWNIE. Gotowa do transmisji.")
                else:
                    logger.error("Kamera otwarta, ale brak strumienia wideo!")
            except Exception as e:
                logger.error(f"KRYTYCZNY BŁĄD KAMERY: {e}")
        else:
            logger.warning(f"BRAK URZĄDZENIA KAMERY: {CAMERA_DEVICE}")

    async def run(self):
        # === KROK 2: DOPIERO TERAZ ŁĄCZYMY SIĘ Z WEBSOCKETEM ===
        async with aiohttp.ClientSession() as session:
            while True:
                try:
                    logger.info(f"Łączenie z WebSocket: {SIGNALING_URL}")
                    async with session.ws_connect(SIGNALING_URL, ssl=False) as ws:
                        self.ws = ws
                        # Wysyłamy sygnał "jestem tutaj" dopiero jak mamy kamerę
                        await self.send_signal("new-peer", {})
                        
                        async for msg in ws:
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                await self.handle_signaling_message(json.loads(msg.data))
                            elif msg.type == aiohttp.WSMsgType.ERROR:
                                break
                except Exception:
                    logger.error("Błąd połączenia. Ponawianie za 2s...")
                    await asyncio.sleep(2)

    async def send_signal(self, action, message):
        if self.ws and not self.ws.closed:
            await self.ws.send_str(json.dumps({'peer': self.username, 'action': action, 'message': message}))

    async def handle_signaling_message(self, data):
        peer_username = data['peer']
        action = data['action']
        if peer_username == self.username: return

        # Logika obsługi - przekazuje do create_peer_connection
        if action == 'new-peer':
            # Ktoś dołączył - jesteśmy inicjatorem
            await self.create_peer_connection(peer_username, initiator=True, receiver_channel=data['message'].get('receiver_channel_name'))
        elif action == 'new-offer':
            # Ktoś wysłał ofertę - jesteśmy odbiorcą
            await self.create_peer_connection(peer_username, initiator=False, offer_sdp=data['message']['sdp'], receiver_channel=data['message']['receiver_channel_name'])
        elif action == 'new-answer':
            # Ktoś odpowiedział na naszą ofertę
            if peer_username in self.peers:
                pc = self.peers[peer_username]
                answer = data['message']['sdp']
                if pc.signalingState != "stable":
                    await pc.setRemoteDescription(RTCSessionDescription(sdp=answer['sdp'], type=answer['type']))

    async def create_peer_connection(self, peer_username, initiator, offer_sdp=None, receiver_channel=None):
        # Konfiguracja ICE (pomaga w stabilności)
        config = RTCConfiguration(iceServers=[RTCIceServer(urls=["stun:stun.l.google.com:19302"])])
        pc = RTCPeerConnection(configuration=config)
        self.peers[peer_username] = pc

        # === NAJWAŻNIEJSZE: KOLEJNOŚĆ ===
        # Najpierw dodajemy wideo, potem wszystko inne.
        
        if self.cam_relay is not None and self.cam_player is not None:
            try:
                # Pobieramy strumień z relay'a
                video_track = self.cam_relay.subscribe(self.cam_player.video)
                
                # Dodajemy Transceiver w trybie SENDONLY
                # To mówi przeglądarce: "Ja tylko wysyłam, nie czekaj na moje pozwolenie, po prostu bierz"
                pc.addTransceiver(video_track, direction="sendonly")
                logger.info(f"VIDEO: Ścieżka dodana dla {peer_username}")
            except Exception as e:
                logger.error(f"VIDEO ERROR: Nie udało się dodać ścieżki: {e}")
        else:
            logger.warning("VIDEO: Brak aktywnej kamery przy próbie połączenia!")

        # Dopiero teraz kanał danych
        if initiator:
            channel = pc.createDataChannel("chat")
            self.setup_data_channel(channel)
        
        @pc.on("datachannel")
        def on_datachannel(channel):
            self.setup_data_channel(channel)

        @pc.on("iceconnectionstatechange")
        async def on_icestate():
            if pc.iceConnectionState in ["failed", "closed"]:
                await pc.close()
                if peer_username in self.peers: del self.peers[peer_username]

        # Negocjacja SDP
        if initiator:
            offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            await self.send_signal('new-offer', {'sdp': {'sdp': pc.localDescription.sdp, 'type': pc.localDescription.type}, 'receiver_channel_name': receiver_channel})
        else:
            # Jeśli nie jesteśmy inicjatorem, najpierw ustawiamy zdalny opis
            await pc.setRemoteDescription(RTCSessionDescription(sdp=offer_sdp['sdp'], type=offer_sdp['type']))
            # Potem tworzymy odpowiedź
            answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            await self.send_signal('new-answer', {'sdp': {'sdp': pc.localDescription.sdp, 'type': pc.localDescription.type}, 'receiver_channel_name': receiver_channel})

    def setup_data_channel(self, channel):
        @channel.on("message")
        async def on_message(message):
            try:
                data = json.loads(message)
                if 'joystick' in data: await self.ros_node.handle_joystick_data(data['joystick'])
                elif 'message' in data:
                    cmd = data['message']
                    if cmd in ["forward_rover", "backward_rover", "stop_rover"]: await self.ros_node.handle_button_command(cmd)
            except: pass

async def main():
    rclpy.init()
    node = ROS2BridgeNode()
    
    # Przekazujemy node do klienta
    client = WebRTCClient(node)
    
    # Uruchomienie klienta WebRTC w tle
    asyncio.create_task(client.run())
    
    try:
        # Pętla główna - minimalny sleep wymagany dla asyncio, ale ustawiony na prawie 0
        while rclpy.ok():
            rclpy.spin_once(node, timeout_sec=0)
            await asyncio.sleep(0.001) 
    except KeyboardInterrupt: pass
    finally:
        node.destroy_node()
        rclpy.shutdown()

if __name__ == "__main__":
    asyncio.run(main())