# teleop_hand_eye_tracking

# 1. Usuń agresywnie obecne wersje (ignorując błędy)
pip uninstall -y mediapipe protobuf opencv-python opencv-contrib-python numpy matplotlib

# 2. Zainstaluj stabilny zestaw z pliku (wymuszając instalację w .local)
pip install --ignore-installed -r requirements.txt

source install/setup.bash

pip3 install -e ./$(colcon list --packages-select teleop_hand_eye_tracking --paths-only)/teleop_hand_eye_tracking/unitree_sdk2_python

