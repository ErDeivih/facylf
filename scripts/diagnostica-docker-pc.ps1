# ── ¿QUÉ TRAMO DE LA RUTA ES EL «PUNTO DE MONTAJE NO FIABLE»? (0x800701c0) ──────────────────────────────
#
# Docker Desktop no arranca en el PC y el error es de WSL, no de Docker:
#
#   No se pudo conectar el disco "C:\Users\David\AppData\Local\Docker\wsl\main\ext4.vhdx" a WSL2:
#   La ruta no se puede recorrer porque contiene un punto de montaje no confiable.
#   Código de error: Wsl/Service/RegisterDistro/MountDisk/0x800701c0
#
# `0x800701c0` es `ERROR_UNTRUSTED_MOUNT_POINT`: al recorrer la ruta, Windows encuentra un punto de reanálisis
# (una unión, un enlace simbólico o un punto de montaje de volumen) y WSL se niega a atravesarlo. Lo normal es
# que alguien haya movido `AppData\Local\Docker` —o una carpeta por encima— a otra unidad con una unión, o que
# haya quedado un punto de reanálisis huérfano de una instalación anterior.
#
# Esto SÓLO MIRA. Cambiar la ruta de los datos de Docker puede llevarse por delante sus volúmenes, y ahí dentro
# está la base canónica de este PC, así que primero hay que saber exactamente qué tramo es y de qué tipo.
#
# Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\diagnostica-docker-pc.ps1

$ErrorActionPreference = 'Continue'

Write-Host "════════════════════════════════════════════════════════════════════════════════"
Write-Host " 1 · TRAMO A TRAMO: ¿hay algún punto de reanálisis en la ruta?"
Write-Host "════════════════════════════════════════════════════════════════════════════════"
$destino = Join-Path $env:LOCALAPPDATA 'Docker\wsl\main'
Write-Host "ruta objetivo: $destino"
Write-Host ""

# Se recorre desde la raíz para saber QUÉ TRAMO es el problemático: no sirve decir «la ruta», porque el arreglo
# es distinto si la unión está en `Docker`, en `Local` o en el propio perfil del usuario.
$tramos = @()
$acumulado = ''
foreach ($parte in ($destino -split '\\')) {
  if ($parte -eq '') { continue }
  $acumulado = if ($acumulado -eq '') { "$parte\" } else { Join-Path $acumulado $parte }
  $tramos += $acumulado
}
foreach ($t in $tramos) {
  $item = Get-Item -LiteralPath $t -Force -ErrorAction SilentlyContinue
  if ($null -eq $item) { Write-Host ("  {0,-58} NO EXISTE" -f $t); continue }
  $esReparse = ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
  $marca = if ($esReparse) { '  <-- PUNTO DE REANÁLISIS' } else { '' }
  $tipo = if ($item.PSObject.Properties.Name -contains 'LinkType') { $item.LinkType } else { '' }
  $dest = if ($item.PSObject.Properties.Name -contains 'Target' -and $item.Target) { ($item.Target -join ',') } else { '' }
  Write-Host ("  {0,-58} {1}{2}" -f $t, $tipo, $marca)
  if ($dest) { Write-Host ("       apunta a: {0}" -f $dest) }
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════════════════════"
Write-Host " 2 · ¿QUÉ TIPO DE PUNTO DE REANÁLISIS ES? (fsutil)"
Write-Host "════════════════════════════════════════════════════════════════════════════════"
foreach ($t in $tramos) {
  $salida = & fsutil reparsepoint query "$t" 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  --- $t ---"
    $salida | Select-Object -First 8 | ForEach-Object { "    $_" }
  }
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════════════════════"
Write-Host " 3 · UNIONES Y ENLACES DENTRO DE AppData\Local"
Write-Host "════════════════════════════════════════════════════════════════════════════════"
# `dir /AL` es la forma más rápida de listar puntos de reanálisis de una carpeta entera.
& cmd /c "dir /AL `"$env:LOCALAPPDATA`" 2>nul" | Select-Object -First 25

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════════════════════"
Write-Host " 4 · ESTADO DE WSL Y DE SUS DISCOS"
Write-Host "════════════════════════════════════════════════════════════════════════════════"
& wsl --status 2>&1 | Select-Object -First 8
Write-Host "  --- distribuciones ---"
& wsl -l -v 2>&1 | Select-Object -First 10

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════════════════════"
Write-Host " 5 · ¿HAY ALGO MONTADO O SUSTITUIDO EN ESA RUTA? (subst y puntos de montaje)"
Write-Host "════════════════════════════════════════════════════════════════════════════════"
& subst 2>&1
Write-Host "  --- puntos de montaje de volumen ---"
& mountvol 2>&1 | Select-String -Pattern '\\\?\?\\Volume' -Context 0,1 | Select-Object -First 10

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════════════════════"
Write-Host " 6 · EL DISCO DE DOCKER: ¿ESTÁ AHÍ Y CUÁNTO OCUPA?"
Write-Host "════════════════════════════════════════════════════════════════════════════════"
if (Test-Path -LiteralPath $destino) {
  Get-ChildItem -LiteralPath $destino -Force | ForEach-Object {
    "  {0,-30} {1,12} MB   {2}" -f $_.Name, [math]::Round($_.Length / 1MB), $_.LastWriteTime
  }
} else {
  Write-Host "  no existe $destino"
}
Write-Host ""
Write-Host "  OJO: aquí dentro está el disco de Docker del PC, y en sus volúmenes vive la base canónica"
Write-Host "  (facylf-postgres). NO se borra esta carpeta: la base se perdería."
