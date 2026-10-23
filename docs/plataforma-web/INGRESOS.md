# Cuánto se gana con las visitas de una web — y qué le cuadra a facylf

> Claude, 22/10/2026, para David («busca también cómo sería la generación de ingresos por visitas»).
> Complementa `PUBLICIDAD.md` (cómo y dónde poner anuncios). Cifras de fuentes públicas citadas al final;
> son **orientativas**: cada web tiene las suyas y sólo el propio informe de AdSense dice la verdad.

## 1. Cómo se mide: RPM

**RPM de página** = euros que se ganan por cada **1.000 páginas vistas** (no por visitante). Es la única cifra
que permite comparar: `ingresos = páginas vistas / 1000 × RPM`.

De qué depende, de más a menos:
1. **País del visitante.** Tráfico de España y en español paga mucho menos que el de EE. UU. o Reino Unido
   (Reino Unido se cita en 12-30 $ de RPM; España, en 0,5-5 €).
2. **Tema.** Finanzas, seguros o abogados pagan 40-100 $ por mil impresiones; noticias y entretenimiento,
   5-20 $. El fútbol aficionado está en la parte baja: anunciantes locales y de material deportivo.
3. **Consentimiento.** Quien pulsa «Rechazar» en el banner de cookies sólo ve anuncios no personalizados,
   que pagan bastante menos. En España rechaza una parte importante de los usuarios.
4. **Cuántos anuncios por página y si se ven** (visibilidad). Más huecos no es más dinero si nadie llega a verlos.
5. **Temporada.** Diciembre paga más (campaña de Navidad), enero mucho menos. El fútbol base, además,
   desaparece en verano.

## 2. Cifras de referencia para España (AdSense, sin red intermediaria)

| Fuente | Cifra |
|---|---|
| Estimación general para sitios en España | **0,50 - 5 € por 1.000 visitas** |
| Ejemplo citado de un blog de cocina | 1,50 € de RPM |
| Tráfico en español con AdSense (otra fuente) | menos de 0,5 $ por 1.000 impresiones |
| AdSense en general (todas las webs, todo el mundo) | 2 - 6 $ de RPM |
| Redes con «header bidding» frente a AdSense solo | +50 % a +150 % (lo dice una red que lo vende: tomarlo con cautela) |

Para facylf, siendo prudentes: **RPM de 1 a 3 €** con AdSense solo y tráfico español de fútbol base.

## 3. Escenarios (páginas vistas al mes → ingresos al mes)

Una ficha de equipo, una clasificación o un acta son páginas distintas: en una web de resultados cada visita
ve varias (en webs de deporte, 3-6 páginas por visita es normal). Por eso se cuenta por páginas, no por visitas.

| Páginas vistas / mes | RPM 1 € | RPM 2 € | RPM 3 € |
|---|---|---|---|
| 10.000 (familias de un par de clubes) | 10 € | 20 € | 30 € |
| 100.000 (una provincia que la usa cada fin de semana) | 100 € | 200 € | 300 € |
| 500.000 (una federación entera) | 500 € | 1.000 € | 1.500 € |
| 2.000.000 (varias federaciones, referencia nacional) | 2.000 € | 4.000 € | 6.000 € |

Restar: el 20 % que se queda Google ya está descontado en el RPM; quedan los impuestos (es actividad
económica: alta en Hacienda, IVA intracomunitario con Google Ireland, IRPF) y el coste del servidor.
Umbral de pago de AdSense: 70 €.

## 4. Redes mejores que AdSense, y a partir de cuándo

| Red | Mínimo para entrar (2026) | Nota |
|---|---|---|
| Google AdSense | ninguno | lo más fácil; el punto de partida |
| Raptive | 25.000 páginas vistas/mes (desde oct. 2025) | sobre todo tráfico de EE. UU. |
| Mediavine (Journey) | 10.000 sesiones/mes | sobre todo inglés; cocina, viajes, hogar |
| Ezoic | 250.000 usuarios/mes (desde feb. 2026) | antes aceptaba casi a cualquiera |
| Redes españolas / «header bidding» gestionado | variable | sentido a partir de ~100.000 páginas/mes |

Con tráfico español y de fútbol base, lo realista es AdSense al principio y una red con subasta de varios
compradores («header bidding») cuando se pasen las 100.000-200.000 páginas al mes.

## 5. Lo que suele dar más que los anuncios en una web como esta

1. **Patrocinio directo.** Una tienda de deportes, una clínica de fisioterapia o un bar de la zona pagan una
   cantidad fija al mes por salir en las páginas de «su» competición o club (hueco D de `PUBLICIDAD.md`).
   Con 100.000 páginas al mes, 2-4 patrocinadores a 50-150 € al mes ya superan a AdSense, sin cookies ni
   consentimiento (no rastrea a nadie) y con anuncios que la gente sí mira porque son de su pueblo.
2. **Suscripción a funciones** (lo que ya prevén los paquetes de 0027): el buscador de talento, el comparador o
   las exportaciones interesan a entrenadores, coordinadores de cantera y ojeadores, que pagan por herramientas
   (2-10 € al mes por persona, o una cuota por club). Y quien paga no ve anuncios (`sin_anuncios`, 0033).
3. **Servicios a clubes y federaciones:** informes de temporada, datos para su web, página propia del club.

Orden recomendado si algún día se abre al público: patrocinio directo + paquetes de pago primero (no exigen
banner de consentimiento ni tráfico enorme); AdSense después, sólo en páginas sin menores y con CMP
certificado (ver la lista de `PUBLICIDAD.md` §6).

## 6. facylf hoy

La plataforma es **privada** (sólo con invitación): sin visitas públicas no hay ingresos por anuncios, y las
páginas tras login además exigen dar acceso al rastreador de AdSense. Lo preparado (0033: huecos apagados,
campañas directas, recuento de impresiones; panel de Publicidad) permite encenderlo en un día si cambia la
decisión, pero **no hay que hacer nada ahora**.

Para aprender con otros proyectos: el panel de Publicidad ya enseña impresiones, clics y CTR por hueco y
campaña; con AdSense, su informe da RPM por página, país y dispositivo, que es lo que hay que mirar cada mes.

## Fuentes

- [Sergio Canales — cuánto paga AdSense por 1.000 visitas (2026)](https://sergiocanales.com/cuanto-paga-google-adsense-por-1000-visitas/)
- [Cuánto Ganaría — Google AdSense en España](https://cuantoganaria.com/google-adsense-cuanto-se-gana/)
- [Partnerkin — RPM de AdSense por país](https://partnerkin.com/en/blog/articles/adsense_rpm_rates_by_country)
- [TechConda — RPM de página de AdSense por país y nicho](https://www.techconda.com/2026/02/adsense-rpm-benchmarks.html)
- [Newor Media — redes publicitarias 2026: requisitos y RPM](https://newormedia.com/blog/?p=1451)
- [Pubstack — estado de la publicidad programática, T1 2026](https://insights.pubstack.io/state-of-programmatic-q1-2026-edition)
