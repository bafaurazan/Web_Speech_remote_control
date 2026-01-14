from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch.conditions import IfCondition
from launch_ros.actions import Node

def generate_launch_description():
    debug_arg = DeclareLaunchArgument(
        'debug',
        default_value='false',
        description='Czy uruchomic wezel debugujacy cmd_vel_sub (true/false)'
    )

    use_debug = LaunchConfiguration('debug')

    return LaunchDescription([
        debug_arg,

        Node(
            package='teleop_twist_joy',
            executable='teleop_node',
            name='teleop_twist_joy_node',
            output='screen',
            remappings=[
                ('/joy', '/g1pilot/joy'),
            ],
            parameters=[{
                'axis_linear.x': 1,
                'scale_linear.x': -1.0,
                'axis_angular.yaw': 2,
                'scale_angular.yaw': -1.0,
                'require_enable_button': False,
            }]
        ),
        
        Node(
            package='teleop_joy_cmd',
            executable='cmd_vel_sub',
            name="teleop_twist_joy_node",
            output='screen',
            condition=IfCondition(use_debug)
        )
    ])