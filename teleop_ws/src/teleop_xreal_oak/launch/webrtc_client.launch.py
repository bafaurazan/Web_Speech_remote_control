from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node

def generate_launch_description():
    # 1. Deklaracja argumentów z wartościami domyślnymi
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

    # 2. Pobranie konfiguracji do zmiennych
    robot_id = LaunchConfiguration('robot_id')
    signaling_url = LaunchConfiguration('signaling_url')
    use_google_stun = LaunchConfiguration('use_google_stun')

    return LaunchDescription([
        robot_id_arg,
        signaling_url_arg,
        stun_arg,

        Node(
            package='teleop_webrtc_joy',
            executable='bridge',
            name='teleop_bridge',
            output='screen',
            emulate_tty=True,
            
            # Przekazujemy wszystkie argumenty jako parametry ROS
            parameters=[{
                'robot_id': robot_id,
                'signaling_url': signaling_url,
                'use_google_stun': use_google_stun
            }]
            # UWAGA: Sekcja 'env' została usunięta, bo już nie jest potrzebna!
        )
    ])