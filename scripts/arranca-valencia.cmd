@echo off
cd /d F:\EspacioCodigo\facylf
set FACYLF_MEMORIA_GB=3
set FACYLF_RESERVA_GB=1
set FACYLF_TURNO_PLAZA_MIN=20
set FACYLF_CHROME_HEADLESS=1
node scripts\recolector-valencia.mjs arrancar >> descargas-valencia\recolector-local\worker-valencia.log 2>&1
