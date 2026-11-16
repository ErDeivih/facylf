# ingesta-nocturna.ps1 -- pasada nocturna de ingesta y actualizacion de resultados de todas las ligas.
#
# Pensada para el Programador de tareas de Windows, una vez al dia (03:40). Hace UNA cosa: importar al
# canonico lo que los recolectores ya han dejado en las colas de las 19 federaciones, con un limite de
# tiempo para no pisar la manana. No arranca recolectores, no cambia pausas ni workers, no toca el servidor.
#
# Es idempotente por dos vias:
#   · `importar-masivo.mjs` salta las unidades ya importadas y hace upsert por clave natural (no duplica);
#   · este script deja una marca por noche y no repite si ya termino bien hace menos de 6 horas.
#
# Registro: estado/ingesta-nocturna/AAAA-MM-DD.log (una linea por paso, con la salida del importador)
#           estado/ingesta-nocturna.json (ultima pasada: fecha, antes/despues, codigo)
#
# Uso:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ingesta-nocturna.ps1 -Simular
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ingesta-nocturna.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ingesta-nocturna.ps1 -Minutos 40

param(
  [int]$Minutos = 25,
  [string]$Temporada = '2026-27',
  [switch]$Simular
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$Raiz = (Get-Location).Path
$Estado = Join-Path $Raiz 'estado'
$Carpeta = Join-Path $Estado 'ingesta-nocturna'
$Hoy = Get-Date -Format 'yyyy-MM-dd'
$Log = Join-Path $Carpeta "$Hoy.log"
$Marca = Join-Path $Estado 'ingesta-nocturna.json'
$Candado = Join-Path $Estado 'ingesta-nocturna.lock'
$CandadoHorario = Join-Path $Estado 'actualizacion.lock'
New-Item -ItemType Directory -Force -Path $Carpeta | Out-Null

function Log([string]$texto) {
  $linea = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'), $texto
  Add-Content -LiteralPath $Log -Value $linea -Encoding utf8
  Write-Output $linea
}

function CuentaCanonica {
  $salida = & docker exec facylf-postgres psql -U facylf_admin -d facylf -Atc `
    "select (select count(*) from core.match)||'|'||(select count(*) from core.match_report)||'|'||(select count(*) from core.match where goles_local is not null)" 2>&1
  if ($LASTEXITCODE -ne 0) { return $null }
  return ($salida | Out-String).Trim()
}

try {
  Log "ingesta nocturna: inicio (temporada $Temporada, maximo $Minutos min)"

  # 0. Si la pasada horaria esta importando (candado de menos de 45 min), no se solapa.
  if (Test-Path $CandadoHorario) {
    $edadHoraria = ((Get-Date) - (Get-Item $CandadoHorario).LastWriteTime).TotalHours
    if ($edadHoraria -lt 0.75) {
      Log ("ya hay una actualizacion en curso (candado de {0:N1} h); no se toca nada" -f $edadHoraria)
      exit 0
    }
  }

  # 1. Si esta noche ya termino bien, no se repite.
  if (Test-Path $Marca) {
    try {
      $marca = Get-Content -LiteralPath $Marca -Raw | ConvertFrom-Json
      if ($marca.fecha -eq $Hoy -and $marca.codigo -eq 0) {
        $horas = ((Get-Date) - [datetime]$marca.hecho_en).TotalHours
        if ($horas -lt 6) { Log ("la pasada de hoy ya termino bien a las {0}; no se repite" -f $marca.hecho_en); exit 0 }
      }
    } catch { Log 'AVISO: marca ilegible; se trata como si no hubiera pasado' }
  }

  # 2. Preflight: PostgreSQL vivo.
  & docker inspect -f '{{.State.Running}}' facylf-postgres 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { Log 'FALLO: el contenedor de PostgreSQL no esta disponible'; exit 2 }
  if ((& docker inspect -f '{{.State.Running}}' facylf-postgres).Trim() -ne 'true') {
    Log 'FALLO: PostgreSQL no esta arrancado'; exit 2
  }

  $antes = CuentaCanonica
  if ($null -eq $antes) { Log 'FALLO: no se pudo contar el canonico'; exit 2 }
  Log "antes: partidos|actas|con resultado = $antes"

  if ($Simular) {
    Log "SIMULACION: se ejecutaria node scripts\importar-masivo.mjs --temporadas $Temporada --minutos $Minutos"
    exit 0
  }

  Set-Content -LiteralPath $Candado -Value (Get-Date -Format 'o') -Encoding ascii
  $codigo = 0
  try {
    Log "importando: node scripts\importar-masivo.mjs --temporadas $Temporada --minutos $Minutos"
    & node 'scripts\importar-masivo.mjs' --temporadas $Temporada --minutos $Minutos 2>&1 |
      ForEach-Object { Add-Content -LiteralPath $Log -Value $_ -Encoding utf8 }
    $codigo = $LASTEXITCODE
  } finally {
    Remove-Item -LiteralPath $Candado -Force -ErrorAction SilentlyContinue
  }

  $despues = CuentaCanonica
  Log "despues: partidos|actas|con resultado = $despues"
  Log "importador termino con codigo $codigo"

  @{
    fecha = $Hoy
    temporada = $Temporada
    minutos = $Minutos
    antes = $antes
    despues = $despues
    codigo = $codigo
    hecho_en = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')
  } | ConvertTo-Json | Set-Content -LiteralPath $Marca -Encoding utf8

  if ($codigo -ne 0) { Log "FALLO: el importador devolvio $codigo"; exit 3 }
  Log 'ingesta nocturna: termino bien'
} catch {
  Log ("FALLO: {0}" -f $_.Exception.Message)
  exit 2
}
exit 0
