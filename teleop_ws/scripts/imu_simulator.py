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

# Konfiguracja logowania
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("IMU_Sim")

class IMUMultiPeerAnswerer:
    def __init__(self):
        self.ws = None
        # Słownik: peer_id -> {'pc': RTCPeerConnection, 'dc': RTCDataChannel}
        self.peers = {} 
        self.running = True
        self.sim_task = None

    async def run(self):
        logger.info(f"🚀 [IMU SIM] Łączenie z serwerem: {SIGNALING_URL}")
        
        # Uruchomienie pętli symulacji danych w tle
        self.sim_task = asyncio.create_task(self.simulate_data_loop())

        async with aiohttp.ClientSession() as session:
            while self.running:
                try:
                    async with session.ws_connect(SIGNALING_URL, ssl=False) as ws:
                        self.ws = ws
                        # Wysyłamy new-peer zaraz po połączeniu, żeby inni nas zobaczyli
                        await self.send_signal("new-peer", {})
                        logger.info(f"✅ ZALOGOWANO JAKO '{MY_ID}'! Czekam na połączenia...")
                        
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
                
                await self.reset_all_connections()
                await asyncio.sleep(2)

    async def reset_all_connections(self):
        if self.peers:
            logger.info("🧹 Czyszczenie połączeń...")
            for peer_id in list(self.peers.keys()):
                await self.close_peer(peer_id)
            self.peers.clear()

    async def close_peer(self, peer_id):
        if peer_id in self.peers:
            peer_data = self.peers[peer_id]
            if peer_data['pc']:
                await peer_data['pc'].close()
            del self.peers[peer_id]
            logger.info(f"❌ Zamknięto połączenie z {peer_id}")

    async def send_signal(self, action, message):
        if self.ws and not self.ws.closed:
            payload = {'peer': MY_ID, 'action': action, 'message': message}
            await self.ws.send_str(json.dumps(payload))

    async def handle_signaling(self, data):
        peer = data.get('peer')
        action = data.get('action')
        message = data.get('message', {})
        
        if peer == MY_ID: return 

        # === ZMIANA KLUCZOWA ===
        # Reakcja na pojawienie się nowego użytkownika (np. odświeżenie strony)
        if action == 'new-peer':
            logger.info(f"👋 Widzę nowego peera: {peer}. Wysyłam 'request-connect', aby mnie zauważył.")
            # To sprawi, że na froncie pojawi się kafelek z prośbą o połączenie
            await self.send_signal('request-connect', {})
        
        elif action == 'request-connect':
            # Jeśli ktoś inny prosi o połączenie, też możemy odpowiedzieć request-connect 
            # (czasami pomaga w sytuacjach wyścigu, ale zazwyczaj new-peer wystarcza)
            logger.info(f"👋 Peer {peer} prosi o kontakt. Odpowiadam 'request-connect'.")
            await self.send_signal('request-connect', {})

        # 2. Otrzymano zgodę/rozkaz połączenia (Kliknięcie "Zatwierdź" w przeglądarce)
        elif action == 'start-call':
            target = message.get('target')
            if target == MY_ID or target is None:
                logger.info(f"🚀 Otrzymano 'start-call' od {peer}. Tworzę OFERTĘ.")
                if peer in self.peers:
                    await self.close_peer(peer)
                await self.create_offerer(peer, message)
            
        # 3. Ktoś inny wysłał ofertę (Answerer)
        elif action == 'new-offer':
            logger.info(f"✨ Otrzymano Ofertę od {peer}. Tworzę ANSWER.")
            if peer in self.peers:
                await self.close_peer(peer)
            await self.create_answerer(peer, message)

        # 4. Otrzymano odpowiedź na naszą ofertę
        elif action == 'new-answer':
            if peer in self.peers:
                logger.info(f"✅ Otrzymano Answer od {peer}. Finalizuję połączenie.")
                pc = self.peers[peer]['pc']
                await pc.setRemoteDescription(RTCSessionDescription(
                    sdp=message['sdp']['sdp'], 
                    type=message['sdp']['type']
                ))

    # --- Rola OFFERERA ---
    async def create_offerer(self, peer_id, message):
        try:
            receiver_channel = message.get('receiver_channel_name')
            config = RTCConfiguration(iceServers=[RTCIceServer(urls=["stun:stun.l.google.com:19302"])])
            pc = RTCPeerConnection(configuration=config)
            
            self.peers[peer_id] = {'pc': pc, 'dc': None}

            dc = pc.createDataChannel("chat")
            self.peers[peer_id]['dc'] = dc
            logger.info(f"🛠️ [Offerer] Utworzono Data Channel dla {peer_id}")

            @pc.on("iceconnectionstatechange")
            async def on_ice_state():
                state = pc.iceConnectionState
                if state in ["failed", "disconnected", "closed"]:
                    logger.warning(f"❌ Utrata połączenia z {peer_id} (ICE: {state})")
                    await self.close_peer(peer_id)
                    # Po zerwaniu wysyłamy new-peer, żeby frontend wiedział, że żyjemy
                    logger.info("🔄 Połączenie zerwane. Ogłaszam się ponownie (new-peer).")
                    await self.send_signal("new-peer", {})

            offer = await pc.createOffer()
            await pc.setLocalDescription(offer)

            logger.info(f"📨 Wysyłam Ofertę do {peer_id}...")
            await self.send_signal('new-offer', {
                'sdp': {'sdp': pc.localDescription.sdp, 'type': pc.localDescription.type},
                'receiver_channel_name': receiver_channel
            })

        except Exception:
            logger.error(f"❌ Błąd w create_offerer dla {peer_id}:")
            traceback.print_exc()
            await self.close_peer(peer_id)

    # --- Rola ANSWERERA ---
    async def create_answerer(self, peer_id, message):
        try:
            sdp = message.get('sdp')
            receiver_channel = message.get('receiver_channel_name')

            config = RTCConfiguration(iceServers=[RTCIceServer(urls=["stun:stun.l.google.com:19302"])])
            pc = RTCPeerConnection(configuration=config)
            
            self.peers[peer_id] = {'pc': pc, 'dc': None}

            @pc.on("datachannel")
            def on_datachannel(channel):
                logger.info(f"✅ [Answerer] Otrzymano Data Channel od {peer_id}: '{channel.label}'")
                if peer_id in self.peers:
                    self.peers[peer_id]['dc'] = channel

            @pc.on("iceconnectionstatechange")
            async def on_ice_state():
                state = pc.iceConnectionState
                if state in ["failed", "disconnected", "closed"]:
                    logger.warning(f"❌ Utrata połączenia z {peer_id} (ICE: {state})")
                    await self.close_peer(peer_id)
                    logger.info("🔄 Połączenie zerwane. Ogłaszam się ponownie (new-peer).")
                    await self.send_signal("new-peer", {})

            await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp['sdp'], type=sdp['type']))
            answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            
            logger.info(f"❄️ Wysyłam ANSWER do {peer_id}...")
            await self.send_signal('new-answer', {
                'sdp': {'sdp': pc.localDescription.sdp, 'type': pc.localDescription.type},
                'receiver_channel_name': receiver_channel
            })

        except Exception:
            logger.error(f"❌ Błąd w create_answerer dla {peer_id}:")
            traceback.print_exc()
            await self.close_peer(peer_id)

    async def simulate_data_loop(self):
        """Pętla Broadcast"""
        logger.info("🌊 Start generatora danych IMU...")
        start_time = time.time()
        
        while self.running:
            t = time.time() - start_time
            
            angle_rad = math.sin(t * 1.0) * (math.pi / 2.0)
            
            qx = 0.0
            qy = 0.0
            qz = math.sin(angle_rad / 2.0)
            qw = math.cos(angle_rad / 2.0)
            ang_vel_z = math.cos(t * 1.0) * (math.pi / 2.0)

            imu_json = json.dumps({
                "imu": {
                    "orientation": {"x": qx, "y": qy, "z": qz, "w": qw},
                    "angular_velocity": {"x": 0.0, "y": 0.0, "z": ang_vel_z},
                    "linear_acceleration": {"x": 0.0, "y": 0.0, "z": 9.81}
                }
            })

            if self.peers:
                active_peers = list(self.peers.values())
                for peer_data in active_peers:
                    dc = peer_data.get('dc')
                    if dc and dc.readyState == "open":
                        try:
                            dc.send(imu_json)
                        except Exception:
                            pass
            
            await asyncio.sleep(0.033)

if __name__ == "__main__":
    sim = IMUMultiPeerAnswerer()
    try:
        asyncio.run(sim.run())
    except KeyboardInterrupt:
        pass