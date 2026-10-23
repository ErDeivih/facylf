# ── LIMPIEZA DE LOS PERFILES TEMPORALES DE CHROME ───────────────────────────────────────────────────────
#
# El 05/10/2026 se encontraron **3.929 carpetas `scoped_dir*` ocupando 101 GB** en `%TEMP%` del PC, con C: al
# 99 % (3,8 GB libres). Consecuencia medida: **las cuatro federaciones se quedaron sin recolectar** —de ~2.300
# peticiones por hora a 155— y la respuesta media de Castilla y León pasó de 1,1 s a 39,6 s. Nadie relacionaba
# el espacio con la recolección, porque Chrome no dice «no tengo disco»: dice que no arranca, o tarda.
#
# De dónde salen: Selenium crea una carpeta temporal por sesión de navegador y **sólo la borra si el navegador
# se cierra en limpio**. Cuando un worker se mata —por un corte de tiempo, por un reciclado, o porque alguien
# reinicia la flota— la carpeta se queda. Al cabo de unas semanas son miles.
#
# Qué hace esto: borra las `scoped_dir*` de `%TEMP%` que ya no pueden ser de ninguna sesión viva. Se dejan las
# recientes a propósito (`-HorasMinimas`, 2 por defecto): borrar la carpeta de un Chrome que está trabajando
# ahora mismo rompería esa sesión, y eso sería peor que el problema.
#
# ── CÓMO ENGANCHARLO ─────────────────────────────────────────────────────────────────────────────────────
#
# Con `-SiHaceFalta` no hace nada mientras C: tenga aire, así que se puede llamar en cada arranque de la flota
# sin coste. Lo más simple es una tarea programada cada 6 horas (ver el final del fichero).
#
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\limpiar-temporales-chrome.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\limpiar-temporales-chrome.ps1 -SiHaceFalta -GBLibresMinimos 20
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\limpiar-temporales-chrome.ps1 -QueSeVe

param(
  [int]$HorasMinimas = 2,
  [int]$GBLibresMinimos = 0,
  [switch]$SiHaceFalta,
  [switch]$QueSeVe
)

$ErrorActionPreference = 'Continue'
$temp = $env:TEMP
$unidad = (Get-Item $temp).PSDrive.Name
$disco = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${unidad}:'"
$libreGb = [math]::Round($disco.FreeSpace / 1GB, 1)

Write-Host "perfiles temporales de Chrome en $temp"
Write-Host "  unidad ${unidad}: · libre $libreGb GB"

if ($SiHaceFalta -and $libreGb -ge $GBLibresMinimos) {
  Write-Host "  hay $libreGb GB libres (mínimo $GBLibresMinimos): no se toca nada."
  exit 0
}

$corte = (Get-Date).AddHours(-$HorasMinimas)
$candidatas = @(Get-ChildItem -LiteralPath $temp -Force -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like 'scoped_dir*' -and $_.LastWriteTime -lt $corte })

if ($candidatas.Count -eq 0) { Write-Host "  no hay ninguna con más de $HorasMinimas h: nada que hacer."; exit 0 }

$total = 0
foreach ($d in $candidatas) {
  $total += (Get-ChildItem -LiteralPath $d.FullName -Recurse -File -Force -ErrorAction SilentlyContinue |
    Measure-Object -Property Length -Sum).Sum
}
Write-Host ("  {0} carpetas con más de {1} h · {2} GB" -f $candidatas.Count, $HorasMinimas, [math]::Round($total / 1GB, 1))

if ($QueSeVe) { Write-Host "  (modo mirar: no se borra nada)"; exit 0 }

$borradas = 0
$enUso = 0
foreach ($d in $candidatas) {
  try { Remove-Item -LiteralPath $d.FullName -Recurse -Force -ErrorAction Stop; $borradas++ }
  catch { $enUso++ }
}
$disco2 = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${unidad}:'"
Write-Host ("  borradas {0} · en uso {1} · ${unidad}: libre {2} GB → {3} GB" -f `
    $borradas, $enUso, $libreGb, [math]::Round($disco2.FreeSpace / 1GB, 1))

# Y un aviso si vuelve a estar apretado: es la señal de que la fuga sigue.
if ([math]::Round($disco2.FreeSpace / 1GB, 1) -lt 15) {
  Write-Host "  ⚠ la unidad sigue por debajo de 15 GB libres: mirar qué más está creciendo." -ForegroundColor Yellow
}

# ── PARA DEJARLO AUTOMÁTICO (una vez, en PowerShell como administrador) ─────────────────────────────────
#
#   $accion  = New-ScheduledTaskAction -Execute 'powershell.exe' `
#     -Argument '-NoProfile -ExecutionPolicy Bypass -File F:\EspacioCodigo\facylf\scripts\limpiar-temporales-chrome.ps1 -HorasMinimas 2'
#   $cuando  = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(10) `
#     -RepetitionInterval (New-TimeSpan -Hours 6)
#   Register-ScheduledTask -TaskName 'FACyLF limpiar temporales de Chrome' -Action $accion -Trigger $cuando `
#     -Description 'Borra los perfiles temporales de Chrome que Selenium deja en %TEMP% (101 GB el 05/10/2026).'
