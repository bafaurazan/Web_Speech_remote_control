# Setup Micro-ros

## After cloning repository

```
cd microros_ws

git clone -b $ROS_DISTRO https://github.com/micro-ROS/micro_ros_setup.git src/micro_ros_setup

sudo apt update && rosdep update
rosdep install --from-paths src --ignore-src -y

sudo apt-get install python3-pip

colcon build

source install/local_setup.bash

ros2 run micro_ros_setup create_firmware_ws.sh freertos esp32
```

## Sourcing installation

```
cd microros_ws
source install/local_setup.bash
```

## After changing file:

```
microros_ws/blink/
```

#### then

```
cp -r blink/ firmware/freertos_apps/apps/
ros2 run micro_ros_setup configure_firmware.sh blink --transport serial
ros2 run micro_ros_setup build_firmware.sh
ros2 run micro_ros_setup flash_firmware.sh
```

#### for wifi version not serial


[follow instruction in this tutorial](https://robofoundry.medium.com/esp32-micro-ros-actually-working-over-wifi-and-udp-transport-519a8ad52f65)
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
# to flash ESP32 with the example program we are going to run which is
# examples/int32_publisher
sudo chmod 666 /dev/ttyUSB0

docker run -it --rm --user espidf --volume="/etc/timezone:/etc/timezone:ro" -v  $(pwd):/micro_ros_espidf_component -v  /dev:/dev --privileged --workdir /micro_ros_espidf_component microros/esp-idf-microros:latest /bin/bash  -c "cd examples/int32_publisher; idf.py menuconfig build flash monitor"

docker run -it --rm --net=host microros/micro-ros-agent:humble udp4 --port 8888 -v6
```

### create and build micro-agent

```
ros2 run micro_ros_setup create_agent_ws.sh
ros2 run micro_ros_setup build_agent.sh
source install/local_setup.bash
```

## Testing

### opening micro-ros subscriber

```
ros2 run micro_ros_agent micro_ros_agent serial --dev /dev/serial/by-id/usb-Silicon_Labs_CP2102_USB_to_UART_Bridge_Controller_0001-if00-port0
```

### echo topic 

```
ros2 topic echo /rover/speed 

```
#### 1. opening cli Publisher test

```
ros2 topic pub /rover/speed std_msgs/msg/Int32 "{data: 1}"
ros2 topic pub /rover/speed std_msgs/msg/Int32 "{data: 10}"
```

#### 2. opening Python Publisher (if available)

```
ros2 run rover_control publisher_node
```



### esp32 will blink:

At sending odd numbers "data: 1" and will not bland at even numbers
"data: 10"
