# Rutinas de operación: traspaso al PC y jornada del domingo

Anotado el **domingo 11/10/2026** a petición del responsable del proyecto. Son dos rutinas **recurrentes** que
no pueden depender de que nadie se acuerde: están aquí para poder ejecutarlas sin releer nada más.

---

## 1 · Pasar la información del servidor al PC, cada cierto tiempo

**Por qué**: el servidor **se satura** (disco y CPU ✗) y además **conviene tener toda la información en un mismo
sitio** ✓. El servidor es el único que permanece siempre encendido ✓, así que es donde se recolecta de forma
continua — **pero no donde debe acumularse todo**.

**Qué se pasa**: la **información recolectada** (colas SQLite, archivos comprimidos y crudos) desde el servidor
al PC.

**Ojo, no confundir con dos cosas que se parecen y no son lo mismo** ✗:

| | qué mueve | herramienta |
|---|---|---|
| **Traspaso de federación** | **el trabajo** de una federación: se para allí y se arranca aquí | `scripts\claude\traspasa-federaciones-al-pc.ps1` ✓ (usado con Andalucía el 09/10) |
| **Traspaso de información** (esto) | **los datos ya recolectados**, para descargar el servidor y unificarlo todo aquí | **por determinar** ✗ |

**Estado**: el traspaso de federaciones está hecho y probado ✓. **El traspaso periódico de información NO está
automatizado** ✗ — hay que decidir cada cuánto (¿semanal?, ¿cuando el disco del servidor pase de un umbral?) y
con qué herramienta. **El servidor tiene el disco como cuello de botella conocido** ✓, así que este traspaso es
también parte del arreglo de ese problema ✓.

---

## 2 · La jornada del domingo: poner todo a ingestar lo jugado, y volver al histórico

**Por qué**: **los domingos hay partidos** ✓. Interesa que las actas y resultados **de la jornada en curso**
entren **según se van jugando** ✓, para tener los datos actualizados ✓ — y que el sistema **vuelva al histórico
en cuanto no encuentre nada nuevo** ✓, sin perder tiempo esperando ✓.

**El ciclo que se quiere**:

1. **Domingo por la mañana/tarde**: todas las federaciones **priorizan la jornada en curso** ✓.
2. **Se comprueba cada cierto tiempo** si ha entrado algo nuevo ✓ (los resultados se publican de forma
   escalonada a lo largo de la tarde ✓).
3. **Cuando ya no encuentran nada nuevo jugado** → **vuelven al histórico** ✓, que es donde está el grueso del
   trabajo pendiente (Galicia, CyL, Andalucía, Madrid…).

**✓ Buenas noticias: el sistema YA prioriza la jornada en curso.** Lo comprobé haciendo la cuenta bien (la
primera vez la hice al revés ✗). La fórmula es:

```
prioridad = base*1.000.000 + antiguedad*10.000 + fase*1.000 + sub*100
antiguedad = 100 - codigoTemporada
```

**El recolector coge primero el número MÁS BAJO** ✓ — por eso un carril con `-2.000.000.000` *adelanta* ✓. Y con
esa fórmula:

| temporada | código | antiguedad | prioridad | sale |
|---|---|---|---|---|
| **2026-27 (actual)** | 22 | **78** | más baja | **ANTES** ✓ |
| 2015-16 (histórico) | 11 | 89 | más alta | después ✓ |

**Es decir: dentro de una misma competición, la temporada en curso va por delante del histórico** ✓✓ — que es
justo lo que se quiere un domingo ✓. **No hace falta ningún carril nuevo** ✓.

**Lo único que hay que vigilar** ✓: que la prioridad **de la competición** (`base`) no mande a la jornada de una
categoría humilde detrás del histórico de una categoría importante ✓ — el peso de la competición domina 100:1
sobre el de la temporada ✓, así que **puede pasar** ✗. Si un domingo se ve que los resultados de la jornada
tardan, **ese es el sitio donde mirar** ✓ — y el arreglo sería un carril para la temporada en curso ✓, que se
desactivaría solo al no quedar trabajos nuevos ✓.


**Recordatorio de prudencia**: **no cambiar el ritmo de los recolectores como efecto lateral** ✓ (invariante del
proyecto ✓), y **una federación no puede estar corriendo en las dos máquinas a la vez** ✗ (eso sería pedir dos
veces lo mismo ✓).
