import asyncio
import json
import logging
import os
import time
import fractions
import cv2
import numpy as np
import subprocess

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
    def __init__(self):
        super().__init__()
        self.cap = None
        self._start_time = None
        self.running = False
        self.black_frame_data = np.zeros((CAMERA_HEIGHT, CAMERA_WIDTH, 3), dtype=np.uint8)
        self._open_camera_immediately()

    def _open_camera_immediately(self):
        try:
            logger.info(f"⚡ [HARDWARE] Próba otwarcia kamery: {CAMERA_DEVICE}...")
            self.cap = cv2.VideoCapture(CAMERA_DEVICE, cv2.CAP_V4L2)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
            self.cap.set(cv2.CAP_PROP_FPS, CAMERA_FPS)
            
            if not self.cap.isOpened():
                logger.error("❌ [HARDWARE] Błąd: Kamera się nie otworzyła!")
                return

            self.running = True
            self._start_time = time.time()
            logger.info(f"✅ [HARDWARE] KAMERA URUCHOMIONA FIZYCZNIE!")
            self.cap.read() 
        except Exception as e:
            logger.error(f"❌ [HARDWARE] Wyjątek: {e}")

    async def recv(self):
        if self._start_time is None:
            self._start_time = time.time()
            
        timestamp = time.time() - self._start_time
        pts = int(timestamp * 90000)
        time_base = fractions.Fraction(1, 90000)

        if self.running and self.cap and self.cap.isOpened():
            ret, frame = self.cap.read()
            if ret:
                video_frame = VideoFrame.from_ndarray(frame, format="bgr24")
                frame_to_send = video_frame.reformat(format="yuv420p")
            else:
                frame_to_send = VideoFrame.from_ndarray(self.black_frame_data, format="bgr24").reformat(format="yuv420p")
        else:
            frame_to_send = VideoFrame.from_ndarray(self.black_frame_data, format="bgr24").reformat(format="yuv420p")

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
        
        # === PARAMETRY ROS ===
        # Domyślnie True = używamy Google STUN. False = tylko lokalne IP (w tym Tailscale)
        self.declare_parameter('use_google_stun', True)
        
        topic_name = f'/{ROBOT_ID}/joy' if ROBOT_ID else '/g1pilot/joy'
        self.publisher_ = self.create_publisher(Joy, topic_name, 10)
        
        stun_enabled = self.get_parameter('use_google_stun').value
        logger.info(f"ROS2 Node Started. Publishing to: {topic_name}")
        logger.info(f"🌍 KONFIGURACJA STUN: {'GOOGLE STUN' if stun_enabled else 'BRAK (TAILSCALE ONLY)'}")
        
        # === STAN GLOBALNY ===
        self.current_axes = [0.0] * 8
        self.current_buttons = [0] * 12
        
        self.publish_task = asyncio.create_task(self._publish_loop())

    async def _publish_loop(self):
        """Pętla heartbeat wysyłająca stan Joy co 1/30 sekundy"""
        logger.info("🔄 Start pętli sterowania (30Hz continuous publish)...")
        while True:
            try:
                msg = Joy()
                msg.header.stamp = self.get_clock().now().to_msg()
                msg.header.frame_id = "webrtc_input"
                msg.axes = self.current_axes
                msg.buttons = self.current_buttons
                self.publisher_.publish(msg)
                await asyncio.sleep(1.0 / 30.0)
            except Exception as e:
                logger.error(f"❌ Błąd w pętli publish: {e}")
                await asyncio.sleep(1)

    async def handle_joystick_data(self, data):
        linear = float(data.get('linear', 0.0))
        angular = float(data.get('angular', 0.0))
        
        self.current_axes = [0.0] * 8
        self.current_buttons = [0] * 12
        
        self.current_axes[1] = linear * -1.0 
        self.current_axes[2] = angular
        
        self.current_buttons[8] = 1 if (abs(linear) > 0.05 or abs(angular) > 0.05) else 0

    async def handle_button_command(self, command):
        LINEAR_SPEED = 0.5
        ANGULAR_SPEED = 0.5

        new_axes = [0.0] * 8
        new_buttons = [0] * 12
        
        if command == "forward_rover":
            new_axes[1] = -LINEAR_SPEED 
            new_buttons[8] = 1 
            logger.info("🤖 GŁOS: JAZDA CIĄGŁA W PRZÓD")

        elif command == "backward_rover":
            new_axes[1] = LINEAR_SPEED
            new_buttons[8] = 1
            logger.info("🤖 GŁOS: JAZDA CIĄGŁA W TYŁ")

        elif command == "left_rover":
            new_axes[2] = -ANGULAR_SPEED
            new_buttons[8] = 1
            logger.info("🤖 GŁOS: SKRĘT CIĄGŁY W LEWO")

        elif command == "right_rover":
            new_axes[2] = ANGULAR_SPEED
            new_buttons[8] = 1
            logger.info("🤖 GŁOS: SKRĘT CIĄGŁY W PRAWO")

        elif command == "stop_rover":
            logger.info("🤖 GŁOS: STOP")
        
        self.current_axes = new_axes
        self.current_buttons = new_buttons

class WebRTCClient:
    def __init__(self, ros_node):
        self.ros_node = ros_node
        self.ws = None
        self.username = ROBOT_ID
        self.peers = {} 
        
        logger.info("🎬 [INIT] TWORZENIE KLIENTA...")
        self.video_track = RealTimeOpenCVTrack()
        self.audio_track = None
        
        try:
            logger.info("⚡ [HARDWARE] Otwieranie mikrofonu...")
            self.audio_player = MediaPlayer('default', format='alsa', options={"fflags": "nobuffer", "flags": "low_delay"})
            if self.audio_player.audio:
                 self.audio_track = self.audio_player.audio
                 logger.info("✅ [HARDWARE] MIKROFON AKTYWNY.")
        except Exception:
             logger.info("ℹ️ Audio niedostępne (Video Only).")

    async def run(self):
        logger.info("🚀 [SYSTEM] Łączenie z siecią natychmiast...")
        async with aiohttp.ClientSession() as session:
            while True:
                try:
                    async with session.ws_connect(SIGNALING_URL, ssl=False) as ws:
                        self.ws = ws
                        await self.send_signal("new-peer", {})
                        logger.info("✅ ZALOGOWANO DO SIECI!")
                        async for msg in ws:
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                await self.handle_signaling_message(json.loads(msg.data))
                            elif msg.type == aiohttp.WSMsgType.ERROR:
                                break
                except Exception as e:
                    logger.error(f"⚠️ Błąd sieci: {e}. Ponawiam za 2s...")
                    await asyncio.sleep(2)

    async def send_signal(self, action, message):
        if self.ws and not self.ws.closed:
            await self.ws.send_str(json.dumps({'peer': self.username, 'action': action, 'message': message}))

    async def handle_signaling_message(self, data):
        peer_username = data['peer']
        action = data['action']
        if peer_username == self.username: return

        if action == 'new-peer':
            logger.info(f"👋 Widzę {peer_username}. Wysyłam 'request-connect'.")
            await self.send_signal('request-connect', {})
        
        elif action == 'start-call':
            target = data['message'].get('target')
            if target and target != self.username:
                logger.info(f"😶 Ignoruję 'start-call' od {peer_username} (Cel: {target}, Ja: {self.username})")
                return

            logger.info(f"🚀 Otrzymałem 'start-call' od {peer_username}. DZWONIĘ (Jestem Offererem)!")
            await self.create_peer_connection(peer_username, initiator=True, receiver_channel=data['message'].get('receiver_channel_name'))

        elif action == 'new-answer':
            if peer_username in self.peers:
                pc = self.peers[peer_username]
                answer = data['message']['sdp']
                if pc.signalingState != "stable":
                    await pc.setRemoteDescription(RTCSessionDescription(sdp=answer['sdp'], type=answer['type']))

    async def create_peer_connection(self, peer_username, initiator, offer_sdp=None, receiver_channel=None):
        # === CZYTANIE PARAMETRU ROS ===
        use_google_stun = self.ros_node.get_parameter('use_google_stun').value
        
        ice_servers = []
        if use_google_stun:
            # Używamy publicznych serwerów STUN Google
            ice_servers.append(RTCIceServer(urls=["stun:stun.l.google.com:19302"]))
            logger.info(f"🌐 [WebRTC] Tworzenie PC z Google STUN dla {peer_username}")
        else:
            # Pusta lista = używaj tylko interfejsów lokalnych (w tym IP Tailscale)
            logger.info(f"🏠 [WebRTC] Tworzenie PC BEZ zewn. STUN (Local/Tailscale) dla {peer_username}")

        config = RTCConfiguration(iceServers=ice_servers)
        pc = RTCPeerConnection(configuration=config)
        self.peers[peer_username] = pc

        if self.video_track:
            pc.addTransceiver(self.video_track, direction="sendonly")
        if self.audio_track:
            pc.addTransceiver(self.audio_track, direction="sendonly")

        if initiator:
            channel = pc.createDataChannel("chat")
            self.setup_data_channel(channel)

            offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            await self.send_signal('new-offer', {'sdp': {'sdp': pc.localDescription.sdp, 'type': pc.localDescription.type}, 'receiver_channel_name': receiver_channel})

        @pc.on("iceconnectionstatechange")
        async def on_icestate():
            logger.info(f"🧊 [ICE State] {peer_username}: {pc.iceConnectionState}")
            if pc.iceConnectionState in ["failed", "closed"]:
                await pc.close()
                if peer_username in self.peers: del self.peers[peer_username]

    def setup_data_channel(self, channel):
        @channel.on("message")
        async def on_message(message):
            try:
                data = json.loads(message)
                if 'joystick' in data:
                    await self.ros_node.handle_joystick_data(data['joystick'])
                elif 'message' in data:
                    cmd = data['message']
                    allowed = ["forward_rover", "backward_rover", "left_rover", "right_rover", "stop_rover"]
                    if cmd in allowed:
                        await self.ros_node.handle_button_command(cmd)
                    else:
                        logger.info(f"🖥️ Wykonywanie komendy w terminalu: {cmd}")
                        try:
                            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=5)
                            if result.stdout: logger.info(f"[OUT]: {result.stdout.strip()}")
                        except Exception as e:
                            logger.error(f"❌ Błąd wykonania komendy: {e}")

            except json.JSONDecodeError:
                logger.info(f"🖥️ Wykonywanie surowego tekstu w terminalu: {message}")
                subprocess.run(message, shell=True)
            except Exception as e:
                logger.error(f"❌ Błąd procesowania: {e}")

async def run_bridge():
    rclpy.init()
    node = ROS2BridgeNode()
    client = WebRTCClient(node)
    
    client_task = asyncio.create_task(client.run())
    
    try:
        while rclpy.ok():
            rclpy.spin_once(node, timeout_sec=0)
            await asyncio.sleep(0.001) 
    except KeyboardInterrupt:
        pass
    finally:
        if client.video_track:
            client.video_track.stop_hardware()
        if rclpy.ok():
            node.destroy_node()
            rclpy.shutdown()

def main(args=None):
    try:
        asyncio.run(run_bridge())
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()