$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# La web de la FFIB comparte parte de la apariencia de PNFG, pero su robots.txt publica
# `User-agent: *` + `Disallow: /`. Por tanto no se debe registrar un recolector continuo. Este
# comando deja deshabilitada cualquier tarea antigua y conserva únicamente el sondeo diario, que
# lee robots.txt y termina sin solicitar la portada mientras la exclusión siga vigente.

$nombreRecolector = 'FACyLF recolector baleares'
$existente = Get-ScheduledTask -TaskName $nombreRecolector -ErrorAction SilentlyContinue
if ($existente) {
    Stop-ScheduledTask -TaskName $nombreRecolector -ErrorAction SilentlyContinue
    Disable-ScheduledTask -TaskName $nombreRecolector | Out-Null
}

Write-Host "La tarea '$nombreRecolector' queda deshabilitada: el portal excluye el rastreo automatico." -ForegroundColor Yellow
Write-Host "Se mantiene 'FACyLF catalogo baleares' para volver a comprobar respetuosamente robots.txt." -ForegroundColor Green
