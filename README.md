# Web_Speech_Remote_control

The project presents the compilation of an AI assistant with online remote voice control

![](diagrams/connection_diagram/connection_diagram.png)

# Fast Test

1. setup django server
```
cd ~/Mateusz_task/Web_Speech_remote_control/api
poetry run python manage.py runserver 0.0.0.0:8000
```

2. setup tailscale
```
sudo tailscale funnel 8000
```
go to website

3. setup electron app
```
cd ~/Mateusz_task/Web_Speech_remote_control/electron
npm run start
```

4. In rover connect battery to buck-converter

5. In rover turn on powerbank

6. create wifi connection with esp32 
```
sudo docker run -it --rm --net=host microros/micro-ros-agent:humble udp4 --port 8888 -v6
```

7. In website start saying somethink similar to "start, stop"

8. In website test buttons

9. terminal tests
```
ros2 topic pub /diff_drive_controller_right/cmd_vel_unstamped geometry_msgs/msg/Twist "{linear: {x: 2.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"


ros2 topic pub /diff_drive_controller_left/cmd_vel_unstamped geometry_msgs/msg/Twist "{linear: {x: 2.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"

```

10. controlling rover teleop

```
cd TrailblazerML/
source install/setup.bash

ros2 launch rover_teleop_twist_joy teleop_twist_launch.py

```

11. running oak camera depthai_viewer

```
python3 -m depthai_viewer

```

12. setup depthai

```
sudo nano /etc/udev/rules.d/80-depthai.rules
```
SUBSYSTEM=="usb", ATTR{idVendor}=="03e7", MODE="0666"
```
 sudo udevadm control --reload-rules
```
13. opening rviz (not working)

```
ros2 launch gazebo_viz rsp.launch.py
```

14. setup gazebo 
```
cd ~/.gazebo/models/gazebo_viz 
ros2 launch gazebo_viz launch_sim.launch.py 
```