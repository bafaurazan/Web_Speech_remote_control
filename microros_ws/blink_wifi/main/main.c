/*
 * Name: controlling rover wifi with dynamic pwm left, right, forward, stop, backward movement (backward with pins 27,26,25,33)
 * Version: [1.3.0] 
 * Autor: Rafal Bazan
 * Date: 2024
 */

#include <string.h>
#include <stdio.h>
#include <unistd.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_system.h"

#include <uros_network_interfaces.h>
#include <rcl/rcl.h>
#include <rcl/error_handling.h>
#include <geometry_msgs/msg/twist.h>
#include <rclc/rclc.h>
#include <rclc/executor.h>
#include <driver/ledc.h>

#ifdef CONFIG_MICRO_ROS_ESP_XRCE_DDS_MIDDLEWARE
#include <rmw_microros/rmw_microros.h>
#endif

#define RCCHECK(fn) { rcl_ret_t temp_rc = fn; if((temp_rc != RCL_RET_OK)){printf("Failed status on line %d: %d. Aborting.\n",__LINE__,(int)temp_rc);vTaskDelete(NULL);}}
#define RCSOFTCHECK(fn) { rcl_ret_t temp_rc = fn; if((temp_rc != RCL_RET_OK)){printf("Failed status on line %d: %d. Continuing.\n",__LINE__,(int)temp_rc);}}

#define LEDC_TIMER              LEDC_TIMER_0
#define LEDC_MODE               LEDC_LOW_SPEED_MODE
#define LEDC_DUTY_RES           LEDC_TIMER_13_BIT
#define LEDC_FREQUENCY          5000 // 5 kHz
#define LEDC_MAX_DUTY           ((1 << LEDC_DUTY_RES) - 1) // Maksymalna wartość dla 13-bitowego PWM

// Piny LED
#define LED_PINS_COUNT 4
const int LED_PINS[LED_PINS_COUNT] = {4, 5, 18, 19};

#define REVERSE_PINS_COUNT 4
const int REVERSE_PINS[REVERSE_PINS_COUNT] = {27, 26, 25, 33};

// Funkcja pomocnicza do ustawiania stanu pinów dla ruchu wstecz
void set_reverse_pins_right(bool enable)
{
    for (int i = 0; i < REVERSE_PINS_COUNT / 2; i++) {
        gpio_set_level(REVERSE_PINS[i + 2], enable ? 1 : 0);
    }
}

void set_reverse_pins_left(bool enable)
{
    for (int i = 0; i < REVERSE_PINS_COUNT / 2; i++) {
        gpio_set_level(REVERSE_PINS[i], enable ? 1 : 0);
    }
}

// Kanały PWM dla każdego pinu
const ledc_channel_t LED_CHANNELS[LED_PINS_COUNT] = {
    LEDC_CHANNEL_0,
    LEDC_CHANNEL_1,
    LEDC_CHANNEL_2,
    LEDC_CHANNEL_3
};

rcl_subscription_t subscription_right;
rcl_subscription_t subscription_left;
geometry_msgs__msg__Twist msg_right;
geometry_msgs__msg__Twist msg_left;
float trajectory_left = 0.0;
float trajectory_right = 0.0;

// [1.0.1]-Version - "slow pwm changes with backward movement- [forward, backward to fix]"

// Callback funkcja, która przetwarza wiadomości z prawego topica
void subscription_callback_right(const void *msg_in)
{
    const geometry_msgs__msg__Twist *received_msg = (const geometry_msgs__msg__Twist *)msg_in;
    float linear_x = received_msg->linear.x;

    printf("Received Twist (right): linear.x = %.2f, angular.z = %.2f\n", linear_x, received_msg->angular.z);
    trajectory_right = linear_x;
}

// Callback funkcja, która przetwarza wiadomości z lewego topica
void subscription_callback_left(const void *msg_in)
{
    const geometry_msgs__msg__Twist *received_msg = (const geometry_msgs__msg__Twist *)msg_in;
    float linear_x = received_msg->linear.x;

    printf("Received Twist (left): linear.x = %.2f, angular.z = %.2f\n", linear_x, received_msg->angular.z);
    trajectory_left = linear_x;
}

// Zadanie FreeRTOS, które steruje silnikami łazika
void rover_move_task(void *arg)
{
    int target_duty_cycle_right = 0; // Docelowy duty cycle dla prawego napędu
    int target_duty_cycle_left = 0;  // Docelowy duty cycle dla lewego napędu
    int current_duty_cycle_right = 0; // Aktualny duty cycle dla prawego napędu
    int current_duty_cycle_left = 0;  // Aktualny duty cycle dla lewego napędu
    const int step = 1200; // Wielkość zmiany PWM na iterację
    int set_duty_cycle_right = 0;
    int set_duty_cycle_left = 0;

    while (1) {
        // Ustaw docelowy duty cycle w zależności od sygnałów sterujących
        if (trajectory_right == 2.0) {
            target_duty_cycle_right = LEDC_MAX_DUTY;
        } else if (trajectory_right == -2.0) {
            target_duty_cycle_right = -LEDC_MAX_DUTY;
        } else {
            target_duty_cycle_right = 0;
        }

        if (trajectory_left == 2.0) {
            target_duty_cycle_left = LEDC_MAX_DUTY;
        } else if (trajectory_left == -2.0) {
            target_duty_cycle_left = -LEDC_MAX_DUTY;
        } else {
            target_duty_cycle_left = 0;
        }

        // Płynna zmiana aktualnego duty cycle dla prawego napędu
        if (current_duty_cycle_right < target_duty_cycle_right) {
            current_duty_cycle_right += step;
            if (current_duty_cycle_right > target_duty_cycle_right) {
                current_duty_cycle_right = target_duty_cycle_right;
            }
        } else if (current_duty_cycle_right > target_duty_cycle_right) {
            current_duty_cycle_right -= step;
            if (current_duty_cycle_right < target_duty_cycle_right) {
                current_duty_cycle_right = target_duty_cycle_right;
            }
        }

        // Płynna zmiana aktualnego duty cycle dla lewego napędu
        if (current_duty_cycle_left < target_duty_cycle_left) {
            current_duty_cycle_left += step;
            if (current_duty_cycle_left > target_duty_cycle_left) {
                current_duty_cycle_left = target_duty_cycle_left;
            }
        } else if (current_duty_cycle_left > target_duty_cycle_left) {
            current_duty_cycle_left -= step;
            if (current_duty_cycle_left < target_duty_cycle_left) {
                current_duty_cycle_left = target_duty_cycle_left;
            }
        }

        if (current_duty_cycle_right >= 0) {
            set_duty_cycle_right = current_duty_cycle_right;
            set_reverse_pins_right(false);
        } else if (current_duty_cycle_right < 0) {
            set_duty_cycle_right = -current_duty_cycle_right;
            set_reverse_pins_right(true);
        }

        if (current_duty_cycle_left >= 0) {
            set_duty_cycle_left = current_duty_cycle_left;
            set_reverse_pins_left(false);
        } else if (current_duty_cycle_left < 0) {
            set_duty_cycle_left = -current_duty_cycle_left;
            set_reverse_pins_left(true);
        }

        // Zastosowanie aktualnych wartości PWM dla prawego napędu
        for (int i = 0; i < LED_PINS_COUNT / 2; i++) {
            ledc_set_duty(LEDC_MODE, LED_CHANNELS[i + 2], set_duty_cycle_right);
            ledc_update_duty(LEDC_MODE, LED_CHANNELS[i + 2]);
        }

        // Zastosowanie aktualnych wartości PWM dla lewego napędu
        for (int i = 0; i < LED_PINS_COUNT / 2; i++) {
            ledc_set_duty(LEDC_MODE, LED_CHANNELS[i], set_duty_cycle_left);
            ledc_update_duty(LEDC_MODE, LED_CHANNELS[i]);
        }

        vTaskDelay(pdMS_TO_TICKS(100)); // Czekanie między iteracjami
    }
}


void micro_ros_task(void *arg)
{
    // Inicjalizacja pinów dla ruchu wstecz
    for (int i = 0; i < REVERSE_PINS_COUNT; i++) {
        gpio_reset_pin(REVERSE_PINS[i]);
        gpio_set_direction(REVERSE_PINS[i], GPIO_MODE_OUTPUT);
        gpio_set_level(REVERSE_PINS[i], 0); // Początkowo wyłączone
    }

    // Konfiguracja PWM dla LED
    ledc_timer_config_t ledc_timer = {
        .duty_resolution = LEDC_DUTY_RES,
        .freq_hz = LEDC_FREQUENCY,
        .speed_mode = LEDC_MODE,
        .timer_num = LEDC_TIMER,
        .clk_cfg = LEDC_AUTO_CLK
    };
    ledc_timer_config(&ledc_timer);

    for (int i = 0; i < LED_PINS_COUNT; i++) {
        ledc_channel_config_t ledc_channel = {
            .channel    = LED_CHANNELS[i],
            .duty       = 0,
            .gpio_num   = LED_PINS[i],
            .speed_mode = LEDC_MODE,
            .hpoint     = 0,
            .timer_sel  = LEDC_TIMER
        };
        ledc_channel_config(&ledc_channel);
    }

    rcl_allocator_t allocator = rcl_get_default_allocator();
    rclc_support_t support;

    rcl_init_options_t init_options = rcl_get_zero_initialized_init_options();
    RCCHECK(rcl_init_options_init(&init_options, allocator));

#ifdef CONFIG_MICRO_ROS_ESP_XRCE_DDS_MIDDLEWARE
    rmw_init_options_t* rmw_options = rcl_init_options_get_rmw_init_options(&init_options);

    RCCHECK(rmw_uros_options_set_udp_address(CONFIG_MICRO_ROS_AGENT_IP, CONFIG_MICRO_ROS_AGENT_PORT, rmw_options));
#endif

    // Tworzenie wsparcia ROS 2
    RCCHECK(rclc_support_init_with_options(&support, 0, NULL, &init_options, &allocator));

    // Tworzenie nodu
    rcl_node_t node;
    RCCHECK(rclc_node_init_default(&node, "twist_subscriber_rclc", "", &support));

    // Tworzenie subskrypcji dla prawego napędu
    RCCHECK(rclc_subscription_init_default(
        &subscription_right,
        &node,
        ROSIDL_GET_MSG_TYPE_SUPPORT(geometry_msgs, msg, Twist),
        "/diff_drive_controller_right/cmd_vel_unstamped"));

    // Tworzenie subskrypcji dla lewego napędu
    RCCHECK(rclc_subscription_init_default(
        &subscription_left,
        &node,
        ROSIDL_GET_MSG_TYPE_SUPPORT(geometry_msgs, msg, Twist),
        "/diff_drive_controller_left/cmd_vel_unstamped"));

    // Tworzenie executor
    rclc_executor_t executor;
    RCCHECK(rclc_executor_init(&executor, &support.context, 2, &allocator));
    RCCHECK(rclc_executor_add_subscription(&executor, &subscription_right, &msg_right, &subscription_callback_right, ON_NEW_DATA));
    RCCHECK(rclc_executor_add_subscription(&executor, &subscription_left, &msg_left, &subscription_callback_left, ON_NEW_DATA));

    // Tworzenie zadania dla ruchu łazika
    xTaskCreate(rover_move_task, "Rover_Move_Task", 2048, NULL, 1, NULL);

    while (1) {
        rclc_executor_spin_some(&executor, RCL_MS_TO_NS(100));
        vTaskDelay(pdMS_TO_TICKS(100));
    }

    // Zwalnianie zasobów
    RCCHECK(rcl_subscription_fini(&subscription_right, &node));
    RCCHECK(rcl_subscription_fini(&subscription_left, &node));
    RCCHECK(rcl_node_fini(&node));

    vTaskDelete(NULL);
}

void app_main(void)
{
#if defined(CONFIG_MICRO_ROS_ESP_NETIF_WLAN) || defined(CONFIG_MICRO_ROS_ESP_NETIF_ENET)
    ESP_ERROR_CHECK(uros_network_interface_initialize());
#endif

    // Utworzenie zadania FreeRTOS dla micro-ROS
    xTaskCreate(micro_ros_task,
            "uros_task",
            CONFIG_MICRO_ROS_APP_STACK,
            NULL,
            CONFIG_MICRO_ROS_APP_TASK_PRIO,
            NULL);
}