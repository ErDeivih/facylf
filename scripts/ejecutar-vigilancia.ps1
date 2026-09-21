# Vigilancia de la flota, para el Programador de tareas: UNA vuelta cada vez que se ejecuta.
#
# Todo el trabajo de comprobación de este programa se apoya en medidas, y una medida de una tarde no demuestra
# nada sobre un servidor encendido 24/7. Esto deja una línea por hora en
# `pruebas/reconstruccion/vigilancia-flota.jsonl` (ritmo por federación, plazas ocupadas y quién las tiene,
# navegadores y huérfanos, memoria libre, pausas y federaciones atascadas) para poder mirar la tendencia de
# ayer, de la semana pasada o del mes pasado con `node scripts/vigilar-flota.mjs --informe`.
#
# ASCII a propósito: PowerShell 5.1 lee un .ps1 UTF-8 sin BOM como ANSI.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$raiz = Split-Path -Parent $PSScriptRoot
$registro = Join-Path $raiz 'pruebas\reconstruccion\vigilancia-programada.log'
$guion = Join-Path $raiz 'scripts\vigilar-flota.mjs'
$node = (Get-Command node.exe -ErrorAction Stop).Source

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $registro) | Out-Null
Set-Location -LiteralPath $raiz
# OJO con `*>>`: PowerShell 5.1 redirige en UTF-16LE y mezclarlo con el UTF-8 de Add-Content deja el registro con
# caracteres separados por ceros. Se captura la salida y se escribe entera.
$salida = & $node $guion --cada-min 1 --duracion-min 1 2>&1 | Out-String
$codigo = $LASTEXITCODE
Add-Content -LiteralPath $registro -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $($salida.Trim() -replace '\s+', ' ')" -Encoding utf8
if ($codigo -ne 0) { Add-Content -LiteralPath $registro -Value "  (la vuelta termino con codigo $codigo)" -Encoding utf8 }
