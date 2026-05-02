# teleop_moving_window

Pakiet zawiera nody do:
- wirtualnej sceny IMU (`imu_virtual_camera.py`),
- streamu z kamery laptopa (`laptop_camera_stream_node.py`),
- niskolatencyjnego streamu ekranu desktopu (`desktop_screen_stream_node`, C++),
- utworzenia dodatkowego okna pomocniczego (`virtual_display_window_node`, C++).

## Build (colcon)

```bash
cd /home/rafal/Web_Speech_remote_control/teleop_ws
source /opt/ros/humble/setup.bash
colcon build --packages-select teleop_moving_window
source install/setup.bash
```

Jeśli używasz makra `build()` z `macros.bash`, zależności APT są w:
- `teleop_moving_window/apt_packages.txt`

## 1) Virtual camera IMU

Plik: `imu_virtual_camera.py`

Publikuje:
- `/xreal/camera/image_raw` (`sensor_msgs/Image`)
- `/xreal/virtual_scene/markers` (`visualization_msgs/MarkerArray`)

Subskrybuje:
- `/xreal/imu/data`
- `/laptop/camera/image_raw`

Uruchomienie:
```bash
python3 /home/rafal/Web_Speech_remote_control/teleop_ws/src/teleop_moving_window/imu_virtual_camera.py
```

## 2) Stream z kamery laptopa

Plik: `laptop_camera_stream_node.py`

Domyślny topic:
- `/laptop/camera/image_raw`

Uruchomienie:
```bash
python3 /home/rafal/Web_Speech_remote_control/teleop_ws/src/teleop_moving_window/laptop_camera_stream_node.py
```

## 3) Stream ekranu desktopu (C++, low-latency)

Executable:
- `desktop_screen_stream_node`

Uruchomienie:
```bash
ros2 run teleop_moving_window desktop_screen_stream_node
```

Domyślnie:
- topic: `/desktop/screen/image_raw`
- encoding: `bgra8`
- QoS: `best_effort`, `keep_last(1)`
- pokazuje kursor (`show_cursor:=true`)

### Kluczowe parametry

- `fps` (np. `90.0`)
- `image_topic` (np. `/desktop/screen/image_raw`)
- `frame_id` (np. `desktop_screen_frame`)
- `primary_monitor_only` (`true/false`)
- `prefer_internal_monitor` (`true/false`)
- `monitor_name` (np. `eDP`, `DisplayPort-1`, `Virtual-2-1`)
- `show_cursor` (`true/false`)
- `capture_x`, `capture_y`, `capture_width`, `capture_height`

### Przykłady

Tylko ekran laptopa:
```bash
ros2 run teleop_moving_window desktop_screen_stream_node --ros-args \
  -p monitor_name:=eDP \
  -p primary_monitor_only:=true \
  -p prefer_internal_monitor:=true \
  -p fps:=90.0
```

Tylko monitor wirtualny (np. z `vkms`):
```bash
ros2 run teleop_moving_window desktop_screen_stream_node --ros-args \
  -p monitor_name:=Virtual-2-1 \
  -p primary_monitor_only:=true \
  -p prefer_internal_monitor:=false \
  -p fps:=90.0 \
  -p image_topic:=/desktop/screen/image_raw
```

## 4) Dodatkowe okno pomocnicze

Executable:
- `virtual_display_window_node`

Uruchomienie:
```bash
ros2 run teleop_moving_window virtual_display_window_node
```

Uwaga: to jest zwykłe okno X11, **nie** nowy monitor systemowy.

## 5) Jak uzyskać prawdziwy trzeci monitor

Najprościej testowo:
```bash
sudo modprobe vkms
xrandr --query
```

Jeśli pojawi się output np. `Virtual-2-1`, ustaw układ:
```bash
xrandr --output Virtual-2-1 --mode 1920x1080 --left-of eDP
```

Potem streamuj ten monitor przez:
- `monitor_name:=Virtual-2-1`

## Podgląd obrazu

```bash
ros2 run rqt_image_view rqt_image_view
```

Wybierz topic:
- `/desktop/screen/image_raw`
- `/xreal/camera/image_raw`
- `/laptop/camera/image_raw`
