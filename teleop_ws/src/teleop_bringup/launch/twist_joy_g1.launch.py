from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    return LaunchDescription([
        Node(
            package='teleop_twist_joy',
            executable='teleop_node',
            name='teleop_twist_joy_node',
            output='screen',
            # Remapowanie tematu wejściowego
            remappings=[
                ('/joy', '/g1pilot/joy'),
                # Opcjonalnie: odkomentuj poniższą linię, jeśli musisz zmienić wyjście cmd_vel
                # ('/cmd_vel', '/g1pilot/cmd_vel'),
            ],
            # Parametry konfiguracyjne
            parameters=[{
                'axis_linear.x': 1,
                'scale_linear.x': -1.0,  # Odwrócona oś (minus)
                'axis_angular.yaw': 2,   # Twoja nowa oś skrętu
                'scale_angular.yaw': -1.0, # Odwrócona oś skrętu
                'require_enable_button': False,
            }]
            #topic sub /g1pilot/joy 
            #topic pub /cmd_vel
        )
    ])