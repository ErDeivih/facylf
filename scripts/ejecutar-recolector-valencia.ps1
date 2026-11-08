<#
  Supervisor del recolector de la Comunidad Valenciana.

  Es el equivalente de `ejecutar-recolector-programado.ps1`, pero para la plataforma iSquad, que
  se recorre por API JSON y por tanto NO abre Chrome. De ahí las dos diferencias: no hay perfil de
  navegador que limpiar y el proceso pesa mucho menos.

  Mantiene una sola instancia viva mientras haya sesión de Windows abierta y espera de forma
  inteligente cuando todo lo que queda está aplazado (jornadas de la temporada actual aún sin
  jugar), en vez de reintentar cada cinco minutos abriendo el navegador para nada.
#>

$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'entorno-flota.ps1')
$carpetaEstado = Join-Path $raiz 'descargas-valencia\recolector-local'
$registro = Join-Path $carpetaEstado 'worker-programado.log'
$recolector = Join-Path $raiz 'scripts\recolector-valencia.mjs'
$baseDatos = Join-Path $carpetaEstado 'cola-v2.sqlite'
$ayuda = Join-Path $PSScriptRoot 'proximo-trabajo.mjs'
$mutexNombre = 'Local\FACyLFRecolectorValencia'

New-Item -ItemType Directory -Path $carpetaEstado -Force | Out-Null

$mutex = [Threading.Mutex]::new($false, $mutexNombre)
$poseeMutex = $false

function Escribe-Registro([string] $mensaje) {
    $linea = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $mensaje"
    Add-Content -LiteralPath $registro -Value $linea -Encoding utf8
}

function Busca-RecolectorAjeno {
    # Consultar solo Node evita recorrer los numerosos procesos de Chrome que
    # mantienen los recolectores PNFG y que podía bloquear este supervisor.
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.ProcessId -ne $PID -and $_.Name -match '^node(\.exe)?$' -and
            $_.CommandLine -like '*recolector-valencia.mjs*arrancar*'
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
    if (-not $poseeMutex) {
        Escribe-Registro 'Ya existe un supervisor de Valencia; esta copia termina.'
        exit 0
    }

    if (-not (Test-Path -LiteralPath $recolector)) {
        throw "No se encuentra el recolector: $recolector"
    }

    $node = (Get-Command node.exe -ErrorAction Stop).Source
    Set-Location -LiteralPath $raiz
    Escribe-Registro 'Supervisor de Valencia iniciado.'

    while ($true) {
        $ajeno = Busca-RecolectorAjeno
        if ($ajeno) {
            Escribe-Registro "Ya hay un worker activo (PID $($ajeno.ProcessId)); se espera para no duplicarlo."
            Start-Sleep -Seconds 60
            continue
        }

        Escribe-Registro 'Arrancando o reanudando la ingesta de Valencia.'
        # Sin cmd /c: el supervisor ya está oculto y el hijo hereda esa consola oculta. Con ComSpec
        # se creaba un cmd.exe/conhost visible por cada worker.
        & $node $recolector arrancar *>> $registro
        $codigo = $LASTEXITCODE

        # Espera inteligente: si lo único que queda está aplazado a una fecha futura, o hay una
        # pausa preventiva en curso, se duerme hasta entonces. Mínimo 20 s (no martillear) y máximo
        # 1 hora, para no relanzar el proceso cada 20 s durante una pausa de 6 h.
        $espera = 300
        if ((Test-Path -LiteralPath $baseDatos) -and (Test-Path -LiteralPath $ayuda)) {
            $salida = (& $node $ayuda $baseDatos 2>$null | Select-Object -First 1)
            if ("$salida" -match '^\d+$') { $espera = [Math]::Max(20, [Math]::Min(3600, [int]$salida)) }
        }
        Escribe-Registro "El worker termino con codigo $codigo; siguiente intento en $espera s."
        Start-Sleep -Seconds $espera
    }
}
catch {
    Escribe-Registro "Error del supervisor: $($_.Exception.Message)"
    exit 1
}
finally {
    if ($poseeMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
