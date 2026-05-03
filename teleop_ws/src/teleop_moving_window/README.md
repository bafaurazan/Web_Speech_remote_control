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
- `/xreal/virtual_scene/add_block` — dodanie lub nadpisanie bloku (`visualization_msgs/Marker`)

Uruchomienie:
```bash
python3 /home/rafal/Web_Speech_remote_control/teleop_ws/src/teleop_moving_window/imu_virtual_camera.py
```

### Serwis: czarne tło / domyślne tło

Węzeł udostępnia serwis `std_srvs/srv/SetBool` (domyślna nazwa: `/xreal/virtual_camera/set_black_background`).
- `{data: true}` — czarne tło, ukrywana jest siatka podłogi (scena 3D i markery bez zmian).
- `{data: false}` — tło jak domyślnie (jasnoniebieskie niebo + biała siatka podłogi).

```bash
# Czarne tło
ros2 service call /xreal/virtual_camera/set_black_background std_srvs/srv/SetBool "{data: true}"

# Powrót do domyślnego tła
ros2 service call /xreal/virtual_camera/set_black_background std_srvs/srv/SetBool "{data: false}"
```

Opcjonalnie można zmienić nazwę serwisu parametrem `set_black_background_service` przy starcie (`--ros-args -p ...`).

### Dodawanie nowych bloków (topic `/add_block`)

Na topic **`/xreal/virtual_scene/add_block`** publikuj komunikat **`visualization_msgs/msg/Marker`**.

Wymagania:
- **`type`** musi być **`CUBE`** (stała z wiadomości `Marker`; w CLI użyj `type:=1`, bo `CUBE==1`).
- Używane pola: **`pose.position`** (m), **`scale`** (rozmiar prostopadłościanu), **`color`** (RGB w zakresie 0–1, `a` dowolnie), **`id`**: dla **`id >= 0`** podany numer nadpisuje istniejący blok; dla **`id < 0`** (np. **`-1`**) węzeł przydzieli kolejne id od **`100`**. W generatorach wiadomości domyślne **`id: 0`** trafia na **ekran laptopa** (ten sam blok co startowy „ekran”). Żeby uniknąć przypadkowego nadpisania, przy auto-id ustaw **`id: -1`**, a nie opuszczaj pola.

Nie są stosowane do geometrii **`pose.orientation`** (wewnętrznie blok jest jak prostopadłościan wyrównany do osi).

Zarezerwowane id w domyślnej scenie: **`0`** (ekran tekstury z laptopa), **`1–3`** (startowe bloki). Używaj innych id (np. `100+`), żeby nie zastępować ich przypadkiem.

Przykład (czerwony sześcian 0.5 m w punkcie `(2, 1, 0)`, id `42`):

```bash
ros2 topic pub --once /xreal/virtual_scene/add_block visualization_msgs/msg/Marker "{header: {frame_id: ''}, ns: '', id: 42, type: 1, action: 0, pose: {position: {x: 2.0, y: 1.0, z: 0.0}, orientation: {w: 1.0}}, scale: {x: 0.5, y: 0.5, z: 0.5}, color: {r: 1.0, g: 0.0, b: 0.0, a: 1.0}}"
```

Bloki trafiają do renderu kamery oraz do **`/xreal/virtual_scene/markers`** (RViz: `MarkerArray`, ramka **`xreal_imu`**).

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

## Lekki viewer C++ (płynniejszy niż rqt_image_view)

```bash
cd /home/rafal/Web_Speech_remote_control/teleop_ws
source /opt/ros/humble/setup.bash
source install/setup.bash
ros2 run teleop_moving_window desktop_screen_viewer_node --ros-args \
  -p image_topic:=/desktop/screen/image_raw \
  -p display_fps:=60.0 \
  -p fullscreen:=true \
  -p drop_if_stale_ms:=60
```
