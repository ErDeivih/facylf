---
name: plataforma-web-futbol
description: Diseña, implementa o revisa la plataforma web de inteligencia de fútbol federado de este repositorio. Úsala al tocar apps/web, el modelo canónico, búsquedas, perfiles, estadísticas, publicación de competiciones, rendimiento, seguridad, accesibilidad o despliegue. No la uses para modificar los recolectores o parsers salvo que el cambio sea estrictamente necesario para el contrato de datos de la web.
---

# Plataforma web de fútbol

Construye una herramienta privada de consulta y scouting, no un escaparate de métricas sin contexto.
Antes de cambiar arquitectura o navegación, lee [ARQUITECTURA.md](../../../docs/plataforma-web/ARQUITECTURA.md).

## Enrutamiento de contexto

Carga sólo lo que necesite la tarea. Si vas a tocar interfaz o pruebas, las skills hermanas
`diseno-web-futbol` y `calidad-web-futbol` llevan sus propias reglas.

| Vas a tocar | Lee |
|---|---|
| tablas, identidades, procedencia, calidad, métricas | [MODELO-DATOS.md](../../../docs/plataforma-web/MODELO-DATOS.md) |
| una federación nueva, un campo que falta, qué publica cada fuente | [FEDERACIONES-MATRIZ.md](../../../docs/plataforma-web/FEDERACIONES-MATRIZ.md) |
| el importador, el mapeo desde SQLite, un valor nuevo en la cola | [IMPORTADOR-SQLITE.md](../../../docs/plataforma-web/IMPORTADOR-SQLITE.md) |
| construir el importador de cero (encargo en curso) | [ENCARGO-IMPORTADOR.md](../../../docs/plataforma-web/ENCARGO-IMPORTADOR.md) |
| navegación, filtros, páginas, gráficos, accesibilidad | [PRODUCTO-UX.md](../../../docs/plataforma-web/PRODUCTO-UX.md) |
| aspecto, tokens, componentes, densidad, tema oscuro | [SISTEMA-DISENO.md](../../../docs/plataforma-web/SISTEMA-DISENO.md) |
| textos, abreviaturas, cómo se nombra un dato ausente | [CONTENIDO-MICROCOPIA.md](../../../docs/plataforma-web/CONTENIDO-MICROCOPIA.md) |
| estructura de `apps/web`, servidor/cliente, caché, searchParams | [FRONTEND.md](../../../docs/plataforma-web/FRONTEND.md) |
| consultas, índices, paginación, tiempos de respuesta | [RENDIMIENTO-BUSQUEDA.md](../../../docs/plataforma-web/RENDIMIENTO-BUSQUEDA.md) |
| PostgreSQL local, migraciones, roles, conexiones | [ENTORNO-LOCAL.md](../../../docs/plataforma-web/ENTORNO-LOCAL.md) |
| pruebas, muestras de oro, presupuestos, E2E | [CALIDAD-PRUEBAS.md](../../../docs/plataforma-web/CALIDAD-PRUEBAS.md) |
| autenticación, privacidad, menores, despliegue, copias | [SEGURIDAD-OPERACION.md](../../../docs/plataforma-web/SEGURIDAD-OPERACION.md) |
| qué toca hacer ahora y con qué criterio se cierra | [PLAN-DESARROLLO.md](../../../docs/plataforma-web/PLAN-DESARROLLO.md) |

Las decisiones cerradas están en [decisiones/](../../../docs/plataforma-web/decisiones). No las
cambies sin escribir un ADR nuevo que sustituya al anterior.

## Invariantes

1. La identidad externa siempre incluye federación y su contexto. Nunca presupongas que un código
   de otra fuente o temporada es global.
2. SQLite y los archivos comprimidos son evidencia de ingestión; la web objetivo consulta una base
   canónica separada. No acoples nuevas páginas a detalles de una federación.
3. Nombre no significa identidad. Las coincidencias entre temporadas generan enlaces con confianza
   y trazabilidad; una ambigüedad no se fusiona silenciosamente.
4. No atribuyas partido, titularidad, minutos, posición, asistencia o edad que la fuente no permita
   demostrar. `convocados` no equivale a `titulares` ni a `jugó`.
5. El marcador y la clasificación oficiales prevalecen. Conserva también el desglose de eventos y
   anota discrepancias, sin reescribir la fuente.
6. Toda estadística muestra cobertura y calidad suficientes para interpretarla.
7. Las rutas y filtros son compartibles mediante URL; no escondas el estado principal sólo en el
   navegador.
8. Las consultas usan parámetros, límites y paginación. Una funcionalidad no está terminada sin
   medir su consulta representativa y probar estados vacío, parcial, erróneo y cargando.
9. Mantén Server Components por defecto. Usa componentes cliente sólo para interacción o gráficos
   que realmente los necesiten.
10. No publiques datos personales —especialmente de menores— ni abras la instancia a Internet por
    el mero hecho de que el código funcione. Aplica la matriz de visibilidad documentada.
11. Que una fuente no publique un dato es un hecho declarado y versionado por temporada en
    `core.source_capability`, no un hueco inferido. Madrid sí ofrece fichas de acta, aunque su
    cobertura histórica es parcial. Toda funcionalidad declara qué capacidades necesita y combina
    esa declaración con la cobertura real del grupo.
12. Salamanca es la línea base, no el objetivo. El modelo, las consultas y las pantallas se validan
    contra fuente rica, fuente sin actas, JSON, adaptador propio, cobertura baja y catálogo masivo.
13. La web se construye mientras los datos llegan. La unidad de publicación es el grupo: en cuanto
    tiene una jornada cerrada es navegable. Diseña cada vista primero en su estado vacío y parcial.

## Forma de trabajar

Antes de implementar, identifica el recorrido de usuario, contrato de datos, nivel de cobertura y
presupuesto de rendimiento. Reutiliza componentes y consultas del dominio; evita páginas especiales
por federación. Si la consulta necesita recorrer varias bases SQLite o agregar actas en cada petición,
primero crea la proyección canónica o agregada apropiada.

Al terminar, ejecuta como mínimo comprobación de tipos, pruebas afectadas y una medición de la ruta o
consulta cambiada. Actualiza los documentos si introduces una decisión que cambie el modelo, la
visibilidad, una métrica o el despliegue.
