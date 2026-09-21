<#
  Reinicia los recolectores programados para que adopten el codigo actual.

  Por que hace falta: el supervisor lanza `node scripts/recolector-local.mjs arrancar` y ese
  proceso se queda en memoria durante horas. Un cambio en el recolector (fases, ritmo, espera
  inteligente) NO entra en vigor hasta que el proceso se vuelve a lanzar.

  Es seguro cortar a mitad: al empezar cada ciclo el recolector devuelve a 'pendiente' cualquier
  trabajo que se quedara en 'en_curso' y la cola es reanudable. No se pierde ni se duplica nada.
  Los procesos de Chrome que queden huerfanos los cierra el propio supervisor al rearrancar.

  Uso:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\reiniciar-recolectores.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\reiniciar-recolectores.ps1 -Federacion galicia
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\reiniciar-recolectores.ps1 -Simular
#>
param(
  [string]$Federacion = '',
  [switch]$Simular,
  [int]$EsperaSeg = 4
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$raiz = Split-Path -Parent $PSScriptRoot

function Escribe($mensaje, $color = 'Gray') { Write-Host $mensaje -ForegroundColor $color }

function Es-DeEstaFederacion($lineaComando, $fed) {
  # Valencia no usa el recolector pnfg: tiene el suyo propio, porque su plataforma publica JSON en
  # vez de HTML. Se reconoce por su fichero, no por un perfil.
  if ($fed -eq 'valencia') { return ($lineaComando -like '*recolector-valencia.mjs*') }
  if ($fed -eq 'madrid') { return ($lineaComando -like '*recolector-madrid.mjs*') }
  # Cataluña tampoco: su portal de competiciones no se puede leer sin navegador, así que tiene su
  # propio descubridor y su propio capturador de datos. Sin esta rama, reiniciar Cataluña paraba la
  # tarea pero no mataba al worker (no lleva `--perfil`), y el mutex del supervisor impedía arrancar
  # uno nuevo: la federación seguía con el código viejo creyendo que se había reiniciado.
  if ($fed -eq 'cataluna') { return ($lineaComando -like '*recolector-cataluna*') }
  if ($fed -eq 'castilla-leon') {
    # Castilla y Leon es el worker sin --perfil; es el unico que no lleva perfil propio.
    return (($lineaComando -like '*recolector-local.mjs*') -and ($lineaComando -notlike '*--perfil*'))
  }
  return ($lineaComando -like "*perfiles\$fed.json*")
}

$tareas = @(Get-ScheduledTask -TaskName 'FACyLF recolector*' -ErrorAction SilentlyContinue)
if ($Federacion) {
  $objetivo = "FACyLF recolector $Federacion"
  $tareas = @($tareas | Where-Object { $_.TaskName -eq $objetivo })
  if (-not $tareas) { Escribe "No existe la tarea '$objetivo'." 'Red'; exit 1 }
}
if (-not $tareas) { Escribe 'No hay ninguna tarea de recolector registrada.' 'Red'; exit 1 }

Escribe ("Reiniciando {0} recolector(es){1}" -f $tareas.Count, $(if ($Simular) { '  [SIMULACION]' } else { '' })) 'Cyan'

foreach ($tarea in $tareas) {
  $nombre = $tarea.TaskName
  $fed = ($nombre -replace '^FACyLF recolector\s*', '').Trim()
  if (-not $fed) { $fed = 'castilla-leon' }

  # OJO: aquí NO se puede pre-filtrar por `recolector-local.mjs`, porque Valencia usa su propio
  # fichero (`recolector-valencia.mjs`). El pre-filtro sólo exige que sea una sesión de recolección
  # (`arrancar`); quién es de qué federación lo decide Es-DeEstaFederacion.
  $nodos = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*arrancar*' } |
    Where-Object { Es-DeEstaFederacion $_.CommandLine $fed })

  if ($Simular) {
    Escribe ("  {0,-24} {1} proceso(s) node a cortar" -f $fed, $nodos.Count)
    continue
  }

  # 1) parar la tarea: el supervisor deja de relanzar
  Stop-ScheduledTask -TaskName $nombre -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500

  # El lanzador de la tarea puede haber terminado dejando un supervisor separado vivo.
  # Ese proceso conserva el mutex y rechaza el nuevo supervisor. Resolverlo por ruta
  # exacta y federación, nunca por nombre de powershell ni por PID de otro informe.
  $guionSupervisor = switch ($fed) {
    'madrid' { 'ejecutar-recolector-madrid.ps1' }
    'valencia' { 'ejecutar-recolector-valencia.ps1' }
    'cataluna' { 'ejecutar-recolector-cataluna-datos.ps1' }
    default { 'ejecutar-recolector-programado.ps1' }
  }
  $rutaSupervisor = Join-Path $PSScriptRoot $guionSupervisor
  # Hay DOS raíces posibles: `wscript.exe` (el lanzador oculto asociado a la tarea) y el
  # `powershell.exe` supervisor. Matar sólo `node` permite que el supervisor viejo lo vuelva a lanzar
  # con el entorno anterior; eso ocurrió con Baleares tras un reinicio que aparentemente había salido
  # bien. Se resuelve el árbol por línea de órdenes exacta y se cierra hojas → raíz.
  $todos = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  $esSupervisorDeEsta = {
    param($p)
    if (-not $p.CommandLine -or -not $p.CommandLine.Contains($rutaSupervisor)) { return $false }
    if ($guionSupervisor -ne 'ejecutar-recolector-programado.ps1') { return $true }
    if ($fed -eq 'castilla-leon') { return $p.CommandLine -notmatch '-Federacion' }
    # Admite `-Federacion baleares`, `-Federacion "baleares"` y la forma de wscript
    # `"-Federacion" "baleares"`.
    return $p.CommandLine -match ('-Federacion"?\s+"?' + [regex]::Escape($fed) + '(?:"|\s|$)')
  }
  $raices = @($todos | Where-Object {
    ($_.Name -eq 'powershell.exe' -or $_.Name -eq 'wscript.exe') -and (& $esSupervisorDeEsta $_)
  })
  $orden = New-Object System.Collections.Generic.List[int]
  function Agrega-Descendientes([int]$padre) {
    foreach ($hijo in $todos | Where-Object ParentProcessId -eq $padre) {
      Agrega-Descendientes $hijo.ProcessId
      if (-not $orden.Contains([int]$hijo.ProcessId)) { $orden.Add([int]$hijo.ProcessId) }
    }
  }
  foreach ($r in $raices) {
    Agrega-Descendientes $r.ProcessId
    if (-not $orden.Contains([int]$r.ProcessId)) { $orden.Add([int]$r.ProcessId) }
  }
  foreach ($pidExacto in $orden) {
    Stop-Process -Id $pidExacto -Force -ErrorAction SilentlyContinue
  }

  # 2) cortar los procesos node de esta federacion
  foreach ($p in $nodos) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
  if ($nodos.Count -gt 0) { Start-Sleep -Milliseconds 600 }

  # 3) relanzar la tarea: al arrancar lee el codigo nuevo
  Start-ScheduledTask -TaskName $nombre -ErrorAction SilentlyContinue
  Escribe ("  {0,-24} cortado(s) {1} proceso(s) y relanzado" -f $fed, $nodos.Count) 'Green'
}

if ($Simular) { exit 0 }

Start-Sleep -Seconds $EsperaSeg
Escribe ''
Escribe 'Estado tras el reinicio:' 'Cyan'
Get-ScheduledTask -TaskName 'FACyLF recolector*' | Sort-Object TaskName | ForEach-Object {
  $i = $_ | Get-ScheduledTaskInfo
  [pscustomobject]@{
    Tarea   = $_.TaskName
    Estado  = $_.State
    Ultima  = $i.LastRunTime.ToString('yyyy-MM-dd HH:mm')
    Proxima = $i.NextRunTime.ToString('yyyy-MM-dd HH:mm')
  }
} | Format-Table -AutoSize

$vivos = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'recolector-(local|madrid|valencia)\.mjs.*arrancar' })
Escribe ("procesos node del recolector vivos ahora: {0}" -f $vivos.Count) 'Cyan'
Escribe ''
Escribe 'Registro de cada federacion (para ver el codigo nuevo en marcha):' 'Cyan'
Escribe "  Get-Content `"$raiz\descargas-galicia\recolector-local\worker-programado.log`" -Tail 15" 'DarkGray'
Escribe "  Get-Content `"$raiz\descargas-federacion\recolector-local\worker-programado.log`" -Tail 15   (Castilla y Leon)" 'DarkGray'
