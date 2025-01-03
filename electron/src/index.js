const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const pty = require("node-pty");
const os = require("os");
const rclnodejs = require('rclnodejs');  // Importujemy rclnodejs

let shell = os.platform() === "win32" ? "powershell.exe" : "bash";
let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            devTools: true,
            enableRemoteModule: true,
            webSecurity: false,
        }
    });

    mainWindow.loadURL(`file://${__dirname}/index.html`);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

var ptyProcess = pty.spawn(shell, [], {
    name: "xterm-color",
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: process.env
});

ipcMain.on("terminal.executeCommand", (event, command) => {
    console.log("Otrzymana komenda do wykonania: ", command);
    ptyProcess.write(command + '\r');
});

app.on("ready", () => {
    createWindow();

    // Inicjalizacja ROS 2 Node za pomocą rclnodejs
    rclnodejs.init().then(() => {
        const node = new rclnodejs.Node('turtle_controller');
        
        // Tworzymy publisher dla topicu /turtle1/cmd_vel
        const cmdVelPublisher = node.createPublisher('geometry_msgs/msg/Twist', '/turtle1/cmd_vel');

        // Definiujemy funkcję do kontrolowania żółwia
        function moveTurtle(linear, angular) {
            const twist = {
                linear: { x: linear, y: 0, z: 0 },
                angular: { x: 0, y: 0, z: angular }
            };
            cmdVelPublisher.publish(twist);
        }

        // Obsługa eventów do ruchu żółwia na podstawie przycisków
        ipcMain.on('forward_rover', () => moveTurtle(1, 0));
        ipcMain.on('backward_rover', () => moveTurtle(-1, 0));
        ipcMain.on('right_rover', () => moveTurtle(0, 1));
        ipcMain.on('left_rover', () => moveTurtle(0, -1));
        ipcMain.on('stop_rover', () => moveTurtle(0, 0));

        /* 
        // sterowanie za pomocą danych typu int
        const node2 = new rclnodejs.Node('rover_control_web');
        
        // Tworzymy publisher dla topicu /turtle1/cmd_vel
        const cmdVelPublisher2 = node2.createPublisher('std_msgs/msg/Int32', '/rover/speed');
        
        // Definiujemy funkcję do kontrolowania żółwia
        function blink(data) {
            const myInt = {
                data: data
            };
            cmdVelPublisher2.publish(myInt);
        }
        
        ipcMain.on('forward_rover', () => blink(1));
        ipcMain.on('stop_rover', () => blink(0));
        */

        const rover_node = new rclnodejs.Node('rover_js_controller');
        
        // Tworzymy publisher dla topicu /turtle1/cmd_vel
        const rover_pub_left = rover_node.createPublisher('geometry_msgs/msg/Twist', '/diff_drive_controller_left/cmd_vel_unstamped');
        const rover_pub_right = rover_node.createPublisher('geometry_msgs/msg/Twist', '/diff_drive_controller_right/cmd_vel_unstamped');

        // Definiujemy funkcję do kontrolowania żółwia
        function moveRoverLeft(linear, angular) {
            const twist = {
                linear: { x: linear, y: 0, z: 0 },
                angular: { x: 0, y: 0, z: angular }
            };
            const twistStop = {
                linear: { x: 0, y: 0, z: 0 },
                angular: { x: 0, y: 0, z: 0 }
            };
            rover_pub_right.publish(twistStop);
            rover_pub_left.publish(twist);
        }
        function moveRoverRight(linear, angular) {
            const twist = {
                linear: { x: linear, y: 0, z: 0 },
                angular: { x: 0, y: 0, z: angular }
            };
            const twistStop = {
                linear: { x: 0, y: 0, z: 0 },
                angular: { x: 0, y: 0, z: 0 }
            };
            rover_pub_left.publish(twistStop);
            rover_pub_right.publish(twist);
        }

        function moveRover(linear, angular) {
            const twist = {
                linear: { x: linear, y: 0, z: 0 },
                angular: { x: 0, y: 0, z: angular }
            };
            rover_pub_left.publish(twist);
            rover_pub_right.publish(twist);
        }

        // Obsługa eventów do ruchu żółwia na podstawie przycisków
        ipcMain.on('forward_rover', () => moveRover(2, 0));
        ipcMain.on('backward_rover', () => moveRover(-2, 0));
        ipcMain.on('right_rover', () => moveRoverLeft(2, 0));
        ipcMain.on('left_rover', () => moveRoverRight(2, 0));
        ipcMain.on('stop_rover', () => moveRover(0, 0));


        rclnodejs.spin(node);
    }).catch(console.error);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
