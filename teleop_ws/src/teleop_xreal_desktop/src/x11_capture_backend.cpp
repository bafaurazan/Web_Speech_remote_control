#include "teleop_xreal_desktop/x11_capture_backend.hpp"

#include <X11/Xutil.h>

#include <cstring>
#include <stdexcept>

namespace teleop_xreal_desktop
{

X11CaptureBackend::X11CaptureBackend()
{
  display_ = XOpenDisplay(nullptr);
  if (display_ == nullptr) {
    throw std::runtime_error("Failed to open X11 display for desktop capture.");
  }

  root_window_ = DefaultRootWindow(display_);
  if (!ensure_geometry()) {
    throw std::runtime_error("Failed to query X11 root window geometry.");
  }
}

X11CaptureBackend::~X11CaptureBackend()
{
  if (display_ != nullptr) {
    XCloseDisplay(display_);
    display_ = nullptr;
  }
}

bool X11CaptureBackend::capture(CaptureFrame & frame)
{
  if (display_ == nullptr || !ensure_geometry()) {
    return false;
  }

  XImage * image = XGetImage(
    display_, root_window_, 0, 0, static_cast<unsigned int>(width_),
    static_cast<unsigned int>(height_), AllPlanes, ZPixmap);
  if (image == nullptr) {
    return false;
  }

  frame.width = width_;
  frame.height = height_;
  frame.rgba.resize(static_cast<std::size_t>(width_) * static_cast<std::size_t>(height_) * 4U);

  const int bytes_per_pixel = image->bits_per_pixel / 8;
  for (int y = 0; y < height_; ++y) {
    for (int x = 0; x < width_; ++x) {
      const std::size_t src_index =
        static_cast<std::size_t>(y) * static_cast<std::size_t>(image->bytes_per_line) +
        static_cast<std::size_t>(x) * static_cast<std::size_t>(bytes_per_pixel);
      const std::size_t dst_index =
        (static_cast<std::size_t>(y) * static_cast<std::size_t>(width_) +
        static_cast<std::size_t>(x)) * 4U;

      const unsigned char blue = static_cast<unsigned char>(image->data[src_index + 0]);
      const unsigned char green = static_cast<unsigned char>(image->data[src_index + 1]);
      const unsigned char red = static_cast<unsigned char>(image->data[src_index + 2]);

      frame.rgba[dst_index + 0] = red;
      frame.rgba[dst_index + 1] = green;
      frame.rgba[dst_index + 2] = blue;
      frame.rgba[dst_index + 3] = 255;
    }
  }

  XDestroyImage(image);
  return true;
}

int X11CaptureBackend::root_width() const
{
  return width_;
}

int X11CaptureBackend::root_height() const
{
  return height_;
}

bool X11CaptureBackend::ensure_geometry()
{
  if (display_ == nullptr) {
    return false;
  }

  XWindowAttributes attributes;
  if (XGetWindowAttributes(display_, root_window_, &attributes) == 0) {
    return false;
  }

  width_ = attributes.width;
  height_ = attributes.height;
  return width_ > 0 && height_ > 0;
}

}  // namespace teleop_xreal_desktop
