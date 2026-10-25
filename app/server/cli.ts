import { migrate, openDb } from './db.ts';
import { settings } from './config.ts';
import { seed } from './seed.ts';

const cmd = process.argv[2];
const cfg = settings();
const db = openDb(cfg.dbFile);

if (cmd === 'migrate') {
  const applied = migrate(db);
  console.log(applied.length ? `Migraciones aplicadas: ${applied.join(', ')}` : 'Base de datos al día.');
} else if (cmd === 'seed') {
  migrate(db);
  const env = cfg.env;
  const res = seed(db, {
    companyName: env.SEED_COMPANY_NAME,
    adminEmail: env.SEED_ADMIN_EMAIL ?? 'admin@demo.test',
    adminPassword: env.SEED_ADMIN_PASSWORD ?? 'cambia-esta-clave-admin',
    userEmail: env.SEED_USER_EMAIL ?? 'usuario@demo.test',
    userPassword: env.SEED_USER_PASSWORD ?? 'cambia-esta-clave-usuario',
    dataDir: cfg.dataDir,
  });
  console.log(res.created ? 'Datos de ejemplo creados (credenciales en app/.env o valores por defecto de app/.env.example).' : 'Los datos de ejemplo ya existían; no se modificaron.');
} else {
  console.error('Uso: node server/cli.ts migrate|seed');
  process.exitCode = 1;
}
db.close();
