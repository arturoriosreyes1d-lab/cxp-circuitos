import React, { useState, useRef, useMemo } from "react";

/* ─────────────────────────────────────────────────────────────
   ExportarReporteCxC — Botón + Modal para generar reportes de
   Cuentas por Cobrar en formato PDF o Imagen para WhatsApp.

   Diseño: tarjeta morada (#534AB7) consistente con la marca
   de Travel Air Solutions. Calendario fiel a la pantalla de
   Proyección + desglose por día con separadores visuales.

   Props:
     - ingresos:    array de ingresos (de CxcView)
     - cobros:      array de cobros (de CxcView)
     - metrics:     objeto { [ingresoId]: { porCobrar, totalCobrado, ... } }
     - kpis:        objeto { MXN: { monto, cobrado, porCobrar, ... } }
     - empresaNombre: string (default "Travel Air Solutions")
     - generadoPor: string (default "Administrador")
     - porFacturar: array (de CxcView) — opcional, para KPI "Por Facturar"
     - diasDiff:    function helper (de CxcView) — recibe fecha ISO, retorna días desde hoy

   Uso en CxcView.jsx:
     <ExportarReporteCxC
       ingresos={ingresos}
       cobros={cobros}
       metrics={metrics}
       kpis={kpis}
       porFacturar={porFacturar}
       empresaNombre="Travel Air Solutions"
       generadoPor="Administrador"
       diasDiff={diasDiff}
     />
   ───────────────────────────────────────────────────────────── */

// ─── Helpers ──────────────────────────────────────────────────
const fmt = n => "$" + new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2, maximumFractionDigits: 2
}).format(Math.abs(n||0));

const fmtShort = n => {
  if (!n) return "—";
  // Importe exacto sin decimales (formato compacto, redondeado al entero)
  return "$" + new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(Math.abs(Math.round(n)));
};

const MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const MESES_ES_CORTO = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const DIAS_ES_CORTO = ["dom","lun","mar","mié","jue","vie","sáb"];

const fechaHoy = () => {
  const d = new Date();
  return `${d.getDate()} ${MESES_ES[d.getMonth()].toLowerCase()} ${d.getFullYear()}`;
};

const fechaDesgloseLabel = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return `${DIAS_ES_CORTO[d.getDay()]} ${d.getDate()} ${MESES_ES_CORTO[d.getMonth()]}`;
};

// Calcula default del fallback diasDiff (si no llegó como prop)
const defaultDiasDiff = (fechaIso) => {
  if (!fechaIso) return null;
  const hoy = new Date();
  hoy.setHours(0,0,0,0);
  const f = new Date(fechaIso + "T00:00:00");
  return Math.round((f - hoy) / (1000*60*60*24));
};

// ─── Carga lazy de jspdf ──────────────────────────────────────
let _jspdfPromise = null;
const loadJsPdf = () => {
  if (_jspdfPromise) return _jspdfPromise;
  _jspdfPromise = new Promise((resolve, reject) => {
    if (window.jspdf && window.jspdf.jsPDF) return resolve(window.jspdf.jsPDF);
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => resolve(window.jspdf.jsPDF);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return _jspdfPromise;
};

// ─── Carga lazy de html2canvas (por si no está globalmente) ────
let _h2cPromise = null;
const loadH2C = () => {
  if (_h2cPromise) return _h2cPromise;
  _h2cPromise = new Promise((resolve, reject) => {
    if (window.html2canvas) return resolve(window.html2canvas);
    // Si está en npm, esto resuelve. Si no, fallback a CDN.
    import("html2canvas").then(m => resolve(m.default || m)).catch(() => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      script.onload = () => resolve(window.html2canvas);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  });
  return _h2cPromise;
};

// ─────────────────────────────────────────────────────────────
export default function ExportarReporteCxC({
  ingresos = [],
  cobros = [],
  metrics = {},
  kpis = {},
  porFacturar = [],
  empresaNombre = "Travel Air Solutions",
  generadoPor = "Administrador",
  diasDiff,
}) {
  const dDiff = diasDiff || defaultDiasDiff;

  const [modalOpen, setModalOpen] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const reportRef = useRef(null);

  // Mes seleccionado (default: mes siguiente al actual)
  const ahora = new Date();
  const defaultMes = `${ahora.getFullYear()}-${String(ahora.getMonth()+2).padStart(2,"0")}`;
  const [mesSel, setMesSel] = useState(defaultMes);

  // Lista de meses para el selector (mes actual + 5 meses adelante + 2 atrás)
  const mesesOpciones = useMemo(() => {
    const arr = [];
    for (let offset = -2; offset <= 5; offset++) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() + offset, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      const label = `${MESES_ES[d.getMonth()]} ${d.getFullYear()}`;
      const isActual = offset === 0;
      const isSiguiente = offset === 1;
      arr.push({ key, label, suffix: isActual ? " (actual)" : isSiguiente ? " (siguiente)" : "" });
    }
    return arr;
  }, []);

  // ─── Cartera por cliente ────────────────────────────────────
  const cartera = useMemo(() => {
    const porCliente = {};
    ingresos.forEach(ing => {
      if (ing.oculta) return;
      const m = metrics[ing.id] || {};
      const saldo = m.porCobrar || 0;
      if (saldo <= 0) return;
      const cli = ing.cliente || "Sin cliente";
      if (!porCliente[cli]) {
        porCliente[cli] = { cliente: cli, moneda: ing.moneda || "MXN",
          total: 0, vencido: 0, d1_15: 0, d16_30: 0, d31_60: 0, d60: 0 };
      }
      const c = porCliente[cli];
      c.total += saldo;
      const d = dDiff(ing.fechaVencimiento);
      if (d === null)        c.d1_15  += saldo;
      else if (d < 0)        c.vencido += saldo;
      else if (d <= 15)      c.d1_15  += saldo;
      else if (d <= 30)      c.d16_30 += saldo;
      else if (d <= 60)      c.d31_60 += saldo;
      else                   c.d60    += saldo;
    });
    return Object.values(porCliente).sort((a,b) => b.total - a.total);
  }, [ingresos, metrics, dDiff]);

  // ─── Cobros proyectados del mes seleccionado ────────────────
  const proyeccionMes = useMemo(() => {
    if (!mesSel) return { cobros: [], total: 0 };
    // Indexar por fecha
    const porFecha = {};
    let total = 0;
    // 1. Cobros tipo='proyectado' con fechaCobro en el mes
    cobros.forEach(c => {
      if (c.tipo !== "proyectado") return;
      if (!c.fechaCobro || !c.fechaCobro.startsWith(mesSel)) return;
      const ing = ingresos.find(i => i.id === c.ingresoId);
      if (!ing || ing.oculta) return;
      if (!porFecha[c.fechaCobro]) porFecha[c.fechaCobro] = [];
      porFecha[c.fechaCobro].push({ cliente: ing.cliente || "Sin cliente", monto: c.monto });
      total += c.monto;
    });
    // 2. Ingresos sin cobros proyectados, con fechaFicticia o fechaVencimiento en el mes
    ingresos.forEach(ing => {
      if (ing.oculta) return;
      const tieneProy = cobros.some(c => c.ingresoId === ing.id && c.tipo === "proyectado");
      if (tieneProy) return;
      const fecha = ing.fechaFicticia || ing.fechaVencimiento;
      if (!fecha || !fecha.startsWith(mesSel)) return;
      const m = metrics[ing.id] || {};
      const monto = m.porCobrar || 0;
      if (monto <= 0) return;
      if (!porFecha[fecha]) porFecha[fecha] = [];
      porFecha[fecha].push({ cliente: ing.cliente || "Sin cliente", monto });
      total += monto;
    });
    // Convertir a array ordenado por fecha
    const out = Object.keys(porFecha).sort().map(fecha => ({
      fecha,
      clientes: porFecha[fecha].sort((a,b) => b.monto - a.monto),
    }));
    return { cobros: out, total };
  }, [cobros, ingresos, metrics, mesSel]);

  // ─── KPIs MXN (los principales que se ven en pantalla) ──────
  const kpisMostrar = useMemo(() => {
    const k = kpis.MXN || {};
    // FIX: el chip "MXN Total" en pantalla usa k.porCobrar (no k.monto)
    // k.monto = monto facturado total (incluye ya cobrado)
    // k.porCobrar = monto pendiente de cobrar (lo que muestra la pantalla)
    const mxnTotal = (k.porCobrar || 0);
    // Por Facturar = suma de porFacturar en MXN
    const pf = (porFacturar || []).filter(p => (p.moneda || "MXN") === "MXN")
      .reduce((s,p) => s + (+p.monto||0), 0);
    // Cobrado del mes actual
    const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,"0")}`;
    const cobradoMes = cobros.filter(c =>
      c.tipo === "realizado" &&
      c.fechaCobro &&
      c.fechaCobro.startsWith(mesActual) &&
      !ingresos.find(i => i.id === c.ingresoId)?.oculta
    ).reduce((s,c) => {
      const ing = ingresos.find(i => i.id === c.ingresoId);
      if ((ing?.moneda || "MXN") !== "MXN") return s;
      return s + (c.monto || 0);
    }, 0);
    return {
      mxnTotal,
      porFacturar: pf,
      totalCxc: mxnTotal + pf, // Por Cobrar + Por Facturar (igual que el chip "Total CxC")
      cobradoMes,
      mesActualLabel: `COBRADO EN ${MESES_ES[ahora.getMonth()].toUpperCase()} ${ahora.getFullYear()}`,
    };
  }, [kpis, porFacturar, cobros, ingresos]);

  // ─── Render del reporte (offscreen) ─────────────────────────
  // parte: 'resumen' | 'proyeccion' | 'desglose' | 'completo'
  // partInfo: { num, total, descripcion } para mostrar "Parte 1/3 · Resumen"
  const renderReporteHTML = (parte = 'completo', partInfo = null, desgloseRange = null) => {
    const mesNombre = (() => {
      const opt = mesesOpciones.find(m => m.key === mesSel);
      return opt ? opt.label : mesSel;
    })();

    // Construir calendario
    const [añoStr, mesStr] = mesSel.split("-");
    const año = parseInt(añoStr, 10);
    const mesIdx = parseInt(mesStr, 10) - 1;
    const diasEnMes = new Date(año, mesIdx + 1, 0).getDate();
    const dowPrimerDia = new Date(año, mesIdx, 1).getDay();
    const cobrosPorDia = {};
    proyeccionMes.cobros.forEach(c => {
      const dia = parseInt(c.fecha.split("-")[2], 10);
      cobrosPorDia[dia] = c.clientes.reduce((s,x) => s + x.monto, 0);
    });
    const celdas = [];
    for (let i = 0; i < dowPrimerDia; i++) celdas.push(null);
    for (let d = 1; d <= diasEnMes; d++) celdas.push(d);
    while (celdas.length % 7 !== 0) celdas.push(null);

    const mostrarResumen   = parte === 'completo' || parte === 'resumen';
    const mostrarProyCal   = parte === 'completo' || parte === 'proyeccion' || parte === 'calendario';
    const mostrarDesglose  = parte === 'completo' || parte === 'proyeccion' || parte === 'desglose';
    const desgloseSolo     = parte === 'desglose';
    const calendarioSolo   = parte === 'calendario';

    return (
      <div ref={reportRef} style={{
        width: 800,
        background: "#F7F7F8",
        padding: 18,
        borderRadius: 12,
        fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',
        color: "#1a1a1a",
      }}>
        {/* Header morado */}
        <div style={{
          background: "#534AB7",
          color: "white",
          padding: "16px 18px",
          borderRadius: "10px 10px 0 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{empresaNombre}</div>
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
              Reporte CxC · {fechaHoy()}{partInfo ? ` · Parte ${partInfo.num}/${partInfo.total} · ${partInfo.descripcion}` : ''}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 10, opacity: 0.85 }}>
            <div>Generado por</div>
            <div style={{ fontWeight: 500 }}>{generadoPor}</div>
          </div>
        </div>

        {/* Bloque 1: Resumen Financiero */}
        {mostrarResumen && (
        <Block>
          <Eyebrow>CUENTAS POR COBRAR</Eyebrow>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Kpi color="azul"   label="MXN TOTAL"     value={fmt(kpisMostrar.mxnTotal)} />
            <Kpi color="rosa"   label="POR FACTURAR"  value={fmt(kpisMostrar.porFacturar)} />
            <Kpi color="morado" label="TOTAL CXC"     value={fmt(kpisMostrar.totalCxc)} />
            <Kpi color="verde"  label={kpisMostrar.mesActualLabel} value={fmt(kpisMostrar.cobradoMes)} />
          </div>
        </Block>
        )}

        {/* Bloque 2: Cartera por cliente */}
        {mostrarResumen && (
        <Block>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Eyebrow style={{ margin: 0 }}>CARTERA POR CLIENTE</Eyebrow>
            <div style={{ fontSize: 10, color: "#999" }}>
              {cartera.length} cliente{cartera.length !== 1 ? "s" : ""} con saldo · ordenada por monto
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ background: "#F4F0FB", color: "#26215C" }}>
                <th style={thStyle}>Cliente</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Vencido</th>
                <th style={{ ...thStyle, textAlign: "right" }}>1-15d</th>
                <th style={{ ...thStyle, textAlign: "right" }}>16-30d</th>
                <th style={{ ...thStyle, textAlign: "right" }}>31-60d</th>
                <th style={{ ...thStyle, textAlign: "right" }}>+60d</th>
              </tr>
            </thead>
            <tbody>
              {cartera.length === 0 ? (
                <tr><td colSpan={7} style={emptyRowStyle}>Sin cartera por cobrar</td></tr>
              ) : cartera.map((c, i) => (
                <tr key={i} style={{ borderBottom: "0.5px solid #E5E5E5" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 500 }}>{c.cliente}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmt(c.total)}</td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    {c.vencido > 0
                      ? <span style={{ background: "#FCEBEB", color: "#791F1F", padding: "2px 6px", borderRadius: 4 }}>{fmtShort(c.vencido)}</span>
                      : <span style={{ color: "#999" }}>—</span>}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    {c.d1_15 > 0 ? <span style={{ color: "#3B6D11" }}>{fmtShort(c.d1_15)}</span> : <span style={{ color: "#999" }}>—</span>}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    {c.d16_30 > 0 ? fmtShort(c.d16_30) : <span style={{ color: "#999" }}>—</span>}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    {c.d31_60 > 0 ? fmtShort(c.d31_60) : <span style={{ color: "#999" }}>—</span>}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    {c.d60 > 0 ? fmtShort(c.d60) : <span style={{ color: "#999" }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>
        )}

        {/* Bloque 3: Proyección — calendario + desglose */}
        {(mostrarProyCal || mostrarDesglose) && (
        <Block last>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <Eyebrow style={{ margin: 0 }}>{
                calendarioSolo ? 'CALENDARIO DE COBROS PROYECTADOS'
                : desgloseSolo ? 'DESGLOSE DE COBROS POR DÍA'
                : 'PROYECCIÓN DE COBROS'
              }</Eyebrow>
              <div style={{ fontSize: 10, color: "#777", marginTop: 2 }}>{
                calendarioSolo ? 'Vista mensual de cobros esperados'
                : desgloseSolo ? 'Detalle de cliente y monto por cada día'
                : 'Calendario y desglose detallado por día'
              }</div>
            </div>
            <div style={{ background: "#EEEDFE", padding: "6px 14px", borderRadius: 999 }}>
              <div style={{ fontSize: 9, color: "#534AB7", letterSpacing: "0.05em" }}>ESTE MES</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#26215C" }}>{fmt(proyeccionMes.total)} MXN</div>
            </div>
          </div>

          {/* Calendario */}
          {mostrarProyCal && (
          <div style={{ borderRadius: 10, overflow: "hidden", border: "0.5px solid #E5E0F0", marginBottom: 18 }}>
            <div style={{
              background: "linear-gradient(90deg, #6B3FA0 0%, #4B2A8A 100%)",
              color: "white",
              textAlign: "center",
              padding: 10,
              fontSize: 14,
              fontWeight: 500,
            }}>
              {mesNombre}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, tableLayout: "fixed", background: "#FBF8FD" }}>
              <thead>
                <tr style={{ background: "#F4EBFD" }}>
                  {["DOM","LUN","MAR","MIÉ","JUE","VIE","SÁB"].map(d => (
                    <th key={d} style={{ padding: "6px 4px", color: "#534AB7", fontWeight: 500, letterSpacing: "0.1em" }}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: celdas.length / 7 }).map((_, r) => (
                  <tr key={r}>
                    {[0,1,2,3,4,5,6].map(c => {
                      const dia = celdas[r*7 + c];
                      if (dia === null) {
                        return <td key={c} style={calCellStyle(false)}></td>;
                      }
                      const monto = cobrosPorDia[dia];
                      if (monto) {
                        return (
                          <td key={c} style={calCellStyle(true)}>
                            <div style={{ fontWeight: 500, color: "#4B2A8A", fontSize: 12 }}>{dia}</div>
                            <div style={{
                              background: "#6B3FA0", color: "white", fontSize: 13,
                              padding: "3px 8px", borderRadius: 999, marginTop: 4,
                              fontWeight: 700, display: "inline-block",
                              whiteSpace: "nowrap",
                              fontVariantNumeric: "tabular-nums",
                            }}>{fmtShort(monto)}</div>
                          </td>
                        );
                      }
                      return (
                        <td key={c} style={calCellStyle(false)}>
                          <div style={{ color: "#B8A8D6", fontSize: 11 }}>{dia}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          {/* Desglose */}
          {mostrarDesglose && (() => {
            // Filtrar el subconjunto de cobros según desgloseRange (si viene)
            const cobrosVis = desgloseRange
              ? proyeccionMes.cobros.slice(desgloseRange[0], desgloseRange[1])
              : proyeccionMes.cobros;
            return cobrosVis.length > 0 ? (
            <>
              {!desgloseSolo && (
                <div style={{ fontSize: 10, color: "#534AB7", letterSpacing: "0.1em", marginBottom: 10, fontWeight: 500 }}>
                  DESGLOSE DE COBROS POR DÍA{desgloseRange && desgloseRange[0] > 0 ? ' (continuación)' : ''}
                </div>
              )}
              <div style={{ border: "0.5px solid #E5E0F0", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                  <thead>
                    <tr style={{ background: "#F4EBFD", color: "#26215C" }}>
                      <th style={{ ...thStyle, padding: "8px 12px", width: 120 }}>Día</th>
                      <th style={{ ...thStyle, padding: "8px 12px" }}>Cliente</th>
                      <th style={{ ...thStyle, padding: "8px 12px", textAlign: "right" }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cobrosVis.map((d, di) => {
                      const fechaLabel = fechaDesgloseLabel(d.fecha);
                      return d.clientes.map((cl, ci) => (
                        <tr key={`${di}-${ci}`} style={{
                          borderTop: ci === 0 ? "2px solid #6B3FA0" : "none",
                        }}>
                          {ci === 0 && (
                            <td style={{ padding: "8px 12px", color: "#4B2A8A", fontWeight: 700 }} rowSpan={d.clientes.length}>
                              {fechaLabel}
                            </td>
                          )}
                          <td style={{ padding: "8px 12px" }}>{cl.cliente}</td>
                          <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 500 }}>{fmt(cl.monto)}</td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={{
              padding: 24, border: "0.5px solid #E5E0F0", borderRadius: 8,
              textAlign: "center", color: "#999", fontStyle: "italic", fontSize: 12,
            }}>
              Sin cobros proyectados para {mesNombre}
            </div>
          );
          })()}
        </Block>
        )}
      </div>
    );
  };

  // Estado de qué "parte" está renderizada off-screen (para captura por bloques)
  const [parteRender, setParteRender] = useState({ parte: 'completo', partInfo: null, desgloseRange: null });

  // ─── Captura + exportación ──────────────────────────────────
  const captureCanvas = async () => {
    const html2canvas = await loadH2C();
    const node = reportRef.current;
    if (!node) throw new Error("No se encontró el nodo del reporte");
    return html2canvas(node, {
      scale: 2,
      backgroundColor: "#F7F7F8",
      useCORS: true,
      logging: false,
    });
  };

  // Espera a que React re-renderice + da tiempo a html2canvas
  const esperarRenderizado = () => new Promise(r => {
    requestAnimationFrame(() => {
      setTimeout(r, 150);
    });
  });

  // Calcula las "partes" del reporte. Siempre 3:
  //   1. Resumen + Cartera por Cliente
  //   2. Calendario (sin desglose)
  //   3. Desglose por día (sin calendario)
  const calcularPartes = () => {
    return [
      { parte: 'resumen',     partInfo: { num: 1, total: 3, descripcion: 'Cuentas por Cobrar' },     desgloseRange: null, nombreSufijo: 'Resumen'    },
      { parte: 'calendario',  partInfo: { num: 2, total: 3, descripcion: 'Calendario de Cobros' },   desgloseRange: null, nombreSufijo: 'Calendario' },
      { parte: 'desglose',    partInfo: { num: 3, total: 3, descripcion: 'Desglose por Día' },       desgloseRange: null, nombreSufijo: 'Desglose'   },
    ];
  };

  const handleExport = async (formato) => {
    setGenerando(true);
    try {
      const partes = calcularPartes();
      const fechaArchivo = new Date().toISOString().slice(0,10);
      const nombreEmpresa = empresaNombre.replace(/ /g, "_");

      // Capturar cada parte → canvas
      const canvases = [];
      for (let i = 0; i < partes.length; i++) {
        const p = partes[i];
        setLoadingMsg(`Generando ${formato.toUpperCase()} · Parte ${p.partInfo.num} de ${p.partInfo.total}…`);
        // Cambiar el render off-screen a esta parte
        setParteRender(p);
        await esperarRenderizado();
        const canvas = await captureCanvas();
        canvases.push({ canvas, sufijo: p.nombreSufijo, partInfo: p.partInfo });
      }

      if (formato === "pdf") {
        // Un solo PDF con cada parte como página separada
        const jsPDF = await loadJsPdf();
        const pdfWidth = 210; // mm
        let pdf = null;
        for (let i = 0; i < canvases.length; i++) {
          const { canvas } = canvases[i];
          const imgData = canvas.toDataURL("image/png");
          const ratio = canvas.height / canvas.width;
          const pdfHeight = pdfWidth * ratio;
          if (i === 0) {
            pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
          } else {
            pdf.addPage();
          }
          // Si una parte es muy alta, partirla en sub-páginas A4
          if (pdfHeight <= 297) {
            pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
          } else {
            const pageHeight = 297;
            let position = 0;
            let subPage = 0;
            while (position < pdfHeight) {
              if (subPage > 0) pdf.addPage();
              pdf.addImage(imgData, "PNG", 0, -position, pdfWidth, pdfHeight);
              position += pageHeight;
              subPage++;
            }
          }
        }
        pdf.save(`Reporte_CxC_${nombreEmpresa}_${fechaArchivo}.pdf`);
      } else {
        // PNG: descargar cada parte como archivo separado (secuencial)
        for (let i = 0; i < canvases.length; i++) {
          const { canvas, sufijo } = canvases[i];
          await new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
              if (!blob) return reject(new Error("No se pudo crear blob"));
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `Reporte_CxC_${nombreEmpresa}_${fechaArchivo}_${sufijo}.png`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              resolve();
            }, "image/png");
          });
          // Pausa breve entre descargas para que el navegador no las junte
          if (i < canvases.length - 1) await new Promise(r => setTimeout(r, 400));
        }
      }

      setModalOpen(false);
    } catch (err) {
      console.error("[ExportarReporteCxC] Error:", err);
      alert("Error al generar el reporte: " + err.message);
    } finally {
      setGenerando(false);
      setLoadingMsg("");
      // Resetear estado de partes para próxima apertura
      setParteRender({ parte: 'completo', partInfo: null, desgloseRange: null });
    }
  };

  // ─── UI: Botón + Modal ──────────────────────────────────────
  return (
    <>
      {/* Botón en la toolbar */}
      <button
        onClick={() => setModalOpen(true)}
        style={{
          background: "#534AB7",
          color: "#fff",
          padding: "8px 16px",
          fontSize: 13,
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          fontWeight: 700,
          fontFamily: "inherit",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          boxShadow: "0 2px 8px rgba(83,74,183,0.25)",
        }}
        title="Generar reporte para tu jefe (PDF o WhatsApp)"
      >
        📊 Generar Reporte CxC
      </button>

      {/* Reporte renderizado off-screen para captura */}
      <div style={{
        position: "fixed",
        left: -10000,
        top: 0,
        zIndex: -1,
        pointerEvents: "none",
      }}>
        {modalOpen && renderReporteHTML(parteRender.parte, parteRender.partInfo, parteRender.desgloseRange)}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          onClick={() => !generando && setModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: 12,
              padding: 24,
              width: "100%",
              maxWidth: 420,
              borderTop: "5px solid #534AB7",
              boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
              fontFamily: "inherit",
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 700, color: "#4B2A8A", marginBottom: 4 }}>
              📊 Generar Reporte CxC
            </div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 18 }}>
              Selecciona el mes de proyección y descarga el formato que prefieras
            </div>

            {/* Selector de mes */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#534AB7", letterSpacing: "0.05em", marginBottom: 8, fontWeight: 700 }}>
                MES DE PROYECCIÓN
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                {mesesOpciones.map(opt => (
                  <label
                    key={opt.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      background: mesSel === opt.key ? "#F4EBFD" : "#FBF8FD",
                      border: mesSel === opt.key ? "2px solid #534AB7" : "1px solid #E5E0F0",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 13,
                      color: mesSel === opt.key ? "#4B2A8A" : "#1a1a1a",
                      fontWeight: mesSel === opt.key ? 600 : 400,
                    }}
                  >
                    <input
                      type="radio"
                      name="mes-sel"
                      value={opt.key}
                      checked={mesSel === opt.key}
                      onChange={e => setMesSel(e.target.value)}
                      style={{ accentColor: "#534AB7" }}
                      disabled={generando}
                    />
                    {opt.label}<span style={{ color: "#888", fontWeight: 400, fontSize: 11 }}>{opt.suffix}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Botones de formato */}
            <div style={{
              borderTop: "0.5px solid #E5E5E5",
              paddingTop: 14,
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 11, color: "#534AB7", letterSpacing: "0.05em", marginBottom: 8, fontWeight: 700 }}>
                FORMATO DE DESCARGA
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button
                  onClick={() => handleExport("pdf")}
                  disabled={generando}
                  style={{
                    background: generando ? "#9c9bd1" : "#534AB7",
                    color: "white",
                    border: "none",
                    padding: "12px",
                    borderRadius: 6,
                    fontSize: 13,
                    cursor: generando ? "wait" : "pointer",
                    fontWeight: 700,
                    fontFamily: "inherit",
                  }}
                >
                  📄 Descargar PDF
                </button>
                <button
                  onClick={() => handleExport("png")}
                  disabled={generando}
                  style={{
                    background: "white",
                    color: "#534AB7",
                    border: "1.5px solid #534AB7",
                    padding: "12px",
                    borderRadius: 6,
                    fontSize: 13,
                    cursor: generando ? "wait" : "pointer",
                    fontWeight: 700,
                    fontFamily: "inherit",
                    opacity: generando ? 0.6 : 1,
                  }}
                >
                  🖼 Imagen WhatsApp
                </button>
              </div>
            </div>

            {/* Mensaje loading o cancelar */}
            {generando ? (
              <div style={{
                background: "#F4EBFD",
                color: "#4B2A8A",
                padding: 10,
                borderRadius: 6,
                fontSize: 12,
                textAlign: "center",
                fontWeight: 600,
              }}>
                ⏳ {loadingMsg}
              </div>
            ) : (
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  background: "transparent",
                  color: "#999",
                  border: "none",
                  padding: 6,
                  fontSize: 12,
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "center",
                  fontFamily: "inherit",
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Subcomponentes auxiliares ────────────────────────────────
const Block = ({ children, last }) => (
  <div style={{
    background: "white",
    padding: 18,
    borderLeft: "4px solid #534AB7",
    borderRight: "0.5px solid #E5E0F0",
    marginTop: 8,
    borderRadius: last ? "0 0 10px 10px" : 0,
  }}>{children}</div>
);

const Eyebrow = ({ children, style }) => (
  <div style={{
    fontSize: 11,
    color: "#534AB7",
    letterSpacing: "0.1em",
    marginBottom: 12,
    fontWeight: 500,
    ...style,
  }}>{children}</div>
);

const Kpi = ({ color, label, value }) => {
  const palettes = {
    azul:   { bg: "#E6F1FB", labelColor: "#0C447C", valueColor: "#042C53" },
    rosa:   { bg: "#FBEAF0", labelColor: "#72243E", valueColor: "#4B1528" },
    morado: { bg: "#EEEDFE", labelColor: "#3C3489", valueColor: "#26215C" },
    verde:  { bg: "#EAF3DE", labelColor: "#27500A", valueColor: "#173404" },
  };
  const p = palettes[color] || palettes.azul;
  return (
    <div style={{ padding: "10px 14px", borderRadius: 6, background: p.bg }}>
      <div style={{ fontSize: 10, color: p.labelColor }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 500, color: p.valueColor }}>{value}</div>
    </div>
  );
};

const thStyle = { textAlign: "left", padding: "7px 8px", fontWeight: 500 };
const emptyRowStyle = {
  background: "#FAFAFA", color: "#999", fontStyle: "italic",
  textAlign: "center", padding: 12, fontSize: 11,
};
const calCellStyle = (hasCobro) => ({
  height: 80,
  padding: 6,
  border: "0.5px solid #ECE3F5",
  verticalAlign: "top",
  background: hasCobro ? "#F4EBFD" : "#FBF8FD",
});
