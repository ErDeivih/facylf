$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot
$ejecutor = Join-Path $PSScriptRoot 'ejecutar-visor.ps1'
$lanzadorOculto = Join-Path $PSScriptRoot 'ejecutar-oculto.vbs'
$usuario = "$env:USERDOMAIN\$env:USERNAME"

if (-not (Test-Path -LiteralPath $ejecutor)) {
    throw "No se encuentra el ejecutor: $ejecutor"
}

$nombre = 'FACyLF visor'
$argumentos = "`"$lanzadorOculto`" `"$ejecutor`""
$accion = New-ScheduledTaskAction `
    -Execute "$env:SystemRoot\System32\wscript.exe" `
    -Argument $argumentos `
    -WorkingDirectory $raiz

# Cada 5 minutos: si el visor no esta o se ha quedado mudo, se levanta solo.
$disparadores = @(
    (New-ScheduledTaskTrigger -AtLogOn -User $usuario),
    (New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(1) `
        -RepetitionInterval (New-TimeSpan -Minutes 5) `
        -RepetitionDuration (New-TimeSpan -Days 3650))
)

$ajustes = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 2) -ExecutionTimeLimit ([TimeSpan]::Zero)

$principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $disparadores `
    -Settings $ajustes -Principal $principal `
    -Description 'Mantiene vivo el visor de workers en http://127.0.0.1:3777/ y lo reinicia si deja de responder.' `
    -Force | Out-Null

Write-Host "Tarea '$nombre' registrada correctamente." -ForegroundColor Green
Write-Host ''
Write-Host 'Estado:  Get-ScheduledTask -TaskName "FACyLF visor" | Get-ScheduledTaskInfo'
Write-Host "Latido:  $raiz\visor-watchdog.log"
Write-Host "Salida:  $raiz\visor-out.log y visor-err.log"
Write-Host 'Probar:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ejecutar-visor.ps1 -Forzar'
