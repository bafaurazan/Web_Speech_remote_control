import os
from launch import LaunchDescription
from launch_ros.actions import Node
from launch.actions import DeclareLaunchArgument, OpaqueFunction, SetEnvironmentVariable
from launch.substitutions import LaunchConfiguration
from ament_index_python.packages import get_package_share_path

def get_yaml_params(name: str) -> str:
    # Zakładamy, że configi są w tym samym pakiecie 'knml_wheels'
    return str(
        get_package_share_path("knml_wheels") / "config" / f"{name}.yaml"
    )

def launch_setup(context):
    joy = LaunchConfiguration("joy").perform(context).lower()
    
    # === KONFIGURACJA ENKLAWY DLA twist_controller ===
    # Tutaj definiujesz ścieżkę do enklawy w Twoim keystore
    POLICY_PREFIX = '/teleop_policy' 
    NODE_ENCLAVE = f'{POLICY_PREFIX}/twist_controller'

    if joy != '' and joy != 'gamepad' and joy != 'arduino':
        raise RuntimeError("Invalid joy. Choose 'gamepad' or 'arduino'.")

    # Węzeł twist_controller - ZABEZPIECZONY
    twist_controller_node = Node(
        package="knml_wheels",
        executable="twist_controller",
        name="twist_controller", # Ważne: jawna nazwa węzła
        parameters=[get_yaml_params("twist_controller")],
        arguments=[
            '--ros-args', 
            '--enclave', NODE_ENCLAVE
        ],
        output='screen'
    )

    # Pozostałe węzły (niezabezpieczone enklawą, chyba że dodasz im argumenty)
    drive_controller_node = Node(
        package="knml_wheels",
        executable="drive_controller",
        parameters=[get_yaml_params("drive_controller")],
    )

    description = [twist_controller_node, drive_controller_node]

    # Logika Joy (bez zmian)
    if joy == 'gamepad':
        description += [
            Node(
                package="joy_linux",
                executable="joy_linux_node",
                parameters=[{"dev_name": "Logitech Gamepad"}],
            ),
            Node(
                package="knml_wheels",
                executable="gamepad_driving",
                parameters=[get_yaml_params("gamepad_driving")],
            )
        ]
    elif joy == 'arduino':
        description += [
            Node(
                package="joy_linux",
                executable="joy_linux_node",
                parameters=[{"dev_name": "Arduino LLC Arduino Leonardo"}],
            ),
            Node(
                package="knml_wheels",
                executable="arduino_driving",
                parameters=[get_yaml_params("arduino_driving")],
            )
        ]

    return description

def generate_launch_description():
    # Ścieżka do Twojego keystore (dostosuj jeśli inna)
    home_dir = os.getenv('HOME')
    keystore_path = os.path.join(home_dir, 'Web_Speech_remote_control/sros2_ws', 'teleop_keystore')

    return LaunchDescription(
        [
            # === ZMIENNE ŚRODOWISKOWE SROS2 ===
            # Ustawiamy je globalnie dla tego procesu launch,
            # więc twist_controller je "zobaczy".
            SetEnvironmentVariable('ROS_SECURITY_ENABLE', 'true'),
            SetEnvironmentVariable('ROS_SECURITY_STRATEGY', 'Enforce'),
            SetEnvironmentVariable('ROS_SECURITY_KEYSTORE', keystore_path),

            DeclareLaunchArgument(
                "joy",
                default_value="",
                choices=["", "gamepad", "arduino"],
                description="Joy device to use.",
            ),
            OpaqueFunction(function=launch_setup),
        ]
    )