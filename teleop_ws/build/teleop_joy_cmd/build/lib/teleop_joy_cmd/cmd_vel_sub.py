import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist

class CmdVelSubscriber(Node):

    def __init__(self):
        super().__init__('simple_cmd_vel_listener')
        
        # Tworzymy subskrypcję na temat 'cmd_vel'
        # Typ wiadomości: Twist
        # Kolejka (QoS): 10
        self.subscription = self.create_subscription(
            Twist,
            'cmd_vel',
            self.listener_callback,
            10
        )
        self.subscription  # prevent unused variable warning
        self.get_logger().info('Subscriber gotowy. Czekam na dane z /cmd_vel...')

    def listener_callback(self, msg):
        # Ta funkcja wywołuje się za każdym razem, gdy przyjdą nowe dane
        linear_x = msg.linear.x
        angular_z = msg.angular.z
        
        self.get_logger().info(
            f'Odebrano -> Linear X: {linear_x:.2f}, Angular Z: {angular_z:.2f}'
        )

def main(args=None):
    rclpy.init(args=args)

    node = CmdVelSubscriber()

    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main()