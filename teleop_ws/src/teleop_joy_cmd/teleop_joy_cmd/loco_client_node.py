#!/usr/bin/env python3
import sys
import time
import math
from functools import partial  # [NOWE] Do obsługi wielu serwisów

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Joy
from geometry_msgs.msg import Twist

# [NOWE] Import standardowego serwisu Trigger
from std_srvs.srv import Trigger

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

        # --- SERWISY (Zamiast Subskrypcji String) ---
        # Lista dostępnych komend
        self.commands = [
            "damp", "start", "low_stand", "high_stand", 
            "zero_torque", "standby", "balance", "stop"
        ]

        self.services_dict = {}
        
        # Tworzymy osobny serwis dla każdej komendy
        # Np. /g1pilot/damp, /g1pilot/start itd.
        for cmd in self.commands:
            srv_name = f'/g1pilot/{cmd}'
            # Używamy partial, aby przekazać nazwę komendy do callbacka
            callback = partial(self.handle_command_service, cmd_name=cmd)
            self.services_dict[cmd] = self.create_service(
                Trigger,
                srv_name,
                callback
            )
            self.get_logger().info(f"Utworzono serwis: {srv_name}")

        # --- Subskrypcje Joy/Twist (bez zmian) ---
        self.subscription_joy = self.create_subscription(
            Joy, '/g1pilot/joy', self.joy_callback, 10
        )

        self.subscription_twist = self.create_subscription(
            Twist, '/cmd_vel', self.twist_callback, 10
        )

        # Parametry
        self.MAX_VX = 0.5   
        self.MAX_VY = 0.3   
        self.MAX_YAW = 0.5  

        self.get_logger().info("Gotowy. Czekam na wywołanie serwisów lub Joy/Twist.")

    def handle_command_service(self, request, response, cmd_name):
        """
        Uniwersalny callback dla serwisów typu Trigger.
        """
        self.get_logger().info(f"Wywołano serwis komendy: {cmd_name}")
        
        try:
            if cmd_name == "damp":
                self.sport_client.Damp()
            elif cmd_name == "start":
                self.sport_client.Start()
            elif cmd_name == "low_stand":
                self.sport_client.LowStand()
            elif cmd_name == "high_stand":
                self.sport_client.HighStand()
            elif cmd_name == "zero_torque":
                self.sport_client.ZeroTorque()
            elif cmd_name == "standby":
                self.sport_client.SetFsmId(4)
            elif cmd_name == "balance":
                self.sport_client.BalanceStand(1)
            elif cmd_name == "stop":
                self.sport_client.StopMove()
            
            # Odpowiedź sukcesu
            response.success = True
            response.message = f"Komenda '{cmd_name}' wykonana poprawnie."
            
        except Exception as e:
            self.get_logger().error(f"Błąd podczas wykonywania komendy {cmd_name}: {str(e)}")
            response.success = False
            response.message = f"Błąd: {str(e)}"

        return response

    def twist_callback(self, msg):
        vx = msg.linear.x
        vy = msg.linear.y
        vyaw = msg.angular.z
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