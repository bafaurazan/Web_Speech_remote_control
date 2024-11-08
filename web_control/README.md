# Setup ROS2

## After preparing micro-ros

```
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
```

## Testing

### /turtle1/cmd_vel

```
web_controling_cmd_vel.html
```

### rover/speed

```
web_controling_micro_ros.html
```

#### 2. opening cli Publisher test

```
ros2 topic pub /rover/speed std_msgs/msg/Int32 "{data: 1}"
ros2 topic pub /rover/speed std_msgs/msg/Int32 "{data: 10}"
```