<#
  PRUEBA 3 DEL PROGRAMA DE 10 GB: matar un recolector a mitad de sesion y comprobar que
  (a) el supervisor lo relanza, (b) el worker nuevo limpia los restos de navegador de la sesion
  anterior (su propio perfil, nadie mas), y (c) sigue recolectando despues.

  Por que con una federacion de PRUEBA y no con una real: matar un worker de produccion deja su
  federacion sin recolectar el tiempo que tarde el relanzamiento, y aqui lo que se prueba es el
  mecanismo, no el dato. `prueba-10gb` es su propia cola, con su carpeta, su perfil de Chrome y su
  mutex: el supervisor de produccion no la ve y ella no toca a nadie. Usa el MISMO codigo
  (recolector-local.mjs), el MISMO supervisor y el MISMO sitio (PNFG de Euskadi) que la produccion,
  con un tope de 40 peticiones al dia.

  Nunca mata por nombre de proceso: resuelve UN identificador por linea de ordenes, comprueba que es
  el worker de esta prueba y que no es nada del arnes del agente, y mata solo ese identificador.

  Este fichero es ASCII a proposito: PowerShell 5.1 lee un .ps1 UTF-8 sin BOM como ANSI.

  Uso: powershell -NoProfile -File scripts\_prueba-3-worker-muerto.ps1
#>
param(
    [string]$Federacion = 'prueba-10gb',
    [int]$EsperaArranqueSeg = 180,
    [int]$EsperaRelanzadoSeg = 420,
    [int]$EsperaPeticionSeg = 240,
    [int]$EsperaLimpiezaSeg = 150
)

$ErrorActionPreference = 'Stop'

$raiz         = 'F:\EspacioCodigo\facylf'
$carpeta      = Join-Path $raiz "descargas-$Federacion\recolector-local"
$registro     = Join-Path $carpeta 'worker-programado.log'
$baseDatos    = Join-Path $carpeta 'cola-v2.sqlite'
$perfilChrome = Join-Path $carpeta 'perfil-chrome'
$perfilJson   = Join-Path $raiz "perfiles\$Federacion.json"
$supervisor   = Join-Path $raiz 'scripts\ejecutar-recolector-programado.ps1'
$ayudaCola    = Join-Path $raiz 'scripts\_estado-cola-corta.mjs'
$salida       = Join-Path $raiz 'pruebas\reconstruccion'
$node         = (Get-Command node.exe -ErrorAction Stop).Source
$powershell   = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

New-Item -ItemType Directory -Path $carpeta -Force | Out-Null
New-Item -ItemType Directory -Path $salida -Force | Out-Null

# Marca de cola de PRUEBA: los informes de la flota la omiten (no es una federacion del proyecto).
Set-Content -LiteralPath (Join-Path $raiz "descargas-$Federacion\.PRUEBA") -Value "Cola de prueba del programa de 10 GB. No es una federacion: la crea scripts\_prueba-3-worker-muerto.ps1." -Encoding UTF8

# Restos de una version anterior de esta prueba, cuando la carpeta del supervisor y la del perfil no
# coincidian (`descargas-prueba10gb` frente a `descargas-prueba-10gb`). Solo esa carpeta concreta.
$carpetaVieja = Join-Path $raiz 'descargas-prueba10gb'
if (Test-Path -LiteralPath $carpetaVieja) { Remove-Item -LiteralPath $carpetaVieja -Recurse -Force }

# Catalogo de la prueba: copia del de Euskadi, para no escribir nunca en la carpeta real.
$catalogoPrueba = Join-Path $raiz "descargas-$Federacion\competiciones-por-temporada.json"
if (-not (Test-Path -LiteralPath $catalogoPrueba)) {
    Copy-Item -LiteralPath (Join-Path $raiz 'descargas-euskadi\competiciones-por-temporada.json') -Destination $catalogoPrueba
}

function TrabajadoresDeLaPrueba {
    @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and
            $_.CommandLine -like '*recolector-local.mjs*' -and
            $_.CommandLine -like "*perfiles\$Federacion.json*"
        })
}

function TrabajadoresDelProyecto {
    @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -like '*recolector-*.mjs*' })
}

function FederacionesDeRecolectores {
    # El invariante se mide por FEDERACION, no por identificador de proceso: los supervisores rotan a su
    # worker cada sesion (Madrid cada 5 minutos, el resto al terminar su lote), asi que comparar
    # identificadores daba por «desaparecido» a quien simplemente habia empezado otra sesion. Lo que no puede
    # pasar es que una federacion se quede SIN recolector por culpa de esta prueba.
    @(TrabajadoresDelProyecto | ForEach-Object {
        $c = [string]$_.CommandLine
        $m = [regex]::Match($c, 'perfiles\\([a-z\-]+)\.json')
        if ($m.Success) { $m.Groups[1].Value }
        else { [regex]::Match($c, 'recolector-([a-z\-]+)\.mjs').Groups[1].Value }
    } | Sort-Object -Unique)
}

function NavegadoresDelPerfil {
    @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine.Contains($perfilChrome) })
}

function ConductoresDelPerfil {
    # NO se puede atribuir un chromedriver a una federacion por su linea de ordenes (no lleva la ruta del
    # perfil), y aqui hubo un fallo grave por olvidarlo: la primera version contaba TODOS los chromedriver del
    # equipo y la preparacion de la prueba los mataba "para empezar limpio". El 17/09/2026 a las 20:11:55 eso
    # tumbo el driver de nueve federaciones a la vez (ECONNREFUSED 127.0.0.1:<puerto>), cada una encadeno cinco
    # fallos seguidos y se puso en pausa preventiva una hora. Regla que queda escrita: **aqui no se mata NI UN
    # chromedriver**; de los huerfanos se encarga el barrido externo con candado. Se devuelve una lista vacia a
    # proposito, para que cualquier uso futuro sea inofensivo.
    @()
}

function EstadoCola {
    try { return (& $node $ayudaCola $baseDatos | Select-Object -First 1 | ConvertFrom-Json) }
    catch { return $null }
}

function EsperaHasta([scriptblock]$condicion, [int]$segundos, [int]$paso = 3) {
    $inicio = Get-Date
    while (((Get-Date) - $inicio).TotalSeconds -lt $segundos) {
        $valor = & $condicion
        if ($valor) { return $valor }
        Start-Sleep -Seconds $paso
    }
    return $null
}

function LineasDesde([int]$desde) {
    if (-not (Test-Path -LiteralPath $registro)) { return @() }
    $todas = @(Get-Content -LiteralPath $registro -Encoding UTF8)
    if ($todas.Count -le $desde) { return @() }
    return @($todas[$desde..($todas.Count - 1)])
}

function LineaDeLimpieza([string[]]$lineas) {
    # Hay DOS redes de limpieza y las dos valen, pero no se disparan a la vez: el SUPERVISOR limpia el
    # perfil de su federacion justo antes de relanzar ("Se cerraron N procesos huerfanos del navegador del
    # recolector") y, si esa red no hubiera llegado, el worker limpia lo suyo AL ARRANCAR ("· limpieza del
    # navegador: N proceso(s) de su propio perfil"). En la primera vuelta de esta prueba se leyo solo la
    # segunda y el veredicto salio en falso: la limpieza SI habia ocurrido, 2 s antes y por la otra red.
    foreach ($l in $lineas) {
        $m = [regex]::Match($l, 'limpieza del navegador: (\d+) proceso\(s\) de su propio perfil, (\d+) MB')
        if ($m.Success) {
            return [pscustomobject]@{ linea = $l.Trim(); procesos = [int]$m.Groups[1].Value; megas = [int]$m.Groups[2].Value; quien = 'worker al arrancar' }
        }
        $m = [regex]::Match($l, 'Se cerraron (\d+) procesos huerfanos del navegador del recolector')
        if ($m.Success) {
            return [pscustomobject]@{ linea = $l.Trim(); procesos = [int]$m.Groups[1].Value; megas = $null; quien = 'supervisor antes de relanzar' }
        }
    }
    return $null
}

$evidencia = [ordered]@{
    federacion                = $Federacion
    iniciadoEn                = (Get-Date).ToUniversalTime().ToString('o')
    carpeta                   = $carpeta
    federacionesAntes         = @()
    federacionesDespues       = @()
    supervisor                = [ordered]@{ pid = $null; paradoAlFinal = $false }
    sesion1                   = [ordered]@{ pid = $null; inicio = $null }
    matanza                   = [ordered]@{ pid = $null; instante = $null }
    sesion2                   = [ordered]@{ pid = $null; inicio = $null; segundosHastaRelanzar = $null }
    navegadores               = [ordered]@{ restosDeLaVueltaAnterior = $null; trabajandoSesion1 = $null; trasMatar = $null; trasLimpiezaSesion2 = $null; finalesLimpiados = $null }
    conductores               = [ordered]@{ trasMatar = $null; trasLimpiezaSesion2 = $null }
    limpiezaAlArrancar        = [ordered]@{ linea = $null; procesos = $null; megas = $null; quien = $null }
    veredictos                = [ordered]@{ relanza = $false; limpia = $false; sigue = $false; noTocaAjenos = $null }
    log                       = @()
}

try {
    Write-Output "== PRUEBA 3 - federacion de prueba '$Federacion'"
    Write-Output "   carpeta: $carpeta"
    $evidencia.federacionesAntes = FederacionesDeRecolectores
    Write-Output "   federaciones con recolector antes: $($evidencia.federacionesAntes.Count) ($($evidencia.federacionesAntes -join ', '))"

    if (@(TrabajadoresDeLaPrueba).Count -gt 0) { throw "Ya hay un worker de prueba vivo; se para para no duplicar." }

    # Estado de partida limpio: los NAVEGADORES de una vuelta anterior de ESTA prueba (su perfil, nadie mas)
    # se tiran antes de empezar, para que lo que se mida despues sea de esta sesion. Nunca un chromedriver:
    # ver la nota de `ConductoresDelPerfil` sobre el estropicio del 17/09/2026.
    $restosPrevios = NavegadoresDelPerfil
    foreach ($c in $restosPrevios) { Stop-Process -Id $c.ProcessId -Force -ErrorAction SilentlyContinue }
    $evidencia.navegadores.restosDeLaVueltaAnterior = @($restosPrevios).Count
    $evidencia.conductores.previosDeLaPrueba = @(ConductoresDelPerfil).Count
    if (@($restosPrevios).Count) { Start-Sleep -Seconds 3 }

    $antes = EstadoCola
    $evidencia['colaAntes'] = $antes
    $peticionesIniciales = if ($antes -and $antes.peticiones) { [int]$antes.peticiones } else { 0 }
    Write-Output "   cola antes: $(($antes | ConvertTo-Json -Compress))"

    $lineasPrevias = if (Test-Path -LiteralPath $registro) { @(Get-Content -LiteralPath $registro -Encoding UTF8).Count } else { 0 }

    Write-Output "   lanzando el supervisor de la federacion de prueba..."
    $procesoSupervisor = Start-Process -FilePath $powershell `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', $supervisor, '-Federacion', $Federacion) `
        -PassThru -WindowStyle Hidden
    $evidencia.supervisor.pid = $procesoSupervisor.Id

    # 1. Aparece el worker.
    $worker1 = EsperaHasta { (TrabajadoresDeLaPrueba | Select-Object -First 1) } $EsperaArranqueSeg 3
    if (-not $worker1) { throw "El supervisor no arranco ningun worker en $EsperaArranqueSeg s." }
    $evidencia.sesion1.pid = $worker1.ProcessId
    $evidencia.sesion1.inicio = $worker1.CreationDate.ToString('o')
    Write-Output "   sesion 1: PID $($worker1.ProcessId) desde $($worker1.CreationDate)"

    # 2. Trabaja de verdad AHORA (una peticion NUEVA, no una de una vuelta anterior) antes de matarlo.
    $conPeticion = EsperaHasta {
        $e = EstadoCola
        if ($e -and $e.peticiones -gt $peticionesIniciales) { $e }
    } $EsperaPeticionSeg 5
    if (-not $conPeticion) { throw "El worker no anoto ninguna peticion nueva en $EsperaPeticionSeg s; no hay nada que matar a mitad de trabajo." }
    $evidencia['colaTrabajando'] = $conPeticion
    $peticionesAntesDeMatar = $conPeticion.peticiones
    Write-Output "   trabajando: $peticionesAntesDeMatar peticiones (al empezar la prueba: $peticionesIniciales)"

    # 3. Comprobaciones ANTES de matar: es el worker de esta prueba y no es nada del arnes.
    $vivo = Get-CimInstance Win32_Process -Filter "ProcessId = $($worker1.ProcessId)"
    $linea = [string]$vivo.CommandLine
    if ($linea -notlike '*recolector-local.mjs*') { throw "El PID elegido no es el recolector: $linea" }
    if ($linea -notlike "*perfiles\$Federacion.json*") { throw "El PID elegido no es de la federacion de prueba: $linea" }
    if ($linea -like '*deepseek-harness*' -or $linea -like '*apps\cli*') { throw "El PID elegido es del arnes del agente; no se toca." }
    # OJO: `@(funcion).Count`, no `(funcion).Count`. PowerShell desenrolla un array de un solo elemento al
    # devolverlo de una funcion, y `.Count` sobre un objeto suelto devuelve VACIO (no 1): el guardia
    # comparaba $null con 1 y abortaba la prueba teniendo el worker delante. Se comprobo el 17/09/2026.
    $coincidentes = @(TrabajadoresDeLaPrueba)
    if ($coincidentes.Count -ne 1) {
        throw "Hay $($coincidentes.Count) workers de la prueba (se esperaba 1): $(($coincidentes | ForEach-Object { $_.ProcessId }) -join ', ')"
    }

    $evidencia.navegadores.trabajandoSesion1 = @(NavegadoresDelPerfil).Count
    Write-Output "   navegadores del perfil con la sesion 1 trabajando: $($evidencia.navegadores.trabajandoSesion1)"

    # 4. La matanza: exactamente un identificador, sin avisar y sin limpieza (como un corte de luz).
    Stop-Process -Id $worker1.ProcessId -Force
    $evidencia.matanza.pid = $worker1.ProcessId
    $evidencia.matanza.instante = (Get-Date).ToUniversalTime().ToString('o')
    $evidencia['colaTrasMatar'] = EstadoCola
    Write-Output "   matado el PID $($worker1.ProcessId) ($(Get-Date -Format 'HH:mm:ss'))"

    Start-Sleep -Seconds 6
    $evidencia.navegadores.trasMatar = @(NavegadoresDelPerfil).Count
    $evidencia.conductores.trasMatar = @(ConductoresDelPerfil).Count
    Write-Output "   restos tras la muerte: $($evidencia.navegadores.trasMatar) navegador(es), $($evidencia.conductores.trasMatar) chromedriver"

    # 5. Relanzamiento por el supervisor.
    $t0 = Get-Date
    $worker2 = EsperaHasta {
        $w = TrabajadoresDeLaPrueba | Where-Object { $_.ProcessId -ne $worker1.ProcessId } | Select-Object -First 1
        if ($w) { $w }
    } $EsperaRelanzadoSeg 3
    if ($worker2) {
        $evidencia.veredictos.relanza = $true
        $evidencia.sesion2.pid = $worker2.ProcessId
        $evidencia.sesion2.inicio = $worker2.CreationDate.ToString('o')
        $evidencia.sesion2.segundosHastaRelanzar = [int]((Get-Date) - $t0).TotalSeconds
        Write-Output "   RELANZADO: PID $($worker2.ProcessId) en $($evidencia.sesion2.segundosHastaRelanzar) s"
    } else {
        Write-Output "   NO se relanzo en $EsperaRelanzadoSeg s"
    }

    # 6. La limpieza de arranque del worker NUEVO tiene que aparecer en el registro (se espera a que
    #    escriba: la linea sale despues de preparar el plan, no en el mismo instante en que arranca).
    if ($worker2) {
        $lineaLimpieza = EsperaHasta {
            $l = LineaDeLimpieza (LineasDesde $lineasPrevias)
            if ($l) { $l }
        } $EsperaLimpiezaSeg 5
        $evidencia.log = LineasDesde $lineasPrevias
        if ($lineaLimpieza) {
            $evidencia.limpiezaAlArrancar.linea = $lineaLimpieza.linea
            $evidencia.limpiezaAlArrancar.procesos = $lineaLimpieza.procesos
            $evidencia.limpiezaAlArrancar.megas = $lineaLimpieza.megas
            $evidencia.limpiezaAlArrancar.quien = $lineaLimpieza.quien
        }
        Start-Sleep -Seconds 5
        $evidencia.navegadores.trasLimpiezaSesion2 = @(NavegadoresDelPerfil).Count
        $evidencia.conductores.trasLimpiezaSesion2 = @(ConductoresDelPerfil).Count
        if ($evidencia.limpiezaAlArrancar.procesos -gt 0 -and
            $evidencia.navegadores.trasLimpiezaSesion2 -lt $evidencia.navegadores.trasMatar) {
            $evidencia.veredictos.limpia = $true
        }
        Write-Output "   limpieza: $($evidencia.limpiezaAlArrancar.procesos) proceso(s) por el $($evidencia.limpiezaAlArrancar.quien) · navegadores ahora $($evidencia.navegadores.trasLimpiezaSesion2) (tras matar eran $($evidencia.navegadores.trasMatar))"
    }

    # 7. Sigue recolectando: mas peticiones que antes de la matanza.
    $tras = EsperaHasta { $e = EstadoCola; if ($e -and $e.peticiones -gt $peticionesAntesDeMatar) { $e } } $EsperaPeticionSeg 5
    if ($tras) {
        $evidencia.veredictos.sigue = $true
        $evidencia['colaTrasRelanzar'] = $tras
        Write-Output "   SIGUE: $($tras.peticiones) peticiones (antes de matar: $peticionesAntesDeMatar)"
    } else {
        $evidencia['colaTrasRelanzar'] = EstadoCola
        Write-Output "   no consta peticion nueva en $EsperaPeticionSeg s"
    }

    # 8. Invariante: NINGUNA federacion se ha quedado sin recolector por culpa de esta prueba. Se compara el
    #    conjunto de federaciones, no los identificadores: los supervisores rotan a su worker cada sesion.
    $evidencia.federacionesDespues = FederacionesDeRecolectores
    $perdidas = @($evidencia.federacionesAntes | Where-Object { $_ -notin $evidencia.federacionesDespues })
    $evidencia.veredictos.noTocaAjenos = ($perdidas.Count -eq 0)
    Write-Output "   federaciones con recolector despues: $($evidencia.federacionesDespues.Count) (perdidas: $($perdidas -join ', '))"
}
finally {
    # Si la prueba se corto antes de la foto final, el veredicto de "no toca ajenos" queda sin concluir.
    if (@($evidencia.federacionesDespues).Count -eq 0) {
        $evidencia.federacionesDespues = $null
        $evidencia.veredictos.noTocaAjenos = $null
    }
    # Limpieza de la prueba: se paran los procesos que ha lanzado ESTA prueba, por identificador.
    foreach ($w in TrabajadoresDeLaPrueba) {
        Stop-Process -Id $w.ProcessId -Force -ErrorAction SilentlyContinue
    }
    if ($procesoSupervisor -and -not $procesoSupervisor.HasExited) {
        Stop-Process -Id $procesoSupervisor.Id -Force -ErrorAction SilentlyContinue
        $evidencia.supervisor.paradoAlFinal = $true
    }
    Start-Sleep -Seconds 4
    # Restos de navegador de la prueba (solo los del perfil de la prueba, por identificador).
    $restos = NavegadoresDelPerfil
    foreach ($c in $restos) { Stop-Process -Id $c.ProcessId -Force -ErrorAction SilentlyContinue }
    $evidencia.navegadores.finalesLimpiados = @($restos).Count

    $evidencia.terminadoEn = (Get-Date).ToUniversalTime().ToString('o')
    $rutaJson = Join-Path $salida 'prueba-3-worker-muerto.json'
    $evidencia | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $rutaJson -Encoding UTF8
    Write-Output "   restos finales limpiados: $(@($restos).Count) navegador(es) del perfil de la prueba"
    Write-Output "   evidencia: $rutaJson"
    Write-Output "   veredictos: relanza=$($evidencia.veredictos.relanza) limpia=$($evidencia.veredictos.limpia) sigue=$($evidencia.veredictos.sigue) noTocaAjenos=$($evidencia.veredictos.noTocaAjenos)"
}
