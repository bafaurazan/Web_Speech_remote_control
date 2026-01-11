import os
from launch import LaunchDescription
from launch.actions import SetEnvironmentVariable
from launch_ros.actions import Node

def generate_launch_description():
    NODE_NAME = 'teleop_twist_joy_node'
    POLICY_PREFIX = '/teleop_policy'
    
    enclave_full_path = f'{POLICY_PREFIX}/{NODE_NAME}'

    home_dir = os.getenv('HOME')
    keystore_path = os.path.join(home_dir, 'Web_Speech_remote_control/sros2_ws', 'teleop_keystore')

    return LaunchDescription([
        SetEnvironmentVariable('ROS_SECURITY_ENABLE', 'true'),
        SetEnvironmentVariable('ROS_SECURITY_STRATEGY', 'Enforce'),
        SetEnvironmentVariable('ROS_SECURITY_KEYSTORE', keystore_path),

        Node(
            package='teleop_twist_joy',
            executable='teleop_node',
            
            name=NODE_NAME,
            
            output='screen',
            
            arguments=[
                '--ros-args', 
                '--enclave', enclave_full_path
            ],

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
        )
    ])