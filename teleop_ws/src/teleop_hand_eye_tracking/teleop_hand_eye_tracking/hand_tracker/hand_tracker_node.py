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

        # Parametry GUI: czy startować w fullscreen i ewentualna zmiana rozdzielczości okna
        self.declare_parameter("viewer_fullscreen", False)
        self.declare_parameter("viewer_width", 0)
        self.declare_parameter("viewer_height", 0)

        self.viewer_fullscreen = bool(self.get_parameter("viewer_fullscreen").value)
        self.viewer_width = int(self.get_parameter("viewer_width").value)
        self.viewer_height = int(self.get_parameter("viewer_height").value)

        # Czy pokazywać tekstowe podpowiedzi przy ikonce „i”
        self.show_help_overlay = False

        self.window_name = "ROS2 Depth Hand Tracker"
        cv2.namedWindow(self.window_name, cv2.WINDOW_NORMAL)
        if self.viewer_fullscreen:
            cv2.setWindowProperty(self.window_name, cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)
        else:
            cv2.setWindowProperty(self.window_name, cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_NORMAL)
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
        self.MIN_REACH_MM = 400.0      # minimalnie sensowny pomiar kamery
        self.MAX_REACH_MM = 800.0
        # Dodatkowe odsunięcie w przód (cała chmura punktów jest przesunięta
        # o stałą wartość, żeby robotowe ręce były dalej od tułowia).
        self.DEPTH_OFFSET_MM = 95.0
        # Minimalny dystans, na jaki POZWALAMY dojść robotowi
        # (nawet jeśli kamera widzi bliżej).
        self.MIN_ROBOT_REACH_MM = 520.0

        # Lock przy "za blisko" – ignoruj skoki w górę (tło) przez kilka klatek
        self.CLOSE_LOCK_FRAMES = 15
        self._close_lock_left = 0
        self._close_lock_right = 0
        self.CLOSE_LOCK_SPIKE_MM = 120.0   # pomiar > MIN+spike w trakcie locka = uznaj za błąd
        self.DEPTH_QUALITY_MIN = 0.03       # poniżej tej jakości ROI uznaj pomiar za niewiarygodny

        # Odrzucanie skoków: zmiana względem poprzedniej wartości
        self.MAX_JUMP_MM = 80.0             # jeśli |raw - prev| > to, uznaj za skok i ogranicz krok
        self.MAX_STEP_PER_FRAME_MM = 45.0   # max zmiana wyjścia [mm] na jedną klatkę (rate limit)

        # Wygładzanie (alpha: im mniejszy, tym bardziej trzymamy poprzednią wartość)
        self.prev_z_left = 400.0
        self.prev_z_right = 400.0
        self.SMOOTHING_ALPHA = 0.22         # normalna szybkość śledzenia
        self.SMOOTHING_ALPHA_CLOSE = 0.08  # przy "za blisko" / słabej jakości – mocniejsze wygładzanie

        self.get_logger().info(
            'Hand Tracker: Min-Range Protected (400mm) + jump rejection + rate limit'
        )

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
            num_hands = len(detections)

            if num_hands > 0:
                self.process_hand(detections[0], cv_image, self.hand_1_votes, True, num_hands)

            if num_hands > 1:
                self.process_hand(detections[1], cv_image, self.hand_2_votes, False, num_hands)
        else:
            self.hand_1_votes.clear()
            self.hand_2_votes.clear()

        # Ewentualne skalowanie obrazu do żądanej rozdzielczości (tylko na potrzeby GUI)
        display_image = cv_image
        if self.viewer_width > 0 and self.viewer_height > 0:
            display_image = cv2.resize(cv_image, (self.viewer_width, self.viewer_height))

        # HUD w stylu gry: mała ikonka „i info” w prawym dolnym rogu (styl Battlefield),
        # tekst pojawia się dopiero po wciśnięciu klawisza 'i'
        h_disp, w_disp, _ = display_image.shape
        # Margines ikonki od krawędzi obrazu (jak wcześniej – nie w samym rogu)
        margin = 10

        # Rozmiar ikony (prostokąt w stylu HUD)
        icon_width = 28
        icon_height = 28

        x2 = w_disp - margin
        x1 = x2 - icon_width
        y2 = h_disp - margin
        y1 = y2 - icon_height

        # Najpierw rysujemy tło na osobnej warstwie i mieszamy z obrazem,
        # żeby uzyskać lekko przezroczysty „kafelek” HUD.
        overlay = display_image.copy()
        cv2.rectangle(
            overlay,
            (x1, y1),
            (x2, y2),
            (210, 210, 210),
            thickness=-1,
            lineType=cv2.LINE_AA,
        )
        alpha = 0.7  # 0 = pelna przezroczystosc, 1 = brak
        cv2.addWeighted(overlay, alpha, display_image, 1 - alpha, 0, display_image)

        # Ramka (ciemno-szara, nie idealnie czarna)
        cv2.rectangle(
            display_image,
            (x1, y1),
            (x2, y2),
            (80, 80, 80),
            thickness=2,
            lineType=cv2.LINE_AA,
        )

        # Litera „i” wewnątrz (precyzyjnie wycentrowana)
        icon_center_x = x1 + icon_width // 2
        icon_center_y = y1 + icon_height // 2
        label = "i"
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.7
        thickness = 2
        (text_w, text_h), _ = cv2.getTextSize(label, font, font_scale, thickness)
        # Optical centering: w wielu fontach "i" wygląda lekko przesunięte w lewo/górę,
        # więc dodajemy mały bias w prawo/dół.
        i_bias_x = 1
        i_bias_y = 2
        text_org = (
            int(icon_center_x - text_w / 2 + i_bias_x),
            int(icon_center_y + text_h / 2 - 2 + i_bias_y),
        )
        cv2.putText(
            display_image,
            label,
            text_org,
            font,
            font_scale,
            (60, 60, 60),
            thickness,
            cv2.LINE_AA,
        )

        # Tekst pomocy obok ikony – tylko gdy show_help_overlay == True
        if self.show_help_overlay:
            info_lines = [
                "F - toggle fullscreen",
                "Esc - exit fullscreen",
            ]
            font = cv2.FONT_HERSHEY_SIMPLEX
            scale = 0.5
            thickness = 1

            # Rysujemy od prawej do lewej, obok ikony, z czarnym obrysem i bialym srodkiem,
            # zeby tekst byl widoczny na jasnym i ciemnym tle.
            y = y1
            for line in reversed(info_lines):
                (text_w, text_h), _ = cv2.getTextSize(line, font, scale, thickness)
                text_org = (x1 - margin - text_w, y + text_h)

                # Czarne tło/obrys
                cv2.putText(
                    display_image,
                    line,
                    text_org,
                    font,
                    scale,
                    (0, 0, 0),
                    thickness + 2,
                    cv2.LINE_AA,
                )
                # Bialy tekst na wierzchu
                cv2.putText(
                    display_image,
                    line,
                    text_org,
                    font,
                    scale,
                    (255, 255, 255),
                    thickness,
                    cv2.LINE_AA,
                )
                y -= text_h + 4

        cv2.imshow(self.window_name, display_image)

        # Uwaga: w OpenCV kod klawisza F11 jest zależny od platformy, dlatego
        # tu używamy klawisza 'f' do przełączania fullscreen <-> okno.
        key = cv2.waitKey(1) & 0xFF
        if key == ord('f'):
            self.viewer_fullscreen = not self.viewer_fullscreen
            if self.viewer_fullscreen:
                cv2.setWindowProperty(self.window_name, cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)
            else:
                cv2.setWindowProperty(self.window_name, cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_NORMAL)
        elif key == ord('i'):
            # Toggle help overlay visibility
            self.show_help_overlay = not self.show_help_overlay
        elif key == 27:  # Esc
            # Wyjście z fullscreen do zwykłego okna
            self.viewer_fullscreen = False
            cv2.setWindowProperty(self.window_name, cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_NORMAL)

    def get_robust_depth(self, landmarks, h, w):
        z, _q = self.get_robust_depth_with_quality(landmarks, h, w)
        return z

    def get_robust_depth_with_quality(self, landmarks, h, w):
        if self.latest_depth_img is None:
            return 0.0, 0.0

        key_indices = [0, 5, 9, 13, 17] 
        valid_depths = []
        valid_px = 0
        total_px = 0
        r = 2  # ROI radius -> (2r+1)x(2r+1) = 5x5

        for idx in key_indices:
            lm = landmarks.landmark[idx]
            px = int(lm.x * w)
            py = int(lm.y * h)

            safe_x = max(0, min(px, self.latest_depth_img.shape[1] - 1))
            safe_y = max(0, min(py, self.latest_depth_img.shape[0] - 1))

            roi = self.latest_depth_img[
                max(0, safe_y - r):safe_y + r + 1,
                max(0, safe_x - r):safe_x + r + 1
            ]
            if roi.size == 0:
                continue

            total_px += int(roi.size)
            nonzero = roi[(roi > 0) & (roi < 2000)]
            valid_px += int(nonzero.size)

            if nonzero.size > 0:
                d = float(np.median(nonzero))
            else:
                d = 0.0
            
            # --- FILTRACJA PUNKTOWA ---
            # Odrzucamy punkty, które są ewidentnym błędem (poniżej fizycznego limitu kamery)
            # Jeśli punkt ma 150mm, to na 99% błąd OAK-D, więc go ignorujemy
            if d > 200 and d < 1500: 
                valid_depths.append(d)

        if not valid_depths:
            return 0.0, (valid_px / total_px) if total_px > 0 else 0.0

        # Zwracamy medianę z poprawnych punktów
        z = float(np.median(valid_depths))
        q = (valid_px / total_px) if total_px > 0 else 0.0
        return z, q

    def process_hand(self, detection, image, vote_buffer, is_primary, num_hands: int):
        """
        Przetwarzanie pojedynczej dłoni.

        Stabilne przypisanie lewej/prawej:
        - gdy WIDZIMY DWIE ręce:
            * lewa na obrazie  (mniejszy x)  -> /hand/left
            * prawa na obrazie (większy x)   -> /hand/right
          (czyli używamy is_primary=True/False, niezależnie od labela Mediapipe)
        - gdy WIDZIMY JEDNĄ rękę:
            * używamy labela Mediapipe (z korektą strony kamery),
              żeby odróżnić lewą od prawej dłoni.
        """

        raw_label = detection['raw_label']

        if num_hands >= 2:
            # Dwie ręce w kadrze – stabilnie pozycją w obrazie
            is_real_left = bool(is_primary)
        else:
            # Jedna ręka – opieramy się na labelu Mediapipe.
            # W oryginalnym kodzie było final_label == "Right" => lewa,
            # co odpowiada odbiciu lustrzanemu kamery.
            is_real_left = (raw_label == "Right")
        
        # 2. Współrzędne 2D
        h, w, _ = image.shape
        target = detection['marks'].landmark[8] 
        px_x = int(target.x * w)
        px_y = int(target.y * h)

        # 3. Pobierz głębię
        raw_z_meas, depth_q = self.get_robust_depth_with_quality(detection['marks'], h, w)

        # 4. ZABEZPIECZENIA WARTOŚCI (Logic Clamping)
        
        prev_z = self.prev_z_left if is_real_left else self.prev_z_right

        # Close-lock: jeśli pomiar wskazuje, że ręka weszła poniżej MIN_REACH,
        # to przez kilka klatek traktuj kolejne "skoki w górę" jako błąd (zwykle tło).
        if 0.0 < raw_z_meas < self.MIN_REACH_MM:
            if is_real_left:
                self._close_lock_left = self.CLOSE_LOCK_FRAMES
            else:
                self._close_lock_right = self.CLOSE_LOCK_FRAMES
        else:
            if is_real_left and self._close_lock_left > 0:
                self._close_lock_left -= 1
            if (not is_real_left) and self._close_lock_right > 0:
                self._close_lock_right -= 1

        lock_active = (self._close_lock_left > 0) if is_real_left else (self._close_lock_right > 0)
        
        # A. Jeśli pomiar nieudany (0), użyj poprzedniego
        raw_z = raw_z_meas
        if raw_z == 0:
            raw_z = prev_z

        # A2. Lock: przy za blisko ignoruj skoki w górę i słabe pomiary
        if lock_active:
            if (raw_z_meas == 0.0) or (depth_q < self.DEPTH_QUALITY_MIN) or (raw_z_meas > self.MIN_REACH_MM + self.CLOSE_LOCK_SPIKE_MM):
                raw_z = self.MIN_REACH_MM

        # A3. Odrzucanie skoków: zbyt duża zmiana względem poprzedniej wartości = prawdopodobny błąd
        if raw_z != prev_z and prev_z > 0:
            jump = abs(raw_z - prev_z)
            if jump > self.MAX_JUMP_MM:
                # Zamiast surowego raw_z weź poprzednią + max dozwolony krok w stronę raw_z
                step = np.clip(raw_z - prev_z, -self.MAX_JUMP_MM, self.MAX_JUMP_MM)
                raw_z = prev_z + step

        # B. Twarde ograniczenie dołu i góry
        if raw_z < self.MIN_REACH_MM:
            raw_z = self.MIN_REACH_MM
        if raw_z > self.MAX_REACH_MM:
            raw_z = self.MAX_REACH_MM

        # C. Wygładzanie – mocniejsze przy "za blisko" lub słabej jakości
        in_close_zone = lock_active or (depth_q < self.DEPTH_QUALITY_MIN) or (raw_z <= self.MIN_REACH_MM + 30.0)
        alpha = self.SMOOTHING_ALPHA_CLOSE if in_close_zone else self.SMOOTHING_ALPHA
        filtered_z = (alpha * raw_z) + ((1.0 - alpha) * prev_z)

        # D. Rate limit: max zmiana na klatkę (żeby wyjście nie "wariowało")
        step = filtered_z - prev_z
        step = np.clip(step, -self.MAX_STEP_PER_FRAME_MM, self.MAX_STEP_PER_FRAME_MM)
        filtered_z = float(np.clip(prev_z + step, self.MIN_REACH_MM, self.MAX_REACH_MM))

        # Zapisz (bez offsetu – filtr działa na "prawdziwym" dystansie)
        if is_real_left:
            self.prev_z_left = filtered_z
        else:
            self.prev_z_right = filtered_z

        # E. Globalne odsunięcie w przód – docelowa odległość dla robota
        #    (przesuwamy całą chmurę pomiarów, żeby ręce robota były dalej),
        #    PLUS minimalny dystans bezpieczeństwa dla robota.
        out_z = float(filtered_z + self.DEPTH_OFFSET_MM)
        if out_z < self.MIN_ROBOT_REACH_MM:
            out_z = self.MIN_ROBOT_REACH_MM

        # 5. Publikacja
        msg = Point()
        msg.x = float(px_x)
        msg.y = float(px_y)
        msg.z = out_z
        
        self.mp_drawing.draw_landmarks(image, detection['marks'], self.mp_hands.HAND_CONNECTIONS)
        
        txt = f"{int(out_z)}mm"
        # Debug: jakość pomiaru głębi (0.0–1.0) i status close-lock
        debug_q = f"q={depth_q:.2f}"
        debug_lock = "LOCK" if lock_active else "OK"

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

        # Główna informacja o dystansie
        cv2.putText(image, f"{prefix}: {txt}", (px_x-20, px_y-25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
        # Dodatkowy overlay z jakością i statusem locka (nieco wyżej)
        cv2.putText(
            image,
            f"{debug_q} {debug_lock}",
            (px_x-40, px_y-65),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (255, 255, 255),
            1,
        )

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