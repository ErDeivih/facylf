# Acceso con Google (OAuth/OIDC)

El acceso con Google está **implementado pero apagado** hasta configurar credenciales. Sin
`GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`, `/entrar` no muestra el botón y
`/api/cuentas/oauth/google/iniciar` devuelve a `/entrar?aviso=oauth-no-configurado`.

## Configuración

1. Crear un cliente OAuth 2.0 de tipo «aplicación web» en Google Cloud.
2. Añadir como URI de redirección autorizado:
   `https://TU-DOMINIO/api/cuentas/oauth/google/volver`
   (en local: `http://127.0.0.1:3001/api/cuentas/oauth/google/volver`).
3. Definir en el entorno:

```dotenv
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
OAUTH_BASE_URL=https://TU-DOMINIO
```

`OAUTH_BASE_URL` debe ser el origen público exacto; no se acepta desde la petición.

## Garantías

- `state` aleatorio en cookie `httpOnly`, comparado en el retorno.
- PKCE S256; el verificador no sale del servidor.
- `email_verified === true`; un correo no verificado no enlaza cuentas.
- La identidad se guarda en `app.oauth_identidad` por `(proveedor, sujeto)`.
- Si ya existe una cuenta con ese correo, se enlaza; si está bloqueada, no se crea sesión.
- La cuenta OAuth no tiene contraseña local: no se rellena `app.credencial` con un hash ficticio.
- La cookie de sesión es `httpOnly`, `SameSite=Lax` y `Secure` en producción.

## Pendiente

- Probar el flujo completo con credenciales reales.
- Añadir más proveedores requiere ampliar el `check` de `proveedor` y una ruta por proveedor.
