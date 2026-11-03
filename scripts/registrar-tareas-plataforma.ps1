param([switch]$Quitar)

$ErrorActionPreference = 'Stop'

# Registra en el Programador de tareas de Windows las tareas de mantenimiento de la plataforma (21/10/2026).
# Todas usan node a través de ejecutar-oculto-nodo.vbs (sin ventana) y el .env de la raíz del repositorio.
#
#   FACyLF proyector          cada 15 min   proyectar-lectura.mjs --limite 200 --sin-globales
#   FACyLF vigilancia         cada 15 min   vigilancia-plataforma.mjs
#   FACyLF parte diario       8:05          vigilancia-plataforma.mjs --resumen
#   FACyLF copia              3:31          copia-seguridad.mjs
#   FACyLF restauración       día 2, 5:31   copia-seguridad.mjs --restauracion-prueba
#   FACyLF mantenimiento      4:31          mantenimiento-bd.mjs --noche
#   FACyLF mantenimiento sem  domingo 5:01  mantenimiento-bd.mjs --semana
#
# Uso (PowerShell normal, desde la raíz del repo):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\registrar-tareas-plataforma.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\registrar-tareas-plataforma.ps1 -Quitar
# Rehacerlo es seguro: cada tarea se sustituye. -Quitar las borra todas (no toca las del recolector).


$raiz = Split-Path -Parent $PSScriptRoot
$vbs = Join-Path $PSScriptRoot 'ejecutar-oculto-nodo.vbs'
$node = (Get-Command node -ErrorAction Stop).Source
$usuario = "$env:USERDOMAIN\$env:USERNAME"

$tareas = @(
  @{ Nombre = 'FACyLF proyector';         Script = 'proyectar-lectura.mjs';      Args = '--limite 200 --pausa-ms 100 --sin-globales'; Cada = 15 },
  @{ Nombre = 'FACyLF vigilancia';        Script = 'vigilancia-plataforma.mjs';  Args = '';                    Cada = 15 },
  @{ Nombre = 'FACyLF parte diario';      Script = 'vigilancia-plataforma.mjs';  Args = '--resumen';           Hora = '8:05am' },
  @{ Nombre = 'FACyLF copia';             Script = 'copia-seguridad.mjs';        Args = '';                    Hora = '3:31am' },
  @{ Nombre = 'FACyLF restauracion';      Script = 'copia-seguridad.mjs';        Args = '--restauracion-prueba'; DiaMes = 2; Hora = '5:31am' },
  @{ Nombre = 'FACyLF mantenimiento';     Script = 'mantenimiento-bd.mjs';       Args = '--noche';             Hora = '4:31am' },
  @{ Nombre = 'FACyLF mantenimiento sem'; Script = 'mantenimiento-bd.mjs';       Args = '--semana';            Domingo = $true; Hora = '5:01am' },
  @{ Nombre = 'FACyLF avisos';            Script = 'notificaciones.mjs';         Args = '';                    Cada = 15 },
  @{ Nombre = 'FACyLF ojeo';              Script = 'proyectar-lectura.mjs';      Args = '--puntua-ojeo';       Cada = 60 },
  @{ Nombre = 'FACyLF avisos resumen';    Script = 'notificaciones.mjs';         Args = '--resumen';           Cada = 60 }
)

foreach ($t in $tareas) {
  if (Get-ScheduledTask -TaskName $t.Nombre -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $t.Nombre -Confirm:$false
  }
}
if ($Quitar) { Write-Host 'Tareas de la plataforma quitadas.'; exit 0 }

foreach ($t in $tareas) {
  $script = Join-Path $PSScriptRoot $t.Script
  if (-not (Test-Path -LiteralPath $script)) { throw "No se encuentra $script" }
  $argumentos = "`"$vbs`" `"$node`" `"$script`" $($t.Args)".Trim()
  $accion = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\wscript.exe" -Argument $argumentos -WorkingDirectory $raiz

  if ($t.Cada) {
    $disparador = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(2) `
      -RepetitionInterval (New-TimeSpan -Minutes $t.Cada) -RepetitionDuration (New-TimeSpan -Days 3650)
  } elseif ($t.Domingo) {
    $disparador = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At $t.Hora
  } elseif ($t.DiaMes) {
    # El Programador no tiene «mensual» en New-ScheduledTaskTrigger: diario y el script sale si no es el día.
    $disparador = New-ScheduledTaskTrigger -Daily -At $t.Hora
    $argumentos = "$argumentos --solo-dia $($t.DiaMes)"
    $accion = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\wscript.exe" -Argument $argumentos -WorkingDirectory $raiz
  } else {
    $disparador = New-ScheduledTaskTrigger -Daily -At $t.Hora
  }

  $ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 6)
  $principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $t.Nombre -Action $accion -Trigger $disparador -Settings $ajustes -Principal $principal | Out-Null
  Write-Host ("  OK {0,-26} {1} {2}" -f $t.Nombre, $t.Script, $t.Args)
}
Write-Host ''
Write-Host 'Listo. Comprueba con: Get-ScheduledTask -TaskName "FACyLF*" | Select TaskName, State'
