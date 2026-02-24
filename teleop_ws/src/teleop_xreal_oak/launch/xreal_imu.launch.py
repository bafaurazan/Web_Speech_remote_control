from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    # XREAL TCP
    ip = LaunchConfiguration("ip")
    port = LaunchConfiguration("port")
    frame_id = LaunchConfiguration("frame_id")

    # Units
    gyro_in_degs = LaunchConfiguration("gyro_in_degs")
    accel_in_g = LaunchConfiguration("accel_in_g")
    gyro_scale = LaunchConfiguration("gyro_scale")
    accel_scale = LaunchConfiguration("accel_scale")
    gyro_bias_calib_samples = LaunchConfiguration("gyro_bias_calib_samples")

    # Topics
    raw_topic = LaunchConfiguration("raw_topic")
    out_topic = LaunchConfiguration("out_topic")

    return LaunchDescription(
        [
            DeclareLaunchArgument("ip", default_value="169.254.2.1"),
            DeclareLaunchArgument("port", default_value="52998"),
            DeclareLaunchArgument("frame_id", default_value="xreal_imu"),
            DeclareLaunchArgument("gyro_in_degs", default_value="true"),
            DeclareLaunchArgument("accel_in_g", default_value="true"),
            DeclareLaunchArgument("gyro_scale", default_value="1.0"),
            DeclareLaunchArgument("accel_scale", default_value="1.0"),
            DeclareLaunchArgument("gyro_bias_calib_samples", default_value="500"),
            DeclareLaunchArgument("raw_topic", default_value="/xreal/imu/data_raw"),
            DeclareLaunchArgument("out_topic", default_value="/xreal/imu/data"),

            # Raw IMU publisher
            Node(
                package="teleop_xreal_oak",
                executable="xreal_imu",
                name="xreal_imu",
                output="screen",
                parameters=[
                    {
                        "ip": ip,
                        "port": port,
                        "frame_id": frame_id,
                        "gyro_in_degs": gyro_in_degs,
                        "accel_in_g": accel_in_g,
                        "gyro_scale": gyro_scale,
                        "accel_scale": accel_scale,
                        "gyro_bias_calib_samples": gyro_bias_calib_samples,
                    }
                ],
                remappings=[
                    ("xreal/imu/data_raw", raw_topic),
                ],
            ),

            # Madgwick filter (orientation)
            Node(
                package="imu_filter_madgwick",
                executable="imu_filter_madgwick_node",
                name="imu_filter_madgwick",
                output="screen",
                parameters=[
                    # Minimal set: no magnetometer, no TF publishing by default.
                    {"use_mag": False, "publish_tf": False}
                ],
                remappings=[
                    ("/imu/data_raw", raw_topic),
                    ("/imu/data", out_topic),
                ],
            ),
        ]
    )

