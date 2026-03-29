# teleop_webrtc_joy

## Runtime-configurable speeds

W `bridge_node.py` komendy przyciskowe/glosowe (`forward_rover`, `backward_rover`, `left_rover`, `right_rover`) korzystaja teraz z parametrow ROS2 zamiast stalych:

- `linear_speed` (domyslnie `0.5`)
- `angular_speed` (domyslnie `0.5`)

Parametry mozna ustawic:

### 1) Na starcie

Przy uruchamianiu launch:

```bash
ros2 launch teleop_webrtc_joy webrtc_client.launch.py linear_speed:=0.7 angular_speed:=0.9
```

albo przez glowny launch systemu:

```bash
ros2 launch teleop_bringup teleop_system.launch.py use_google_stun:=False linear_speed:=0.7 angular_speed:=0.9
```

### 2) W trakcie dzialania (bez restartu)

```bash
ros2 param set /teleop_bridge linear_speed 0.8
ros2 param set /teleop_bridge angular_speed 1.0
```

Sprawdzenie aktualnych wartosci:

```bash
ros2 param get /teleop_bridge linear_speed
ros2 param get /teleop_bridge angular_speed
```