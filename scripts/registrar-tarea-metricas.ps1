<#
  Registra la tarea que refresca `metricas-facylf.json` para el panel de proyectos.

  ── ESTO TOCA LOS AJUSTES DEL PC (nivel 3) ─────────────────────────────────────────────────────────
  No se ejecuta solo: David tiene que lanzarlo expresamente. Este fichero existe para que, cuando lo
  decida, sea una orden y no una receta oral. Mientras no se ejecute, el fichero de métricas se
  actualiza lanzando `node scripts\metricas-facylf.mjs` a mano.

  Detalles:
   · una vez por minuto, con una ventana de 5 min de peticiones (el script tarda ~3 s);
   · instancia única (`IgnoreNew`): si una vuelta se solapa, la siguiente espera; no se acumulan;
   · ventana oculta, como el resto de tareas del proyecto (`ejecutar-oculto-nodo.vbs`);
   · si falla una fuente, el script NO reescribe el JSON: se conserva la última medición con su fecha.

  Uso:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\registrar-tarea-metricas.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\registrar-tarea-metricas.ps1 -Quitar
#>
param([switch]$Quitar)

$ErrorActionPreference = 'Stop'
$nombre = 'FACyLF metricas panel'

if ($Quitar) {
    Unregister-ScheduledTask -TaskName $nombre -Confirm:$false -ErrorAction SilentlyContinue
    "Tarea eliminada: $nombre"
    return
}

$raiz = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node.exe -ErrorAction Stop).Source
$vbs = Join-Path $PSScriptRoot 'ejecutar-oculto-nodo.vbs'
$script = Join-Path $PSScriptRoot 'metricas-facylf.mjs'

foreach ($ruta in @($vbs, $script)) {
    if (-not (Test-Path -LiteralPath $ruta)) { throw "No se encuentra $ruta" }
}

$accion = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\wscript.exe" `
    -Argument "`"$vbs`" `"$node`" `"$script`"" -WorkingDirectory $raiz

# Cada minuto desde ahora. `RepetitionDuration` larga: la tarea no caduca.
$cadaMinuto = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)

$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew -StartWhenAvailable
$ajustes.IdleSettings.StopOnIdleEnd = $false

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger @($cadaMinuto) `
    -Settings $ajustes -Principal $principal -Force `
    -Description 'Refresca metricas-facylf.json para el panel de proyectos (solo lectura; ~3 s por vuelta).' | Out-Null

'--------------------------------------------------------------'
"Tarea registrada: $nombre"
'--------------------------------------------------------------'
$t = Get-ScheduledTask -TaskName $nombre
"Estado      : $($t.State)"
"Ejecuta     : $(($t.Actions | ForEach-Object { $_.Execute }) -join ';')"
"Argumentos  : $(($t.Actions | ForEach-Object { $_.Arguments }) -join ';')"
"Disparadores: $((($t.Triggers | ForEach-Object { $_.CimClass.CimClassName }) -join ', '))"
