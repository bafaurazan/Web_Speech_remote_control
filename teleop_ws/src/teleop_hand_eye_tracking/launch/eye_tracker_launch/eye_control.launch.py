import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch_ros.actions import Node

def generate_launch_description():
    # 1. Znajdź ścieżkę do launch file kamery OAK-D
    depthai_prefix = get_package_share_directory('teleop_hand_eye_tracking')
    depthai_launch_file = os.path.join(depthai_prefix, 'launch', 'camera.launch.py')

    return LaunchDescription([
        # --- URUCHOMIENIE KAMERY ---
        IncludeLaunchDescription(
            PythonLaunchDescriptionSource(depthai_launch_file),
            # Opcjonalnie: Możesz tu przekazać argumenty do kamery, np. rozdzielczość
            # launch_arguments={'params_file': 'sciezka/do/params.yaml'}.items(),
        ),

        # --- WĘZEŁ ŚLEDZENIA OCZU (Eye Tracker) ---
        Node(
            package='teleop_hand_eye_tracking',
            executable='eye_tracker',
            name='eye_tracker_node',
            output='screen',
            # Emulacja terminala jest potrzebna, jeśli używasz cv2.imshow
            emulate_tty=True
        ),

        # --- WĘZEŁ STEROWANIA MYSZKĄ (eye_tracker Controller) ---
        Node(
            package='teleop_hand_eye_tracking',
            executable='eye_tracker_controller',
            name='eye_tracker_controller_node',
            output='screen',
            emulate_tty=True
        ),
    ])