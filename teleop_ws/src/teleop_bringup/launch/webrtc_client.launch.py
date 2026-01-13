from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    return LaunchDescription([
        Node(
            package='teleop_bringup',
            executable='bridge',
            name='teleop_bridge',
            output='screen',
            #topic pub /g1pilot/joy
        )
    ])