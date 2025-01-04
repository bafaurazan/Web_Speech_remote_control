import rclpy
from rclpy.node import Node

from geometry_msgs.msg import Twist


class RoverController(Node):

    def __init__(self):
        super().__init__('rover_controller')
        
        self.left_wheel_publisher = self.create_publisher(Twist, '/diff_drive_controller_left/cmd_vel_unstamped', 10)
        self.right_wheel_publisher = self.create_publisher(Twist, '/diff_drive_controller_right/cmd_vel_unstamped', 10)
        
        self.state = 0
        
        timer_period = 2.0
        self.timer = self.create_timer(timer_period, self.timer_callback)
    
    def timer_callback(self):
        left_twist = Twist()
        right_twist = Twist()
        
        if self.state == 0:
            left_twist.linear.x = 2.0
            right_twist.linear.x = -2.0
            self.get_logger().info("State 0: Left forward, Right backward")
        elif self.state == 1:
            left_twist.linear.x = -2.0
            right_twist.linear.x = 2.0
            self.get_logger().info("State 1: Left backward, Right forward")
        else:
            left_twist.linear.x = 0.0
            right_twist.linear.x = 0.0
            self.get_logger().info("State 2: Stopping")
        
        self.left_wheel_publisher.publish(left_twist)
        self.right_wheel_publisher.publish(right_twist)
        
        if self.state < 2:
            self.state += 1
        else:
            self.timer.cancel()


def main(args=None):
    rclpy.init(args=args)

    rover_controller = RoverController()

    rclpy.spin(rover_controller)

    rover_controller.destroy_node()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
