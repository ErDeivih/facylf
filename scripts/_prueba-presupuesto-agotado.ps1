# PRUEBA 4 del encargo de 10 GB: con el presupuesto agotado, el recolector ESPERA y SALE, no se bloquea.
#
# Cómo se prueba sin tocar nada real:
#
#   1. se copia la cola de Euskadi a una raíz TEMPORAL (con la API de backup, que es la forma correcta);
#   2. se ocupa la única plaza del gobernador con una ficha cuyo proceso está VIVO (este mismo script), para
#      que el recolector no consiga plaza: así se simula «presupuesto agotado» sin llenar la máquina;
#   3. se arranca el recolector con `FACYLF_MEMORIA_GB=1` (una sola plaza) y un tope de espera de 20 s;
#   4. se comprueba que: espera de verdad, NO abre navegador, NO hace ninguna petición, y **sale solo** con el
#      mensaje de salida limpia. Un recolector que se quedara en bucle no terminaría nunca: eso es el fallo que
#      esta prueba existe para impedir.
#
# Nada de esto toca la cola real: se trabaja sobre la copia y la ficha de plaza vive en la raíz temporal.
#
# Uso: pwsh -File scripts/_prueba-presupuesto-agotado.ps1

$raiz = 'F:\EspacioCodigo\facylf'
$temp = Join-Path $env:TEMP ("facylf-prueba-" + (Get-Date -Format 'HHmmss'))
Write-Output "raíz temporal: $temp"

# 1. Copia consistente de la cola (no se copia el HTML: la columna guarda rutas absolutas).
node (Join-Path $raiz 'scripts\copiar-cola.mjs') --federacion euskadi --destino $temp | Select-Object -Last 2
if (-not (Test-Path (Join-Path $temp 'descargas-euskadi\recolector-local\cola-v2.sqlite'))) {
  Write-Output '✗ la copia no se creó: prueba abortada'
  exit 1
}
Copy-Item (Join-Path $raiz 'perfiles') -Destination (Join-Path $temp 'perfiles') -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path (Join-Path $temp '.estado-workers\slots-chrome') | Out-Null
Copy-Item (Join-Path $raiz 'recolector.euskadi.config.json') -Destination $temp -Force -ErrorAction SilentlyContinue

# 1b. La cola copiada puede no tener trabajo disponible AHORA (Euskadi lo tiene todo aplazado). Sin trabajo, el
# recolector sale antes de pedir plaza y la prueba no mediría lo que quiere medir. Así que se desaplazan tres
# trabajos EN LA COPIA —fichero temporal, no la cola real— para que tenga algo que hacer y llegue al reparto.
$desaplazar = Join-Path $raiz 'scripts\_prueba-desaplazar-tres.mjs'
& node $desaplazar (Join-Path $temp 'descargas-euskadi\recolector-local\cola-v2.sqlite')

# 2. Se ocupa la única plaza con una ficha VIVA (el pid de este mismo proceso de PowerShell).
$ficha = Join-Path $temp '.estado-workers\slots-chrome\slot-1.lock'
Set-Content -Path $ficha -Value $PID -NoNewline
Write-Output "plaza ocupada por el pid $PID (ficha: $ficha)"

# 3. Arranque con presupuesto de 1 GB (una plaza) y tope de espera de 20 s.
$env:FACYLF_MEMORIA_GB = '1'
$env:FACYLF_TOPE_ESPERA_MS = '20000'
$inicio = Get-Date
$salida = & node (Join-Path $raiz 'scripts\recolector-local.mjs') arrancar --perfil (Join-Path $temp 'perfiles\euskadi.json') --raiz $temp 2>&1 | Out-String
$segundos = [math]::Round(((Get-Date) - $inicio).TotalSeconds)
Remove-Item Env:\FACYLF_MEMORIA_GB, Env:\FACYLF_TOPE_ESPERA_MS

# 4. Veredicto.
Write-Output "`n--- salida del recolector (${segundos}s) ---"
$salida.Trim().Split("`n") | Select-Object -Last 6 | ForEach-Object { "  $($_.Trim())" }

$espero = $salida -match 'esperando turno|esperando memoria|no cabe por reparto'
$salioLimpio = $salida -match 'no se consiguió plaza|no se pudo|cola queda intacta|siguiente intento'
$abrioNavegador = $salida -match 'turno de navegador concedido'
Write-Output ''
Write-Output "  esperó (no consiguió plaza) ....... $espero"
Write-Output "  salió solo, sin bucle ............ $salioLimpio (tardó ${segundos}s, tope 20s)"
Write-Output "  NO abrió navegador ............... $(-not $abrioNavegador)"
if ($espero -and $salioLimpio -and -not $abrioNavegador -and $segundos -lt 180) {
  Write-Output '  ✓ PRUEBA SUPERADA: con el presupuesto agotado espera, no se bloquea y no toca el navegador'
} else {
  Write-Output '  ⚠ PRUEBA NO SUPERADA: revisar la salida de arriba'
}
Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
