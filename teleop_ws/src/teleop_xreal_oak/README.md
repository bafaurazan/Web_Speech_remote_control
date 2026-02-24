# teleop_xreal_oak

## XREAL IMU (ROS 2) + Madgwick filter

Ta paczka zawiera node `xreal_imu`, który łączy się z okularami XREAL (TCP)
i publikuje surowe dane IMU jako `sensor_msgs/msg/Imu` na topicu:

- `/xreal/imu/data_raw` (gyro + accel, bez orientacji)

Orientacja jest wyliczana przez gotową paczkę `imu_filter_madgwick` i publikowana na:

- `/xreal/imu/data`

### Uruchomienie

```bash
source /opt/ros/humble/setup.bash
source ~/Web_Speech_remote_control/teleop_ws/install/setup.bash

ros2 launch teleop_xreal_oak xreal_imu.launch.py
```

### Najważniejsze parametry

- `ip` (default: `169.254.2.1`)
- `port` (default: `52998`)
- `frame_id` (default: `xreal_imu`)
- `gyro_in_degs` (default: `true`) – jeśli IMU podaje deg/s, node przeliczy na rad/s
- `accel_in_g` (default: `true`) – jeśli IMU podaje w g, node przeliczy na m/s^2
- `gyro_bias_calib_samples` (default: `500`) – ile próbek uśrednić na starcie do biasu żyroskopu