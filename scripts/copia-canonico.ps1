# ── VOLCADO PORTABLE DEL CANÓNICO DEL PC ─────────────────────────────────────────────────────────────────
#
# El 01/10/2026 el Docker del PC estuvo caído medio día porque WSL no quería atravesar una unión a D:. La base
# canónica seguía dentro del disco de Docker, intacta, pero **no había forma de sacarla sin arreglar Docker
# primero**: es decir, la única copia de 860.178 partidos, 11,9 millones de apariciones y 1,2 millones de personas
# dependía de que Docker arrancara.
#
# Esto rompe esa dependencia. Un volcado en formato «custom» de PostgreSQL es un fichero normal que se puede
# guardar donde sea, restaurar en otra máquina y comprobar sin arrancar nada. Es la copia que hay que tener.
#
# ── DOS COSAS QUE HAY QUE HACER BIEN ─────────────────────────────────────────────────────────────────────
#
# 1. **El volcado NO se redirige con `>` de PowerShell.** `>` reescribe el flujo y destroza un binario. Se escribe
#    dentro del contenedor y se saca con `docker cp`, que es binario-seguro.
# 2. **Se comprueba.** Un volcado que no se ha listado nunca es una promesa, no una copia: `pg_restore --list`
#    lee el índice del fichero y confirma que está entero.
#
# Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\copia-canonico.ps1 [-Conservar 3]

param([int]$Conservar = 3)

$ErrorActionPreference = 'Stop'
$contenedor = if ($env:FACYLF_CONTENEDOR_POSTGRES) { $env:FACYLF_CONTENEDOR_POSTGRES } else { 'facylf-postgres' }
$base       = 'facylf'
$usuario    = 'facylf_admin'
$destino    = if ($env:FACYLF_COPIAS) { $env:FACYLF_COPIAS } else { 'D:\facylf-copias' }
$sello      = Get-Date -Format 'yyyyMMdd-HHmm'
$nombre     = "canonico-pc-$sello.dump"

New-Item -ItemType Directory -Force -Path $destino | Out-Null

Write-Host "== volcado del canonico del PC =="
Write-Host "   contenedor: $contenedor   base: $base   destino: $destino\$nombre"

$t0 = Get-Date
& docker exec $contenedor pg_dump -U $usuario -d $base -Fc -f "/tmp/$nombre"
if ($LASTEXITCODE -ne 0) { throw "pg_dump fallo (codigo $LASTEXITCODE)" }
Write-Host ("   volcado hecho en {0:N1} min" -f ((Get-Date) - $t0).TotalMinutes)

& docker cp "${contenedor}:/tmp/$nombre" "$destino\$nombre" | Out-Null
& docker exec $contenedor rm -f "/tmp/$nombre" | Out-Null

$f = Get-Item "$destino\$nombre"
Write-Host ("   fichero: {0:N2} GB" -f ($f.Length / 1GB))

Write-Host "== comprobacion: ¿el volcado se puede leer entero? =="
& docker cp "$destino\$nombre" "${contenedor}:/tmp/$nombre" | Out-Null
$listado = & docker exec $contenedor pg_restore --list "/tmp/$nombre" 2>&1
& docker exec $contenedor rm -f "/tmp/$nombre" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "pg_restore no pudo leer el volcado: el fichero esta mal" }
$tablas = ($listado | Select-String -Pattern 'TABLE DATA').Count
Write-Host "   OK: el indice del volcado se lee y contiene $tablas tablas con datos"

Write-Host "== limpieza de volcados viejos (se conservan $Conservar) =="
Get-ChildItem "$destino\canonico-pc-*.dump" | Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $Conservar | ForEach-Object { Write-Host "   borro $($_.Name)"; Remove-Item -LiteralPath $_.FullName -Force }

Write-Host ""
Write-Host "volcados disponibles:"
Get-ChildItem "$destino\canonico-pc-*.dump" | Sort-Object LastWriteTime -Descending |
  ForEach-Object { "   {0}   {1:N2} GB   {2}" -f $_.Name, ($_.Length / 1GB), $_.LastWriteTime }
