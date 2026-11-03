#!/usr/bin/env node
// ENCIENDE EL SERVIDOR DESDE EL PC con un paquete mágico (Wake-on-LAN).
//
// Uso:
//   node scripts/servidor/enciende-servidor.mjs --mac 3c:52:82:xx:xx:xx
//   node scripts/servidor/enciende-servidor.mjs --mac ... --ip 192.168.1.139   (también lo manda a esa IP)
//   node scripts/servidor/enciende-servidor.mjs --mac ... --veces 10
//
// Qué hace: manda 5 paquetes mágicos por UDP al puerto 9 en difusión (255.255.255.255) y, si se le da `--ip`,
// también a esa IP por si la red no deja la difusión. No necesita instalar nada.
//
// REQUISITOS EN EL SERVIDOR (si no, el paquete llega y no pasa nada):
//   1. BIOS/UEFI: «Wake on LAN» (o «Power on by PCIe») activado, y desactivado el ahorro «ErP»/«Deep sleep»,
//      que corta la corriente del adaptador de red cuando la máquina está apagada.
//   2. Linux: `sudo ethtool -s <interfaz> wol g` y dejarlo aplicado al apagar (systemd). Comprobación:
//      `sudo ethtool <interfaz>` debe decir «Wake-on: g».
//   3. Cable (no wifi): el servidor ya va por cable.
// Solo funciona con la máquina apagada pero con corriente; tras un corte de luz o de regleta, no.
import { createSocket } from 'node:dgram';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opcion = (nombre, porDefecto = null) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
};
// La MAC se puede pasar a mano (--mac) o dejar guardada en `config/servidor-wol.json`:
//   { "mac": "3C:52:82:XX:XX:XX", "ip": "192.168.1.139" }
// Así, cuando esté puesta, basta con `node scripts/servidor/enciende-servidor.mjs` sin argumentos.
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ficha = join(RAIZ, 'config', 'servidor-wol.json');
let guardado = {};
if (existsSync(ficha)) {
  try { guardado = JSON.parse(readFileSync(ficha, 'utf8')); } catch { guardado = {}; }
}
const mac = opcion('mac', guardado.mac ?? null);
const ip = opcion('ip', guardado.ip ?? null);
const veces = Number(opcion('veces', 5));
if (!mac || !/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(mac)) {
  console.error('Falta la MAC o no tiene la forma aa:bb:cc:dd:ee:ff.');
  console.error('Pásala con --mac, o guárdala en config/servidor-wol.json: { "mac": "…", "ip": "192.168.1.139" }');
  process.exit(2);
}
const bytes = mac.split(/[:-]/).map((h) => parseInt(h, 16));
const paquete = Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => Buffer.from(bytes))]);

function envia(destino) {
  return new Promise((listo) => {
    const s = createSocket('udp4');
    s.once('error', (e) => { console.error(`  ✗ ${destino}: ${e.message}`); s.close(); listo(false); });
    s.bind(() => {
      s.setBroadcast(true);
      s.send(paquete, 0, paquete.length, 9, destino, (e) => {
        if (e) console.error(`  ✗ ${destino}: ${e.message}`);
        else console.log(`  ✓ paquete mágico a ${destino} (${mac})`);
        s.close();
        listo(!e);
      });
    });
  });
}

const destinos = ['255.255.255.255', ...(ip ? [ip] : [])];
console.log(`Encendiendo ${mac} · ${veces} intentos a ${destinos.join(', ')}`);
for (let i = 0; i < veces; i += 1) {
  for (const d of destinos) await envia(d);
  await new Promise((r) => setTimeout(r, 1000));
}
console.log('Hecho. Si en 60 s no responde, mira los requisitos de la cabecera (BIOS/WoL del adaptador).');
