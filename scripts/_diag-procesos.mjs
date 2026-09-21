#!/usr/bin/env node
/** Lista todos los procesos node/powershell del proyecto con su línea de comandos y hora de inicio. */
import { execFileSync } from 'node:child_process';

const ps = `Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('node.exe','powershell.exe','pwsh.exe','cmd.exe') } | ForEach-Object {
  $cl = [string]$_.CommandLine
  if ($cl -notmatch 'facylf') { return }
  $rol = 'otro'
  if ($cl -match 'recolector-valencia.mjs') { $rol = 'valencia/madrid-isquad' }
  elseif ($cl -match 'recolector-cataluna-datos.mjs') { $rol = 'cataluna-datos' }
  elseif ($cl -match 'recolector-cataluna.mjs') { $rol = 'cataluna-catalogo' }
  elseif ($cl -match 'recolector-local.mjs') { $rol = 'pnfg' }
  elseif ($cl -match 'visor-workers.mjs') { $rol = 'visor' }
  elseif ($cl -match 'sondeo') { $rol = 'sondeo' }
  elseif ($cl -match 'ejecutar-') { $rol = 'supervisor-ps1' }
  $perfil = ''
  if ($cl -match 'perfiles\\\\([a-z-]+)') { $perfil = $Matches[1] }
  [pscustomobject]@{ rol = $rol; perfil = $perfil; pid = $_.ProcessId; inicio = ('{0:HH:mm:ss}' -f $_.CreationDate); cmd = $cl }
} | Sort-Object rol, perfil | Format-Table -AutoSize | Out-String -Width 220`;

const salida = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
console.log(salida);
