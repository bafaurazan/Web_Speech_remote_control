# G1 – teleop i bringup

## Uruchomienie całości (bringup)

Jednym poleceniem uruchamiasz robota (lub symulację), RViz, kamerę OAK, śledzenie rąk, IMU z okularów XREAL oraz kontroler tułowia. **Wszystkie funkcje są domyślnie wyłączone** – włączasz je po kolei serwisami.

```bash
source ~/Web_Speech_remote_control/teleop_ws/install/setup.bash
export ROS_DOMAIN_ID=0

# Symulacja (bez fizycznego robota)
ros2 launch teleop_bringup g1_arm_control.launch.py interface:=wlp4s0 publish_joint_states:=false use_robot:=false

# Prawy robot
ros2 launch teleop_bringup g1_arm_control.launch.py interface:=eno1 publish_joint_states:=true use_robot:=true
```

Po starcie bringupu masz:
- RViz z modelem G1 i kamerą OAK,
- węzły: śledzenie rąk, IMU XREAL, sterowanie tułowiem – **nieaktywne** do momentu wywołania serwisów.

---

## Serwisy – włączanie funkcji po kolei

Włączanie poszczególnych możliwości odbywa się przez wywołanie serwisów (kolejność dowolna).

### 1. Ruch rękami (mapowanie dłoni → ramiona)

Włącza wysyłanie celów z śledzenia dłoni do `/g1pilot/hand_goal/left` i `/g1pilot/hand_goal/right`.

```bash
# włączenie
ros2 service call /hand_tracker_to_arm_goal/set_enabled std_srvs/srv/SetBool "{data: true}"

# wyłączenie
ros2 service call /hand_tracker_to_arm_goal/set_enabled std_srvs/srv/SetBool "{data: false}"
```

### 2. IMU z okularów XREAL

Włącza publikację danych IMU z okularów (oraz filtr Madgwick → orientacja na `/xreal/imu/data`).

```bash
# włączenie
ros2 service call /enable_imu std_srvs/srv/SetBool "{data: true}"

# wyłączenie
ros2 service call /enable_imu std_srvs/srv/SetBool "{data: false}"
```

**Uwaga:** Okulary muszą być podłączone (TCP do IMU). Przed pierwszym użyciem warto wykonać kalibrację żyroskopu:  
`ros2 launch teleop_xreal_oak xreal_imu_calib.launch.py`

### 3. Sterowanie tułowiem z głowy (IMU → obrót tułowia)

Włącza kontroler, który ustawia tułów robota według orientacji głowy z IMU (quaternion `w` → pozycja tułowia).

```bash
# włączenie
ros2 service call /enable_head_to_torso std_srvs/srv/SetBool "{data: true}"

# wyłączenie
ros2 service call /enable_head_to_torso std_srvs/srv/SetBool "{data: false}"
```

**Sensowna kolejność:** najpierw włącz IMU (pkt 2), potem sterowanie tułowiem (pkt 3), żeby kontroler miał dane z `/xreal/imu/data`.

---

## Szybka ściąga – jedna linia na funkcję

```bash
# Ręce
ros2 service call /hand_tracker_to_arm_goal/set_enabled std_srvs/srv/SetBool "{data: true}"

# IMU (okulary)
ros2 service call /enable_imu std_srvs/srv/SetBool "{data: true}"

# Tułów (głowa → tułów)
ros2 service call /enable_head_to_torso std_srvs/srv/SetBool "{data: true}"
```

---

## Inne (Django, frontend, testy)

### Setup Django server

```bash
cd ~/Web_Speech_remote_control/api
poetry run python manage.py runserver 0.0.0.0:8000
```

### Setup React frontend

```bash
cd ~/Web_Speech_remote_control/frontend_ws
npm run dev
```

### Test imu_simulator

```bash
cd ~/Web_Speech_remote_control/teleop_ws
python3 scripts/imu_simulator.py
```

### Test bridge_node

```bash
cd ~/Web_Speech_remote_control/teleop_ws
source install/setup.bash
ros2 run teleop_webrtc_joy bridge
```

### Setup teleop (teleop_system)

```bash
source ~/ros2_projects_ws/install/setup.bash
source ~/Web_Speech_remote_control/teleop_ws/install/setup.bash
export ROS_DOMAIN_ID=0
ros2 launch teleop_bringup teleop_system.launch.py security:=False
```

### G1 pilot (docker, kamera, loco_client)

```bash
cd ~/g1pilot/docker
sudo sh run.sh

sudo apt install ros-humble-rqt*
export ROS_DOMAIN_ID=0
colcon build
source install/setup.bash

# Symulacja
ros2 launch teleop_bringup g1_arm_control.launch.py interface:=wlp4s0 publish_joint_states:=false use_robot:=false

# Prawy robot
ros2 launch teleop_bringup g1_arm_control.launch.py interface:=eno1 publish_joint_states:=true use_robot:=true
```

```bash
cd ~/g1pilot/docker
sudo sh run_camera.sh
export ROS_DOMAIN_ID=0
colcon build
source install/setup.bash
```

```bash
export ROS_DOMAIN_ID=0
source ~/Web_Speech_remote_control/teleop_ws/install/setup.bash
source ~/unitree_ws/setup_local.sh

# robot
ros2 run teleop_joy_cmd loco_client --ros-args -p network_interface:=eno1

# symulacja
ros2 run teleop_joy_cmd loco_client --ros-args -p network_interface:=wlp4s0
```

```bash
ros2 service call /g1pilot/damp std_srvs/srv/Trigger
ros2 service call /g1pilot/standby std_srvs/srv/Trigger
ros2 service call /g1pilot/start std_srvs/srv/Trigger

# symulacja
ros2 topic pub --once /g1pilot/arms/enabled std_msgs/msg/Bool "{data: true}"
```

---

### Sterowanie mapowaniem dłoni → ramiona (hand_tracker_to_arm_goal)

Węzeł ma prostą maszynę stanów:

- **idle** – nie wysyła celów do `/g1pilot/hand_goal/left` i `/g1pilot/hand_goal/right`
- **active** – aktywne mapowanie `/hand/left`, `/hand/right` → cele ramion

Stan jest publikowany na `hand_tracker_to_arm_goal/state` (`std_msgs/msg/String`): `"idle"` lub `"active"`.

Przełączanie przez serwis (jak w sekcji „Serwisy” powyżej).

**RViz – robot i kamera OAK:**  
Kamera: `/oak/robot_description`, robot G1: `/robot_description`. W RViz: **Add** → **RobotModel**, w drugim ustaw **Description Topic** na `/oak/robot_description`. Fixed Frame: `pelvis`.
