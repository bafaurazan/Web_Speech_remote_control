import os
import numpy as np
import rclpy
import rclpy.node
import rclpy.qos
import rclpy.executors
from geometry_msgs.msg import Twist
from knml_interfaces.msg import WheelStates
from rcl_interfaces.msg import ParameterType, ParameterDescriptor
import time
import sys

# ==========================================
# MATH & LOGIC HELPERS (Bez zmian)
# ==========================================

TURN_VECTORS = [
    vec / np.linalg.norm(vec)
    for vec in [
        np.array([-wheel_pos[1], wheel_pos[0]])  # rot +90
        for wheel_pos in [
            np.array([0.4, 0.33]),  # front left
            np.array([0.4, -0.33]),  # front right
            np.array([-0.4, 0.33]),  # back left
            np.array([-0.4, -0.33]),  # back right
        ]
    ]
]

def angle_distance(alpha, beta):
    vec1 = np.array([np.cos(alpha), np.sin(alpha)])
    vec2 = np.array([np.cos(beta), np.sin(beta)])
    return np.arccos(np.clip(np.dot(vec1, vec2), -1.0, 1.0))


def flip_angle(angle):
    angle += np.pi
    return np.arctan2(np.sin(angle), np.cos(angle))


class State:
    pass


class StopState(State):
    """Robot is stopping or stopped."""
    pass


class DriveState(State):
    """Robot is driving."""
    pass


class AdjustWheelsState(State):
    """Robot is adjusting wheels."""
    pass


def away_from_zero(x: float):
    EPS = 1e-3
    if 0 <= x and x < EPS:
        return EPS
    elif -EPS < x and x < 0:
        return -EPS
    else:
        return x

# ==========================================
# GŁÓWNA KLASA KONTROLERA
# ==========================================

class TwistController(rclpy.node.Node):
    def __init__(self, insecure_publisher_node=None):
        super().__init__("twist_controller")

        # LOGIKA HYBRYDOWA:
        # Jeśli przekazano 'insecure_publisher_node', użyjemy go do publikacji tematów.
        # Dzięki temu dane wyjdą z systemu bez szyfrowania (plaintext).
        # Jeśli nie przekazano (None), używamy 'self' (zachowanie standardowe/zaszyfrowane).
        self.pub_node = insecure_publisher_node if insecure_publisher_node else self

        # Read parameters.
        self.declare_parameter("rate", 30)
        self.declare_parameter("stop_timeout", 1.0)
        self.declare_parameter("robot_radius", 0.5)
        self.declare_parameter("max_wheel_vel", 1.0)
        self.declare_parameter("wheel_accel", 0.5)
        self.declare_parameter("wheel_decel", 2.0)
        self.declare_parameter("wheel_turn_vel", 1.2)
        self.declare_parameter("max_wheel_turn_diff", 0.6)
        self.declare_parameter("min_wheel_turn_diff", 0.2)

        # Initialize current wheel states.
        self.state: State = DriveState()
        self.last_cmd_time = 0
        self.target_velocities = [0.0, 0.0, 0.0, 0.0]
        self.current_velocities = [0.0, 0.0, 0.0, 0.0]
        self.target_angles = [0.0, 0.0, 0.0, 0.0]
        self.current_angles = [0.0, 0.0, 0.0, 0.0]

        # SUBSKRYPCJA (Zawsze bezpieczna/zaszyfrowana - korzysta z 'self')
        self.create_subscription(Twist, "cmd_vel", self.on_cmd_vel, 10)

        # PUBLIKACJA (Może być jawna - korzysta z 'self.pub_node')
        # To tutaj dzieje się magia: tworzymy publisher na węźle, który nie ma kluczy.
        self.wheel_state_pub = self.pub_node.create_publisher(WheelStates, "wheel_states", 10)

        # Timer (Musi być na głównym węźle, by sterować logiką)
        rate = self.get_parameter("rate").value
        self.create_timer(1 / rate, self.publish_state)

    def on_cmd_vel(self, msg: Twist):
        # linear motion vector
        linear_vector = np.array([msg.linear.x, msg.linear.y])

        # angular motion vectors
        robot_radius = self.get_parameter("robot_radius").value
        angular_vectors = [vec * msg.angular.z * robot_radius for vec in TURN_VECTORS]

        # final wheel vectors
        wheel_vectors = [
            linear_vector + angular_vector for angular_vector in angular_vectors
        ]

        # wheel velocities
        wheel_velocities = [np.linalg.norm(vec) for vec in wheel_vectors]

        # wheel angles
        wheel_angles = [np.arctan2(vec[1], vec[0]) for vec in wheel_vectors]

        # Optimization logic
        for i in range(len(wheel_angles)):
            if angle_distance(wheel_angles[i], self.current_angles[i]) > np.pi / 2:
                wheel_angles[i] = flip_angle(wheel_angles[i])
                wheel_velocities[i] *= -1

        for i in range(len(wheel_angles)):
            if abs(wheel_angles[i]) > np.deg2rad(110):
                wheel_angles[i] = flip_angle(wheel_angles[i])
                wheel_velocities[i] *= -1

        # Limit wheel velocities.
        wheel_vel_limit = self.get_parameter("max_wheel_vel").value
        max_wheel_vel = np.max(np.abs(wheel_velocities))
        if max_wheel_vel > wheel_vel_limit:
            scale = wheel_vel_limit / max_wheel_vel
            wheel_velocities = [vel * scale for vel in wheel_velocities]

        # Update target states.
        self.last_cmd_time = time.time()
        self.target_velocities = wheel_velocities
        self.target_angles = wheel_angles

    def publish_state(self):
        # State machine transition logic
        time_since_last_cmd = time.time() - self.last_cmd_time
        if isinstance(self.state, StopState):
            stop_timeout = self.get_parameter("stop_timeout").value
            if time_since_last_cmd < stop_timeout:
                self.state = DriveState()
        if isinstance(self.state, DriveState):
            max_wheel_turn_diff = self.get_parameter("max_wheel_turn_diff").value
            for i in range(len(self.target_angles)):
                if (
                    abs(self.target_angles[i] - self.current_angles[i])
                    > max_wheel_turn_diff
                ):
                    self.state = AdjustWheelsState()
                    break
            stop_timeout = self.get_parameter("stop_timeout").value
            if time_since_last_cmd > stop_timeout:
                self.state = StopState()
        if isinstance(self.state, AdjustWheelsState):
            min_wheel_turn_diff = self.get_parameter("min_wheel_turn_diff").value
            all_wheels_in_position = True
            for i in range(len(self.target_angles)):
                if (
                    abs(self.target_angles[i] - self.current_angles[i])
                    > min_wheel_turn_diff
                ):
                    all_wheels_in_position = False
                    break
            if all_wheels_in_position:
                self.state = DriveState()
            stop_timeout = self.get_parameter("stop_timeout").value
            if time_since_last_cmd > stop_timeout:
                self.state = StopState()

        # Calculation logic
        rate = self.get_parameter("rate").value
        dt = 1 / rate

        def update_current_velocities(target):
            max_wheel_accel = self.get_parameter("wheel_accel").value
            max_wheel_decel = self.get_parameter("wheel_decel").value
            for i in range(len(target)):
                dv = target[i] - self.current_velocities[i]
                accel_limit = (
                    max_wheel_accel
                    if np.sign(dv) == np.sign(self.current_velocities[i])
                    else max_wheel_decel
                )
                dv = np.clip(dv, -accel_limit * dt, accel_limit * dt)
                self.current_velocities[i] += dv

        def update_current_angles(target):
            wheel_turn_vel = self.get_parameter("wheel_turn_vel").value
            for i in range(len(target)):
                dx = target[i] - self.current_angles[i]
                dx = np.clip(dx, -wheel_turn_vel * dt, wheel_turn_vel * dt)
                self.current_angles[i] += dx

        def publish_current_states():
            vels = self.current_velocities
            angles = self.target_angles

            wheel_states = WheelStates()
            # Rzutowanie na float, by uniknąć problemów z typami numpy w ROS msg
            wheel_states.front_left.velocity = float(vels[0])
            wheel_states.front_left.angle = float(angles[0])
            wheel_states.front_right.velocity = float(vels[1])
            wheel_states.front_right.angle = float(angles[1])
            wheel_states.back_left.velocity = float(vels[2])
            wheel_states.back_left.angle = float(angles[2])
            wheel_states.back_right.velocity = float(vels[3])
            wheel_states.back_right.angle = float(angles[3])
            
            # Publikacja przez węzeł zdefiniowany w __init__ (może być jawny)
            self.wheel_state_pub.publish(wheel_states)

        # Logic Execution
        if isinstance(self.state, StopState):
            if not np.all(np.isclose(self.current_velocities, 0)):
                update_current_velocities([0.0, 0.0, 0.0, 0.0])
                publish_current_states()

        elif isinstance(self.state, DriveState):
            update_current_velocities(self.target_velocities)
            update_current_angles(self.target_angles)
            publish_current_states()

        elif isinstance(self.state, AdjustWheelsState):
            if np.all(np.isclose(self.current_velocities, 0)):
                update_current_angles(self.target_angles)
            else:
                update_current_velocities([0.0, 0.0, 0.0, 0.0])
            publish_current_states()


# ==========================================
# FUNKCJA MAIN (DUAL NODE SETUP)
# ==========================================

def main(args=None):
    # 1. Inicjalizacja kontekstu BEZPIECZNEGO (Standard)
    # Ten kontekst "zaciągnie" zmienne środowiskowe i argumenty CLI (--enclave ...).
    # Dzięki temu twist_controller będzie bezpieczny.
    rclpy.init(args=sys.argv)

    # =========================================================================
    # FIX: CZYSZCZENIE ŚRODOWISKA DLA DRUGIEGO WĘZŁA
    # =========================================================================
    # Problem: Nawet pusty kontekst widzi globalne zmienne środowiskowe (ROS_SECURITY_ENABLE=true).
    # Przez to "jawny" węzeł próbuje szukać kluczy i wywala błąd.
    # Rozwiązanie: Usuwamy te flagi z pamięci procesu przed startem drugiego kontekstu.
    
    security_vars = [
        "ROS_SECURITY_ENABLE",
        "ROS_SECURITY_STRATEGY", 
        "ROS_SECURITY_KEYSTORE", 
        "ROS_SECURITY_ENCLAVE_OVERRIDE"
    ]
    
    for var in security_vars:
        if var in os.environ:
            del os.environ[var]

    # 2. Inicjalizacja kontekstu JAWNEGO (Insecure)
    # Teraz środowisko jest "czyste", więc ten kontekst wstanie jako zwykły ROS2 (bez SROS).
    insecure_context = rclpy.Context()
    rclpy.init(context=insecure_context, args=[])

    try:
        # Tworzymy węzeł pomocniczy (jawny)
        insecure_node = rclpy.create_node("wheel_states_publisher_insecure", context=insecure_context)

        # Tworzymy główny węzeł logiki (bezpieczny)
        # Przekazujemy mu węzeł jawny jako "kuriera" do wynoszenia danych
        secure_controller_node = TwistController(insecure_publisher_node=insecure_node)

        # Executor obsługujący oba węzły
        executor = rclpy.executors.SingleThreadedExecutor()
        executor.add_node(secure_controller_node)
        executor.add_node(insecure_node)

        # Start
        executor.spin()

    except KeyboardInterrupt:
        pass
    finally:
        # Sprzątanie
        if 'secure_controller_node' in locals():
            secure_controller_node.destroy_node()
        if 'insecure_node' in locals():
            insecure_node.destroy_node()
        
        # Shutdown
        if rclpy.ok():
            rclpy.shutdown()
        # Insecure context shutdown
        if insecure_context.ok():
            insecure_context.shutdown()

if __name__ == "__main__":
    main()