```bash
# creating enclaves
cd ~/Web_Speech_remote_control/sros2_ws
ros2 security create_enclave teleop_keystore /teleop_policy/teleop_twist_joy_node
ros2 security create_enclave teleop_keystore /teleop_policy/teleop_bridge
ros2 security create_enclave teleop_keystore /teleop_policy/twist_controller
ros2 security create_enclave teleop_keystore /teleop_policy/mqtt_client

```

```bash
#generating policies using private key
cd ~/Web_Speech_remote_control/sros2_ws
ros2 security create_permission teleop_keystore   /teleop_policy/teleop_twist_joy_node  ./policies/teleop.policy.xml
ros2 security create_permission teleop_keystore   /teleop_policy/teleop_bridge  ./policies/teleop.policy.xml
ros2 security create_permission teleop_keystore   /teleop_policy/twist_controller  ./policies/teleop.policy.xml
ros2 security create_permission teleop_keystore   /teleop_policy/mqtt_client ./policies/teleop.policy.xml

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

```bash
# configuring mqtt_certs for mqtt_client
# Ustaw zmienne
export KEYSTORE=~/Web_Speech_remote_control/sros2_ws/teleop_keystore
export CERTS_DIR=~/Web_Speech_remote_control/sros2_ws/mqtt_certs
mkdir -p $CERTS_DIR

# 1. Generowanie klucza i CSR dla mqtt_client (jako klienta MQTT)
openssl req -new -newkey rsa:2048 -nodes \
    -keyout $CERTS_DIR/mqtt_client_node.key \
    -out $CERTS_DIR/mqtt_client_node.csr \
    -subj "/C=PL/O=RobotProject/CN=mqtt_client_node"

# 2. Podpisanie certyfikatu przez SROS 2 Identity CA
openssl x509 -req -in $CERTS_DIR/mqtt_client_node.csr \
    -CA $KEYSTORE/public/identity_ca.cert.pem \
    -CAkey $KEYSTORE/private/identity_ca.key.pem \
    -CAcreateserial \
    -out $CERTS_DIR/mqtt_client_node.crt \
    -days 3650 -sha256

# 3. Upewnij się, że uprawnienia są poprawne (klucz prywatny musi być czytelny dla użytkownika uruchamiającego ROS)
chmod 644 $CERTS_DIR/mqtt_client_node.crt
chmod 600 $CERTS_DIR/mqtt_client_node.key
```

```bash
# configuring mqtt_certs for mqtt_broker
# Ustawienie zmiennych (tak samo jak wcześniej)
export KEYSTORE=~/Web_Speech_remote_control/sros2_ws/teleop_keystore
export CERTS_DIR=~/Web_Speech_remote_control/sros2_ws/mqtt_certs
mkdir -p $CERTS_DIR
cd $CERTS_DIR

# 1. Generujemy klucz prywatny dla Brokera
# CN=localhost jest ważne, bo klient (ROS) łączy się z "localhost"
openssl req -new -newkey rsa:2048 -nodes \
    -keyout mqtt_broker.key \
    -out mqtt_broker.csr \
    -subj "/C=PL/O=RobotProject/CN=localhost"

# 2. Podpisujemy go kluczem CA z SROS 2 (Identity CA)
openssl x509 -req -in mqtt_broker.csr \
    -CA $KEYSTORE/public/identity_ca.cert.pem \
    -CAkey $KEYSTORE/private/identity_ca.key.pem \
    -CAcreateserial \
    -out mqtt_broker.crt \
    -days 3650 -sha256

# 3. Kopiujemy publiczny certyfikat CA do folderu (Broker musi go mieć, żeby sprawdzać klientów)
cp $KEYSTORE/public/identity_ca.cert.pem ca_root.crt

# 4. Nadajemy uprawnienia (żeby Mosquitto mogło czytać pliki bez sudo - do testów)
chmod 644 mqtt_broker.crt mqtt_broker.key ca_root.crt
```

```bash
# turn off mosquitto
sudo systemctl stop mosquitto
# uruchomienie mosquitto z konfiguracją zabezpieczoną
mosquitto -c ~/Web_Speech_remote_control/sros2_ws/mqtt_certs/sec_mosquitto.conf -v
# uruchomienie mosquitto z konfiguracją nie zabezpieczoną
mosquitto -c ~/Web_Speech_remote_control/sros2_ws/mqtt_certs/mosquitto.conf -v

# tuning on
sudo systemctl start mosquitto
# or
mosquitto -v
```