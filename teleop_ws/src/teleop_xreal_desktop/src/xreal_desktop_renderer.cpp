#include "teleop_xreal_desktop/xreal_desktop_renderer.hpp"

#include <GL/gl.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <stdexcept>
#include <string>

#include "teleop_xreal_desktop/x11_capture_backend.hpp"

namespace teleop_xreal_desktop
{

namespace
{

constexpr double kPi = 3.14159265358979323846;

double clamp01(double value)
{
  return std::max(0.0, std::min(1.0, value));
}

}  // namespace

XrealDesktopRenderer::XrealDesktopRenderer()
: Node("xreal_desktop_renderer")
{
  declare_parameter("imu_topic", "/xreal/imu/data");
  declare_parameter("pointer_topic", "/xreal_desktop/input/pointer_norm");
  declare_parameter("button_topic", "/xreal_desktop/input/button");
  declare_parameter("window_title", "XREAL Desktop MVP");
  declare_parameter("window_width", 1920);
  declare_parameter("window_height", 1080);
  declare_parameter("capture_fps", 60.0);
  declare_parameter("monitor_distance", 2.0);
  declare_parameter("monitor_height", 1.2);
  declare_parameter("pose_alpha", 0.35);
  declare_parameter("fullscreen", false);
  declare_parameter("disable_vsync", true);

  imu_topic_ = get_parameter("imu_topic").as_string();
  pointer_topic_ = get_parameter("pointer_topic").as_string();
  button_topic_ = get_parameter("button_topic").as_string();
  window_title_ = get_parameter("window_title").as_string();
  window_width_ = get_parameter("window_width").as_int();
  window_height_ = get_parameter("window_height").as_int();
  capture_fps_ = get_parameter("capture_fps").as_double();
  monitor_distance_ = get_parameter("monitor_distance").as_double();
  monitor_height_ = get_parameter("monitor_height").as_double();
  pose_alpha_ = get_parameter("pose_alpha").as_double();
  fullscreen_ = get_parameter("fullscreen").as_bool();
  disable_vsync_ = get_parameter("disable_vsync").as_bool();

  capture_fps_ = std::max(1.0, capture_fps_);
  monitor_distance_ = std::max(0.2, monitor_distance_);
  monitor_height_ = std::max(0.2, monitor_height_);
  pose_alpha_ = std::clamp(pose_alpha_, 0.01, 1.0);

  pointer_pub_ = create_publisher<geometry_msgs::msg::PointStamped>(pointer_topic_, 10);
  button_pub_ = create_publisher<std_msgs::msg::String>(button_topic_, 10);
  imu_sub_ = create_subscription<sensor_msgs::msg::Imu>(
    imu_topic_, 20, std::bind(&XrealDesktopRenderer::imu_callback, this, std::placeholders::_1));

  capture_backend_ = std::make_shared<X11CaptureBackend>();

  RCLCPP_INFO(get_logger(), "Renderer stack: C++ + OpenGL + GLFW + X11 capture");
  RCLCPP_INFO(
    get_logger(),
    "ROS2 boundary: IMU and input topics stay in ROS2, desktop pixels stay native.");
}

XrealDesktopRenderer::~XrealDesktopRenderer()
{
  destroy_window();
}

void XrealDesktopRenderer::run()
{
  if (!init_window() || !init_texture()) {
    throw std::runtime_error("Failed to initialize renderer window or texture.");
  }

  while (rclcpp::ok() && !glfwWindowShouldClose(window_)) {
    rclcpp::spin_some(get_node_base_interface());

    filtered_pose_.roll += pose_alpha_ * (target_pose_.roll - filtered_pose_.roll);
    filtered_pose_.pitch += pose_alpha_ * (target_pose_.pitch - filtered_pose_.pitch);
    filtered_pose_.yaw += pose_alpha_ * (target_pose_.yaw - filtered_pose_.yaw);

    capture_frame_if_needed();
    render_scene();
    glfwPollEvents();
  }
}

void XrealDesktopRenderer::imu_callback(const sensor_msgs::msg::Imu::SharedPtr msg)
{
  target_pose_ = quaternion_to_euler(*msg);
  if (!pose_initialized_) {
    filtered_pose_ = target_pose_;
    pose_initialized_ = true;
  }
}

bool XrealDesktopRenderer::init_window()
{
  if (window_ != nullptr) {
    return true;
  }

  if (glfwInit() == GLFW_FALSE) {
    RCLCPP_ERROR(get_logger(), "glfwInit() failed");
    return false;
  }

  glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 2);
  glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 1);

  GLFWmonitor * monitor = fullscreen_ ? glfwGetPrimaryMonitor() : nullptr;
  window_ = glfwCreateWindow(window_width_, window_height_, window_title_.c_str(), monitor, nullptr);
  if (window_ == nullptr) {
    RCLCPP_ERROR(get_logger(), "glfwCreateWindow() failed");
    glfwTerminate();
    return false;
  }

  glfwMakeContextCurrent(window_);
  glfwSwapInterval(disable_vsync_ ? 0 : 1);

  glEnable(GL_BLEND);
  glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
  glEnable(GL_TEXTURE_2D);
  glClearColor(0.08f, 0.08f, 0.10f, 1.0f);

  int framebuffer_width = 0;
  int framebuffer_height = 0;
  glfwGetFramebufferSize(window_, &framebuffer_width, &framebuffer_height);
  update_projection(framebuffer_width, framebuffer_height);
  return true;
}

void XrealDesktopRenderer::destroy_window()
{
  if (texture_id_ != 0U) {
    glDeleteTextures(1, &texture_id_);
    texture_id_ = 0;
  }

  if (window_ != nullptr) {
    glfwDestroyWindow(window_);
    window_ = nullptr;
  }

  glfwTerminate();
}

bool XrealDesktopRenderer::init_texture()
{
  glGenTextures(1, &texture_id_);
  glBindTexture(GL_TEXTURE_2D, texture_id_);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  return texture_id_ != 0U;
}

void XrealDesktopRenderer::update_texture()
{
  if (latest_frame_.width <= 0 || latest_frame_.height <= 0 || latest_frame_.rgba.empty()) {
    return;
  }

  monitor_aspect_ = static_cast<double>(latest_frame_.width) / static_cast<double>(latest_frame_.height);
  glBindTexture(GL_TEXTURE_2D, texture_id_);
  glTexImage2D(
    GL_TEXTURE_2D, 0, GL_RGBA, latest_frame_.width, latest_frame_.height, 0, GL_RGBA,
    GL_UNSIGNED_BYTE, latest_frame_.rgba.data());
}

void XrealDesktopRenderer::capture_frame_if_needed()
{
  const double now = glfwGetTime();
  const double capture_period = 1.0 / capture_fps_;
  if ((now - last_capture_time_) < capture_period) {
    return;
  }

  if (capture_backend_ != nullptr && capture_backend_->capture(latest_frame_)) {
    update_texture();
  }
  last_capture_time_ = now;
}

void XrealDesktopRenderer::render_scene()
{
  int framebuffer_width = 0;
  int framebuffer_height = 0;
  glfwGetFramebufferSize(window_, &framebuffer_width, &framebuffer_height);
  update_projection(framebuffer_width, framebuffer_height);

  glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
  glEnable(GL_DEPTH_TEST);
  glMatrixMode(GL_MODELVIEW);
  glLoadIdentity();

  glRotated(-filtered_pose_.roll * 180.0 / kPi, 0.0, 1.0, 0.0);
  glRotated(-filtered_pose_.pitch * 180.0 / kPi, 1.0, 0.0, 0.0);
  glRotated(-filtered_pose_.yaw * 180.0 / kPi, 0.0, 0.0, 1.0);

  render_textured_monitor();

  double mouse_x = 0.0;
  double mouse_y = 0.0;
  glfwGetCursorPos(window_, &mouse_x, &mouse_y);
  const auto pointer_state = project_pointer_to_monitor(mouse_x, mouse_y);
  publish_pointer_state(pointer_state);

  const bool left_pressed = glfwGetMouseButton(window_, GLFW_MOUSE_BUTTON_LEFT) == GLFW_PRESS;
  if (left_pressed && !last_left_pressed_ && pointer_state.hovered) {
    publish_button_event("left_click");
  }
  last_left_pressed_ = left_pressed;

  glfwSwapBuffers(window_);
}

void XrealDesktopRenderer::render_textured_monitor()
{
  const double half_width = (monitor_height_ * monitor_aspect_) * 0.5;
  const double half_height = monitor_height_ * 0.5;

  glBindTexture(GL_TEXTURE_2D, texture_id_);
  glBegin(GL_QUADS);
  glTexCoord2f(0.0f, 1.0f);
  glVertex3d(-half_width, monitor_distance_, -half_height);
  glTexCoord2f(1.0f, 1.0f);
  glVertex3d(half_width, monitor_distance_, -half_height);
  glTexCoord2f(1.0f, 0.0f);
  glVertex3d(half_width, monitor_distance_, half_height);
  glTexCoord2f(0.0f, 0.0f);
  glVertex3d(-half_width, monitor_distance_, half_height);
  glEnd();
}

void XrealDesktopRenderer::update_projection(int width, int height)
{
  window_width_ = std::max(1, width);
  window_height_ = std::max(1, height);
  const double aspect = static_cast<double>(window_width_) / static_cast<double>(window_height_);
  const double fov_y_deg = 70.0;
  const double z_near = 0.05;
  const double z_far = 100.0;
  const double top = std::tan(fov_y_deg * 0.5 * kPi / 180.0) * z_near;
  const double right = top * aspect;

  glViewport(0, 0, window_width_, window_height_);
  glMatrixMode(GL_PROJECTION);
  glLoadIdentity();
  glFrustum(-right, right, -top, top, z_near, z_far);
}

XrealDesktopRenderer::EulerAngles XrealDesktopRenderer::quaternion_to_euler(
  const sensor_msgs::msg::Imu & msg) const
{
  const double x = msg.orientation.x;
  const double y = msg.orientation.y;
  const double z = msg.orientation.z;
  const double w = msg.orientation.w;

  EulerAngles euler;
  const double sinr_cosp = 2.0 * (w * x + y * z);
  const double cosr_cosp = 1.0 - 2.0 * (x * x + y * y);
  euler.roll = std::atan2(sinr_cosp, cosr_cosp);

  const double sinp = 2.0 * (w * y - z * x);
  if (std::abs(sinp) >= 1.0) {
    euler.pitch = std::copysign(kPi / 2.0, sinp);
  } else {
    euler.pitch = std::asin(sinp);
  }

  const double siny_cosp = 2.0 * (w * z + x * y);
  const double cosy_cosp = 1.0 - 2.0 * (y * y + z * z);
  euler.yaw = std::atan2(siny_cosp, cosy_cosp);
  return euler;
}

XrealDesktopRenderer::PointerState XrealDesktopRenderer::project_pointer_to_monitor(
  double mouse_x, double mouse_y) const
{
  PointerState state;

  const double nx = ((2.0 * mouse_x) / static_cast<double>(window_width_)) - 1.0;
  const double ny = 1.0 - ((2.0 * mouse_y) / static_cast<double>(window_height_));

  const double aspect = static_cast<double>(window_width_) / static_cast<double>(window_height_);
  const double tan_half_fov = std::tan(70.0 * 0.5 * kPi / 180.0);

  double rx = nx * tan_half_fov * aspect;
  double ry = 1.0;
  double rz = ny * tan_half_fov;

  const double cp = std::cos(filtered_pose_.pitch);
  const double sp = std::sin(filtered_pose_.pitch);
  const double cr = std::cos(filtered_pose_.roll);
  const double sr = std::sin(filtered_pose_.roll);
  const double cy = std::cos(filtered_pose_.yaw);
  const double sy = std::sin(filtered_pose_.yaw);

  // Camera-space -> world-space for axes x-right, y-forward, z-up.
  const double x1 = cy * rx - sy * rz;
  const double y1 = ry;
  const double z1 = sy * rx + cy * rz;

  const double x2 = x1;
  const double y2 = cp * y1 - sp * z1;
  const double z2 = sp * y1 + cp * z1;

  const double dir_x = cr * x2 + sr * y2;
  const double dir_y = -sr * x2 + cr * y2;
  const double dir_z = z2;

  if (std::abs(dir_y) < 1e-6) {
    return state;
  }

  const double t = monitor_distance_ / dir_y;
  if (t <= 0.0) {
    return state;
  }

  const double hit_x = dir_x * t;
  const double hit_z = dir_z * t;

  const double half_width = (monitor_height_ * monitor_aspect_) * 0.5;
  const double half_height = monitor_height_ * 0.5;
  if (std::abs(hit_x) > half_width || std::abs(hit_z) > half_height) {
    return state;
  }

  state.hovered = true;
  state.u = clamp01((hit_x + half_width) / (2.0 * half_width));
  state.v = clamp01(1.0 - ((hit_z + half_height) / (2.0 * half_height)));
  return state;
}

void XrealDesktopRenderer::publish_pointer_state(const PointerState & state)
{
  if (!state.hovered) {
    return;
  }

  geometry_msgs::msg::PointStamped msg;
  msg.header.stamp = now();
  msg.header.frame_id = "virtual_monitor_0";
  msg.point.x = state.u;
  msg.point.y = state.v;
  msg.point.z = 0.0;
  pointer_pub_->publish(msg);
}

void XrealDesktopRenderer::publish_button_event(const std::string & value)
{
  std_msgs::msg::String msg;
  msg.data = value;
  button_pub_->publish(msg);
}

}  // namespace teleop_xreal_desktop
