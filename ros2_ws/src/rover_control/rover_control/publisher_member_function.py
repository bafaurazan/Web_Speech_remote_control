import rclpy
from rclpy.node import Node

from std_msgs.msg import Int32  # Zmieniono typ wiadomości na Int32


class SpeedPublisher(Node):

    def __init__(self):
        super().__init__('speed_publisher')
        self.publisher_ = self.create_publisher(Int32, 'rover/speed', 10)  # Typ wiadomości to teraz Int32
        timer_period = 1.0
        self.timer = self.create_timer(timer_period, self.timer_callback)
        self.i = 0  # Zmieniono na typ int

    def timer_callback(self):
        msg = Int32()
        msg.data = self.i  # Przypisanie wartości typu int do msg.data
        self.publisher_.publish(msg)
        self.get_logger().info('Published: %d' % msg.data)
        self.i += 1  # Zwiększamy wartość int


def main(args=None):
    rclpy.init(args=args)

    my_speed_publisher = SpeedPublisher()

    rclpy.spin(my_speed_publisher)

    my_speed_publisher.destroy_node()
    rclpy.shutdown()


if __name__ == '__main__':
    main()

