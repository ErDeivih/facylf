-- 0059 · Registro abierto (sólo para favoritos).
--
-- Decisión de David (05/11/2026, revisión de capturas): la cuenta sirve para guardar favoritos y
-- recibir accesos rápidos; cualquiera puede crearla, sin código de invitación. El alta ya soporta el
-- modo `abierto` desde 0043 (`app.alta_usuario` inserta el usuario activo con el paquete por defecto);
-- no hace falta cambiar ninguna función ni tabla, sólo el ajuste.
--
-- La web deja de pedir el código y llama a `app.alta_cuenta(..., p_codigo = null)`, así que en modo
-- abierto no se consume ninguna invitación. Los modos `invitacion` y `aprobacion` siguen existiendo en
-- SQL para poder volver a ellos desde administración sin migración nueva.
--
-- Seguridad: abrir el registro no rebaja las contraseñas (scrypt), la sesión, el CSRF ni los límites
-- de intentos. La cuenta nueva sólo puede usar favoritos y lo público, como cualquier `usuario` con
-- el paquete por defecto.
--
-- Reversión: `update app.ajuste set valor = 'invitacion' where clave = 'registro_modo';`

insert into app.ajuste (clave, valor, descripcion)
values ('registro_modo', 'abierto', 'invitacion | aprobacion | abierto')
on conflict (clave) do update set valor = excluded.valor;
