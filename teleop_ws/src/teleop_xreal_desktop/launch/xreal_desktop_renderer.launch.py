from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    imu_topic = LaunchConfiguration("imu_topic")
    fullscreen = LaunchConfiguration("fullscreen")
    disable_vsync = LaunchConfiguration("disable_vsync")
    window_width = LaunchConfiguration("window_width")
    window_height = LaunchConfiguration("window_height")
    capture_fps = LaunchConfiguration("capture_fps")

    return LaunchDescription([
        DeclareLaunchArgument("imu_topic", default_value="/xreal/imu/data"),
        DeclareLaunchArgument("fullscreen", default_value="false"),
        DeclareLaunchArgument("disable_vsync", default_value="true"),
        DeclareLaunchArgument("window_width", default_value="1920"),
        DeclareLaunchArgument("window_height", default_value="1080"),
        DeclareLaunchArgument("capture_fps", default_value="60.0"),
        Node(
            package="teleop_xreal_desktop",
            executable="xreal_desktop_renderer",
            name="xreal_desktop_renderer",
            output="screen",
            parameters=[{
                "imu_topic": imu_topic,
                "fullscreen": fullscreen,
                "disable_vsync": disable_vsync,
                "window_width": window_width,
                "window_height": window_height,
                "capture_fps": capture_fps,
            }],
        ),
    ])
