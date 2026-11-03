# Ciclo de La Preferente → canónico (L2 + L3 + L4 + L5). Claude, 26-27/10/2026.
#
# Todas las federaciones (lo normal, una vez al día, fuera de las horas de David):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lapreferente\ciclo-lapreferente.ps1 -Todas
# Una federación y unas temporadas:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lapreferente\ciclo-lapreferente.ps1 `
#     -Federacion cataluna -Temporadas 2010-11,2011-12
#
# 1. a-externo.mjs: lo nuevo de la cola de lapreferente-federado → externo.lp_* (incremental, por tandas).
# 2. empareja.mjs: cada competición de LP con su grupo de la federación (por código o por equipos y marcadores),
#    partido a partido (acta provisional, 0054); marca reemplazada_por en las ediciones de LP que la federación ya cubre.
# 3. elige-fichas.mjs (-Todas): deja de pedir fichas de grupos cuya federación ya tiene las actas.
# 4. Por cada federación y temporada con competiciones «sin_contraparte»: cola-lp.mjs e importación con
#    FACYLF_ORIGEN=lapreferente (ediciones de LP, que se apartan solas cuando llega la federación).
# 5. vigia.mjs: resultados que LP tiene y la federación no, marcadores distintos, dudosos.
#
# Carga: Node con --max-old-space-size=1024 (la lectura va por tandas) y una temporada detrás de otra.
param(
  [string]$Federacion = '',
  [string[]]$Temporadas = @(),
  [switch]$Todas,
  [switch]$SoloEmparejar
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $raiz
$node = @('--no-warnings', '--max-old-space-size=1024')
if (-not $Todas -and -not $Federacion) { throw 'Usa -Todas, o -Federacion <codigo> [-Temporadas ...]' }

Write-Host '== 1. Cola de LP → externo' -ForegroundColor Cyan
& node @node scripts\lapreferente\a-externo.mjs
if ($LASTEXITCODE -ne 0) { throw 'a-externo.mjs falló' }

Write-Host '== 2. Emparejado' -ForegroundColor Cyan
if ($Todas) { & node @node scripts\lapreferente\empareja.mjs } else { & node @node scripts\lapreferente\empareja.mjs --federacion $Federacion }
if ($LASTEXITCODE -ne 0) { throw 'empareja.mjs falló' }
if ($SoloEmparejar) { exit 0 }

$trabajo = @()
if ($Todas) {
  Write-Host '== 3. Qué fichas merece la pena pedir' -ForegroundColor Cyan
  & node @node scripts\lapreferente\elige-fichas.mjs --escribe --cola
  if ($LASTEXITCODE -ne 0) { Write-Host '  elige-fichas.mjs falló; sigo' -ForegroundColor Yellow }
  foreach ($linea in @(& node @node scripts\lapreferente\cola-lp.mjs --pendientes)) {
    $partes = "$linea".Trim() -split '\s+'
    if ($partes.Count -ge 2) { $trabajo += , @($partes[0], $partes[1]) }
  }
} else {
  foreach ($t in $Temporadas) { $trabajo += , @($Federacion, $t) }
}

foreach ($par in $trabajo) {
  $f = $par[0]; $t = $par[1]
  Write-Host "== 4. $f $t" -ForegroundColor Cyan
  $salida = Join-Path $raiz "_traspaso\lapreferente\$f-$t.sqlite"
  $antes = if (Test-Path -LiteralPath $salida) { (Get-Item -LiteralPath $salida).LastWriteTimeUtc } else { [datetime]::MinValue }
  & node @node scripts\lapreferente\cola-lp.mjs --federacion $f --temporada $t
  if ($LASTEXITCODE -ne 0) { Write-Host "  cola-lp.mjs falló en $f $t; sigo con la siguiente" -ForegroundColor Yellow; continue }
  if (-not (Test-Path -LiteralPath $salida) -or (Get-Item -LiteralPath $salida).LastWriteTimeUtc -le $antes) { continue }
  $env:FACYLF_ORIGEN = 'lapreferente'
  try {
    & powershell -NoProfile -ExecutionPolicy Bypass -File scripts\importar-temporada.ps1 -Federacion $f -Temporada $t -Paquete $salida
  } finally { Remove-Item Env:FACYLF_ORIGEN -ErrorAction SilentlyContinue }
}

Write-Host '== 5. Vigía' -ForegroundColor Cyan
& node @node scripts\lapreferente\vigia.mjs
