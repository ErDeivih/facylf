@echo off
REM Espera a que expire la pausa de cortes¡a de Valencia (hasta 2026-09-26T13:56:08Z = 15:56 local)
REM y la arranca. La pausa la puso el propio recolector por un HTTP 503 de la fuente valenciana.
echo [%DATE% %TIME%] esperando a que expire la pausa de Valencia... >> descargas-valencia\recolector-local\worker-valencia.log
timeout /t 2100 /nobreak > nul
echo [%DATE% %TIME%] lanzando Valencia tras la pausa >> descargas-valencia\recolector-local\worker-valencia.log
cd /d F:\EspacioCodigo\facylf
set FACYLF_MEMORIA_GB=3
set FACYLF_RESERVA_GB=1
set FACYLF_TURNO_PLAZA_MIN=20
set FACYLF_CHROME_HEADLESS=1
node scripts\recolector-valencia.mjs arrancar >> descargas-valencia\recolector-local\worker-valencia.log 2>&1
