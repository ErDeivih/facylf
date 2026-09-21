param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('madrid', 'valencia')]
    [string]$Federacion
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$script = Join-Path $PSScriptRoot 'sondeo-isquad.mjs'
$carpeta = Join-Path $raiz 'descargas-federacion-sondeo'
$registro = Join-Path $carpeta "$Federacion-isquad.log"

New-Item -ItemType Directory -Path $carpeta -Force | Out-Null
Set-Location -LiteralPath $raiz

function Escribe-Registro([string] $Mensaje) {
    Add-Content -LiteralPath $registro `
        -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Mensaje" `
        -Encoding utf8
}

try {
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    Escribe-Registro "Inicio del catalogo $Federacion."
    # Las APIs iSquad de Madrid y Valencia responden en ~0,06-0,33 s y no declaran crawl-delay ni
    # robots restrictivo (Madrid: sin crawl-delay; Valencia: sin robots.txt), así que se usa una
    # pausa de 2-4 s.
    $orden = "`"$node`" `"$script`" --federacion $Federacion --pausa-min-ms 2000 --pausa-max-ms 4000 >> `"$registro`" 2>&1"
    & $env:ComSpec /d /s /c $orden
    $codigo = $LASTEXITCODE
    Escribe-Registro "Fin del catalogo $Federacion con codigo $codigo."
    exit $codigo
}
catch {
    Escribe-Registro "Error del catalogo: $($_.Exception.Message)"
    exit 1
}
