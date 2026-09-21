# Limpia los Chrome HUÉRFANOS de los recolectores: los que ya no tienen ningún `node` vivo por encima.
#
# Por qué con la cadena de padres y no con el padre directo: el padre de un Chrome de Selenium es
# `chromedriver`, no `node`. Mirar sólo el padre directo marcaría como huérfano el navegador de un worker que
# está trabajando ahora mismo, y matarlo le inyectaría errores (`invalid session id`). Así que se sube la
# cadena entera: si por arriba hay un `node.exe` vivo, ese Chrome se respeta.
#
# Y sólo se toca lo que es de los recolectores: `--user-data-dir` apuntando a `<federación>/recolector-local/
# perfil-chrome`. Ningún Chrome del usuario entra aquí.
#
# Uso: pwsh -File scripts/limpiar-chrome-huerfano.ps1 [-Simular] [-Listar]
#
# `-Listar` dice QUÉ mataría (un proceso por línea, con su perfil) y no mata nada: es lo que usa la prueba
# `_prueba-limpieza-respeta-vivos.ps1` para comprobar que un worker con el navegador abierto no entra en la lista.

param([switch]$Simular, [switch]$Listar)

# ── OJO CON LAS CLAVES DE ESTE DICCIONARIO ───────────────────────────────────────────────────────────────────
#
# Se indexa por el identificador de proceso CONVERTIDO A TEXTO, y se consulta igual. No es capricho: `ProcessId`
# de WMI es un entero sin signo de 32 bits y el diccionario estaba indexado por enteros con signo, así que
# `$procesos[$p.ProcessId]` NO encontraba nada (dos tipos distintos no son la misma clave en un diccionario de
# .NET). El resultado era que `TieneNodeVivoPorEncima` contestaba siempre que no y esta herramienta daba por
# huérfano TODO lo que veía: medido el 19/09/2026, 72 de 72 procesos con un `node` vivo por encima, y la tarea
# programada que la llama cada cinco minutos matando los navegadores de los recolectores que estaban trabajando
# (~7 GB por pasada y `invalid session id` en las colas). Con texto, no hay dos tipos que puedan discrepar.
$procesos = @{}
foreach ($p in Get-CimInstance Win32_Process) { $procesos[[string][int]$p.ProcessId] = $p }

# OJO también con el nombre del parámetro: `$pid` es una variable AUTOMÁTICA de PowerShell y es de sólo lectura.
# Llamarlo así hacía que la asignación fallara en silencio y el recorrido de la cadena de padres midiera otra
# cosa, así que el recuento de huérfanos no valía. Se llama `$desde`.
function TieneNodeVivoPorEncima($desde) {
  $actual = [string][int]$desde
  for ($i = 0; $i -lt 8; $i++) {
    $proc = $procesos[$actual]
    if (-not $proc) { return $false }
    $padre = [int]$proc.ParentProcessId
    if ($padre -le 0) { return $false }
    $padreProc = $procesos[[string]$padre]
    if (-not $padreProc) { return $false }
    if ($padreProc.Name -eq 'node.exe') { return $true }
    $actual = [string]$padre
  }
  return $false
}

$candidatos = foreach ($p in $procesos.Values) {
  if ($p.Name -ne 'chrome.exe' -and $p.Name -ne 'chromedriver.exe') { continue }
  if ($p.CommandLine -notmatch 'perfil-chrome') { continue }
  # CANDADO: sólo un navegador que pertenezca a una cola de recolección de ESTE proyecto, y nunca nada que
  # mencione otra herramienta. No es precaución teórica: en esta máquina trabaja también el arnés del agente
  # (DeepSeek Harness), y cerrarle un proceso al usuario le corta su sesión de trabajo. Con esto, lo peor que
  # puede pasar es que no se limpie algo, que es el fallo seguro.
  if ($p.CommandLine -notmatch 'EspacioCodigo\\facylf\\descargas-') { continue }
  if ($p.CommandLine -match 'deepseek-harness|\.cache\\codex-runtimes|deepseek|codex') { continue }
  if (TieneNodeVivoPorEncima $p.ProcessId) { continue }
  $p
}

if (-not $candidatos) { Write-Output 'no hay Chrome huérfano de recolector: nada que limpiar'; exit 0 }

if ($Listar) {
  Write-Output "candidatos a limpiar: $($candidatos.Count)"
  foreach ($c in $candidatos) {
    $perfil = if ($c.CommandLine -match 'user-data-dir=([^"\s]+)') { $matches[1] } else { '?' }
    Write-Output "  $($c.Name)#$($c.ProcessId) $perfil"
  }
  Write-Output '(lista: no se mata nada)'
  exit 0
}

$ram = 0
foreach ($c in $candidatos) {
  $proc = Get-Process -Id $c.ProcessId -ErrorAction SilentlyContinue
  if ($proc) { $ram += $proc.WorkingSet64 }
}
$antes = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB
Write-Output "huérfanos de recolector: $($candidatos.Count) procesos · $(('{0:N0}' -f ($ram/1MB))) MB · memoria libre antes: $(('{0:N2}' -f $antes)) GB"

if ($Simular) { Write-Output '(simulación: no se mata nada)'; exit 0 }

$muertos = 0
foreach ($c in $candidatos) {
  try { Stop-Process -Id $c.ProcessId -Force -ErrorAction Stop; $muertos += 1 } catch { }
}
Start-Sleep -Seconds 3
$despues = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB
Write-Output "matados: $muertos · memoria libre después: $(('{0:N2}' -f $despues)) GB · liberado: $(('{0:N2}' -f ($despues - $antes))) GB"
