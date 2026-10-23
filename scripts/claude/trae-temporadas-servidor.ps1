<#
  Trae al canonico del PC las temporadas de Castilla y Leon que recoge el SERVIDOR (reparto de temporadas:
  2026-27, 2024-25, 2022-23, 2020-21, 2018-19, 2016-17) e importa cada una desde su paquete.

  Por que: los informes se generan con el canonico del PC. Sin esto, un informe ve las temporadas del PC
  completas y las del servidor tal como estaban en la cola del PC antes del reparto (2024-25: ~6.000 actas en
  el PC frente a ~26.000 en el servidor). Es la regla de David: "coger siempre entre PC y servidor".

  1. En el servidor: extrae-temporada-cola.mjs saca la temporada a un SQLite nuevo (solo lee la cola).
  2. scp al PC: _traspaso\cyl-<temporada>.sqlite (el anterior se aparta con fecha).
  3. importar-temporada.ps1 -Paquete: importa grupo a grupo SIN tocar la cola viva del PC.

  ESCRIBE en el canonico: se lanza a mano, con Docker funcionando y sin otra importacion en marcha.
  Uso:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\trae-temporadas-servidor.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\claude\trae-temporadas-servidor.ps1 -Temporadas 2026-27
    ... -SoloTraer   (deja los paquetes en _traspaso sin importar)
  ASCII a proposito (PowerShell 5.1).
#>
param(
  [string[]]$Temporadas = @('2026-27', '2024-25', '2022-23', '2020-21', '2018-19', '2016-17'),
  [switch]$SoloTraer
)
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
New-Item -ItemType Directory -Force -Path _traspaso | Out-Null
$sello = Get-Date -Format 'yyyyMMdd-HHmm'

foreach ($t in $Temporadas) {
  Write-Host ""
  Write-Host "== $t ==" -ForegroundColor Cyan
  $remoto = "/tmp/cyl-$t.sqlite"
  $orden = "docker exec facylf-federacion-1 rm -f $remoto && " +
           "docker exec facylf-federacion-1 node --no-warnings /app/scripts/claude/extrae-temporada-cola.mjs /app/descargas-federacion/recolector-local/cola-v2.sqlite $remoto $t && " +
           "docker cp facylf-federacion-1:$remoto /tmp/facylf-cyl-$t.sqlite && docker exec facylf-federacion-1 rm -f $remoto"
  & ssh -o BatchMode=yes servidor $orden
  if ($LASTEXITCODE -ne 0) { Write-Host "  no se pudo extraer $t en el servidor" -ForegroundColor Yellow; continue }

  $destino = "_traspaso\cyl-$t.sqlite"
  if (Test-Path $destino) { Move-Item $destino "_traspaso\cyl-$t-anterior-$sello.sqlite" }
  & scp -o BatchMode=yes "servidor:/tmp/facylf-cyl-$t.sqlite" $destino
  & ssh -o BatchMode=yes servidor "rm -f /tmp/facylf-cyl-$t.sqlite"
  if (-not (Test-Path $destino)) { Write-Host "  no llego el paquete de $t" -ForegroundColor Yellow; continue }
  Write-Host ("  paquete: {0} ({1:N1} MB)" -f $destino, ((Get-Item $destino).Length / 1MB))

  if (-not $SoloTraer) {
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\importar-temporada.ps1 -Federacion castilla-leon -Temporada $t -Paquete $destino
  }
}
