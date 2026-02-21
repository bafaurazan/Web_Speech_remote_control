
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

test imu_simulator
```bash
cd ~/Web_Speech_remote_control/teleop_ws
python3 scripts/imu_simulator.py # --6dof
```

test bridge_node
```bash
cd ~/Web_Speech_remote_control/teleop_ws
source install/setup.bash
ros2 run teleop_webrtc_joy bridge 

```

3. setup teleop
```bash
source ~/ros2_projects_ws/install/setup.bash
source ~/Web_Speech_remote_control/teleop_ws/install/setup.bash

# run
export ROS_DOMAIN_ID=0
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

#for real robot
ros2 launch g1pilot rviz2_manipulation_launcher.launch.py interface:=eno1 publish_joint_states:=true use_robot:=true

#for simulation
ros2 launch g1pilot rviz2_manipulation_launcher.launch.py interface:=wlp4s0 publish_joint_states:=false use_robot:=false
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
export ROS_DOMAIN_ID=0
source ~/Web_Speech_remote_control/teleop_ws/install/setup.bash
source ~/unitree_ws/setup_local.sh

#for robot
ros2 run teleop_joy_cmd loco_client --ros-args -p network_interface:=eno1

#for simulation
ros2 run teleop_joy_cmd loco_client --ros-args -p network_interface:=wlp4s0
```

```bash
ros2 service call /g1pilot/damp std_srvs/srv/Trigger
ros2 service call /g1pilot/standby std_srvs/srv/Trigger
ros2 service call /g1pilot/start std_srvs/srv/Trigger

#for simulation
ros2 topic pub --once /g1pilot/arms/enabled std_msgs/msg/Bool "{data: true}"
```