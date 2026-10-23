<#
  Reinicia los recolectores multideporte para que adopten el codigo nuevo: cierra (por PID, nunca por patron
  en la propia linea de ordenes) el supervisor y sus recolectores, y vuelve a lanzar la tarea.
  La cola es reanudable: no se pierde ni se repite nada.
  Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\multideporte\reiniciar-multideporte.ps1
#>
$procesos = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'node.exe' -and ($_.CommandLine -like '*supervisor-multideporte.mjs*' -or $_.CommandLine -like '*recolector-multideporte.mjs*arrancar*')
}
foreach ($p in $procesos) { Write-Host "cierro $($p.ProcessId)"; Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 3
Start-ScheduledTask -TaskName 'FACyLF multideporte'
Write-Host 'Recolectores multideporte relanzados.'
