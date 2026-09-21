param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('baleares', 'cataluna', 'melilla')]
    [string]$Federacion
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$script = if ($Federacion -eq 'melilla') {
    Join-Path $PSScriptRoot 'sondeo-melilla.mjs'
} elseif ($Federacion -eq 'cataluna') {
    Join-Path $PSScriptRoot 'recolector-cataluna.mjs'
} else {
    Join-Path $PSScriptRoot 'sondeo-portal.mjs'
}
$carpeta = Join-Path $raiz 'descargas-federacion-sondeo'
$registro = Join-Path $carpeta "$Federacion-portal.log"

# Portales de las territoriales con adaptador propio (no pnfg ni iSquad).
$portales = @{
    baleares = 'https://www.ffib.es/Fed/'
    cataluna = 'https://www.fcf.cat/ca/competicio'
    melilla  = 'https://www.rfmf.es/pagina/index.php'
}

New-Item -ItemType Directory -Path $carpeta -Force | Out-Null
Set-Location -LiteralPath $raiz

function Escribe-Registro([string] $Mensaje) {
    # Escribir en el registro es INFORMATIVO: si otro proceso tiene el fichero abierto (una sesión
    # anterior que sigue viva, o alguien mirándolo con Get-Content), Add-Content lanza y, con
    # ErrorActionPreference='Stop', la excepción tumbaba la sesión entera sin decir por qué. Pasó tres
    # veces el 12/09/2026 con el descubrimiento de Cataluña: el trabajo se hacía y luego el script
    # moría al apuntar «Fin del sondeo». Ahora se reintenta y, si no se puede, se sigue sin registrar.
    for ($intento = 1; $intento -le 3; $intento++) {
        try {
            Add-Content -LiteralPath $registro -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Mensaje" `
                -Encoding utf8 -ErrorAction Stop
            return
        }
        catch {
            if ($intento -lt 3) { Start-Sleep -Milliseconds 700 }
        }
    }
}

try {
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $portal = $portales[$Federacion]
    # Una sola sesión por portal. Sin esta comprobación se lanzaban dos a la vez y las dos escriben su
    # salida en el MISMO registro con `>>`: la segunda no podía abrirlo y moría con «el proceso no
    # tiene acceso al archivo porque está siendo utilizado por otro proceso». Eso pasó cuatro veces el
    # 12/09/2026 con Cataluña, y el síntoma (código 1 sin explicación) parecía un fallo del portal.
    $nombreScript = Split-Path $script -Leaf
    $ajeno = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like "*$nombreScript*" } |
        Select-Object -First 1
    if ($ajeno) {
        Escribe-Registro "Ya hay una sesion de $Federacion en marcha (PID $($ajeno.ProcessId)); esta copia termina sin tocar nada."
        exit 0
    }
    Escribe-Registro "Inicio del sondeo de portal $Federacion ($portal)."
    # Ritmo respetuoso: ~10 s por página. El sondeo respeta el robots.txt de cada web y no
    # inventa rutas: solo inventaría lo que la web enlaza de verdad.
    $argumentos = if ($Federacion -eq 'melilla') {
        '--pausa-ms 10000 --reintento-dias 1'
    } elseif ($Federacion -eq 'cataluna') {
        'descubrir --min-ms 6000 --max-ms 8000 --max 200000'
    } else {
        "--nombre $Federacion --url `"$portal`" --pausa-ms 10000 --max 40"
    }
    $orden = "`"$node`" `"$script`" $argumentos >> `"$registro`" 2>&1"
    & $env:ComSpec /d /s /c $orden
    $codigo = $LASTEXITCODE
    # Cataluña: cada sesión de descubrimiento deja el catálogo más completo, así que se vuelca a la
    # cola común al terminar. Es idempotente y no abre ninguna conexión de red.
    if ($Federacion -eq 'cataluna') {
        $volcado = Join-Path $PSScriptRoot 'recolector-cataluna-datos.mjs'
        $ordenCola = "`"$node`" `"$volcado`" preparar >> `"$registro`" 2>&1"
        & $env:ComSpec /d /s /c $ordenCola
        Escribe-Registro "Catalogo de Cataluna volcado a la cola con codigo $LASTEXITCODE."
    }
    Escribe-Registro "Fin del sondeo de portal $Federacion con codigo $codigo."
    exit $codigo
}
catch {
    Escribe-Registro "Error del sondeo de portal: $($_.Exception.Message)"
    exit 1
}
