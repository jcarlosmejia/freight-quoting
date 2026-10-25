import { buildApp } from './app.ts';
import { settings } from './config.ts';
import { migrate, openDb } from './db.ts';

const cfg = settings();
const db = openDb(cfg.dbFile);
migrate(db);
const app = await buildApp({ db, dataDir: cfg.dataDir, env: cfg.env, secureCookies: cfg.secureCookies }, { webDir: cfg.webDir, logger: true });
await app.listen({ host: cfg.host, port: cfg.port });
console.log(`Freight Quoting en http://${cfg.host}:${cfg.port}`);
