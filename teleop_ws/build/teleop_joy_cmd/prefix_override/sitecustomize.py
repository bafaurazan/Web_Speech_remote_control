import sys
if sys.prefix == '/usr':
    sys.real_prefix = sys.prefix
    sys.prefix = sys.exec_prefix = '/home/rafal/Web_Speech_remote_control/teleop_ws/install/teleop_joy_cmd'
