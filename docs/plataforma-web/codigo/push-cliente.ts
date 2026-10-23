'use client';
/**
 * Activar los avisos en el móvil o el ordenador (va a apps/web/src/lib/push-cliente.ts).
 * Se llama SÓLO al pulsar «Recibir avisos en este dispositivo» en /cuenta/avisos (los navegadores castigan pedir
 * permiso al cargar la página). iPhone: sólo funciona con la web añadida a la pantalla de inicio (iOS 16.4+);
 * la pantalla lo explica cuando detecta iOS sin modo «standalone».
 */
import { guardarSuscripcionPush } from '@/app/(cuenta)/acciones';

const CLAVE_PUBLICA = process.env.NEXT_PUBLIC_WEBPUSH_PUBLICA!;   // la misma WEBPUSH_PUBLICA del servidor

export type EstadoPush = 'no-soportado' | 'ios-sin-instalar' | 'denegado' | 'activo' | 'inactivo';

export async function estadoPush(): Promise<EstadoPush> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    return ios && !(window.matchMedia('(display-mode: standalone)').matches) ? 'ios-sin-instalar' : 'no-soportado';
  }
  if (Notification.permission === 'denied') return 'denegado';
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  return (await reg?.pushManager.getSubscription()) ? 'activo' : 'inactivo';
}

export async function activarPush(): Promise<{ ok: boolean; error?: string }> {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return { ok: false, error: 'Sin permiso del navegador para enseñar avisos.' };
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64aBytes(CLAVE_PUBLICA) });
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const r = await guardarSuscripcionPush(json, navigator.userAgent.slice(0, 200));
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export async function desactivarPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  await (await reg?.pushManager.getSubscription())?.unsubscribe();   // el servidor la borra al recibir 410
}

function base64aBytes(b64: string): Uint8Array {
  const relleno = '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
