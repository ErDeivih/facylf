# Memoria privada que gastan los procesos DE ESTE PROYECTO, en GB, con un solo número por la salida.
#
# En su propio fichero y no dentro de un `-Command` de una línea: una medición embebida se rompe al pasarla
# (comillas, `$_`, acentos) y falla en silencio devolviendo vacío. Aquí la salida es un número y nada más.
#
# Uso: powershell -NoProfile -File scripts/medir-memoria-proyecto.ps1 [raiz]

param([string]$Raiz = 'F:\EspacioCodigo\facylf')

# No se suma WorkingSet64: Chrome comparte DLL, caché y páginas entre sus muchos procesos, y
# sumarlas una vez por proceso infla el consumo varios GB (14,91 GB frente a 8,87 GB medidos
# el 20/09/2026). PrivateMemorySize64 es la aproximación correcta al coste atribuible a la flota.
$suma = Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -and $_.CommandLine.Contains($Raiz) -and
    ($_.Name -eq 'node.exe' -or $_.Name -eq 'chrome.exe' -or $_.Name -eq 'chromedriver.exe')
  } |
  ForEach-Object { (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).PrivateMemorySize64 } |
  Measure-Object -Sum

if ($null -eq $suma.Sum -or $suma.Sum -eq 0) { Write-Output '0' } else { Write-Output ([math]::Round($suma.Sum / 1GB, 2)) }
