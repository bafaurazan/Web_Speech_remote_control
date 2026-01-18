#!/usr/bin/env python3
import sys
import time
import math
import rclpy
from rclpy.node import Node
from std_msgs.msg import String
from sensor_msgs.msg import Joy

# Importy Unitree SDK
from unitree_sdk2py.core.channel import ChannelFactoryInitialize
from unitree_sdk2py.g1.loco.g1_loco_client import LocoClient

class G1LocoNode(Node):
    def __init__(self):
        super().__init__('g1_loco_node')

        # Pobieranie nazwy interfejsu sieciowego z parametrów ROS (domyślnie 'eth0')
        # Uruchamiając można dodać: --ros-args -p network_interface:=enp3s0
        self.declare_parameter('network_interface', 'eno1')
        network_interface = self.get_parameter('network_interface').get_parameter_value().string_value

        self.get_logger().info(f"Inicjalizacja Unitree Channel na interfejsie: {network_interface}")
        ChannelFactoryInitialize(0, network_interface)

        # Inicjalizacja klienta Loco
        self.sport_client = LocoClient()
        self.sport_client.SetTimeout(10.0)
        self.sport_client.Init()
        self.get_logger().info("G1 Loco Client zinicjalizowany i gotowy.")

        # --- Subskrypcje ---
        
        # 1. Węzeł do komend trybów (String)
        self.subscription_cmd = self.create_subscription(
            String,
            '/g1pilot/cmd',
            self.command_callback,
            10
        )

        # 2. Węzeł joysticka do sterowania ruchem
        self.subscription_joy = self.create_subscription(
            Joy,
            '/g1pilot/joy',
            self.joy_callback,
            10
        )

        # Parametry prędkości maksymalnych (skalowanie joysticka)
        self.MAX_VX = 0.5   # m/s (przód/tył)
        self.MAX_VY = 0.3   # m/s (lewo/prawo)
        self.MAX_YAW = 0.5  # rad/s (obrót)

        self.get_logger().info("Oczekiwanie na komendy na /g1pilot/cmd oraz joystick na /g1pilot/joy")

    def command_callback(self, msg):
        """
        Obsługuje proste komendy tekstowe wysyłane na /g1pilot/cmd
        """
        cmd = msg.data.lower()
        self.get_logger().info(f"Otrzymano komendę: {cmd}")

        if cmd == "damp":
            self.sport_client.Damp()
        elif cmd == "start":
            self.sport_client.Start() # Tryb chodzenia/biegania
        elif cmd == "low_stand":
            self.sport_client.LowStand()
        elif cmd == "high_stand":
            self.sport_client.HighStand()
        elif cmd == "zero_torque":
            self.sport_client.ZeroTorque()
        elif cmd == "standby":
            self.sport_client.SetFsmId(4) # Locked standing mode
        elif cmd == "balance":
            self.sport_client.BalanceStand(1)
        elif cmd == "stop":
            self.sport_client.StopMove() # Zatrzymanie ruchu, ale pozostanie w trybie
        else:
            self.get_logger().warn(f"Nieznana komenda: {cmd}")

    def joy_callback(self, msg):
        """
        Obsługuje sterowanie ruchem.
        Mapowanie osi (zależy od pada, tutaj przykład dla pada typu Xbox/Logitech):
        axes[1] -> Przód/Tył (Lewy analog pionowo)
        axes[0] -> Lewo/Prawo (Lewy analog poziomo)
        axes[3] -> Obrót (Prawy analog poziomo) lub axes[2]
        """
        
        # Ochrona przed błędnym odczytem pustej wiadomości
        if len(msg.axes) < 4:
            return

        # Pobranie wartości z joysticka (-1.0 do 1.0)
        # UWAGA: Wartości joysticka są zazwyczaj od -1 do 1.
        # Funkcja Move wymaga m/s, więc mnożymy przez nasze limity.
        
        # Oś Y pada (zazwyczaj 1) to przód/tył
        vx = msg.axes[1] * self.MAX_VX 
        
        # Oś X pada (zazwyczaj 0) to ruch boczny (lewo jest zazwyczaj dodatnie w ROS)
        vy = msg.axes[0] * self.MAX_VY
        
        # Oś obrotu (zazwyczaj 3 lub 2 w zależności od pada)
        vyaw = msg.axes[3] * self.MAX_YAW

        # Deadzone (martwa strefa) - aby robot nie drgał, gdy nie dotykamy pada
        if abs(vx) < 0.05: vx = 0.0
        if abs(vy) < 0.05: vy = 0.0
        if abs(vyaw) < 0.05: vyaw = 0.0

        # Wywołanie funkcji Move tylko jeśli jest jakieś wymuszenie ruchu
        # lub jeśli chcemy go zatrzymać (wysyłając 0,0,0)
        if abs(vx) > 0 or abs(vy) > 0 or abs(vyaw) > 0:
             # Move(vx, vy, vyaw) -> vx: przód, vy: bok, vyaw: obrót
            self.sport_client.Move(vx, vy, vyaw)
        else:
            # Opcjonalnie: Jeśli gałki są puszczone, można wysłać StopMove() 
            # lub Move(0,0,0) aby robot wiedział, że ma stać w miejscu.
            # self.sport_client.Move(0.0, 0.0, 0.0)
            pass

def main(args=None):
    rclpy.init(args=args)
    
    try:
        node = G1LocoNode()
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(f"Błąd: {e}")
    finally:
        # Zawsze warto bezpiecznie zamknąć noda
        if 'node' in locals():
            node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main()