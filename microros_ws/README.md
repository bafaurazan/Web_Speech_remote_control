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