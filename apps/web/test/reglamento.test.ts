import { describe, expect, it } from 'vitest';
import { arrastrePendiente, descensosDirectos } from '../src/lib/reglamento';

const base = { federacion: 'castilla-leon', categoria: 'aficionados', division: 'tercera-federacion', grupo: 'Grupo VIII', equipos: 18, temporada: '2025-26' };

describe('reglamento oficial 2025/26', () => {
  it('Tercera Federación: 3 descensos directos', () => {
    expect(descensosDirectos(base)).toBe(3);
  });
  it('Aficionados: 4 en el grupo A y 3 en el B', () => {
    expect(descensosDirectos({ ...base, division: 'primera-regional', grupo: 'Grupo A', equipos: 16 })).toBe(4);
    expect(descensosDirectos({ ...base, division: 'primera-regional', grupo: 'Grupo B', equipos: 16 })).toBe(3);
  });
  it('Juvenil: 2 en Liga Nacional y 4/3 en Regional', () => {
    expect(descensosDirectos({ ...base, categoria: 'juvenil', division: 'liga-nacional', grupo: 'Grupo III', equipos: 16 })).toBe(2);
    expect(descensosDirectos({ ...base, categoria: 'juvenil', division: 'primera-regional', grupo: 'Grupo A', equipos: 16 })).toBe(4);
    expect(descensosDirectos({ ...base, categoria: 'juvenil', division: 'primera-regional', grupo: 'Grupo B', equipos: 16 })).toBe(3);
  });
  it('Cadete e infantil regional: 3', () => {
    expect(descensosDirectos({ ...base, categoria: 'cadete', division: 'primera-regional', grupo: 'Grupo Único', equipos: 16 })).toBe(3);
    expect(descensosDirectos({ ...base, categoria: 'infantil', division: 'segunda-regional', grupo: 'Grupo Único', equipos: 16 })).toBe(3);
  });
  it('Provincial: 3 con 16+, 2 con 12-15 y 1 con 6-11', () => {
    expect(descensosDirectos({ ...base, division: 'primera-provincial', grupo: 'Único', equipos: 18 })).toBe(3);
    expect(descensosDirectos({ ...base, division: 'primera-provincial', grupo: 'Único', equipos: 14 })).toBe(2);
    expect(descensosDirectos({ ...base, division: 'primera-provincial', grupo: 'Único', equipos: 8 })).toBe(1);
  });
  it('Otra federación o temporada no recibe la circular de 2025/26', () => {
    expect(descensosDirectos({ ...base, federacion: 'andalucia' })).toBeNull();
    expect(descensosDirectos({ ...base, temporada: '2024-25' })).toBeNull();
  });
  it('Aficionados y Juvenil tienen arrastre pendiente; Tercera también', () => {
    expect(arrastrePendiente(base)).toBe(true);
    expect(arrastrePendiente({ ...base, division: 'primera-regional', grupo: 'Grupo A' })).toBe(true);
    expect(arrastrePendiente({ ...base, categoria: 'cadete', division: 'primera-regional' })).toBe(false);
  });
});
