import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Point
import cv2
import numpy as np
import json
import os
import time
import pyautogui

class GazeCalibratorGUINode(Node):
    def __init__(self):
        super().__init__('gaze_calibrator_gui_node')
        
        self.subscription = self.create_subscription(
            Point, '/gaze/coordinates', self.listener_callback, 10)
            
        self.SCREEN_W, self.SCREEN_H = pyautogui.size()
        
        self.targets = [
            ("LEWY GORNY", 0.1, 0.1),
            ("PRAWY GORNY", 0.9, 0.1),
            ("PRAWY DOLNY", 0.9, 0.9),
            ("LEWY DOLNY", 0.1, 0.9),
            ("SRODEK", 0.5, 0.5)
        ]
        
        self.current_target_idx = 0
        
        # --- ZMIANA 1: Nowy stan początkowy ---
        self.state = "WAIT_FOR_START" # Zamiast od razu "PREPARE"
        
        self.state_start_time = time.time()
        self.current_samples_x = []
        self.current_samples_y = []
        self.results = {}

        self.window_name = "KALIBRACJA WZROKU"
        cv2.namedWindow(self.window_name, cv2.WINDOW_NORMAL)
        cv2.setWindowProperty(self.window_name, cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)
        
        self.timer = self.create_timer(1.0/30.0, self.timer_loop)
        self.get_logger().info('GUI Kalibratora gotowe. Czekam na klawisz SPACJA.')

    def listener_callback(self, msg):
        if self.state == "RECORD":
            self.current_samples_x.append(msg.x)
            self.current_samples_y.append(msg.y)

    def timer_loop(self):
        frame = np.zeros((self.SCREEN_H, self.SCREEN_W, 3), np.uint8)
        
        # --- ZMIANA 2: Obsługa stanu oczekiwania ---
        if self.state == "WAIT_FOR_START":
            # Wyświetlanie instrukcji
            cv2.putText(frame, "USTAW SIE WYGODNIE PRZED KAMERA", (100, self.SCREEN_H // 2 - 100), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 255), 3)
            cv2.putText(frame, "Nacisnij [SPACJE] aby rozpoczac", (100, self.SCREEN_H // 2 + 50), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 0), 2)
            cv2.putText(frame, "Nacisnij [ESC] aby wyjsc", (100, self.SCREEN_H // 2 + 150), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 2)
            
            cv2.imshow(self.window_name, frame)
            
            key = cv2.waitKey(1)
            if key & 0xFF == 32: # Klawisz SPACJA
                self.state = "PREPARE"
                self.state_start_time = time.time()
            elif key & 0xFF == 27: # ESC
                raise SystemExit
            return # Nie wykonuj reszty pętli w tym stanie

        # --- Reszta kodu bez zmian ---
        if self.current_target_idx < len(self.targets):
            elapsed = time.time() - self.state_start_time
            target_name, tx_norm, ty_norm = self.targets[self.current_target_idx]
            
            target_px_x = int(tx_norm * self.SCREEN_W)
            target_px_y = int(ty_norm * self.SCREEN_H)

            if self.state == "PREPARE":
                cv2.circle(frame, (target_px_x, target_px_y), 30, (0, 255, 255), -1)
                msg_text = f"PATRZ NA ZOLTA KROPKE ({target_name})"
                if elapsed > 2.0:
                    self.state = "RECORD"
                    self.current_samples_x = []
                    self.current_samples_y = []
                    self.state_start_time = time.time()
                    
            elif self.state == "RECORD":
                cv2.circle(frame, (target_px_x, target_px_y), 30, (0, 0, 255), -1)
                progress = int((elapsed / 3.0) * self.SCREEN_W)
                cv2.rectangle(frame, (0, self.SCREEN_H-20), (progress, self.SCREEN_H), (0, 255, 0), -1)
                msg_text = "NAGRYWANIE..."
                if elapsed > 3.0:
                    self.save_stage_results()
                    self.current_target_idx += 1
                    self.state = "PREPARE"
                    self.state_start_time = time.time()

            cv2.putText(frame, msg_text, (50, self.SCREEN_H // 2), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 255), 3)

        else:
            cv2.putText(frame, "KALIBRACJA ZAKONCZONA!", (50, self.SCREEN_H // 2), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 255, 0), 3)
            cv2.imshow(self.window_name, frame)
            cv2.waitKey(1000)
            self.finish_calibration()
            return

        cv2.imshow(self.window_name, frame)
        if cv2.waitKey(1) & 0xFF == 27:
            raise SystemExit

    def save_stage_results(self):
        if not self.current_samples_x: return
        avg_x = sum(self.current_samples_x) / len(self.current_samples_x)
        avg_y = sum(self.current_samples_y) / len(self.current_samples_y)
        stage_name = self.targets[self.current_target_idx][0]
        self.results[stage_name] = (avg_x, avg_y)

    def finish_calibration(self):
        try:
            x_min = (self.results["LEWY GORNY"][0] + self.results["LEWY DOLNY"][0]) / 2
            x_max = (self.results["PRAWY GORNY"][0] + self.results["PRAWY DOLNY"][0]) / 2
            y_min = (self.results["LEWY GORNY"][1] + self.results["PRAWY GORNY"][1]) / 2
            y_max = (self.results["LEWY DOLNY"][1] + self.results["PRAWY DOLNY"][1]) / 2
            
            config_data = {"x_min": x_min, "x_max": x_max, "y_min": y_min, "y_max": y_max}
            file_path = os.path.expanduser('~/calibration_config.json')
            with open(file_path, 'w') as f:
                json.dump(config_data, f, indent=4)
            self.get_logger().info(f'Zapisano: {file_path}')
        except Exception:
             self.get_logger().error('Blad zapisu')
        cv2.destroyAllWindows()
        raise SystemExit

def main(args=None):
    rclpy.init(args=args)
    node = GazeCalibratorGUINode()
    try:
        rclpy.spin(node)
    except (SystemExit, KeyboardInterrupt):
        pass
    finally:
        node.destroy_node()
        if rclpy.ok(): rclpy.shutdown()
        cv2.destroyAllWindows()

if __name__ == '__main__':
    main()