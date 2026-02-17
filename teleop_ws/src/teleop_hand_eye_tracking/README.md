# teleop_hand_eye_tracking

# 1. Usuń agresywnie obecne wersje (ignorując błędy)
pip uninstall -y mediapipe protobuf opencv-python opencv-contrib-python numpy matplotlib

# 2. Zainstaluj stabilny zestaw z pliku (wymuszając instalację w .local)
pip install --ignore-installed -r requirements.txt
