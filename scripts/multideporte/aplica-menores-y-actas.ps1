<#
  05/10/2026 — aplica al multideporte la decision de David de recoger tambien los datos de menores y el lector de
  actas de balonmano. Para los recolectores (por PID), relee desde la evidencia lo ya descargado (sin pedir nada
  a la web) y los vuelve a lanzar. Se puede repetir sin dano: la relectura es idempotente.
  Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\multideporte\aplica-menores-y-actas.ps1
#>
Set-Location (Resolve-Path "$PSScriptRoot\..\..")
$procesos = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'node.exe' -and ($_.CommandLine -like '*supervisor-multideporte.mjs*' -or $_.CommandLine -like '*recolector-multideporte.mjs*arrancar*')
}
foreach ($p in $procesos) { Write-Host "cierro $($p.ProcessId)"; Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 3
$relecturas = @(
  @('isquad-balonmano', 'acta'),      # actas PDF: jugadores, goles, amonestaciones, exclusiones, tecnicos, arbitros
  @('serversports', 'partido'),       # fichas: ahora tambien los jugadores de menores
  @('feb', 'partido'),                # box score: ahora tambien con nombres en base
  @('isquad-tenis', 'partidos'),      # tenis: ahora tambien con nombre en menores
  @('siguetuliga', 'sitemap')         # encola las ligas de menores que antes se filtraban
)
foreach ($r in $relecturas) {
  Write-Host "== relectura $($r[0]) / $($r[1])"
  node scripts\multideporte\reinterpreta.mjs --adaptador $r[0] --tipo $r[1]
}
Start-ScheduledTask -TaskName 'FACyLF multideporte'
Write-Host 'Recolectores multideporte relanzados.'
