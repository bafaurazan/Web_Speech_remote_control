# teleop_bringup

```bash
#for testing mqtt/rtps
sudo wireshark
```

# unsecured setup

launching mosquitto broker unsecured
```bash
cd ~/Web_Speech_remote_control/sros2_ws/mqtt_certs
mosquitto -c ~/Web_Speech_remote_control/sros2_ws/mqtt_certs/mosquitto.conf -v
```

launching mqtt_ros2 bridge unsecured
```bash
source ~/Web_Speech_remote_control/teleop_ws/install/setup.bash 
export FASTRTPS_DEFAULT_PROFILES_FILE=$(ros2 pkg prefix teleop_mqtt_client)/share/teleop_mqtt_client/config/fastdds_udp_only.xml
ros2 launch teleop_mqtt_client mqtt_client.launch.py 
```

launching mqtt_ros2 bridge unsecured
```bash
source ~/Web_Speech_remote_control/teleop_ws/install/setup.bash 
export FASTRTPS_DEFAULT_PROFILES_FILE=$(ros2 pkg prefix teleop_mqtt_client)/share/teleop_mqtt_client/config/fastdds_udp_only.xml
ros2 run teleop_mqtt_client iot_sender 
```

# secured setup

launching mosquitto broker secured
```bash
cd ~/Web_Speech_remote_control/sros2_ws/mqtt_certs
mosquitto -c ~/Web_Speech_remote_control/sros2_ws/mqtt_certs/sec_mosquitto.conf -v
```

launching mqtt_ros2 bridge unsecured
```bash
source ~/Web_Speech_remote_control/teleop_ws/install/setup.bash 
export FASTRTPS_DEFAULT_PROFILES_FILE=$(ros2 pkg prefix teleop_mqtt_client)/share/teleop_mqtt_client/config/fastdds_udp_only.xml
ros2 launch teleop_mqtt_client sec_mqtt_client.launch.py 
```

launching mqtt_ros2 bridge unsecured
```bash
source ~/Web_Speech_remote_control/teleop_ws/install/setup.bash 
export FASTRTPS_DEFAULT_PROFILES_FILE=$(ros2 pkg prefix teleop_mqtt_client)/share/teleop_mqtt_client/config/fastdds_udp_only.xml
ros2 run teleop_mqtt_client sec_iot_sender 
```