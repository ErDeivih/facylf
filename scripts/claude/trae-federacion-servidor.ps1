<#
  Trae al canonico del PC lo que una federacion ha recogido en el SERVIDOR, temporada a temporada, sin tocar la cola
  viva del PC. Generaliza trae-temporadas-servidor.ps1 (que solo hacia Castilla y Leon).

  Por que: la regla de David es tener TODA la informacion en un mismo sitio (el canonico del PC) y no saturar el
  servidor. Las colas del servidor siguen siendo la fuente de su recoleccion; esto copia sus datos al PC.

  Por cada temporada:
    1. servidor: extrae-temporada-cola.mjs saca la temporada a un SQLite nuevo (SOLO LEE la cola viva);
    2. scp al PC: _traspaso\<fed>-<temporada>.sqlite (el anterior se aparta con fecha);
    3. importar-temporada.ps1 -Paquete: importa grupo a grupo al canonico del PC (idempotente: repetirlo no duplica).

  ESCRIBE en el canonico del PC: se lanza a mano (David o DeepSeek), con Docker Desktop arriba y sin otra
  importacion en marcha.
  Uso:
    ... -File scripts\claude\trae-federacion-servidor.ps1 -Federacion galicia -Todas
    ... -File scripts\claude\trae-federacion-servidor.ps1 -Federacion castilla-leon -Temporadas 2026-27,2024-25
    ... -SoloTraer   (deja los paquetes en _traspaso sin importar)
  ASCII a proposito (PowerShell 5.1). Los programas externos van con .exe y fuera de ErrorActionPreference=Stop.

  13/10/2026 - EL SERVIDOR NO SE SOBRECARGA (regla de David). Se cayo dos veces (11/10 y 13/10) con la flota
  ya en su tope y traidas encadenadas encima. Por eso, antes de CADA temporada:
    - se mide el servidor (memoria disponible, swap y carga) y si no hay margen SE ESPERA (hasta 30 min) o se para;
    - la extraccion va con prioridad minima (nice 19) y escribe en el disco de datos, no en /tmp (que puede ser RAM);
    - entre temporadas hay una pausa de enfriamiento;
    - y como mucho -Maximo temporadas por pasada (4 por defecto).
  Una federacion cada vez, y mejor de noche.
#>
param(
  [Parameter(Mandatory = $true)][string]$Federacion,
  [string[]]$Temporadas = @(),
  [switch]$Todas,
  [switch]$SoloTraer,
  # Temporadas como mucho por pasada. Para mas, se relanza otra pasada mas tarde (o se sube a mano, sabiendo por que).
  [int]$Maximo = 4,
  # Umbrales del servidor (4 nucleos, 16 GB): por debajo de esto no se le anade trabajo.
  [double]$MemoriaLibreMinGiB = 3.0,
  [double]$CargaMax = 14,
  [double]$SwapMaxGiB = 1.0,
  [int]$PausaEntreTemporadasSeg = 180,
  # Solo mide el servidor y dice si hay margen (no extrae nada).
  [switch]$SoloMedir
)
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
New-Item -ItemType Directory -Force -Path _traspaso | Out-Null
$sello = Get-Date -Format 'yyyyMMdd-HHmm'
# Castilla y Leon vive en descargas-federacion y su contenedor es facylf-federacion-1.
$dir = if ($Federacion -eq 'castilla-leon') { 'federacion' } else { $Federacion }
$contenedor = "facylf-$dir-1"
# Las que recoge el PC (11/10/2026): su cola VIVA esta en el PC y la del servidor es una copia parada y vieja.
# Traerla importaria datos atrasados. Esas se importan desde la cola del PC con importar-temporada.ps1 (sin -Paquete).
$recogeElPc = @('andalucia', 'madrid', 'valencia', 'cataluna')
if ($recogeElPc -contains $dir) {
  throw "$Federacion se recoge en el PC: su copia del servidor esta parada y desfasada. Importala desde la cola del PC: scripts\importar-temporada.ps1 -Federacion $Federacion -Temporada <AAAA-AA> (sin -Paquete)."
}
$cola = "/app/descargas-$dir/recolector-local/cola-v2.sqlite"

function EnServidor([string]$orden) {
  $r = @(& ssh.exe -o BatchMode=yes -o ConnectTimeout=15 servidor $orden 2>&1 | ForEach-Object { "$_" })
  return [pscustomobject]@{ Codigo = $LASTEXITCODE; Salida = $r }
}

$Temporadas = @($Temporadas | ForEach-Object { $_ -split ',' } | Where-Object { $_ } | ForEach-Object { $_.Trim() })
if ($Todas) {
  $r = EnServidor "docker exec $contenedor node --no-warnings /app/scripts/claude/lista-temporadas-cola.mjs $cola"
  if ($r.Codigo -ne 0) { throw "no se pudo listar las temporadas de $Federacion en el servidor: $($r.Salida -join ' ')" }
  $Temporadas = @($r.Salida | Where-Object { $_ -match '^\d{4}-\d{2}$' })
  if ($dir -eq 'federacion') {
    # CyL se reparte por temporadas: la cola del servidor guarda copias VIEJAS de las temporadas del PC. Con -Todas
    # solo se traen las asignadas al servidor (las del PC se importan desde la cola del PC).
    $a = EnServidor "grep -v '^#' /srv/data/facylf/descargas-federacion/recolector-local/temporadas-asignadas.txt"
    $asignadas = @($a.Salida | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d{4}-\d{2}$' })
    if ($asignadas.Count -eq 0) { throw 'no se pudo leer temporadas-asignadas.txt del servidor; no se trae nada de CyL a ciegas' }
    $Temporadas = @($Temporadas | Where-Object { $asignadas -contains $_ })
  }
}
if ($Temporadas.Count -eq 0) { throw 'Indica -Temporadas o -Todas.' }
if ($Temporadas.Count -gt $Maximo) {
  Write-Host ("  {0} temporadas pedidas; en esta pasada solo las {1} primeras (-Maximo). Las demas, en otra pasada mas tarde." -f $Temporadas.Count, $Maximo) -ForegroundColor Yellow
  $Temporadas = @($Temporadas | Select-Object -First $Maximo)
}

# Mide el servidor: memoria disponible del sistema (incluye cache recuperable), swap usada y carga a 1 min.
function MideServidor {
  # Sin comillas en la orden remota (PowerShell 5.1 las pasa mal a ssh.exe): se leen los ficheros tal cual y se
  # interpretan aqui.
  $r = EnServidor 'head -n 20 /proc/meminfo; cat /proc/loadavg'
  if ($r.Codigo -ne 0) { return $null }
  $kb = @{}
  $carga = $null
  foreach ($l in $r.Salida) {
    $m = [regex]::Match($l, '^(\w+):\s+(\d+)\s+kB')
    if ($m.Success) { $kb[$m.Groups[1].Value] = [double]$m.Groups[2].Value; continue }
    $c = [regex]::Match($l, '^(\d+\.\d+)\s')
    if ($c.Success) { $carga = [double]::Parse($c.Groups[1].Value, [System.Globalization.CultureInfo]::InvariantCulture) }
  }
  if (-not $kb.ContainsKey('MemAvailable') -or $null -eq $carga) { return $null }
  $swap = 0.0
  if ($kb.ContainsKey('SwapTotal') -and $kb.ContainsKey('SwapFree')) { $swap = ($kb['SwapTotal'] - $kb['SwapFree']) / 1048576 }
  return [pscustomobject]@{ Libre = $kb['MemAvailable'] / 1048576; Swap = $swap; Carga = $carga }
}
function HayMargen {
  $limite = (Get-Date).AddMinutes(30)
  while ($true) {
    $m = MideServidor
    if ($null -eq $m) { Write-Host '  no se pudo medir el servidor: no se le anade trabajo' -ForegroundColor Red; return $false }
    $ok = ($m.Libre -ge $MemoriaLibreMinGiB) -and ($m.Carga -le $CargaMax) -and ($m.Swap -le $SwapMaxGiB)
    Write-Host ("  servidor: memoria disponible {0:N1} GiB - swap {1:N1} GiB - carga {2:N1} -> {3}" -f $m.Libre, $m.Swap, $m.Carga, $(if ($ok) { 'hay margen' } else { 'SIN margen, espero' })) -ForegroundColor DarkGray
    if ($ok) { return $true }
    if ((Get-Date) -gt $limite) { Write-Host '  30 min sin margen: paro para no sobrecargar el servidor. Relanza mas tarde.' -ForegroundColor Red; return $false }
    Start-Sleep -Seconds 60
  }
}
Write-Host "$Federacion : $($Temporadas -join ', ')" -ForegroundColor Cyan

if ($SoloMedir) {
  $m = MideServidor
  if ($null -eq $m) { 'no se pudo medir el servidor'; exit 1 }
  "memoria disponible {0:N1} GiB - swap {1:N1} GiB - carga {2:N1} -> {3}" -f $m.Libre, $m.Swap, $m.Carga, $(if (($m.Libre -ge $MemoriaLibreMinGiB) -and ($m.Carga -le $CargaMax) -and ($m.Swap -le $SwapMaxGiB)) { 'hay margen' } else { 'SIN margen' })
  exit 0
}
$resumen = @()
$primera = $true
foreach ($t in $Temporadas) {
  Write-Host ""
  Write-Host "== $Federacion $t ==" -ForegroundColor Cyan
  if (-not $primera) { Write-Host "  pausa de enfriamiento: $PausaEntreTemporadasSeg s" -ForegroundColor DarkGray; Start-Sleep -Seconds $PausaEntreTemporadasSeg }
  $primera = $false
  if (-not (HayMargen)) { $resumen += "$t : NO traida (servidor sin margen)"; break }
  # En el disco de datos (montado en el contenedor), no en /tmp: un /tmp en RAM con un paquete de 300 MB es justo
  # lo que no hay que hacerle a un servidor al limite. Y sin `docker cp` (que duplicaba la copia).
  $remoto = "/app/descargas-$dir/_extraccion-$t.sqlite"
  $enHost = "/srv/data/facylf/descargas-$dir/_extraccion-$t.sqlite"
  $orden = "docker exec $contenedor rm -f $remoto && " +
           "docker exec $contenedor nice -n 19 node --no-warnings /app/scripts/claude/extrae-temporada-cola.mjs $cola $remoto $t && " +
           "test -s $enHost"
  $r = EnServidor $orden
  $r.Salida | ForEach-Object { Write-Host "  $_" }
  if ($r.Codigo -ne 0) { Write-Host "  no se pudo extraer $t en el servidor" -ForegroundColor Yellow; $resumen += "$t : fallo al extraer"; continue }

  $destino = "_traspaso\$dir-$t.sqlite"
  if (Test-Path $destino) { Move-Item $destino "_traspaso\$dir-$t-anterior-$sello.sqlite" }
  & scp.exe -o BatchMode=yes "servidor:$enHost" $destino 2>&1 | ForEach-Object { "$_" } | Out-Null
  [void](EnServidor "docker exec $contenedor rm -f $remoto")
  if (-not (Test-Path $destino)) { Write-Host "  no llego el paquete de $t" -ForegroundColor Yellow; $resumen += "$t : no llego"; continue }
  Write-Host ("  paquete: {0} ({1:N1} MB)" -f $destino, ((Get-Item $destino).Length / 1MB))

  $despues = MideServidor
  if ($despues) { Write-Host ("  servidor tras la traida: memoria disponible {0:N1} GiB - carga {1:N1}" -f $despues.Libre, $despues.Carga) -ForegroundColor DarkGray }
  if (-not $SoloTraer) {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\importar-temporada.ps1 -Federacion $Federacion -Temporada $t -Paquete $destino
    $resumen += "$t : importada (codigo $LASTEXITCODE)"
  } else { $resumen += "$t : traida" }
}
""
"== resumen $Federacion =="
$resumen | ForEach-Object { "  $_" }
