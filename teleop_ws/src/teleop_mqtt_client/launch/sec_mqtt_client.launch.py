import os
from launch import LaunchDescription
from launch.actions import SetEnvironmentVariable
from launch_ros.actions import Node

def generate_launch_description():
    # Ustawienia nazw i ścieżek
    # Używamy enklawy twist_controller, ponieważ w Twoim policy.xml 
    # tylko ona ma prawo subskrybować dowolny temat (wildcard *)
    NODE_ENCLAVE = '/teleop_policy/mqtt_client'
    
    # Nazwa pakietu w którym znajduje się skrypt (zgodnie z poprzednim launch file)
    PACKAGE_NAME = 'teleop_mqtt_client' 
    # Nazwa pliku wykonywalnego zdefiniowana w setup.py (zgodnie z poprzednim plikiem)
    EXECUTABLE_NAME = 'mqtt_client_test'

    home_dir = os.getenv('HOME')
    # Ścieżka do kluczy SROS 2
    keystore_path = os.path.join(home_dir, 'Web_Speech_remote_control/sros2_ws', 'teleop_keystore')

    return LaunchDescription([
        # === Konfiguracja Zmiennych Środowiskowych SROS 2 ===
        SetEnvironmentVariable('ROS_SECURITY_ENABLE', 'true'),
        SetEnvironmentVariable('ROS_SECURITY_STRATEGY', 'Enforce'),
        SetEnvironmentVariable('ROS_SECURITY_KEYSTORE', keystore_path),

        # === Uruchomienie Węzła ===
        Node(
            package=PACKAGE_NAME,
            executable=EXECUTABLE_NAME,
            name='mqtt_client', # Nadpisujemy nazwę węzła
            output='screen',
            
            # Przekazanie argumentów bezpieczeństwa do węzła ROS 2
            arguments=[
                '--ros-args', 
                '--enclave', NODE_ENCLAVE
            ],
        )
    ])