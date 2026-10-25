-- Cotización por kilómetro, negociación, archivo, seguimiento y comunicaciones.
ALTER TABLE vehicles ADD COLUMN unit_type TEXT CHECK (unit_type IN ('plataforma','caja_seca'));
ALTER TABLE vehicles ADD COLUMN length_ft REAL NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN max_pallets REAL NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN axles INTEGER NOT NULL DEFAULT 0;

CREATE TABLE quotes_new (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  folio TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','negotiating','accepted','rejected','expired')),
  issued_on TEXT NOT NULL,
  valid_until TEXT,
  tax_pct REAL NOT NULL DEFAULT 16,
  retention_pct REAL NOT NULL DEFAULT 0,
  notes TEXT,
  terms TEXT,
  origin_label TEXT,
  destination_label TEXT,
  follow_up_on TEXT,
  final_amount REAL,
  final_rate_per_km REAL,
  archived_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (company_id, folio)
);
INSERT INTO quotes_new (id, company_id, folio, client_id, status, issued_on, valid_until, tax_pct, notes, created_by, created_at, updated_at)
  SELECT id, company_id, folio, client_id, status, issued_on, valid_until, tax_pct, notes, created_by, created_at, updated_at FROM quotes;
DROP TABLE quotes;
ALTER TABLE quotes_new RENAME TO quotes;
CREATE INDEX idx_quotes_company ON quotes(company_id, issued_on);

CREATE TABLE quote_items_new (
  id INTEGER PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('freight','rental','km')),
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_subtotal REAL NOT NULL,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  saved_route_id INTEGER REFERENCES saved_routes(id) ON DELETE SET NULL,
  snapshot TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO quote_items_new SELECT id, quote_id, position, kind, description, quantity, unit_subtotal, vehicle_id, saved_route_id, snapshot, engine_version, created_at FROM quote_items;
DROP TABLE quote_items;
ALTER TABLE quote_items_new RENAME TO quote_items;
CREATE INDEX idx_items_quote ON quote_items(quote_id, position);

CREATE TABLE communications (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_id INTEGER REFERENCES quotes(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','correo')),
  -- preparado: el usuario abrió/copió el mensaje; enviado/fallido: entrega por integración configurada.
  status TEXT NOT NULL CHECK (status IN ('preparado','enviado','fallido')),
  recipient TEXT,
  subject TEXT,
  body TEXT NOT NULL,
  scenario_ids TEXT,
  document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  detail TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_comms_quote ON communications(company_id, quote_id);

ALTER TABLE locations ADD COLUMN city TEXT;
ALTER TABLE locations ADD COLUMN state TEXT;
ALTER TABLE locations ADD COLUMN zip TEXT;
ALTER TABLE locations ADD COLUMN ref_notes TEXT;

-- Rutas frecuentes de cotización por km (origen/destino, km y casetas capturadas, con su origen).
CREATE TABLE km_routes (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  waypoints TEXT NOT NULL DEFAULT '[]',
  outbound_km REAL NOT NULL,
  return_km REAL,
  distance_source TEXT NOT NULL DEFAULT 'manual' CHECK (distance_source IN ('manual','proveedor')),
  distance_note TEXT,
  tolls_outbound REAL NOT NULL DEFAULT 0,
  tolls_return REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
