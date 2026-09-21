/*
 * Pruebas de la lectura del compose (qué federaciones tiene la flota) y del estado de sus contenedores.
 *
 * Importa porque `ajustar-flota.mjs` para contenedores según esta lista: si una federación no se reconoce, se
 * queda fuera del ajuste (nadie la para cuando termina); si se reconoce mal, se para el contenedor equivocado.
 * El YAML de la prueba es el que imprime de verdad `docker compose config` (mismo sangrado y mismas listas).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  federacionDelComando, interpretaComposePs, puedeActuar, serviciosDeComposeJson, serviciosDeComposeYaml,
} from './compose-flota.mjs';

const YAML = `name: docker
services:
  andalucia:
    build:
      context: /app
      dockerfile: docker/Dockerfile
    cgroup_parent: facylf.slice
    command:
      - bash
      - docker/entrada-recolector.sh
      - andalucia
    environment:
      FACYLF_MEMORIA_GB: "10"
      TZ: Europe/Madrid
    image: facylf-recolectores:local
    mem_limit: "1677721600"
    restart: unless-stopped
  castilla-la-mancha:
    command:
      - bash
      - docker/entrada-recolector.sh
      - castilla-la-mancha
    restart: unless-stopped
  fin-de-semana:
    command:
      - bash
      - docker/entrada-fin-de-semana.sh
      - "07:30"
    restart: unless-stopped
  valencia:
    command: bash docker/entrada-recolector.sh valencia
    restart: unless-stopped
volumes:
  plazas:
    name: docker_plazas
`;

test('se reconocen las federaciones del compose, en lista o en texto', () => {
  const servicios = serviciosDeComposeYaml(YAML);
  assert.deepEqual(servicios.map((s) => s.federacion), ['andalucia', 'castilla-la-mancha', 'valencia']);
  assert.deepEqual(servicios.map((s) => s.servicio), ['andalucia', 'castilla-la-mancha', 'valencia']);
});

test('lo que no es un recolector no entra en el ajuste', () => {
  // La pasada del fin de semana y el volumen de plazas no son federaciones: pararlos no tendría sentido.
  const servicios = serviciosDeComposeYaml(YAML);
  assert.equal(servicios.some((s) => s.servicio === 'fin-de-semana'), false);
  assert.equal(servicios.some((s) => s.servicio === 'plazas'), false);
});

test('el mismo compose en JSON da la misma lista', () => {
  const json = {
    services: {
      andalucia: { command: ['bash', 'docker/entrada-recolector.sh', 'andalucia'] },
      valencia: { command: 'bash docker/entrada-recolector.sh valencia' },
      'fin-de-semana': { command: ['bash', 'docker/entrada-fin-de-semana.sh', '07:30'] },
    },
  };
  assert.deepEqual(serviciosDeComposeJson(json).map((s) => s.federacion), ['andalucia', 'valencia']);
  assert.deepEqual(serviciosDeComposeJson({}).map((s) => s.federacion), []);
});

test('un comando sin federación no inventa ninguna', () => {
  // Sin identificador no se puede decidir: mejor no tocar nada que parar el contenedor de otra federación.
  assert.equal(federacionDelComando(['bash', 'docker/entrada-recolector.sh']), null);
  assert.equal(federacionDelComando(['bash', 'docker/entrada-recolector.sh', '-x']), null);
  assert.equal(federacionDelComando('node scripts/otra-cosa.mjs'), null);
  assert.equal(federacionDelComando(null), null);
});

test('el estado de los contenedores se lee en las dos formas que imprime Compose', () => {
  const lista = JSON.stringify([
    { Name: 'docker-andalucia-1', Service: 'andalucia', State: 'running', Health: '' },
    { Name: 'docker-rioja-1', Service: 'rioja', State: 'exited', Health: '' },
  ]);
  const estado = interpretaComposePs(lista);
  assert.equal(estado.get('andalucia').enMarcha, true);
  assert.equal(estado.get('rioja').enMarcha, false);

  // Y una línea por objeto (versiones antiguas de Compose).
  const lineas = '{"Service":"galicia","State":"running"}\n{"Service":"murcia","State":"exited"}\n';
  const otro = interpretaComposePs(lineas);
  assert.equal(otro.get('galicia').enMarcha, true);
  assert.equal(otro.get('murcia').enMarcha, false);

  // Una línea ilegible no puede hacer creer que un contenedor está en marcha.
  assert.equal(interpretaComposePs('no soy json').size, 0);
});

test('sin demonio de Docker no se toca la flota', () => {
  // El 19/09/2026, con el disco lleno, el demonio dejó de responder: el informe decía «0 contenedores en marcha»
  // (falso) y un --aplicar habría parado y levantado contenedores a ciegas. Sin saber el estado, no se actúa.
  const apagado = puedeActuar({ demonioVivo: false, decisiones: [{ accion: 'abajo' }] });
  assert.equal(apagado.ok, false);
  assert.match(apagado.motivo, /no responde/);
  assert.equal(puedeActuar({ demonioVivo: true, decisiones: [] }).ok, false);
  assert.equal(puedeActuar({ demonioVivo: true, decisiones: [{ accion: 'abajo' }] }).ok, true);
});
