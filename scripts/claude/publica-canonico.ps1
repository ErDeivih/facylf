# publica-canonico.ps1 — refresco COMPLETO y cotejado de la base publicada del servidor desde el canónico del PC.
#
# Por qué existe: el refresco se ha hecho tres veces a mano (09/11 y 10/11) y siempre con los mismos pasos y los
# mismos riesgos: si un escritor sigue escribiendo entre el recuento y el volcado, la copia sale por detrás. Aquí
# queda automatizado con las dos puertas que costaron un intento fallido:
#
#   PUERTA 1 · los dos recuentos tienen que ser idénticos (T1 antes del volcado, T2 después). Si no, no vale.
#   PUERTA 2 · la base restaurada tiene que cuadrar TABLA POR TABLA con el recuento T1. Si no, no se apunta la web.
#
# Reglas del proyecto que respeta: no se borra ninguna base, ni volcado, ni contenedor; las tareas programadas se
# congelan durante el proceso y se devuelven a su estado; nada de `--no-acl` (se perdería el RLS de La Preferente).
# ASCII a proposito (PowerShell 5.1).
#
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\publica-canonico.ps1 -SoloRecuento
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\publica-canonico.ps1 -BaseNueva facylf_canonico_4
#   ... -SinApuntarLaWeb   (restaura y coteja, pero no cambia la base que sirve la web)
param(
  [string]$BaseNueva = 'facylf_canonico_4',
  [switch]$SoloRecuento,
  [switch]$SinApuntarLaWeb,
  [string[]]$Tareas = @('FACyLF importador incremental', 'FACyLF proyector', 'FACyLF mantenimiento',
    'FACyLF mantenimiento sem', 'FACyLF avisos', 'FACyLF avisos resumen', 'FACyLF vigilancia')
)
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$raiz = (Get-Location).Path
$registro = Join-Path $raiz 'estado\publica-canonico.log'
function Anota([string]$texto) {
  $linea = ('[{0:yyyy-MM-dd HH:mm:ss}] {1}' -f (Get-Date), $texto)
  Write-Output $linea
  Add-Content -Path $registro -Value $linea -Encoding utf8
}

# ── Recuento por tabla: la referencia del cotejo ─────────────────────────────────────────────────────
$sqlRecuento = Get-Content 'tmp\recuentos.sql' -Raw
function Toma-Recuento([string]$etiqueta) {
  $lineas = @($sqlRecuento | docker exec -i facylf-postgres psql -U facylf_admin -d facylf -At -F ' ')
  $mapa = [ordered]@{}
  $total = 0
  foreach ($l in $lineas) {
    $p = $l -split ' '
    if ($p.Count -ge 2) { $n = [long]$p[1]; $mapa[$p[0]] = $n; $total += $n }
  }
  Anota ("recuento {0}: {1} tablas · {2} filas" -f $etiqueta, $mapa.Count, $total)
  return [pscustomobject]@{ Mapa = $mapa; Total = $total; Lineas = $lineas }
}

$t1 = Toma-Recuento 'T1'
if ($t1.Mapa.Count -lt 90) { throw 'el recuento T1 no trae las 98 tablas: se para para no volcar a ciegas' }
if ($SoloRecuento) { Anota 'solo recuento: fin'; return }

# ── Congelar los escritores del canónico ────────────────────────────────────────────────────────────
$habilitadasAntes = @()
foreach ($t in $Tareas) {
  try {
    $estado = (Get-ScheduledTask -TaskName $t -ErrorAction Stop).State
    if ($estado -ne 'Disabled') { $habilitadasAntes += $t; Disable-ScheduledTask -TaskName $t -ErrorAction Stop | Out-Null; Anota "congelada la tarea: $t" }
  } catch { Anota "no se pudo congelar la tarea ${t}: $($_.Exception.Message)" }
}

$volcado = ('facylf-canonico-{0}.dump' -f (Get-Date -Format 'yyyy-MM-dd-HHmm'))
$destinoPc = Join-Path $raiz "backups\$volcado"
$destinoServidor = "/srv/data/facylf/backups-volcados/$volcado"
try {
  # ── Volcado ─────────────────────────────────────────────────────────────────────────────────────
  Anota "volcando a $volcado"
  $inicio = Get-Date
  docker exec facylf-postgres sh -c "pg_dump -U facylf_admin -d facylf -Fc -Z6 -f /tmp/$volcado"
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump falló' }
  $entradas = @(docker exec facylf-postgres pg_restore --list "/tmp/$volcado").Count
  if ($entradas -lt 1000) { throw "el índice del volcado solo tiene $entradas entradas: se para" }
  docker cp "facylf-postgres:/tmp/$volcado" $destinoPc
  $sha = (Get-FileHash $destinoPc -Algorithm SHA256).Hash.ToLower()
  Anota ("volcado hecho en {0:N1} min · {1} entradas · sha256 {2}" -f ((Get-Date) - $inicio).TotalMinutes, $entradas, $sha)

  # ── PUERTA 1: la fuente no se ha movido ────────────────────────────────────────────────────────
  $t2 = Toma-Recuento 'T2'
  $difs = @()
  foreach ($k in $t1.Mapa.Keys) { if ($t2.Mapa[$k] -ne $t1.Mapa[$k]) { $difs += "$k t1=$($t1.Mapa[$k]) t2=$($t2.Mapa[$k])" } }
  if ($difs.Count -gt 0) { throw ("la fuente se movió durante el volcado: " + ($difs -join ' · ')) }
  Anota 'PUERTA 1 superada: T1 = T2'

  # ── Copia al servidor ──────────────────────────────────────────────────────────────────────────
  & scp.exe -o BatchMode=yes $destinoPc "servidor:$destinoServidor"
  if ($LASTEXITCODE -ne 0) { throw 'scp al servidor falló' }
  $shaRemoto = (& ssh.exe -o BatchMode=yes servidor "sha256sum $destinoServidor | cut -c1-64").Trim()
  if ($shaRemoto -ne $sha) { throw "sha distinto en el servidor ($shaRemoto ≠ $sha)" }
  Anota 'volcado en el servidor con el mismo sha256'

  # ── Restauración en la base nueva (script del servidor) ───────────────────────────────────────
  Anota "restaurando en $BaseNueva"
  $plantilla = Get-Content 'scripts\claude\publica-canonico-servidor.sh' -Raw
  $generado = $plantilla -replace '__BASE__', $BaseNueva -replace '__DUMP__', $destinoServidor
  $rutaGenerada = Join-Path $raiz 'tmp\publica-servidor-generado.sh'
  Set-Content -Path $rutaGenerada -Value $generado -Encoding utf8 -NoNewline
  & node scripts\claude\ejecuta-en-servidor.mjs 'tmp/publica-servidor-generado.sh' 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "la restauración en $BaseNueva falló (ver estado del servidor)" }

  # ── PUERTA 2: cuadra tabla por tabla ──────────────────────────────────────────────────────────
  $enServidor = @($sqlRecuento | ssh -o BatchMode=yes servidor "docker exec -i facylf-postgres psql -U facylf_admin -d $BaseNueva -At -F ' ' -f -")
  $mapaS = @{}
  foreach ($l in $enServidor) { $p = $l -split ' '; if ($p.Count -ge 2) { $mapaS[$p[0]] = [long]$p[1] } }
  $difsS = @()
  foreach ($k in $t1.Mapa.Keys) { if ($mapaS[$k] -ne $t1.Mapa[$k]) { $difsS += "$k pc=$($t1.Mapa[$k]) servidor=$($mapaS[$k])" } }
  if ($difsS.Count -gt 0) { throw ("la base restaurada no cuadra: " + ($difsS -join ' · ')) }
  Anota "PUERTA 2 superada: $($t1.Mapa.Count) tablas y $($t1.Total) filas idénticas en $BaseNueva"

  # ── Apuntar la web ─────────────────────────────────────────────────────────────────────────────
  if (-not $SinApuntarLaWeb) {
    $lineasEnv = Get-Content (Join-Path $raiz '.env')
    $lineasEnv = $lineasEnv | ForEach-Object {
      if ($_ -match '^DATABASE_URL_LECTOR_SERVIDOR=') { $_ -replace '/facylf_canonico[_\d]*(?=$|\?)', "/$BaseNueva" } else { $_ }
    }
    $lineasEnv | Set-Content (Join-Path $raiz '.env') -Encoding utf8
    Anota "la web apuntará a $BaseNueva; se reinicia"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'tmp\sirve-web-servidor.ps1' | Out-Null
    Start-Sleep -Seconds 10
    try {
      $codigo = (Invoke-WebRequest -Uri 'http://127.0.0.1:3001/explorar/competicion/44/jornadas' -UseBasicParsing -TimeoutSec 90).StatusCode
      Anota "web local: $codigo"
      if ($codigo -ne 200) { throw 'la web no responde 200 con la base nueva' }
    } catch { throw ("la web no responde con la base nueva: " + $_.Exception.Message) }
  }
  Anota 'PUBLICACIÓN COMPLETA'
} catch {
  Anota ("ABORTADO: " + $_.Exception.Message)
  throw
} finally {
  foreach ($t in $habilitadasAntes) {
    try { Enable-ScheduledTask -TaskName $t -ErrorAction Stop | Out-Null; Anota "tarea devuelta a su estado: $t" } catch { Anota "NO se pudo rehabilitar ${t}: $($_.Exception.Message)" }
  }
  Anota 'fin'
}
