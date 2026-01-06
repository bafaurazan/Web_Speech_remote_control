import argparse
import asyncio
import json
import logging
import os
import platform
import ssl
import sys

# WebRTC & Network
import aiohttp
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
from aiortc.contrib.media import MediaPlayer, MediaRelay

# ROS2
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Joy

# System
from asyncio import create_subprocess_shell, subprocess

# === KONFIGURACJA ===
SIGNALING_URL = os.getenv('SIGNALING_URL', 'wss://rafal.tail692f2a.ts.net/ws')
ROBOT_ID = os.getenv('ROBOT_ID', 'robot_1')
CAMERA_DEVICE = '/dev/video0'
# Zmniejszamy FPS dla stabilności i dodajemy flagi low-latency
CAMERA_OPTIONS = {
    "framerate": "20",          # 20 FPS jest stabilniejsze dla CPU niż 30
    "video_size": "640x480",
    "pixel_format": "mjpeg",    # MJPEG jest standardem dla kamer USB
    "fflags": "nobuffer",       # KLUCZOWE: Nie buforuj klatek (redukcja laga)
    "flags": "low_delay",       # KLUCZOWE: Tryb niskiego opóźnienia
    "strict": "experimental"    # Pozwala na więcej formatów
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

        # Mapowanie osi
        axes[1] = linear * -1.0 
        axes[2] = angular

        # Deadman switch
        if abs(linear) > 0.05 or abs(angular) > 0.05:
            buttons[8] = 1
        else:
            buttons[8] = 0

        self.publish_joy(axes, buttons)

    async def handle_button_command(self, command):
        buttons = list(self.default_buttons)
        axes = list(self.default_axes)
        
        logger.info(f"Otrzymano komendę przycisku: {command}")

        if command == "forward_rover": 
            buttons[6] = 1
        elif command == "stop_rover" or command == "backward_rover":
            buttons[5] = 1
        
        self.publish_joy(axes, buttons)
        await asyncio.sleep(0.2)
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

    async def run(self):
        async with aiohttp.ClientSession() as session:
            while True: # Pętla reconnectu WebSocket
                try:
                    logger.info(f"Łączenie z WebSocket: {SIGNALING_URL}")
                    async with session.ws_connect(SIGNALING_URL, ssl=False) as ws:
                        self.ws = ws
                        await self.send_signal("new-peer", {})

                        async for msg in ws:
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                await self.handle_signaling_message(json.loads(msg.data))
                            elif msg.type == aiohttp.WSMsgType.ERROR:
                                logger.error('Błąd połączenia WS')
                                break
                except Exception as e:
                    logger.error(f"Rozłączono WS ({e}). Reconnect za 3s...")
                    await asyncio.sleep(3)

    async def send_signal(self, action, message):
        if self.ws and not self.ws.closed:
            data = {'peer': self.username, 'action': action, 'message': message}
            await self.ws.send_str(json.dumps(data))

    async def handle_signaling_message(self, data):
        peer_username = data['peer']
        action = data['action']
        
        if peer_username == self.username: return

        if action == 'new-peer':
            await self.create_peer_connection(peer_username, initiator=True, receiver_channel=data['message'].get('receiver_channel_name'))
        elif action == 'new-offer':
            offer = data['message']['sdp']
            await self.create_peer_connection(peer_username, initiator=False, offer_sdp=offer, receiver_channel=data['message']['receiver_channel_name'])
        elif action == 'new-answer':
            answer = data['message']['sdp']
            if peer_username in self.peers:
                pc = self.peers[peer_username]
                if pc.signalingState != "stable":
                    await pc.setRemoteDescription(RTCSessionDescription(sdp=answer['sdp'], type=answer['type']))

    async def create_peer_connection(self, peer_username, initiator, offer_sdp=None, receiver_channel=None):
        pc = RTCPeerConnection()
        self.peers[peer_username] = pc

        # 1. KAMERA Z OPTYMALIZACJĄ LATENCJI
        if os.path.exists(CAMERA_DEVICE):
            try:
                # Używamy v4l2 na Linuxie z naszymi flagami "nobuffer"
                player = MediaPlayer(CAMERA_DEVICE, format="v4l2", options=CAMERA_OPTIONS)
                if player.video:
                    pc.addTrack(player.video)
                    logger.info(f"Kamera aktywna (20fps, nobuffer)")
            except Exception as e:
                logger.error(f"Błąd kamery: {e}")
        
        # 2. Data Channel
        if initiator:
            channel = pc.createDataChannel("chat")
            self.setup_data_channel(channel)
        
        @pc.on("datachannel")
        def on_datachannel(channel):
            self.setup_data_channel(channel)

        @pc.on("iceconnectionstatechange")
        async def on_icestate():
            logger.info(f"Stan ICE z {peer_username}: {pc.iceConnectionState}")
            if pc.iceConnectionState in ["failed", "closed"]:
                await pc.close()
                if peer_username in self.peers:
                    del self.peers[peer_username]

        # 3. Negocjacja
        if initiator:
            offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            await self.send_signal('new-offer', {
                'sdp': {'sdp': pc.localDescription.sdp, 'type': pc.localDescription.type},
                'receiver_channel_name': receiver_channel
            })
        else:
            remote_desc = RTCSessionDescription(sdp=offer_sdp['sdp'], type=offer_sdp['type'])
            await pc.setRemoteDescription(remote_desc)
            answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            await self.send_signal('new-answer', {
                'sdp': {'sdp': pc.localDescription.sdp, 'type': pc.localDescription.type},
                'receiver_channel_name': receiver_channel
            })

    def setup_data_channel(self, channel):
        @channel.on("message")
        async def on_message(message):
            try:
                data = json.loads(message)
                if 'joystick' in data:
                    await self.ros_node.handle_joystick_data(data['joystick'])
                elif 'message' in data:
                    msg = data['message']
                    # Komendy robotyczne
                    if msg in ["forward_rover", "backward_rover", "left_rover", "right_rover", "stop_rover"]:
                         await self.ros_node.handle_button_command(msg)
                    # Komendy systemowe (Terminal)
                    else:
                        logger.warning(f"Terminal CMD: {msg}")
                        asyncio.create_task(self.run_shell(msg))
            except Exception as e:
                logger.error(f"Błąd wiadomości: {e}")

    async def run_shell(self, cmd):
        try:
            process = await create_subprocess_shell(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            stdout, stderr = await process.communicate()
            if stdout: logger.info(f"OUT: {stdout.decode().strip()}")
            if stderr: logger.error(f"ERR: {stderr.decode().strip()}")
        except Exception as e:
            logger.error(f"Shell error: {e}")

async def main():
    rclpy.init()
    ros_node = ROS2BridgeNode()
    client = WebRTCClient(ros_node)
    
    loop = asyncio.get_event_loop()
    webrtc_task = loop.create_task(client.run())

    try:
        while rclpy.ok():
            rclpy.spin_once(ros_node, timeout_sec=0)
            await asyncio.sleep(0.01)
    except KeyboardInterrupt:
        pass
    finally:
        ros_node.destroy_node()
        rclpy.shutdown()

if __name__ == "__main__":
    asyncio.run(main())