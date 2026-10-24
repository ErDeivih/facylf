# Prototipo de la web nueva (copia del 24/10/2026, v6)

Copia de los 22 tableros (más la cabecera común) del artefacto de diseño privado de David «Plataforma de fútbol federado — prototipo». Está aquí para que quien construya la fase C pueda leerlo sin acceso a ese artefacto.

- **Todos los datos son inventados**: nombres, clubes, cifras. Los únicos medidos son los porcentajes de «Qué datos publica» del tablero 19.
- Formato: cada `.dc.html` es HTML con estilos en línea. `{{x}}` son huecos que rellena la clase `Component` del final del fichero, que trae los datos de ejemplo. `<sc-for>` es un bucle, `<sc-if>` un condicional y `<dc-import name="Cabecera">` incluye `Cabecera.dc.html`.
- **Sirven como referencia de composición**: qué va en cada pantalla, en qué orden, qué jerarquía y qué textos. **No son código para copiar.** Los valores de color, tipografía y espacio salen de `apps/web/src/app/tokens.css` (DESIGN.md); el prototipo usa colores escritos a mano.
- Los colores de resultado G/E/P son `#1e7a47`, `#66717d` y `#c8463b`, siempre con su letra (GRAFICOS.md).

| Tablero | Fichero | Ruta en la web |
|---|---|---|
| 1 Inicio | `Main.dc.html` | `/` |
| 2 Competición | `Competicion.dc.html` | `/competicion/[id]` |
| 3 Acta | `Acta.dc.html` | `/partido/[id]` |
| 4 Equipo | `Equipo.dc.html` | `/equipo/[id]` |
| 5 Club | `Club.dc.html` | `/club/[id]` |
| 6 Jugador | `Jugador.dc.html` | `/jugador/[id]` |
| 7 Comparar | `Comparar.dc.html` | `/comparar` |
| 8 Rankings | `Ranking.dc.html` | `/rankings` |
| 9 Ojeo | `Ojeo.dc.html` | `/ojeo` |
| 10 Árbitro | `Arbitro.dc.html` | `/arbitro/[id]` |
| 11 Estadísticas de la competición | `Liga.dc.html` | `/competicion/[id]/estadisticas` |
| 12 Salud | `Salud.dc.html` | `/admin/salud` |
| 13 Entrar y registrarse | `Acceso.dc.html` | `/entrar`, `/registro` |
| 14 Mi panel | `MiPanel.dc.html` | `/mi` |
| 15 Administración: usuarios | `Admin.dc.html` | `/admin/usuarios` |
| 16 Calidad de datos | `Datos.dc.html` | `/admin/datos` |
| 17 Publicidad (apagada) | `Publicidad.dc.html` | `/admin/publicidad` |
| 18 Mi cuenta | `Cuenta.dc.html` | `/cuenta` |
| 19 Federación | `Federacion.dc.html` | `/federacion/[codigo]` |
| 20 Gráficos (guía) | `Graficos.dc.html` | (no es pantalla: guía de qué gráfico usar) |
| 21 Administración: inicio | `AdminInicio.dc.html` | `/admin` |
| 22 Estados vacíos y de cuenta | `Estados.dc.html` | (componentes: tarjeta de estado, `/cuenta/*`) |
| Cabecera | `Cabecera.dc.html` | barra superior común |
