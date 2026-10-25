// Cifrado de secretos de integraciones con AES-256-GCM y la clave APP_SECRET de la instalación.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const key = (secret: string) => createHash('sha256').update(secret).digest();

export function encrypt(secret: string, plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(secret), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}

export function decrypt(secret: string, payload: string) {
  const [v, iv, tag, data] = payload.split(':');
  if (v !== 'v1') throw new Error('Formato de secreto desconocido.');
  const d = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}
