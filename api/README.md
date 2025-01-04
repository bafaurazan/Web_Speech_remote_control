# Introduction

This project provides a Python-based backend API designed for integration with an Electron app and robotic systems. The server enables real-time text communication, robotic control via ROS 2, and integration with advanced features such as speech recognition and LLM-based interactions. It also supports remote access through Tailscale for seamless collaboration and testing across networks.

### Key Features:
1. **Real-Time Communication**: Enables live messaging and command execution through a terminal-connected Electron app.
2. **Remote Server Sharing**: Uses Tailscale for secure and efficient server access, including within local subnets and over the internet.
3. **Robust Robotics Integration**: Facilitates rover control with features such as keyboard navigation, audio/video management, and advanced speech recognition.
4. **Developer-Friendly Setup**: Built with Python and Poetry for streamlined dependency management and development.

### Use Cases:
- Remote control of robotic systems with real-time feedback.
- Collaboration and testing in distributed environments.
- Speech-to-action robotics with LLM-powered enhancements.

## Dependencies
- Python

## 1. After cloning repository:

```
cd api
poetry install
```

## 2. run server
```
poetry run python manage.py runserver 0.0.0.0:8000
```

## 3. To share server remotely

**download tailscale**

```
curl -fsSL https://tailscale.com/install.sh | sh
```

**start tailscale serve**

```
sudo tailscale serve 8000
```

**to schare in my subnet too**

```
echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
sudo sysctl -p /etc/sysctl.d/99-tailscale.conf
```

```
sudo tailscale funnel 8000
```

## 4. use generated link to:
- setup electron websocket server
- share server to others via tailscale 

# Testing

## 5. Test text-chat

**!!Beware!!**

electron app text-chat is connected to terminal, all messages (except predefined rover controlling messages) will be runned in default terminal


**(Dependency Electron app must run)**
- log in on app and website with different names 
- start typing on website and you will see message on app and other website window **(message in app will be runned in terminal)**


## 6. Test ROS2 controll

**(Dependency Electron app must run)**
**(micro-ros must be setup)**
- log in on app and website with different names 
- push buttons on website and you will see rover start moving:
  - rover controller buttons
  - screenshare
  - audio and video turn on/off
  - Speechrecognition button
  - Speechrecognition with LLM button
  - Rover keyboard controlling (W,S,A,D,E)
- check console.log
