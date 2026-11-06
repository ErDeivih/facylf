$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $raiz
# La Preferente cuenta en el denominador y debe proyectarse como pública.
$env:FACYLF_LP_PUBLICO = 'true'
$registro = Join-Path $raiz 'estado\proyector-programado.log'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $registro) | Out-Null
$node = (Get-Command node.exe -ErrorAction Stop).Source
$inicio = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$salida = & $node 'scripts\proyectar-lectura.mjs' --limite 200 --pausa-ms 100 --sin-globales 2>&1 | Out-String
$codigo = $LASTEXITCODE
Add-Content -LiteralPath $registro -Encoding utf8 -Value "$inicio  proyector (LP publico)  inicio"
Add-Content -LiteralPath $registro -Encoding utf8 -Value $salida.TrimEnd()
Add-Content -LiteralPath $registro -Encoding utf8 -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  proyector fin (codigo $codigo)"
exit $codigo
