#pragma once

#include <GLFW/glfw3.h>

#include <memory>
#include <string>

#include "geometry_msgs/msg/point_stamped.hpp"
#include "rclcpp/rclcpp.hpp"
#include "sensor_msgs/msg/imu.hpp"
#include "std_msgs/msg/string.hpp"
#include "teleop_xreal_desktop/desktop_capture_backend.hpp"

namespace teleop_xreal_desktop
{

class XrealDesktopRenderer : public rclcpp::Node
{
public:
  XrealDesktopRenderer();
  ~XrealDesktopRenderer() override;

  void run();

private:
  struct EulerAngles
  {
    double roll = 0.0;
    double pitch = 0.0;
    double yaw = 0.0;
  };

  struct PointerState
  {
    bool hovered = false;
    double u = 0.0;
    double v = 0.0;
  };

  void imu_callback(const sensor_msgs::msg::Imu::SharedPtr msg);
  bool init_window();
  void destroy_window();
  bool init_texture();
  void update_texture();
  void capture_frame_if_needed();
  void render_scene();
  void render_textured_monitor();
  void update_projection(int width, int height);
  EulerAngles quaternion_to_euler(const sensor_msgs::msg::Imu & msg) const;
  PointerState project_pointer_to_monitor(double mouse_x, double mouse_y) const;
  void publish_pointer_state(const PointerState & state);
  void publish_button_event(const std::string & value);

  rclcpp::Subscription<sensor_msgs::msg::Imu>::SharedPtr imu_sub_;
  rclcpp::Publisher<geometry_msgs::msg::PointStamped>::SharedPtr pointer_pub_;
  rclcpp::Publisher<std_msgs::msg::String>::SharedPtr button_pub_;

  DesktopCaptureBackendPtr capture_backend_;
  CaptureFrame latest_frame_;
  GLFWwindow * window_ = nullptr;
  unsigned int texture_id_ = 0;

  std::string imu_topic_;
  std::string pointer_topic_;
  std::string button_topic_;
  std::string window_title_;

  int window_width_ = 1280;
  int window_height_ = 720;
  int capture_width_hint_ = 0;
  int capture_height_hint_ = 0;
  double capture_fps_ = 60.0;
  double monitor_distance_ = 2.0;
  double monitor_height_ = 1.2;
  double monitor_aspect_ = 16.0 / 9.0;
  double pose_alpha_ = 0.3;
  bool fullscreen_ = false;
  bool disable_vsync_ = true;

  EulerAngles target_pose_;
  EulerAngles filtered_pose_;
  bool pose_initialized_ = false;
  double last_capture_time_ = 0.0;
  bool last_left_pressed_ = false;
};

}  // namespace teleop_xreal_desktop
