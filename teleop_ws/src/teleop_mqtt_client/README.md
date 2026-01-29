# teleop_mqtt_client


```bash
source ~/Web_Speech_remote_control/teleop_ws/install/setup.bash 
ros2 launch mqtt_client standalone.launch.xml params_file:=$(ros2 pkg prefix teleop_mqtt_client)/share/teleop_mqtt_client/config/params.primitive.yaml
#
source ~/Web_Speech_remote_control/teleop_ws/install/setup.bash 
export ROS_SECURITY_ENABLE=true
export ROS_SECURITY_STRATEGY=Enforce
export ROS_SECURITY_KEYSTORE=~/Web_Speech_remote_control/sros2_ws/teleop_keystore

# Uruchamiamy wskazując konkretną enklawę bezpieczeństwa (/teleop_policy/mqtt_client)
ros2 run mqtt_client mqtt_client     --ros-args     --enclave /teleop_policy/mqtt_client     --params-file ~/Web_Speech_remote_control/teleop_ws/src/teleop_mqtt_client/config/sec_params.primitive.yaml

```

```bash
mosquitto_pub -h localhost -t "pingpong/primitive" --repeat 20 --repeat-delay 1 -m "69"

mosquitto_sub -h localhost -t "pingpong/primitive"

ros2 topic echo /pong/primitive 


```

```bash
# for secured mqtt_ros2
cd ~/Web_Speech_remote_control/sros2_ws/mqtt_certs

# Pętla nieskończona (zatrzymasz Ctrl+C)
while true; do
    echo "Wysyłam pakiet..."
    mosquitto_pub -h localhost -p 8883 \
        --cafile ca_root.crt \
        --cert mqtt_client_node.crt \
        --key mqtt_client_node.key \
        -t "pingpong/primitive" \
        -m "Dane z IoT: $(date)"
    
    sleep 1
done


```


for wireshark test
```bash
source ~/Web_Speech_remote_control/teleop_ws/install/setup.bash 
export FASTRTPS_DEFAULT_PROFILES_FILE=$(ros2 pkg prefix teleop_mqtt_client)/share/teleop_mqtt_client/config/fastdds_udp_only.xml

```