/** Conserva TODAS las tarjetas, haya o no expulsión o acumulación. */
export function resumeDisciplina(filas) {
  const grupos = new Map();
  for (const f of filas) {
    const clave = `${f.person_id}:${f.temporada}:${f.team_entry_id}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(f);
  }
  const resultado = new Map();
  for (const [clave, originales] of grupos) {
    const lista = [...new Map(originales.map(f => [String(f.match_id), f])).values()]
      .sort((a,b) => String(a.fecha ?? '').localeCompare(String(b.fecha ?? '')) || Number(a.jornada)-Number(b.jornada));
    let amarillas = 0;
    const rojas = [], quintas = [];
    for (let i=0;i<lista.length;i++) {
      const f=lista[i], antes=amarillas;
      amarillas += Number(f.amarillas || 0);
      const siguientes=lista.slice(i+1,i+4);
      const estado=s=>s.consta_en_acta===true?'consta':s.alineacion_disponible===true?'sin_aparicion':'sin_datos';
      for(let r=0;r<Number(f.rojas || 0);r++) rojas.push({jornada:f.jornada,fecha:f.fecha,
        sinAparicion:siguientes.filter(s=>estado(s)==='sin_aparicion').length,
        sinDatos:siguientes.filter(s=>estado(s)==='sin_datos').length,deCuantos:siguientes.length});
      if(Math.floor(amarillas/5)>Math.floor(antes/5)) quintas.push({jornada:f.jornada,fecha:f.fecha,
        siguiente:lista[i+1] ? estado(lista[i+1]) : null});
    }
    resultado.set(clave,{amarillas,rojas,quintas});
  }
  return resultado;
}
