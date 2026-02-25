from setuptools import find_packages, setup
from glob import glob
package_name = 'teleop_hand_eye_tracking'

setup(
    name=package_name,
    version='0.0.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        ('share/' + package_name + '/launch', glob('launch/*.py')),
        ('share/' + package_name + '/launch/eye_tracker_launch', glob('launch/eye_tracker_launch/*.py')),
        ('share/' + package_name + '/launch/hand_tracker_launch', glob('launch/hand_tracker_launch/*.py')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='rafalbazan',
    maintainer_email='rafalbe777@gmail.com',
    description='TODO: Package description',
    license='Apache-2.0',
    entry_points={
        'console_scripts': [
            'eye_tracker = teleop_hand_eye_tracking.eye_tracker.eye_tracker_node:main',
            'eye_tracker_controller = teleop_hand_eye_tracking.eye_tracker.eye_tracker_controller_node:main',
            'eye_tracker_calibration_gui = teleop_hand_eye_tracking.eye_tracker.eye_tracker_calibration_gui_node:main',
            'hand_tracker = teleop_hand_eye_tracking.hand_tracker.hand_tracker_node:main',
            'arm_controller = teleop_hand_eye_tracking.hand_tracker.arm_controller_node:main',
            'hand_tracker_to_arm_goal = teleop_hand_eye_tracking.hand_tracker.hand_tracker_to_arm_goal:main',
            'head_to_torso_controller = teleop_hand_eye_tracking.hand_tracker.head_to_torso_controller:main',
            # Experimental wrappers around vendor g1pilot controllers
            'arm_controller_waist_cmd_vel = teleop_hand_eye_tracking.experimental.arm_controller_waist_cmd_vel:main',
            'arm_controller_waist_cmd_vel_new = teleop_hand_eye_tracking.experimental.arm_controller_waist_cmd_vel_new:main',
            'arm_controller_oryg = teleop_hand_eye_tracking.experimental.arm_controller_oryg_node:main',
            'right_hand_waver = teleop_hand_eye_tracking.experimental.right_hand_waver:main',
        ],
    },
)