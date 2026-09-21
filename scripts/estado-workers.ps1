$ErrorActionPreference = 'Stop'

# Resumen breve de todos los workers (tareas + colas + incidencias).
# Uso:  pwsh scripts/estado-workers.ps1   (o  pnpm workers:estado)

# Evita que la salida de Node (UTF-8) salga descodificada en consolas CP-850/437.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$raiz = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $raiz
$node = (Get-Command node.exe -ErrorAction Stop).Source
$helper = Join-Path $raiz 'scripts\estado-worker-db.mjs'

function Resumen-Carpeta([string]$carpeta) {
    $db = Join-Path $carpeta 'cola-v2.sqlite'
    if (-not (Test-Path -LiteralPath $db)) { return '  (sin base aun)' }
    $res = & $node $helper $db 2>$null
    return "  $res"
}

Write-Host '=== WORKERS (resumen) ==='

$feds = @(
    @{Nombre='Castilla y Leon'; Carpeta='descargas-federacion\recolector-local'},
    @{Nombre='Extremadura'; Carpeta='descargas-extremadura\recolector-local'},
    @{Nombre='Galicia'; Carpeta='descargas-galicia\recolector-local'},
    @{Nombre='La Rioja'; Carpeta='descargas-rioja\recolector-local'},
    @{Nombre='Asturias'; Carpeta='descargas-asturias\recolector-local'},
    @{Nombre='Aragon'; Carpeta='descargas-aragon\recolector-local'},
    @{Nombre='Cantabria'; Carpeta='descargas-cantabria\recolector-local'},
    @{Nombre='Navarra'; Carpeta='descargas-navarra\recolector-local'},
    @{Nombre='Euskadi'; Carpeta='descargas-euskadi\recolector-local'},
    @{Nombre='Castilla-La Mancha'; Carpeta='descargas-castilla-la-mancha\recolector-local'},
    @{Nombre='Andalucia'; Carpeta='descargas-andalucia\recolector-local'},
    @{Nombre='Murcia'; Carpeta='descargas-murcia\recolector-local'},
    @{Nombre='Canarias'; Carpeta='descargas-canarias\recolector-local'},
    @{Nombre='Ceuta'; Carpeta='descargas-ceuta\recolector-local'}
)

foreach ($f in $feds) {
    Write-Host "`n### $($f.Nombre)"
    $carpeta = Join-Path $raiz $f.Carpeta
    Write-Host (Resumen-Carpeta $carpeta)
    $log = Join-Path $carpeta 'worker-programado.log'
    if (Test-Path -LiteralPath $log) {
        $linea = Get-Content -LiteralPath $log -Tail 1 -ErrorAction SilentlyContinue
        if ($linea) { Write-Host "  log: $linea" }
    }
}

Write-Host "`n=== TAREAS ==="
Get-ScheduledTask | Where-Object { $_.TaskName -like 'FACyLF*' } |
    Select-Object TaskName, State | Format-Table -AutoSize
