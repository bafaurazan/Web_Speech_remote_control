```bash
#generating policies using private key
cd ~/Web_Speech_remote_control/sros2_ws
ros2 security create_permission teleop_keystore   /teleop_policy/teleop_twist_joy_node  ./policies/teleop.policy.xml
ros2 security create_permission teleop_keystore   /teleop_policy/teleop_bridge  ./policies/teleop.policy.xml
```

```bash
#secured
ros2 launch teleop_bringup sec_twist_joy_g1.launch.py 

#no secured
ros2 launch teleop_bringup twist_joy_g1.launch.py 

```
[ros2 dds security integration](https://design.ros2.org/articles/ros2_dds_security.html)