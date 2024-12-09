# Web_Speech_Remote_control

The project presents the compilation of an AI assistant with online remote voice control

![](diagrams/connection_diagram/connection_diagram.png)

# Fast Test

1. setup django server
```
cd ~/Mateusz_task/Web_Speech_remote_control/api
poetry run python manage.py runserver 0.0.0.0:8000
```

2. setup tailscale
```
sudo tailscale funnel 8000
```
go to website

3. setup electron app
```
cd ~/Mateusz_task/Web_Speech_remote_control/electron
npm run start
```

4. In rover connect battery to buck-converter

5. In rover turn on powerbank

6. create wifi connection with esp32 
```
sudo docker run -it --rm --net=host microros/micro-ros-agent:humble udp4 --port 8888 -v6
```

7. In website start saying somethink similar to "start, stop"

8. In website test buttons

