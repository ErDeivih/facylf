<#
  Registra la tarea "FACyLF multideporte": al iniciar sesion (y cada dia a las 06:10 como red de seguridad)
  lanza el supervisor de los recolectores multideporte (balonmano y voleibol de iSquad, ligas ServerSports).
  Peticiones HTTP a 5-8 s, sin navegador. Ventana oculta. Arranca ya mismo.

  Uso:     powershell -NoProfile -ExecutionPolicy Bypass -File scripts\multideporte\registrar-tarea-multideporte.ps1
  Parar:   Stop-ScheduledTask -TaskName 'FACyLF multideporte'
  Quitar:  Unregister-ScheduledTask -TaskName 'FACyLF multideporte' -Confirm:$false
#>
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$node = (Get-Command node.exe -ErrorAction Stop).Source
$vbs = Join-Path $raiz 'scripts\ejecutar-oculto-nodo.vbs'
$supervisor = Join-Path $PSScriptRoot 'supervisor-multideporte.mjs'
$accion = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\wscript.exe" -Argument "`"$vbs`" `"$node`" `"$supervisor`"" -WorkingDirectory $raiz
$alEntrar = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$alEntrar.Delay = 'PT4M'
$cadaDia = New-ScheduledTaskTrigger -Daily -At 06:10
# Red de seguridad cada 30 min (16/10/2026): la noche del 15/10 el supervisor murio hacia las 21:09 sin dejar
# rastro y la flota estuvo parada 12 h hasta el siguiente inicio de sesion. Con MultipleInstances IgnoreNew, si
# el supervisor sigue vivo este disparador no hace nada; si murio, lo levanta en media hora como mucho.
$cadaMediaHora = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Days 3650)
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'FACyLF multideporte' -Action $accion -Trigger @($alEntrar, $cadaDia, $cadaMediaHora) -Settings $ajustes -Principal $principal -Force `
  -Description 'Recolectores multideporte (iSquad balonmano y voleibol, ServerSports) a ritmo respetuoso.' | Out-Null
Start-ScheduledTask -TaskName 'FACyLF multideporte'
Write-Host 'Tarea FACyLF multideporte registrada y en marcha. Registros en descargas-multideporte\<adaptador>\registro.log'
