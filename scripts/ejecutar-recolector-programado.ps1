param(
    # Si se indica una federación con perfil en perfiles/, supervisa ESE recolector con su
    # perfil y su carpeta propia. Sin esto, supervisa Castilla y León (comportamiento original).
    [string]$Federacion = ''
)

$ErrorActionPreference = 'Stop'

# Supervisor local del recolector. Se ejecuta desde el Programador de tareas y mantiene una
# sola instancia viva de UNA federación mientras haya una sesión de Windows abierta. Cada
# federación usa su propio mutex, carpeta, perfil de Chrome y registro, por eso pueden correr
# en paralelo sin pisarse.
$raiz = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'entorno-flota.ps1')

if ($Federacion) {
    $carpetaEstado = Join-Path $raiz "descargas-$Federacion\recolector-local"
    $perfilJson    = Join-Path $raiz "perfiles\$Federacion.json"
    $mutexNombre   = "Local\FACyLFRecolector_$Federacion"
} else {
    $carpetaEstado = Join-Path $raiz 'descargas-federacion\recolector-local'
    $perfilJson    = $null
    $mutexNombre   = 'Local\FACyLFRecolectorProgramado'
}

$registro    = Join-Path $carpetaEstado 'worker-programado.log'
$recolector  = Join-Path $raiz 'scripts\recolector-local.mjs'
$perfilChrome = Join-Path $carpetaEstado 'perfil-chrome'

New-Item -ItemType Directory -Path $carpetaEstado -Force | Out-Null

$mutex = [Threading.Mutex]::new($false, $mutexNombre)
$poseeMutex = $false

function Escribe-Registro([string] $mensaje) {
    $linea = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $mensaje"
    Add-Content -LiteralPath $registro -Value $linea -Encoding utf8
}

function Busca-RecolectorAjeno {
    # Sólo cuenta como "ajeño" un worker de ESTA federación (mismo perfil). Así, varios
    # supervisores de federaciones distintas corren a la vez sin verse entre sí.
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $esNode = $_.ProcessId -ne $PID -and $_.Name -match '^node(\.exe)?$'
            if (-not $esNode) { return $false }
            if (-not ($_.CommandLine -like '*recolector-local.mjs*arrancar*')) { return $false }
            if ($Federacion) {
                return ($_.CommandLine -like "*perfiles\$Federacion.json*")
            } else {
                return ($_.CommandLine -notlike '*--perfil*')
            }
        } |
        Select-Object -First 1
}

function Limpia-NavegadorHuerfano {
    $huerfanos = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine.Contains($perfilChrome) }
    foreach ($proceso in $huerfanos) {
        Stop-Process -Id $proceso.ProcessId -Force -ErrorAction SilentlyContinue
    }
    if ($huerfanos) {
        Escribe-Registro "Se cerraron $(@($huerfanos).Count) procesos huerfanos del navegador del recolector."
        Start-Sleep -Seconds 2
    }
}

function Limpia-CacheNavegador {
    # El perfil conserva cookies y estado necesarios, pero no las cachés recreables. Con semanas de
    # ejecución estas carpetas llegan a ocupar gigabytes y Defender vuelve a examinarlas sin aportar
    # nada a la ingesta. Sólo se llama con el Chrome de esta federación ya cerrado.
    $rutasCache = @(
        (Join-Path $perfilChrome 'Default\Cache'),
        (Join-Path $perfilChrome 'Default\Code Cache'),
        (Join-Path $perfilChrome 'Default\GPUCache'),
        (Join-Path $perfilChrome 'GrShaderCache'),
        (Join-Path $perfilChrome 'ShaderCache')
    )
    foreach ($rutaCache in $rutasCache) {
        if ($rutaCache.StartsWith($perfilChrome, [StringComparison]::OrdinalIgnoreCase) -and
            (Test-Path -LiteralPath $rutaCache)) {
            Remove-Item -LiteralPath $rutaCache -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

try {
    $poseeMutex = $mutex.WaitOne(0)
    if (-not $poseeMutex) {
        Escribe-Registro 'Ya existe un supervisor de esta federacion; esta copia termina.'
        exit 0
    }

    if (-not (Test-Path -LiteralPath $recolector)) {
        throw "No se encuentra el recolector: $recolector"
    }
    if ($Federacion -and -not (Test-Path -LiteralPath $perfilJson)) {
        throw "No se encuentra el perfil: $perfilJson"
    }

    $node = (Get-Command node.exe -ErrorAction Stop).Source
    Set-Location -LiteralPath $raiz
    Escribe-Registro "Supervisor iniciado ($(if ($Federacion) {"federacion $Federacion"} else {"Castilla y Leon"})) ."

    while ($true) {
        $ajeno = Busca-RecolectorAjeno
        if ($ajeno) {
            Escribe-Registro "Ya hay un worker activo (PID $($ajeno.ProcessId)); se espera para no duplicarlo."
            Start-Sleep -Seconds 60
            continue
        }

        Limpia-NavegadorHuerfano
        Limpia-CacheNavegador
        Escribe-Registro 'Arrancando o reanudando la ingesta.'
        $argumentos = @($recolector, 'arrancar')
        if ($Federacion) { $argumentos += @('--perfil', $perfilJson) }
        # Sin cmd /c: el supervisor ya corre oculto y el hijo hereda esa consola oculta. Si se pasa por
        # `$env:ComSpec` se crea un cmd.exe/conhost visible por cada worker (visto 07/11/2026).
        & $node @argumentos *>> $registro
        $codigo = $LASTEXITCODE
        # Espera inteligente: cuando el único trabajo que queda está aplazado a una fecha futura
        # (jornadas de la temporada actual aún sin jugar), o cuando hay una pausa preventiva en
        # curso, se espera hasta ese momento en vez de 5 minutos fijos. Mínimo 20 s (no martillear)
        # y máximo 1 hora: una pausa de 6 h se duerme en tramos de 1 h y se reanuda puntual, en vez
        # de relanzar el proceso cada 20 s sin hacer nada.
        $espera = 300
        $baseDatos = Join-Path $carpetaEstado 'cola-v2.sqlite'
        $ayuda = Join-Path $PSScriptRoot 'proximo-trabajo.mjs'
        if ((Test-Path -LiteralPath $baseDatos) -and (Test-Path -LiteralPath $ayuda)) {
            # El cálculo del próximo trabajo puede quedarse esperando un lock de SQLite (visto 06/11/2026:
            # el supervisor quedaba colgado aquí y no arrancaba el worker). Se le pone un techo y, si no
            # contesta, se vuelve a los 300 s en vez de bloquear la federación.
            $trabajo = Start-Job -ScriptBlock {
                param($nodo, $script, $db)
                & $nodo $script $db 2>$null
            } -ArgumentList $node, $ayuda, $baseDatos
            if (Wait-Job $trabajo -Timeout 20) {
                $salida = Receive-Job $trabajo | Select-Object -First 1
            } else {
                Stop-Job $trabajo -ErrorAction SilentlyContinue
                $salida = ''
                Escribe-Registro 'El cálculo del próximo trabajo no respondió en 20 s; se usa la espera de 300 s.'
            }
            Remove-Job $trabajo -Force -ErrorAction SilentlyContinue
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
