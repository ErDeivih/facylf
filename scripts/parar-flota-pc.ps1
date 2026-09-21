<#
  ── PARAR TODA LA INGESTA DE ESTE PC ────────────────────────────────────────────────────────────────────

  Deja el PC sin ningún proceso de facylf: ni supervisores, ni workers, ni navegadores de recolección. La
  ingesta pasa a vivir en el servidor (`david@servidor.local:/srv/data/facylf`).

  Por qué existe: deshabilitar las tareas `FACyLF recolector *` NO basta. Esas tareas ya estaban deshabilitadas
  y aun así había 7 supervisores y sus workers en marcha, porque quien los lanza y los relanza es la tarea
  **`FACyLF flota`**, que lleva horas corriendo con el entorno del día que arrancó (su `FACYLF_EXCLUIR` viejo no
  incluye las federaciones que ya se traspasaron al servidor). Resultado medido el 21/09/2026: ocho
  federaciones se estaban recolectando a la vez en el PC y en el servidor, duplicando workers.

  Qué hace, en este orden:
    1. para las tareas programadas de facylf y las deja DESHABILITADAS (si no, un reinicio del PC vuelve a
       arrancar la ingesta);
    2. cierra los supervisores (powershell/wscript con `ejecutar-recolector-*.ps1`) y sus workers `node` con
       `arrancar`, de hoja a raíz y por línea de órdenes exacta;
    3. cierra los Chrome que usan un perfil de recolección de facylf (`--user-data-dir=…\perfil-chrome`);
    4. informa de la memoria liberada.

  Lo que NO hace nunca:
    · no borra ni toca un solo dato: las colas, el HTML archivado y los catálogos se quedan donde están;
    · no toca procesos que no sean de facylf (ni el arnés DSH: su línea de órdenes se excluye a propósito);
    · no borra los volúmenes de Docker.

  Uso:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\parar-flota-pc.ps1 -Simular
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\parar-flota-pc.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\parar-flota-pc.ps1 -IncluirPostgres
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\parar-flota-pc.ps1 -Reactivar
#>
param(
  [switch]$Simular,
  [switch]$Reactivar,
  [switch]$IncluirPostgres,
  [int]$EsperaSeg = 3
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$raiz = Split-Path -Parent $PSScriptRoot
function Escribe($mensaje, $color = 'Gray') { Write-Host $mensaje -ForegroundColor $color }

# ── Reversión: volver a dejar las tareas como estaban ────────────────────────────────────────────────────
if ($Reactivar) {
  $tareas = @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -like 'FACyLF*' })
  Escribe ("Reactivando {0} tarea(s) de facylf…" -f $tareas.Count) 'Cyan'
  if (-not $Simular) {
    foreach ($t in $tareas) {
      $nombreTarea = $t.TaskName
      try { Enable-ScheduledTask -TaskName $nombreTarea -ErrorAction Stop | Out-Null; Escribe "  $nombreTarea activada" 'Green' }
      catch { Escribe "  $nombreTarea NO se pudo activar: $($_.Exception.Message)" 'Red' }
    }
  }
  exit 0
}

function MemoriaLibreGB {
  $os = Get-CimInstance Win32_OperatingSystem
  return [math]::Round($os.FreePhysicalMemory / 1MB, 2)
}

function ProcesosDeFacylf {
  <#
    Devuelve los procesos de facylf a cortar, con su tipo. Se decide por LÍNEA DE ÓRDENES exacta:
      · workers y supervisores de node que cuelgan de la carpeta `scripts` del proyecto;
      · los powershell/wscript que ejecutan un `ejecutar-*.ps1` del proyecto;
      · los Chrome con perfil de recolección.
    El arnés DSH y cualquier cosa fuera de facylf quedan fuera por construcción: hay que nombrar la ruta del
    proyecto para entrar en la lista.
  #>
  $todos = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
  $lista = New-Object System.Collections.Generic.List[object]

  $rutaScripts = (Join-Path $raiz 'scripts')
  foreach ($p in $todos) {
    if (-not $p.CommandLine) { continue }
    if ($p.ProcessId -eq $PID) { continue }
    # Nunca tocar el arnés: si su línea de órdenes lo menciona, se salta.
    if ($p.CommandLine -match 'deepseek-harness|dsh\b') { continue }

    $esDeFacylf = $false
    $tipo = ''
    if ($p.Name -eq 'node.exe') {
      if ($p.CommandLine -like "*$rutaScripts*" -and $p.CommandLine -match 'supervisor-flota\.mjs|visor-workers\.mjs|recolector-[a-z-]*\.mjs|importar-masivo\.mjs|monitor-flota\.mjs') {
        $esDeFacylf = $true
        $tipo = if ($p.CommandLine -match 'supervisor-flota') { 'supervisor' }
                elseif ($p.CommandLine -match 'visor-workers') { 'visor' }
                elseif ($p.CommandLine -match 'importar-masivo|monitor-flota') { 'importador/monitor' }
                else { 'worker' }
      }
    } elseif ($p.Name -eq 'powershell.exe' -or $p.Name -eq 'wscript.exe' -or $p.Name -eq 'pwsh.exe') {
      if ($p.CommandLine -like "*$rutaScripts*" -and $p.CommandLine -match 'ejecutar-(recolector|flota|visor|importador)|registrar-tarea|limpiar-chrome') {
        $esDeFacylf = $true
        $tipo = 'lanzador'
      }
    } elseif ($p.Name -eq 'chrome.exe') {
      if ($p.CommandLine -match 'user-data-dir=.*descargas-[a-z-]+\\recolector-local\\perfil-chrome') {
        $esDeFacylf = $true
        $tipo = 'chrome'
      }
    }

    if ($esDeFacylf) {
      $lista.Add([pscustomobject]@{
        PID    = [int]$p.ProcessId
        Padres = [int]$p.ParentProcessId
        Tipo   = $tipo
        MB     = [math]::Round($p.WorkingSetSize / 1MB, 0)
        Nombre = $p.Name
      })
    }
  }

  # De hoja a raíz: primero los hijos, para que ningún padre relance lo que se acaba de cerrar.
  $todosPorId = @{}
  foreach ($x in $lista) { $todosPorId[$x.PID] = $x }
  $orden = New-Object System.Collections.Generic.List[object]
  $visitados = New-Object System.Collections.Generic.HashSet[int]
  function Agrega($nodo) {
    if ($visitados.Contains($nodo.PID)) { return }
    $visitados.Add($nodo.PID) | Out-Null
    foreach ($hijo in $lista) { if ($hijo.Padres -eq $nodo.PID) { Agrega $hijo } }
    $orden.Add($nodo)
  }
  foreach ($n in $lista) { Agrega $n }
  return $orden
}

# ── 0. Foto inicial ──────────────────────────────────────────────────────────────────────────────────────
$memoriaAntes = MemoriaLibreGB
Escribe ''
Escribe '════════ PARAR LA INGESTA DE ESTE PC ════════' 'Cyan'
Escribe ("memoria libre antes: {0} GB" -f $memoriaAntes) 'DarkGray'
if ($Simular) { Escribe 'MODO SIMULACIÓN: no se para ni se cierra nada.' 'Yellow' }

$procesos = @(ProcesosDeFacylf)
Escribe ''
Escribe ("procesos de facylf vivos: {0}" -f $procesos.Count) 'Cyan'
$porTipo = $procesos | Group-Object Tipo | Sort-Object Name
foreach ($g in $porTipo) {
  Escribe ("  {0,-16} {1,3}  ({2} MB)" -f $g.Name, $g.Count, (($g.Group | Measure-Object -Property MB -Sum).Sum)) 'Gray'
}

$tareasFacylf = @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -like 'FACyLF*' })
Escribe ''
Escribe ("tareas programadas de facylf: {0}" -f $tareasFacylf.Count) 'Cyan'
foreach ($t in $tareasFacylf) { Escribe ("  {0,-38} {1}" -f $t.TaskName, $t.State) 'Gray' }

if ($Simular) {
  Escribe ''
  Escribe 'Nada que hacer: era una simulación.' 'Yellow'
  exit 0
}

# ── 1. Tareas: parar y deshabilitar ──────────────────────────────────────────────────────────────────────
Escribe ''
Escribe '1) parando y deshabilitando las tareas de facylf' 'Cyan'
foreach ($t in $tareasFacylf) {
  $nombreTarea = $t.TaskName
  try { Stop-ScheduledTask -TaskName $nombreTarea -ErrorAction SilentlyContinue } catch { }
  try {
    Disable-ScheduledTask -TaskName $nombreTarea -ErrorAction SilentlyContinue | Out-Null
    Escribe ("  {0,-38} parada y deshabilitada" -f $nombreTarea) 'Green'
  } catch {
    Escribe ("  {0,-38} no se pudo deshabilitar: {1}" -f $nombreTarea, $_.Exception.Message) 'Red'
  }
}
Start-Sleep -Milliseconds 800

# ── 2 y 3. Procesos ──────────────────────────────────────────────────────────────────────────────────────
Escribe ''
Escribe '2) cerrando supervisores, workers y navegadores' 'Cyan'
$cerrados = 0
foreach ($p in $procesos) {
  $vivo = Get-Process -Id $p.PID -ErrorAction SilentlyContinue
  if (-not $vivo) { continue }
  try {
    Stop-Process -Id $p.PID -Force -ErrorAction Stop
    $cerrados += 1
    Escribe ("  {0,-16} pid {1,7}  {2}" -f $p.Tipo, $p.PID, $p.Nombre) 'Gray'
  } catch {
    Escribe ("  {0,-16} pid {1,7}  no se pudo cerrar: {2}" -f $p.Tipo, $p.PID, $_.Exception.Message) 'Red'
  }
  Start-Sleep -Milliseconds 60
}
Start-Sleep -Seconds $EsperaSeg

# ── 4. Contenedor de PostgreSQL del PC (opcional) ────────────────────────────────────────────────────────
if ($IncluirPostgres) {
  Escribe ''
  Escribe '3) parando el PostgreSQL del PC (el volumen NO se borra)' 'Cyan'
  $salida = & docker stop -t 30 facylf-postgres 2>&1
  Escribe ("  {0}" -f ($salida -join ' ')) 'Gray'
}

# ── 5. Comprobación: no debe quedar nada ─────────────────────────────────────────────────────────────────
Escribe ''
Escribe '4) comprobación' 'Cyan'
Start-Sleep -Seconds 2
$restan = @(ProcesosDeFacylf)
$memoriaDespues = MemoriaLibreGB
if ($restan.Count -eq 0) {
  Escribe '  ningún proceso de facylf vivo' 'Green'
} else {
  Escribe ("  QUEDAN {0} proceso(s) de facylf:" -f $restan.Count) 'Yellow'
  foreach ($p in $restan) { Escribe ("    {0,-16} pid {1,7}  {2} MB" -f $p.Tipo, $p.PID, $p.MB) 'Yellow' }
}
$tareasVivas = @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -like 'FACyLF*' -and $_.State -ne 'Disabled' })
if ($tareasVivas.Count -eq 0) { Escribe '  ninguna tarea de facylf activa' 'Green' }
else { foreach ($t in $tareasVivas) { Escribe ("  tarea aún activa: {0} ({1})" -f $t.TaskName, $t.State) 'Yellow' } }

Escribe ''
Escribe ("procesos cerrados: {0}" -f $cerrados) 'Cyan'
Escribe ("memoria libre: {0} GB → {1} GB  (+{2} GB)" -f $memoriaAntes, $memoriaDespues, [math]::Round($memoriaDespues - $memoriaAntes, 2)) 'Cyan'
Escribe ''
Escribe 'La ingesta vive ahora en el servidor. Para volver a arrancarla aquí:' 'DarkGray'
Escribe '  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\parar-flota-pc.ps1 -Reactivar' 'DarkGray'
Escribe '  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\registrar-tarea-flota.ps1' 'DarkGray'
