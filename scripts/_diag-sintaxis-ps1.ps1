# Comprueba que un script de PowerShell se puede analizar sin errores de sintaxis.
param([Parameter(Mandatory = $true)][string]$Ruta)
$tokens = $null
$errores = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path -LiteralPath $Ruta).Path, [ref]$tokens, [ref]$errores) | Out-Null
if ($errores -and $errores.Count) {
    $errores | ForEach-Object { Write-Host "ERROR: $($_.Message) (línea $($_.Extent.StartLineNumber))" }
    exit 1
}
Write-Host "sintaxis PowerShell OK: $Ruta"
