<#
  Lleva al servidor el CODIGO de los recolectores (scripts/ y perfiles/) y comprueba que los contenedores lo ven.

  Desde el 07/10/2026 docker/compose.yml monta ../scripts y ../perfiles de /srv/data/facylf dentro de cada
  recolector (solo lectura). Desplegar ya no es `docker cp` (se pierde al recrear el contenedor) ni reconstruir la
  imagen: es copiar estas dos carpetas y reiniciar los recolectores.

  ESCRIBE en el servidor: se lanza a mano.
  Uso:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\despliega-codigo-servidor.ps1            (copia y comprueba)
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\despliega-codigo-servidor.ps1 -SoloComprobar
  ASCII a proposito (PowerShell 5.1).
#>
param([switch]$SoloComprobar)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$destino = '/srv/data/facylf'
$claves = @('scripts/recolector-local.mjs', 'scripts/lib/recolector-local.mjs', 'scripts/recolector-valencia.mjs', 'scripts/lib/temporadas-asignadas.mjs', 'scripts/lib/tiempos-navegador.mjs')

if (-not $SoloComprobar) {
  # Un tar evita copiar fichero a fichero (960 ficheros) y conserva la estructura; se descomprime encima.
  $tar = Join-Path $env:TEMP 'facylf-codigo.tar'
  & tar -cf $tar scripts perfiles
  if ($LASTEXITCODE -ne 0) { throw 'no se pudo empaquetar scripts/ y perfiles/' }
  & scp -o BatchMode=yes $tar "servidor:/tmp/facylf-codigo.tar"
  if ($LASTEXITCODE -ne 0) { throw 'scp fallo' }
  & ssh -o BatchMode=yes servidor "cd $destino && tar -xf /tmp/facylf-codigo.tar && rm -f /tmp/facylf-codigo.tar && echo copiado"
}

"=== huellas: PC / repositorio del servidor / dentro del contenedor federacion ==="
foreach ($f in $claves) {
  $pc = (Get-FileHash -Algorithm SHA256 $f).Hash.ToLower()
  $srv = (& ssh -o BatchMode=yes servidor "sha256sum $destino/$f | cut -c1-64").Trim()
  $ctr = (& ssh -o BatchMode=yes servidor "docker exec facylf-federacion-1 sha256sum /app/$f | cut -c1-64").Trim()
  $ok = if ($pc -eq $srv -and $srv -eq $ctr) { 'OK' } elseif ($pc -eq $srv) { 'REPO OK, CONTENEDOR NO (falta recrear con el compose nuevo)' } else { 'DISTINTO' }
  "{0,-40} {1}" -f $f, $ok
}
"Si el contenedor no coincide: copiar docker/compose.yml y 'docker compose ... up -d' (una vez); despues basta 'docker compose ... restart'."
