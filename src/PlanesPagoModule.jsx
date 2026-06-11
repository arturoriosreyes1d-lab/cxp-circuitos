// ═══════════════════════════════════════════════════════════════════
// PlanesPagoModule — Módulo de planes de pago a proveedores
// ═══════════════════════════════════════════════════════════════════
//
// Vive bajo el módulo "Reportes" (se invoca desde ReportesView.jsx).
// Permite registrar planes de pago a proveedores y dar seguimiento
// a los abonos programados.
//
// Estructura:
//   • Header con KPIs (5 cards clickeables)
//   • Banner de alerta semanal (si hay abonos próximos)
//   • Tabs de filtro: Todos / Activos / Atrasados / Casi listos
//   • Tabla de planes activos
//   • Modales: nuevo plan (3 pasos), detalle de plan, popups de KPIs
//
// Cada empresa tiene SUS PROPIOS planes (filtrados por empresa_id).
// Match con CxP (banner al registrar pago) está en Fase B.
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import html2canvas from 'html2canvas';
import {
  fetchInvoices,
  fetchPlanesPago, upsertPlanPago, deletePlanPago, cancelarPlanPago,
  fetchFacturasDePlan, insertPlanFactura,
  fetchAbonosPorPlan, fetchAbonosPorEmpresa, upsertAbono, deleteAbono, bulkInsertAbonos,
  marcarAbonoPagado, desmarcarAbonoPagado, reagendarAbonosSiguientes,
  calcularRitmoSemanal,
} from './db.js';

// ─── Paleta y constantes ─────────────────────────────────────────
const C = {
  navy:   '#0F2D4A',
  blue:   '#1565C0',
  blueSoft: '#DBEAFE',
  blueText: '#1E40AF',
  green:  '#16A34A',
  greenSoft: '#D1FAE5',
  greenText: '#065F46',
  warn:   '#D97706',
  warnSoft: '#FEF3C7',
  warnText: '#92400E',
  red:    '#DC2626',
  redSoft: '#FEE2E2',
  redText: '#991B1B',
  muted:  '#64748B',
  slate:  '#475569',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  bgSoft: '#F8FAFC',
  text:   '#0F172A',
  white:  '#FFFFFF',
};

// MONO = fuente para números en la app — usa DM Sans (heredada del body) con tabular-nums
// para alineación vertical bonita sin necesidad de fuente monospace
const MONO = 'inherit';
// MONO_FORMAL = JetBrains Mono para la imagen exportada estilo "estado de cuenta"
const MONO_FORMAL = '"JetBrains Mono", "Cascadia Mono", "Consolas", "SF Mono", "Menlo", ui-monospace, monospace';
const INTER = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const DIAS_SEMANA = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const DIAS_SEMANA_LARGOS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

// ─── Helpers ─────────────────────────────────────────────────────
const fmt = (n) => {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(+n);
};
const fmt0 = (n) => {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(+n);
};
const today = () => new Date().toISOString().split('T')[0];
const parseDate = (s) => { if (!s) return null; return new Date(s + 'T12:00:00'); };
const fmtDateShort = (s) => {
  if (!s) return '';
  const d = parseDate(s);
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d.getDate().toString().padStart(2,'0')} ${meses[d.getMonth()]}`;
};
const fmtDateLabel = (s) => {
  if (!s) return '';
  const d = parseDate(s);
  return `${DIAS_SEMANA[(d.getDay() + 6) % 7]} ${fmtDateShort(s)}`;
};
const fmtDateFull = (s) => {
  if (!s) return '';
  const d = parseDate(s);
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
};
const diasEntre = (s1, s2) => {
  const d1 = parseDate(s1); const d2 = parseDate(s2);
  if (!d1 || !d2) return 0;
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
};
const sumarDias = (fechaStr, dias) => {
  const d = parseDate(fechaStr);
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
};

// Calcula la fecha del próximo "día de la semana" deseado a partir de una fecha
// dado dia 1=Lun..7=Dom; si fechaStr ya es ese día, la devuelve.
const ajustarADiaSemana = (fechaStr, diaDeseado) => {
  if (!diaDeseado) return fechaStr;
  const d = parseDate(fechaStr);
  const diaActual = ((d.getDay() + 6) % 7) + 1; // 1=Lun..7=Dom
  let delta = diaDeseado - diaActual;
  if (delta < 0) delta += 7;
  d.setDate(d.getDate() + delta);
  return d.toISOString().split('T')[0];
};

// Genera los abonos para un plan según su configuración
function generarAbonosDelPlan(config) {
  const { montoTotal, montoAbono, frecuencia, diaSemana, diaMes, fechaInicio } = config;
  if (!montoTotal || !montoAbono || montoAbono <= 0) return [];
  const numCompletos = Math.floor(montoTotal / montoAbono);
  const resto = +(montoTotal - numCompletos * montoAbono).toFixed(2);
  const abonos = [];
  let fechaActual = fechaInicio;
  if (frecuencia === 'semanal' || frecuencia === 'quincenal') {
    if (diaSemana) fechaActual = ajustarADiaSemana(fechaActual, diaSemana);
  }
  const intervaloDias = frecuencia === 'semanal' ? 7 : (frecuencia === 'quincenal' ? 14 : 0);

  for (let i = 0; i < numCompletos; i++) {
    abonos.push({ numero: i + 1, fechaProgramada: fechaActual, montoProgramado: montoAbono, estado: 'pendiente' });
    if (frecuencia === 'mensual') {
      const d = parseDate(fechaActual);
      d.setMonth(d.getMonth() + 1);
      if (diaMes) d.setDate(Math.min(diaMes, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      fechaActual = d.toISOString().split('T')[0];
    } else if (intervaloDias > 0) {
      fechaActual = sumarDias(fechaActual, intervaloDias);
    }
  }
  if (resto > 0.01) {
    abonos.push({ numero: numCompletos + 1, fechaProgramada: fechaActual, montoProgramado: resto, estado: 'pendiente' });
  }
  return abonos;
}

// Recalcula el estado de un abono ('pendiente' → 'atrasado' si la fecha pasó)
function estadoCalculado(abono, hoyStr) {
  if (abono.estado === 'pagado' || abono.estado === 'parcial') return abono.estado;
  if (abono.fechaProgramada < hoyStr) return 'atrasado';
  return 'pendiente';
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════
export default function PlanesPagoModule({ empresaId, user, esConsulta = false }) {
  const [planes, setPlanes] = useState([]);
  const [abonosPorPlan, setAbonosPorPlan] = useState({}); // {planId: [...]}
  const [facturasPorPlan, setFacturasPorPlan] = useState({}); // {planId: [...]}
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [showNuevoPlan, setShowNuevoPlan] = useState(false);
  const [showDetalle, setShowDetalle] = useState(null); // planId
  const [kpiAbierto, setKpiAbierto] = useState(null);   // 'activos' | 'comprometido' | 'ritmo' | 'proximo' | 'atrasados'
  const [alertaCerrada, setAlertaCerrada] = useState(false);
  const [sortBy, setSortBy] = useState('proximo'); // 'proveedor', 'facturas', 'total', 'pagado', 'restante', 'pct', 'proximo'
  const [sortDir, setSortDir] = useState('asc'); // 'asc' | 'desc'

  // Helper para cambiar el orden: si vuelves a clickear la misma columna, invierte; si es otra, default asc
  const toggleSort = (col) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const hoyStr = today();

  const recargar = useCallback(async () => {
    setLoading(true);
    const ps = await fetchPlanesPago(empresaId);
    setPlanes(ps);
    // Cargar abonos Y facturas de todos los planes en paralelo
    const [abonosEntries, facturasEntries] = await Promise.all([
      Promise.all(ps.map(async p => [p.id, await fetchAbonosPorPlan(p.id)])),
      Promise.all(ps.map(async p => [p.id, await fetchFacturasDePlan(p.id)])),
    ]);
    const mapAbonos = {};
    abonosEntries.forEach(([id, abonos]) => { mapAbonos[id] = abonos; });
    setAbonosPorPlan(mapAbonos);
    const mapFacturas = {};
    facturasEntries.forEach(([id, facturas]) => { mapFacturas[id] = facturas; });
    setFacturasPorPlan(mapFacturas);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { recargar(); }, [recargar]);

  // ─── Métricas derivadas ────────────────────────────────────────
  const planesActivos = useMemo(() => planes.filter(p => p.estado === 'activo'), [planes]);

  const planesConCalculo = useMemo(() => {
    return planes.map(p => {
      const abonos = abonosPorPlan[p.id] || [];
      const facturas = facturasPorPlan[p.id] || [];
      const pagado = abonos
        .filter(a => a.estado === 'pagado' || a.estado === 'parcial')
        .reduce((sum, a) => sum + (+a.montoPagado || +a.montoProgramado || 0), 0);
      const restante = Math.max(0, p.montoTotal - pagado);
      const pct = p.montoTotal > 0 ? Math.round((pagado / p.montoTotal) * 100) : 0;
      // Próximo abono pendiente
      const pendientes = abonos
        .filter(a => a.estado !== 'pagado' && a.estado !== 'parcial')
        .sort((x, y) => x.fechaProgramada.localeCompare(y.fechaProgramada));
      const proximo = pendientes[0] || null;
      const atrasados = abonos.filter(a => estadoCalculado(a, hoyStr) === 'atrasado').length;
      return { ...p, abonos, facturas, pagado, restante, pct, proximo, atrasados };
    });
  }, [planes, abonosPorPlan, facturasPorPlan, hoyStr]);

  // KPIs
  const kpis = useMemo(() => {
    const activos = planesConCalculo.filter(p => p.estado === 'activo');
    // Comprometido por moneda
    const comprometido = { USD: 0, MXN: 0, EUR: 0 };
    activos.forEach(p => {
      const m = p.moneda || 'MXN';
      if (comprometido[m] != null) comprometido[m] += p.restante;
    });
    // Ritmo semanal normalizado
    const ritmo = calcularRitmoSemanal(activos);
    // Próximo pago (más cercano)
    const proximos = activos
      .map(p => p.proximo)
      .filter(Boolean)
      .sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada));
    const proximo = proximos[0] || null;
    const proximosMismoDia = proximos.filter(p => p && proximo && p.fechaProgramada === proximo.fechaProgramada);
    // Atrasados (suma a través de todos los planes)
    const atrasadosCount = activos.reduce((sum, p) => sum + p.atrasados, 0);
    const atrasadosMontoPorMoneda = { USD: 0, MXN: 0, EUR: 0 };
    activos.forEach(p => {
      const m = p.moneda || 'MXN';
      p.abonos.filter(a => estadoCalculado(a, hoyStr) === 'atrasado').forEach(a => {
        if (atrasadosMontoPorMoneda[m] != null) atrasadosMontoPorMoneda[m] += +a.montoProgramado || 0;
      });
    });
    return {
      activosCount: activos.length,
      totalCount: planes.length,
      comprometido,
      ritmo,
      proximo,
      proximosMismoDia,
      atrasadosCount,
      atrasadosMontoPorMoneda,
    };
  }, [planesConCalculo, planes, hoyStr]);

  // Alerta semanal: abonos pendientes/atrasados en próximos 7 días
  const alertaSemanal = useMemo(() => {
    const hasta = sumarDias(hoyStr, 6);
    const items = [];
    const porMoneda = { USD: 0, MXN: 0, EUR: 0 };
    planesConCalculo.forEach(p => {
      if (p.estado !== 'activo') return;
      p.abonos.forEach(a => {
        if (a.estado === 'pagado' || a.estado === 'parcial') return;
        if (a.fechaProgramada >= hoyStr && a.fechaProgramada <= hasta) {
          const m = p.moneda || 'MXN';
          if (porMoneda[m] != null) porMoneda[m] += +a.montoProgramado || 0;
          items.push({ plan: p, abono: a });
        }
      });
    });
    return { count: items.length, porMoneda, items };
  }, [planesConCalculo, hoyStr]);

  // Lista filtrada Y ordenada para la tabla
  const planesFiltrados = useMemo(() => {
    let lista;
    if (filtroEstado === 'todos') lista = planesConCalculo;
    else if (filtroEstado === 'activos') lista = planesConCalculo.filter(p => p.estado === 'activo' && p.atrasados === 0 && p.pct < 75);
    else if (filtroEstado === 'atrasados') lista = planesConCalculo.filter(p => p.estado === 'activo' && p.atrasados > 0);
    else if (filtroEstado === 'casi') lista = planesConCalculo.filter(p => p.estado === 'activo' && p.pct >= 75);
    else lista = planesConCalculo;

    // Ordenar
    const dir = sortDir === 'asc' ? 1 : -1;
    const sorted = [...lista].sort((a, b) => {
      let va, vb;
      if (sortBy === 'proveedor') { va = (a.proveedor || '').toLowerCase(); vb = (b.proveedor || '').toLowerCase(); return va.localeCompare(vb) * dir; }
      if (sortBy === 'moneda')    { va = (a.moneda || '').toLowerCase(); vb = (b.moneda || '').toLowerCase(); return va.localeCompare(vb) * dir; }
      if (sortBy === 'facturas')  { va = (a.facturas || []).length; vb = (b.facturas || []).length; return (va - vb) * dir; }
      if (sortBy === 'total')     { va = +a.montoTotal || 0; vb = +b.montoTotal || 0; return (va - vb) * dir; }
      if (sortBy === 'pagado')    { va = +a.pagado || 0; vb = +b.pagado || 0; return (va - vb) * dir; }
      if (sortBy === 'restante')  { va = +a.restante || 0; vb = +b.restante || 0; return (va - vb) * dir; }
      if (sortBy === 'pct')       { va = +a.pct || 0; vb = +b.pct || 0; return (va - vb) * dir; }
      if (sortBy === 'proximo')   {
        // Los planes sin próximo van al final
        va = a.proximo?.fechaProgramada || '9999-99-99';
        vb = b.proximo?.fechaProgramada || '9999-99-99';
        return va.localeCompare(vb) * dir;
      }
      return 0;
    });
    return sorted;
  }, [planesConCalculo, filtroEstado, sortBy, sortDir]);

  const planSeleccionado = useMemo(() => {
    if (!showDetalle) return null;
    return planesConCalculo.find(p => p.id === showDetalle) || null;
  }, [showDetalle, planesConCalculo]);

  // ─── Render ────────────────────────────────────────────────────
  if (loading) {
    return <div style={{ fontFamily: INTER, padding: 24, color: C.muted }}>Cargando planes…</div>;
  }

  return (
    <div style={{
      fontFamily: INTER,
      fontSize: 14,
      WebkitFontSmoothing: 'antialiased',
      MozOsxFontSmoothing: 'grayscale',
      textRendering: 'optimizeLegibility',
    }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.navy }}>📅 Planes de pago</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>
            {planesActivos.length} {planesActivos.length === 1 ? 'plan activo' : 'planes activos'}
          </p>
        </div>
        {!esConsulta && (
          <button
            onClick={() => setShowNuevoPlan(true)}
            style={{
              background: C.navy, color: '#fff', border: 'none', padding: '9px 16px',
              borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >+ Nuevo plan</button>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        <KpiCard
          label="Activos" valueLine1={String(kpis.activosCount)}
          subline={`de ${kpis.totalCount} totales`}
          onClick={() => setKpiAbierto('activos')}
        />
        <KpiCard
          label="Comprometido"
          monedas={[
            ...(kpis.comprometido.USD > 0 ? [{ codigo: 'USD', monto: kpis.comprometido.USD }] : []),
            ...(kpis.comprometido.MXN > 0 ? [{ codigo: 'MXN', monto: kpis.comprometido.MXN }] : []),
            ...(kpis.comprometido.EUR > 0 ? [{ codigo: 'EUR', monto: kpis.comprometido.EUR }] : []),
          ]}
          valueLine1={
            // Fallback: si no hay ninguna moneda, mostrar 0 USD
            (kpis.comprometido.USD === 0 && kpis.comprometido.MXN === 0 && kpis.comprometido.EUR === 0)
              ? `$0.00 USD` : ''
          }
          mono
          onClick={() => setKpiAbierto('comprometido')}
        />
        <KpiCard
          label="Pago semanal"
          monedas={[
            ...(kpis.ritmo.totales.USD > 0 ? [{ codigo: 'USD', monto: kpis.ritmo.totales.USD }] : []),
            ...(kpis.ritmo.totales.MXN > 0 ? [{ codigo: 'MXN', monto: kpis.ritmo.totales.MXN }] : []),
            ...(kpis.ritmo.totales.EUR > 0 ? [{ codigo: 'EUR', monto: kpis.ritmo.totales.EUR }] : []),
          ]}
          valueLine1={
            (kpis.ritmo.totales.USD === 0 && kpis.ritmo.totales.MXN === 0 && kpis.ritmo.totales.EUR === 0)
              ? `$0.00 USD` : ''
          }
          mono accent
          onClick={() => setKpiAbierto('ritmo')}
        />
        <KpiCard
          label="Próximo pago"
          valueLine1={kpis.proximo ? fmtDateLabel(kpis.proximo.fechaProgramada) : 'Sin programados'}
          subline={kpis.proximo ? `en ${Math.max(0, diasEntre(hoyStr, kpis.proximo.fechaProgramada))} días · ${kpis.proximosMismoDia.length} abono(s)` : null}
          onClick={() => setKpiAbierto('proximo')}
        />
        <KpiCard
          label="Atrasados" valueLine1={String(kpis.atrasadosCount)}
          subline={kpis.atrasadosMontoPorMoneda.USD > 0 ? `$${fmt(kpis.atrasadosMontoPorMoneda.USD)} USD` :
                   kpis.atrasadosMontoPorMoneda.MXN > 0 ? `$${fmt(kpis.atrasadosMontoPorMoneda.MXN)} MXN` : null}
          warning={kpis.atrasadosCount > 0}
          onClick={() => setKpiAbierto('atrasados')}
        />
      </div>

      {/* ALERTA SEMANAL */}
      {alertaSemanal.count > 0 && !alertaCerrada && (
        <div style={{
          background: C.warnSoft, border: `1px solid ${C.warn}`, borderRadius: 8,
          padding: '10px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ fontSize: 13, color: C.warnText }}>
            <strong>Esta semana:</strong> vencen {alertaSemanal.count} abono(s){' '}
            {alertaSemanal.porMoneda.USD > 0 && <>· <strong>${fmt(alertaSemanal.porMoneda.USD)} USD</strong></>}
            {alertaSemanal.porMoneda.MXN > 0 && <>· <strong>${fmt(alertaSemanal.porMoneda.MXN)} MXN</strong></>}
            {alertaSemanal.porMoneda.EUR > 0 && <>· <strong>${fmt(alertaSemanal.porMoneda.EUR)} EUR</strong></>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setKpiAbierto('proximo')}
              style={{ background: '#fff', border: `1px solid ${C.warn}`, color: C.warnText, padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Ver detalle</button>
            <button onClick={() => setAlertaCerrada(true)} aria-label="Cerrar"
              style={{ background: 'transparent', border: 'none', color: C.warnText, padding: '4px 8px', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>×</button>
          </div>
        </div>
      )}

      {/* TABLA con tabs de filtro */}
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: `1px solid ${C.border}`, background: C.bgSoft }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { id: 'todos', label: `Todos (${planesConCalculo.length})` },
              { id: 'activos', label: `Activos (${planesConCalculo.filter(p => p.estado === 'activo' && p.atrasados === 0 && p.pct < 75).length})` },
              { id: 'atrasados', label: `Atrasados (${planesConCalculo.filter(p => p.estado === 'activo' && p.atrasados > 0).length})` },
              { id: 'casi', label: `Casi listos (${planesConCalculo.filter(p => p.estado === 'activo' && p.pct >= 75).length})` },
            ].map(t => (
              <button key={t.id} onClick={() => setFiltroEstado(t.id)}
                style={{
                  background: filtroEstado === t.id ? '#fff' : 'transparent',
                  border: filtroEstado === t.id ? `1px solid ${C.borderStrong}` : '1px solid transparent',
                  padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: filtroEstado === t.id ? 700 : 500,
                  color: filtroEstado === t.id ? C.text : C.muted, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >{t.label}</button>
            ))}
          </div>
        </div>

        {planesFiltrados.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 13 }}>
              {planes.length === 0 ? 'Sin planes registrados todavía.' : 'No hay planes con este filtro.'}
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <Th sortKey="proveedor" currentSort={sortBy} currentDir={sortDir} onSort={toggleSort}>Proveedor · Config</Th>
                <Th center sortKey="moneda" currentSort={sortBy} currentDir={sortDir} onSort={toggleSort}>Moneda</Th>
                <Th center sortKey="facturas" currentSort={sortBy} currentDir={sortDir} onSort={toggleSort}>Fact.</Th>
                <Th center sortKey="total" currentSort={sortBy} currentDir={sortDir} onSort={toggleSort}>Total</Th>
                <Th center sortKey="pagado" currentSort={sortBy} currentDir={sortDir} onSort={toggleSort}>Pagado</Th>
                <Th center sortKey="restante" currentSort={sortBy} currentDir={sortDir} onSort={toggleSort}>Restante</Th>
                <Th center sortKey="pct" currentSort={sortBy} currentDir={sortDir} onSort={toggleSort}>Avance</Th>
                <Th center sortKey="proximo" currentSort={sortBy} currentDir={sortDir} onSort={toggleSort}>Próximo</Th>
                <Th center>Estado</Th>
                <th style={{ width: 26 }}></th>
              </tr>
            </thead>
            <tbody>
              {planesFiltrados.map(p => (
                <PlanRow key={p.id} plan={p} hoyStr={hoyStr} onClick={() => setShowDetalle(p.id)} />
              ))}
            </tbody>
          </table>
        )}

        <div style={{ padding: '8px 14px', background: C.bgSoft, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.muted, display: 'flex', justifyContent: 'space-between' }}>
          <div>Mostrando {planesFiltrados.length} de {planesConCalculo.length}</div>
          <div>Click en una fila para ver el detalle</div>
        </div>
      </div>

      {/* MODALES */}
      {showNuevoPlan && (
        <NuevoPlanModal
          empresaId={empresaId}
          user={user}
          planesExistentes={planes}
          onClose={() => setShowNuevoPlan(false)}
          onCreated={async () => { setShowNuevoPlan(false); await recargar(); }}
        />
      )}

      {planSeleccionado && (
        <DetallePlanModal
          plan={planSeleccionado}
          user={user}
          esConsulta={esConsulta}
          onClose={() => setShowDetalle(null)}
          onAccion={async () => { await recargar(); }}
        />
      )}

      {kpiAbierto === 'activos' && <PopupActivos planes={planesConCalculo} onClose={() => setKpiAbierto(null)} onAbrirPlan={(id) => { setKpiAbierto(null); setShowDetalle(id); }} />}
      {kpiAbierto === 'comprometido' && <PopupComprometido planes={planesConCalculo} onClose={() => setKpiAbierto(null)} onAbrirPlan={(id) => { setKpiAbierto(null); setShowDetalle(id); }} />}
      {kpiAbierto === 'ritmo' && <PopupRitmo ritmo={kpis.ritmo} onClose={() => setKpiAbierto(null)} />}
      {kpiAbierto === 'proximo' && <PopupProximos planes={planesConCalculo} hoyStr={hoyStr} onClose={() => setKpiAbierto(null)} onAbrirPlan={(id) => { setKpiAbierto(null); setShowDetalle(id); }} />}
      {kpiAbierto === 'atrasados' && <PopupAtrasados planes={planesConCalculo} hoyStr={hoyStr} onClose={() => setKpiAbierto(null)} onAbrirPlan={(id) => { setKpiAbierto(null); setShowDetalle(id); }} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sub-componentes
// ═══════════════════════════════════════════════════════════════════

function KpiCard({ label, valueLine1, subline, monedas, mono, accent, warning, onClick }) {
  const bg = accent ? C.blueSoft : (warning ? C.warnSoft : '#fff');
  const borderColor = accent ? C.blue : (warning ? C.warn : C.border);
  const labelColor = accent ? C.blueText : (warning ? C.warnText : C.muted);
  const tieneMonedas = Array.isArray(monedas) && monedas.length > 0;
  // Para mini-cards: si hay 2 monedas usa grid 2 cols, si 3 usa grid 3 cols, si 1 usa formato simple
  const colsGrid = tieneMonedas ? Math.min(monedas.length, 3) : 1;
  // Color del valor numérico dentro de cada mini-card (depende de si KPI es accent o no)
  const miniValueColor = accent ? '#1E40AF' : C.text;
  return (
    <button onClick={onClick} style={{
      all: 'unset',
      cursor: 'pointer',
      background: bg,
      border: `${accent ? '1.5' : '1'}px solid ${borderColor}`,
      borderRadius: 10,
      padding: '16px 18px',
      display: 'block',
      transition: 'transform 0.1s, box-shadow 0.15s',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.06)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: tieneMonedas ? 12 : 0 }}>
        <div style={{ fontSize: 12, color: labelColor, letterSpacing: 0.5, fontWeight: accent ? 700 : 600, textTransform: 'uppercase' }}>{label}</div>
        <span style={{ fontSize: 12, color: labelColor, opacity: 0.7 }}>↗</span>
      </div>
      {tieneMonedas ? (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colsGrid}, 1fr)`, gap: 10 }}>
          {monedas.map((m, i) => {
            // Mini-card con color por moneda (variante B medio)
            const codeColor = m.codigo === 'USD' ? '#065F46' : m.codigo === 'MXN' ? '#991B1B' : m.codigo === 'EUR' ? '#1E40AF' : C.muted;
            const codeBg = m.codigo === 'USD' ? '#D1FAE5' : m.codigo === 'MXN' ? '#FEE2E2' : m.codigo === 'EUR' ? '#DBEAFE' : C.bgSoft;
            return (
              <div key={i} style={{
                background: accent ? '#FFFFFF' : C.bgSoft,
                border: `1px solid ${accent ? '#DBEAFE' : 'transparent'}`,
                borderRadius: 8,
                padding: '10px 12px',
                textAlign: 'center',
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                  color: codeColor, background: codeBg,
                  display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                }}>{m.codigo}</div>
                <div style={{
                  fontSize: monedas.length >= 3 ? 14 : 18,
                  fontWeight: 700,
                  fontFamily: MONO,
                  fontVariantNumeric: 'tabular-nums',
                  color: miniValueColor,
                  marginTop: 6,
                  lineHeight: 1.1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>${fmt(m.monto)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div style={{
            fontSize: valueLine1.length > 12 ? 18 : 28,
            fontWeight: 700, marginTop: 10,
            fontFamily: mono ? MONO : 'inherit',
            fontVariantNumeric: 'tabular-nums',
            color: warning ? C.warnText : (accent ? C.blueText : C.text),
            lineHeight: 1.1,
          }}>{valueLine1}</div>
          {subline && <div style={{ fontSize: 12, color: labelColor, marginTop: 4, fontFamily: mono ? MONO : 'inherit', fontVariantNumeric: 'tabular-nums' }}>{subline}</div>}
        </>
      )}
    </button>
  );
}

function Th({ children, right, center, sortKey, currentSort, currentDir, onSort }) {
  const isActive = sortKey && currentSort === sortKey;
  const isClickable = !!sortKey;
  return (
    <th
      onClick={isClickable ? () => onSort(sortKey) : undefined}
      style={{
        textAlign: right ? 'right' : (center ? 'center' : 'left'),
        padding: '10px 14px', fontWeight: 600,
        color: isActive ? C.text : C.muted, fontSize: 11, letterSpacing: 0.5,
        textTransform: 'uppercase',
        cursor: isClickable ? 'pointer' : 'default',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}>
      {children}
      {isActive && (
        <span style={{ marginLeft: 4, fontSize: 10, color: C.blue }}>
          {currentDir === 'asc' ? '↑' : '↓'}
        </span>
      )}
      {isClickable && !isActive && (
        <span style={{ marginLeft: 4, fontSize: 10, color: C.border, opacity: 0.6 }}>↕</span>
      )}
    </th>
  );
}

function PlanRow({ plan, hoyStr, onClick }) {
  const isAtrasado = plan.atrasados > 0;
  const isCasiListo = plan.pct >= 75 && plan.estado === 'activo';
  const barColor = isAtrasado ? C.warn : (isCasiListo ? C.green : C.blue);
  const bgFila = isAtrasado ? C.warnSoft : 'transparent';
  // Color sutil del badge de moneda según código
  // Variante B (medio): fondos más saturados pero no agresivos
  // USD: verde · MXN: rojo · EUR: azul
  const bgMoneda = plan.moneda === 'USD' ? '#D1FAE5' : plan.moneda === 'MXN' ? '#FEE2E2' : '#DBEAFE';
  const colorMoneda = plan.moneda === 'USD' ? '#065F46' : plan.moneda === 'MXN' ? '#991B1B' : '#1E40AF';
  return (
    <tr onClick={onClick} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer', background: bgFila }}>
      <td style={{ padding: '11px 14px' }}>
        <div style={{ fontWeight: 600, color: C.text }}>{plan.proveedor}</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
          {plan.frecuencia === 'semanal' && plan.diaSemana && `Semanal · ${DIAS_SEMANA_LARGOS[plan.diaSemana - 1]?.toLowerCase()}`}
          {plan.frecuencia === 'quincenal' && plan.diaSemana && `Quincenal · ${DIAS_SEMANA_LARGOS[plan.diaSemana - 1]?.toLowerCase()}`}
          {plan.frecuencia === 'mensual' && plan.diaMes && `Mensual · día ${plan.diaMes}`}
          {plan.frecuencia === 'personalizado' && 'Personalizado'}
        </div>
      </td>
      <td style={{ textAlign: 'center', padding: '11px 8px' }}>
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: 4,
          background: bgMoneda, color: colorMoneda,
          fontSize: 11, fontWeight: 700, fontFamily: MONO, letterSpacing: 0.5,
        }}>{plan.moneda}</span>
      </td>
      <td style={{ textAlign: 'center', padding: '11px 8px', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{(plan.facturas || []).length || '—'}</td>
      <td style={{ textAlign: 'center', padding: '11px 8px', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>${fmt(plan.montoTotal)}</td>
      <td style={{ textAlign: 'center', padding: '11px 8px', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', color: plan.pagado > 0 ? C.green : C.muted }}>${fmt(plan.pagado)}</td>
      <td style={{ textAlign: 'center', padding: '11px 8px', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>${fmt(plan.restante)}</td>
      <td style={{ padding: '11px 14px', minWidth: 140 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 5, background: C.bgSoft, borderRadius: 999, overflow: 'hidden', minWidth: 50 }}>
            <div style={{ width: `${Math.min(100, plan.pct)}%`, height: '100%', background: barColor, transition: 'width 0.3s' }}/>
          </div>
          <span style={{ fontSize: 12, color: isCasiListo ? C.green : (isAtrasado ? C.warnText : C.muted), fontFamily: MONO, fontVariantNumeric: 'tabular-nums', minWidth: 30, textAlign: 'right', fontWeight: isCasiListo ? 700 : 500 }}>{plan.pct}%</span>
        </div>
      </td>
      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
        {plan.proximo ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 500, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{fmtDateLabel(plan.proximo.fechaProgramada)}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 1, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
              {(() => {
                const dias = diasEntre(hoyStr, plan.proximo.fechaProgramada);
                if (dias < 0) return <span style={{ color: C.warnText }}>{Math.abs(dias)} días vencido</span>;
                if (dias === 0) return 'hoy';
                return `en ${dias} días · $${fmt(plan.proximo.montoProgramado)}`;
              })()}
            </div>
          </>
        ) : <span style={{ fontSize: 12, color: C.muted }}>—</span>}
      </td>
      <td style={{ textAlign: 'center', padding: '11px 14px' }}>
        {plan.estado === 'liquidado' ? <Badge bg={C.greenSoft} color={C.greenText}>Liquidado</Badge> :
         plan.estado === 'cancelado' ? <Badge bg="#F3F4F6" color={C.muted}>Cancelado</Badge> :
         isAtrasado ? <Badge bg={C.warn} color="#fff">Atrasado</Badge> :
         isCasiListo ? <Badge bg={C.greenSoft} color={C.greenText}>Casi listo</Badge> :
         <Badge bg={C.blueSoft} color={C.blueText}>Activo</Badge>}
      </td>
      <td style={{ textAlign: 'center', color: C.muted }}>›</td>
    </tr>
  );
}

function Badge({ children, bg, color }) {
  return <span style={{ padding: '3px 9px', background: bg, color, borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>{children}</span>;
}

// ═══════════════════════════════════════════════════════════════════
// MODAL: Nuevo Plan (3 pasos)
// ═══════════════════════════════════════════════════════════════════
function NuevoPlanModal({ empresaId, user, planesExistentes, onClose, onCreated }) {
  const [paso, setPaso] = useState(1);
  const [loadingFacturas, setLoadingFacturas] = useState(false);
  const [todasFacturas, setTodasFacturas] = useState({ MXN: [], USD: [], EUR: [] });
  // Paso 1: proveedor seleccionado
  const [proveedorSel, setProveedorSel] = useState(null);
  const [search, setSearch] = useState('');
  // Paso 2: facturas
  const [facturasSeleccionadas, setFacturasSeleccionadas] = useState(new Set());
  // Paso 3: configuración
  const [frecuencia, setFrecuencia] = useState('semanal');
  const [diaSemana, setDiaSemana] = useState(5); // viernes default
  const [diaMes, setDiaMes] = useState(1);
  const [fechaInicio, setFechaInicio] = useState(today());
  const [montoAbono, setMontoAbono] = useState('');
  // Paso 3 personalizado: array de {fechaProgramada, montoProgramado, concepto}
  const [abonosPersonalizados, setAbonosPersonalizados] = useState([]);
  const [guardando, setGuardando] = useState(false);

  // Helpers para editar abonos personalizados
  const agregarAbonoPersonalizado = () => {
    // Sugerir fecha: si hay abonos previos, +15 días desde el último; si no, fechaInicio
    let nuevaFecha = fechaInicio;
    if (abonosPersonalizados.length > 0) {
      const ultimo = abonosPersonalizados[abonosPersonalizados.length - 1];
      const d = new Date(ultimo.fechaProgramada + 'T12:00:00');
      d.setDate(d.getDate() + 15);
      nuevaFecha = d.toISOString().split('T')[0];
    }
    // Sugerir monto: lo que falta para alcanzar el total
    const sumaActual = abonosPersonalizados.reduce((s, a) => s + (+a.montoProgramado || 0), 0);
    const falta = Math.max(0, montoTotalSeleccionado - sumaActual);
    setAbonosPersonalizados([...abonosPersonalizados, {
      fechaProgramada: nuevaFecha,
      montoProgramado: falta > 0 ? String(falta) : '',
      concepto: '',
    }]);
  };
  const eliminarAbonoPersonalizado = (idx) => {
    setAbonosPersonalizados(abonosPersonalizados.filter((_, i) => i !== idx));
  };
  const editarAbonoPersonalizado = (idx, campo, valor) => {
    setAbonosPersonalizados(abonosPersonalizados.map((a, i) => i === idx ? { ...a, [campo]: valor } : a));
  };

  // Suma de abonos personalizados (para validar)
  const sumaPersonalizados = useMemo(() => {
    return abonosPersonalizados.reduce((s, a) => s + (parseFloat(a.montoProgramado) || 0), 0);
  }, [abonosPersonalizados]);
  const diferenciaPersonalizados = useMemo(() => {
    return montoTotalSeleccionado - sumaPersonalizados;
  }, [montoTotalSeleccionado, sumaPersonalizados]);
  const personalizadoValido = useMemo(() => {
    if (abonosPersonalizados.length === 0) return false;
    if (Math.abs(diferenciaPersonalizados) > 0.01) return false;
    // Todas las filas deben tener fecha y monto > 0
    return abonosPersonalizados.every(a => a.fechaProgramada && parseFloat(a.montoProgramado) > 0);
  }, [abonosPersonalizados, diferenciaPersonalizados]);

  // Cargar facturas de la empresa al abrir modal
  useEffect(() => {
    (async () => {
      setLoadingFacturas(true);
      try {
        // fetchInvoices ya devuelve agrupado por moneda: {MXN: [], USD: [], EUR: []}
        const grouped = await fetchInvoices(empresaId);
        setTodasFacturas(grouped || { MXN: [], USD: [], EUR: [] });
      } catch (e) {
        console.error('Cargando facturas:', e);
      } finally {
        setLoadingFacturas(false);
      }
    })();
  }, [empresaId]);

  // Agrupación: proveedores con facturas activas + saldo
  const proveedoresConFacturas = useMemo(() => {
    const map = {};
    ['MXN', 'USD', 'EUR'].forEach(mon => {
      (todasFacturas[mon] || []).forEach(inv => {
        const saldo = (+inv.total || 0) - (+inv.montoPagado || 0);
        if (saldo <= 0.01) return; // solo pendientes
        if (inv.estatus === 'Pagada') return;
        const key = inv.proveedor || '(sin proveedor)';
        if (!map[key]) map[key] = { proveedor: key, facturas: [], totalPorMoneda: { MXN: 0, USD: 0, EUR: 0 } };
        map[key].facturas.push({ ...inv, moneda: mon, saldo });
        map[key].totalPorMoneda[mon] += saldo;
      });
    });
    let lista = Object.values(map);
    if (search.trim()) {
      const q = search.toLowerCase();
      lista = lista.filter(p => p.proveedor.toLowerCase().includes(q));
    }
    // Ordenar por saldo total descendente (suma de todas las monedas, USD-equivalent simplificado)
    lista.sort((a, b) => {
      const sa = a.totalPorMoneda.USD * 18 + a.totalPorMoneda.MXN + a.totalPorMoneda.EUR * 19;
      const sb = b.totalPorMoneda.USD * 18 + b.totalPorMoneda.MXN + b.totalPorMoneda.EUR * 19;
      return sb - sa;
    });
    return lista;
  }, [todasFacturas, search]);

  const facturasDelProveedor = useMemo(() => {
    if (!proveedorSel) return [];
    return proveedorSel.facturas;
  }, [proveedorSel]);

  // Validación de moneda al seleccionar
  const monedasSeleccionadas = useMemo(() => {
    const set = new Set();
    facturasDelProveedor.forEach(f => { if (facturasSeleccionadas.has(f.id)) set.add(f.moneda); });
    return [...set];
  }, [facturasDelProveedor, facturasSeleccionadas]);

  const montoTotalSeleccionado = useMemo(() => {
    return facturasDelProveedor
      .filter(f => facturasSeleccionadas.has(f.id))
      .reduce((sum, f) => sum + f.saldo, 0);
  }, [facturasDelProveedor, facturasSeleccionadas]);

  const monedaPlan = monedasSeleccionadas[0] || null;
  const monedaInvalida = monedasSeleccionadas.length > 1;

  // Preview de abonos
  const abonosPreview = useMemo(() => {
    if (paso !== 3) return [];
    const monto = parseFloat(montoAbono) || 0;
    if (monto <= 0 || montoTotalSeleccionado <= 0) return [];
    return generarAbonosDelPlan({
      montoTotal: montoTotalSeleccionado,
      montoAbono: monto,
      frecuencia,
      diaSemana: (frecuencia === 'semanal' || frecuencia === 'quincenal') ? diaSemana : null,
      diaMes: frecuencia === 'mensual' ? diaMes : null,
      fechaInicio,
    });
  }, [paso, montoAbono, montoTotalSeleccionado, frecuencia, diaSemana, diaMes, fechaInicio]);

  const fechaLiquidacionEstimada = useMemo(() => {
    if (abonosPreview.length === 0) return null;
    return abonosPreview[abonosPreview.length - 1].fechaProgramada;
  }, [abonosPreview]);

  const handleCrear = async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      // Decidir el set final de abonos según el modo
      const esPersonalizado = frecuencia === 'personalizado';
      const abonosOrdenados = esPersonalizado
        // Ordenamos por fecha y asignamos numero correlativo
        ? [...abonosPersonalizados]
            .map(a => ({ fechaProgramada: a.fechaProgramada, montoProgramado: parseFloat(a.montoProgramado), notas: a.concepto || null }))
            .sort((a, b) => a.fechaProgramada.localeCompare(b.fechaProgramada))
            .map((a, i) => ({ ...a, numero: i + 1 }))
        : abonosPreview;
      const numAbonos = abonosOrdenados.length;
      const fechaInicioFinal = esPersonalizado ? abonosOrdenados[0]?.fechaProgramada : fechaInicio;
      const fechaLiquidacionFinal = esPersonalizado ? abonosOrdenados[numAbonos - 1]?.fechaProgramada : fechaLiquidacionEstimada;
      // Para personalizado, montoAbono no aplica realmente; guardamos el del primer abono como referencia
      const montoAbonoFinal = esPersonalizado ? (abonosOrdenados[0]?.montoProgramado || 0) : parseFloat(montoAbono);

      const planId = await upsertPlanPago({
        empresaId,
        proveedor: proveedorSel.proveedor,
        moneda: monedaPlan,
        montoTotal: montoTotalSeleccionado,
        frecuencia,
        diaSemana: (frecuencia === 'semanal' || frecuencia === 'quincenal') ? diaSemana : null,
        diaMes: frecuencia === 'mensual' ? diaMes : null,
        montoAbono: montoAbonoFinal,
        numAbonos,
        fechaInicio: fechaInicioFinal,
        fechaLiquidacionEstimada: fechaLiquidacionFinal,
        estado: 'activo',
      }, user?.nombre);
      if (!planId) throw new Error('No se pudo crear el plan');

      // Insertar facturas
      const facturasParaInsertar = facturasDelProveedor.filter(f => facturasSeleccionadas.has(f.id));
      for (const f of facturasParaInsertar) {
        await insertPlanFactura({
          planId, empresaId, invoiceId: String(f.id),
          montoInicial: f.saldo, montoAplicado: 0,
        }, user?.nombre);
      }

      // Bulk insert abonos
      const abonosFinal = abonosOrdenados.map(a => ({
        planId, empresaId,
        numero: a.numero,
        fechaProgramada: a.fechaProgramada,
        montoProgramado: a.montoProgramado,
        estado: 'pendiente',
        notas: a.notas || null,
      }));
      await bulkInsertAbonos(abonosFinal, user?.nombre);

      await onCreated();
    } catch (err) {
      console.error('Crear plan:', err);
      alert('No se pudo crear el plan. Revisa la consola.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ModalShell onClose={onClose} maxWidth={680}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 0.5, fontWeight: 700 }}>PASO {paso} DE 3</div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: '4px 0 0' }}>
            {paso === 1 ? 'Selecciona el proveedor' : paso === 2 ? 'Facturas a incluir' : 'Configurar los abonos'}
          </h3>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
      </div>

      {paso === 1 && (
        <>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar proveedor…"
            style={{ width: '100%', border: `1px solid ${C.border}`, padding: '8px 10px', borderRadius: 6, fontSize: 13, marginBottom: 10, fontFamily: 'inherit' }}
          />
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 0.4, marginBottom: 6, fontWeight: 600 }}>CON FACTURAS PENDIENTES</div>
          {loadingFacturas ? (
            <div style={{ padding: 30, textAlign: 'center', color: C.muted, fontSize: 13 }}>Cargando facturas…</div>
          ) : proveedoresConFacturas.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: C.muted, fontSize: 13 }}>No hay proveedores con facturas pendientes.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
              {proveedoresConFacturas.map(p => {
                const sel = proveedorSel?.proveedor === p.proveedor;
                return (
                  <button key={p.proveedor} onClick={() => { setProveedorSel(p); setFacturasSeleccionadas(new Set()); }}
                    style={{
                      all: 'unset', cursor: 'pointer',
                      padding: '10px 12px',
                      background: sel ? C.blueSoft : C.bgSoft,
                      border: sel ? `1px solid ${C.blue}` : `1px solid transparent`,
                      borderRadius: 6, display: 'block',
                    }}>
                    <div style={{ fontSize: 13, fontWeight: sel ? 700 : 500, color: sel ? C.blueText : C.text }}>{p.proveedor}</div>
                    <div style={{ fontSize: 11, color: sel ? C.blueText : C.muted, opacity: 0.85, marginTop: 2 }}>
                      {p.facturas.length} facturas
                      {p.totalPorMoneda.USD > 0 && ` · $${fmt(p.totalPorMoneda.USD)} USD`}
                      {p.totalPorMoneda.MXN > 0 && ` · $${fmt(p.totalPorMoneda.MXN)} MXN`}
                      {p.totalPorMoneda.EUR > 0 && ` · $${fmt(p.totalPorMoneda.EUR)} EUR`}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <ModalFooter
            leftBtn={<button onClick={onClose} style={btnStyle()}>Cancelar</button>}
            rightBtn={
              <button disabled={!proveedorSel} onClick={() => setPaso(2)} style={btnStyle(!!proveedorSel ? 'primary' : 'disabled')}>
                Siguiente →
              </button>
            }
          />
        </>
      )}

      {paso === 2 && proveedorSel && (
        <>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>{proveedorSel.proveedor} · selecciona cuáles cubrirá el plan</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {facturasDelProveedor.map(f => {
              const sel = facturasSeleccionadas.has(f.id);
              return (
                <label key={f.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px',
                  background: sel ? C.blueSoft : C.bgSoft,
                  border: sel ? `1px solid ${C.blue}` : `1px solid transparent`,
                  borderRadius: 6, cursor: 'pointer',
                }}>
                  <input type="checkbox" checked={sel} onChange={() => {
                    const ns = new Set(facturasSeleccionadas);
                    if (sel) ns.delete(f.id); else ns.add(f.id);
                    setFacturasSeleccionadas(ns);
                  }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{f.folio || f.uuid?.slice(0, 8) || f.id?.slice(0, 8)}</span>
                      <span style={{ fontSize: 12, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{f.moneda} ${fmt(f.saldo)}</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                      {f.concepto || f.clasificacion || '—'} {f.fecha && `· ${fmtDateShort(f.fecha)}`}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {monedaInvalida && (
            <div style={{ background: C.redSoft, border: `1px solid ${C.red}`, borderRadius: 6, padding: '8px 10px', marginTop: 10, fontSize: 11, color: C.redText }}>
              ⚠ Las facturas deben ser de la misma moneda. Tienes: {monedasSeleccionadas.join(' + ')}.
            </div>
          )}

          <div style={{ marginTop: 12, padding: '10px 12px', background: C.bgSoft, borderRadius: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted }}>
              <span>Seleccionadas</span><span style={{ fontWeight: 700, color: C.text }}>{facturasSeleccionadas.size} factura(s)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
              <span style={{ fontWeight: 700 }}>Total del plan</span>
              <span style={{ fontWeight: 700, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>${fmt(montoTotalSeleccionado)} {monedaPlan || ''}</span>
            </div>
          </div>

          <ModalFooter
            leftBtn={<button onClick={() => setPaso(1)} style={btnStyle()}>← Atrás</button>}
            rightBtn={
              <button
                disabled={facturasSeleccionadas.size === 0 || monedaInvalida}
                onClick={() => setPaso(3)}
                style={btnStyle((facturasSeleccionadas.size > 0 && !monedaInvalida) ? 'primary' : 'disabled')}
              >Siguiente →</button>
            }
          />
        </>
      )}

      {paso === 3 && (
        <>
          <div style={{ padding: '8px 12px', background: C.bgSoft, borderRadius: 6, marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: C.muted }}>Total a programar</span>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>${fmt(montoTotalSeleccionado)} {monedaPlan}</span>
          </div>

          <div style={{ marginBottom: 10 }}>
            <Label>Frecuencia</Label>
            <select value={frecuencia} onChange={e => {
              const nuevo = e.target.value;
              setFrecuencia(nuevo);
              // Si cambia A personalizado y la lista está vacía, sembrar con un abono inicial sugerido
              if (nuevo === 'personalizado' && abonosPersonalizados.length === 0 && montoTotalSeleccionado > 0) {
                setAbonosPersonalizados([{
                  fechaProgramada: fechaInicio,
                  montoProgramado: String(montoTotalSeleccionado),
                  concepto: '',
                }]);
              }
            }} style={selectStyle()}>
              <option value="semanal">Semanal</option>
              <option value="quincenal">Quincenal</option>
              <option value="mensual">Mensual</option>
              <option value="personalizado">Personalizada (fechas y montos a tu gusto)</option>
            </select>
          </div>

          {frecuencia !== 'personalizado' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                {(frecuencia === 'semanal' || frecuencia === 'quincenal') && (
                  <div>
                    <Label>Día de la semana</Label>
                    <select value={diaSemana} onChange={e => setDiaSemana(+e.target.value)} style={selectStyle()}>
                      {DIAS_SEMANA_LARGOS.map((d, i) => <option key={i} value={i + 1}>{d}</option>)}
                    </select>
                  </div>
                )}
                {frecuencia === 'mensual' && (
                  <div>
                    <Label>Día del mes</Label>
                    <input type="number" min={1} max={31} value={diaMes} onChange={e => setDiaMes(+e.target.value)} style={inputStyle()}/>
                  </div>
                )}
                <div>
                  <Label>Inicio</Label>
                  <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} style={inputStyle()}/>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <Label>Monto del abono</Label>
                <input value={montoAbono} onChange={e => setMontoAbono(e.target.value.replace(/[^\d.]/g, ''))} placeholder="2000" style={{ ...inputStyle(), fontFamily: MONO }}/>
                {parseFloat(montoAbono) > 0 && (
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>${fmt(parseFloat(montoAbono))} {monedaPlan} por abono</div>
                )}
              </div>

              {abonosPreview.length > 0 && (
                <div style={{ background: C.blueSoft, border: `1px solid ${C.blue}`, borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: C.blueText, letterSpacing: 0.4, fontWeight: 700, marginBottom: 4 }}>PREVIEW</div>
                  <div style={{ fontSize: 12, color: C.blueText }}>
                    <strong>{abonosPreview.length} abono(s)</strong> · primer pago <strong>{fmtDateLabel(abonosPreview[0].fechaProgramada)}</strong> · liquidación <strong>{fmtDateFull(fechaLiquidacionEstimada)}</strong>
                  </div>
                  {abonosPreview.length > 1 && abonosPreview[abonosPreview.length - 1].montoProgramado !== abonosPreview[0].montoProgramado && (
                    <div style={{ fontSize: 11, color: C.blueText, opacity: 0.85, marginTop: 3 }}>
                      {abonosPreview.length - 1} abonos de ${fmt(abonosPreview[0].montoProgramado)} + 1 último de ${fmt(abonosPreview[abonosPreview.length - 1].montoProgramado)}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {frecuencia === 'personalizado' && (
            <>
              <div style={{ background: C.blueSoft, border: `1px solid ${C.blue}`, padding: '10px 12px', borderRadius: 6, marginBottom: 12, fontSize: 12, color: C.blueText }}>
                💡 Define cada abono manualmente con su fecha, monto y concepto opcional. La suma debe coincidir con el total (${fmt(montoTotalSeleccionado)} {monedaPlan}).
              </div>

              <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 130px 1fr 32px', padding: '8px 10px', background: C.bgSoft, borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: 0.4, alignItems: 'center', gap: 6 }}>
                  <div>#</div>
                  <div>FECHA</div>
                  <div style={{ textAlign: 'right' }}>MONTO {monedaPlan}</div>
                  <div>CONCEPTO (OPCIONAL)</div>
                  <div></div>
                </div>

                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {abonosPersonalizados.length === 0 && (
                    <div style={{ padding: 20, textAlign: 'center', color: C.muted, fontSize: 12 }}>
                      Sin abonos. Click en "+ Agregar abono" abajo para empezar.
                    </div>
                  )}
                  {abonosPersonalizados.map((ab, idx) => {
                    const esExtra = (ab.concepto || '').toLowerCase().includes('extra');
                    return (
                      <div key={idx} style={{
                        display: 'grid', gridTemplateColumns: '36px 1fr 130px 1fr 32px',
                        padding: '6px 10px', alignItems: 'center', gap: 6,
                        borderBottom: `1px solid ${C.bgSoft}`,
                        background: esExtra ? '#FFFBEB' : 'transparent',
                      }}>
                        <div style={{ color: C.muted, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{idx + 1}</div>
                        <input type="date" value={ab.fechaProgramada}
                          onChange={e => editarAbonoPersonalizado(idx, 'fechaProgramada', e.target.value)}
                          style={{ fontSize: 12, padding: '4px 8px', border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' }}/>
                        <input value={ab.montoProgramado}
                          onChange={e => editarAbonoPersonalizado(idx, 'montoProgramado', e.target.value.replace(/[^\d.]/g, ''))}
                          placeholder="0.00"
                          style={{ fontSize: 12, padding: '4px 8px', border: `1px solid ${C.border}`, borderRadius: 4, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' }}/>
                        <input value={ab.concepto}
                          onChange={e => editarAbonoPersonalizado(idx, 'concepto', e.target.value)}
                          placeholder="ej. extraordinario, liquidación..."
                          style={{
                            fontSize: 12, padding: '4px 8px',
                            border: `1px solid ${esExtra ? '#FBBF24' : C.border}`,
                            borderRadius: 4, fontFamily: 'inherit', boxSizing: 'border-box', width: '100%',
                            background: esExtra ? '#FEF3C7' : '#fff',
                            color: esExtra ? '#92400E' : C.text,
                          }}/>
                        <button onClick={() => eliminarAbonoPersonalizado(idx)}
                          title="Eliminar este abono"
                          style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14, padding: 2, fontFamily: 'inherit' }}>×</button>
                      </div>
                    );
                  })}
                </div>

                <div style={{ padding: '8px 10px', borderTop: `1px solid ${C.bgSoft}` }}>
                  <button onClick={agregarAbonoPersonalizado}
                    style={{ background: 'transparent', border: `1px dashed ${C.blue}`, color: C.blue, padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%', fontFamily: 'inherit' }}>+ Agregar abono</button>
                </div>
              </div>

              {/* Indicador de suma vs total */}
              {abonosPersonalizados.length > 0 && (() => {
                const dif = diferenciaPersonalizados;
                const ok = Math.abs(dif) < 0.01;
                const bg = ok ? '#DCFCE7' : '#FEE2E2';
                const border = ok ? '#16A34A' : '#DC2626';
                const color = ok ? '#166534' : '#991B1B';
                return (
                  <div style={{
                    background: bg, border: `1px solid ${border}`, padding: '10px 14px',
                    borderRadius: 6, marginBottom: 12,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 12, color, fontWeight: 600 }}>
                      {ok
                        ? `✓ Suma de ${abonosPersonalizados.length} abono(s)`
                        : (dif > 0
                            ? `⚠ Falta $${fmt(dif)} ${monedaPlan} para alcanzar el total`
                            : `⚠ Exceso de $${fmt(Math.abs(dif))} ${monedaPlan} sobre el total`)}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
                      ${fmt(sumaPersonalizados)} / ${fmt(montoTotalSeleccionado)} {monedaPlan}
                    </span>
                  </div>
                );
              })()}
            </>
          )}

          <ModalFooter
            leftBtn={<button onClick={() => setPaso(2)} style={btnStyle()} disabled={guardando}>← Atrás</button>}
            rightBtn={
              <button
                onClick={handleCrear}
                disabled={guardando || (frecuencia === 'personalizado' ? !personalizadoValido : !abonosPreview.length)}
                style={btnStyle(
                  guardando
                    ? 'disabled'
                    : (frecuencia === 'personalizado'
                        ? (personalizadoValido ? 'success' : 'disabled')
                        : (abonosPreview.length > 0 ? 'success' : 'disabled'))
                )}>
                {guardando ? 'Creando…' : '✓ Crear plan'}
              </button>
            }
          />
        </>
      )}
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MODAL: Detalle del plan
// ═══════════════════════════════════════════════════════════════════
function DetallePlanModal({ plan, user, esConsulta, onClose, onAccion }) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [abonoMarcando, setAbonoMarcando] = useState(null);     // abono que se está marcando como pagado
  const [abonoEditFecha, setAbonoEditFecha] = useState(null);   // abono cuya fecha se está editando
  const [abonoDesmarcando, setAbonoDesmarcando] = useState(null); // abono que se está desmarcando (confirmar)
  const [abonoEliminando, setAbonoEliminando] = useState(null); // abono que se está eliminando (confirmar)
  const [showAgregarAbono, setShowAgregarAbono] = useState(false); // modal para agregar nuevo abono
  const [copiandoImagen, setCopiandoImagen] = useState(false);
  const [modoCaptura, setModoCaptura] = useState(false);
  const refCapturar = useRef(null);

  const handleEliminarAbono = async () => {
    if (!abonoEliminando) return;
    await deleteAbono(abonoEliminando.id);
    setAbonoEliminando(null);
    await onAccion();
  };

  const handleCopiarImagen = async () => {
    if (!refCapturar.current || copiandoImagen) return;
    setCopiandoImagen(true);
    setModoCaptura(true);
    // Esperar 1 frame para que React aplique modoCaptura antes de capturar
    await new Promise(r => setTimeout(r, 50));
    try {
      const canvas = await html2canvas(refCapturar.current, {
        scale: 2, backgroundColor: '#FFFFFF', logging: false, useCORS: true,
      });
      canvas.toBlob(async (blob) => {
        if (!blob) { setCopiandoImagen(false); setModoCaptura(false); return; }
        if (navigator.clipboard && window.ClipboardItem) {
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            alert('✅ Imagen copiada al portapapeles. Pégala con Ctrl+V en WhatsApp, Email o Teams.');
            setCopiandoImagen(false);
            setModoCaptura(false);
            return;
          } catch (e) { /* fallback abajo */ }
        }
        // Fallback: descargar archivo
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Plan_${(plan.proveedor || 'plan').replace(/[^a-zA-Z0-9]/g, '_')}.png`;
        a.click();
        URL.revokeObjectURL(url);
        setCopiandoImagen(false);
        setModoCaptura(false);
      }, 'image/png', 1.0);
    } catch (err) {
      console.error('copiar imagen:', err);
      alert('No se pudo generar la imagen. Intenta de nuevo.');
      setCopiandoImagen(false);
      setModoCaptura(false);
    }
  };

  // Recorrer abonos con saldo restante post-cada-uno
  // El "Restante" muestra el plan de amortización proyectado:
  //  - Para abonos PAGADOS/PARCIALES: descuenta el monto real pagado
  //  - Para abonos PENDIENTES: descuenta el monto PROGRAMADO (proyección)
  // Así el usuario ve cómo va bajando el saldo después de cada abono.
  const abonosConSaldo = useMemo(() => {
    let saldoAcum = +plan.montoTotal || 0;
    return (plan.abonos || []).map(a => {
      const descuento = (a.estado === 'pagado' || a.estado === 'parcial')
        ? (+a.montoPagado || +a.montoProgramado || 0)
        : (+a.montoProgramado || 0);
      saldoAcum = Math.max(0, saldoAcum - descuento);
      return { ...a, restanteDespues: saldoAcum };
    });
  }, [plan]);

  const handleCancelar = async () => {
    await cancelarPlanPago(plan.id, user?.nombre);
    setConfirmCancel(false);
    await onAccion();
    onClose();
  };

  const handleDesmarcar = async () => {
    if (!abonoDesmarcando) return;
    await desmarcarAbonoPagado(abonoDesmarcando.id, user?.nombre);
    setAbonoDesmarcando(null);
    await onAccion();
  };

  return (
    <ModalShell onClose={onClose} maxWidth="94vw" maxHeight="92vh">
      {/* Barra de acciones (FUERA del bloque capturable) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 10 }}>
        <button onClick={handleCopiarImagen} disabled={copiandoImagen}
          title="Copia la imagen del plan al portapapeles"
          style={{ background: copiandoImagen ? '#9CA3AF' : C.navy, color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: copiandoImagen ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
          {copiandoImagen ? '⏳ Generando…' : '📸 Copiar imagen'}
        </button>
        {!esConsulta && plan.estado === 'activo' && (
          <button onClick={() => setShowAgregarAbono(true)} title="Agregar un abono nuevo (ej. abono extraordinario)"
            style={{ background: '#0F766E', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ Agregar abono</button>
        )}
        {!esConsulta && plan.estado === 'activo' && (
          <button onClick={() => setConfirmCancel(true)} title="Cancelar plan"
            style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.redText, padding: '5px 9px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>⛔ Cancelar plan</button>
        )}
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer', padding: 0, lineHeight: 1, marginLeft: 4 }}>×</button>
      </div>

      {/* Contenido capturable */}
      <div ref={refCapturar} style={{
        background: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: modoCaptura ? '0 4px 12px rgba(15, 118, 110, 0.08)' : 'none',
        maxWidth: modoCaptura ? 760 : '100%',
        margin: modoCaptura ? '0 auto' : '0',
      }}>
      {/* Header gradiente teal */}
      <div style={{
        background: 'linear-gradient(135deg, #0F766E 0%, #0E7490 50%, #155E75 100%)',
        padding: '22px 28px', color: '#fff',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.85, letterSpacing: 1, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
            Plan de pago
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.2, lineHeight: 1.2 }}>
            {plan.proveedor}
          </div>
          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
            Plan {plan.frecuencia}
            {(plan.frecuencia === 'semanal' || plan.frecuencia === 'quincenal') && plan.diaSemana && ` · ${DIAS_SEMANA_LARGOS[plan.diaSemana - 1]?.toLowerCase()}`}
            {plan.frecuencia === 'mensual' && plan.diaMes && ` · día ${plan.diaMes}`}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
          <div style={{ fontSize: 10, opacity: 0.75, letterSpacing: 0.5, textTransform: 'uppercase' }}>Emitido</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{fmtDateFull(today())}</div>
        </div>
      </div>

      {confirmCancel && (
        <div style={{ background: C.redSoft, border: `1px solid ${C.red}`, borderRadius: 6, padding: 12, margin: 12 }}>
          <div style={{ fontSize: 13, color: C.redText, marginBottom: 8 }}>
            ¿Cancelar el plan? Los abonos pendientes quedarán archivados y el plan no aparecerá en vistas activas.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleCancelar} style={{ background: C.red, color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Sí, cancelar</button>
            <button onClick={() => setConfirmCancel(false)} style={btnStyle()}>No, volver</button>
          </div>
        </div>
      )}

      {/* Banda de KPIs verde claro */}
      <div style={{
        background: '#F0FDFA', padding: '16px 28px',
        borderBottom: '1px solid #CCFBF1',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: '#134E4A', letterSpacing: 0.5, fontWeight: 600, textTransform: 'uppercase' }}>Total</div>
            <div style={{ fontFamily: MONO_FORMAL, fontSize: 17, fontWeight: 700, color: '#134E4A', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>${fmt(plan.montoTotal)}</div>
            <div style={{ fontSize: 10, color: '#0F766E', marginTop: 1 }}>{plan.moneda}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#134E4A', letterSpacing: 0.5, fontWeight: 600, textTransform: 'uppercase' }}>Pagado</div>
            <div style={{ fontFamily: MONO_FORMAL, fontSize: 17, fontWeight: 700, color: '#134E4A', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>${fmt(plan.pagado)}</div>
            <div style={{ fontSize: 10, color: '#0F766E', marginTop: 1 }}>{plan.pct}% avance</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#134E4A', letterSpacing: 0.5, fontWeight: 600, textTransform: 'uppercase' }}>Restante</div>
            <div style={{ fontFamily: MONO_FORMAL, fontSize: 17, fontWeight: 700, color: '#134E4A', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>${fmt(plan.restante)}</div>
            <div style={{ fontSize: 10, color: '#0F766E', marginTop: 1 }}>{plan.abonos.filter(a => a.estado !== 'pagado' && a.estado !== 'parcial').length} abonos</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#134E4A', letterSpacing: 0.5, fontWeight: 600, textTransform: 'uppercase' }}>Liquida</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#134E4A', marginTop: 4 }}>{fmtDateFull(plan.fechaLiquidacionEstimada)}</div>
            <div style={{ fontSize: 10, color: '#0F766E', marginTop: 1 }}>{plan.frecuencia === 'semanal' ? 'Viernes' : plan.frecuencia}</div>
          </div>
        </div>
      </div>

      {/* Tabla de abonos — estilo estado de cuenta */}
      <div style={{ padding: '18px 28px 4px' }}>
        <div style={{ marginBottom: 10, fontSize: 11, color: '#64748B', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Calendario de pagos
        </div>
        <div style={{
          borderRadius: 6, overflow: 'hidden',
          // En la app (no captura) mantenemos un scroll vertical si hay muchos abonos
          maxHeight: modoCaptura ? 'none' : 420,
          overflowY: modoCaptura ? 'visible' : 'auto',
        }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead style={modoCaptura ? {} : { position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
              <tr style={{ borderBottom: '2px solid #0F766E' }}>
                <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, fontWeight: 700, color: '#0F766E', letterSpacing: 0.5, textTransform: 'uppercase', width: 40 }}>#</th>
                <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, fontWeight: 700, color: '#0F766E', letterSpacing: 0.5, textTransform: 'uppercase' }}>Fecha</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, fontWeight: 700, color: '#0F766E', letterSpacing: 0.5, textTransform: 'uppercase' }}>Abono</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, fontWeight: 700, color: '#0F766E', letterSpacing: 0.5, textTransform: 'uppercase' }}>Saldo</th>
                <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 10, fontWeight: 700, color: '#0F766E', letterSpacing: 0.5, textTransform: 'uppercase', width: 90 }}>Estado</th>
                {!esConsulta && !modoCaptura && (
                  <th style={{ textAlign: 'center', padding: '8px 6px', fontSize: 10, fontWeight: 700, color: '#0F766E', letterSpacing: 0.5, textTransform: 'uppercase', width: 180 }}>Acciones</th>
                )}
              </tr>
            </thead>
            <tbody>
              {abonosConSaldo.map((a, idx) => {
                const estCalc = estadoCalculado(a, today());
                const isPagado = a.estado === 'pagado' || a.estado === 'parcial';
                const esEditableFecha = !isPagado;
                const isUltimo = idx === abonosConSaldo.length - 1;
                // El destacado "Final" SOLO aparece en modo captura, según decisión del usuario
                const esDestacadoFinal = modoCaptura && isUltimo;
                // Detectar abono extraordinario por la nota (concepto)
                const notaLower = (a.notas || '').toLowerCase();
                const esExtra = notaLower.includes('extra') || notaLower.includes('extraordinari');
                // Fila alternada (solo cuando NO es destacada y NO es pagada)
                const bgAlternado = idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
                const bgFila = esDestacadoFinal
                  ? '#ECFEFF'
                  : (esExtra && !isPagado ? '#FFFBEB' : (isPagado ? '#F0FDF4' : bgAlternado));
                const colorTexto = esDestacadoFinal ? '#155E75' : '#1E293B';
                return (
                  <tr key={a.id} style={{
                    background: bgFila,
                    borderBottom: '1px solid #F1F5F9',
                    borderTop: esDestacadoFinal ? '1.5px solid #0E7490' : 'none',
                  }}>
                    <td style={{
                      padding: esDestacadoFinal ? '9px 6px' : '7px 6px',
                      color: esDestacadoFinal ? '#155E75' : '#64748B',
                      fontFamily: MONO_FORMAL, fontWeight: esDestacadoFinal ? 700 : 400,
                    }}>{String(a.numero).padStart(2, '0')}</td>
                    <td style={{
                      padding: esDestacadoFinal ? '9px 6px' : '7px 6px',
                      fontFamily: MONO_FORMAL, color: colorTexto,
                      fontWeight: esDestacadoFinal ? 700 : 400,
                    }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span>{fmtDateLabel(a.fechaProgramada)}</span>
                        {!esConsulta && esEditableFecha && !modoCaptura && (
                          <button onClick={() => setAbonoEditFecha(a)} title="Editar fecha"
                            style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 12, padding: 2, lineHeight: 1, fontFamily: 'inherit' }}>✎</button>
                        )}
                      </div>
                    </td>
                    <td style={{
                      padding: esDestacadoFinal ? '9px 6px' : '7px 6px',
                      textAlign: 'right',
                      fontFamily: MONO_FORMAL, fontVariantNumeric: 'tabular-nums',
                      fontWeight: esDestacadoFinal ? 700 : 600,
                      color: colorTexto,
                    }}>
                      ${fmt(a.montoProgramado)}
                      {isPagado && a.montoPagado != null && +a.montoPagado !== +a.montoProgramado && (
                        <div style={{ fontSize: 9, color: '#64748B', marginTop: 2, fontWeight: 400 }}>pagado ${fmt(a.montoPagado)}</div>
                      )}
                    </td>
                    <td style={{
                      padding: esDestacadoFinal ? '9px 6px' : '7px 6px',
                      textAlign: 'right',
                      fontFamily: MONO_FORMAL, fontVariantNumeric: 'tabular-nums',
                      color: esDestacadoFinal ? '#155E75' : '#475569',
                      fontWeight: esDestacadoFinal ? 700 : 400,
                    }}>${fmt(a.restanteDespues)}</td>
                    <td style={{ padding: esDestacadoFinal ? '9px 6px' : '7px 6px', textAlign: 'center' }}>
                      {esDestacadoFinal ? (
                        <span style={{
                          display: 'inline-block', padding: '3px 9px',
                          background: '#0E7490', color: '#fff',
                          borderRadius: 999, fontSize: 10, fontWeight: 700,
                        }}>Final</span>
                      ) : isPagado ? (
                        <span style={{
                          display: 'inline-block', padding: '2px 8px',
                          background: '#DCFCE7', color: '#166534',
                          borderRadius: 999, fontSize: 10, fontWeight: 600,
                        }}>✓ {a.estado === 'parcial' ? 'Parcial' : 'Pagado'}</span>
                      ) : estCalc === 'atrasado' ? (
                        <span style={{
                          display: 'inline-block', padding: '2px 8px',
                          background: '#FEF3C7', color: '#92400E',
                          borderRadius: 999, fontSize: 10, fontWeight: 600,
                        }}>Atrasado</span>
                      ) : esExtra ? (
                        <span style={{
                          display: 'inline-block', padding: '2px 8px',
                          background: '#FEF3C7', color: '#92400E',
                          borderRadius: 999, fontSize: 10, fontWeight: 700,
                        }} title={a.notas}>⚡ Extra</span>
                      ) : (
                        <span style={{
                          display: 'inline-block', padding: '2px 8px',
                          background: '#E0F2FE', color: '#075985',
                          borderRadius: 999, fontSize: 10, fontWeight: 600,
                        }}>Pendiente</span>
                      )}
                    </td>
                    {!esConsulta && !modoCaptura && (
                      <td style={{ padding: '7px 6px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {isPagado ? (
                            <button onClick={() => setAbonoDesmarcando(a)} title="Desmarcar pago"
                              style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.muted, padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>↩ Desmarcar</button>
                          ) : (
                            <button onClick={() => setAbonoMarcando(a)} title="Marcar como pagado"
                              style={{ background: '#0F766E', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>✓ Marcar pagado</button>
                          )}
                          {!isPagado && (
                            <button onClick={() => setAbonoEliminando(a)} title="Eliminar este abono del plan"
                              style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 13, padding: 4, fontFamily: 'inherit', lineHeight: 1 }}>🗑</button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {modoCaptura && (
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ padding: '10px 6px 0', fontSize: 11, color: '#64748B', fontWeight: 600 }}>TOTAL</td>
                  <td style={{ padding: '10px 6px 0', textAlign: 'right', fontFamily: MONO_FORMAL, fontWeight: 700, color: '#134E4A', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>${fmt(plan.montoTotal)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Footer del estado de cuenta — solo en modo captura */}
      {modoCaptura && (
        <div style={{
          background: '#F8FAFC', padding: '12px 28px',
          borderTop: '1px solid #E2E8F0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 10, color: '#94A3B8',
        }}>
          <div>Documento generado automáticamente — Plan de pago acordado entre las partes</div>
          <div>{plan.abonos.length} abonos · {plan.moneda}</div>
        </div>
      )}

      </div>{/* Fin del refCapturar */}

      <div style={{ marginTop: 12, fontSize: 11, color: C.muted, padding: '10px 12px', background: C.bgSoft, borderRadius: 6 }}>
        💡 Marca cada abono como pagado conforme se vayan liquidando. Cuando todos estén pagados el plan pasará automáticamente a estado <strong>liquidado</strong>.
      </div>

      {/* Sub-modal: Marcar abono pagado */}
      {abonoMarcando && (
        <MarcarPagoModal
          abono={abonoMarcando}
          plan={plan}
          user={user}
          onClose={() => setAbonoMarcando(null)}
          onDone={async () => { setAbonoMarcando(null); await onAccion(); }}
        />
      )}

      {/* Sub-modal: Editar fecha de abono */}
      {abonoEditFecha && (
        <EditarFechaAbonoModal
          abono={abonoEditFecha}
          plan={plan}
          user={user}
          onClose={() => setAbonoEditFecha(null)}
          onDone={async () => { setAbonoEditFecha(null); await onAccion(); }}
        />
      )}

      {/* Sub-modal: Confirmar desmarcar pago */}
      {abonoDesmarcando && (
        <ModalShell onClose={() => setAbonoDesmarcando(null)} maxWidth={420}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: C.navy, margin: 0 }}>↩ Desmarcar pago</h3>
            <button onClick={() => setAbonoDesmarcando(null)} style={{ background: 'transparent', border: 'none', fontSize: 20, color: C.muted, cursor: 'pointer', padding: 0 }}>×</button>
          </div>
          <p style={{ fontSize: 13, color: C.text, marginTop: 0 }}>
            ¿Confirmas desmarcar el abono #{abonoDesmarcando.numero} ({fmtDateLabel(abonoDesmarcando.fechaProgramada)}, ${fmt(abonoDesmarcando.montoProgramado)})?
          </p>
          <p style={{ fontSize: 12, color: C.muted }}>
            El pago volverá a estado pendiente y se restará del monto aplicado a la factura correspondiente.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            <button onClick={() => setAbonoDesmarcando(null)} style={btnStyle()}>Cancelar</button>
            <button onClick={handleDesmarcar} style={{ ...btnStyle('primary'), background: C.warn }}>Sí, desmarcar</button>
          </div>
        </ModalShell>
      )}

      {/* Sub-modal: Confirmar eliminar abono */}
      {abonoEliminando && (
        <ModalShell onClose={() => setAbonoEliminando(null)} maxWidth={460}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: C.navy, margin: 0 }}>🗑 Eliminar abono</h3>
            <button onClick={() => setAbonoEliminando(null)} style={{ background: 'transparent', border: 'none', fontSize: 20, color: C.muted, cursor: 'pointer', padding: 0 }}>×</button>
          </div>
          <p style={{ fontSize: 13, color: C.text, marginTop: 0 }}>
            ¿Confirmas eliminar el abono <strong>#{abonoEliminando.numero}</strong> ({fmtDateLabel(abonoEliminando.fechaProgramada)}, ${fmt(abonoEliminando.montoProgramado)} {plan.moneda})?
          </p>
          <div style={{ background: C.warnSoft, border: `1px solid ${C.warn}`, borderRadius: 6, padding: '8px 12px', marginTop: 10 }}>
            <div style={{ fontSize: 11, color: C.warnText, lineHeight: 1.5 }}>
              ⚠ El monto total del plan (${fmt(plan.montoTotal)}) NO cambia. Al eliminar este abono, los abonos restantes ya no sumarán el total. Para corregirlo después, edita o agrega otros abonos.
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            <button onClick={() => setAbonoEliminando(null)} style={btnStyle()}>Cancelar</button>
            <button onClick={handleEliminarAbono} style={{ ...btnStyle('primary'), background: C.red }}>Sí, eliminar</button>
          </div>
        </ModalShell>
      )}

      {/* Sub-modal: Agregar nuevo abono al plan */}
      {showAgregarAbono && (
        <AgregarAbonoModal
          plan={plan}
          user={user}
          onClose={() => setShowAgregarAbono(false)}
          onDone={async () => { setShowAgregarAbono(false); await onAccion(); }}
        />
      )}
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SUB-MODAL: Agregar nuevo abono al plan (después de creación)
// ═══════════════════════════════════════════════════════════════════
function AgregarAbonoModal({ plan, user, onClose, onDone }) {
  // Sugerir fecha: +15 días desde el último abono pendiente
  const fechaInicial = useMemo(() => {
    const pendientes = (plan.abonos || []).filter(a => a.estado === 'pendiente' || a.estado === 'atrasado');
    if (pendientes.length === 0) return today();
    const ultima = pendientes[pendientes.length - 1].fechaProgramada;
    const d = new Date(ultima + 'T12:00:00');
    d.setDate(d.getDate() + 15);
    return d.toISOString().split('T')[0];
  }, [plan]);
  const numeroSugerido = useMemo(() => {
    const max = (plan.abonos || []).reduce((m, a) => Math.max(m, a.numero || 0), 0);
    return max + 1;
  }, [plan]);

  const [fecha, setFecha] = useState(fechaInicial);
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [guardando, setGuardando] = useState(false);

  const montoNum = parseFloat(monto) || 0;
  const valido = !!fecha && montoNum > 0;

  const handleGuardar = async () => {
    if (!valido || guardando) return;
    setGuardando(true);
    try {
      await upsertAbono({
        planId: plan.id,
        empresaId: plan.empresaId,
        numero: numeroSugerido,
        fechaProgramada: fecha,
        montoProgramado: montoNum,
        estado: 'pendiente',
        notas: concepto || null,
      }, user?.nombre);
      await onDone();
    } catch (err) {
      console.error('agregarAbono:', err);
      alert('Error al agregar el abono. Revisa la consola.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ModalShell onClose={onClose} maxWidth={480}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: 0 }}>+ Agregar abono al plan</h3>
          <p style={{ fontSize: 12, color: C.muted, margin: '4px 0 0' }}>
            Nuevo abono #{numeroSugerido} · {plan.proveedor}
          </p>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 20, color: C.muted, cursor: 'pointer', padding: 0 }}>×</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <Label>Fecha programada</Label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inputStyle()}/>
        </div>
        <div>
          <Label>Monto ({plan.moneda})</Label>
          <input value={monto} onChange={e => setMonto(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" style={{ ...inputStyle(), fontVariantNumeric: 'tabular-nums' }}/>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Label>Concepto (opcional)</Label>
        <input value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="ej. abono extraordinario, liquidación..." style={inputStyle()}/>
        {(concepto || '').toLowerCase().match(/extra/) && (
          <div style={{ fontSize: 11, color: '#92400E', marginTop: 4 }}>
            ⚡ Este abono se marcará como <strong>Extra</strong> en la tabla.
          </div>
        )}
      </div>

      <div style={{ background: C.bgSoft, borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
        💡 Este abono se agrega al plan sin modificar el monto total ni los otros abonos. Útil para agregar pagos extraordinarios fuera del calendario regular.
      </div>

      <ModalFooter
        leftBtn={<button onClick={onClose} style={btnStyle()} disabled={guardando}>Cancelar</button>}
        rightBtn={
          <button onClick={handleGuardar} disabled={!valido || guardando} style={btnStyle(valido && !guardando ? 'success' : 'disabled')}>
            {guardando ? 'Agregando…' : '+ Agregar abono'}
          </button>
        }
      />
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SUB-MODAL: Marcar abono como pagado
// ═══════════════════════════════════════════════════════════════════
function MarcarPagoModal({ abono, plan, user, onClose, onDone }) {
  const [fechaPagado, setFechaPagado] = useState(today());
  const [montoPagado, setMontoPagado] = useState(String(abono.montoProgramado || ''));
  const [facturaSel, setFacturaSel] = useState('');
  const [notas, setNotas] = useState('');
  const [ajusteOpcion, setAjusteOpcion] = useState(''); // 'reagendar', 'sumar', 'nota'
  const [guardando, setGuardando] = useState(false);

  // Facturas del plan con saldo restante > 0
  const facturasDisponibles = useMemo(() => {
    return (plan.facturas || []).map(f => {
      const saldo = Math.max(0, (+f.montoInicial || 0) - (+f.montoAplicado || 0));
      return { ...f, saldo };
    }).filter(f => f.saldo > 0.01);
  }, [plan]);

  // Inicializar factura seleccionada con la más vieja (primera con saldo)
  useEffect(() => {
    if (!facturaSel && facturasDisponibles.length > 0) {
      setFacturaSel(facturasDisponibles[0].invoiceId);
    }
  }, [facturasDisponibles, facturaSel]);

  const monto = parseFloat(montoPagado) || 0;
  const diferencia = monto - +abono.montoProgramado;
  const hayDiferencia = Math.abs(diferencia) > 0.01;
  const esMenor = diferencia < -0.01;
  const esMayor = diferencia > 0.01;

  const handleGuardar = async () => {
    if (guardando) return;
    if (monto <= 0) { alert('El monto pagado debe ser mayor a 0'); return; }
    if (hayDiferencia && !ajusteOpcion) {
      alert('Selecciona qué hacer con la diferencia');
      return;
    }
    setGuardando(true);
    try {
      // Determinar estado: 'pagado' si monto >= programado, 'parcial' si menor
      const estado = monto >= +abono.montoProgramado - 0.01 ? 'pagado' : 'parcial';

      // 1. Marcar el abono actual
      await marcarAbonoPagado(abono.id, {
        fechaPagado,
        montoPagado: monto,
        facturaIdAplicada: facturaSel || null,
        notas: notas || null,
        estado,
      }, user?.nombre);

      // 2. Manejar la diferencia según opción
      if (hayDiferencia && ajusteOpcion === 'reagendar') {
        // Crear un nuevo abono al final del plan con la diferencia
        const abonosOrdenados = [...plan.abonos].sort((a, b) => a.numero - b.numero);
        const ultimo = abonosOrdenados[abonosOrdenados.length - 1];
        // Calcular siguiente fecha (mismo intervalo desde el último)
        let nuevaFecha;
        if (plan.frecuencia === 'semanal') {
          const d = new Date(ultimo.fechaProgramada + 'T12:00:00');
          d.setDate(d.getDate() + 7);
          nuevaFecha = d.toISOString().split('T')[0];
        } else if (plan.frecuencia === 'quincenal') {
          const d = new Date(ultimo.fechaProgramada + 'T12:00:00');
          d.setDate(d.getDate() + 14);
          nuevaFecha = d.toISOString().split('T')[0];
        } else {
          const d = new Date(ultimo.fechaProgramada + 'T12:00:00');
          d.setMonth(d.getMonth() + 1);
          nuevaFecha = d.toISOString().split('T')[0];
        }
        const diferenciaAbs = Math.abs(diferencia);
        await upsertAbono({
          planId: plan.id,
          empresaId: plan.empresaId,
          numero: ultimo.numero + 1,
          fechaProgramada: nuevaFecha,
          montoProgramado: diferenciaAbs,
          estado: 'pendiente',
          notas: esMenor ? `Diferencia del abono #${abono.numero} (faltante)` : `Excedente reagendado del abono #${abono.numero}`,
        }, user?.nombre);
      } else if (hayDiferencia && ajusteOpcion === 'sumar') {
        // Sumar al próximo abono pendiente
        const abonosOrdenados = [...plan.abonos].sort((a, b) => a.numero - b.numero);
        const idx = abonosOrdenados.findIndex(a => a.id === abono.id);
        const proximoPendiente = abonosOrdenados.slice(idx + 1).find(a => a.estado === 'pendiente' || a.estado === 'atrasado');
        if (proximoPendiente) {
          // Si faltó dinero (esMenor) → próximo paga más (suma)
          // Si sobró dinero (esMayor) → próximo paga menos (resta)
          const nuevoMonto = +proximoPendiente.montoProgramado + (esMenor ? Math.abs(diferencia) : -diferencia);
          await upsertAbono({
            ...proximoPendiente,
            montoProgramado: Math.max(0, nuevoMonto),
          }, user?.nombre);
        }
      } else if (hayDiferencia && ajusteOpcion === 'acortar' && esMayor) {
        // Sobrepago: acortar el plan - eliminar el último abono pendiente
        const abonosOrdenados = [...plan.abonos].sort((a, b) => b.numero - a.numero);
        const ultimoPendiente = abonosOrdenados.find(a => a.estado === 'pendiente' || a.estado === 'atrasado');
        if (ultimoPendiente) {
          const restante = +ultimoPendiente.montoProgramado - diferencia;
          if (restante > 0.01) {
            await upsertAbono({ ...ultimoPendiente, montoProgramado: restante }, user?.nombre);
          } else {
            await deleteAbono(ultimoPendiente.id);
          }
        }
      }
      // 'nota' no requiere acción adicional, solo se guarda como informativo

      await onDone();
    } catch (err) {
      console.error('marcarAbono:', err);
      alert('Error al marcar el abono. Revisa la consola.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ModalShell onClose={onClose} maxWidth={520}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: 0 }}>✓ Marcar abono pagado</h3>
          <p style={{ fontSize: 12, color: C.muted, margin: '4px 0 0' }}>
            Abono #{abono.numero} · {fmtDateLabel(abono.fechaProgramada)} · programado ${fmt(abono.montoProgramado)} {plan.moneda}
          </p>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 20, color: C.muted, cursor: 'pointer', padding: 0 }}>×</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <Label>Fecha real del pago</Label>
          <input type="date" value={fechaPagado} onChange={e => setFechaPagado(e.target.value)} style={inputStyle()}/>
        </div>
        <div>
          <Label>Monto pagado ({plan.moneda})</Label>
          <input value={montoPagado} onChange={e => setMontoPagado(e.target.value.replace(/[^\d.]/g, ''))} style={{ ...inputStyle(), fontFamily: MONO }}/>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <Label>Aplicar a factura</Label>
        {facturasDisponibles.length === 0 ? (
          <div style={{ padding: '8px 10px', background: C.bgSoft, borderRadius: 6, fontSize: 12, color: C.muted }}>
            Todas las facturas del plan ya están aplicadas.
          </div>
        ) : (
          <select value={facturaSel} onChange={e => setFacturaSel(e.target.value)} style={selectStyle()}>
            {facturasDisponibles.map(f => (
              <option key={f.id} value={f.invoiceId}>
                {f.invoiceId.substring(0, 12)}… · saldo ${fmt(f.saldo)}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Manejo de diferencia */}
      {hayDiferencia && (
        <div style={{
          background: esMenor ? C.warnSoft : C.blueSoft,
          border: `1px solid ${esMenor ? C.warn : C.blue}`,
          borderRadius: 6, padding: '10px 12px', marginBottom: 10,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: esMenor ? C.warnText : C.blueText, marginBottom: 6 }}>
            {esMenor
              ? `⚠ Pagaste $${fmt(monto)}, falta $${fmt(Math.abs(diferencia))} del abono`
              : `↑ Pagaste $${fmt(monto)}, sobran $${fmt(diferencia)} sobre el abono`}
          </div>
          <div style={{ fontSize: 11, color: esMenor ? C.warnText : C.blueText, marginBottom: 6 }}>¿Qué hacer con la diferencia?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {esMenor ? (
              <>
                <RadioOpcion label="Reagendar el faltante en un abono extra al final del plan" value="reagendar" current={ajusteOpcion} onChange={setAjusteOpcion} />
                <RadioOpcion label="Sumar el faltante al próximo abono" value="sumar" current={ajusteOpcion} onChange={setAjusteOpcion} />
                <RadioOpcion label="Solo nota (no reajustar montos)" value="nota" current={ajusteOpcion} onChange={setAjusteOpcion} />
              </>
            ) : (
              <>
                <RadioOpcion label="Descontar el excedente del próximo abono" value="sumar" current={ajusteOpcion} onChange={setAjusteOpcion} />
                <RadioOpcion label="Acortar el plan (eliminar último abono si alcanza)" value="acortar" current={ajusteOpcion} onChange={setAjusteOpcion} />
                <RadioOpcion label="Solo nota (no reajustar montos)" value="nota" current={ajusteOpcion} onChange={setAjusteOpcion} />
              </>
            )}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <Label>Notas (opcional)</Label>
        <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Referencia bancaria, comentarios..." style={inputStyle()}/>
      </div>

      <ModalFooter
        leftBtn={<button onClick={onClose} style={btnStyle()} disabled={guardando}>Cancelar</button>}
        rightBtn={
          <button onClick={handleGuardar} disabled={guardando || monto <= 0} style={btnStyle(monto > 0 && !guardando ? 'success' : 'disabled')}>
            {guardando ? 'Guardando…' : '✓ Confirmar pago'}
          </button>
        }
      />
    </ModalShell>
  );
}

function RadioOpcion({ label, value, current, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: C.text }}>
      <input type="radio" checked={current === value} onChange={() => onChange(value)} />
      <span>{label}</span>
    </label>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SUB-MODAL: Editar fecha de un abono
// ═══════════════════════════════════════════════════════════════════
function EditarFechaAbonoModal({ abono, plan, user, onClose, onDone }) {
  const [nuevaFecha, setNuevaFecha] = useState(abono.fechaProgramada);
  const [guardando, setGuardando] = useState(false);

  // Abonos siguientes pendientes
  const siguientesPendientes = useMemo(() => {
    const ordenados = [...(plan.abonos || [])].sort((a, b) => a.numero - b.numero);
    const idx = ordenados.findIndex(a => a.id === abono.id);
    return ordenados.slice(idx + 1).filter(a => a.estado === 'pendiente' || a.estado === 'atrasado');
  }, [plan, abono]);

  const cambio = nuevaFecha !== abono.fechaProgramada;
  const deltaDias = useMemo(() => {
    if (!cambio) return 0;
    const d1 = new Date(abono.fechaProgramada + 'T12:00:00');
    const d2 = new Date(nuevaFecha + 'T12:00:00');
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  }, [nuevaFecha, abono.fechaProgramada, cambio]);

  const handleConfirmar = async (recorrerSiguientes) => {
    if (guardando || !cambio) return;
    setGuardando(true);
    try {
      // 1. Actualizar el abono actual
      await upsertAbono({ ...abono, fechaProgramada: nuevaFecha }, user?.nombre);
      // 2. Si pidió recorrer, actualizar los siguientes
      if (recorrerSiguientes && siguientesPendientes.length > 0) {
        const ordenadosTodos = [...(plan.abonos || [])].sort((a, b) => a.numero - b.numero);
        await reagendarAbonosSiguientes(ordenadosTodos, abono.id, deltaDias, user?.nombre);
      }
      await onDone();
    } catch (err) {
      console.error('editarFecha:', err);
      alert('Error al editar la fecha. Revisa la consola.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <ModalShell onClose={onClose} maxWidth={480}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: 0 }}>✎ Editar fecha del abono</h3>
          <p style={{ fontSize: 12, color: C.muted, margin: '4px 0 0' }}>
            Abono #{abono.numero} · ${fmt(abono.montoProgramado)} {plan.moneda}
          </p>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 20, color: C.muted, cursor: 'pointer', padding: 0 }}>×</button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Label>Fecha actual</Label>
        <div style={{ fontSize: 13, fontFamily: MONO, padding: '6px 10px', background: C.bgSoft, borderRadius: 6, color: C.muted }}>
          {fmtDateLabel(abono.fechaProgramada)}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Label>Nueva fecha</Label>
        <input type="date" value={nuevaFecha} onChange={e => setNuevaFecha(e.target.value)} style={inputStyle()}/>
      </div>

      {cambio && (
        <div style={{
          background: C.blueSoft, border: `1px solid ${C.blue}`, borderRadius: 6,
          padding: '10px 12px', marginBottom: 14,
        }}>
          <div style={{ fontSize: 12, color: C.blueText, lineHeight: 1.5 }}>
            <strong>Cambio:</strong> {deltaDias > 0 ? `+${deltaDias}` : deltaDias} día(s) — {fmtDateLabel(abono.fechaProgramada)} → <strong>{fmtDateLabel(nuevaFecha)}</strong>
            {siguientesPendientes.length > 0 && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.blue}` }}>
                Hay <strong>{siguientesPendientes.length} abono(s) pendientes después de éste</strong>. ¿Quieres recorrerlos manteniendo el mismo intervalo?
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        <button onClick={onClose} style={btnStyle()} disabled={guardando}>Cancelar</button>
        <div style={{ display: 'flex', gap: 6 }}>
          {siguientesPendientes.length > 0 && cambio && (
            <button onClick={() => handleConfirmar(false)} disabled={guardando} style={btnStyle()}>
              Solo mover este
            </button>
          )}
          <button onClick={() => handleConfirmar(siguientesPendientes.length > 0)}
            disabled={!cambio || guardando}
            style={btnStyle(cambio && !guardando ? 'primary' : 'disabled')}>
            {guardando ? 'Guardando…' : siguientesPendientes.length > 0 && cambio ? 'Sí, recorrer todos' : 'Guardar'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function MiniKpi({ label, value, sub, color, accent }) {
  const bg = accent ? C.blueSoft : C.bgSoft;
  const labelColor = accent ? C.blueText : C.muted;
  return (
    <div style={{ background: bg, borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: labelColor, letterSpacing: 0.4, fontWeight: 600 }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', color: color || (accent ? C.blueText : C.text) }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: labelColor, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Popups de KPIs
// ═══════════════════════════════════════════════════════════════════
function PopupActivos({ planes, onClose, onAbrirPlan }) {
  const activos = planes.filter(p => p.estado === 'activo');
  return (
    <ModalShell onClose={onClose} maxWidth={920}>
      <PopupHeader label="DESGLOSE" title="Planes activos" onClose={onClose}/>
      {activos.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>Sin planes activos.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
          {activos.map(p => (
            <button key={p.id} onClick={() => onAbrirPlan(p.id)}
              style={{ all: 'unset', cursor: 'pointer', padding: '10px 12px', background: C.bgSoft, borderRadius: 6, border: `1px solid ${C.border}`, display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{p.proveedor}</span>
                <span style={{ fontSize: 11, color: C.muted, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>${fmt(p.restante)} {p.moneda}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <div style={{ flex: 1, height: 4, background: '#fff', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${p.pct}%`, height: '100%', background: p.pct >= 75 ? C.green : C.blue }}/>
                </div>
                <span style={{ fontSize: 10, color: C.muted, fontVariantNumeric: 'tabular-nums', minWidth: 28, textAlign: 'right' }}>{p.pct}%</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </ModalShell>
  );
}

function PopupComprometido({ planes, onClose, onAbrirPlan }) {
  const activos = planes.filter(p => p.estado === 'activo');
  const grupos = { USD: [], MXN: [], EUR: [] };
  activos.forEach(p => { if (grupos[p.moneda]) grupos[p.moneda].push(p); });

  return (
    <ModalShell onClose={onClose} maxWidth={920}>
      <PopupHeader label="DESGLOSE" title="Comprometido por moneda" onClose={onClose}/>
      {['USD', 'MXN', 'EUR'].map(mon => {
        if (grupos[mon].length === 0) return null;
        const total = grupos[mon].reduce((s, p) => s + p.restante, 0);
        return (
          <div key={mon} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 0.4, fontWeight: 700, marginBottom: 6 }}>{mon}</div>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <tbody>
                {grupos[mon].map(p => (
                  <tr key={p.id} onClick={() => onAbrirPlan(p.id)} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                    <td style={{ padding: '6px 0', color: C.text }}>{p.proveedor}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>${fmt(p.restante)}</td>
                  </tr>
                ))}
                <tr style={{ background: C.blueSoft }}>
                  <td style={{ padding: '7px 6px', fontWeight: 700, color: C.blueText }}>Total {mon}</td>
                  <td style={{ padding: '7px 0', textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: C.blueText }}>${fmt(total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </ModalShell>
  );
}

function PopupRitmo({ ritmo, onClose }) {
  const porMoneda = { USD: [], MXN: [], EUR: [] };
  (ritmo.detalle || []).forEach(d => {
    if (porMoneda[d.moneda]) porMoneda[d.moneda].push(d);
  });
  return (
    <ModalShell onClose={onClose} maxWidth={920}>
      <PopupHeader label="DESGLOSE" title="Pago semanal por plan" subtitle="Compromiso normalizado a base semanal" onClose={onClose}/>
      {['USD', 'MXN', 'EUR'].map(mon => {
        if (porMoneda[mon].length === 0) return null;
        return (
          <div key={mon} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 0.4, fontWeight: 700, marginBottom: 6 }}>{mon}</div>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <tbody>
                {porMoneda[mon].map((d, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '6px 0', color: C.text }}>{d.proveedor}</td>
                    <td style={{ padding: '6px 6px', color: C.muted, fontSize: 10, textAlign: 'center' }}>
                      {d.frecuencia} · ${fmt(d.montoAbono)}
                    </td>
                    <td style={{ padding: '6px 0', textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>${fmt(d.aporteSemanal)}</td>
                  </tr>
                ))}
                <tr style={{ background: C.blueSoft }}>
                  <td style={{ padding: '7px 6px', fontWeight: 700, color: C.blueText }}>Total semanal {mon}</td>
                  <td></td>
                  <td style={{ padding: '7px 0', textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: C.blueText }}>${fmt(ritmo.totales[mon])}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
      <div style={{ fontSize: 10, color: C.muted, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, lineHeight: 1.5 }}>
        Quincenal = abono ÷ 2 · Mensual = abono ÷ 4.33 · Solo cuenta planes activos
      </div>
    </ModalShell>
  );
}

function PopupProximos({ planes, hoyStr, onClose, onAbrirPlan }) {
  // Paleta morada para el calendario (estilo elegante)
  const P = {
    deep: '#6B21A8',         // morado oscuro (header)
    deepDark: '#581C87',     // morado más oscuro para gradiente
    primary: '#9333EA',      // morado vivo (botones, acentos)
    light: '#F3E8FF',        // morado muy suave (cabecera días, hoy)
    veryLight: '#FAF5FF',    // casi blanco con tinte morado (celdas)
    border: '#E9D5FF',       // borde sutil entre celdas
    text: '#3B0764',         // morado profundo para texto
    textSoft: '#6B21A8',
    abonoBg: '#FEF3C7',      // amarillo crema para celdas con abonos
    abonoBgHover: '#FDE68A',
    abonoText: '#92400E',
    abonoTextStrong: '#B45309',
  };

  // Construir lista plana de todos los abonos pendientes desde hoy
  const todosLosAbonos = useMemo(() => {
    const arr = [];
    planes.forEach(p => {
      if (p.estado !== 'activo') return;
      (p.abonos || []).forEach(a => {
        if (a.estado === 'pagado' || a.estado === 'parcial') return;
        if (a.fechaProgramada >= hoyStr) arr.push({ plan: p, abono: a });
      });
    });
    return arr;
  }, [planes, hoyStr]);

  // Mes inicial = mes de hoy
  const [mesActual, setMesActual] = useState(() => {
    const d = parseDate(hoyStr);
    return { year: d.getFullYear(), month: d.getMonth() }; // month es 0-indexado
  });
  const [diaSeleccionado, setDiaSeleccionado] = useState(null); // string YYYY-MM-DD

  // Agrupar abonos por fecha (YYYY-MM-DD)
  const abonosPorFecha = useMemo(() => {
    const map = {};
    todosLosAbonos.forEach(it => {
      const k = it.abono.fechaProgramada;
      if (!map[k]) map[k] = [];
      map[k].push(it);
    });
    return map;
  }, [todosLosAbonos]);

  // Calcular qué días mostrar (incluyendo días del mes anterior/siguiente para llenar la cuadrícula)
  // ATENCIÓN: la referencia usa Domingo como primer día. Mantenemos esa convención.
  const diasDelCalendario = useMemo(() => {
    const { year, month } = mesActual;
    const primero = new Date(year, month, 1);
    const diaSemanaInicio = primero.getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
    const inicio = new Date(year, month, 1 - diaSemanaInicio);
    const arr = [];
    for (let i = 0; i < 42; i++) { // 6 filas × 7 cols
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      arr.push({
        fecha: `${yyyy}-${mm}-${dd}`,
        dia: d.getDate(),
        esDelMes: d.getMonth() === month,
        esHoy: `${yyyy}-${mm}-${dd}` === hoyStr,
        esPasado: `${yyyy}-${mm}-${dd}` < hoyStr,
        esDomingo: d.getDay() === 0,
      });
    }
    return arr;
  }, [mesActual, hoyStr]);

  const nombresMes = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const cambiarMes = (delta) => {
    setDiaSeleccionado(null);
    setMesActual(prev => {
      const m = prev.month + delta;
      if (m < 0) return { year: prev.year - 1, month: 11 };
      if (m > 11) return { year: prev.year + 1, month: 0 };
      return { year: prev.year, month: m };
    });
  };

  // Totales del mes visible (por moneda)
  const totalesMes = useMemo(() => {
    const { year, month } = mesActual;
    const totales = { USD: 0, MXN: 0, EUR: 0 };
    let count = 0;
    Object.entries(abonosPorFecha).forEach(([fecha, items]) => {
      const d = parseDate(fecha);
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      items.forEach(it => {
        const m = it.plan.moneda || 'MXN';
        if (totales[m] != null) totales[m] += +it.abono.montoProgramado || 0;
        count++;
      });
    });
    return { totales, count };
  }, [abonosPorFecha, mesActual]);

  // Abonos del día seleccionado
  const abonosDia = diaSeleccionado ? (abonosPorFecha[diaSeleccionado] || []) : [];

  return (
    <ModalShell onClose={onClose} maxWidth={980} maxHeight="92vh">
      <PopupHeader label="DESGLOSE" title="Próximos abonos" subtitle="Vista calendario · click en un día con marca para ver detalle" onClose={onClose}/>

      {/* Resumen del mes */}
      {totalesMes.count > 0 && (
        <div style={{
          background: P.light, border: `1px solid ${P.border}`, borderRadius: 8,
          padding: '10px 14px', marginBottom: 14, fontSize: 13, color: P.text,
        }}>
          <strong>{totalesMes.count}</strong> abono(s) este mes
          {totalesMes.totales.USD > 0 && <> · <strong style={{ fontFamily: MONO }}>${fmt(totalesMes.totales.USD)} USD</strong></>}
          {totalesMes.totales.MXN > 0 && <> · <strong style={{ fontFamily: MONO }}>${fmt(totalesMes.totales.MXN)} MXN</strong></>}
          {totalesMes.totales.EUR > 0 && <> · <strong style={{ fontFamily: MONO }}>${fmt(totalesMes.totales.EUR)} EUR</strong></>}
        </div>
      )}

      {/* Calendario completo */}
      <div style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 12px rgba(107, 33, 168, 0.08)' }}>

        {/* Header morado con gradiente y navegación */}
        <div style={{
          background: `linear-gradient(135deg, ${P.deepDark} 0%, ${P.deep} 50%, ${P.primary} 100%)`,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <button onClick={() => cambiarMes(-1)} style={{
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.25)',
            color: '#fff',
            width: 36, height: 36,
            borderRadius: 8,
            fontSize: 18, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} aria-label="Mes anterior">‹</button>

          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: 0.3 }}>
            {nombresMes[mesActual.month]} {mesActual.year}
          </div>

          <button onClick={() => cambiarMes(1)} style={{
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.25)',
            color: '#fff',
            width: 36, height: 36,
            borderRadius: 8,
            fontSize: 18, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} aria-label="Mes siguiente">›</button>
        </div>

        {/* Cabecera días de la semana */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          background: P.light,
          borderBottom: `1px solid ${P.border}`,
        }}>
          {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => (
            <div key={d} style={{
              padding: '12px 8px', textAlign: 'center',
              fontSize: 12, fontWeight: 700, color: P.text,
              letterSpacing: 0.6, textTransform: 'uppercase',
            }}>{d}</div>
          ))}
        </div>

        {/* Grid de días */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#fff' }}>
          {diasDelCalendario.map((d, i) => {
            const abonosDelDia = abonosPorFecha[d.fecha] || [];
            const tieneAbonos = abonosDelDia.length > 0;
            const totalDia = abonosDelDia.reduce((s, it) => s + (+it.abono.montoProgramado || 0), 0);
            const monedaDia = abonosDelDia[0]?.plan?.moneda;
            const esSeleccionado = d.fecha === diaSeleccionado;

            // Color de fondo de la celda
            let bgCelda = P.veryLight;
            if (tieneAbonos) bgCelda = P.abonoBg;
            if (esSeleccionado) bgCelda = '#FDE68A';

            return (
              <button
                key={i}
                onClick={tieneAbonos ? () => setDiaSeleccionado(esSeleccionado ? null : d.fecha) : undefined}
                disabled={!tieneAbonos}
                style={{
                  all: 'unset',
                  cursor: tieneAbonos ? 'pointer' : 'default',
                  minHeight: 110,
                  padding: '10px 12px',
                  borderRight: ((i + 1) % 7 !== 0) ? `1px solid ${P.border}` : 'none',
                  borderBottom: i < 35 ? `1px solid ${P.border}` : 'none',
                  background: bgCelda,
                  opacity: d.esDelMes ? 1 : 0.4,
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 4,
                  transition: 'background 0.15s',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{
                  fontSize: 14,
                  fontWeight: d.esHoy ? 800 : 500,
                  color: d.esHoy ? '#fff' : (d.esPasado ? '#94A3B8' : P.text),
                  background: d.esHoy ? P.deep : 'transparent',
                  padding: d.esHoy ? '3px 9px' : 0,
                  borderRadius: d.esHoy ? 999 : 0,
                  fontFamily: MONO,
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: d.esHoy ? 26 : 'auto',
                  textAlign: 'center',
                }}>{d.dia}</div>

                {tieneAbonos && (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 700,
                      color: P.abonoTextStrong,
                      fontFamily: MONO, fontVariantNumeric: 'tabular-nums',
                    }}>${fmt(totalDia)}</div>
                    <div style={{
                      fontSize: 10, color: P.abonoText, fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <span>{monedaDia}</span>
                      {abonosDelDia.length > 1 && (
                        <span style={{
                          background: P.abonoTextStrong, color: '#fff',
                          borderRadius: 999, padding: '0 6px', fontSize: 9, fontWeight: 700,
                        }}>{abonosDelDia.length} abonos</span>
                      )}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Detalle del día seleccionado */}
      {diaSeleccionado && abonosDia.length > 0 && (
        <div style={{ marginTop: 14, padding: 14, background: P.veryLight, border: `1px solid ${P.border}`, borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: P.textSoft, fontWeight: 700, letterSpacing: 0.4, marginBottom: 8, textTransform: 'uppercase' }}>
            Abonos del {fmtDateLabel(diaSeleccionado)}
          </div>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <tbody>
              {abonosDia.map((it, i) => (
                <tr key={i} onClick={() => onAbrirPlan(it.plan.id)} style={{ borderBottom: i < abonosDia.length - 1 ? `1px solid ${P.border}` : 'none', cursor: 'pointer' }}>
                  <td style={{ padding: '10px 0', color: P.text, fontWeight: 500 }}>{it.plan.proveedor}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: P.text }}>
                    ${fmt(it.abono.montoProgramado)} <span style={{ fontSize: 10, color: P.textSoft, fontWeight: 600 }}>{it.plan.moneda}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalesMes.count === 0 && (
        <div style={{ marginTop: 12, padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>
          Sin abonos programados en {nombresMes[mesActual.month]} {mesActual.year}.
        </div>
      )}
    </ModalShell>
  );
}

function PopupAtrasados({ planes, hoyStr, onClose, onAbrirPlan }) {
  const atrasados = [];
  planes.forEach(p => {
    if (p.estado !== 'activo') return;
    p.abonos.forEach(a => {
      if (estadoCalculado(a, hoyStr) === 'atrasado') atrasados.push({ plan: p, abono: a });
    });
  });
  atrasados.sort((a, b) => a.abono.fechaProgramada.localeCompare(b.abono.fechaProgramada));

  return (
    <ModalShell onClose={onClose} maxWidth={920}>
      <PopupHeader label="DESGLOSE" title="Abonos atrasados" subtitle={`${atrasados.length} pago(s) vencidos sin marcar`} onClose={onClose}/>
      {atrasados.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: C.green, fontSize: 13 }}>🎉 Todo al día, sin atrasos.</div>
      ) : (
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <tbody>
            {atrasados.map((it, i) => {
              const dias = Math.abs(diasEntre(hoyStr, it.abono.fechaProgramada));
              return (
                <tr key={i} onClick={() => onAbrirPlan(it.plan.id)} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer', background: i % 2 ? C.warnSoft : '#fff' }}>
                  <td style={{ padding: '8px 6px 8px 0', fontFamily: MONO, fontSize: 11, width: 90, color: C.warnText }}>{fmtDateLabel(it.abono.fechaProgramada)}</td>
                  <td style={{ padding: '8px 6px', color: C.warnText, fontSize: 10, width: 80, textAlign: 'center', fontWeight: 700 }}>{dias}d vencido</td>
                  <td style={{ padding: '8px 6px', color: C.text }}>{it.plan.proveedor}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: C.warnText }}>${fmt(it.abono.montoProgramado)} {it.plan.moneda}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </ModalShell>
  );
}

function PopupHeader({ label, title, subtitle, onClose }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
      <div>
        <div style={{ fontSize: 10, color: C.blueText, letterSpacing: 0.5, fontWeight: 700 }}>{label}</div>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: C.navy, margin: '4px 0 0' }}>{title}</h3>
        {subtitle && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{subtitle}</div>}
      </div>
      <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 22, color: C.muted, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Shell genérico para modales
// ═══════════════════════════════════════════════════════════════════
function ModalShell({ onClose, maxWidth = 460, maxHeight, children }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15,23,42,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 20,
      fontFamily: INTER,
      WebkitFontSmoothing: 'antialiased',
      MozOsxFontSmoothing: 'grayscale',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 12, padding: 22,
        maxWidth, width: '100%',
        maxHeight: maxHeight || '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {children}
      </div>
    </div>
  );
}

function ModalFooter({ leftBtn, rightBtn }) {
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      {leftBtn || <span></span>}
      {rightBtn}
    </div>
  );
}

function Label({ children }) {
  return <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4, fontWeight: 600 }}>{children}</label>;
}

function inputStyle() {
  return { width: '100%', border: `1px solid ${C.border}`, padding: '8px 10px', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' };
}
function selectStyle() {
  return { width: '100%', border: `1px solid ${C.border}`, padding: '8px 10px', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', background: '#fff', cursor: 'pointer' };
}
function btnStyle(variant) {
  const base = { padding: '8px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
  if (variant === 'primary')  return { ...base, background: C.navy,  color: '#fff', border: 'none' };
  if (variant === 'success')  return { ...base, background: C.green, color: '#fff', border: 'none' };
  if (variant === 'disabled') return { ...base, background: '#9CA3AF', color: '#fff', border: 'none', cursor: 'not-allowed' };
  return { ...base, background: '#fff', color: C.text, border: `1px solid ${C.border}` };
}
