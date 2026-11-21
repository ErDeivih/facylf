# Seguridad, privacidad y operación

Este documento es una guía técnica, no una conclusión jurídica. Antes de publicar perfiles nominales
o datos de menores debe realizarse una revisión específica de finalidad, legitimación, información,
retención y derechos de las personas.

## 1. Clasificación de datos

| Clase | Ejemplos | Visibilidad inicial |
|---|---|---|
| catálogo deportivo | competición, jornada, equipo, resultado | privada; publicable tras revisión |
| personal deportivo | nombre, actas, trayectoria, sanciones | privada autenticada |
| menores | nombres y participación en fútbol base | restringida; no indexable |
| operaciones | URLs, errores, logs, rutas locales | sólo administrador |
| secretos | claves, sesiones, conexión DB | gestor de secretos, nunca UI/log |
| evidencia cruda | HTML/JSON/PDF original | almacenamiento privado, sin descarga web |

Que un dato sea visible en un portal no elimina los principios de limitación de finalidad,
minimización y conservación. El RGPD incluye esos principios en su artículo 5; la AEPD presta
especial atención a la publicación de información de menores por clubes y entornos educativos.

## 2. Modelo de acceso

Roles iniciales:

- `viewer`: consulta deportiva permitida;
- `analyst`: comparación, listas privadas y anotaciones;
- `reviewer`: decide identidades y calidad;
- `operator`: ve ingesta y reprocesa lotes;
- `admin`: usuarios, configuración y auditoría.

Principios:

- denegar por defecto;
- comprobar autorización en servidor en cada recurso, no sólo ocultar botones;
- separar datos deportivos, notas privadas y operaciones;
- no usar un rol administrador para la conexión normal de la web;
- auditoría de cambios de identidad, visibilidad y notas;
- sesiones cortas, cookies `Secure`, `HttpOnly`, `SameSite` y rotación segura.

Las cuentas propias de la web (alta por invitación, contraseña con scrypt, sesión con token hasheado,
favoritos y sus límites) están detalladas en [CUENTAS.md](CUENTAS.md).

Si la aplicación sigue siendo estrictamente local para un único usuario, puede empezar protegida por
el acceso del sistema y escucha en `127.0.0.1`. En cuanto escuche en una red o Internet, necesita
autenticación real y TLS.

## 3. Roles de PostgreSQL

- `app_reader`: `SELECT` sólo sobre vistas/tablas de consulta autorizadas;
- `publisher`: inserta/actualiza `source`, `core`, `analytics` mediante operaciones conocidas;
- `migration_owner`: sólo para migraciones, no usado en ejecución;
- `backup`: permisos exclusivos de copia;
- `admin`: uso humano excepcional.

La base escucha en red privada o localhost y el firewall sólo permite aplicación/publicador. OWASP
recomienda mínimo privilegio, consultas preparadas y aislamiento de la base:
[SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
y [Database Security](https://cheatsheetseries.owasp.org/cheatsheets/Database_Security_Cheat_Sheet.html).

## 4. Seguridad de aplicación

Lista de control mínima basada en OWASP ASVS 5:

- validar en servidor `searchParams`, slugs, cursores y cuerpos;
- parámetros SQL vinculados; orden y columnas mediante allowlist;
- límites de longitud, filas, tiempo y complejidad;
- escapar salida por contexto y no renderizar HTML de las fuentes;
- CSP, `frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`, HSTS con HTTPS;
- protección CSRF en mutaciones autenticadas;
- control de acceso a nivel de objeto para notas, listas y revisiones;
- dependencias fijadas, escaneo y actualización deliberada;
- páginas de error sin rutas locales, SQL ni stack;
- rate limit diferenciado para login, búsqueda y exportación;
- uploads futuros con tipo/tamaño verificados y almacenamiento fuera de la raíz web.

> Deuda conocida (21/11/2026): la CSP actual permite `'unsafe-inline'` en scripts porque Next lo
> necesita con la cabecera fija. No protege frente a una inyección de script en línea; sí bloquea
> scripts y conexiones externas. El siguiente paso es generar un `nonce` por petición en `proxy.ts`
> y pasar a `'nonce-…' 'strict-dynamic'`, comprobando que la hidratación sigue funcionando.

CSP es defensa adicional y no sustituye el escape y diseño seguro. Referencias:
[OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) y
[CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html).

## 5. Privacidad por diseño

**Decisión vigente (David, 05/11/2026, `DOCTRINA-CALIDAD.md` §9):** la federación tiene
**consentimiento de tratamiento**, así que los **nombres** de los menores se publican igual que los de
un adulto. **Fotos (17/11/2026):** David autorizó expresamente publicar las fotos de ficha, también de
menores, en la demo pública; se exportan como ficheros estáticos desde la instancia privada con
`FACYLF_FOTOS=todas`. Sin variable no se sirve ninguna foto; con `adultos`, sólo personas con
`es_menor = false`; con `todas`, también menores. La regla se aplica en la ficha y en
`/api/foto/persona/<id>`, que responde con caché `private`. El resto de minimización
sigue vigente: no se publican fecha de nacimiento, documento, contacto ni dirección.

Antes de cualquier despliegue compartido:

1. documentar finalidad y usuarios autorizados;
2. inventariar campos personales y su fuente;
3. definir base de legitimación y texto informativo;
4. decidir qué ocurre con menores y categorías de base;
5. establecer retención y procedimiento de corrección/supresión;
6. impedir indexación por buscadores y cachés públicas donde corresponda;
7. registrar accesos administrativos y exportaciones;
8. probar que un usuario no obtiene una entidad restringida cambiando el ID.

Opciones conservadoras para menores:

- ocultar búsqueda global nominal;
- mostrar sólo dentro de acta/equipo a usuarios autorizados;
- no ofrecer rankings públicos;
- no exponer perfiles a motores de búsqueda (`noindex`, autenticación y ausencia de sitemap);
- reducir históricos nominales cuando dejen de ser necesarios;
- no mostrar fecha de nacimiento, documento, contacto o dirección aunque aparezcan en una
  respuesta original y no sean necesarios para scouting; las fotos, sólo como dice la decisión del
  16/11/2026 de más arriba.

Fuente orientativa oficial: [Guía de la AEPD para centros educativos](https://www.aepd.es/guias/guia-centros-educativos.pdf),
que trata información y consentimiento en actividades deportivas con menores.

## 6. Registro y auditoría

Eventos a registrar:

- login correcto/fallido y cierre de sesión;
- denegación de acceso;
- cambio de rol o visibilidad;
- creación/exportación de una lista de scouting;
- decisión de unión/separación de identidades;
- publicación/reversión de un lote;
- fallo de validación o consulta agotada.

Nunca registrar contraseña, token, cookie, cadena de conexión, contenido íntegro de la búsqueda,
datos sensibles o HTML crudo. Sanitizar saltos de línea y estructuras provenientes de la fuente.
Los fallos del logger no deben tumbar la web ni llenar el disco sin límite. Véase
[OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).

## 7. Topología de servidor privado

```text
Internet/LAN
   │ HTTPS
reverse proxy (límites, TLS, cabeceras)
   │ localhost/red privada
Next.js Node (sin privilegios)
   │ pool limitado
PostgreSQL (no público)

Publicador ──► PostgreSQL
     └──────► almacenamiento de objetos privado
```

Despliegue mínimo reproducible con contenedores o servicios equivalentes:

- versiones fijadas y healthchecks;
- volúmenes separados para PostgreSQL y originales;
- migraciones como paso explícito antes de activar la versión;
- despliegue blue/green o rollback de aplicación;
- el publicador continúa aunque la web se reinicie;
- límites de memoria/CPU que no ahoguen los workers del equipo local.

Si se usan varias instancias Next, coordinar caché e invalidaciones. Si sólo hay una, no introducir
Redis sin una necesidad medida.

## 8. Secretos y configuración

- variables de entorno o gestor de secretos; nunca `.env` versionado;
- claves diferentes por desarrollo, pruebas y producción;
- rotación documentada;
- URL pública y orígenes permitidos explícitos;
- `NODE_ENV=production`, telemetría y sourcemaps según política;
- copias sin secretos escritos en nombres o logs;
- datos de prueba sintéticos o minimizados.

## 9. Copias y recuperación

Aplicar 3-2-1 cuando el volumen lo permita:

- originales comprimidos: copia incremental y verificación periódica de hash;
- SQLite: copia consistente, no simple copia del archivo principal ignorando WAL;
- PostgreSQL: copia diaria + WAL/PITR cuando sea servidor, con retención definida;
- configuración y migraciones en Git;
- secretos respaldados por canal separado.

Una copia no cuenta hasta que se restaura. Prueba trimestral inicial:

1. restaurar en un entorno vacío;
2. verificar recuentos y checksums;
3. ejecutar consultas críticas;
4. documentar RPO/RTO observado.

Objetivos iniciales privados: RPO 24 h para canónico, pérdida cero de evidencia ya copiada; RTO 8 h.

## 10. Observabilidad

Panel separado del producto:

- salud y retraso del publicador;
- versión de datos por federación;
- p50/p95/p99 de rutas y consultas;
- errores por código, no por texto cambiante;
- pool de conexiones y locks;
- tamaño de tablas/índices y crecimiento;
- caché hit/miss;
- Core Web Vitals reales;
- espacio libre y éxito de copias.

OpenTelemetry Node puede aportar trazas y métricas; la instrumentación de navegador continúa siendo
experimental según su documentación, así que se adopta sólo si aporta una necesidad concreta:
[OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/).

## 11. Puerta de publicación

No exponer la aplicación fuera de localhost hasta que estén completos:

- decisión de privacidad y visibilidad de menores;
- autenticación y autorización por objeto;
- TLS y cabeceras;
- rol DB de mínimo privilegio;
- límites de búsqueda/exportación;
- copia y restauración probadas;
- registro sin secretos/PII innecesaria;
- revisión ASVS de nivel básico;
- pruebas de carga y accesibilidad.
