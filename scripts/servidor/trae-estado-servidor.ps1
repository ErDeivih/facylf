<#
  Trae una foto del servidor al PC para revisarla (Claude la lee en estado\servidor-ahora.txt).

  SOLO LEE en el servidor. Copia foto-para-revision.sh a /tmp del servidor por scp y lo ejecuta por ssh.
  Nada de comillas anidadas ni signos de dolar dentro de la orden ssh (trampa de PowerShell): todo lo
  complicado vive en el .sh.

  Uso:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\servidor\trae-estado-servidor.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\servidor\trae-estado-servidor.ps1 -Alias servidor-ts
#>
param([string]$Alias = 'servidor')

$ErrorActionPreference = 'Continue'
# ssh devuelve UTF-8: sin esto PowerShell 5 lo lee como OEM y las tildes llegan rotas.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$sh = Join-Path $PSScriptRoot 'foto-para-revision.sh'
$dir = Join-Path $raiz 'estado'
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$salida = Join-Path $dir 'servidor-ahora.txt'
$tmp = Join-Path $dir 'servidor-ahora.tmp'

"PC $(Get-Date -Format s) -> $Alias" | Out-File -FilePath $tmp -Encoding utf8
scp -q -o BatchMode=yes -o ConnectTimeout=10 $sh "${Alias}:/tmp/foto-crlf.sh" 2>&1 | Out-File -FilePath $tmp -Append -Encoding utf8
# tr quita posibles CR si el .sh llego con finales de linea de Windows.
ssh -o BatchMode=yes -o ConnectTimeout=10 $Alias "tr -d '\r' < /tmp/foto-crlf.sh > /tmp/foto-para-revision.sh && bash /tmp/foto-para-revision.sh" 2>&1 |
  Out-File -FilePath $tmp -Append -Encoding utf8
Move-Item -Force $tmp $salida
Write-Host "Foto guardada en $salida"
