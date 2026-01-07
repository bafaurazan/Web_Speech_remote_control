import asyncio
import json
import logging
import os
import time
import fractions
import cv2
import numpy as np

# WebRTC & Network
import aiohttp
from av import VideoFrame
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCConfiguration, RTCIceServer, VideoStreamTrack
from aiortc.contrib.media import MediaPlayer

# ROS2
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Joy

# === KONFIGURACJA ===
SIGNALING_URL = os.getenv('SIGNALING_URL', 'wss://rafal.tail692f2a.ts.net/ws')
ROBOT_ID = os.getenv('ROBOT_ID', 'robot_1')
CAMERA_DEVICE = '/dev/video0'

# Konfiguracja Low Latency
CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480
CAMERA_FPS = 30

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Bridge")

class RealTimeOpenCVTrack(VideoStreamTrack):
    """
    Track wideo (OpenCV) startujący natychmiast.
    """
    def __init__(self):
        super().__init__()
        self.cap = None
        self._start_time = None
        self.running = False
        
        # Przygotuj czarną klatkę
        black_bgr = np.zeros((CAMERA_HEIGHT, CAMERA_WIDTH, 3), dtype=np.uint8)
        self.black_frame = VideoFrame.from_ndarray(black_bgr, format="bgr24").reformat(format="yuv420p")
        
        # Start kamery od razu
        self._open_camera_immediately()

    def _open_camera_immediately(self):
        try:
            logger.info(f"⚡ [HARDWARE] Próba otwarcia kamery: {CAMERA_DEVICE}...")
            # Backend V4L2
            self.cap = cv2.VideoCapture(CAMERA_DEVICE, cv2.CAP_V4L2)
            
            # Zero Latency
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
            self.cap.set(cv2.CAP_PROP_FPS, CAMERA_FPS)
            
            if not self.cap.isOpened():
                logger.error("❌ [HARDWARE] Błąd: Kamera się nie otworzyła!")
                return

            self.running = True
            self._start_time = time.time()
            logger.info(f"✅ [HARDWARE] KAMERA URUCHOMIONA FIZYCZNIE! (Dioda powinna świecić)")
            
            self.cap.read() # Rozgrzewka
            
        except Exception as e:
            logger.error(f"❌ [HARDWARE] Wyjątek przy starcie kamery: {e}")

    async def recv(self):
        if self._start_time is None:
            self._start_time = time.time()
            
        timestamp = time.time() - self._start_time
        pts = int(timestamp * 90000)
        time_base = fractions.Fraction(1, 90000)

        frame_to_send = None

        if self.running and self.cap and self.cap.isOpened():
            ret, frame = self.cap.read()
            if ret:
                video_frame = VideoFrame.from_ndarray(frame, format="bgr24")
                frame_to_send = video_frame.reformat(format="yuv420p")
                frame_to_send.pts = pts
                frame_to_send.time_base = time_base
            else:
                frame_to_send = self.black_frame
                frame_to_send.pts = pts
                frame_to_send.time_base = time_base
        else:
            frame_to_send = self.black_frame
            frame_to_send.pts = pts
            frame_to_send.time_base = time_base

        return frame_to_send

    def stop_hardware(self):
        self.running = False
        if self.cap and self.cap.isOpened():
            logger.info("🛑 Zamykanie kamery...")
            self.cap.release()

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
        await asyncio.sleep(0.05) 
        buttons[6] = 0
        buttons[5] = 0
        self.publish_joy(axes, buttons)

class WebRTCClient:
    def __init__(self, ros_node):
        self.ros_node = ros_node
        self.ws = None
        self.username = ROBOT_ID
        self.peers = {} 
        
        logger.info("🎬 [INIT] TWORZENIE KLIENTA...")

        # 1. WIDEO (OpenCV)
        self.video_track = RealTimeOpenCVTrack()

        # 2. AUDIO (MediaPlayer - ALSA)
        self.audio_track = None
        try:
            logger.info("⚡ [HARDWARE] Otwieranie mikrofonu (ALSA)...")
            # Używamy backendu ALSA (domyślny na Linuxie) bez PulseAudio
            self.audio_player = MediaPlayer('default', format='alsa', options={"fflags": "nobuffer", "flags": "low_delay"})
            
            if self.audio_player.audio:
                 self.audio_track = self.audio_player.audio
                 logger.info("✅ [HARDWARE] MIKROFON AKTYWNY.")
            else:
                 logger.warning("⚠️ Mikrofon otwarty, ale brak ścieżki audio.")
        except Exception as e:
            logger.warning(f"⚠️ Problem z mikrofonem: {e}")
            logger.info("ℹ️ Działam w trybie TYLKO WIDEO.")

        logger.info("🆗 SPRZĘT GOTOWY. TERAZ CZEKAMY.")

    async def run(self):
        # SZTUCZNE OPÓŹNIENIE (Kamery działają)
        WAIT_SECONDS = 10
        logger.info(f"⏳ [SYSTEM] Czekam {WAIT_SECONDS} sekund przed zalogowaniem...")
        
        for i in range(WAIT_SECONDS, 0, -1):
            await asyncio.sleep(1)
            if i % 2 == 0: logger.info(f"⏳ ... {i}s")

        logger.info("🚀 [SYSTEM] Czas minął! Łączenie z WebSocket...")

        async with aiohttp.ClientSession() as session:
            while True:
                try:
                    logger.info(f"☁️ Łączenie: {SIGNALING_URL}")
                    async with session.ws_connect(SIGNALING_URL, ssl=False) as ws:
                        self.ws = ws
                        await self.send_signal("new-peer", {})
                        logger.info("✅ ZALOGOWANO!")
                        
                        async for msg in ws:
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                await self.handle_signaling_message(json.loads(msg.data))
                            elif msg.type == aiohttp.WSMsgType.ERROR:
                                break
                except Exception as e:
                    logger.error(f"⚠️ Błąd sieci: {e}. Ponawiam...")
                    await asyncio.sleep(2)

    async def send_signal(self, action, message):
        if self.ws and not self.ws.closed:
            await self.ws.send_str(json.dumps({'peer': self.username, 'action': action, 'message': message}))

    async def handle_signaling_message(self, data):
        peer_username = data['peer']
        action = data['action']
        if peer_username == self.username: return

        if action == 'new-peer':
            await self.create_peer_connection(peer_username, initiator=True, receiver_channel=data['message'].get('receiver_channel_name'))
        elif action == 'new-offer':
            await self.create_peer_connection(peer_username, initiator=False, offer_sdp=data['message']['sdp'], receiver_channel=data['message']['receiver_channel_name'])
        elif action == 'new-answer':
            if peer_username in self.peers:
                pc = self.peers[peer_username]
                answer = data['message']['sdp']
                if pc.signalingState != "stable":
                    await pc.setRemoteDescription(RTCSessionDescription(sdp=answer['sdp'], type=answer['type']))

    async def create_peer_connection(self, peer_username, initiator, offer_sdp=None, receiver_channel=None):
        # === USUNIĘTO GOOGLE STUN - TAILSCALE P2P ===
        config = RTCConfiguration(iceServers=[]) 
        
        pc = RTCPeerConnection(configuration=config)
        self.peers[peer_username] = pc

        if self.video_track:
            pc.addTransceiver(self.video_track, direction="sendonly")
        
        if self.audio_track:
            pc.addTransceiver(self.audio_track, direction="sendonly")

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

        if initiator:
            offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            await self.send_signal('new-offer', {'sdp': {'sdp': pc.localDescription.sdp, 'type': pc.localDescription.type}, 'receiver_channel_name': receiver_channel})
        else:
            await pc.setRemoteDescription(RTCSessionDescription(sdp=offer_sdp['sdp'], type=offer_sdp['type']))
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
    client = WebRTCClient(node)
    
    asyncio.create_task(client.run())
    
    try:
        while rclpy.ok():
            rclpy.spin_once(node, timeout_sec=0)
            await asyncio.sleep(0.0001) 
    except KeyboardInterrupt: pass
    finally:
        client.video_track.stop_hardware()
        node.destroy_node()
        rclpy.shutdown()

if __name__ == "__main__":
    asyncio.run(main())