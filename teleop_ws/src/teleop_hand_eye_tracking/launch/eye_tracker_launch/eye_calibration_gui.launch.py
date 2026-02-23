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
        # --- 1. KAMERA OAK-D ---
        IncludeLaunchDescription(
            PythonLaunchDescriptionSource(depthai_launch_file),
        ),

        # --- 2. EYE TRACKER (Detekcja twarzy i oczu) ---
        # Ten węzeł wyświetli małe okno z podglądem kamery
        Node(
            package='teleop_hand_eye_tracking',
            executable='eye_tracker',
            name='eye_tracker_node',
            output='screen',
            emulate_tty=True
        ),

        # --- 3. KALIBRATOR (GUI na pełny ekran) ---
        # Ten węzeł uruchomi się, wyświetli instrukcję i POCZEKA NA SPACJĘ
        Node(
            package='teleop_hand_eye_tracking',
            executable='eye_tracker_calibration_gui', # Upewnij się, że tak nazwałeś entry point w setup.py!
            name='eye_tracker_calibration_gui_node',
            output='screen',
            emulate_tty=True
        ),
    ])