# Seguimiento de Valencia: ¿funciona bien después de la pausa?
#
# Empieza con la pausa puesta (hasta 15:56) y sigue 70 minutos en muestras cada 10: cubre la expiración de la
# pausa y luego media hora larga de recolección de verdad. Deja todo en registros\valencia-seguimiento.log y
# termina con un veredicto.
$ErrorActionPreference = 'Continue'
$raiz = 'F:\EspacioCodigo\facylf'
$cola = Join-Path $raiz 'descargas-valencia\recolector-local\cola-v2.sqlite'
$logWorker = Join-Path $raiz 'descargas-valencia\recolector-local\worker-valencia.log'
$log = Join-Path $raiz 'registros\valencia-seguimiento.log'

function Anota($texto) {
  $linea = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $texto
  Write-Output $linea
  Add-Content -Path $log -Value $linea -Encoding UTF8
}

function Foto {
  $salida = & node (Join-Path $raiz 'scripts\cuenta-cola.mjs') $cola 2>&1 | Select-Object -Last 1
  $partes = ([string]$salida).Trim() -split '\|'
  $proc = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'recolector-valencia' }
  $vivo = if ($proc) { "vivo (PID $($proc.ProcessId))" } else { 'sin proceso' }
  [pscustomobject]@{
    Hora = Get-Date -Format 'HH:mm:ss'
    ActasHechas = [int]$partes[1]
    Pendientes = [int]$partes[2]
    Proceso = $vivo
  }
}

Add-Content -Path $log -Value "`n===== SEGUIMIENTO DE VALENCIA · $(Get-Date -Format 'yyyy-MM-dd HH:mm') =====" -Encoding UTF8
$inicial = Foto
Anota ("inicio · actas hechas {0} · pendientes {1} · {2}" -f $inicial.ActasHechas, $inicial.Pendientes, $inicial.Proceso)

for ($i = 1; $i -le 7; $i++) {
  Start-Sleep -Seconds 600
  $f = Foto
  $delta = $f.ActasHechas - $inicial.ActasHechas
  Anota ("muestra {0} · actas {1} ({2}{3}) · pendientes {4} · {5}" -f $i, $f.ActasHechas, $(if ($delta -ge 0) { '+' } else { '' }), $delta, $f.Pendientes, $f.Proceso)
  # Y qué dice su registro: las dos últimas líneas útiles
  $ultimas = Get-Content $logWorker -Tail 4 -Encoding UTF8 -ErrorAction SilentlyContinue | Where-Object { $_ -match '\S' }
  foreach ($u in $ultimas) { Anota ("    log: " + $u.Trim()) }
}

$final = Foto
$total = $final.ActasHechas - $inicial.ActasHechas
$horas = ((Get-Date) - (Get-Date $inicial.Hora)).TotalHours
Anota ''
Anota '===== VEREDICTO ====='
Anota ("actas nuevas en el seguimiento: {0}" -f $total)
Anota ("proceso al terminar: {0}" -f $final.Proceso)
if ($total -ge 30) {
  Anota 'FUNCIONA: recolecta con normalidad.'
} elseif ($total -gt 0) {
  Anota 'FUNCIONA, PERO DESPACIO: recoge, aunque muy por debajo de las otras federaciones (~500/h).'
} else {
  Anota 'NO AVANZA: no ha hecho ni un acta. Hay que mirar la fuente o el ritmo.'
}
$pausas = (Get-Content $logWorker -Tail 200 -Encoding UTF8 -ErrorAction SilentlyContinue | Select-String -Pattern '503|en pausa' | Measure-Object).Count
Anota ("menciones de 503/pausa en las últimas 200 líneas de su registro: {0}" -f $pausas)
