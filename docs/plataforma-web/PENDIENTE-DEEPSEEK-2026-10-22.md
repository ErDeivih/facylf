# Para DeepSeek, MÁS ADELANTE (preparado por Claude el 22/10/2026; David decide cuándo se pasa)

Hoy Claude ha trabajado sin DeepSeek. Lo del **PC ya está en marcha solo**: los workers cogen el código en cada turno y el enlace lanza el vigía. Lo único que necesita una mano es esto:

1. **Desplegar al servidor** (`scripts\claude\despliega-codigo-servidor.ps1`, con las 4 huellas OK). Lleva:
   - `recolector-local.mjs`: la segunda barrera contra las URLs de otro portal (`urlEnPortal`) y el repaso de jornadas de la temporada en curso vacías o sin marcadores.
   - `recolector-cataluna-datos.mjs`: no aplica al servidor, pero va igual.
   - El vigía **no** necesita despliegue: va por el enlace.
2. **Canal de avisos al móvil.** Es el mismo de `PLAN-DEEPSEEK §B1`: Telegram (`ALERTAS_TELEGRAM_TOKEN` y `ALERTAS_TELEGRAM_CHAT`) o ntfy, en el entorno del PC donde corre la tarea «FACyLF enlace Claude». Sin canal, los avisos del vigía sólo quedan en `estado/vigia/alertas.log`.
   - **Ojo:** el monitor del servidor (`facylf-monitor`) avisa a `http://host.docker.internal:8085/facylf`, pero el contenedor `ntfy` lleva parado desde finales de septiembre. Hoy sus avisos no llegan a nadie.
3. **Comprobación:** `estado/claude/vigia.txt` debe mostrar las dos máquinas en cada pasada (cada 10 min). Si aparece «vigía del servidor: no se pudo medir», pega `respuestas/` de una petición con `scripts/vigia-colas.mjs --solo-medir` en el contenedor monitor.
