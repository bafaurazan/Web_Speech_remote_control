#pragma once

#include <X11/Xlib.h>

#include <memory>

#include "teleop_xreal_desktop/desktop_capture_backend.hpp"

namespace teleop_xreal_desktop
{

class X11CaptureBackend : public DesktopCaptureBackend
{
public:
  X11CaptureBackend();
  ~X11CaptureBackend() override;

  bool capture(CaptureFrame & frame) override;

  int root_width() const;
  int root_height() const;

private:
  bool ensure_geometry();

  Display * display_ = nullptr;
  Window root_window_ = 0;
  int width_ = 0;
  int height_ = 0;
};

using DesktopCaptureBackendPtr = std::shared_ptr<DesktopCaptureBackend>;

}  // namespace teleop_xreal_desktop
