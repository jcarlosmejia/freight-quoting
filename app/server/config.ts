import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const APP_ROOT = resolve(import.meta.dirname, '..');

/** Lee app/.env (KEY=valor) sin dependencias; las variables del entorno tienen prioridad. */
export function loadEnv(): Record<string, string | undefined> {
  const file = join(APP_ROOT, '.env');
  const fromFile: Record<string, string> = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !line.trim().startsWith('#')) fromFile[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
  return { ...fromFile, ...process.env };
}

export function settings(env = loadEnv()) {
  const dataDir = resolve(APP_ROOT, env.DATA_DIR ?? 'data');
  return {
    env,
    dataDir,
    dbFile: join(dataDir, 'fletcot-local.sqlite'),
    host: env.HOST ?? '127.0.0.1',
    port: Number(env.PORT ?? 5180),
    secureCookies: env.SECURE_COOKIES === 'true',
    webDir: join(APP_ROOT, 'dist'),
  };
}
