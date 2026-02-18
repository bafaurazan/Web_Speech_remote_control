import asyncio
import json
import logging
import math
import time
import sys
import traceback

# Biblioteki sieciowe
import aiohttp
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCConfiguration, RTCIceServer

# --- KONFIGURACJA ---
SIGNALING_URL = 'wss://rafal.tail692f2a.ts.net/ws'
MY_ID = 'imu_simulator'   
TARGET_PEER = 'g1pilot'   

# Konfiguracja logowania
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("IMU_Sim")

class IMUAnswerer:
    def __init__(self):
        self.ws = None
        self.pc = None
        self.data_channel = None
        self.running = True
        self.connection_step = "IDLE" 

    async def run(self):
        logger.info(f"🚀 [IMU SIM] Łączenie z serwerem: {SIGNALING_URL}")
        
        async with aiohttp.ClientSession() as session:
            while self.running:
                try:
                    async with session.ws_connect(SIGNALING_URL, ssl=False) as ws:
                        self.ws = ws
                        await self.send_signal("new-peer", {})
                        logger.info(f"✅ ZALOGOWANO JAKO '{MY_ID}'!")
                        
                        # Jeśli po restarcie symulatora robot już tam jest, musimy go "zaczepić"
                        # W tym celu symulator może wysłać request-connect, ale w tym modelu (Answerer)
                        # czekamy aż robot się odezwie. Robot wysyła 'new-peer' przy starcie,
                        # więc jeśli symulator działa, a robot restartuje -> symulator dostanie 'new-peer'.
                        
                        async for msg in ws:
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                try:
                                    data = json.loads(msg.data)
                                    await self.handle_signaling(data)
                                except Exception:
                                    traceback.print_exc()
                            elif msg.type == aiohttp.WSMsgType.ERROR:
                                break
                                
                    logger.warning("⚠️ Połączenie WebSocket zamknięte. Restart za 2s...")
                    
                except Exception as e:
                    logger.error(f"⚠️ Błąd sieci: {e}. Ponawiam za 2s...")
                
                # Pełny reset przy utracie WebSocket
                await self.reset_connection()
                await asyncio.sleep(2)

    async def reset_connection(self):
        """Czyści stan połączenia WebRTC"""
        if self.pc:
            logger.info("🧹 Zamykanie starego połączenia PC...")
            await self.pc.close()
            self.pc = None
        self.data_channel = None
        self.connection_step = "IDLE"
        logger.info("🔄 Stan zresetowany do IDLE.")

    async def send_signal(self, action, message):
        if self.ws and not self.ws.closed:
            payload = {'peer': MY_ID, 'action': action, 'message': message}
            await self.ws.send_str(json.dumps(payload))

    async def handle_signaling(self, data):
        peer = data.get('peer')
        action = data.get('action')
        message = data.get('message', {})
        
        if peer == MY_ID: return 

        # Obsługa zdarzeń
        if action == 'new-peer' or action == 'request-connect':
            # Jeśli robot się pojawił (new-peer) lub prosi o połączenie
            if peer == TARGET_PEER:
                if self.connection_step == "IDLE":
                    logger.info(f"👋 Wykryto robota {peer}. Automatycznie ZATWIERDZAM połączenie.")
                    await self.send_signal('start-call', {'target': peer})
                    self.connection_step = "WAITING_FOR_OFFER"
                elif self.connection_step == "CONNECTED":
                     # Jeśli jesteśmy połączeni, ale robot wysyła new-peer/request, to znaczy że się zrestartował
                     logger.warning(f"⚠️ Robot {peer} wysłał {action}, ale mam status CONNECTED. Resetuję i łączę ponownie.")
                     await self.reset_connection()
                     # Po resecie ponawiamy próbę
                     await self.send_signal('start-call', {'target': peer})
                     self.connection_step = "WAITING_FOR_OFFER"

        elif action == 'new-offer':
            if peer == TARGET_PEER:
                logger.info(f"✨ Otrzymano Ofertę od {peer}. Tworzę Answer.")
                sdp = message.get('sdp')
                receiver_channel = message.get('receiver_channel_name')
                
                # Jeśli mamy stare PC, zamykamy je
                if self.pc:
                    await self.pc.close()
                
                await self.create_answerer(sdp, receiver_channel)

    async def create_answerer(self, remote_sdp, receiver_channel):
        try:
            config = RTCConfiguration(iceServers=[RTCIceServer(urls=["stun:stun.l.google.com:19302"])])
            self.pc = RTCPeerConnection(configuration=config)

            @self.pc.on("datachannel")
            def on_datachannel(channel):
                logger.info(f"✅ Otrzymano Data Channel: '{channel.label}' (Stan: {channel.readyState})")
                self.setup_data_channel(channel)

            @self.pc.on("iceconnectionstatechange")
            async def on_ice_state():
                state = self.pc.iceConnectionState
                logger.info(f"🧊 Stan ICE: {state}")
                if state in ["failed", "disconnected", "closed"]:
                    logger.warning("❌ Utrata połączenia ICE. Resetowanie...")
                    await self.reset_connection()

            await self.pc.setRemoteDescription(RTCSessionDescription(sdp=remote_sdp['sdp'], type=remote_sdp['type']))
            
            answer = await self.pc.createAnswer()
            await self.pc.setLocalDescription(answer)
            
            logger.info("❄️ Wysyłam ANSWER do robota...")
            await self.send_signal('new-answer', {
                'sdp': {'sdp': self.pc.localDescription.sdp, 'type': self.pc.localDescription.type},
                'receiver_channel_name': receiver_channel
            })
            
            self.connection_step = "CONNECTED"

        except Exception:
            logger.error("❌ Błąd w create_answerer:")
            traceback.print_exc()
            await self.reset_connection()

    def setup_data_channel(self, channel):
        self.data_channel = channel
        
        def start_simulation():
            logger.info("🟢 KANAŁ DANYCH OTWARTY! START WYSYŁANIA IMU 🟢")
            asyncio.create_task(self.simulate_imu_data())

        if channel.readyState == "open":
            start_simulation()
        else:
            @channel.on("open")
            def on_open():
                start_simulation()

        @channel.on("close")
        def on_close():
             logger.warning("🔴 Data Channel ZAMKNIĘTY")
             # To też może być sygnał do resetu, jeśli kanał padnie
             # Ale zazwyczaj iceconnectionstatechange to wyłapie szybciej

    async def simulate_imu_data(self):
        """Generuje ruch wahadłowy LEWO/PRAWO (Yaw - oś Z)"""
        start_time = time.time()
        
        # Pętla działa dopóki kanał jest otwarty
        while self.data_channel and self.data_channel.readyState == "open":
            t = time.time() - start_time

            angle_rad = math.sin(t * 1.0) * (math.pi / 2.0)
            
            qx = 0.0
            qy = 0.0
            qz = math.sin(angle_rad / 2.0)
            qw = math.cos(angle_rad / 2.0)

            ang_vel_z = math.cos(t * 1.0) * (math.pi / 2.0)

            imu_data = {
                "imu": {
                    "orientation": {
                        "x": qx, 
                        "y": qy, 
                        "z": qz, 
                        "w": qw
                    },
                    "angular_velocity": {"x": 0.0, "y": 0.0, "z": ang_vel_z},
                    "linear_acceleration": {"x": 0.0, "y": 0.0, "z": 9.81}
                }
            }

            try:
                self.data_channel.send(json.dumps(imu_data))
            except Exception:
                # Błąd wysyłania oznacza zazwyczaj zerwanie kanału
                logger.warning("⚠️ Błąd wysyłania danych (kanał zamknięty?)")
                break
            
            await asyncio.sleep(0.033) # 30 Hz

if __name__ == "__main__":
    sim = IMUAnswerer()
    try:
        asyncio.run(sim.run())
    except KeyboardInterrupt:
        pass