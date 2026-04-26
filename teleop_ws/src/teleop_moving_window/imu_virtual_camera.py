#!/usr/bin/env python3

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy, DurabilityPolicy
from sensor_msgs.msg import Imu, Image
from visualization_msgs.msg import Marker, MarkerArray
from geometry_msgs.msg import TransformStamped
from tf2_ros.static_transform_broadcaster import StaticTransformBroadcaster
from cv_bridge import CvBridge
import cv2
import pyvista as pv
import numpy as np
from scipy.spatial.transform import Rotation as R

class ImuCameraNode(Node):
    def __init__(self):
        super().__init__('imu_virtual_camera_node')
        
        # Konfiguracja QoS dokładnie pod Twojego Publishera (RELIABLE, głębokość 5)
        qos_profile = QoSProfile(
            reliability=ReliabilityPolicy.RELIABLE,
            history=HistoryPolicy.KEEP_LAST,
            depth=5
        )
        
        # Subskrybent danych IMU
        self.imu_sub = self.create_subscription(
            Imu, 
            '/xreal/imu/data', 
            self.imu_callback, 
            qos_profile
        )
        # Subskrybent obrazu z laptopowej kamery - ten obraz będzie teksturą bloków.
        camera_qos = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=5
        )
        self.laptop_image_sub = self.create_subscription(
            Image,
            '/laptop/camera/image_raw',
            self.laptop_image_callback,
            camera_qos
        )
        
        # Publikator wygenerowanego obrazu z kamery
        self.image_pub = self.create_publisher(
            Image, 
            '/xreal/camera/image_raw', 
            10
        )

        # Publikator markerów do RViz2 (durability=TRANSIENT_LOCAL, aby RViz dostał markery po starcie)
        marker_qos = QoSProfile(
            reliability=ReliabilityPolicy.RELIABLE,
            history=HistoryPolicy.KEEP_LAST,
            depth=1,
            durability=DurabilityPolicy.TRANSIENT_LOCAL
        )
        self.marker_pub = self.create_publisher(
            MarkerArray,
            '/xreal/virtual_scene/markers',
            marker_qos
        )
        # Dodawanie nowych bloków przez ROS2:
        # ros2 topic pub /xreal/virtual_scene/add_block visualization_msgs/msg/Marker ...
        self.add_block_sub = self.create_subscription(
            Marker,
            '/xreal/virtual_scene/add_block',
            self.add_block_callback,
            10
        )

        # Statyczny TF, aby RViz miał spójną ramkę xreal_imu <-> xreal_camera_frame
        self.static_tf_broadcaster = StaticTransformBroadcaster(self)
        self.publish_static_tf()
        
        self.bridge = CvBridge()
        
        # Konfiguracja silnika 3D
        self.plotter = pv.Plotter(off_screen=True, window_size=[640, 480])
        self.scene_blocks = []
        self.next_block_id = 100
        self.camera_screen_block_id = 0
        self.camera_screen_position = (5.0, 0.0, 0.0)
        self.camera_screen_height = 1.2
        self.camera_screen_depth = 0.05
        self.latest_camera_texture = None
        self.setup_virtual_scene()
        
        self.latest_quat = [0.0, 0.0, 0.0, 1.0]
        self.first_msg_received = False
        self.marker_frame_id = "xreal_imu"
        
        # Timer działający w 30 FPS
        self.timer = self.create_timer(1.0 / 30.0, self.render_and_publish)
        self.marker_timer = self.create_timer(1.0, self.publish_scene_markers)
        
        self.get_logger().info(
            "Węzeł Wirtualnej Kamery uruchomiony. Oczekiwanie na IMU (/xreal/imu/data) "
            "i teksturę kamery laptopa (/laptop/camera/image_raw)..."
        )

    def setup_virtual_scene(self):
        """Tworzy wirtualne środowisko wokół kamery."""
        grid = pv.Plane(center=(0, 0, -2), direction=(0, 0, 1), i_size=20, j_size=20)
        self.plotter.add_mesh(grid, show_edges=True, color='white')

        # Jeden blok działa jako "ekran" kamery laptopa (id=0).
        self.update_camera_screen_block(aspect_ratio=16.0 / 9.0)
        self.add_scene_block((0.0, 5.0, 0.0), (1.0, 1.0, 1.0), (0.0, 1.0, 0.0), block_id=1)
        self.add_scene_block((-5.0, 0.0, 0.0), (1.0, 1.0, 1.0), (0.0, 0.0, 1.0), block_id=2)
        self.add_scene_block((0.0, -5.0, 0.0), (1.0, 1.0, 1.0), (1.0, 1.0, 0.0), block_id=3)
        
        self.plotter.set_background('lightblue')
        
        # KLUCZOWA POPRAWKA: Wymusza inicjalizację renderowania w tle
        self.plotter.show(auto_close=False)

    def publish_static_tf(self):
        """Publikuje statyczny TF xreal_imu -> xreal_camera_frame (transformacja jednostkowa)."""
        tf_msg = TransformStamped()
        tf_msg.header.stamp = self.get_clock().now().to_msg()
        tf_msg.header.frame_id = "xreal_imu"
        tf_msg.child_frame_id = "xreal_camera_frame"
        tf_msg.transform.translation.x = 0.0
        tf_msg.transform.translation.y = 0.0
        tf_msg.transform.translation.z = 0.0
        tf_msg.transform.rotation.x = 0.0
        tf_msg.transform.rotation.y = 0.0
        tf_msg.transform.rotation.z = 0.0
        tf_msg.transform.rotation.w = 1.0
        self.static_tf_broadcaster.sendTransform(tf_msg)

    def add_scene_block(self, position_xyz, scale_xyz, color_rgb, block_id=None):
        """Dodaje zwykły kolorowy blok do sceny PyVista i listy do RViz2."""
        if block_id is None:
            block_id = self.next_block_id
            self.next_block_id += 1

        cube = pv.Cube(center=position_xyz, x_length=scale_xyz[0], y_length=scale_xyz[1], z_length=scale_xyz[2])
        mesh_name = f"scene_block_{int(block_id)}"
        self.plotter.add_mesh(cube, name=mesh_name, color=tuple(color_rgb), show_edges=False)

        self._upsert_block_state(
            block_id=int(block_id),
            position_xyz=position_xyz,
            scale_xyz=scale_xyz,
            color_rgb=color_rgb,
            mesh_name=mesh_name
        )

    def _upsert_block_state(self, block_id, position_xyz, scale_xyz, color_rgb, mesh_name):
        block = {
            "id": int(block_id),
            "position": tuple(position_xyz),
            "scale": tuple(scale_xyz),
            "color": tuple(color_rgb),
            "mesh_name": mesh_name
        }
        for idx, existing in enumerate(self.scene_blocks):
            if existing["id"] == int(block_id):
                self.scene_blocks[idx] = block
                return

        self.scene_blocks.append(block)

    def update_camera_screen_block(self, aspect_ratio):
        """Aktualizuje blok-ekomran (id=0) pod proporcje obrazu kamery laptopa."""
        safe_aspect = float(np.clip(aspect_ratio, 0.5, 3.0))
        width = self.camera_screen_height * safe_aspect
        scale_xyz = (width, self.camera_screen_height, self.camera_screen_depth)
        mesh_name = f"scene_block_{self.camera_screen_block_id}"
        # Dla poprawnego rozlozenia obrazu uzywamy panelu (Plane),
        # bo mapowanie UV na Cube moze dawac paski i znieksztalcenia.
        screen_panel = pv.Plane(
            center=self.camera_screen_position,
            direction=(1.0, 0.0, 0.0),
            i_size=scale_xyz[1],  # os Y
            j_size=scale_xyz[0],  # os Z
            i_resolution=1,
            j_resolution=1
        )
        screen_panel.texture_map_to_plane(inplace=True)

        if self.latest_camera_texture is not None:
            self.plotter.add_mesh(
                screen_panel,
                name=mesh_name,
                texture=self.latest_camera_texture,
                show_edges=False
            )
        else:
            # Zanim przyjdzie obraz z laptopa, pokazuj biały "ekran".
            self.plotter.add_mesh(screen_panel, name=mesh_name, color=(1.0, 1.0, 1.0), show_edges=False)

        self._upsert_block_state(
            block_id=self.camera_screen_block_id,
            position_xyz=self.camera_screen_position,
            scale_xyz=scale_xyz,
            color_rgb=(1.0, 1.0, 1.0),
            mesh_name=mesh_name
        )

    def laptop_image_callback(self, msg):
        """Aktualizuje teksturę bloków na podstawie /laptop/camera/image_raw."""
        try:
            frame_bgr = self.bridge.imgmsg_to_cv2(msg, desired_encoding="bgr8")
        except Exception as exc:
            self.get_logger().warn(f"Nie udalo sie zdekodowac obrazu z kamery laptopa: {exc}")
            return

        if frame_bgr is None or frame_bgr.size == 0:
            return

        h, w = frame_bgr.shape[:2]
        if h <= 0 or w <= 0:
            return

        # Zachowaj proporcje obrazu przy zmniejszeniu, aby "ekran" nie był rozjechany.
        target_w = 320
        target_h = max(1, int(target_w * (h / w)))
        tex_bgr = cv2.resize(frame_bgr, (target_w, target_h), interpolation=cv2.INTER_AREA)
        tex_rgb = cv2.cvtColor(tex_bgr, cv2.COLOR_BGR2RGB)
        self.latest_camera_texture = pv.numpy_to_texture(tex_rgb)
        self.update_camera_screen_block(aspect_ratio=(w / h))

    def add_block_callback(self, msg):
        """Przyjmuje nowy blok przez Marker i dodaje go do kamery + RViz2."""
        # Oczekujemy bloku typu CUBE.
        if msg.type != Marker.CUBE:
            self.get_logger().warn("Ignoruję marker: obsługiwany jest tylko type=CUBE dla /add_block.")
            return

        # Gdy skala nie jest podana, ustaw bezpieczne domyślne 1x1x1.
        sx = msg.scale.x if msg.scale.x > 0.0 else 1.0
        sy = msg.scale.y if msg.scale.y > 0.0 else 1.0
        sz = msg.scale.z if msg.scale.z > 0.0 else 1.0
        self.add_scene_block(
            (msg.pose.position.x, msg.pose.position.y, msg.pose.position.z),
            (sx, sy, sz),
            (msg.color.r, msg.color.g, msg.color.b),
            block_id=msg.id if msg.id >= 0 else None
        )
        self.get_logger().info(
            f"Dodano blok id={msg.id} pos=({msg.pose.position.x:.2f}, {msg.pose.position.y:.2f}, {msg.pose.position.z:.2f})"
        )

    def _create_box_marker(self, marker_id, position_xyz, scale_xyz, color_rgb):
        marker = Marker()
        marker.header.frame_id = self.marker_frame_id
        marker.header.stamp = self.get_clock().now().to_msg()
        marker.ns = "virtual_scene_blocks"
        marker.id = marker_id
        marker.type = Marker.CUBE
        marker.action = Marker.ADD

        marker.pose.position.x = float(position_xyz[0])
        marker.pose.position.y = float(position_xyz[1])
        marker.pose.position.z = float(position_xyz[2])
        marker.pose.orientation.w = 1.0

        marker.scale.x = float(scale_xyz[0])
        marker.scale.y = float(scale_xyz[1])
        marker.scale.z = float(scale_xyz[2])

        marker.color.r = float(color_rgb[0])
        marker.color.g = float(color_rgb[1])
        marker.color.b = float(color_rgb[2])
        marker.color.a = 1.0
        return marker

    def publish_scene_markers(self):
        """Publikuje kolorowe bloki sceny jako MarkerArray do RViz2."""
        markers = MarkerArray()
        for block in self.scene_blocks:
            markers.markers.append(
                self._create_box_marker(
                    block["id"],
                    block["position"],
                    block["scale"],
                    block["color"]
                )
            )
        self.marker_pub.publish(markers)

    def imu_callback(self, msg):
        """Aktualizuje orientację na podstawie danych z IMU."""
        # Logika informacyjna dla użytkownika
        if not self.first_msg_received:
            self.get_logger().info("Sukces! Otrzymano pierwsze dane z IMU. Rozpoczynam publikowanie klatek wideo do ROS 2.")
            self.first_msg_received = True
            
        self.latest_quat = [
            msg.orientation.x,
            msg.orientation.y,
            msg.orientation.z,
            msg.orientation.w
        ]

    def render_and_publish(self):
        """Oblicza widok kamery, renderuje klatkę i wysyła ją do ROS."""
        # Renderuj tylko, jeśli mamy już jakiekolwiek dane z IMU
        if not self.first_msg_received:
            return

        # Próba zbudowania macierzy rotacji
        try:
            rot = R.from_quat(self.latest_quat)
        except ValueError:
            self.get_logger().warn("Otrzymano niepoprawny kwaternion z IMU.")
            rot = R.from_quat([0.0, 0.0, 0.0, 1.0])
            
        base_forward = np.array([0.0, 1.0, 0.0])
        base_up = np.array([-1.0, 0.0, 0.0])
        
        forward = rot.apply(base_forward)
        up = rot.apply(base_up)
        
        self.plotter.camera.position = (0.0, 0.0, 0.0)
        self.plotter.camera.focal_point = forward
        self.plotter.camera.up = up
        
        self.plotter.render()
        img_array = self.plotter.image
        
        if img_array is not None:
            img_msg = self.bridge.cv2_to_imgmsg(img_array, encoding="rgb8")
            img_msg.header.stamp = self.get_clock().now().to_msg()
            img_msg.header.frame_id = "xreal_camera_frame"
            
            self.image_pub.publish(img_msg)

def main(args=None):
    rclpy.init(args=args)
    node = ImuCameraNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main()