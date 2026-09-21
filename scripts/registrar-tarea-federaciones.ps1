param([string]$SoloFederacion = '')

$ErrorActionPreference = 'Stop'

# Registra los supervisores territoriales PNFG en el Programador de
# tareas, incluido Castilla y León. Cada federación es una tarea independiente,
# con su mutex/carpeta/perfil propios.
# Se ejecuta en la sesión interactiva porque Selenium utiliza Chrome.

$raiz = Split-Path -Parent $PSScriptRoot
$supervisor = Join-Path $PSScriptRoot 'ejecutar-recolector-programado.ps1'
$lanzadorOculto = Join-Path $PSScriptRoot 'ejecutar-oculto.vbs'
$usuario = "$env:USERDOMAIN\$env:USERNAME"

if (-not (Test-Path -LiteralPath $supervisor)) {
    throw "No se encuentra el supervisor: $supervisor"
}

$federaciones = @(
    'castilla-leon', 'extremadura', 'galicia', 'rioja', 'asturias', 'aragon', 'cantabria',
    'navarra', 'euskadi', 'castilla-la-mancha', 'andalucia', 'murcia', 'ceuta', 'canarias', 'baleares',
    'melilla'
)
if ($SoloFederacion) {
    if ($SoloFederacion -notin $federaciones) { throw "Federacion no configurada: $SoloFederacion" }
    $federaciones = @($SoloFederacion)
}

$indiceFederacion = 0
foreach ($fed in $federaciones) {
    $esCastillaLeon = $fed -eq 'castilla-leon'
    $nombre = if ($esCastillaLeon) { 'FACyLF recolector' } else { "FACyLF recolector $fed" }
    $perfilJson = if ($esCastillaLeon) { $null } else { Join-Path $raiz "perfiles\$fed.json" }

    if ($perfilJson -and -not (Test-Path -LiteralPath $perfilJson)) {
        Write-Warning "No se encuentra el perfil de '$fed' ($perfilJson); se omite."
        continue
    }

    $argumentos = "`"$lanzadorOculto`" `"$supervisor`""
    if (-not $esCastillaLeon) { $argumentos += " `"-Federacion`" `"$fed`"" }
    $accion = New-ScheduledTaskAction `
        -Execute "$env:SystemRoot\System32\wscript.exe" `
        -Argument $argumentos `
        -WorkingDirectory $raiz

    $disparadores = @(
        (New-ScheduledTaskTrigger -AtLogOn -User $usuario),
        (New-ScheduledTaskTrigger -Daily -At 6:05am)
    )
    # Inicio escalonado: evita abrir catorce Chromes en el mismo segundo tras iniciar sesión.
    $minutosRetraso = 2 + $indiceFederacion
    $disparadores[0].Delay = "PT${minutosRetraso}M"
    $indiceFederacion++

    $ajustes = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -MultipleInstances IgnoreNew `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 5) `
        -ExecutionTimeLimit ([TimeSpan]::Zero)

    $principal = New-ScheduledTaskPrincipal `
        -UserId $usuario `
        -LogonType Interactive `
        -RunLevel Limited

    Register-ScheduledTask `
        -TaskName $nombre `
        -Action $accion `
        -Trigger $disparadores `
        -Settings $ajustes `
        -Principal $principal `
        -Description "Reanuda la ingesta local de la federación $fed al iniciar sesión y conserva su cola SQLite." `
        -Force | Out-Null

    Write-Host "Tarea '$nombre' registrada correctamente." -ForegroundColor Green
}

Write-Host ''
Write-Host 'Estado:  Get-ScheduledTask | Where-Object TaskName -like "FACyLF*" | Get-ScheduledTaskInfo'
Write-Host "Registros: Get-Content '...\descargas-<fed>\recolector-local\worker-programado.log' -Tail 50 -Wait"
