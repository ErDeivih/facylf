$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Melilla: su web lleva semanas devolviendo HTTP 500 en la zona de documentos. El fallo es del
# servidor de la federacion, no una negativa, asi que merece la pena insistir mas a menudo: cada
# intento son unas pocas peticiones espaciadas a 10 s y no molesta a nadie. Si algun dia su servidor
# vuelve, lo encontrara el mismo dia en vez de esperar a la manana siguiente.
#
# Cataluna y Baleares se quedan como estan (una vez al dia): sus portales no cambian de un dia para
# otro y no tiene sentido insistir.

$raiz = Split-Path -Parent $PSScriptRoot
$ejecutor = Join-Path $PSScriptRoot 'ejecutar-sondeo-portal.ps1'
$usuario = "$env:USERDOMAIN\$env:USERNAME"

$tareas = @(
    @{ Federacion = 'melilla';  Hora = '7:05am';  CadaHoras = 4 },
    @{ Federacion = 'cataluna'; Hora = '6:45am';  CadaHoras = 0 },
    @{ Federacion = 'baleares'; Hora = '6:55am';  CadaHoras = 0 }
)

foreach ($t in $tareas) {
    $fed = $t.Federacion
    $nombre = "FACyLF catalogo $fed"
    $argumentos = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ejecutor`" -Federacion $fed"
    $accion = New-ScheduledTaskAction `
        -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
        -Argument $argumentos `
        -WorkingDirectory $raiz

    $disparadores = @()
    $disparadores += (New-ScheduledTaskTrigger -AtLogOn -User $usuario)
    $disparadores[0].Delay = 'PT7M'
    if ($t.CadaHoras -gt 0) {
        $disparadores += (New-ScheduledTaskTrigger -Once -At ([datetime]::Today.AddHours(1)) `
            -RepetitionInterval (New-TimeSpan -Hours $t.CadaHoras) `
            -RepetitionDuration (New-TimeSpan -Days 3650))
    } else {
        $disparadores += (New-ScheduledTaskTrigger -Daily -At $t.Hora)
    }

    $ajustes = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -MultipleInstances IgnoreNew -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 10) -ExecutionTimeLimit ([TimeSpan]::Zero)

    $principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited

    Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $disparadores `
        -Settings $ajustes -Principal $principal `
        -Description "Inventaria a ~10 s las paginas publicas de $fed respetando su robots.txt." `
        -Force | Out-Null

    $detalle = if ($t.CadaHoras -gt 0) { "cada $($t.CadaHoras) h" } else { "1 vez al dia a las $($t.Hora)" }
    Write-Host "Tarea '$nombre' registrada ($detalle)." -ForegroundColor Green
}

Write-Host ''
# Cataluña tiene además su propia captura de datos: el descubrimiento deja grupos con identificador y
# esta tarea los recorre para bajar calendario, clasificación y actas. El script es un supervisor que
# se queda en bucle, así que la tarea sólo tiene que arrancarlo al iniciar sesión y una vez al día
# como red de seguridad (si el supervisor muriera, la siguiente ejecución lo levanta).
$nombreDatos = 'FACyLF recolector cataluna'
$ejecutorDatos = Join-Path $PSScriptRoot 'ejecutar-recolector-cataluna-datos.ps1'
$accionDatos = New-ScheduledTaskAction `
    -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ejecutorDatos`"" `
    -WorkingDirectory $raiz
$disparadoresDatos = @(
    (New-ScheduledTaskTrigger -AtLogOn -User $usuario),
    (New-ScheduledTaskTrigger -Daily -At '8:05am')
)
$ajustesDatos = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 10) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $nombreDatos -Action $accionDatos -Trigger $disparadoresDatos `
    -Settings $ajustesDatos -Principal (New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited) `
    -Description 'Supervisor que captura calendario, clasificacion y actas de los grupos descubiertos de la FCF.' `
    -Force | Out-Null
Write-Host "Tarea '$nombreDatos' registrada (al iniciar sesión y a diario; supervisor en bucle)." -ForegroundColor Green

Write-Host ''
Get-ScheduledTask -TaskName 'FACyLF catalogo*', 'FACyLF recolector cataluna' | ForEach-Object {
    $i = $_ | Get-ScheduledTaskInfo
    "{0,-30} {1,-8} proxima={2}" -f $_.TaskName, $_.State, $i.NextRunTime.ToString('yyyy-MM-dd HH:mm')
}
