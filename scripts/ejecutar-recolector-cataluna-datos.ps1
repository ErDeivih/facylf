# Captura de datos de Cataluña (FCF): calendario, clasificación y actas de los grupos ya descubiertos.
#
# Es un supervisor, igual que el de las demás federaciones: arranca el worker, espera a que termine su
# tanda y lo vuelve a arrancar. Cada tanda recicla el navegador (que en este portal es pesado) para
# contener la memoria, así que el bucle es la forma natural de que la recolección no se pare.
#
# Un mutex evita que dos supervisores trabajen a la vez, y antes de arrancar se comprueba que no haya
# ya un worker vivo (por ejemplo, lanzado a mano para probar).
param(
    [int]$Max = 400,
    [int]$MinMs = 6000,
    [int]$MaxMs = 8000
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$raiz = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'entorno-flota.ps1')
$carpeta = Join-Path $raiz 'descargas-cataluna\recolector-local'
$registro = Join-Path $carpeta 'worker-programado.log'
$recolector = Join-Path $PSScriptRoot 'recolector-cataluna-datos.mjs'
$baseDatos = Join-Path $carpeta 'cola-v2.sqlite'
$mutexNombre = 'Local\FACyLFRecolectorCataluna'

New-Item -ItemType Directory -Path $carpeta -Force | Out-Null
$mutex = [Threading.Mutex]::new($false, $mutexNombre)
$poseeMutex = $false

function Escribe-Registro([string] $mensaje) {
    Add-Content -LiteralPath $registro -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $mensaje" -Encoding utf8
}

function Busca-WorkerAjeno {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.ProcessId -ne $PID -and
            $_.CommandLine -like '*recolector-cataluna-datos.mjs*' -and
            $_.CommandLine -like '*arrancar*'
        } |
        Select-Object -First 1
}

# Si Windows o el worker se interrumpen entre Selenium y driver.quit(), Chrome puede
# sobrevivir sin chromedriver. Esas sesiones no hacen peticiones pero conservan cientos
# de MB. Sólo se eliminan raíces headless inequívocamente creadas por este adaptador;
# no se toca Chrome de usuario ni ningún otro navegador.
function Limpia-ChromeCatalunaHuerfano {
    $procesos = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    $porId = @{}
    foreach ($proceso in $procesos) { $porId[[int]$proceso.ProcessId] = $proceso }

    function Descendientes([int] $id) {
        foreach ($hijo in @($procesos | Where-Object { [int]$_.ParentProcessId -eq $id })) {
            Descendientes ([int]$hijo.ProcessId)
            [int]$hijo.ProcessId
        }
    }

    $limpiados = 0
    foreach ($raizChrome in @($procesos | Where-Object {
        $_.Name -eq 'chrome.exe' -and
        $_.CommandLine -like '*FacylfBot*' -and
        $_.CommandLine -like '*--lang=ca-ES*' -and
        -not $porId.ContainsKey([int]$_.ParentProcessId)
    })) {
        $ids = @(Descendientes ([int]$raizChrome.ProcessId)) + @([int]$raizChrome.ProcessId)
        foreach ($id in $ids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
        $limpiados += $ids.Count
    }
    if ($limpiados -gt 0) { Escribe-Registro "Se retiraron $limpiados procesos Chrome huérfanos de Cataluña." }
}

try {
    try { $poseeMutex = $mutex.WaitOne(0) }
    catch [Threading.AbandonedMutexException] {
        $poseeMutex = $true
        Escribe-Registro 'Se recupera un supervisor anterior interrumpido.'
    }
    if (-not $poseeMutex) { Escribe-Registro 'Ya hay un supervisor de Cataluña; esta copia termina.'; exit 0 }
    if (-not (Test-Path -LiteralPath $recolector)) { throw "No se encuentra el recolector: $recolector" }

    $node = (Get-Command node.exe -ErrorAction Stop).Source
    Set-Location -LiteralPath $raiz
    Escribe-Registro "Supervisor de datos de Cataluña iniciado (tandas de $Max trabajos)."
    while ($true) {
        $ajeno = Busca-WorkerAjeno
        if ($ajeno) {
            Escribe-Registro "Ya hay un worker activo (PID $($ajeno.ProcessId)); se espera para no duplicarlo."
            Start-Sleep -Seconds 60
            continue
        }
        Limpia-ChromeCatalunaHuerfano
        Escribe-Registro 'Arrancando la captura de datos.'
        # Antes de cada tanda se vuelca el catálogo descubierto a la cola: es local, idempotente y así
        # los grupos que el descubridor va resolviendo entran en la cola sin esperar a que termine su
        # sesión (que puede durar horas).
        $volcado = "`"$node`" `"$recolector`" preparar >> `"$registro`" 2>&1"
        & $env:ComSpec /d /s /c $volcado
        $orden = "`"$node`" `"$recolector`" arrancar --max $Max --min-ms $MinMs --max-ms $MaxMs >> `"$registro`" 2>&1"
        & $env:ComSpec /d /s /c $orden
        $codigo = $LASTEXITCODE
        # Si la cola se queda sin trabajo (o todo está aplazado), se da una vuelta larga antes de
        # volver a mirar: no tiene sentido abrir un navegador cada minuto para no hacer nada.
        $espera = 60
        $detalle = ''
        $contador = Join-Path $PSScriptRoot 'contar-pendientes.mjs'
        if ((Test-Path -LiteralPath $baseDatos) -and (Test-Path -LiteralPath $contador)) {
            $pendientes = & $node $contador $baseDatos 2>$null
            if ("$pendientes" -match '^\d+$') {
                if ([int]$pendientes -eq 0) { $espera = 1800; $detalle = ' (sin trabajos pendientes)' }
                else { $espera = 20; $detalle = " ($pendientes pendientes)" }
            }
        }
        Escribe-Registro "La captura terminó con código $codigo; siguiente vuelta en $espera s$detalle."
        Start-Sleep -Seconds $espera
    }
}
catch { Escribe-Registro "Error del supervisor: $($_.Exception.Message)"; exit 1 }
finally {
    if ($poseeMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
