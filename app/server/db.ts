import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type DB = DatabaseSync;
type Param = string | number | bigint | null | Uint8Array;
// Filas de SQLite sin esquema estático; se validan en la frontera HTTP.
export type Row = any;

const MIGRATIONS = join(import.meta.dirname, 'migrations');

export function openDb(file: string): DB {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  return db;
}

/** Aplica en orden los .sql de server/migrations que no se hayan aplicado. Devuelve los nombres aplicados. */
export function migrate(db: DB): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set(db.prepare('SELECT name FROM schema_migrations').all().map((r) => String(r.name)));
  const applied: string[] = [];
  // Las migraciones pueden reconstruir tablas (SQLite no altera CHECK): se desactivan FK y se verifica al final.
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    for (const name of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(name)) continue;
      tx(db, () => {
        db.exec(readFileSync(join(MIGRATIONS, name), 'utf8'));
        const broken = db.prepare('PRAGMA foreign_key_check').all();
        if (broken.length) throw new Error(`La migración ${name} deja referencias rotas: ${JSON.stringify(broken.slice(0, 3))}`);
        db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(name, new Date().toISOString());
      });
      applied.push(name);
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
  return applied;
}

let savepoint = 0;
/** Transacción; si ya hay una abierta usa un SAVEPOINT para poder anidar servicios. */
export function tx<T>(db: DB, fn: () => T): T {
  const nested = db.isTransaction;
  const name = `sp${++savepoint}`;
  db.exec(nested ? `SAVEPOINT ${name}` : 'BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec(nested ? `RELEASE ${name}` : 'COMMIT');
    return out;
  } catch (e) {
    db.exec(nested ? `ROLLBACK TO ${name}; RELEASE ${name}` : 'ROLLBACK');
    throw e;
  }
}

export const all = (db: DB, sql: string, ...p: Param[]): Row[] => db.prepare(sql).all(...p) as Row[];
export const one = (db: DB, sql: string, ...p: Param[]): Row | undefined => db.prepare(sql).get(...p) as Row | undefined;
export const run = (db: DB, sql: string, ...p: Param[]) => db.prepare(sql).run(...p);

/** Inserta un objeto plano; las claves deben venir de código, nunca del cliente. */
export function insert(db: DB, table: string, values: Record<string, Param | boolean | undefined>): number {
  const keys = Object.keys(values).filter((k) => values[k] !== undefined);
  const res = run(
    db,
    `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    ...keys.map((k) => toParam(values[k])),
  );
  return Number(res.lastInsertRowid);
}

export function update(db: DB, table: string, id: number, values: Record<string, Param | boolean | undefined>, where = '') {
  const keys = Object.keys(values).filter((k) => values[k] !== undefined);
  if (!keys.length) return;
  run(db, `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? ${where}`, ...keys.map((k) => toParam(values[k])), id);
}

const toParam = (v: Param | boolean | undefined): Param => (typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? null));
