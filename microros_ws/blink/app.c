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

#define LED_PIN 2

#define RCCHECK(fn) { rcl_ret_t temp_rc = fn; if((temp_rc != RCL_RET_OK)){printf("Failed status on line %d: %d. Aborting.\n",__LINE__,(int)temp_rc);vTaskDelete(NULL);}}
#define RCSOFTCHECK(fn) { rcl_ret_t temp_rc = fn; if((temp_rc != RCL_RET_OK)){printf("Failed status on line %d: %d. Continuing.\n",__LINE__,(int)temp_rc);}}

rcl_subscription_t subscriber;
std_msgs__msg__Int32 msg;

void subscription_callback(const void * msgin)
{
    const std_msgs__msg__Int32 * received_msg = (const std_msgs__msg__Int32 *)msgin;
    printf("Received: %d\n", received_msg->data);

    // Zapal LED, gdy dane sa parzyste
    if (received_msg->data % 2 != 0) {
        gpio_set_level(LED_PIN, 1); // Zapal LED
    } else {
        gpio_set_level(LED_PIN, 0); // Zgaś LED
    }
}

void appMain(void * arg)
{
    // Inicjalizacja GPIO dla LED
    gpio_pad_select_gpio(LED_PIN);
    gpio_set_direction(LED_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level(LED_PIN, 0); // Zgaś LED na początku

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

    while(1){
        rclc_executor_spin_some(&executor, RCL_MS_TO_NS(100));
        vTaskDelay(pdMS_TO_TICKS(100));  // Use vTaskDelay instead of usleep
    }

    // free resources
    RCCHECK(rcl_subscription_fini(&subscriber, &node));
    RCCHECK(rcl_node_fini(&node));
    
    vTaskDelete(NULL);
}
