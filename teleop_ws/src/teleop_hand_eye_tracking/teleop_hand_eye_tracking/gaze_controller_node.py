import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Point
import pyautogui
import json
import os
from collections import deque

class GazeControllerNode(Node):
    def __init__(self):
        super().__init__('gaze_controller_node')
        self.subscription = self.create_subscription(
            Point, '/gaze/coordinates', self.listener_callback, 10)
        self.SCREEN_W, self.SCREEN_H = pyautogui.size()
        pyautogui.FAILSAFE = False
        
        # HISTORIA WYGŁADZANIA - Zwiększ tę wartość, jeśli kursor za bardzo drga
        # Zmniejsz, jeśli reaguje zbyt wolno. Zakres 5-20 jest zazwyczaj OK.
        self.history_len = 12 
        self.history_x = deque(maxlen=self.history_len)
        self.history_y = deque(maxlen=self.history_len)

        self.load_config()

    def load_config(self):
        file_path = os.path.expanduser('~/calibration_config.json')
        if not os.path.exists(file_path):
            self.get_logger().error('BRAK PLIKU KALIBRACJI! Uruchom najpierw gaze_calibrator_gui.py')
            self.destroy_node()
            return
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                self.x_min = data["x_min"]
                self.x_max = data["x_max"]
                self.y_min = data["y_min"]
                self.y_max = data["y_max"]
                self.get_logger().info(f'Gotowy. Zakres X: {self.x_min:.0f}-{self.x_max:.0f}, Y: {self.y_min:.0f}-{self.y_max:.0f}')
        except Exception as e:
            self.get_logger().error(f'Błąd pliku JSON: {e}')

    def listener_callback(self, msg):
        if not hasattr(self, 'x_min'): return
        
        # Normalizacja z zabezpieczeniem przed dzieleniem przez zero
        denom_x = (self.x_max - self.x_min) if self.x_max != self.x_min else 1.0
        denom_y = (self.y_max - self.y_min) if self.y_max != self.y_min else 1.0

        norm_x = (msg.x - self.x_min) / denom_x
        norm_y = (msg.y - self.y_min) / denom_y

        # Ograniczenie do ekranu (Clamp)
        norm_x = max(0.0, min(norm_x, 1.0))
        norm_y = max(0.0, min(norm_y, 1.0))

        # Wygładzanie
        self.history_x.append(norm_x * self.SCREEN_W)
        self.history_y.append(norm_y * self.SCREEN_H)
        avg_x = sum(self.history_x) / len(self.history_x)
        avg_y = sum(self.history_y) / len(self.history_y)

        try:
            pyautogui.moveTo(avg_x, avg_y, duration=0.0)
        except Exception: pass

def main(args=None):
    rclpy.init(args=args)
    node = GazeControllerNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt: pass
    finally:
        node.destroy_node()
        if rclpy.ok(): rclpy.shutdown()

if __name__ == '__main__':
    main()