# FusionHouse

Tutorial about websockets-webrtc-django are come from this youtube tutorial
[Watch this video](https://youtu.be/MBOlZMLaQ8g?si=QB97oG7h3Vlrpvi4)

**Note!:** on latest version of django try to use daphne for runserver command. Read documentation!


# memurai

### installation memurai

```
msiexec /quiet /i "C:\Users\rafal\Downloads\Memurai-Developer-v4.1.4.msi" INSTALLFOLDER="C:\MyApps\Memurai" ADD_INSTALLFOLDER_TO_PATH=1 INSTALL_SERVICE=0
```

### config

```
cd C:\MyApps\Memurai
nano memurai.conf

.
.
.
bind 0.0.0.0
protected-mode no
```

### and open memurai with config

```
memurai memurai.conf
```

### memurai connection tests

```
memurai-cli -h 7.tcp.eu.ngrok.io -p 13878
memurai-cli -h 127.0.0.1 -p 6379
```

# ngrok config


```
cd C:\Users\rafal\AppData\Local\ngrok
ngrok.yml
```

```
version: "3"
agent:
  authtoken: 2lt8FDwIZsUjuZxjHd7T6kwsDx8_7XKBCUJ9HesaBicUu6XyV
tunnels:
  http:
    proto: http
    addr: 8081
  http_8000:
    proto: http
    addr: 8000
  tcp:
    proto: tcp
    addr: 6379

```

### lub

```
ngrok http 8081
```

### ponizsze ponoc platne

```
ngrok http 5900 --websocket-tcp-converter
```

# To start server

```
cd api
poetry install
poetry run python manage.py runserver 0.0.0.0:8000
```

## To share server remotely

download tailscale

```
curl -fsSL https://tailscale.com/install.sh | sh
```

and start tailscale serve

```
sudo tailscale serve 8000
```

### to schare in my subnet too

one time at least i think

```
echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
sudo sysctl -p /etc/sysctl.d/99-tailscale.conf

```

```
sudo tailscale funnel 8000
```

share generated link
