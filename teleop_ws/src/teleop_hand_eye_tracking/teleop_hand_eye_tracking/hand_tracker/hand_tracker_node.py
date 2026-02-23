import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Image
from geometry_msgs.msg import Point
from cv_bridge import CvBridge, CvBridgeError
import cv2
import mediapipe as mp
import numpy as np
from collections import deque

class HandTrackerDepthNode(Node):
    def __init__(self):
        super().__init__('hand_tracker_depth_node')
        
        self.sub_rgb = self.create_subscription(
            Image, '/oak/rgb/image_raw', self.rgb_callback, 10)
            
        self.sub_depth = self.create_subscription(
            Image, '/oak/stereo/image_raw', self.depth_callback, 10)

        self.pub_left = self.create_publisher(Point, '/hand/left', 10)
        self.pub_right = self.create_publisher(Point, '/hand/right', 10)

        self.bridge = CvBridge()
        self.latest_depth_img = None 

        self.mp_hands = mp.solutions.hands
        self.mp_drawing = mp.solutions.drawing_utils
        self.hands = self.mp_hands.Hands(
            max_num_hands=2,
            model_complexity=0,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )

        self.STABILITY_THRESHOLD = 15 
        self.hand_1_votes = deque(maxlen=self.STABILITY_THRESHOLD)
        self.hand_2_votes = deque(maxlen=self.STABILITY_THRESHOLD)

        # --- ZABEZPIECZENIA ZASIĘGU ---
        # MIN_REACH: Fizyczna granica OAK-D to ok 30-35cm.
        # Ustawiamy 350mm jako bezpieczną granicę. Poniżej tego dane to szum.
        self.MIN_REACH_MM = 350.0 
        self.MAX_REACH_MM = 800.0  
        
        # Wygładzanie
        self.prev_z_left = 400.0
        self.prev_z_right = 400.0
        self.SMOOTHING_ALPHA = 0.2 

        self.get_logger().info('Hand Tracker: Min-Range Protected (350mm floor)')

    def depth_callback(self, msg):
        try:
            self.latest_depth_img = self.bridge.imgmsg_to_cv2(msg, "16UC1")
        except CvBridgeError as e:
            self.get_logger().error(f'Depth error: {e}')

    def rgb_callback(self, msg):
        try:
            cv_image = self.bridge.imgmsg_to_cv2(msg, "bgr8")
        except CvBridgeError as e:
            return

        rgb_image = cv2.cvtColor(cv_image, cv2.COLOR_BGR2RGB)
        rgb_image.flags.writeable = False
        results = self.hands.process(rgb_image)
        rgb_image.flags.writeable = True
        
        h, w, _ = cv_image.shape

        if results.multi_hand_landmarks:
            detections = []
            for idx, hand_landmarks in enumerate(results.multi_hand_landmarks):
                raw_label = results.multi_handedness[idx].classification[0].label
                wrist_x = hand_landmarks.landmark[0].x
                detections.append({'x': wrist_x, 'marks': hand_landmarks, 'raw_label': raw_label})
            
            detections.sort(key=lambda d: d['x'])

            if len(detections) > 0:
                self.process_hand(detections[0], cv_image, self.hand_1_votes, True)

            if len(detections) > 1:
                self.process_hand(detections[1], cv_image, self.hand_2_votes, False)
        else:
            self.hand_1_votes.clear()
            self.hand_2_votes.clear()

        cv2.imshow("ROS2 Depth Hand Tracker", cv_image)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            pass

    def get_robust_depth(self, landmarks, h, w):
        if self.latest_depth_img is None:
            return 0.0

        key_indices = [0, 5, 9, 13, 17] 
        valid_depths = []

        for idx in key_indices:
            lm = landmarks.landmark[idx]
            px = int(lm.x * w)
            py = int(lm.y * h)

            safe_x = max(0, min(px, self.latest_depth_img.shape[1] - 1))
            safe_y = max(0, min(py, self.latest_depth_img.shape[0] - 1))

            d = self.latest_depth_img[safe_y, safe_x]
            
            if d == 0:
                roi = self.latest_depth_img[max(0, safe_y-1):safe_y+2, max(0, safe_x-1):safe_x+2]
                if roi.size > 0:
                    nonzero = roi[roi > 0]
                    if nonzero.size > 0:
                        d = np.median(nonzero)
            
            # --- FILTRACJA PUNKTOWA ---
            # Odrzucamy punkty, które są ewidentnym błędem (poniżej fizycznego limitu kamery)
            # Jeśli punkt ma 150mm, to na 99% błąd OAK-D, więc go ignorujemy
            if d > 200 and d < 1500: 
                valid_depths.append(d)

        if not valid_depths:
            return 0.0

        # Zwracamy medianę z poprawnych punktów
        return float(np.median(valid_depths))

    def process_hand(self, detection, image, vote_buffer, is_primary):
        # 1. Stabilizacja Etykiety
        vote_buffer.append(detection['raw_label'])
        final_label = "Left" if vote_buffer.count("Left") > vote_buffer.count("Right") else "Right"
        if len(vote_buffer) < 5: final_label = detection['raw_label']

        is_real_left = (final_label == "Right") 
        
        # 2. Współrzędne 2D
        h, w, _ = image.shape
        target = detection['marks'].landmark[8] 
        px_x = int(target.x * w)
        px_y = int(target.y * h)

        # 3. Pobierz głębię
        raw_z = self.get_robust_depth(detection['marks'], h, w)

        # 4. ZABEZPIECZENIA WARTOŚCI (Logic Clamping)
        
        prev_z = self.prev_z_left if is_real_left else self.prev_z_right
        
        # A. Jeśli pomiar nieudany (0), użyj poprzedniego
        if raw_z == 0:
            raw_z = prev_z
        
        # B. TWARDE OGRANICZENIE DOŁU (Min Safe Distance)
        # Jeśli kamera podaje mniej niż 350mm, to znaczy że ręka jest za blisko.
        # Wymuszamy 350mm, żeby nie skakało do zera czy losowych wartości.
        if raw_z < self.MIN_REACH_MM:
            raw_z = self.MIN_REACH_MM
            
        # C. Twarde ograniczenie góry
        if raw_z > self.MAX_REACH_MM:
            raw_z = self.MAX_REACH_MM
        
        # D. Wygładzanie
        filtered_z = (self.SMOOTHING_ALPHA * raw_z) + ((1.0 - self.SMOOTHING_ALPHA) * prev_z)

        # Zapisz
        if is_real_left: self.prev_z_left = filtered_z
        else: self.prev_z_right = filtered_z

        # 5. Publikacja
        msg = Point()
        msg.x = float(px_x)
        msg.y = float(px_y)
        msg.z = float(filtered_z)
        
        self.mp_drawing.draw_landmarks(image, detection['marks'], self.mp_hands.HAND_CONNECTIONS)
        
        txt = f"{int(filtered_z)}mm"
        if is_real_left:
            self.pub_left.publish(msg)
            color = (255, 0, 0)
            prefix = "L"
        else:
            self.pub_right.publish(msg)
            color = (0, 255, 0)
            prefix = "R"
            
        cv2.circle(image, (px_x, px_y), 10, color, -1)
        
        # Wizualizacja ostrzegawcza - jeśli jesteśmy na granicy minimalnej
        if filtered_z <= self.MIN_REACH_MM + 10:
             cv2.putText(image, "TOO CLOSE!", (px_x-30, px_y-50), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,0,255), 2)

        cv2.putText(image, f"{prefix}: {txt}", (px_x-20, px_y-25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

def main(args=None):
    rclpy.init(args=args)
    node = HandTrackerDepthNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()
        cv2.destroyAllWindows()

if __name__ == '__main__':
    main()