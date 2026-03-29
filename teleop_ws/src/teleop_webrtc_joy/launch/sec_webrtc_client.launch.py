import os
from launch import LaunchDescription
from launch.actions import SetEnvironmentVariable, DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node

def generate_launch_description():
    # === 1. KONFIGURACJA BEZPIECZEŃSTWA (SROS 2) ===
    NODE_NAME = 'teleop_bridge'
    POLICY_PREFIX = '/teleop_policy'
    
    # Ścieżka do enklawy zdefiniowanej w keystore
    enclave_full_path = f'{POLICY_PREFIX}/{NODE_NAME}'

    # Ścieżka do keystore
    home_dir = os.getenv('HOME')
    keystore_path = os.path.join(home_dir, 'Web_Speech_remote_control/sros2_ws', 'teleop_keystore')

    # === 2. ARGUMENTY UŻYTKOWNIKA (Identyczne jak w wersji niezabezpieczonej) ===
    robot_id_arg = DeclareLaunchArgument(
        'robot_id',
        default_value='g1pilot',
        description='ID robota (uzywane jako login WebRTC i czesc topicu)'
    )

    signaling_url_arg = DeclareLaunchArgument(
        'signaling_url',
        default_value='wss://rafal.tail692f2a.ts.net/ws',
        description='Adres WebSocket serwera signalingowego'
    )

    stun_arg = DeclareLaunchArgument(
        'use_google_stun',
        default_value='True',
        description='Czy uzywac serwerow STUN Google (True/False)'
    )
    linear_speed_arg = DeclareLaunchArgument(
        'linear_speed',
        default_value='0.5',
        description='Predkosc liniowa dla komend glosowych/button (forward/backward)'
    )
    angular_speed_arg = DeclareLaunchArgument(
        'angular_speed',
        default_value='0.5',
        description='Predkosc katowa dla komend glosowych/button (left/right)'
    )

    # Pobranie wartości do zmiennych
    robot_id = LaunchConfiguration('robot_id')
    signaling_url = LaunchConfiguration('signaling_url')
    use_google_stun = LaunchConfiguration('use_google_stun')
    linear_speed = LaunchConfiguration('linear_speed')
    angular_speed = LaunchConfiguration('angular_speed')

    return LaunchDescription([
        # A. Ustawienie zmiennych środowiskowych bezpieczeństwa
        SetEnvironmentVariable('ROS_SECURITY_ENABLE', 'true'),
        SetEnvironmentVariable('ROS_SECURITY_STRATEGY', 'Enforce'),
        SetEnvironmentVariable('ROS_SECURITY_KEYSTORE', keystore_path),

        # B. Rejestracja argumentów
        robot_id_arg,
        signaling_url_arg,
        stun_arg,
        linear_speed_arg,
        angular_speed_arg,

        # C. Definicja Węzła
        Node(
            package='teleop_webrtc_joy',
            executable='bridge',
            name=NODE_NAME,
            output='screen',
            emulate_tty=True,
            
            # Przekazanie parametrów konfiguracyjnych do węzła
            parameters=[{
                'robot_id': robot_id,
                'signaling_url': signaling_url,
                'use_google_stun': use_google_stun,
                'linear_speed': linear_speed,
                'angular_speed': angular_speed
            }],

            # Argumenty dla ROS 2 Security (wskazanie enklawy)
            arguments=[
                '--ros-args', 
                '--enclave', enclave_full_path
            ]
        )
    ])