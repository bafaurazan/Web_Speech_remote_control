from launch_ros.actions import Node
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration
from launch_ros.parameter_descriptions import ParameterValue
import os

package_name = "g1pilot"
urdf_file_name = "29dof.urdf"
rviz_config_file_name = "29dof.rviz"

def generate_launch_description():
    use_sim_time = LaunchConfiguration("use_sim_time")
    use_robot = LaunchConfiguration("use_robot")
    publish_joint_states = LaunchConfiguration("publish_joint_states")
    interface = LaunchConfiguration("interface")
    sim_rate_hz = LaunchConfiguration("sim_rate_hz")
    arm_controlled = LaunchConfiguration("arm_controlled")
    enable_arm_ui = LaunchConfiguration("enable_arm_ui")
    ik_use_waist = LaunchConfiguration("ik_use_waist")
    ik_alpha = LaunchConfiguration("ik_alpha")
    ik_max_dq_step = LaunchConfiguration("ik_max_dq_step")
    arm_velocity_limit = LaunchConfiguration("arm_velocity_limit")
    viewer_fullscreen = LaunchConfiguration("hand_viewer_fullscreen")
    viewer_width = LaunchConfiguration("hand_viewer_width")
    viewer_height = LaunchConfiguration("hand_viewer_height")

    urdf = os.path.join(
        get_package_share_directory(package_name), "description_files/urdf", urdf_file_name
    )
    with open(urdf, "r") as infp:
        robot_desc = infp.read()

    return LaunchDescription([
        DeclareLaunchArgument("use_sim_time", default_value="false",
                              description="Use simulation (Gazebo) clock if true"),
        DeclareLaunchArgument("use_robot", default_value="true",
                              description="Connect to real robot if true"),
        DeclareLaunchArgument("publish_joint_states", default_value="false",
                              description="Publish joint_states from node"),
        DeclareLaunchArgument("interface", default_value="eno1",
                              description="Network interface for Unitree SDK"),
        DeclareLaunchArgument("sim_rate_hz", default_value="50.0",
                              description="Simulation rate when use_robot=false"),
        DeclareLaunchArgument("arm_controlled", default_value="both",
                                description="Which arm to control: 'left', 'right', or 'both'"),
        DeclareLaunchArgument("enable_arm_ui", default_value="true"),
        DeclareLaunchArgument("ik_use_waist", default_value="false"),
        DeclareLaunchArgument("ik_alpha", default_value="0.2"),
        DeclareLaunchArgument("ik_max_dq_step", default_value="0.05"),
        DeclareLaunchArgument("arm_velocity_limit", default_value="2.0"),
        # Parametry okna podglądu dłoni (OpenCV w hand_tracker_node)
        DeclareLaunchArgument(
            "hand_viewer_fullscreen",
            default_value="false",
            description="Jeśli true, okno kamery startuje w trybie fullscreen",
        ),
        DeclareLaunchArgument(
            "hand_viewer_width",
            default_value="0",
            description="Szerokość okna podglądu (0 = oryginalna szerokość obrazu)",
        ),
        DeclareLaunchArgument(
            "hand_viewer_height",
            default_value="0",
            description="Wysokość okna podglądu (0 = oryginalna wysokość obrazu)",
        ),

        Node(
            package='g1pilot',
            executable='loco_client',
            name='loco_client',
            parameters=[{
                'interface': interface,
                'use_robot': ParameterValue(use_robot, value_type=bool),
                'arm_controlled': arm_controlled,  # string ('left'|'right'|'both')
                'enable_arm_ui': ParameterValue(enable_arm_ui, value_type=bool),
                'ik_use_waist': ParameterValue(ik_use_waist, value_type=bool),
                'ik_alpha': ParameterValue(ik_alpha, value_type=float),
                'ik_max_dq_step': ParameterValue(ik_max_dq_step, value_type=float),
                'arm_velocity_limit': ParameterValue(arm_velocity_limit, value_type=float),
            }],
            output='screen'
        ),

        Node(
            package='g1pilot',
            executable='robot_state',
            name='robot_state',
            parameters=[{
                'interface': interface,
                'use_robot': ParameterValue(use_robot, value_type=bool),
                'sim_rate_hz': ParameterValue(sim_rate_hz, value_type=float),
                'publish_joint_states': ParameterValue(publish_joint_states, value_type=bool),
            }],
            output='screen'
        ),

        # Node(
        #     package='g1pilot',
        #     executable='mola_fixed',
        #     name='mola_fixed',
        #     parameters=[{
        #     }],
        #     output='screen'
        # ),

        Node(
            package='tf2_ros',
            executable='static_transform_publisher',
            name='mid360_to_livox_tf',
            arguments=['0','0','0','0','0','3.14159265','mid360_link','livox_frame']
        ),

        Node(
            package='tf2_ros',
            executable='static_transform_publisher',
            name='d435_to_camera_link',
            arguments=['0','0','0','0','0','0','d435_link','camera_link']
        ),

        Node(
            package='tf2_ros',
            executable='static_transform_publisher',
            name='world_to_odom_tf',
            arguments=['0','0','0','0','0','0','world','odom_unitree']
        ),

        Node(
            package='tf2_ros',
            executable='static_transform_publisher',
            name='pelvis_to_base_link_tf',
            arguments=['0','0','0','0','0','0','base_link','pelvis']
        ),

        Node(
            package='tf2_ros',
            executable='static_transform_publisher',
            name='mrbeam_to_pelvis_tf',
            arguments=['0.0745','0.0','0.065','0','0.05236','0','waist_roll_link','mrbeam_link']
        ),

        Node(
            package="robot_state_publisher",
            executable="robot_state_publisher",
            name="robot_state_publisher",
            output="screen",
            parameters=[{
                "use_sim_time": ParameterValue(use_sim_time, value_type=bool),
                "robot_description": robot_desc
            }],
            arguments=[urdf],
        ),

        Node(
            package="rviz2",
            executable="rviz2",
            name="rviz2",
            arguments=[
                "-d",
                os.path.join(
                    get_package_share_directory("g1pilot"),
                    "config",
                    rviz_config_file_name
                )
            ],
        ),

        # Node(
        #     package='g1pilot',
        #     executable='arm_controller',
        #     name='arm_controller',
        #     parameters=[{
        #         'interface': interface,
        #         'use_robot': ParameterValue(use_robot, value_type=bool),
        #     }],
        #     output='screen'
        # ),

        Node(       
            package='teleop_hand_eye_tracking',
            executable='arm_controller',
            name='arm_controller',
            parameters=[{
                'interface': interface,
                'use_robot': ParameterValue(use_robot, value_type=bool),
            }],
            output='screen'
        ),

        # Node(
        #     package='g1pilot',
        #     executable='dx3_controller',
        #     name='dx3_controller',
        #     parameters=[{
        #         'arm_controlled': ParameterValue(LaunchConfiguration("arm_controlled"), value_type=str),
        #         'interface': ParameterValue(LaunchConfiguration("interface"), value_type=str)
        #     }],
        #     output='screen'
        # ),

        # Node(
        #     package='g1pilot',
        #     executable='interactive_marker',
        #     name='interactive_marker',
        #     parameters=[{
        #         'interface': interface,
        #         'use_robot': ParameterValue(use_robot, value_type=bool),
        #     }],
        #     output='screen'
        # ),

        Node(
            package='g1pilot',
            executable='ui_interface',
            name='ui_interface',
            output='screen'
        ),

        # Node(
        # package='joint_state_publisher_gui',
        # executable='joint_state_publisher_gui',
        # name='joint_state_publisher',
        # output='screen',
        # ),

        Node(
            package='rqt_gui',
            executable='rqt_gui',
            name='rqt',
            output='screen',
        ),
        
        Node(
            package="teleop_hand_eye_tracking",
            executable="hand_tracker",
            name="hand_tracker_node",
            output="screen",
            remappings=[
                ("/oak/rgb/image_raw", "/xreal/camera/image_raw"),
            ],
            parameters=[{
                "viewer_fullscreen": ParameterValue(viewer_fullscreen, value_type=bool),
                "viewer_width": ParameterValue(viewer_width, value_type=int),
                "viewer_height": ParameterValue(viewer_height, value_type=int),
            }],
        ),

        Node(
            package="teleop_hand_eye_tracking",
            executable="hand_tracker_to_arm_goal",
            name="hand_tracker_to_arm_goal_node",
            output="screen",
        ),
    ])

# sudo apt install iproute2 -y
# sudo apt install ros-humble-joint-state-publisher-gui
# sudo apt install ros-humble-rqt*
# colcon build
# source install/setup.bash
# ros2 launch g1pilot rviz2_manipulation_launcher.launch.py 
# 