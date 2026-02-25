#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import math
from typing import Optional

import rclpy
from geometry_msgs.msg import Twist
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from sensor_msgs.msg import Imu, JointState
from std_srvs.srv import SetBool


class HeadToTorsoController(Node):
    """
    Sterowanie tułowiem robota na podstawie współrzędnej `w` z quaterniona IMU.

    - IMU publikuje quaternion (w, x, y, z) na /xreal/imu/data
    - Interesuje nas tylko `w`
    - Zakładane mapowanie:
        w = -0.25  -> tułów = +1
        w =  0.0   -> tułów =  0
        w = +0.25  -> tułów = -1
    - Poza zakresem [-0.25, 0.25] na razie nie zmieniamy tułowia (cmd_vel = 0)
    """

    def __init__(self) -> None:
        super().__init__("head_to_torso_controller")

        # Parametry mapowania w -> pozycja tułowia
        self.declare_parameter("imu_w_min", -0.25)
        self.declare_parameter("imu_w_max", 0.25)
        self.declare_parameter("waist_min", -1.0)
        self.declare_parameter("waist_max", 1.0)
        # gain ~ (waist_max - waist_min) / (imu_w_min - imu_w_max)
        # dla [-0.25,0.25] -> [-1,1] wychodzi -4.0
        self.declare_parameter("w_to_waist_gain", -4.0)

        # Parametry PD – szybkie „doganianie” kąta IMU
        self.declare_parameter("kp", 8.0)          # duży Kp -> małe opóźnienie
        self.declare_parameter("kd", 0.0)          # na razie bez członu D
        self.declare_parameter("max_angular_vel", 10.0)  # pozwól na szybki obrót
        self.declare_parameter("deadzone_rad", 0.005)    # prawie brak martwej strefy

        # Zakres fizyczny tułowia (do saturacji odczytu)
        self.declare_parameter("waist_max_range_rad", 1.0)
        # Czy kontroler ma być aktywny od startu (inaczej czeka na service)
        self.declare_parameter("enabled_at_start", False)

        # Tematy / nazwy
        self.declare_parameter("xreal_imu_topic", "/xreal/imu/data")
        self.declare_parameter("joint_states_topic", "/joint_states")
        self.declare_parameter("waist_joint_name", "waist_yaw_joint")
        self.declare_parameter("cmd_vel_topic", "/cmd_vel")

        # Odczyt parametrów
        self.imu_w_min = float(self.get_parameter("imu_w_min").value)
        self.imu_w_max = float(self.get_parameter("imu_w_max").value)
        self.waist_min = float(self.get_parameter("waist_min").value)
        self.waist_max = float(self.get_parameter("waist_max").value)
        self.w_to_waist_gain = float(self.get_parameter("w_to_waist_gain").value)

        self.kp = float(self.get_parameter("kp").value)
        self.kd = float(self.get_parameter("kd").value)
        self.max_angular_vel = float(self.get_parameter("max_angular_vel").value)
        self.deadzone_rad = float(self.get_parameter("deadzone_rad").value)
        self.waist_max_range_rad = float(self.get_parameter("waist_max_range_rad").value)
        self.enabled = bool(self.get_parameter("enabled_at_start").value)

        xreal_topic = str(self.get_parameter("xreal_imu_topic").value)
        joint_states_topic = str(self.get_parameter("joint_states_topic").value)
        self.waist_joint_name = str(self.get_parameter("waist_joint_name").value)
        cmd_vel_topic = str(self.get_parameter("cmd_vel_topic").value)

        # Stan
        self.imu_w: Optional[float] = None
        self.robot_waist_pos: Optional[float] = None
        self.last_error: float = 0.0
        self.last_time: Optional[float] = None

        # Subskrypcje
        self.create_subscription(
            Imu,
            xreal_topic,
            self._imu_callback,
            qos_profile=qos_profile_sensor_data,
        )
        self.create_subscription(
            JointState,
            joint_states_topic,
            self._joint_states_callback,
            10,
        )

        # Service do włączania/wyłączania kontrolera
        self.create_service(SetBool, "/enable_head_to_torso", self._enable_srv_cb)

        # Publikacja
        self.cmd_vel_pub = self.create_publisher(Twist, cmd_vel_topic, 10)

        # Timer sterowania (~50 Hz)
        self.create_timer(0.02, self._control_loop)

        self.get_logger().info(
            f"HeadToTorsoController IMU.w mapping: "
            f"w in [{self.imu_w_min}, {self.imu_w_max}] -> "
            f"waist in [{self.waist_min}, {self.waist_max}], "
            f"gain={self.w_to_waist_gain}"
        )

    # -----------------------------
    # Callbacks
    # -----------------------------
    def _imu_callback(self, msg: Imu) -> None:
        """Zapisuje aktualne `w` z quaterniona IMU."""
        self.imu_w = float(msg.orientation.w)

    def _joint_states_callback(self, msg: JointState) -> None:
        """Odczytuje bieżącą pozycję stawu tułowia."""
        try:
            idx = msg.name.index(self.waist_joint_name)
        except ValueError:
            return

        if idx < len(msg.position):
            pos = float(msg.position[idx])
            # Ogranicz pozycję do fizycznego zakresu
            pos = max(-self.waist_max_range_rad, min(self.waist_max_range_rad, pos))
            self.robot_waist_pos = pos

    # -----------------------------
    # Control
    # -----------------------------
    def _compute_target_from_w(self, w: float) -> Optional[float]:
        """
        Przelicza w -> docelowa pozycja tułowia.

        - Wartość w jest NAJPIERW ścinana do zakresu [imu_w_min, imu_w_max]
          (czyli wyjście poza zakres traktujemy jak wartość graniczną).
        - target = gain * w_clamped, z ograniczeniem do [waist_min, waist_max]
        """
        w_clamped = max(self.imu_w_min, min(self.imu_w_max, w))

        target = self.w_to_waist_gain * w_clamped
        target = max(self.waist_min, min(self.waist_max, target))
        return target

    def _control_loop(self) -> None:
        """
        Sterowanie „bang-bang”: stała prędkość aż do osiągnięcia kąta z IMU.

        - jeśli robot jest po lewej od celu -> jedzie w prawo z max_angular_vel
        - jeśli po prawej -> jedzie w lewo z -max_angular_vel
        - gdy błąd mniejszy niż deadzone_rad -> zatrzymuje się (kąt praktycznie taki sam)
        """
        if not self.enabled or self.imu_w is None or self.robot_waist_pos is None:
            return

        target = self._compute_target_from_w(self.imu_w)

        # Błąd pozycji
        error = target - self.robot_waist_pos

        # Jeśli jesteśmy bardzo blisko celu – zatrzymaj (nie ma „powolnego dojazdu”)
        if abs(error) < self.deadzone_rad:
            angular_z = 0.0
        else:
            # Stała prędkość w stronę celu
            angular_z = self.max_angular_vel if error > 0.0 else -self.max_angular_vel

        twist = Twist()
        twist.angular.z = angular_z
        self.cmd_vel_pub.publish(twist)

        # Log: aktualne IMU.w, pozycja stawu, cel i cmd_vel
        self.get_logger().info(
            f"[w-controller] IMU.w={self.imu_w:.3f}, "
            f"waist_pos={self.robot_waist_pos:.3f}, "
            f"target={target:.3f}, cmd_vel.z={angular_z:.3f}"
        )

    # -----------------------------
    # Service handlers
    # -----------------------------
    def _enable_srv_cb(self, request: SetBool.Request, response: SetBool.Response):
        """Service: włącz/wyłącz sterowanie tułowiem."""
        self.enabled = bool(request.data)
        state = "ENABLED" if self.enabled else "DISABLED"
        self.get_logger().info(f"HeadToTorsoController state changed via service: {state}")
        response.success = True
        response.message = state
        return response


def main(args=None) -> None:
    rclpy.init(args=args)
    node = HeadToTorsoController()
    try:
        rclpy.spin(node)
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()

