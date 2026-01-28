# teleop_mqtt_client


```bash
source ~/Web_Speech_remote_control/teleop_ws/install/setup.bash 
ros2 launch mqtt_client standalone.launch.xml params_file:=$(ros2 pkg prefix mqtt_client)/share/mqtt_client/config/params.primitive.yaml

mosquitto_pub -h localhost -t "pingpong/primitive" --repeat 20 --repeat-delay 1 -m "69"

mosquitto_sub -h localhost -t "pingpong/primitive"

ros2 topic echo /pong/primitive 


```