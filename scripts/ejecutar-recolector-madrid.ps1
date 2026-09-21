$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'entorno-flota.ps1')
$carpetaEstado = Join-Path $raiz 'descargas-madrid\recolector-local'
$registro = Join-Path $carpetaEstado 'worker-programado.log'
$recolector = Join-Path $raiz 'scripts\recolector-madrid.mjs'
$baseDatos = Join-Path $carpetaEstado 'cola-v2.sqlite'
$ayuda = Join-Path $PSScriptRoot 'proximo-trabajo.mjs'
$mutexNombre = 'Local\FACyLFRecolectorMadrid'

New-Item -ItemType Directory -Path $carpetaEstado -Force | Out-Null
$mutex = [Threading.Mutex]::new($false, $mutexNombre)
$poseeMutex = $false

function Escribe-Registro([string] $mensaje) {
    Add-Content -LiteralPath $registro -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $mensaje" -Encoding utf8
}

function Busca-RecolectorAjeno {
    # Consultar solo Node evita recorrer los numerosos procesos de Chrome que
    # mantienen los recolectores PNFG y que podía bloquear este supervisor.
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.ProcessId -ne $PID -and $_.Name -match '^node(\.exe)?$' -and
            $_.CommandLine -like '*recolector-madrid.mjs*arrancar*'
        } |
        Select-Object -First 1
}

try {
    try {
        $poseeMutex = $mutex.WaitOne(0)
    }
    catch [Threading.AbandonedMutexException] {
        # El propietario anterior terminó inesperadamente. Windows entrega el
        # mutex a esta instancia, por lo que podemos reanudar con seguridad.
        $poseeMutex = $true
        Escribe-Registro 'Se recupera un supervisor anterior interrumpido.'
    }
    if (-not $poseeMutex) { Escribe-Registro 'Ya existe un supervisor de Madrid; esta copia termina.'; exit 0 }
    if (-not (Test-Path -LiteralPath $recolector)) { throw "No se encuentra el recolector: $recolector" }

    $node = (Get-Command node.exe -ErrorAction Stop).Source
    Set-Location -LiteralPath $raiz
    Escribe-Registro 'Supervisor de Madrid iniciado.'
    while ($true) {
        $ajeno = Busca-RecolectorAjeno
        if ($ajeno) {
            Escribe-Registro "Ya hay un worker activo (PID $($ajeno.ProcessId)); se espera para no duplicarlo."
            Start-Sleep -Seconds 60
            continue
        }
        Escribe-Registro 'Arrancando o reanudando la ingesta de Madrid.'
        $orden = "`"$node`" `"$recolector`" arrancar >> `"$registro`" 2>&1"
        & $env:ComSpec /d /s /c $orden
        $codigo = $LASTEXITCODE
        $espera = 300
        if ((Test-Path -LiteralPath $baseDatos) -and (Test-Path -LiteralPath $ayuda)) {
            $salida = (& $node $ayuda $baseDatos 2>$null | Select-Object -First 1)
            if ("$salida" -match '^\d+$') { $espera = [Math]::Max(20, [Math]::Min(300, [int]$salida)) }
        }
        Escribe-Registro "El worker termino con codigo $codigo; siguiente intento en $espera s."
        Start-Sleep -Seconds $espera
    }
}
catch { Escribe-Registro "Error del supervisor: $($_.Exception.Message)"; exit 1 }
finally {
    if ($poseeMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
