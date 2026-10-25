-- Esquema propio. No proviene de Fletcot (su base de datos no se obtuvo).
CREATE TABLE companies (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  legal_name TEXT,
  rfc TEXT,
  website TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  country_code TEXT NOT NULL DEFAULT 'MX',
  logo_path TEXT,
  folio_prefix TEXT NOT NULL DEFAULT 'COT',
  folio_digits INTEGER NOT NULL DEFAULT 4,
  folio_include_year INTEGER NOT NULL DEFAULT 1,
  preferences TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  UNIQUE (company_id, name)
);

CREATE TABLE role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (role_id, permission)
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE fleet_categories (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  vehicles INTEGER NOT NULL DEFAULT 0,
  days_per_year REAL NOT NULL DEFAULT 312,
  hours_per_day REAL NOT NULL DEFAULT 8
);

CREATE TABLE general_expenses (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('Mensual','Bimestral','Trimestral','Semestral','Anual')),
  amount REAL NOT NULL CHECK (amount >= 0),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE equipment (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  unit_price REAL NOT NULL DEFAULT 0 CHECK (unit_price >= 0)
);

CREATE TABLE vehicles (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  class_code TEXT,
  description TEXT,
  category_id INTEGER REFERENCES fleet_categories(id) ON DELETE SET NULL,
  height_m REAL, width_m REAL, length_m REAL, weight_tons REAL,
  tons_capacity REAL NOT NULL DEFAULT 0,
  value REAL NOT NULL DEFAULT 0,
  life_km REAL NOT NULL DEFAULT 0,
  life_years REAL NOT NULL DEFAULT 0,
  salvage_pct REAL NOT NULL DEFAULT 0,
  capital_rate_pct REAL NOT NULL DEFAULT 0,
  tires_steer_qty REAL NOT NULL DEFAULT 0, tires_steer_life_km REAL NOT NULL DEFAULT 0, tires_steer_price REAL NOT NULL DEFAULT 0,
  tires_drive_qty REAL NOT NULL DEFAULT 0, tires_drive_life_km REAL NOT NULL DEFAULT 0, tires_drive_price REAL NOT NULL DEFAULT 0,
  tires_trailer_qty REAL NOT NULL DEFAULT 0, tires_trailer_life_km REAL NOT NULL DEFAULT 0, tires_trailer_price REAL NOT NULL DEFAULT 0,
  km_per_liter_loaded REAL NOT NULL DEFAULT 0,
  km_per_liter_empty REAL NOT NULL DEFAULT 0,
  fuel_price REAL NOT NULL DEFAULT 0,
  tank_liters REAL NOT NULL DEFAULT 0,
  refill_minutes REAL NOT NULL DEFAULT 0,
  idle_lph REAL NOT NULL DEFAULT 0,
  break_every_hours REAL NOT NULL DEFAULT 0,
  break_duration_hours REAL NOT NULL DEFAULT 0,
  break_cost REAL NOT NULL DEFAULT 0,
  maintenance_interval_km REAL NOT NULL DEFAULT 0,
  maintenance_cost REAL NOT NULL DEFAULT 0,
  driver_pay_km_loaded REAL NOT NULL DEFAULT 0,
  driver_pay_km_empty REAL NOT NULL DEFAULT 0,
  driver_pay_hour REAL NOT NULL DEFAULT 0,
  driver_pay_route_pct REAL NOT NULL DEFAULT 0,
  driver_pay_monthly REAL NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE vehicle_assets (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  life_km REAL NOT NULL DEFAULT 0,
  life_years REAL NOT NULL DEFAULT 0
);

CREATE TABLE vehicle_expenses (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  period TEXT NOT NULL CHECK (period IN ('daily','weekly','monthly','annual'))
);

CREATE TABLE vehicle_equipment (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  qty REAL NOT NULL DEFAULT 1,
  life_years REAL NOT NULL DEFAULT 1,
  life_months REAL NOT NULL DEFAULT 0
);

CREATE TABLE clients (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  rfc TEXT,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE locations (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'ubicacion' CHECK (kind IN ('base','ubicacion')),
  address TEXT,
  lat REAL,
  lon REAL
);

CREATE TABLE toll_plazas (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  highway TEXT,
  source TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE toll_rates (
  id INTEGER PRIMARY KEY,
  plaza_id INTEGER NOT NULL REFERENCES toll_plazas(id) ON DELETE CASCADE,
  vehicle_class TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'ambos',
  amount REAL NOT NULL CHECK (amount >= 0),
  effective_from TEXT NOT NULL,
  source TEXT NOT NULL
);

CREATE TABLE saved_routes (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  route TEXT NOT NULL,
  routing_source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE folio_counters (
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  last INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, year)
);

CREATE TABLE quotes (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  folio TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired')),
  issued_on TEXT NOT NULL,
  valid_until TEXT,
  tax_pct REAL NOT NULL DEFAULT 16,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (company_id, folio)
);

CREATE TABLE quote_items (
  id INTEGER PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('freight','rental')),
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_subtotal REAL NOT NULL,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  saved_route_id INTEGER REFERENCES saved_routes(id) ON DELETE SET NULL,
  snapshot TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Cada recálculo guarda el snapshot anterior; nada se sobrescribe sin rastro.
CREATE TABLE quote_item_revisions (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES quote_items(id) ON DELETE CASCADE,
  unit_subtotal REAL NOT NULL,
  snapshot TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  replaced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  replaced_by INTEGER REFERENCES users(id)
);

CREATE TABLE price_lists (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id),
  profit_pct REAL NOT NULL,
  financing_pct REAL NOT NULL,
  tax_pct REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE price_list_rows (
  id INTEGER PRIMARY KEY,
  price_list_id INTEGER NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  saved_route_id INTEGER REFERENCES saved_routes(id) ON DELETE SET NULL,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  route_name TEXT NOT NULL,
  vehicle_name TEXT NOT NULL,
  distance_meters REAL NOT NULL,
  tolls REAL NOT NULL,
  unit_subtotal REAL NOT NULL,
  price_with_tax REAL NOT NULL,
  snapshot TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE templates (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('quote','price_list')),
  name TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('quote','price_list')),
  source_id INTEGER NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('docx','pdf','xlsx')),
  channel TEXT NOT NULL DEFAULT 'descarga',
  recipient TEXT,
  status TEXT NOT NULL,
  detail TEXT,
  file_name TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE integrations (
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'sin_configurar',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (company_id, kind)
);

CREATE TABLE integration_events (
  id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  event TEXT NOT NULL,
  detail TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_quotes_company ON quotes(company_id, issued_on);
CREATE INDEX idx_items_quote ON quote_items(quote_id, position);
CREATE INDEX idx_vehicles_company ON vehicles(company_id);
CREATE INDEX idx_clients_company ON clients(company_id);
CREATE INDEX idx_documents_company ON documents(company_id, created_at);
