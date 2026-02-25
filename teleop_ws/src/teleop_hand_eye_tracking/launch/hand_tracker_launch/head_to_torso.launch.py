from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    kp = LaunchConfiguration("kp")
    kd = LaunchConfiguration("kd")
    max_angular_vel = LaunchConfiguration("max_angular_vel")
    deadzone_rad = LaunchConfiguration("deadzone_rad")
    waist_max_range_rad = LaunchConfiguration("waist_max_range_rad")
    xreal_imu_topic = LaunchConfiguration("xreal_imu_topic")
    joint_states_topic = LaunchConfiguration("joint_states_topic")
    waist_joint_name = LaunchConfiguration("waist_joint_name")
    cmd_vel_topic = LaunchConfiguration("cmd_vel_topic")

    return LaunchDescription(
        [
            DeclareLaunchArgument("kp", default_value="0.5", description="Proportional gain"),
            DeclareLaunchArgument("kd", default_value="0.1", description="Derivative gain"),
            DeclareLaunchArgument(
                "max_angular_vel",
                default_value="1.0",
                description="Maximum angular velocity [rad/s]",
            ),
            DeclareLaunchArgument(
                "deadzone_rad",
                default_value="0.05",
                description="Deadzone [rad] (~3°)",
            ),
            DeclareLaunchArgument(
                "waist_max_range_rad",
                default_value="0.785",
                description="Maximum waist range [rad] (±45°)",
            ),
            DeclareLaunchArgument(
                "xreal_imu_topic",
                default_value="/xreal/imu/data",
                description="XREAL IMU topic",
            ),
            DeclareLaunchArgument(
                "joint_states_topic",
                default_value="/joint_states",
                description="Joint states topic",
            ),
            DeclareLaunchArgument(
                "waist_joint_name",
                default_value="waist_yaw_joint",
                description="Name of waist yaw joint",
            ),
            DeclareLaunchArgument(
                "cmd_vel_topic",
                default_value="/cmd_vel",
                description="Output cmd_vel topic",
            ),
            Node(
                package="teleop_hand_eye_tracking",
                executable="head_to_torso_controller",
                name="head_to_torso_controller",
                output="screen",
                parameters=[
                    {"kp": kp},
                    {"kd": kd},
                    {"max_angular_vel": max_angular_vel},
                    {"deadzone_rad": deadzone_rad},
                    {"waist_max_range_rad": waist_max_range_rad},
                    {"xreal_imu_topic": xreal_imu_topic},
                    {"joint_states_topic": joint_states_topic},
                    {"waist_joint_name": waist_joint_name},
                    {"cmd_vel_topic": cmd_vel_topic},
                ],
            ),
        ]
    )
