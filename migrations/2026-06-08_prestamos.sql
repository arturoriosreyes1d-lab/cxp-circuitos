-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Préstamos bancarios y sus movimientos
-- Crea 2 tablas: prestamos + prestamo_movimientos
-- Convención RLS: allow_all (consistente con resto del proyecto)
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Función helper (idempotente, ya puede existir de otras migrations)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─── Tabla 1: prestamos ──────────────────────────────────────────
-- Un registro por préstamo recibido. Por ahora un solo préstamo
-- por empresa, pero el diseño soporta múltiples a futuro.
CREATE TABLE IF NOT EXISTS prestamos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id TEXT NOT NULL,

  -- Datos básicos del préstamo
  banco TEXT NOT NULL,                      -- "BANAMEX"
  cuenta_id UUID,                           -- Referencia opcional a cuentas_bancarias.id
  numero_cuenta TEXT,                       -- Texto libre por si no se vincula a cuenta
  monto_autorizado NUMERIC(14,2) NOT NULL,  -- Editable (el "$2,900,000")
  moneda TEXT DEFAULT 'MXN',
  fecha_recepcion DATE,
  concepto TEXT,                            -- "Línea de capital de trabajo BNMX 2026"

  activo BOOLEAN DEFAULT true,

  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_prestamos_empresa ON prestamos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_prestamos_activo  ON prestamos(activo);

DROP TRIGGER IF EXISTS update_prestamos_updated_at ON prestamos;
CREATE TRIGGER update_prestamos_updated_at
  BEFORE UPDATE ON prestamos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE prestamos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_prestamos ON prestamos;
CREATE POLICY allow_all_prestamos ON prestamos FOR ALL USING (true) WITH CHECK (true);


-- ─── Tabla 2: prestamo_movimientos ───────────────────────────────
-- Historial de disposiciones y pagos. Permite reconstruir el saldo
-- utilizado en cualquier momento sumando los movimientos.
CREATE TABLE IF NOT EXISTS prestamo_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prestamo_id UUID NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
  empresa_id TEXT NOT NULL,

  fecha DATE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('disposicion', 'pago', 'inicial')),
  -- 'disposicion' = tomó dinero del préstamo (suma a utilizado)
  -- 'pago'        = devolvió dinero al préstamo (resta de utilizado)
  -- 'inicial'     = recepción inicial (informativo, no afecta utilizado)
  monto NUMERIC(14,2) NOT NULL,             -- siempre positivo
  concepto TEXT,

  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_prestamo_movs_prestamo ON prestamo_movimientos(prestamo_id);
CREATE INDEX IF NOT EXISTS idx_prestamo_movs_empresa  ON prestamo_movimientos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_prestamo_movs_fecha    ON prestamo_movimientos(fecha);

DROP TRIGGER IF EXISTS update_prestamo_movs_updated_at ON prestamo_movimientos;
CREATE TRIGGER update_prestamo_movs_updated_at
  BEFORE UPDATE ON prestamo_movimientos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE prestamo_movimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_prestamo_movs ON prestamo_movimientos;
CREATE POLICY allow_all_prestamo_movs ON prestamo_movimientos FOR ALL USING (true) WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════════
-- Verificación
-- ═══════════════════════════════════════════════════════════════════
SELECT table_name,
       (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) AS columnas
  FROM information_schema.tables t
 WHERE table_name IN ('prestamos', 'prestamo_movimientos')
   AND table_schema = 'public';
