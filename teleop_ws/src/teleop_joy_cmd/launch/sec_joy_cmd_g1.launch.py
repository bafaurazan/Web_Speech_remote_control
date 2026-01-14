import os
from launch import LaunchDescription
from launch.actions import SetEnvironmentVariable, DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch.conditions import IfCondition
from launch_ros.actions import Node

def generate_launch_description():
    NODE_NAME = 'teleop_twist_joy_node'
    POLICY_PREFIX = '/teleop_policy'
    
    enclave_full_path = f'{POLICY_PREFIX}/{NODE_NAME}'

    home_dir = os.getenv('HOME')
    keystore_path = os.path.join(home_dir, 'Web_Speech_remote_control/sros2_ws', 'teleop_keystore')

    debug_arg = DeclareLaunchArgument(
        'debug',
        default_value='false',
        description='Czy uruchomic wezel debugujacy cmd_vel_sub (true/false)'
    )

    use_debug = LaunchConfiguration('debug')

    return LaunchDescription([
        SetEnvironmentVariable('ROS_SECURITY_ENABLE', 'true'),
        SetEnvironmentVariable('ROS_SECURITY_STRATEGY', 'Enforce'),
        SetEnvironmentVariable('ROS_SECURITY_KEYSTORE', keystore_path),

        debug_arg,
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
        ),
        Node(
            package='teleop_joy_cmd',
            executable='cmd_vel_sub',
            
            name=NODE_NAME,
            
            output='screen',
            
            condition=IfCondition(use_debug),

            arguments=[
                '--ros-args', 
                '--enclave', enclave_full_path
            ],
        )
    ])