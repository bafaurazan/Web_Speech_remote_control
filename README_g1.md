
1. setup django server
```bash
cd ~/Web_Speech_remote_control/api
poetry run python manage.py runserver 0.0.0.0:8000
```
2. setup react frontend
```bash
cd ~/Web_Speech_remote_control/frontend_ws
npm run dev
```

3. setup teleop
```bash
source ~/ros2_projects_ws/install/setup.bash
source ~/Web_Speech_remote_control/teleop_ws/install/setup.bash

# run
ros2 launch teleop_bringup teleop_system.launch.py security:=False
```

4. setup arm publisher
```bash
cd ~/g1pilot/docker
sudo sh run.sh

sudo apt install ros-humble-rqt*
export ROS_DOMAIN_ID=0
colcon build
source install/setup.bash
ros2 launch g1pilot rviz2_manipulation_launcher.launch.py interface:=eno1 publish_joint_states:=true use_robot:=true
```

```bash
cd ~/g1pilot/docker
sudo sh run_camera.sh

export ROS_DOMAIN_ID=0
colcon build
source install/setup.bash
ros2 topic pub -1 /g1pilot/hand_goal/left geometry_msgs/msg/PoseStamped "{header: {stamp: {sec: 0, nanosec: 0}, frame_id: 'pelvis'}, pose: {position: {x: 0.40, y: 0.17, z: 0.09}, orientation: {x: 0.0, y: 0.0, z: 0.0, w: 1.0}}}"
```

```bash
source ~/Web_Speech_remote_control/teleop_ws/install/setup.bash
source ~/unitree_ws/setup_local.sh

ros2 run teleop_joy_cmd loco_client 

```

```bash
ros2 topic pub --once /g1pilot/cmd std_msgs/msg/String "{data: 'damp'}"
ros2 topic pub --once /g1pilot/cmd std_msgs/msg/String "{data: 'standby'}"
ros2 topic pub --once /g1pilot/cmd std_msgs/msg/String "{data: 'start'}"

```