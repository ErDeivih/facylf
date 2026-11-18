# Observabilidad

1. Copia `.env.example` a `.env` y rellena Grafana y el DSN de sólo lectura.
2. Ajusta `prometheus.yml`: cambia `TU_DOMINIO` por el real.
3. Levanta el stack web (`deploy/docker-compose.yml`) y luego:
   `docker compose -f deploy/observabilidad/docker-compose.yml up -d`.
4. Abre Grafana en `http://127.0.0.1:3002` (por SSH o túnel, no lo publiques a Internet).
5. Alertas: añade contact points en Grafana; mínimo web caída, 5xx, disco, conexiones y backup.

No se publica ningún puerto de observabilidad a Internet: todos escuchan en `127.0.0.1`.

Copia: `deploy/backup.sh` (cron diario, retención 14 días, métrica `facylf_backup_ultimo_segundos`).
