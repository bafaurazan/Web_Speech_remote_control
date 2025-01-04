# Introduction

This project integrates micro-ROS with ESP32 using the ESP-IDF framework and ROS 2 Humble, enabling seamless communication between embedded devices and ROS 2 environments. The ESP32 microcontroller leverages FreeRTOS, providing a robust real-time operating system for multitasking and efficient resource management. 

The primary focus of this setup is controlling a rover through ROS 2 topics, with micro-ROS enabling lightweight communication between ESP32 and ROS 2 nodes. FreeRTOS ensures that tasks like communication, motor control, and sensor handling are executed predictably and concurrently.

**The setup includes**:
- Preparing the ESP32 for micro-ROS communication.
- Flashing firmware with FreeRTOS support.
- Publishing commands to control the rover's movements via ROS 2 topics.
- Publishing velocity commands to individual wheels (`/diff_drive_controller_left/cmd_vel_unstamped` and `/diff_drive_controller_right/cmd_vel_unstamped`) using `geometry_msgs/Twist`.
- Real-time communication over Wi-Fi using UDP transport.

**Key features**:
- Integration of micro-ROS with ESP-IDF on ESP32.
- Real-time task management with FreeRTOS.
- Seamless communication using UDP transport.
- Command publishing for rover's.
- Docker-based setup for agent and firmware flashing.

## Dependencies

- docker

## 1. After cloning repository:

```
# 1. Create a directory for cloning the repo for ESP-IDF component
mkdir ~/dev/esp32/microROS
cd ~/dev/esp32/microROS

# 2. Clone the ESP-IDF component repository
git clone https://github.com/micro-ROS/micro_ros_espidf_component.git
cd micro_ros_espidf_component

# 3. Since we are going to be working with ROS2 Humble checkout humble branch
git checkout -b humble 
git status # to make sure we have the right branch

# 4. Before you connect the ESP32 run following command in new terminal window
sudo dmesg --follow

# 5. connect the ESP32 to laptop while the command is running and it will show 
# the port number the ESP32 is connected to - for me it was /dev/ttyUSB0
# you can stop the command from running by hitting CTRL+C

# 6. check the permission on that port by running
ls -l /dev/ttyUSB0

# it will show something like this, which means we don't have permissions 
# to write to the port yet
crw-rw---- 1 root dialout 188, 0 Aug 28 19:41 /dev/ttyUSB0

# 7. Run following command to grant permission to write, we will need this
# to flash ESP32 with the example program we are going to run 
sudo chmod 666 /dev/ttyUSB0

# 8. copy software
cp -r ~/Web_Speech_remote_control/microros_ws/blink_wifi ~/dev/esp32/microROS/micro_ros_espidf_component/examples
```

# Testing

## 2. testing rover

```
# 9. flash esp32
sudo docker run -it --rm --user espidf --volume="/etc/timezone:/etc/timezone:ro" -v  $(pwd):/micro_ros_espidf_component -v  /dev:/dev --privileged --workdir /micro_ros_espidf_component microros/esp-idf-microros:latest /bin/bash  -c "cd examples/blink_wifi; idf.py menuconfig build flash monitor"

# 10. connect to esp32 
# you must connect esp32 to same wifi of your running docker and then:
sudo docker run -it --rm --net=host microros/micro-ros-agent:humble udp4 --port 8888 -v6
```

## 3. opening cli Publisher test

```
//start

ros2 topic pub --once /diff_drive_controller_left/cmd_vel_unstamped geometry_msgs/Twist "{linear: {x: 2.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"

ros2 topic pub --once /diff_drive_controller_right/cmd_vel_unstamped geometry_msgs/Twist "{linear: {x: -2.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"

//stop

ros2 topic pub --once /diff_drive_controller_left/cmd_vel_unstamped geometry_msgs/Twist "{linear: {x: 0.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"

ros2 topic pub --once /diff_drive_controller_right/cmd_vel_unstamped geometry_msgs/Twist "{linear: {x: 0.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"
```

### Source 

[follow instruction in this tutorial](https://robofoundry.medium.com/esp32-micro-ros-actually-working-over-wifi-and-udp-transport-519a8ad52f65)