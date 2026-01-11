import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource

def generate_launch_description():
    unity_sim_pkg_dir = get_package_share_directory('unity_sim')

    unity_launch_path = os.path.join(unity_sim_pkg_dir, 'launch', 'unity_sim.launch.py')

    return LaunchDescription([
        IncludeLaunchDescription(
            PythonLaunchDescriptionSource(unity_launch_path)
        )
    ])