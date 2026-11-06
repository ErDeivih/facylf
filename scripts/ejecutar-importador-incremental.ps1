$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $raiz
$registro = Join-Path $raiz 'estado\importador-programado.log'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $registro) | Out-Null
$node = (Get-Command node.exe -ErrorAction Stop).Source
$inicio = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
# En el PC se importan las temporadas asignadas. La 2026-27 la trae el servidor y, si la cola
# local va por detrás, el validador la aparta para no pisar el canónico.
$salida = & $node 'scripts\importar-masivo.mjs' --federaciones federacion `
  --temporadas '2025-26,2023-24,2021-22,2019-20,2017-18,2015-16,2013-14' `
  --minutos 20 --limite 0 2>&1 | Out-String
$codigo = $LASTEXITCODE
Add-Content -LiteralPath $registro -Encoding utf8 -Value "$inicio  importador incremental  inicio"
Add-Content -LiteralPath $registro -Encoding utf8 -Value $salida.TrimEnd()
Add-Content -LiteralPath $registro -Encoding utf8 -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  importador fin (codigo $codigo)"
exit $codigo
