import { describe, expect, it } from 'vitest';
import { categoriaDesdeNombre, generoDesdeNombre } from '../src/origen/vocabularios.js';

/*
 * Medido el 21/10/2026 sobre los 12.841 nombres de competición de las colas: con la regla sólo en
 * castellano quedaban 1.739 en `desconocida`; con ésta, 1.559, y 131 nombres corrigen su valor (casi todos
 * selecciones «SUB-NN» y «CADET» que salían como aficionados). Ver PLATAFORMA-NACIONAL.md §3.
 */
const categoria = (n: string) => categoriaDesdeNombre(n).categoria;
const genero = (n: string) => generoDesdeNombre(n).genero;

describe('categoría en las cuatro lenguas de las federaciones', () => {
  it('catalán y valenciano', () => {
    expect(categoria('CADET PRIMERA DIVISIÓ S16 - COPA TERRES EBRE')).toBe('cadete');
    expect(categoria('Promoció ascens - SEGONA DIVISIÓ BENJAMÍ S10')).toBe('benjamin');
    expect(categoria('Lliga Prebenjamí 2n. Any Alacant Iniciació')).toBe('prebenjamin');
    expect(categoria('Primera FFCV Aleví 1r. any Castelló')).toBe('alevin');
    expect(categoria('SEGONA CATALANA')).toBe('aficionados');
  });
  it('euskera, también cuando el nombre es bilingüe', () => {
    expect(categoria('LIGA VASCA JUVENIL / GAZTEEN EUSKAL LIGA')).toBe('juvenil');
    expect(categoria('TERRITORIAL FJ / GAZTEEN MAILA')).toBe('juvenil');
    expect(categoria('PREFERENTE CADETE / KADETEEN LEHENTASUNEZKO MAILA')).toBe('cadete');
    expect(categoria('COPA DE S.M. LA REINA 1ª ELIMINATORIA / ERREGINAREN KOPA 1. KANPORAKETA')).toBe('aficionados');
  });
  it('selecciones por edad, con menos confianza que la palabra explícita', () => {
    expect(categoriaDesdeNombre('CAMPEONATO NACIONAL DE SELECCIONES AUTONÓMICAS MASCULINAS SUB-14')).toEqual({ categoria: 'infantil', confianza: 0.6 });
    expect(categoria('XVI CTO. NAC. SELECCIONES AUTONÓMICAS SUB.16')).toBe('cadete');
    expect(categoria('CPTO. SUB-17 FEMENINA FS. SELECC. PROVINCIALES')).toBe('juvenil');
    expect(categoriaDesdeNombre('Liga Cadete').confianza).toBe(0.8);
  });
  it('lo que el vocabulario cerrado no tiene se queda en desconocida', () => {
    expect(categoria('1ª PROVINCIAL BEBE (ALMERÍA)')).toBe('desconocida');
    expect(categoria('LLIGA MINIPREBENJAMÍ FUTBOL SALA')).toBe('desconocida');
    expect(categoria('SEGUNDA FASE DEBUTANTE')).toBe('desconocida');
    expect(categoria('Liga A / A Liga (7114)')).toBe('desconocida');
  });
  it('no cambia lo que ya funcionaba en castellano', () => {
    expect(categoria('1ª División Provincial de Juveniles, Primera - Salamanca')).toBe('juvenil');
    expect(categoria('Primera Provincial Aficionado Salamanca Grupo 2')).toBe('aficionados');
    expect(categoria('Liga Benjamín 1º. Año Castellón B')).toBe('benjamin');
    expect(categoria('Salamanca - 1')).toBe('desconocida');
  });
});

describe('género en las cuatro lenguas', () => {
  it('reconoce femení, emakume y neska', () => {
    expect(genero('Campionat Femení Futsal')).toBe('femenina');
    expect(genero('ARABA KOPA FEMENINA / ARABA KOPA NESKAK')).toBe('femenina');
    expect(genero('REGIONAL FEMENINO / EMAKUMEZKOA MAILA')).toBe('femenina');
    expect(genero('COPA CATALUNYA MASCULINA')).toBe('masculina');
    expect(genero('Liga Mixta Benjamín')).toBe('mixta');
  });
  it('sin marca no se deduce', () => {
    expect(genero('Primera Infantil')).toBe('desconocido');
    expect(genero('LLIGA VETERANS FUTBOL SALA')).toBe('desconocido');
  });
});

describe('club a partir del nombre del equipo (regla 7)', () => {
  it('quita la letra entrecomillada, con comillas dobles o simples', async () => {
    const { clubDesdeNombreEquipo } = await import('../src/origen/vocabularios.js');
    expect(clubDesdeNombreEquipo('S.D. SAN JOSE "A"')).toBe('S.D. SAN JOSE');
    expect(clubDesdeNombreEquipo("C.F. Marines 'B'")).toBe('C.F. Marines');
    expect(clubDesdeNombreEquipo("RAYO CIUDAD ALCOBENDAS C.F. 'C'")).toBe('RAYO CIUDAD ALCOBENDAS C.F.');
    expect(clubDesdeNombreEquipo("C.D. Màgic de Castelló 'A'")).toBe('C.D. Màgic de Castelló');
  });
  it('no toca apóstrofos del nombre', async () => {
    const { clubDesdeNombreEquipo } = await import('../src/origen/vocabularios.js');
    expect(clubDesdeNombreEquipo("SANT JOAN D'ALACANT 'A'")).toBe("SANT JOAN D'ALACANT");
    expect(clubDesdeNombreEquipo('C.D. Benicásim')).toBe('C.D. Benicásim');
  });
  it('letra suelta: en la FCF de la A a la H; en el resto de la A a la E y no detrás de una inicial', async () => {
    const { clubDesdeNombreEquipo } = await import('../src/origen/vocabularios.js');
    const fcf = { letraSueltaSiempre: true };
    expect(clubDesdeNombreEquipo('ESPOLLA, C.E. A', fcf)).toBe('ESPOLLA, C.E.');
    expect(clubDesdeNombreEquipo('FUTSAL AVÍCOLA VINYALS MATARÓ F', fcf)).toBe('FUTSAL AVÍCOLA VINYALS MATARÓ');
    expect(clubDesdeNombreEquipo("ATLETIC LA SEU D'URGELL,CLUB A", fcf)).toBe("ATLETIC LA SEU D'URGELL,CLUB");
    expect(clubDesdeNombreEquipo('CD SAFA B')).toBe('CD SAFA');
    expect(clubDesdeNombreEquipo('AXULAR LIZEOA E')).toBe('AXULAR LIZEOA');
    expect(clubDesdeNombreEquipo('ESPOLLA, C.E. B')).toBe('ESPOLLA, C.E.');
    // fuera de la FCF, «F» suele ser Femenino o forma jurídica, y otras letras son parte del nombre
    expect(clubDesdeNombreEquipo('E.M.F. ADEJE F')).toBe('E.M.F. ADEJE F');
    expect(clubDesdeNombreEquipo('C.D. XEREZ FEMINAS C. F')).toBe('C.D. XEREZ FEMINAS C. F');
    expect(clubDesdeNombreEquipo('VALENCIA C. B')).toBe('VALENCIA C. B');
    expect(clubDesdeNombreEquipo('RIVER X')).toBe('RIVER X');
    expect(clubDesdeNombreEquipo('C.D. VICAR j')).toBe('C.D. VICAR j');
  });
});

describe('división y provincia (desplegables y cruce entre federaciones)', () => {
  it('reconoce el escalón en las cuatro lenguas', async () => {
    const { divisionDesdeNombre } = await import('../src/origen/vocabularios.js');
    const d = (n: string) => divisionDesdeNombre(n).division;
    expect(d('CAMPEONATO DE DIVISIÓN DE HONOR JUVENIL / GAZTEEN OHOREZKO MAILA')).toBe('division-honor');
    expect(d('DIVISIÓ HONOR CADET S16')).toBe('division-honor');
    expect(d('Liga Nacional Juvenil Grupo 7')).toBe('liga-nacional');
    expect(d('LIGA VASCA JUVENIL / GAZTEEN EUSKAL LIGA')).toBe('division-honor-regional');
    expect(d('División de Honor Andaluza Gr.2')).toBe('division-honor-regional');
    expect(d('PREFERENTE CADETE / KADETEEN LEHENTASUNEZKO MAILA')).toBe('preferente');
    expect(d('LIGA MIGUEL GLEZ. PEREZ - JUV. PREF. - 2ª Fase')).toBe('preferente');
    expect(d('2ª Andaluza Senior (Huelva)')).toBe('segunda');
    expect(d('SEGONA CATALANA')).toBe('segunda');
    expect(d('CAMPEONATO DE TERCERA FEDERACIÓN / RFEF HIRUGARREN MAILA')).toBe('tercera-federacion');
  });
  it('una fase, una ronda o el año de edad no son una división', async () => {
    const { divisionDesdeNombre } = await import('../src/origen/vocabularios.js');
    expect(divisionDesdeNombre('F-7 ALEVIN 1ª FASE /').division).toBe('desconocida');
    expect(divisionDesdeNombre('Lliga Aleví 1r. any València Iniciació').division).toBe('desconocida');
    expect(divisionDesdeNombre('COPA DIPUTACION BENJAMIN FUTBOL SALA (JAEN)').division).toBe('desconocida');
  });
  it('provincia sólo cuando el nombre la cita, con tildes y en catalán', async () => {
    const { provinciaDesdeNombre } = await import('../src/origen/vocabularios.js');
    expect(provinciaDesdeNombre('2ª Andaluza Senior (Huelva)')).toBe('Huelva');
    expect(provinciaDesdeNombre('Primera FFCV Aleví 1r. any Castelló')).toBe('Castellón');
    expect(provinciaDesdeNombre('3ª ANDALUZA CADETE (ALMERÍA)')).toBe('Almería');
    expect(provinciaDesdeNombre('1ª División Provincial de Juveniles, Primera - Salamanca')).toBe('Salamanca');
    expect(provinciaDesdeNombre('SEGONA CATALANA')).toBe(null);
  });
  it('«Bebé» con tilde tampoco se convierte en categoría', async () => {
    const { categoriaDesdeNombre } = await import('../src/origen/vocabularios.js');
    expect(categoriaDesdeNombre('Convivencias Bebé (Granada)').categoria).toBe('desconocida');
  });
});
