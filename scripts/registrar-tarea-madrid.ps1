$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot
$ejecutor = Join-Path $PSScriptRoot 'ejecutar-recolector-madrid.ps1'
$lanzadorOculto = Join-Path $PSScriptRoot 'ejecutar-oculto.vbs'
$nombre = 'FACyLF recolector madrid'
$usuario = "$env:USERDOMAIN\$env:USERNAME"
$accion = New-ScheduledTaskAction `
    -Execute "$env:SystemRoot\System32\wscript.exe" `
    -Argument "`"$lanzadorOculto`" `"$ejecutor`"" `
    -WorkingDirectory $raiz
$disparadores = @(
    (New-ScheduledTaskTrigger -AtLogOn -User $usuario),
    (New-ScheduledTaskTrigger -Daily -At '6:20am')
)
$disparadores[0].Delay = 'PT4M'
$ajustes = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 5) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $disparadores `
    -Settings $ajustes -Principal $principal `
    -Description 'Recolecta calendarios, jornadas, resultados y clasificaciones públicas de Madrid.' `
    -Force | Out-Null
Write-Host "Tarea '$nombre' registrada correctamente."
