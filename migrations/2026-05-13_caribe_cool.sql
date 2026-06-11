-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Módulo Caribe Cool (Boletería)
-- Crea 2 tablas: boletos_caribe_cool + movimientos_tesoreria_cc
-- Convención RLS: allow_all (consistente con resto del proyecto)
-- ═══════════════════════════════════════════════════════════════════

-- Asegurar que pgcrypto esté disponible (para gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Función helper para auto-actualizar updated_at en cada UPDATE
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─── Tabla 1: boletos_caribe_cool ────────────────────────────────
-- Boletos de la cuenta Caribe Cool (importados del Excel + datos manuales de Pamela)
CREATE TABLE IF NOT EXISTS boletos_caribe_cool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id TEXT NOT NULL,

  -- Identificador de negocio: pnr + descripcion normalizada
  -- Garantiza que no se duplique un boleto al re-importar
  business_id TEXT NOT NULL,

  -- ─── Datos del proveedor Caribe Cool (importados del Excel) ──
  pnr TEXT,
  cliente TEXT,
  fecha_venta DATE,
  descripcion TEXT,           -- "Venta del billete [RT] HAV>CUN [JUAN PEREZ]"
  tipo_viaje TEXT,            -- 'OW' | 'RT'
  ruta TEXT,                  -- "HAV>CUN"
  costo_usd NUMERIC(12,2),    -- Costo en sistema de Caribe Cool
  moneda_costo TEXT DEFAULT 'USD',
  estado_caribe TEXT,         -- Estatus en sistema Caribe Cool
  tipo_pago_caribe TEXT,      -- Forma de pago en sistema Caribe Cool
  vendedor TEXT,
  trans_negativa BOOLEAN DEFAULT FALSE,  -- Transacciones de costo $0

  -- ─── Datos manuales (capturados por Pamela) ──────────────────
  so_mexico TEXT,
  so_cuba TEXT,
  forma_pago TEXT,            -- Catálogo cerrado: EFECTIVO CUBA, BNMX USD, etc.
  precio_venta NUMERIC(12,2), -- Precio cobrado al cliente final (USD)
  fecha_cobro DATE,
  cliente_pagador TEXT,
  dias_credito INTEGER,
  estatus TEXT,               -- 'COBRADO' | 'PENDIENTE'
  plaza TEXT,                 -- 'MEX' | 'CUBA'
  notas TEXT,

  -- ─── Moneda local del cobro (cuando se cobra en MXN, no USD) ──
  moneda_cobro TEXT DEFAULT 'USD',  -- 'USD' | 'MXN'
  precio_venta_local NUMERIC(12,2),
  tipo_cambio NUMERIC(10,4),

  -- ─── Auditoría ──────────────────────────────────────────────
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT,

  -- Unicidad: el mismo business_id no puede existir 2 veces en la misma empresa
  CONSTRAINT unique_boleto_per_empresa UNIQUE (empresa_id, business_id)
);

-- Índices para queries comunes
CREATE INDEX IF NOT EXISTS idx_boletos_cc_empresa
  ON boletos_caribe_cool(empresa_id);
CREATE INDEX IF NOT EXISTS idx_boletos_cc_fecha_venta
  ON boletos_caribe_cool(fecha_venta);
CREATE INDEX IF NOT EXISTS idx_boletos_cc_pnr
  ON boletos_caribe_cool(pnr);
CREATE INDEX IF NOT EXISTS idx_boletos_cc_estatus
  ON boletos_caribe_cool(estatus);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_boletos_cc_updated_at ON boletos_caribe_cool;
CREATE TRIGGER update_boletos_cc_updated_at
  BEFORE UPDATE ON boletos_caribe_cool
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS: allow_all (consistente con el resto del proyecto)
ALTER TABLE boletos_caribe_cool ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_boletos_cc ON boletos_caribe_cool;
CREATE POLICY allow_all_boletos_cc
  ON boletos_caribe_cool
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- ─── Tabla 2: movimientos_tesoreria_cc ───────────────────────────
-- Movimientos entre cajas: transferencias internas, recargas a Caribe Cool,
-- saldos iniciales, aumentos de saldo, etc.
CREATE TABLE IF NOT EXISTS movimientos_tesoreria_cc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id TEXT NOT NULL,

  fecha DATE NOT NULL,
  caja_origen TEXT NOT NULL,    -- id de caja (catálogo en código: 'caja_cuba', 'bnmx_usd', etc.)
  caja_destino TEXT NOT NULL,

  -- Monto en moneda origen
  monto NUMERIC(12,2) NOT NULL,
  moneda TEXT NOT NULL DEFAULT 'USD',

  -- Si hay cambio de moneda (ej: BNMX MN → Caja Cuba con TC)
  monto_destino NUMERIC(12,2),
  moneda_destino TEXT,
  tc NUMERIC(10,4),

  nota TEXT,

  -- ─── Auditoría ──────────────────────────────────────────────
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_movs_cc_empresa
  ON movimientos_tesoreria_cc(empresa_id);
CREATE INDEX IF NOT EXISTS idx_movs_cc_fecha
  ON movimientos_tesoreria_cc(fecha);
CREATE INDEX IF NOT EXISTS idx_movs_cc_caja_origen
  ON movimientos_tesoreria_cc(caja_origen);
CREATE INDEX IF NOT EXISTS idx_movs_cc_caja_destino
  ON movimientos_tesoreria_cc(caja_destino);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_movs_cc_updated_at ON movimientos_tesoreria_cc;
CREATE TRIGGER update_movs_cc_updated_at
  BEFORE UPDATE ON movimientos_tesoreria_cc
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS: allow_all
ALTER TABLE movimientos_tesoreria_cc ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_movs_cc ON movimientos_tesoreria_cc;
CREATE POLICY allow_all_movs_cc
  ON movimientos_tesoreria_cc
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════════
-- Verificación: listar las 2 tablas creadas
-- ═══════════════════════════════════════════════════════════════════
SELECT table_name,
       (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) AS columnas
  FROM information_schema.tables t
 WHERE table_name IN ('boletos_caribe_cool', 'movimientos_tesoreria_cc')
   AND table_schema = 'public';
