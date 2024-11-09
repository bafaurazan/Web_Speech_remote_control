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
        ipcMain.on('move-forward', () => moveTurtle(1, 0));
        ipcMain.on('turn-right', () => moveTurtle(0, 1));
        ipcMain.on('turn-left', () => moveTurtle(0, -1));

        rclnodejs.spin(node);
    }).catch(console.error);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
