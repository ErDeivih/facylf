<#
  IMPORTA UNA TEMPORADA ENTERA, GRUPO A GRUPO, SIN QUE UNO ROTO TUMBE EL RESTO.

  Por que existe. El importador detiene el lote entero cuando encuentra una incoherencia de la fuente (por
  ejemplo, un acta que no se corresponde con la fila del calendario que la cita) y hace bien: no adivina.
  Pero eso significa que UN SOLO grupo roto deja sin importar todos los que vienen detras. Medido el
  24/09/2026: importar 2025-26 de Castilla y Leon de una pasada se paro a los 66 grupos de 193 por culpa de
  un grupo de cadetes de Salamanca.

  Este guion recorre los grupos por separado, asi que cada fallo queda aislado, y deja la lista de los que
  no pudieron entrar con el motivo exacto. Es idempotente: lo ya importado se puede volver a importar sin
  dano, y se puede cortar a voluntad.

  Por que importar la temporada entera y no solo el grupo del equipo: un informe que compara jugadores entre
  dos temporadas necesita TODAS las competiciones en las que pudieron jugar, no solo la del equipo que se
  informa. Se descubrio con Adrian Pereira, que aparecia con 1 partido cuando en realidad habia jugado 23 en
  otra competicion que estaba recolectada y sin importar. Ver docs/informes/GUIA-INFORMES-EQUIPO.md, apartado
  3.1.

  ASCII A PROPOSITO: PowerShell 5.1 lee un .ps1 UTF-8 sin BOM como ANSI, y un guion largo (UTF-8 E2 80 94)
  se convierte en una comilla tipografica que CORTA la cadena y rompe el analisis del fichero. Paso el
  24/09/2026. Este fichero no lleva un solo byte por encima de 127.

  Uso:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/importar-temporada.ps1 -Federacion castilla-leon -Temporada 2025-26
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/importar-temporada.ps1 -Federacion castilla-leon -Temporada 2025-26 -SoloListar
#>
param(
  [Parameter(Mandatory = $true)][string]$Federacion,
  [Parameter(Mandatory = $true)][string]$Temporada,
  [switch]$SoloListar,
  # Paquete de una temporada traida del servidor (scripts/claude/extrae-temporada-cola.mjs). Sin el, la cola viva.
  [string]$Paquete = '',
  # Solo si se sabe lo que se hace: importar desde la cola viva del PC una temporada o federacion que el PC
  # NO recoge (su cola en el PC esta parada y es vieja). Ver el control de abajo.
  [switch]$ColaViva,
  # Solo si se sabe lo que se hace: usar un paquete aunque haya otro MAS NUEVO de la misma temporada.
  [switch]$PaqueteViejo
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$raiz = Split-Path -Parent $PSScriptRoot

# La carpeta de datos no siempre se llama como la federacion: castilla-leon vive en descargas-federacion.
$carpeta = if ($Federacion -eq 'castilla-leon') { 'descargas-federacion' } else { "descargas-$Federacion" }
$cola = Join-Path $raiz "$carpeta\recolector-local\cola-v2.sqlite"
# Paquetes de esta temporada en _traspaso, del mas nuevo al mas viejo. trae-federacion-servidor.ps1 los
# llama <carpeta>-<temporada>.sqlite (CyL: federacion-...); los de antes del 13/10 se llamaban cyl-...
$candidatos = @()
$dirTraspaso = Join-Path $raiz '_traspaso'
if (Test-Path -LiteralPath $dirTraspaso) {
  $prefijos = @(($carpeta -replace '^descargas-', ''), $Federacion)
  if ($Federacion -eq 'castilla-leon') { $prefijos += 'cyl' }
  $candidatos = @(Get-ChildItem -LiteralPath $dirTraspaso -File | Where-Object {
      $n = $_.Name; ($prefijos | Where-Object { $n -eq "$_-$Temporada.sqlite" }).Count -gt 0
    } | Sort-Object LastWriteTime -Descending)
}
if ($Paquete) {
  $cola = if ([System.IO.Path]::IsPathRooted($Paquete)) { $Paquete } else { Join-Path $raiz $Paquete }
  # 13/10/2026: el GOAL mando importar _traspaso\cyl-2020-21.sqlite (del 07/10) cuando ya habia
  # federacion-2020-21.sqlite de ese dia, con 3.600 partidos mas. Un paquete viejo es la misma clase de error
  # que la cola parada: se rechaza si hay otro mas nuevo de la misma temporada.
  if ((Test-Path -LiteralPath $cola) -and $candidatos.Count -gt 0 -and -not $PaqueteViejo -and $env:FACYLF_ORIGEN -ne 'lapreferente') {
    $usado = Get-Item -LiteralPath $cola
    $masNuevo = $candidatos[0]
    if ($masNuevo.FullName -ne $usado.FullName -and $masNuevo.LastWriteTime -gt $usado.LastWriteTime) {
      throw ("Hay un paquete mas nuevo de $Temporada`: _traspaso\{0} ({1:yyyy-MM-dd HH:mm}) frente a {2} ({3:yyyy-MM-dd HH:mm}). Usa el nuevo, o -PaqueteViejo si de verdad quieres el viejo." -f $masNuevo.Name, $masNuevo.LastWriteTime, $usado.Name, $usado.LastWriteTime)
    }
  }
  if (Test-Path -LiteralPath $cola) { Write-Host ("Paquete: {0} ({1:yyyy-MM-dd HH:mm})" -f $cola, (Get-Item -LiteralPath $cola).LastWriteTime) -ForegroundColor Cyan }
  # El importador lee la MISMA cola: la variable lleva el nombre de la federacion (ver ColaOrigen.rutaDeFederacion).
  Set-Item -Path ("env:FACYLF_COLA_" + ($Federacion.ToUpper() -replace '[^A-Z0-9]', '_')) -Value $cola
  Write-Host "Cola de origen: $cola (paquete, no la cola viva)" -ForegroundColor Cyan
}
# 12/10/2026: CONTROL DE ORIGEN. Importar desde la cola viva del PC una temporada que recoge el SERVIDOR
# (o una federacion que el PC excluye) usa una cola vieja y parada: el origen trae MENOS que el canonico y la
# validacion corta todos los grupos ("partidos 10!=380", "actas 0!=43"). Paso con CyL 2016-17, 2020-21 y
# 2026-27 y con Ceuta 2017-18: 400 grupos fallidos y 0 partidos recuperados. Para esas, el origen correcto es
# el paquete traido del servidor (_traspaso\...).
if (-not $Paquete -and -not $ColaViva) {
  if ($candidatos.Count -gt 0) {
    $sugerido = "_traspaso\" + $candidatos[0].Name
    $existe = "(el mas nuevo: {0:yyyy-MM-dd HH:mm}; si es de hace dias, trae uno fresco con trae-federacion-servidor.ps1 -SoloTraer)" -f $candidatos[0].LastWriteTime
  } else {
    $sugerido = "_traspaso\" + ($carpeta -replace '^descargas-', '') + "-$Temporada.sqlite"
    $existe = '(no existe todavia: traelo con trae-federacion-servidor.ps1 -SoloTraer)'
  }
  $entorno = Join-Path $raiz 'scripts\entorno-flota.ps1'
  if (Test-Path -LiteralPath $entorno) {
    $m = [regex]::Match((Get-Content -LiteralPath $entorno -Raw), "FACYLF_EXCLUIR\s*=\s*'([^']*)'")
    if ($m.Success -and (($m.Groups[1].Value -split ',') | ForEach-Object { $_.Trim() }) -contains $Federacion) {
      throw "La cola de $Federacion en el PC esta parada: esa federacion la recoge el servidor. Usa -Paquete $sugerido $existe. (Para forzar la cola vieja del PC: -ColaViva.)"
    }
  }
  if ($Federacion -eq 'castilla-leon') {
    $asignadas = Join-Path $raiz 'descargas-federacion\recolector-local\temporadas-asignadas.txt'
    if (Test-Path -LiteralPath $asignadas) {
      $delPc = @(Get-Content -LiteralPath $asignadas | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') })
      if ($delPc -notcontains $Temporada) {
        throw "CyL $Temporada la recoge el SERVIDOR, no el PC (temporadas del PC: $($delPc -join ', ')). Usa -Paquete $sugerido $existe. (Para forzar la cola vieja del PC: -ColaViva.)"
      }
    }
  }
}
if (-not (Test-Path -LiteralPath $cola)) { throw "No existe la cola: $cola" }
Write-Host "Cola de origen: $cola" -ForegroundColor Cyan

# La lista de grupos la saca scripts/grupos-con-datos.mjs de la cola, no de una suposicion.
$lista = Join-Path $PSScriptRoot 'grupos-con-datos.mjs'
$lineas = @(& node $lista --cola $cola --temporada $Temporada)
if ($LASTEXITCODE -ne 0) { throw "No se pudo leer la lista de grupos de $Temporada en $cola" }

if ($lineas.Count -eq 0) { Write-Host "La cola no tiene grupos con datos para $Temporada." -ForegroundColor Yellow; exit 0 }
Write-Host ("{0}: {1} grupos con datos en {2}" -f $Federacion, $lineas.Count, $Temporada) -ForegroundColor Cyan
if ($SoloListar) { $lineas | ForEach-Object { Write-Host "  $_" }; exit 0 }

$ok = 0
$fallos = @()
$apartadas = 0
$gruposConApartadas = @()
$marcaApartada = [string][char]0x2298
$i = 0
# 13/10/2026: si el canonico del PC se cae a mitad (Docker Desktop se reinicio de 11:45 a 12:18 y cinco
# temporadas salieron con todos sus grupos "fallidos" por ECONNREFUSED), no se marca el grupo como fallido:
# se espera a que el puerto vuelva (hasta 45 min, mirando cada 30 s) y se repite ESE grupo. Si no vuelve,
# se para la pasada entera con un mensaje claro; relanzar la misma orden es seguro (idempotente).
function PuertoCanonico {
  $puerto = 5433
  $env1 = Join-Path $raiz '.env'
  if (Test-Path -LiteralPath $env1) {
    $m = [regex]::Match((Get-Content -LiteralPath $env1 -Raw), 'DATABASE_URL_PUBLICADOR=\S*?@[^:/\s]+:(\d+)')
    if ($m.Success) { $puerto = [int]$m.Groups[1].Value }
  }
  return $puerto
}
function CanonicoResponde([int]$puerto) {
  $c = New-Object System.Net.Sockets.TcpClient
  try { $r = $c.BeginConnect('127.0.0.1', $puerto, $null, $null); $ok = $r.AsyncWaitHandle.WaitOne(3000) -and $c.Connected; return $ok }
  catch { return $false } finally { $c.Close() }
}
function EsperaCanonico([int]$puerto) {
  $limite = (Get-Date).AddMinutes(45)
  Write-Host ("  ! El canonico no responde en 127.0.0.1:{0}. Espero hasta {1:HH:mm} a que vuelva (Docker Desktop)..." -f $puerto, $limite) -ForegroundColor Yellow
  while ((Get-Date) -lt $limite) {
    Start-Sleep -Seconds 30
    if (CanonicoResponde $puerto) { Start-Sleep -Seconds 20; Write-Host '  ! El canonico ha vuelto; repito el grupo.' -ForegroundColor Yellow; return $true }
  }
  return $false
}
$puertoCanonico = PuertoCanonico
$canonicoCaido = $false

foreach ($linea in $lineas) {
  $i++
  $partes = $linea.Split('|')
  $competicion = $partes[0]
  $grupo = $partes[1]
  $nombre = $partes[2]

  $salida = & pnpm importar --federacion $Federacion --temporada $Temporada --grupo $grupo 2>&1 | Out-String
  $codigo = $LASTEXITCODE
  if ($codigo -ne 0 -and $salida -match 'ECONNREFUSED|no est. disponible|Connection terminated|ECONNRESET') {
    if (EsperaCanonico $puertoCanonico) {
      $salida = & pnpm importar --federacion $Federacion --temporada $Temporada --grupo $grupo 2>&1 | Out-String
      $codigo = $LASTEXITCODE
    } else {
      $canonicoCaido = $true
      Write-Host ("  X El canonico sigue sin responder tras 45 min. Paro en el grupo {0}/{1}: relanza la misma orden cuando vuelva (es idempotente)." -f $i, $lineas.Count) -ForegroundColor Red
      break
    }
  }
  if ($codigo -eq 0) {
    $ok++
    # Un grupo que ENTRA apartando actas (FACYLF_APARTAR_ACTAS_DISCORDANTES=1) no es un fallo, pero se cuenta
    # aparte para que el resumen no lo mezcle con los grupos que no entraron.
    $n = ([regex]::Matches($salida, [regex]::Escape($marcaApartada) + ' Acta')).Count
    if ($n -gt 0) { $apartadas += $n; $gruposConApartadas += [pscustomobject]@{ competicion = $competicion; grupo = $grupo; nombre = $nombre; actasApartadas = $n } }
    Write-Host ("  [{0}/{1}] {2} - {3}" -f $i, $lineas.Count, $competicion, $nombre) -ForegroundColor DarkGray
  } else {
    # OJO: PowerShell 5.1 NO tiene el operador de coalescencia nula.
    # 11/10/2026: antes se guardaba la PRIMERA linea con 'Error', que era el envoltorio de PowerShell
    # ('FullyQualifiedErrorId : NativeCommandError'): decia que fallo un programa externo, no que fallo.
    # Ahora se quitan las lineas del envoltorio y de pnpm, se guarda la ULTIMA linea de error real y,
    # ademas, la salida entera de ese grupo en un fichero, para poder diagnosticarlo sin repetirlo.
    $limpias = @($salida -split "`r?`n" | Where-Object { $_.Trim() -and $_ -notmatch 'FullyQualifiedErrorId|CategoryInfo|NativeCommandError|^\s*\+|^\s*At line|^\s*En l.nea|ELIFECYCLE|^\s*>\s' })
    $lineaMotivo = [string]($limpias | Where-Object { $_ -match 'no se corresponde|detiene|Error|error|rechaz|viola|duplicate|null value|constraint' } | Select-Object -Last 1)
    if (-not $lineaMotivo) { $lineaMotivo = [string]($limpias | Select-Object -Last 1) }
    $motivo = $lineaMotivo.Trim()
    # 12/10/2026: la consola parte el mensaje del importador en varias lineas y se guardaba solo un
    # trozo ("Reina>>. El lote se detiene..."). Si hay un mensaje que empieza por la marca de error
    # del importador (U+2717), se junta ENTERO: desde esa linea hasta la primera del envoltorio.
    $marca = [string][char]0x2717
    $todas = @($salida -split "`r?`n")
    $inicio = -1
    for ($k = 0; $k -lt $todas.Count; $k++) { if ($todas[$k].Contains($marca)) { $inicio = $k; break } }
    if ($inicio -ge 0) {
      $trozos = @($todas[$inicio])
      for ($j = $inicio + 1; $j -lt $todas.Count; $j++) {
        $l = $todas[$j]
        if (-not $l.Trim() -or $l -match '^\s*(En |At |\+)|ERR_PNPM|ELIFECYCLE' -or $l.Contains($marca)) { break }
        $trozos += $l
      }
      $completo = (($trozos | ForEach-Object { $_.Trim() }) -join ' ')
      $completo = ($completo -replace '^node(\.exe)?\s*:\s*', '' -replace '\s+', ' ').Trim()
      if ($completo) { $motivo = $completo }
    }
    $carpetaSalidas = Join-Path $raiz 'pruebas\reconstruccion\salidas'
    New-Item -ItemType Directory -Force -Path $carpetaSalidas | Out-Null
    $rutaSalida = Join-Path $carpetaSalidas ("importacion-{0}-{1}-{2}.txt" -f $Federacion, $Temporada, $grupo)
    Set-Content -LiteralPath $rutaSalida -Value $salida -Encoding utf8
    $fallos += [pscustomobject]@{ federacion = $Federacion; temporada = $Temporada; competicion = $competicion; grupo = $grupo; nombre = $nombre; motivo = $motivo; salida = $rutaSalida }
    Write-Host ("  FALLA {0}/{1} ({2}) - {3}" -f $competicion, $grupo, $nombre, $motivo) -ForegroundColor Yellow
  }
}

Write-Host ''
if ($canonicoCaido) { Write-Host 'PASADA INCOMPLETA: el canonico del PC se cayo. Nada de lo de abajo cuenta como fallo de datos.' -ForegroundColor Red }
Write-Host ("RESULTADO: {0} importados ({1} actas apartadas en {2} grupos que SI entraron), {3} fallidos" -f $ok, $apartadas, $gruposConApartadas.Count, $fallos.Count) -ForegroundColor Cyan
# 12/10/2026: el resumen se escribe SIEMPRE (antes, una pasada sin fallos dejaba en su sitio el JSON de fallos
# de una pasada anterior y se leia como si fuera de esta).
$carpetaPruebas = Join-Path $raiz 'pruebas\reconstruccion'
New-Item -ItemType Directory -Force -Path $carpetaPruebas | Out-Null
$resumen = [pscustomobject]@{ federacion = $Federacion; temporada = $Temporada; cola = $cola; terminado = (Get-Date).ToString('s'); completa = (-not $canonicoCaido); gruposVistos = $i; gruposTotales = $lineas.Count; importados = $ok; fallidos = $fallos.Count; actasApartadas = $apartadas; gruposConApartadas = $gruposConApartadas }
$resumen | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $carpetaPruebas ("importacion-resumen-{0}-{1}.json" -f $Federacion, $Temporada)) -Encoding utf8
if ($fallos.Count -eq 0) { '[]' | Set-Content -LiteralPath (Join-Path $carpetaPruebas ("importacion-fallos-{0}-{1}.json" -f $Federacion, $Temporada)) -Encoding utf8 }
if ($fallos.Count -gt 0) {
  Write-Host 'Grupos que no se han podido importar:' -ForegroundColor Yellow
  $fallos | ForEach-Object { Write-Host ("  {0}/{1}  {2}`n      {3}" -f $_.competicion, $_.grupo, $_.nombre, $_.motivo) }
  $carpetaPruebas = Join-Path $raiz 'pruebas\reconstruccion'
  New-Item -ItemType Directory -Force -Path $carpetaPruebas | Out-Null
  $rutaFallos = Join-Path $carpetaPruebas ("importacion-fallos-{0}-{1}.json" -f $Federacion, $Temporada)
  # Siempre una LISTA, tambien con un solo fallo (PowerShell 5.1 convierte una lista de uno en un objeto suelto).
  ConvertTo-Json -InputObject @($fallos) -Depth 3 | Set-Content -LiteralPath $rutaFallos -Encoding utf8
  Write-Host "  detalle en $rutaFallos"
}

if ($canonicoCaido) { exit 2 }
