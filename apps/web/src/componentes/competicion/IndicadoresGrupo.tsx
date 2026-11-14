import { Dato } from '@/componentes/ui/dato';

/**
 * Indicadores de la ficha de competición (goles por partido, % de victorias locales y actas).
 *
 * Se extrajo de la página porque `ai-design-check` marcaba el mismo bloque repetido; ahora el orden,
 * las etiquetas y el formato viven en un sitio y la página sólo pasa las cifras ya calculadas.
 */
export function IndicadoresGrupo({ golesPorPartido, porcentajeLocal, actas, porcentajeActas }: {
  golesPorPartido: string;
  porcentajeLocal: number;
  actas: string;
  porcentajeActas: number;
}) {
  return (
    <div className="flex basis-full flex-wrap gap-2" aria-label="Indicadores del grupo">
      <Dato etiqueta="Goles/partido">{golesPorPartido}</Dato>
      <Dato etiqueta="% local">{porcentajeLocal} %</Dato>
      <Dato etiqueta="Actas">{actas} ({porcentajeActas} %)</Dato>
    </div>
  );
}
