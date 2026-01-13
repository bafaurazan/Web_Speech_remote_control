import os
from launch import LaunchDescription
from launch_ros.actions import Node
from launch.actions import DeclareLaunchArgument, OpaqueFunction
from launch.substitutions import LaunchConfiguration
from ament_index_python.packages import get_package_share_path

def get_yaml_params(name: str) -> str:
    return str(
        get_package_share_path("knml_wheels") / "config" / f"{name}.yaml"
    )

def get_yaml_params_teleop(name: str) -> str:
    return str(
        get_package_share_path("teleop_cmd_unity") / "config" / f"{name}.yaml"
    )

def launch_setup(context):
    joy = LaunchConfiguration("joy").perform(context).lower()
    
    home_dir = os.getenv('HOME')
    keystore_path = os.path.join(home_dir, 'Web_Speech_remote_control/sros2_ws', 'teleop_keystore')
    POLICY_PREFIX = '/teleop_policy' 
    NODE_ENCLAVE = f'{POLICY_PREFIX}/twist_controller'

    # === 1. ŚRODOWISKO ZABEZPIECZONE (tylko dla twist_controller) ===
    secure_env = os.environ.copy()
    secure_env['ROS_SECURITY_ENABLE'] = 'true'
    secure_env['ROS_SECURITY_STRATEGY'] = 'Enforce'
    secure_env['ROS_SECURITY_KEYSTORE'] = keystore_path

    # === 2. ŚRODOWISKO NIEZABEZPIECZONE (nadpisuje ustawienia globalne) ===
    unsecure_env = os.environ.copy()
    unsecure_env['ROS_SECURITY_ENABLE'] = 'false'
    unsecure_env['ROS_SECURITY_STRATEGY'] = 'Permissive'
    # Usuwamy ścieżkę keystore, żeby ROS nie próbował szukać kluczy
    if 'ROS_SECURITY_KEYSTORE' in unsecure_env:
        del unsecure_env['ROS_SECURITY_KEYSTORE']

    if joy != '' and joy != 'gamepad' and joy != 'arduino':
        raise RuntimeError("Invalid joy. Choose 'gamepad' or 'arduino'.")

    description = []

    # --- Węzeł Szyfrowany ---
    twist_controller_node = Node(
        package="teleop_cmd_unity",
        executable="twist_controller",
        name="twist_controller", 
        parameters=[get_yaml_params_teleop("twist_controller")],
        
        # Używamy środowiska włączającego security
        env=secure_env,
        
        arguments=[
            '--ros-args', 
            '--enclave', NODE_ENCLAVE
        ],
        output='screen'
    )
    description.append(twist_controller_node)

    # --- Węzeł Nieszyfrowany ---
    drive_controller_node = Node(
        package="knml_wheels",
        executable="drive_controller",
        parameters=[get_yaml_params("drive_controller")],
        
        # WYMUSZAMY brak security (naprawia błąd dziedziczenia)
        env=unsecure_env,
        
        output='screen'
    )
    description.append(drive_controller_node)

    if joy == 'gamepad':
        description += [
            Node(
                package="joy_linux",
                executable="joy_linux_node",
                parameters=[{"dev_name": "Logitech Gamepad"}],
                env=unsecure_env  # Też bez szyfrowania
            ),
            Node(
                package="knml_wheels",
                executable="gamepad_driving",
                parameters=[get_yaml_params("gamepad_driving")],
                env=unsecure_env  # Też bez szyfrowania
            )
        ]
    elif joy == 'arduino':
        description += [
            Node(
                package="joy_linux",
                executable="joy_linux_node",
                parameters=[{"dev_name": "Arduino LLC Arduino Leonardo"}],
                env=unsecure_env
            ),
            Node(
                package="knml_wheels",
                executable="arduino_driving",
                parameters=[get_yaml_params("arduino_driving")],
                env=unsecure_env
            )
        ]

    return description

def generate_launch_description():
    return LaunchDescription(
        [
            DeclareLaunchArgument(
                "joy",
                default_value="",
                choices=["", "gamepad", "arduino"],
                description="Joy device to use for headless driving.",
            ),
            OpaqueFunction(function=launch_setup),
        ]
    )