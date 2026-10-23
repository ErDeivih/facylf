<#
  Pasa federaciones del SERVIDOR al PC sin pedir dos veces lo mismo y sin perder trabajo hecho.

  Por que: el servidor (4 nucleos, 16 GB, colas en SSD pero archivo y perfiles en un disco duro de 5.400 rpm)
  va con la carga en 40-55; el PC tiene 12 nucleos. Peticion de David (09/10/2026): que el PC lleve mas.

  Lo que NO vale: arrancar en el PC con la cola que tiene el PC. Esas copias son de septiembre (el PC recogio
  todas las federaciones antes de repartirlas): repetiria semanas de actas ya descargadas. Hay que traer la cola
  VIVA del servidor, y para eso primero se para alli.

  Orden (cada paso comprueba el anterior; si algo falla, se para y no deja nada a medias):
    1. servidor: parar los contenedores de esas federaciones (y comprobar que estan parados);
    2. servidor: empaquetar su cola + -wal (desde el SSD, con -h por los enlaces) y calcular la huella;
    3. PC: traer el paquete y comprobar la huella;
    4. PC: por federacion, comprobar que la cola que llega trae MAS actas hechas que la del PC, apartar la del PC
       (base, -wal y -shm, como *.antes-<fecha>) e instalar la nueva; volver a contarla ya instalada;
    5. PC: quitar esas federaciones de FACYLF_EXCLUIR (scripts\entorno-flota.ps1);
    6. servidor: copiar docker/compose.yml (lleva profiles: ["recoge-en-pc"] para ellas: un `up -d` no las revive);
    7. PC: reiniciar el supervisor de la flota (scripts\reiniciar-flota.ps1).

  Sin -Aplicar solo ensena el plan y mide (no para nada). ESCRIBE en ambas maquinas con -Aplicar: se lanza a mano.
  Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\traspasa-federaciones-al-pc.ps1 -Federaciones andalucia,galicia [-Aplicar]
  ASCII a proposito (PowerShell 5.1).
#>
param(
  [Parameter(Mandatory = $true)][string[]]$Federaciones,
  [switch]$Aplicar
)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$compose = 'cd /srv/data/facylf && docker compose --project-name facylf --env-file docker/.env -f docker/compose.yml -f docker/compose-turnos.yml'
$sello = Get-Date -Format 'yyyyMMdd-HHmm'
$Federaciones = @($Federaciones | ForEach-Object { $_ -split ',' } | Where-Object { $_ } | ForEach-Object { $_.Trim() })
if ($Federaciones -contains 'federacion' -or $Federaciones -contains 'castilla-leon') { throw 'CyL se reparte por temporadas (temporadas-asignadas.txt), no se traspasa entera.' }

# Ojo PowerShell 5.1: (a) una funcion llamada como un ejecutable lo tapa (sin distinguir mayusculas): la antigua
# funcion de ssh se llamaba a si misma -> ParameterAlreadyBound 'orden'. Por eso los ejecutables van con .exe.
# (b) Con ErrorActionPreference=Stop, cualquier linea de stderr de un programa externo redirigida con 2>&1
# (p. ej. el progreso de `docker compose stop`) se vuelve NativeCommandError: se baja a Continue solo mientras
# corre el programa y se decide por el codigo de salida.
function Nativo([string]$exe, [string[]]$argumentos) {
  $eap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $r = @(& $exe @argumentos 2>&1 | ForEach-Object { "$_" }); $codigo = $LASTEXITCODE }
  finally { $ErrorActionPreference = $eap }
  if ($codigo -ne 0) { throw "$exe fallo ($codigo): $($argumentos -join ' ')`n$($r -join "`n")" }
  return $r
}
function EnServidor([string]$orden) { Nativo 'ssh.exe' @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'servidor', $orden) }
function Cuenta([string]$ruta) {
  $s = Nativo 'node.exe' @('--no-warnings', 'scripts\cuenta-cola.mjs', $ruta)
  $p = ($s -join '').Trim().Split('|'); return [pscustomobject]@{ Trabajos = [int]$p[0]; Hechas = [int]$p[1]; Pendientes = [int]$p[2] }
}

"== plan: $($Federaciones -join ', ') del servidor al PC =="
foreach ($f in $Federaciones) {
  if (-not (Test-Path "perfiles\$f.json")) { throw "falta perfiles\$f.json en el PC" }
  if (-not (Test-Path "recolector.$f.config.json")) { throw "falta recolector.$f.config.json en el PC" }
  $local = "descargas-$f\recolector-local\cola-v2.sqlite"
  if (Test-Path $local) { $c = Cuenta $local; "  {0,-20} PC (copia vieja): actas hechas {1}, pendientes {2}" -f $f, $c.Hechas, $c.Pendientes } else { "  {0,-20} PC: sin cola" -f $f }
  $estado = (EnServidor "docker inspect -f '{{.State.Status}}' facylf-$f-1 2>/dev/null || echo ausente") -join ' '
  "  {0,-20} servidor: contenedor $estado" -f $f
}
$vivos = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $cl = $_.CommandLine; $Federaciones | Where-Object { $cl -match "perfiles[\\/]$_\.json" } }
if ($vivos) { throw "Ya hay recolectores de estas federaciones en el PC (PID $($vivos.ProcessId -join ', ')): no se traspasa encima." }
if (-not $Aplicar) { "Sin -Aplicar: no se toca nada."; exit 0 }

"== 1. parar en el servidor =="
EnServidor "$compose stop $($Federaciones -join ' ')" | Out-Null
foreach ($f in $Federaciones) {
  $estado = ((EnServidor "docker inspect -f '{{.State.Running}}' facylf-$f-1 2>/dev/null || echo false") -join '').Trim()
  if ($estado -eq 'true') { throw "facylf-$f-1 sigue en marcha" }
  "  $f parado"
}

"== 2. empaquetar en el servidor =="
$tar = "/srv/ssd/facylf/traspaso-pc-$sello.tar"
$rutas = ($Federaciones | ForEach-Object { "srv/data/facylf/descargas-$_/recolector-local/cola-v2.sqlite"; "srv/data/facylf/descargas-$_/recolector-local/cola-v2.sqlite-wal" }) -join ' '
$huellaSrv = EnServidor "cd / && tar -h -cf $tar --ignore-failed-read $rutas 2>/dev/null; test -s $tar && sha256sum $tar"
$huellaSrv | Out-Host
$huellaSrv = (($huellaSrv -join ' ').Trim() -split '\s+')[0]
if ($huellaSrv -notmatch '^[0-9a-f]{64}$') { throw "el servidor no devolvio una huella sha256 valida: $huellaSrv" }

"== 3. traer al PC =="
New-Item -ItemType Directory -Force -Path _traspaso | Out-Null
$local = "_traspaso\traspaso-pc-$sello.tar"
Nativo 'scp.exe' @('-o', 'BatchMode=yes', "servidor:$tar", $local) | Out-Null
$huellaPc = (Get-FileHash -Algorithm SHA256 $local).Hash.ToLower()
if ($huellaPc -ne $huellaSrv) { throw "la huella no coincide (servidor $huellaSrv, PC $huellaPc): el servidor sigue parado; repetir el paso 3" }
"  huella OK"
$dir = "_traspaso\traspaso-pc-$sello"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Nativo 'tar.exe' @('-xf', $local, '-C', $dir) | Out-Null

"== 4. instalar en el PC =="
foreach ($f in $Federaciones) {
  $nueva = "$dir\srv\data\facylf\descargas-$f\recolector-local\cola-v2.sqlite"
  if (-not (Test-Path $nueva)) { throw "el paquete no trae la cola de $f" }
  $cNueva = Cuenta $nueva
  $base = "descargas-$f\recolector-local\cola-v2.sqlite"
  New-Item -ItemType Directory -Force -Path (Split-Path $base) | Out-Null
  if (Test-Path $base) {
    $cVieja = Cuenta $base
    if ($cNueva.Hechas -lt $cVieja.Hechas) { throw "$f : la cola del servidor trae MENOS actas hechas ($($cNueva.Hechas)) que la del PC ($($cVieja.Hechas)); no se instala" }
  }
  foreach ($s in @('', '-wal', '-shm')) { if (Test-Path "$base$s") { Move-Item "$base$s" "$base$s.antes-$sello" -Force } }
  Copy-Item $nueva $base -Force
  if (Test-Path "$nueva-wal") { Copy-Item "$nueva-wal" "$base-wal" -Force }
  $cInst = Cuenta $base
  if ($cInst.Hechas -ne $cNueva.Hechas) { throw "$f : la cola instalada no cuadra ($($cInst.Hechas) <> $($cNueva.Hechas))" }
  "  {0,-20} instalada: actas hechas {1}, pendientes {2}" -f $f, $cInst.Hechas, $cInst.Pendientes
}

"== 5. FACYLF_EXCLUIR del PC =="
$ef = 'scripts\entorno-flota.ps1'
$txt = [IO.File]::ReadAllText((Resolve-Path $ef))
$m = [regex]::Match($txt, "\`$env:FACYLF_EXCLUIR = '([^']*)'")
if (-not $m.Success) { throw "no encuentro la linea de FACYLF_EXCLUIR en $ef" }
$lista = @($m.Groups[1].Value.Split(',') | Where-Object { $_ -and ($Federaciones -notcontains $_) })
$txt = $txt.Replace($m.Value, "`$env:FACYLF_EXCLUIR = '$($lista -join ',')'")
[IO.File]::WriteAllText((Resolve-Path $ef), $txt, (New-Object System.Text.UTF8Encoding $false))
"  ahora excluye: $($lista -join ',')"

"== 6. compose al servidor (profiles recoge-en-pc) =="
Nativo 'scp.exe' @('-o', 'BatchMode=yes', 'docker\compose.yml', 'servidor:/srv/data/facylf/docker/compose.yml') | Out-Null
$perfiles = @(EnServidor "$compose config --services 2>/dev/null" | ForEach-Object { $_.Trim() })
foreach ($f in $Federaciones) { if ($perfiles -contains $f) { throw "$f sigue entre los servicios por defecto del compose del servidor: le falta profiles recoge-en-pc" } }
"  copiado; $($Federaciones -join ', ') ya no arrancan con un up -d general"

"== 7. reiniciar la flota del PC =="
Nativo 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts\reiniciar-flota.ps1') | Out-Host
""
"Hecho. Comprobar en 15 min (registros\supervisor-flota.log y estado\claude\pc.txt) que $($Federaciones -join ', ') piden desde el PC,"
"y en el servidor que facylf-<fed>-1 siguen parados. El paquete queda en $local (y en el servidor $tar) hasta comprobarlo."
