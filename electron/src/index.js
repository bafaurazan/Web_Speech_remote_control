const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path')
const pty = require("node-pty");
const os = require("os");
var shell = os.platform() === "win32" ? "powershell.exe" : "bash";

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
    ptyProcess.write(command + '\r');  // Wysyłamy komendę do pseudoterminalu (PTY)
});

app.on("ready", createWindow);


app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
