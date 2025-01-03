/*
 * Name: blink_pin_2 test with wifi and pwm
 * Version: [0.2.0] 
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
#include <std_msgs/msg/int32.h>
#include <rclc/rclc.h>
#include <rclc/executor.h>
#include <driver/ledc.h>

#ifdef CONFIG_MICRO_ROS_ESP_XRCE_DDS_MIDDLEWARE
#include <rmw_microros/rmw_microros.h>
#endif

#define RCCHECK(fn) { rcl_ret_t temp_rc = fn; if((temp_rc != RCL_RET_OK)){printf("Failed status on line %d: %d. Aborting.\n",__LINE__,(int)temp_rc);vTaskDelete(NULL);}}
#define RCSOFTCHECK(fn) { rcl_ret_t temp_rc = fn; if((temp_rc != RCL_RET_OK)){printf("Failed status on line %d: %d. Continuing.\n",__LINE__,(int)temp_rc);}}

#define LED_PIN 2

rcl_subscription_t subscription;
std_msgs__msg__Int32 msg;
bool led_should_blink = false;

// Konfiguracja PWM
#define LEDC_TIMER              LEDC_TIMER_0
#define LEDC_MODE               LEDC_LOW_SPEED_MODE
#define LEDC_CHANNEL            LEDC_CHANNEL_0
#define LEDC_DUTY_RES           LEDC_TIMER_13_BIT
#define LEDC_FREQUENCY          5000 // 5 kHz
#define LEDC_MAX_DUTY           ((1 << LEDC_DUTY_RES) - 1) // Maksymalna wartość dla 13-bitowego PWM

// Callback funkcja, która sprawdza wiadomość i decyduje o miganiu LED
void subscription_callback(const void *msg_in)
{
    const std_msgs__msg__Int32 *received_msg = (const std_msgs__msg__Int32 *)msg_in;
    printf("Received: %d\n", (int) received_msg->data);

    if (received_msg->data == 1) {
        led_should_blink = true;
    } else {
        led_should_blink = false;
        ledc_set_duty(LEDC_MODE, LEDC_CHANNEL, 0); // Wyłącz LED
        ledc_update_duty(LEDC_MODE, LEDC_CHANNEL);
    }
}

// Zadanie FreeRTOS, które obsługuje miganie diody z PWM
void led_blink_task(void *arg)
{
    while (1) {
        if (led_should_blink) {
            for (int duty = 0; duty <= LEDC_MAX_DUTY; duty += 256) { // Jasność od 0 do max
                ledc_set_duty(LEDC_MODE, LEDC_CHANNEL, duty);
                ledc_update_duty(LEDC_MODE, LEDC_CHANNEL);
                vTaskDelay(pdMS_TO_TICKS(10)); // Szybkość wzrostu jasności
            }

            for (int duty = LEDC_MAX_DUTY; duty >= 0; duty -= 256) { // Jasność od max do 0
                ledc_set_duty(LEDC_MODE, LEDC_CHANNEL, duty);
                ledc_update_duty(LEDC_MODE, LEDC_CHANNEL);
                vTaskDelay(pdMS_TO_TICKS(10));
            }
        } else {
            vTaskDelay(pdMS_TO_TICKS(100)); // Czekanie, gdy LED nie powinien migać
        }
    }
}

void micro_ros_task(void *arg)
{
    // Konfiguracja PWM dla LED
    ledc_timer_config_t ledc_timer = {
        .duty_resolution = LEDC_DUTY_RES,
        .freq_hz = LEDC_FREQUENCY,
        .speed_mode = LEDC_MODE,
        .timer_num = LEDC_TIMER,
        .clk_cfg = LEDC_AUTO_CLK
    };
    ledc_timer_config(&ledc_timer);

    ledc_channel_config_t ledc_channel = {
        .channel    = LEDC_CHANNEL,
        .duty       = 0,
        .gpio_num   = LED_PIN,
        .speed_mode = LEDC_MODE,
        .hpoint     = 0,
        .timer_sel  = LEDC_TIMER
    };
    ledc_channel_config(&ledc_channel);

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
    RCCHECK(rclc_node_init_default(&node, "esp32_int32_subscriber", "", &support));

    // Tworzenie subskrypcji
    RCCHECK(rclc_subscription_init_default(
        &subscription,
        &node,
        ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, Int32),
        "freertos_int32_subscriber"));

    // Tworzenie executor
    rclc_executor_t executor;
    RCCHECK(rclc_executor_init(&executor, &support.context, 1, &allocator));
    RCCHECK(rclc_executor_add_subscription(&executor, &subscription, &msg, &subscription_callback, ON_NEW_DATA));

    // Tworzenie zadania dla migania diody
    xTaskCreate(led_blink_task, "LED_Blink_Task", 2048, NULL, 1, NULL);

    while (1) {
        rclc_executor_spin_some(&executor, RCL_MS_TO_NS(100));
        vTaskDelay(pdMS_TO_TICKS(100));
    }

    // Zwalnianie zasobów
    RCCHECK(rcl_subscription_fini(&subscription, &node));
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

