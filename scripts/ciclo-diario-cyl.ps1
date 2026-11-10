<#
  -- CICLO DIARIO DE CONSOLIDACION DE CASTILLA Y LEON ---------------------------------------------------------
  
  Consolida en el canonico del PC (PostgreSQL 127.0.0.1:5433, contenedor facylf-postgres, base facylf) TODO lo que
  se ha extraido de Castilla y Leon: primero lo que hay en la cola del PC y despues lo que falta y esta en el
  servidor. Al final vuelve a medir la cobertura y comprueba que no haya textos mal codificados. Deja constancia en
  estado/ciclo-diario.log y un resumen en estado/ciclo-diario-ultimo.json.
  
  -- QUE REUTILIZA (no reescribe nada) -----------------------------------------------------------------------
  
    - cola del PC -> canonico:  scripts/importar-masivo.mjs  (tandas, prioridad, aparta lo que no entra)
    - servidor -> canonico:     scripts/claude/trae-federacion-servidor.ps1  (extrae, scp y importa; ya mide
                               memoria, swap y carga del servidor antes de cada temporada y se para si no hay
                               margen; como mucho 4 temporadas por pasada)
    - codificacion:            scripts/lib/codificacion.mjs  (funciones puras + CLI; sale con 1 si hay dano)
  
  -- IDEMPOTENTE, Y SE DEMUESTRA -----------------------------------------------------------------------------
  
  Las tres piezas de arriba lo son por diseno: reimportar un grupo ya importado no duplica filas (el importador
  identifica cada entidad por su clave), la extraccion del servidor solo LEE su cola y la comprobacion de
  codificacion solo lee. El ciclo NO inventa trabajo: si no hay nada pendiente, no importa nada y los recuentos no
  cambian. Por eso el propio ciclo cuenta las tablas al empezar y al terminar y deja el antes/despues en el
  registro y en el JSON: dos pasadas seguidas con el trabajo ya hecho tienen que dar el MISMO recuento. La
  demostracion hecha el 10/11/2026 esta en docs/plataforma-web/PIPELINE-DIARIO.md.
  
  -- QUE CUENTA COMO "COMPLETA" ------------------------------------------------------------------------------
  
  Una sola definicion, la de la auditoria del 09/11/2026 (tmp/medir-canonico-cyl.sql): una EDICION esta completa
  cuando TODOS sus grupos tienen ops.coverage_checkpoint.visibility_state = 'completa'. NO se usa
  core.competition_edition.visibility_state (da 278 con los mismos datos que dan 206: son dos medidas distintas y
  tener dos "completas" es la clase de cifra que nadie sabe leer). El 10/11/2026: 206 de 867 ediciones y 2201 de
  3961 grupos completos.
  
  -- MODOS ---------------------------------------------------------------------------------------------------
  
    -SoloComprobar   mide y ensena el plan; NO importa, NO trae del servidor y NO toca la rotacion de temporadas.
                     Si escribe su registro y su resumen (es su unica forma de dejar rastro; no son datos).
    -SinServidor     solo la parte del PC (util si el servidor esta sin margen o no hay SSH).
  
  La tarea programada la registra el Lead, no este guion (ver el documento). Con StartWhenAvailable, si el PC
  estaba apagado a la hora, Windows la ejecuta al arrancar y el ciclo hace lo que toque: es idempotente, asi que
  recuperarse tarde no duplica nada.
  
  -- LO QUE NO HACE ------------------------------------------------------------------------------------------
  
    - NO refresca la base publicada del servidor ni publica nada en la web (eso es otro paso, manual y medido);
    - NO toca el servidor mas alla de traer paquetes: no lanza recolectores, no cambia pausas, no escribe en /tmp;
    - NO escribe en las colas: entran en modo lectura (readOnly) en todas las piezas que usa;
    - NO crea ni modifica la tarea programada; NO hace git commit.
  
  -- CODIFICACION Y ASCII ------------------------------------------------------------------------------------
  
  ASCII A PROPOSITO: PowerShell 5.1 lee un .ps1 UTF-8 SIN BOM como ANSI y un guion largo (E2 80 94) se convierte
  en una comilla tipografica que corta la cadena y rompe el analisis del fichero (paso el 24/09/2026 con
  importar-temporada.ps1). Este fichero no lleva un solo byte por encima de 127, y el propio ciclo lo comprueba
  cada dia (scripts/lib/codificacion.mjs lo revisa en modo ASCII).
  
  -- CODIGOS DE SALIDA ---------------------------------------------------------------------------------------
  
    0  ciclo completo (haya o no trabajo que hacer)
    1  la comprobacion de codificacion ha fallado (y el resto fue bien): hay texto mal codificado
    2  fallo de entorno o de un paso (base caida, cola que no existe, importacion que devuelve error)
  
  Uso:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ciclo-diario-cyl.ps1 -SoloComprobar
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ciclo-diario-cyl.ps1 -SinServidor
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ciclo-diario-cyl.ps1 -MinutosPC 30 -MaximoServidor 1
#>
param(
  # Solo mide y ensena el plan. No importa, no trae del servidor, no toca la rotacion.
  [switch]$SoloComprobar,
  # Solo la parte del PC: no se habla con el servidor (ni para medirlo).
  [switch]$SinServidor,
  # Tanda del PC: minutos y unidades como mucho (0 = sin tope de unidades, como importar-masivo.mjs).
  [int]$MinutosPC = 30,
  [int]$LimitePC = 0,
  # Temporadas como mucho por pasada del servidor. La regla del proyecto es no pasar de 4 NUNCA.
  [int]$MaximoServidor = 4,
  # Temporadas del PC a importar (lista separada por comas). Vacio = todas las que esten pendientes en la cola.
  [string]$TemporadasPC = '',
  # Fichero de registro (por defecto estado/ciclo-diario.log).
  [string]$Registro = '',
  # Para mantenimiento: no ejecutar la comprobacion de codificacion.
  [switch]$OmitirCodificacion
)
$ErrorActionPreference = 'Continue'
# La consola de Windows no esta en UTF-8: sin esto, lo que escriben los programas hijos con acentos se lee mal y
# luego se escribe mal en el registro (que es, ademas, uno de los ficheros que el propio ciclo comprueba).
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $raiz
$contenedor = if ($env:FACYLF_CONTENEDOR_POSTGRES) { $env:FACYLF_CONTENEDOR_POSTGRES } else { 'facylf-postgres' }
$usuarioPsql = if ($env:FACYLF_PSQL_USUARIO) { $env:FACYLF_PSQL_USUARIO } else { 'facylf_admin' }
$basePsql = if ($env:FACYLF_PSQL_BASE) { $env:FACYLF_PSQL_BASE } else { 'facylf' }
$estadoDir = Join-Path $raiz 'estado'
if (-not (Test-Path -LiteralPath $estadoDir)) { New-Item -ItemType Directory -Force -Path $estadoDir | Out-Null }
$rutaRegistro = if ($Registro) { $Registro } else { Join-Path $estadoDir 'ciclo-diario.log' }
$rutaResumen = Join-Path $estadoDir 'ciclo-diario-ultimo.json'
$rutaRotacion = Join-Path $estadoDir 'ciclo-diario-estado.json'
# La carpeta de datos de CyL es una union (junction) a E:\facylf-datos en este PC; desde el repo se llega igual.
$colaCyl = Join-Path $raiz 'descargas-federacion\recolector-local\cola-v2.sqlite'
$temporadasAsignadas = Join-Path $raiz 'descargas-federacion\recolector-local\temporadas-asignadas.txt'
$tmp = Join-Path $env:TEMP ('facylf-ciclo-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$utf8SinBom = New-Object System.Text.UTF8Encoding($false)
$script:fallos = @()
$script:avisos = @()
$inicio = Get-Date

# -- REGISTRO ------------------------------------------------------------------------------------------------

function AhoraUtc { return (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }

function Anota([string]$texto) {
  $linea = "$(AhoraUtc)  $texto"
  try { [System.IO.File]::AppendAllText($rutaRegistro, "$linea`r`n", $utf8SinBom) } catch { }
  Write-Host $linea
}

function Aviso([string]$texto) { $script:avisos += $texto; Anota "[aviso] $texto" }
function Fallo([string]$texto) { $script:fallos += $texto; Anota "[fallo] $texto" }

# Un programa externo, con su codigo de salida y su salida (stdout y stderr juntos, como se veria en consola).
#
# -- POR QUE SE REPARA LA CODIFICACION DE LO QUE DEVUELVE EL HIJO (medido el 10/11/2026) ---------------------
#
# `[Console]::OutputEncoding = UTF8` funciona en una consola de verdad, pero cuando el proceso tiene la salida
# REDIRIGIDA (una tuberia, o un powershell.exe lanzado desde otro programa) el setter puede fallar y PowerShell 5.1
# decodifica la salida del hijo con la pagina ANSI. Resultado: el punto medio del texto del hijo se queda
# DOBLEMENTE CODIFICADO en el registro (su marca es la que busca scripts/lib/codificacion.mjs), y como el propio
# registro es uno de los ficheros que comprueba la codificacion, al dia siguiente el ciclo se habria acusado a si
# mismo: un fallo diario por un fallo del registro, no de los datos. La reparacion es la vuelta atras exacta: si la
# pagina de salida NO es UTF-8, los bytes se re-interpretan como UTF-8. Solo se aplica a texto que viene de un hijo
# (node, powershell, ssh, docker), nunca a los literales del propio guion, que son ASCII.
function Repara([string]$texto) {
  if ($null -eq $texto) { return $texto }
  try { if ([Console]::OutputEncoding.CodePage -eq 65001) { return $texto } } catch { }
  try { return [System.Text.Encoding]::UTF8.GetString([System.Text.Encoding]::GetEncoding(1252).GetBytes($texto)) } catch { return $texto }
}

function Ejecuta([string]$programa, [string[]]$argumentos) {
  $salida = @(& $programa @argumentos 2>&1 | ForEach-Object { Repara "$_" })
  return [pscustomobject]@{ Codigo = $LASTEXITCODE; Salida = $salida }
}

# Guarda en el registro la salida de un hijo, con tope: la importacion de una temporada del servidor imprime una
# linea por grupo y hay cientos; se guardan las primeras y las ultimas para que el registro siga siendo legible.
function AnotaSalida($salida, [int]$tope = 60) {
  $lineas = @($salida | Where-Object { "$_".Trim() })
  if ($lineas.Count -eq 0) { return }
  if ($lineas.Count -le ($tope * 2)) {
    foreach ($l in $lineas) { Anota "    $l" }
    return
  }
  for ($i = 0; $i -lt $tope; $i++) { Anota "    $($lineas[$i])" }
  Anota "    ... ($($lineas.Count) lineas; se guardan las $tope primeras y las $tope ultimas) ..."
  for ($i = $lineas.Count - $tope; $i -lt $lineas.Count; $i++) { Anota "    $($lineas[$i])" }
}

# -- CANONICO (psql dentro del contenedor, SQL por la entrada estandar) --------------------------------------

function Psql([string]$sql) {
  $fichero = Join-Path $tmp 'consulta.sql'
  # ASCII puro en el .sql y sin BOM: asi no depende de la codificacion del cliente de psql del contenedor.
  [System.IO.File]::WriteAllText($fichero, $sql + "`n", $utf8SinBom)
  $salida = @(Get-Content -LiteralPath $fichero -Raw | & docker exec -i $contenedor psql -U $usuarioPsql -d $basePsql -X -q -t -A -F '|' -v ON_ERROR_STOP=1 -f - 2>&1 | ForEach-Object { Repara "$_" })
  return [pscustomobject]@{ Codigo = $LASTEXITCODE; Salida = $salida }
}

function CanonicoArriba {
  $r = Ejecuta 'docker' @('ps', '--filter', "name=$contenedor", '--format', '{{.Names}}')
  if ($r.Codigo -ne 0) { return $false }
  if (@($r.Salida) -notcontains $contenedor) { return $false }
  $q = Psql "select 1;"
  return ($q.Codigo -eq 0)
}

function TamanoBaseDatos {
  $q = Psql "select pg_size_pretty(pg_database_size(current_database()));"
  if ($q.Codigo -ne 0) { return 'desconocido' }
  $valor = [string](@($q.Salida | Where-Object { $_.Trim() } | Select-Object -First 1))
  if (-not $valor) { return 'desconocido' }
  return $valor.Trim()
}

# Recuentos exactos por tabla: es la evidencia de la idempotencia (antes y despues de cada pasada). No se usan
# estimaciones de pg_stat_user_tables: sus numeros estaban desfasados y una prueba de idempotencia con cifras
# aproximadas no demuestra nada.
function CuentaTablas {
  $sql = @'
select 'core.club' as tabla, count(*) as filas from core.club
union all select 'core.team_season', count(*) from core.team_season
union all select 'core.team_entry', count(*) from core.team_entry
union all select 'core.phase_group', count(*) from core.phase_group
union all select 'core.competition_edition', count(*) from core.competition_edition
union all select 'core.match', count(*) from core.match
union all select 'core.match_report', count(*) from core.match_report
union all select 'core.person', count(*) from core.person
union all select 'core.venue', count(*) from core.venue
union all select 'core.appearance', count(*) from core.appearance
union all select 'core.match_event', count(*) from core.match_event
order by 1;
'@
  $q = Psql $sql
  $mapa = [ordered]@{}
  if ($q.Codigo -ne 0) { return $null }
  foreach ($l in $q.Salida) {
    if (-not $l.Trim()) { continue }
    $p = $l.Split('|')
    if ($p.Count -lt 2) { continue }
    $mapa[$p[0].Trim()] = [long]$p[1].Trim()
  }
  if ($mapa.Count -eq 0) { return $null }
  return $mapa
}

# Cobertura de Castilla y Leon por temporada en el canonico.
#
# -- QUE ES "COMPLETA" (una sola definicion en todo el ciclo, 10/11/2026) -------------------------------------
#
# La definicion del proyecto, la de la auditoria del 09/11/2026 (tmp/medir-canonico-cyl.sql): una EDICION esta
# completa cuando TODOS sus grupos tienen `ops.coverage_checkpoint.visibility_state = 'completa'`, es decir
# bool_and(...) sobre los grupos y ademas hay checkpoint de todos ellos. NO se usa
# `core.competition_edition.visibility_state` (da otra cifra: 278 en vez de 206 con los mismos datos, porque son
# dos medidas distintas y mezclarlas era el camino a dos numeros que no cuadran). Los grupos "completos" que se
# informan al lado son la misma fuente (el checkpoint), contados a nivel de grupo: 2201 de 3961 el 10/11/2026.
function CoberturaCyl {
  $sql = @'
with gr as (
  select s.etiqueta as temporada, pg.id as grupo,
         coalesce(cp.visibility_state = 'completa', false) as completo
    from core.federation f
    join core.competition_edition ce on ce.federation_id = f.id
    join core.season s on s.id = ce.season_id
    join core.phase_group pg on pg.competition_edition_id = ce.id
    left join ops.coverage_checkpoint cp on cp.phase_group_id = pg.id
   where f.codigo = 'castilla-leon'
),
ed as (
  select s.etiqueta as temporada, ce.id as edicion,
         (bool_and(cp.visibility_state = 'completa') and count(cp.phase_group_id) = count(pg.id)) as completa
    from core.federation f
    join core.competition_edition ce on ce.federation_id = f.id
    join core.season s on s.id = ce.season_id
    join core.phase_group pg on pg.competition_edition_id = ce.id
    left join ops.coverage_checkpoint cp on cp.phase_group_id = pg.id
   where f.codigo = 'castilla-leon'
   group by 1, ce.id
),
pa as (
  select s.etiqueta as temporada, count(*) as partidos
    from core.federation f
    join core.competition_edition ce on ce.federation_id = f.id
    join core.season s on s.id = ce.season_id
    join core.phase_group pg on pg.competition_edition_id = ce.id
    join core.match m on m.phase_group_id = pg.id
   where f.codigo = 'castilla-leon'
   group by 1
)
select g.temporada,
  (select count(*) from ed where ed.temporada = g.temporada) as ediciones,
  (select count(*) from ed where ed.temporada = g.temporada and ed.completa) as completas,
  count(*) as grupos,
  count(*) filter (where g.completo) as grupos_completos,
  coalesce((select p.partidos from pa p where p.temporada = g.temporada), 0) as partidos
from gr g
group by g.temporada
order by g.temporada desc;
'@
  $q = Psql $sql
  if ($q.Codigo -ne 0) { return $null }
  $filas = @()
  foreach ($l in $q.Salida) {
    if (-not $l.Trim()) { continue }
    $p = $l.Split('|')
    if ($p.Count -lt 6) { continue }
    $filas += [pscustomobject]@{
      temporada = $p[0].Trim(); ediciones = [int]$p[1]; completas = [int]$p[2]
      grupos = [int]$p[3]; gruposCompletos = [int]$p[4]; partidos = [int]$p[5]
    }
  }
  return $filas
}

# -- ESPACIO Y ESTADO ----------------------------------------------------------------------------------------

function LibreGb([string]$unidad) {
  try {
    $d = Get-PSDrive -Name $unidad -ErrorAction Stop
    return [math]::Round($d.Free / 1GB, 1)
  } catch { return $null }
}

function TamanoCarpetaGb([string]$ruta) {
  if (-not (Test-Path -LiteralPath $ruta)) { return $null }
  $suma = (Get-ChildItem -LiteralPath $ruta -File -Recurse -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
  if ($null -eq $suma) { return 0 }
  return [math]::Round($suma / 1GB, 1)
}

# Estado de la importacion masiva del PC: unidades conocidas, hechas, apartadas y pendientes (solo lee).
function EstadoImportacion {
  $r = Ejecuta 'node' @('scripts\importar-masivo.mjs', '--estado', '--federaciones', 'federacion')
  if ($r.Codigo -ne 0) { return $null }
  try { return (($r.Salida -join "`n") | ConvertFrom-Json) } catch { return $null }
}

# -- SERVIDOR ------------------------------------------------------------------------------------------------

# Mide el servidor reutilizando la comprobacion que ya existe en trae-federacion-servidor.ps1 (-SoloMedir): no hay
# una segunda forma de medir memoria, swap y carga que pueda discrepar de la que decide si se trae o no.
#
# OJO (medido el 10/11/2026): ese guion exige -Temporadas o -Todas ANTES de mirar -SoloMedir (lanza el error
# "Indica -Temporadas o -Todas"), asi que aqui se le pasa una temporada suya ya conocida, o -Todas si no se sabe
# ninguna. No es un capricho: es la unica forma de reutilizar SU medida sin que el ciclo tenga una copia propia que
# se desvie con el tiempo.
function MideServidor([string]$TemporadaParaMedir = '') {
  $argumentos = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    'scripts\claude\trae-federacion-servidor.ps1', '-Federacion', 'castilla-leon', '-SoloMedir')
  if ($TemporadaParaMedir) { $argumentos += @('-Temporadas', $TemporadaParaMedir) } else { $argumentos += @('-Todas') }
  $r = Ejecuta 'powershell.exe' $argumentos
  $texto = @($r.Salida) -join ' '
  $m = [regex]::Match($texto, 'memoria disponible ([0-9]+[.,][0-9]+) GiB - swap ([0-9]+[.,][0-9]+) GiB - carga ([0-9]+[.,][0-9]+)')
  if (-not $m.Success) { return $null }
  $libre = [double]::Parse(($m.Groups[1].Value -replace ',', '.'), [System.Globalization.CultureInfo]::InvariantCulture)
  $swap = [double]::Parse(($m.Groups[2].Value -replace ',', '.'), [System.Globalization.CultureInfo]::InvariantCulture)
  $carga = [double]::Parse(($m.Groups[3].Value -replace ',', '.'), [System.Globalization.CultureInfo]::InvariantCulture)
  return [pscustomobject]@{ Libre = $libre; Swap = $swap; Carga = $carga; Codigo = $r.Codigo }
}

# Las temporadas que recolecta el SERVIDOR de CyL. Es la unica fuente buena de ese reparto: el fichero del PC dice
# las del PC. Sin comillas en la orden remota (PowerShell 5.1 las pasa mal a ssh.exe).
function TemporadasServidor {
  $r = Ejecuta 'ssh.exe' @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'servidor',
    'cat /srv/data/facylf/descargas-federacion/recolector-local/temporadas-asignadas.txt')
  if ($r.Codigo -ne 0) { return @() }
  $lista = @()
  foreach ($l in $r.Salida) {
    $t = "$l".Trim()
    if ($t -match '^[0-9]{4}-[0-9]{2}$') { $lista += $t }
  }
  return $lista
}

function TemporadasPc {
  if (-not (Test-Path -LiteralPath $temporadasAsignadas)) { return @() }
  $lista = @()
  foreach ($l in (Get-Content -LiteralPath $temporadasAsignadas)) {
    $t = "$l".Trim()
    if ($t -match '^[0-9]{4}-[0-9]{2}$') { $lista += $t }
  }
  return $lista
}

function LeeRotacion {
  $mapa = @{}
  if (Test-Path -LiteralPath $rutaRotacion) {
    try {
      $datos = Get-Content -LiteralPath $rutaRotacion -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($datos -and $datos.temporadas) {
        foreach ($p in $datos.temporadas.PSObject.Properties) { $mapa[$p.Name] = [string]$p.Value }
      }
    } catch { }
  }
  return $mapa
}

function GuardaRotacion($temporadasServidor, $traidas, $rotacion) {
  $ahora = AhoraUtc
  $destino = [ordered]@{ actualizado = $ahora; temporadas = [ordered]@{} }
  foreach ($t in $temporadasServidor) {
    if ($traidas -contains $t) { $destino.temporadas[$t] = $ahora }
    elseif ($rotacion.ContainsKey($t)) { $destino.temporadas[$t] = $rotacion[$t] }
  }
  $destino | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $rutaRotacion -Encoding UTF8
}

# Que temporadas del servidor hay que traer hoy: las del SERVIDOR que en el canonico no estan completas (todas sus
# ediciones en visibility_state = 'completa'), ordenadas por la que hace mas tiempo que no se trae. La rotacion es
# lo que evita el hambre: si siempre se eligieran las 4 primeras, las de mas atras no se traerian nunca.
function PlanServidor($temporadasServidor, $cobertura, $rotacion) {
  $candidatas = @()
  foreach ($t in $temporadasServidor) {
    $cob = $null
    foreach ($c in @($cobertura)) { if ($c.temporada -eq $t) { $cob = $c; break } }
    $completa = $false
    if ($null -ne $cob) { if ($cob.ediciones -gt 0 -and $cob.completas -ge $cob.ediciones) { $completa = $true } }
    if ($completa) { continue }
    $ultima = $null
    if ($rotacion.ContainsKey($t)) { $ultima = [string]$rotacion[$t] }
    $orden = '0000'
    if ($ultima) { $orden = $ultima }
    $candidatas += [pscustomobject]@{ temporada = $t; orden = $orden }
  }
  $ordenadas = @($candidatas | Sort-Object -Property @{ Expression = { $_.orden }; Ascending = $true }, @{ Expression = { $_.temporada }; Descending = $true })
  return @($ordenadas | Select-Object -First $MaximoServidor | ForEach-Object { $_.temporada })
}

# -- ARRANQUE: ENTORNO ---------------------------------------------------------------------------------------

$modo = 'real'
if ($SoloComprobar) { $modo = 'solo-comprobar' }
Anota "== ciclo diario CyL == modo $modo - sinServidor=$([bool]$SinServidor) - minutosPC $MinutosPC - limitePC $LimitePC - maximoServidor $MaximoServidor"
Anota "raiz $raiz"
Anota "canonico $contenedor ($usuarioPsql@$basePsql) - cola $colaCyl"

if (-not (Test-Path -LiteralPath $colaCyl)) { Fallo "no existe la cola del PC: $colaCyl" }
if (-not (CanonicoArriba)) { Fallo "el canonico no responde (contenedor $contenedor o psql)" }

$infoCola = $null
if (Test-Path -LiteralPath $colaCyl) {
  $fi = Get-Item -LiteralPath $colaCyl
  $infoCola = [ordered]@{ ruta = $fi.FullName; bytes = $fi.Length; escrita = $fi.LastWriteTimeUtc.ToString('yyyy-MM-ddTHH:mm:ssZ') }
}

$espacio = [ordered]@{
  fLibreGb = (LibreGb 'F'); eLibreGb = (LibreGb 'E'); cLibreGb = (LibreGb 'C')
  traspasoGb = (TamanoCarpetaGb (Join-Path $raiz '_traspaso'))
}
Anota ("espacio: F: {0} GB libres - E: {1} GB libres - C: {2} GB libres - _traspaso {3} GB" -f $espacio.fLibreGb, $espacio.eLibreGb, $espacio.cLibreGb, $espacio.traspasoGb)
if ($null -ne $espacio.fLibreGb -and $espacio.fLibreGb -lt 20) { Aviso "a F: le quedan $($espacio.fLibreGb) GB libres: los paquetes del servidor van a _traspaso" }
if ($null -ne $espacio.eLibreGb -and $espacio.eLibreGb -lt 20) { Aviso "a E: le quedan $($espacio.eLibreGb) GB libres (cola y datos)" }

$tamanoBase = 'desconocido'
if ($script:fallos.Count -eq 0) {
  $tamanoBase = TamanoBaseDatos
  Anota "base de datos: $tamanoBase"
  if ($infoCola) { Anota ("cola del PC: {0} GB - ultima escritura {1}" -f ([math]::Round($infoCola.bytes / 1GB, 2)), $infoCola.escrita) }
}

$estadoImportacion = $null
$coberturaAntes = $null
$recuentosAntes = $null
if ($script:fallos.Count -eq 0) {
  $estadoImportacion = EstadoImportacion
  if ($null -eq $estadoImportacion) {
    Aviso 'no se pudo leer el estado de la importacion masiva (se sigue: la importacion lo volvera a intentar)'
  } else {
    Anota ("importacion masiva: {0} unidades - {1} hechas - {2} apartadas - {3} pendientes - {4} filas" -f $estadoImportacion.unidades, $estadoImportacion.hechas, $estadoImportacion.apartadas, $estadoImportacion.pendientes, $estadoImportacion.filasImportadas)
  }
  $coberturaAntes = CoberturaCyl
  if ($null -eq $coberturaAntes) { Aviso 'no se pudo medir la cobertura de CyL en el canonico' }
  else {
    foreach ($c in $coberturaAntes) {
      Anota ("  CyL {0}: {1} ediciones ({2} completas, auditoria) - {3} grupos ({4} completos) - {5} partidos" -f $c.temporada, $c.ediciones, $c.completas, $c.grupos, $c.gruposCompletos, $c.partidos)
    }
    $tg = 0; $tp = 0; $te = 0; $tc = 0; $tgc = 0
    foreach ($c in $coberturaAntes) { $te += $c.ediciones; $tc += $c.completas; $tg += $c.grupos; $tgc += $c.gruposCompletos; $tp += $c.partidos }
    Anota ("CyL total antes: $te ediciones ($tc completas de $te, auditoria) - $tg grupos ($tgc completos) - $tp partidos")
  }
  $recuentosAntes = CuentaTablas
  if ($null -eq $recuentosAntes) { Aviso 'no se pudieron contar las tablas del canonico' }
  else {
    $partes = @()
    foreach ($k in $recuentosAntes.Keys) { $partes += "$k=$($recuentosAntes[$k])" }
    Anota ("recuentos antes: " + ($partes -join ' '))
  }
}

# -- PLAN ---------------------------------------------------------------------------------------------------

$rotacion = LeeRotacion
$temporadasSrv = @()
$medida = $null
if (-not $SinServidor) {
  $temporadasSrv = TemporadasServidor
  if ($temporadasSrv.Count -eq 0) { Aviso 'no se pudieron leer del servidor sus temporadas de CyL (SSH); la parte del servidor se saltara' }
  $temporadaParaMedir = ''
  if ($temporadasSrv.Count -gt 0) { $temporadaParaMedir = [string]$temporadasSrv[0] }
  $medida = MideServidor $temporadaParaMedir
  if ($null -eq $medida) { Aviso 'no se pudo medir el servidor; la parte del servidor se saltara' }
  else {
    $hayMargen = ($medida.Libre -ge 3.0) -and ($medida.Carga -le 14) -and ($medida.Swap -le 1.0)
    Anota ("servidor: memoria disponible {0:N1} GiB - swap {1:N1} GiB - carga {2:N1} -> {3}" -f $medida.Libre, $medida.Swap, $medida.Carga, $(if ($hayMargen) { 'hay margen' } else { 'SIN margen (no se le anade trabajo)' }))
  }
}
$planSrv = @()
if (-not $SinServidor -and $temporadasSrv.Count -gt 0 -and $null -ne $coberturaAntes) {
  $planSrv = PlanServidor $temporadasSrv $coberturaAntes $rotacion
}
$traidasSrv = @()
$planPc = @()
if ($TemporadasPC) { $planPc = @($TemporadasPC -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }

Anota "plan del PC: importar-masivo.mjs --federaciones federacion --minutos $MinutosPC --limite $LimitePC (temporadas: $(if ($planPc.Count) { $planPc -join ', ' } else { 'las pendientes de la cola' }))"
if ($SinServidor) { Anota 'plan del servidor: se salta (-SinServidor)' }
elseif ($planSrv.Count -eq 0) { Anota 'plan del servidor: nada que traer (sin temporadas del servidor, sin margen o ya completas)' }
else { Anota ("plan del servidor: traer {0} (de {1} temporadas suyas; maximo {2} por pasada)" -f ($planSrv -join ', '), $temporadasSrv.Count, $MaximoServidor) }

# -- SOLO COMPROBAR: se acaba aqui --------------------------------------------------------------------------

function CompruebaCodificacion {
  $r = Ejecuta 'node' @('scripts\lib\codificacion.mjs', '--bd', '--alcance', 'cyl')
  AnotaSalida $r.Salida 80
  return [pscustomobject]@{ Codigo = $r.Codigo; Salida = $r.Salida }
}

$codificacion = $null
$coberturaDespues = $null
$recuentosDespues = $null
if ($SoloComprobar) {
  Anota '== solo comprobar: no se importa nada, no se trae nada del servidor y no se toca la rotacion =='
  if (-not $OmitirCodificacion) {
    $codificacion = CompruebaCodificacion
    if ($codificacion.Codigo -eq 0) { Anota 'codificacion: OK' }
    elseif ($codificacion.Codigo -eq 1) { Fallo 'codificacion: hay texto mal codificado (exit 1)' }
    else { Fallo "codificacion: no se pudo comprobar (exit $($codificacion.Codigo))" }
  }
  Anota '== fin (solo comprobar) =='
} else {

  # -- PASO 1: COLA DEL PC -> CANONICO ------------------------------------------------------------------------

  if ($script:fallos.Count -eq 0) {
    Anota '== paso 1: cola del PC -> canonico (importar-masivo.mjs) =='
    # OJO: la variable se llama $argumentos y no $args. `$args` es automatica en PowerShell y usarla deja el
    # splatting vacio sin dar error (esta escrito en scripts/_ciclo-pristina.ps1, y paso de verdad).
    $argumentos = @('scripts\importar-masivo.mjs', '--federaciones', 'federacion', '--minutos', "$MinutosPC", '--limite', "$LimitePC")
    if ($planPc.Count -gt 0) { $argumentos += @('--temporadas', ($planPc -join ',')) }
    $t0 = Get-Date
    $r = Ejecuta 'node' $argumentos
    AnotaSalida $r.Salida 60
    Anota ("paso 1 terminado en {0:N0} s con codigo {1}" -f ((Get-Date) - $t0).TotalSeconds, $r.Codigo)
    if ($r.Codigo -ne 0) { Fallo "la importacion de la cola del PC devolvio codigo $($r.Codigo)" }
  }

  # -- PASO 2: SERVIDOR -> CANONICO (una sola pasada, maximo 4 temporadas) ------------------------------------

  $traidasSrv = @()
  if ($script:fallos.Count -eq 0) {
    if ($SinServidor) {
      Anota '== paso 2: servidor -> canonico, saltado (-SinServidor) =='
    } elseif ($null -eq $medida) {
      Anota '== paso 2: servidor -> canonico, saltado (no se pudo medir el servidor) =='
    } elseif ($planSrv.Count -eq 0) {
      Anota '== paso 2: servidor -> canonico, nada que traer =='
    } else {
      $hayMargen = ($medida.Libre -ge 3.0) -and ($medida.Carga -le 14) -and ($medida.Swap -le 1.0)
      if (-not $hayMargen) {
        Anota '== paso 2: servidor -> canonico, saltado (el servidor no tiene margen) =='
      } else {
        Anota '== paso 2: servidor -> canonico (trae-federacion-servidor.ps1) =='
        $t0 = Get-Date
        $r = Ejecuta 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
          'scripts\claude\trae-federacion-servidor.ps1', '-Federacion', 'castilla-leon',
          '-Temporadas', ($planSrv -join ','), '-Maximo', "$MaximoServidor")
        AnotaSalida $r.Salida 40
        Anota ("paso 2 terminado en {0:N0} s con codigo {1}" -f ((Get-Date) - $t0).TotalSeconds, $r.Codigo)
        if ($r.Codigo -ne 0) { Fallo "la traida del servidor devolvio codigo $($r.Codigo)" }
        # De la salida se sabe que temporadas se han traido de verdad: las que aparecen en el resumen con
        # "importada" o "traida". Lo que no salga, no cuenta para la rotacion (no se da por hecha una traida que
        # no ha ocurrido: eso dejaria la temporada sin visitar durante dias).
        foreach ($t in $planSrv) {
          foreach ($l in @($r.Salida)) {
            if ($l -match ("^\s*{0} : (importada|traida)" -f [regex]::Escape($t))) { if ($traidasSrv -notcontains $t) { $traidasSrv += $t } }
          }
        }
        Anota ("temporadas traidas: " + $(if ($traidasSrv.Count) { $traidasSrv -join ', ' } else { 'ninguna (ver salida)' }))
        GuardaRotacion $temporadasSrv $traidasSrv $rotacion
      }
    }
  }

  # -- PASO 3: VOLVER A MEDIR --------------------------------------------------------------------------------

  Anota '== paso 3: medir la cobertura despues =='
  $coberturaDespues = $null
  $recuentosDespues = $null
  if ($script:fallos.Count -eq 0) {
    $coberturaDespues = CoberturaCyl
    if ($null -eq $coberturaDespues) { Aviso 'no se pudo medir la cobertura despues' }
    else {
      foreach ($c in $coberturaDespues) {
        Anota ("  CyL {0}: {1} ediciones ({2} completas, auditoria) - {3} grupos ({4} completos) - {5} partidos" -f $c.temporada, $c.ediciones, $c.completas, $c.grupos, $c.gruposCompletos, $c.partidos)
      }
      $tg = 0; $tp = 0; $te = 0; $tc = 0; $tgc = 0
      foreach ($c in $coberturaDespues) { $te += $c.ediciones; $tc += $c.completas; $tg += $c.grupos; $tgc += $c.gruposCompletos; $tp += $c.partidos }
      Anota ("CyL total despues: $te ediciones ($tc completas de $te, auditoria) - $tg grupos ($tgc completos) - $tp partidos")
      if ($null -ne $coberturaAntes) {
        $ag = 0; $ap = 0; $ae = 0; $ac = 0; $agc = 0
        foreach ($c in $coberturaAntes) { $ae += $c.ediciones; $ac += $c.completas; $ag += $c.grupos; $agc += $c.gruposCompletos; $ap += $c.partidos }
        Anota ("CyL delta: ediciones " + ($te - $ae) + " - completas " + ($tc - $ac) + " - grupos " + ($tg - $ag) + " - grupos completos " + ($tgc - $agc) + " - partidos " + ($tp - $ap))
      }
    }
    $recuentosDespues = CuentaTablas
    if ($null -eq $recuentosDespues) { Aviso 'no se pudieron contar las tablas despues' }
    else {
      $partes = @()
      foreach ($k in $recuentosDespues.Keys) { $partes += "$k=$($recuentosDespues[$k])" }
      Anota ("recuentos despues: " + ($partes -join ' '))
      if ($null -ne $recuentosAntes) {
        $deltas = @()
        $cambio = $false
        foreach ($k in $recuentosDespues.Keys) {
          $antes = 0
          if ($recuentosAntes.Contains($k)) { $antes = $recuentosAntes[$k] }
          $d = $recuentosDespues[$k] - $antes
          if ($d -ne 0) { $cambio = $true }
          $deltas += "$k=$d"
        }
        Anota ("deltas: " + ($deltas -join ' '))
        if (-not $cambio) { Anota 'deltas: todos cero (la pasada no ha anadido ni cambiado filas)' }
      }
    }
  }

  # -- PASO 4: COMPROBACION DE CODIFICACION ------------------------------------------------------------------

  $codificacion = $null
  if (-not $OmitirCodificacion) {
    Anota '== paso 4: comprobacion de codificacion (scripts/lib/codificacion.mjs) =='
    $codificacion = CompruebaCodificacion
    if ($codificacion.Codigo -eq 0) { Anota 'codificacion: OK' }
    elseif ($codificacion.Codigo -eq 1) { Fallo 'codificacion: hay texto mal codificado (exit 1)' }
    else { Fallo "codificacion: no se pudo comprobar (exit $($codificacion.Codigo))" }
  }
}

# -- RESUMEN ------------------------------------------------------------------------------------------------

$estadoImportacionDespues = $null
if (-not $SoloComprobar -and $script:fallos.Count -eq 0) { $estadoImportacionDespues = EstadoImportacion }

$resultado = 'ok'
$fallosNoCodificacion = @($script:fallos | Where-Object { $_ -notlike 'codificacion:*' })
if ($fallosNoCodificacion.Count -gt 0) { $resultado = 'fallo' }
elseif ($null -ne $codificacion -and $codificacion.Codigo -eq 1) { $resultado = 'codificacion' }

$resumen = [ordered]@{
  cuando = AhoraUtc
  modo = $modo
  sinServidor = [bool]$SinServidor
  duracionSegundos = [math]::Round(((Get-Date) - $inicio).TotalSeconds, 1)
  contenedor = $contenedor
  cola = $infoCola
  espacio = $espacio
  tamanoBaseDatos = $tamanoBase
  importacion = [ordered]@{
    antes = $(if ($null -ne $estadoImportacion) { $estadoImportacion } else { $null })
    despues = $(if ($null -ne $estadoImportacionDespues) { $estadoImportacionDespues } else { $null })
    minutos = $MinutosPC
    limite = $LimitePC
  }
  servidor = [ordered]@{
    medido = $(if ($null -ne $medida) { $true } else { $false })
    memoriaLibreGb = $(if ($null -ne $medida) { $medida.Libre } else { $null })
    swapGb = $(if ($null -ne $medida) { $medida.Swap } else { $null })
    carga = $(if ($null -ne $medida) { $medida.Carga } else { $null })
    temporadasDelServidor = $temporadasSrv
    pedidas = $planSrv
    traidas = $traidasSrv
  }
  coberturaAntes = $coberturaAntes
  coberturaDespues = $(if ($null -ne $coberturaDespues) { $coberturaDespues } else { $null })
  recuentosAntes = $recuentosAntes
  recuentosDespues = $(if ($null -ne $recuentosDespues) { $recuentosDespues } else { $null })
  codificacion = [ordered]@{
    ejecutada = $(-not $OmitirCodificacion)
    codigo = $(if ($null -ne $codificacion) { $codificacion.Codigo } else { $null })
    problemas = @($script:fallos | Where-Object { $_ -like 'codificacion:*' }).Count
  }
  avisos = $script:avisos
  fallos = $script:fallos
  resultado = $resultado
}
try { $resumen | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $rutaResumen -Encoding UTF8 } catch { Aviso "no se pudo escribir el resumen: $($_.Exception.Message)" }

Anota "resultado: $resultado - fallos $($script:fallos.Count) - avisos $($script:avisos.Count) - resumen en $rutaResumen"
Anota '== fin =='

try { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue } catch { }

# Codigos de salida: un fallo de entorno o de paso MANDA sobre el de codificacion (si la base se ha caido a mitad,
# decir "codificacion" seria enganar a quien lea el codigo de salida de la tarea programada).
if ($fallosNoCodificacion.Count -gt 0) { exit 2 }
if ($null -ne $codificacion -and $codificacion.Codigo -eq 1) { exit 1 }
if ($null -ne $codificacion -and $codificacion.Codigo -ne 0) { exit 2 }
exit 0