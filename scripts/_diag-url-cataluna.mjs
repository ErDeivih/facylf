#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2], { readOnly: true });
for (const r of db.prepare("select tipo, estado, url from trabajos where tipo in ('calendario','acta') order by tipo limit 4").all()) {
  console.log(`${r.tipo} · ${r.estado} · ${r.url}`);
}
db.close();
