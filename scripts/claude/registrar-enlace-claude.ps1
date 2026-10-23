<#
  Registra la tarea "FACyLF enlace Claude": cada 10 minutos deja en estado\claude\ una foto del PC y del
  servidor y ejecuta las consultas de solo lectura que Claude deje en estado\claude\peticiones\.
  Ventana oculta (mismo lanzador que la flota). No cambia el ritmo ni las plazas de nadie.

  Uso (una vez):  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\registrar-enlace-claude.ps1
  Quitarla:       Unregister-ScheduledTask -TaskName 'FACyLF enlace Claude' -Confirm:$false
#>
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$node = (Get-Command node.exe -ErrorAction Stop).Source
$vbs = Join-Path $raiz 'scripts\ejecutar-oculto-nodo.vbs'
$enlace = Join-Path $PSScriptRoot 'enlace-claude.mjs'
foreach ($ruta in @($vbs, $enlace)) { if (-not (Test-Path -LiteralPath $ruta)) { throw "No se encuentra $ruta" } }

$accion = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\wscript.exe" `
    -Argument "`"$vbs`" `"$node`" `"$enlace`"" -WorkingDirectory $raiz
$disparador = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 10)
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'FACyLF enlace Claude' -Action $accion -Trigger $disparador `
    -Settings $ajustes -Principal $principal -Force `
    -Description 'Cada 10 min: foto del PC y del servidor en estado\claude\ y consultas de solo lectura de Claude.' | Out-Null

Write-Host 'Tarea registrada: FACyLF enlace Claude (cada 10 min). Primera pasada ahora mismo...'
& $node $enlace
Write-Host "Hecho. Mira estado\claude\pc.txt y estado\claude\servidor.txt"
