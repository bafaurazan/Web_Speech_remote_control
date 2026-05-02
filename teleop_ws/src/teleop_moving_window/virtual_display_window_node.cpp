// Simple ROS2 node that creates an extra X11 window (virtual display panel).
// Intended as a placeholder "third window" for future desktop/image streaming.

#include <X11/Xatom.h>
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/keysym.h>
#include <X11/extensions/Xrandr.h>
#ifdef None
#undef None
#endif

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <memory>
#include <stdexcept>
#include <string>
#include <thread>

#include "rclcpp/rclcpp.hpp"

class VirtualDisplayWindowNode : public rclcpp::Node
{
public:
  VirtualDisplayWindowNode()
  : Node("virtual_display_window_node")
  {
    declare_parameter("window_title", "Virtual Display 3");
    declare_parameter("window_width", 1280);
    declare_parameter("window_height", 720);
    declare_parameter("position_mode", "left_of_primary");  // left_of_primary|right_of_primary|manual
    declare_parameter("manual_x", 0);
    declare_parameter("manual_y", 0);
    declare_parameter("margin_px", 16);
    declare_parameter("keep_running", true);

    window_title_ = get_parameter("window_title").as_string();
    window_width_ = std::max(160, static_cast<int>(get_parameter("window_width").as_int()));
    window_height_ = std::max(120, static_cast<int>(get_parameter("window_height").as_int()));
    position_mode_ = get_parameter("position_mode").as_string();
    manual_x_ = static_cast<int>(get_parameter("manual_x").as_int());
    manual_y_ = static_cast<int>(get_parameter("manual_y").as_int());
    margin_px_ = std::max(0, static_cast<int>(get_parameter("margin_px").as_int()));
    keep_running_ = get_parameter("keep_running").as_bool();

    open_display_or_throw();
    create_window_or_throw();
  }

  ~VirtualDisplayWindowNode() override
  {
    if (window_ != 0 && display_ != nullptr) {
      XDestroyWindow(display_, window_);
      window_ = 0;
    }
    if (display_ != nullptr) {
      XCloseDisplay(display_);
      display_ = nullptr;
    }
  }

  void run()
  {
    if (!keep_running_) {
      return;
    }

    while (rclcpp::ok() && !closed_) {
      while (XPending(display_) > 0) {
        XEvent ev;
        XNextEvent(display_, &ev);
        handle_event(ev);
      }
      std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
  }

private:
  struct Rect
  {
    int x = 0;
    int y = 0;
    int w = 0;
    int h = 0;
  };

  void open_display_or_throw()
  {
    display_ = XOpenDisplay(nullptr);
    if (display_ == nullptr) {
      throw std::runtime_error("Cannot open X11 display. This node requires X11/XWayland.");
    }
    root_window_ = DefaultRootWindow(display_);
  }

  Rect query_primary_monitor_rect() const
  {
    Rect out{};
    int count = 0;
    XRRMonitorInfo * monitors = XRRGetMonitors(display_, root_window_, True, &count);
    if (monitors != nullptr && count > 0) {
      const XRRMonitorInfo * chosen = nullptr;
      for (int i = 0; i < count; ++i) {
        if (monitors[i].primary) {
          chosen = &monitors[i];
          break;
        }
      }
      if (chosen == nullptr) {
        chosen = &monitors[0];
      }
      out.x = chosen->x;
      out.y = chosen->y;
      out.w = chosen->width;
      out.h = chosen->height;
      XRRFreeMonitors(monitors);
      return out;
    }
    if (monitors != nullptr) {
      XRRFreeMonitors(monitors);
    }

    // Fallback to root geometry.
    XWindowAttributes attrs;
    if (XGetWindowAttributes(display_, root_window_, &attrs) != 0) {
      out.x = 0;
      out.y = 0;
      out.w = attrs.width;
      out.h = attrs.height;
    }
    return out;
  }

  void compute_initial_position(int & x, int & y) const
  {
    if (position_mode_ == "manual") {
      x = manual_x_;
      y = manual_y_;
      return;
    }

    const Rect primary = query_primary_monitor_rect();
    if (position_mode_ == "right_of_primary") {
      x = primary.x + primary.w + margin_px_;
      y = primary.y + margin_px_;
    } else {
      // Default: left_of_primary
      x = primary.x - window_width_ - margin_px_;
      y = primary.y + margin_px_;
    }

    // Keep at least titlebar-visible in root bounds when possible.
    const Rect root = query_primary_monitor_rect();
    if (root.w > 0 && root.h > 0) {
      x = std::max(root.x, x);
      y = std::clamp(y, root.y, std::max(root.y, root.y + root.h - 80));
    }
  }

  void create_window_or_throw()
  {
    int x = 0;
    int y = 0;
    compute_initial_position(x, y);

    int screen = DefaultScreen(display_);
    unsigned long black = BlackPixel(display_, screen);
    unsigned long white = WhitePixel(display_, screen);

    window_ = XCreateSimpleWindow(
      display_,
      root_window_,
      x, y,
      static_cast<unsigned int>(window_width_),
      static_cast<unsigned int>(window_height_),
      1,
      white,
      black);
    if (window_ == 0) {
      throw std::runtime_error("Failed to create X11 window.");
    }

    Atom wm_delete = XInternAtom(display_, "WM_DELETE_WINDOW", False);
    XSetWMProtocols(display_, window_, &wm_delete, 1);
    wm_delete_atom_ = wm_delete;

    XSelectInput(display_, window_, ExposureMask | StructureNotifyMask | KeyPressMask);
    XStoreName(display_, window_, window_title_.c_str());

    XMapWindow(display_, window_);
    XFlush(display_);

    RCLCPP_INFO(
      get_logger(),
      "Virtual display window created: title='%s' size=%dx%d position_mode=%s",
      window_title_.c_str(), window_width_, window_height_, position_mode_.c_str());
    RCLCPP_INFO(
      get_logger(),
      "Tip: stream this region with desktop_screen_stream_node using capture_x/capture_y/capture_width/capture_height.");
  }

  void handle_event(const XEvent & ev)
  {
    if (ev.type == ClientMessage) {
      if (static_cast<Atom>(ev.xclient.data.l[0]) == wm_delete_atom_) {
        closed_ = true;
      }
      return;
    }

    if (ev.type == KeyPress) {
      // Quick exit with q or Esc.
      KeySym keysym = XLookupKeysym(const_cast<XKeyEvent *>(&ev.xkey), 0);
      if (keysym == XK_q || keysym == XK_Escape) {
        closed_ = true;
      }
    }
  }

private:
  Display * display_ = nullptr;
  Window root_window_ = 0;
  Window window_ = 0;
  Atom wm_delete_atom_ = 0;
  bool closed_ = false;

  std::string window_title_;
  std::string position_mode_;
  int window_width_ = 1280;
  int window_height_ = 720;
  int manual_x_ = 0;
  int manual_y_ = 0;
  int margin_px_ = 16;
  bool keep_running_ = true;
};

int main(int argc, char ** argv)
{
  rclcpp::init(argc, argv);
  try {
    auto node = std::make_shared<VirtualDisplayWindowNode>();
    node->run();
  } catch (const std::exception & e) {
    fprintf(stderr, "virtual_display_window_node error: %s\n", e.what());
  }
  rclcpp::shutdown();
  return 0;
}
