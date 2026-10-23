<#
  Sondeo puntual de las fuentes multideporte (baloncesto, voleibol, tenis, futbol aficionado).
  Una pagina publica por fuente, respetando robots.txt y 10-15 s entre peticiones: unas 25 peticiones
  en total, 5 minutos. Resultado en descargas-sondeo-multideporte\<fecha>\resumen.md

  Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ejecutar-sondeo-multideporte.ps1
#>
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz
node scripts\multideporte\sondeo-multideporte.mjs @args
