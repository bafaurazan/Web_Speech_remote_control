// Low-latency desktop screen capture publisher for ROS2 (Linux/X11).
// Publishes sensor_msgs/Image with encoding "bgra8".
//
// Notes:
// - This node is optimized for low latency, not for portability.
// - On Wayland this approach may not work; it targets X11 sessions.

#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/extensions/Xfixes.h>
#include <X11/extensions/Xrandr.h>
#ifdef None
#undef None
#endif

#include <algorithm>
#include <chrono>
#include <cstring>
#include <cctype>
#include <memory>
#include <stdexcept>
#include <string>

#include "rclcpp/rclcpp.hpp"
#include "rclcpp/qos.hpp"
#include "sensor_msgs/msg/image.hpp"
#include "sensor_msgs/image_encodings.hpp"

class DesktopScreenStreamNode : public rclcpp::Node
{
public:
  DesktopScreenStreamNode()
  : Node("desktop_screen_stream_node")
  {
    declare_parameter("fps", 144.0);
    declare_parameter("image_topic", "/desktop/screen/image_raw");
    declare_parameter("frame_id", "desktop_screen_frame");
    declare_parameter("capture_x", 0);
    declare_parameter("capture_y", 0);
    declare_parameter("capture_width", 0);   // 0 => auto (full root width minus x)
    declare_parameter("capture_height", 0);  // 0 => auto (full root height minus y)
    declare_parameter("show_cursor", true);
    declare_parameter("primary_monitor_only", true);
    declare_parameter("prefer_internal_monitor", true);
    declare_parameter("monitor_name", "");  // e.g. "eDP-1", "HDMI-1", "DVI-I-1"
    declare_parameter("geometry_refresh_every_frames", 300);  // 0 disables periodic refresh

    fps_ = std::max(1.0, get_parameter("fps").as_double());
    image_topic_ = get_parameter("image_topic").as_string();
    frame_id_ = get_parameter("frame_id").as_string();
    capture_offset_x_ = std::max(0, static_cast<int>(get_parameter("capture_x").as_int()));
    capture_offset_y_ = std::max(0, static_cast<int>(get_parameter("capture_y").as_int()));
    capture_x_ = capture_offset_x_;
    capture_y_ = capture_offset_y_;
    capture_width_req_ = std::max(0, static_cast<int>(get_parameter("capture_width").as_int()));
    capture_height_req_ = std::max(0, static_cast<int>(get_parameter("capture_height").as_int()));
    show_cursor_ = get_parameter("show_cursor").as_bool();
    primary_monitor_only_ = get_parameter("primary_monitor_only").as_bool();
    prefer_internal_monitor_ = get_parameter("prefer_internal_monitor").as_bool();
    monitor_name_ = get_parameter("monitor_name").as_string();
    geometry_refresh_every_frames_ = std::max(
      0, static_cast<int>(get_parameter("geometry_refresh_every_frames").as_int()));

    // Low-latency profile: do not queue old frames.
    auto qos = rclcpp::QoS(rclcpp::KeepLast(1));
    qos.reliability(RMW_QOS_POLICY_RELIABILITY_BEST_EFFORT);
    qos.history(RMW_QOS_POLICY_HISTORY_KEEP_LAST);
    qos.durability(RMW_QOS_POLICY_DURABILITY_VOLATILE);
    image_pub_ = create_publisher<sensor_msgs::msg::Image>(image_topic_, qos);

    open_display();
    refresh_capture_geometry_or_throw();
    prepare_message_buffer();

    const auto timer_period =
      std::chrono::duration<double>(1.0 / fps_);
    timer_ = create_wall_timer(
      std::chrono::duration_cast<std::chrono::nanoseconds>(timer_period),
      std::bind(&DesktopScreenStreamNode::capture_and_publish, this));

    RCLCPP_INFO(
      get_logger(),
      "Desktop screen stream started: topic=%s frame=%s fps=%.1f region=(x=%d,y=%d,w=%d,h=%d) monitor_name='%s'",
      image_topic_.c_str(), frame_id_.c_str(), fps_,
      capture_x_, capture_y_, capture_width_, capture_height_, monitor_name_.c_str());
  }

  ~DesktopScreenStreamNode() override
  {
    close_display();
  }

private:
  void open_display()
  {
    display_ = XOpenDisplay(nullptr);
    if (display_ == nullptr) {
      throw std::runtime_error("Cannot open X11 display. Run under X11 session (or XWayland with access).");
    }
    root_window_ = DefaultRootWindow(display_);
  }

  void close_display()
  {
    if (display_ != nullptr) {
      XCloseDisplay(display_);
      display_ = nullptr;
    }
  }

  void refresh_capture_geometry_or_throw()
  {
    if (primary_monitor_only_ && resolve_primary_monitor_geometry()) {
      return;
    }

    XWindowAttributes attrs;
    if (XGetWindowAttributes(display_, root_window_, &attrs) == 0) {
      throw std::runtime_error("Failed to query root window attributes.");
    }

    const int root_width = attrs.width;
    const int root_height = attrs.height;
    if (root_width <= 0 || root_height <= 0) {
      throw std::runtime_error("Invalid root window size from X11.");
    }

    capture_x_ = std::clamp(capture_offset_x_, 0, std::max(0, root_width - 1));
    capture_y_ = std::clamp(capture_offset_y_, 0, std::max(0, root_height - 1));

    const int max_width = root_width - capture_x_;
    const int max_height = root_height - capture_y_;

    capture_width_ = (capture_width_req_ > 0) ? std::min(capture_width_req_, max_width) : max_width;
    capture_height_ = (capture_height_req_ > 0) ? std::min(capture_height_req_, max_height) : max_height;

    if (capture_width_ <= 0 || capture_height_ <= 0) {
      throw std::runtime_error("Computed capture geometry is empty.");
    }
  }

  bool resolve_primary_monitor_geometry()
  {
    int monitor_count = 0;
    XRRMonitorInfo * monitors = XRRGetMonitors(display_, root_window_, True, &monitor_count);
    if (monitors == nullptr || monitor_count <= 0) {
      if (monitors != nullptr) {
        XRRFreeMonitors(monitors);
      }
      return false;
    }

    const XRRMonitorInfo * chosen = nullptr;

    if (!monitor_name_.empty()) {
      for (int i = 0; i < monitor_count; ++i) {
        const char * atom_name = XGetAtomName(display_, monitors[i].name);
        std::string name = atom_name != nullptr ? atom_name : "";
        if (atom_name != nullptr) {
          XFree(const_cast<char *>(atom_name));
        }
        if (name == monitor_name_) {
          chosen = &monitors[i];
          break;
        }
      }
      if (chosen == nullptr) {
        RCLCPP_WARN_THROTTLE(
          get_logger(), *get_clock(), 3000,
          "monitor_name='%s' not found, falling back to auto selection.",
          monitor_name_.c_str());
      }
    }

    if (chosen == nullptr && prefer_internal_monitor_) {
      for (int i = 0; i < monitor_count; ++i) {
        const char * atom_name = XGetAtomName(display_, monitors[i].name);
        std::string monitor_name = atom_name != nullptr ? atom_name : "";
        if (atom_name != nullptr) {
          XFree(const_cast<char *>(atom_name));
        }

        std::string lower = monitor_name;
        std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char ch) {
          return static_cast<char>(std::tolower(ch));
        });

        const bool is_internal =
          lower.rfind("edp", 0) == 0 || lower.rfind("lvds", 0) == 0 || lower.rfind("dsi", 0) == 0;
        if (is_internal) {
          chosen = &monitors[i];
          break;
        }
      }
    }

    if (chosen == nullptr) {
      for (int i = 0; i < monitor_count; ++i) {
        if (monitors[i].primary) {
          chosen = &monitors[i];
          break;
        }
      }
    }
    if (chosen == nullptr) {
      // Fallback: first monitor entry.
      chosen = &monitors[0];
    }

    const int mon_x = chosen->x;
    const int mon_y = chosen->y;
    const int mon_w = chosen->width;
    const int mon_h = chosen->height;

    XRRFreeMonitors(monitors);

    if (mon_w <= 0 || mon_h <= 0) {
      return false;
    }

    // Manual region params become offsets inside selected primary monitor.
    const int rel_x = std::max(0, capture_offset_x_);
    const int rel_y = std::max(0, capture_offset_y_);
    const int max_w = std::max(0, mon_w - rel_x);
    const int max_h = std::max(0, mon_h - rel_y);
    if (max_w <= 0 || max_h <= 0) {
      return false;
    }

    const int req_w = capture_width_req_;
    const int req_h = capture_height_req_;
    capture_width_ = (req_w > 0) ? std::min(req_w, max_w) : max_w;
    capture_height_ = (req_h > 0) ? std::min(req_h, max_h) : max_h;

    capture_x_ = mon_x + rel_x;
    capture_y_ = mon_y + rel_y;
    return capture_width_ > 0 && capture_height_ > 0;
  }

  void prepare_message_buffer()
  {
    // We publish BGRA8 to avoid costly color conversion.
    image_msg_.header.frame_id = frame_id_;
    image_msg_.height = static_cast<uint32_t>(capture_height_);
    image_msg_.width = static_cast<uint32_t>(capture_width_);
    image_msg_.encoding = sensor_msgs::image_encodings::BGRA8;
    image_msg_.is_bigendian = 0;
    image_msg_.step = static_cast<sensor_msgs::msg::Image::_step_type>(capture_width_ * 4);
    image_msg_.data.resize(static_cast<size_t>(image_msg_.step) * image_msg_.height);
  }

  void capture_and_publish()
  {
    if (display_ == nullptr) {
      return;
    }

    // Re-check root geometry occasionally in case resolution/layout changed.
    if (geometry_refresh_every_frames_ > 0) {
      ++geometry_check_counter_;
      if (geometry_check_counter_ >= geometry_refresh_every_frames_) {
        geometry_check_counter_ = 0;
        try {
          const int old_w = capture_width_;
          const int old_h = capture_height_;
          refresh_capture_geometry_or_throw();
          if (capture_width_ != old_w || capture_height_ != old_h) {
            prepare_message_buffer();
            RCLCPP_INFO(
              get_logger(), "Capture region updated: (x=%d,y=%d,w=%d,h=%d)",
              capture_x_, capture_y_, capture_width_, capture_height_);
          }
        } catch (const std::exception & e) {
          RCLCPP_WARN(get_logger(), "Geometry refresh failed: %s", e.what());
        }
      }
    }

    XImage * ximg = XGetImage(
      display_,
      root_window_,
      capture_x_,
      capture_y_,
      static_cast<unsigned int>(capture_width_),
      static_cast<unsigned int>(capture_height_),
      AllPlanes,
      ZPixmap);

    if (ximg == nullptr) {
      RCLCPP_WARN_THROTTLE(get_logger(), *get_clock(), 2000, "XGetImage returned null frame.");
      return;
    }

    // Expect 32-bit pixels from X11 root image for direct BGRA copy.
    const bool fast_path = (ximg->bits_per_pixel == 32);

    if (fast_path) {
      const size_t dst_step = image_msg_.step;
      const size_t src_step = static_cast<size_t>(ximg->bytes_per_line);
      for (int y = 0; y < capture_height_; ++y) {
        std::memcpy(
          image_msg_.data.data() + static_cast<size_t>(y) * dst_step,
          ximg->data + static_cast<size_t>(y) * src_step,
          dst_step);
      }
    } else {
      // Fallback path for uncommon X11 formats; slower but safe.
      for (int y = 0; y < capture_height_; ++y) {
        for (int x = 0; x < capture_width_; ++x) {
          unsigned long pixel = XGetPixel(ximg, x, y);
          const uint8_t r = static_cast<uint8_t>((pixel & ximg->red_mask) >> 16);
          const uint8_t g = static_cast<uint8_t>((pixel & ximg->green_mask) >> 8);
          const uint8_t b = static_cast<uint8_t>(pixel & ximg->blue_mask);

          const size_t idx = static_cast<size_t>(y) * image_msg_.step + static_cast<size_t>(x) * 4;
          image_msg_.data[idx + 0] = b;
          image_msg_.data[idx + 1] = g;
          image_msg_.data[idx + 2] = r;
          image_msg_.data[idx + 3] = 255;
        }
      }
    }

    image_msg_.header.stamp = now();
    if (show_cursor_) {
      overlay_cursor_on_frame();
    }
    image_pub_->publish(image_msg_);
    XDestroyImage(ximg);
  }

  void overlay_cursor_on_frame()
  {
    if (display_ == nullptr) {
      return;
    }

    XFixesCursorImage * cursor = XFixesGetCursorImage(display_);
    if (cursor == nullptr) {
      return;
    }

    const int cursor_w = static_cast<int>(cursor->width);
    const int cursor_h = static_cast<int>(cursor->height);
    if (cursor_w <= 0 || cursor_h <= 0 || cursor->pixels == nullptr) {
      XFree(cursor);
      return;
    }

    // x/y from XFixes are cursor-hotspot coordinates in root space.
    const int cursor_left_root = static_cast<int>(cursor->x) - static_cast<int>(cursor->xhot);
    const int cursor_top_root = static_cast<int>(cursor->y) - static_cast<int>(cursor->yhot);

    // Convert root-space cursor rect to our capture-space rect.
    const int start_x = std::max(0, cursor_left_root - capture_x_);
    const int start_y = std::max(0, cursor_top_root - capture_y_);
    const int end_x = std::min(capture_width_, cursor_left_root - capture_x_ + cursor_w);
    const int end_y = std::min(capture_height_, cursor_top_root - capture_y_ + cursor_h);

    if (start_x >= end_x || start_y >= end_y) {
      XFree(cursor);
      return;
    }

    for (int y = start_y; y < end_y; ++y) {
      for (int x = start_x; x < end_x; ++x) {
        const int cx = x - (cursor_left_root - capture_x_);
        const int cy = y - (cursor_top_root - capture_y_);
        const size_t cursor_idx = static_cast<size_t>(cy) * static_cast<size_t>(cursor_w) + static_cast<size_t>(cx);
        const unsigned long argb = cursor->pixels[cursor_idx];

        // XFixes cursor pixel format: ARGB32
        const uint8_t a = static_cast<uint8_t>((argb >> 24) & 0xFF);
        if (a == 0) {
          continue;
        }
        const uint8_t r = static_cast<uint8_t>((argb >> 16) & 0xFF);
        const uint8_t g = static_cast<uint8_t>((argb >> 8) & 0xFF);
        const uint8_t b = static_cast<uint8_t>(argb & 0xFF);

        const size_t idx = static_cast<size_t>(y) * image_msg_.step + static_cast<size_t>(x) * 4;
        uint8_t & dst_b = image_msg_.data[idx + 0];
        uint8_t & dst_g = image_msg_.data[idx + 1];
        uint8_t & dst_r = image_msg_.data[idx + 2];
        // image_msg_.data[idx + 3] alpha stays opaque for screen frame.

        if (a == 255) {
          dst_b = b;
          dst_g = g;
          dst_r = r;
          continue;
        }

        const float af = static_cast<float>(a) / 255.0F;
        const float inv = 1.0F - af;
        dst_b = static_cast<uint8_t>(std::clamp(inv * static_cast<float>(dst_b) + af * static_cast<float>(b), 0.0F, 255.0F));
        dst_g = static_cast<uint8_t>(std::clamp(inv * static_cast<float>(dst_g) + af * static_cast<float>(g), 0.0F, 255.0F));
        dst_r = static_cast<uint8_t>(std::clamp(inv * static_cast<float>(dst_r) + af * static_cast<float>(r), 0.0F, 255.0F));
      }
    }

    XFree(cursor);
  }

private:
  rclcpp::Publisher<sensor_msgs::msg::Image>::SharedPtr image_pub_;
  rclcpp::TimerBase::SharedPtr timer_;
  sensor_msgs::msg::Image image_msg_;

  Display * display_ = nullptr;
  Window root_window_ = 0;

  std::string image_topic_;
  std::string frame_id_;

  double fps_ = 60.0;
  int capture_x_ = 0;
  int capture_y_ = 0;
  int capture_offset_x_ = 0;
  int capture_offset_y_ = 0;
  int capture_width_req_ = 0;
  int capture_height_req_ = 0;
  int capture_width_ = 0;
  int capture_height_ = 0;
  int geometry_check_counter_ = 0;
  int geometry_refresh_every_frames_ = 300;
  bool show_cursor_ = true;
  bool primary_monitor_only_ = true;
  bool prefer_internal_monitor_ = true;
  std::string monitor_name_;
};

int main(int argc, char ** argv)
{
  rclcpp::init(argc, argv);
  try {
    auto node = std::make_shared<DesktopScreenStreamNode>();
    rclcpp::spin(node);
  } catch (const std::exception & e) {
    fprintf(stderr, "desktop_screen_stream_node error: %s\n", e.what());
  }
  rclcpp::shutdown();
  return 0;
}
