# Introduction

This project integrates Electron with a Django backend and micro-ROS to provide a seamless interface for text-based chat and real-time control of a robotic system. The application serves as a bridge between web technologies and robotics, combining modern frontend capabilities with ROS 2-based backend operations. 

### Key Features:
1. **WebSocket Communication**: Enables real-time messaging and robot control via secure WebSocket connections.
2. **Text Chat**: A synchronized chat feature allows communication between app users and a web-based interface.
3. **ROS 2 Integration**: Controls a rover using commands sent via the Electron app, leveraging micro-ROS for lightweight communication.
4. **Cross-Platform Compatibility**: Build and run the app on multiple platforms with Electron’s packaging capabilities.

This setup requires minor code customization before installation to configure WebSocket addresses. It provides:
- Dynamic communication using Django’s backend API.
- Robot control capabilities using ROS 2 and micro-ROS.


## Dependencies
- Electron

## 1. Before installation

*in renderer.js code change line with your wss adress*

```
var wsStart = 'wss://<wss adress>/';  // Adres WebSocket 
```

*in index.html code change line with your wss adress* 

```
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self'    wss://<wss adress>/';">
```

# Testing

## 2. Install and run project

```
npm install
npm run build
npm run start
```

## 3. Test text-chat

**(Dependency Django server api/ must run)**
- log in on app and website with different names 
- start typing on app and you will see message on website

## 4. Test ROS2 controll

**(Dependency Django server api/ must run)**
**(micro-ros must be setup)**
- log in on app and website with different names 
- push button on app and you will see rover start moving 
- check console.log

## to install app open 

somethink like that

`dist/my_app Setup 0.0.1.exe`

## to open app open

`dist/win-unpacked/my_app.exe`

or

`select installation path`


