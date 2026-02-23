#!/usr/bin/env python3
import math
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import PoseStamped


class RightHandWaver(Node):
    def __init__(self):
        super().__init__("right_hand_waver")

        # Publisher do prawej ręki
        self.pub = self.create_publisher(
            PoseStamped,
            "/g1pilot/hand_goal/right",
            10,
        )

        # Częstotliwość wysyłania (Hz)
        self.rate_hz = 20.0
        self.timer = self.create_timer(1.0 / self.rate_hz, self.timer_cb)

        # Parametry ruchu „machania”
        self.t = 0.0
        self.dt = 1.0 / self.rate_hz

        # Pozycja bazowa (taka, jak w Twojej komendzie, tylko prawa strona – y ujemne)
        self.base_x = 0.40
        self.base_y = -0.17   # prawa ręka: minus
        self.base_z = 0.09

        # Amplituda machania w osi Y (boki)
        self.amp_y = 0.10     # 10 cm w lewo/prawo od pozycji bazowej
        # Częstotliwość machania (Hz)
        self.freq_hz = 0.5    # ~0.5 machnięcia na sekundę

        # Stała orientacja (prosta, jak w przykładzie)
        self.ori_x = 0.0
        self.ori_y = 0.0
        self.ori_z = 0.0
        self.ori_w = 0.1

        self.get_logger().info("RightHandWaver started – waving right hand.")

    def timer_cb(self):
        # Czas narastający
        self.t += self.dt

        # Pozycja w osi Y: sinus wokół bazowego y
        offset_y = self.amp_y * math.sin(2.0 * math.pi * self.freq_hz * self.t)
        y = self.base_y + offset_y

        msg = PoseStamped()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = "pelvis"

        msg.pose.position.x = self.base_x
        msg.pose.position.y = y
        msg.pose.position.z = self.base_z

        msg.pose.orientation.x = self.ori_x
        msg.pose.orientation.y = self.ori_y
        msg.pose.orientation.z = self.ori_z
        msg.pose.orientation.w = self.ori_w

        self.pub.publish(msg)


def main(args=None):
    rclpy.init(args=args)
    node = RightHandWaver()
    try:
        rclpy.spin(node)
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()