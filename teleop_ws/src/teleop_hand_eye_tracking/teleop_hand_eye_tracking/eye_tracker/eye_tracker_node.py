import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Image
from geometry_msgs.msg import Point  # <--- Nowy import do publikowania współrzędnych
from cv_bridge import CvBridge, CvBridgeError
import cv2
import mediapipe as mp
import numpy as np

class EyeTrackerNode(Node):
    def __init__(self):
        super().__init__('eye_tracker_node')
        
        # 1. Konfiguracja subskrypcji kamery
        self.subscription = self.create_subscription(
            Image,
            '/oak/rgb/image_raw',
            self.image_callback,
            10)
        
        # 2. Konfiguracja publikera współrzędnych
        # Typ wiadomości: Point (x, y, z)
        # Temat: /gaze/coordinates
        self.publisher_gaze = self.create_publisher(Point, '/gaze/coordinates', 10)

        self.bridge = CvBridge()

        # Konfiguracja MediaPipe
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )

        # Indeksy punktów tęczówek
        self.LEFT_IRIS = [474, 475, 476, 477]
        self.RIGHT_IRIS = [469, 470, 471, 472]

        self.get_logger().info('Eye Tracker Node started. Publishing to /gaze/coordinates')

    def image_callback(self, msg):
        try:
            cv_image = self.bridge.imgmsg_to_cv2(msg, "bgr8")
        except CvBridgeError as e:
            self.get_logger().error(f'CV Bridge Error: {e}')
            return

        rgb_image = cv2.cvtColor(cv_image, cv2.COLOR_BGR2RGB)
        
        rgb_image.flags.writeable = False
        results = self.face_mesh.process(rgb_image)
        rgb_image.flags.writeable = True

        if results.multi_face_landmarks:
            for face_landmarks in results.multi_face_landmarks:
                img_h, img_w, _ = cv_image.shape
                
                # Pobieramy współrzędne obu oczu
                left_eye_pos = self.process_eye(cv_image, face_landmarks, self.LEFT_IRIS, img_w, img_h)
                right_eye_pos = self.process_eye(cv_image, face_landmarks, self.RIGHT_IRIS, img_w, img_h)

                # Jeśli udało się wykryć oba oczy, obliczamy średni punkt (gaze point)
                if left_eye_pos and right_eye_pos:
                    avg_x = (left_eye_pos[0] + right_eye_pos[0]) / 2.0
                    avg_y = (left_eye_pos[1] + right_eye_pos[1]) / 2.0

                    # Tworzenie i publikowanie wiadomości ROS
                    point_msg = Point()
                    point_msg.x = float(avg_x)
                    point_msg.y = float(avg_y)
                    point_msg.z = 0.0  # 2D, więc Z zostawiamy 0
                    
                    self.publisher_gaze.publish(point_msg)
                    
                    # Opcjonalnie: Rysujemy punkt "celowania" na środku między oczami (żółty)
                    cv2.circle(cv_image, (int(avg_x), int(avg_y)), 5, (0, 255, 255), -1)

        cv2.imshow("ROS2 Eye Tracking", cv_image)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            pass

    def process_eye(self, image, landmarks, iris_indices, img_w, img_h):
        """
        Rysuje oko i zwraca krotkę (center_x, center_y).
        """
        mesh_points = np.array([
            np.multiply([p.x, p.y], [img_w, img_h]).astype(int) 
            for p in landmarks.landmark
        ])
        
        iris_points = mesh_points[iris_indices]
        (center_x, center_y), radius = cv2.minEnclosingCircle(iris_points)
        center_pos = (int(center_x), int(center_y))
        radius = int(radius)

        # Rysowanie
        cv2.circle(image, center_pos, radius, (0, 255, 0), 1, cv2.LINE_AA)
        cv2.circle(image, center_pos, 2, (0, 0, 255), -1, cv2.LINE_AA)

        return center_pos

def main(args=None):
    rclpy.init(args=args)
    node = EyeTrackerNode()
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