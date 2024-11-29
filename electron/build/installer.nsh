!macro customInstall
  ; Kopiowanie pliku test.bat do katalogu pluginów
  File /oname=$PLUGINSDIR\test.bat "${BUILD_RESOURCES_DIR}\test.bat"

  ; Uruchamianie pliku test.bat
  ExecWait '"$PLUGINSDIR\test.bat"'

  ; Kopiowanie pliku test.ps1 do katalogu pluginów
  File /oname=$PLUGINSDIR\test.ps1 "${BUILD_RESOURCES_DIR}\test.ps1"

  ; I jego uruchomienie
  ExecWait '"powershell.exe" -ExecutionPolicy Bypass -File "$PLUGINSDIR\test.ps1"'

  ; Kopiowanie pliku test.sh do katalogu pluginów
  File /oname=$PLUGINSDIR\test.sh "${BUILD_RESOURCES_DIR}\test.sh"

  ; Uruchamianie Git Bash z plikiem test.sh
  ExecWait '"C:\Program Files\Git\bin\bash.exe" "$PLUGINSDIR/test.sh"'

!macroend
