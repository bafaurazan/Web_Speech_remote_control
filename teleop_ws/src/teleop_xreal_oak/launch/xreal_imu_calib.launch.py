import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    ip = LaunchConfiguration("ip")
    port = LaunchConfiguration("port")
    calib_duration_s = LaunchConfiguration("calib_duration_s")
    gyro_bias_calib_max_speed = LaunchConfiguration("gyro_bias_calib_max_speed")
    bias_file = LaunchConfiguration("bias_file")

    default_bias_path = os.path.join(
        get_package_share_directory("teleop_xreal_oak"),
        "config",
        "xreal_imu_bias.json",
    )

    return LaunchDescription(
        [
            DeclareLaunchArgument("ip", default_value="169.254.2.1"),
            DeclareLaunchArgument("port", default_value="52998"),
            DeclareLaunchArgument(
                "calib_duration_s",
                default_value="15.0",
                description="Calibration duration in seconds (keep head still)",
            ),
            DeclareLaunchArgument(
                "gyro_bias_calib_max_speed",
                default_value="0.05",
                description="Max angular speed [rad/s] treated as 'still' during calibration",
            ),
            DeclareLaunchArgument(
                "bias_file",
                default_value=default_bias_path,
                description="Path to JSON file where gyro bias will be saved",
            ),
            Node(
                package="teleop_xreal_oak",
                executable="xreal_imu_calib",
                name="xreal_imu_calib",
                output="screen",
                parameters=[
                    {
                        "ip": ip,
                        "port": port,
                        "calib_duration_s": calib_duration_s,
                        "gyro_bias_calib_max_speed": gyro_bias_calib_max_speed,
                        "bias_file": bias_file,
                    }
                ],
            ),
        ]
    )

