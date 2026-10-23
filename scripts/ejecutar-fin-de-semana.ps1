# Ingesta del fin de semana, para el Programador de tareas.
#
# Corre `scripts/ingesta-fin-de-semana.mjs` sobre TODAS las federaciones y deja su salida en
# `pruebas/reconstruccion/fin-de-semana-programado.log`. Es idempotente: si se ejecuta dos veces el mismo
# dia, la segunda no reabre nada (solo mira lo que falta).
#
# OJO CON `FACYLF_EXCLUIR`: el planificador decide que federaciones mira leyendo esa variable, y si no la
# encuentra **las mira todas**. Esta tarea arranca por `wscript`, sin heredar el entorno de nadie, asi que
# sin la linea de abajo abriria jornadas en las dieciseis colas que pertenecen al servidor: trabajos que
# nadie consume y un informe que diria que faltan actas cuando lo que pasa es que las trae otra maquina.
# Un informe que miente es peor que no tenerlo. Por eso la fuente de verdad se carga aqui, explicita.
#
# ASCII a proposito: PowerShell 5.1 lee un .ps1 UTF-8 sin BOM como ANSI y los acentos saldrian rotos en el
# registro. Los mensajes del programa si llevan acentos; los de este guion, no.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$raiz = Split-Path -Parent $PSScriptRoot

# La MISMA fuente de verdad que usa el supervisor de la flota. Si esta linea falta, el repaso se sale de
# su reparto y pisa colas ajenas.
. (Join-Path $PSScriptRoot 'entorno-flota.ps1')

$registro = Join-Path $raiz 'pruebas\reconstruccion\fin-de-semana-programado.log'
$guion = Join-Path $raiz 'scripts\ingesta-fin-de-semana.mjs'
$node = (Get-Command node.exe -ErrorAction Stop).Source

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $registro) | Out-Null
Set-Location -LiteralPath $raiz
Add-Content -LiteralPath $registro -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  --- pasada del fin de semana (excluidas: $env:FACYLF_EXCLUIR) ---" -Encoding utf8
# OJO con `*>>`: PowerShell 5.1 redirige en UTF-16LE, y mezclar eso con el UTF-8 de Add-Content deja el
# registro con caracteres separados por ceros. Se captura la salida y se escribe entera en UTF-8.
$salida = & $node $guion 2>&1 | Out-String
$codigo = $LASTEXITCODE
Add-Content -LiteralPath $registro -Value $salida.TrimEnd() -Encoding utf8
Add-Content -LiteralPath $registro -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  --- fin (codigo $codigo) ---" -Encoding utf8
