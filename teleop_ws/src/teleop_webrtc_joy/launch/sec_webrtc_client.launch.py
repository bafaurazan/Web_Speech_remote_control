import os
from launch import LaunchDescription
from launch.actions import SetEnvironmentVariable
from launch_ros.actions import Node

def generate_launch_description():
    NODE_NAME = 'teleop_bridge'
    POLICY_PREFIX = '/teleop_policy'
    
    enclave_full_path = f'{POLICY_PREFIX}/{NODE_NAME}'

    home_dir = os.getenv('HOME')
    keystore_path = os.path.join(home_dir, 'Web_Speech_remote_control/sros2_ws', 'teleop_keystore')

    return LaunchDescription([
        SetEnvironmentVariable('ROS_SECURITY_ENABLE', 'true'),
        SetEnvironmentVariable('ROS_SECURITY_STRATEGY', 'Enforce'),
        SetEnvironmentVariable('ROS_SECURITY_KEYSTORE', keystore_path),

        Node(
            package='teleop_webrtc_joy',
            executable='bridge',
            
            name=NODE_NAME,
            
            output='screen',
            
            arguments=[
                '--ros-args', 
                '--enclave', enclave_full_path
            ]
        )
    ])