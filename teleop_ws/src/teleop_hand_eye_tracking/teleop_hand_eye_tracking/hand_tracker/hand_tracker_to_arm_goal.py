#!/usr/bin/env python3
import rclpy
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from geometry_msgs.msg import Point, PoseStamped
from std_msgs.msg import String
from std_srvs.srv import SetBool
import numpy as np

# Stany węzła (prosta maszyna stanów)
STATE_IDLE = "idle"      # nie wysyłamy celów do ramion
STATE_ACTIVE = "active"  # mapowanie /hand/* -> /g1pilot/hand_goal/*


class HandTrackerToArmGoal(Node):
    """
    Most między danymi z hand_tracker_node (/hand/left, /hand/right)
    a celami końcówek rąk dla arm_controller_node
    (/g1pilot/hand_goal/left, /g1pilot/hand_goal/right).

    Założenia:
    - /hand/left i /hand/right to geometry_msgs/Point:
        x: współrzędna piksela (kolumna, w [0, image_width))
        y: współrzędna piksela (wiersz, w [0, image_height))
        z: odległość w mm (po filtrach w hand_tracker_node, zwykle 400–800mm)
    - Mamy TF kamery OAK w drzewie robota, ale tutaj stosujemy prostą
      heurystykę: mapowanie 2D (pikseli) + głębokości na przestrzeń roboczą
      prawej/lewej ręki w układzie 'pelvis'.
    """

    def __init__(self):
        super().__init__("hand_tracker_to_arm_goal")

        # Rozdzielczość obrazu używana w hand_tracker_node / OAK
        self.declare_parameter("image_width", 1280.0)
        self.declare_parameter("image_height", 720.0)

        # Zakres głębokości (w mm), zgodny z hand_tracker_node
        self.declare_parameter("depth_min_mm", 400.0)
        self.declare_parameter("depth_max_mm", 800.0)

        # Przybliżony workspace w układzie 'pelvis' [m]
        # (wartości wzięte z WORKSPACE w arm_controller_node.py, lekko odsunięte od tułowia)
        # Prawa ręka
        # x_min podniesione z 0.07 -> 0.16, żeby przy ~400mm ręce nie były „przyklejone” do klatki
        self.declare_parameter("right_x_min", 0.16)
        self.declare_parameter("right_x_max", 0.45)
        # Zwiększamy zakres Y, ale trzymamy środek mniej więcej w tym samym miejscu
        # (więcej ruchu robota na ten sam zakres kamery):
        # środek ≈ -0.145, pół-zakres ≈ 0.145 -> [-0.29, -0.00]
        self.declare_parameter("right_y_min", -0.29)
        self.declare_parameter("right_y_max", 0.00)
        self.declare_parameter("right_z_min", 0.02)
        self.declare_parameter("right_z_max", 0.20)

        # Lewa ręka – lustrzane wartości względem osi Y
        self.declare_parameter("left_x_min", 0.16)
        self.declare_parameter("left_x_max", 0.45)
        # Lewa ręka – symetrycznie względem prawej:
        # środek ≈ +0.145, pół-zakres ≈ 0.145 -> [0.00, 0.29]
        self.declare_parameter("left_y_min", 0.00)
        self.declare_parameter("left_y_max", 0.29)
        self.declare_parameter("left_z_min", 0.02)
        self.declare_parameter("left_z_max", 0.20)

        # Czy node ma zacząć od razu w stanie 'active' (nadawanie celów),
        # czy w stanie 'idle' (wymaga wywołania serwisu set_enabled)?
        self.declare_parameter("start_enabled", False)

        # Wczytaj parametry do prostych zmiennych
        self._load_params()

        # Maszyna stanów: idle = nie wysyłamy celów, active = wysyłamy
        start = bool(self.get_parameter("start_enabled").value)
        self._state = STATE_ACTIVE if start else STATE_IDLE

        # Subskrypcje z hand_tracker_node (dane z kamery – QoS sensor_data)
        self.sub_right = self.create_subscription(
            Point,
            "/hand/right",
            self._right_cb,
            qos_profile=qos_profile_sensor_data,
        )
        self.sub_left = self.create_subscription(
            Point,
            "/hand/left",
            self._left_cb,
            qos_profile=qos_profile_sensor_data,
        )

        # Serwis do włączania/wyłączania (zamiast topicu)
        # ros2 service call /hand_tracker_to_arm_goal/set_enabled std_srvs/srv/SetBool "{data: true}"
        self.srv_set_enabled = self.create_service(
            SetBool,
            "hand_tracker_to_arm_goal/set_enabled",
            self._set_enabled_cb,
        )

        # Opcjonalnie: publikacja aktualnego stanu (dla GUI / innych węzłów)
        self.pub_state = self.create_publisher(
            String, "hand_tracker_to_arm_goal/state", 10
        )

        # Publikacje celów dla arm_controller_node
        self.pub_right = self.create_publisher(
            PoseStamped, "/g1pilot/hand_goal/right", 10
        )
        self.pub_left = self.create_publisher(
            PoseStamped, "/g1pilot/hand_goal/left", 10
        )

        # Jednorazowa publikacja stanu po starcie (dla GUI / monitorów)
        self._state_timer = self.create_timer(0.5, self._publish_state_once)

        self.get_logger().info("HandTrackerToArmGoal started.")

    # ------------------------------------------------------------------
    # Parametry
    # ------------------------------------------------------------------
    def _load_params(self):
        gp = self.get_parameter
        self.img_w = float(gp("image_width").value)
        self.img_h = float(gp("image_height").value)

        self.depth_min = float(gp("depth_min_mm").value)
        self.depth_max = float(gp("depth_max_mm").value)

        self.r_x_min = float(gp("right_x_min").value)
        self.r_x_max = float(gp("right_x_max").value)
        self.r_y_min = float(gp("right_y_min").value)
        self.r_y_max = float(gp("right_y_max").value)
        self.r_z_min = float(gp("right_z_min").value)
        self.r_z_max = float(gp("right_z_max").value)

        self.l_x_min = float(gp("left_x_min").value)
        self.l_x_max = float(gp("left_x_max").value)
        self.l_y_min = float(gp("left_y_min").value)
        self.l_y_max = float(gp("left_y_max").value)
        self.l_z_min = float(gp("left_z_min").value)
        self.l_z_max = float(gp("left_z_max").value)

    # ------------------------------------------------------------------
    # Sterowanie stanem przez serwis (maszyna stanów: idle / active)
    # ------------------------------------------------------------------
    def _set_enabled_cb(self, request, response):
        self._state = STATE_ACTIVE if request.data else STATE_IDLE
        response.success = True
        response.message = self._state
        self.get_logger().info(f"hand_tracker_to_arm_goal state: {self._state}")
        self._publish_state()
        return response

    def _publish_state(self):
        msg = String()
        msg.data = self._state
        self.pub_state.publish(msg)

    def _publish_state_once(self):
        self._state_timer.cancel()
        self._publish_state()

    # ------------------------------------------------------------------
    # Callbacks
    # ------------------------------------------------------------------
    def _right_cb(self, msg: Point):
        if self._state != STATE_ACTIVE:
            return
        pose = self._point_to_pose(
            msg,
            side="right",
            x_min=self.r_x_min,
            x_max=self.r_x_max,
            y_min=self.r_y_min,
            y_max=self.r_y_max,
            z_min=self.r_z_min,
            z_max=self.r_z_max,
        )
        if pose is not None:
            self.pub_right.publish(pose)

    def _left_cb(self, msg: Point):
        if self._state != STATE_ACTIVE:
            return
        pose = self._point_to_pose(
            msg,
            side="left",
            x_min=self.l_x_min,
            x_max=self.l_x_max,
            y_min=self.l_y_min,
            y_max=self.l_y_max,
            z_min=self.l_z_min,
            z_max=self.l_z_max,
        )
        if pose is not None:
            self.pub_left.publish(pose)

    # ------------------------------------------------------------------
    # Heurystyczne mapowanie (piksel + głębokość -> pelvis frame)
    # ------------------------------------------------------------------
    def _point_to_pose(
        self,
        pt: Point,
        side: str,
        x_min: float,
        x_max: float,
        y_min: float,
        y_max: float,
        z_min: float,
        z_max: float,
    ) -> PoseStamped | None:
        # Brak danych – pomiń
        if pt.z <= 0.0:
            return None

        # 1) Normalizacja pikseli (0..W-1, 0..H-1) -> [-1, 1]
        u = float(pt.x)
        v = float(pt.y)

        if self.img_w <= 0 or self.img_h <= 0:
            return None

        u_norm = ((u / self.img_w) - 0.5) * 2.0  # -1 (lewo) .. +1 (prawo)
        v_norm = ((v / self.img_h) - 0.5) * 2.0  # -1 (góra) .. +1 (dół)

        # 2) Mapowanie boczne (Y): ekran lewo/prawo -> workspace Y
        #    Kamera patrzy na robota, więc „lewo” na ekranie to lewa strona robota.
        #    Odwracamy wcześniejsze mapowanie, żeby ruch na ekranie i u robota był zgodny.
        t_y = (u_norm + 1.0) * 0.5  # 0..1
        # zamiast y_min + t_y*(y_max-y_min) robimy odwrotnie:
        y = y_max - t_y * (y_max - y_min)

        # 3) Wysokość (Z): góra/dół ekranu -> [z_min, z_max]
        #    góra obrazu (v_norm ~ -1) = większe Z (ręka wyżej)
        t_z = (1.0 - v_norm) * 0.5  # 0..1 (góra->1, dół->0)
        z = z_min + t_z * (z_max - z_min)

        # 4) Głębokość (X): odległość w mm -> [x_min, x_max]
        depth = float(pt.z)
        d = float(np.clip((depth - self.depth_min) / (self.depth_max - self.depth_min), 0.0, 1.0))
        x = x_min + d * (x_max - x_min)

        # Pose w układzie pelvis
        pose = PoseStamped()
        pose.header.stamp = self.get_clock().now().to_msg()
        pose.header.frame_id = "pelvis"
        pose.pose.position.x = x
        pose.pose.position.y = y
        pose.pose.position.z = z

        # Prosta orientacja – ręka „patrzy” mniej więcej w przód;
        # arm_controller_node i tak pilnuje orientacji / workspace-u.
        pose.pose.orientation.x = 0.0
        pose.pose.orientation.y = 0.0
        pose.pose.orientation.z = 0.0
        pose.pose.orientation.w = 1.0

        # Debug log (opcjonalnie, aby nie spamować – można zakomentować)
        self.get_logger().debug(
            f"[{side}] pix=({u:.1f},{v:.1f}), depth={depth:.1f}mm -> "
            f"pelvis=({x:.3f},{y:.3f},{z:.3f})"
        )

        return pose


def main(args=None):
    rclpy.init(args=args)
    node = HandTrackerToArmGoal()
    try:
        rclpy.spin(node)
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()

