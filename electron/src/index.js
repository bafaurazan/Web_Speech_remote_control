const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const pty = require("node-pty");
const os = require("os");
const rclnodejs = require('rclnodejs');

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
        
        // --- SEKCJA TURTLE (Oryginalna) ---
        const node = new rclnodejs.Node('turtle_controller');
        const cmdVelPublisher = node.createPublisher('geometry_msgs/msg/Twist', '/turtle1/cmd_vel');

        function moveTurtle(linear, angular) {
            const twist = {
                linear: { x: linear, y: 0, z: 0 },
                angular: { x: 0, y: 0, z: angular }
            };
            cmdVelPublisher.publish(twist);
        }

        /* ipcMain.on('forward_rover', () => moveTurtle(1, 0));
        ipcMain.on('backward_rover', () => moveTurtle(-1, 0));
        // ... (zakomentowane wywołania dla turtle, jeśli nie są używane przez łazika)
        */


        // --- SEKCJA ROVER (Łazik) ---
        const rover_node = new rclnodejs.Node('rover_js_controller');
        
        // Publishery na lewą i prawą stronę
        const rover_pub_left = rover_node.createPublisher('geometry_msgs/msg/Twist', '/diff_drive_controller_left/cmd_vel_unstamped');
        const rover_pub_right = rover_node.createPublisher('geometry_msgs/msg/Twist', '/diff_drive_controller_right/cmd_vel_unstamped');

        // Funkcje pomocnicze do przycisków
        function moveRoverLeft(linear, angular) {
            const twist = { linear: { x: linear, y: 0, z: 0 }, angular: { x: 0, y: 0, z: angular } };
            const twistStop = { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } };
            rover_pub_right.publish(twistStop);
            rover_pub_left.publish(twist);
        }
        function moveRoverRight(linear, angular) {
            const twist = { linear: { x: linear, y: 0, z: 0 }, angular: { x: 0, y: 0, z: angular } };
            const twistStop = { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } };
            rover_pub_left.publish(twistStop);
            rover_pub_right.publish(twist);
        }
        function moveRover(linear, angular) {
            const twist = { linear: { x: linear, y: 0, z: 0 }, angular: { x: 0, y: 0, z: angular } };
            rover_pub_left.publish(twist);
            rover_pub_right.publish(twist);
        }

        // Obsługa przycisków (Dyskretna)
        ipcMain.on('forward_rover', () => moveRover(2, 0));
        ipcMain.on('backward_rover', () => moveRover(-2, 0));
        ipcMain.on('right_rover', () => moveRoverLeft(2, 0));
        ipcMain.on('left_rover', () => moveRoverRight(2, 0));
        ipcMain.on('stop_rover', () => moveRover(0, 0));


        // ==========================================================
        // NOWA SEKCJA: Obsługa Joysticka (Płynna)
        // ==========================================================
        ipcMain.on('robot_joystick', (event, data) => {
            // data to obiekt: { linear: <liczba -1 do 1>, angular: <liczba -1 do 1> }
            
            // Maksymalna prędkość (dopasowana do przycisków = 2)
            const MAX_SPEED = 2.0;
            const MAX_TURN = 2.0;

            const lin = data.linear * MAX_SPEED;
            const ang = data.angular * MAX_TURN;

            // Algorytm Arcade Drive (Sterowanie czołgowe/różnicowe)
            // Mieszamy wejścia, aby uzyskać prędkości dla lewej i prawej strony.
            // W zależności od orientacji silników, znaki (+/-) przy 'ang' mogą wymagać zamiany.
            // Standardowo: Lewa = Przód - Obrót, Prawa = Przód + Obrót (lub odwrotnie)
            
            let leftSpeed = lin + ang;
            let rightSpeed = lin - ang;

            // Tworzenie wiadomości Twist dla obu kontrolerów
            const twistLeft = {
                linear: { x: leftSpeed, y: 0, z: 0 },
                angular: { x: 0, y: 0, z: 0 }
            };

            const twistRight = {
                linear: { x: rightSpeed, y: 0, z: 0 },
                angular: { x: 0, y: 0, z: 0 }
            };

            // Publikacja do ROS 2
            rover_pub_left.publish(twistLeft);
            rover_pub_right.publish(twistRight);
        });
        // ==========================================================


        // Spinujemy node (tutaj node 'turtle', ale w rclnodejs kontekst jest współdzielony, 
        // więc publishery 'rover_node' też będą działać).
        rclnodejs.spin(node);

    }).catch(console.error);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});