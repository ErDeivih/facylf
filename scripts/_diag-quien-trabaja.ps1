# ¿Cuántos recolectores están trabajando DE VERDAD, ahora mismo?
#
# No se puede contar por ventanas: cada recolector abre su Chrome fuera de pantalla y minimizado
# (`--window-position=-32000,-32000`, `--start-minimized`), así que sus ventanas no se ven en el escritorio.
# Se cuenta por lo que sí demuestra trabajo: proceso vivo + navegador propio abierto + registro fresco, y se
# distingue el que está ESPERANDO memoria del que está recolectando.
#
# Sólo lee. Uso: pwsh -File scripts/_diag-quien-trabaja.ps1

$procesos = @{}
foreach ($p in Get-CimInstance Win32_Process) { $procesos[[int]$p.ProcessId] = $p }

function NodeVivoPorEncima($desde) {
  $actual = $desde
  for ($i = 0; $i -lt 10; $i++) {
    $proc = $procesos[$actual]
    if (-not $proc) { return $false }
    $padre = [int]$proc.ParentProcessId
    if ($padre -le 0) { return $false }
    $padreProc = $procesos[$padre]
    if (-not $padreProc) { return $false }
    if ($padreProc.Name -eq 'node.exe') { return $true }
    $actual = $padre
  }
  return $false
}

$raiz = 'F:\EspacioCodigo\facylf'
$federaciones = Get-ChildItem $raiz -Directory -Filter 'descargas-*' |
  Where-Object { Test-Path (Join-Path $_.FullName 'recolector-local\worker-programado.log') }

$trabajando = @(); $esperando = @(); $parados = @(); $sinNavegador = @()

foreach ($f in $federaciones) {
  $nombre = $f.Name -replace '^descargas-', ''
  $log = Join-Path $f.FullName 'recolector-local\worker-programado.log'

  # ¿Tiene un navegador propio ABIERTO (Chrome con su perfil y con un node vivo por encima)?
  $perfil = Join-Path $f.FullName 'recolector-local\perfil-chrome'
  $chromeVivo = $false
  foreach ($c in $procesos.Values) {
    if ($c.Name -ne 'chrome.exe') { continue }
    if (-not $c.CommandLine -or -not $c.CommandLine.Contains($perfil)) { continue }
    if (NodeVivoPorEncima $c.ProcessId) { $chromeVivo = $true; break }
  }

  $ultima = (Get-Content $log -Tail 1 -ErrorAction SilentlyContinue)
  $minutos = [math]::Round(((Get-Date) - (Get-Item $log).LastWriteTime).TotalMinutes)

  if ($ultima -match 'esperando .* memoria libre') { $esperando += $nombre }
  elseif ($ultima -match 'codigo \d' -and $minutos -gt 5) { $parados += $nombre }
  elseif ($chromeVivo) { $trabajando += $nombre }
  else { $sinNavegador += $nombre }
}

"TRABAJANDO (navegador abierto y registro vivo): $($trabajando.Count) → $($trabajando -join ', ')"
"ESPERANDO MEMORIA:                            $($esperando.Count) → $($esperando -join ', ')"
"ENTRE SESIONES (terminó y volverá):           $($parados.Count) → $($parados -join ', ')"
"VIVOS SIN NAVEGADOR ABIERTO:                  $($sinNavegador.Count) → $($sinNavegador -join ', ')"
