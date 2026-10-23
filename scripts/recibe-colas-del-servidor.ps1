<#
  Instala en ESTE PC las colas que vienen del servidor, para las tres federaciones que vuelven a recogerse aquí.

  ── POR QUÉ HACE FALTA ESTE GUION Y NO VALE COPIAR Y YA ─────────────────────────────────────────────────────

  El 24/09/2026 Valencia, Madrid y Cataluña pasan a recogerse en el PC y el servidor se queda con las otras
  dieciséis. Antes de encender nada hay que traer el estado del trabajo: el servidor iba MUY por delante (medido:
  Valencia 47.743 actas hechas frente a 31.203 del PC; Madrid 26.529 frente a 19.873; Cataluña 8.450 frente a
  7.278), así que arrancar con la cola vieja del PC sería repetir unas 24.000 actas ya descargadas.

  ── LA TRAMPA: EL `-wal` Y EL `-shm` VIEJOS ─────────────────────────────────────────────────────────────────

  Una base SQLite en modo WAL no es un solo fichero. Si se reemplaza `cola-v2.sqlite` y se deja al lado el
  `-wal` de la base ANTERIOR, SQLite puede intentar aplicar ese diario sobre la base nueva: son páginas de otra
  base, y el resultado es corrupción. Lo mismo con un `-shm` obsoleto, que describe un estado que ya no existe.

  Por eso se apartan LOS TRES ficheros (base, `-wal` y `-shm`) con el sufijo `.antes-24sep`, y sólo entonces se
  copia la base nueva con su propio `-wal`. Se apartan en vez de borrarse: si algo saliera mal, la cola vieja
  sigue ahí y volver atrás es renombrar.

  ── LA COMPROBACIÓN DE QUE LA COPIA SIRVE ───────────────────────────────────────────────────────────────────

  No se usa `PRAGMA quick_check`: sobre una cola de 600 MB tarda 24 minutos (medido el 23/09/2026 al migrar al
  SSD). Lo que se comprueba es lo que de verdad importa —que la base se abre, que tiene las tablas esperadas y
  cuánto trabajo dice que hay—, y ese número se compara con el del servidor, que es la comprobación de verdad.

  Uso:  pwsh -File scripts\recibe-colas-del-servidor.ps1
#>
$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot
$origen = Join-Path $raiz '_traspaso'

# federación -> carpeta de datos (Castilla y León es la única cuyo directorio no se llama como la federación,
# pero aquí no aplica: las tres que vienen se llaman igual).
$federaciones = @(
    @{ Nombre = 'valencia'; Fichero = 'cola-valencia.sqlite' },
    @{ Nombre = 'madrid';   Fichero = 'cola-madrid.sqlite' },
    @{ Nombre = 'cataluna'; Fichero = 'cola-cataluna.sqlite' }
)

# ── 0. NINGÚN RECOLECTOR DE ESTAS TRES PUEDE ESTAR VIVO ─────────────────────────────────────────────────────
# Cambiar la cola con un worker leyéndola es la otra forma de romperlo. Las tareas están desactivadas, pero se
# comprueba en vez de suponerlo.
$vivos = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'recolector-(valencia|madrid|cataluna)' }
if ($vivos) {
    Write-Host 'Hay recolectores de estas tres federaciones en marcha; se para antes de tocar las colas:' -ForegroundColor Red
    $vivos | ForEach-Object { Write-Host "  PID $($_.ProcessId): $($_.CommandLine)" }
    throw 'Pare esos procesos y vuelva a lanzar el guion.'
}
Write-Host 'No hay ningún recolector de las tres en marcha. Correcto.' -ForegroundColor Green

function Cuenta-Colas([string] $ruta) {
    # Se cuenta con el ayudante `scripts/cuenta-cola.mjs`, NO con un `node -e` en línea: Windows PowerShell 5.1 no
    # escapa las comillas dobles al pasar argumentos a un ejecutable nativo, así que el JavaScript llegaba roto
    # (falló el 24/09/2026 con un error de sintaxis en `[eval]:1`). Con un fichero no hay nada que escapar.
    #
    # `--no-warnings` hace falta de verdad: `node:sqlite` avisa por stderr de que es experimental y ese aviso se
    # mezclaría con la línea que hay que leer.
    $ayudante = Join-Path $PSScriptRoot 'cuenta-cola.mjs'
    $salida = & node --no-warnings $ayudante $ruta 2>&1
    if ($LASTEXITCODE -ne 0) { throw "no se pudo leer la cola $ruta : $salida" }
    $partes = "$salida".Trim().Split('|')
    if ($partes.Count -ne 3) { throw "respuesta inesperada al leer $ruta : $salida" }
    return [pscustomobject]@{ Trabajos = [int]$partes[0]; Hechas = [int]$partes[1]; Pendientes = [int]$partes[2] }
}

foreach ($f in $federaciones) {
    $fed = $f.Nombre
    $nuevo = Join-Path $origen $f.Fichero
    $walNuevo = "$nuevo-wal"
    $carpeta = Join-Path $raiz "descargas-$fed\recolector-local"
    $base = Join-Path $carpeta 'cola-v2.sqlite'

    Write-Host ''
    Write-Host "══ $fed ══" -ForegroundColor Cyan

    if (-not (Test-Path -LiteralPath $nuevo)) { throw "falta $nuevo (¿terminó la copia desde el servidor?)" }

    # 1. ¿La cola que viene se abre y cuadra?
    $antes = $null
    if (Test-Path -LiteralPath $base) { $antes = Cuenta-Colas $base }
    $despues = Cuenta-Colas $nuevo
    Write-Host ("  cola que viene:  trabajos={0}  actas hechas={1}  pendientes={2}" -f $despues.Trabajos, $despues.Hechas, $despues.Pendientes)
    if ($antes) {
        Write-Host ("  cola que había:  trabajos={0}  actas hechas={1}  pendientes={2}" -f $antes.Trabajos, $antes.Hechas, $antes.Pendientes)
        if ($despues.Hechas -lt $antes.Hechas) {
            throw "la cola que viene trae MENOS actas hechas que la del PC ($($despues.Hechas) < $($antes.Hechas)); no se instala"
        }
        Write-Host ("  adelanto: +{0} actas hechas" -f ($despues.Hechas - $antes.Hechas)) -ForegroundColor Green
    }

    # 2. Apartar base, -wal y -shm ANTERIORES (los tres, o SQLite puede aplicar un diario de otra base).
    $sello = Get-Date -Format 'yyyy-MM-ddTHH-mm-ss'
    foreach ($sufijo in @('', '-wal', '-shm')) {
        $viejo = "$base$sufijo"
        if (Test-Path -LiteralPath $viejo) {
            $destino = "$base$sufijo.antes-$sello"
            Move-Item -LiteralPath $viejo -Destination $destino -Force
            Write-Host "  apartado: $(Split-Path -Leaf $destino)"
        }
    }

    # 3. Copiar la nueva con su -wal (nunca su -shm: es estado transitorio y lo recrea SQLite).
    Copy-Item -LiteralPath $nuevo -Destination $base -Force
    if (Test-Path -LiteralPath $walNuevo) {
        Copy-Item -LiteralPath $walNuevo -Destination "$base-wal" -Force
        Write-Host '  copiada la cola con su -wal'
    } else {
        Write-Host '  copiada la cola (sin -wal: no había transacciones pendientes)'
    }

    # 4. Y se comprueba LEYENDO la que ha quedado instalada, no la de origen.
    $instalada = Cuenta-Colas $base
    Write-Host ("  instalada:       trabajos={0}  actas hechas={1}  pendientes={2}" -f $instalada.Trabajos, $instalada.Hechas, $instalada.Pendientes) -ForegroundColor Green
    if ($instalada.Hechas -ne $despues.Hechas) { throw "la cola instalada no coincide con la que vino ($($instalada.Hechas) <> $($despues.Hechas))" }
}

Write-Host ''
Write-Host 'Colas instaladas y comprobadas. Ahora se pueden habilitar las tareas de las tres.' -ForegroundColor Green
Write-Host 'Las colas anteriores quedaron como *.antes-<fecha> dentro de cada descargas-<fed>\recolector-local\.'
