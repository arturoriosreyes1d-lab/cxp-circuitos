-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Planes de Pago a proveedores
-- Crea 3 tablas: planes_pago + plan_facturas + plan_abonos
-- Todas con empresa_id para separación por empresa (TAS / Viajes Libero)
-- Convención RLS: allow_all (consistente con resto del proyecto)
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─── Tabla 1: planes_pago (cabecera del plan) ────────────────────
CREATE TABLE IF NOT EXISTS planes_pago (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id TEXT NOT NULL,

  proveedor TEXT NOT NULL,           -- texto, igual que en invoices.proveedor
  moneda TEXT NOT NULL DEFAULT 'MXN',-- USD / MXN / EUR (derivada de facturas)
  monto_total NUMERIC(14,2) NOT NULL DEFAULT 0,  -- suma de facturas (cache)

  -- Configuración del plan
  frecuencia TEXT NOT NULL CHECK (frecuencia IN ('semanal','quincenal','mensual','personalizado')),
  dia_semana SMALLINT,               -- 1=Lun, 2=Mar, ..., 7=Dom (para semanal/quincenal)
  dia_mes SMALLINT,                  -- 1-31 (para mensual)
  monto_abono NUMERIC(14,2) NOT NULL,
  num_abonos SMALLINT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_liquidacion_estimada DATE,

  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','liquidado','cancelado')),
  notas TEXT,

  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_planes_pago_empresa   ON planes_pago(empresa_id);
CREATE INDEX IF NOT EXISTS idx_planes_pago_estado    ON planes_pago(estado);
CREATE INDEX IF NOT EXISTS idx_planes_pago_proveedor ON planes_pago(proveedor);

DROP TRIGGER IF EXISTS update_planes_pago_updated_at ON planes_pago;
CREATE TRIGGER update_planes_pago_updated_at
  BEFORE UPDATE ON planes_pago
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE planes_pago ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_planes_pago ON planes_pago;
CREATE POLICY allow_all_planes_pago ON planes_pago FOR ALL USING (true) WITH CHECK (true);


-- ─── Tabla 2: plan_facturas (qué facturas cubre el plan) ─────────
-- Relación N-a-N entre planes_pago e invoices.
-- invoice_id es TEXT porque en la app las facturas usan ID compuesto.
CREATE TABLE IF NOT EXISTS plan_facturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES planes_pago(id) ON DELETE CASCADE,
  empresa_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,

  monto_inicial NUMERIC(14,2) NOT NULL,   -- saldo al momento de incluirla
  monto_aplicado NUMERIC(14,2) NOT NULL DEFAULT 0,  -- cuánto de los abonos se le ha aplicado

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_plan_facturas_plan    ON plan_facturas(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_facturas_empresa ON plan_facturas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_plan_facturas_invoice ON plan_facturas(invoice_id);

DROP TRIGGER IF EXISTS update_plan_facturas_updated_at ON plan_facturas;
CREATE TRIGGER update_plan_facturas_updated_at
  BEFORE UPDATE ON plan_facturas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE plan_facturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_plan_facturas ON plan_facturas;
CREATE POLICY allow_all_plan_facturas ON plan_facturas FOR ALL USING (true) WITH CHECK (true);


-- ─── Tabla 3: plan_abonos (cada cuota del plan) ──────────────────
CREATE TABLE IF NOT EXISTS plan_abonos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES planes_pago(id) ON DELETE CASCADE,
  empresa_id TEXT NOT NULL,
  numero SMALLINT NOT NULL,

  fecha_programada DATE NOT NULL,
  monto_programado NUMERIC(14,2) NOT NULL,

  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','pagado','atrasado','parcial')),
  pago_id TEXT,                       -- referencia al pago en CxP (opcional)
  factura_id_aplicada TEXT,           -- a qué factura del plan se aplicó
  fecha_pagado DATE,
  monto_pagado NUMERIC(14,2),

  notas TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_plan_abonos_plan       ON plan_abonos(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_abonos_empresa    ON plan_abonos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_plan_abonos_fecha      ON plan_abonos(fecha_programada);
CREATE INDEX IF NOT EXISTS idx_plan_abonos_estado     ON plan_abonos(estado);

DROP TRIGGER IF EXISTS update_plan_abonos_updated_at ON plan_abonos;
CREATE TRIGGER update_plan_abonos_updated_at
  BEFORE UPDATE ON plan_abonos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE plan_abonos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_plan_abonos ON plan_abonos;
CREATE POLICY allow_all_plan_abonos ON plan_abonos FOR ALL USING (true) WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
SELECT table_name,
       (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) AS columnas
  FROM information_schema.tables t
 WHERE table_name IN ('planes_pago','plan_facturas','plan_abonos')
   AND table_schema = 'public';
