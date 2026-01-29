import time
from datetime import datetime
import paho.mqtt.client as mqtt

broker_address = "localhost"
broker_port = 1883  
topic = "pingpong/primitive"
client_id = "python_iot_simulator_insecure"

def main():
    client = mqtt.Client(client_id=client_id, callback_api_version=mqtt.CallbackAPIVersion.VERSION2)

    print(f"Łączenie z brokerem (TRYB NIEZABEZPIECZONY) {broker_address}:{broker_port}...")

    try:
        client.connect(broker_address, broker_port, 60)
        
        client.loop_start()

        print("Połączono! Rozpoczynam wysyłanie...")

        while True:
            timestamp = datetime.now().strftime("%a %b %d %H:%M:%S %Z %Y")
            message = f"Dane z IoT (Insecure): {timestamp}"
            
            print(f"Wysyłam pakiet: {message}")
            
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