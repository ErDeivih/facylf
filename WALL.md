# WALL â€” facylf

Derivado del bloque **2** de `F:\EspacioCodigo\_flujo-dsh\MAPA-DE-OBJETIVOS.md` (fuente de verdad,
05/11/2026). AquÃ­ se marcan las casillas; la siguiente tarea ya estÃ¡ escrita. No se para: si algo se
bloquea, se pasa a la siguiente casilla.

**Objetivo final**: todas las pÃ¡ginas del prototipo, funcionando con datos reales de CyL y con backend
detrÃ¡s. Se acabaron las explicaciones: se implementa.

## Falta (por orden)

- [x] **1. Acta del partido.** Alineaciones, goles, tarjetas, cambios, Ã¡rbitro, campo y contexto del
  partido, contra `prototipo/Acta.dc.html`, con datos del canÃ³nico y enlace desde la jornada.
  Estado actual: **hecho y validado (05/11/2026)**. Ruta
  `/explorar/acta/[id]` (id de `core.match`); consulta nueva `acta-del-partido` en
  `apps/web/src/consultas/partidos.ts` (una sola consulta: partido, eventos, alineaciones, Ã¡rbitros,
  cuerpo tÃ©cnico y enfrentamientos en JSON; ~8 ms medidos, presupuesto 500 ms, plan indexado y sin
  `Seq Scan` en tablas de hechos); componentes en `apps/web/src/componentes/acta/`; enlace desde el
  detalle de Jornada sÃ³lo para partidos con acta publicada; pruebas en
  `apps/web/test/acta-pantalla.test.ts` (35). 404 real para id inexistente, partido sin acta y acta
  `unavailable`. Axe 0 (1440 y 360, claro y oscuro), sin desplazamiento horizontal del documento;
  capturas en `tmp/acta-*.png`. Pendiente: validaciÃ³n del Lead y los enlaces a ficha de jugador y de
  equipo desde el acta (los integra el Lead).

- [x] **2. Calendario y jornadas completos.** Calendario del grupo y de la competiciÃ³n por jornadas y
  fechas, con navegaciÃ³n completa, estados (jugado/programado/sin resultado), filtros y enlaces a
  jornada y acta. Estado actual: **hecho y validado (05/11/2026)**. Rutas
  `/explorar/competicion/[id]/calendario` y `/explorar/calendario`; calendario del grupo (todas las
  jornadas, filtros jornada/equipo/estado, enlaces a jornada y acta) y global (federaciÃ³n, temporada,
  jornada, fechas, bÃºsqueda; paginado de 60). Consulta en `consultas/calendario.ts`; medidas 43â€“304 ms
  (presupuesto 800). Pruebas 52 y `tsc` verde; axe 0 y sin desbordamiento en 1440/360 claro y oscuro.
  PestaÃ±a Â«CalendarioÂ» integrada en `CabeceraCompeticion`.

- [x] **3. Ficha de jugador, de equipo y de club.** Tres fichas contra los artboards del prototipo
  (`Jugador`, `Equipo`, `Club`), con plantilla, trayectoria, estadÃ­sticas, Ãºltimos partidos y contexto.
  Estado actual: **hecho y validado (05/11/2026)**. Rutas
  `/explorar/jugador/[id]` (id de `core.person`), `/explorar/equipo/[id]` (id de `core.team_entry`) y
  `/explorar/club/[id]` (id de `core.club`); tres consultas nuevas en `apps/web/src/consultas/fichas.ts`
  (Ãºltimos partidos de una persona, goles por tramo, escudo del club) sobre las de `entidades.ts`;
  componentes en `apps/web/src/componentes/fichas/`; pruebas en `apps/web/test/fichas-pantalla.test.ts`
  (40). Medido con el rol de lectura: jugador 3 consultas Â· 175 ms, equipo 5 Â· 58 ms, club 3 Â· 59 ms.
  Axe 0 (1440 y 360) y sin desplazamiento horizontal del documento a 360/400; 404 real. Capturas en
  `tmp/ficha-*.png`. Pendiente: enlaces desde la cabecera del sitio y desde Jornada/Acta (los integra
  el Lead) y decidir si la ficha de jugador enseÃ±a el nombre corto de la federaciÃ³n.

- [x] **4. Selector de temporada y de competiciÃ³n Â«inventadaÂ».** Poder pedir, por ejemplo, Â«Segunda
  Juvenil 2017, BurgosÂ» y obtener calendario, clasificaciÃ³n, jornadas, actas, estadÃ­sticas y grÃ¡ficos.
  Si la competiciÃ³n o temporada no existen en el canÃ³nico, hay que crearlas o encontrarlas (ingesta,
  archivo, histÃ³rico), no fingir. Estado actual: **hecho y validado (05/11/2026)**. Ruta
  `/explorar/competiciones`, filtros de federaciÃ³n/temporada histÃ³rica/categorÃ­a/modalidad/gÃ©nero/
  provincia/nivel/texto, paginaciÃ³n y total real; Â«Segunda Juvenil 2017, BurgosÂ» encuentra el grupo
  30665 de 2016-17 y lo abre con su temporada seleccionada; Â«ExplorarÂ» de la cabecera ya apunta ahÃ­.
  La ficha histÃ³rica ya ofrece calendario, clasificaciÃ³n, jornadas, actas y estadÃ­sticas (objetivos 1,
  2, 5).

- [x] **5. EstadÃ­sticas y pÃ¡ginas de grÃ¡ficos.** PÃ¡ginas de estadÃ­sticas y grÃ¡ficos del prototipo
  (equipos, jugadores, competiciÃ³n), con datos y backend detrÃ¡s. Estado actual: **hecho y validado
  (05/11/2026)**. Rutas nuevas `/explorar/estadisticas` (federaciÃ³n y
  temporada, con bÃºsqueda de competiciÃ³n) y `/explorar/competicion/[id]/estadisticas` (tambiÃ©n grupos
  histÃ³ricos como 30665, 2016-17); grÃ¡ficos SVG sin librerÃ­a con resumen en texto, tabla equivalente y
  colores del sistema (puntos acumulados por jornada, goles por mes, goles por tramo, reparto de
  resultados, casa/fuera, forma, goleadores y disciplina); estados de carga y Â«sin datosÂ» explÃ­citos
  (el 30665 no tiene tarjetas publicadas y asÃ­ se dice; una temporada que no existe no se sustituye por
  otra). Consultas nuevas en `apps/web/src/consultas/estadisticas.ts`, reglas puras en
  `apps/web/src/lib/estadisticas.ts`, componentes en `apps/web/src/componentes/estadisticas/` y
  pruebas en `apps/web/test/estadisticas-pantalla.test.ts` (42). Medido: resumen de CyL 2026-27
  103 ms (2025-26, 420 ms), goleadores 13 ms, eventos de un grupo 3â€“5 ms, opciones 2 ms; TTFB de
  pÃ¡gina 143â€“216 ms. Axe 0 y sin desbordamiento en 1440/400/360 claro y 1440 oscuro. PestaÃ±a
  Â«EstadÃ­sticasÂ» integrada en `CabeceraCompeticion`.

- [x] **6. Backend e infraestructura para servir todo.** Endpoints, cachÃ© y consultas que respondan
  rÃ¡pido para todas las pÃ¡ginas; medido, no supuesto. Estado actual: **hecho y validado (05/11/2026)**.
  Siete endpoints en `/api/v1` (Ã­ndice, competiciÃ³n,
  acta, calendario, fichas de equipo/jugador/club) que reutilizan las consultas del catÃ¡logo; ETag/304,
  `Cache-Control` pÃºblico con `stale-while-revalidate`, `X-Cache` para medir hit/miss y lÃ­mite de 300
  peticiones por minuto e IP con 429 y `Retry-After`. CachÃ© por etiquetas (`unstable_cache` +
  `revalidateTag`), `POST /api/revalidar` y consumo de la cola cada minuto en `instrumentation.ts`.
  Medido: MISS 46â€“84 ms p50, HIT 31â€“38 ms p50, 304 49â€“103 ms p50 (servidor de desarrollo, mÃ¡quina
  compartida); las 14 consultas que sirven la API estÃ¡n dentro de presupuesto y sin `Seq Scan` en
  tablas de hechos (no hace falta Ã­ndice nuevo ni migraciÃ³n). Contrato en
  `docs/plataforma-web/API.md`; pruebas `apps/web/test/api-v1.test.ts` (26). Nota: la cola de
  invalidaciones tenÃ­a 1,7 M de etiquetas pendientes de la proyecciÃ³n histÃ³rica; se vacÃ­a sola a
  2000/min, no se ha borrado nada.

- [x] **7. Registro de usuarios con favoritos.** Registro real, sesiÃ³n, favoritos de clubes, equipos y
  jugadores y accesos rÃ¡pidos a horarios y resultados. Estado actual: **hecho y validado (05/11/2026)**.
  Alta real por invitaciÃ³n (`app.ajuste.registro_modo`), contraseÃ±a
  con scrypt, sesiÃ³n en cookie `httpOnly` con token hasheado en `app.sesion` (migraciones 0057/0058),
  entrada, cierre, freno de intentos, `/mi-panel` con favoritos y estrella en las fichas de club,
  equipo y jugador. Sin Better Auth y sin instalar dependencias. Capturas y axe en `pruebas/cuentas/`;
  detalle en `docs/plataforma-web/CUENTAS.md`. Pruebas 94/94 (unitarias y flujo real contra
  PostgreSQL).

## RevisiÃ³n de las capturas (David, 05/11/2026)

- [x] **Marca**: logo propio y nombre de producto; pie Â«archivo privadoÂ» retirado; navegaciÃ³n explicada.
  Hecho como **Fondo Popular** con logotipo de monograma FP, tagline, favicon, pie sustituido por un
  enlace a Publicidad y descriptores en la navegaciÃ³n. El nombre se cambia en `componentes/marca/marca.ts`.
- [x] **Jornadas**: tablas por jornada con resultados, equipos y actas enlazados; 4 tablas por fila en PC,
  apiladas en mÃ³vil; Ã¡rbitro, escudos y nombres cortos; fecha derecha = Ãºltima jornada jugada
  (`fecha_ultima_jugada`). Los asistentes de Ã¡rbitro no estÃ¡n en `core.match_official` y no se inventan.
- [x] **Nombres cortos de equipo**: migraciÃ³n 0060 (`analytics.nombre_corto_equipo`), 34.904/34.904
  equipos de CyL, reglas + 2.569 manuales; integrados en jornadas, acta, clasificaciÃ³n y calendario.
- [x] **Acceso**: registro abierto sin invitaciÃ³n (0059), `/entrar` y `/crear-cuenta` separados, avisos
  Â«mÃ¡s adelanteÂ» sin botones falsos; sin verificaciÃ³n de correo ni captcha, documentado.
- [x] **Historiales**: jugador, equipo y club, enlazados desde las fichas; varios equipos del mismo club y
  cambios a mitad de temporada. Declarados los huecos del canÃ³nico.
- [x] **EstadÃ­sticas de Ã¡rbitros, entrenadores y delegados**: fichas con datos reales, medias y V-E-D.
  Los asistentes de Ã¡rbitro no existen en el canÃ³nico.

## Pantallas restantes del prototipo (continuaciÃ³n)

- [x] **Inicio / Main** rediseÃ±ado: buscador, competiciones reales de CyL y Â«Tus equiposÂ» con sesiÃ³n.
- [x] **Rankings y Ojeo**: `/explorar/rankings` (goleadores/tarjetas, filtros y paginaciÃ³n) y
  `/explorar/ojeo` (perfiles, edad calculada, minutos y posiciÃ³n) con datos reales y CyL por defecto.
- [x] **Comparar jugadores**: `/explorar/comparar`, selecciÃ³n por nombre/id sin unir identidades.
- [x] **FederaciÃ³n y Liga**: `/explorar/federacion/[codigo]` y `/explorar/liga/[id]` con cobertura,
  resultados, goles por tramo, cantera y disciplina.
- [x] **Cuenta**: `/mi-cuenta` con datos, preferencias de aviso, seguridad y cierre de sesiÃ³n.
- [x] **AdministraciÃ³n**: `/admin` y `/admin/usuarios` con guardia de servidor, resumen, usuarios,
  invitaciones, auditorÃ­a y paginaciÃ³n; sÃ³lo lectura y sin datos personales sensibles.
- [x] **Datos, Salud y Estados**: `/explorar/datos`, `/explorar/salud` y `/explorar/estados` con datos
  reales de observabilidad y estados honestos.
- [x] **Publicidad**: `/explorar/publicidad`, enlazada desde el pie; espacios reales apagados y sin
  campaÃ±as inventadas.
- [x] **Backend/API de estadÃ­sticas, historiales y oficiales**: siete endpoints nuevos en `/api/v1` con
  ETag/304, cachÃ© por etiquetas y contrato documentado.

- [ ] **Cobertura completa de Castilla y LeÃ³n**: medido el 09/11/2026 en los dos canÃ³nicos, la **uniÃ³n** es de
  **807 ediciones y 221 completas** (586 incompletas en las dos; el PC solo tiene 138 y el servidor 152, y sus
  temporadas se reparten). **Causa raÃ­z del estancamiento encontrada y corregida el 09/11:** el recolector de CyL
  del PC tenÃ­a asignada `2024-25` (temporada del servidor) y no las suyas, y en el servidor el `pageLoad` de 30 s
  tiraba el 83 % de las peticiones (corregido a 60 s, commit `3ef2c3b`). La consolidaciÃ³n (traer del servidor al
  canÃ³nico del PC los 1.265 grupos con hueco) estÃ¡ en marcha. Detalle: `docs/plataforma-web/CIERRE-CYL-2026-11-09.md`.

## Terminado cuando

Puedo pedir cualquier competiciÃ³n/temporada y ver calendario, clasificaciÃ³n, jornadas, actas,
estadÃ­sticas e historiales sin que falte nada.


## BitÃ¡cora

- 10/11/2026 (maÃ±ana, 09:35): **2014-15 cerrada por importaciÃ³n y canÃ³nico en 198/865 ediciones completas.** El agujero
  mayor del proyecto (358 grupos, 26.013 actas, 0 completos en el canÃ³nico) queda importado: **357 de 358 grupos**;
  2014-15 pasa de **3 ediciones a 18** y de 3 a **249 grupos completos**. Total del canÃ³nico del PC: **198/865**
  (138/807 al empezar el dÃ­a). Al final, para que el worker acabe el **Ãºltimo escaneo largo de actas** (0,81 GB sin
  Ã­ndice, y con la importaciÃ³n compitiendo bajaba a 3 MB/min), se **pausa la importaciÃ³n** y un watcher
  (`tmp/reanuda-tras-escaneo.ps1`) la reanuda solo cuando aparece el metadato `actas_repaso` en la cola; si no
  aparece en 4 h, avisa sin relanzarla. La que falta por importar: 2020-21, 2016-17, 2018-19, 2012-13 y 2026-27.

- 10/11/2026 (maÃ±ana, 09:10): **rotaciÃ³n del worker devuelta y 2014-15 avanzando.** La rotaciÃ³n de las 07:30 no se
  habÃ­a hecho (el worker seguÃ­a con las tres antiguas desde las 23:13), asÃ­ que la hice a las 09:00: fichero con las
  15 temporadas y 2026-27 primero (`tmp/temporadas-asignadas.antes-rotacion-2026-11-10.txt` guarda el anterior),
  worker 3856 parado y el supervisor relanzÃ³ **PID 40620 a las 09:09:47** con Â«15 temporadas y 839 competicionesÂ»;
  ahora paga el Ãºnico escaneo de actas que queda y despuÃ©s recolectarÃ¡ 2026-27. **Incidente del importador**: un
  grupo de 2014-15 se quedÃ³ colgado 4 h 22 min (el PC se suspendiÃ³ a las 04:38 y la conexiÃ³n no volviÃ³), con el
  bucle parado; el trabajo sÃ­ habÃ­a insertado sus 18.521 filas. Se desbloqueÃ³ matando el hijo colgado y el driver
  siguiÃ³. **2014-15 pasa de 3 ediciones (solo La Preferente) a 30, con 10 completas**, y el total del canÃ³nico del
  PC sube a **190/834** ediciones completas (eran 183/807 al empezar el dÃ­a).

- 10/11/2026 (madrugada, 04:33): **reordenada la importaciÃ³n para atacar primero el agujero mayor: 2014-15.**
  El driver iba por 2026-27 (temporada en curso, poco retorno de cobertura) y 2014-15 era el bloque grande (358
  grupos, 26.013 actas, 0 completos en el canÃ³nico). Reordenado a 2014-15 â†’ 2020-21 â†’ 2016-17 â†’ 2018-19 â†’ 2012-13 â†’
  2026-27 â†’ 2023-24 â†’ 2025-26 â†’ 2022-23 â†’ 2024-25 (reanudable: no se pierde nada). Efecto medido en 8 minutos:
  **2014-15 pasa de 3 ediciones (solo las de La Preferente) a 21, con 8 completas**, y el total del canÃ³nico del PC
  sube de **183/807 a 188/825** ediciones completas. Sigue en marcha; a 2-14 s por grupo se espera cerrar sus 358
  grupos en unos 25-30 minutos mÃ¡s.

- 10/11/2026 (madrugada, 04:22): **grupos completos por temporada, medidos con la importaciÃ³n en marcha**:
  2026-27 **1/237** Â· 2025-26 166/301 Â· 2024-25 232/289 Â· 2023-24 169/296 Â· 2022-23 215/286 Â· 2021-22 138/280 Â·
  2020-21 182/337 Â· 2019-20 **5/224** Â· 2018-19 143/270 Â· 2017-18 143/247 Â· 2016-17 144/286 Â· 2015-16 148/311 Â·
  2014-15 **3/3** (solo las de La Preferente: los 384 grupos de la federaciÃ³n estÃ¡n en la cola de importaciÃ³n) Â·
  2013-14 85/231 Â· 2012-13 2/2. Los dos huecos que mÃ¡s pesan son 2014-15 (importaciÃ³n) y 2019-20 (recolecciÃ³n: el
  worker estÃ¡ con sus clasificaciones). Nuevo `tmp/reejecuta-fallos.ps1` para sacar el motivo completo de los
  grupos que fallan (el driver solo guardaba Â«Exit status 1Â»).

- 10/11/2026 (madrugada, 04:11): **reanudada la consolidaciÃ³n de CyL, que se habÃ­a parado sola a las 19:32.** El
  importador de paquetes llevaba solo 277 grupos hechos (2024-25, 2022-23 y 33 de 2026-27) y se quedÃ³ parado sin
  error visible; relanzado con la lista de huecos: **968 grupos pendientes** en 8 temporadas del servidor
  (2014-15 358 Â· 2026-27 187 Â· 2020-21 154 Â· 2016-17 142 Â· 2018-19 124 Â· y 1 en 2022-23, 2024-25 y 2012-13), a 7-20 s
  por grupo. AÃ±adidos los **21 grupos con actas** de 2023-24 y 2025-26 que faltaban; el resto de sus huecos (120 y
  119) no tiene ni una acta en el paquete: esas temporadas necesitan **recolecciÃ³n**, no importaciÃ³n. La tarea
  `FACyLF importador incremental` queda Disabled mientras dura la consolidaciÃ³n (hay que rehabilitarla al acabar).
  Medido con `tmp/gaps-de-paquete.mjs` (nuevo): paquete de 2014-15 con 384 grupos y **0 completos** en el canÃ³nico;
  2023-24 con 293 grupos y 168 completos; 2025-26 con 301 y 166.

- 10/11/2026 (madrugada): **refresco exacto de la base publicada y arreglo del bloqueo de arranque del worker.** El
  primer volcado saliÃ³ 14 tablas por detrÃ¡s porque el importador y el proyector siguieron escribiendo: se
  congelaron las siete tareas escritoras, se exigiÃ³ **recuento T1 = T2** (98 tablas, **116.986.467 filas**) y se
  restaurÃ³ en **`facylf_canonico_3`** con **cotejo 98/98 tablas y 116.986.467 filas, sin una sola diferencia**; la
  web ya lee esa base y `facylf`, `facylf_canonico` y `facylf_canonico_2` siguen intactas (nada borrado). URL nueva
  `https://working-reseller-rights-omaha.trycloudflare.com` (el quick tunnel anterior caducÃ³). AdemÃ¡s:
  `cuentaActasDesactualizadas` recorre 2,4 GB de actas y se pagaba **en cada arranque** (medido: 42 min bloqueado
  el 09/11; el balance de la noche fue 25 obras); ahora los dos sitios que cuentan pasan por
  `lib/repaso-actas.mjs`, que se salta el escaneo si la cola quedÃ³ limpia con el mismo parser hace menos de 24 h â€”
  prueba en rojo y **144/144** en `pnpm recolector:test`.

- 09/11/2026 (noche, 21:10): **2019-20 cerrada por la vÃ­a del PC y worker al 100 % tres horas seguidas.** La 2Âª
  pasada de 2019-20 hizo 51 grupos mÃ¡s sin fallos: el hueco real de esa temporada baja de 5.112 actas a **3 actas en
  3 grupos** (216/216 claves Â«hechoÂ»). Ojo: la cobertura por ediciones de 2019-20 no se mueve todavÃ­a (sigue 1/56)
  porque sus grupos tienen calendario, jornada y clasificaciÃ³n pendientes en la cola, y el importador solo mete
  actas: eso lo cierra el recolector. Acierto del worker con las 15 temporadas: **56/56 (2,6 s) â†’ 17/17 (4,9 s) â†’
  128/128 (2,0 s)**, cero fallos de 30 s. Sigue con 2015-16 (115 grupos/868 actas) y despuÃ©s 2013-14 (115/476);
  cuando cierren, toca refrescar la base publicada.

- 09/11/2026 (noche, 21:00): **tres arreglos de David aplicados y desplegados en la URL pÃºblica.** (1) **Marca**:
  lo que se veÃ­a era Â«CanteraÂ» porque el contenedor servÃ­a un build del 06/11 anterior a la marca definitiva; el
  cÃ³digo ya decÃ­a Fondo Popular, asÃ­ que se reconstruyÃ³ la web y se redesplegÃ³ (tÃ­tulo, cabecera y metadatos; fuera
  el nombre interno de los tÃ­tulos de `/admin` y del export de datos). (2) **Escudos**: solo **36 clubes de CyL de
  930** tienen escudo real guardado, y por tanto **6.274 equipos de 35.110**; el resto pinta el fallback de iniciales
  sobre escudo determinista (comprobado en la web: 110 deterministas con iniciales frente a 71 reales en una
  jornada). Los 37 `club_asset` que hay tienen binario, asÃ­ que no hay imÃ¡genes rotas: lo que falta es recolecciÃ³n de
  escudos. (3) **Aviso de identidad**: la regla era por equipo; ahora compara por **club**: dos equipos del mismo club
  con fechas solapadas es cantera y no se avisa, solo se avisa Â«Dos clubes a la vezÂ» entre clubes distintos en la
  misma temporada. Prueba en rojo antes del cambio y **27/27** despuÃ©s; verificado en la URL con el jugador 19057
  (sin aviso) y 313/318 (con aviso). La web sigue leyendo `facylf_canonico` del servidor.

- 09/11/2026 (noche, 20:50): **el canÃ³nico del PC estÃ¡ publicado como base nueva en el servidor (`facylf_canonico`)**,
  plan de David ejecutado sin saltarse pasos: fuente congelada â†’ recuento de 98 tablas (115.860.212 filas) â†’ volcado
  `pg_dump -Fc` de 1,35 GiB (sha256 `ec9faadâ€¦`, copia en el PC y en el servidor) â†’ base nueva con rol `facylf_app`
  creado â†’ `pg_restore` nice 19 â†’ **cÃ³digo 0 sin errores**, 28 GB â†’ **cotejo 98/98 tablas y 115.860.212 filas
  idÃ©nticas** â†’ la web pasa a leerla por tÃºnel SSH. La base vieja y sus contenedores, intactos; no se ha borrado
  nada. Cobertura de CyL idÃ©ntica (183/807) y RLS de La Preferente comprobada (0 `lp%` visibles). DNS del servidor
  arreglado con sudo (no resolvÃ­a nada). Publicado en `docs/plataforma-web/PUBLICACION-2026-11-09.md`.

- 09/11/2026 (noche): **Fondo Popular sirviendo datos reales en una URL pÃºblica provisional.** Web Next en el PC
  (puerto 3001, build del 06/11) leyendo el canÃ³nico del PC con `facylf_lector`, publicada con un quick tunnel de
  Cloudflare sin cuenta: `https://algorithm-infinite-sessions-assumed.trycloudflare.com`. Comprobado por HTTP:
  portada, selector, competiciÃ³n 44 (jornadas con marcadores reales, clasificaciÃ³n con puntos, calendario y
  estadÃ­sticas), acta 2000559 (alineaciones, goles, Ã¡rbitro y tarjetas) y ficha de federaciÃ³n, todo 200. `/api/v1`
  da 404 porque la compilaciÃ³n es del 06/11. **La URL es efÃ­mera**: Tailscale Funnel estÃ¡ desactivado en el tailnet y
  se activa con un clic de David (`https://login.tailscale.com/f/funnel?node=njbseLxAqx11CNTRL`); despuÃ©s,
  `tailscale funnel 3001` da la URL fija. Pasos, cuentas y decisiones pendientes en
  [`docs/CUENTAS-Y-ACCESOS.md`](docs/CUENTAS-Y-ACCESOS.md). Tabla de cierre por temporada y lo que se queda fuera:
  [`docs/plataforma-web/CIERRE-CYL-TABLA-FINAL.md`](docs/plataforma-web/CIERRE-CYL-TABLA-FINAL.md) â€” **163/807
  completas** (eran 138 al empezar el dÃ­a) y las 178 ediciones irreducibles con su causa. A las 19:20 son **183**:
  2022-23 sube de 12 a 32 con el paquete fresco y el worker del PC con las 15 temporadas hace **56/56 peticiones ok
  y 2,6 s de media**, incluida una de 55,8 s que con el corte de 30 s se habrÃ­a perdido.

- 09/11/2026 (tarde, avance de datos): **la cobertura del canÃ³nico del PC sube de 140 a 163 ediciones completas en una
  hora.** La consolidaciÃ³n desde el servidor cierra **2024-25: 20 â†’ 41 de 79 ediciones completas** con el paquete
  fresco (117 grupos con hueco, grupos de 11.000-16.000 filas). En paralelo, la tanda de importaciÃ³n desde la cola del
  PC cierra **2017-18: 8 â†’ 10 de 60**, con 293.910 filas y el hueco de grupos de **102 a 2** (faltan 3 actas de
  6.543); un solo grupo falla, `17134`, por acta que no cuadra con el calendario (identidad, no origen). El worker del
  PC ya recolecta las 15 temporadas (cataloga 2026-27 primero) a 46/46 peticiones ok y 1,7 s de media. La extracciÃ³n
  de 2022-23 corre en `facylf-monitor` y el importador espera el paquete fresco.

- 09/11/2026 (tarde): **verificaciÃ³n del pageLoad de 60 s y cambio de reparto de CyL.** El arreglo hace lo que pedÃ­a
  â€”ya no hay ni un fallo a 30 s; los fallos se han movido a 60,1-60,6 sâ€” pero **el acierto no sube**: CyL y
  Castilla-La Mancha siguen a 0 % en la ventana posterior (Ãºltimo acierto de CyL el 09/11 a las 12:46Z; el de CLM, el
  07/11 a las 20:48Z). Descartados con medidas: CPU/cuotas (`nr_throttled` â‰ˆ 0), memoria (75 % y 37 % del tope,
  `oom_kill=0`), DNS y red (HTTP 200 desde el contenedor), hosting (los cuatro portales en la misma IP) y **el perfil
  de Chrome**: con un Chrome virgen y registro de red, la portada tarda 87,6 s y la pÃ¡gina que falla no termina en
  90,9 s (438 recursos, 392 scripts). El cuello es la pÃ¡gina Ã— el camino al portal: `rfcylf.es` tarda **5.687 ms**
  desde el servidor frente a 590-710 ms de los otros tres portales de la misma IP. **DecisiÃ³n: el servidor deja de
  recolectar CyL** (se para `facylf-federacion-1`, reversible) y **el PC asume las 15 temporadas** (asignaciÃ³n
  reciente-primero), porque es la Ãºnica mÃ¡quina que completa ese portal (2.876/2.886 peticiones ok). Castilla-La
  Mancha queda sin explicar (su portal responde en 595 ms y sigue a 0 %): prueba pendiente con sus URLs.
  **Castilla-La Mancha, resuelto a medias:** es el mismo mecanismo que CyL pero menos severo (su portal es 6-7Ã—
  mÃ¡s rÃ¡pido, 327 recursos) y tras el corte de 60 s **mete 1 de cada 8 pÃ¡ginas** (una de 54,2 s). **DecisiÃ³n: no se
  para**, porque 12,5 % es mÃ¡s que cero y su temporada en curso se quedarÃ­a a cero.
  **Paquetes de `_traspaso`:** el importador llegÃ³ a usar el paquete viejo de 2022-23 (13/10) antes de exigir
  frescura; ahora solo acepta paquetes extraÃ­dos hoy y guarda la fecha del paquete en la clave de lo ya importado,
  asÃ­ que cuando llega uno nuevo se reimportan sus grupos. El de 2014-15 del 26/10 estÃ¡ ilegible: se reextrae.
  **Nombres cortos**: con la importaciÃ³n en marcha aparecen equipos nuevos sin nombre; hay que ejecutar
  `node scripts/nombres-cortos-equipos.mjs --federacion castilla-leon` al cerrar cada tanda (idempotente), o la
  prueba `nombres-cortos.test.ts` se pone roja.

- 09/11/2026: **shell recuperado; dos causas del estancamiento encontradas y una corregida en producciÃ³n.** (1) El
  recolector de CyL **del PC** llevaba desde el 08/11 con `temporadas-asignadas.txt` en Â«2024-25Â» (temporada del
  servidor): pinchaba la del servidor y no las suyas. Corregido a sus 7 y worker reiniciado (el PC, medido, hacÃ­a
  2.876 peticiones ok de 2.886 en 24 h, 0,1 % de error). (2) En **el servidor**, el 83 % de las peticiones de CyL se
  perdÃ­a: el 100 % de los fallos caÃ­a entre 29,0 y 31,5 s por el `pageLoad: 30_000`, con la CPU saturada (PSI 89-96 %;
  16 recolectores Ã— 0,5 CPU sobre 4 nÃºcleos, mÃ¡s el contenedor ajeno `lyfta` en bucle). Arreglado con prueba en rojo:
  `scripts/lib/tiempos-navegador.mjs` (60 s), desplegado con huellas OK y reiniciados CyL y Castilla-La Mancha
  (commit `3ef2c3b`). Queda un segundo fallo del servidor por arreglar: `ENOENT` de la ficha de espera en
  `adquiereSlotChrome` (876 salidas con cÃ³digo 1). **MediciÃ³n de la cobertura real**: canÃ³nico del PC 138/807
  ediciones completas, servidor 152/259, **uniÃ³n 221/807** (586 incompletas en las dos). **ConsolidaciÃ³n en marcha**:
  traer al canÃ³nico del PC los 1.265 grupos con hueco de las 8 temporadas del servidor (91.787 partidos, 86.893
  actas); el paquete de 2024-25 (483 MB, 120 grupos) ya estÃ¡ importÃ¡ndose. **Despliegue**: lo que corre en el
  servidor es la web VIEJA del 24/09 y su canÃ³nico estÃ¡ en la migraciÃ³n 0015 de 60; plan y costes en
  `docs/plataforma-web/DESPLIEGUE-FONDO-POPULAR.md`.

- 08/11/2026: **2022-23: 58 ediciones incompletas y 7.554 partidos**. La cola local tiene 2.599 jornadas, 1.375 actas, 113 calendarios y 117 clasificaciones pendientes; el importador apartÃ³ 11 grupos porque el origen trae 3-7 partidos frente a 84-210 del canÃ³nico. Detalle por ediciÃ³n en `docs/plataforma-web/FALTAS-2022-23.md`. TambiÃ©n se commitearon los 9 artefactos pendientes.

- 08/11/2026: **faltas exactas de 2021-22**. 142 grupos incompletos y 9.815 partidos; cola local 1.991 jornadas, 5 actas, 62 calendarios y 64 clasificaciones. La tanda de importaciÃ³n terminÃ³ con 0 hechas, 1 fallo aislado (38234) y 0 completas; local 12/66. Detalle por grupo en `docs/plataforma-web/FALTAS-2021-22.md`. Siguiente: 2022-23.

- 08/11/2026: **2021-22 sigue en recuperaciÃ³n**. La sesiÃ³n lleva 200 calendarios hechos y 73 pendientes; quedan 2.005 jornadas. La tanda de importaciÃ³n procesÃ³ 114 grupos y no aÃ±adiÃ³ completas; un grupo fallÃ³ por acta/calendario incoherentes (38234). Local 2021-22 12/66. DespuÃ©s toca 2022-23.

- 08/11/2026: **plan de recuperaciÃ³n de 2020-21/2021-22**. El bloqueo no es el importador: la cola tiene 551 actas y 1.665 jornadas pendientes de 2020-21, y 2.005 jornadas de 2021-22; el suelo de temporadas (2023-24) y la asignaciÃ³n sin 2020-21 las dejaban fuera. Se aÃ±adiÃ³ 2020-21 a `temporadas-asignadas.txt` y se arrancÃ³ una sesiÃ³n de recolector con `FACYLF_TEMPORADA_MINIMA=2020-21`. Plan completo en `docs/plataforma-web/PLAN-RECUPERACION-2020-2021.md`.

- 08/11/2026: **2020-21/2021-22 siguen sin completar por datos de origen**. Nueva tanda: 23 grupos, 0 filas nuevas, 0 completas; cola local sin pendientes (82 apartadas). Faltan 647 partidos en 138 grupos verificados de 2020-21 y 1.228 en 95 de 2021-22, ademÃ¡s de actas; no es un problema del importador. Servidor 2024-25 46/32.

- 08/11/2026: **tanda real CyL 2020-21/2021-22**. 43 grupos importados, 0 apartados, 0 fallos y **0 competiciones nuevas completas**; la cola local de esas dos temporadas quedÃ³ agotada (270 unidades, 82 apartadas). No hay mÃ¡s datos en la cola para cerrarlas sin resolver los grupos con equipos sin identificar. Servidor: 2024-25 sube a 45/31; 2020-21 24/13 y 2021-22 2/0. La tarea programada sigue con 2026-27â†’2020-21. Ventanas: sin cmd de facylf en el Ã¡rbol real.

- 08/11/2026: **capturas nuevas de Fondo Popular**. La app sirve datos reales de 2020-21 y 2021-22: capturas en `docs/plataforma-web/capturas/fondo-popular-2020-21-jornadas-2026-11-08.png`, `...-2020-21-clasificacion...`, `...-2021-22-jornadas...` y `...-inicio...`. TambiÃ©n se comprobÃ³ una ejecuciÃ³n real del importador sin `cmd.exe` en el Ã¡rbol de procesos; la tanda CyL 2020-21/2021-22 sigue en `estado/importacion.log`.

- 07/11/2026: **fin de las ventanas de consola**. El importador ya no lanza `pnpm.cmd` ni
  `shell:true`: invoca `node` con `packages/canonico/node_modules/tsx/dist/cli.mjs` y el CLI
  directamente. El recolector lanza PowerShell con `windowsHide:true`; tambiÃ©n se han puesto
  `windowsHide` y lanzamiento directo en `ciclo-importacion`, `importar-muestra-federaciones`,
  `estado-recoleccion`, `copia-seguridad` e `informes-dashboard`. Las tareas programadas siguen con
  el lanzador oculto.

- 06/11/2026: **server import avanza**. Tras desplegar la prioridad, la tanda de 2020-21 a 2023-24
  ha importado 6 grupos de 2023-24 (6/6 presentes) y 1 de 2022-23 (1/1 presente), con mÃ¡s de 100.000
  filas. El canÃ³nico del servidor sigue sin 2020-21/2021-22; la tanda actual cubre 2020-22.
- 06/11/2026: **prioridad CyL desplegada en el importador del servidor**. Se reiniciÃ³
  `facylf-importador` con el cÃ³digo de `14907a0` montado por fichero (sin reconstruir la imagen) y
  `--temporadas 2020-21,2021-22,2022-23,2023-24`; el batch anterior se interrumpiÃ³ con 0 grupos.
  Resultado inmediato: 4 grupos de 2023-24 importados (63.000 filas), cobertura del servidor 2023-24
  4/4. La tanda anterior de AndalucÃ­a acumulaba 0 grupos y varios cortes de 60 min. El canÃ³nico del
  servidor solo tenÃ­a 2024-25 a 2026-27; por eso se importan primero las temporadas antiguas.
- 06/11/2026: **coordinaciÃ³n con Codex**. `14907a0` (prioridad CyL en el importador) ya estÃ¡ en la
  historia de `fase-c`; no se duplica. Sus **9 pruebas** pasan. La marca **Fondo Popular** va en
  commits separados de la ingesta.
- 06/11/2026: **objetivo CyL 2020-21â€¦2026-27**. Estado por temporada (grupos completos/grupos):
  2020-21 182/337 Â· 2021-22 111/280 Â· 2022-23 157/286 Â· 2023-24 143/296 Â· 2024-25 169/289 Â·
  2025-26 136/301 Â· 2026-27 1/237. Total CyL 134/889 ediciones; 1.474 grupos. Importador incremental
  programado cada 30 min, proyector corregido y con LP pÃºblica, supervisor con timeout y worker de
  CyL reiniciado. **Ninguna temporada objetivo estÃ¡ completa**: faltan resultados y algunas
  clasificaciones; 2026-27 estÃ¡ en curso. La app queda sirviendo en localhost:3000 con los datos que
  hay ahora.
- 06/11/2026: **primer desbloqueo de CyL**. Importador masivo arreglado para Windows (`pnpm.cmd`) y con
  filtro `--temporadas`; proyector programado corregido; tarea `FACyLF importador incremental` (cada 30
  min, logs en `estado/importacion.log`) y proyector con `FACYLF_LP_PUBLICO=true`; supervisor de CyL
  con techo de 20 s en el cÃ¡lculo del prÃ³ximo trabajo y worker reiniciado. Cobertura **133 â†’ 134**
  ediciones completas: el grupo 3789 (2013-14) pasa a completa al aceptar el cÃ¡lculo las jornadas de
  7/9 con total 240; el resto de la cola son duplicados o grupos a los que les faltan resultados.
  La tarea incremental sigue corriendo.
- 06/11/2026: **diagnÃ³stico del 133/889**: no es la cobertura ni los recolectores; el importador
  al canÃ³nico no crea lotes desde el 29/10 12:19 (cola local con 41.783 trabajos pendientes) y la
  cobertura se congela. AdemÃ¡s `FACyLF proyector` fallaba por un error de sintaxis en
  `scripts/proyectar-lectura.mjs` (backticks dentro del template SQL), corregido; `node --check` pasa.
  Queda desbloquear la importaciÃ³n y volver a proyectar; detalle en
  `docs/plataforma-web/DIAGNOSTICO-CYL-2026-11-06.md`.
- 06/11/2026: **marca definitiva Fondo Popular**, aprobada por David. Se aplica en cabecera, tÃ­tulos,
  textos, favicon y documentaciÃ³n; el logotipo es el monograma FP. Se mantienen rutas y nombres internos
  (`facylf`). La app queda sirviendo en `localhost:3000`.
- 05/11/2026: **revisiÃ³n de David aplicada con nombre Fondo Popular.** Marca `Fondo Popular` en cabecera, tÃ­tulos
  y textos, con logotipo propio (C con balÃ³n) y favicon a juego; verificado en el HTML real de `/`,
  `/canonico`, `/competiciones`, `/entrar` y `/crear-cuenta` que **no queda** Â«archivo privadoÂ» ni
  Â«no es una web oficialÂ» (el pie sÃ³lo lleva el enlace a Publicidad). Acceso separado en dos pÃ¡ginas y
  dos formularios (`/api/cuentas/entrar` y `/api/cuentas/crear`), sin invitaciÃ³n. Jornadas: tabla por
  jornada, hasta 4 por fila en PC y una en mÃ³vil, equipos apilados en la misma columna con resultado,
  campo y Ã¡rbitro a la derecha; nombres cortos y enlaces reales a equipo y acta. Capturas nuevas en
  `tmp/final-cantera-*` y en `docs/plataforma-web/capturas/cantera-*`; no se reutilizan las viejas.
  QA ronda 13 **APTA**; suite **1.356/1**, e2e **66/66**, web **773/1**, `tsc`, `lint` y `next build`
  verdes; base limpia.
- 05/11/2026: **backend de Mi cuenta**: preferencias de aviso editables (`POST
  /api/cuentas/preferencias`, validaciÃ³n y CSRF por `Origin`, `user_id` de la cookie) y descarga de
  datos (`GET /api/cuentas/exportar`, `app.exporta_mis_datos`, `no-store`). La baja y el cambio de
  contraseÃ±a siguen no disponibles y se dicen. AdministraciÃ³n sigue deliberadamente en sÃ³lo lectura.
- 05/11/2026: **pantallas restantes del prototipo completadas y API v1 ampliada.** Inicio/Main, Mi
  cuenta, Rankings, Ojeo, Comparar, FederaciÃ³n, Liga, administraciÃ³n (`/admin` y `/admin/usuarios`),
  Datos, Salud, Estados y Publicidad, con datos reales y CyL por defecto; cabecera con Rankings, Ojeo y
  Comparar enlazados; portada con tema oscuro; siete endpoints nuevos en `/api/v1` (estadÃ­sticas,
  historiales y oficiales) con ETag/304 y cachÃ©. QA ronda 12 **APTA** tras corregir el contraste del
  comparador en oscuro y los textos internos de Datos/Salud. Puertas finales: suite completa **1.353/1**,
  e2e **64/64**, web **770/1**, `tsc`, `lint` y `next build` verdes; `ops.chequeos()` sube el presupuesto
  a 30 s porque bajo carga del banco de pruebas tarda mÃ¡s de 10 s (la pantalla lo cachea 5 min).

- 05/11/2026: **pantallas de Liga y de Publicidad implementadas, pendientes de validaciÃ³n del Lead
  (sin marcar ninguna casilla).** Rutas nuevas: `/explorar/liga/[id]` (el id es
  `core.phase_group.id`, el mismo de la ficha de competiciÃ³n: resultados recientes de la Ãºltima
  jornada jugada, cuÃ¡ndo se marcan los goles con el tiempo aÃ±adido, minutos de cantera de los equipos
  inferiores del mismo club, clasificaciÃ³n resumida y disciplina por equipo; enlaces a competiciÃ³n,
  jornada, acta y ficha de cada equipo) y `/explorar/publicidad` (diseÃ±o y estado de los siete huecos,
  reglas, y Â«sin espacios contratadosÂ»; enlazada desde el pie, no desde la cabecera). Consulta nueva
  `apps/web/src/consultas/liga.ts` (`disciplina-y-cantera-del-grupo`, presupuesto 400 ms; mediana
  33 ms en caliente) que reutiliza sin copiar `GRUPO_POR_ID`, `CLASIFICACION_DE_LA_PANTALLA`,
  `PARTIDOS_DE_GRUPO` y `EVENTOS_DEL_GRUPO`; reglas puras en `apps/web/src/lib/liga.ts` y
  `apps/web/src/lib/publicidad.ts`; componentes en `componentes/liga/` y `componentes/publicidad/`;
  prueba `apps/web/test/liga-publicidad.test.ts` (27). Medido en el servidor de desarrollo: TTFB
  0,85â€“0,96 s para la liga 797, 0,76â€“0,85 s para la 3769 y 0,08â€“0,10 s para publicidad; gzip 24,7 /
  23,1 / 11,5 KB. axe 0 serias/crÃ­ticas en 1440/360 claro y oscuro, sin desplazamiento horizontal;
  404 real para id inexistente y pÃ¡gina de liga sin datos con sus estados explÃ­citos. **LÃ­mite
  declarado**: los datos de campaÃ±as (`app.espacio_anuncio`, `app.campana_anuncio`) sÃ³lo los puede
  leer `facylf_app`, asÃ­ que la pÃ¡gina pÃºblica de publicidad es informativa y no refleja campaÃ±as en
  vivo; el estado comprobado el 05/11/2026 era: 7 huecos con proveedor Â«ningunoÂ» y apagados, 0
  campaÃ±as y 0 impresiones. Capturas en `tmp/liga-*.png` y `tmp/publicidad-*.png`.

- 05/11/2026: creado el WALL desde el bloque 2. Ya hechos de la primera tanda anterior: clasificaciÃ³n
  (completa), jornada (listado y detalle), escudos de club y federaciÃ³n, zonas por reglamento, textos
  y menores segÃºn doctrina, y el diseÃ±o de `/entrar`.

- 05/11/2026: **objetivo 4, primera entrega: selector de temporada y competiciÃ³n**. Ruta nueva
  `/explorar/competiciones` con filtros de federaciÃ³n, temporada (histÃ³ricas incluidas), categorÃ­a,
  modalidad, gÃ©nero, provincia, nivel y texto libre; paginaciÃ³n por desplazamiento y total real (el
  que cuenta la consulta, no el de la pÃ¡gina). Â«Segunda Juvenil 2017, BurgosÂ» encuentra el grupo real
  **30665** de Castilla y LeÃ³n (temporada 2016-17, Â«2Âª DivisiÃ³n Provincial de Juveniles Â· Primera -
  BurgosÂ», 156 de 157 partidos con resultado) y enlaza a su ficha. El aÃ±o suelto se interpreta como la
  temporada que termina ese aÃ±o; Â«segundaÂ» busca como Â«2Â»; sin tilde y por comienzo de palabra; si la
  temporada no estÃ¡ en el catÃ¡logo no se inventa y se ofrecen las temporadas que sÃ­ tienen datos.
  Sin resultados el estado dice la verdad y deja quitar filtros; lo no medido se lee Â«Cobertura sin
  medirÂ», nunca 0. Consultas nuevas en `apps/web/src/consultas/catalogo-selector.ts` (grupos con id de
  ficha y opciones en una pasada); lÃ³gica pura en `apps/web/src/lib/selector-competiciones.ts`;
  interfaz en `apps/web/src/componentes/catalogo/` y la pÃ¡gina. Medido con `EXPLAIN ANALYZE`:
  Â«Segunda Juvenil 2017, BurgosÂ» 32â€“43 ms, opciones de los filtros ~105 ms y catÃ¡logo sin filtros
  0,5â€“0,9 s (mÃ¡quina compartida con los recolectores; la misma consulta oscila entre pasadas).
  Pruebas `apps/web/test/selector-competiciones.test.ts`: 20/20 en verde, contrato contra el catÃ¡logo
  incluido; `pnpm --filter @facylf/web exec tsc --noEmit` en verde. Capturas: `tmp/selector-1440.png`,
  `tmp/selector-360.png`, `tmp/selector-vacio-1440.png`, `tmp/selector-oscuro-1440.png` y
  `tmp/selector-defecto-1440.png`. axe sin incidencias serias ni crÃ­ticas en 1440, 360 y oscuro; sin
  scroll horizontal del documento a 360; controles y chips de 44 px. **Pendiente para el Lead antes de
  marcar la casilla**: (a) la ficha de destino (`/explorar/competicion/30665`) funciona y enseÃ±a su
  temporada en el tÃ­tulo, pero su desplegable de temporada no incluye 2016-17 porque
  `temporadasPublicables` recorta a 2023-24 en `apps/web/src/lib/pantalla-competicion.ts` (lo usan
  `[id]/page.tsx`, `[id]/calendario` y `[id]/jornadas`); (b) Â«ExplorarÂ» de la cabecera sigue
  enlazando a `/competiciones` (web vieja) y no a esta ruta; (c) el enlace desde la ficha de
  competiciÃ³n a esta bÃºsqueda no estÃ¡ puesto.
- 05/11/2026: **Â«Calendario y jornadas completosÂ» implementado, pendiente de validaciÃ³n del Lead (la
  casilla sigue SIN marcar).** Rutas nuevas: `/explorar/competicion/[id]/calendario` (todas las
  jornadas del grupo, agrupadas, con filtros de jornada/equipo/estado y enlaces a jornada y acta) y
  `/explorar/calendario` (global, por fechas, con federaciÃ³n, temporada, jornada, rango de fechas y
  bÃºsqueda, paginado de 60 en 60). Consulta nueva `apps/web/src/consultas/calendario.ts` (no se tocÃ³
  `partidos.ts`). Medido contra el canÃ³nico: primera pÃ¡gina de CyL 43 ms, todas las federaciones
  235 ms, peor caso con bÃºsqueda 304 ms, opciones de filtros 20 ms (presupuesto declarado 800/300 ms).
  Pruebas `apps/web/test/calendario-pantalla.test.ts` en verde (52) y `tsc` verde; axe sin
  incidencias serias ni crÃ­ticas y sin desbordamiento de documento en 1440 y 360, claro y oscuro.
  Capturas en `tmp/calendario-*.png`. Los partidos con acta analizada enlazan a
  `/explorar/acta/[id]` (la pantalla del objetivo 1, que ya responde). Pendiente fuera de esta tarea:
  la pestaÃ±a/enlace de la cabecera lo integra el Lead.
- 05/11/2026: fichas de jugador, equipo y club implementadas con datos reales de CyL, contra los
  artboards. No se marca la casilla 3: falta la validaciÃ³n del Lead y la integraciÃ³n de los enlaces
  desde la cabecera y desde Jornada/Acta.
- 05/11/2026: acta del partido implementada contra `prototipo/Acta.dc.html` con datos reales del
  canÃ³nico (referencia 94040 y casos reales de acta a revisar y parcial). Una sola consulta y su plan
  guardado; el enlace desde el detalle de Jornada sÃ³lo se pinta en partidos con acta publicada. No se
  marca la casilla 1: falta la validaciÃ³n del Lead.
- 05/11/2026: **objetivo 7 implementado, pendiente de validaciÃ³n (casilla SIN marcar).** Registro real
  sin Better Auth: `app.credencial` (scrypt) y `app.sesion` (SHA-256 del token) en migraciones nuevas
  **0057** y **0058**; `app.alta_cuenta` crea usuario y credencial en una transacciÃ³n reutilizando
  `app.alta_usuario` (invitaciÃ³n/aprobaciÃ³n/abierto); entrada con mensaje Ãºnico, freno por cuenta y por
  IP, cookie `httpOnly`/`SameSite=Lax`, cierre de sesiÃ³n, caducidad de 7 dÃ­as y limpieza de caducadas.
  `/mi-panel` lee `app.mis_accesos` y traduce sus enlaces a `/explorar/â€¦`; la estrella de favorito de
  club, equipo y jugador vive en `componentes/fichas/Cabeceras.tsx` (no se tocaron las pÃ¡ginas de las
  fichas) y usa `GET/POST /api/favoritos` con el `user_id` de la sesiÃ³n. No se instalÃ³ ninguna
  dependencia; no se tocaron `.env`, migraciones aplicadas, ingesta ni servidor. Pruebas: 23 unitarias
  de cuenta + 4 de flujo real contra PostgreSQL + 13 de `/entrar` + 6 de `/mi-panel`, `tsc` verde
  (salvo un error de una prueba de estadÃ­sticas de otro compaÃ±ero en curso). Comprobado con Chrome
  real: alta, entrada correcta e incorrecta, cookie, favorito, panel y cierre; axe 0 en 1440 y 360, sin
  desplazamiento horizontal. Capturas en `pruebas/cuentas/`. Detalle en
  `docs/plataforma-web/CUENTAS.md`. **Pendiente del Lead:** validar el flujo y decidir si una
  invitaciÃ³n de prueba (`FACYLF-PRUEBA-2026`, 20 usos) se queda en la base local o se retira.

- 05/11/2026: **API pÃºblica v1 implementada, pendiente de validaciÃ³n del Lead (casilla 6 sin marcar).**
  Siete endpoints en `/api/v1` (Ã­ndice, competiciÃ³n, acta, calendario y fichas de equipo/jugador/club)
  que reutilizan las consultas del catÃ¡logo, con ETag/304, cachÃ© HTTP pÃºblica, `X-Cache` y lÃ­mite de
  300 peticiones/minuto/IP (429). CachÃ© por etiquetas con `POST /api/revalidar` y consumo de
  `ops.invalidacion` cada minuto; medido con curl y `EXPLAIN (ANALYZE, BUFFERS)`: HIT ~31-38 ms p50,
  MISS ~46-84 ms p50, 304 ~49-103 ms p50, las 14 consultas dentro de presupuesto y sin `Seq Scan` en
  tablas de hechos (sin Ã­ndice nuevo). Contrato en `docs/plataforma-web/API.md`; pruebas en
  `apps/web/test/api-v1.test.ts` (26). Aviso: la cola de invalidaciones tiene 1,7 M de etiquetas
  pendientes de una proyecciÃ³n histÃ³rica (se vacÃ­a sola a 2000/min, ~14 h).

- 05/11/2026: **Â«EstadÃ­sticas y pÃ¡ginas de grÃ¡ficosÂ» implementado, pendiente de validaciÃ³n del Lead (la
  casilla sigue SIN marcar).** Rutas nuevas: `/explorar/estadisticas` (federaciÃ³n y temporada; buscador
  de competiciÃ³n que enlaza a la vista de un grupo) y `/explorar/competicion/[id]/estadisticas`, que
  funciona tambiÃ©n con grupos histÃ³ricos (30665, 2016-17). Contenido: cifras del Ã¡mbito (partidos con
  resultado, goles, goles por partido, actas), reparto de resultados, puntos acumulados por jornada,
  goles por mes, goles por tramo de quince minutos, goleadores, disciplina, casa/fuera y forma. Los
  grÃ¡ficos son SVG sin librerÃ­a nueva, con `role="img"` y `aria-label`, resumen en texto, tabla
  equivalente en `<details>`, letras en la forma (G/E/P) y en la disciplina (A/R) para no depender sÃ³lo
  del color, y tokens del sistema. Consultas nuevas en `apps/web/src/consultas/estadisticas.ts`
  (`resumen-de-estadÃ­sticas`, `eventos-del-grupo`, `goleadores-de-estadÃ­sticas`,
  `opciones-de-estadÃ­sticas`); no se tocaron `partidos.ts`, `paneles.ts`, `analisis.ts`, fichas, acta ni
  calendario. Reglas puras en `apps/web/src/lib/estadisticas.ts`; componentes en
  `apps/web/src/componentes/estadisticas/`; pruebas en `apps/web/test/estadisticas-pantalla.test.ts`
  (42), con contrato real contra 3769 (32 partidos, 135 goles con minuto, tarjetas) y 30665 (156 de 157
  partidos, 615 goles, **ninguna tarjeta publicada**: la pÃ¡gina lo dice). Medido con el rol de lectura:
  resumen CyL 2026-27 103 ms (2025-26, 420 ms; presupuesto 1.200), goleadores 13 ms, eventos de grupo
  3â€“5 ms, opciones 2 ms; TTFB 143â€“216 ms y carga 0,5â€“1,2 s en el servidor de desarrollo. Comprobado con
  Chrome real: 1440/400/360 claro y 1440 oscuro, axe 0 serias/crÃ­ticas y sin desplazamiento horizontal;
  estados de carga y Â«sin datosÂ»; 404 real para grupo inexistente o id no numÃ©rico; capturas en
  `tmp/estadisticas-*.png`. **Pendiente para el Lead antes de marcar la casilla**: (a) aÃ±adir la pestaÃ±a
  Â«EstadÃ­sticasÂ» a `CabeceraCompeticion` (el tipo `activa` y el `href`; la pÃ¡gina ya pasa
  `activa="estadisticas"` mediante un cast y hoy no se marca ninguna pestaÃ±a, mejor que marcar otra) y
  enlazar desde la ficha de competiciÃ³n; (b) decidir si el buscador de competiciÃ³n de la pÃ¡gina global
  se queda como acceso al selector existente o pasa a un desplegable de grupos; (c) el endpoint
  `/api/v1/estadisticas` que el objetivo 6 dejÃ³ reservado puede servirse ya con estas consultas (no se
  tocÃ³ la API).

- 05/11/2026: **bloque 2 completo; validaciÃ³n del Lead (05/11/2026)**. Casillas 1â€“3 validadas con
  e2e (40/40 entonces) y 4â€“7 con las pruebas de selector (20), estadÃ­sticas (42), API (26) y cuentas
  (94); `tsc` y `lint` verdes. IntegraciÃ³n final: pestaÃ±as Calendario y EstadÃ­sticas en la cabecera de
  competiciÃ³n, Â«ExplorarÂ» al selector nuevo, enlaces a fichas desde clasificaciÃ³n/jornada/acta y la
  bÃºsqueda, y el buscador con las rutas nuevas. La condiciÃ³n de cierre (Â«puedo pedir cualquier
  competiciÃ³n/temporada y ver calendario, clasificaciÃ³n, jornadas, actas y estadÃ­sticasÂ») se cumple
  con datos reales: probado con 3769 (2026-27) y 30665 (2016-17, Â«Segunda Juvenil 2017, BurgosÂ»).
  Lo que queda fuera del bloque: artboards de administraciÃ³n, ojeo, rankings, comparador y publicidad;
  las cuentas no tienen verificaciÃ³n de correo, recuperaciÃ³n de contraseÃ±a ni 2FA, y estÃ¡n dichas en
  `CUENTAS.md` sin fingirlas.

- 05/11/2026: **feedback de capturas aplicado**. Marca **Fondo Popular** con logotipo propio,
  pie legal retirado y navegaciÃ³n explicada; jornadas en tablas (4 por fila en PC, apiladas en mÃ³vil,
  Ã¡rbitro, escudos, actas y nombres cortos), fecha derecha corregida con `fecha_ultima_jugada`; nombres
  cortos guardados para 34.904 equipos de CyL; registro abierto en `/entrar` + `/crear-cuenta`; historiales
  de jugador, equipo y club enlazados desde las fichas; fichas de Ã¡rbitro, entrenador y delegado. Los
  asistentes de Ã¡rbitro no estÃ¡n en el canÃ³nico y no se inventan. QA ronda 8 encontrÃ³ dos bloqueantes
  (acta sin nombres cortos y portada con axe), corregidos; ronda 9 cerrÃ³ la portada y dejÃ³ abierto el
  `h1` del acta; ronda 10 dio **APTA** con el `h1` corto y el completo en `title`. Suite completa
  1.183/1, e2e 58/58, web 600/1, `tsc`, `lint` y `next build` verdes.

- 05/11/2026: **QA ronda 6 (NO APTA) y ronda 7 (APTA)**. La ronda 6 encontrÃ³ un contraste serious en
  la ficha de jugador en oscuro (chip de federaciÃ³n a 4,33:1) y cuatro importantes: federaciones de
  prueba visibles, `/mi-panel` sin tema, etiqueta Â«ActasÂ» ambigua y tamaÃ±os de escudo. Corregido:
  chip con `text-[var(--texto)]`, `f.codigo not like 'pruebas%'` en `SQL_FEDERACION_NO_EXCLUIDA`
  (incluye `/explorar/competicion/1117` y API â†’ 404), `/mi-panel` en `RUTAS_CON_TEMA`, Â«Actas
  correctasÂ» y tamaÃ±os 22Ã—24/56Ã—56 confirmados con `getBoundingClientRect`. La ronda 7 dio **APTA**:
  axe 0 en jugador oscuro a 1440/360, 0 apariciones de federaciones de prueba, escudos exactos y
  base limpia (0 usuarios/sesiones/favoritos). `pnpm test` 1061, e2e 48/48, web 478, `tsc`, `lint` y
  `next build` en verde.
- 05/11/2026: **revisiÃ³n de capturas Â· ACCESO implementado, pendiente de validaciÃ³n (la casilla de
  Â«AccesoÂ» sigue SIN marcar).** Registro abierto: migraciÃ³n nueva **0059** pone
  `app.ajuste.registro_modo = 'abierto'` (idempotente; no se tocan 0057/0058) y la web deja de pedir
  cÃ³digo de invitaciÃ³n; `app.alta_cuenta`/`app.alta_usuario` crean la cuenta activa sin consumir
  invitaciÃ³n, con el paquete por defecto (sÃ³lo favoritos y datos pÃºblicos). `/entrar` queda sÃ³lo para
  entrar y el alta se separa en `/crear-cuenta`, con enlaces entre ambas y `volver` conservado.
  Â«AvisosÂ» se anuncia en `/mi-panel` como Â«mÃ¡s adelanteÂ», sin botones ni push. Se mantienen scrypt,
  sesiÃ³n con token hasheado, CSRF por `Origin` y los lÃ­mites de entrada/alta. Pruebas actualizadas:
  cuentas (23), flujo real contra PostgreSQL (4), `/entrar` (8), `/crear-cuenta` (9) y `/mi-panel`
  (7); `tsc` verde. Chrome real 1440/360 con axe 0 y sin desplazamiento; capturas en
  `tmp/acceso-*.png`. Detalle en `docs/plataforma-web/CUENTAS.md`.

- 05/11/2026: **revisiÃ³n de capturas, punto Â«MarcaÂ» implementado y pendiente de validaciÃ³n (casilla
  SIN marcar).** Nombre **Fondo Popular** y tagline Â«fÃºtbol federado, temporada a temporadaÂ» en
  un Ãºnico sitio (`componentes/marca/marca.ts`): cabecera, `metadata` del layout y tÃ­tulo por defecto.
  Logotipo propio en `componentes/marca/Logotipo.tsx` (baldosa del acento con la cancha dibujada:
  rectÃ¡ngulo, lÃ­nea de medio campo y cÃ­rculo central; 28Ã—28, decorativo porque la marca va en texto) y
  `app/icon.svg` con el mismo dibujo. Se retira el pie Â«Archivo privado. No es una web oficial.Â» del
  layout (sin sustituirlo). Las funciones de la barra se explican con un descriptor de dos lÃ­neas en
  escritorio (â‰¥1280) y `sr-only` + `aria-describedby` + `title` por debajo, porque el espacio es del
  buscador: Explorar â†’ Â«Competiciones y gruposÂ» (a `/explorar/competiciones`), Rankings â†’ Â«GoleadoresÂ»
  (a `/explorar/estadisticas`, con `seccionActiva` marcÃ¡ndola), y Ojeo/Comparar quedan desactivadas
  (`aria-disabled` + nombre accesible + `title`, sin enlaces muertos). El anillo de foco de la nav ya
  no se recorta (padding interno del contenedor de desplazamiento). Pruebas
  `apps/web/test/cabecera-sitio.test.ts` 12/12 (marca, tagline, logotipo, favicon sin Â«--Â» en
  comentarios, funciones explicadas, pie ausente, Ã³rdenes de foco y secciÃ³n activa); `tsc` verde.
  Chrome real 1440/360 y oscuro con axe 0 serias/crÃ­ticas, sin desplazamiento horizontal y objetivos de
  44 px; capturas `tmp/marca-1440.png`, `tmp/marca-360.png`, `tmp/marca-oscuro-1440.png` (y
  `tmp/marca-logo.png`, `tmp/marca-icono.png`, `tmp/marca-vieja-1440.png`). **Pendiente**: validaciÃ³n
  del nombre y del logotipo; los `<title>` por pantalla de otros ficheros (`app/entrar`,
  `app/mi-panel`, fichas, `lib/calendario.ts`, `lib/estadisticas.ts`, `lib/jornadas.ts`, `lib/acta.ts`,
  `lib/pantalla-competicion.ts`) siguen diciendo Â«â€” facylfÂ»: no se tocan aquÃ­ porque son de otros
  agentes y algunos estÃ¡n en ediciÃ³n.

- 05/11/2026: **revisiÃ³n de capturas Â· nombres cortos de equipo y fecha de Ãºltima jornada (datos),
  pendiente de integraciÃ³n y validaciÃ³n.** La migraciÃ³n de nombres cortos se aplicÃ³ como **0060**
  (el Lead la renombrÃ³ para no chocar con `0059-registro-abierto`, que sigue intacta). Tabla
  `analytics.nombre_corto_equipo` con `team_entry_id` PK, `nombre_corto` no vacÃ­o, `metodo`
  (`regla`/`manual`), `confianza` 0..1 y `observado_en`; grants SELECT a `facylf_lector` y
  SELECT/INSERT/UPDATE/DELETE a `facylf_publicador`. Poblado con
  `scripts/nombres-cortos-equipos.mjs` (reglas en `scripts/lib/nombres-cortos.mjs`, decisiones manuales
  incluidas) sobre los **34.904 equipos de CyL**: todos con nombre corto, 2.569 filas `manual` (7,36 %),
  17 con confianza < 0,7 para revisar. Ejemplos guardados: `Isoba`, `R. Valladolid`, `Santa Marta`,
  `Ponferradina`, `Salamanca CF`. Segunda pasada del script: 0 filas modificadas (idempotente).
  Consultas ampliadas: `local_nombre_corto`/`visitante_nombre_corto` en `partidos-de-grupo` (y en el
  acta), `equipo_corto` en `clasificaciÃ³n-de-la-pantalla`, `rival_corto` en `partidos-del-equipo`,
  `equipo_corto`/`rival_corto` en `partidos-de-persona` y `fecha_ultima_jugada` en `grupo-por-id`
  (3769: 2026-10-04; 75252: `null` pese a tener calendario el 2026-10-17). Medido con el rol de lectura:
  `grupo-por-id` 9,5 ms, clasificaciÃ³n 10,8 ms, partidos 55,9 ms, partidos del equipo 7,2 ms y partidos
  de persona 44,2 ms. Planes guardados actualizados. 13 pruebas nuevas y suite web en verde (541). En
  el momento de cerrar, `tsc` fallaba sÃ³lo por `consultas/historial.ts`, un fichero en ediciÃ³n de otro
  agente; mis ficheros compilan. El uso del nombre corto en jornadas/mÃ³vil y la fecha derecha de la
  barra los integra `pantalla`.

- 05/11/2026: **historial de jugador implementado, pendiente de validaciÃ³n del Lead (el punto
  Â«HistorialesÂ» del feedback de capturas sigue SIN marcar: faltan equipo, club, equipos de un club y
  equipo por temporadas).** Ruta nueva `/explorar/jugador/[id]/historial` (id `core.person.id`), sin
  editar pantallas existentes; el enlace desde la ficha lo integra el Lead. Consulta nueva
  `apps/web/src/consultas/historial.ts` (`historial-de-jugador`, una sola consulta: persona +
  apariciones en JSON, con goles/tarjetas de `match_event` y minutos fiables del resumen por
  equipo-temporada); reglas puras en `apps/web/src/lib/historial-jugador.ts` (tramos, cambios,
  solapes, resumen); componentes en `apps/web/src/componentes/historial/`. Pruebas
  `apps/web/test/historial-jugador.test.ts` (25), contrato real con la persona 1181455 (144
  apariciones, 8 inscripciones, 5 temporadas, cambio real de club a mitad de 2015-16) y 19057 (dos
  equipos del mismo club con fechas solapadas). `EXPLAIN (ANALYZE, BUFFERS)`: 7,06 ms (presupuesto 400;
  el primer intento con `analytics.federacion_ficha` daba 590 ms y se quitÃ³). PÃ¡gina en caliente
  0,55â€“0,71 s en el servidor de desarrollo. Axe 0 serias/crÃ­ticas en 1440/360 claro y oscuro, sin
  desplazamiento horizontal, un solo `h1` y 404 real; capturas en `tmp/historial-jugador-*.png`.
  Casos que no existen en el canÃ³nico: no hay dos inscripciones del mismo grupo en una temporada
  (imposible por esquema) y las identidades nominales con Â«muchos equiposÂ» (p. ej. 12137, 15 equipos)
  son colisiones de nombre, no traspasos: la pÃ¡gina conserva el aviso de identidad nominal y no fusiona.

- 05/11/2026: **feedback de capturas de JORNADAS implementado, pendiente de validaciÃ³n del Lead (el
  punto Â«JornadasÂ» de la revisiÃ³n sigue SIN marcar).** `/explorar/competicion/[id]/jornadas` ahora son
  tablas: una por jornada, con `Jornada N`, fechas publicadas y estado (jugada, parcial, programada,
  sin fecha); resultados local-marcador-visitante con escudo en cada partido, filas enlazadas a
  `/explorar/equipo/[id]`, Ã¡rbitro publicado en cada partido y enlace a `/explorar/acta/[id]` sÃ³lo con
  acta analizada. La rejilla es de 4 tablas por fila en escritorio (`sm:grid-cols-2` y
  `xl:grid-cols-4`), 2 en tablet y 1 en mÃ³vil; en mÃ³vil cada partido apila los dos equipos y deja el
  marcador a la derecha. Los nombres usan `local_nombre_corto`/`visitante_nombre_corto` guardados
  (fallback puro `nombreCorto()` en `apps/web/src/lib/nombres-equipo.ts` para lo que falte; los casos
  dudosos se quedan completos). La barra de temporada muestra a la derecha
  `GRUPO_POR_ID.fecha_ultima_jugada` (`max(coalesce(played_at, fecha_prevista))` sÃ³lo de partidos con
  resultado), no la Ãºltima programada: 75256 enseÃ±a 3 oct y no el 4 oct del calendario; 75252 no tiene
  ninguna jornada jugada y no finge la fecha del 17 oct. Se actualizaron `CabeceraCompeticion`, la
  pÃ¡gina de clasificaciÃ³n, calendario y estadÃ­sticas para pasar esa fecha; el detalle usa el mismo
  componente de partidos (Ã¡rbitro, escudos, actas) y la tarjeta lateral de clasificaciÃ³n pasa a
  escudos/nombres cortos/Ã¡rbitro/acta. Pruebas: `jornada-pantalla.test.ts` 31, `nombres-equipo.test.ts`
  7 y `competicion-pantalla.test.ts` 63 (contrato de `fecha_ultima_jugada`, 3769 = 2026-10-04 y 75252 =
  null, columnas de nombres cortos); las cinco suites relacionadas suman 195 en verde. `tsc` en verde al
  cerrar. Chrome real: axe 0 serias/crÃ­ticas y sin desplazamiento horizontal en 1440/400/360 claro y
  1440 oscuro; capturas `tmp/jornadas-tablas-1440.png`, `-360`, `-400`, `-1440-oscuro`,
  `tmp/jornadas-tablas-30665-1440.png`, `tmp/jornadas-tablas-75252-1440.png`,
  `tmp/jornadas-clasificacion-797-1440.png`, `tmp/jornadas-detalle-1440.png` y
  `tmp/jornadas-detalle-360.png`. **Pendiente para el Lead**: validar el conjunto; decidir si la tabla
  de clasificaciÃ³n tambiÃ©n debe usar `equipo_corto` (la consulta ya lo trae, la tabla sigue con el
  nombre completo) y si el listado debe paginar/plegar jornadas cuando la temporada estÃ© completa (hoy
  pinta todas las publicadas seguidas).

- 05/11/2026: **estadÃ­sticas de Ã¡rbitros, entrenadores y delegados implementadas, pendiente de
  validaciÃ³n del Lead (la casilla sigue SIN marcar).** Rutas nuevas `/explorar/arbitro/[id]`,
  `/explorar/entrenador/[id]` y `/explorar/delegado/[id]` con el id canÃ³nico de `core.person`; contrato
  en `docs/plataforma-web/` no cambiado (no se existe API todavÃ­a para estas fichas). Una consulta por
  pantalla en `apps/web/src/consultas/oficiales.ts` (`arbitro-por-id`, `entrenador-por-id`,
  `delegado-por-id`; `plan: indexado`, presupuesto 400 ms): **21,7 / 15,6 / 15,1 ms p50** con el rol de
  lectura (EXPLAIN ANALYZE: 6,97 / 3,20 / 2,56 ms) y **ningÃºn `Seq Scan`** en `core.match`,
  `match_event`, `match_official`, `match_staff` ni `match_report`. La media del Ã¡rbitro se compara con
  la de TODA su competiciÃ³n (240 partidos con acta en 797, no sus 10). Reglas puras en
  `apps/web/src/lib/oficiales.ts`: normaliza los 171 literales de rol del acta (espaÃ±ol, euskera,
  catalÃ¡n e inglÃ©s) a familias â€”entrenador, segundo, portero, delegado de equipo, delegado de campoâ€” y
  con la MISMA regla que el SQL; V-E-D para la racha; medias que devuelven `null` (nunca 0) sin partidos
  con acta. Componentes en `apps/web/src/componentes/oficiales/` (cabecera, piezas y una secciÃ³n por
  figura) reutilizando `Cifras`/`TARJETA` de estadÃ­sticas y los tokens del sistema. Pruebas
  `apps/web/test/oficiales-pantalla.test.ts`: **33 en verde**, con contrato real (18951 = 10 partidos,
  37 amarillas, 12 rojas, 4 penaltis y la competiciÃ³n 1101/240; 19080 = 30 partidos, 13-5-12; 19236 = 30
  partidos como Â«DEL. EquipoÂ»), 404 (id inexistente, no numÃ©rico, persona sin rol y rol cruzado) y
  textos prohibidos (Â§8). `tsc` en verde. Chrome real: axe **0** serias/crÃ­ticas en 1440/360 claro y 1440
  oscuro, sin desplazamiento horizontal a 360; capturas `tmp/oficiales-arbitro-1440.png`, `-360`,
  `tmp/oficiales-entrenador-*`, `tmp/oficiales-delegado-*` y `*-oscuro-1440.png`. **LÃ­mite**: sÃ³lo
  Ã¡rbitro principal (`core.match_official` no guarda asistentes; no se inventan). El enlace acta â†’
  ficha del Ã¡rbitro queda pendiente: `ACTA_DEL_PARTIDO` no devuelve el `person_id` de los oficiales y
  esa consulta vive en `partidos.ts`, fuera del alcance de esta tarea; cuando se aÃ±ada el id, el enlace
  es una lÃ­nea en `componentes/acta/ContextoActa.tsx`.
- 05/11/2026: **API v1 ampliada con estadÃ­sticas, historiales y fichas de oficiales; pendiente de
  validaciÃ³n del Lead (la casilla Â«Backend/API de estadÃ­sticas, historiales y oficialesÂ» sigue SIN
  marcar).** Siete endpoints nuevos, reutilizando las consultas existentes sin copiar SQL:
  `GET /api/v1/estadisticas/competicion/[id]` (grupo-por-id + partidos + eventos + goleadores; resumen
  con la funciÃ³n pura de la pÃ¡gina), `GET /api/v1/ficha/jugador/[id]/historial`,
  `/ficha/equipo/[id]/historial`, `/ficha/club/[id]/historial`, y
  `GET /api/v1/oficiales/arbitro/[id]`, `/entrenador/[id]`, `/delegado/[id]`. Mismo sobre, errores, ETag/304, `Cache-Control` y lÃ­mite de la
  API v1; ids invÃ¡lidos 400, recursos inexistentes 404 y **un jugador en la ficha de Ã¡rbitro es 404**
  (no se inventa una ficha vacÃ­a). Sin datos de cuenta. Etiquetas nuevas en `lib/cache.ts`:
  `estadisticas` (grupo), `historiales` (persona/equipo/club) y `oficiales` (persona), con derivaciÃ³n
  desde grupo/ediciÃ³n/federaciÃ³n/equipo/club/persona; el Ã­ndice `/api/v1` ya las anuncia como
  `disponible` (antes `estadisticas` era Â«planeadoÂ»). Medido en dev: MISS p50 28,9â€“120,2 ms, HIT p50
  15,2â€“33,2 ms, 304 5/5 por recurso; `EXPLAIN` de las 10 consultas implicadas dentro de presupuesto y
  sin `Seq Scan` en tablas de hechos (19,9 ms la mÃ¡s lenta, historial de club). **No se aÃ±ade ningÃºn
  Ã­ndice ni migraciÃ³n.** Pruebas nuevas `apps/web/test/api-v1-ampliacion.test.ts` (12) y contrato real
  con 3769, 1181455, 17609, 1495, 657011, 1251791 y 1072476; `tsc` aislado de la API en verde. La suite
  web completa queda en 633 pasadas y una suite externa roja (`rankings-ojeo.test.ts`, de otro agente en
  vuelo); `tsc` global bloqueado por ese mismo fichero externo. `docs/plataforma-web/API.md` actualizado
  con recursos, parÃ¡metros, errores, tabla de mediciones y pendientes; evidencia en
  `tmp/api-ampliacion-mediciones.json`, `tmp/api-curl-ampliacion.txt` y
  `tmp/api-ampliacion-explain.json`.
- 05/11/2026: **AdministraciÃ³n (AdminInicio y Admin) implementada, pendiente de validaciÃ³n (la
  casilla Â«AdministraciÃ³nÂ» sigue SIN marcar).** Rutas **`/admin`** y **`/admin/usuarios`** con datos
  reales de `consultas/admin.ts` (rol `facylf_app`): resumen de cuentas, invitaciones, avisos,
  accesos sensibles, procesos, auditorÃ­a y lista de usuarios con filtros por estado/nombre. Guardia en
  servidor: sin sesiÃ³n â†’ `/entrar?volver=<ruta>`; con sesiÃ³n sin rol `administrador` o sin
  `administrar_usuarios` â†’ **404** (no 403, no se revela la zona); no se acepta `user_id` por la URL y
  ambas pÃ¡ginas son `no-store`. **SÃ³lo lectura**: no hay botones de aprobar/rechazar/bloquear; se dice
  en pantalla. 2FA/verificaciÃ³n no implementadas, tambiÃ©n dicho. Pruebas
  `apps/web/test/admin-pantallas.test.ts` (22: decisiÃ³n de guardia, guardia de servidor con sesiÃ³n
  simulada, render con fixtures y contrato de consultas reales). Chrome real 1440/360: 200 como
  administrador, 404 como usuario normal, axe 0 y sin desplazamiento horizontal; capturas en
  `tmp/admin-*.png`. Detalle en `docs/plataforma-web/ADMINISTRACION.md`.

- 05/11/2026: **pantallas restantes Â· comparador de jugadores y ficha de federaciÃ³n, hechos y pendientes
  de validaciÃ³n (casillas Â«Comparar jugadoresÂ» y Â«FederaciÃ³n y LigaÂ» SIN marcar).** Rutas nuevas
  **`/explorar/comparar`** (selecciÃ³n por nombre o id; si un nombre coincide con varias personas se
  enseÃ±an y no se elige solo; dos consultas en una foto: personas y trayectorias; mÃ©tricas de carrera con
  Â«sin datosÂ» en el lado que falte, barras espejo y rejilla de trayectorias con tabla accesible) y
  **`/explorar/federacion/[codigo]`** (por defecto redirige a `castilla-leon`; identidad con escudo,
  Â«quÃ© datos publicaÂ» medido, avisos con cifra, 12 de las 55 competiciones de 2026-27 con su nivel y
  enlace a su grupo, y comparativa con otras federaciones). Consultas nuevas
  `apps/web/src/consultas/comparar.ts` y `federacion-ficha.ts` (reutiliza `FICHA_FEDERACION` y
  `AVISOS_DE_DATOS` de `federaciones.ts`); lÃ³gica en `apps/web/src/lib/comparar.ts` y
  `lib/federacion-ficha.ts`; componentes en `componentes/comparar/` y `componentes/federacion/`.
  Medido con rol lector: comparar 2 consultas Â· 13,5 ms; federaciÃ³n 4 consultas Â· 92,6 ms (la mayor,
  `ficha-federaciÃ³n` todas, 84 ms; presupuestos 150/300/400/50 ms). Pruebas
  `apps/web/test/comparar-federacion.test.ts` (30) y suite web con 732 pasadas; en el cierre fallan sÃ³lo
  dos ficheros de otros agentes (`admin-pantallas` y `cabecera-sitio`) y `tsc` global queda bloqueado por
  `datos-salud-estados` (ajeno); sin errores en los ficheros de esta tanda. Chrome real 1440/360: axe 0
  en las dos, sin desplazamiento horizontal del documento a 360/400, 404 real para cÃ³digo inexistente o
  invÃ¡lido y redirecciÃ³n por defecto comprobada. Capturas en `tmp/comparar-1440.png`,
  `tmp/comparar-360.png`, `tmp/federacion-1440.png` y `tmp/federacion-360.png`. Pendiente: la pantalla
  **Liga** del par Â«FederaciÃ³n y LigaÂ» (no incluida en esta tanda) y la validaciÃ³n del Lead.

- 05/11/2026: **Inicio rediseÃ±ado y Mi cuenta implementados, pendientes de validaciÃ³n del Lead (los
  puntos Â«Inicio / MainÂ» y Â«CuentaÂ» de la revisiÃ³n de capturas siguen SIN marcar).** `/` ya no es el
  resumen tÃ©cnico del archivo: hero de bÃºsqueda que usa la misma consulta canÃ³nica que `/buscar`
  (`/buscar?q=â€¦`), Â«Explorar una competiciÃ³nÂ» con seis competiciones reales de Castilla y LeÃ³n
  (primer grupo de cada ediciÃ³n, para no repetir la misma competiciÃ³n por provincias; cobertura
  medida en cada tarjeta, Â«Cobertura sin medirÂ» cuando no hay punto de control) y enlace al selector
  `/explorar/competiciones`; y Â«Tus equiposÂ»: con sesiÃ³n, hasta tres favoritos de `app.mis_accesos`
  con Ãºltimo/prÃ³ximo y enlace a su ficha; sin sesiÃ³n, invitaciÃ³n honesta a entrar o crear cuenta, sin
  equipos inventados; si los favoritos fallan, la portada sigue y lo dice. Consulta de portada
  `grupos-del-selector` con `fed=castilla-leon`, 60 filas para sacar seis ediciones distintas: 44 ms
  de mediana; una sola consulta de catÃ¡logo y, sÃ³lo con sesiÃ³n, sesiÃ³n + favoritos. `Mi cuenta`
  (`/mi-cuenta`) lee `app.perfil(user_id)` con el rol `facylf_app` (una consulta, 23 ms): nombre,
  estado (la fecha de validez manda: Â«CaducadaÂ»), paquete y fin, zona horaria, alta, rol, favoritos y
  avisos sin leer; preferencias reales de aviso (canales, correo/resumen/hora, silencio, eventos) con
  la frase de que los avisos automÃ¡ticos aÃºn no se envÃ­an; seguridad con lo que NO existe dicho
  (verificaciÃ³n de correo, 2FA y cambio de contraseÃ±a no implementados) y cierre de sesiÃ³n POST real
  a `/api/cuentas/salir`; Â«Tus datosÂ» dice que descarga y baja no estÃ¡n disponibles. Sin sesiÃ³n invita
  a entrar; si la cuenta no se puede leer, lo dice sin pintar una cuenta vacÃ­a. **El correo solo
  puede enseÃ±arse enmascarado si una funciÃ³n SQL lo expone: `facylf_app` no tiene permiso de lectura
  sobre `app.credencial` y la pantalla lo dice (Â«No se muestra en esta pantallaÂ») en vez de inventar
  una direcciÃ³n.** AÃ±adido el enlace Â«Mi cuentaÂ» a la cabecera de Mi panel (sin tocar
  `CabeceraSitio`). Ficheros nuevos: `consultas/mi-cuenta.ts`, `lib/cuenta-pantalla.ts`,
  `lib/inicio.ts`, `componentes/inicio/InicioContenido.tsx`, `componentes/cuenta/MiCuenta.tsx`,
  `app/mi-cuenta/page.tsx`, `app/page.tsx` reescrito y pruebas `inicio.test.ts` (10) y `cuenta.test.ts`
  (14). Chrome real con una cuenta de prueba creada y borrada despuÃ©s: 1440/360, axe 0 serias/crÃ­ticas
  y sin desplazamiento horizontal en Inicio y Mi cuenta, con y sin sesiÃ³n; capturas
  `tmp/inicio-1440.png`, `tmp/inicio-360.png`, `tmp/inicio-sesion-1440.png`,
  `tmp/inicio-sesion-360.png`, `tmp/cuenta-1440.png`, `tmp/cuenta-360.png`,
  `tmp/cuenta-sin-sesion-1440.png` y `tmp/cuenta-sin-sesion-360.png`. `tsc` de los ficheros de esta
  tanda en verde (al cerrar quedaba un error de otra prueba de otro agente en `datos-salud-estados`).
  **Pendiente para el Lead**: (a) decidir si hace falta la funciÃ³n SQL para el correo enmascarado â€”
  requiere migraciÃ³n nueva, que esta tarea no aplicaâ€”; (b) las preferencias de aviso y el cambio de
  nombre/zona estÃ¡n en solo lectura porque no hay acciÃ³n/API que guarde, y 2FA, verificaciÃ³n de
  correo, cambio de contraseÃ±a, descarga y baja no existen; (c) la portada enseÃ±a seis competiciones
  de la temporada mÃ¡s reciente del catÃ¡logo de CyL: decidir si se quiere una selecciÃ³n editorial por
  categorÃ­a en vez del primer grupo de cada ediciÃ³n.

- 05/11/2026: **Rankings y Ojeo implementados, pendiente de validaciÃ³n (casilla SIN marcar).** Rutas
  `/explorar/rankings` y `/explorar/ojeo`, con datos reales y sin tocar `CabeceraSitio` (los enlaces
  los integra el Lead). Rankings con pestaÃ±as Goleadores/Tarjetas y filtros federaciÃ³n/temporada/
  competiciÃ³n/grupo/mÃ­nimo de partidos; por defecto CyL, la temporada mÃ¡s reciente y mÃ­nimo 5 partidos
  (como el prototipo: con 0, la temporada en curso la encabezaban benjamines con 3 partidos y 20
  goles); tabla con enlaces a jugador, equipo y competiciÃ³n, total real y paginaciÃ³n de 25. Ojeo con
  federaciÃ³n/temporada/categorÃ­a/edad (calculada desde la temporada: sub-19 de 2026-27 = nacidos en
  2008 o despuÃ©s)/minutos/posiciÃ³n; 40 perfiles por bÃºsqueda (el total estÃ¡ acotado a 1.001 y se dice
  Â«mÃ¡s de 1.000Â»), enlaces a ficha e historial y lista propia a 360 px porque la tabla de 900 no cabe.
  **Los nombres de menores se publican**: la consulta de ojeo recibe el permiso en `true` y una prueba
  exige nombre en filas `es_menor`. Consultas nuevas en `consultas/rankings.ts` (ranking por
  tipo/ediciÃ³n/grupo con `count(*) over ()` para el total y `LIMIT/OFFSET`; ediciones de la federaciÃ³n
  y temporada; categorÃ­as del ojeo). Medido contra el canÃ³nico: ranking 7â€“19 ms con mÃ­nimo 5 y
  182â€“195 ms con mÃ­nimo 0; ediciones 0,8 ms; categorÃ­as 38 ms; ojeo 54â€“135 ms. Pruebas
  `apps/web/test/rankings-ojeo.test.ts` 21/21 (filtros y URL, edad, contrato de las consultas y
  canÃ³nico real) y `cabecera-sitio.test.ts` 12/12; `tsc` global en verde al cerrar. Chrome real: axe 0
  serias/crÃ­ticas en Rankings y Ojeo a 1440, 360, 400 y en oscuro; sin desplazamiento horizontal del
  documento; capturas `tmp/rankings-1440.png`, `tmp/rankings-360.png`,
  `tmp/rankings-oscuro-1440.png`, `tmp/rankings-tarjetas-1440.png`,
  `tmp/rankings-pagina2-1440.png`, `tmp/rankings-vacio-1440.png`, `tmp/ojeo-1440.png`,
  `tmp/ojeo-360.png`, `tmp/ojeo-oscuro-1440.png` y `tmp/ojeo-posicion-vacio-1440.png`.
  **Pendiente para el Lead**: (a) enlazar Â«RankingsÂ» a `/explorar/rankings` y activar Â«OjeoÂ» a
  `/explorar/ojeo` (dejÃ© `activo.ts` marcando esas rutas); (b) en el canÃ³nico la posiciÃ³n de campo
  (`linea`) estÃ¡ vacÃ­a en todas las filas, asÃ­ que filtrar por defensa/medio/delantero devuelve el
  vacÃ­o explicado y sÃ³lo Â«PorteroÂ» tiene datos â€”no se inventaâ€”; (c) el pie con Â«PublicidadÂ» lo aÃ±adiÃ³
  otro agente: la prueba de cabecera ya sÃ³lo exige que no vuelva el texto Â«Archivo privadoÂ».

- 05/11/2026: **Datos, Salud y Estados implementados, pendiente de validaciÃ³n del Lead (la casilla sigue
  SIN marcar).** Rutas nuevas `/explorar/datos` (calidad y cobertura), `/explorar/salud` (estado de la
  plataforma) y `/explorar/estados` (vacÃ­os, carga, error y 404). Fuente Ãºnica, toda con el rol de
  lectura: `ops.chequeos()` (68 comprobaciones con estado, valor y umbral), `ops.coverage_checkpoint`,
  `ops.recuento_canonico`, `analytics.federacion_capacidad` y `analytics.parametro_capacidad`; sin datos
  de cuentas ni de publicidad. Consultas en `apps/web/src/consultas/observabilidad.ts`
  (`chequeos-de-la-plataforma`, `cobertura-por-temporada`, `capacidad-de-federaciones`,
  `parametros-de-capacidad`, `frescura-y-cobertura`, `ejemplos-de-estados`); las comprobaciones y la
  frescura se cachean 5 minutos (`consultas/observabilidad-cache.ts`), porque `ops.chequeos()` tarda
  ~3,1 s por diseÃ±o (ventanas de 60 dÃ­as sobre tablas de hechos) y `max(ingested_at)` recorre
  `core.match_report` (~0,33 s). Medido con el rol de lectura: comprobaciones 3,07 s p50 (cacheadas;
  presupuesto 6 s), cobertura 15,8 ms, capacidad 28,7 ms, parÃ¡metros 1,0 ms, frescura 328 ms, ejemplos
  de estados 48 ms; ninguna consulta de pantalla hace `Seq Scan` sobre tablas de hechos salvo el
  `max(ingested_at)` de la frescura, que estÃ¡ documentado. Reglas puras en
  `apps/web/src/lib/observabilidad-pantalla.ts`: comprobaciÃ³n â†’ nombre/unidad/umbral (lo desconocido se
  enseÃ±a legible y no se inventa), peor estado por Ã¡rea, capacidad derivada de los umbrales REALES
  (40 % de cambios, 15 % de tarjetas, 80 % de minuto, 30 % de actas), porcentajes imposibles (>100)
  como Â«â€”Â», temporada de referencia = Ãºltima cerrada y los cuatro motivos de estado vacÃ­o con sus
  cifras reales. Componentes en `apps/web/src/componentes/observabilidad/` con el sistema de diseÃ±o y
  una tabla propia con regiÃ³n enfocable (axe marcaba `scrollable-region-focusable` a 360 en la tabla
  compartida). Pruebas `apps/web/test/datos-salud-estados.test.ts` **34 en verde**: reglas puras,
  contrato real (68 comprobaciones, 12 temporadas de CyL, capacidad 2025-26, frescura y cuatro grupos
  reales para Estados), 404 reales de rutas hijas y textos internos prohibidos; toda la web **770
  pruebas en verde** (37 ficheros) y `tsc` global verde. Chrome real: 200 en las tres rutas, axe **0**
  serias/crÃ­ticas en 1440/360 claro y 1440 oscuro, sin desplazamiento horizontal del documento y sin
  errores de consola; en caliente datos 0,64 s, salud 0,30 s y estados 0,23 s (servidor de desarrollo).
  Capturas `tmp/datos-*.png`, `tmp/salud-*.png` y `tmp/estados-*.png`. **LÃ­mites**: (a) no se publican
  datos de cuentas ni publicidad; (b) el tiempo de respuesta por peticiÃ³n no se enseÃ±a porque
  `lib/observabilidad.ts` (`midiendo`/`anotaError`/`registraWebVital`) existe pero todavÃ­a no estÃ¡
  integrado en ninguna ejecuciÃ³n: la pantalla lo dice en vez de inventar p95; (c) los estados de cuenta
  del prototipo (solicitud pendiente, acceso suspendido, paquete caducado) son de la pantalla de cuenta
  y no se incluyen aquÃ­.

## Ingesta de CyL (06/11/2026)

- [x] Priorizar los grupos de Castilla y LeÃ³n en el importador local. El orden anterior daba paso a grupos de otras federaciones y la Ãºltima tanda del servidor cerrÃ³ con 0 grupos importados y 3 cortes a los 60 minutos. La prueba de orden reproduce ese desplazamiento.
- [ ] Aplicar el cambio al importador del servidor y medir el siguiente lote y el recuento canÃ³nico de competiciones completas. El panel sÃ³lo suma una competiciÃ³n cuando todos sus grupos se han certificado.

- El 06/11 el canÃ³nico devolviÃ³ 3.600 grupos de CyL y cero recalculados en 24 horas. El proceso de importaciÃ³n del servidor seguÃ­a ejecutando una tanda y su copia local de `docker/importador.yml` y `scripts/importar-masivo.mjs` tenÃ­a cambios de operaciÃ³n. Integrar y comprobar la prioridad al terminar la tanda, revisando primero ese Ã¡rbol.
- Pruebas de la prioridad: 8 de 8 antes de aÃ±adir el caso, el caso nuevo fallÃ³ con el orden anterior y 9 de 9 tras el arreglo. La suite de scripts pasÃ³ 226 de 226. La suite general previa tardÃ³ casi 16 minutos: 1.355 superadas, una omitida y un tiempo agotado en la prueba de correcciÃ³n de acta del canÃ³nico.
