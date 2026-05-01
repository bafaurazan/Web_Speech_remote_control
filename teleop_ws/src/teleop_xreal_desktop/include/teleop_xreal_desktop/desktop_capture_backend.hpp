#pragma once

#include <cstdint>
#include <memory>
#include <vector>

namespace teleop_xreal_desktop
{

struct CaptureFrame
{
  int width = 0;
  int height = 0;
  std::vector<std::uint8_t> rgba;
};

class DesktopCaptureBackend
{
public:
  virtual ~DesktopCaptureBackend() = default;

  virtual bool capture(CaptureFrame & frame) = 0;
};

using DesktopCaptureBackendPtr = std::shared_ptr<DesktopCaptureBackend>;

}  // namespace teleop_xreal_desktop
