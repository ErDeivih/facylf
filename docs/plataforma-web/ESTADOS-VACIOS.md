# Estados vacíos, de espera y de error: catálogo por pantalla

Estado: 23/10/2026. Amplía [CONTENIDO-MICROCOPIA.md](CONTENIDO-MICROCOPIA.md) §2 y §7 (las palabras siguen
siendo las de allí). Datos: migración 0044 (`analytics.estado_secciones`, `estado_secciones_equipo`) y 0043
(`app.estado_acceso`). Pruebas: `pruebas/sql/m44.mjs`, `m43.mjs`.

**Regla**: ninguna sección se pinta vacía y muda. O hay datos, o en su sitio va una **tarjeta de estado** que
dice qué pasa y qué hacer, en ese orden. Y nunca se decide por federación en el código: lo dice la base.

## 1. La tarjeta de estado (componente `EstadoSeccion`)

- Ocupa el sitio de la sección, con su mismo título (h2), para que la página no cambie de forma.
- Contenido: etiqueta corta (chip) + texto largo (`mensaje` de la base) + como mucho una acción.
- `role="status"` y sin `aria-live` (se pinta con la página, no aparece después). Contraste AA. Sin iconos
  decorativos ni emojis; sin exclamaciones ni disculpas.
- Estados de la base → etiqueta canónica:

| `estado` (0044) | Etiqueta | Cuándo | Acción |
|---|---|---|---|
| `sin_datos` | **Sin calendario** | la competición aún no tiene partidos publicados | «Ver otras competiciones de la categoría» |
| `pronto` | **Empieza el dd/mm** | hay calendario y aún no se ha jugado nada (`fecha`) | «Avísame cuando empiece» (favorito con aviso) |
| `pendiente` | **Pendiente** | ya se jugó según el calendario, sin resultados publicados | ninguna (no depende del usuario) |
| `no_publica` | **No publicado** | la competición no publica ese dato (capacidad medida, 0032) | «Qué datos hay en esta federación» → ficha |
| `ok` | — | se pinta la sección | — |

Capacidad sin medir = `ok`: se pinta lo que haya (desconocido no es vacío).

## 2. Por pantalla

| Pantalla | Sección | De dónde sale | Texto (si no hay datos) |
|---|---|---|---|
| Competición / grupo | calendario, resultados, clasificación, alineaciones, goleadores, minutos, tarjetas, árbitros, campos | `estado-secciones(edición, grupo)` | el `mensaje` de la fila |
| Equipo | partidos, clasificación, plantilla, goleadores, minutos, tarjetas | `estado-secciones-equipo(team_entry)` | ídem («no se conoce la plantilla del equipo») |
| Equipo | gráficos (curva, forma, goles por tramo) | menos de 3 partidos jugados | «Hacen falta al menos 3 partidos jugados para ver la evolución. Lleva 1.» |
| Jugador | temporada sin minutos | `jugador_temporada` con convocatorias y sin minutos | «Aparece en 3 convocatorias. Ninguna acta permite saber si jugó.» |
| Jugador | menor sin permiso | `es_menor` y sin `ver_menores_nombres` | «Ficha de un jugador menor de edad: su nombre sólo lo ven las cuentas autorizadas.» (sin anuncios) |
| Acta | alineaciones / cambios / tarjetas | acta del partido | «El acta de este partido no recoge los cambios.» (caso concreto, no de la competición) |
| Acta | resultado | `goles_local is null` | **Sin resultado** «La federación aún no ha publicado el resultado de este partido.» |
| Buscador | sin resultados | `total = 0` | «No hay nada con *pereira*. Prueba con un solo apellido o quita la federación.» |
| Buscador | demasiados | `total = 5000` (tope, 0041) | «Más de 5.000 resultados: se muestran los más activos. Añade un apellido o una federación.» |
| Ojeo | sin resultados | filtros | «Ningún jugador cumple los 5 filtros. *Minutos ≥ 900* deja 0.» + «Quitar ese filtro» |
| Rankings | federación sin goleadores | `no_publica` de su edición | tarjeta «No publicado» en lugar de la tabla |
| Mi panel | sin favoritos | `mis-accesos` vacío | «Aún no sigues nada. Busca tu equipo y pulsa la estrella: aquí verás su último resultado y el próximo partido.» + buscador |
| Avisos | bandeja vacía | `bandeja-avisos` vacío | «No tienes avisos. Te llegarán cuando cambie un horario o se publique un resultado de lo que sigues.» + «Elegir qué avisos recibo» |
| Avisos | push no disponible | navegador sin push o permiso denegado | «Este navegador no permite avisos. Puedes recibirlos por correo.» |
| Cuenta | pendiente / rechazado / bloqueado / caducado / 2FA | `app.estado_acceso` (acceso.ts) | textos de `docs/plataforma-web/codigo/acceso.ts` |
| Panel admin | sin pendientes, sin casos, sin alertas | consultas de `admin.ts` vacías | «Nada pendiente.» (una línea; el vacío aquí es la buena noticia) |
| Cualquiera | error recuperable | excepción de consulta | «No se ha podido cargar la clasificación. Vuelve a intentarlo. Incidencia `a3f92c`.» (el código es el id de `ops.evento_app`) |
| Cualquiera | sin conexión | `navigator.onLine` falso | franja: «Sin conexión: estás viendo la última versión guardada.» (service worker) |

## 3. Esperas (velocidad percibida)

- Esqueletos del **mismo alto** que el contenido final (tabla: cabecera + 10 filas grises; gráfico: el marco
  con sus ejes). Nunca un spinner en el centro de una página.
- Las páginas públicas salen de la caché por etiquetas (cache.ts): en la práctica el esqueleto sólo se ve en
  lo personal (Mi panel, avisos) y en el ojeo.
- Si algo tarda más de 3 s: el esqueleto dice «Cargando…» en texto (lectores de pantalla) y a los 10 s ofrece
  «Volver a intentar».

## 4. Cómo se prueba

- `m44.mjs`: los cinco estados con una competición inventada (sin partidos, calendario futuro, pasada la fecha
  sin resultados, sólo resultados, alineaciones sin cambios) y la página de equipo.
- E2E (fase C): una competición de cada `nivel` (completo, alineaciones, resultados, calendario) y comprobar que
  ninguna sección sale vacía sin tarjeta (`expect(page.locator('section:empty')).toHaveCount(0)`).
