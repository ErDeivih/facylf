$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $raiz
$registro = Join-Path $raiz 'estado\importador-programado.log'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $registro) | Out-Null
$node = (Get-Command node.exe -ErrorAction Stop).Source
$inicio = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
# En el PC se importa CyL (la carpeta de la cola se llama `federacion` y el importador la traduce a
# castilla-leon). Orden: primero las temporadas más usadas (2026-27, 2025-26, 2024-25) y después hacia
# atrás hasta 2020-21. La 2026-27 puede venir del servidor; el validador aparta la unidad si la cola
# local va por detrás, sin pisar el canónico.
$salida = & $node 'scripts\importar-masivo.mjs' --federaciones federacion `
  --temporadas '2026-27,2025-26,2024-25,2023-24,2022-23,2021-22,2020-21' `
  --minutos 20 --limite 0 2>&1 | Out-String
$codigo = $LASTEXITCODE
Add-Content -LiteralPath $registro -Encoding utf8 -Value "$inicio  importador incremental  inicio"
Add-Content -LiteralPath $registro -Encoding utf8 -Value $salida.TrimEnd()
Add-Content -LiteralPath $registro -Encoding utf8 -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  importador fin (codigo $codigo)"
exit $codigo
