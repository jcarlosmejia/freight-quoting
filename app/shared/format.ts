// Formatos compartidos por interfaz y documentos.
export const money = (x: number, currency = 'MXN', locale = 'es-MX') =>
  new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(x) || 0);

export const num = (x: number, digits = 2, locale = 'es-MX') =>
  new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(x) || 0);

/**
 * Formatea una fecha civil AAAA-MM-DD sin convertir zonas horarias. Fletcot interpreta ese texto
 * como medianoche UTC y lo muestra en America/Mexico_City, lo que resta un día (docs/09).
 */
export function civilDate(value: string | null | undefined, style: 'long' | 'short' = 'long', locale = 'es-MX') {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', year: 'numeric', month: style, day: '2-digit' }).format(d);
}

// Trunca minutos: 7,429 s se muestra "2h 3min", como en el caso observado.
export const duration = (seconds: number) => {
  const total = Math.floor(Math.max(0, seconds) / 60 + 1e-9);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${m}min` : `${m} min`;
};

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  negotiating: 'En negociación',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  expired: 'Vencida',
};

export const STATUS_TONE: Record<string, string> = {
  draft: 'bg-warning/15 text-warning',
  sent: 'bg-info/15 text-info',
  negotiating: 'bg-primary/15 text-primary',
  accepted: 'bg-success/15 text-success',
  rejected: 'bg-error/15 text-error',
  expired: 'bg-muted text-text-muted',
};
