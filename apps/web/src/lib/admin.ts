/**
 * Reglas y vocabulario del panel de administración, sin Next y sin base de datos.
 *
 * La guardia de verdad vive en `lib/admin-servidor.ts` (sesión + `app.puede`), pero la DECISIÓN se
 * aísla aquí para probarla sin router: sin sesión se va a entrar; con sesión pero sin rol de
 * administrador o sin la capacidad `administrar_usuarios` no se enseña el panel (404, no 403: no
 * revelamos a una cuenta normal que esta zona existe).
 *
 * Los textos traducen los valores del esquema. Nunca se enseña un código interno (`app.usuario`,
 * `ver_menores_nombres`, `update`…) a quien está mirando la pantalla; para lo que no está en el mapa se
 * usa una etiqueta genérica y honesta.
 */

export type DecisionAccesoAdmin = 'entrar' | 'sin-permiso' | 'ok';

/** Decide qué hacer con una sesión y su permiso. Función pura: la usan la guardia y las pruebas. */
export function decisionAccesoAdmin(
  sesion: { rol: string } | null | undefined,
  puedeAdministrar: boolean,
): DecisionAccesoAdmin {
  if (!sesion) return 'entrar';
  if (sesion.rol !== 'administrador') return 'sin-permiso';
  if (!puedeAdministrar) return 'sin-permiso';
  return 'ok';
}

const ESTADOS: Readonly<Record<string, string>> = {
  pendiente: 'Pendiente',
  activo: 'Activo',
  bloqueado: 'Bloqueado',
  baja: 'Baja',
  rechazado: 'Rechazado',
};

/** Estados válidos del filtro de usuarios, en el orden en que se ofrecen. */
export const ESTADOS_USUARIO = ['pendiente', 'activo', 'bloqueado', 'rechazado', 'baja'] as const;

export function etiquetaEstadoUsuario(estado: string | null | undefined): string {
  if (!estado) return 'Sin estado';
  return ESTADOS[estado] ?? 'Estado sin determinar';
}

export function etiquetaRol(rol: string | null | undefined): string {
  if (rol === 'administrador') return 'Administrador';
  if (rol === 'usuario') return 'Usuario';
  return 'Rol sin determinar';
}

export function etiquetaPaquete(paquete: string | null | undefined): string {
  if (!paquete) return 'Sin paquete';
  const mapa: Readonly<Record<string, string>> = {
    esencial: 'Esencial', ojeador: 'Ojeador', analista: 'Analista',
  };
  return mapa[paquete] ?? 'Paquete sin determinar';
}

const CAPACIDADES: Readonly<Record<string, string>> = {
  buscar: 'Buscar',
  ver_fichas: 'Fichas',
  ver_actas: 'Actas',
  rankings: 'Rankings',
  panel_equipo: 'Panel de equipo',
  comparar: 'Comparar',
  cruzar_federaciones: 'Cruzar federaciones',
  exportar_pdf: 'Informes en PDF',
  analisis_ligas: 'Análisis de ligas',
  exportar_datos: 'Exportar datos',
  ver_menores_nombres: 'Nombres de menores',
  confirmar_identidades: 'Confirmar identidades',
  gestionar_reglamentos: 'Reglamentos',
  administrar_usuarios: 'Administrar usuarios',
};

export function etiquetaCapacidad(capacidad: string | null | undefined): string {
  if (!capacidad) return 'Permiso';
  return CAPACIDADES[capacidad] ?? 'Permiso sin determinar';
}

export function etiquetaCapacidadSensible(capacidad: string | null | undefined): string {
  if (capacidad === 'ver_menores_nombres') return 'Nombres de menores';
  if (capacidad === 'exportar_datos') return 'Exportación de datos';
  if (capacidad === 'exportar_pdf') return 'Informes en PDF';
  return etiquetaCapacidad(capacidad);
}

const TABLAS: Readonly<Record<string, string>> = {
  'app.usuario': 'Cuenta',
  'app.usuario_capacidad': 'Permiso de cuenta',
  'app.invitacion': 'Invitación',
  'app.ajuste': 'Ajuste del registro',
  'app.auditoria': 'Auditoría',
  'core.identity_decision': 'Identidad',
  'core.identity_candidate': 'Candidato de identidad',
  'core.reglamento_grupo': 'Reglamento de grupo',
  'ops.parametro': 'Parámetro interno',
};

export function etiquetaTabla(tabla: string | null | undefined): string {
  if (!tabla) return 'Datos';
  return TABLAS[tabla] ?? 'Datos';
}

const ACCIONES: Readonly<Record<string, string>> = {
  insert: 'alta', update: 'cambio', delete: 'baja',
};

export function etiquetaAccion(accion: string | null | undefined): string {
  if (!accion) return 'cambio';
  return ACCIONES[accion] ?? 'cambio';
}

const PROCESOS: Readonly<Record<string, string>> = {
  proyector: 'Proyector',
  avisos: 'Avisos',
  copia: 'Copia de seguridad',
  'restauracion de prueba': 'Restauración de prueba',
  vigilancia: 'Vigilancia',
  'casos de datos': 'Casos de datos',
};

export function etiquetaProceso(proceso: string | null | undefined): string {
  if (!proceso) return 'Proceso';
  return PROCESOS[proceso] ?? 'Proceso automático';
}

const MODOS: Readonly<Record<string, string>> = {
  invitacion: 'Solo con invitación',
  aprobacion: 'Con aprobación',
  abierto: 'Abierto',
};

export function etiquetaModoRegistro(modo: string | null | undefined): string {
  if (!modo) return 'Sin determinar';
  return MODOS[modo] ?? 'Sin determinar';
}

const ESTADOS_INVITACION: Readonly<Record<string, string>> = {
  vigente: 'Vigente',
  agotada: 'Agotada',
  caducada: 'Caducada',
  anulada: 'Anulada',
};

export function etiquetaEstadoInvitacion(estado: string | null | undefined): string {
  if (!estado) return 'Sin estado';
  return ESTADOS_INVITACION[estado] ?? 'Estado sin determinar';
}

/**
 * Resumen legible de los campos que cambiaron en una entrada de auditoría. No muestra los valores
 * sensibles: basta con saber QUÉ cambió. Si no hay detalle, se dice lo mismo que la acción.
 */
export function camposCambiados(cambios: Record<string, unknown> | null | undefined): string {
  if (!cambios) return '';
  const nombres = Object.keys(cambios);
  if (nombres.length === 0) return '';
  return nombres.slice(0, 4).map((n) => etiquetaCampo(n)).join(', ')
    + (nombres.length > 4 ? ` y ${nombres.length - 4} más` : '');
}

const CAMPOS: Readonly<Record<string, string>> = {
  estado: 'estado',
  paquete: 'paquete',
  valido_hasta: 'caducidad',
  nombre_visible: 'nombre',
  rol: 'rol',
  activo: 'activo',
  correo_sha: 'correo',
  usos: 'usos',
  anulada_en: 'anulación',
  valor: 'valor',
};

function etiquetaCampo(campo: string): string {
  return CAMPOS[campo] ?? 'un dato';
}
