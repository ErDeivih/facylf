# Trae al canónico las temporadas anteriores del Ciudad Rodrigo JUVENIL, una a una.
#
# El informe pide «ese mismo equipo años anteriores»: la cola tiene al Ciudad Rodrigo en la 1ª División
# Provincial de Juveniles de Salamanca en DOCE temporadas, y cuatro de ellas con actas completas. La carga
# masiva llegará a ellas, pero va por orden de valor y las temporadas viejas son las últimas: para este
# informe concreto se traen ahora.
#
# ASCII a proposito: PowerShell 5.1 lee un .ps1 UTF-8 sin BOM como ANSI y un guion largo rompe el fichero.

$ErrorActionPreference = 'Continue'
$raiz = Split-Path -Parent $PSScriptRoot

$objetivos = @(
  @{ temporada = '2015-16'; grupo = '8954' },
  @{ temporada = '2016-17'; grupo = '12804' },
  @{ temporada = '2017-18'; grupo = '17198' },
  @{ temporada = '2017-18'; grupo = '17208' },
  @{ temporada = '2018-19'; grupo = '21038' },
  @{ temporada = '2019-20'; grupo = '25887' },
  @{ temporada = '2021-22'; grupo = '38033' },
  @{ temporada = '2022-23'; grupo = '47840' },
  @{ temporada = '2023-24'; grupo = '10088932' },
  @{ temporada = '2024-25'; grupo = '11379786' },
  @{ temporada = '2025-26'; grupo = '22911162' },
  @{ temporada = '2026-27'; grupo = '24218968' }
)

$ok = 0
$fallos = @()
foreach ($o in $objetivos) {
  $salida = & pnpm importar --federacion castilla-leon --temporada $o.temporada --grupo $o.grupo --sin-diario --continuar 2>&1 | Out-String
  $resumen = [string]($salida -split "`n" | Where-Object { $_ -match 'RESUMEN|cobertura:' } | Select-Object -First 2)
  if ($LASTEXITCODE -eq 0) {
    $ok++
    Write-Host ("  OK   {0} g{1}" -f $o.temporada, $o.grupo) -ForegroundColor Green
    Write-Host ("       " + $resumen.Trim().Replace("`n", ' | ')) -ForegroundColor DarkGray
  } else {
    $motivo = [string]($salida -split "`n" | Where-Object { $_ -match 'no se corresponde|detiene|Error|fallado' } | Select-Object -First 1)
    $fallos += "$($o.temporada)/$($o.grupo): $($motivo.Trim())"
    Write-Host ("  FALLA {0} g{1}: {2}" -f $o.temporada, $o.grupo, $motivo.Trim()) -ForegroundColor Yellow
  }
}
Write-Host ''
Write-Host ("RESULTADO: {0} importados, {1} fallidos" -f $ok, $fallos.Count) -ForegroundColor Cyan
foreach ($f in $fallos) { Write-Host "  $f" }
