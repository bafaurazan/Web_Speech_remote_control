// Lightweight C++ viewer for /desktop/screen/image_raw.
// Goal: lower display overhead vs rqt_image_view for smoother playback.

#include <algorithm>
#include <atomic>
#include <chrono>
#include <mutex>
#include <string>
#include <vector>

#include <opencv2/core.hpp>
#include <opencv2/highgui.hpp>
#include <opencv2/imgproc.hpp>

#include "rclcpp/rclcpp.hpp"
#include "rclcpp/qos.hpp"
#include "sensor_msgs/image_encodings.hpp"
#include "sensor_msgs/msg/image.hpp"

class DesktopScreenViewerNode : public rclcpp::Node
{
public:
  DesktopScreenViewerNode()
  : Node("desktop_screen_viewer_node")
  {
    declare_parameter("image_topic", "/desktop/screen/image_raw");
    declare_parameter("window_name", "Desktop Screen Viewer");
    declare_parameter("display_fps", 120.0);
    declare_parameter("fullscreen", false);
    declare_parameter("smooth_resize", false);
    declare_parameter("drop_if_stale_ms", 250);

    image_topic_ = get_parameter("image_topic").as_string();
    window_name_ = get_parameter("window_name").as_string();
    display_fps_ = std::max(1.0, get_parameter("display_fps").as_double());
    fullscreen_ = get_parameter("fullscreen").as_bool();
    smooth_resize_ = get_parameter("smooth_resize").as_bool();
    drop_if_stale_ms_ = std::max(0, static_cast<int>(get_parameter("drop_if_stale_ms").as_int()));

    auto qos = rclcpp::QoS(rclcpp::KeepLast(1));
    qos.reliability(RMW_QOS_POLICY_RELIABILITY_BEST_EFFORT);
    qos.history(RMW_QOS_POLICY_HISTORY_KEEP_LAST);
    qos.durability(RMW_QOS_POLICY_DURABILITY_VOLATILE);

    sub_ = create_subscription<sensor_msgs::msg::Image>(
      image_topic_, qos,
      std::bind(&DesktopScreenViewerNode::image_callback, this, std::placeholders::_1));

    cv::namedWindow(window_name_, cv::WINDOW_NORMAL);
    if (fullscreen_) {
      cv::setWindowProperty(window_name_, cv::WND_PROP_FULLSCREEN, cv::WINDOW_FULLSCREEN);
    }

    const auto period = std::chrono::duration<double>(1.0 / display_fps_);
    render_timer_ = create_wall_timer(
      std::chrono::duration_cast<std::chrono::nanoseconds>(period),
      std::bind(&DesktopScreenViewerNode::render_tick, this));

    RCLCPP_INFO(
      get_logger(),
      "Desktop viewer started: topic=%s display_fps=%.1f fullscreen=%s",
      image_topic_.c_str(), display_fps_, fullscreen_ ? "true" : "false");
  }

  ~DesktopScreenViewerNode() override
  {
    cv::destroyWindow(window_name_);
  }

private:
  void image_callback(const sensor_msgs::msg::Image::SharedPtr msg)
  {
    if (msg->data.empty() || msg->width == 0 || msg->height == 0) {
      return;
    }

    cv::Mat decoded;
    if (!decode_image(*msg, decoded)) {
      RCLCPP_WARN_THROTTLE(
        get_logger(), *get_clock(), 2000,
        "Unsupported image encoding '%s' on topic '%s'",
        msg->encoding.c_str(), image_topic_.c_str());
      return;
    }

    {
      std::scoped_lock<std::mutex> lock(frame_mutex_);
      latest_frame_ = decoded;
      latest_stamp_ = msg->header.stamp;
      frame_ready_ = true;
    }
  }

  bool decode_image(const sensor_msgs::msg::Image & msg, cv::Mat & out)
  {
    const int width = static_cast<int>(msg.width);
    const int height = static_cast<int>(msg.height);
    const int step = static_cast<int>(msg.step);

    if (msg.encoding == sensor_msgs::image_encodings::BGR8) {
      cv::Mat view(height, width, CV_8UC3, const_cast<unsigned char *>(msg.data.data()), step);
      out = view.clone();
      return true;
    }
    if (msg.encoding == sensor_msgs::image_encodings::BGRA8) {
      cv::Mat view(height, width, CV_8UC4, const_cast<unsigned char *>(msg.data.data()), step);
      cv::cvtColor(view, out, cv::COLOR_BGRA2BGR);
      return true;
    }
    if (msg.encoding == sensor_msgs::image_encodings::RGB8) {
      cv::Mat view(height, width, CV_8UC3, const_cast<unsigned char *>(msg.data.data()), step);
      cv::cvtColor(view, out, cv::COLOR_RGB2BGR);
      return true;
    }
    if (msg.encoding == sensor_msgs::image_encodings::MONO8) {
      cv::Mat view(height, width, CV_8UC1, const_cast<unsigned char *>(msg.data.data()), step);
      cv::cvtColor(view, out, cv::COLOR_GRAY2BGR);
      return true;
    }
    return false;
  }

  void render_tick()
  {
    cv::Mat frame;
    rclcpp::Time stamp(0, 0, get_clock()->get_clock_type());
    {
      std::scoped_lock<std::mutex> lock(frame_mutex_);
      if (!frame_ready_) {
        cv::waitKey(1);
        return;
      }
      frame = latest_frame_;
      stamp = latest_stamp_;
    }

    if (drop_if_stale_ms_ > 0) {
      const auto age_ms = (now() - stamp).nanoseconds() / 1000000LL;
      if (age_ms > drop_if_stale_ms_) {
        cv::waitKey(1);
        return;
      }
    }

    if (!smooth_resize_) {
      cv::setWindowProperty(window_name_, cv::WND_PROP_AUTOSIZE, 1);
    }

    cv::imshow(window_name_, frame);
    const int key = cv::waitKey(1);
    if (key == 27 || key == 'q' || key == 'Q') {
      rclcpp::shutdown();
    }
  }

private:
  rclcpp::Subscription<sensor_msgs::msg::Image>::SharedPtr sub_;
  rclcpp::TimerBase::SharedPtr render_timer_;

  std::string image_topic_;
  std::string window_name_;
  double display_fps_ = 120.0;
  bool fullscreen_ = false;
  bool smooth_resize_ = false;
  int drop_if_stale_ms_ = 250;

  std::mutex frame_mutex_;
  cv::Mat latest_frame_;
  rclcpp::Time latest_stamp_{0, 0, RCL_ROS_TIME};
  bool frame_ready_ = false;
};

int main(int argc, char ** argv)
{
  rclcpp::init(argc, argv);
  try {
    auto node = std::make_shared<DesktopScreenViewerNode>();
    rclcpp::spin(node);
  } catch (const std::exception & e) {
    fprintf(stderr, "desktop_screen_viewer_node error: %s\n", e.what());
  }
  rclcpp::shutdown();
  return 0;
}
