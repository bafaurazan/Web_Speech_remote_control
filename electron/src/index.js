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
        
        console.log(">>> ROS 2 Node zainicjalizowany dla G1 Pilot <<<");
        const node = new rclnodejs.Node('electron_joy_publisher');
        
        // Zmieniamy publisher na typ 'sensor_msgs/msg/Joy' i temat '/g1pilot/joy'
        const joyPublisher = node.createPublisher('sensor_msgs/msg/Joy', '/g1pilot/joy');

        // Funkcja pomocnicza do budowania i wysyłania wiadomości Joy
        // Axes: [left_x, left_y, right_x, right_y, trigger_axis, ...]
        // Buttons: [0, 1, 2, 3, 4, 5 (Stop), 6 (Balance), 7, 8 (MoveEnable), ...]
        function publishJoy(axes, buttons) {
            const joyMsg = {
                header: {
                    frame_id: 'electron_input',
                    stamp: node.now()
                },
                axes: axes,
                buttons: buttons
            };
            joyPublisher.publish(joyMsg);
        }

        // Inicjalizacja tablic (rozmiary zgodne z typowym padem Xbox/PS4, bezpieczny zapas)
        let defaultAxes = new Array(8).fill(0.0);
        let defaultButtons = new Array(12).fill(0);

        // ==========================================================
        // OBSŁUGA JOYSTICKA (Płynne sterowanie)
        // ==========================================================
        ipcMain.on('robot_joystick', (event, data) => {
            // data = { linear: <num>, angular: <num> }
            
            // Kopia domyślnych tablic
            let axes = [...defaultAxes];
            let buttons = [...defaultButtons];

            const linear = data.linear;   // Przód/Tył (-1 do 1)
            const angular = data.angular; // Lewo/Prawo (-1 do 1)

            // MAPOWANIE DLA loco_client.py:
            // vx  = axes[1] * -0.5  -> Aby jechać do przodu (vx > 0), axes[1] musi być UJEMNE.
            // yaw = axes[2] * -0.5  -> Aby skręcać (yaw != 0), używamy axes[2].

            // 1. Oś Przód/Tył (Forward/Backward)
            // Joystick Web wysyła 1.0 dla góry. My chcemy w Pythonie vx > 0.
            // Zatem: 1.0 * -1.0 = -1.0. W Pythonie: -1.0 * -0.5 = 0.5 m/s (Do przodu).
            axes[1] = linear * -1.0; 

            // 2. Oś Skrętu (Yaw)
            // Joystick Web wysyła 1.0 dla prawej.
            // W Pythonie: yaw = axes[2] * -0.5.
            axes[2] = angular; 

            // 3. DEADMAN SWITCH (Przycisk 8)
            // W loco_client.py ruch odbywa się TYLKO gdy msg.buttons[8] == 1.
            // Ustawiamy go na 1, jeśli wykryto jakiekolwiek wychylenie joysticka.
            if (Math.abs(linear) > 0.05 || Math.abs(angular) > 0.05) {
                buttons[8] = 1;
            } else {
                buttons[8] = 0; // Jeśli joystick puszczony, zatrzymaj (StopMove w pythonie)
            }

            publishJoy(axes, buttons);
        });

        // ==========================================================
        // OBSŁUGA PRZYCISKÓW DYSKRETNYCH (Z GUI)
        // ==========================================================
        
        // 1. Przycisk "Start/Wstań" (zmapowany pod strzałkę w górę w GUI)
        // W loco_client.py: Przycisk 6 (Rising edge) -> entering_balancing()
        ipcMain.on('forward_rover', () => {
            console.log("Komenda: WSTAŃ (Balancing)");
            let btns = [...defaultButtons];
            btns[6] = 1; // Symulujemy wciśnięcie przycisku 6
            publishJoy(defaultAxes, btns);

            // Musimy "puścić" przycisk, aby wykryć zbocze narastające przy kolejnym kliknięciu
            // (Choć loco_client reaguje na 'rising', czyli zmianę z 0 na 1, co zrobiliśmy wyżej)
            setTimeout(() => {
                btns[6] = 0;
                publishJoy(defaultAxes, btns);
            }, 200);
        });

        // 2. Przycisk "STOP" (Czerwony w GUI)
        // W loco_client.py: Przycisk 5 (Rising edge) -> Emergency Stop / Damp
        ipcMain.on('stop_rover', () => {
            console.log("Komenda: EMERGENCY STOP / DAMP");
            let btns = [...defaultButtons];
            btns[5] = 1; // Przycisk 5 to E-Stop
            publishJoy(defaultAxes, btns);
            
            setTimeout(() => {
                btns[5] = 0;
                publishJoy(defaultAxes, btns);
            }, 200);
        });

        // Opcjonalnie: Strzałka w dół jako "Siad" (Damp) - to samo co Stop, lub inne zachowanie
        ipcMain.on('backward_rover', () => {
            console.log("Komenda: DAMP (Siad)");
            let btns = [...defaultButtons];
            btns[5] = 1; // Używamy tego samego co Stop dla bezpieczeństwa
            publishJoy(defaultAxes, btns);
            setTimeout(() => { btns[5] = 0; publishJoy(defaultAxes, btns); }, 200);
        });
        
        // Pozostałe przyciski (lewo/prawo) z GUI można zignorować, 
        // bo sterowanie kierunkiem odbywa się przez Joystick.
        ipcMain.on('left_rover', () => console.log("Użyj joysticka do skręcania"));
        ipcMain.on('right_rover', () => console.log("Użyj joysticka do skręcania"));

        rclnodejs.spin(node);

    }).catch((e) => {
        console.error("Błąd inicjalizacji ROS 2:", e);
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});