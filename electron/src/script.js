const ipcROS = require("electron").ipcRenderer;

document.getElementById('rover-btn-forward').addEventListener('click', function() {
    ipcROS.send('forward_rover');
});

document.getElementById('rover-btn-left').addEventListener('click', function() {
    ipcROS.send('left_rover');
});

document.getElementById('rover-btn-right').addEventListener('click', function() {
    ipcROS.send('right_rover');
});

document.getElementById('rover-btn-backward').addEventListener('click', function() {
    ipcROS.send('backward_rover');
});

document.getElementById('rover-btn-stop').addEventListener('click', function() {
    ipcROS.send('stop_rover');
});


