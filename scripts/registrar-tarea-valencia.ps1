$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot
$ejecutor = Join-Path $PSScriptRoot 'ejecutar-recolector-valencia.ps1'
$lanzadorOculto = Join-Path $PSScriptRoot 'ejecutar-oculto.vbs'
$usuario = "$env:USERDOMAIN\$env:USERNAME"

if (-not (Test-Path -LiteralPath $ejecutor)) {
    throw "No se encuentra el ejecutor: $ejecutor"
}

$nombre = 'FACyLF recolector valencia'
$argumentos = "`"$lanzadorOculto`" `"$ejecutor`""
$accion = New-ScheduledTaskAction `
    -Execute "$env:SystemRoot\System32\wscript.exe" `
    -Argument $argumentos `
    -WorkingDirectory $raiz

$disparadores = @(
    (New-ScheduledTaskTrigger -AtLogOn -User $usuario),
    (New-ScheduledTaskTrigger -Daily -At '6:15am')
)
$disparadores[0].Delay = 'PT9M'

$ajustes = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 5) -ExecutionTimeLimit ([TimeSpan]::Zero)

$principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $disparadores `
    -Settings $ajustes -Principal $principal `
    -Description 'Ingesta completa de la Comunidad Valenciana por la API JSON de iSquad, con ritmo respetuoso y sin navegador.' `
    -Force | Out-Null

Write-Host "Tarea '$nombre' registrada correctamente." -ForegroundColor Green
Write-Host ''
Write-Host 'Antes de arrancarla hay que armar la cola desde el catalogo (una sola vez):'
Write-Host '  node scripts\recolector-valencia.mjs preparar'
Write-Host ''
Write-Host 'Estado:   Get-ScheduledTask -TaskName "FACyLF recolector valencia" | Get-ScheduledTaskInfo'
Write-Host "Registro: $raiz\descargas-valencia\recolector-local\worker-programado.log"
