#!/usr/bin/env python3
import sys
import time
import math
import rclpy
from rclpy.node import Node
from std_msgs.msg import String
from sensor_msgs.msg import Joy
# NOWE: Import wiadomości Twist
from geometry_msgs.msg import Twist

# Importy Unitree SDK
from unitree_sdk2py.core.channel import ChannelFactoryInitialize
from unitree_sdk2py.g1.loco.g1_loco_client import LocoClient

class G1LocoNode(Node):
    def __init__(self):
        super().__init__('g1_loco_node')

        self.declare_parameter('network_interface', 'eno1')
        network_interface = self.get_parameter('network_interface').get_parameter_value().string_value

        self.get_logger().info(f"Inicjalizacja Unitree Channel na interfejsie: {network_interface}")
        ChannelFactoryInitialize(0, network_interface)

        self.sport_client = LocoClient()
        self.sport_client.SetTimeout(10.0)
        self.sport_client.Init()
        self.get_logger().info("G1 Loco Client zinicjalizowany i gotowy.")

        # --- Subskrypcje ---
        
        # 1. Komendy tekstowe
        self.subscription_cmd = self.create_subscription(
            String,
            '/g1pilot/cmd',
            self.command_callback,
            10
        )

        # 2. Joystick (Joy)
        self.subscription_joy = self.create_subscription(
            Joy,
            '/g1pilot/joy',
            self.joy_callback,
            10
        )

        # 3. Klawiatura (Twist - teleop_twist_keyboard)
        # Standardowo teleop wysyła na /cmd_vel
        self.subscription_twist = self.create_subscription(
            Twist,
            '/cmd_vel', 
            self.twist_callback,
            10
        )

        # Parametry prędkości maksymalnych (dla joysticka)
        self.MAX_VX = 0.5   
        self.MAX_VY = 0.3   
        self.MAX_YAW = 0.5  

        self.get_logger().info("Gotowy. Nasłuchuję: /g1pilot/cmd, /g1pilot/joy oraz /cmd_vel")

    def command_callback(self, msg):
        cmd = msg.data.lower()
        self.get_logger().info(f"Otrzymano komendę: {cmd}")

        if cmd == "damp":
            self.sport_client.Damp()
        elif cmd == "start":
            self.sport_client.Start()
        elif cmd == "low_stand":
            self.sport_client.LowStand()
        elif cmd == "high_stand":
            self.sport_client.HighStand()
        elif cmd == "zero_torque":
            self.sport_client.ZeroTorque()
        elif cmd == "standby":
            self.sport_client.SetFsmId(4)
        elif cmd == "balance":
            self.sport_client.BalanceStand(1)
        elif cmd == "stop":
            self.sport_client.StopMove()
        else:
            self.get_logger().warn(f"Nieznana komenda: {cmd}")

    def twist_callback(self, msg):
        """
        Obsługa teleop_twist_keyboard.
        Wiadomość Twist zawiera gotowe prędkości w m/s i rad/s.
        """
        vx = msg.linear.x
        vy = msg.linear.y
        vyaw = msg.angular.z

        # Logowanie dla pewności (można usunąć, żeby nie spamowało)
        # self.get_logger().info(f"Twist: vx={vx:.2f}, vy={vy:.2f}, rot={vyaw:.2f}")

        # Przekazanie do robota
        self.sport_client.Move(vx, vy, vyaw)

    def joy_callback(self, msg):
        if len(msg.axes) < 4:
            return
        
        vx = msg.axes[1] * self.MAX_VX 
        vy = msg.axes[0] * self.MAX_VY
        vyaw = msg.axes[3] * self.MAX_YAW

        if abs(vx) < 0.05: vx = 0.0
        if abs(vy) < 0.05: vy = 0.0
        if abs(vyaw) < 0.05: vyaw = 0.0

        if abs(vx) > 0 or abs(vy) > 0 or abs(vyaw) > 0:
            self.sport_client.Move(vx, vy, vyaw)
        else:
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
        if 'node' in locals():
            node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main()