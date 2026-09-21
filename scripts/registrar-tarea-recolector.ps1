$ErrorActionPreference = 'Stop'

# Registra el supervisor local del recolector en el Programador de tareas.
# Se ejecuta en la sesión interactiva porque Selenium utiliza Chrome.
$raiz = Split-Path -Parent $PSScriptRoot
$supervisor = Join-Path $PSScriptRoot 'ejecutar-recolector-programado.ps1'
$nombre = 'FACyLF recolector'
$usuario = "$env:USERDOMAIN\$env:USERNAME"

if (-not (Test-Path -LiteralPath $supervisor)) {
    throw "No se encuentra el supervisor: $supervisor"
}

$argumentos = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$supervisor`""
$accion = New-ScheduledTaskAction `
    -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -Argument $argumentos `
    -WorkingDirectory $raiz

# Al iniciar sesión comienza el trabajo. El disparador diario sirve de red de
# seguridad si el proceso se cerró durante el día o el equipo estaba apagado.
$disparadores = @(
    (New-ScheduledTaskTrigger -AtLogOn -User $usuario),
    (New-ScheduledTaskTrigger -Daily -At 6:05am)
)
$disparadores[0].Delay = 'PT2M'

$ajustes = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 5) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

$principal = New-ScheduledTaskPrincipal `
    -UserId $usuario `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $nombre `
    -Action $accion `
    -Trigger $disparadores `
    -Settings $ajustes `
    -Principal $principal `
    -Description 'Reanuda la ingesta local de FACyLF al iniciar sesión y conserva la cola SQLite.' `
    -Force | Out-Null

Write-Host "Tarea '$nombre' registrada correctamente." -ForegroundColor Green
Write-Host 'No se ha iniciado otra copia ahora: el worker actual continúa trabajando.'
Write-Host "Estado:  Get-ScheduledTask -TaskName '$nombre' | Get-ScheduledTaskInfo"
Write-Host "Registro: Get-Content '$raiz\descargas-federacion\recolector-local\worker-programado.log' -Tail 50 -Wait"
