#!/usr/bin/env python3

import cv2
import rclpy
from cv_bridge import CvBridge
from rclpy.node import Node
from rclpy.qos import HistoryPolicy, QoSProfile, ReliabilityPolicy
from sensor_msgs.msg import Image


class LaptopCameraStreamNode(Node):
    def __init__(self):
        super().__init__("laptop_camera_stream_node")

        self.declare_parameter("camera_index", 0)
        self.declare_parameter("fps", 30.0)
        self.declare_parameter("width", 640)
        self.declare_parameter("height", 480)
        self.declare_parameter("image_topic", "/laptop/camera/image_raw")
        self.declare_parameter("frame_id", "laptop_camera_frame")

        self.camera_index = int(self.get_parameter("camera_index").value)
        self.fps = float(self.get_parameter("fps").value)
        self.width = int(self.get_parameter("width").value)
        self.height = int(self.get_parameter("height").value)
        self.image_topic = str(self.get_parameter("image_topic").value)
        self.frame_id = str(self.get_parameter("frame_id").value)

        qos_profile = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=5,
        )
        self.image_pub = self.create_publisher(Image, self.image_topic, qos_profile)
        self.bridge = CvBridge()

        self.cap = cv2.VideoCapture(self.camera_index)
        if not self.cap.isOpened():
            raise RuntimeError(f"Nie mozna otworzyc kamery o indeksie {self.camera_index}.")

        # Ustawienie zadanej rozdzielczosci i FPS - sterownik moze je przyciac.
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        self.cap.set(cv2.CAP_PROP_FPS, self.fps)

        timer_period = 1.0 / self.fps if self.fps > 0.0 else 1.0 / 30.0
        self.timer = self.create_timer(timer_period, self.capture_and_publish)

        actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        actual_fps = float(self.cap.get(cv2.CAP_PROP_FPS))
        self.get_logger().info(
            f"Streaming kamery laptopa: index={self.camera_index}, "
            f"topic={self.image_topic}, frame={self.frame_id}, "
            f"size={actual_width}x{actual_height}, fps={actual_fps:.1f}"
        )

    def capture_and_publish(self):
        ok, frame_bgr = self.cap.read()
        if not ok or frame_bgr is None:
            self.get_logger().warn("Brak klatki z kamery.")
            return

        image_msg = self.bridge.cv2_to_imgmsg(frame_bgr, encoding="bgr8")
        image_msg.header.stamp = self.get_clock().now().to_msg()
        image_msg.header.frame_id = self.frame_id
        self.image_pub.publish(image_msg)

    def destroy_node(self):
        if hasattr(self, "cap") and self.cap is not None and self.cap.isOpened():
            self.cap.release()
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)
    node = None
    try:
        node = LaptopCameraStreamNode()
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        if node is not None:
            node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
