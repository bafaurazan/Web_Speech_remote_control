import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import SetEnvironmentVariable
from launch_ros.actions import Node

def generate_launch_description():
    NODE_ENCLAVE = '/teleop_policy/mqtt_client'

    home_dir = os.getenv('HOME')
    keystore_path = os.path.join(home_dir, 'Web_Speech_remote_control/sros2_ws', 'teleop_keystore')

    pkg_share = get_package_share_directory('teleop_mqtt_client')
    params_file_path = os.path.join(pkg_share, 'config', 'sec_params.primitive.yaml')

    return LaunchDescription([
        SetEnvironmentVariable('ROS_SECURITY_ENABLE', 'true'),
        SetEnvironmentVariable('ROS_SECURITY_STRATEGY', 'Enforce'),
        SetEnvironmentVariable('ROS_SECURITY_KEYSTORE', keystore_path),

        Node(
            package='teleop_mqtt_client',
            executable='mqtt_client_test',
            name='mqtt_client', 
            output='screen',
            
            arguments=[
                '--ros-args', 
                '--enclave', NODE_ENCLAVE
            ],
        ),
        Node(
            package='mqtt_client',
            executable='mqtt_client',
            name='mqtt_client', 
            output='screen',
            parameters=[params_file_path],
            arguments=[
                '--ros-args', 
                '--enclave', NODE_ENCLAVE
            ],
        ),
    ])