#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import math
import socket
import struct
import threading
import time
from dataclasses import dataclass
from typing import Optional

import rclpy
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from sensor_msgs.msg import Imu


@dataclass
class _Bias:
    gx: float = 0.0
    gy: float = 0.0
    gz: float = 0.0


class XrealImuNode(Node):
    """
    Publishes IMU raw data from XREAL One/One Pro glasses over TCP.

    This node replaces the demo's complementary filter by publishing raw IMU
    (angular velocity + linear acceleration). Orientation should be computed
    by a dedicated filter node (e.g. imu_filter_madgwick).
    """

    HEADER = bytes.fromhex("283600000080")
    PACKET_LENGTH = 134
    IMU_OFFSET = 34

    def __init__(self):
        super().__init__("xreal_imu")

        self.declare_parameter("ip", "169.254.2.1")
        self.declare_parameter("port", 52998)
        self.declare_parameter("timeout_s", 5.0)
        self.declare_parameter("frame_id", "xreal_imu")

        # Units / scaling
        self.declare_parameter("gyro_in_degs", True)   # demo integrated in degrees → assume deg/s
        self.declare_parameter("accel_in_g", True)     # common IMU unit; scale to m/s^2
        self.declare_parameter("gyro_scale", 1.0)      # extra multiplier
        self.declare_parameter("accel_scale", 1.0)     # extra multiplier

        # Optional gyro bias calibration (averaging first N samples)
        self.declare_parameter("gyro_bias_calib_samples", 500)

        self._ip = str(self.get_parameter("ip").value)
        self._port = int(self.get_parameter("port").value)
        self._timeout_s = float(self.get_parameter("timeout_s").value)
        self._frame_id = str(self.get_parameter("frame_id").value)

        self._gyro_in_degs = bool(self.get_parameter("gyro_in_degs").value)
        self._accel_in_g = bool(self.get_parameter("accel_in_g").value)
        self._gyro_scale = float(self.get_parameter("gyro_scale").value)
        self._accel_scale = float(self.get_parameter("accel_scale").value)

        self._bias_N = max(0, int(self.get_parameter("gyro_bias_calib_samples").value))
        self._bias = _Bias()
        self._bias_count = 0
        self._bias_sum = _Bias()

        self._sock: Optional[socket.socket] = None
        self._recv_buffer = b""
        self._stop_evt = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

        self.pub_raw = self.create_publisher(Imu, "xreal/imu/data_raw", qos_profile_sensor_data)

        self.get_logger().info(f"Connecting to XREAL IMU at {self._ip}:{self._port} ...")
        self._thread.start()

    # -----------------------------
    # Networking / parsing
    # -----------------------------
    def destroy_node(self):
        self._stop_evt.set()
        try:
            if self._sock:
                self._sock.close()
        except Exception:
            pass
        return super().destroy_node()

    def _connect(self) -> socket.socket:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(self._timeout_s)
        s.connect((self._ip, self._port))
        return s

    def _parse_packet(self, packet_data: bytes):
        imu_bytes = packet_data[self.IMU_OFFSET : self.IMU_OFFSET + 24]
        if len(imu_bytes) != 24:
            return None
        values = struct.unpack("<ffffff", imu_bytes)  # gx,gy,gz, ax,ay,az
        if any(math.isnan(v) or math.isinf(v) for v in values):
            return None
        return values

    def _run(self):
        while rclpy.ok() and not self._stop_evt.is_set():
            try:
                if self._sock is None:
                    self._sock = self._connect()
                    self._recv_buffer = b""
                    self.get_logger().info("✅ XREAL IMU connected.")

                chunk = self._sock.recv(4096)
                if not chunk:
                    raise ConnectionError("socket closed")
                self._recv_buffer += chunk

                while True:
                    header_pos = self._recv_buffer.find(self.HEADER)
                    if header_pos == -1:
                        if len(self._recv_buffer) > len(self.HEADER):
                            self._recv_buffer = self._recv_buffer[-len(self.HEADER):]
                        break

                    if header_pos > 0:
                        self._recv_buffer = self._recv_buffer[header_pos:]

                    if len(self._recv_buffer) < self.PACKET_LENGTH:
                        break

                    packet = self._recv_buffer[: self.PACKET_LENGTH]
                    self._recv_buffer = self._recv_buffer[self.PACKET_LENGTH :]

                    vals = self._parse_packet(packet)
                    if vals is None:
                        continue

                    gx, gy, gz, ax, ay, az = (float(v) for v in vals)
                    self._publish(gx, gy, gz, ax, ay, az)

            except socket.timeout:
                continue
            except Exception as e:
                self.get_logger().warn(f"XREAL IMU connection error: {e}. Reconnecting...")
                try:
                    if self._sock:
                        self._sock.close()
                except Exception:
                    pass
                self._sock = None
                time.sleep(0.5)

    # -----------------------------
    # Publishing
    # -----------------------------
    def _publish(self, gx: float, gy: float, gz: float, ax: float, ay: float, az: float):
        # Optional gyro bias calibration (device must be stationary)
        if self._bias_N > 0 and self._bias_count < self._bias_N:
            self._bias_sum.gx += gx
            self._bias_sum.gy += gy
            self._bias_sum.gz += gz
            self._bias_count += 1
            if self._bias_count == self._bias_N:
                self._bias.gx = self._bias_sum.gx / self._bias_N
                self._bias.gy = self._bias_sum.gy / self._bias_N
                self._bias.gz = self._bias_sum.gz / self._bias_N
                self.get_logger().info("✅ Gyro bias calibrated.")
            return

        gx = (gx - self._bias.gx) * self._gyro_scale
        gy = (gy - self._bias.gy) * self._gyro_scale
        gz = (gz - self._bias.gz) * self._gyro_scale
        if self._gyro_in_degs:
            k = math.pi / 180.0
            gx *= k
            gy *= k
            gz *= k

        ax *= self._accel_scale
        ay *= self._accel_scale
        az *= self._accel_scale
        if self._accel_in_g:
            g = 9.80665
            ax *= g
            ay *= g
            az *= g

        msg = Imu()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = self._frame_id

        # Orientation unknown in raw message
        msg.orientation_covariance[0] = -1.0

        msg.angular_velocity.x = gx
        msg.angular_velocity.y = gy
        msg.angular_velocity.z = gz

        msg.linear_acceleration.x = ax
        msg.linear_acceleration.y = ay
        msg.linear_acceleration.z = az

        self.pub_raw.publish(msg)


def main(args=None):
    rclpy.init(args=args)
    node = XrealImuNode()
    try:
        rclpy.spin(node)
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()

