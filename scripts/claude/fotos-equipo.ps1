<#
  Fotos de los jugadores de un equipo para su informe, juntando PC y servidor, y regenera el informe.

  Las fotos salen de las actas archivadas (cada acta trae la foto de cada jugador en base64): no se pide nada a
  la web. Con el reparto de temporadas de CyL, las actas de las temporadas del servidor (2026-27, 2024-25...)
  estan archivadas alli, asi que:
    1. PC: fotos-historicas-equipo.mjs saca las que puede y apunta las que faltan (--exporta-faltantes).
    2. Servidor: el mismo guion, dentro del contenedor de la federacion, busca las que faltan en SU cola
       (--desde-faltantes) y las deja en una carpeta que se trae al PC.
    3. Regenera el dashboard y el PDF del equipo.
  No toca colas ni canonico: solo escribe en informes/ y en /tmp del servidor (que limpia).

  Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\fotos-equipo.ps1 -Equipo 8865
       [-Federacion castilla-leon] [-SinInforme]
  ASCII a proposito (PowerShell 5.1).
#>
param(
  [Parameter(Mandatory = $true)][int]$Equipo,
  [string]$Federacion = 'castilla-leon',
  [switch]$SinInforme
)
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$contenedor = if ($Federacion -eq 'castilla-leon') { 'facylf-federacion-1' } else { "facylf-$Federacion-1" }

# El slug lo decide el generador del informe; se lee del catalogo para no inventarlo.
$catalogo = Get-Content informes\dashboard\catalogo.json -Raw | ConvertFrom-Json
$slug = ($catalogo | Where-Object { $_.id -eq $Equipo } | Select-Object -First 1).slug
if (-not $slug) { throw "El equipo $Equipo no esta en informes\dashboard\catalogo.json: genera antes su informe." }
Write-Host "slug: $slug" -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path _traspaso | Out-Null
$faltantes = "_traspaso\fotos-faltantes-$slug.json"
"== 1. PC =="
node --no-warnings scripts\fotos-historicas-equipo.mjs --equipo $Equipo --slug $slug --federacion $Federacion --exporta-faltantes $faltantes

# OJO: en PowerShell 5.1 ConvertFrom-Json devuelve el array como UN objeto; Measure-Object cuenta bien.
$numFaltantes = (Get-Content $faltantes -Raw | ConvertFrom-Json | ForEach-Object { $_ } | Measure-Object).Count
if ($numFaltantes -gt 0) {
  "== 2. servidor: $numFaltantes jugador/temporada sin foto en el PC =="
  $remoto = "/tmp/fotos-faltantes-$slug.json"
  & scp -o BatchMode=yes $faltantes "servidor:$remoto"
  # El guion va con la peticion (no se depende de que el del servidor este desplegado): se ejecuta desde /tmp
  # del contenedor con FACYLF_RAIZ=/app, que es donde estan sus colas.
  & scp -o BatchMode=yes scripts\fotos-historicas-equipo.mjs "servidor:/tmp/fhe-$slug.mjs"
  $orden = "docker cp $remoto ${contenedor}:$remoto && docker cp /tmp/fhe-$slug.mjs ${contenedor}:/tmp/fhe.mjs && " +
           "docker exec $contenedor rm -rf /tmp/fotos-$slug && " +
           "docker exec -e FACYLF_RAIZ=/app $contenedor node --no-warnings /tmp/fhe.mjs --desde-faltantes $remoto --slug $slug --federacion $Federacion --salida /tmp/fotos-$slug && " +
           "rm -rf /tmp/fotos-$slug && docker cp ${contenedor}:/tmp/fotos-$slug /tmp/fotos-$slug && " +
           "tar -C /tmp -cf /tmp/fotos-$slug.tar fotos-$slug && " +
           "docker exec $contenedor rm -rf /tmp/fotos-$slug $remoto /tmp/fhe.mjs && rm -rf /tmp/fotos-$slug $remoto /tmp/fhe-$slug.mjs"
  & ssh -o BatchMode=yes servidor $orden
  $tar = "_traspaso\fotos-$slug.tar"
  & scp -o BatchMode=yes "servidor:/tmp/fotos-$slug.tar" $tar
  & ssh -o BatchMode=yes servidor "rm -f /tmp/fotos-$slug.tar"
  if (Test-Path $tar) {
    $tmp = "_traspaso\fotos-$slug"
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    & tar -xf $tar -C _traspaso
    $traidas = Get-ChildItem $tmp -File
    foreach ($f in $traidas) { Copy-Item $f.FullName informes\fotos\ -Force }
    "  traidas del servidor: $($traidas.Count) fotos"
  }
}

if (-not $SinInforme) {
  "== 3. informe =="
  pnpm -s informe:dashboard --equipo $Equipo --pdf
}
"fotos de este equipo en informes\fotos: " + (Get-ChildItem informes\fotos -Filter "$slug-*").Count
