#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import math
import os
import socket
import struct
import threading
import time
from dataclasses import dataclass
from typing import Optional

import rclpy
from ament_index_python.packages import get_package_share_directory
from rclpy.node import Node


@dataclass
class _Bias:
    gx: float = 0.0
    gy: float = 0.0
    gz: float = 0.0


class XrealImuCalibNode(Node):
    """
    Kalibracja biasu żyroskopu XREAL IMU.

    - Łączy się po TCP tak jak xreal_imu_node
    - Przez ~calib_duration_s zbiera próbki, gdy IMU jest nieruchome
      (prędkość kątowa < gyro_bias_calib_max_speed)
    - Zapisuje uśredniony bias (gx, gy, gz) do pliku JSON
    - Kończy proces po zapisaniu pliku
    """

    HEADER = bytes.fromhex("283600000080")
    PACKET_LENGTH = 134
    IMU_OFFSET = 34

    def __init__(self) -> None:
        super().__init__("xreal_imu_calib")

        # Połączenie TCP
        self.declare_parameter("ip", "169.254.2.1")
        self.declare_parameter("port", 52998)
        self.declare_parameter("timeout_s", 5.0)

        # Parametry kalibracji
        self.declare_parameter("calib_duration_s", 15.0)
        self.declare_parameter("gyro_bias_calib_max_speed", 0.05)  # rad/s

        try:
            pkg_share = get_package_share_directory("teleop_xreal_oak")
            default_bias_path = os.path.join(pkg_share, "config", "xreal_imu_bias.json")
        except Exception:
            default_bias_path = os.path.expanduser("~/.xreal_imu_bias.json")
        self.declare_parameter("bias_file", default_bias_path)

        self._ip = str(self.get_parameter("ip").value)
        self._port = int(self.get_parameter("port").value)
        self._timeout_s = float(self.get_parameter("timeout_s").value)

        self._calib_duration_s = float(self.get_parameter("calib_duration_s").value)
        self._bias_calib_max_speed = float(self.get_parameter("gyro_bias_calib_max_speed").value)
        self._bias_file = str(self.get_parameter("bias_file").value)

        self._bias_sum = _Bias()
        self._bias_count = 0
        self._bias: Optional[_Bias] = None

        self._start_time = time.time()
        self._done = False
        self._saved = False

        self._sock: Optional[socket.socket] = None
        self._recv_buffer = b""
        self._stop_evt = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

        self.get_logger().info(
            f"Starting XREAL IMU gyro bias calibration for {self._calib_duration_s:.1f} s.\n"
            f"Trzymaj głowę nieruchomo. "
            f"Max speed for samples: {self._bias_calib_max_speed:.3f} rad/s"
        )
        self._thread.start()

        # Timer sprawdzający, czy można już zapisać bias i zakończyć node
        self.create_timer(0.5, self._check_done_timer)

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

    def _run(self) -> None:
        while rclpy.ok() and not self._stop_evt.is_set() and not self._done:
            try:
                if self._sock is None:
                    self._sock = self._connect()
                    self._recv_buffer = b""
                    self.get_logger().info("✅ XREAL IMU connected for calibration.")

                chunk = self._sock.recv(4096)
                if not chunk:
                    raise ConnectionError("socket closed")
                self._recv_buffer += chunk

                while True:
                    header_pos = self._recv_buffer.find(self.HEADER)
                    if header_pos == -1:
                        if len(self._recv_buffer) > len(self.HEADER):
                            self._recv_buffer = self._recv_buffer[-len(self.HEADER) :]
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
                    self._accumulate(gx, gy, gz)

            except socket.timeout:
                continue
            except Exception as e:
                if not self._done:
                    self.get_logger().warn(f"XREAL IMU calibration connection error: {e}. Reconnecting...")
                try:
                    if self._sock:
                        self._sock.close()
                except Exception:
                    pass
                self._sock = None
                time.sleep(0.5)

    # -----------------------------
    # Calibration logic
    # -----------------------------
    def _accumulate(self, gx: float, gy: float, gz: float) -> None:
        if self._done:
            return

        # Tylko próbki przy małej prędkości kątowej (głowa nieruchoma)
        speed = math.sqrt(gx * gx + gy * gy + gz * gz)
        if speed <= self._bias_calib_max_speed:
            self._bias_sum.gx += gx
            self._bias_sum.gy += gy
            self._bias_sum.gz += gz
            self._bias_count += 1

        elapsed = time.time() - self._start_time
        if elapsed >= self._calib_duration_s and self._bias_count > 0:
            self._bias = _Bias(
                gx=self._bias_sum.gx / self._bias_count,
                gy=self._bias_sum.gy / self._bias_count,
                gz=self._bias_sum.gz / self._bias_count,
            )
            self._done = True
            self._stop_evt.set()
            self.get_logger().info(
                f"Calibration finished ({self._bias_count} samples). "
                f"Bias: gx={self._bias.gx:.6f}, gy={self._bias.gy:.6f}, gz={self._bias.gz:.6f}"
            )
        elif elapsed >= self._calib_duration_s and self._bias_count == 0:
            self._done = True
            self._stop_evt.set()
            self.get_logger().warn(
                "Calibration time elapsed but no stationary samples collected. "
                "Bias will not be saved."
            )

    def _check_done_timer(self) -> None:
        """Sprawdza, czy mamy gotowy bias do zapisania, a potem kończy node."""
        if not self._done or self._saved:
            return

        if self._bias is None:
            # Nic nie zapisujemy, po prostu kończymy
            self._saved = True
            self.get_logger().warn("No gyro bias computed. Nothing to save.")
            rclpy.shutdown()
            return

        path = os.path.expanduser(self._bias_file)
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
        except Exception:
            # Jeśli nie da się utworzyć katalogu, spróbuj zapisać jak jest
            pass

        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "gx": self._bias.gx,
                        "gy": self._bias.gy,
                        "gz": self._bias.gz,
                        "samples": self._bias_count,
                        "timestamp": time.time(),
                    },
                    f,
                    indent=2,
                )
            self.get_logger().info(f"✅ Saved gyro bias to {path}")
        except Exception as e:
            self.get_logger().error(f"Failed to save gyro bias to {path}: {e}")

        self._saved = True
        rclpy.shutdown()


def main(args=None) -> None:
    rclpy.init(args=args)
    node = XrealImuCalibNode()
    try:
        rclpy.spin(node)
    finally:
        node.destroy_node()
        # rclpy.shutdown() already called in _check_done_timer


if __name__ == "__main__":
    main()

