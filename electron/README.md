# electron_app_installer
This project automates app installation for me to linux and windows from scratch

## to create installer
`npm run build`

## to fast app test
`npx electron .`

## to install app open 

somethink like that

`dist/my_app Setup 0.0.1.exe`

## to open app open

`dist/win-unpacked/my_app.exe`

or

`selected installation path`


# FusionHouse
The project presents the compilation of an AI assistant with multiple technologies

## Opening

### at 

```
~/FusionHouse/websocket-webrtc-django-tutorial-test/mysite 
```

### type

```
poetry install
poetry run python manage.py runserver 0.0.0.0:8000
```

### open ngrok and write

```
ngrok http 8000
```

### open

```
~/electron_app_installer
```

### in renderer.js code change line with your ngrok adress 

```
var wsStart = 'wss://e70f-193-19-165-84.ngrok-free.app';
```

### in index.html code change line with your ngrok adress 

```
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self'    wss://e70f-193-19-165-84.ngrok-free.app;">
```


### type

```
npm run build
npm run start
```

### log in with differents name on websites and test typing on browser

#### if electron app opened on windows

```
start chrome
start python
```

