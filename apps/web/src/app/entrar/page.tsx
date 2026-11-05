import type { Metadata } from 'next';
import { FormularioCrearCuenta } from '@/componentes/entrar/FormularioCrearCuenta';
import { FormularioEntrar } from '@/componentes/entrar/FormularioEntrar';

/**
 * Pantalla 13 del prototipo: entrar y crear cuenta.
 *
 * Los dos bloques van en tarjetas del sistema (borde y fondo elevado, radio de tarjeta, sin sombra:
 * el producto es plano) y se reparten en una fila a partir de 900 px; por debajo se apilan y a 360 px
 * no hay desplazamiento horizontal. La cabecera del sitio ya está puesta por el layout, así que aquí
 * no se repite el logo del prototipo.
 *
 * **No hay servidor de cuentas todavía.** Los formularios están preparados para cuando exista, pero
 * ninguna acción promete sesión, tokens ni correos: al pulsar se dice que las cuentas no están
 * abiertas. El diseño tampoco enseña un avatar o un nombre de usuario porque no hay sesión.
 *
 * El texto de utilidad es una sola línea y sirve para decidir: qué gana quien crea una cuenta. La
 * frase de invitación del prototipo se conserva porque es un requisito real del producto (la
 * plataforma es privada).
 */
export const metadata: Metadata = {
  title: 'Entrar o crear cuenta — facylf',
};

const TARJETA =
  'flex min-w-0 flex-[1_1_360px] max-w-[420px] flex-col gap-3.5 rounded-[var(--radius-tarjeta)] border border-[var(--borde)] bg-[var(--fondo-elevado)] p-6';

export default function Entrar() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Entrar o crear cuenta</h1>

      <p className="mx-auto max-w-[840px] text-center text-cuerpo text-[var(--texto-suave)]">
        Con una cuenta guardas clubes, equipos y jugadores y tienes a mano sus horarios, resultados y
        avisos.
      </p>

      <div className="flex flex-wrap items-start justify-center gap-6">
        <section aria-labelledby="entrar-titulo" className={TARJETA}>
          <h2 id="entrar-titulo" className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">
            Entrar
          </h2>
          <FormularioEntrar />
        </section>

        <section aria-labelledby="crear-cuenta-titulo" className={TARJETA}>
          <h2 id="crear-cuenta-titulo" className="m-0 text-titulo font-extrabold tracking-[-0.02em] text-[var(--texto)]">
            Crear cuenta
          </h2>
          <p className="m-0 text-tabla leading-6 text-[var(--texto-suave)]">
            facylf es privada: se entra con una invitación. Si no tienes una, pídela a quien te habló de
            la plataforma.
          </p>
          <FormularioCrearCuenta />
        </section>
      </div>
    </div>
  );
}
