const ipcROS = require("electron").ipcRenderer;

document.getElementById('move-forward').addEventListener('click', function() {
    ipcROS.send('move-forward');
});

document.getElementById('turn-right').addEventListener('click', function() {
    ipcROS.send('turn-right');
});

document.getElementById('turn-left').addEventListener('click', function() {
    ipcROS.send('turn-left');
});

