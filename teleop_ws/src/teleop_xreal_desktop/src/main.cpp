#include <memory>

#include "rclcpp/rclcpp.hpp"
#include "teleop_xreal_desktop/xreal_desktop_renderer.hpp"

int main(int argc, char ** argv)
{
  rclcpp::init(argc, argv);

  try {
    auto node = std::make_shared<teleop_xreal_desktop::XrealDesktopRenderer>();
    node->run();
  } catch (const std::exception & ex) {
    fprintf(stderr, "xreal_desktop_renderer failed: %s\n", ex.what());
  }

  rclcpp::shutdown();
  return 0;
}
