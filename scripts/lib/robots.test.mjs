import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interpretaRobots, permitido } from './robots.mjs';

const MADRID = `User-agent: AhrefsBot
User-agent: MJ12bot
Disallow: /

User-agent: *
Disallow: /api/
Disallow: /dataset/*/resource/*
Disallow: /*?
Crawl-delay: 10
`;

test('datos.madrid.es: la página del conjunto sí, la descarga del recurso no, y nada con consulta', () => {
  const r = interpretaRobots(MADRID);
  const ua = 'FacylfBot/1.0';
  assert.equal(permitido(r, ua, '/dataset/211549-0-juegos-deportivos-actual'), true);
  assert.equal(permitido(r, ua, '/dataset/211549-0-juegos-deportivos-actual/resource/x/download/x.csv'), false);
  assert.equal(permitido(r, ua, '/dataset?q=futbol'), false);
  assert.equal(r.crawlDelay, 10);
  assert.equal(permitido(r, 'MJ12bot/2', '/dataset/x'), false);
});

test('Futormes: clasificación permitida, ficha de partido vetada', () => {
  const r = interpretaRobots('User-agent: *\nDisallow: /mod/soccer/player.aspx\nDisallow: /mod/soccer/match.aspx\n');
  assert.equal(permitido(r, 'FacylfBot', '/mod/soccer/situation.aspx?itm=1'), true);
  assert.equal(permitido(r, 'FacylfBot', '/mod/soccer/match.aspx?itm=7'), false);
});

test('el grupo propio del agente sustituye al de *; la regla más larga manda y Allow gana empates', () => {
  const r = interpretaRobots('User-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nDisallow: /priv/\nAllow: /priv/publico\n');
  assert.equal(permitido(r, 'Mozilla/5.0 (compatible; ClaudeBot/1.0)', '/es/league/view/1'), false);
  assert.equal(permitido(r, 'FacylfBot', '/es/league/view/1'), true);
  assert.equal(permitido(r, 'FacylfBot', '/priv/x'), false);
  assert.equal(permitido(r, 'FacylfBot', '/priv/publico/x'), true);
});

test('Disallow vacío y ancla $', () => {
  assert.equal(permitido(interpretaRobots('User-agent: *\nDisallow:\n'), 'x', '/todo'), true);
  const r = interpretaRobots('User-agent: *\nDisallow: /*.pdf$\n');
  assert.equal(permitido(r, 'x', '/a/b.pdf'), false);
  assert.equal(permitido(r, 'x', '/a/b.pdf?v=1'), true);
});
