# Wyświetla komunikat na ekranie
Write-Host "test.ps1 dziala, nacisnij dowolny klawisz..."

# Oczekuje na naciśnięcie dowolnego klawisza
$null = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
