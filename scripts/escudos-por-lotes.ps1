# escudos-por-lotes.ps1 -- extrae escudos y fotos en lotes de 50 ficheros.
#
# Por qué: una sola pasada acumulaba en memoria las fotos de miles de HTML (4 GB en un portátil).
# Cada invocación procesa 50, escribe y cierra la conexión; el candado del .mjs impide dos instancias.
#
# Uso:
#   powershell -File scripts\escudos-por-lotes.ps1 -Federacion castilla-leon -Lote 50
param(
  [string]$Federacion = 'castilla-leon',
  [int]$Lote = 50,
  [int]$MaxLotes = 20,
  [int]$Desde = 0
)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$raiz = (Get-Location).Path
$log = Join-Path $raiz 'estado\escudos-fotos-lotes.log'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $log) | Out-Null
$offset = $Desde
$total = $null
$lotes = 0
do {
  $salida = & node 'scripts\escudos-y-fotos-desde-html.mjs' --federacion $Federacion --desde $offset --limite $Lote 2>&1 | Out-String
  $codigo = $LASTEXITCODE
  Add-Content -LiteralPath $log -Encoding utf8 -Value ("{0} lote desde {1} (codigo {2})`n{3}" -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'), $offset, $codigo, $salida.TrimEnd())
  if ($codigo -ne 0) { break }
  if ($salida -match 'HTML archivados de [^:]+:\s*(\d+)') { $total = [int]$Matches[1] }
  if ($null -eq $total) { break }
  $offset += $Lote
  $lotes += 1
} while ($offset -lt $total -and $lotes -lt $MaxLotes)
Write-Output "lotes terminados: $offset de $total (registro en $log)"
