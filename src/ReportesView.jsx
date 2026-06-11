// ═══════════════════════════════════════════════════════════════════
// ReportesView — Pantalla índice de reportes disponibles
// ═══════════════════════════════════════════════════════════════════
//
// Pantalla "agregadora" de reportes con cards filtradas por empresa.
// Estructura:
//   • Header con migaja contextual (nombre de empresa)
//   • Sección DISPONIBLES con chips grandes de reportes activos
//     (cada chip muestra mini-KPIs en vivo: boletos del mes,
//     utilidad del mes, pendientes)
//   • Sección PRÓXIMOS con cards dasheadas de roadmap
//
// Catálogo de reportes en REPORTES_DISPONIBLES — para agregar uno
// nuevo, añade una entrada con id, label, descripcion, icon, color,
// empresas (array de IDs permitidos) y Component (el módulo).
// ═══════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import CaribeCoolModule, { MIVUELO_LOGO } from './CaribeCoolModule.jsx';
import PlanesPagoModule from './PlanesPagoModule.jsx';
import { fetchBoletosCC } from './db_caribe_cool.js';
import { fetchPlanesPago, fetchAbonosPorEmpresa, calcularRitmoSemanal } from './db.js';
import { EMPRESAS } from './empresas.js';

const C = {
  navy: '#0F2D4A',
  blue: '#1565C0',
  violet: '#7C3AED',
  green: '#16A34A',
  orange: '#EA580C',
  muted: '#64748B',
  slate: '#475569',
  border: '#E2E8F0',
  borderDash: '#CBD5E1',
  bgSoft: '#F8FAFC',
  text: '#0F172A',
  white: '#FFFFFF',
};

// ─── Catálogo de reportes disponibles ────────────────────────────
// Cada reporte declara: id, label, subtítulo, descripción, logo, color,
// empresas permitidas, Component a renderizar y función opcional para
// calcular mini-KPIs en vivo del mes actual.
const REPORTES_DISPONIBLES = [
  {
    id: 'caribecool',
    label: 'Caribe Cool',
    subtitulo: 'BOLETERÍA',
    descripcion:
      'Concentrador de boletos vendidos: cliente, ruta, costo, venta y utilidad por boleto.',
    logo: MIVUELO_LOGO,
    color: C.violet,
    empresas: ['empresa_1'], // solo Viajes Libero
    Component: CaribeCoolModule,
    // Función de KPIs: recibe boletos y retorna [{label, value, color}, ...]
    calcularKpis: (boletos) => {
      const ahora = new Date();
      const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      const delMes = boletos.filter((b) => {
        if (!b.fecha_venta) return false;
        const d = new Date(b.fecha_venta);
        return d >= inicioMes && d <= ahora;
      });
      const utilidadMes = delMes.reduce((sum, b) => {
        if (b.precio_venta == null || b.costo_usd == null) return sum;
        return sum + (b.precio_venta - b.costo_usd);
      }, 0);
      const pendientes = boletos.filter((b) => {
        // Pendiente = no tiene precio_venta o no tiene fecha_cobro
        return !b.precio_venta || !b.fecha_cobro;
      }).length;
      return [
        { label: 'Boletos este mes', value: String(delMes.length), color: C.text },
        {
          label: 'Utilidad este mes',
          value: `$${utilidadMes.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
          color: C.green,
        },
        { label: 'Pendientes', value: String(pendientes), color: C.orange },
      ];
    },
  },
  // Plantilla para agregar reportes futuros:
  // {
  //   id: 'algun_id',
  //   label: 'Nombre',
  //   subtitulo: 'CATEGORÍA',
  //   descripcion: '...',
  //   logo: null,
  //   color: '#...',
  //   empresas: ['empresa_2'],
  //   Component: AlgunComponente,
  //   calcularKpis: (data) => [...],
  // },
  {
    id: 'planes_pago',
    label: 'Planes de pago',
    subtitulo: 'CXP · PROVEEDORES',
    descripcion:
      'Acuerdos de pagos parciales con proveedores. Pago semanal, abonos programados y match con CxP.',
    logo: null,
    icon: '📅',
    color: C.blue,
    badge: 'NUEVO',
    empresas: ['empresa_1', 'empresa_2'], // ambas empresas
    Component: PlanesPagoModule,
    // KPIs en vivo en la card de entrada (planes activos + ritmo semanal + atrasados)
    calcularKpis: (data) => {
      const { planes, abonos, hoyStr } = data || {};
      if (!planes || planes.length === 0) {
        return [
          { label: 'Activos', value: '0', color: C.text },
          { label: 'Pago semanal', value: '—', color: C.muted },
          { label: 'Atrasados', value: '0', color: C.muted },
        ];
      }
      const activos = planes.filter((p) => p.estado === 'activo');
      const ritmo = calcularRitmoSemanal(activos);
      const totSemUSD = ritmo.totales.USD;
      const totSemMXN = ritmo.totales.MXN;
      let ritmoStr = '—';
      if (totSemUSD > 0) {
        ritmoStr = `$${totSemUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
      } else if (totSemMXN > 0) {
        ritmoStr = `$${totSemMXN.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
      }
      // Atrasados
      const atrasados = (abonos || []).filter((a) => {
        if (a.estado === 'pagado' || a.estado === 'parcial') return false;
        return a.fechaProgramada < hoyStr;
      }).length;
      return [
        { label: 'Activos', value: String(activos.length), color: C.text },
        { label: 'Pago semanal', value: ritmoStr, color: C.blue },
        { label: 'Atrasados', value: String(atrasados), color: atrasados > 0 ? C.orange : C.muted },
      ];
    },
  },
];

// ─── Cards "Próximos" (roadmap) ─────────────────────────────────
const PROXIMOS = [
  {
    id: 'otra-aerolinea',
    icon: '✈',
    label: 'Otra aerolínea',
    descripcion:
      'Mismo concentrador para otra línea aérea cuando lo necesites.',
  },
  {
    id: 'ventas-vendedor',
    icon: '📈',
    label: 'Ventas por vendedor',
    descripcion:
      'Ranking de vendedores con utilidad generada en el periodo.',
  },
  {
    id: 'sugerir',
    icon: '💡',
    label: 'Sugerir reporte',
    descripcion: '¿Qué te gustaría ver aquí? Dinos y lo armamos.',
  },
];

export default function ReportesView({ empresaId, user, esConsulta = false }) {
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [boletosCC, setBoletosCC] = useState([]);
  const [planesData, setPlanesData] = useState({ planes: [], abonos: [], hoyStr: new Date().toISOString().split('T')[0] });
  const [loadingKpis, setLoadingKpis] = useState(true);

  // Nombre de la empresa para la migaja
  const empresaNombre =
    EMPRESAS?.find((e) => e.id === empresaId)?.nombre || empresaId;

  // Filtrar reportes por empresa
  const reportesParaEmpresa = REPORTES_DISPONIBLES.filter((r) =>
    r.empresas.includes(empresaId)
  );

  // Cargar datos para los mini-KPIs (solo si hay reportes que los usen)
  useEffect(() => {
    if (!empresaId) {
      setLoadingKpis(false);
      return;
    }
    const necesitaCaribeCool = reportesParaEmpresa.some(
      (r) => r.id === 'caribecool'
    );
    const necesitaPlanes = reportesParaEmpresa.some(
      (r) => r.id === 'planes_pago'
    );
    if (!necesitaCaribeCool && !necesitaPlanes) {
      setLoadingKpis(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingKpis(true);
      try {
        const tasks = [];
        if (necesitaCaribeCool) tasks.push(fetchBoletosCC(empresaId).then((bs) => { if (!cancelled) setBoletosCC(bs); }));
        if (necesitaPlanes) {
          tasks.push((async () => {
            const planes = await fetchPlanesPago(empresaId);
            const abonos = await fetchAbonosPorEmpresa(empresaId);
            if (!cancelled) setPlanesData({ planes, abonos, hoyStr: new Date().toISOString().split('T')[0] });
          })());
        }
        await Promise.all(tasks);
      } catch (e) {
        console.error('Error cargando KPIs:', e);
      } finally {
        if (!cancelled) setLoadingKpis(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  // Si hay un reporte seleccionado, renderizar su módulo con botón volver
  if (selectedReportId) {
    const reporte = REPORTES_DISPONIBLES.find(
      (r) => r.id === selectedReportId
    );
    if (!reporte || !reporte.empresas.includes(empresaId)) {
      setSelectedReportId(null);
      return null;
    }
    const Component = reporte.Component;
    return (
      <div style={{
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeLegibility',
      }}>
        <button
          onClick={() => setSelectedReportId(null)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: 'white',
            color: C.slate,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          ← Volver a Reportes
        </button>
        <Component
          empresaId={empresaId}
          user={user}
          esConsulta={esConsulta}
        />
      </div>
    );
  }

  // Datos para los KPIs
  const dataMap = { caribecool: boletosCC, planes_pago: planesData };

  return (
    <div
      style={{
        fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
      }}
    >
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div
        style={{
          fontSize: 12,
          color: C.muted,
          fontWeight: 500,
          marginBottom: 4,
        }}
      >
        {empresaNombre}
      </div>
      <h1
        style={{
          margin: 0,
          fontSize: 28,
          fontWeight: 800,
          color: C.navy,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 26 }}>📊</span>
        Reportes
      </h1>
      <p
        style={{
          margin: '6px 0 24px',
          color: C.muted,
          fontSize: 13,
        }}
      >
        Selecciona un reporte para ver el detalle.
      </p>

      {/* Separador */}
      <div
        style={{
          height: 1,
          background: C.border,
          margin: '0 0 20px',
        }}
      />

      {/* ─── Sección DISPONIBLES ────────────────────────────────── */}
      {reportesParaEmpresa.length > 0 ? (
        <>
          <SectionLabel text="DISPONIBLES" />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fill, minmax(420px, 1fr))',
              gap: 16,
              marginBottom: 32,
            }}
          >
            {reportesParaEmpresa.map((r) => (
              <ReporteChipGrande
                key={r.id}
                reporte={r}
                onClick={() => setSelectedReportId(r.id)}
                data={dataMap[r.id] || []}
                loading={loadingKpis}
              />
            ))}
          </div>
        </>
      ) : (
        <>
          <SectionLabel text="DISPONIBLES" />
          <div
            style={{
              padding: 32,
              background: C.bgSoft,
              border: `1px dashed ${C.borderDash}`,
              borderRadius: 12,
              textAlign: 'center',
              color: C.muted,
              fontSize: 14,
              marginBottom: 32,
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
            <div style={{ fontWeight: 600, color: C.slate, marginBottom: 4 }}>
              Aún no hay reportes disponibles para esta empresa
            </div>
            <div style={{ fontSize: 12 }}>
              Los reportes se agregan según las necesidades de cada empresa.
            </div>
          </div>
        </>
      )}

      {/* ─── Sección PRÓXIMOS ───────────────────────────────────── */}
      <SectionLabel text="PRÓXIMOS" />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {PROXIMOS.map((p) => (
          <ProximoCard key={p.id} item={p} />
        ))}
      </div>
    </div>
  );
}

// ─── Componentes auxiliares ──────────────────────────────────────

function SectionLabel({ text }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: C.muted,
        letterSpacing: '0.1em',
        marginBottom: 12,
      }}
    >
      {text}
    </div>
  );
}

function ReporteChipGrande({ reporte, onClick, data, loading }) {
  const kpis = reporte.calcularKpis ? reporte.calcularKpis(data) : [];

  return (
    <button
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'block',
        padding: 20,
        background: C.white,
        border: `1.5px solid ${reporte.color}`,
        borderRadius: 12,
        transition: 'transform 0.12s, box-shadow 0.15s',
        textAlign: 'left',
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = `0 8px 24px ${reporte.color}22`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,0.04)';
      }}
    >
      {/* Top row: logo + ABRIR */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 16,
        }}
      >
        {reporte.logo ? (
          <img
            src={reporte.logo}
            alt={reporte.label}
            style={{
              height: 36,
              maxWidth: 140,
              objectFit: 'contain',
            }}
          />
        ) : (
          <div style={{ height: 36, fontSize: 32 }}>{reporte.icon}</div>
        )}
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: reporte.color,
            letterSpacing: '0.08em',
          }}
        >
          ABRIR →
        </div>
      </div>

      {/* Title + subtitle */}
      <div
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: C.navy,
          marginBottom: 2,
          letterSpacing: '-0.01em',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {reporte.label}
        {reporte.badge && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 8px',
            background: '#D1FAE5', color: '#065F46',
            borderRadius: 999, letterSpacing: '0.06em',
          }}>{reporte.badge}</span>
        )}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.slate,
          letterSpacing: '0.08em',
          marginBottom: 12,
        }}
      >
        {reporte.subtitulo}
      </div>

      {/* Descripción */}
      <div
        style={{
          fontSize: 13,
          color: C.slate,
          lineHeight: 1.5,
          marginBottom: 16,
        }}
      >
        {reporte.descripcion}
      </div>

      {/* Separador */}
      <div
        style={{
          height: 1,
          background: C.border,
          margin: '0 0 14px',
        }}
      />

      {/* Mini-KPIs */}
      {kpis.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${kpis.length}, 1fr)`,
            gap: 12,
          }}
        >
          {kpis.map((k, i) => (
            <div key={i}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.muted,
                  letterSpacing: '0.06em',
                  marginBottom: 4,
                }}
              >
                {k.label.toUpperCase()}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: loading ? C.muted : k.color,
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                }}
              >
                {loading ? '—' : k.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

function ProximoCard({ item }) {
  return (
    <div
      style={{
        padding: 20,
        background: C.white,
        border: `1.5px dashed ${C.borderDash}`,
        borderRadius: 12,
        textAlign: 'center',
        opacity: 0.85,
      }}
    >
      <div
        style={{
          fontSize: 32,
          marginBottom: 10,
          lineHeight: 1,
          opacity: 0.5,
        }}
      >
        {item.icon}
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: C.slate,
          marginBottom: 6,
        }}
      >
        {item.label}
      </div>
      <div
        style={{
          fontSize: 12,
          color: C.muted,
          lineHeight: 1.5,
          marginBottom: 12,
        }}
      >
        {item.descripcion}
      </div>
      <span
        style={{
          display: 'inline-block',
          padding: '4px 10px',
          fontSize: 10,
          fontWeight: 700,
          color: C.muted,
          background: C.bgSoft,
          border: `1px solid ${C.border}`,
          borderRadius: 999,
          letterSpacing: '0.1em',
        }}
      >
        PRÓXIMAMENTE
      </span>
    </div>
  );
}
