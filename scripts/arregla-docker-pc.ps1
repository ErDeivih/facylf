# ── ARREGLA EL DOCKER DEL PC: LA UNIÓN QUE WSL NO QUIERE ATRAVESAR (01/10/2026) ──────────────────────────
#
# El problema, medido:
#
#   · Docker Desktop 4.37 no arranca: `0x800701c0` (ERROR_UNTRUSTED_MOUNT_POINT) al importar su distribución
#     de WSL. WSL se niega a recorrer la ruta `%LOCALAPPDATA%\Docker\wsl`, que es una UNIÓN a `D:\DockerData\wsl`
#     (creada el 24/09/2026 a las 23:24 para liberar C:).
#   · Las distribuciones `docker-desktop` y `docker-desktop-data` NO están registradas en WSL, así que Docker
#     tiene que importarlas, y ahí es donde tropieza. Mientras existieron, la unión era una mina sin detonar.
#   · El disco de datos está intacto: `D:\DockerData\wsl\disk\docker_data.vhdx`, 67 GB. Ahí dentro está la base
#     canónica del PC (la que leen los informes), así que esto NO es un arreglo cualquiera.
#
# El ajuste que hay que cambiar se sacó del propio Docker, no de la documentación: en la respuesta de
# `/app/settings` que él mismo escribe en su registro aparece
#
#   "customWslDistroDir": "C:\\Users\\David\\AppData\\Local\\Docker\\wsl"
#   "dataFolder":         "C:\\ProgramData\\DockerDesktop\\vm-data"
#
# y `disk\docker_data.vhdx` cuelga de `customWslDistroDir`. Es decir: apuntando `customWslDistroDir` a
# `D:\DockerData\wsl` —donde los datos YA están— Docker deja de necesitar la unión y no hay que mover ni un byte.
#
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\arregla-docker-pc.ps1            (sólo enseña)
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\arregla-docker-pc.ps1 -Aplicar   (lo hace)

param([switch]$Aplicar)

$ErrorActionPreference = 'Stop'
$wslDir     = Join-Path $env:LOCALAPPDATA 'Docker\wsl'
$origen     = 'D:\DockerData\wsl'
$vhdx       = Join-Path $origen 'disk\docker_data.vhdx'
$copia      = 'D:\facylf-copias\docker_data.vhdx'
$ajustes    = Join-Path $env:APPDATA 'Docker\settings-store.json'

function Dato([string]$t) { Write-Host "  $t" }

Write-Host "════════════════════════════════════════════════════════════════════════════════"
Write-Host " 1 · COMPROBACIONES PREVIAS (si alguna falla, no se toca nada)"
Write-Host "════════════════════════════════════════════════════════════════════════════════"
$fallos = 0

if (Test-Path -LiteralPath $vhdx) {
  $tam = (Get-Item -LiteralPath $vhdx).Length
  Dato "disco de datos en D:            OK  ($([math]::Round($tam/1GB,2)) GB)"
} else { Dato "disco de datos en D:            *** NO ESTA ***"; $fallos++ }

if (Test-Path -LiteralPath $copia) {
  $tamCopia = (Get-Item -LiteralPath $copia).Length
  if ((Test-Path -LiteralPath $vhdx) -and $tamCopia -eq (Get-Item -LiteralPath $vhdx).Length) {
    Dato "copia de seguridad verificada    OK  ($([math]::Round($tamCopia/1GB,2)) GB, mismo tamano)"
  } else { Dato "copia de seguridad:             *** TAMANO DISTINTO ***"; $fallos++ }
} else { Dato "copia de seguridad:             *** NO EXISTE: no se sigue ***"; $fallos++ }

if (Test-Path -LiteralPath $ajustes) {
  $texto = Get-Content -LiteralPath $ajustes -Raw
  if ($texto -match 'customWslDistroDir') { Dato "ajuste customWslDistroDir:      ya existe en el fichero" }
  else { Dato "ajuste customWslDistroDir:      no esta (se anadira)" }
} else { Dato "ajustes de Docker:              *** NO ESTA $ajustes ***"; $fallos++ }

$item = Get-Item -LiteralPath $wslDir -Force -ErrorAction SilentlyContinue
if ($item -and (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) {
  $destinoUnion = ($item.Target -join ',')
  Dato "union a retirar:                $wslDir -> $destinoUnion"
  if ($destinoUnion -notlike "*DockerData*") { Dato "*** la union NO apunta a DockerData: parar ***"; $fallos++ }
} elseif (-not $item) { Dato "la union ya no esta:            (nada que retirar)" }
else { Dato "*** $wslDir no es una union: revisar a mano ***"; $fallos++ }

if ($fallos -gt 0) { Write-Host "`n  $fallos comprobacion(es) en rojo: NO se toca nada."; exit 1 }

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════════════════════"
Write-Host " 2 · LO QUE SE VA A HACER"
Write-Host "════════════════════════════════════════════════════════════════════════════════"
Dato "a) cerrar Docker Desktop (para que no reescriba sus ajustes despues)"
Dato "b) en settings-store.json: customWslDistroDir -> D:\DockerData\wsl"
Dato "c) retirar la union $wslDir  (solo el enlace; el contenido de D: no se toca)"
Dato "d) arrancar Docker Desktop y comprobar que ve sus contenedores y volumenes"
if (-not $Aplicar) {
  Write-Host "`n  Modo enseÑar: no se ha cambiado nada. Volver a lanzar con -Aplicar." -ForegroundColor Yellow
  exit 0
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════════════════════"
Write-Host " 3 · CERRAR DOCKER DESKTOP"
Write-Host "════════════════════════════════════════════════════════════════════════════════"
foreach ($p in @('Docker Desktop', 'com.docker.backend', 'com.docker.build', 'com.docker.dev-envs', 'com.docker.admin')) {
  Get-Process -Name $p -ErrorAction SilentlyContinue | ForEach-Object {
    try { $_.CloseMainWindow() | Out-Null } catch { }
  }
}
Start-Sleep -Seconds 5
Get-Process -Name 'com.docker.backend', 'Docker Desktop' -ErrorAction SilentlyContinue | ForEach-Object {
  Dato "forzando el cierre de $($_.Name) (pid $($_.Id))"
  try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch { }
}
Start-Sleep -Seconds 5
$vivos = Get-Process -Name 'com.docker.backend', 'Docker Desktop' -ErrorAction SilentlyContinue
if ($vivos) { Dato "*** sigue(n) vivo(s): $($vivos.Name -join ', ') ***" } else { Dato "Docker Desktop cerrado" }

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════════════════════"
Write-Host " 4 · EL AJUSTE (edicion por texto, para no reescribir el fichero entero)"
Write-Host "════════════════════════════════════════════════════════════════════════════════"
# ── EDICIÓN DEL JSON, SIN TEXTO A MANO ───────────────────────────────────────────────────────────────────
#
# El primer intento insertó la clave con `[regex]::Replace` y un literal `` `,\r`n `` mal escrito: metió un `\r`
# FUERA de las comillas, el JSON dejó de ser válido y la comprobación lo cazó y restauró el respaldo (que es
# justo para lo que está). Se hace con objetos y `ConvertTo-Json`: el fichero es plano, con diez claves simples,
# así que no hay nada que este camino pueda estropear; y se escribe en ASCII —no en UTF8— porque PowerShell 5.1
# añade una marca BOM al UTF8 y no hace falta arriesgarse a que el lector de Docker tropiece con ella.
Copy-Item -LiteralPath $ajustes -Destination "$ajustes.antes-de-docker-pc-$(Get-Date -Format yyyyMMdd-HHmm)" -Force
Dato "respaldo de los ajustes guardado"
$obj = Get-Content -LiteralPath $ajustes -Raw | ConvertFrom-Json
if ($obj.PSObject.Properties.Name -contains 'customWslDistroDir') {
  $obj.customWslDistroDir = $origen
  Dato "customWslDistroDir ya existia: valor sustituido por $origen"
} else {
  $obj | Add-Member -NotePropertyName 'customWslDistroDir' -NotePropertyValue $origen
  Dato "customWslDistroDir anadido con el valor $origen"
}
$jsonNuevo = $obj | ConvertTo-Json -Depth 10
Set-Content -LiteralPath $ajustes -Value $jsonNuevo -Encoding ASCII
try {
  $comprobado = Get-Content -LiteralPath $ajustes -Raw | ConvertFrom-Json
  Dato "el JSON sigue siendo valido; customWslDistroDir = $($comprobado.customWslDistroDir)"
} catch {
  Dato "*** el JSON quedo mal: restaurando el respaldo ***"
  Copy-Item -LiteralPath (Get-ChildItem "$ajustes.antes-de-docker-pc-*" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName -Destination $ajustes -Force
  exit 1
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════════════════════"
Write-Host " 5 · RETIRAR LA UNION (solo el enlace)"
Write-Host "════════════════════════════════════════════════════════════════════════════════"
# `cmd /c rmdir` retira el punto de unión y NO toca lo que hay al otro lado. `Remove-Item -Recurse` sobre una
# unión sí puede seguirla y borrar el contenido del destino: eso sería perder los 67 GB.
if (Test-Path -LiteralPath $wslDir) {
  & cmd /c "rmdir `"$wslDir`"" 2>&1 | ForEach-Object { Dato $_ }
}
if (Test-Path -LiteralPath $wslDir) { Dato "*** la union sigue ahi: parar y mirar ***"; exit 1 } else { Dato "union retirada" }
if (Test-Path -LiteralPath $vhdx) {
  Dato "y el disco de D: sigue en su sitio: $([math]::Round((Get-Item -LiteralPath $vhdx).Length/1GB,2)) GB"
} else { Dato "*** EL DISCO DE D: NO ESTA: restaurar desde la copia ***"; exit 1 }

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════════════════════"
Write-Host " 6 · ARRANCAR Y COMPROBAR"
Write-Host "════════════════════════════════════════════════════════════════════════════════"
Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
Dato "Docker Desktop lanzado; dandole tiempo (hasta 3 minutos)..."
$listo = $false
for ($i = 1; $i -le 18; $i++) {
  Start-Sleep -Seconds 10
  $salida = & docker ps -a --format '{{.Names}}  {{.Status}}' 2>&1
  if ($LASTEXITCODE -eq 0) { $listo = $true; break }
  Dato "  intento $i : el motor aun no responde"
}
if (-not $listo) {
  Dato "el motor no ha respondido. Mirar C:\Users\David\AppData\Local\Docker\log\host\com.docker.backend.exe.log"
  exit 1
}
Write-Host ""
Write-Host "=== contenedores que ve Docker ==="
& docker ps -a --format '{{.Names}}  {{.Status}}'
Write-Host ""
Write-Host "=== volumenes ==="
& docker volume ls
Write-Host ""
Write-Host "=== ¿esta el postgres del canonico del PC? ==="
& docker ps -a --filter name=facylf-postgres --format '{{.Names}}  {{.Status}}'
