# Auditoría de capacidad de la ingesta

Medido: **2026-09-18T09:16:13.574Z** · ventana de 30 min · máquina: PC de trabajo (Windows) ·
presupuesto declarado: no declarado.

Generado por `scripts/auditar-capacidad.mjs`, que pega la salida de los diagnósticos existentes
(`_diag-plazas.mjs`, `_diag-ultimos-minutos.mjs`, `_diag-ritmo-real.mjs`) para no tener dos verdades
distintas sobre lo mismo.

## 1 · Plazas, turnos y quién espera

```
╔═ CAPACIDAD DE LA FLOTA · ventana 30 min
║  presupuesto: 15.95819091796875 GB · para navegadores 14.46 GB · coste 0.75 GB/plaza
║  PLAZAS: 19 · memoria libre 2.10 GB de 31.9 GB (sin presupuesto declarado: se usa la mitad de los 31.9 GB del equipo)
╚═

PLAZAS EN USO (7 de 19)
  slot-3.lock      PID 6764    euskadi              la tiene desde hace 1 min
  slot-1.lock      PID 52272   baleares             la tiene desde hace 0 min
  slot-2.lock      PID 11072   asturias             la tiene desde hace 0 min
  slot-4.lock      PID 17444   castilla-la-mancha   la tiene desde hace 0 min
  slot-5.lock      PID 17704   navarra              la tiene desde hace 0 min
  slot-6.lock      PID 44760   galicia              la tiene desde hace 0 min
  slot-7.lock      PID 28076   aragon               la tiene desde hace 0 min

ESPERANDO TURNO: 0
  veredicto del gobernador para una plaza más: SÍ (cabe)

RITMO Y TRABAJO PENDIENTE (ventana 30 min)
  federación            pet.  pet/min  tiempo/trabajo  disponibles   horas estimadas   proceso
  andalucia              40     1.6         38.5 s        33104         345.4 h   PID 25500
  aragon                 25     0.9         69.3 s        14449         266.9 h   PID 28076
  asturias               27     1.0         63.5 s        16002         271.8 h   PID 11072
  baleares               97     3.5         17.6 s         1586           7.7 h   PID 52272
  cantabria              46     1.7         35.3 s        11265         107.9 h   PID 53100
  castilla-la-mancha     45     1.6         38.1 s        10879         112.6 h   PID 17444
  cataluna               40     1.5         40.5 s         3694          40.5 h   SIN PROCESO
  euskadi               109     3.8         15.9 s           89           0.4 h   PID 6764
  extremadura            88     3.1         19.4 s        15406          82.0 h   PID 17344
  federacion             27     1.3         49.0 s        18832         246.8 h   PID 25212
  galicia                28     1.0         60.5 s        21035         341.1 h   PID 44760
  madrid                154     5.5         11.0 s        28811          87.4 h   PID 8984
  murcia                 68     2.4         25.6 s        12271          86.1 h   PID 16516
  navarra                15     0.5        119.2 s         9022         278.8 h   PID 17704
  prueba-10gb             0     0.0              —          167               —   SIN PROCESO
  rioja                  69     2.5         24.7 s          529           3.6 h   PID 45992
  valencia                0     0.0              —        10308               —   SIN PROCESO
  disponibles en total: 207449 (ponderado 196974)
```

## 2 · Qué se ha trabajado en la ventana

```
╔═ QUÉ SE HA TRABAJADO · ventana de 30 min · 2026-09-18T08:46:21.306Z → 2026-09-18T09:16:21.306Z
║  (hora local: 10:46:21 → 11:16:21 · memoria libre 2.03 GB)
╚═ federaciones con actividad en la ventana: 16

  madrid  ·  correctas 136 · incidencias 19
     de qué: acta=136
     direcciones distintas terminadas: 136 · trabajos marcados hechos: 135 · en curso ahora: 1
     datos anotados: 0 jornadas · 153 actas
     ahora mismo: → acta|21|24038099|24038100|4|5341782   (registro de hace 1 min)

  baleares  ·  correctas 94 · incidencias 5
     de qué: acta=94
     direcciones distintas terminadas: 94 · trabajos marcados hechos: 611 · en curso ahora: 1
     datos anotados: 0 jornadas · 94 actas
     ahora mismo: → acta|21|22536592|22913084|14|744303   (registro de hace 0 min)

  extremadura  ·  correctas 83 · incidencias 6
     de qué: acta=83
     direcciones distintas terminadas: 83 · trabajos marcados hechos: 83 · en curso ahora: 0
     datos anotados: 0 jornadas · 83 actas
     ahora mismo: ✓ acta de base guardada y analizada; 2-1, 14 titulares, 0 suplentes, 0 goles, 1 técnicos; revisar: descuadre_g   (registro de hace 0 min)

  rioja  ·  correctas 63 · incidencias 6
     de qué: acta=23 calendario=22 indice_jornadas=17 jornada=1
     direcciones distintas terminadas: 63 · trabajos marcados hechos: 64 · en curso ahora: 0
     datos anotados: 18 jornadas · 34 actas
     ahora mismo: ✓ calendario guardado   (registro de hace 2 min)

  murcia  ·  correctas 62 · incidencias 6
     de qué: acta=62
     direcciones distintas terminadas: 62 · trabajos marcados hechos: 62 · en curso ahora: 0
     datos anotados: 0 jornadas · 62 actas
     ahora mismo: ✓ acta de base guardada y analizada; 7-3, 16 titulares, 11 suplentes, 0 goles, 4 técnicos; revisar: descuadre_   (registro de hace 1 min)

  cantabria  ·  correctas 42 · incidencias 5
     de qué: acta=42
     direcciones distintas terminadas: 42 · trabajos marcados hechos: 41 · en curso ahora: 1
     datos anotados: 0 jornadas · 51 actas
     ahora mismo: → acta|20|21717956|21718054|13|198971   (registro de hace 1 min)

  castilla-la-mancha  ·  correctas 41 · incidencias 4
     de qué: acta=41
     direcciones distintas terminadas: 41 · trabajos marcados hechos: 472 · en curso ahora: 0
     datos anotados: 0 jornadas · 42 actas
     ahora mismo: ✓ acta de base guardada y analizada; 6-5, 16 titulares, 0 suplentes, 0 goles, 0 técnicos; revisar: sin_cuerpo_   (registro de hace 1 min)

  andalucia  ·  correctas 34 · incidencias 6
     de qué: jornada=34
     direcciones distintas terminadas: 34 · trabajos marcados hechos: 3326 · en curso ahora: 1
     datos anotados: 34 jornadas · 0 actas
     ahora mismo: ℹ️  Proyecto personal/no comercial: ritmo configurado de 6-8 s entre peticiones.   (registro de hace 1 min)

  galicia  ·  correctas 25 · incidencias 4
     de qué: acta=25
     direcciones distintas terminadas: 25 · trabajos marcados hechos: 643 · en curso ahora: 1
     datos anotados: 0 jornadas · 24 actas
     ahora mismo: → acta|19|17493307|18403777|5|1048245   (registro de hace 1 min)

  asturias  ·  correctas 24 · incidencias 3
     de qué: acta=24
     direcciones distintas terminadas: 24 · trabajos marcados hechos: 303 · en curso ahora: 0
     datos anotados: 0 jornadas · 24 actas
     ahora mismo: ✓ acta de base guardada y analizada; 6-2, 10 titulares, 8 suplentes, 8 goles, 4 técnicos; revisar: titulares_a   (registro de hace 1 min)

  federacion  ·  correctas 24 · incidencias 4
     de qué: acta=23 jornada=1
     direcciones distintas terminadas: 24 · trabajos marcados hechos: 32 · en curso ahora: 1
     datos anotados: 1 jornadas · 22 actas
     ahora mismo: → acta|21|22911157|22911166|2|26104587   (registro de hace 1 min)

  aragon  ·  correctas 23 · incidencias 3
     de qué: calendario=15 clasificacion=8
     direcciones distintas terminadas: 23 · trabajos marcados hechos: 784 · en curso ahora: 0
     datos anotados: 0 jornadas · 0 actas
     ahora mismo: ✓ clasificación guardada   (registro de hace 0 min)

  cataluna  ·  correctas 22 · incidencias 18
     de qué: clasificacion=18 calendario=4
     direcciones distintas terminadas: 20 · trabajos marcados hechos: 1082 · en curso ahora: 0
     datos anotados: 0 jornadas · 0 actas
     ahora mismo: Cola de datos: 4790 trabajos de grupo y 272 actas pendientes.   (registro de hace 2 min)

  navarra  ·  correctas 14 · incidencias 2
     de qué: acta=14
     direcciones distintas terminadas: 14 · trabajos marcados hechos: 346 · en curso ahora: 1
     datos anotados: 0 jornadas · 168 actas
     ahora mismo: → acta|21|22198616|22198617|19|25433382   (registro de hace 2 min)

  ceuta  ·  correctas 0 · incidencias 0
     de qué: —
     direcciones distintas terminadas: 0 · trabajos marcados hechos: 112 · en curso ahora: 0
     datos anotados: 0 jornadas · 0 actas
     ahora mismo: 2026-09-18 11:07:17  El worker termino con codigo 0; siguiente intento en 3600 s.   (registro de hace 10 min)

  euskadi  ·  correctas 0 · incidencias 110
     de qué: —
     direcciones distintas terminadas: 0 · trabajos marcados hechos: 130 · en curso ahora: 0
     datos anotados: 0 jornadas · 105 actas
     ahora mismo: ℹ️ la página del acta se descargó pero no se puede interpretar (maquetación distinta). La ficha viene sin dato   (registro de hace 0 min)

  TOTAL: correctas 687 · incidencias 201 · 8226 trabajos hechos · 53 jornadas y 862 actas anotadas
  por tipo: jornada=36 calendario=41 clasificacion=26 acta=567 indice_jornadas=17
  incidencias: error_navegador=50 error=27 acta_ilegible=1 sin_datos=104 sin_publicar=19
```

## 3 · Ritmo real frente al ritmo configurado

```
═══ ritmo real por federación · últimos 30 min (2026-09-18T08:47:59.869Z → ahora)
    peticiones | hueco mediano entre peticiones | duración mediana | % de la ventana pidiendo | reciclados/limpiezas/mantenimientos en el registro

  andalucia
      40 peticiones · hueco mediano 30.5 s (p90 90.8 s · máximo 112 s)
    duración mediana 2.3 s · tiempo pidiendo 107 s de 1503 s = 7 %
    en las últimas 4.000 líneas del registro: 26 arranques de sesión · 274 reciclados de Chrome · 93 limpiezas · 0 mantenimientos locales
    ritmo efectivo: 1.6 peticiones/min · teórico con pausa de 6-8 s: ~8/min

  aragon
      26 peticiones · hueco mediano 32.5 s (p90 63.8 s · máximo 906 s)
    duración mediana 2.0 s · tiempo pidiendo 55 s de 1688 s = 3 %
    en las últimas 4.000 líneas del registro: 12 arranques de sesión · 159 reciclados de Chrome · 66 limpiezas · 55 mantenimientos locales
    ritmo efectivo: 0.9 peticiones/min · teórico con pausa de 6-8 s: ~8/min

  asturias
      27 peticiones · hueco mediano 25.0 s (p90 59.3 s · máximo 1011 s)
    duración mediana 1.4 s · tiempo pidiendo 48 s de 1651 s = 3 %
    en las últimas 4.000 líneas del registro: 37 arranques de sesión · 287 reciclados de Chrome · 85 limpiezas · 47 mantenimientos locales
    ritmo efectivo: 1.0 peticiones/min · teórico con pausa de 6-8 s: ~8/min

  baleares
      99 peticiones · hueco mediano 7.4 s (p90 24.6 s · máximo 311 s)
    duración mediana 1.5 s · tiempo pidiendo 167 s de 1703 s = 10 %
    en las últimas 4.000 líneas del registro: 15 arranques de sesión · 469 reciclados de Chrome · 88 limpiezas · 0 mantenimientos locales
    ritmo efectivo: 3.5 peticiones/min · teórico con pausa de 6-8 s: ~8/min

  cantabria
      47 peticiones · hueco mediano 25.5 s (p90 68.9 s · máximo 198 s)
    duración mediana 1.7 s · tiempo pidiendo 92 s de 1609 s = 6 %
    en las últimas 4.000 líneas del registro: 12 arranques de sesión · 289 reciclados de Chrome · 94 limpiezas · 57 mantenimientos locales
    ritmo efectivo: 1.8 peticiones/min · teórico con pausa de 6-8 s: ~8/min

  castilla-la-mancha
      45 peticiones · hueco mediano 17.1 s (p90 36.5 s · máximo 911 s)
    duración mediana 2.0 s · tiempo pidiendo 126 s de 1677 s = 8 %
    en las últimas 4.000 líneas del registro: 22 arranques de sesión · 693 reciclados de Chrome · 92 limpiezas · 1 mantenimientos locales
    ritmo efectivo: 1.6 peticiones/min · teórico con pausa de 6-8 s: ~8/min

  cataluna
      40 peticiones · hueco mediano 7.2 s (p90 8.0 s · máximo 847 s)
    duración mediana 0.5 s · tiempo pidiendo 40 s de 1578 s = 3 %
    en las últimas 4.000 líneas del registro: 0 arranques de sesión · 0 reciclados de Chrome · 0 limpiezas · 0 mantenimientos locales
    ritmo efectivo: 1.5 peticiones/min · teórico con pausa de 6-8 s: ~8/min

  euskadi
     109 peticiones · hueco mediano 7.7 s (p90 23.0 s · máximo 407 s)
    duración mediana 1.5 s · tiempo pidiendo 198 s de 1692 s = 12 %
    en las últimas 4.000 líneas del registro: 105 arranques de sesión · 1 reciclados de Chrome · 0 limpiezas · 0 mantenimientos locales
    ritmo efectivo: 3.9 peticiones/min · teórico con pausa de 6-8 s: ~8/min

  extremadura
      89 peticiones · hueco mediano 8.8 s (p90 27.7 s · máximo 447 s)
    duración mediana 1.6 s · tiempo pidiendo 170 s de 1693 s = 10 %
    en las últimas 4.000 líneas del registro: 8 arranques de sesión · 687 reciclados de Chrome · 92 limpiezas · 0 mantenimientos locales
    ritmo efectivo: 3.2 peticiones/min · teórico con pausa de 6-8 s: ~8/min

  federacion
      28 peticiones · hueco mediano 35.1 s (p90 114.3 s · máximo 142 s)
    duración mediana 2.4 s · tiempo pidiendo 85 s de 1317 s = 6 %
    en las últimas 4.000 líneas del registro: 14 arranques de sesión · 145 reciclados de Chrome · 54 limpiezas · 58 mantenimientos locales
    ritmo efectivo: 1.3 peticiones/min · teórico con pausa de 6-8 s: ~8/min

  galicia
      29 peticiones · hueco mediano 39.0 s (p90 93.0 s · máximo 646 s)
    duración mediana 1.5 s · tiempo pidiendo 84 s de 1671 s = 5 %
    en las últimas 4.000 líneas del registro: 10 arranques de sesión · 175 reciclados de Chrome · 70 limpiezas · 48 mantenimientos locales
    ritmo efectivo: 1.0 peticiones/min · teórico con pausa de 6-8 s: ~8/min

  madrid
     155 peticiones · hueco mediano 5.6 s (p90 22.8 s · máximo 193 s)
    duración mediana 1.2 s · tiempo pidiendo 229 s de 1689 s = 14 %
    en las últimas 4.000 líneas del registro: 9 arranques de sesión · 0 reciclados de Chrome · 0 limpiezas · 0 mantenimientos locales
    ritmo efectivo: 5.5 peticiones/min · teórico con pausa de 6-8 s: ~8/min

  murcia
      67 peticiones · hueco mediano 14.7 s (p90 55.3 s · máximo 148 s)
    duración mediana 1.6 s · tiempo pidiendo 129 s de 1666 s = 8 %
    en las últimas 4.000 líneas del registro: 11 arranques de sesión · 281 reciclados de Chrome · 92 limpiezas · 1 mantenimientos locales
    ritmo efectivo: 2.4 peticiones/min · teórico con pausa de 6-8 s: ~8/min

  navarra
      16 peticiones · hueco mediano 28.0 s (p90 134.3 s · máximo 1201 s)
    duración mediana 2.3 s · tiempo pidiendo 47 s de 1692 s = 3 %
    en las últimas 4.000 líneas del registro: 13 arranques de sesión · 705 reciclados de Chrome · 84 limpiezas · 52 mantenimientos locales
    ritmo efectivo: 0.6 peticiones/min · teórico con pausa de 6-8 s: ~8/min

  rioja
      69 peticiones · hueco mediano 9.5 s (p90 36.0 s · máximo 403 s)
    duración mediana 1.4 s · tiempo pidiendo 121 s de 1680 s = 7 %
    en las últimas 4.000 líneas del registro: 8 arranques de sesión · 668 reciclados de Chrome · 89 limpiezas · 50 mantenimientos locales
    ritmo efectivo: 2.5 peticiones/min · teórico con pausa de 6-8 s: ~8/min
```

## Cómo se lee esto

* **plazas**: el gobernador reparte el presupuesto en plazas de 0,75 GB (medido). Con 10 GB declarados salen
  **11**; sin declarar, la mitad de la memoria del equipo. Las fichas viven en `.estado-workers/slots-chrome`.
* **turno**: una federación conserva su plaza hasta 150 min, y **sólo la suelta si hay otras esperando**. Al
  ceder, su supervisor la relanza y entra por el final de la cola.
* **esperando**: las fichas `espera-*.ficha` son la cola. Si alguien espera y hay plazas libres, el motivo es
  la memoria (el suelo de emergencia), no el reparto.
* **ritmo real**: el hueco mediano entre peticiones debería estar en la pausa configurada (6-8 s en las PNFG,
  4-6 s en iSquad). Si está muy por encima, hay algo comiéndose el tiempo: reciclados, mantenimiento local o
  esperas.
