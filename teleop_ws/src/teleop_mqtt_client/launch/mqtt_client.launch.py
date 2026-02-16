import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import SetEnvironmentVariable
from launch_ros.actions import Node

def generate_launch_description():

    pkg_share = get_package_share_directory('teleop_mqtt_client')
    params_file_path = os.path.join(pkg_share, 'config', 'params.primitive.yaml')

    return LaunchDescription([

        Node(
            package='teleop_mqtt_client',
            executable='mqtt_client_test',
            name='mqtt_client', 
            output='screen',
        ),
        Node(
            package='mqtt_client',
            executable='mqtt_client',
            name='mqtt_client', 
            output='screen',
            parameters=[params_file_path],
        ),
    ])