import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription, DeclareLaunchArgument
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    # 1. Znajdź ścieżkę do launch file kamery OAK-D
    depthai_prefix = get_package_share_directory("depthai_ros_driver")
    depthai_launch_file = os.path.join(depthai_prefix, "launch", "camera.launch.py")

    # Konfigurowalne ramy TF – żeby połączyć drzewo kamery z drzewem robota.
    # parent_frame: rama z URDF G1 (np. 'pelvis' albo 'mrbeam_link')
    # camera_frame: rama publikowana przez depthai_ros_driver (np. 'oak_rgb_camera_optical_frame')
    camera_parent_frame = LaunchConfiguration("camera_parent_frame")
    camera_frame = LaunchConfiguration("camera_frame")

    return LaunchDescription(
        [
            # --- Argumenty, żeby można było łatwo zmienić w launchu ---
            DeclareLaunchArgument(
                "camera_parent_frame",
                default_value="pelvis",
                description="Rama robota, do której podwieszamy kamerę OAK-D",
            ),
            DeclareLaunchArgument(
                "camera_frame",
                default_value="oak_rgb_camera_optical_frame",
                description="Rama TF generowana przez depthai_ros_driver dla kamery RGB",
            ),

            # --- URUCHOMIENIE KAMERY ---
            IncludeLaunchDescription(
                PythonLaunchDescriptionSource(depthai_launch_file),
                # Możesz tu w razie potrzeby dodać launch_arguments do kamery
            ),

            # --- STATIC TF: robot -> kamera ---
            # Składnia: x y z roll pitch yaw frame_id child_frame_id
            Node(
                package="tf2_ros",
                executable="static_transform_publisher",
                name="oak_to_robot_tf",
                arguments=[
                    "0.10",  # x: 10 cm przed robotem
                    "0.00",  # y
                    "0.15",  # z: 15 cm nad ramą parent_frame
                    "0.0",
                    "0.0",
                    "0.0",
                    camera_parent_frame,
                    camera_frame,
                ],
            ),

            # --- WĘZEŁ ŚLEDZENIA RĄK (Hand Tracker) ---
            Node(
                package="teleop_hand_eye_tracking",
                executable="hand_tracker",
                name="hand_tracker_node",
                output="screen",
                emulate_tty=True,  # potrzebne dla cv2.imshow
            ),

            # --- WĘZEŁ STEROWANIA MYSZKĄ (hand_tracker Controller) ---
            # Node(
            #     package='teleop_hand_eye_tracking',
            #     executable='hand_tracker_controller',
            #     name='hand_tracker_controller_node',
            #     output='screen',
            #     emulate_tty=True
            # ),
        ]
    )