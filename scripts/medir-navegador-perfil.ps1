# Cuánta memoria ocupan los Chrome de UN perfil concreto, en MB, con un solo número por la salida.
#
# Es la medición que decide el reciclado por CONSUMO: un recolector sólo puede devolver al reciclarlo el
# navegador que él abrió, así que se mide el suyo y no la máquina. En su propio `.ps1` y llamada con `-File`
# porque una medición embebida en un `-Command` se rompe al pasarla y falla en silencio devolviendo vacío.
#
# Uso: powershell -NoProfile -File scripts/medir-navegador-perfil.ps1 <ruta-del-perfil>

param([Parameter(Mandatory = $true)][string]$Perfil)

$suma = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Perfil) } |
  ForEach-Object { (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).WorkingSet64 } |
  Measure-Object -Sum

if ($null -eq $suma.Sum -or $suma.Sum -eq 0) { Write-Output '0' }
else { Write-Output ([math]::Round($suma.Sum / 1MB)) }
