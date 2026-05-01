wstępna paczka ale chyba będzie usuwana

# teleop_xreal_desktop

MVP pakietu pod niskolatencyjny tryb `XREAL jako wyświetlacz`.

## Założenia architektoniczne

Ten pakiet implementuje granicę między ROS2 i rendererem:

- w ROS2 zostają:
  - orientacja głowy z `/xreal/imu/data`,
  - logika sceny,
  - znormalizowane eventy kursora i kliknięć dla przyszłego mostka inputu,
- poza ROS2 zostają:
  - piksele desktopu,
  - desktop capture,
  - końcowy render OpenGL do okna/wyświetlacza.

To jest celowe: jeśli desktop ma zachowywać się jak prawdziwy monitor, nie warto przenosić końcowego obrazu przez `sensor_msgs/Image`.

## Wybrany stack MVP

- `C++`
- `rclcpp`
- `GLFW + OpenGL`
- `X11` root-window capture

PipeWire nie jest jeszcze zaimplementowany w tym MVP. Backend został wydzielony tak, żeby później dało się dodać wariant Wayland/PipeWire bez przebudowy renderera.

## Co robi MVP

- subskrybuje `sensor_msgs/msg/Imu` z `imu_topic`,
- przechwytuje obraz desktopu natywnie przez X11,
- renderuje jeden textured plane jako wirtualny monitor w przestrzeni 3D,
- obraca kamerę zgodnie z orientacją głowy,
- publikuje znormalizowaną pozycję kursora na:
  - `/xreal_desktop/input/pointer_norm`
- publikuje kliknięcie myszy na:
  - `/xreal_desktop/input/button`

## Budowanie

```bash
cd /home/rafal/Web_Speech_remote_control/teleop_ws
source /opt/ros/humble/setup.bash
colcon build --packages-select teleop_xreal_desktop
source install/setup.bash
```

## Uruchamianie

```bash
ros2 launch teleop_xreal_desktop xreal_desktop_renderer.launch.py
```

Przykład z własnym IMU topic:

```bash
ros2 launch teleop_xreal_desktop xreal_desktop_renderer.launch.py \
  imu_topic:=/xreal/imu/data \
  window_width:=1920 \
  window_height:=1080 \
  capture_fps:=60.0
```

## Parametry

- `imu_topic` - topic z orientacją głowy jako `sensor_msgs/Imu`
- `window_width`, `window_height` - rozdzielczość renderera
- `capture_fps` - docelowy FPS przechwytywania desktopu
- `monitor_distance` - odległość wirtualnego monitora od kamery
- `monitor_height` - wysokość wirtualnego monitora
- `pose_alpha` - wygładzenie ruchu głowy w rendererze
- `fullscreen` - fullscreen na wyświetlaczu XREAL
- `disable_vsync` - wyłącza vsync dla niższego opóźnienia

## Input path w MVP

Ten pakiet nie wstrzykuje jeszcze inputu do systemu desktopowego. Zamiast tego przygotowuje ścieżkę:

1. renderer publikuje znormalizowany punkt trafienia kursora na monitorze,
2. renderer publikuje event kliknięcia,
3. osobny `desktop_input_bridge` może później zamienić te dane na prawdziwe eventy myszy i klawiatury.

To rozdziela low-latency render od integracji z desktopem i pozwala mierzyć opóźnienie każdego etapu osobno.
