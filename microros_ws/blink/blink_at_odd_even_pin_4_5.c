#include <stdio.h>
#include <unistd.h>

#include <rcl/rcl.h>
#include <rcl/error_handling.h>
#include <rclc/rclc.h>
#include <rclc/executor.h>

#include <std_msgs/msg/int32.h>

#include "freertos/FreeRTOS.h"  // Add this include for FreeRTOS functions
#include "freertos/task.h"      // Add this include for task-related functions
#include <driver/gpio.h>
#include <driver/ledc.h>

#define LED_PIN_1 4    // Pin dla pierwszej diody LED
#define LED_PIN_2 5    // Pin dla drugiej diody LED

#define RCCHECK(fn) { rcl_ret_t temp_rc = fn; if((temp_rc != RCL_RET_OK)){printf("Failed status on line %d: %d. Aborting.\n",__LINE__,(int)temp_rc);vTaskDelete(NULL);}}
#define RCSOFTCHECK(fn) { rcl_ret_t temp_rc = fn; if((temp_rc != RCL_RET_OK)){printf("Failed status on line %d: %d. Continuing.\n",__LINE__,(int)temp_rc);}}

rcl_subscription_t subscriber;
std_msgs__msg__Int32 msg;

bool fade_led = false; // Flaga do kontrolowania efektu płynnego zapalania LED

void subscription_callback(const void * msgin)
{
    const std_msgs__msg__Int32 * received_msg = (const std_msgs__msg__Int32 *)msgin;
    printf("Received: %d\n", received_msg->data);

    // Ustaw flagę fade_led w zależności od parzystości liczby
    if (received_msg->data % 2 != 0) {
        fade_led = true;
    } else {
        fade_led = false;
        // Wyłącz LED przez ustawienie wypełnienia PWM na 0
        ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, 0);
        ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1, 0);
        ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0);
        ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1);
    }
}

void pwm_led_fade_task(void *arg) {
    int duty = 0;
    int fade_step = 30;   // Rozmiar kroku zmiany wypełnienia PWM
    bool increasing = true;

    while (1) {
        if (fade_led) {
            // Ustaw wypełnienie PWM dla obu diod LED
            ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, duty);
            ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1, duty);
            ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0);
            ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_1);

            // Zmieniaj wypełnienie PWM dla płynnego efektu rozjaśniania i ściemniania
            if (increasing) {
                duty += fade_step;
                if (duty >= 255) {
                    duty = 255;
                    increasing = false;
                }
            } else {
                duty -= fade_step;
                if (duty <= 0) {
                    duty = 0;
                    increasing = true;
                }
            }
            vTaskDelay(pdMS_TO_TICKS(20));  // Czas między zmianami wypełnienia dla płynnego efektu
        } else {
            vTaskDelay(pdMS_TO_TICKS(100)); // Jeśli fade_led jest false, zadanie uśpione na dłużej
        }
    }
}

void appMain(void * arg)
{
    // Inicjalizacja PWM dla obu diod LED
    ledc_timer_config_t ledc_timer = {
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .timer_num = LEDC_TIMER_0,
        .duty_resolution = LEDC_TIMER_8_BIT,
        .freq_hz = 1000, // Częstotliwość PWM
        .clk_cfg = LEDC_AUTO_CLK
    };
    ledc_timer_config(&ledc_timer);

    ledc_channel_config_t ledc_channel_1 = {
        .gpio_num = LED_PIN_1,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = LEDC_CHANNEL_0,
        .timer_sel = LEDC_TIMER_0,
        .duty = 0,
        .hpoint = 0
    };
    ledc_channel_config(&ledc_channel_1);

    ledc_channel_config_t ledc_channel_2 = {
        .gpio_num = LED_PIN_2,
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel = LEDC_CHANNEL_1,
        .timer_sel = LEDC_TIMER_0,
        .duty = 0,
        .hpoint = 0
    };
    ledc_channel_config(&ledc_channel_2);

    rcl_allocator_t allocator = rcl_get_default_allocator();
    rclc_support_t support;

    // create init_options
    RCCHECK(rclc_support_init(&support, 0, NULL, &allocator));

    // create node
    rcl_node_t node;
    RCCHECK(rclc_node_init_default(&node, "speed_subscriber_rclc", "", &support));

    // create subscriber
    RCCHECK(rclc_subscription_init_default(
        &subscriber,
        &node,
        ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, Int32),
        "rover/speed"));

    // create executor
    rclc_executor_t executor;
    RCCHECK(rclc_executor_init(&executor, &support.context, 1, &allocator));
    RCCHECK(rclc_executor_add_subscription(&executor, &subscriber, &msg, &subscription_callback, ON_NEW_DATA));

    // Tworzenie zadania FreeRTOS do efektu płynnego zapalania LED
    xTaskCreate(pwm_led_fade_task, "PWM_LED_Fade_Task", 2048, NULL, 1, NULL);

    while(1){
        rclc_executor_spin_some(&executor, RCL_MS_TO_NS(100));
        vTaskDelay(pdMS_TO_TICKS(100));  // Use vTaskDelay instead of usleep
    }

    // free resources
    RCCHECK(rcl_subscription_fini(&subscriber, &node));
    RCCHECK(rcl_node_fini(&node));
    
    vTaskDelete(NULL);
}
