cmake_minimum_required(VERSION 3.12)
project(teleop_xreal_desktop)

add_compile_options(-std=c++17)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

find_package(ament_cmake REQUIRED)
find_package(geometry_msgs REQUIRED)
find_package(rclcpp REQUIRED)
find_package(sensor_msgs REQUIRED)
find_package(std_msgs REQUIRED)
find_package(PkgConfig REQUIRED)

pkg_check_modules(GLFW3 REQUIRED glfw3)
pkg_check_modules(GL REQUIRED gl)
pkg_check_modules(X11 REQUIRED x11)

add_executable(xreal_desktop_renderer
  src/main.cpp
  src/xreal_desktop_renderer.cpp
  src/x11_capture_backend.cpp
)

target_include_directories(xreal_desktop_renderer PRIVATE
  include
  ${GLFW3_INCLUDE_DIRS}
  ${GL_INCLUDE_DIRS}
  ${X11_INCLUDE_DIRS}
)

target_link_directories(xreal_desktop_renderer PRIVATE
  ${GLFW3_LIBRARY_DIRS}
  ${GL_LIBRARY_DIRS}
  ${X11_LIBRARY_DIRS}
)

target_link_libraries(xreal_desktop_renderer
  ${GLFW3_LIBRARIES}
  ${GL_LIBRARIES}
  ${X11_LIBRARIES}
)

ament_target_dependencies(xreal_desktop_renderer
  geometry_msgs
  rclcpp
  sensor_msgs
  std_msgs
)

install(TARGETS xreal_desktop_renderer
  DESTINATION lib/${PROJECT_NAME}
)

install(DIRECTORY launch
  DESTINATION share/${PROJECT_NAME}
)

install(FILES README.md
  DESTINATION share/${PROJECT_NAME}
)

ament_package()
