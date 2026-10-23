# Registra la tarea del SUPERVISOR UNICO de la flota (sustituye a las 19 tareas de recolector).
#
# Es la misma forma de arrancar que tenian los supervisores anteriores -- el Programador de tareas lanza un
# wscript que oculta la ventana -- pero ahora hay UNA tarea en vez de diecinueve, y el programa que se lanza
# es `scripts/supervisor-flota.mjs`, que mantiene las 19 federaciones desde un solo proceso Node.
#
# Las tareas antiguas NO se borran aqui: se desactivan en la migracion, para poder volver atras.
#
# Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/registrar-tarea-flota.ps1

$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node.exe -ErrorAction Stop).Source
$vbs = Join-Path $PSScriptRoot 'ejecutar-oculto-nodo.vbs'
$supervisor = Join-Path $PSScriptRoot 'supervisor-flota.mjs'

foreach ($ruta in @($vbs, $supervisor)) {
    if (-not (Test-Path -LiteralPath $ruta)) { throw "No se encuentra $ruta" }
}

$accion = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\wscript.exe" `
    -Argument "`"$vbs`" `"$node`" `"$supervisor`"" -WorkingDirectory $raiz

# Los mismos disparadores que tenian las tareas antiguas: al iniciar sesion (con una espera corta para que el
# equipo se asiente) y una vez al dia como red de seguridad.
$alEntrar = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$alEntrar.Delay = 'PT3M'
$cadaDia = New-ScheduledTaskTrigger -Daily -At 06:05
# Red de seguridad cada 30 min (16/10/2026): la noche del 15/10 el supervisor murio hacia las 21:09 sin dejar
# rastro y la flota estuvo parada 12 h hasta el siguiente inicio de sesion. Con MultipleInstances IgnoreNew, si
# el supervisor sigue vivo este disparador no hace nada; si murio, lo levanta en media hora como mucho.
$cadaMediaHora = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Days 3650)

$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
$ajustes.IdleSettings.StopOnIdleEnd = $false

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName 'FACyLF flota' -Action $accion -Trigger @($alEntrar, $cadaDia, $cadaMediaHora) `
    -Settings $ajustes -Principal $principal -Force `
    -Description 'Supervisor unico de la flota: mantiene las 19 federaciones desde un solo proceso Node (sustituye a las 19 tareas de recolector).' | Out-Null

'--------------------------------------------------------------'
'Tarea registrada: FACyLF flota'
'--------------------------------------------------------------'
$t = Get-ScheduledTask -TaskName 'FACyLF flota'
"Estado      : $($t.State)"
"Ejecuta     : $(($t.Actions | ForEach-Object { $_.Execute }) -join ';')"
"Argumentos  : $(($t.Actions | ForEach-Object { $_.Arguments }) -join ';')"
"Disparadores: $((($t.Triggers | ForEach-Object { $_.CimClass.CimClassName }) -join ', '))"
