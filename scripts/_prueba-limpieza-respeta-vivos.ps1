# PRUEBA: la limpieza de Chrome distingue un navegador VIVO de un resto.
#
# Por qué existe. El 19/09/2026 la herramienta `limpiar-chrome-huerfano.ps1` clasificaba como huérfano TODO: 72 de
# 72 procesos con un `node` vivo por encima. La causa era un fallo de tipos de PowerShell —el diccionario de
# procesos estaba indexado por enteros y se consultaba con el `ProcessId`, que es un entero sin signo de 32 bits,
# así que ninguna búsqueda encontraba nada y la función «¿tiene un node vivo por encima?» contestaba siempre que
# no—. La tarea programada que la llama cada cinco minutos estaba matando, por tanto, los navegadores de los
# recolectores que estaban trabajando: en las colas se veía como
# `error_navegador: invalid session id: session deleted as the browser has closed the connection`, y cada pasada
# tiraba ~7 GB de navegadores vivos.
#
# Lo que comprueba, en las dos direcciones (una limpieza que no limpia nada también es un fallo):
#   1. con un navegador vivo colgando de un node, NO entra en la lista de huérfanos;
#   2. y sobrevive a una limpieza de verdad;
#   3. cuando ese node muere, el navegador SÍ se detecta como huérfano y la limpieza se lo lleva.
#
# Uso: powershell -NoProfile -File scripts/_prueba-limpieza-respeta-vivos.ps1 [-Federacion prueba-10gb]

param([string]$Federacion = 'prueba-10gb', [int]$EsperaSegundos = 90)

$raiz = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $raiz
$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

$fallos = 0
function Comprueba($nombre, $bien, $detalle) {
  if ($bien) { Write-Output "  OK    $nombre -- $detalle" } else { Write-Output "  FALLA $nombre -- $detalle"; $script:fallos += 1 }
}
function CuentaNavegadores($perfil) {
  return @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like "*$perfil*" }).Count
}
function ListaDeLaLimpieza {
  return (& $ps -NoProfile -File scripts\limpiar-chrome-huerfano.ps1 -Listar 2>&1 | Out-String)
}

Write-Output "=== la limpieza de Chrome distingue vivo de resto · $Federacion ==="

$carpeta = Join-Path $raiz "descargas-$Federacion\recolector-local"
$perfil = Join-Path $carpeta 'perfil-chrome'
if (-not (Test-Path $carpeta)) { Write-Output "  no existe $carpeta"; exit 2 }
New-Item -ItemType Directory -Force -Path $perfil | Out-Null

# Restos de esta misma prueba, si quedaron de una vuelta anterior.
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -like "*$perfil*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$navegador = $null
try {
  # Un navegador colgando de un node, igual que el de un worker de verdad.
  $navegador = Start-Process -FilePath 'node' -ArgumentList @('scripts/_prueba-abre-navegador.mjs', $perfil, '180') `
    -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $env:TEMP 'facylf-navegador-prueba.log')

  $vivos = 0
  for ($i = 0; $i -lt [Math]::Max(1, $EsperaSegundos / 3); $i++) {
    Start-Sleep -Seconds 3
    $vivos = CuentaNavegadores $perfil
    if ($vivos -gt 0) { break }
  }
  Comprueba 'el navegador de prueba queda abierto' ($vivos -gt 0) "$vivos proceso(s) de Chrome con ese perfil"

  if ($vivos -eq 0) {
    Write-Output "  (no se pudo abrir el navegador: se mira el registro $env:TEMP\facylf-navegador-prueba.log)"
    Get-Content (Join-Path $env:TEMP 'facylf-navegador-prueba.log') -Tail 5 -ErrorAction SilentlyContinue
  } else {
    # 1. ¿Lo cuenta como huérfano?
    $lista = ListaDeLaLimpieza
    $aparece = $lista -match [regex]::Escape("descargas-$Federacion\recolector-local\perfil-chrome")
    Comprueba 'no cuenta como huérfano el navegador de un worker vivo' (-not $aparece) `
      ($(if ($aparece) { 'lo incluye en la lista de huérfanos' } else { 'no aparece en la lista' }))

    # 2. ¿Sobrevive a una limpieza de verdad?
    & $ps -NoProfile -File scripts\limpiar-chrome-huerfano.ps1 2>&1 | Out-Null
    Start-Sleep -Seconds 5
    $siguen = CuentaNavegadores $perfil
    Comprueba 'el navegador del worker vivo sobrevive a la limpieza' ($siguen -gt 0) "$siguen proceso(s) en pie"

    # 3. Y cuando el worker muere, el navegador que deja SÍ se limpia (si no, la herramienta no limpia nada).
    if (-not $navegador.HasExited) { Stop-Process -Id $navegador.Id -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 5
    $trasMatar = CuentaNavegadores $perfil
    $listaTrasMatar = ListaDeLaLimpieza
    $apareceTrasMatar = $listaTrasMatar -match [regex]::Escape("descargas-$Federacion\recolector-local\perfil-chrome")
    Comprueba 'con el worker muerto, su navegador sí es un huérfano' ($trasMatar -eq 0 -or $apareceTrasMatar) `
      "$trasMatar proceso(s); en la lista: $apareceTrasMatar"
    if ($trasMatar -gt 0) {
      & $ps -NoProfile -File scripts\limpiar-chrome-huerfano.ps1 2>&1 | Out-Null
      Start-Sleep -Seconds 5
      $limpiados = CuentaNavegadores $perfil
      Comprueba 'y la limpieza se lo lleva' ($limpiados -eq 0) "$limpiados proceso(s) después de limpiar"
    }
  }
} finally {
  if ($navegador -and -not $navegador.HasExited) { Stop-Process -Id $navegador.Id -Force -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
    Where-Object { $_.CommandLine -like "*$perfil*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

if ($fallos -eq 0) { Write-Output "`n  TODO CORRECTO" } else { Write-Output "`n  FALLAN $fallos comprobacion(es)" }
exit $(if ($fallos -eq 0) { 0 } else { 1 })
