import time
import os
import ssl
from datetime import datetime
import paho.mqtt.client as mqtt

base_path = os.path.expanduser("~/Web_Speech_remote_control/sros2_ws/mqtt_certs")

ca_crt = os.path.join(base_path, "ca_root.crt")
client_crt = os.path.join(base_path, "mqtt_client_node.crt")
client_key = os.path.join(base_path, "mqtt_client_node.key")

broker_address = "localhost"
broker_port = 8883
topic = "pingpong/primitive"
client_id = "python_iot_simulator"

def main():
    client = mqtt.Client(client_id=client_id, callback_api_version=mqtt.CallbackAPIVersion.VERSION2)

    client.tls_set(
        ca_certs=ca_crt,
        certfile=client_crt,
        keyfile=client_key,
        cert_reqs=ssl.CERT_REQUIRED,
        tls_version=ssl.PROTOCOL_TLSv1_2
    )

    print(f"Łączenie z brokerem {broker_address}:{broker_port}...")

    try:
        # 3. Nawiązanie połączenia
        client.connect(broker_address, broker_port, 60)
        
        client.loop_start()

        print("Połączono! Rozpoczynam wysyłanie...")

        while True:
            # Generowanie wiadomości z datą
            timestamp = datetime.now().strftime("%a %b %d %H:%M:%S %Z %Y")
            message = f"Dane z IoT (Python): {timestamp}"
            
            print("Wysyłam pakiet...")
            
            info = client.publish(topic, message)
            
            info.wait_for_publish()
            
            time.sleep(1)

    except KeyboardInterrupt:
        print("\nZatrzymano przez użytkownika (Ctrl+C).")
    except Exception as e:
        print(f"Wystąpił błąd: {e}")
    finally:
        client.loop_stop()
        client.disconnect()
        print("Rozłączono.")

if __name__ == "__main__":
    main()