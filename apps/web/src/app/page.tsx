import { calculaClasificacion, descansos, proximoPartido } from '@fcylf/dominio';
import { competicion, MI_EQUIPO } from '@/lib/datos';
import { Bloque } from '@/componentes/Bloque';
import { Proximo, fechaCorta } from '@/componentes/Proximo';
import { Tabla } from '@/componentes/Tabla';

// se recalcula cada hora; cuando haya vivo, Realtime empuja el cambio al navegador
export const revalidate = 3600;

const MOTIVOS: Record<string, string> = {
  'jornada-sin-nosotros': 'Se juega jornada, pero nosotros descansamos',
  'liga-no-empezada': 'La liga aún no ha empezado',
  'temporada-terminada': 'Temporada terminada',
  'paron': 'Parón: no hay jornada',
};

export default function Inicio() {
  const c = competicion();
  const hoy = new Date().toISOString().slice(0, 10);
  const proximo = proximoPartido(c.partidos, MI_EQUIPO, hoy);
  const tabla = calculaClasificacion(c.partidos);
  const fechas = c.partidos.map((p) => p.fecha).filter(Boolean).sort() as string[];
  const libres = descansos(c.partidos, MI_EQUIPO, fechas[0]!, fechas.at(-1)!)
    .filter((d) => d.motivo !== 'liga-no-empezada' && d.motivo !== 'temporada-terminada');

  return (
    <>
      <div className="mb-6 border border-[#D6D6D4]">
        <Proximo p={proximo} />
      </div>

      <Bloque titulo="Clasificación" pie={`${c.partidos.filter((p) => p.golesLocal !== null).length} de ${c.partidos.length} partidos con resultado`}>
        <Tabla filas={tabla} />
      </Bloque>

      <Bloque titulo="Fines de semana sin partido" pie={`${libres.length} durante la temporada`}>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {libres.map((d) => (
            <div key={d.sabado}
                 className={`border border-[#D6D6D4] border-l-[3px] p-3 ${d.festivo ? 'border-l-[#8E1F26]' : 'border-l-[#A87A12]'}`}>
              <p className="font-display text-base">{fechaCorta(d.sabado)} – {fechaCorta(d.domingo)}</p>
              <p className="mt-1 text-xs text-[#5C646C]">{MOTIVOS[d.motivo]}</p>
              {d.festivo && <p className="mt-1 text-xs text-[#8E1F26]">{d.festivo.nombre}</p>}
            </div>
          ))}
        </div>
      </Bloque>
    </>
  );
}
