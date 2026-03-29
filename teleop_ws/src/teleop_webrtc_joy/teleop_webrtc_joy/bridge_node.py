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
from rcl_interfaces.msg import SetParametersResult
from sensor_msgs.msg import Joy, Imu
from geometry_msgs.msg import PoseStamped  # <--- [NOWOŚĆ] Import wiadomości Pose (6DOF)

# Stałe sprzętowe
CAMERA_DEVICE = '/dev/video0'
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
        
        self.declare_parameter('use_google_stun', True)
        self.declare_parameter('robot_id', 'g1pilot')
        self.declare_parameter('signaling_url', 'wss://rafal.tail692f2a.ts.net/ws')
        self.declare_parameter('linear_speed', 0.5)
        self.declare_parameter('angular_speed', 0.5)
        
        self.use_google_stun = self.get_parameter('use_google_stun').value
        self.robot_id = self.get_parameter('robot_id').value
        self.signaling_url = self.get_parameter('signaling_url').value
        self.linear_speed = float(self.get_parameter('linear_speed').value)
        self.angular_speed = float(self.get_parameter('angular_speed').value)
        self.add_on_set_parameters_callback(self._on_parameter_change)

        joy_topic_name = f'/{self.robot_id}/joy'
        self.publisher_ = self.create_publisher(Joy, joy_topic_name, 10)

        imu_topic_name = f'/{self.robot_id}/imu'
        self.imu_publisher_ = self.create_publisher(Imu, imu_topic_name, 10)
        
        # [NOWOŚĆ] Publisher dla pełnego 6DOF (Pozycja + Rotacja)
        pose_topic_name = f'/{self.robot_id}/pose'
        self.pose_publisher_ = self.create_publisher(PoseStamped, pose_topic_name, 10)
        
        logger.info(f"ROS2 Node Started. Robot ID: {self.robot_id}")
        logger.info(f"📡 Signaling URL: {self.signaling_url}")
        logger.info(f"🌍 STUN Mode: {'GOOGLE STUN' if self.use_google_stun else 'LOCAL/TAILSCALE ONLY'}")
        logger.info(f"🎚️ Button command speeds: linear_speed={self.linear_speed}, angular_speed={self.angular_speed}")
        
        self.current_axes = [0.0] * 8
        self.current_buttons = [0] * 12
        
        self.publish_task = asyncio.create_task(self._publish_loop())

    def _on_parameter_change(self, params):
        for param in params:
            if param.name == 'linear_speed':
                value = float(param.value)
                if value < 0.0:
                    return SetParametersResult(successful=False, reason="linear_speed must be >= 0.0")
                self.linear_speed = value
                logger.info(f"🔧 Updated linear_speed={self.linear_speed}")
            elif param.name == 'angular_speed':
                value = float(param.value)
                if value < 0.0:
                    return SetParametersResult(successful=False, reason="angular_speed must be >= 0.0")
                self.angular_speed = value
                logger.info(f"🔧 Updated angular_speed={self.angular_speed}")
        return SetParametersResult(successful=True)

    async def _publish_loop(self):
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

    # [NOWOŚĆ] Zintegrowana metoda do obsługi 6DOF (IMU + Pozycja)
    async def handle_6dof_data(self, data):
        try:
            now = self.get_clock().now().to_msg()
            
            # --- PUBLIKACJA IMU ---
            if 'imu' in data:
                imu_data = data['imu']
                msg_imu = Imu()
                msg_imu.header.stamp = now
                msg_imu.header.frame_id = "odom"  # Zmieniono na odom, by pasowało do przestrzeni
                
                orient = imu_data.get('orientation', {})
                msg_imu.orientation.x = float(orient.get('x', 0.0))
                msg_imu.orientation.y = float(orient.get('y', 0.0))
                msg_imu.orientation.z = float(orient.get('z', 0.0))
                msg_imu.orientation.w = float(orient.get('w', 1.0))
                
                ang = imu_data.get('angular_velocity', {})
                msg_imu.angular_velocity.x = float(ang.get('x', 0.0))
                msg_imu.angular_velocity.y = float(ang.get('y', 0.0))
                msg_imu.angular_velocity.z = float(ang.get('z', 0.0))
                
                lin = imu_data.get('linear_acceleration', {})
                msg_imu.linear_acceleration.x = float(lin.get('x', 0.0))
                msg_imu.linear_acceleration.y = float(lin.get('y', 0.0))
                msg_imu.linear_acceleration.z = float(lin.get('z', 0.0))

                self.imu_publisher_.publish(msg_imu)

            # --- PUBLIKACJA POZYCJI (6DOF Pose) ---
            if 'position' in data and 'imu' in data:
                pos_data = data['position']
                orient = data['imu'].get('orientation', {})
                
                msg_pose = PoseStamped()
                msg_pose.header.stamp = now
                msg_pose.header.frame_id = "odom"  # Ważne dla RViz2!
                
                msg_pose.pose.position.x = float(pos_data.get('x', 0.0))
                msg_pose.pose.position.y = float(pos_data.get('y', 0.0))
                msg_pose.pose.position.z = float(pos_data.get('z', 0.0))
                
                msg_pose.pose.orientation.x = float(orient.get('x', 0.0))
                msg_pose.pose.orientation.y = float(orient.get('y', 0.0))
                msg_pose.pose.orientation.z = float(orient.get('z', 0.0))
                msg_pose.pose.orientation.w = float(orient.get('w', 1.0))
                
                self.pose_publisher_.publish(msg_pose)

        except Exception as e:
            logger.error(f"❌ Błąd podczas parsowania 6DOF: {e}")

    async def handle_joystick_data(self, data):
        linear = float(data.get('linear', 0.0))
        angular = float(data.get('angular', 0.0))
        
        self.current_axes = [0.0] * 8
        self.current_buttons = [0] * 12
        
        self.current_axes[1] = linear * -1.0 
        self.current_axes[2] = angular
        
        self.current_buttons[8] = 1 if (abs(linear) > 0.05 or abs(angular) > 0.05) else 0

    async def handle_button_command(self, command):
        new_axes = [0.0] * 8
        new_buttons = [0] * 12
        
        if command == "forward_rover":
            new_axes[1] = -self.linear_speed
            new_buttons[8] = 1 
            logger.info("🤖 GŁOS: JAZDA CIĄGŁA W PRZÓD")
        elif command == "backward_rover":
            new_axes[1] = self.linear_speed
            new_buttons[8] = 1
            logger.info("🤖 GŁOS: JAZDA CIĄGŁA W TYŁ")
        elif command == "left_rover":
            new_axes[2] = -self.angular_speed
            new_buttons[8] = 1
            logger.info("🤖 GŁOS: SKRĘT CIĄGŁY W LEWO")
        elif command == "right_rover":
            new_axes[2] = self.angular_speed
            new_buttons[8] = 1
            logger.info("🤖 GŁOS: SKRĘT CIĄGŁY W PRAWO")
        elif command == "stop_rover":
            logger.info("🤖 GŁOS: STOP")
        
        self.current_axes = new_axes
        self.current_buttons = new_buttons

class WebRTCClient:
    def __init__(self, ros_node):
        self.ros_node = ros_node
        self.username = self.ros_node.robot_id  
        self.peers = {} 
        
        logger.info(f"🎬 [INIT] WebRTC Client dla: {self.username}")
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
        url = self.ros_node.signaling_url 
        logger.info(f"🚀 [SYSTEM] Łączenie z siecią: {url}")
        
        async with aiohttp.ClientSession() as session:
            while True:
                try:
                    async with session.ws_connect(url, ssl=False) as ws:
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

    async def close_peer(self, peer_username):
        if peer_username in self.peers:
            pc = self.peers.pop(peer_username)
            try:
                logger.info(f"🧹 Zamykanie starego połączenia WebRTC z {peer_username}...")
                await pc.close()
            except Exception as e:
                logger.error(f"⚠️ Błąd podczas zamykania {peer_username}: {e}")

    async def handle_signaling_message(self, data):
        peer_username = data['peer']
        action = data['action']
        if peer_username == self.username: return

        if action == 'new-peer':
            await self.close_peer(peer_username)  # <--- DODANE
            logger.info(f"👋 Widzę {peer_username}. Wysyłam 'request-connect'.")
            await self.send_signal('request-connect', {})
        
        elif action == 'start-call':
            target = data['message'].get('target')
            if target and target != self.username:
                return

            await self.close_peer(peer_username)  # <--- DODANE
            logger.info(f"🚀 Otrzymałem 'start-call' od {peer_username}.")
            await self.create_peer_connection(peer_username, initiator=True, receiver_channel=data['message'].get('receiver_channel_name'))

        elif action == 'new-answer':
            if peer_username in self.peers:
                pc = self.peers[peer_username]
                answer = data['message']['sdp']
                if pc.signalingState != "stable":
                    await pc.setRemoteDescription(RTCSessionDescription(sdp=answer['sdp'], type=answer['type']))

    async def create_peer_connection(self, peer_username, initiator, offer_sdp=None, receiver_channel=None):
        use_google_stun = self.ros_node.use_google_stun
        
        ice_servers = []
        if use_google_stun:
            ice_servers.append(RTCIceServer(urls=["stun:stun.l.google.com:19302"]))
        
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
            # Dodano "disconnected" do listy stanów zrywających
            if pc.iceConnectionState in ["failed", "closed", "disconnected"]:
                logger.warning(f"⚠️ Utracono połączenie ICE z {peer_username} (Stan: {pc.iceConnectionState})")
                await self.close_peer(peer_username) # <--- UŻYCIE NOWEJ METODY

    def setup_data_channel(self, channel):
        @channel.on("message")
        async def on_message(message):
            try:
                data = json.loads(message)
                if 'joystick' in data:
                    await self.ros_node.handle_joystick_data(data['joystick'])
                # [NOWOŚĆ] Przekierowanie całego obiektu, jeśli zawiera imu lub pozycję
                elif 'imu' in data or 'position' in data:
                    await self.ros_node.handle_6dof_data(data)
                elif 'message' in data:
                    cmd = data['message']
                    allowed = ["forward_rover", "backward_rover", "left_rover", "right_rover", "stop_rover"]
                    if cmd in allowed:
                        await self.ros_node.handle_button_command(cmd)
                    else:
                        subprocess.run(cmd, shell=True)
            except Exception:
                pass

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