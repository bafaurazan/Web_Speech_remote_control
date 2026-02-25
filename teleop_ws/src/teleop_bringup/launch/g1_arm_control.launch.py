import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    pkg_hand = get_package_share_directory("teleop_hand_eye_tracking")
    pkg_oak = get_package_share_directory("teleop_xreal_oak")

    manipulation_launch_file = os.path.join(
        pkg_hand, "launch", "hand_tracker_launch", "hand_control_gui.launch.py"
    )
    head_to_torso_launch_file = os.path.join(
        pkg_hand, "launch", "hand_tracker_launch", "head_to_torso.launch.py"
    )
    camera_launch_file = os.path.join(pkg_oak, "launch", "camera.launch.py")
    xreal_imu_launch_file = os.path.join(pkg_oak, "launch", "xreal_imu.launch.py")

    camera_parent_frame = LaunchConfiguration("camera_parent_frame")
    camera_base_frame = LaunchConfiguration("camera_base_frame")
    use_sim_time = LaunchConfiguration("use_sim_time")
    interface = LaunchConfiguration("interface")
    use_robot = LaunchConfiguration("use_robot")
    publish_joint_states = LaunchConfiguration("publish_joint_states")
    sim_rate_hz = LaunchConfiguration("sim_rate_hz")

    return LaunchDescription(
        [
            DeclareLaunchArgument("use_sim_time", default_value="false"),
            DeclareLaunchArgument("interface", default_value="eno1"),
            DeclareLaunchArgument("use_robot", default_value="false"),
            DeclareLaunchArgument("publish_joint_states", default_value="false"),
            DeclareLaunchArgument("sim_rate_hz", default_value="50.0"),
            DeclareLaunchArgument(
                "camera_parent_frame",
                default_value="torso_link",
                description="Rama robota dla kamery (torso_link = na głowie jak d435)",
            ),
            DeclareLaunchArgument(
                "camera_base_frame",
                default_value="oak-d-base-frame",
                description="Frame OAK do podpięcia",
            ),

            # Kamera (model OAK na /oak/robot_description)
            IncludeLaunchDescription(
                PythonLaunchDescriptionSource(camera_launch_file),
            ),
            # Robot + RViz (G1 na /robot_description)
            IncludeLaunchDescription(
                PythonLaunchDescriptionSource(manipulation_launch_file),
                launch_arguments={
                    "use_sim_time": use_sim_time,
                    "interface": interface,
                    "use_robot": use_robot,
                    "publish_joint_states": publish_joint_states,
                    "sim_rate_hz": sim_rate_hz,
                }.items(),
            ),
            # IMU z okularów XREAL (domyślnie disabled, czeka na service /enable_imu)
            IncludeLaunchDescription(
                PythonLaunchDescriptionSource(xreal_imu_launch_file),
            ),
            # Sterowanie tułowiem z IMU głowy (domyślnie disabled, czeka na service /enable_head_to_torso)
            IncludeLaunchDescription(
                PythonLaunchDescriptionSource(head_to_torso_launch_file),
            ),
            # OAK na głowie: ta sama pozycja i pochylenie co RealSense d435 w 29dof.urdf
            # (d435_joint: xyz="0.0576235 0.01753 0.42987" rpy="0 0.83077 0")
            # static_transform_publisher: x y z yaw pitch roll parent child
            Node(
                package="tf2_ros",
                executable="static_transform_publisher",
                name="robot_to_oak_tf",
                arguments=[
                    "0.0576235",
                    "0.01753",
                    "0.42987",
                    "0",
                    "0.8307767239493009",
                    "0",
                    camera_parent_frame,
                    camera_base_frame,
                ],
            ),
        ]
    )

