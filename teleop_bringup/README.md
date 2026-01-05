build teleop_bringup
```bash
cd ~/Web_Speech_remote_control/teleop_bringup/
colcon build
```

run teleop_bringup
```bash
cd ~/Web_Speech_remote_control/teleop_bringup/
source install/setup.bash
ros2 launch teleop_bringup twist_joy_g1.launch.py 
```