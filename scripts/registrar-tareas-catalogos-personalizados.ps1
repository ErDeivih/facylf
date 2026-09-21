$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot
$ejecutor = Join-Path $PSScriptRoot 'ejecutar-sondeo-isquad.ps1'
$lanzadorOculto = Join-Path $PSScriptRoot 'ejecutar-oculto.vbs'
$usuario = "$env:USERDOMAIN\$env:USERNAME"

if (-not (Test-Path -LiteralPath $ejecutor)) {
    throw "No se encuentra el ejecutor: $ejecutor"
}

$catalogos = @(
    @{ Federacion = 'madrid'; Hora = '6:25am'; Retraso = 'PT3M' },
    @{ Federacion = 'valencia'; Hora = '6:35am'; Retraso = 'PT4M' }
)

foreach ($catalogo in $catalogos) {
    $fed = $catalogo.Federacion
    $nombre = "FACyLF catalogo $fed"
    $argumentos = "`"$lanzadorOculto`" `"$ejecutor`" `"-Federacion`" `"$fed`""
    $accion = New-ScheduledTaskAction `
        -Execute "$env:SystemRoot\System32\wscript.exe" `
        -Argument $argumentos `
        -WorkingDirectory $raiz

    $disparadores = @(
        (New-ScheduledTaskTrigger -AtLogOn -User $usuario),
        (New-ScheduledTaskTrigger -Daily -At $catalogo.Hora)
    )
    $disparadores[0].Delay = $catalogo.Retraso

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
        -Description "Actualiza el catalogo reanudable de $fed sin repetir temporadas historicas completas." `
        -Force | Out-Null

    Write-Host "Tarea '$nombre' registrada correctamente." -ForegroundColor Green
}

# Territoriales con adaptador de PORTAL (HTML público): sondeo respetuoso a ~10 s.
$portalEjecutor = Join-Path $PSScriptRoot 'ejecutar-sondeo-portal.ps1'
$portales = @(
    @{ Federacion = 'cataluna'; Hora = '6:45am'; Retraso = 'PT5M' },
    @{ Federacion = 'baleares'; Hora = '6:55am'; Retraso = 'PT6M' }
)
foreach ($catalogo in $portales) {
    $fed = $catalogo.Federacion
    $nombre = "FACyLF catalogo $fed"
    $argumentos = "`"$lanzadorOculto`" `"$portalEjecutor`" `"-Federacion`" `"$fed`""
    $accion = New-ScheduledTaskAction `
        -Execute "$env:SystemRoot\System32\wscript.exe" `
        -Argument $argumentos `
        -WorkingDirectory $raiz
    $disparadores = @(
        (New-ScheduledTaskTrigger -AtLogOn -User $usuario),
        (New-ScheduledTaskTrigger -Daily -At $catalogo.Hora)
    )
    $disparadores[0].Delay = $catalogo.Retraso
    $ajustes = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -MultipleInstances IgnoreNew -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 5) -ExecutionTimeLimit ([TimeSpan]::Zero)
    $principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $nombre -Action $accion -Trigger $disparadores `
        -Settings $ajustes -Principal $principal `
        -Description "Inventaria a ~10 s las páginas públicas de $fed respetando su robots.txt." `
        -Force | Out-Null
    Write-Host "Tarea '$nombre' registrada correctamente." -ForegroundColor Green
}

Write-Host ''
Write-Host 'Estado: Get-ScheduledTask -TaskName "FACyLF catalogo*" | Get-ScheduledTaskInfo'
Write-Host "Registros: $raiz\descargas-federacion-sondeo\*-isquad.log y *-portal.log"
