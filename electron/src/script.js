// Inicjalizacja połączenia z ROS

var ros = new ROSLIB.Ros({
    url: 'ws://localhost:9090'
});

var cmdVel = new ROSLIB.Topic({
    ros: ros,
    name: '/turtle1/cmd_vel',
    messageType: 'geometry_msgs/Twist'
});

function moveTurtle(linear, angular) {
    var twist = new ROSLIB.Message({
        linear: { x: linear, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: angular }
    });
    cmdVel.publish(twist);
}

// Rejestracja event listenerów
document.getElementById('move-forward').addEventListener('click', function() {
    moveTurtle(1, 0);
});

document.getElementById('turn-right').addEventListener('click', function() {
    moveTurtle(0, 1);
});

document.getElementById('turn-left').addEventListener('click', function() {
    moveTurtle(0, -1);
});
