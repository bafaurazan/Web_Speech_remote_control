# Setup ROS2

## After cloning repository or changing publisher:

```
~/ros2_ws/src/rover_control/publisher_member_function.py
```

### then

```
cd ros2_ws/src
colcon build
```

## Testing

### Source installation

```
source install/local_setup.bash
```

#### 1. opening Python Publisher 

```
ros2 run rover_control publisher_node
```

#### 2. opening cli Publisher test

```
ros2 topic pub /rover/speed std_msgs/msg/Int32 "{data: 1}"
ros2 topic pub /rover/speed std_msgs/msg/Int32 "{data: 10}"
```