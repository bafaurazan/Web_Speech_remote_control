# teleop_bringup

launching secured wersion for example node

```bash
export KEYSTORE_PATH="$HOME/Web_Speech_remote_control/sros2_ws/teleop_keystore"

ROS_SECURITY_ENABLE=true \
ROS_SECURITY_STRATEGY=Enforce \
ROS_SECURITY_KEYSTORE="$KEYSTORE_PATH" \
ros2 run teleop_joy_cmd cmd_vel_sub  \
--ros-args \
--enclave /teleop_policy/teleop_twist_joy_node
```

launching mosquitto secured
```bash
cd ~/Web_Speech_remote_control/sros2_ws/mqtt_certs
mosquitto -c ~/Web_Speech_remote_control/sros2_ws/mqtt_certs/mosquitto_secure.conf -v
```

