# teleop_moving_window

Node `imu_virtual_camera.py` tworzy wirtualną scenę 3D sterowaną orientacją IMU i publikuje ją jednocześnie jako:

- obraz kamery: `/xreal/camera/image_raw` (`sensor_msgs/Image`),
- markery do RViz2: `/xreal/virtual_scene/markers` (`visualization_msgs/MarkerArray`).

Dodatkowo możesz dynamicznie dodawać nowe bloki przez topic:

- `/xreal/virtual_scene/add_block` (`visualization_msgs/Marker`, tylko `type=CUBE`).

## Wymagania

- ROS2 (testowane z Humble)
- Python3
- pakiety Python:
  - `pyvista`
  - `numpy`
  - `scipy`
  - `cv_bridge`
  - `opencv-python`

## Uruchomienie noda

```bash
source /opt/ros/humble/setup.bash
python3 /home/rafal/Web_Speech_remote_control/teleop_ws/src/teleop_moving_window/imu_virtual_camera.py
```

Node:
- subskrybuje IMU z `/xreal/imu/data`,
- subskrybuje obraz z laptopa z `/laptop/camera/image_raw` (używany jako tekstura na jednym bloku-ekranie),
- publikuje obraz na `/xreal/camera/image_raw`,
- publikuje markery na `/xreal/virtual_scene/markers`,
- publikuje statyczny TF: `xreal_imu -> xreal_camera_frame`.

## Rozdzielczość wyjścia `/xreal/camera/image_raw`

Node `imu_virtual_camera.py` ma parametry:
- `output_width` (domyślnie `1280`)
- `output_height` (domyślnie `720`)

Przykład (FullHD):

```bash
python3 /home/rafal/Web_Speech_remote_control/teleop_ws/src/teleop_moving_window/imu_virtual_camera.py \
  --ros-args \
  -p output_width:=1920 \
  -p output_height:=1080
```

Po starcie node loguje ustawioną rozdzielczość.

## Podgląd obrazu kamery

```bash
ros2 run rqt_image_view rqt_image_view
```

Wybierz topic:
- `/xreal/camera/image_raw`

## Konfiguracja RViz2 (żeby widzieć bloki)

1. Uruchom RViz2.
2. Ustaw `Global Options -> Fixed Frame` na:
   - `xreal_imu`
3. Kliknij `Add` i dodaj display:
   - `MarkerArray`
4. W `MarkerArray` ustaw:
   - `Topic = /xreal/virtual_scene/markers`
   - `Reliability Policy = Reliable` (jeśli opcja jest dostępna)
   - `Durability Policy = Transient Local` (jeśli opcja jest dostępna)
5. Ustaw widok kamery RViz (`Orbit`/`TopDownOrtho`) i oddal kamerę, bo obiekty są kilka metrów od środka.

## Dodawanie nowego bloku przez ROS2

Przykład (ten sam, którego używasz):

```bash
ros2 topic pub --once /xreal/virtual_scene/add_block visualization_msgs/msg/Marker "{
  id: 10,
  type: 1,
  pose: { position: { x: 2.0, y: 1.0, z: 0.0 } },
  scale: { x: 0.8, y: 0.8, z: 0.8 },
  color: { r: 1.0, g: 0.3, b: 0.0, a: 1.0 }
}"
```

Uwagi:
- `type: 1` oznacza `CUBE`.
- `id` powinno być unikalne dla nowego obiektu.
- `scale` musi być dodatnie; gdy podasz `0`, node użyje wartości domyślnej `1.0`.
- Kanał `a` (alpha) warto ustawić na `1.0`, żeby blok był w pełni widoczny.
- Blok `id=0` jest specjalnym „ekranem” z teksturą kamery laptopa; pozostałe bloki są kolorowe.

## Szybka diagnostyka

Lista topiców:

```bash
ros2 topic list | rg xreal/virtual_scene
```

Podgląd markerów:

```bash
ros2 topic echo /xreal/virtual_scene/markers --once
```

Podgląd statycznego TF:

```bash
ros2 topic echo /tf_static --once
```

## Stream z kamery laptopa do ROS2

Nowy node: `laptop_camera_stream_node.py`

Publikuje obraz z kamery laptopa jako `sensor_msgs/Image` (OpenCV + cv_bridge), domyślnie na:
- `/laptop/camera/image_raw`

Uruchomienie:

```bash
source /opt/ros/humble/setup.bash
python3 /home/rafal/Web_Speech_remote_control/teleop_ws/src/teleop_moving_window/laptop_camera_stream_node.py
```

Uruchomienie z parametrami:

```bash
python3 /home/rafal/Web_Speech_remote_control/teleop_ws/src/teleop_moving_window/laptop_camera_stream_node.py \
  --ros-args \
  -p camera_index:=0 \
  -p fps:=30.0 \
  -p width:=1280 \
  -p height:=720 \
  -p image_topic:=/laptop/camera/image_raw \
  -p frame_id:=laptop_camera_frame
```

Opis parametrów:
- `camera_index` - indeks kamery w systemie (najczęściej `0`)
- `fps` - docelowa częstotliwość publikacji
- `width`, `height` - żądana rozdzielczość
- `image_topic` - topic wyjściowy obrazu
- `frame_id` - `frame_id` w nagłówku wiadomości `Image`

Podgląd:

```bash
ros2 run rqt_image_view rqt_image_view
```

Wybierz topic:
- `/laptop/camera/image_raw`
