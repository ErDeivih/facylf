/**
 * Reglas y textos de «Mi cuenta», sin Next y sin base de datos.
 *
 * La página recibe una fila de `app.perfil` y la normaliza aquí: el driver devuelve `date` y
 * `timestamptz` como `Date`, y la interfaz no debe depender de eso. También viven aquí las etiquetas
 * de estado, paquete y avisos, para que la prueba de render no repita la lista de textos.
 *
 * Dos reglas de producto:
 *  · un dato que la cuenta no tiene se dice con palabras o con «—»; no se convierte en un valor
 *    inventado (ni un paquete que no es, ni un correo que no se conoce);
 *  · lo que no está implementado (verificación de correo, 2FA, cambio de contraseña) se dice; no se
 *    pinta un botón que no hace nada.
 */

import type { FilaPerfilCuenta, PreferenciasAviso } from '@/consultas/mi-cuenta';

/** La cuenta ya normalizada, con fechas en texto `AAAA-MM-DD`. */
export type PerfilCuenta = {
  userId: string;
  nombre: string | null;
  rol: string;
  estado: string;
  paquete: string | null;
  paqueteNombre: string | null;
  /** Último día del acceso, o `null` si no caduca. */
  validoHasta: string | null;
  zonaHoraria: string;
  creadoEn: string;
  capacidades: string[];
  favoritos: number;
  avisosSinLeer: number;
  dispositivosPush: number;
  preferencias: PreferenciasAviso;
};

/** Preferencias que aplica `app.perfil` cuando el usuario todavía no tiene fila propia. */
export const PREFERENCIAS_POR_DEFECTO: PreferenciasAviso = {
  en_app: true,
  push: false,
  correo: 'resumen',
  hora_resumen: '08:00:00',
  silencio_desde: null,
  silencio_hasta: null,
  eventos: ['programado', 'cambio_horario', 'resultado', 'acta', 'jornada_completa', 'jugador'],
};

/** `YYYY-MM-DD` a partir de un `Date` o de una cadena ISO, o `null` si no hay fecha válida. */
export function fechaIso(valor: string | Date | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10);
  }
  const limpia = String(valor).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(limpia) ? limpia : null;
}

/** Una fecha `AAAA-MM-DD` en castellano (`30/06/2027`); sin fecha, «—». */
export function fechaDia(valor: string | null | undefined): string {
  const iso = fechaIso(valor ?? null);
  if (iso === null) return '—';
  const fecha = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).format(fecha);
}

/** Normaliza la fila del driver: fechas a texto, contadores a número y preferencias completas. */
export function normalizaPerfil(fila: FilaPerfilCuenta): PerfilCuenta {
  const preferencias = fila.preferencias ?? PREFERENCIAS_POR_DEFECTO;
  return {
    userId: fila.user_id,
    nombre: (fila.nombre ?? '').trim() === '' ? null : (fila.nombre ?? '').trim(),
    rol: fila.rol,
    estado: fila.estado,
    paquete: fila.paquete,
    paqueteNombre: fila.paquete_nombre,
    validoHasta: fechaIso(fila.valido_hasta),
    zonaHoraria: fila.zona_horaria || 'Europe/Madrid',
    creadoEn: fechaIso(fila.creado_en) ?? '',
    capacidades: Array.isArray(fila.capacidades) ? fila.capacidades : [],
    favoritos: Number(fila.favoritos ?? 0),
    avisosSinLeer: Number(fila.avisos_sin_leer ?? 0),
    dispositivosPush: Number(fila.dispositivos_push ?? 0),
    preferencias: {
      en_app: preferencias.en_app !== false,
      push: preferencias.push === true,
      correo: preferencias.correo ?? 'resumen',
      hora_resumen: preferencias.hora_resumen ?? '08:00:00',
      silencio_desde: preferencias.silencio_desde ?? null,
      silencio_hasta: preferencias.silencio_hasta ?? null,
      eventos: Array.isArray(preferencias.eventos) ? preferencias.eventos : PREFERENCIAS_POR_DEFECTO.eventos,
    },
  };
}

/** El estado visible de la cuenta, con su frase. */
export type EstadoVisible = { clave: 'activa' | 'caducada' | 'pendiente' | 'bloqueada' | 'baja'; etiqueta: string; detalle: string };

/**
 * El estado que se enseña: la fecha de validez manda sobre «activo» (un acceso caducado no es una
 * cuenta activa), y «baja»/«rechazado» no se disfrazan de bloqueo.
 */
export function estadoDeCuenta(perfil: PerfilCuenta, hoy: string = new Date().toISOString().slice(0, 10)): EstadoVisible {
  if (perfil.estado === 'baja' || perfil.estado === 'rechazado') {
    return { clave: 'baja', etiqueta: 'De baja', detalle: 'Esta cuenta ya no está activa.' };
  }
  if (perfil.estado === 'pendiente') {
    return { clave: 'pendiente', etiqueta: 'Pendiente', detalle: 'Falta la aprobación para poder entrar.' };
  }
  if (perfil.estado === 'bloqueado') {
    return { clave: 'bloqueada', etiqueta: 'Bloqueada', detalle: 'Esta cuenta no puede entrar.' };
  }
  if (perfil.validoHasta !== null && perfil.validoHasta < hoy) {
    return {
      clave: 'caducada', etiqueta: 'Caducada',
      detalle: `El acceso terminó el ${fechaDia(perfil.validoHasta)}.`,
    };
  }
  return { clave: 'activa', etiqueta: 'Activa', detalle: 'Puedes usar tu cuenta y tus favoritos.' };
}

/** El paquete con su fecha de fin, si la tiene. */
export function textoDelPaquete(perfil: PerfilCuenta): string {
  const nombre = (perfil.paqueteNombre ?? perfil.paquete ?? '').trim();
  if (nombre === '') return 'Sin paquete contratado.';
  if (perfil.validoHasta === null) return `${nombre} · sin fecha de fin.`;
  return `${nombre} · hasta el ${fechaDia(perfil.validoHasta)}.`;
}

/** El rol en una palabra, sin el código interno. */
export function etiquetaRol(rol: string): string {
  return rol === 'administrador' ? 'Administración' : 'Usuario';
}

/** Correo enmascarado: se conserva la primera letra y el dominio, nunca la dirección completa. */
export function enmascaraCorreo(correo: string | null | undefined): string | null {
  const limpio = (correo ?? '').trim();
  const arroba = limpio.lastIndexOf('@');
  if (arroba <= 0 || arroba === limpio.length - 1) return null;
  const local = limpio.slice(0, arroba);
  const dominio = limpio.slice(arroba + 1);
  const visible = local.slice(0, 1);
  const puntos = local.length <= 2 ? '•' : '•••';
  return `${visible}${puntos}@${dominio}`;
}

/** Cómo se avisa por correo. */
export function etiquetaCorreo(modo: PreferenciasAviso['correo']): string {
  switch (modo) {
    case 'nunca': return 'Nunca';
    case 'al_momento': return 'Al momento';
    default: return 'Un resumen al día';
  }
}

/** La hora `HH:MM` de un `time` de PostgreSQL (`08:00:00` → `08:00`). */
export function horaCorta(hora: string | null | undefined): string {
  const limpia = (hora ?? '').slice(0, 5);
  return /^\d{2}:\d{2}$/.test(limpia) ? limpia : '—';
}

/** Texto de la franja de silencio, o `null` si no hay franja. */
export function textoDeSilencio(pref: PreferenciasAviso): string | null {
  if (pref.silencio_desde === null || pref.silencio_hasta === null) return null;
  return `Sin avisos de ${horaCorta(pref.silencio_desde)} a ${horaCorta(pref.silencio_hasta)}.`;
}

/** Nombre de cada tipo de evento tal y como lo lee una persona. */
export const ETIQUETAS_EVENTO: Readonly<Record<string, string>> = {
  programado: 'Próximo partido',
  cambio_horario: 'Cambio de fecha u hora',
  resultado: 'Resultado',
  acta: 'Acta publicada',
  jornada_completa: 'Jornada completa',
  jugador: 'Jugadores que sigues',
};

/** Los eventos activos, en el orden del catálogo y sin repetir. */
export function eventosActivos(eventos: readonly string[]): string[] {
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const codigo of Object.keys(ETIQUETAS_EVENTO)) {
    if (eventos.includes(codigo) && !vistos.has(codigo)) {
      vistos.add(codigo);
      salida.push(ETIQUETAS_EVENTO[codigo]!);
    }
  }
  return salida;
}

/** El resumen de los canales de aviso, para la lista de la pantalla. */
export function canalesDeAviso(pref: PreferenciasAviso): Array<{ etiqueta: string; valor: string }> {
  return [
    { etiqueta: 'En la aplicación', valor: pref.en_app ? 'Sí' : 'No' },
    {
      etiqueta: 'Push',
      valor: pref.push ? 'Sí' : 'No',
    },
    {
      etiqueta: 'Correo',
      valor: pref.correo === 'resumen'
        ? `${etiquetaCorreo(pref.correo)} · ${horaCorta(pref.hora_resumen)}`
        : etiquetaCorreo(pref.correo),
    },
    { etiqueta: 'Silencio', valor: textoDeSilencio(pref) ?? 'Sin horas de silencio.' },
  ];
}
