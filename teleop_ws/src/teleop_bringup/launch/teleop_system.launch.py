import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription, LogInfo
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration
from launch.conditions import IfCondition, UnlessCondition

def generate_launch_description():
    security_arg = DeclareLaunchArgument(
        'security',
        default_value='false',
        description='Czy uruchomic wersje zaszyfrowana SROS2 (true/false)'
    )

    debug_arg = DeclareLaunchArgument(
        'debug',
        default_value='false',
        description='Czy uruchomic wezly debugujace (np. cmd_vel_sub)'
    )

    robot_id_arg = DeclareLaunchArgument(
        'robot_id',
        default_value='g1pilot',
        description='ID robota przekazywane do webrtc_client'
    )
    
    stun_arg = DeclareLaunchArgument(
        'use_google_stun',
        default_value='True',
        description='Konfiguracja STUN dla webrtc_client'
    )

    use_security = LaunchConfiguration('security')
    use_debug = LaunchConfiguration('debug')
    robot_id = LaunchConfiguration('robot_id')
    use_google_stun = LaunchConfiguration('use_google_stun')

    pkg_webrtc = get_package_share_directory('teleop_webrtc_joy')
    pkg_joy = get_package_share_directory('teleop_joy_cmd')
    pkg_unity = get_package_share_directory('teleop_cmd_unity')

    launch_webrtc_std = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(os.path.join(pkg_webrtc, 'launch', 'webrtc_client.launch.py')),
        condition=UnlessCondition(use_security),
        launch_arguments={
            'robot_id': robot_id, 
            'use_google_stun': use_google_stun
        }.items()
    )

    launch_joy_std = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(os.path.join(pkg_joy, 'launch', 'joy_cmd_g1.launch.py')),
        condition=UnlessCondition(use_security),
        launch_arguments={
            'debug': use_debug
        }.items()
    )

    launch_unity_std = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(os.path.join(pkg_unity, 'launch', 'unity_sim_wheel.launch.py')),
        condition=UnlessCondition(use_security)
    )

    launch_webrtc_sec = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(os.path.join(pkg_webrtc, 'launch', 'sec_webrtc_client.launch.py')),
        condition=IfCondition(use_security),
        launch_arguments={
            'robot_id': robot_id, 
            'use_google_stun': use_google_stun
        }.items()
    )

    launch_joy_sec = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(os.path.join(pkg_joy, 'launch', 'sec_joy_cmd_g1.launch.py')),
        condition=IfCondition(use_security),
        launch_arguments={
            'debug': use_debug
        }.items()
    )

    launch_unity_sec = IncludeLaunchDescription(
        PythonLaunchDescriptionSource(os.path.join(pkg_unity, 'launch', 'sec_unity_sim_wheel.launch.py')),
        condition=IfCondition(use_security)
    )

    return LaunchDescription([
        security_arg,
        debug_arg,
        robot_id_arg,
        stun_arg,
        
        LogInfo(msg=["Uruchamianie systemu. Security: ", use_security, " | Debug: ", use_debug]),

        launch_webrtc_std,
        launch_joy_std,
        launch_unity_std,

        launch_webrtc_sec,
        launch_joy_sec,
        launch_unity_sec,
    ])