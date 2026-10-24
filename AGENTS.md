# AGENTS.md — facylf

Fútbol no profesional de España: recogida, base canónica e informes. Instancia **privada**.

**Primero, las reglas que valen para todo el repositorio:** [`CLAUDE.md`](CLAUDE.md):
- no inventar datos;
- desconocido ≠ 0;
- identidad con contexto;
- no publicar nombres de menores;
- no tocar migraciones aplicadas;
- no cambiar el ritmo de los recolectores como efecto lateral.

## ¿A qué vienes?

| Si vienes a… | Lee, en este orden |
|---|---|
| **Operar la recogida** (DeepSeek u otro agente de operación) | [`docs/plataforma-web/TRABAJO-CONTINUO-DEEPSEEK.md`](docs/plataforma-web/TRABAJO-CONTINUO-DEEPSEEK.md) → [`ESTADO-DEEPSEEK.md`](docs/plataforma-web/ESTADO-DEEPSEEK.md) → [`ENCARGO-DEEPSEEK-2026-10-11.md`](docs/plataforma-web/ENCARGO-DEEPSEEK-2026-10-11.md) |
| **Mejorar la web de informes** estudiando otros productos | [`docs/informes/MEJORAR-WEB-INFORMES.md`](docs/informes/MEJORAR-WEB-INFORMES.md) → el laboratorio `F:\EspacioCodigo\ProyectoServidor\rea-sandbox\estudiar-apps\OPERAR.md` |
| Pedir o generar un informe de equipo | [`docs/informes/PEDIR-INFORMES.md`](docs/informes/PEDIR-INFORMES.md) |
| La plataforma web pública (`apps/web`), el canónico o el importador | `.claude/skills/plataforma-web-futbol/SKILL.md` y `docs/plataforma-web/` |
| **La plataforma nacional** (todas las federaciones, fichas instantáneas, plan por fases) | [`docs/plataforma-web/PLATAFORMA-NACIONAL.md`](docs/plataforma-web/PLATAFORMA-NACIONAL.md) |
| **Terminar la web nueva** (fase C, etapas W0-W10, 24/10) | [`docs/plataforma-web/ENCARGO-WEB-DEEPSEEK-2026-10-24.md`](docs/plataforma-web/ENCARGO-WEB-DEEPSEEK-2026-10-24.md) · prototipo en [`docs/plataforma-web/prototipo/`](docs/plataforma-web/prototipo/) |
| **Revisar todo lo de Claude, hacer los commits y rematar** (23/10) | [`docs/plataforma-web/ENCARGO-DEEPSEEK-2026-10-23.md`](docs/plataforma-web/ENCARGO-DEEPSEEK-2026-10-23.md) + [`TRASPASO-DEEPSEEK-2026-10-23.md`](docs/plataforma-web/TRASPASO-DEEPSEEK-2026-10-23.md) |
| **Qué ejecutar, en qué orden** (migraciones 0023-0045, proyección, vigilancia, copias, usuarios) | [`docs/plataforma-web/PLAN-DEEPSEEK.md`](docs/plataforma-web/PLAN-DEEPSEEK.md) |
| **Qué datos da cada federación** y cómo se muestran según lo que haya | [`docs/plataforma-web/COBERTURA-FEDERACIONES.md`](docs/plataforma-web/COBERTURA-FEDERACIONES.md) |
| Panel de administración, observabilidad, publicidad | [`ADMINISTRACION.md`](docs/plataforma-web/ADMINISTRACION.md), [`PUBLICIDAD.md`](docs/plataforma-web/PUBLICIDAD.md) |
| **Rapidez de la base** (reglas para cualquier consulta nueva, banco de volumen) | [`docs/plataforma-web/RENDIMIENTO-BASE.md`](docs/plataforma-web/RENDIMIENTO-BASE.md) |
| **Casos raros de los datos** (minutos, A/B, traspasos, dobles amarillas, sanciones, árbitros, edad, posición) | [`docs/plataforma-web/CASUISTICAS.md`](docs/plataforma-web/CASUISTICAS.md) |
| Saber qué falta por recoger y por qué | [`docs/plataforma-web/REVISION-INGESTA-2026-10-11.md`](docs/plataforma-web/REVISION-INGESTA-2026-10-11.md) y [`CIERRE-DE-TEMPORADA.md`](docs/plataforma-web/CIERRE-DE-TEMPORADA.md) |
| **Sacar datos de `F:`** (el disco se está llenando) | [`docs/ESPACIO-EN-DISCO.md`](docs/ESPACIO-EN-DISCO.md) |

## Reparto de trabajo

- **David:** decisiones de producto, alcance y accesos.
- **DeepSeek:** operación, despliegues y tareas largas.
- **Claude:** código, lectores, auditorías y diagnóstico.
- **El agente de la web de informes:** estudio de referencias e implementación de mejoras de esa web.

Si encuentras trabajo que es de otro, apúntalo en su documento de estado; no lo hagas tú.

## No se hace nunca

- **EL SERVIDOR NO SE SOBRECARGA NI SE LE AGOTA LA RAM** (regla de David, 13/10/2026). Se cayó el 11/10 y el 13/10 por traer federaciones encadenadas con la flota ya al tope.
  - Una sola traída a la vez, de pocas temporadas en pocas (`trae-federacion-servidor.ps1` trae como mucho 4 por pasada), mejor de noche.
  - Antes y después de cada temporada se mide el servidor. El script lo hace solo y **espera o se para** si la memoria disponible baja de 3 GiB, la swap pasa de 1 GiB o la carga pasa de 14.
  - Nada de extracciones en paralelo, ni de `docker cp` o copias grandes en `/tmp` del servidor.
  - Si el servidor va justo, la recolección de las 19 federaciones va primero: lo nuestro espera.

- Commits sin que David los pida.
- `docker cp` de código.
- `docker compose up -d` sin lista de servicios.
- Tocar los ajustes del PC de David.
- Bajar la pausa entre peticiones a una web.
- Esquivar un bloqueo.
- Sacar del PC datos con nombres de menores.
