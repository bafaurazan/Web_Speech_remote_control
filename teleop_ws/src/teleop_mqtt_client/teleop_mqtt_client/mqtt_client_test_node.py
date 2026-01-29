import rclpy
from rclpy.node import Node
from std_msgs.msg import String  # ZMIANA: Importujemy String zamiast Twist

class PrimitiveSubscriber(Node):

    def __init__(self):
        super().__init__('mqtt_client')
        
        # ZMIANA: Subskrypcja tematu /pong/primitive
        # Typ wiadomości: String
        self.subscription = self.create_subscription(
            String,
            '/pong/primitive',
            self.listener_callback,
            10
        )
        self.subscription  # prevent unused variable warning
        self.get_logger().info('Subscriber gotowy. Nasłuchuję komunikatów z MQTT na /pong/primitive...')

    def listener_callback(self, msg):
        # Wyświetlamy treść odebranej wiadomości tekstowej
        self.get_logger().info(f'Odebrano z MQTT -> "{msg.data}"')

def main(args=None):
    rclpy.init(args=args)

    node = PrimitiveSubscriber()

    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main()