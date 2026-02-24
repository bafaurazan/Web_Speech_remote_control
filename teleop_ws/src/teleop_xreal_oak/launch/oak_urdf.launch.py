"""
Launch OAK camera URDF + robot_state_publisher, publishing to /oak/robot_description
so that G1 robot can keep /robot_description and both models show in RViz.
Based on depthai_descriptions/launch/urdf_launch.py with topic remap.
"""
import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, OpaqueFunction
from launch.conditions import IfCondition, UnlessCondition
from launch.substitutions import Command, LaunchConfiguration
from launch_ros.actions import LoadComposableNodes, Node
from launch_ros.descriptions import ComposableNode


# Topic for OAK model so it does not overwrite /robot_description (G1)
OAK_ROBOT_DESCRIPTION_TOPIC = "/oak/robot_description"


def launch_setup(context, *args, **kwargs):
    bringup_dir = get_package_share_directory("depthai_descriptions")
    use_base_descr = LaunchConfiguration("use_base_descr", default="false")
    xacro_path = ""
    if use_base_descr.perform(context) == "true":
        xacro_path = os.path.join(bringup_dir, "urdf", "base_descr.urdf.xacro")
    else:
        xacro_path = os.path.join(bringup_dir, "urdf", "depthai_descr.urdf.xacro")

    camera_model = LaunchConfiguration("camera_model", default="OAK-D")
    tf_prefix = LaunchConfiguration("tf_prefix", default="oak")
    base_frame = LaunchConfiguration("base_frame", default="oak-d_frame")
    parent_frame = LaunchConfiguration("parent_frame", default="oak-d-base-frame")
    cam_pos_x = LaunchConfiguration("cam_pos_x", default="0.0")
    cam_pos_y = LaunchConfiguration("cam_pos_y", default="0.0")
    cam_pos_z = LaunchConfiguration("cam_pos_z", default="0.0")
    cam_roll = LaunchConfiguration("cam_roll", default="1.5708")
    cam_pitch = LaunchConfiguration("cam_pitch", default="0.0")
    cam_yaw = LaunchConfiguration("cam_yaw", default="1.5708")
    namespace = LaunchConfiguration("namespace", default="")
    rs_compat = LaunchConfiguration("rs_compat", default="false")
    use_composition = LaunchConfiguration("use_composition", default="false")

    name = LaunchConfiguration("tf_prefix").perform(context)
    robot_description = {
        "robot_description": Command(
            [
                "xacro",
                " ",
                xacro_path,
                " ",
                "camera_name:=",
                tf_prefix,
                " ",
                "camera_model:=",
                camera_model,
                " ",
                "base_frame:=",
                base_frame,
                " ",
                "parent_frame:=",
                parent_frame,
                " ",
                "cam_pos_x:=",
                cam_pos_x,
                " ",
                "cam_pos_y:=",
                cam_pos_y,
                " ",
                "cam_pos_z:=",
                cam_pos_z,
                " ",
                "cam_roll:=",
                cam_roll,
                " ",
                "cam_pitch:=",
                cam_pitch,
                " ",
                "cam_yaw:=",
                cam_yaw,
                " ",
                "rs_compat:=",
                rs_compat,
            ]
        )
    }

    # Remap so OAK model does not overwrite /robot_description (G1 uses that)
    remappings = [("robot_description", OAK_ROBOT_DESCRIPTION_TOPIC)]

    return [
        Node(
            package="robot_state_publisher",
            condition=UnlessCondition(use_composition),
            executable="robot_state_publisher",
            name=name + "_state_publisher",
            namespace=namespace,
            parameters=[robot_description],
            remappings=remappings,
        ),
        LoadComposableNodes(
            target_container=f"{namespace.perform(context)}/{name}_container",
            condition=IfCondition(use_composition),
            composable_node_descriptions=[
                ComposableNode(
                    package="robot_state_publisher",
                    plugin="robot_state_publisher::RobotStatePublisher",
                    name=name + "_state_publisher",
                    namespace=namespace,
                    parameters=[robot_description],
                    remappings=remappings,
                )
            ],
        ),
    ]


def generate_launch_description():
    declared_arguments = [
        DeclareLaunchArgument(
            "namespace",
            default_value="",
            description="Namespace of the robot state publisher node.",
        ),
        DeclareLaunchArgument(
            "camera_model",
            default_value="OAK-D",
            description="Camera model (e.g. OAK-D, OAK-D-LITE).",
        ),
        DeclareLaunchArgument(
            "tf_prefix",
            default_value="oak",
            description="Camera name / TF prefix.",
        ),
        DeclareLaunchArgument(
            "base_frame",
            default_value="oak-d_frame",
            description="Name of the base link.",
        ),
        DeclareLaunchArgument(
            "parent_frame",
            default_value="oak-d-base-frame",
            description="Parent link for connecting to robot TF.",
        ),
        DeclareLaunchArgument("cam_pos_x", default_value="0.0"),
        DeclareLaunchArgument("cam_pos_y", default_value="0.0"),
        DeclareLaunchArgument("cam_pos_z", default_value="0.0"),
        DeclareLaunchArgument("cam_roll", default_value="0.0"),
        DeclareLaunchArgument("cam_pitch", default_value="0.0"),
        DeclareLaunchArgument("cam_yaw", default_value="0.0"),
        DeclareLaunchArgument(
            "use_composition",
            default_value="false",
            description="Use composition for robot_state_publisher.",
        ),
        DeclareLaunchArgument("use_base_descr", default_value="false"),
        DeclareLaunchArgument("rs_compat", default_value="false"),
    ]

    return LaunchDescription(
        declared_arguments + [OpaqueFunction(function=launch_setup)]
    )

