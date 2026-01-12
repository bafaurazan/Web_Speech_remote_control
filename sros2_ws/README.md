```bash
#generating policies using private key
cd ~/Web_Speech_remote_control/sros2_ws
ros2 security create_permission teleop_keystore   /teleop_policy/teleop_twist_joy_node  ./policies/teleop.policy.xml
ros2 security create_permission teleop_keystore   /teleop_policy/teleop_bridge  ./policies/teleop.policy.xml
ros2 security create_permission teleop_keystore   /teleop_policy/twist_controller  ./policies/teleop.policy.xml

```

```bash
#secured
ros2 launch teleop_bringup sec_twist_joy_g1.launch.py 

#no secured
ros2 launch teleop_bringup twist_joy_g1.launch.py 

```
[ros2 dds security integration](https://design.ros2.org/articles/ros2_dds_security.html)

```bash
#changing governance
export KEYSTORE_PATH=./teleop_keystore

# Magiczna komenda openssl (podpisuje Twój XML kluczem Permissions CA)
openssl smime -sign -text -in ./teleop_keystore/enclaves/governance.xml \
    -out $KEYSTORE_PATH/enclaves/governance.p7s \
    -signer $KEYSTORE_PATH/public/permissions_ca.cert.pem \
    -inkey $KEYSTORE_PATH/private/permissions_ca.key.pem

```