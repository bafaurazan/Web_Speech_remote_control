cmake_minimum_required(VERSION 3.8)
project(teleop_moving_window)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(sensor_msgs REQUIRED)
find_package(PkgConfig REQUIRED)

pkg_check_modules(X11 REQUIRED x11)
pkg_check_modules(XFIXES REQUIRED xfixes)
pkg_check_modules(XRANDR REQUIRED xrandr)

add_executable(desktop_screen_stream_node
  desktop_screen_stream_node.cpp
)

target_include_directories(desktop_screen_stream_node PRIVATE
  ${X11_INCLUDE_DIRS}
  ${XFIXES_INCLUDE_DIRS}
  ${XRANDR_INCLUDE_DIRS}
)

target_link_directories(desktop_screen_stream_node PRIVATE
  ${X11_LIBRARY_DIRS}
  ${XFIXES_LIBRARY_DIRS}
  ${XRANDR_LIBRARY_DIRS}
)

target_link_libraries(desktop_screen_stream_node
  ${X11_LIBRARIES}
  ${XFIXES_LIBRARIES}
  ${XRANDR_LIBRARIES}
)

ament_target_dependencies(desktop_screen_stream_node
  rclcpp
  sensor_msgs
)

install(TARGETS desktop_screen_stream_node
  DESTINATION lib/${PROJECT_NAME}
)

install(PROGRAMS
  imu_virtual_camera.py
  laptop_camera_stream_node.py
  DESTINATION lib/${PROJECT_NAME}
)

install(FILES README.md
  DESTINATION share/${PROJECT_NAME}
)

ament_package()
