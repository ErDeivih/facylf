# ADR-0002 — Identificadores externos contextualizados

- Estado: aceptada
- Fecha: 2026-09-13

## Contexto

Los códigos se repiten entre federaciones y pueden cambiar entre temporadas.

## Decisión

Usar claves internas y guardar cada referencia externa con federación, tipo y contexto deportivo.
Ningún `JOIN`, slug o caché presupone que el código externo es global.

## Consecuencias

Los enlaces son algo más largos y la importación debe resolver referencias, pero se evitan mezclas
silenciosas de competiciones, equipos, actas y jugadores.
