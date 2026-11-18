import tempfile
import unittest
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from pandas.testing import assert_frame_equal

from clasificacion import calendario_restante, simula
from grafo_minutos import solape, tramos
from marcadores import INDICES, rejilla
from modelos import CONFIGS, entrena, predice
from registro import actualiza, deriva, proximos
from variables import construye


def partido(id, fecha, local, visitante, goles):
    return dict(partido=id, fecha=date.fromisoformat(fecha), grupo=99, jornada=id, local=local,
                visitante=visitante, equipo_local=local, equipo_visitante=visitante, club_local=local,
                club_visitante=visitante, nombre_local=str(local), nombre_visitante=str(visitante),
                gl=goles[0], gv=goles[1], estado='played', anio=2025, categoria='juvenil', modalidad='futbol11',
                genero='masculina', nivel=2, hora=16, calidad='correct', tipo='liga', competicion='Juvenil')


def muestra(partidos):
    return {'partidos': pd.DataFrame(partidos), 'eventos': pd.DataFrame(), 'plantillas': pd.DataFrame(),
            'tecnicos': pd.DataFrame(), 'duraciones': pd.DataFrame({'grupo': [99], 'duracion': [90]})}


class PruebasMejora(unittest.TestCase):
    def test_marcadores_conservan_el_signo_del_modelo(self):
        p = [.59, .17, .24]
        m = rejilla(3.2, 1.1, p)
        np.testing.assert_allclose([m[c].sum() for c in INDICES], p)

    def test_grafo_mide_presencia_simultanea_en_el_campo(self):
        t = tramos({1, 2}, {1, 2, 3}, [('sale', 45, 1), ('entra', 45, 3)], 90)
        self.assertEqual(solape(t[1], t[3]), 0)
        self.assertEqual(solape(t[2], t[3]), 45)

    def test_los_resultados_del_dia_y_del_futuro_no_entran_en_las_variables(self):
        filas = [partido(1, '2025-10-04', 1, 2, (2, 0)), partido(2, '2025-10-04', 1, 3, (0, 0)),
                 partido(3, '2025-10-05', 1, 2, (0, 1))]
        _, x = construye(muestra(filas))
        filas[0]['gl'] = 0
        filas[0]['gv'] = 5
        filas[2]['gl'] = 12
        _, otro = construye(muestra(filas))
        assert_frame_equal(x.iloc[:2], otro.iloc[:2])
        self.assertNotEqual(x.iloc[2].elo_local, otro.iloc[2].elo_local)

    def test_hgb_tolera_columnas_sin_datos_en_un_pliegue(self):
        x = pd.DataFrame({'elo_diff': [0., 1., 2., 3., 4., 5.] * 4, 'sin_observacion': np.nan})
        y = np.tile([0, 1, 2, 0, 1, 2], 4)
        modelo = entrena(x, y, CONFIGS['hgb'], list(x.columns))
        np.testing.assert_allclose(predice(modelo, x).sum(axis=1), 1.)
        self.assertEqual(list(modelo.feature_names_in_), ['elo_diff'])

    def test_calendario_prioriza_cruce_publicado_y_deduce_resto(self):
        cruces, n = calendario_restante([1, 2, 3, 4], 3, [(1, 2)], [(4, 3)])
        self.assertIn((4, 3, False), cruces)
        self.assertEqual(n, 4)
        self.assertTrue(all(neutral for h, a, neutral in cruces if (h, a) != (4, 3)))
        self.assertIsNone(calendario_restante([1, 2, 3, 4], 3, [(1, 2), (2, 1)], []))

    def test_monte_carlo_conserva_distribucion_de_cada_puesto_y_equipo(self):
        jugados = pd.DataFrame([partido(1, '2025-10-04', 1, 2, (2, 1))])
        _, _, d = simula([1, 2, 3], jugados, [(2, 3, True), (1, 3, False)], 42, tamanos=(100, 300))
        for p in d.values():
            np.testing.assert_allclose(p.sum(axis=0), 1.)
            np.testing.assert_allclose(p.sum(axis=1), 1.)

    def test_los_puntos_oficiales_iniciales_se_respetan(self):
        jugados = pd.DataFrame([partido(1, '2025-10-04', 1, 2, (2, 1))])
        _, pts, _ = simula([1, 2, 3], jugados, [(2, 3, True), (1, 3, False)], 42,
                           tamanos=(100,), puntos_iniciales=np.array([10, 0, 0]))
        self.assertGreaterEqual(float(pts[0]), 10.)

    def test_el_calendario_posterior_al_corte_no_esta_disponible(self):
        ahora = pd.Timestamp('2025-10-10', tz='Europe/Madrid')
        datos = muestra([partido(1, '2025-10-04', 1, 2, (2, 0))])
        datos['equipos'] = pd.DataFrame([dict(grupo=99, equipo=i, equipo_temporada=i, club=i,
                                             nombre=str(i), retirado=False) for i in [1, 2, 3]])
        datos['calendario'] = pd.DataFrame([dict(grupo=99, jornada=j, local=1, visitante=i, fecha=date(2025, 10, 14),
                                                 observado_en=ahora + pd.Timedelta(days=d))
                                             for j, i, d in [(2, 2, -1), (3, 3, 1)]])
        f = proximos(datos, ahora)
        self.assertEqual(f.jornada.tolist(), [2])
        self.assertEqual(f.equipo_visitante.tolist(), [2])

    def test_registro_immutable_y_emision_con_corte(self):
        h = pd.DataFrame([partido(1, '2025-10-04', 1, 2, (2, 0))])
        sello = pd.Timestamp('2025-10-02 18:00', tz='Europe/Madrid')
        with tempfile.TemporaryDirectory() as dir:
            ruta = Path(dir) / 'registro.sqlite'
            primero = actualiza(ruta, h, [[.8, .1, .1]], h.iloc[:0], 'v1', sello)
            self.assertEqual(primero['congeladas_en_esta_pasada'], 1)
            repetido = actualiza(ruta, h, [[.1, .1, .8]], h, 'v2', sello + pd.Timedelta(days=3))
            self.assertEqual(repetido['congeladas_en_esta_pasada'], 0)
            self.assertEqual(repetido['resultados_actualizados'], 1)
            self.assertAlmostEqual(repetido['temporadas'][0]['acumulado']['log_loss'], -np.log(.8))
            self.assertEqual(repetido['temporadas'][0]['modelo'], 'v1')
            ultimo = actualiza(ruta, h.iloc[:0], [], h, 'v2', sello + pd.Timedelta(days=4))
            self.assertEqual(ultimo['resultados_actualizados'], 0)

    def test_deriva_necesita_periodos_de_referencia(self):
        antes = [{'n': 30, 'log_loss': .75}] * 5
        despues = [{'n': 30, 'log_loss': .85}] * 5
        self.assertIsNone(deriva(antes, .05)['alerta'])
        self.assertTrue(deriva(antes + despues, .05)['alerta'])


if __name__ == '__main__':
    unittest.main()
