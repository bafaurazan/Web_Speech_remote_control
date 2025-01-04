# Introduction

This project is a ROS 2 package designed to control a rover using Python-based publishers. It provides functionality to send movement commands to the rover's left and right wheels via ROS2 topics. The package includes a Python publisher node, which allows you to test and control the rover's behavior programmatically. The setup and usage instructions guide you through building, sourcing, and testing the package.

**The main features include**:
- Publishing velocity commands to individual wheels (`/diff_drive_controller_left/cmd_vel_unstamped` and `/diff_drive_controller_right/cmd_vel_unstamped`) using `geometry_msgs/Twist`.
- CLI tools for quick testing and debugging.
- A Python publisher for automated control of wheel movements.

## Dependencies

- ROS2 humble

## 1. After cloning repository or changing publisher:

```
~/ros2_ws/src/rover_control/publisher_member_function.py
```

## 2. build package

```
cd ros2_ws
colcon build
```

# Testing

## 3. Source installation

```
source install/local_setup.bash
```

## 4. opening Python Publisher (To get rover moving effect, you must setup micro-ros)

```
ros2 run rover_control test_node
```

## 5. Open cli Publisher test (Dependency micro-ros setup)

```
//start

ros2 topic pub --once /diff_drive_controller_left/cmd_vel_unstamped geometry_msgs/Twist "{linear: {x: 2.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"

ros2 topic pub --once /diff_drive_controller_right/cmd_vel_unstamped geometry_msgs/Twist "{linear: {x: -2.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"

//stop

ros2 topic pub --once /diff_drive_controller_left/cmd_vel_unstamped geometry_msgs/Twist "{linear: {x: 0.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"

ros2 topic pub --once /diff_drive_controller_right/cmd_vel_unstamped geometry_msgs/Twist "{linear: {x: 0.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"
```