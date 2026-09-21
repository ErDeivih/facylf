<#
  Vigila el visor local (http://127.0.0.1:3777/) y lo levanta si no esta.

  Por que existe: el visor se quedo "caido" sin morir. En una maquina con 14
  recolectores + 113 procesos de Chrome la RAM libre baja de 3 GB y el visor
  se queda sin turno de CPU: el puerto sigue abierto pero no contesta. Eso se
  ve igual que una caida desde el navegador, aunque el proceso siga vivo.

  Este script distingue los tres estados y actua:
    - puerto cerrado                 -> arranca el visor
    - puerto abierto pero no contesta -> mata el proceso y lo arranca
    - puerto abierto y contesta       -> no hace nada (solo latido en el log)

  Uso:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ejecutar-visor.ps1
#>
param(
  [int]$Puerto = 3777,
  [int]$TimeoutSeg = 20,
  [switch]$Forzar
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Raiz = Split-Path -Parent $PSScriptRoot
$Log  = Join-Path $Raiz 'visor-watchdog.log'
$Out  = Join-Path $Raiz 'visor-out.log'
$Err  = Join-Path $Raiz 'visor-err.log'
$Script = Join-Path $Raiz 'scripts\visor-workers.mjs'

function Escribe($mensaje) {
  $linea = "{0}  {1}" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $mensaje
  Write-Host $linea
  try { Add-Content -LiteralPath $Log -Value $linea -Encoding UTF8 } catch { }
}

function PuertosEscuchando {
  try {
    return @(Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique)
  } catch { return @() }
}

function Contesta {
  <#
    Sonda de salud con un socket TCP propio, NO con Invoke-WebRequest.

    Motivo (comprobado el 11/09/2026): Invoke-WebRequest reutiliza conexiones de WinHTTP y, tras
    reiniciar el visor, puede quedarse esperando en una conexión medio abierta hasta agotar su
    propio tiempo de espera. Eso hacía que un visor perfectamente sano pareciera caído. Un socket
    nuevo con tiempo de espera explícito mide lo que de verdad importa: si el puerto contesta.
  #>
  $cliente = $null
  try {
    $cliente = New-Object System.Net.Sockets.TcpClient
    $conectar = $cliente.BeginConnect('127.0.0.1', $Puerto, $null, $null)
    if (-not $conectar.AsyncWaitHandle.WaitOne($TimeoutSeg * 1000, $false)) { return $false }
    $cliente.EndConnect($conectar)

    $stream = $cliente.GetStream()
    $stream.ReadTimeout = $TimeoutSeg * 1000
    $stream.WriteTimeout = $TimeoutSeg * 1000
    $peticion = "GET / HTTP/1.1`r`nHost: 127.0.0.1:$Puerto`r`nConnection: close`r`nAccept: */*`r`n`r`n"
    $bytes = [System.Text.Encoding]::ASCII.GetBytes($peticion)
    $stream.Write($bytes, 0, $bytes.Length)

    $buffer = New-Object byte[] 512
    $leidos = $stream.Read($buffer, 0, $buffer.Length)
    if ($leidos -le 0) { return $false }
    $cabecera = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $leidos)
    return ($cabecera -match '^HTTP/1\.[01] 200')
  }
  catch { return $false }
  finally { if ($cliente) { $cliente.Close() } }
}

function Mata-VisoresSueltos {
  <# Antes de levantar uno nuevo se cierran los visores que hayan quedado vivos sin escuchar en el
     puerto (por ejemplo si el anterior se quedó mudo y el puerto se liberó). Si no, se acumulan
     procesos leyendo las mismas bases SQLite y todo va más lento. #>
  $suelto = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*visor-workers.mjs*' })
  foreach ($p in $suelto) {
    Escribe "cerrando visor suelto (pid $($p.ProcessId))"
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  }
  if ($suelto.Count -gt 0) { Start-Sleep -Milliseconds 800 }
}

function Arranca {
  if (-not (Test-Path -LiteralPath $Script)) { Escribe "ERROR: no existe $Script"; return $false }
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { Escribe 'ERROR: node no esta en el PATH'; return $false }
  Mata-VisoresSueltos
  Start-Process -FilePath $node `
    -ArgumentList $Script `
    -WorkingDirectory $Raiz `
    -WindowStyle Hidden `
    -RedirectStandardOutput $Out `
    -RedirectStandardError $Err | Out-Null
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    if (Contesta) { Escribe "visor levantado y respondiendo en http://127.0.0.1:$Puerto/"; return $true }
  }
  Escribe 'AVISO: el visor arranco pero todavia no contesta; se reintentara en el proximo ciclo'
  return $false
}

$pids = PuertosEscuchando

# Si alguien (o algo) deshabilitó la tarea del vigilante, deja de latir y el visor se queda caído sin
# que nadie lo levante. Pasó el 14/09/2026: la tarea `FACyLF visor` apareció deshabilitada, el último
# latido fue a las 11:06 y el visor estuvo caído dos horas y media. Volver a habilitarla aquí es
# inofensivo (si ya lo está, no hace nada) y evita que el fallo se repita cuando alguien ejecute este
# script a mano.
try {
  $tarea = Get-ScheduledTask -TaskName 'FACyLF visor' -ErrorAction SilentlyContinue
  if ($tarea -and $tarea.State -eq 'Disabled') {
    Enable-ScheduledTask -TaskName 'FACyLF visor' | Out-Null
    Escribe 'la tarea FACyLF visor estaba DESHABILITADA: se vuelve a habilitar'
  }
} catch { Escribe "no se pudo comprobar la tarea del visor: $($_.Exception.Message)" }

if ($Forzar) {
  foreach ($p in $pids) { Escribe "reinicio forzado: matando pid $p"; Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
  Arranca | Out-Null
  exit 0
}

if ($pids.Count -eq 0) {
  Escribe "puerto $Puerto cerrado: se arranca el visor"
  Arranca | Out-Null
  exit 0
}

if (Contesta) {
  Escribe ("latido correcto (pid {0})" -f ($pids -join ','))
  exit 0
}

# Puerto abierto pero mudo: no es una caida limpia, es un bloqueo.
Escribe ("el visor (pid {0}) tiene el puerto abierto pero NO contesta en {1}s: se reinicia" -f ($pids -join ','), $TimeoutSeg)
foreach ($p in $pids) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Arranca | Out-Null
exit 0
