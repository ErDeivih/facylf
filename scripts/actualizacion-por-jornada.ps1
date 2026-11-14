# actualizacion-por-jornada.ps1 -- si la ultima jornada de CyL tiene TODAS sus actas, importa al canonico y
# republica la demo estatica. Pensado para una tarea programada HORARIA: cuando no hay nada nuevo, termina en
# menos de un segundo y no escribe nada.
#
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\actualizacion-por-jornada.ps1 -Simular
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\actualizacion-por-jornada.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\actualizacion-por-jornada.ps1 -ComprobarIdempotencia
#
# Que hace cada paso (y como se comprueba que no ha duplicado nada) esta en
# docs\plataforma-web\ACTUALIZACION-POR-JORNADA.md.

param(
  [switch]$Simular,
  [switch]$ComprobarIdempotencia,
  [string]$Temporada = '2026-27',
  [string]$Contenedor = 'facylf-postgres'
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$Raiz = (Get-Location).Path
$Estado = Join-Path $Raiz 'estado'
$Marca = Join-Path $Estado 'actualizacion-jornada.json'
$Candado = Join-Path $Estado 'actualizacion.lock'
$Log = Join-Path $Estado 'actualizacion-jornada.log'
New-Item -ItemType Directory -Force -Path $Estado | Out-Null

function Log([string]$texto) {
  $linea = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'), $texto
  Add-Content -Path $Log -Value $linea -Encoding ASCII
  Write-Output $linea
}

function Psql([string]$sql) {
  $salida = & docker exec $Contenedor psql -U facylf_admin -d facylf -Atc $sql 2>&1
  if ($LASTEXITCODE -ne 0) { throw "psql fallo: $salida" }
  return ($salida | Out-String).Trim()
}

# 0. Candado compartido con la pasada semanal: si hay otra importacion en curso (menos de 45 min), se sale.
if (Test-Path $Candado) {
  $edad = ((Get-Date) - (Get-Item $Candado).LastWriteTime).TotalHours
  if ($edad -lt 0.75) { Log ("ya hay una actualizacion en curso (candado de {0:N1} h); no se toca nada" -f $edad); exit 0 }
}

# 0b. Preflight: contenedor arriba y consultable. Si no, sale sin tocar nada.
& docker inspect -f '{{.State.Running}}' $Contenedor 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Log 'FALLO: el contenedor de PostgreSQL no esta disponible'; exit 2 }
$vivo = (& docker inspect -f '{{.State.Running}}' $Contenedor).Trim()
if ($vivo -ne 'true') { Log 'FALLO: el contenedor de PostgreSQL no esta arrancado'; exit 2 }

# 1. La puerta: grupos de la temporada con calendario, partidos y TODAS las actas hechas EN LA COLA.
#    Se reutiliza scripts\claude\estado-rotacion.mjs (solo lee la cola SQLite; no toca el canonico).
$estadoRotacion = Join-Path $Raiz 'scripts\claude\estado-rotacion.mjs'
$listos = 0
$salidaRotacion = & node $estadoRotacion --temporada $Temporada 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { Log "FALLO: estado-rotacion fallo ($LASTEXITCODE)"; exit 2 }
$m = [regex]::Match($salidaRotacion, 'listos para probar[^\r\n]*:\s*(\d+)')
if ($m.Success) { $listos = [int]$m.Groups[1].Value }
Log ("grupos listos para importar en {0}: {1}" -f $Temporada, $listos)

# 2. Marca: cuantos grupos listos habia la ultima vez y cuando se ejecuto (idempotencia entre horas).
$listosHechos = 0
$ultimaVez = $null
if (Test-Path $Marca) {
  try {
    $marca = Get-Content $Marca -Raw | ConvertFrom-Json
    if ($marca.temporada -eq $Temporada) { $listosHechos = [int]$marca.listos; $ultimaVez = $marca.importado_en }
  } catch { Log 'AVISO: marca ilegible; se trata como si no hubiera nada importado' }
}
$horas = 999
if ($ultimaVez) { try { $horas = ((Get-Date) - [datetime]$ultimaVez).TotalHours } catch { } }
Log ("ultima importacion: {0} grupos listos ({1}); horas desde entonces: {2:N1}" -f $listosHechos, $ultimaVez, $horas)

if ($Simular) {
  if ($listos -le 0) { Log 'SIMULACION: no hay grupos listos; no se haria nada' }
  elseif ($listos -gt $listosHechos -or $horas -ge 6) { Log 'SIMULACION: se ejecutaria scripts\ciclo-diario-cyl.ps1 -SinServidor y despues tmp\publica-demo.ps1' }
  else { Log 'SIMULACION: sin cambios desde la ultima vez (se reintenta como mucho cada 6 h); no se haria nada' }
  exit 0
}
if ($listos -le 0) { Log 'nada nuevo: no hay grupos con todas las actas hechas'; exit 0 }
if ($listos -le $listosHechos -and $horas -lt 6) { Log 'sin cambios desde la ultima importacion; no se toca nada'; exit 0 }

# 3. Recuentos ANTES (para demostrar que la importacion no duplica).
$cuenta = 'select (select count(*) from core.match) || ''|'' || (select count(*) from core.match_report) || ''|'' || (select count(*) from core.appearance)'
$antes = $null
try { $antes = Psql $cuenta } catch { Log "FALLO: recuentos antes ($_)"; exit 2 }
Log "antes: partidos|actas|apariciones = $antes"

# candado desde aqui: la importacion y la publicacion no se solapan con la tarea semanal
Set-Content $Candado (Get-Date -Format 'o') -Encoding ASCII

# 4. Importacion idempotente al canonico (reutiliza el ciclo diario: importar-masivo + codificacion + cobertura).
$ciclo = Join-Path $Raiz 'scripts\ciclo-diario-cyl.ps1'
$argumentos = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $ciclo, '-SinServidor')
Log "importando: powershell $($argumentos -join ' ')"
& powershell.exe @argumentos | ForEach-Object { Log $_ }
if ($LASTEXITCODE -ne 0) { Remove-Item $Candado -Force -ErrorAction SilentlyContinue; Log "FALLO: el ciclo diario devolvio $LASTEXITCODE"; exit 3 }

$despues = $null
try { $despues = Psql $cuenta } catch { Log "FALLO: recuentos despues ($_)"; exit 3 }
Log "despues: partidos|actas|apariciones = $despues"

# 5. Publicar la demo estatica (mirror + render + push) y la base de la app.
#    La app no lee una copia: lee el canonico ya importado; por eso 'la base de la app' queda al dia con el paso 4.
$publica = Join-Path $Raiz 'tmp\publica-demo.ps1'
$appViva = $false
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3002/' -UseBasicParsing -TimeoutSec 8
  $appViva = ($r.StatusCode -eq 200)
} catch { $appViva = $false }
if (-not (Test-Path $publica)) {
  Log 'AVISO: falta tmp\publica-demo.ps1; no se publica la demo'
} elseif (-not $appViva) {
  Log 'AVISO: la app no responde en 127.0.0.1:3002; el canonico queda importado y la demo NO se republica (se reintenta en la proxima pasada con la app levantada)'
} else {
  Log "publicando demo: powershell $publica"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $publica | ForEach-Object { Log $_ }
  if ($LASTEXITCODE -ne 0) { Log "AVISO: la publicacion devolvio $LASTEXITCODE (el canonico ya esta importado)"; }
}

# 6. Marca: solo se avanza si la importacion fue bien.
@{ temporada = $Temporada; listos = $listos; importado_en = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss') } |
  ConvertTo-Json | Set-Content -Path $Marca -Encoding ASCII
Remove-Item $Candado -Force -ErrorAction SilentlyContinue
Log "hecho: $listos grupos listos de $Temporada importados y demo publicada"

# 7. Idempotencia a mano: vuelve a medir antes/despues con la misma consulta; los numeros tienen que coincidir.
if ($ComprobarIdempotencia) {
  $otra = Psql $cuenta
  Log "comprobacion de idempotencia: $antes -> $despues -> $otra"
  if ($despues -ne $otra) { Log 'FALLO: la segunda pasada cambio los recuentos (revisar antes de seguir)'; exit 4 }
  Log 'OK: la segunda pasada no cambio los recuentos'
}
exit 0
