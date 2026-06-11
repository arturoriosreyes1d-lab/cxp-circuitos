import React, { useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  upsertIngreso, deleteIngreso as deleteIngresoDB,
  insertCobro, deleteCobro as deleteCobro_DB, updateCobro,
  upsertInvoiceIngreso, deleteInvoiceIngreso as deleteInvoiceIngresoDB,
  upsertCategoriaIngreso, deleteCategoriaIngreso as deleteCategoriaIngresoDB,
  updateIngresoField,
  deleteTASsinActividad, deleteTASTodo,
} from "./db.js";

/* ── Palette (same as CxpApp) ──────────────────────────────────────────── */
const C = {
  navy:"#0F2D4A", blue:"#1565C0", sky:"#2196F3", teal:"#00897B",
  cream:"#FAFBFC", surface:"#FFFFFF", border:"#E2E8F0", muted:"#64748B",
  text:"#1A2332", danger:"#E53935", warn:"#F59E0B", ok:"#43A047",
  mxn:"#1565C0", usd:"#2E7D32", eur:"#6A1B9A",
  green:"#1B5E20",
};

/* ── Styles ────────────────────────────────────────────────────────────── */
const inputStyle = { padding:"8px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:14, outline:"none", background:"#FAFBFC", width:"100%", fontFamily:"inherit", color:"#1A2332", boxSizing:"border-box" };
const selectStyle = { ...inputStyle, cursor:"pointer" };
const btnStyle = { padding:"9px 20px", borderRadius:10, border:"none", background:"#1565C0", color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" };
const iconBtn = { background:"none", border:"none", cursor:"pointer", fontSize:16, padding:"4px 6px" };

/* ── Helpers ───────────────────────────────────────────────────────────── */
const fmt = n => isNaN(n)||n===""||n===null ? "—" : new Intl.NumberFormat("es-MX",{minimumFractionDigits:2,maximumFractionDigits:2}).format(+n);
const today = () => new Date().toISOString().split("T")[0];
const uid = () => Math.random().toString(36).slice(2,10);
const addDays = (ds, d) => { if(!ds||!d) return ""; const x=new Date(ds+"T12:00:00"); x.setDate(x.getDate()+ +d); return x.toISOString().split("T")[0]; };

const DEFAULT_CATS = ["Circuito","Reprotección","Excursión","Venta Individual","Otro"];
const CAT_COLORS = {
  "Circuito": { bg:"#E3F2FD", border:"#90CAF9", text:"#1565C0" },
  "Reprotección": { bg:"#FFEBEE", border:"#EF9A9A", text:"#C62828" },
  "Excursión": { bg:"#E8F5E9", border:"#A5D6A7", text:"#2E7D32" },
  "Venta Individual": { bg:"#FFF8E1", border:"#FFE082", text:"#F57F17" },
  "Otro": { bg:"#F3F4F6", border:"#D1D5DB", text:"#374151" },
};
const getCatStyle = (cat) => CAT_COLORS[cat] || { bg:"#F3F4F6", border:"#D1D5DB", text:"#374151" };
const monedaSym = (m) => m === "EUR" ? "€" : "$";

/* ── Reusable small components ──────────────────────────────────────────── */
const Field = ({label, children}) => (
  <div style={{marginBottom:16}}>
    <label style={{display:"block",fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.4,marginBottom:6}}>{label}</label>
    {children}
  </div>
);

const ModalShell = ({title,onClose,wide,extraWide,children}) => (
  <div style={{position:"fixed",inset:0,background:"rgba(15,45,74,.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,padding:20}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.surface,borderRadius:20,padding:32,width:"100%",maxWidth:extraWide?1200:wide?860:600,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.25)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
        <h2 style={{fontSize:20,fontWeight:800,color:C.navy,margin:0}}>{title}</h2>
        <button onClick={onClose} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:36,height:36,cursor:"pointer",fontSize:18}}>×</button>
      </div>
      {children}
    </div>
  </div>
);

const KpiCard = ({label,value,sub,color=C.navy,icon,bg}) => (
  <div style={{background:bg||C.surface,borderRadius:16,padding:"18px 22px",border:`1px solid ${C.border}`,boxShadow:"0 2px 8px rgba(0,0,0,.05)",flex:1,minWidth:150}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div>
        <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>{label}</div>
        <div style={{fontSize:22,fontWeight:800,color,marginTop:4}}>{value}</div>
        {sub && <div style={{fontSize:11,color:C.muted,marginTop:2}}>{sub}</div>}
      </div>
      <div style={{fontSize:26}}>{icon}</div>
    </div>
  </div>
);

/* ══════════════════════════════════════════════════════════════════════════
   MAIN CxC VIEW COMPONENT
   ══════════════════════════════════════════════════════════════════════════ */
export default function CxcView({
  invoices, payments,
  ingresos, setIngresos,
  cobros, setCobros,
  invoiceIngresos, setInvoiceIngresos,
  categorias, setCategorias,
  empresaId,
  clientes = [],
  esConsulta = false,
  porFacturar = [], setPorFacturar,
  insertPorFacturar, updatePorFacturar, deletePorFacturar, bulkInsertPorFacturar,
}) {
  /* ── Filters ───────────────────────────────────────────────── */
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroMoneda, setFiltroMoneda] = useState("");
  const [filtroFechaFrom, setFiltroFechaFrom] = useState("");
  const [filtroFechaTo, setFiltroFechaTo] = useState("");
  const [filtroSearch, setFiltroSearch] = useState("");
  const [filtroCobro, setFiltroCobro] = useState("");
  const [filtroMesContable, setFiltroMesContable] = useState("");
  const [filtroSegmento, setFiltroSegmento] = useState(""); // "" | "cobrado" | "porCobrar"
  const [mostrarOcultas, setMostrarOcultas] = useState(false);
  const [ocultasModal, setOcultasModal] = useState(false);
  const [filtroDestino, setFiltroDestino] = useState("");

  /* ── Modals ────────────────────────────────────────────────── */
  const [modalIngreso, setModalIngreso] = useState(null);
  const [detailIngreso, setDetailIngreso] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [configCats, setConfigCats] = useState(false);
  const [newCatInput, setNewCatInput] = useState("");
  const [proyeccionView, setProyeccionView] = useState(false);
  const [calDayDetail, setCalDayDetail] = useState(null);
  const [kpiModal, setKpiModal] = useState(null); // { titulo, tipo, moneda }
  const [vistaGrupo, setVistaGrupo] = useState("cliente"); // "ingreso" | "cliente"
  const [clientesExpanded, setClientesExpanded] = useState(new Set());
  const [clienteSortCol, setClienteSortCol] = useState("fechaContable");
  const [clienteSortDir, setClienteSortDir] = useState("desc");
  const [importModal, setImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState(null); // { rows, dupes, catDefault }
  const [importCatDefault, setImportCatDefault] = useState("");
  const [importando, setImportando] = useState(false);
  const importRef = useRef();
  const tasImportRef = useRef();
  const [selectedIngresos, setSelectedIngresos] = useState(new Set());
  const [bulkFechaModal, setBulkFechaModal] = useState(false);
  const [cobroMasivoModal, setCobroMasivoModal] = useState(false);
  const [sortCol, setSortCol] = useState("fecha");
  const [sortDir, setSortDir] = useState("desc");
  const [tasModal, setTasModal] = useState(false);
  const [limpiarModal, setLimpiarModal] = useState(false);
  const [tasPreview, setTasPreview] = useState(null); // {rows, dupes}
  const [tasCatDefault, setTasCatDefault] = useState("");
  const [tasImportando, setTasImportando] = useState(false);
  const [cxcTab, setCxcTab] = useState("activas"); // "activas" | "resumen" | "cobros"
  const [cobrosMesModal, setCobrosMesModal] = useState(false);
  const [agingDetailModal, setAgingDetailModal] = useState(null);
  const [modalSortCol, setModalSortCol] = useState("vencimiento");
  const [modalSortDir, setModalSortDir] = useState("asc");
  const [filtroBancoMes, setFiltroBancoMes] = useState("Todos");
  const [filtroSegmentoMes, setFiltroSegmentoMes] = useState("");
  const [filtroMesVentaMes, setFiltroMesVentaMes] = useState("");
  const [vistaCobrosMes, setVistaCobrosMes] = useState("cliente");
  const [expandedCobrosClientes, setExpandedCobrosClientes] = useState(new Set());
  const [mostrarReporteCobranza, setMostrarReporteCobranza] = useState(false);
  const [reporteDims, setReporteDims] = useState(["mesVenta","destino","segmento"]);
  const [porFacturarModal, setPorFacturarModal] = useState(false);
  const porFacturarRef = useRef();

  /* ── Derived data ──────────────────────────────────────────── */
  const allInvoices = useMemo(() => [
    ...invoices.MXN.map(i=>({...i,moneda:"MXN"})),
    ...invoices.USD.map(i=>({...i,moneda:"USD"})),
    ...invoices.EUR.map(i=>({...i,moneda:"EUR"})),
  ], [invoices]);

  // Days diff helper
  const diasDiff = (fechaStr) => {
    if (!fechaStr) return null;
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const f = new Date(fechaStr+"T12:00:00");
    return Math.round((f - hoy) / 86400000);
  };

  // Destino detection from concepto
  const detectarDestino = (concepto) => {
    const t = String(concepto||"").toUpperCase();
    if(/CUN|CANCUN|CANCÚN/.test(t)) return "Cancún";
    if(/TQO|TULUM/.test(t)) return "Tulum";
    if(/SJD|LOS CABOS|CABOS/.test(t)) return "Los Cabos";
    if(/CZM|COZUMEL/.test(t)) return "Cozumel";
    if(/MID|MERIDA|MÉRIDA/.test(t)) return "Mérida";
    if(/HUX|HUATULCO/.test(t)) return "Huatulco";
    if(/PVR|VALLARTA|PUERTO VALLARTA/.test(t)) return "Puerto Vallarta";
    if(/MZT|MAZATLAN|MAZATLÁN/.test(t)) return "Mazatlán";
    return "Otros";
  };

  const destinosList = useMemo(()=>{
    const s = new Set(ingresos.map(i=>detectarDestino(i.concepto)));
    return [...s].sort();
  },[ingresos]);

  // Segmentos únicos para filtro
  const segmentosList = useMemo(() => {
    const s = new Set(ingresos.map(i=>i.segmento).filter(Boolean));
    return [...s].sort();
  }, [ingresos]);

  // Meses únicos de fechaContable para filtro "Mes de Venta"
  const MESES_NOMBRES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  // Homologar destino desde texto libre
  const homologarDestino = (texto) => {
    const t = String(texto||"").toUpperCase();
    if(/CUN|CANCUN|CANCÚN/.test(t)) return "Cancún";
    if(/TQO|TULUM/.test(t)) return "Tulum";
    if(/SJD|LOS CABOS|CABOS/.test(t)) return "Los Cabos";
    if(/CZM|COZUMEL/.test(t)) return "Cozumel";
    if(/MID|MERIDA|MÉRIDA/.test(t)) return "Mérida";
    if(/HUX|HUATULCO/.test(t)) return "Huatulco";
    if(/PVR|VALLARTA/.test(t)) return "Puerto Vallarta";
    if(/MZT|MAZATLAN|MAZATLÁN/.test(t)) return "Mazatlán";
    return texto || "";
  };

  const DESTINOS_LIST = ["Cancún","Tulum","Los Cabos","Cozumel","Mérida","Huatulco","Puerto Vallarta","Mazatlán"];
  const mesesContableList = useMemo(() => {
    const s = new Set();
    ingresos.forEach(i => {
      if (i.fechaContable) s.add(i.fechaContable.slice(0,7)); // YYYY-MM
    });
    return [...s].sort();
  }, [ingresos]);

  const catList = categorias.length > 0 ? categorias.map(c=>c.nombre) : DEFAULT_CATS;
  const clientesList = [...new Set(ingresos.map(i=>i.cliente))].filter(Boolean).sort();

  /* TC conversion: everything to ingreso's currency
     TC in ingresos = "cuántos MXN vale 1 USD/EUR"
     e.g. ingreso USD at TC=20.5 → 1 USD = 20.5 MXN
  */
  const convertToMonedaIngreso = (monto, monedaFactura, ingreso) => {
    if (!monto || monto === 0) return 0;
    const mi = ingreso.moneda;
    const mf = monedaFactura;
    const tc = ingreso.tipoCambio || 1;
    if (mi === mf) return monto;
    // To MXN from foreign: monto * tc
    if (mi === "MXN" && (mf === "USD" || mf === "EUR")) return monto * tc;
    // To foreign from MXN: monto / tc
    if ((mi === "USD" || mi === "EUR") && mf === "MXN") return monto / tc;
    // USD <-> EUR: use tc as best approximation
    return monto;
  };

  /* Per-ingreso computed metrics */
  const metrics = useMemo(() => {
    const result = {};
    ingresos.forEach(ing => {
      const ingCobros         = cobros.filter(c => c.ingresoId === ing.id);
      const cobrosRealizados  = ingCobros.filter(c => c.tipo !== 'proyectado');
      const cobrosProyectados = ingCobros.filter(c => c.tipo === 'proyectado');
      const totalCobrado      = cobrosRealizados.reduce((s,c) => s+c.monto, 0);
      const totalProyectado   = cobrosProyectados.reduce((s,c) => s+c.monto, 0);
      const porCobrar         = Math.max(0, ing.monto - totalCobrado);

      const vincs = invoiceIngresos.filter(v => v.ingresoId === ing.id);
      let consumido = 0;
      let porPagar  = 0;
      let comprometido = 0;

      vincs.forEach(v => {
        const inv = allInvoices.find(i => i.id === v.invoiceId);
        if (!inv) return;
        const converted = convertToMonedaIngreso(v.montoAsignado, inv.moneda, ing);
        comprometido += converted;
        if (inv.estatus === "Pagado") {
          consumido += converted;
        } else if (inv.estatus === "Parcial") {
          const ratio = (+inv.total||0) > 0 ? (+inv.montoPagado||0)/(+inv.total||0) : 0;
          consumido += converted * ratio;
          porPagar  += converted * (1 - ratio);
        } else {
          porPagar += converted;
        }
      });

      const disponible = totalCobrado - consumido;
      result[ing.id] = {
        totalCobrado,
        totalProyectado,
        porCobrar,
        consumido,
        porPagar,
        comprometido,
        disponible,
        disponibleNeto: disponible - porPagar,
        vinculaciones: vincs.length,
      };
    });
    return result;
  }, [ingresos, cobros, invoiceIngresos, allInvoices]);

  /* KPIs globales — excluye facturas ocultas */
  const kpis = useMemo(() => {
    const byMon = {
      MXN:{monto:0,cobrado:0,porCobrar:0,consumido:0,porPagar:0,disponible:0,disponibleNeto:0},
      USD:{monto:0,cobrado:0,porCobrar:0,consumido:0,porPagar:0,disponible:0,disponibleNeto:0},
      EUR:{monto:0,cobrado:0,porCobrar:0,consumido:0,porPagar:0,disponible:0,disponibleNeto:0},
    };
    ingresos.filter(ing => !ing.oculta).forEach(ing => {
      const m = metrics[ing.id] || {};
      const k = byMon[ing.moneda] || byMon.MXN;
      k.monto         += ing.monto;
      k.cobrado       += m.totalCobrado||0;
      k.porCobrar     += m.porCobrar||0;
      k.consumido     += m.consumido||0;
      k.porPagar      += m.porPagar||0;
      k.disponible    += m.disponible||0;
      k.disponibleNeto+= m.disponibleNeto||0;
    });
    return byMon;
  }, [ingresos, metrics]);

  /* Filtered ingresos */
  const filtered = useMemo(() => {
    return ingresos.filter(ing => {
      if (filtroSearch) {
        const q = filtroSearch.toLowerCase();
        if (!(ing.cliente+(ing.folio||"")+(ing.concepto||"")+(ing.categoria||"")+(ing.segmento||"")).toLowerCase().includes(q)) return false;
      }
      if (filtroCliente && ing.cliente !== filtroCliente) return false;
      if (filtroCategoria && ing.categoria !== filtroCategoria) return false;
      if (filtroMoneda && ing.moneda !== filtroMoneda) return false;
      if (filtroFechaFrom && ing.fecha && ing.fecha < filtroFechaFrom) return false;
      if (filtroFechaTo && ing.fecha && ing.fecha > filtroFechaTo) return false;
      if (filtroCobro === "cobrado") { const m=metrics[ing.id]||{}; if((m.totalCobrado||0)<=0) return false; }
      if (filtroCobro === "porCobrar") { const m=metrics[ing.id]||{}; if((m.porCobrar||0)<=0) return false; }
      if (filtroMesContable && ing.fechaContable && !ing.fechaContable.startsWith(filtroMesContable)) return false;
      if (filtroMesContable && !ing.fechaContable) return false;
      if (filtroSegmento && ing.segmento !== filtroSegmento) return false;
      if (!mostrarOcultas && ing.oculta) return false;
      if (filtroDestino && detectarDestino(ing.concepto) !== filtroDestino) return false;
      return true;
    });
  }, [ingresos, filtroSearch, filtroCliente, filtroCategoria, filtroMoneda, filtroFechaFrom, filtroFechaTo, filtroCobro, filtroMesContable, filtroSegmento, mostrarOcultas, filtroDestino, metrics]);

  /* KPIs filtrados — reflejan búsqueda/filtros activos */
  const kpisFiltered = useMemo(() => {
    const byMon = {
      MXN:{monto:0,cobrado:0,porCobrar:0,consumido:0,porPagar:0,disponible:0,disponibleNeto:0},
      USD:{monto:0,cobrado:0,porCobrar:0,consumido:0,porPagar:0,disponible:0,disponibleNeto:0},
      EUR:{monto:0,cobrado:0,porCobrar:0,consumido:0,porPagar:0,disponible:0,disponibleNeto:0},
    };
    // Always use filtered — it already excludes ocultas and applies all active filters
    filtered.forEach(ing => {
      const m = metrics[ing.id] || {};
      const k = byMon[ing.moneda] || byMon.MXN;
      k.monto         += ing.monto;
      k.cobrado       += m.totalCobrado||0;
      k.porCobrar     += m.porCobrar||0;
      k.consumido     += m.consumido||0;
      k.porPagar      += m.porPagar||0;
      k.disponible    += m.disponible||0;
      k.disponibleNeto+= m.disponibleNeto||0;
    });
    return byMon;
  }, [filtered, metrics]);

  /* Agrupado por cliente */
  /* Activas: excluye ingresos completamente cobrados (porCobrar = 0) */
  const filteredActivas = useMemo(() => {
    return filtered.filter(ing => (metrics[ing.id]?.porCobrar || 0) > 0);
  }, [filtered, metrics]);

  const groupedByCliente = useMemo(() => {
    const map = {};
    filteredActivas.forEach(ing => {
      if (!map[ing.cliente]) map[ing.cliente] = [];
      map[ing.cliente].push(ing);
    });
    const entries = Object.entries(map).map(([cliente, ings]) => {
      // Pre-calc aging totals per moneda (needed for sorting in empresa_2)
      const agByMon = {};
      ings.forEach(ing => {
        const m = metrics[ing.id] || {};
        const mon = ing.moneda;
        if (!agByMon[mon]) agByMon[mon] = {total:0,cobradoParcial:0,vencido:0,pv15:0,pv30:0,pv60:0,pvmas:0};
        const saldo = m.porCobrar || 0;
        const cobrado = m.totalCobrado || 0;
        agByMon[mon].total += saldo;
        if (cobrado > 0 && saldo > 0) agByMon[mon].cobradoParcial += cobrado;
        if (saldo > 0) {
          const d = diasDiff(ing.fechaVencimiento);
          if (d === null)       agByMon[mon].pv15   += saldo;
          else if (d < 0)       agByMon[mon].vencido += saldo;
          else if (d <= 15)     agByMon[mon].pv15   += saldo;
          else if (d <= 30)     agByMon[mon].pv30   += saldo;
          else if (d <= 60)     agByMon[mon].pv60   += saldo;
          else                  agByMon[mon].pvmas  += saldo;
        }
      });
      // Primary moneda for sort (MXN > USD > EUR)
      const monPri = agByMon["MXN"] ? "MXN" : agByMon["USD"] ? "USD" : Object.keys(agByMon)[0] || "MXN";
      const ag = agByMon[monPri] || {total:0,cobradoParcial:0,vencido:0,pv15:0,pv30:0,pv60:0,pvmas:0};
      return [cliente, ings, ag, agByMon];
    });
    // Sort
    entries.sort(([ca,,aga], [cb,,agb]) => {
      let va, vb;
      switch(clienteSortCol) {
        case "cliente":  va=ca; vb=cb; break;
        case "total":    va=aga.total;    vb=agb.total;    break;
        case "cobrado":  va=aga.cobradoParcial; vb=agb.cobradoParcial; break;
        case "vencido":  va=aga.vencido;  vb=agb.vencido;  break;
        case "pv15":     va=aga.pv15;     vb=agb.pv15;     break;
        case "pv30":     va=aga.pv30;     vb=agb.pv30;     break;
        case "pv60":     va=aga.pv60;     vb=agb.pv60;     break;
        case "pvmas":    va=aga.pvmas;    vb=agb.pvmas;    break;
        default:         va=ca; vb=cb;
      }
      let cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
      return clienteSortDir === "asc" ? cmp : -cmp;
    });
    return entries;
  }, [filteredActivas, metrics, clienteSortCol, clienteSortDir]);

  /* Sorted filtered list */
  const sortedFiltered = useMemo(() => {
    const getVal = (ing, col) => {
      const m = metrics[ing.id] || {};
      switch(col) {
        case 'cliente':        return ing.cliente||"";
        case 'folio':          return ing.folio||"";
        case 'segmento':       return ing.segmento||"";
        case 'fechaContable':  return ing.fechaContable||"";
        case 'fecha':          return ing.fecha||"";
        case 'fechaVencimiento': return ing.fechaVencimiento||"";
        case 'fechaFicticia':  return ing.fechaFicticia||"";
        case 'monto':          return ing.monto||0;
        case 'cobrado':        return m.totalCobrado||0;
        case 'porCobrar':      return m.porCobrar||0;
        case 'consumido':      return m.consumido||0;
        case 'porPagar':       return m.porPagar||0;
        case 'disponible':     return m.disponible||0;
        case 'disponibleNeto': return m.disponibleNeto||0;
        case 'diasVencidos': {
          const d = diasDiff(ing.fechaVencimiento);
          return d !== null && d < 0 ? Math.abs(d) : 0;
        }
        default: return "";
      }
    };
    return [...filteredActivas].sort((a,b) => {
      const va = getVal(a, sortCol);
      const vb = getVal(b, sortCol);
      let cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredActivas, sortCol, sortDir, metrics]);

  /* Totals of filtered (for footer) */
  const filteredTotals = useMemo(() => {
    const t = {};
    ['MXN','USD','EUR'].forEach(mon => {
      const rows = filtered.filter(i => i.moneda === mon);
      if (!rows.length) return;
      t[mon] = {
        monto: rows.reduce((s,i) => s + i.monto, 0),
        cobrado: rows.reduce((s,i) => s + (metrics[i.id]?.totalCobrado||0), 0),
        porCobrar: rows.reduce((s,i) => s + (metrics[i.id]?.porCobrar||0), 0),
        consumido: rows.reduce((s,i) => s + (metrics[i.id]?.consumido||0), 0),
        porPagar: rows.reduce((s,i) => s + (metrics[i.id]?.porPagar||0), 0),
        disponible: rows.reduce((s,i) => s + (metrics[i.id]?.disponible||0), 0),
        disponibleNeto: rows.reduce((s,i) => s + (metrics[i.id]?.disponibleNeto||0), 0),
      };
    });
    return t;
  }, [filtered, metrics]);

  /* Totals of selected */
  const selectedTotals = useMemo(() => {
    const t = {};
    ['MXN','USD','EUR'].forEach(mon => {
      const rows = filtered.filter(i => i.moneda === mon && selectedIngresos.has(i.id));
      if (!rows.length) return;
      t[mon] = {
        monto: rows.reduce((s,i) => s + i.monto, 0),
        cobrado: rows.reduce((s,i) => s + (metrics[i.id]?.totalCobrado||0), 0),
        porCobrar: rows.reduce((s,i) => s + (metrics[i.id]?.porCobrar||0), 0),
      };
    });
    return t;
  }, [filtered, selectedIngresos, metrics]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };
  const sortIcon = (col) => sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  /* ── CRUD Handlers ─────────────────────────────────────────── */
  const saveIngreso = async (data) => {
    const saved = await upsertIngreso({ ...data, empresaId });
    setIngresos(prev => {
      const exists = prev.find(i => i.id === saved.id);
      if (exists) return prev.map(i => i.id === saved.id ? saved : i);
      return [saved, ...prev];
    });
    setModalIngreso(null);
  };

  const handleDeleteIngreso = async () => {
    if (!deleteConfirm) return;
    await deleteIngresoDB(deleteConfirm.id);
    setIngresos(prev => prev.filter(i => i.id !== deleteConfirm.id));
    setInvoiceIngresos(prev => prev.filter(v => v.ingresoId !== deleteConfirm.id));
    setCobros(prev => prev.filter(c => c.ingresoId !== deleteConfirm.id));
    setDeleteConfirm(null);
    if (detailIngreso === deleteConfirm.id) setDetailIngreso(null);
  };

  const addCobro = async (ingresoId, monto, fechaCobro, notas, tipo = 'realizado', banco = '') => {
    const saved = await insertCobro({ ingresoId, monto:+monto, fechaCobro, notas, tipo, banco });
    setCobros(prev => [saved, ...prev]);
  };

  const removeCobro = async (id) => {
    await deleteCobro_DB(id);
    setCobros(prev => prev.filter(c => c.id !== id));
  };

  const addCategoria = async () => {
    const nombre = newCatInput.trim();
    if (!nombre || catList.includes(nombre)) return;
    const saved = await upsertCategoriaIngreso(nombre);
    if (saved) setCategorias(prev => [...prev, saved]);
    else setCategorias(prev => [...prev, { id: uid(), nombre }]);
    setNewCatInput("");
  };

  const removeCategoria = async (cat) => {
    const found = categorias.find(c => c.nombre === cat);
    if (found) await deleteCategoriaIngresoDB(found.id);
    setCategorias(prev => prev.filter(c => c.nombre !== cat));
  };

  /* ── Toggle cliente expandido ──────────────────────────────── */
  const toggleCliente = (nombre) => {
    setClientesExpanded(prev => {
      const n = new Set(prev);
      if (n.has(nombre)) n.delete(nombre); else n.add(nombre);
      return n;
    });
  };

  /* ── Excel import handler ──────────────────────────────────── */
  const parseExcelDate = v => {
    if (!v) return "";
    if (v instanceof Date) return v.toISOString().split("T")[0];
    if (typeof v === "number") {
      const d = new Date(Math.round((v - 25569) * 86400000));
      return d.toISOString().split("T")[0];
    }
    const s = String(v);
    // dd/mm/yyyy or dd-mm-yyyy
    const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) return `${m[3].length===2?"20"+m[3]:m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
    return s;
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type:"array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header:1 });

        // Find header row
        let hi = rows.findIndex(r => r.some(c => String(c||"").toUpperCase().includes("RECEPTOR") || String(c||"").toUpperCase().includes("CLIENTE")));
        if (hi < 0) hi = 0;
        const headers = rows[hi].map(h => String(h||"").trim().toUpperCase());

        const get = (row, keys) => {
          for (const k of keys) {
            const idx = headers.findIndex(h => h.includes(k));
            if (idx >= 0 && row[idx] !== undefined && row[idx] !== null && row[idx] !== "") return row[idx];
          }
          return "";
        };

        const cleanNum = v => {
          if (!v && v !== 0) return 0;
          if (typeof v === "number") return v;
          return +(String(v).replace(/[$,\s]/g, "")) || 0;
        };

        // UUID-based dupe detection (falls back to cliente+fecha+monto if no UUID)
        const existingUUIDs = new Set(ingresos.map(i=>(i.notas||"").trim().toLowerCase()).filter(Boolean));
        const existingKeys = new Set(ingresos.map(i => `${(i.cliente||"").toLowerCase()}|${i.fecha}|${i.monto}`));

        const newRows = [];
        const dupeRows = [];

        rows.slice(hi + 1).filter(r => r.some(c => c)).forEach(row => {
          const cliente = String(get(row, ["RECEPTOR","CLIENTE","NOMBRE"]) || "").trim();
          const fecha   = parseExcelDate(get(row, ["FECHA"]));
          const monto   = cleanNum(get(row, ["TOTAL"]));
          const moneda  = (() => {
            const raw = String(get(row, ["MONEDA","MON","CURRENCY"]) || "MXN").trim().toUpperCase();
            if (raw.includes("USD")||raw.includes("DOLAR")) return "USD";
            if (raw.includes("EUR")||raw.includes("EURO"))  return "EUR";
            return "MXN";
          })();
          const uuid    = String(get(row, ["UUID"]) || "");
          const serie   = String(get(row, ["SERIE"]) || "");
          const folio   = String(get(row, ["FOLIO"]) || "");
          const tipo    = String(get(row, ["TIPO"]) || "Factura");

          if (!cliente || !monto) return;

          // Check dupe: UUID first, then cliente+fecha+monto
          const uuidLow = uuid ? uuid.toLowerCase() : "";
          if (uuidLow && existingUUIDs.has(uuidLow)) {
            dupeRows.push({ cliente, fecha, monto, moneda });
            return;
          }
          const key = `${cliente.toLowerCase()}|${fecha}|${monto}`;
          if (!uuidLow && existingKeys.has(key)) {
            dupeRows.push({ cliente, fecha, monto, moneda });
            return;
          }
          if (uuidLow) existingUUIDs.add(uuidLow);
          existingKeys.add(key);

          newRows.push({
            id: Math.random().toString(36).slice(2,10),
            cliente,
            concepto: [serie, folio].filter(Boolean).join("-") || tipo,
            categoria: "",
            monto,
            moneda,
            tipoCambio: 1,
            fecha,
            notas: uuid,
          });
        });

        setImportPreview({ rows: newRows, dupes: dupeRows });
        setImportCatDefault(catList[0] || "");
      } catch(err) {
        alert("Error al leer el archivo: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const confirmarImport = async () => {
    if (!importPreview?.rows?.length) return;
    setImportando(true);
    const rowsToSave = importPreview.rows.map(r => ({
      ...r,
      categoria: importCatDefault || catList[0] || "Otro",
      empresaId,
    }));
    const saved = [];
    for (const row of rowsToSave) {
      const s = await upsertIngreso(row);
      saved.push(s);
    }
    setIngresos(prev => [...saved, ...prev]);
    setImportPreview(null);
    setImportModal(false);
    setImportando(false);
  };

  /* ── TAS (TravelAirSolutions) Excel import ───────────────────── */
  const handleTasImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type:"array", cellDates:true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:false, dateNF:'yyyy-mm-dd' });

        // Find header row
        let hi = rows.findIndex(r => r.some(c => String(c||"").toUpperCase().includes("SEGMENTO")));
        if (hi < 0) hi = 0;
        const headers = rows[hi].map(h => String(h||"").trim().toUpperCase());

        const get = (row, keys) => {
          for (const k of keys) {
            const idx = headers.findIndex(h => h.includes(k));
            if (idx >= 0 && row[idx] !== undefined && row[idx] !== "" && row[idx] !== null) return row[idx];
          }
          return "";
        };

        const parseDate = v => {
          if (!v) return "";
          if (v instanceof Date) return v.toISOString().split("T")[0];
          const s = String(v).trim();
          if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
          if (/^\d+$/.test(s)) {
            const d = new Date(Math.round((+s - 25569) * 86400000));
            return d.toISOString().split("T")[0];
          }
          return s;
        };

        const cleanNum = v => {
          if (!v && v !== 0) return 0;
          return +(String(v).replace(/[$,\s]/g,"")) || 0;
        };

        // UUID-based dupe detection
        const existingUUIDs = new Set(ingresos.map(i=>(i.notas||"").trim().toLowerCase()).filter(Boolean));

        const newRows = [];
        const dupeRows = [];

        rows.slice(hi+1).filter(r=>r.some(c=>c)).forEach(row => {
          const cliente    = String(get(row,["EMPRESA","NOMBRE","RECEPTOR","CLIENTE"])||"").trim();
          const segmento   = String(get(row,["SEGMENTO"])||"").trim();
          const folio      = String(get(row,["CFDI FOLIO","FOLIO"])||"").trim();
          const uuid       = String(get(row,["CFDI UUID","UUID"])||"").trim();
          const fecha      = parseDate(get(row,["FECHA FACTURA","FECHA EMISION","FECHA"]));
          const fechaVencimiento = parseDate(get(row,["FECHA VENCIMIENTO","VENCIMIENTO"]));
          const fechaContable = parseDate(get(row,["ASIENTO CONTABLE","FECHA CONTABLE","CONTABLE"]));
          const monedaRaw  = String(get(row,["MONEDA"])||"MXN").toUpperCase();
          const moneda     = monedaRaw.includes("USD")?"USD":monedaRaw.includes("EUR")?"EUR":"MXN";
          const monto      = cleanNum(get(row,["IMPORTE ADEUDADO","TOTAL","IMPORTE"]));
          const concepto   = String(get(row,["LÍNEAS DE FACTURA","LINEAS DE FACTURA","PRODUCTO","DESCRIPCION"])||folio).trim();

          if (!cliente || !monto) return;

          // Dupe by UUID
          if (uuid && existingUUIDs.has(uuid.toLowerCase())) {
            dupeRows.push({ cliente, concepto, fecha, monto, moneda, uuid });
            return;
          }
          if (uuid) existingUUIDs.add(uuid.toLowerCase());

          newRows.push({
            id: Math.random().toString(36).slice(2,10),
            cliente, concepto: concepto||folio, folio,
            categoria: segmento||"", segmento,
            monto, moneda, tipoCambio:1, fecha, notas:uuid,
            fechaVencimiento, fechaContable, diasCredito:0, fechaFicticia:"",
            empresaId,
          });
        });

        setTasPreview({ rows: newRows, dupes: dupeRows });
        setTasCatDefault(catList[0]||"");
        setTasModal(true);
      } catch(err) {
        alert("Error al leer el archivo: "+err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value="";
  };

  const confirmarTasImport = async () => {
    if (!tasPreview?.rows?.length) return;
    setTasImportando(true);
    const rowsToSave = tasPreview.rows.map(r => ({
      ...r,
      categoria: r.segmento || tasCatDefault || catList[0] || "Otro",
    }));
    const saved = [];
    for (const row of rowsToSave) {
      const s = await upsertIngreso(row);
      saved.push(s);
    }
    setIngresos(prev => [...saved, ...prev]);
    setTasPreview(null);
    setTasModal(false);
    setTasImportando(false);
  };

  /* ── Ingreso Form Modal ─────────────────────────────────────── */
  const IngresoModal = () => {
    const [form, setForm] = useState(()=>{
      const f = {
        id: modalIngreso.id || "",
        cliente: modalIngreso.cliente || "",
        concepto: modalIngreso.concepto || "",
        categoria: modalIngreso.categoria || catList[0] || "Circuito",
        monto: modalIngreso.monto || "",
        moneda: modalIngreso.moneda || "MXN",
        tipoCambio: modalIngreso.tipoCambio || 1,
        fecha: modalIngreso.fecha || today(),
        notas: modalIngreso.notas || "",
        diasCredito: modalIngreso.diasCredito || 30,
        fechaFicticia: modalIngreso.fechaFicticia || "",
      };
      // Auto-calc fechaVencimiento if not set
      f.fechaVencimiento = modalIngreso.fechaVencimiento || addDays(f.fecha, f.diasCredito);
      return f;
    });
    const set = (k,v) => setForm(f=>{
      const u = {...f,[k]:v};
      // Auto-fill diasCredito from clientes catalog when cliente changes
      if(k==="cliente") {
        const cli = clientes.find(c=>c.nombre===v);
        if(cli) {
          u.diasCredito = cli.diasCredito;
          u.fechaVencimiento = addDays(f.fecha, cli.diasCredito);
        }
      }
      // Auto-calc fechaVencimiento when fecha or diasCredito changes
      if(k==="fecha"||k==="diasCredito") {
        u.fechaVencimiento = addDays(k==="fecha"?v:f.fecha, k==="diasCredito"?v:f.diasCredito);
      }
      return u;
    });
    const needsTC = form.moneda !== "MXN";

    return (
      <ModalShell title={form.id ? "Editar Ingreso" : "Nuevo Ingreso"} onClose={()=>setModalIngreso(null)}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <Field label="Cliente *">
            <input list="cxc-clientes" value={form.cliente} onChange={e=>set("cliente",e.target.value)} placeholder="Nombre del cliente…" style={inputStyle}/>
            <datalist id="cxc-clientes">
              {clientes.length > 0
                ? clientes.map(c=><option key={c.id} value={c.nombre}/>)
                : clientesList.map(c=><option key={c} value={c}/>)
              }
            </datalist>
          </Field>
          <Field label="Categoría">
            <select value={form.categoria} onChange={e=>set("categoria",e.target.value)} style={selectStyle}>
              {catList.map(c=><option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Concepto / Servicio">
            <input value={form.concepto} onChange={e=>set("concepto",e.target.value)} placeholder="Ej: Circuito Europa 2026…" style={inputStyle}/>
          </Field>
          <Field label="Fecha">
            <input type="date" value={form.fecha} onChange={e=>set("fecha",e.target.value)} style={inputStyle}/>
          </Field>
          <Field label="Monto Total *">
            <input type="number" value={form.monto} onChange={e=>set("monto",e.target.value)} placeholder="0.00" style={inputStyle} step="0.01"/>
          </Field>
          <Field label="Moneda">
            <select value={form.moneda} onChange={e=>set("moneda",e.target.value)} style={selectStyle}>
              <option value="MXN">🇲🇽 MXN</option>
              <option value="USD">🇺🇸 USD</option>
              <option value="EUR">🇪🇺 EUR</option>
            </select>
          </Field>
          {needsTC && (
            <Field label="Tipo de Cambio (TC)">
              <input type="number" value={form.tipoCambio} onChange={e=>set("tipoCambio",e.target.value)} placeholder="20.50" style={inputStyle} step="0.0001"/>
              <div style={{fontSize:11,color:C.muted,marginTop:4}}>1 {form.moneda} = {form.tipoCambio} MXN. Se usa para convertir facturas MXN vinculadas.</div>
            </Field>
          )}
          <Field label="Días de Crédito">
            <input type="number" value={form.diasCredito} onChange={e=>set("diasCredito",e.target.value)} placeholder="30" style={inputStyle} min="0"/>
          </Field>
          <Field label="Fecha Vencimiento">
            <input type="date" value={form.fechaVencimiento} onChange={e=>set("fechaVencimiento",e.target.value)} style={{...inputStyle,background:"#F0F4FF"}}/>
            <div style={{fontSize:11,color:C.muted,marginTop:4}}>Calculada automáticamente (fecha + días crédito)</div>
          </Field>
          <Field label="Fecha Ficticia de Cobro">
            <input type="date" value={form.fechaFicticia} onChange={e=>set("fechaFicticia",e.target.value)} style={inputStyle}/>
            <div style={{fontSize:11,color:C.muted,marginTop:4}}>Opcional. Sobrescribe el vencimiento en la proyección.</div>
          </Field>
        </div>
        <Field label="Notas">
          <textarea value={form.notas} onChange={e=>set("notas",e.target.value)} rows={2} style={{...inputStyle,resize:"vertical"}} placeholder="Observaciones…"/>
        </Field>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
          <button onClick={()=>setModalIngreso(null)} style={{...btnStyle,background:"#F1F5F9",color:C.text}}>Cancelar</button>
          <button onClick={()=>{if(!form.cliente||!form.monto) return; saveIngreso(form);}} style={btnStyle} disabled={!form.cliente||!form.monto}>
            Guardar Ingreso
          </button>
        </div>
      </ModalShell>
    );
  };

  /* ── Ingreso Detail Modal ────────────────────────────────────── */
  const DetailModal = () => {
    // ── Hooks SIEMPRE primero (regla de React) ──
    const [cobroMonto, setCobroMonto] = useState("");
    const [cobroFecha, setCobroFecha] = useState(today());
    const [cobroNotas, setCobroNotas] = useState("");
    const [cobroBanco, setCobroBanco] = useState("Banamex");
    const [editCobroId, setEditCobroId] = useState(null);
    const [editCobroFields, setEditCobroFields] = useState({});
    const [invDetail, setInvDetail] = useState(null);
    const [sortFacturas, setSortFacturas] = useState("estatus"); // "estatus"|"proveedor"|"monto"|"fecha"

    const ing = ingresos.find(i => i.id === detailIngreso);
    if (!ing) return null;

    const m = metrics[ing.id] || {};
    const ingCobros = cobros.filter(c => c.ingresoId === ing.id).sort((a,b)=>b.fechaCobro.localeCompare(a.fechaCobro));
    const vincs = invoiceIngresos.filter(v => v.ingresoId === ing.id);
    const vincsWithInv = vincs.map(v => {
      const inv = allInvoices.find(i => i.id === v.invoiceId);
      return { ...v, inv };
    }).filter(v => v.inv);
    const catStyle = getCatStyle(ing.categoria);
    const sym = monedaSym(ing.moneda);

    const chartData = [
      { name:"Monto Total", value:ing.monto, fill:"#90CAF9" },
      { name:"Cobrado", value:m.totalCobrado||0, fill:C.ok },
      { name:"Consumido", value:m.consumido||0, fill:C.danger },
      { name:"Disponible", value:Math.max(0,m.disponible||0), fill:C.teal },
    ];

    return (
      <ModalShell title={`Detalle — ${ing.cliente}`} onClose={()=>setDetailIngreso(null)} extraWide>
        {/* Header */}
        <div style={{display:"flex",gap:16,marginBottom:20,flexWrap:"wrap",alignItems:"flex-start"}}>
          <div style={{flex:1,minWidth:240}}>
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
              <span style={{background:catStyle.bg,color:catStyle.text,border:`1px solid ${catStyle.border}`,padding:"3px 12px",borderRadius:20,fontSize:12,fontWeight:700}}>{ing.categoria}</span>
              <span style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[ing.moneda],color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[ing.moneda],padding:"3px 10px",borderRadius:20,fontSize:12,fontWeight:700}}>{ing.moneda}</span>
              {ing.moneda !== "MXN" && <span style={{fontSize:11,color:C.muted}}>TC: {fmt(ing.tipoCambio)}</span>}
            </div>
            <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:4}}>{ing.concepto||"—"}</div>
            <div style={{fontSize:12,color:C.muted}}>📅 {ing.fecha}</div>
            {ing.notas && <div style={{fontSize:12,color:C.muted,marginTop:4,fontStyle:"italic"}}>📝 {ing.notas}</div>}
          </div>
          {/* KPI mini row */}
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {[
              {l:"Monto Total",     v:`${sym}${fmt(ing.monto)}`,        c:C.navy},
              {l:"Cobrado",         v:`${sym}${fmt(m.totalCobrado)}`,    c:C.ok},
              {l:"Por Cobrar",      v:`${sym}${fmt(m.porCobrar)}`,       c:C.warn},
              {l:"Consumido",       v:`${sym}${fmt(m.consumido)}`,       c:C.danger},
              {l:"Por Pagar",       v:`${sym}${fmt(m.porPagar)}`,        c:"#E65100", bg:"#FFF3E0"},
              {l:"Disponible",      v:`${sym}${fmt(m.disponible)}`,      c:C.teal},
              {l:"Disponible Neto", v:`${sym}${fmt(m.disponibleNeto)}`,  c:(m.disponibleNeto||0)>=0?C.green:C.danger, bg:(m.disponibleNeto||0)>=0?"#E8F5E9":"#FFEBEE"},
            ].map(k=>(
              <div key={k.l} style={{background:k.bg||"#F8FAFC",borderRadius:10,padding:"10px 14px",textAlign:"center",minWidth:110}}>
                <div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",marginBottom:2}}>{k.l}</div>
                <div style={{fontSize:16,fontWeight:800,color:k.c}}>{k.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Progress bar */}
        {ing.monto > 0 && (
          <div style={{marginBottom:20}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,marginBottom:4}}>
              <span>Cobrado: {fmt((m.totalCobrado/ing.monto)*100)}%</span>
              <span>Consumido: {fmt((m.consumido/ing.monto)*100)}%</span>
            </div>
            <div style={{height:12,borderRadius:20,background:"#E2E8F0",overflow:"hidden",position:"relative"}}>
              <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${Math.min(100,(m.consumido/ing.monto)*100)}%`,background:C.danger,borderRadius:20,transition:"width .4s"}}/>
              <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${Math.min(100,(m.totalCobrado/ing.monto)*100)}%`,background:`${C.ok}88`,borderRadius:20,transition:"width .4s"}}/>
            </div>
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
          {/* LEFT: Cobros — realizados arriba, proyectados abajo */}
          <div>
            {/* REALIZADOS */}
            <h3 style={{fontSize:14,fontWeight:800,color:C.ok,marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
              💵 Cobros Realizados
              <span style={{fontSize:11,fontWeight:500,color:C.muted}}>({ingCobros.filter(c=>c.tipo!=='proyectado').length})</span>
            </h3>
            <div style={{background:"#F0FFF4",border:"1px solid #A5D6A7",borderRadius:10,padding:12,marginBottom:10}}>
              {!esConsulta && <>
              <div style={{fontSize:11,fontWeight:700,color:C.ok,marginBottom:8}}>+ Registrar cobro recibido</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div>
                  <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Monto</div>
                  <input type="number" value={cobroMonto} onChange={e=>setCobroMonto(e.target.value)} placeholder="0.00" style={{...inputStyle,width:110}} step="0.01"/>
                </div>
                <div>
                  <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Fecha</div>
                  <input type="date" value={cobroFecha} onChange={e=>setCobroFecha(e.target.value)} style={{...inputStyle,width:140}}/>
                </div>
                <div>
                  <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Banco</div>
                  <select value={cobroBanco} onChange={e=>setCobroBanco(e.target.value)} style={{...inputStyle,width:120}}>
                    <option>Banamex</option>
                    <option>Banorte</option>
                  </select>
                </div>
                <div style={{flex:1,minWidth:80}}>
                  <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Notas</div>
                  <input value={cobroNotas} onChange={e=>setCobroNotas(e.target.value)} placeholder="Anticipo, liq…" style={{...inputStyle}}/>
                </div>
                <button onClick={()=>{if(!cobroMonto||+cobroMonto<=0||!cobroFecha) return; addCobro(ing.id,cobroMonto,cobroFecha,cobroNotas,'realizado',cobroBanco); setCobroMonto(""); setCobroNotas("");}}
                  style={{...btnStyle,padding:"7px 14px",fontSize:12,background:C.ok}}>+ Agregar</button>
              </div>
              </>}
              {esConsulta && <div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>Solo lectura — no puedes agregar cobros</div>}
            </div>
            {ingCobros.filter(c=>c.tipo!=='proyectado').length === 0
              ? <div style={{textAlign:"center",color:C.muted,fontSize:12,padding:12}}>Sin cobros realizados</div>
              : ingCobros.filter(c=>c.tipo!=='proyectado').map(c=>(
                <div key={c.id} style={{borderRadius:8,border:`1px solid ${editCobroId===c.id?C.blue:C.border}`,marginBottom:6,background:editCobroId===c.id?"#EEF4FF":C.surface,overflow:"hidden"}}>
                  {editCobroId===c.id ? (
                    /* ── Edit form ── */
                    <div style={{padding:"10px 12px"}}>
                      <div style={{fontSize:11,fontWeight:700,color:C.blue,marginBottom:8}}>✏️ Editar cobro</div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
                        <div>
                          <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Monto</div>
                          <input type="number" value={editCobroFields.monto||""} onChange={e=>setEditCobroFields(p=>({...p,monto:e.target.value}))}
                            style={{...inputStyle,width:110}} step="0.01"/>
                        </div>
                        <div>
                          <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Fecha</div>
                          <input type="date" value={editCobroFields.fechaCobro||""} onChange={e=>setEditCobroFields(p=>({...p,fechaCobro:e.target.value}))}
                            style={{...inputStyle,width:140}}/>
                        </div>
                        <div>
                          <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Banco</div>
                          <select value={editCobroFields.banco||""} onChange={e=>setEditCobroFields(p=>({...p,banco:e.target.value}))}
                            style={{...inputStyle,width:120}}>
                            <option>Banamex</option>
                            <option>Banorte</option>
                          </select>
                        </div>
                        <div style={{flex:1,minWidth:80}}>
                          <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Notas</div>
                          <input value={editCobroFields.notas||""} onChange={e=>setEditCobroFields(p=>({...p,notas:e.target.value}))}
                            placeholder="Notas…" style={{...inputStyle}}/>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:8,marginTop:10}}>
                        <button onClick={async()=>{
                          await updateCobro(c.id, editCobroFields);
                          setCobros(prev=>prev.map(x=>x.id===c.id?{...x,...editCobroFields}:x));
                          setEditCobroId(null);
                        }} style={{...btnStyle,background:C.blue,padding:"6px 16px",fontSize:12}}>💾 Guardar</button>
                        <button onClick={()=>setEditCobroId(null)}
                          style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"6px 12px",fontSize:12}}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    /* ── Normal row ── */
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 11px"}}>
                      <div>
                        <div style={{fontWeight:700,color:C.ok,fontSize:13}}>{sym}{fmt(c.monto)}</div>
                        <div style={{fontSize:11,color:C.muted}}>📅 {c.fechaCobro||"—"}{c.banco ? ` · 🏦 ${c.banco}` : ""}</div>
                        {c.notas && <div style={{fontSize:10,color:C.muted,fontStyle:"italic"}}>{c.notas}</div>}
                      </div>
                      <div style={{display:"flex",gap:4}}>
                        {!esConsulta && <button onClick={()=>{setEditCobroId(c.id);setEditCobroFields({monto:c.monto,fechaCobro:c.fechaCobro,banco:c.banco||"Banamex",notas:c.notas||""});}}
                          style={{...iconBtn,color:C.blue}} title="Editar cobro">✏️</button>}
                        {!esConsulta && <button onClick={()=>removeCobro(c.id)} style={{...iconBtn,color:C.danger}} title="Eliminar cobro">🗑️</button>}
                      </div>
                    </div>
                  )}
                </div>
              ))
            }
            {(m.totalCobrado||0) > 0 && (
              <div style={{padding:"7px 11px",background:"#E8F5E9",borderRadius:8,fontWeight:800,color:C.ok,fontSize:12,marginTop:4}}>
                Total cobrado: {sym}{fmt(m.totalCobrado)}
              </div>
            )}

            {/* PROYECTADOS */}
            <h3 style={{fontSize:14,fontWeight:800,color:"#7B1FA2",marginBottom:10,marginTop:18,display:"flex",alignItems:"center",gap:6}}>
              📆 Cobros Proyectados
              <span style={{fontSize:11,fontWeight:500,color:C.muted}}>({ingCobros.filter(c=>c.tipo==='proyectado').length})</span>
            </h3>
            <div style={{background:"#F3E5F5",border:"1px solid #CE93D8",borderRadius:10,padding:12,marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#7B1FA2",marginBottom:8}}>+ Proyectar cobro futuro</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div>
                  <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Monto</div>
                  <input id="proy-monto" type="number" placeholder="0.00" style={{...inputStyle,width:110}} step="0.01"/>
                </div>
                <div>
                  <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Fecha estimada</div>
                  <input id="proy-fecha" type="date" defaultValue={today()} style={{...inputStyle,width:140}}/>
                </div>
                <div style={{flex:1,minWidth:80}}>
                  <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Notas</div>
                  <input id="proy-notas" type="text" placeholder="2do anticipo…" style={{...inputStyle}}/>
                </div>
                <button onClick={()=>{
                  const m2 = +document.getElementById('proy-monto').value;
                  const f2 = document.getElementById('proy-fecha').value;
                  const n2 = document.getElementById('proy-notas').value;
                  if(!m2||m2<=0||!f2) return;
                  addCobro(ing.id, m2, f2, n2, 'proyectado');
                  document.getElementById('proy-monto').value='';
                  document.getElementById('proy-notas').value='';
                }} style={{...btnStyle,padding:"7px 14px",fontSize:12,background:"#7B1FA2"}}>+ Proyectar</button>
              </div>
            </div>
            {ingCobros.filter(c=>c.tipo==='proyectado').length === 0
              ? <div style={{textAlign:"center",color:C.muted,fontSize:12,padding:12}}>Sin cobros proyectados.<br/><span style={{fontSize:10}}>Aparecerán en el calendario de proyección.</span></div>
              : ingCobros.filter(c=>c.tipo==='proyectado').map(c=>(
                <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 11px",borderRadius:8,border:"1px solid #CE93D8",marginBottom:5,background:"#FAF0FF"}}>
                  <div>
                    <div style={{fontWeight:700,color:"#7B1FA2",fontSize:13}}>{sym}{fmt(c.monto)}</div>
                    <div style={{fontSize:11,color:C.muted}}>📅 {c.fechaCobro||"—"}</div>
                    {c.notas && <div style={{fontSize:10,color:C.muted,fontStyle:"italic"}}>{c.notas}</div>}
                  </div>
                  <button onClick={()=>removeCobro(c.id)} style={{...iconBtn,color:C.danger}}>🗑️</button>
                </div>
              ))
            }
            {(m.totalProyectado||0) > 0 && (
              <div style={{padding:"7px 11px",background:"#F3E5F5",border:"1px solid #CE93D8",borderRadius:8,fontWeight:800,color:"#7B1FA2",fontSize:12,marginTop:4}}>
                Total proyectado: {sym}{fmt(m.totalProyectado)}
              </div>
            )}
          </div>

          {/* RIGHT: Facturas vinculadas */}
          <div>
            {/* Header + control de ordenamiento */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <h3 style={{fontSize:15,fontWeight:800,color:C.navy,margin:0,display:"flex",alignItems:"center",gap:6}}>
                🔗 Facturas Vinculadas
                <span style={{fontSize:12,fontWeight:500,color:C.muted}}>({vincsWithInv.length})</span>
              </h3>
              {vincsWithInv.length > 1 && (
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:11,color:C.muted,fontWeight:600}}>Ordenar:</span>
                  {[
                    {v:"estatus",  l:"Estatus"},
                    {v:"proveedor",l:"Proveedor"},
                    {v:"monto",    l:"Monto"},
                    {v:"fecha",    l:"Fecha"},
                  ].map(opt=>(
                    <button key={opt.v} onClick={()=>setSortFacturas(opt.v)}
                      style={{padding:"3px 10px",borderRadius:20,border:`1px solid ${sortFacturas===opt.v?C.blue:C.border}`,background:sortFacturas===opt.v?"#E8F0FE":C.surface,color:sortFacturas===opt.v?C.blue:C.text,cursor:"pointer",fontSize:11,fontWeight:sortFacturas===opt.v?700:500,fontFamily:"inherit",transition:"all .15s"}}>
                      {opt.l}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {vincsWithInv.length === 0 && (
              <div style={{textAlign:"center",color:C.muted,fontSize:13,padding:20}}>
                Sin facturas vinculadas.<br/><span style={{fontSize:11}}>Vincula desde la sección Cartera.</span>
              </div>
            )}

            {[...vincsWithInv].sort((a,b) => {
              const ESTATUS_ORDER = {Pagado:1, Parcial:2, Pendiente:3, Vencido:4};
              if (sortFacturas === "estatus")   return (ESTATUS_ORDER[a.inv.estatus]||5) - (ESTATUS_ORDER[b.inv.estatus]||5);
              if (sortFacturas === "proveedor") return (a.inv.proveedor||"").localeCompare(b.inv.proveedor||"");
              if (sortFacturas === "monto")     return b.montoAsignado - a.montoAsignado;
              if (sortFacturas === "fecha")     return (b.inv.fecha||"").localeCompare(a.inv.fecha||"");
              return 0;
            }).map(v=>{
              const inv = v.inv;
              const montoConv = convertToMonedaIngreso(v.montoAsignado, inv.moneda, ing);
              const sameMoneda = inv.moneda === ing.moneda;
              const statusBg = {Pagado:"#E8F5E9",Parcial:"#FFF3E0",Pendiente:"#EEF2FF",Vencido:"#FFEBEE"}[inv.estatus]||"#F8FAFC";
              const statusColor = {Pagado:C.ok,Parcial:C.warn,Pendiente:C.sky,Vencido:C.danger}[inv.estatus]||C.muted;
              return (
                <div key={v.id} onClick={()=>setInvDetail(inv)}
                  style={{padding:"10px 12px",borderRadius:8,border:`1px solid ${C.border}`,marginBottom:6,background:statusBg,cursor:"pointer",transition:"box-shadow .15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 2px 12px rgba(0,0,0,.12)";}}
                  onMouseLeave={e=>{e.currentTarget.style.boxShadow="none";}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:13}}>{inv.proveedor}</div>
                      <div style={{fontSize:11,color:C.muted}}>Folio: {inv.serie}{inv.folio} · {inv.fecha}</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{color:statusColor,fontWeight:700,fontSize:11,background:`${statusColor}18`,padding:"2px 8px",borderRadius:20}}>{inv.estatus}</span>
                      <span style={{fontSize:11,color:C.muted,background:"#fff",padding:"1px 6px",borderRadius:6,border:`1px solid ${C.border}`}}>ver detalle →</span>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:12,marginTop:6,fontSize:12}}>
                    <span><span style={{color:C.muted}}>Asignado: </span><b>{inv.moneda==="EUR"?"€":"$"}{fmt(v.montoAsignado)} {inv.moneda}</b></span>
                    {!sameMoneda && <span style={{color:C.muted}}>→ <b>{sym}{fmt(montoConv)} {ing.moneda}</b></span>}
                  </div>
                </div>
              );
            })}
            {vincsWithInv.length > 0 && (
              <div style={{padding:"8px 12px",background:"#FFEBEE",borderRadius:8,fontWeight:800,color:C.danger,fontSize:13,marginTop:4}}>
                Total comprometido: {sym}{fmt(m.comprometido)} | Consumido: {sym}{fmt(m.consumido)}
              </div>
            )}
          </div>
        </div>

        {/* Chart */}
        <div style={{marginTop:24,background:"#F8FAFC",borderRadius:14,padding:18}}>
          <h3 style={{fontSize:14,fontWeight:700,color:C.navy,marginBottom:14}}>📊 Resumen del Ingreso</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3"/>
              <XAxis type="number" tickFormatter={v=>`${sym}${fmt(v)}`} fontSize={10}/>
              <YAxis type="category" dataKey="name" fontSize={11} width={80}/>
              <Tooltip formatter={v=>`${sym}${fmt(v)}`}/>
              <Bar dataKey="value" radius={[0,4,4,0]}>
                {chartData.map((d,i)=><Cell key={i} fill={d.fill}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Actions */}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:20}}>
          <button onClick={()=>{setDetailIngreso(null); setModalIngreso({...ing});}} style={{...btnStyle,background:"#F1F5F9",color:C.text}}>✏️ Editar</button>
          <button onClick={()=>{setDetailIngreso(null); setDeleteConfirm({id:ing.id,label:`${ing.cliente} — ${ing.concepto||ing.categoria}`});}} style={{...btnStyle,background:C.danger}}>🗑️ Eliminar</button>
          <button onClick={()=>{
            // Obtener fecha efectiva para ordenar
            const getFechaOrden = (inv, tipo) => {
              if (tipo === 'pagado') {
                const r = payments.filter(p=>p.invoiceId===inv.id&&p.tipo==='realizado'&&p.fechaPago).sort((a,b)=>a.fechaPago.localeCompare(b.fechaPago));
                return r[0]?.fechaPago || inv.fechaProgramacion || inv.vencimiento || "9999";
              } else {
                const p = payments.filter(p=>p.invoiceId===inv.id&&p.tipo==='programado'&&p.fechaPago).sort((a,b)=>a.fechaPago.localeCompare(b.fechaPago));
                return inv.fechaProgramacion || p[0]?.fechaPago || inv.vencimiento || "9999";
              }
            };
            const sortedVincs = [...vincsWithInv].sort((a,b)=>{
              const aPagado = a.inv.estatus==='Pagado';
              const bPagado = b.inv.estatus==='Pagado';
              // Pagadas primero, luego pendientes
              if(aPagado && !bPagado) return -1;
              if(!aPagado && bPagado) return 1;
              // Dentro de cada grupo, ordenar por fecha de más antigua a más reciente
              const fa = getFechaOrden(a.inv, aPagado?'pagado':'pendiente');
              const fb2 = getFechaOrden(b.inv, bPagado?'pagado':'pendiente');
              return fa.localeCompare(fb2);
            });
            const totalCobrado  = m.totalCobrado||0;
            const totalPorCobrar= m.porCobrar||0;
            const totalConsumido= m.consumido||0;
            const totalPorPagar = m.porPagar||0;
            const totalDisp     = m.disponible||0;
            const totalDispNeto = m.disponibleNeto||0;
            const sBg = {Pagado:"#E8F5E9",Parcial:"#FFF3E0",Pendiente:"#EEF2FF",Vencido:"#FFEBEE"};
            const sCol= {Pagado:"#43A047",Parcial:"#F57F17",Pendiente:"#1565C0",Vencido:"#E53935"};

            const html = `<!DOCTYPE html><html lang="es"><head>
              <meta charset="UTF-8"/>
              <title>Desglose — ${ing.cliente}</title>
              <style>
                *{box-sizing:border-box;margin:0;padding:0;}
                body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1A2332;padding:16px 20px;background:#fff;}
                h1{font-size:16px;font-weight:900;color:#0F2D4A;margin:3px 0 2px;}
                .sub{font-size:10px;color:#64748B;}
                .label{font-size:8px;color:#64748B;font-weight:700;text-transform:uppercase;letter-spacing:.4px;}
                .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0F2D4A;padding-bottom:8px;margin-bottom:10px;}
                .kpi-row{display:flex;gap:6px;flex-wrap:nowrap;margin-bottom:10px;}
                .kpi-box{border:1px solid #E2E8F0;border-radius:6px;padding:6px 8px;flex:1;}
                .kpi-val{font-size:12px;font-weight:800;margin-top:2px;}
                table{width:100%;border-collapse:collapse;margin-top:4px;margin-bottom:10px;}
                th{background:#0F2D4A;color:#fff;padding:5px 7px;text-align:left;font-size:8px;text-transform:uppercase;font-weight:700;}
                td{padding:4px 7px;border-bottom:1px solid #E2E8F0;font-size:9px;}
                tfoot td{background:#EEF2FF;font-weight:800;border-top:2px solid #0F2D4A;font-size:9px;}
                .badge{display:inline-block;padding:1px 6px;border-radius:20px;font-size:8px;font-weight:700;}
                .section-title{font-size:9px;font-weight:700;color:#0F2D4A;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;margin-top:2px;}
                .footer{margin-top:10px;font-size:8px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:6px;}
                .right{text-align:right;}
                @page{size:A4 portrait;margin:10mm;}
                @media print{body{padding:0;}}
              </style>
            </head><body>
              <div class="header">
                <div>
                  <div class="label">Viajes Libero · CxC — Desglose de Ingreso</div>
                  <h1>${ing.cliente}</h1>
                  <div class="sub">${ing.concepto||""}${ing.concepto?" · ":""}${ing.categoria}</div>
                </div>
                <div style="text-align:right;">
                  <div class="label">Generado</div>
                  <div style="font-size:12px;color:#1A2332;margin-top:2px;">${new Date().toLocaleDateString("es-MX",{day:"2-digit",month:"long",year:"numeric"})}</div>
                  <div style="font-size:11px;color:#64748B;margin-top:2px;">Moneda: ${ing.moneda}${ing.moneda!=="MXN"?" · TC: "+ing.tipoCambio:""}</div>
                </div>
              </div>

              <div class="kpi-row">
                ${[
                  ["Monto Total",    `${sym}${fmt(ing.monto)}`,       "#0F2D4A", "#F8FAFC"],
                  ["Cobrado",        `${sym}${fmt(totalCobrado)}`,    "#43A047", "#F8FAFC"],
                  ["Por Cobrar",     `${sym}${fmt(totalPorCobrar)}`,  "#F57F17", "#F8FAFC"],
                  ["Consumido",      `${sym}${fmt(totalConsumido)}`,  "#E53935", "#F8FAFC"],
                  ["Por Pagar",      `${sym}${fmt(totalPorPagar)}`,   "#E65100", "#FFF3E0"],
                  ["Disponible",     `${sym}${fmt(totalDisp)}`,       "#00897B", "#F8FAFC"],
                  ["Disponible Neto",`${sym}${fmt(totalDispNeto)}`,   totalDispNeto>=0?"#1B5E20":"#E53935", "#F8FAFC"],
                ].map(([l,v,c,bg])=>`<div class="kpi-box" style="background:${bg};border:1px solid #E2E8F0;border-radius:6px;padding:8px 10px;flex:1;"><div class="label" style="font-size:8px;color:#64748B;font-weight:700;text-transform:uppercase;letter-spacing:.4px;">${l}</div><div style="font-size:13px;font-weight:800;color:${c};margin-top:3px;">${v}</div></div>`).join("")}
              </div>

              ${ingCobros.length>0?`
              <div class="section-title">Cobros (${ingCobros.length})</div>
              <table>
                <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Notas</th></tr></thead>
                <tbody>
                  ${ingCobros.map(c=>`<tr>
                    <td>${c.fechaCobro||"—"}</td>
                    <td><span class="badge" style="background:${c.tipo==="proyectado"?"#F3E5F5":"#E8F5E9"};color:${c.tipo==="proyectado"?"#7B1FA2":"#43A047"}">${c.tipo==="proyectado"?"📆 Proyectado":"✅ Realizado"}</span></td>
                    <td style="font-weight:700;">${sym}${fmt(c.monto)}</td>
                    <td style="color:#64748B;">${c.notas||"—"}</td>
                  </tr>`).join("")}
                </tbody>
                <tfoot><tr>
                  <td colspan="2">Total cobrado realizado</td>
                  <td style="font-weight:900;color:#43A047;">${sym}${fmt(totalCobrado)}</td>
                  <td></td>
                </tr></tfoot>
              </table>`:""}

              ${sortedVincs.length>0?`
              <div class="section-title">Facturas Vinculadas — ${sortedVincs.length} factura${sortedVincs.length!==1?"s":""} (orden por estatus)</div>
              <table>
                <thead><tr>
                  <th style="width:10%">Estatus</th>
                  <th style="width:20%">Proveedor</th>
                  <th>Concepto</th>
                  <th style="width:14%;white-space:nowrap">Fecha Pago / Prog.</th>
                  <th style="width:10%;text-align:right">Asignado ${ing.moneda}</th>
                  <th style="width:13%;text-align:right">Total Factura</th>
                  <th style="width:9%;text-align:right">Saldo</th>
                </tr></thead>
                <tbody>
                  ${sortedVincs.map(v=>{
                    const inv=v.inv;
                    const sf=(+inv.total||0)-(+inv.montoPagado||0);
                    const cm=convertToMonedaIngreso(v.montoAsignado,inv.moneda,ing);
                    const fb=sBg[inv.estatus]||"#fff";
                    const fc=sCol[inv.estatus]||"#1A2332";
                    const monSym=inv.moneda==="EUR"?"€":"$";
                    // Buscar pagos realizados y programados
                    const realizados = payments
                      .filter(p=>p.invoiceId===inv.id && p.tipo==='realizado' && p.fechaPago)
                      .sort((a,b)=>b.fechaPago.localeCompare(a.fechaPago));
                    const programados = payments
                      .filter(p=>p.invoiceId===inv.id && p.tipo==='programado' && p.fechaPago)
                      .sort((a,b)=>a.fechaPago.localeCompare(b.fechaPago));
                    const esPagado = inv.estatus==='Pagado';
                    let fechaLabel, fechaColor;
                    if(esPagado){
                      const fp = realizados[0]?.fechaPago || inv.fechaProgramacion || inv.vencimiento || "";
                      fechaLabel = fp ? "✓ "+fp : "✓ Pagado";
                      fechaColor = "#43A047";
                    } else {
                      const fp = inv.fechaProgramacion || programados[0]?.fechaPago || inv.vencimiento || "";
                      fechaLabel = fp || "—";
                      fechaColor = inv.estatus==='Vencido' ? "#E53935" : "#1565C0";
                    }
                    return `<tr style="background:${fb}">
                      <td><span class="badge" style="background:${fb};color:${fc};border:1px solid ${fc}55">${inv.estatus}</span></td>
                      <td style="font-weight:600;overflow-wrap:break-word;word-break:break-word;">${inv.proveedor}</td>
                      <td style="color:#374151;overflow-wrap:break-word;word-break:break-word;">${inv.concepto||"—"}</td>
                      <td style="white-space:nowrap;color:${fechaColor};font-weight:700;">${fechaLabel}</td>
                      <td style="font-weight:700;text-align:right;">${sym}${fmt(cm)}</td>
                      <td style="text-align:right;white-space:nowrap;">${monSym}${fmt(inv.total)} <b style="font-size:7px;color:#64748B;">${inv.moneda}</b></td>
                      <td style="text-align:right;font-weight:700;white-space:nowrap;color:${sf>0?"#F57F17":"#43A047"}">${monSym}${fmt(sf)}</td>
                    </tr>`;
                  }).join("")}
                </tbody>
                <tfoot><tr>
                  <td colspan="4">TOTAL (${sortedVincs.length} facturas)</td>
                  <td style="color:#0F2D4A;text-align:right;">${sym}${fmt(m.comprometido)}</td>
                  <td style="text-align:right;color:#E53935;" colspan="2">${sym}${fmt(m.consumido)} consumido</td>
                </tr></tfoot>
              </table>`:""}

              <div class="footer">
                Disponible = Cobrado − Consumido &nbsp;·&nbsp; Disponible Neto = Disponible − Por Pagar &nbsp;·&nbsp; TC aplicado del ingreso
              </div>
              <script>window.onload=()=>{window.print();}<\/script>
            </body></html>`;

            const w = window.open("","_blank","width=1100,height=750");
            w.document.write(html);
            w.document.close();
          }} style={{...btnStyle,background:"#7C3AED",color:"#fff"}}>🖨️ Imprimir PDF</button>
          <button onClick={()=>setDetailIngreso(null)} style={btnStyle}>Cerrar</button>
        </div>

        {/* ── Popup detalle de factura vinculada ── */}
        {invDetail && (()=>{
          const i = invDetail;
          const sym2 = i.moneda==="EUR"?"€":"$";
          const saldo = (+i.total||0)-(+i.montoPagado||0);
          const statusColor = {Pagado:C.ok,Parcial:C.warn,Pendiente:C.sky,Vencido:C.danger}[i.estatus]||C.muted;
          const statusBg   = {Pagado:"#E8F5E9",Parcial:"#FFF3E0",Pendiente:"#EEF2FF",Vencido:"#FFEBEE"}[i.estatus]||"#F8FAFC";
          const monedaColor= {MXN:C.mxn,USD:C.usd,EUR:C.eur}[i.moneda]||C.navy;
          const monedaBg   = {MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[i.moneda]||"#F8FAFC";
          const Row = ({label,value,bold,color}) => (
            <div style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
              <span style={{fontSize:13,color:C.muted}}>{label}</span>
              <span style={{fontSize:13,fontWeight:bold?700:500,color:color||C.text}}>{value||"—"}</span>
            </div>
          );
          return (
            <div style={{position:"fixed",inset:0,background:"rgba(15,45,74,.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:3000,padding:20}}
              onClick={()=>setInvDetail(null)}>
              <div onClick={e=>e.stopPropagation()}
                style={{background:C.surface,borderRadius:20,padding:32,width:"100%",maxWidth:560,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}>
                {/* Header */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
                  <div>
                    <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Detalle de Factura</div>
                    <div style={{fontSize:22,fontWeight:900,color:C.navy}}>{i.serie}{i.folio}</div>
                    <div style={{fontSize:14,color:C.muted,marginTop:2}}>{i.proveedor}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                    <span style={{background:statusBg,color:statusColor,fontWeight:800,fontSize:13,padding:"4px 14px",borderRadius:20,border:`1px solid ${statusColor}44`}}>
                      {i.estatus}
                    </span>
                    <span style={{background:monedaBg,color:monedaColor,fontWeight:700,fontSize:11,padding:"3px 10px",borderRadius:20}}>
                      {i.moneda}
                    </span>
                    <button onClick={()=>setInvDetail(null)}
                      style={{background:"#F1F5F9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:16,marginTop:4}}>×</button>
                  </div>
                </div>

                {/* Importes destacados */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:20}}>
                  {[
                    {l:"Total",    v:`${sym2}${fmt(i.total)}`,      c:C.navy,   bg:"#F8FAFC"},
                    {l:"Pagado",   v:`${sym2}${fmt(i.montoPagado)}`,c:C.ok,     bg:"#E8F5E9"},
                    {l:"Saldo Total",    v:`${sym2}${fmt(saldo)}`,         c:saldo>0?C.warn:C.ok, bg:saldo>0?"#FFF3E0":"#E8F5E9"},
                  ].map(k=>(
                    <div key={k.l} style={{background:k.bg,borderRadius:10,padding:"12px 14px",textAlign:"center"}}>
                      <div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",marginBottom:3}}>{k.l}</div>
                      <div style={{fontSize:18,fontWeight:800,color:k.c}}>{k.v}</div>
                    </div>
                  ))}
                </div>

                {/* Desglose */}
                <div style={{marginBottom:16}}>
                  <Row label="Tipo"               value={i.tipo}/>
                  <Row label="Fecha emisión"       value={i.fecha}/>
                  <Row label="UUID"                value={i.uuid ? i.uuid.slice(0,24)+"…" : "—"}/>
                  <Row label="Clasificación"       value={i.clasificacion}/>
                  {i.concepto && <Row label="Concepto" value={i.concepto}/>}
                  <Row label="Subtotal"            value={`${sym2}${fmt(i.subtotal)}`}/>
                  <Row label="IVA"                 value={`${sym2}${fmt(i.iva)}`}/>
                  {(+i.retIsr||0)>0 && <Row label="Ret. ISR" value={`${sym2}${fmt(i.retIsr)}`}/>}
                  {(+i.retIva||0)>0 && <Row label="Ret. IVA" value={`${sym2}${fmt(i.retIva)}`}/>}
                  <Row label="Total"               value={`${sym2}${fmt(i.total)}`} bold color={C.navy}/>
                  <Row label="Monto Pagado"        value={`${sym2}${fmt(i.montoPagado)}`} bold color={C.ok}/>
                  <Row label="Saldo Pendiente"     value={`${sym2}${fmt(saldo)}`} bold color={saldo>0?C.warn:C.ok}/>
                  <Row label="Vencimiento"         value={i.vencimiento}/>
                  {i.diasCredito && <Row label="Días crédito" value={`${i.diasCredito} días`}/>}
                  {i.fechaProgramacion && <Row label="Pago programado" value={i.fechaProgramacion}/>}
                  {i.referencia && <Row label="Referencia" value={i.referencia}/>}
                </div>

                {/* Autorizaciones */}
                <div style={{display:"flex",gap:10,marginBottom:20}}>
                  <div style={{flex:1,background:i.voBo?"#E8F5E9":"#F8FAFC",borderRadius:8,padding:"8px 14px",textAlign:"center",fontSize:12}}>
                    <div style={{color:C.muted,marginBottom:2}}>Visto Bueno</div>
                    <div style={{fontSize:18}}>{i.voBo?"✅":"⬜"}</div>
                  </div>
                  <div style={{flex:1,background:i.autorizadoDireccion?"#E8F5E9":"#F8FAFC",borderRadius:8,padding:"8px 14px",textAlign:"center",fontSize:12}}>
                    <div style={{color:C.muted,marginBottom:2}}>Aut. Dirección</div>
                    <div style={{fontSize:18}}>{i.autorizadoDireccion?"✅":"⬜"}</div>
                  </div>
                </div>

                {/* Notas */}
                {i.notas && (
                  <div style={{background:"#FFF8E1",border:"1px solid #FFE082",borderRadius:8,padding:"10px 14px",fontSize:12,color:"#856404"}}>
                    📝 {i.notas}
                  </div>
                )}

                <div style={{display:"flex",justifyContent:"flex-end",marginTop:20}}>
                  <button onClick={()=>setInvDetail(null)} style={btnStyle}>Cerrar</button>
                </div>
              </div>
            </div>
          );
        })()}
      </ModalShell>
    );
  };

  /* ── Ingreso row in table ─────────────────────────────────────── */
  const IngresoRow = ({ing, idx}) => {
    const m = metrics[ing.id] || {};
    const catStyle = getCatStyle(ing.categoria);
    const sym = monedaSym(ing.moneda);
    const disponColor = (m.disponible||0) > 0 ? C.teal : (m.disponible||0) === 0 ? C.muted : C.danger;
    const isSelected = selectedIngresos.has(ing.id);
    const diffDias = diasDiff(ing.fechaVencimiento);
    const hoy = today();
    const venceProx = ing.fechaVencimiento && ing.fechaVencimiento < hoy;

    return (
      <tr style={{borderTop:`1px solid ${C.border}`,background:isSelected?"#E8F0FE":idx%2===0?C.surface:"#FAFBFC",cursor:"pointer",transition:"background .12s"}}
        onMouseEnter={e=>{if(!isSelected)e.currentTarget.style.background="#F0F7FF";}}
        onMouseLeave={e=>{if(!isSelected)e.currentTarget.style.background=isSelected?"#E8F0FE":idx%2===0?C.surface:"#FAFBFC";}}
        onClick={()=>setDetailIngreso(ing.id)}>
        {/* Checkbox */}
        <td style={{padding:"10px 6px",textAlign:"center"}} onClick={e=>e.stopPropagation()}>
          <input type="checkbox" checked={isSelected} onChange={()=>{
            setSelectedIngresos(prev=>{const n=new Set(prev);if(n.has(ing.id))n.delete(ing.id);else n.add(ing.id);return n;});
          }} style={{cursor:"pointer",width:15,height:15,accentColor:C.blue}}/>
        </td>
        {/* Segmento */}
        <td style={{padding:"8px 8px"}} onClick={e=>e.stopPropagation()}>
          {esConsulta
            ? <span style={{fontSize:13,color:C.text,padding:"3px 7px"}}>{ing.segmento||"—"}</span>
            : <input value={ing.segmento||""} onChange={e=>{
                const v=e.target.value;
                setIngresos(prev=>prev.map(i=>i.id===ing.id?{...i,segmento:v}:i));
                updateIngresoField(ing.id,{segmento:v});
              }} placeholder="—" style={{padding:"3px 7px",fontSize:12,border:`1px solid ${C.border}`,borderRadius:6,width:70,fontFamily:"inherit",background:"#FAFBFC"}}/>
          }
        </td>
        {/* Cliente — oculto en empresa_2 (ya está agrupado por cliente) */}
        {empresaId !== "empresa_2" && (
          <td style={{padding:"10px 10px",fontWeight:700,color:C.navy,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ing.cliente}</td>
        )}
        {/* Folio */}
        <td style={{padding:"10px 8px",fontSize:13,color:C.blue,fontWeight:600,whiteSpace:"nowrap"}}>{ing.folio||"—"}</td>
        {/* Concepto */}
        <td style={{padding:"10px 10px",color:ing.concepto?C.text:C.muted,fontStyle:ing.concepto?"normal":"italic",minWidth:150,maxWidth:200,whiteSpace:"normal",lineHeight:1.4,wordBreak:"break-word",fontSize:13}}>{ing.concepto||"—"}</td>
        {/* Moneda — fixed width, no wrap */}
        <td style={{padding:"10px 8px",whiteSpace:"nowrap"}}>
          <span style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[ing.moneda]||"#F8FAFC",color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[ing.moneda]||C.navy,padding:"3px 8px",borderRadius:20,fontSize:12,fontWeight:700,display:"inline-block",minWidth:40,textAlign:"center"}}>
            {ing.moneda}
          </span>
        </td>
        {/* Fecha Contable */}
        <td style={{padding:"8px 8px"}} onClick={e=>e.stopPropagation()}>
          {esConsulta
            ? <span style={{fontSize:13,color:C.teal}}>{ing.fechaContable||"—"}</span>
            : <input type="date" value={ing.fechaContable||""} onChange={e=>{
                const v=e.target.value;
                setIngresos(prev=>prev.map(i=>i.id===ing.id?{...i,fechaContable:v}:i));
                updateIngresoField(ing.id,{fechaContable:v});
              }} style={{padding:"3px 6px",fontSize:12,border:`1px solid ${ing.fechaContable?C.teal:C.border}`,borderRadius:6,color:ing.fechaContable?C.teal:C.text,width:125,fontFamily:"inherit"}}/>
          }
        </td>
        {/* Fecha Factura */}
        <td style={{padding:"10px 10px",whiteSpace:"nowrap",fontSize:14,color:C.muted}}>{ing.fecha||"—"}</td>
        {/* Vencimiento */}
        <td style={{padding:"10px 10px",whiteSpace:"nowrap",fontSize:13,color:venceProx?C.danger:ing.fechaVencimiento?C.text:C.muted,fontWeight:ing.fechaVencimiento?600:400}}>
          {ing.fechaVencimiento||"—"}
        </td>
        {/* Días Vencidos */}
        <td style={{padding:"8px 8px",textAlign:"center"}}>
          {diffDias!==null && diffDias<0 ? (
            <span style={{background:"#FFEBEE",color:C.danger,fontWeight:800,fontSize:13,padding:"3px 8px",borderRadius:20,whiteSpace:"nowrap"}}>{Math.abs(diffDias)}d</span>
          ) : <span style={{color:C.muted,fontSize:11}}>—</span>}
        </td>
        {/* Por Vencer */}
        <td style={{padding:"8px 8px",textAlign:"center"}}>
          {diffDias!==null && diffDias>=0 ? (
            <span style={{background:diffDias<=7?"#FFF3E0":diffDias<=30?"#FFFDE7":"#E8F5E9",color:diffDias<=7?C.danger:diffDias<=30?C.warn:C.ok,fontWeight:800,fontSize:13,padding:"3px 8px",borderRadius:20,whiteSpace:"nowrap"}}>{diffDias}d</span>
          ) : <span style={{color:C.muted,fontSize:11}}>—</span>}
        </td>
        {/* Fecha Ficticia */}
        <td style={{padding:"8px 8px"}} onClick={e=>e.stopPropagation()}>
          {esConsulta
            ? <span style={{fontSize:13,color:ing.fechaFicticia?"#7B1FA2":C.muted}}>{ing.fechaFicticia||"—"}</span>
            : <input type="date" value={ing.fechaFicticia||""} onChange={e=>{
                const v=e.target.value;
                setIngresos(prev=>prev.map(i=>i.id===ing.id?{...i,fechaFicticia:v}:i));
                updateIngresoField(ing.id,{fechaFicticia:v});
              }} style={{padding:"3px 6px",fontSize:12,width:125,border:`1px solid ${ing.fechaFicticia?"#7B1FA2":C.border}`,borderRadius:6,color:ing.fechaFicticia?"#7B1FA2":C.text,fontFamily:"inherit"}}/>
          }
        </td>
        <td style={{padding:"10px 10px",fontWeight:700,textAlign:"right",whiteSpace:"nowrap"}}>{sym}{fmt(ing.monto)}</td>
        <td style={{padding:"10px 10px",fontWeight:600,color:C.ok,textAlign:"right",whiteSpace:"nowrap"}}>{sym}{fmt(m.totalCobrado||0)}</td>
        <td style={{padding:"10px 10px",fontWeight:600,color:(m.porCobrar||0)>0?C.warn:C.ok,textAlign:"right",whiteSpace:"nowrap"}}>{sym}{fmt(m.porCobrar||0)}</td>
        {empresaId !== "empresa_2" && <>
          <td style={{padding:"10px 10px",fontWeight:600,color:C.danger,textAlign:"right",whiteSpace:"nowrap"}}>{sym}{fmt(m.consumido||0)}</td>
          <td style={{padding:"10px 10px",textAlign:"right",whiteSpace:"nowrap"}}>
            <span style={{fontWeight:700,color:"#E65100",background:(m.porPagar||0)>0?"#FFF3E0":"transparent",padding:(m.porPagar||0)>0?"2px 6px":"0",borderRadius:6}}>{sym}{fmt(m.porPagar||0)}</span>
          </td>
          <td style={{padding:"10px 10px",textAlign:"right",whiteSpace:"nowrap"}}>
            <span style={{fontWeight:800,color:disponColor}}>{sym}{fmt(m.disponible||0)}</span>
          </td>
          <td style={{padding:"10px 10px",textAlign:"right",whiteSpace:"nowrap"}}>
            <span style={{fontWeight:800,color:(m.disponibleNeto||0)>=0?C.green:C.danger,background:(m.disponibleNeto||0)>=0?"#E8F5E9":"#FFEBEE",padding:"2px 7px",borderRadius:6}}>{sym}{fmt(m.disponibleNeto||0)}</span>
          </td>
        </>}
        <td style={{padding:"10px 8px",whiteSpace:"nowrap"}} onClick={e=>e.stopPropagation()}>
          <button onClick={()=>setDetailIngreso(ing.id)} style={{...iconBtn,color:C.sky}} title="Ver detalle">🔍</button>
          {!esConsulta && <button onClick={()=>setModalIngreso({...ing})} style={{...iconBtn,color:C.blue}} title="Editar">✏️</button>}
          {!esConsulta && <button onClick={()=>setDeleteConfirm({id:ing.id,label:`${ing.cliente} — ${ing.folio||ing.concepto||ing.segmento}`})} style={{...iconBtn,color:C.danger}} title="Eliminar">🗑️</button>}
        </td>
      </tr>
    );
  };



  /* ── Proyección en Calendario ───────────────────────────────── */
  const ProyeccionCalendario = () => {
    const [calYear,  setCalYear]  = useState(() => new Date().getFullYear());
    const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
    const [calDayDetailLocal, setCalDayDetailLocal] = useState(null);
    const [buscarCliente, setBuscarCliente] = useState("");
    const [clientesSeleccionados, setClientesSeleccionados] = useState(new Set());

    const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const DIAS  = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

    // Lista de clientes únicos con cobros pendientes
    const clientesDisponibles = useMemo(()=>{
      const set = new Set();
      ingresos.filter(i=>!i.oculta&&(metrics[i.id]?.porCobrar||0)>0).forEach(i=>set.add(i.cliente));
      cobros.filter(c=>c.tipo==="proyectado").forEach(c=>{
        const ing=ingresos.find(i=>i.id===c.ingresoId);
        if(ing&&!ing.oculta) set.add(ing.cliente);
      });
      return [...set].sort();
    },[ingresos,cobros,metrics]);

    const toggleCliente = cli => setClientesSeleccionados(prev=>{
      const n=new Set(prev); n.has(cli)?n.delete(cli):n.add(cli); return n;
    });

    const clientesFiltradosBusqueda = buscarCliente.trim()
      ? clientesDisponibles.filter(c=>c.toLowerCase().includes(buscarCliente.toLowerCase()))
      : clientesDisponibles;

    // Build map: "YYYY-MM-DD" → [ { ing, cobro?, tipo } ]
    const calMap = useMemo(() => {
      const map = {};
      const filtrar = ing => {
        if(!ing||ing.oculta) return false;
        if(clientesSeleccionados.size>0 && !clientesSeleccionados.has(ing.cliente)) return false;
        return true;
      };
      // 1. Cobros proyectados manuales (prioridad)
      cobros.filter(c => c.tipo === 'proyectado' && c.fechaCobro).forEach(c => {
        const ing = ingresos.find(i => i.id === c.ingresoId);
        if (!filtrar(ing)) return;
        if (!map[c.fechaCobro]) map[c.fechaCobro] = [];
        map[c.fechaCobro].push({ ing, cobro: c, tipo: 'proyectado' });
      });
      // 2. Ingresos con fecha ficticia o vencimiento (sin cobros proyectados)
      ingresos.filter(i => !i.oculta).forEach(ing => {
        if (!filtrar(ing)) return;
        const tieneCobrosProy = cobros.some(c => c.ingresoId === ing.id && c.tipo === 'proyectado');
        if (tieneCobrosProy) return;
        const fecha = ing.fechaFicticia || ing.fechaVencimiento;
        if (!fecha) return;
        const porCobrar = (metrics[ing.id]?.porCobrar || 0);
        if (porCobrar <= 0) return;
        if (!map[fecha]) map[fecha] = [];
        map[fecha].push({
          ing,
          cobro: { monto: porCobrar, notas: ing.fechaFicticia ? "Fecha ficticia" : "Vencimiento" },
          tipo: ing.fechaFicticia ? 'ficticia' : 'vencimiento',
        });
      });
      return map;
    }, [cobros, ingresos, metrics, clientesSeleccionados]);

    const firstDay    = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const todayStr    = today();

    const prevMonth = () => { if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11);}else setCalMonth(m=>m-1); };
    const nextMonth = () => { if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0);}else setCalMonth(m=>m+1); };

    const monthPrefix = `${calYear}-${String(calMonth+1).padStart(2,'0')}`;
    const monthEntries = Object.entries(calMap).filter(([d])=>d.startsWith(monthPrefix));
    const monthTotals = {};
    monthEntries.forEach(([,items])=>items.forEach(({ing,cobro})=>{
      monthTotals[ing.moneda] = (monthTotals[ing.moneda]||0) + cobro.monto;
    }));

    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <h2 style={{fontSize:18,fontWeight:800,color:C.navy,margin:0}}>📆 Proyección de Cobros</h2>
            <p style={{color:C.muted,fontSize:13,margin:"4px 0 0"}}>Cobros proyectados capturados en el detalle de cada ingreso</p>
          </div>
          <button onClick={()=>setProyeccionView(false)} style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"7px 14px",fontSize:12}}>← Volver</button>
        </div>

        {/* Barra buscadora + chips de clientes */}
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <div style={{position:"relative",flex:"0 0 300px"}}>
              <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:14,color:C.muted,pointerEvents:"none"}}>🔍</span>
              <input
                value={buscarCliente}
                onChange={e=>setBuscarCliente(e.target.value)}
                placeholder="Buscar cliente…"
                style={{width:"100%",paddingLeft:32,paddingRight:buscarCliente?30:10,paddingTop:8,paddingBottom:8,border:`1.5px solid ${buscarCliente?C.blue:C.border}`,borderRadius:20,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box",background:buscarCliente?"#EEF4FF":"#fff",color:C.text,transition:"border-color .15s"}}
              />
              {buscarCliente && (
                <button onClick={()=>setBuscarCliente("")}
                  style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:15,color:C.muted,padding:0,lineHeight:1}}>×</button>
              )}
            </div>
            {clientesSeleccionados.size>0 && (
              <button onClick={()=>setClientesSeleccionados(new Set())}
                style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${C.border}`,background:"#F1F5F9",color:C.text,cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:600}}>
                ✕ Limpiar selección ({clientesSeleccionados.size})
              </button>
            )}
          </div>
          {/* Chips de clientes */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {clientesFiltradosBusqueda.map(cli=>{
              const sel = clientesSeleccionados.has(cli);
              return (
                <button key={cli} onClick={()=>toggleCliente(cli)}
                  style={{padding:"5px 14px",borderRadius:20,border:`1.5px solid ${sel?"#7B1FA2":C.border}`,
                    background:sel?"#7B1FA2":"#fff",color:sel?"#fff":C.text,
                    cursor:"pointer",fontSize:12,fontWeight:sel?700:400,fontFamily:"inherit",
                    transition:"all .15s",boxShadow:sel?"0 2px 8px rgba(123,31,162,.25)":"none"}}>
                  {sel?"✓ ":""}{cli}
                </button>
              );
            })}
          </div>
        </div>

        {Object.keys(monthTotals).length > 0 && (
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{fontSize:12,color:"#7B1FA2",fontWeight:700,alignSelf:"center"}}>Este mes:</span>
            {Object.entries(monthTotals).map(([mon,val])=>(
              <div key={mon} style={{background:"#EDE7F6",border:"2px solid #9C27B0",borderRadius:20,padding:"6px 16px",fontSize:13,fontWeight:800,color:"#6A1B9A"}}>
                {mon==="EUR"?"€":"$"}{fmt(val)} {mon}
              </div>
            ))}
          </div>
        )}

        <div style={{background:"#FAF5FF",border:"1px solid #E1BEE7",borderRadius:16,overflow:"hidden",boxShadow:"0 2px 12px rgba(106,27,154,.1)"}}>
          {/* Calendar header — morado degradado */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",background:"linear-gradient(135deg,#6A1B9A,#9C27B0)"}}>
            <button onClick={prevMonth} style={{background:"rgba(255,255,255,.2)",border:"none",color:"#fff",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:16,fontWeight:700}}>‹</button>
            <span style={{fontWeight:800,fontSize:17,color:"#fff"}}>{MESES[calMonth]} {calYear}</span>
            <button onClick={nextMonth} style={{background:"rgba(255,255,255,.2)",border:"none",color:"#fff",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:16,fontWeight:700}}>›</button>
          </div>
          {/* Day headers — lila */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:"#EDE7F6",borderBottom:"1px solid #D1C4E9"}}>
            {DIAS.map(d=>(
              <div key={d} style={{padding:"8px 4px",textAlign:"center",fontSize:11,fontWeight:700,color:"#6A1B9A",textTransform:"uppercase"}}>{d}</div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
            {Array.from({length:firstDay}).map((_,i)=>(
              <div key={`e${i}`} style={{minHeight:110,background:"#F3E5F5",borderRight:"1px solid #E1BEE7",borderBottom:"1px solid #E1BEE7"}}/>
            ))}
            {Array.from({length:daysInMonth}).map((_,i)=>{
              const day = i + 1;
              const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const entries = calMap[dateStr] || [];
              const isToday = dateStr === todayStr;
              const hasCobros = entries.length > 0;
              const byMon = {};
              entries.forEach(({ing,cobro})=>{ byMon[ing.moneda]=(byMon[ing.moneda]||0)+cobro.monto; });
              const tipos = entries.map(e=>e.tipo);
              // Purple-based cell colors
              const bgCell = !hasCobros ? (isToday?"#EDE7F6":"#FAF5FF") :
                tipos.includes('proyectado') ? "#EDE7F6" :
                tipos.includes('ficticia')   ? "#F3E5F5" : "#E8D5F5";
              const textCol = !hasCobros ? "#4A148C" :
                tipos.includes('proyectado') ? "#6A1B9A" :
                tipos.includes('ficticia')   ? "#7B1FA2" : "#4A148C";

              return (
                <div key={day}
                  onClick={hasCobros ? ()=>setCalDayDetailLocal({fecha:dateStr,entries}) : undefined}
                  style={{minHeight:110,padding:"8px 8px 6px",borderRight:"1px solid #E1BEE7",borderBottom:"1px solid #E1BEE7",background:bgCell,cursor:hasCobros?"pointer":"default",transition:"all .15s"}}
                  onMouseEnter={e=>{if(hasCobros){e.currentTarget.style.background="#D1C4E9";e.currentTarget.style.boxShadow="inset 0 0 0 2px #9C27B0";}}}
                  onMouseLeave={e=>{if(hasCobros){e.currentTarget.style.background=bgCell;e.currentTarget.style.boxShadow="none";}}}>
                  <div style={{width:28,height:28,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:isToday?"#6A1B9A":"transparent",color:isToday?"#fff":hasCobros?textCol:"#9E9E9E",fontWeight:isToday||hasCobros?800:400,fontSize:14,marginBottom:6}}>{day}</div>
                  {Object.entries(byMon).map(([mon,val])=>(
                    <div key={mon} style={{background:{MXN:"#7B1FA2",USD:"#4A148C",EUR:"#880E4F"}[mon]||"#6A1B9A",color:"#fff",borderRadius:7,padding:"4px 7px",fontSize:13,fontWeight:800,marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",letterSpacing:"-0.3px"}}>
                      {mon==="EUR"?"€":"$"}{fmt(val)}
                      <span style={{fontSize:10,fontWeight:600,opacity:.85,marginLeft:3}}>{mon}</span>
                    </div>
                  ))}
                  {hasCobros && (
                    <div style={{fontSize:10,color:textCol,fontWeight:700,marginTop:2}}>
                      {tipos.includes('proyectado')?"📆 Proyectado":tipos.includes('ficticia')?"📅 Ficticia":"⏰ Vencimiento"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{display:"flex",gap:16,marginTop:12,fontSize:11,color:C.muted,flexWrap:"wrap"}}>
          <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:14,height:14,borderRadius:3,background:"#EDE7F6",border:"1px solid #9C27B0",display:"inline-block"}}/>📆 Cobro proyectado manual</span>
          <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:14,height:14,borderRadius:3,background:"#F3E5F5",border:"1px solid #CE93D8",display:"inline-block"}}/>📅 Fecha ficticia de cobro</span>
          <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:14,height:14,borderRadius:3,background:"#E8D5F5",border:"1px solid #AB47BC",display:"inline-block"}}/>⏰ Fecha de vencimiento</span>
          <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:14,height:14,borderRadius:"50%",background:"#6A1B9A",display:"inline-block"}}/>Hoy</span>
        </div>

        {/* Day detail popup */}
        {calDayDetailLocal && (
          <div style={{position:"fixed",inset:0,background:"rgba(15,45,74,.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:3000,padding:20}}
            onClick={()=>setCalDayDetailLocal(null)}>
            <div onClick={e=>e.stopPropagation()}
              style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:1500,maxHeight:"95vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 64px rgba(74,0,130,.25)"}}>

              {/* Header */}
              <div style={{background:"linear-gradient(135deg,#6A1B9A,#9C27B0)",borderRadius:"20px 20px 0 0",padding:"20px 28px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:11,color:"#E1BEE7",fontWeight:700,textTransform:"uppercase",letterSpacing:.8}}>Cobros Proyectados</div>
                  <div style={{fontSize:22,fontWeight:900,color:"#fff",marginTop:2}}>📅 {calDayDetailLocal.fecha}</div>
                </div>
                <button onClick={()=>setCalDayDetailLocal(null)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:10,width:36,height:36,cursor:"pointer",fontSize:20,color:"#fff"}}>×</button>
              </div>

              {/* Summary chips */}
              {(()=>{
                const dt={};
                const clientes=new Set();
                calDayDetailLocal.entries.forEach(({ing,cobro})=>{
                  dt[ing.moneda]=(dt[ing.moneda]||0)+cobro.monto;
                  clientes.add(ing.cliente);
                });
                return(
                  <div style={{display:"flex",gap:10,padding:"14px 24px",background:"#F3E5F5",borderBottom:"1px solid #E1BEE7",flexWrap:"wrap",alignItems:"center"}}>
                    {Object.entries(dt).map(([mon,val])=>(
                      <div key={mon} style={{background:"#fff",border:"2px solid #9C27B0",borderRadius:12,padding:"10px 18px",textAlign:"center"}}>
                        <div style={{fontSize:10,color:"#7B1FA2",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>{mon==="MXN"?"🇲🇽":"🇺🇸"} {mon}</div>
                        <div style={{fontSize:20,fontWeight:900,color:"#6A1B9A"}}>{mon==="EUR"?"€":"$"}{fmt(val)}</div>
                      </div>
                    ))}
                    <div style={{background:"#fff",border:"1px solid #CE93D8",borderRadius:12,padding:"10px 18px",textAlign:"center"}}>
                      <div style={{fontSize:10,color:"#7B1FA2",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Facturas</div>
                      <div style={{fontSize:20,fontWeight:900,color:"#6A1B9A"}}>{calDayDetailLocal.entries.length}</div>
                    </div>
                    <div style={{background:"#fff",border:"1px solid #CE93D8",borderRadius:12,padding:"10px 18px",textAlign:"center"}}>
                      <div style={{fontSize:10,color:"#7B1FA2",fontWeight:700,textTransform:"uppercase",marginBottom:2}}>Clientes</div>
                      <div style={{fontSize:20,fontWeight:900,color:"#6A1B9A"}}>{clientes.size}</div>
                    </div>
                  </div>
                );
              })()}

              {/* Grouped by client */}
              <div style={{overflowY:"auto",flex:1,padding:"8px 0"}}>
                {(()=>{
                  // Group by client
                  const byCliente={};
                  calDayDetailLocal.entries.forEach(({ing,cobro})=>{
                    if(!byCliente[ing.cliente]) byCliente[ing.cliente]={entries:[],total:0,moneda:ing.moneda};
                    byCliente[ing.cliente].entries.push({ing,cobro});
                    byCliente[ing.cliente].total+=cobro.monto;
                  });
                  return Object.entries(byCliente)
                    .sort((a,b)=>b[1].total-a[1].total)
                    .map(([cliente,{entries,total,moneda}])=>{
                      const sym=monedaSym(moneda);
                      return(
                        <div key={cliente} style={{marginBottom:4}}>
                          {/* Client header */}
                          <div style={{background:"#EDE7F6",padding:"10px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"2px solid #CE93D8"}}>
                            <span style={{fontWeight:800,fontSize:14,color:"#4527A0"}}>👤 {cliente}</span>
                            <div style={{display:"flex",gap:16,alignItems:"center"}}>
                              <span style={{fontSize:13,color:"#6A1B9A",fontWeight:700}}>{sym}{fmt(total)} {moneda}</span>
                              <span style={{fontSize:12,color:"#9C27B0"}}>{entries.length} factura{entries.length!==1?"s":""}</span>
                            </div>
                          </div>
                          {/* Rows */}
                          {entries.sort((a,b)=>b.cobro.monto-a.cobro.monto).map(({ing,cobro})=>{
                            const catStyle=getCatStyle(ing.categoria);
                            const dias=diasDiff(ing.fechaVencimiento);
                            return(
                              <div key={cobro.id} style={{padding:"12px 24px",borderBottom:"1px solid #F3E5F5",background:"#fff",cursor:"pointer",transition:"background .1s"}}
                                onClick={()=>{setCalDayDetailLocal(null);setProyeccionView(false);setDetailIngreso(ing.id);}}
                                onMouseEnter={e=>e.currentTarget.style.background="#FAF0FF"}
                                onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:3}}>
                                      {ing.folio && <span style={{color:"#7B1FA2",fontWeight:700,fontSize:13}}>{ing.folio}</span>}
                                      <span style={{background:catStyle.bg,color:catStyle.text,border:`1px solid ${catStyle.border}`,padding:"1px 8px",borderRadius:20,fontSize:10,fontWeight:700}}>{ing.categoria}</span>
                                      {ing.segmento && <span style={{background:"#E8EAF6",color:"#3949AB",padding:"1px 8px",borderRadius:20,fontSize:10,fontWeight:700}}>{ing.segmento}</span>}
                                    </div>
                                    <div style={{fontSize:13,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ing.concepto||"—"}</div>
                                    {ing.fechaVencimiento && (
                                      <div style={{fontSize:11,color:dias!==null&&dias<0?C.danger:C.muted,marginTop:2}}>
                                        Vence: {ing.fechaVencimiento}
                                        {dias!==null && <span style={{marginLeft:6,background:dias<0?"#FFEBEE":"#E8F5E9",color:dias<0?C.danger:C.ok,fontWeight:700,padding:"1px 6px",borderRadius:10,fontSize:10}}>{dias<0?`${Math.abs(dias)}d venc.`:`${dias}d`}</span>}
                                      </div>
                                    )}
                                  </div>
                                  <div style={{textAlign:"right",flexShrink:0}}>
                                    <div style={{fontWeight:900,fontSize:17,color:"#6A1B9A"}}>{sym}{fmt(cobro.monto)}</div>
                                    <div style={{fontSize:11,color:C.muted,marginTop:3}}>Ver detalle →</div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    });
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ── Main Render ───────────────────────────────────────────────── */
  if (proyeccionView) return (
    <div>
      <ProyeccionCalendario/>
      {detailIngreso && <DetailModal/>}
    </div>
  );

  const totalIngresos = ingresos.length;
  const pendientesDeCobrar = ingresos.filter(ing=>(metrics[ing.id]?.porCobrar||0)>0).length;

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,flexWrap:"wrap",gap:10}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:800,color:C.navy,margin:0}}>💵 Cuentas por Cobrar</h1>
          <p style={{color:C.muted,fontSize:14,margin:"4px 0 0"}}>Controla ingresos de clientes y vincúlalos a tus gastos</p>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>setProyeccionView(true)} style={{...btnStyle,background:"#E8F0FE",color:C.blue,padding:"8px 16px",fontSize:13}}>📆 Proyección</button>
          <button onClick={()=>setConfigCats(true)} style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"8px 14px",fontSize:13}}>⚙️ Categorías</button>
          {/* Vista toggle */}
          <div style={{display:"flex",border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
            <button onClick={()=>setVistaGrupo("cliente")} style={{padding:"8px 14px",border:"none",background:vistaGrupo==="cliente"?C.navy:"#F1F5F9",color:vistaGrupo==="cliente"?"#fff":C.text,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>👥 Por cliente</button>
            <button onClick={()=>setVistaGrupo("ingreso")} style={{padding:"8px 14px",border:"none",background:vistaGrupo==="ingreso"?C.navy:"#F1F5F9",color:vistaGrupo==="ingreso"?"#fff":C.text,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>📋 Por ingreso</button>
          </div>
          {/* Importar Excel TravelAirSolutions */}
          {empresaId === "empresa_2" && !esConsulta && (
            <>
              <button onClick={()=>{setTasPreview(null);setTasModal(true);}} style={{...btnStyle,background:"#C0392B",color:"#fff",padding:"8px 16px",fontSize:13}}>✈️ Importar TAS</button>
              <button onClick={()=>setLimpiarModal(true)} style={{...btnStyle,background:"#7F0000",color:"#fff",padding:"8px 16px",fontSize:13}}>🗑️ Limpiar Cartera</button>
              <button onClick={()=>setPorFacturarModal(true)} style={{...btnStyle,background:"#6A1B9A",color:"#fff",padding:"8px 16px",fontSize:13}}>📋 Por Facturar</button>
            </>
          )}
          {!esConsulta && <button onClick={()=>{setImportPreview(null);setImportModal(true);}} style={{...btnStyle,background:"#00897B",color:"#fff",padding:"8px 16px",fontSize:13}}>📥 Importar Excel</button>}
          {!esConsulta && <button onClick={()=>setModalIngreso({id:"",cliente:"",concepto:"",categoria:catList[0]||"Circuito",monto:"",moneda:"MXN",tipoCambio:1,fecha:today(),notas:""})} style={btnStyle}>
            + Nuevo Ingreso
          </button>}
        </div>
      </div>
      {/* Hidden file inputs */}
      <input ref={importRef} type="file" accept=".xlsx,.xls" onChange={handleImportFile} style={{display:"none"}}/>
      <input ref={tasImportRef} type="file" accept=".xlsx,.xls" onChange={handleTasImport} style={{display:"none"}}/>

      {/* Main tabs: Activas / Resumen / Cobros */}
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,marginBottom:20,background:C.surface,borderRadius:"12px 12px 0 0",paddingLeft:8,marginTop:12}}>
        {[
          {id:"activas", label:"📋 Activas"},
          {id:"resumen", label:"📊 Resumen"},
          {id:"cobros",  label:"✅ Cobros"},
        ].map(t=>(
          <button key={t.id} onClick={()=>setCxcTab(t.id)} style={{
            padding:"10px 22px",border:"none",
            borderBottom:cxcTab===t.id?`3px solid ${C.blue}`:"3px solid transparent",
            background:"transparent",color:cxcTab===t.id?C.blue:C.muted,
            fontWeight:cxcTab===t.id?800:500,fontSize:14,cursor:"pointer",fontFamily:"inherit",
            transition:"all .15s",whiteSpace:"nowrap",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── PESTAÑA RESUMEN ── */}
      {cxcTab === "resumen" && (
        <ResumenCxC
          ingresos={ingresos}
          cobros={cobros}
          metrics={metrics}
          empresaId={empresaId}
          fmt={fmt}
          C={C}
          XLSX={XLSX}
        />
      )}

      {/* ── PESTAÑA COBROS ── */}
      {cxcTab === "cobros" && (
        <CobrosCxC
          cobros={cobros.filter(c=>c.tipo==="realizado")}
          ingresos={ingresos}
          fmt={fmt}
          C={C}
          monedaSym={monedaSym}
          MESES_NOMBRES={MESES_NOMBRES}
          onIngresoClick={(ingresoId)=>setDetailIngreso(ingresoId)}
        />
      )}

      {/* ── PESTAÑA ACTIVAS ── */}
      {cxcTab === "activas" && (<>
      {(filtroSearch||filtroCliente||filtroCategoria||filtroMoneda||filtroFechaFrom||filtroFechaTo||filtroCobro||filtroMesContable||filtroSegmento) && (
        <div style={{background:"#E8F0FE",border:`1px solid ${C.blue}`,borderRadius:8,padding:"6px 14px",marginBottom:8,fontSize:12,color:C.blue,fontWeight:600}}>
          🔍 Mostrando totales de <b>{filtered.length}</b> ingreso{filtered.length!==1?"s":""} filtrados
        </div>
      )}
      {/* Ocultas counter chip */}
      {ingresos.filter(i=>i.oculta).length > 0 && (
        <div style={{marginBottom:8}}>
          <span onClick={()=>setOcultasModal(true)}
            style={{display:"inline-flex",alignItems:"center",gap:6,background:"#FFF3E0",border:"1px solid #FFB74D",borderRadius:20,padding:"5px 14px",cursor:"pointer",fontSize:12,color:"#E65100",fontWeight:600}}>
            🙈 {ingresos.filter(i=>i.oculta).length} factura{ingresos.filter(i=>i.oculta).length!==1?"s":""} oculta{ingresos.filter(i=>i.oculta).length!==1?"s":""}
            <span style={{fontSize:11,opacity:.7,marginLeft:2}}>· clic para gestionar</span>
          </span>
        </div>
      )}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",margin:"20px 0"}}>
        {Object.entries(kpisFiltered).map(([mon,v])=>{
          if (v.monto === 0 && v.cobrado === 0) return null;
          const sym = monedaSym(mon);
          const flagMap = {MXN:"🇲🇽",USD:"🇺🇸",EUR:"🇪🇺"};
          const colMap  = {MXN:C.mxn,USD:C.usd,EUR:C.eur};
          const bgMap   = {MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"};
          const mk = (key,label,value,color,icon,bg,tipo) => (
            <div key={key} onClick={()=>setKpiModal({titulo:label,tipo,moneda:mon})}
              style={{background:bg||C.surface,borderRadius:16,padding:"18px 22px",border:`1px solid ${C.border}`,boxShadow:"0 2px 8px rgba(0,0,0,.05)",flex:1,minWidth:150,cursor:"pointer",transition:"transform .15s, box-shadow .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.03)";e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,.12)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.05)";}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>{label}</div>
                  <div style={{fontSize:22,fontWeight:800,color,marginTop:4}}>{value}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:3}}>Clic para ver desglose</div>
                </div>
                <div style={{fontSize:26}}>{icon}</div>
              </div>
            </div>
          );

          if (empresaId === "empresa_2") {
            // Fila 1: MXN Total · Por Facturar · Total CxC
            const pfFiltradoChip = porFacturar.filter(r=>r.moneda===mon
              && (!filtroDestino || r.destino===filtroDestino)
              && (!filtroCliente || r.cliente===filtroCliente)
              && (!filtroSearch || r.cliente.toLowerCase().includes(filtroSearch.toLowerCase()) || (r.concepto||"").toLowerCase().includes(filtroSearch.toLowerCase()) || (r.folio||"").toLowerCase().includes(filtroSearch.toLowerCase()))
            );
            const pfTotal = pfFiltradoChip.reduce((s,r)=>s+r.importe,0);
            const totalCxC = v.porCobrar + pfTotal;
            return [
              mk(`${mon}-monto`, `${flagMap[mon]} ${mon} Total`, `${sym}${fmt(v.porCobrar)}`, colMap[mon], "💼", bgMap[mon], "porCobrar"),
              pfTotal > 0 ? (
                <div key={`${mon}-pf`} onClick={()=>setPorFacturarModal(true)}
                  style={{background:"#F3E5F5",borderRadius:16,padding:"18px 22px",border:"1px solid #CE93D8",flex:1,minWidth:150,cursor:"pointer",transition:"transform .15s",boxShadow:"0 2px 8px rgba(0,0,0,.05)"}}
                  onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.03)";e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,.12)";}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.05)";}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontSize:11,color:"#7B1FA2",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>📋 Por Facturar {mon}</div>
                      <div style={{fontSize:22,fontWeight:800,color:"#6A1B9A",marginTop:4}}>{sym}{fmt(pfTotal)}</div>
                      <div style={{fontSize:10,color:"#9C27B0",marginTop:2}}>{pfFiltradoChip.length} registros</div>
                    </div>
                  </div>
                </div>
              ) : null,
              totalCxC > 0 ? (
                <div key={`${mon}-cxc`}
                  style={{background:"#EEF2FF",borderRadius:16,padding:"18px 22px",border:`1px solid ${C.blue}`,flex:1,minWidth:150,boxShadow:"0 2px 8px rgba(0,0,0,.05)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontSize:11,color:C.navy,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>📊 Total CxC {mon}</div>
                      <div style={{fontSize:22,fontWeight:800,color:C.navy,marginTop:4}}>{sym}{fmt(totalCxC)}</div>
                      <div style={{fontSize:10,color:C.muted,marginTop:2}}>Por Cobrar + Por Facturar</div>
                    </div>
                  </div>
                </div>
              ) : null,
            ].filter(Boolean);
          }

          return [
            mk(`${mon}-monto`,    `${flagMap[mon]} ${mon} Total`,  `${sym}${fmt(v.monto)}`,         colMap[mon],    "💼", bgMap[mon],    "total"),
            mk(`${mon}-cobrado`,  `${mon} Cobrado`,                `${sym}${fmt(v.cobrado)}`,        C.ok,           "✅", null,          "cobrado"),
            mk(`${mon}-porCobrar`,`${mon} Por Cobrar`,             `${sym}${fmt(v.porCobrar)}`,      C.warn,         "⏳", null,          "porCobrar"),
            mk(`${mon}-consumido`,`${mon} Consumido`,              `${sym}${fmt(v.consumido)}`,      C.danger,       "📤", null,          "consumido"),
            mk(`${mon}-porPagar`, `${mon} Por Pagar`,              `${sym}${fmt(v.porPagar)}`,       "#E65100",      "🧾", "#FFF3E0",     "porPagar"),
            mk(`${mon}-disponible`,`${mon} Disponible`,            `${sym}${fmt(v.disponible)}`,     C.teal,         "💰", null,          "disponible"),
            mk(`${mon}-dispNeto`, `${mon} Disponible Neto`,        `${sym}${fmt(v.disponibleNeto)}`, v.disponibleNeto>=0?C.green:C.danger,"🏦",v.disponibleNeto>=0?"#E8F5E9":"#FFEBEE","disponibleNeto"),
          ];
        })}
      </div>

      {/* ── Cobrado del Mes (solo empresa_2) ── */}
      {empresaId === "empresa_2" && (()=>{
        const now = new Date();
        const mesPrefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
        const MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
        const mesNombre = `${MESES_ES[now.getMonth()]} ${now.getFullYear()}`;
        // Cobros realizados en el mes actual, excluyendo ingresos ocultos
        const cobrosDelMes = cobros.filter(c =>
          c.tipo === "realizado" &&
          c.fechaCobro &&
          c.fechaCobro.startsWith(mesPrefix) &&
          !ingresos.find(i => i.id === c.ingresoId)?.oculta
        );
        // Agrupar por moneda
        const porMoneda = {};
        cobrosDelMes.forEach(c => {
          const ing = ingresos.find(i => i.id === c.ingresoId);
          const mon = ing?.moneda || "MXN";
          if (!porMoneda[mon]) porMoneda[mon] = 0;
          porMoneda[mon] += c.monto;
        });
        if (!cobrosDelMes.length) return null;
        return (
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16,alignItems:"center"}}>
            {Object.entries(porMoneda).map(([mon, total]) => {
              const sym = monedaSym(mon);
              return (
                <div key={mon} onClick={()=>setCobrosMesModal(true)}
                  style={{background:"#E8F5E9",borderRadius:16,padding:"14px 22px",border:"1px solid #A5D6A7",cursor:"pointer",
                    display:"flex",alignItems:"center",gap:16,boxShadow:"0 2px 8px rgba(0,0,0,.05)",transition:"transform .15s,box-shadow .15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.03)";e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,.12)";}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.05)";}}>
                  <span style={{fontSize:24}}>💰</span>
                  <div>
                    <div style={{fontSize:11,color:"#2E7D32",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Cobrado en {mesNombre} · {mon}</div>
                    <div style={{fontSize:22,fontWeight:800,color:"#1B5E20"}}>{sym}{fmt(total)}</div>
                    <div style={{fontSize:10,color:"#388E3C",marginTop:1}}>{cobrosDelMes.filter(c=>{const i=ingresos.find(x=>x.id===c.ingresoId);return (i?.moneda||"MXN")===mon;}).length} cobros · clic para ver detalle</div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── Modal Cobros del Mes ── */}
      {cobrosMesModal && (()=>{
        const now = new Date();
        const mesPrefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
        const MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
        const mesNombre = `${MESES_ES[now.getMonth()]} ${now.getFullYear()}`;

        // Todos los cobros realizados del mes, enriquecidos con datos del ingreso
        const cobrosDelMes = cobros
          .filter(c => c.tipo==="realizado" && c.fechaCobro && c.fechaCobro.startsWith(mesPrefix))
          .map(c => { const ing = ingresos.find(i=>i.id===c.ingresoId); return ing && !ing.oculta ? {...c, ing} : null; })
          .filter(Boolean);

        // Opciones de filtros
        const bancosOpts    = ["Todos",...[...new Set(cobrosDelMes.map(c=>c.banco||"Sin banco"))]];
        const segmentosOpts = ["Todos",...[...new Set(cobrosDelMes.map(c=>c.ing.segmento||"Sin segmento").filter(Boolean))]];
        const mesesVentaOpts = ["Todos",...[...new Set(cobrosDelMes.map(c=>c.ing.fechaContable?.slice(0,7)).filter(Boolean))].sort()];

        // Aplicar filtros
        const filas = cobrosDelMes.filter(c => {
          if (filtroBancoMes !== "Todos" && (c.banco||"Sin banco") !== filtroBancoMes) return false;
          if (filtroSegmentoMes !== "Todos" && filtroSegmentoMes !== "" && (c.ing.segmento||"Sin segmento") !== filtroSegmentoMes) return false;
          if (filtroMesVentaMes !== "Todos" && filtroMesVentaMes !== "" && !c.ing.fechaContable?.startsWith(filtroMesVentaMes)) return false;
          return true;
        }).sort((a,b) => a.ing.cliente.localeCompare(b.ing.cliente) || a.fechaCobro.localeCompare(b.fechaCobro));

        const grandTotal = filas.reduce((s,c)=>s+c.monto, 0);
        const totalFacturado = filas.reduce((s,c)=>s+c.ing.monto, 0);
        const sym = monedaSym("MXN");
        const clientesUnicos = [...new Set(filas.map(c=>c.ing.cliente))];
        const porBanco = filas.reduce((m,c)=>{ const b=c.banco||"Sin banco"; m[b]=(m[b]||0)+c.monto; return m; },{});
        const porSegmento = filas.reduce((m,c)=>{ const s=c.ing.segmento||"Sin seg"; m[s]=(m[s]||0)+c.monto; return m; },{});

        // Agrupado por cliente
        const porCliente = clientesUnicos.map(cli=>{
          const rows = filas.filter(c=>c.ing.cliente===cli);
          return { cli, rows, total: rows.reduce((s,c)=>s+c.monto,0) };
        }).sort((a,b)=>b.total-a.total);

        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:8}}
            onClick={()=>{setCobrosMesModal(false);setExpandedCobrosClientes(new Set());setMostrarReporteCobranza(false);}}>
            <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:"98vw",maxHeight:"96vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}
              onClick={e=>e.stopPropagation()}>

              {/* Header */}
              <div style={{padding:"18px 28px",background:"#1B5E20",borderRadius:"18px 18px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:800,fontSize:18,color:"#fff"}}>💰 Cobranza de {mesNombre}</div>
                  <div style={{fontSize:12,color:"#A5D6A7",marginTop:2}}>{cobrosDelMes.length} cobros registrados · mostrando {filas.length}</div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  {empresaId==="empresa_2" && (
                    <button onClick={()=>setMostrarReporteCobranza(true)}
                      style={{padding:"6px 14px",borderRadius:8,border:"1px solid rgba(255,255,255,.3)",background:"rgba(255,255,255,.15)",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>
                      📊 Reporte
                    </button>
                  )}
                  <button onClick={()=>{
                    const ws = XLSX.utils.json_to_sheet(filas.map(c=>({
                      Cliente: c.ing.cliente, Segmento: c.ing.segmento||"", Folio: c.ing.folio||"",
                      Concepto: c.ing.concepto||"", "F.Contable": c.ing.fechaContable||"",
                      "F.Factura": c.ing.fecha||"", "F.Cobro": c.fechaCobro||"",
                      "Monto Factura": c.ing.monto, Cobrado: c.monto, Banco: c.banco||"", Notas: c.notas||""
                    })));
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Cobranza");
                    XLSX.writeFile(wb, `Cobranza_${mesNombre.replace(/ /g,"_")}.xlsx`);
                  }} style={{padding:"6px 14px",borderRadius:8,border:"1px solid rgba(255,255,255,.3)",background:"rgba(255,255,255,.15)",color:"#fff",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>
                    📊 Excel
                  </button>
                  <button onClick={()=>{setCobrosMesModal(false);setExpandedCobrosClientes(new Set());}} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,color:"#fff",width:36,height:36,cursor:"pointer",fontSize:20}}>×</button>
                </div>
              </div>

              {/* ── REPORTE PIVOTE ── */}
              {mostrarReporteCobranza && (()=>{
                const MESES_ES2 = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
                const getDestino = concepto => {
                  if(!concepto) return null;
                  const m = concepto.match(/\(([^)]+)\)/);
                  if(m) return m[1];
                  const codes=["CUN","SJD","TQO","CZM","MID","PVR","HUX","MZT","GDL"];
                  const upper=concepto.toUpperCase();
                  for(const code of codes) if(upper.includes(code)) return code;
                  const lower=concepto.toLowerCase();
                  if(lower.includes("tulum")) return "TQO";
                  if(lower.includes("cancun")||lower.includes("cancún")) return "CUN";
                  if(lower.includes("cabos")) return "SJD";
                  return null;
                };

                const ALL_DIMS = ["mesVenta","destino","segmento"];
                const DIM_LABEL = {mesVenta:"📅 Mes de Venta", destino:"📍 Destino", segmento:"✈️ Segmento"};
                const DIM_COLOR = {mesVenta:"#1565C0", destino:"#00695C", segmento:"#7B1FA2"};
                const DIM_BG    = {mesVenta:"#DBEAFE",  destino:"#CCFBF1",  segmento:"#EDE9FE"};

                // Active dims in user-defined order
                const activeDims = reporteDims.filter(d => ALL_DIMS.includes(d));

                const toggleDim = d => setReporteDims(prev => {
                  if(prev.includes(d)) return prev.filter(x=>x!==d);
                  return [...prev, d];
                });
                const moveDim = (d, dir) => setReporteDims(prev => {
                  const arr=[...prev]; const i=arr.indexOf(d);
                  if(i<0) return prev;
                  const j=i+dir;
                  if(j<0||j>=arr.length) return prev;
                  [arr[i],arr[j]]=[arr[j],arr[i]]; return arr;
                });

                // Get unique values for each dim from filas
                const dimVals = {
                  mesVenta: [...new Set(filas.map(c=>c.ing.fechaContable?.slice(0,7)).filter(Boolean))].sort(),
                  destino:  [...new Set(filas.map(c=>getDestino(c.ing.concepto)).filter(Boolean))].sort(),
                  segmento: [...new Set(filas.map(c=>c.ing.segmento).filter(Boolean))].sort(),
                };
                const dimValLabel = (dim, val) => {
                  if(dim==="mesVenta"){const[y,mo]=val.split("-");return `${MESES_ES2[+mo-1].slice(0,3).toUpperCase()} '${y.slice(2)}`;}
                  return val;
                };
                const matchDim = (c, dim, val) => {
                  if(dim==="mesVenta") return c.ing.fechaContable?.startsWith(val);
                  if(dim==="destino")  return getDestino(c.ing.concepto)===val;
                  if(dim==="segmento") return c.ing.segmento===val;
                };

                // Build leaf columns recursively from activeDims
                const buildLeaves = (dims, prefix=[]) => {
                  if(!dims.length) return [prefix];
                  const [d,...rest] = dims;
                  const vals = dimVals[d];
                  if(!vals.length) return buildLeaves(rest, prefix);
                  return vals.flatMap(v => buildLeaves(rest, [...prefix, {dim:d, val:v}]));
                };
                const leaves = buildLeaves(activeDims); // each leaf = array of {dim,val} filters

                // Filter filas for a leaf
                const filterLeaf = (rows, leaf) => leaf.reduce((acc, {dim,val}) => acc.filter(c=>matchDim(c,dim,val)), rows);

                const clienteRows = clientesUnicos.map(cli=>{
                  const rowFilas = filas.filter(c=>c.ing.cliente===cli);
                  const total = rowFilas.reduce((s,c)=>s+c.monto,0);
                  const cells = leaves.map(leaf => {
                    const subset = filterLeaf(rowFilas, leaf);
                    return {sum: subset.reduce((s,c)=>s+c.monto,0), n: subset.length};
                  });
                  return {cli, total, cells, rowFilas};
                }).sort((a,b)=>b.total-a.total);

                const colTotals = leaves.map(leaf => {
                  const subset = filterLeaf(filas, leaf);
                  return subset.reduce((s,c)=>s+c.monto,0);
                });

                // Build spanning header rows
                // For each level of activeDims, compute colSpan groups
                const headerRows = activeDims.map((dim, level) => {
                  // At this level, each group = one value of this dim, spanning all combos below
                  const dimsAbove = activeDims.slice(0, level);
                  const dimsBelow = activeDims.slice(level+1);
                  const vals = dimVals[dim];
                  const spanSize = dimsBelow.reduce((acc,d)=>acc*(dimVals[d].length||1), 1) || 1;

                  // Group consecutive leaves by this dim's value
                  const groups = [];
                  if(dimsAbove.length===0){
                    vals.forEach(v=>{ if(dimVals[dim].includes(v)) groups.push({val:v, span:spanSize}); });
                  } else {
                    // Need to track groups accounting for upper levels
                    const upperCombos = buildLeaves(dimsAbove);
                    upperCombos.forEach(()=>{
                      vals.forEach(v=>groups.push({val:v, span:spanSize}));
                    });
                  }
                  return {dim, groups};
                });

                return (
                  <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
                    {/* Toolbar */}
                    <div style={{padding:"10px 20px",background:"#F8FAFC",borderBottom:`1px solid ${C.border}`,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{fontSize:11,fontWeight:800,color:C.muted,textTransform:"uppercase",letterSpacing:.5}}>Dimensiones:</span>
                      {ALL_DIMS.map(d=>{
                        const active = activeDims.includes(d);
                        const pos = activeDims.indexOf(d);
                        return (
                          <div key={d} style={{display:"flex",alignItems:"center",gap:3}}>
                            <button onClick={()=>toggleDim(d)}
                              style={{padding:"4px 12px",borderRadius:20,border:`1.5px solid ${active?DIM_COLOR[d]:C.border}`,
                                background:active?DIM_BG[d]:"#fff",color:active?DIM_COLOR[d]:C.muted,
                                fontWeight:active?700:400,fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
                              {active?`${pos+1}. `:""}{DIM_LABEL[d]}
                            </button>
                            {active && pos>0 && (
                              <button onClick={()=>moveDim(d,-1)}
                                style={{background:"none",border:"none",cursor:"pointer",fontSize:13,padding:"2px 4px",color:DIM_COLOR[d],lineHeight:1}}>↑</button>
                            )}
                            {active && pos<activeDims.length-1 && (
                              <button onClick={()=>moveDim(d,1)}
                                style={{background:"none",border:"none",cursor:"pointer",fontSize:13,padding:"2px 4px",color:DIM_COLOR[d],lineHeight:1}}>↓</button>
                            )}
                          </div>
                        );
                      })}
                      <div style={{height:20,width:1,background:C.border,margin:"0 4px"}}/>
                      <button onClick={()=>setReporteDims([...ALL_DIMS])}
                        style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${C.border}`,background:"#fff",color:C.text,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                        ✓ Todo
                      </button>
                      <button onClick={()=>setReporteDims([])}
                        style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${C.border}`,background:"#fff",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                        ✗ Limpiar
                      </button>
                      <button onClick={()=>setMostrarReporteCobranza(false)}
                        style={{marginLeft:"auto",padding:"5px 14px",borderRadius:20,border:`1px solid ${C.border}`,background:"#fff",color:C.text,fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
                        ← Volver
                      </button>
                    </div>

                    {/* Pivot table */}
                    <div style={{overflowY:"auto",overflowX:"auto",flex:1}}>
                      <table style={{borderCollapse:"collapse",fontSize:12,minWidth:"100%"}}>
                        <thead style={{position:"sticky",top:0,zIndex:2}}>
                          {/* One header row per active dim */}
                          {headerRows.map(({dim, groups}, level)=>(
                            <tr key={dim} style={{background: level===0?"#1B2A4A": level===1?"#1E3A5A":"#243F60"}}>
                              {level===0 && <th rowSpan={activeDims.length+1} style={{padding:"8px 16px",textAlign:"left",color:"rgba(255,255,255,.7)",fontWeight:700,fontSize:13,minWidth:200,verticalAlign:"bottom",borderRight:"2px solid rgba(255,255,255,.15)"}}>CLIENTE</th>}
                              {groups.map((g,gi)=>(
                                <th key={gi} colSpan={g.span}
                                  style={{padding:"8px 10px",textAlign:"center",fontWeight:800,fontSize:13,textTransform:"uppercase",
                                    color:DIM_BG[dim],whiteSpace:"nowrap",
                                    borderLeft: gi===0 || gi%g.span===0 ?"2px solid rgba(255,255,255,.15)":"1px solid rgba(255,255,255,.06)",
                                    letterSpacing:.3}}>
                                  {dimValLabel(dim, g.val)}
                                </th>
                              ))}
                              {level===0 && <th rowSpan={activeDims.length+1} style={{padding:"8px 12px",textAlign:"center",color:"#A5D6A7",fontWeight:800,fontSize:13,borderLeft:"3px solid rgba(255,255,255,.2)",whiteSpace:"nowrap",verticalAlign:"bottom"}}>TOTAL</th>}
                            </tr>
                          ))}
                        </thead>
                        <tbody>
                          {clienteRows.map((row,ri)=>(
                            <tr key={row.cli} style={{borderBottom:`1px solid ${C.border}`,background:ri%2===0?"#fff":"#F8FFF8"}}
                              onMouseEnter={e=>e.currentTarget.style.background="#ECFDF5"}
                              onMouseLeave={e=>e.currentTarget.style.background=ri%2===0?"#fff":"#F8FFF8"}>
                              <td style={{padding:"10px 16px",fontWeight:700,color:C.navy,fontSize:14,whiteSpace:"nowrap",borderRight:"2px solid #E2E8F0",position:"sticky",left:0,background:ri%2===0?"#fff":"#F8FFF8"}}>{row.cli}</td>
                              {row.cells.map((cell,i)=>(
                                <td key={i} style={{padding:"10px 8px",textAlign:"center",
                                  borderLeft:i===0?"3px solid #E2E8F0":"1px solid #F1F5F9"}}>
                                  {cell.sum>0 ? (
                                    <div style={{fontWeight:800,fontSize:15,color:"#1B5E20"}}>
                                      {sym}{fmt(cell.sum)}
                                      <div style={{fontSize:9,color:C.muted,fontWeight:400}}>{cell.n} cobro{cell.n!==1?"s":""}</div>
                                    </div>
                                  ):<span style={{color:"#E2E8F0"}}>—</span>}
                                </td>
                              ))}
                              <td style={{padding:"10px 12px",textAlign:"center",fontWeight:900,color:"#1B5E20",fontSize:17,borderLeft:"3px solid #E2E8F0",whiteSpace:"nowrap"}}>
                                {sym}{fmt(row.total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{background:"#E8F5E9",borderTop:`3px solid #43A047`}}>
                            <td style={{padding:"12px 16px",fontWeight:900,color:"#1B5E20",fontSize:14,position:"sticky",left:0,background:"#E8F5E9",borderRight:"2px solid #81C784",whiteSpace:"nowrap"}}>TOTAL GENERAL</td>
                            {colTotals.map((t,i)=>(
                              <td key={i} style={{padding:"12px 10px",textAlign:"center",fontWeight:800,color:"#1B5E20",fontSize:14,
                                borderLeft:i===0?"3px solid #81C784":"1px solid #C8E6C9",whiteSpace:"nowrap"}}>
                                {t>0?`${sym}${fmt(t)}`:<span style={{color:"#A5D6A7"}}>—</span>}
                              </td>
                            ))}
                            <td style={{padding:"12px 14px",textAlign:"center",fontWeight:900,color:"#1B5E20",fontSize:20,borderLeft:"3px solid #43A047",whiteSpace:"nowrap"}}>
                              {sym}{fmt(grandTotal)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })()}
              {!mostrarReporteCobranza && <>
              <div style={{padding:"12px 24px 8px",background:"#F1FFF4",display:"flex",gap:10,flexWrap:"wrap"}}>
                {[
                  {icon:"💰",l:"Total Cobrado",  v:`${sym}${fmt(grandTotal)}`,      c:"#1B5E20", bg:"#E8F5E9"},
                  {icon:"🧾",l:"Total Facturado", v:`${sym}${fmt(totalFacturado)}`,  c:C.navy,   bg:"#EEF2FF"},
                  {icon:"👥",l:"Clientes",        v:`${clientesUnicos.length}`,      c:"#1565C0", bg:"#E3F2FD"},
                  {icon:"📋",l:"Facturas",        v:`${filas.length}`,               c:C.muted,  bg:"#F8FAFC"},
                  ...Object.entries(porBanco).map(([b,v])=>({icon:"🏦",l:b, v:`${sym}${fmt(v)}`, c:"#2E7D32", bg:"#E8F5E9"})),
                ].map(k=>(
                  <div key={k.l} style={{background:k.bg,borderRadius:12,padding:"8px 16px",border:`1px solid ${C.border}`,flex:"1 1 120px",minWidth:120}}>
                    <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:.4,marginBottom:2}}>{k.icon} {k.l}</div>
                    <div style={{fontSize:15,fontWeight:900,color:k.c}}>{k.v}</div>
                  </div>
                ))}
              </div>

              {/* KPIs — Fila 2: por segmento + destino */}
              {(()=>{
                const getDestino = concepto => {
                  if(!concepto) return null;
                  // 1. Text in parentheses: (CUN), (SJD), (TQO), etc.
                  const m = concepto.match(/\(([^)]+)\)/);
                  if(m) return m[1];
                  // 2. Code anywhere in text: "Snack SJD", "Foraneo TQO", etc.
                  const codes = ["CUN","SJD","TQO","CZM","MID","PVR","HUX","MZT","GDL"];
                  const upper = concepto.toUpperCase();
                  for(const code of codes){ if(upper.includes(code)) return code; }
                  // 3. City keywords
                  const lower = concepto.toLowerCase();
                  if(lower.includes("tulum")) return "TQO";
                  if(lower.includes("cancun")||lower.includes("cancún")) return "CUN";
                  if(lower.includes("cabos")) return "SJD";
                  if(lower.includes("cozumel")) return "CZM";
                  if(lower.includes("merida")||lower.includes("mérida")) return "MID";
                  if(lower.includes("vallarta")) return "PVR";
                  if(lower.includes("huatulco")) return "HUX";
                  return null;
                };
                const segmentos = [...new Set(filas.map(c=>c.ing.segmento).filter(Boolean))].sort();
                if(!segmentos.length) return null;
                return (
                  <div style={{padding:"8px 24px 12px",background:"#F1FFF4",borderBottom:`1px solid #C8E6C9`,display:"flex",flexDirection:"column",gap:6}}>
                    {segmentos.map(seg=>{
                      const rowsSeg = filas.filter(c=>c.ing.segmento===seg);
                      const porDest = {};
                      rowsSeg.forEach(c=>{
                        const d = getDestino(c.ing.concepto)||"Otros";
                        porDest[d]=(porDest[d]||0)+c.monto;
                      });
                      const destSorted = Object.entries(porDest).sort((a,b)=>b[1]-a[1]);
                      const DEST_COLORS = {CUN:"#E3F2FD",SJD:"#E8F5E9",TQO:"#FFF3E0",TUL:"#F3E5F5",CZM:"#E0F7FA",MID:"#FFF8E1",PVR:"#FCE4EC",Otros:"#F8FAFC"};
                      return (
                        <div key={seg} style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          <span style={{fontSize:11,fontWeight:800,color:"#7B1FA2",minWidth:36,textTransform:"uppercase"}}>{seg}</span>
                          <span style={{fontSize:11,color:C.muted}}>→</span>
                          {destSorted.map(([d,v])=>(
                            <div key={d} style={{background:DEST_COLORS[d]||"#F8FAFC",borderRadius:20,padding:"3px 12px",border:`1px solid ${C.border}`,display:"flex",gap:6,alignItems:"center"}}>
                              <span style={{fontSize:11,fontWeight:800,color:C.navy}}>{d}</span>
                              <span style={{fontSize:12,fontWeight:900,color:"#1B5E20"}}>{sym}{fmt(v)}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Filtros + toggle vista */}
              <div style={{padding:"10px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",background:"#F8FAFC"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:11,color:C.muted,fontWeight:700}}>🏦 BANCO</span>
                  <div style={{display:"flex",gap:4}}>
                    {bancosOpts.map(b=>(
                      <button key={b} onClick={()=>setFiltroBancoMes(b)}
                        style={{padding:"4px 12px",borderRadius:20,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"inherit",
                          background:filtroBancoMes===b?"#1B5E20":"#E8F5E9",color:filtroBancoMes===b?"#fff":"#2E7D32",transition:"all .15s"}}>
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
                {segmentosOpts.length > 2 && (
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:11,color:C.muted,fontWeight:700}}>✈️ SEGMENTO</span>
                    <select value={filtroSegmentoMes} onChange={e=>setFiltroSegmentoMes(e.target.value)}
                      style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:12,fontFamily:"inherit",background:"#fff",cursor:"pointer"}}>
                      {segmentosOpts.map(s=><option key={s} value={s==="Todos"?"":s}>{s}</option>)}
                    </select>
                  </div>
                )}
                {mesesVentaOpts.length > 2 && (
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:11,color:C.muted,fontWeight:700}}>📅 MES VENTA</span>
                    <select value={filtroMesVentaMes} onChange={e=>setFiltroMesVentaMes(e.target.value)}
                      style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:12,fontFamily:"inherit",background:"#fff",cursor:"pointer"}}>
                      {mesesVentaOpts.map(m=>{
                        if(m==="Todos") return <option key="todos" value="">Todos</option>;
                        const [y,mo]=m.split("-");
                        return <option key={m} value={m}>{MESES_ES[+mo-1]} {y}</option>;
                      })}
                    </select>
                  </div>
                )}
                {(filtroBancoMes!=="Todos"||filtroSegmentoMes||filtroMesVentaMes) && (
                  <button onClick={()=>{setFiltroBancoMes("Todos");setFiltroSegmentoMes("");setFiltroMesVentaMes("");}}
                    style={{padding:"4px 12px",borderRadius:20,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"inherit",background:"#F1F5F9",color:C.text}}>
                    ✕ Limpiar
                  </button>
                )}
                {/* Toggle vista */}
                <div style={{marginLeft:"auto",display:"flex",gap:4,background:"#E8F5E9",borderRadius:20,padding:3}}>
                  {[{k:"plana",l:"📋 Plana"},{k:"cliente",l:"👥 Por cliente"}].map(v=>(
                    <button key={v.k} onClick={()=>setVistaCobrosMes(v.k)}
                      style={{padding:"4px 14px",borderRadius:18,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,fontFamily:"inherit",
                        background:vistaCobrosMes===v.k?"#1B5E20":"transparent",color:vistaCobrosMes===v.k?"#fff":"#2E7D32",transition:"all .15s"}}>
                      {v.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tabla */}
              <div style={{overflowY:"auto",flex:1}}>
                {vistaCobrosMes==="cliente" ? (
                  /* ── Vista agrupada por cliente ── */
                  (()=>{
                    const toggleCli = cli => setExpandedCobrosClientes(prev=>{const n=new Set(prev);n.has(cli)?n.delete(cli):n.add(cli);return n;});
                    // Extract destino from concepto: text in parens or known cities
                    const getDestino = concepto => {
                      if(!concepto) return "—";
                      const m = concepto.match(/\(([^)]+)\)/);
                      if(m) return m[1];
                      const codes = ["CUN","SJD","TQO","CZM","MID","PVR","HUX","MZT","GDL"];
                      const upper = concepto.toUpperCase();
                      for(const code of codes){ if(upper.includes(code)) return code; }
                      const lower = concepto.toLowerCase();
                      if(lower.includes("tulum")) return "TQO";
                      if(lower.includes("cancun")||lower.includes("cancún")) return "CUN";
                      if(lower.includes("cabos")) return "SJD";
                      if(lower.includes("cozumel")) return "CZM";
                      if(lower.includes("merida")||lower.includes("mérida")) return "MID";
                      if(lower.includes("vallarta")) return "PVR";
                      if(lower.includes("huatulco")) return "HUX";
                      return "—";
                    };
                    const DESTINO_COLORS = {
                      CUN:"#E3F2FD",SJD:"#E8F5E9",TQO:"#FFF3E0",TUL:"#F3E5F5",
                      CZM:"#E0F7FA",MID:"#FFF8E1",PVR:"#FCE4EC"
                    };
                    return (
                      <div style={{padding:"12px 16px"}}>
                        {porCliente.map(({cli, rows, total})=>{
                          const expanded = expandedCobrosClientes.has(cli);
                          return (
                            <div key={cli} style={{marginBottom:8,border:`1px solid ${expanded?"#A5D6A7":C.border}`,borderRadius:12,overflow:"hidden",transition:"border-color .2s"}}>
                              <div style={{background:expanded?"#D0EDD4":"#E8F5E9",padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",transition:"background .15s"}}
                                onClick={()=>toggleCli(cli)}
                                onMouseEnter={e=>{if(!expanded)e.currentTarget.style.background="#C8E6C9";}}
                                onMouseLeave={e=>{if(!expanded)e.currentTarget.style.background="#E8F5E9";}}>
                                <div style={{display:"flex",alignItems:"center",gap:10}}>
                                  <span style={{fontSize:13,color:"#1B5E20",transform:expanded?"rotate(90deg)":"rotate(0deg)",display:"inline-block",transition:"transform .2s"}}>▶</span>
                                  <span style={{fontWeight:800,fontSize:14,color:C.navy}}>{cli}</span>
                                </div>
                                <div style={{display:"flex",gap:16,alignItems:"center"}}>
                                  <span style={{fontSize:12,color:C.muted}}>{rows.length} cobro{rows.length!==1?"s":""}</span>
                                  <span style={{fontWeight:900,fontSize:16,color:"#1B5E20"}}>{sym}{fmt(total)}</span>
                                </div>
                              </div>
                              {expanded && (
                                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                                  <thead>
                                    <tr style={{background:"#F1FFF4"}}>
                                      {["Segmento","Destino","Folio","Concepto","F.Cobro","Cobrado","Banco","Notas"].map(h=>(
                                        <th key={h} style={{padding:"7px 14px",textAlign:["Cobrado"].includes(h)?"right":"left",color:"#1B5E20",fontWeight:700,fontSize:11,textTransform:"uppercase"}}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((c,ri)=>{
                                      const destino = getDestino(c.ing.concepto);
                                      const destBg = DESTINO_COLORS[destino]||"#F8FAFC";
                                      return (
                                        <tr key={c.id} style={{borderTop:`1px solid #E8F5E9`,background:ri%2===0?"#fff":"#F8FFF8",cursor:"pointer"}}
                                          onClick={()=>{setCobrosMesModal(false);setDetailIngreso(c.ing.id);}}
                                          onMouseEnter={e=>e.currentTarget.style.background="#E8F5E9"}
                                          onMouseLeave={e=>e.currentTarget.style.background=ri%2===0?"#fff":"#F8FFF8"}>
                                          <td style={{padding:"8px 14px",fontSize:12,color:C.muted}}>{c.ing.segmento||"—"}</td>
                                          <td style={{padding:"8px 14px"}}>
                                            <span style={{background:destBg,color:C.navy,fontWeight:800,fontSize:11,padding:"2px 8px",borderRadius:12,whiteSpace:"nowrap"}}>{destino}</span>
                                          </td>
                                          <td style={{padding:"8px 14px",color:C.blue,fontWeight:600,fontSize:12}}>{c.ing.folio||"—"}</td>
                                          <td style={{padding:"8px 14px",color:C.text,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.ing.concepto||"—"}</td>
                                          <td style={{padding:"8px 14px",color:"#1B5E20",fontWeight:600,fontSize:12,whiteSpace:"nowrap"}}>{c.fechaCobro}</td>
                                          <td style={{padding:"8px 14px",textAlign:"right",fontWeight:800,color:"#1B5E20",fontSize:14}}>{sym}{fmt(c.monto)}</td>
                                          <td style={{padding:"8px 14px"}}><span style={{background:"#E8F5E9",color:"#2E7D32",fontWeight:700,fontSize:11,padding:"2px 8px",borderRadius:12}}>{c.banco||"—"}</span></td>
                                          <td style={{padding:"8px 14px",color:C.muted,fontSize:12}}>{c.notas||"—"}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
                ) : (
                  /* ── Vista plana ── */
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                    <thead style={{position:"sticky",top:0}}>
                      <tr style={{background:"#1B5E20"}}>
                        {["Cliente","Segmento","Folio","Concepto","F. Contable","F. Factura","F. Cobro","Monto Fact.","Cobrado","Banco","Notas"].map(h=>(
                          <th key={h} style={{padding:"11px 14px",textAlign:["Monto Fact.","Cobrado"].includes(h)?"right":"left",
                            color:"rgba(255,255,255,.85)",fontWeight:800,fontSize:11,textTransform:"uppercase",whiteSpace:"nowrap"}}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((c,i)=>{
                        const ing = c.ing;
                        return (
                          <tr key={c.id} style={{borderTop:`1px solid ${C.border}`,background:i%2===0?"#fff":"#F8FFF8",cursor:"pointer"}}
                            onClick={()=>{setCobrosMesModal(false);setDetailIngreso(ing.id);}}
                            onMouseEnter={e=>e.currentTarget.style.background="#E8F5E9"}
                            onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"#fff":"#F8FFF8"}>
                            <td style={{padding:"10px 14px",fontWeight:700,color:C.navy,whiteSpace:"nowrap"}}>{ing.cliente}</td>
                            <td style={{padding:"10px 14px",fontSize:12,color:C.muted}}>{ing.segmento||"—"}</td>
                            <td style={{padding:"10px 14px",color:C.blue,fontWeight:600,whiteSpace:"nowrap",fontSize:12}}>{ing.folio||"—"}</td>
                            <td style={{padding:"10px 14px",color:C.text,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ing.concepto||"—"}</td>
                            <td style={{padding:"10px 14px",color:C.teal,whiteSpace:"nowrap",fontSize:12}}>{ing.fechaContable||"—"}</td>
                            <td style={{padding:"10px 14px",color:C.muted,whiteSpace:"nowrap",fontSize:12}}>{ing.fecha||"—"}</td>
                            <td style={{padding:"10px 14px",color:"#1B5E20",fontWeight:600,whiteSpace:"nowrap",fontSize:12}}>{c.fechaCobro}</td>
                            <td style={{padding:"10px 14px",textAlign:"right",fontWeight:600,color:C.navy}}>{sym}{fmt(ing.monto)}</td>
                            <td style={{padding:"10px 14px",textAlign:"right",fontWeight:800,color:"#1B5E20",fontSize:14}}>{sym}{fmt(c.monto)}</td>
                            <td style={{padding:"10px 14px",whiteSpace:"nowrap"}}>
                              <span style={{background:"#E8F5E9",color:"#2E7D32",fontWeight:700,fontSize:11,padding:"2px 8px",borderRadius:12}}>{c.banco||"—"}</span>
                            </td>
                            <td style={{padding:"10px 14px",color:C.muted,fontSize:12,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.notas||"—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{background:"#E8F5E9",borderTop:`2px solid #A5D6A7`}}>
                        <td colSpan={8} style={{padding:"11px 14px",fontWeight:800,color:"#1B5E20",fontSize:13}}>
                          TOTAL — {filas.length} cobro{filas.length!==1?"s":""} · {clientesUnicos.length} clientes
                        </td>
                        <td style={{padding:"11px 14px",textAlign:"right",fontWeight:900,color:"#1B5E20",fontSize:15}}>{sym}{fmt(grandTotal)}</td>
                        <td colSpan={2}/>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
              </>
              }
            </div>
          </div>
        );
      })()}


      {/* ── Por Facturar chips (solo empresa_2) — movido a fila 1, solo legacy fallback ── */}
      {empresaId === "empresa_2" && false && porFacturar.length > 0 && (()=>{ return null; })()}

      {/* ── KPI Desglose Modal ── */}
      {kpiModal && (()=>{
        const { titulo, tipo, moneda, ingresos: modalIngresos } = kpiModal;

        // Special: lista de facturas de un cliente
        if(tipo === "_lista") {
          const ings = modalIngresos || [];
          return(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:10}}
              onClick={()=>setKpiModal(null)}>
              <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:1500,maxHeight:"95vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}
                onClick={e=>e.stopPropagation()}>
                <div style={{padding:"16px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:C.navy,borderRadius:"16px 16px 0 0"}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:16,color:"#fff"}}>{titulo}</div>
                    <div style={{fontSize:12,color:"#A5D6A7",marginTop:2}}>{ings.length} factura{ings.length!==1?"s":""}</div>
                  </div>
                  <button onClick={()=>setKpiModal(null)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,color:"#fff",width:32,height:32,cursor:"pointer",fontSize:18}}>×</button>
                </div>
                <div style={{overflowY:"auto",flex:1}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                    <thead style={{position:"sticky",top:0}}>
                      <tr style={{background:"#EEF2FF"}}>
                        {["Folio","Concepto","Segmento","F.Contable","Fecha","Vencimiento","Días","Monto","Cobrado","Por Cobrar"].map(h=>(
                          <th key={h} style={{padding:"10px 12px",textAlign:["Monto","Cobrado","Por Cobrar"].includes(h)?"right":"left",color:C.navy,fontWeight:700,fontSize:12,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ings.sort((a,b)=>(a.fechaVencimiento||"").localeCompare(b.fechaVencimiento||"")).map((ing,i)=>{
                        const m=metrics[ing.id]||{};
                        const sym2=monedaSym(ing.moneda);
                        const dias=diasDiff(ing.fechaVencimiento);
                        return(
                          <tr key={ing.id} style={{borderTop:`1px solid ${C.border}`,background:ing.oculta?"#FFF8E1":i%2===0?"#fff":"#FAFBFC",opacity:ing.oculta?0.6:1}}>
                            <td style={{padding:"10px 12px",color:C.blue,fontWeight:600,whiteSpace:"nowrap"}}>{ing.folio||"—"}</td>
                            <td style={{padding:"10px 12px",color:C.muted,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ing.concepto||"—"}</td>
                            <td style={{padding:"10px 12px",fontSize:12}}>{ing.segmento||"—"}</td>
                            <td style={{padding:"10px 12px",fontSize:12,color:C.teal,whiteSpace:"nowrap"}}>{ing.fechaContable||"—"}</td>
                            <td style={{padding:"10px 12px",fontSize:12,color:C.muted,whiteSpace:"nowrap"}}>{ing.fecha||"—"}</td>
                            <td style={{padding:"10px 12px",fontSize:12,whiteSpace:"nowrap",color:dias!==null&&dias<0?C.danger:C.text}}>{ing.fechaVencimiento||"—"}</td>
                            <td style={{padding:"10px 12px",textAlign:"center"}}>
                              {dias===null?<span style={{color:C.muted}}>—</span>:dias<0?
                                <span style={{background:"#FFEBEE",color:C.danger,fontWeight:800,fontSize:11,padding:"2px 6px",borderRadius:20}}>{Math.abs(dias)}d venc.</span>:
                                <span style={{background:"#E8F5E9",color:C.ok,fontWeight:700,fontSize:11,padding:"2px 6px",borderRadius:20}}>{dias}d</span>}
                            </td>
                            <td style={{padding:"10px 12px",textAlign:"right",fontWeight:600}}>{sym2}{fmt(ing.monto)}</td>
                            <td style={{padding:"10px 12px",textAlign:"right",color:C.ok}}>{sym2}{fmt(m.totalCobrado||0)}</td>
                            <td style={{padding:"10px 12px",textAlign:"right",fontWeight:700,color:(m.porCobrar||0)>0?C.warn:C.ok}}>{sym2}{fmt(m.porCobrar||0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{padding:"12px 24px",borderTop:`1px solid ${C.border}`,display:"flex",gap:20,background:"#F8FAFC"}}>
                  <span style={{fontSize:13,color:C.muted}}>Total: <b style={{color:C.navy}}>{monedaSym(ings[0]?.moneda||"MXN")}{fmt(ings.reduce((s,i)=>s+i.monto,0))}</b></span>
                  <span style={{fontSize:13,color:C.muted}}>Por Cobrar: <b style={{color:C.warn}}>{monedaSym(ings[0]?.moneda||"MXN")}{fmt(ings.reduce((s,i)=>s+(metrics[i.id]?.porCobrar||0),0))}</b></span>
                </div>
              </div>
            </div>
          );
        }

        const sym = monedaSym(moneda);

        // Filtra los ingresos de esa moneda según el tipo de KPI
        const rows = filtered.filter(ing => ing.moneda === moneda).map(ing => {
          const m = metrics[ing.id] || {};
          let valor = 0;
          if (tipo === "total")          valor = ing.monto;
          else if (tipo === "cobrado")   valor = m.totalCobrado || 0;
          else if (tipo === "porCobrar") valor = m.porCobrar || 0;
          else if (tipo === "consumido") valor = m.consumido || 0;
          else if (tipo === "porPagar")  valor = m.porPagar || 0;
          else if (tipo === "disponible")    valor = m.disponible || 0;
          else if (tipo === "disponibleNeto") valor = m.disponibleNeto || 0;
          return { ing, valor };
        }).filter(r => r.valor !== 0).sort((a,b) => Math.abs(b.valor) - Math.abs(a.valor));

        const total = rows.reduce((s,r) => s+r.valor, 0);
        const colorTipo = {
          total:C.navy, cobrado:C.ok, porCobrar:C.warn, consumido:C.danger,
          porPagar:"#E65100", disponible:C.teal, disponibleNeto:total>=0?C.green:C.danger
        }[tipo]||C.navy;

        return (
          <div style={{position:"fixed",inset:0,background:"rgba(15,45,74,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2500,padding:20}}
            onClick={()=>setKpiModal(null)}>
            <div onClick={e=>e.stopPropagation()}
              style={{background:C.surface,borderRadius:20,padding:28,width:"100%",maxWidth:620,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}>
              {/* Header */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
                <div>
                  <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>Desglose</div>
                  <div style={{fontSize:20,fontWeight:900,color:colorTipo}}>{titulo}</div>
                </div>
                <button onClick={()=>setKpiModal(null)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:18}}>×</button>
              </div>
              {/* Total */}
              <div style={{background:"#F8FAFC",borderRadius:10,padding:"12px 16px",marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,color:C.muted,fontWeight:600}}>Total {moneda}</span>
                <span style={{fontSize:22,fontWeight:900,color:colorTipo}}>{sym}{fmt(total)}</span>
              </div>
              {/* Tabla de ingresos */}
              {rows.length === 0 ? (
                <div style={{textAlign:"center",padding:30,color:C.muted}}>Sin registros</div>
              ) : (
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead>
                    <tr style={{background:"#F8FAFC"}}>
                      {["Cliente","Concepto","Categoría","Fecha","Importe"].map(h=>(
                        <th key={h} style={{padding:"9px 10px",textAlign:h==="Importe"?"right":"left",color:C.muted,fontWeight:700,fontSize:11,textTransform:"uppercase",borderBottom:`2px solid ${C.border}`}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ing,valor},idx)=>{
                      const catStyle = getCatStyle(ing.categoria);
                      return (
                        <tr key={ing.id}
                          style={{borderBottom:`1px solid ${C.border}`,background:idx%2===0?C.surface:"#FAFBFC",cursor:"pointer",transition:"background .12s"}}
                          onClick={()=>{setKpiModal(null); setDetailIngreso(ing.id);}}
                          onMouseEnter={e=>{e.currentTarget.style.background="#F0F7FF";}}
                          onMouseLeave={e=>{e.currentTarget.style.background=idx%2===0?C.surface:"#FAFBFC";}}>
                          <td style={{padding:"10px 10px",fontWeight:700,color:C.navy}}>{ing.cliente}</td>
                          <td style={{padding:"10px 10px",color:ing.concepto?C.text:C.muted,fontStyle:ing.concepto?"normal":"italic",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ing.concepto||"—"}</td>
                          <td style={{padding:"10px 10px"}}>
                            <span style={{background:catStyle.bg,color:catStyle.text,border:`1px solid ${catStyle.border}`,padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{ing.categoria}</span>
                          </td>
                          <td style={{padding:"10px 10px",fontSize:12,color:C.muted,whiteSpace:"nowrap"}}>{ing.fecha||"—"}</td>
                          <td style={{padding:"10px 10px",textAlign:"right",fontWeight:800,color:valor>=0?colorTipo:C.danger}}>{sym}{fmt(valor)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{borderTop:`2px solid ${C.navy}`,background:"#EEF2FF"}}>
                      <td colSpan={4} style={{padding:"10px 10px",fontWeight:800,color:C.navy,fontSize:13}}>TOTAL ({rows.length} ingresos)</td>
                      <td style={{padding:"10px 10px",textAlign:"right",fontWeight:900,fontSize:15,color:colorTipo}}>{sym}{fmt(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
              <div style={{fontSize:11,color:C.muted,marginTop:12,textAlign:"center"}}>Clic en una fila para abrir el detalle del ingreso</div>
            </div>
          </div>
        );
      })()}

      {/* Global stats strip */}
      <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        <div style={{background:"#E8F0FE",border:`1px solid #C7D7FD`,borderRadius:10,padding:"8px 16px",fontSize:13}}>
          <span style={{color:C.muted}}>Total ingresos: </span><span style={{fontWeight:700,color:C.navy}}>{totalIngresos}</span>
        </div>
        <div style={{background:"#FFF3E0",border:"1px solid #FFCC80",borderRadius:10,padding:"8px 16px",fontSize:13}}>
          <span style={{color:C.muted}}>Pendientes de cobro: </span><span style={{fontWeight:700,color:C.warn}}>{pendientesDeCobrar}</span>
        </div>
        <div style={{background:"#E0F2F1",border:"1px solid #80CBC4",borderRadius:10,padding:"8px 16px",fontSize:13}}>
          <span style={{color:C.muted}}>Vinculaciones activas: </span><span style={{fontWeight:700,color:C.teal}}>{invoiceIngresos.length}</span>
        </div>
      </div>

      {/* Filters */}
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:18,marginBottom:20}}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
          <input placeholder="🔍 Buscar cliente, concepto…" value={filtroSearch} onChange={e=>setFiltroSearch(e.target.value)} style={{...inputStyle,maxWidth:220}}/>
          <select value={filtroCliente} onChange={e=>setFiltroCliente(e.target.value)} style={{...selectStyle,maxWidth:200}}>
            <option value="">Todos los clientes</option>
            {clientesList.map(c=><option key={c}>{c}</option>)}
          </select>
          <select value={filtroCategoria} onChange={e=>setFiltroCategoria(e.target.value)} style={{...selectStyle,maxWidth:180}}>
            <option value="">Todas las categorías</option>
            {catList.map(c=><option key={c}>{c}</option>)}
          </select>
          <select value={filtroMoneda} onChange={e=>setFiltroMoneda(e.target.value)} style={{...selectStyle,maxWidth:130}}>
            <option value="">Todas las monedas</option>
            <option value="MXN">🇲🇽 MXN</option>
            <option value="USD">🇺🇸 USD</option>
            <option value="EUR">🇪🇺 EUR</option>
          </select>
          <select value={filtroCobro} onChange={e=>setFiltroCobro(e.target.value)} style={{...selectStyle,maxWidth:160}}>
            <option value="">💵 Todos</option>
            <option value="cobrado">✅ Con cobros</option>
            <option value="porCobrar">⏳ Por cobrar</option>
          </select>
          {/* Destino (solo TAS) */}
          {empresaId === "empresa_2" && destinosList.length > 0 && (
            <select value={filtroDestino} onChange={e=>setFiltroDestino(e.target.value)}
              style={{...selectStyle,maxWidth:160,borderColor:filtroDestino?C.blue:C.border,color:filtroDestino?C.blue:C.text,fontWeight:filtroDestino?700:400}}>
              <option value="">🗺️ Destino</option>
              {destinosList.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
          )}
          {/* Mes de Venta (Fecha Contable) */}
          <select value={filtroMesContable} onChange={e=>setFiltroMesContable(e.target.value)} style={{...selectStyle,maxWidth:170,borderColor:filtroMesContable?"#7B1FA2":C.border,color:filtroMesContable?"#7B1FA2":C.text}}>
            <option value="">📅 Mes de Venta</option>
            {mesesContableList.map(m=>{
              const [y,mo]=m.split("-");
              return <option key={m} value={m}>{MESES_NOMBRES[+mo-1]} {y}</option>;
            })}
          </select>
          {/* Segmento */}
          {segmentosList.length > 0 && (
            <select value={filtroSegmento} onChange={e=>setFiltroSegmento(e.target.value)} style={{...selectStyle,maxWidth:150}}>
              <option value="">Todos los segmentos</option>
              {segmentosList.map(s=><option key={s}>{s}</option>)}
            </select>
          )}
          <input type="date" value={filtroFechaFrom} onChange={e=>setFiltroFechaFrom(e.target.value)} style={{...inputStyle,maxWidth:150}} title="Desde"/>
          <input type="date" value={filtroFechaTo} onChange={e=>setFiltroFechaTo(e.target.value)} style={{...inputStyle,maxWidth:150}} title="Hasta"/>
          {/* Mostrar ocultas */}
          <button onClick={()=>setMostrarOcultas(p=>!p)}
            style={{...btnStyle,background:mostrarOcultas?"#FFF3E0":"#F1F5F9",color:mostrarOcultas?"#E65100":C.muted,padding:"7px 14px",fontSize:12,border:`1px solid ${mostrarOcultas?"#E65100":C.border}`}}>
            {mostrarOcultas?"👁️ Ocultando":"👁️ Ocultas"}
          </button>
          {(filtroSearch||filtroCliente||filtroCategoria||filtroMoneda||filtroFechaFrom||filtroFechaTo||filtroCobro||filtroMesContable||filtroSegmento||filtroDestino) && (
            <button onClick={()=>{setFiltroSearch("");setFiltroCliente("");setFiltroCategoria("");setFiltroMoneda("");setFiltroFechaFrom("");setFiltroFechaTo("");setFiltroCobro("");setFiltroMesContable("");setFiltroSegmento("");setFiltroDestino("");}} style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"7px 14px",fontSize:12}}>✕ Limpiar</button>
          )}
        </div>
      </div>

      {/* Bulk toolbar */}
      {selectedIngresos.size > 0 && !esConsulta && (
        <div style={{background:"#E8F0FE",border:`2px solid ${C.blue}`,borderRadius:12,padding:"14px 20px",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",marginBottom:10}}>
            <span style={{fontWeight:800,color:C.blue,fontSize:16}}>{selectedIngresos.size} ingreso{selectedIngresos.size!==1?"s":""} seleccionado{selectedIngresos.size!==1?"s":""}</span>
            {Object.entries(selectedTotals).map(([mon,v])=>(
              <div key={mon} style={{display:"flex",gap:12,fontSize:14,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontWeight:800,color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[mon]}}>{mon}:</span>
                <span style={{color:C.navy,fontWeight:700}}>Total {monedaSym(mon)}{fmt(v.monto)}</span>
                <span style={{color:C.ok,fontWeight:700}}>Cobrado {monedaSym(mon)}{fmt(v.cobrado)}</span>
                <span style={{color:C.warn,fontWeight:700}}>x Cobrar {monedaSym(mon)}{fmt(v.porCobrar)}</span>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <button onClick={()=>setCobroMasivoModal(true)} style={{...btnStyle,background:C.ok,padding:"9px 18px",fontSize:13,fontWeight:700}}>💰 Cobro Masivo</button>
            <button onClick={()=>setBulkFechaModal(true)} style={{...btnStyle,background:"#7B1FA2",padding:"9px 18px",fontSize:13,fontWeight:700}}>📅 Fecha Ficticia Masiva</button>
            <button onClick={async()=>{
              const ids=[...selectedIngresos];
              setIngresos(prev=>prev.map(i=>ids.includes(i.id)?{...i,oculta:true}:i));
              await Promise.all(ids.map(id=>updateIngresoField(id,{oculta:true})));
              setSelectedIngresos(new Set());
            }} style={{...btnStyle,background:"#E65100",color:"#fff",padding:"9px 18px",fontSize:13,fontWeight:700}}>👁️ Ocultar seleccionadas</button>
            {mostrarOcultas && <button onClick={async()=>{
              const ids=[...selectedIngresos];
              setIngresos(prev=>prev.map(i=>ids.includes(i.id)?{...i,oculta:false}:i));
              await Promise.all(ids.map(id=>updateIngresoField(id,{oculta:false})));
              setSelectedIngresos(new Set());
            }} style={{...btnStyle,background:C.ok,padding:"9px 18px",fontSize:13,fontWeight:700}}>👁️ Restaurar seleccionadas</button>}
            <button onClick={()=>setSelectedIngresos(new Set())} style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"9px 14px",fontSize:13,fontWeight:600}}>✕ Deseleccionar</button>
          </div>
        </div>
      )}

      {/* Ingresos — vista condicional */}
      {filtered.length === 0 ? (
        <div style={{textAlign:"center",padding:60,color:C.muted,background:C.surface,borderRadius:14,border:`1px solid ${C.border}`}}>
          <div style={{fontSize:48,marginBottom:12}}>💵</div>
          <div style={{fontSize:16,fontWeight:600}}>
            {ingresos.length === 0 ? "Sin ingresos registrados" : "Sin resultados con estos filtros"}
          </div>
          {ingresos.length === 0 && (
            <button onClick={()=>setModalIngreso({id:"",cliente:"",concepto:"",categoria:catList[0]||"Circuito",monto:"",moneda:"MXN",tipoCambio:1,fecha:today(),notas:""})} style={{...btnStyle,marginTop:16}}>
              + Crear primer ingreso
            </button>
          )}
        </div>
      ) : vistaGrupo === "cliente" ? (

        /* ── VISTA AGRUPADA POR CLIENTE ── */
        <div style={{display:"flex",flexDirection:"column",gap:0}}>

          {/* ── Header bar con títulos y ordenamiento (solo empresa_2) ── */}
          {empresaId === "empresa_2" && (() => {
            const toggleSort = (col) => {
              if (clienteSortCol === col) setClienteSortDir(d => d === "asc" ? "desc" : "asc");
              else { setClienteSortCol(col); setClienteSortDir(col === "cliente" ? "asc" : "desc"); }
            };
            const arrow = (col) => clienteSortCol === col ? (clienteSortDir === "asc" ? " ↑" : " ↓") : "";
            const TAS_COLS = ["cliente","_moneda","total","cobrado","vencido","pv15","pv30","pv60","pvmas"];
            const TAS_LABELS = {cliente:"Cliente",_moneda:"Moneda",total:"Total",cobrado:"Cobrado",vencido:"Vencido",pv15:"Por Vencer 1-15d",pv30:"Por Vencer 16-30d",pv60:"Por Vencer 31-60d",pvmas:"Por Vencer +60d"};
            const TAS_TPL = "minmax(160px,1fr) 70px repeat(7,130px)";
            return (
              <div style={{display:"grid",gridTemplateColumns:TAS_TPL,background:C.navy,borderRadius:"14px 14px 0 0",position:"sticky",top:0,zIndex:10}}>
                {TAS_COLS.map(col => (
                  <div key={col}
                    onClick={col !== "_moneda" ? ()=>toggleSort(col) : undefined}
                    style={{padding:"12px 10px",textAlign: col==="cliente"?"left":"center",fontSize:11,fontWeight:800,
                      textTransform:"uppercase",letterSpacing:.6,cursor:col!=="_moneda"?"pointer":"default",
                      color:clienteSortCol===col?"#90CAF9":"rgba(255,255,255,.8)",
                      userSelect:"none",whiteSpace:"nowrap",
                      borderBottom:clienteSortCol===col?"2px solid #90CAF9":"2px solid transparent",
                      transition:"color .15s"}}
                    onMouseEnter={e=>{if(col!=="_moneda")e.currentTarget.style.color="#fff";}}
                    onMouseLeave={e=>{e.currentTarget.style.color=clienteSortCol===col?"#90CAF9":"rgba(255,255,255,.8)";}}>
                    {TAS_LABELS[col]}{arrow(col)}
                  </div>
                ))}
              </div>
            );
          })()}

          {groupedByCliente.map(([cliente, ings, agPri, agByMon]) => {
            const expanded = clientesExpanded.has(cliente);
            // Consolidated metrics per moneda (for empresa_1 standard view)
            const byMon = {};
            ings.forEach(ing => {
              const m = metrics[ing.id] || {};
              const mon = ing.moneda;
              if (!byMon[mon]) byMon[mon] = {monto:0,cobrado:0,porCobrar:0,consumido:0,porPagar:0,disponible:0,disponibleNeto:0};
              byMon[mon].monto          += ing.monto;
              byMon[mon].cobrado        += m.totalCobrado||0;
              byMon[mon].porCobrar      += m.porCobrar||0;
              byMon[mon].consumido      += m.consumido||0;
              byMon[mon].porPagar       += m.porPagar||0;
              byMon[mon].disponible     += m.disponible||0;
              byMon[mon].disponibleNeto += m.disponibleNeto||0;
            });
            const monedas = Object.keys(byMon);

            if (empresaId === "empresa_2") {
              const TAS_TPL = "minmax(160px,1fr) 70px repeat(7,130px)";
              return (
                <div key={cliente} style={{background:C.surface,border:`1px solid ${expanded?C.blue:C.border}`,borderTop:"none",overflow:"hidden",transition:"border-color .2s"}}>
                  {monedas.map((mon,mi) => {
                    const ag = agByMon[mon] || {total:0,cobradoParcial:0,vencido:0,pv15:0,pv30:0,pv60:0,pvmas:0};
                    const sym = monedaSym(mon);
                    const monCol = {MXN:C.mxn,USD:C.usd,EUR:C.eur}[mon]||C.navy;
                    const monBg  = {MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[mon]||"#F8FAFC";
                    const vals = [ag.total,ag.cobradoParcial,ag.vencido,ag.pv15,ag.pv30,ag.pv60,ag.pvmas];
                    const cols = ["#1A237E","#2E7D32","#B71C1C","#33691E","#388E3C","#43A047","#66BB6A"];
                    return (
                      <div key={mon}
                        onClick={()=>toggleCliente(cliente)}
                        style={{display:"grid",gridTemplateColumns:TAS_TPL,alignItems:"center",
                          padding:"10px 0",background:expanded?"#E8F0FE":mi%2===0?"#F8FAFC":"#fff",
                          cursor:"pointer",transition:"background .15s",borderTop:mi>0?`1px solid ${C.border}`:"none"}}
                        onMouseEnter={e=>{if(!expanded)e.currentTarget.style.background="#F0F4FF";}}
                        onMouseLeave={e=>{if(!expanded)e.currentTarget.style.background=expanded?"#E8F0FE":mi%2===0?"#F8FAFC":"#fff";}}>
                        {/* Cliente */}
                        <div style={{padding:"0 12px",display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                          {mi===0 && <>
                            <span style={{fontSize:15,color:expanded?C.blue:C.muted,flexShrink:0,transition:"transform .2s",display:"inline-block",transform:expanded?"rotate(90deg)":"rotate(0deg)"}}>▶</span>
                            <div style={{minWidth:0}}>
                              <div style={{fontWeight:800,fontSize:14,color:C.navy,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{cliente}</div>
                              <div style={{fontSize:11,color:C.blue,marginTop:1,cursor:"pointer",textDecoration:"underline",textDecorationStyle:"dotted"}}
                                onClick={e=>{e.stopPropagation();setKpiModal({titulo:`${cliente} — Todas las facturas`,tipo:"_lista",moneda:null,ingresos:ings});}}>
                                {ings.length} ingreso{ings.length!==1?"s":""}
                              </div>
                            </div>
                          </>}
                        </div>
                        {/* Moneda */}
                        <div style={{textAlign:"center",padding:"0 4px"}}>
                          <span style={{background:monBg,color:monCol,fontWeight:800,fontSize:11,padding:"2px 8px",borderRadius:20}}>{mon}</span>
                        </div>
                        {/* Valores numéricos — clickeables para ver detalle */}
                        {[
                          {v:ag.total,       c:"#1A237E", label:"Total",             fn: i => (metrics[i.id]?.porCobrar||0)>0},
                          {v:ag.cobradoParcial,c:"#2E7D32",label:"Cobrado",          fn: i => (metrics[i.id]?.totalCobrado||0)>0 && (metrics[i.id]?.porCobrar||0)>0},
                          {v:ag.vencido,     c:"#B71C1C", label:"Vencido",           fn: i => { const d=diasDiff(i.fechaVencimiento); return (metrics[i.id]?.porCobrar||0)>0 && d!==null && d<0; }},
                          {v:ag.pv15,        c:"#33691E", label:"Por Vencer 1-15d",  fn: i => { const d=diasDiff(i.fechaVencimiento); return (metrics[i.id]?.porCobrar||0)>0 && (d===null||(d>=0&&d<=15)); }},
                          {v:ag.pv30,        c:"#388E3C", label:"Por Vencer 16-30d", fn: i => { const d=diasDiff(i.fechaVencimiento); return (metrics[i.id]?.porCobrar||0)>0 && d!==null && d>15 && d<=30; }},
                          {v:ag.pv60,        c:"#43A047", label:"Por Vencer 31-60d", fn: i => { const d=diasDiff(i.fechaVencimiento); return (metrics[i.id]?.porCobrar||0)>0 && d!==null && d>30 && d<=60; }},
                          {v:ag.pvmas,       c:"#66BB6A", label:"Por Vencer +60d",   fn: i => { const d=diasDiff(i.fechaVencimiento); return (metrics[i.id]?.porCobrar||0)>0 && d!==null && d>60; }},
                        ].map((col,i)=>(
                          <div key={i} style={{textAlign:"center",padding:"0 6px"}}
                            onClick={col.v>0 ? e=>{
                              e.stopPropagation();
                              const ingsMon = ings.filter(ing => ing.moneda===mon);
                              setModalSortCol("vencimiento");
                              setModalSortDir("asc");
                              setAgingDetailModal({
                                titulo:`${cliente} — ${col.label}`,
                                ings: ingsMon.filter(col.fn),
                                moneda: mon,
                              });
                            } : undefined}>
                            <span style={{
                              fontSize:14,fontWeight:800,whiteSpace:"nowrap",
                              color:col.v>0?col.c:"#CFD8DC",
                              cursor:col.v>0?"pointer":"default",
                              borderBottom:col.v>0?`1px dotted ${col.c}`:"none",
                            }}>
                              {col.v>0?`${sym}${fmt(col.v)}`:"—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {/* Ingresos expandidos */}
                  {expanded && (
                    <div style={{borderTop:`1px solid ${C.border}`,overflowX:"auto"}}>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:14,minWidth:1200}}>
                        <thead>
                          <tr style={{background:C.navy}}>
                            <th style={{padding:"8px 6px",width:36,textAlign:"center"}}>
                              <input type="checkbox" style={{cursor:"pointer",accentColor:"#fff"}}
                                checked={ings.every(i=>selectedIngresos.has(i.id))}
                                onChange={()=>{
                                  const allSelected = ings.every(i=>selectedIngresos.has(i.id));
                                  setSelectedIngresos(prev=>{
                                    const n=new Set(prev);
                                    if(allSelected) ings.forEach(i=>n.delete(i.id));
                                    else ings.forEach(i=>n.add(i.id));
                                    return n;
                                  });
                                }}/>
                            </th>
                            {[
                              {k:"segmento",    l:"Segmento"},
                              {k:"folio",       l:"Folio"},
                              {k:"concepto",    l:"Concepto"},
                              {k:"moneda",      l:"Moneda"},
                              {k:"fechaContable",l:"Fecha Contable"},
                              {k:"fecha",       l:"Fecha Factura"},
                              {k:"fechaVencimiento",l:"Vencimiento"},
                              {k:"diasVencidos",l:"Días Vencidos"},
                              {k:"porVencer",   l:"Por Vencer"},
                              {k:"_ficticia",   l:"Fecha Ficticia"},
                              {k:"total",       l:"Monto"},
                              {k:"montoPagado", l:"Cobrado"},
                              {k:"porCobrar",   l:"Por Cobrar"},
                              {k:"_acc",        l:"Acciones"},
                            ].map(col=>(
                              <th key={col.k}
                                onClick={col.k.startsWith("_")?undefined:()=>{
                                  if(clienteSortCol===col.k) setClienteSortDir(d=>d==="asc"?"desc":"asc");
                                  else{setClienteSortCol(col.k);setClienteSortDir("asc");}
                                }}
                                style={{padding:"10px 10px",
                                  textAlign:["total","montoPagado","porCobrar"].includes(col.k)?"right":["diasVencidos","porVencer"].includes(col.k)?"center":"left",
                                  color:clienteSortCol===col.k?"#90CAF9":"rgba(255,255,255,.85)",
                                  fontWeight:700,fontSize:12,textTransform:"uppercase",whiteSpace:"nowrap",
                                  cursor:col.k.startsWith("_")?"default":"pointer",userSelect:"none",
                                  borderBottom:clienteSortCol===col.k?"2px solid #90CAF9":"2px solid transparent"}}>                                {col.l}{clienteSortCol===col.k?(clienteSortDir==="asc"?" ↑":" ↓"):""}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...ings].sort((a,b)=>{
                            const col=clienteSortCol, dir=clienteSortDir==="asc"?1:-1;
                            const va=a[col]??"", vb=b[col]??"";
                            if(["total","montoPagado","porCobrar"].includes(col)) return ((+va||0)-(+vb||0))*dir;
                            return String(va).localeCompare(String(vb))*dir;
                          }).map((ing,idx) => <IngresoRow key={ing.id} ing={ing} idx={idx}/>)}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            }

            // ── Vista estándar empresa_1 ──
            return (
              <div key={cliente} style={{background:C.surface,border:`1px solid ${expanded?C.blue:C.border}`,borderRadius:14,overflow:"hidden",transition:"border-color .2s"}}>
                {/* Cliente header — clickable */}
                <div onClick={()=>toggleCliente(cliente)}
                  style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",background:expanded?"#E8F0FE":"#F8FAFC",cursor:"pointer",transition:"background .15s"}}
                  onMouseEnter={e=>{if(!expanded)e.currentTarget.style.background="#F0F4FF";}}
                  onMouseLeave={e=>{if(!expanded)e.currentTarget.style.background="#F8FAFC";}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:16,color:expanded?C.blue:C.muted,transition:"transform .2s",display:"inline-block",transform:expanded?"rotate(90deg)":"rotate(0deg)"}}>▶</span>
                    <div>
                      <div style={{fontWeight:800,fontSize:15,color:C.navy}}>{cliente}</div>
                      <div style={{fontSize:12,color:C.blue,marginTop:2,cursor:"pointer",textDecoration:"underline",textDecorationStyle:"dotted"}}
                        onClick={e=>{e.stopPropagation();setKpiModal({titulo:`${cliente} — Todas las facturas`,tipo:"_lista",moneda:null,ingresos:ings});}}>
                        {ings.length} ingreso{ings.length!==1?"s":""}
                      </div>
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
                    {monedas.map(mon => {
                      const v = byMon[mon];
                      const sym = monedaSym(mon);
                      const monCol = {MXN:C.mxn,USD:C.usd,EUR:C.eur}[mon]||C.navy;
                      const monBg  = {MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[mon]||"#F8FAFC";
                      return (
                        <div key={mon} style={{display:"grid",gridTemplateColumns:"50px 120px 120px 120px 120px 120px 120px 120px",alignItems:"center",gap:0}}>
                          <span style={{background:monBg,color:monCol,fontWeight:800,fontSize:11,padding:"2px 8px",borderRadius:20,textAlign:"center"}}>{mon}</span>
                          {[
                            {l:"Monto",v:`${sym}${fmt(v.monto)}`,c:C.navy},
                            {l:"Cobrado",v:`${sym}${fmt(v.cobrado)}`,c:C.ok},
                            {l:"Por Cobrar",v:`${sym}${fmt(v.porCobrar)}`,c:C.warn},
                            {l:"Consumido",v:`${sym}${fmt(v.consumido||0)}`,c:C.danger},
                            {l:"Por Pagar",v:`${sym}${fmt(v.porPagar||0)}`,c:"#E65100"},
                            {l:"Disponible",v:`${sym}${fmt(v.disponible)}`,c:C.teal},
                            {l:"Disponible Neto",v:`${sym}${fmt(v.disponibleNeto)}`,c:v.disponibleNeto>=0?C.green:C.danger},
                          ].map(k=>(
                            <div key={k.l} style={{textAlign:"right",padding:"0 8px"}}>
                              <div style={{fontSize:9,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:.3,whiteSpace:"nowrap"}}>{k.l}</div>
                              <div style={{fontSize:14,fontWeight:800,color:k.c,marginTop:1,whiteSpace:"nowrap"}}>{k.v}</div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Ingresos expandidos */}
                {expanded && (
                  <div style={{borderTop:`1px solid ${C.border}`,overflowX:"auto"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:1200}}>
                      <thead>
                        <tr style={{background:"#EEF2FF"}}>
                          <th style={{padding:"8px 6px",width:36,textAlign:"center"}}>
                            <input type="checkbox" style={{cursor:"pointer",accentColor:C.blue}}
                              checked={ings.every(i=>selectedIngresos.has(i.id))}
                              onChange={()=>{
                                const allSelected = ings.every(i=>selectedIngresos.has(i.id));
                                setSelectedIngresos(prev=>{
                                  const n=new Set(prev);
                                  if(allSelected) ings.forEach(i=>n.delete(i.id));
                                  else ings.forEach(i=>n.add(i.id));
                                  return n;
                                });
                              }}/>
                          </th>
                          {["Segmento","Folio Factura","Concepto","Fecha Contable","Fecha Factura","Vencimiento","Días Vencidos","Por Vencer","Fecha Ficticia","Monto","Cobrado","Por Cobrar",...(empresaId!=="empresa_2"?["Consumido","Por Pagar","Disponible","D. Neto"]:[]),"Acciones"].map(h=>(
                            <th key={h} style={{padding:"10px 10px",textAlign:["Monto","Cobrado","Por Cobrar","Consumido","Por Pagar","Disponible","D. Neto"].includes(h)?"right":["Días Vencidos","Por Vencer"].includes(h)?"center":"left",color:C.blue,fontWeight:700,fontSize:12,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ings.map((ing,idx) => {
                          const m = metrics[ing.id]||{};
                          const sym = monedaSym(ing.moneda);
                          const disponColor = (m.disponible||0)>0?C.teal:(m.disponible||0)===0?C.muted:C.danger;
                          const isSelected = selectedIngresos.has(ing.id);
                          const hoy = today();
                          const venceProx = ing.fechaVencimiento && ing.fechaVencimiento < hoy;
                          return (
                            <tr key={ing.id}
                              style={{borderTop:`1px solid ${C.border}`,background:isSelected?"#E8F0FE":ing.oculta?"#FFF8E1":idx%2===0?"#FAFBFF":"#fff",cursor:"pointer",opacity:ing.oculta?0.6:1}}
                              onClick={()=>setDetailIngreso(ing.id)}
                              onMouseEnter={e=>{if(!isSelected)e.currentTarget.style.background="#E8F0FE";}}
                              onMouseLeave={e=>{if(!isSelected)e.currentTarget.style.background=idx%2===0?"#FAFBFF":"#fff";}}>
                              <td style={{padding:"8px 6px",textAlign:"center"}} onClick={e=>e.stopPropagation()}>
                                <input type="checkbox" checked={isSelected} onChange={()=>{
                                  setSelectedIngresos(prev=>{const n=new Set(prev);if(n.has(ing.id))n.delete(ing.id);else n.add(ing.id);return n;});
                                }} style={{cursor:"pointer",accentColor:C.blue}}/>
                              </td>
                              {/* Segmento */}
                              <td style={{padding:"8px 6px"}} onClick={e=>e.stopPropagation()}>
                                {esConsulta
                                  ? <span style={{fontSize:11,padding:"2px 5px"}}>{ing.segmento||"—"}</span>
                                  : <input value={ing.segmento||""} onChange={e=>{const v=e.target.value;setIngresos(prev=>prev.map(i=>i.id===ing.id?{...i,segmento:v}:i));updateIngresoField(ing.id,{segmento:v});}} placeholder="—" style={{padding:"2px 5px",fontSize:10,border:`1px solid ${C.border}`,borderRadius:5,width:55,fontFamily:"inherit"}}/>
                                }
                              </td>
                              {/* Folio */}
                              <td style={{padding:"9px 8px",fontSize:11,color:C.blue,fontWeight:600,whiteSpace:"nowrap"}}>{ing.folio||"—"}</td>
                              {/* Concepto — inline editable */}
                              <td style={{padding:"9px 8px",minWidth:120}} onClick={e=>e.stopPropagation()}>
                                {esConsulta
                                  ? <span style={{fontSize:13,color:ing.concepto?C.text:C.muted}}>{ing.concepto||"—"}</span>
                                  : <input value={ing.concepto||""} onChange={e=>{const v=e.target.value;setIngresos(prev=>prev.map(i=>i.id===ing.id?{...i,concepto:v}:i));}} onBlur={e=>updateIngresoField(ing.id,{concepto:e.target.value})} onKeyDown={e=>{if(e.key==="Enter")e.target.blur();}} placeholder="Clic para editar…" style={{padding:"3px 6px",fontSize:13,border:`1px solid ${C.border}`,borderRadius:5,width:"100%",fontFamily:"inherit",background:"transparent",cursor:"text"}} onFocus={e=>e.target.style.border=`1px solid ${C.blue}`}/>
                                }
                              </td>
                              {/* Fecha Contable */}
                              <td style={{padding:"8px 6px"}} onClick={e=>e.stopPropagation()}>
                                {esConsulta
                                  ? <span style={{fontSize:13,color:ing.fechaContable?C.teal:C.muted}}>{ing.fechaContable||"—"}</span>
                                  : <input type="date" value={ing.fechaContable||""} onChange={e=>{const v=e.target.value;setIngresos(prev=>prev.map(i=>i.id===ing.id?{...i,fechaContable:v}:i));updateIngresoField(ing.id,{fechaContable:v});}} style={{padding:"2px 5px",fontSize:13,border:`1px solid ${ing.fechaContable?C.teal:C.border}`,borderRadius:5,color:ing.fechaContable?C.teal:C.text,width:112,fontFamily:"inherit"}}/>
                                }
                              </td>
                              <td style={{padding:"9px 8px",whiteSpace:"nowrap",fontSize:14,color:C.muted}}>{ing.fecha||"—"}</td>
                              <td style={{padding:"9px 8px",whiteSpace:"nowrap",fontSize:13,color:venceProx?C.danger:C.text,fontWeight:ing.fechaVencimiento?600:400}}>{ing.fechaVencimiento||"—"}</td>
                              {/* Días Vencidos */}
                              <td style={{padding:"9px 6px",textAlign:"center"}}>{(() => { const d=diasDiff(ing.fechaVencimiento); return d!==null&&d<0?<span style={{background:"#FFEBEE",color:C.danger,fontWeight:800,fontSize:11,padding:"2px 6px",borderRadius:20}}>{Math.abs(d)}d</span>:<span style={{color:C.muted,fontSize:11}}>—</span>; })()}</td>
                              {/* Por Vencer */}
                              <td style={{padding:"9px 6px",textAlign:"center"}}>{(() => { const d=diasDiff(ing.fechaVencimiento); return d!==null&&d>=0?<span style={{background:d<=7?"#FFF3E0":d<=30?"#FFFDE7":"#E8F5E9",color:d<=7?C.danger:d<=30?C.warn:C.ok,fontWeight:800,fontSize:11,padding:"2px 6px",borderRadius:20}}>{d}d</span>:<span style={{color:C.muted,fontSize:11}}>—</span>; })()}</td>
                              {/* Fecha Ficticia */}
                              <td style={{padding:"8px 6px"}} onClick={e=>e.stopPropagation()}>
                                {esConsulta
                                  ? <span style={{fontSize:13,color:ing.fechaFicticia?"#7B1FA2":C.muted}}>{ing.fechaFicticia||"—"}</span>
                                  : <input type="date" value={ing.fechaFicticia||""} onChange={e=>{const v=e.target.value;setIngresos(prev=>prev.map(i=>i.id===ing.id?{...i,fechaFicticia:v}:i));updateIngresoField(ing.id,{fechaFicticia:v});}} style={{padding:"2px 5px",fontSize:13,border:`1px solid ${ing.fechaFicticia?"#7B1FA2":C.border}`,borderRadius:5,color:ing.fechaFicticia?"#7B1FA2":C.text,width:112,fontFamily:"inherit"}}/>
                                }
                              </td>
                              <td style={{padding:"9px 10px",fontWeight:700,textAlign:"right",fontSize:13}}>{sym}{fmt(ing.monto)}</td>
                              <td style={{padding:"9px 10px",color:C.ok,textAlign:"right",fontSize:13}}>{sym}{fmt(m.totalCobrado||0)}</td>
                              <td style={{padding:"9px 10px",color:(m.porCobrar||0)>0?C.warn:C.ok,textAlign:"right",fontWeight:600,fontSize:13}}>{sym}{fmt(m.porCobrar||0)}</td>
                              {empresaId!=="empresa_2" && <>
                              <td style={{padding:"9px 10px",color:C.danger,textAlign:"right",fontSize:13}}>{sym}{fmt(m.consumido||0)}</td>
                              <td style={{padding:"9px 10px",textAlign:"right",fontSize:13}}>
                                <span style={{color:"#E65100",background:(m.porPagar||0)>0?"#FFF3E0":"transparent",padding:(m.porPagar||0)>0?"1px 5px":"0",borderRadius:5,fontWeight:700}}>{sym}{fmt(m.porPagar||0)}</span>
                              </td>
                              <td style={{padding:"9px 10px",textAlign:"right",fontSize:13}}><span style={{fontWeight:800,color:disponColor}}>{sym}{fmt(m.disponible||0)}</span></td>
                              <td style={{padding:"9px 10px",textAlign:"right",fontSize:13}}>
                                <span style={{fontWeight:800,color:(m.disponibleNeto||0)>=0?C.green:C.danger,background:(m.disponibleNeto||0)>=0?"#E8F5E9":"#FFEBEE",padding:"2px 6px",borderRadius:5}}>{sym}{fmt(m.disponibleNeto||0)}</span>
                              </td>
                              </>}
                              <td style={{padding:"9px 8px",whiteSpace:"nowrap"}} onClick={e=>e.stopPropagation()}>
                                <button onClick={()=>setDetailIngreso(ing.id)} style={{...iconBtn,color:C.sky,fontSize:14}} title="Detalle">🔍</button>
                                {!esConsulta && <button onClick={()=>setModalIngreso({...ing})} style={{...iconBtn,color:C.blue,fontSize:14}} title="Editar">✏️</button>}
                                {!esConsulta && <button onClick={async()=>{const v=!ing.oculta;setIngresos(prev=>prev.map(i=>i.id===ing.id?{...i,oculta:v}:i));await updateIngresoField(ing.id,{oculta:v});}} style={{...iconBtn,color:ing.oculta?"#E65100":C.muted,fontSize:14}} title={ing.oculta?"Mostrar":"Ocultar"}>{ing.oculta?"🙈":"👁️"}</button>}
                                {!esConsulta && <button onClick={()=>setDeleteConfirm({id:ing.id,label:`${ing.cliente} — ${ing.concepto||ing.categoria}`})} style={{...iconBtn,color:C.danger,fontSize:14}} title="Eliminar">🗑️</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      ) : (

        /* ── VISTA PLANA POR INGRESO (original) ── */
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:1100}}>
              <thead>
                <tr style={{background:C.navy}}>
                  <th style={{padding:"10px 6px",textAlign:"center",width:36}}>
                    <input type="checkbox" style={{cursor:"pointer",accentColor:"#fff"}}
                      checked={selectedIngresos.size===filtered.length && filtered.length>0}
                      onChange={()=>{
                        if(selectedIngresos.size===filtered.length) setSelectedIngresos(new Set());
                        else setSelectedIngresos(new Set(filtered.map(i=>i.id)));
                      }}/>
                  </th>
                  {[
                    {label:"Segmento",       col:"segmento"},
                    {label:"Cliente",         col:"cliente"},
                    {label:"Folio Factura",   col:"folio"},
                    {label:"Concepto",        col:"concepto"},
                    {label:"Moneda",          col:"moneda"},
                    {label:"Fecha Contable",  col:"fechaContable"},
                    {label:"Fecha Factura",   col:"fecha"},
                    {label:"Vencimiento",     col:"fechaVencimiento"},
                    {label:"Días Vencidos",   col:"diasVencidos"},
                    {label:"Por Vencer",      col:null},
                    {label:"Fecha Ficticia",  col:"fechaFicticia"},
                    {label:"Monto",           col:"monto",       right:true},
                    {label:"Cobrado",         col:"cobrado",     right:true},
                    {label:"Por Cobrar",      col:"porCobrar",   right:true},
                    {label:"Consumido",       col:"consumido",   right:true},
                    {label:"Por Pagar",       col:"porPagar",    right:true},
                    {label:"Disponible",      col:"disponible",  right:true},
                    {label:"Disp. Neto",      col:"disponibleNeto", right:true},
                    {label:"Acciones",        col:null},
                  ].map(h=>(
                    <th key={h.label}
                      onClick={h.col ? ()=>handleSort(h.col) : undefined}
                      style={{padding:"10px 8px",textAlign:h.right?"right":"left",color:"#fff",fontWeight:600,fontSize:10,textTransform:"uppercase",whiteSpace:"nowrap",cursor:h.col?"pointer":"default",userSelect:"none"}}
                    >{h.label}{h.col ? sortIcon(h.col) : ""}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedFiltered.map((ing,idx)=><IngresoRow key={ing.id} ing={ing} idx={idx}/>)}
              </tbody>
              {Object.keys(filteredTotals).map(mon => {
                const v = filteredTotals[mon];
                const sym = monedaSym(mon);
                return (
                  <tfoot key={mon}>
                    <tr style={{borderTop:`2px solid ${C.navy}`,background:"#EEF2FF"}}>
                      <td colSpan={4} style={{padding:"8px 10px",fontWeight:800,color:C.navy,fontSize:12}}>
                        TOTAL {mon} ({filtered.filter(i=>i.moneda===mon).length} registros)
                      </td>
                      <td colSpan={7}/>
                      <td style={{padding:"8px 10px",fontWeight:800,textAlign:"right",color:C.navy,whiteSpace:"nowrap"}}>{sym}{fmt(v.monto)}</td>
                      <td style={{padding:"8px 10px",fontWeight:800,textAlign:"right",color:C.ok,whiteSpace:"nowrap"}}>{sym}{fmt(v.cobrado)}</td>
                      <td style={{padding:"8px 10px",fontWeight:800,textAlign:"right",color:C.warn,whiteSpace:"nowrap"}}>{sym}{fmt(v.porCobrar)}</td>
                      <td style={{padding:"8px 10px",fontWeight:800,textAlign:"right",color:C.danger,whiteSpace:"nowrap"}}>{sym}{fmt(v.consumido)}</td>
                      <td style={{padding:"8px 10px",fontWeight:800,textAlign:"right",color:"#E65100",whiteSpace:"nowrap"}}>{sym}{fmt(v.porPagar)}</td>
                      <td style={{padding:"8px 10px",fontWeight:800,textAlign:"right",color:C.teal,whiteSpace:"nowrap"}}>{sym}{fmt(v.disponible)}</td>
                      <td style={{padding:"8px 10px",fontWeight:800,textAlign:"right",color:v.disponibleNeto>=0?C.green:C.danger,whiteSpace:"nowrap"}}>{sym}{fmt(v.disponibleNeto)}</td>
                      <td/>
                    </tr>
                  </tfoot>
                );
              })}
            </table>
          </div>
        </div>
      )}

      {/* ── Nota de multimoneda */}
      <div style={{marginTop:12,padding:"10px 14px",background:"#FFFDE7",border:"1px solid #FFE082",borderRadius:8,fontSize:11,color:"#856404",lineHeight:1.6}}>
        💡 <b>Consumido</b> = facturas pagadas vinculadas · <b>Por Pagar</b> = facturas pendientes/parciales vinculadas (no afecta Disponible) ·
        <b> Disponible</b> = Cobrado − Consumido · <b>Disp. Neto</b> = Disponible − Por Pagar (lo que queda tras cubrir todo lo comprometido).
        Los totales no se suman entre monedas distintas.
      </div>
      </>)}

      {/* ── Modals ── */}
      {modalIngreso && <IngresoModal/>}
      {detailIngreso && <DetailModal/>}

      {/* Delete confirm */}
      {deleteConfirm && (
        <ModalShell title="Confirmar Eliminación" onClose={()=>setDeleteConfirm(null)}>
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:48,marginBottom:16}}>🗑️</div>
            <p style={{fontSize:15,color:C.text,marginBottom:8}}>¿Eliminar este ingreso?</p>
            <p style={{fontSize:14,fontWeight:700,color:C.navy,marginBottom:8}}>{deleteConfirm.label}</p>
            <p style={{fontSize:12,color:C.danger,marginBottom:24}}>Se eliminan también sus cobros y vinculaciones con facturas.</p>
            <div style={{display:"flex",gap:12,justifyContent:"center"}}>
              <button onClick={()=>setDeleteConfirm(null)} style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"10px 28px"}}>Cancelar</button>
              <button onClick={handleDeleteIngreso} style={{...btnStyle,background:C.danger,padding:"10px 28px"}}>Sí, Eliminar</button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Config categorías */}
      {configCats && (
        <ModalShell title="⚙️ Categorías de Ingreso" onClose={()=>setConfigCats(false)}>
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
              {catList.map(c=>{
                const cs = getCatStyle(c);
                return (
                  <div key={c} style={{display:"flex",alignItems:"center",gap:4,background:cs.bg,border:`1px solid ${cs.border}`,borderRadius:20,padding:"4px 12px"}}>
                    <span style={{fontSize:13,color:cs.text,fontWeight:600}}>{c}</span>
                    {catList.length > 1 && (
                      <button onClick={()=>removeCategoria(c)} style={{background:"none",border:"none",cursor:"pointer",color:C.danger,fontSize:14,padding:0}}>×</button>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:8}}>
              <input placeholder="Nueva categoría…" value={newCatInput} onChange={e=>setNewCatInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter") addCategoria();}}
                style={{...inputStyle,flex:1}}/>
              <button onClick={addCategoria} style={btnStyle}>Agregar</button>
            </div>
          </div>
          <div style={{background:"#EEF2FF",borderRadius:8,padding:"10px 14px",fontSize:12,color:C.muted}}>
            💡 Las categorías predeterminadas son: {DEFAULT_CATS.join(", ")}.
          </div>
        </ModalShell>
      )}

      {/* Import Modal */}
      {importModal && (
        <ModalShell title="📥 Importar Ingresos desde Excel" onClose={()=>{setImportModal(false);setImportPreview(null);}} wide>
          {!importPreview ? (
            <div>
              {/* Upload zone */}
              <div onClick={()=>importRef.current?.click()}
                style={{border:`2px dashed ${C.border}`,borderRadius:14,padding:40,textAlign:"center",cursor:"pointer",background:"#FAFBFC",marginBottom:20,transition:"border-color .2s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=C.blue;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;}}>
                <div style={{fontSize:44,marginBottom:10}}>📂</div>
                <div style={{fontSize:16,fontWeight:700,color:C.navy,marginBottom:4}}>Selecciona tu archivo Excel</div>
                <div style={{fontSize:13,color:C.muted,marginBottom:16}}>Formatos: .xlsx · .xls</div>
                <button style={btnStyle} onClick={e=>{e.stopPropagation();importRef.current?.click();}}>Seleccionar archivo</button>
              </div>
              {/* Expected format */}
              <div style={{background:"#EEF2FF",border:"1px solid #C7D7FD",borderRadius:12,padding:16}}>
                <div style={{fontWeight:700,color:C.navy,marginBottom:10,fontSize:13}}>📋 Columnas esperadas</div>
                <div style={{overflowX:"auto"}}>
                  <table style={{borderCollapse:"collapse",fontSize:12,minWidth:500}}>
                    <thead><tr style={{background:C.navy}}>
                      {["Tipo","Fecha Emision","Serie","Folio","UUID","Nombre Receptor","SubTotal","IVA 16%","Total","Moneda"].map(h=>(
                        <th key={h} style={{padding:"6px 10px",color:"#fff",fontWeight:600,fontSize:10,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody><tr style={{background:"#fff"}}>
                      {["Factura","10/03/2026","A","11439","fcd49e…","TRANSPORTES BROMELIA","6,882.33","1,101.17","7,983.50","MXN"].map((v,i)=>(
                        <td key={i} style={{padding:"6px 10px",borderBottom:`1px solid ${C.border}`,textAlign:"center",fontSize:11}}>{v}</td>
                      ))}
                    </tr></tbody>
                  </table>
                </div>
                <div style={{fontSize:11,color:C.muted,marginTop:10}}>
                  💡 <b>Concepto</b> y <b>Categoría</b> se asignan después en la app. El sistema detecta duplicados automáticamente.
                </div>
              </div>
            </div>
          ) : (
            <div>
              {/* Preview results */}
              <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
                <div style={{background:"#E8F5E9",border:"1px solid #A5D6A7",borderRadius:10,padding:"10px 18px"}}>
                  <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase"}}>Nuevos</div>
                  <div style={{fontSize:24,fontWeight:900,color:C.ok}}>{importPreview.rows.length}</div>
                </div>
                <div style={{background:"#FFF3E0",border:"1px solid #FFCC80",borderRadius:10,padding:"10px 18px"}}>
                  <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase"}}>Duplicados (omitidos)</div>
                  <div style={{fontSize:24,fontWeight:900,color:C.warn}}>{importPreview.dupes.length}</div>
                </div>
              </div>

              {/* Categoría default */}
              <div style={{background:"#F8FAFC",border:`1px solid ${C.border}`,borderRadius:10,padding:14,marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:700,color:C.navy,marginBottom:8}}>Asignar categoría a todos los ingresos importados:</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {catList.map(cat => {
                    const cs = getCatStyle(cat);
                    return (
                      <button key={cat} onClick={()=>setImportCatDefault(cat)}
                        style={{padding:"5px 14px",borderRadius:20,border:`2px solid ${importCatDefault===cat?cs.text:C.border}`,background:importCatDefault===cat?cs.bg:"#fff",color:importCatDefault===cat?cs.text:C.text,cursor:"pointer",fontWeight:importCatDefault===cat?700:500,fontSize:12,fontFamily:"inherit",transition:"all .15s"}}>
                        {cat}
                      </button>
                    );
                  })}
                </div>
                <div style={{fontSize:11,color:C.muted,marginTop:8}}>Podrás cambiar la categoría individualmente desde la app después de importar.</div>
              </div>

              {/* Preview table */}
              {importPreview.rows.length > 0 && (
                <div style={{maxHeight:280,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:10,marginBottom:16}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead style={{position:"sticky",top:0}}>
                      <tr style={{background:C.navy}}>
                        {["Cliente","Concepto","Fecha","Monto","Moneda"].map(h=>(
                          <th key={h} style={{padding:"8px 10px",color:"#fff",fontWeight:600,fontSize:10,textTransform:"uppercase",textAlign:h==="Monto"?"right":"left"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.map((r,i)=>(
                        <tr key={i} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?"#fff":"#FAFBFC"}}>
                          <td style={{padding:"7px 10px",fontWeight:600,color:C.navy}}>{r.cliente}</td>
                          <td style={{padding:"7px 10px",color:C.muted,fontStyle:"italic"}}>{r.concepto||"—"}</td>
                          <td style={{padding:"7px 10px",color:C.muted,fontSize:11}}>{r.fecha||"—"}</td>
                          <td style={{padding:"7px 10px",fontWeight:700,textAlign:"right"}}>{r.moneda==="EUR"?"€":"$"}{fmt(r.monto)}</td>
                          <td style={{padding:"7px 10px"}}><span style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[r.moneda],color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[r.moneda],padding:"2px 7px",borderRadius:20,fontSize:10,fontWeight:700}}>{r.moneda}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {importPreview.rows.length === 0 && (
                <div style={{textAlign:"center",padding:24,color:C.muted,background:"#FFF3E0",borderRadius:10,marginBottom:16}}>
                  ⚠️ Todos los registros del archivo ya existen — no hay nada nuevo que importar.
                </div>
              )}

              <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                <button onClick={()=>setImportPreview(null)} style={{...btnStyle,background:"#F1F5F9",color:C.text}}>← Cambiar archivo</button>
                <button disabled={importPreview.rows.length===0||importando||!importCatDefault}
                  onClick={confirmarImport}
                  style={{...btnStyle,background:C.ok,opacity:(importPreview.rows.length===0||importando||!importCatDefault)?0.5:1}}>
                  {importando ? "Importando…" : `✅ Importar ${importPreview.rows.length} ingreso${importPreview.rows.length!==1?"s":""}`}
                </button>
              </div>
            </div>
          )}
        </ModalShell>
      )}
      {/* Bulk Fecha Ficticia Modal */}
      {bulkFechaModal && <BulkFechaModal
        selectedList={filtered.filter(i=>selectedIngresos.has(i.id))}
        onClose={()=>setBulkFechaModal(false)}
        onSave={async(fecha)=>{
          const list = filtered.filter(i=>selectedIngresos.has(i.id));
          for(const ing of list){
            await updateIngresoField(ing.id,{fechaFicticia:fecha});
            setIngresos(prev=>prev.map(i=>i.id===ing.id?{...i,fechaFicticia:fecha}:i));
          }
          setSelectedIngresos(new Set());
          setBulkFechaModal(false);
        }}
      />}

      {/* Limpiar Cartera TAS Modal */}
      {limpiarModal && <LimpiarTASModal
        empresaId={empresaId}
        totalIngresos={ingresos.length}
        conActividad={ingresos.filter(i=>cobros.some(c=>c.ingresoId===i.id)||i.fechaFicticia).length}
        sinActividad={ingresos.filter(i=>!cobros.some(c=>c.ingresoId===i.id)&&!i.fechaFicticia).length}
        onClose={()=>setLimpiarModal(false)}
        onLimpiadoSin={(ids)=>{
          setIngresos(prev=>prev.filter(i=>!ids.has(i.id)));
          setCobros(prev=>prev.filter(c=>!ids.has(c.ingresoId)));
          setLimpiarModal(false);
        }}
        onLimpiadoTodo={()=>{
          setIngresos([]);
          setCobros([]);
          setInvoiceIngresos([]);
          setLimpiarModal(false);
        }}
        C={C}
        btnStyle={btnStyle}
        inputStyle={inputStyle}
      />}

      {/* Ocultas Modal */}
      {ocultasModal && (
        <OcultasModal
          ingresos={ingresos.filter(i=>i.oculta)}
          metrics={metrics}
          onRestore={async(id)=>{
            setIngresos(prev=>prev.map(i=>i.id===id?{...i,oculta:false}:i));
            await updateIngresoField(id,{oculta:false});
          }}
          onRestoreAll={async()=>{
            const ids=ingresos.filter(i=>i.oculta).map(i=>i.id);
            setIngresos(prev=>prev.map(i=>ids.includes(i.id)?{...i,oculta:false}:i));
            await Promise.all(ids.map(id=>updateIngresoField(id,{oculta:false})));
          }}
          onClose={()=>setOcultasModal(false)}
          fmt={fmt}
          monedaSym={monedaSym}
          C={C}
          btnStyle={btnStyle}
          diasDiff={diasDiff}
        />
      )}

      {/* Por Facturar Modal */}
      {porFacturarModal && (
        <PorFacturarModal
          empresaId={empresaId}
          porFacturar={porFacturar}
          setPorFacturar={setPorFacturar}
          ingresos={ingresos}
          insertPorFacturar={insertPorFacturar}
          updatePorFacturar={updatePorFacturar}
          deletePorFacturar={deletePorFacturar}
          bulkInsertPorFacturar={bulkInsertPorFacturar}
          onClose={()=>setPorFacturarModal(false)}
          esConsulta={esConsulta}
          fmt={fmt}
          C={C}
          btnStyle={btnStyle}
          inputStyle={inputStyle}
          XLSX={XLSX}
          porFacturarRef={porFacturarRef}
        />
      )}
      <input ref={porFacturarRef} type="file" accept=".xlsx,.xls" style={{display:"none"}}
        onChange={async(e)=>{
          const file=e.target.files[0]; if(!file) return;
          // Read Excel and filter sin folio
          const reader=new FileReader();
          reader.onload=async(ev)=>{
            const data=new Uint8Array(ev.target.result);
            const wb=XLSX.read(data,{type:"array",cellDates:true});
            const ws=wb.Sheets[wb.SheetNames[0]];
            const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:null});
            // Find header row (row with SEGMENTO, OS, AEROLINEA)
            let headerIdx=-1;
            for(let i=0;i<rows.length;i++){
              const r=rows[i];
              if(r && r.some(c=>String(c||"").toUpperCase().includes("SEGMENTO")) &&
                 r.some(c=>String(c||"").toUpperCase().includes("AEROLINEA"))) {
                headerIdx=i; break;
              }
            }
            if(headerIdx===-1){ alert("No se encontró el encabezado esperado (SEGMENTO, OS, AEROLINEA)"); return; }
            const headers=rows[headerIdx].map(h=>String(h||"").toUpperCase().trim());
            const colIdx=(name)=>headers.findIndex(h=>h.includes(name));
            const iSeg=colIdx("SEGMENTO"), iOs=colIdx("OS"), iAero=colIdx("AEROLINEA");
            const iDest=colIdx("DESTINO"), iFechaVenta=colIdx("FECHA VENTA");
            const iImporte=colIdx("IMPORTE"), iMes=colIdx("MES"), iFolio=colIdx("FOLIO");
            const AERO_MAP = {
              "AA": "AMERICAN AIRLINES INC",
              "DL": "DELTA AIR LINES INC",
              "SW": "SOUTHWEST AIRLINES CO.",
              "JB": "JETBLUE AIRWAYS CORPORATION",
              "UA": "UNITED AIRLINES, INC",
            };
            // Filter rows sin folio, con importe
            const sinFolio=[];
            for(let i=headerIdx+1;i<rows.length;i++){
              const r=rows[i];
              if(!r) continue;
              const folio=r[iFolio];
              const importe=r[iImporte];
              const aero=r[iAero];
              if(!aero||!importe||+importe<=0) continue;
              if(folio&&String(folio).trim()!=="") continue; // tiene folio, skip
              const fechaRaw=r[iFechaVenta];
              let fechaVenta="";
              if(fechaRaw instanceof Date) fechaVenta=fechaRaw.toISOString().slice(0,10);
              else if(typeof fechaRaw==="string"&&fechaRaw.trim()) fechaVenta=fechaRaw.trim().slice(0,10);
              const aeroRaw = String(aero).trim();
              const clienteNombre = AERO_MAP[aeroRaw.toUpperCase()] || aeroRaw;
              sinFolio.push({
                empresaId:empresaId,
                cliente:clienteNombre,
                concepto:String(r[iSeg]||"").trim(),
                importe:+importe,
                moneda:"MXN",
                notas:`Mes:${r[iMes]||""}`,
                numOs:String(r[iOs]||"").trim(),
                fechaVenta,
                destino: homologarDestino(String(r[iDest]||"").trim()),
              });
            }
            if(!sinFolio.length){ alert("No se encontraron registros sin folio en el archivo."); return; }
            // Show preview via window confirm
            const preview=sinFolio.slice(0,5).map(r=>`${r.cliente} OS:${r.numOs} $${r.importe.toLocaleString()}`).join("\n");
            if(!window.confirm(`Se encontraron ${sinFolio.length} registros sin folio:\n\n${preview}\n${sinFolio.length>5?"...y más":""}.\n\n¿Importar?`)) return;
            const result=await bulkInsertPorFacturar(sinFolio);
            // Reload
            const fresh=await (async()=>{
              const {data}=await import("./supabase.js").then(m=>m.supabase.from("por_facturar").select("*").eq("empresa_id",empresaId).order("created_at",{ascending:false}));
              return (data||[]).map(r=>({id:r.id,empresaId:r.empresa_id,cliente:r.cliente||"",concepto:r.concepto||"",importe:+r.importe||0,moneda:r.moneda||"MXN",notas:r.notas||"",numOs:r.num_os||"",fechaVenta:r.fecha_venta||"",destino:r.destino||"",createdAt:r.created_at||""}));
            })();
            setPorFacturar(fresh);
            alert(`✅ ${result.inserted} registros nuevos importados. ${sinFolio.length-result.inserted} ya existían.`);
            e.target.value="";
          };
          reader.readAsArrayBuffer(file);
        }}
      />

      {/* TAS Import Modal */}      {tasModal && (
        <ModalShell title="✈️ Importar Facturas TravelAirSolutions" onClose={()=>{setTasModal(false);setTasPreview(null);}} wide>
          {!tasPreview ? (
            <div>
              {/* Upload zone */}
              <div onClick={()=>tasImportRef.current?.click()}
                style={{border:`2px dashed ${C.border}`,borderRadius:14,padding:40,textAlign:"center",cursor:"pointer",background:"#FFF5F5",marginBottom:20,transition:"border-color .2s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="#C0392B";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;}}>
                <div style={{fontSize:44,marginBottom:10}}>✈️</div>
                <div style={{fontSize:16,fontWeight:700,color:C.navy,marginBottom:4}}>Selecciona el archivo Excel de TAS</div>
                <div style={{fontSize:13,color:C.muted,marginBottom:16}}>Formatos: .xlsx · .xls</div>
                <button style={{...btnStyle,background:"#C0392B"}} onClick={e=>{e.stopPropagation();tasImportRef.current?.click();}}>Seleccionar archivo</button>
              </div>
              {/* Expected format */}
              <div style={{background:"#FFF5F5",border:"1px solid #FFCDD2",borderRadius:12,padding:16}}>
                <div style={{fontWeight:700,color:"#C0392B",marginBottom:10,fontSize:13}}>📋 Columnas esperadas del Excel TAS</div>
                <div style={{overflowX:"auto"}}>
                  <table style={{borderCollapse:"collapse",fontSize:11,minWidth:700}}>
                    <thead><tr style={{background:"#C0392B"}}>
                      {["SEGMENTO","Empresa/Nombre","CFDI Folio","CFDI UUID","Fecha factura","Fecha vencimiento","Moneda","Importe adeudado","Asiento contable/Fecha"].map(h=>(
                        <th key={h} style={{padding:"6px 10px",color:"#fff",fontWeight:600,fontSize:10,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody><tr style={{background:"#fff"}}>
                      {["TRF","VIAJES LIBERO","AA/2026/0122","1b5f4cbe-e269…","10/03/2026","09/04/2026","MXN","23,103.60","27/02/2026"].map((v,i)=>(
                        <td key={i} style={{padding:"6px 10px",borderBottom:`1px solid ${C.border}`,fontSize:11,textAlign:"center"}}>{v}</td>
                      ))}
                    </tr></tbody>
                  </table>
                </div>
                <div style={{fontSize:11,color:C.muted,marginTop:10}}>
                  💡 Duplicados detectados por <b>CFDI UUID</b>. Si ya existe el UUID en la app, la factura se omite automáticamente.
                </div>
              </div>
            </div>
          ) : (
            <div>
              {/* Preview results */}
              <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
                <div style={{background:"#E8F5E9",border:"1px solid #A5D6A7",borderRadius:10,padding:"10px 18px"}}>
                  <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase"}}>Nuevos</div>
                  <div style={{fontSize:24,fontWeight:900,color:C.ok}}>{tasPreview.rows.length}</div>
                </div>
                <div style={{background:"#FFF3E0",border:"1px solid #FFCC80",borderRadius:10,padding:"10px 18px"}}>
                  <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase"}}>Duplicados (omitidos)</div>
                  <div style={{fontSize:24,fontWeight:900,color:C.warn}}>{tasPreview.dupes.length}</div>
                </div>
              </div>

              {/* Categoría default */}
              <div style={{background:"#F8FAFC",border:`1px solid ${C.border}`,borderRadius:10,padding:14,marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:700,color:C.navy,marginBottom:8}}>Asignar categoría a registros sin segmento:</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {catList.map(cat => {
                    const cs = getCatStyle(cat);
                    return (
                      <button key={cat} onClick={()=>setTasCatDefault(cat)}
                        style={{padding:"5px 14px",borderRadius:20,border:`2px solid ${tasCatDefault===cat?cs.text:C.border}`,background:tasCatDefault===cat?cs.bg:"#fff",color:tasCatDefault===cat?cs.text:C.text,cursor:"pointer",fontWeight:tasCatDefault===cat?700:500,fontSize:12,fontFamily:"inherit"}}>
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Preview table */}
              {tasPreview.rows.length > 0 && (
                <div style={{maxHeight:280,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:10,marginBottom:16}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead style={{position:"sticky",top:0}}>
                      <tr style={{background:"#C0392B"}}>
                        {["Cliente","Concepto","Segmento","Fecha","Vencimiento","F.Contable","Monto","Moneda"].map(h=>(
                          <th key={h} style={{padding:"8px 10px",color:"#fff",fontWeight:600,fontSize:10,textTransform:"uppercase",textAlign:h==="Monto"?"right":"left"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tasPreview.rows.map((r,i)=>(
                        <tr key={i} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?"#fff":"#FFF5F5"}}>
                          <td style={{padding:"7px 10px",fontWeight:600,color:C.navy}}>{r.cliente}</td>
                          <td style={{padding:"7px 10px",color:C.muted,fontSize:11}}>{r.concepto||"—"}</td>
                          <td style={{padding:"7px 10px"}}><span style={{background:"#FFEBEE",color:"#C0392B",padding:"1px 7px",borderRadius:20,fontSize:10,fontWeight:700}}>{r.segmento||"—"}</span></td>
                          <td style={{padding:"7px 10px",fontSize:11,color:C.muted}}>{r.fecha||"—"}</td>
                          <td style={{padding:"7px 10px",fontSize:11,color:C.muted}}>{r.fechaVencimiento||"—"}</td>
                          <td style={{padding:"7px 10px",fontSize:11,color:C.teal}}>{r.fechaContable||"—"}</td>
                          <td style={{padding:"7px 10px",fontWeight:700,textAlign:"right"}}>{r.moneda==="EUR"?"€":"$"}{fmt(r.monto)}</td>
                          <td style={{padding:"7px 10px"}}><span style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[r.moneda],color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[r.moneda],padding:"2px 7px",borderRadius:20,fontSize:10,fontWeight:700}}>{r.moneda}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tasPreview.rows.length === 0 && (
                <div style={{textAlign:"center",padding:24,color:C.muted,background:"#FFF3E0",borderRadius:10,marginBottom:16}}>
                  ⚠️ Todos los registros del archivo ya existen (UUID duplicado) — no hay nada nuevo que importar.
                </div>
              )}

              <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                <button onClick={()=>setTasPreview(null)} style={{...btnStyle,background:"#F1F5F9",color:C.text}}>← Cambiar archivo</button>
                <button disabled={tasPreview.rows.length===0||tasImportando}
                  onClick={confirmarTasImport}
                  style={{...btnStyle,background:"#C0392B",opacity:(tasPreview.rows.length===0||tasImportando)?0.5:1}}>
                  {tasImportando ? "Importando…" : `✅ Importar ${tasPreview.rows.length} factura${tasPreview.rows.length!==1?"s":""}`}
                </button>
              </div>
            </div>
          )}
        </ModalShell>
      )}

      {/* Cobro Masivo Modal */}
      {cobroMasivoModal && <CobroMasivoModal
        selectedList={filtered.filter(i=>selectedIngresos.has(i.id))}
        onClose={()=>setCobroMasivoModal(false)}
        onSave={async(fecha,notas,banco)=>{
          const list = filtered.filter(i=>selectedIngresos.has(i.id));
          for(const ing of list){
            const porCobrar = (metrics[ing.id]?.porCobrar)||0;
            if(porCobrar<=0) continue;
            const saved = await insertCobro({ingresoId:ing.id,monto:porCobrar,fechaCobro:fecha,notas,tipo:'realizado',banco:banco||''});
            setCobros(prev=>[saved,...prev]);
          }
          setSelectedIngresos(new Set());
          setCobroMasivoModal(false);
        }}
      />}
    </div>
  );
}

/* ── Bulk Fecha Ficticia Modal (extracted component) ─────────── */
function BulkFechaModal({selectedList, onClose, onSave}) {
  const [fecha, setFecha] = useState("");
  const [saving, setSaving] = useState(false);
  const handleSave = async() => { setSaving(true); await onSave(fecha); setSaving(false); };
  return (
    <ModalShell title="📅 Asignar Fecha Ficticia Masiva" onClose={onClose}>
      <div style={{background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:10,padding:14,marginBottom:16}}>
        <div style={{fontSize:13,color:"#64748B",marginBottom:4}}>Se asignará a <b style={{color:"#0F2D4A"}}>{selectedList.length} ingresos</b>:</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,maxHeight:120,overflowY:"auto"}}>
          {selectedList.map(i=>(
            <span key={i.id} style={{background:"#E8F0FE",color:"#1565C0",padding:"3px 10px",borderRadius:20,fontSize:12,fontWeight:600}}>{i.cliente} — {i.concepto||i.categoria}</span>
          ))}
        </div>
      </div>
      <div style={{marginBottom:20}}>
        <label style={{display:"block",fontSize:12,fontWeight:700,color:"#64748B",textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>Fecha Ficticia de Cobro</label>
        <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} style={{padding:"10px 14px",borderRadius:10,border:"2px solid #E2E8F0",fontSize:15,width:"100%",boxSizing:"border-box",fontFamily:"inherit"}}/>
        <div style={{fontSize:11,color:"#64748B",marginTop:6}}>Si dejas vacío, se limpiará la fecha ficticia y se usará el vencimiento.</div>
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <button onClick={onClose} style={{padding:"10px 20px",borderRadius:10,border:"none",background:"#F1F5F9",color:"#1A2332",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Cancelar</button>
        <button onClick={handleSave} disabled={saving} style={{padding:"10px 20px",borderRadius:10,border:"none",background:"#7B1FA2",color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:saving?.6:1}}>
          {saving?"Guardando…":`✅ Aplicar a ${selectedList.length} ingresos`}
        </button>
      </div>
    </ModalShell>
  );
}

/* ── Cobro Masivo Modal ───────────────────────────────────────── */
function CobroMasivoModal({selectedList, onClose, onSave}) {
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [notas, setNotas] = useState("");
  const [banco, setBanco] = useState("Banamex");
  const [saving, setSaving] = useState(false);
  const handleSave = async() => { if(!fecha) return; setSaving(true); await onSave(fecha,notas,banco); setSaving(false); };
  return (
    <ModalShell title="💰 Cobro Masivo" onClose={onClose}>
      <div style={{background:"#E8F5E9",border:"1px solid #A5D6A7",borderRadius:10,padding:14,marginBottom:16}}>
        <div style={{fontSize:13,color:"#64748B",marginBottom:4}}>Se registrará cobro completo (Por Cobrar) de <b style={{color:"#0F2D4A"}}>{selectedList.length} ingresos</b></div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,maxHeight:120,overflowY:"auto",marginTop:8}}>
          {selectedList.map(i=>(
            <span key={i.id} style={{background:"#fff",color:"#1B5E20",padding:"3px 10px",borderRadius:20,fontSize:12,fontWeight:600,border:"1px solid #A5D6A7"}}>{i.cliente} — {i.concepto||i.categoria}</span>
          ))}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16,marginBottom:16}}>
        <div>
          <label style={{display:"block",fontSize:12,fontWeight:700,color:"#64748B",textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>Fecha de Cobro *</label>
          <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} style={{padding:"10px 14px",borderRadius:10,border:"2px solid #E2E8F0",fontSize:14,width:"100%",boxSizing:"border-box",fontFamily:"inherit"}}/>
        </div>
        <div>
          <label style={{display:"block",fontSize:12,fontWeight:700,color:"#64748B",textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>Banco</label>
          <select value={banco} onChange={e=>setBanco(e.target.value)} style={{padding:"10px 14px",borderRadius:10,border:"2px solid #E2E8F0",fontSize:14,width:"100%",boxSizing:"border-box",fontFamily:"inherit",background:"#fff"}}>
            <option>Banamex</option>
            <option>Banorte</option>
          </select>
        </div>
        <div>
          <label style={{display:"block",fontSize:12,fontWeight:700,color:"#64748B",textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>Notas</label>
          <input value={notas} onChange={e=>setNotas(e.target.value)} placeholder="Ej. Transferencia bancaria..." style={{padding:"10px 14px",borderRadius:10,border:"2px solid #E2E8F0",fontSize:14,width:"100%",boxSizing:"border-box",fontFamily:"inherit"}}/>
        </div>
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <button onClick={onClose} style={{padding:"10px 20px",borderRadius:10,border:"none",background:"#F1F5F9",color:"#1A2332",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Cancelar</button>
        <button onClick={handleSave} disabled={saving||!fecha} style={{padding:"10px 20px",borderRadius:10,border:"none",background:"#43A047",color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:(saving||!fecha)?.6:1}}>
          {saving?"Registrando…":`✅ Registrar cobro de ${selectedList.length} ingresos`}
        </button>
      </div>
    </ModalShell>
  );
}

/* ── LimpiarTASModal ─────────────────────────────────────────────────── */
function LimpiarTASModal({ empresaId, totalIngresos, conActividad, sinActividad, onClose, onLimpiadoSin, onLimpiadoTodo, C, btnStyle, inputStyle }) {
  const [clave, setClave] = useState("");
  const [claveError, setClaveError] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [paso, setPaso] = useState(null); // null | "sin" | "todo"
  const CLAVE = "Solecito";

  const handleLimpiarSin = async () => {
    setProcesando(true);
    const result = await deleteTASsinActividad(empresaId);
    // Build set of deleted ids — we don't have them back, so reload via parent
    // Pass empty Set — parent will just reload
    onLimpiadoSin(new Set());
    setProcesando(false);
  };

  const handleLimpiarTodo = async () => {
    if(clave !== CLAVE) { setClaveError(true); return; }
    setClaveError(false);
    setProcesando(true);
    await deleteTASTodo(empresaId);
    onLimpiadoTodo();
    setProcesando(false);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:10}}
      onClick={onClose}>
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:520,boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}
        onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{padding:"18px 24px",background:"#7F0000",borderRadius:"16px 16px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontWeight:800,color:"#fff",fontSize:16}}>🗑️ Limpiar Cartera TravelAirSolutions</div>
            <div style={{fontSize:12,color:"#FFCDD2",marginTop:3}}>Solo afecta CxC de TAS — no toca CxP ni Viajes Libero</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,color:"#fff",width:32,height:32,cursor:"pointer",fontSize:18}}>×</button>
        </div>

        <div style={{padding:"20px 24px"}}>
          {/* Stats */}
          <div style={{display:"flex",gap:10,marginBottom:20}}>
            <div style={{flex:1,background:"#F8FAFC",borderRadius:10,padding:"12px 16px",textAlign:"center"}}>
              <div style={{fontSize:11,color:"#64748B",fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Total Ingresos</div>
              <div style={{fontSize:22,fontWeight:900,color:"#0F2D4A"}}>{totalIngresos}</div>
            </div>
            <div style={{flex:1,background:"#FFF3E0",borderRadius:10,padding:"12px 16px",textAlign:"center"}}>
              <div style={{fontSize:11,color:"#64748B",fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Con actividad</div>
              <div style={{fontSize:22,fontWeight:900,color:"#E65100"}}>{conActividad}</div>
              <div style={{fontSize:10,color:"#94A3B8"}}>cobros o fecha ficticia</div>
            </div>
            <div style={{flex:1,background:"#E8F5E9",borderRadius:10,padding:"12px 16px",textAlign:"center"}}>
              <div style={{fontSize:11,color:"#64748B",fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Sin actividad</div>
              <div style={{fontSize:22,fontWeight:900,color:"#2E7D32"}}>{sinActividad}</div>
              <div style={{fontSize:10,color:"#94A3B8"}}>se pueden eliminar</div>
            </div>
          </div>

          {/* Opción 1 */}
          <div style={{background:"#F0FFF4",border:"1px solid #A5D6A7",borderRadius:12,padding:"16px",marginBottom:12}}>
            <div style={{fontWeight:700,color:"#2E7D32",fontSize:14,marginBottom:4}}>Opción 1 — Limpiar sin actividad</div>
            <div style={{fontSize:12,color:"#64748B",marginBottom:12}}>
              Elimina <b>{sinActividad} ingresos</b> sin cobros ni fechas ficticias. Conserva los {conActividad} que ya tienen trabajo registrado.
            </div>
            {paso === "sin" ? (
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:13,color:"#C62828"}}>¿Confirmas eliminar {sinActividad} ingresos sin actividad?</span>
                <button onClick={handleLimpiarSin} disabled={procesando}
                  style={{...btnStyle,background:"#2E7D32",padding:"6px 16px",fontSize:13,opacity:procesando?0.6:1}}>
                  {procesando?"Eliminando…":"Sí, eliminar"}
                </button>
                <button onClick={()=>setPaso(null)} style={{...btnStyle,background:"#F1F5F9",color:"#1A2332",padding:"6px 12px",fontSize:13}}>Cancelar</button>
              </div>
            ) : (
              <button onClick={()=>setPaso("sin")} disabled={sinActividad===0}
                style={{...btnStyle,background:"#2E7D32",padding:"7px 18px",fontSize:13,opacity:sinActividad===0?0.4:1}}>
                🗑️ Limpiar sin actividad ({sinActividad})
              </button>
            )}
          </div>

          {/* Opción 2 */}
          <div style={{background:"#FFF5F5",border:"1px solid #FFCDD2",borderRadius:12,padding:"16px"}}>
            <div style={{fontWeight:700,color:"#C62828",fontSize:14,marginBottom:4}}>Opción 2 — Eliminar todo</div>
            <div style={{fontSize:12,color:"#64748B",marginBottom:12}}>
              Elimina <b>todos los {totalIngresos} ingresos</b>, incluyendo cobros registrados y vinculaciones. Esta acción no se puede deshacer.
            </div>
            {paso === "todo" ? (
              <div>
                <div style={{fontSize:12,color:"#C62828",marginBottom:8,fontWeight:600}}>Escribe la contraseña para confirmar:</div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <input type="password" value={clave} onChange={e=>{setClave(e.target.value);setClaveError(false);}}
                    placeholder="Contraseña…" autoFocus
                    style={{...inputStyle,borderColor:claveError?"#E53935":"#E2E8F0",flex:1}}
                    onKeyDown={e=>e.key==="Enter"&&handleLimpiarTodo()}/>
                  <button onClick={handleLimpiarTodo} disabled={procesando}
                    style={{...btnStyle,background:"#C62828",padding:"6px 16px",fontSize:13,opacity:procesando?0.6:1}}>
                    {procesando?"Eliminando…":"Eliminar todo"}
                  </button>
                  <button onClick={()=>{setPaso(null);setClave("");setClaveError(false);}}
                    style={{...btnStyle,background:"#F1F5F9",color:"#1A2332",padding:"6px 12px",fontSize:13}}>Cancelar</button>
                </div>
                {claveError && <div style={{fontSize:12,color:"#E53935",marginTop:6}}>⚠️ Contraseña incorrecta</div>}
              </div>
            ) : (
              <button onClick={()=>setPaso("todo")}
                style={{...btnStyle,background:"#C62828",padding:"7px 18px",fontSize:13}}>
                ⚠️ Eliminar todo ({totalIngresos})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── ResumenCxC ──────────────────────────────────────────────────────── */
function ResumenCxC({ ingresos, cobros, metrics, empresaId, fmt, C, XLSX }) {
  const hoy = new Date().toISOString().slice(0,10);
  const [detailModal, setDetailModal] = React.useState(null);
  const [vistaResumen, setVistaResumen] = React.useState("cliente");
  const [searchCliente, setSearchCliente] = React.useState("");
  const [filtroMonedaResumen, setFiltroMonedaResumen] = React.useState("");
  const [filtroDestinoResumen, setFiltroDestinoResumen] = React.useState("");

  const DESTINOS_R = ["Cancún","Tulum","Los Cabos","Cozumel","Mérida","Huatulco","Puerto Vallarta","Mazatlán"];
  const [expandedClientes, setExpandedClientes] = React.useState(new Set());
  const toggleCliente = (key) => setExpandedClientes(prev => { const n=new Set(prev); n.has(key)?n.delete(key):n.add(key); return n; });

  const monedaSym = m => m==="EUR"?"€":"$";
  const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  const calcDias = venc => venc ? Math.ceil((new Date(venc)-new Date(hoy))/864e5) : null;

  const agingBuckets = (saldo, vencimiento) => {
    if(saldo<=0||!vencimiento) return {corriente:saldo>0?saldo:0,v7:0,v30:0,v45:0,v60:0,vmas:0};
    const d2=calcDias(vencimiento);
    if(d2===null||d2>=0) return {corriente:saldo,v7:0,v30:0,v45:0,v60:0,vmas:0};
    const d=Math.abs(d2);
    if(d<=7)  return {corriente:0,v7:saldo,v30:0,v45:0,v60:0,vmas:0};
    if(d<=30) return {corriente:0,v7:0,v30:saldo,v45:0,v60:0,vmas:0};
    if(d<=45) return {corriente:0,v7:0,v30:0,v45:saldo,v60:0,vmas:0};
    if(d<=60) return {corriente:0,v7:0,v30:0,v45:0,v60:saldo,vmas:0};
    return {corriente:0,v7:0,v30:0,v45:0,v60:0,vmas:saldo};
  };
  const addA=(acc,a)=>{acc.corriente+=a.corriente;acc.v7+=a.v7;acc.v30+=a.v30;acc.v45+=a.v45;acc.v60+=a.v60;acc.vmas+=a.vmas;};
  const zeroA=()=>({corriente:0,v7:0,v30:0,v45:0,v60:0,vmas:0});

  const currencies = ["MXN","USD","EUR"];

  // Build por-cliente data — excluye ocultas
  const byClienteData = React.useMemo(()=>{
    const result={};
    currencies.forEach(mon=>{
      const invs=ingresos.filter(i=>(i.moneda||"MXN")===mon && !i.oculta && (!filtroDestinoResumen || detectarDestino(i.concepto)===filtroDestinoResumen));
      if(!invs.length){result[mon]=null;return;}
      const map={};
      invs.forEach(ing=>{
        const cli=ing.cliente||"—";
        if(searchCliente && !cli.toLowerCase().includes(searchCliente.toLowerCase())) return;
        if(!map[cli]) map[cli]={nombre:cli,total:0,cobrado:0,porCobrar:0,count:0,ingresos:[],...zeroA()};
        const m=metrics[ing.id]||{};
        const pc=m.porCobrar||0;
        map[cli].total+=ing.monto; map[cli].cobrado+=(m.totalCobrado||0);
        map[cli].porCobrar+=pc; map[cli].count+=1; map[cli].ingresos.push(ing);
        addA(map[cli], agingBuckets(pc, ing.fechaVencimiento));
      });
      const clientes=Object.values(map).sort((a,b)=>b.porCobrar-a.porCobrar);
      const grand=clientes.reduce((acc,c)=>{acc.total+=c.total;acc.cobrado+=c.cobrado;acc.porCobrar+=c.porCobrar;acc.count+=c.count;addA(acc,c);return acc;},{total:0,cobrado:0,porCobrar:0,count:0,...zeroA()});
      result[mon]={clientes,grand};
    });
    return result;
  },[ingresos,metrics,searchCliente]);

  // Build por-mes data — excluye ocultas
  const byMesData = React.useMemo(()=>{
    const result={};
    currencies.forEach(mon=>{
      const invs=ingresos.filter(i=>(i.moneda||"MXN")===mon && !i.oculta && (!filtroDestinoResumen || detectarDestino(i.concepto)===filtroDestinoResumen));
      if(!invs.length){result[mon]=null;return;}
      const map={};
      invs.forEach(ing=>{
        const mes=ing.fechaContable?ing.fechaContable.slice(0,7):"Sin fecha";
        if(!map[mes]) map[mes]={mes,total:0,cobrado:0,porCobrar:0,count:0,ingresos:[]};
        const m=metrics[ing.id]||{};
        map[mes].total+=ing.monto; map[mes].cobrado+=(m.totalCobrado||0);
        map[mes].porCobrar+=(m.porCobrar||0); map[mes].count+=1; map[mes].ingresos.push(ing);
      });
      const meses=Object.values(map).sort((a,b)=>b.mes.localeCompare(a.mes));
      result[mon]={meses};
    });
    return result;
  },[ingresos,metrics]);

  const openDetail=(title,invList,grouped=false)=>{if(!invList?.length) return; setDetailModal({title,invoices:invList,grouped});};

  const vCell=(v,sym,invList,label,color=C.danger)=>v>0?(
    <span onClick={()=>openDetail(label,invList)} style={{fontWeight:700,color,cursor:"pointer",borderBottom:`1px dotted ${color}`}}>{sym}{fmt(v)}</span>
  ):<span style={{color:C.muted}}>—</span>;

  // Export Excel
  const exportExcel=()=>{
    const wb=XLSX.utils.book_new();
    currencies.forEach(mon=>{
      const data=byClienteData[mon]; if(!data) return;
      const sym=monedaSym(mon);
      const rows=[
        [`Resumen CxC — ${mon} — ${new Date().toLocaleDateString('es-MX')}`],
        [],
        ["Cliente","# Facturas","Total","Cobrado","Por Cobrar","Corriente","Vencido 1-7 Días","Vencido 8-30 Días","Vencido 31-45 Días","Vencido 46-60 Días","Vencido +60 Días"],
        ...data.clientes.map(c=>[c.nombre,c.count,c.total,c.cobrado,c.porCobrar,c.corriente,c.v7,c.v30,c.v45,c.v60,c.vmas]),
        [],
        ["TOTAL",data.grand.count,data.grand.total,data.grand.cobrado,data.grand.porCobrar,data.grand.corriente,data.grand.v7,data.grand.v30,data.grand.v45,data.grand.v60,data.grand.vmas],
      ];
      const ws=XLSX.utils.aoa_to_sheet(rows);
      ws['!cols']=[{wch:35},{wch:8},{wch:14},{wch:14},{wch:14},{wch:14},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12}];
      XLSX.utils.book_append_sheet(wb,ws,mon);
    });
    XLSX.writeFile(wb,`Resumen_CxC_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // Print PDF
  const printPDF=()=>{
    const fecha=new Date().toLocaleDateString('es-MX');
    let html=`<html><head><meta charset="utf-8"><title>Resumen CxC</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:9px;color:#1A2332;padding:10mm}
      h1{font-size:14px;color:#0F2D4A;margin-bottom:2px}
      .sub{font-size:8px;color:#64748B;margin-bottom:10px}
      h2{font-size:11px;color:#1565C0;margin:12px 0 6px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      th{background:#0F2D4A;color:#fff;padding:6px 8px;text-align:center;font-size:8px;text-transform:uppercase;white-space:nowrap}
      th:first-child{text-align:left}
      td{padding:5px 8px;border-bottom:1px solid #E2E8F0;text-align:right;font-size:9px}
      td:first-child{text-align:left;font-weight:600}
      tr:nth-child(even){background:#F8FAFC}
      .total-row{background:#EEF2FF!important;font-weight:800;border-top:2px solid #0F2D4A}
      .danger{color:#E53935;font-weight:700} .ok{color:#43A047} .navy{color:#0F2D4A;font-weight:800}
      @page{size:A4 landscape;margin:8mm}
    </style></head><body>
    <h1>💵 Resumen Cuentas por Cobrar</h1>
    <div class="sub">Fecha: ${fecha}</div>`;
    currencies.forEach(mon=>{
      const data=byClienteData[mon]; if(!data||!data.clientes.length) return;
      const sym=monedaSym(mon);
      const f=v=>v.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
      const g=data.grand;
      html+=`<h2>${{MXN:"🇲🇽",USD:"🇺🇸",EUR:"🇪🇺"}[mon]} ${mon} — ${data.clientes.length} clientes</h2>
      <table><thead><tr>
        <th>Cliente</th><th># Fact</th><th>Total</th><th>Cobrado</th><th>Por Cobrar</th>
        <th>Corriente</th><th>Venc 1-7d</th><th>Venc 8-30d</th><th>Venc 31-45d</th><th>Venc 46-60d</th><th>Venc +60d</th>
      </tr></thead><tbody>`;
      data.clientes.forEach(c=>{
        const vc=v=>v>0?`<span class="danger">${sym}${f(v)}</span>`:`<span style="color:#94A3B8">—</span>`;
        html+=`<tr><td>${c.nombre}</td><td style="text-align:center">${c.count}</td>
          <td>${sym}${f(c.total)}</td><td class="ok">${sym}${f(c.cobrado)}</td>
          <td class="navy">${sym}${f(c.porCobrar)}</td>
          <td class="ok">${c.corriente>0?sym+f(c.corriente):'<span style="color:#94A3B8">—</span>'}</td>
          <td>${vc(c.v7)}</td><td>${vc(c.v30)}</td><td>${vc(c.v45)}</td><td>${vc(c.v60)}</td><td>${vc(c.vmas)}</td>
        </tr>`;
      });
      const vc=v=>v>0?`<span class="danger">${sym}${f(v)}</span>`:'—';
      html+=`<tr class="total-row"><td>TOTAL</td><td style="text-align:center">${g.count}</td>
        <td>${sym}${f(g.total)}</td><td class="ok">${sym}${f(g.cobrado)}</td>
        <td class="navy">${sym}${f(g.porCobrar)}</td>
        <td class="ok">${g.corriente>0?sym+f(g.corriente):'—'}</td>
        <td>${vc(g.v7)}</td><td>${vc(g.v30)}</td><td>${vc(g.v45)}</td><td>${vc(g.v60)}</td><td>${vc(g.vmas)}</td>
      </tr></tbody></table>`;
    });
    html+=`</body></html>`;
    const w=window.open('','_blank','width=1200,height=800');
    w.document.write(html); w.document.close();
    w.onload=()=>{w.focus();w.print();};
  };

  const COLS=["# Facturas","Total","Cobrado","Por Cobrar","Corriente","Venc 1-7 Días","Venc 8-30 Días","Venc 31-45 Días","Venc 46-60 Días","Venc +60 Días",""];

  const ClienteTable=({mon, data, ingresos, metrics, calcDias, monedaSym, fmt, C, openDetail})=>{
    const [expandedClientes, setExpandedClientes] = React.useState(new Set());
    const toggleCliente = (key) => setExpandedClientes(prev => { const n=new Set(prev); n.has(key)?n.delete(key):n.add(key); return n; });
    const sym=monedaSym(mon);
    const g=data.grand;
    return(
      <div style={{marginBottom:28}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <span style={{fontSize:18}}>{{MXN:"🇲🇽",USD:"🇺🇸",EUR:"🇪🇺"}[mon]}</span>
          <span style={{fontSize:16,fontWeight:900,color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[mon]}}>{mon}</span>
          <span style={{fontSize:12,color:C.muted}}>{g.count} facturas · {data.clientes.length} clientes</span>
        </div>
        {/* Chips */}
        <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
          {[
            {l:"Por Cobrar",  v:g.porCobrar, c:"#fff",    bg:"#0F2D4A",  border:"#0F2D4A",  fn: i=>true},
            {l:"Corriente",   v:g.corriente, c:"#1B5E20", bg:"#E8F5E9",  border:"#A5D6A7",  fn: i=>{const d=calcDias(i.fechaVencimiento);return d===null||d>=0;}},
            {l:"Vencido 1-7 Días",   v:g.v7,        c:"#E65100", bg:"#FFF3E0",  border:"#FFCC80",  fn: i=>{const d=calcDias(i.fechaVencimiento);return d!==null&&d<0&&Math.abs(d)<=7;}},
            {l:"Vencido 8-30 Días",  v:g.v30,       c:"#BF360C", bg:"#FBE9E7",  border:"#FF8A65",  fn: i=>{const d=calcDias(i.fechaVencimiento);return d!==null&&d<0&&Math.abs(d)>7&&Math.abs(d)<=30;}},
            {l:"Vencido 31-45 Días", v:g.v45,       c:"#fff",    bg:"#E53935",  border:"#E53935",  fn: i=>{const d=calcDias(i.fechaVencimiento);return d!==null&&d<0&&Math.abs(d)>30&&Math.abs(d)<=45;}},
            {l:"Vencido 46-60 Días", v:g.v60,       c:"#fff",    bg:"#B71C1C",  border:"#B71C1C",  fn: i=>{const d=calcDias(i.fechaVencimiento);return d!==null&&d<0&&Math.abs(d)>45&&Math.abs(d)<=60;}},
            {l:"Vencido +60 Días",   v:g.vmas,      c:"#fff",    bg:"#4A0000",  border:"#4A0000",  fn: i=>{const d=calcDias(i.fechaVencimiento);return d!==null&&d<0&&Math.abs(d)>60;}},
          ].filter(k=>k.v>0).map(k=>{
            const filtInvs = data.clientes.flatMap(c=>c.ingresos.filter(k.fn));
            return(
              <div key={k.l} style={{background:k.bg,border:`2px solid ${k.border}`,borderRadius:14,padding:"14px 20px",cursor:"pointer",transition:"transform .15s, box-shadow .15s",minWidth:130,boxShadow:"0 2px 6px rgba(0,0,0,.08)"}}
                onClick={()=>openDetail(`${mon} — ${k.l}`, filtInvs, true)}
                onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.04)";e.currentTarget.style.boxShadow="0 6px 18px rgba(0,0,0,.15)";}}
                onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="0 2px 6px rgba(0,0,0,.08)";}}>
                <div style={{fontSize:11,color:k.c,fontWeight:700,textTransform:"uppercase",opacity:.85,marginBottom:4,letterSpacing:.5}}>{k.l}</div>
                <div style={{fontSize:20,fontWeight:900,color:k.c}}>{sym}{fmt(k.v)}</div>
              </div>
            );
          })}
        </div>
        {/* Table */}
        <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:1000}}>
              <thead>
                <tr style={{background:C.navy}}>
                  <th style={{padding:"11px 14px",textAlign:"center",color:"#fff",fontWeight:700,fontSize:13,textTransform:"uppercase"}}>Cliente</th>
                  {COLS.map((h,ci)=>(
                    <th key={h||ci} style={{padding:"11px 10px",textAlign:"center",color:["# Facturas","Total","Cobrado","Por Cobrar","Corriente"].includes(h)?"#A5D6A7":h.startsWith("Venc")?"#FFCDD2":"#fff",fontWeight:700,fontSize:12,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
                {/* Totals row */}
                <tr style={{background:"#EEF2FF",borderBottom:`2px solid ${C.blue}`}}>
                  <td style={{padding:"8px 14px",fontWeight:800,color:C.navy,fontSize:13}}>TOTAL ({data.clientes.length} clientes)</td>
                  <td style={{padding:"8px 10px",textAlign:"right",fontWeight:800,color:C.muted}}>{g.count}</td>
                  <td style={{padding:"8px 10px",textAlign:"right",fontWeight:800,fontSize:13}}>{sym}{fmt(g.total)}</td>
                  <td style={{padding:"8px 10px",textAlign:"right",fontWeight:800,color:C.ok,fontSize:13}}>{sym}{fmt(g.cobrado)}</td>
                  <td style={{padding:"8px 10px",textAlign:"right",fontWeight:900,color:C.warn,fontSize:15}}>{sym}{fmt(g.porCobrar)}</td>
                  <td style={{padding:"8px 10px",textAlign:"right",fontWeight:800,color:C.ok,fontSize:13}}>{g.corriente>0?sym+fmt(g.corriente):"—"}</td>
                  {[g.v7,g.v30,g.v45,g.v60,g.vmas].map((v,vi)=>(
                    <td key={vi} style={{padding:"8px 10px",textAlign:"right",fontWeight:800,color:v>0?C.danger:C.muted,fontSize:13}}>{v>0?sym+fmt(v):"—"}</td>
                  ))}
                  <td/>
                </tr>
              </thead>
              <tbody>
                {data.clientes.map((cli,pi)=>{
                  const cliKey=`${mon}-${cli.nombre}`;
                  const expanded=expandedClientes.has(cliKey);
                  const cliIngresos=ingresos.filter(i=>i.cliente===cli.nombre&&(i.moneda||"MXN")===mon);
                  return(
                    <React.Fragment key={cli.nombre}>
                    <tr style={{borderTop:`1px solid ${C.border}`,background:expanded?"#E8F0FE":pi%2===0?"#FAFBFF":"#fff",cursor:"pointer"}}
                      onClick={()=>toggleCliente(cliKey)}
                      onMouseEnter={e=>{if(!expanded)e.currentTarget.style.background="#F0F7FF";}}
                      onMouseLeave={e=>{e.currentTarget.style.background=expanded?"#E8F0FE":pi%2===0?"#FAFBFF":"#fff";}}>
                      <td style={{padding:"12px 14px",fontWeight:700,fontSize:14,color:C.navy}}>
                        <span style={{marginRight:8,fontSize:11,color:C.blue,display:"inline-block",transform:expanded?"rotate(90deg)":"rotate(0deg)",transition:"transform .2s"}}>▶</span>
                        {cli.nombre}
                      </td>
                      <td style={{padding:"12px 10px",textAlign:"right",color:C.muted,fontSize:13}}>{cli.count}</td>
                      <td style={{padding:"12px 10px",textAlign:"right",fontWeight:700,fontSize:15,cursor:"pointer"}} onClick={e=>{e.stopPropagation();openDetail(`${cli.nombre} — Todas`,cli.ingresos);}}>
                        <span style={{borderBottom:`1px dotted ${C.navy}`,color:C.navy}}>{sym}{fmt(cli.total)}</span>
                      </td>
                      <td style={{padding:"12px 10px",textAlign:"right",color:C.ok,fontWeight:700,fontSize:15}}>{sym}{fmt(cli.cobrado)}</td>
                      <td style={{padding:"12px 10px",textAlign:"right",fontSize:15,fontWeight:800,cursor:"pointer"}} onClick={e=>{e.stopPropagation();openDetail(`${cli.nombre} — Por Cobrar`,cli.ingresos.filter(i=>(metrics[i.id]?.porCobrar||0)>0));}}>
                        <span style={{color:cli.porCobrar>0?C.warn:C.ok,borderBottom:`1px dotted ${cli.porCobrar>0?C.warn:C.ok}`}}>{sym}{fmt(cli.porCobrar)}</span>
                      </td>
                      <td style={{padding:"12px 10px",textAlign:"right",fontSize:15,fontWeight:700,cursor:cli.corriente>0?"pointer":"default"}} onClick={e=>{e.stopPropagation();if(cli.corriente>0)openDetail(`${cli.nombre} — Corriente`,cli.ingresos.filter(i=>{const d=calcDias(i.fechaVencimiento);return d===null||d>=0;}));}}>
                        {cli.corriente>0?<span style={{color:C.ok,borderBottom:`1px dotted ${C.ok}`}}>{sym}{fmt(cli.corriente)}</span>:<span style={{color:C.muted,fontSize:14}}>—</span>}
                      </td>
                      <td style={{padding:"12px 10px",textAlign:"right",fontSize:15}}>{vCell(cli.v7,sym,cli.ingresos.filter(i=>{const d=calcDias(i.fechaVencimiento);return d!==null&&d<0&&Math.abs(d)<=7;}),`${cli.nombre} — Venc 1-7d`)}</td>
                      <td style={{padding:"12px 10px",textAlign:"right",fontSize:15}}>{vCell(cli.v30,sym,cli.ingresos.filter(i=>{const d=calcDias(i.fechaVencimiento);return d!==null&&d<0&&Math.abs(d)>7&&Math.abs(d)<=30;}),`${cli.nombre} — Venc 8-30d`)}</td>
                      <td style={{padding:"12px 10px",textAlign:"right",fontSize:15}}>{vCell(cli.v45,sym,cli.ingresos.filter(i=>{const d=calcDias(i.fechaVencimiento);return d!==null&&d<0&&Math.abs(d)>30&&Math.abs(d)<=45;}),`${cli.nombre} — Venc 31-45d`,"#C62828")}</td>
                      <td style={{padding:"12px 10px",textAlign:"right",fontSize:15}}>{vCell(cli.v60,sym,cli.ingresos.filter(i=>{const d=calcDias(i.fechaVencimiento);return d!==null&&d<0&&Math.abs(d)>45&&Math.abs(d)<=60;}),`${cli.nombre} — Venc 46-60d`,"#B71C1C")}</td>
                      <td style={{padding:"12px 10px",textAlign:"right",fontSize:15}}>{vCell(cli.vmas,sym,cli.ingresos.filter(i=>{const d=calcDias(i.fechaVencimiento);return d!==null&&d<0&&Math.abs(d)>60;}),`${cli.nombre} — Venc +60d`,"#7F0000")}</td>
                      <td style={{padding:"12px 10px",textAlign:"right"}} onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>openDetail(`${cli.nombre} — Todas`,cli.ingresos)}
                          style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${C.blue}`,background:"#E8F0FE",color:C.blue,cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>Ver →</button>
                      </td>
                    </tr>
                    {/* Accordion: facturas del cliente */}
                    {expanded && (
                      <tr style={{background:"#F8FAFC"}}>
                        <td colSpan={12} style={{padding:0}}>
                          <div style={{overflowX:"auto",borderTop:`1px solid ${C.border}`}}>
                            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                              <thead>
                                <tr style={{background:"#EEF2FF"}}>
                                  {["Folio","Concepto","Segmento","F.Contable","Vencimiento","Días","Total","Cobrado","Por Cobrar"].map(h=>(
                                    <th key={h} style={{padding:"7px 12px",textAlign:["Total","Cobrado","Por Cobrar"].includes(h)?"right":"left",color:C.navy,fontWeight:700,fontSize:11,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {cliIngresos.sort((a,b)=>(a.fechaVencimiento||"").localeCompare(b.fechaVencimiento||"")).map((ing,ii)=>{
                                  const m=metrics[ing.id]||{};
                                  const dias=calcDias(ing.fechaVencimiento);
                                  return(
                                    <tr key={ing.id} style={{borderTop:`1px solid ${C.border}`,background:ii%2===0?"#fff":"#F8FAFC"}}>
                                      <td style={{padding:"8px 12px",color:C.blue,fontWeight:600,whiteSpace:"nowrap"}}>{ing.folio||"—"}</td>
                                      <td style={{padding:"8px 12px",color:C.muted,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ing.concepto||"—"}</td>
                                      <td style={{padding:"8px 12px"}}>{ing.segmento||"—"}</td>
                                      <td style={{padding:"8px 12px",color:C.teal,whiteSpace:"nowrap"}}>{ing.fechaContable||"—"}</td>
                                      <td style={{padding:"8px 12px",whiteSpace:"nowrap",color:dias!==null&&dias<0?C.danger:C.text}}>{ing.fechaVencimiento||"—"}</td>
                                      <td style={{padding:"8px 12px",textAlign:"center"}}>
                                        {dias===null?<span style={{color:C.muted}}>—</span>:dias<0?
                                          <span style={{background:"#FFEBEE",color:C.danger,fontWeight:800,fontSize:10,padding:"2px 6px",borderRadius:20}}>{Math.abs(dias)}d venc.</span>:
                                          <span style={{background:"#E8F5E9",color:C.ok,fontWeight:700,fontSize:10,padding:"2px 6px",borderRadius:20}}>{dias}d</span>}
                                      </td>
                                      <td style={{padding:"8px 12px",textAlign:"right",fontWeight:600}}>{sym}{fmt(ing.monto)}</td>
                                      <td style={{padding:"8px 12px",textAlign:"right",color:C.ok}}>{sym}{fmt(m.totalCobrado||0)}</td>
                                      <td style={{padding:"8px 12px",textAlign:"right",fontWeight:700,color:(m.porCobrar||0)>0?C.warn:C.ok}}>{sym}{fmt(m.porCobrar||0)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const MesTable=({mon, data, monedaSym, fmt, C, MESES, openDetail, metrics})=>{
    const sym=monedaSym(mon);
    const [expandedMeses, setExpandedMeses] = React.useState(new Set());
    const toggleMes = (key) => setExpandedMeses(prev => { const n=new Set(prev); n.has(key)?n.delete(key):n.add(key); return n; });
    const calcD = venc => venc ? Math.ceil((new Date(venc)-new Date())/864e5) : null;
    return(
      <div style={{marginBottom:28}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <span style={{fontSize:18}}>{{MXN:"🇲🇽",USD:"🇺🇸",EUR:"🇪🇺"}[mon]}</span>
          <span style={{fontSize:16,fontWeight:900,color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[mon]}}>{mon}</span>
        </div>
        <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{background:C.navy}}>
                <th style={{padding:"11px 14px",textAlign:"left",color:"#fff",fontWeight:700,fontSize:12,textTransform:"uppercase"}}>Mes de Venta</th>
                <th style={{padding:"11px 10px",textAlign:"center",color:"#A5D6A7",fontWeight:700,fontSize:11,textTransform:"uppercase"}}># Facturas</th>
                <th style={{padding:"11px 10px",textAlign:"right",color:"#A5D6A7",fontWeight:700,fontSize:11,textTransform:"uppercase"}}>Total</th>
                <th style={{padding:"11px 10px",textAlign:"right",color:"#A5D6A7",fontWeight:700,fontSize:11,textTransform:"uppercase"}}>Cobrado</th>
                <th style={{padding:"11px 10px",textAlign:"right",color:"#FFCDD2",fontWeight:700,fontSize:11,textTransform:"uppercase"}}>Por Cobrar</th>
                <th style={{padding:"11px 10px",textAlign:"right",color:"#fff",fontWeight:700,fontSize:11,textTransform:"uppercase"}}>% Cobrado</th>
                <th style={{padding:"11px 10px",textAlign:"right",color:"#fff",fontWeight:700,fontSize:11,textTransform:"uppercase"}}></th>
              </tr>
            </thead>
            <tbody>
              {data.meses.map((mes,i)=>{
                const pct=mes.total>0?Math.round(mes.cobrado/mes.total*100):0;
                const label=mes.mes==="Sin fecha"?"Sin fecha contable":`${MESES[+mes.mes.slice(5)-1]} ${mes.mes.slice(0,4)}`;
                const expanded=expandedMeses.has(mes.mes);
                return(
                  <React.Fragment key={mes.mes}>
                    <tr style={{borderTop:`1px solid ${C.border}`,background:expanded?"#E8F0FE":i%2===0?"#FAFBFF":"#fff",cursor:"pointer"}}
                      onClick={()=>toggleMes(mes.mes)}
                      onMouseEnter={e=>{if(!expanded)e.currentTarget.style.background="#F0F7FF";}}
                      onMouseLeave={e=>{e.currentTarget.style.background=expanded?"#E8F0FE":i%2===0?"#FAFBFF":"#fff";}}>
                      <td style={{padding:"12px 14px",fontWeight:700,fontSize:13,color:C.navy}}>
                        <span style={{marginRight:8,fontSize:11,color:C.blue,display:"inline-block",transform:expanded?"rotate(90deg)":"rotate(0deg)",transition:"transform .2s"}}>▶</span>
                        {label}
                      </td>
                      <td style={{padding:"12px 10px",textAlign:"center",color:C.muted,fontWeight:600}}>{mes.count}</td>
                      <td style={{padding:"12px 10px",textAlign:"right",fontWeight:600}}>{sym}{fmt(mes.total)}</td>
                      <td style={{padding:"12px 10px",textAlign:"right",color:C.ok,fontWeight:600}}>{sym}{fmt(mes.cobrado)}</td>
                      <td style={{padding:"12px 10px",textAlign:"right",fontWeight:800,color:mes.porCobrar>0?C.warn:C.ok,fontSize:14}}>{sym}{fmt(mes.porCobrar)}</td>
                      <td style={{padding:"12px 10px",textAlign:"right"}}>
                        <span style={{background:pct>=100?"#E8F5E9":pct>=50?"#FFF3E0":"#FFEBEE",color:pct>=100?C.ok:pct>=50?C.warn:C.danger,fontWeight:700,padding:"2px 8px",borderRadius:20,fontSize:12}}>{pct}%</span>
                      </td>
                      <td style={{padding:"12px 10px",textAlign:"right"}} onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>openDetail(label, mes.ingresos)}
                          style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${C.blue}`,background:"#E8F0FE",color:C.blue,cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>Ver →</button>
                      </td>
                    </tr>
                    {/* Accordion: facturas del mes agrupadas por cliente */}
                    {expanded && (
                      <tr>
                        <td colSpan={7} style={{padding:0,borderTop:`1px solid ${C.border}`}}>
                          <div style={{overflowX:"auto"}}>
                            {Object.entries(mes.ingresos.reduce((acc,i)=>{const c=i.cliente||"—";if(!acc[c])acc[c]=[];acc[c].push(i);return acc;},{})).sort((a,b)=>a[0].localeCompare(b[0])).map(([cliente,cIngs],ci)=>(
                              <div key={cliente}>
                                {/* Client subheader */}
                                <div style={{background:"#EEF2FF",padding:"8px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:ci>0?`1px solid #C5CAE9`:`1px solid ${C.border}`}}>
                                  <span style={{fontWeight:700,fontSize:13,color:C.navy}}>👤 {cliente}</span>
                                  <span style={{fontSize:12,color:C.muted}}>{cIngs.length} factura{cIngs.length!==1?"s":""} · Por cobrar: <b style={{color:C.warn}}>{sym}{fmt(cIngs.reduce((s,i)=>s+(metrics[i.id]?.porCobrar||0),0))}</b></span>
                                </div>
                                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                                  <thead>
                                    <tr style={{background:"#F3F4F6"}}>
                                      {["Folio","Concepto","Segmento","Vencimiento","Días","Monto","Cobrado","Por Cobrar"].map(h=>(
                                        <th key={h} style={{padding:"7px 12px",textAlign:["Monto","Cobrado","Por Cobrar"].includes(h)?"right":"left",color:C.navy,fontWeight:700,fontSize:11,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {cIngs.sort((a,b)=>(a.fechaVencimiento||"").localeCompare(b.fechaVencimiento||"")).map((ing,ii)=>{
                                      const m=metrics[ing.id]||{};
                                      const dias=calcD(ing.fechaVencimiento);
                                      return(
                                        <tr key={ing.id} style={{borderTop:`1px solid ${C.border}`,background:ii%2===0?"#fff":"#FAFBFF"}}>
                                          <td style={{padding:"8px 12px",color:C.blue,fontWeight:600,whiteSpace:"nowrap"}}>{ing.folio||"—"}</td>
                                          <td style={{padding:"8px 12px",color:C.muted,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ing.concepto||"—"}</td>
                                          <td style={{padding:"8px 12px",fontSize:11}}>{ing.segmento||"—"}</td>
                                          <td style={{padding:"8px 12px",fontSize:11,whiteSpace:"nowrap",color:dias!==null&&dias<0?C.danger:C.text}}>{ing.fechaVencimiento||"—"}</td>
                                          <td style={{padding:"8px 12px",textAlign:"center"}}>
                                            {dias===null?<span style={{color:C.muted}}>—</span>:dias<0?
                                              <span style={{background:"#FFEBEE",color:C.danger,fontWeight:800,fontSize:10,padding:"2px 6px",borderRadius:20}}>{Math.abs(dias)}d venc.</span>:
                                              <span style={{background:"#E8F5E9",color:C.ok,fontWeight:700,fontSize:10,padding:"2px 6px",borderRadius:20}}>{dias}d</span>}
                                          </td>
                                          <td style={{padding:"8px 12px",textAlign:"right",fontWeight:600}}>{sym}{fmt(ing.monto)}</td>
                                          <td style={{padding:"8px 12px",textAlign:"right",color:C.ok}}>{sym}{fmt(m.totalCobrado||0)}</td>
                                          <td style={{padding:"8px 12px",textAlign:"right",fontWeight:700,color:(m.porCobrar||0)>0?C.warn:C.ok}}>{sym}{fmt(m.porCobrar||0)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Detail Modal
  const DetailModal=()=>{
    if(!detailModal) return null;
    const invs=detailModal.invoices;
    const grouped=detailModal.grouped||false;
    const total=invs.reduce((s,i)=>s+i.monto,0);
    const porCobrar=invs.reduce((s,i)=>s+(metrics[i.id]?.porCobrar||0),0);
    const mon=(invs[0]?.moneda||"MXN");
    const sym=monedaSym(mon);

    // Group by client for chips modal
    const byCliente = grouped ? invs.reduce((acc,i)=>{
      const c=i.cliente||"—";
      if(!acc[c]) acc[c]={cliente:c,ingresos:[],porCobrar:0};
      acc[c].ingresos.push(i);
      acc[c].porCobrar+=(metrics[i.id]?.porCobrar||0);
      return acc;
    },{}) : null;
    const clientesList = byCliente ? Object.values(byCliente).sort((a,b)=>b.porCobrar-a.porCobrar) : null;

    const TableRows=({invList})=>invList.sort((a,b)=>(a.fechaVencimiento||"").localeCompare(b.fechaVencimiento||"")).map((ing,i)=>{
      const m=metrics[ing.id]||{};
      const dias=calcDias(ing.fechaVencimiento);
      return(
        <tr key={ing.id} style={{borderTop:`1px solid ${C.border}`,background:i%2===0?"#fff":"#FAFBFC"}}>
          <td style={{padding:"10px 14px",fontWeight:600,maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ing.cliente}</td>
          <td style={{padding:"10px 14px",color:C.blue,fontWeight:600,whiteSpace:"nowrap"}}>{ing.folio||"—"}</td>
          <td style={{padding:"10px 14px",color:C.muted,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:12}}>{ing.concepto||"—"}</td>
          <td style={{padding:"10px 14px",fontSize:11,color:C.teal,whiteSpace:"nowrap"}}>{ing.fechaContable||"—"}</td>
          <td style={{padding:"10px 14px",fontSize:11,color:C.muted,whiteSpace:"nowrap"}}>{ing.fecha||"—"}</td>
          <td style={{padding:"10px 14px",fontSize:11,whiteSpace:"nowrap",color:dias!==null&&dias<0?C.danger:C.text}}>{ing.fechaVencimiento||"—"}</td>
          <td style={{padding:"10px 14px",textAlign:"center"}}>
            {dias===null?<span style={{color:C.muted}}>—</span>:dias<0?(
              <span style={{background:"#FFEBEE",color:C.danger,fontWeight:800,fontSize:11,padding:"2px 6px",borderRadius:20}}>{Math.abs(dias)}d venc.</span>
            ):<span style={{background:"#E8F5E9",color:C.ok,fontWeight:700,fontSize:11,padding:"2px 6px",borderRadius:20}}>{dias}d</span>}
          </td>
          <td style={{padding:"10px 14px",textAlign:"right",fontWeight:600}}>{sym}{fmt(ing.monto)}</td>
          <td style={{padding:"10px 14px",textAlign:"right",color:C.ok}}>{sym}{fmt(m.totalCobrado||0)}</td>
          <td style={{padding:"10px 14px",textAlign:"right",fontWeight:700,color:(m.porCobrar||0)>0?C.warn:C.ok}}>{sym}{fmt(m.porCobrar||0)}</td>
        </tr>
      );
    });

    const thead=(
      <thead style={{position:"sticky",top:0}}>
        <tr style={{background:C.navy}}>
          {["Cliente","Folio","Concepto","F.Contable","Fecha","Vencimiento","Días","Total","Cobrado","Por Cobrar"].map(h=>(
            <th key={h} style={{padding:"11px 14px",textAlign:["Total","Cobrado","Por Cobrar"].includes(h)?"right":"left",color:"#fff",fontWeight:700,fontSize:12,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
          ))}
        </tr>
      </thead>
    );

    return(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:10}}
        onClick={()=>setDetailModal(null)}>
        <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:1300,maxHeight:"88vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}
          onClick={e=>e.stopPropagation()}>
          <div style={{padding:"18px 28px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:800,fontSize:17,color:C.navy}}>{detailModal.title}</div>
              <div style={{fontSize:13,color:C.muted,marginTop:3}}>{invs.length} factura{invs.length!==1?"s":""} · Por cobrar: <b style={{color:C.warn}}>{sym}{fmt(porCobrar)}</b>{grouped&&clientesList?` · ${clientesList.length} clientes`:""}</div>
            </div>
            <button onClick={()=>setDetailModal(null)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:20}}>×</button>
          </div>
          <div style={{overflowY:"auto",flex:1}}>
            {grouped && clientesList ? (
              /* Grouped by client view */
              clientesList.map((cli,ci)=>(
                <div key={cli.cliente} style={{marginBottom: ci < clientesList.length-1 ? 0 : 0}}>
                  {/* Client header */}
                  <div style={{background:"#EEF2FF",padding:"12px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:`${ci>0?"3px":"1px"} solid ${ci>0?"#C5CAE9":C.border}`,position:"sticky",top:0,zIndex:2}}>
                    <div style={{fontWeight:800,fontSize:14,color:C.navy}}>👤 {cli.cliente}</div>
                    <div style={{display:"flex",gap:20,fontSize:13}}>
                      <span style={{color:C.muted}}>{cli.ingresos.length} factura{cli.ingresos.length!==1?"s":""}</span>
                      <span style={{color:C.warn,fontWeight:700}}>Por cobrar: {sym}{fmt(cli.porCobrar)}</span>
                    </div>
                  </div>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                    {thead}
                    <tbody><TableRows invList={cli.ingresos}/></tbody>
                  </table>
                </div>
              ))
            ) : (
              /* Flat view */
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                {thead}
                <tbody><TableRows invList={invs}/></tbody>
              </table>
            )}
          </div>
          <div style={{padding:"14px 28px",borderTop:`1px solid ${C.border}`,display:"flex",gap:24,background:"#F8FAFC"}}>
            <span style={{fontSize:13,color:C.muted}}>Total: <b style={{color:C.navy}}>{sym}{fmt(total)}</b></span>
            <span style={{fontSize:13,color:C.muted}}>Por Cobrar: <b style={{color:C.warn}}>{sym}{fmt(porCobrar)}</b></span>
            {grouped&&clientesList&&<span style={{fontSize:13,color:C.muted}}>Clientes: <b style={{color:C.navy}}>{clientesList.length}</b></span>}
          </div>
        </div>
      </div>
    );
  };

  return(
    <div>
      <DetailModal/>
      {/* Controls */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        {/* Moneda buttons */}
        <div style={{display:"flex",gap:8}}>
          {["","MXN","USD","EUR"].map(mon=>{
            const labels={"":"Todas","MXN":"🇲🇽 MXN","USD":"🇺🇸 USD","EUR":"🇪🇺 EUR"};
            const colors={"MXN":C.mxn,"USD":C.usd,"EUR":C.eur,"":"#64748B"};
            const bgs={"MXN":"#E3F2FD","USD":"#E8F5E9","EUR":"#F3E5F5","":"#EEF2FF"};
            const active=filtroMonedaResumen===mon;
            const cnt=mon?ingresos.filter(i=>(i.moneda||"MXN")===mon).length:ingresos.length;
            return(
              <button key={mon} onClick={()=>setFiltroMonedaResumen(mon)}
                style={{padding:"8px 20px",borderRadius:40,border:"2px solid",
                  borderColor:active?(colors[mon]||C.blue):C.border,
                  background:active?(colors[mon]||C.blue):"#fff",
                  color:active?"#fff":(colors[mon]||C.text),
                  fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
                {labels[mon]} <span style={{fontSize:12,opacity:.8}}>({cnt})</span>
              </button>
            );
          })}
        </div>
        {/* Vista toggle */}
        <div style={{display:"flex",border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
          <button onClick={()=>setVistaResumen("cliente")} style={{padding:"8px 16px",border:"none",background:vistaResumen==="cliente"?C.navy:"#F1F5F9",color:vistaResumen==="cliente"?"#fff":C.text,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>👥 Por Cliente</button>
          <button onClick={()=>setVistaResumen("mes")} style={{padding:"8px 16px",border:"none",background:vistaResumen==="mes"?C.navy:"#F1F5F9",color:vistaResumen==="mes"?"#fff":C.text,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>📅 Por Mes de Venta</button>
        </div>
        {vistaResumen==="cliente" && (
          <input placeholder="🔍 Buscar cliente…" value={searchCliente} onChange={e=>setSearchCliente(e.target.value)}
            style={{padding:"8px 14px",borderRadius:10,border:`1px solid ${C.border}`,fontSize:13,width:220,fontFamily:"inherit"}}/>
        )}
        {/* Destino filter */}
        <select value={filtroDestinoResumen} onChange={e=>setFiltroDestinoResumen(e.target.value)}
          style={{padding:"8px 14px",borderRadius:10,border:`1px solid ${filtroDestinoResumen?"#3949AB":C.border}`,fontSize:13,fontFamily:"inherit",background:"#fff",color:filtroDestinoResumen?"#3949AB":C.muted,fontWeight:filtroDestinoResumen?700:400}}>
          <option value="">🗺️ Todos los destinos</option>
          {DESTINOS_R.map(d=><option key={d} value={d}>{d}</option>)}
        </select>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <button onClick={exportExcel} style={{display:"flex",alignItems:"center",gap:6,padding:"9px 16px",borderRadius:10,border:"1px solid #2E7D32",background:"#E8F5E9",color:"#2E7D32",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>📊 Excel</button>
          <button onClick={printPDF} style={{display:"flex",alignItems:"center",gap:6,padding:"9px 16px",borderRadius:10,border:"1px solid #1565C0",background:"#E3F2FD",color:"#1565C0",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>🖨️ PDF</button>
        </div>
      </div>

      {vistaResumen==="cliente" && currencies.map(mon=>{
        if(filtroMonedaResumen && mon!==filtroMonedaResumen) return null;
        const data=byClienteData[mon];
        if(!data||!data.clientes.length) return null;
        return <ClienteTable key={mon} mon={mon} data={data} ingresos={ingresos} metrics={metrics} calcDias={calcDias} monedaSym={monedaSym} fmt={fmt} C={C} openDetail={openDetail}/>;
      })}

      {vistaResumen==="mes" && currencies.map(mon=>{
        if(filtroMonedaResumen && mon!==filtroMonedaResumen) return null;
        const data=byMesData[mon];
        if(!data||!data.meses.length) return null;
        return <MesTable key={mon} mon={mon} data={data} monedaSym={monedaSym} fmt={fmt} C={C} MESES={MESES} openDetail={openDetail} metrics={metrics}/>;
      })}
    </div>
  );
}

/* ── CobrosCxC ───────────────────────────────────────────────────────── */
function CobrosCxC({ cobros, ingresos, fmt, C, monedaSym, MESES_NOMBRES, onIngresoClick }) {
  const [filtroBanco, setFiltroBanco] = React.useState("");
  const [filtroMonedaC, setFiltroMonedaC] = React.useState("");
  const [filtroDesde, setFiltroDesde] = React.useState("");
  const [filtroHasta, setFiltroHasta] = React.useState("");
  const [filtroMesRapido, setFiltroMesRapido] = React.useState("");
  const [filtroSegmento, setFiltroSegmento] = React.useState("");
  const [filtroMesVenta, setFiltroMesVenta] = React.useState("");
  const [busqueda, setBusqueda] = React.useState("");
  const [expandedMeses, setExpandedMeses] = React.useState(new Set());
  const toggleMes = k => setExpandedMeses(prev=>{const n=new Set(prev);n.has(k)?n.delete(k):n.add(k);return n;});

  const ingresoMap = React.useMemo(()=>{ const m={}; ingresos.forEach(i=>m[i.id]=i); return m; },[ingresos]);

  const mesesDisponibles = React.useMemo(()=>{
    const s=new Set(); cobros.forEach(c=>{ if(c.fechaCobro) s.add(c.fechaCobro.slice(0,7)); }); return [...s].sort().reverse();
  },[cobros]);

  const segmentosDisponibles = React.useMemo(()=>{
    const s=new Set(); cobros.forEach(c=>{ const seg=ingresoMap[c.ingresoId]?.segmento; if(seg) s.add(seg); }); return [...s].sort();
  },[cobros,ingresoMap]);

  const mesesVentaDisponibles = React.useMemo(()=>{
    const s=new Set(); cobros.forEach(c=>{ const fc=ingresoMap[c.ingresoId]?.fechaContable; if(fc) s.add(fc.slice(0,7)); }); return [...s].sort().reverse();
  },[cobros,ingresoMap]);

  const handleMesRapido = (mes) => {
    setFiltroMesRapido(mes);
    if(mes){ setFiltroDesde(`${mes}-01`); const [y,m]=mes.split("-").map(Number); const ld=new Date(y,m,0).getDate(); setFiltroHasta(`${mes}-${String(ld).padStart(2,"0")}`); }
    else { setFiltroDesde(""); setFiltroHasta(""); }
  };

  // Helper: días entre dos fechas
  const daysBetween = (d1, d2) => {
    if(!d1||!d2) return null;
    return Math.round((new Date(d2+"T12:00:00") - new Date(d1+"T12:00:00")) / 86400000);
  };

  const filtered = React.useMemo(()=>{
    const q = busqueda.trim().toLowerCase();
    return cobros.filter(c=>{
      const ing=ingresoMap[c.ingresoId];
      const mon=ing?.moneda||"MXN";
      if(filtroBanco && c.banco!==filtroBanco) return false;
      if(filtroMonedaC && mon!==filtroMonedaC) return false;
      if(filtroDesde && c.fechaCobro<filtroDesde) return false;
      if(filtroHasta && c.fechaCobro>filtroHasta) return false;
      if(filtroSegmento && (ing?.segmento||"")!==filtroSegmento) return false;
      if(filtroMesVenta && !(ing?.fechaContable||"").startsWith(filtroMesVenta)) return false;
      if(q){
        const haystack=[ing?.cliente||"",ing?.folio||"",ing?.concepto||"",String(c.monto||""),c.banco||"",c.notas||"",c.fechaCobro||"",ing?.segmento||""].join(" ").toLowerCase();
        if(!haystack.includes(q)) return false;
      }
      return true;
    });
  },[cobros,ingresoMap,filtroBanco,filtroMonedaC,filtroDesde,filtroHasta,filtroSegmento,filtroMesVenta,busqueda]);

  // KPIs
  const kpis = React.useMemo(()=>{
    const totalCobrado = filtered.reduce((s,c)=>s+c.monto,0);
    const rows = filtered.map(c=>{
      const ing=ingresoMap[c.ingresoId];
      const dFact = daysBetween(ing?.fecha, c.fechaCobro);
      const dVenc = daysBetween(ing?.fechaVencimiento, c.fechaCobro);
      return {...c, ing, dFact, dVenc};
    }).filter(r=>r.ing);
    const conVenc = rows.filter(r=>r.dVenc!==null);
    const aTiempo = conVenc.filter(r=>r.dVenc<=0);
    const tarde   = conVenc.filter(r=>r.dVenc>0);
    const avgDiasFact = rows.filter(r=>r.dFact!==null).length>0 ? Math.round(rows.filter(r=>r.dFact!==null).reduce((s,r)=>s+r.dFact,0)/rows.filter(r=>r.dFact!==null).length) : null;
    const avgRetraso  = tarde.length>0 ? Math.round(tarde.reduce((s,r)=>s+r.dVenc,0)/tarde.length) : null;
    // Por cliente: promedio días desde factura
    const porCliente={};
    rows.filter(r=>r.dFact!==null).forEach(r=>{ const cl=r.ing.cliente; if(!porCliente[cl]) porCliente[cl]={sum:0,n:0}; porCliente[cl].sum+=r.dFact; porCliente[cl].n++; });
    const clienteEntries=Object.entries(porCliente).map(([cl,d])=>({cl,avg:Math.round(d.sum/d.n)})).filter(e=>e.n>0||true);
    const masPuntual = clienteEntries.sort((a,b)=>a.avg-b.avg)[0];
    const masTardio  = clienteEntries.sort((a,b)=>b.avg-a.avg)[0];
    return { totalCobrado, total:filtered.length, aTiempo:aTiempo.length, tarde:tarde.length, conVenc:conVenc.length, avgDiasFact, avgRetraso, masPuntual, masTardio };
  },[filtered,ingresoMap]);

  const grouped = React.useMemo(()=>{
    const map={};
    filtered.forEach(c=>{
      const mes=c.fechaCobro?c.fechaCobro.slice(0,7):"Sin fecha";
      const ing=ingresoMap[c.ingresoId];
      const mon=ing?.moneda||"MXN";
      const banco=c.banco||"Sin banco";
      if(!map[mes]) map[mes]={mes,cobros:[],byBancoMon:{}};
      map[mes].cobros.push({...c,ing,moneda:mon});
      const bk=`${banco}|${mon}`;
      if(!map[mes].byBancoMon[bk]) map[mes].byBancoMon[bk]={banco,moneda:mon,total:0};
      map[mes].byBancoMon[bk].total+=c.monto;
    });
    return Object.values(map).sort((a,b)=>b.mes.localeCompare(a.mes));
  },[filtered,ingresoMap]);

  const inputStyle2={padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,fontFamily:"inherit",background:"#fff"};
  const limpiar=()=>{setFiltroBanco("");setFiltroMonedaC("");setFiltroDesde("");setFiltroHasta("");setFiltroMesRapido("");setFiltroSegmento("");setFiltroMesVenta("");setBusqueda("");};
  const hayFiltros=filtroBanco||filtroMonedaC||filtroDesde||filtroHasta||busqueda||filtroSegmento||filtroMesVenta;

  return(
    <div>
      {/* ── Filtros ── */}
      <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:14,padding:16,marginBottom:20}}>
        <div style={{marginBottom:10}}>
          <div style={{position:"relative",maxWidth:520}}>
            <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,color:C.muted,pointerEvents:"none"}}>🔍</span>
            <input value={busqueda} onChange={e=>setBusqueda(e.target.value)}
              placeholder="Buscar por cliente, folio, concepto, importe, banco, notas…"
              style={{...inputStyle2,width:"100%",paddingLeft:36,paddingRight:busqueda?32:12,boxSizing:"border-box",border:`1.5px solid ${busqueda?C.blue:C.border}`,background:busqueda?"#EEF4FF":"#fff"}}/>
            {busqueda&&<button onClick={()=>setBusqueda("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,color:C.muted,padding:0}}>×</button>}
          </div>
        </div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
          <select value={filtroBanco} onChange={e=>setFiltroBanco(e.target.value)} style={{...inputStyle2,minWidth:180}}>
            <option value="">🏦 Todos los bancos</option>
            <option>Banamex</option><option>Banorte</option>
          </select>
          <select value={filtroMonedaC} onChange={e=>setFiltroMonedaC(e.target.value)} style={{...inputStyle2,minWidth:170}}>
            <option value="">💵 Todas las monedas</option>
            <option value="MXN">🇲🇽 MXN</option><option value="USD">🇺🇸 USD</option>
          </select>
          {segmentosDisponibles.length>0&&(
            <select value={filtroSegmento} onChange={e=>setFiltroSegmento(e.target.value)} style={{...inputStyle2,minWidth:160}}>
              <option value="">✈️ Todos los segmentos</option>
              {segmentosDisponibles.map(s=><option key={s}>{s}</option>)}
            </select>
          )}
          <select value={filtroMesVenta} onChange={e=>setFiltroMesVenta(e.target.value)} style={{...inputStyle2,minWidth:190}}>
            <option value="">📅 Mes de venta</option>
            {mesesVentaDisponibles.map(m=>{ const[y,mo]=m.split("-"); return <option key={m} value={m}>{MESES_NOMBRES[+mo-1]} {y}</option>; })}
          </select>
          <select value={filtroMesRapido} onChange={e=>handleMesRapido(e.target.value)} style={{...inputStyle2,minWidth:190}}>
            <option value="">📆 Mes de cobro</option>
            {mesesDisponibles.map(m=>{ const[y,mo]=m.split("-"); return <option key={m} value={m}>{MESES_NOMBRES[+mo-1]} {y}</option>; })}
          </select>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:12,color:C.muted,fontWeight:600}}>Desde</span>
            <input type="date" value={filtroDesde} onChange={e=>{setFiltroDesde(e.target.value);setFiltroMesRapido("");}} style={inputStyle2}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:12,color:C.muted,fontWeight:600}}>Hasta</span>
            <input type="date" value={filtroHasta} onChange={e=>{setFiltroHasta(e.target.value);setFiltroMesRapido("");}} style={inputStyle2}/>
          </div>
          {hayFiltros&&<button onClick={limpiar} style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:"#F1F5F9",color:C.text,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>✕ Limpiar</button>}
        </div>
        {busqueda&&<div style={{marginTop:8,fontSize:12,color:C.blue,fontWeight:600}}>🔍 {filtered.length} resultado{filtered.length!==1?"s":""} para "<b>{busqueda}</b>"</div>}
      </div>

      {/* ── KPIs ── */}
      {filtered.length>0&&(
        <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
          {[
            {icon:"💰",label:"Total Cobrado",   val:`$${fmt(kpis.totalCobrado)}`,      bg:"#E3F2FD", c:C.mxn},
            {icon:"📋",label:"Total Cobros",    val:kpis.total,                        bg:"#EEF2FF", c:C.navy},
            {icon:"⏱️",label:"Prom. días cobro", val:kpis.avgDiasFact!=null?`${kpis.avgDiasFact}d`:"—", bg:"#F3E5F5", c:"#7B1FA2"},
            {icon:"✅",label:"Pagaron a tiempo", val:kpis.conVenc>0?`${kpis.aTiempo} (${Math.round(kpis.aTiempo/kpis.conVenc*100)}%)`:"—", bg:"#E8F5E9", c:"#1B5E20"},
            {icon:"⚠️",label:"Pagaron tarde",   val:kpis.conVenc>0?`${kpis.tarde} · +${kpis.avgRetraso??0}d prom`:"—", bg:"#FFF3E0", c:"#E65100"},
            {icon:"🏆",label:"Más puntual",     val:kpis.masPuntual?`${kpis.masPuntual.cl.split(" ")[0]} (${kpis.masPuntual.avg}d)`:"—", bg:"#E8F5E9", c:"#2E7D32"},
            {icon:"🐌",label:"Más tardío",      val:kpis.masTardio?`${kpis.masTardio.cl.split(" ")[0]} (${kpis.masTardio.avg}d)`:"—",  bg:"#FFEBEE", c:"#C62828"},
          ].map(k=>(
            <div key={k.label} style={{background:k.bg,borderRadius:14,padding:"12px 18px",border:`1px solid ${C.border}`,flex:"1 1 140px",minWidth:140}}>
              <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:.4,marginBottom:4}}>{k.icon} {k.label}</div>
              <div style={{fontSize:15,fontWeight:900,color:k.c,lineHeight:1.2}}>{k.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Agrupado por mes ── */}
      {grouped.length===0&&(
        <div style={{textAlign:"center",padding:60,color:C.muted,background:"#fff",borderRadius:14,border:`1px solid ${C.border}`}}>
          <div style={{fontSize:48,marginBottom:12}}>💰</div>
          <div style={{fontSize:16}}>Sin cobros en este periodo</div>
        </div>
      )}
      {grouped.map(g=>{
        const [y,mo]=g.mes.split("-");
        const label=g.mes==="Sin fecha"?"Sin fecha":`${MESES_NOMBRES[+mo-1]} ${y}`;
        const expanded=expandedMeses.has(g.mes);
        return(
          <div key={g.mes} style={{background:"#fff",border:`1px solid ${expanded?C.blue:C.border}`,borderRadius:14,overflow:"hidden",marginBottom:10}}>
            <div onClick={()=>toggleMes(g.mes)}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",background:expanded?"#E8F0FE":"#F8FAFC",cursor:"pointer"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:13,color:C.blue,display:"inline-block",transform:expanded?"rotate(90deg)":"rotate(0deg)",transition:"transform .2s"}}>▶</span>
                <span style={{fontWeight:800,fontSize:15,color:C.navy}}>📅 {label}</span>
                <span style={{fontSize:12,color:C.muted}}>{g.cobros.length} cobro{g.cobros.length!==1?"s":""}</span>
              </div>
              <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
                {Object.values(g.byBancoMon).map(bm=>(
                  <div key={`${bm.banco}-${bm.moneda}`} style={{textAlign:"right"}}>
                    <div style={{fontSize:10,color:C.muted,fontWeight:600}}>🏦 {bm.banco} · {bm.moneda}</div>
                    <div style={{fontSize:16,fontWeight:800,color:{MXN:C.mxn,USD:C.usd}[bm.moneda]||C.navy}}>{monedaSym(bm.moneda)}{fmt(bm.total)}</div>
                  </div>
                ))}
              </div>
            </div>
            {expanded&&(
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:1400}}>
                  <thead>
                    <tr style={{background:C.navy}}>
                      {["Segmento","F. Factura","Cliente","Folio","Concepto","Importe","Mes Venta","F. Cobro","Banco","Moneda","Días Fact→Cobro","Días Venc→Cobro","Notas"].map(h=>(
                        <th key={h} style={{padding:"10px 12px",textAlign:["Importe"].includes(h)?"right":"left",
                          color:h==="Días Venc→Cobro"?"#FFCC80":h==="Días Fact→Cobro"?"#A5D6A7":"rgba(255,255,255,.85)",
                          fontWeight:700,fontSize:11,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {g.cobros.sort((a,b)=>(a.ing?.cliente||"").localeCompare(b.ing?.cliente||"")||(a.fechaCobro||"").localeCompare(b.fechaCobro||"")).map((c,ci)=>{
                      const ing=c.ing;
                      const dFact=daysBetween(ing?.fecha, c.fechaCobro);
                      const dVenc=daysBetween(ing?.fechaVencimiento, c.fechaCobro);
                      const [mvY,mvM]=(ing?.fechaContable||"").slice(0,7).split("-");
                      const mesVentaLabel=mvY&&mvM?`${MESES_NOMBRES[+mvM-1]} ${mvY}`:"—";
                      const dVencColor=dVenc===null?C.muted:dVenc<=0?"#2E7D32":"#C62828";
                      const dVencLabel=dVenc===null?"—":dVenc<=0?`${Math.abs(dVenc)}d antes`:`+${dVenc}d tarde`;
                      return(
                        <tr key={c.id}
                          onClick={()=>onIngresoClick&&ing&&onIngresoClick(ing.id)}
                          style={{borderTop:`1px solid ${C.border}`,background:ci%2===0?"#fff":"#FAFBFF",
                            cursor:onIngresoClick&&ing?"pointer":"default",transition:"background .1s"}}
                          onMouseEnter={e=>{if(onIngresoClick&&ing)e.currentTarget.style.background="#EEF4FF";}}
                          onMouseLeave={e=>{e.currentTarget.style.background=ci%2===0?"#fff":"#FAFBFF";}}>
                          <td style={{padding:"9px 12px",fontSize:12,color:C.muted}}>{ing?.segmento||"—"}</td>
                          <td style={{padding:"9px 12px",whiteSpace:"nowrap",color:C.muted,fontSize:12}}>{ing?.fecha||"—"}</td>
                          <td style={{padding:"9px 12px",fontWeight:700,color:C.navy,whiteSpace:"nowrap"}}>{ing?.cliente||"—"}</td>
                          <td style={{padding:"9px 12px",color:C.blue,fontWeight:600,whiteSpace:"nowrap"}}>{ing?.folio||"—"}</td>
                          <td style={{padding:"9px 12px",color:C.text,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ing?.concepto||"—"}</td>
                          <td style={{padding:"9px 12px",textAlign:"right",fontWeight:700,color:C.ok,fontSize:13}}>{monedaSym(c.moneda)}{fmt(c.monto)}</td>
                          <td style={{padding:"9px 12px",color:C.teal,whiteSpace:"nowrap",fontSize:12}}>{mesVentaLabel}</td>
                          <td style={{padding:"9px 12px",whiteSpace:"nowrap",color:"#1B5E20",fontWeight:600,fontSize:12}}>{c.fechaCobro||"—"}</td>
                          <td style={{padding:"9px 12px"}}>
                            <span style={{background:c.banco==="Banamex"?"#E3F2FD":"#E8F5E9",color:c.banco==="Banamex"?C.mxn:"#2E7D32",padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700}}>🏦 {c.banco||"—"}</span>
                          </td>
                          <td style={{padding:"9px 12px"}}>
                            <span style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9"}[c.moneda]||"#F8FAFC",color:{MXN:C.mxn,USD:C.usd}[c.moneda]||C.navy,padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700}}>{c.moneda}</span>
                          </td>
                          <td style={{padding:"9px 12px",textAlign:"center"}}>
                            {dFact===null?<span style={{color:C.muted}}>—</span>:<span style={{background:"#E8F5E9",color:"#2E7D32",fontWeight:700,fontSize:11,padding:"2px 8px",borderRadius:20}}>{dFact}d</span>}
                          </td>
                          <td style={{padding:"9px 12px",textAlign:"center"}}>
                            {dVenc===null?<span style={{color:C.muted}}>—</span>:<span style={{background:dVenc<=0?"#E8F5E9":"#FFEBEE",color:dVencColor,fontWeight:700,fontSize:11,padding:"2px 8px",borderRadius:20}}>{dVencLabel}</span>}
                          </td>
                          <td style={{padding:"9px 12px",color:C.muted,fontSize:12}}>{c.notas||"—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── PorFacturarModal ────────────────────────────────────────────────── */
function PorFacturarModal({ empresaId, porFacturar, setPorFacturar, ingresos, insertPorFacturar, updatePorFacturar, deletePorFacturar, bulkInsertPorFacturar, onClose, esConsulta, fmt, C, btnStyle, inputStyle, XLSX, porFacturarRef }) {
  const [form, setForm] = React.useState(null);
  const [editId, setEditId] = React.useState(null);
  const [deleteId, setDeleteId] = React.useState(null);
  const [guardando, setGuardando] = React.useState(false);
  const [vistaPF, setVistaPF] = React.useState("cliente"); // "cliente" | "destino" | "lista"
  const [filtroDestinoPF, setFiltroDestinoPF] = React.useState("");

  const DESTINOS = ["Cancún","Tulum","Los Cabos","Cozumel","Mérida","Huatulco","Puerto Vallarta","Mazatlán"];

  const clientesExistentes = React.useMemo(()=>[...new Set(ingresos.map(i=>i.cliente).filter(Boolean))].sort(),[ingresos]);
  const monedaSym = m => m==="EUR"?"€":"$";

  const pfFiltrado = React.useMemo(()=>
    filtroDestinoPF ? porFacturar.filter(r=>r.destino===filtroDestinoPF) : porFacturar
  ,[porFacturar, filtroDestinoPF]);

  const totales = React.useMemo(()=>{
    const map={};
    pfFiltrado.forEach(r=>{
      if(!map[r.moneda]) map[r.moneda]=0;
      map[r.moneda]+=r.importe;
    });
    return map;
  },[pfFiltrado]);

  const emptyForm = () => ({cliente:"",concepto:"",importe:"",moneda:"MXN",notas:"",numOs:"",fechaVenta:"",destino:""});

  const handleSave = async() => {
    if(!form.cliente||!form.importe||+form.importe<=0) return;
    setGuardando(true);
    if(editId) {
      await updatePorFacturar(editId, {...form, importe:+form.importe});
      setPorFacturar(prev=>prev.map(r=>r.id===editId?{...r,...form,importe:+form.importe}:r));
      setEditId(null);
    } else {
      const saved = await insertPorFacturar({...form, importe:+form.importe, empresaId});
      if(saved) setPorFacturar(prev=>[saved,...prev]);
    }
    setForm(null);
    setGuardando(false);
  };

  const handleDelete = async(id) => {
    await deletePorFacturar(id);
    setPorFacturar(prev=>prev.filter(r=>r.id!==id));
    setDeleteId(null);
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:10}}
      onClick={onClose}>
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:1500,maxHeight:"95vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}
        onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{padding:"18px 24px",background:"#6A1B9A",borderRadius:"16px 16px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontWeight:800,color:"#fff",fontSize:17}}>📋 Pendiente por Facturar — TravelAirSolutions</div>
            <div style={{fontSize:12,color:"#E1BEE7",marginTop:3}}>Importes pendientes de autorización del cliente · No afecta proyección ni KPIs de CxC</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,color:"#fff",width:34,height:34,cursor:"pointer",fontSize:20}}>×</button>
        </div>

        {/* Totals chips */}
        {Object.keys(totales).length>0 && (
          <div style={{padding:"12px 24px",borderBottom:`1px solid #E8EAF6`,display:"flex",gap:12,flexWrap:"wrap",background:"#F3E5F5"}}>
            {Object.entries(totales).map(([mon,total])=>(
              <div key={mon} style={{background:"#fff",borderRadius:10,padding:"8px 16px",border:"1px solid #CE93D8"}}>
                <div style={{fontSize:10,color:"#7B1FA2",fontWeight:700,textTransform:"uppercase"}}>{mon==="MXN"?"🇲🇽":"🇺🇸"} {mon}</div>
                <div style={{fontSize:18,fontWeight:900,color:"#6A1B9A"}}>{monedaSym(mon)}{fmt(total)}</div>
                <div style={{fontSize:10,color:"#9C27B0"}}>{porFacturar.filter(r=>r.moneda===mon).length} registros</div>
              </div>
            ))}
            <div style={{background:"#EDE7F6",borderRadius:10,padding:"8px 16px",border:"1px solid #9575CD"}}>
              <div style={{fontSize:10,color:"#4527A0",fontWeight:700,textTransform:"uppercase"}}>📋 Total registros</div>
              <div style={{fontSize:18,fontWeight:900,color:"#4527A0"}}>{porFacturar.length}</div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!esConsulta && (
          <div style={{padding:"12px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",gap:8}}>
            <button onClick={()=>{setForm(emptyForm());setEditId(null);}}
              style={{...btnStyle,background:"#6A1B9A",padding:"8px 16px",fontSize:13}}>
              + Agregar manual
            </button>
            <button onClick={()=>porFacturarRef.current?.click()}
              style={{...btnStyle,background:"#E65100",color:"#fff",padding:"8px 16px",fontSize:13}}>
              📥 Importar Excel
            </button>
          </div>
        )}

        {/* Add/Edit form */}
        {form && (
          <div style={{padding:"16px 24px",background:"#F3E5F5",borderBottom:`1px solid #CE93D8`}}>
            <div style={{fontSize:13,fontWeight:700,color:"#6A1B9A",marginBottom:10}}>{editId?"✏️ Editar registro":"+ Nuevo registro"}</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
              <div>
                <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Cliente *</div>
                <select value={form.cliente} onChange={e=>setForm(f=>({...f,cliente:e.target.value}))}
                  style={{...inputStyle,minWidth:160}}>
                  <option value="">Seleccionar...</option>
                  {clientesExistentes.map(c=><option key={c} value={c}>{c}</option>)}
                  <option value="__otro__">✏️ Otro...</option>
                </select>
                {form.cliente==="__otro__" && (
                  <input value={form._clienteOtro||""} onChange={e=>setForm(f=>({...f,cliente:e.target.value,_clienteOtro:e.target.value}))}
                    placeholder="Nombre del cliente" style={{...inputStyle,marginTop:4,minWidth:160}}/>
                )}
              </div>
              <div>
                <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Concepto / Segmento</div>
                <input value={form.concepto} onChange={e=>setForm(f=>({...f,concepto:e.target.value}))}
                  placeholder="TAS, TRF..." style={{...inputStyle,minWidth:120}}/>
              </div>
              <div>
                <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Importe *</div>
                <input type="number" value={form.importe} onChange={e=>setForm(f=>({...f,importe:e.target.value}))}
                  placeholder="0.00" style={{...inputStyle,width:110}} step="0.01"/>
              </div>
              <div>
                <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Moneda</div>
                <select value={form.moneda} onChange={e=>setForm(f=>({...f,moneda:e.target.value}))} style={{...inputStyle,width:80}}>
                  <option>MXN</option>
                  <option>USD</option>
                </select>
              </div>
              <div>
                <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}># OS</div>
                <input value={form.numOs} onChange={e=>setForm(f=>({...f,numOs:e.target.value}))}
                  placeholder="1234" style={{...inputStyle,width:80}}/>
              </div>
              <div>
                <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Destino</div>
                <select value={form.destino||""} onChange={e=>setForm(f=>({...f,destino:e.target.value}))}
                  style={{...inputStyle,width:140}}>
                  <option value="">— Sin destino —</option>
                  {DESTINOS.map(d=><option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Fecha Venta</div>
                <input type="date" value={form.fechaVenta} onChange={e=>setForm(f=>({...f,fechaVenta:e.target.value}))}
                  style={{...inputStyle,width:140}}/>
              </div>
              <div style={{flex:1,minWidth:100}}>
                <div style={{fontSize:10,color:C.muted,fontWeight:600,marginBottom:3}}>Notas</div>
                <input value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))}
                  placeholder="Observaciones..." style={{...inputStyle,width:"100%"}}/>
              </div>
              <button onClick={handleSave} disabled={guardando||!form.cliente||!form.importe||+form.importe<=0}
                style={{...btnStyle,background:"#6A1B9A",padding:"8px 16px",fontSize:13,opacity:(!form.cliente||!form.importe)?0.5:1}}>
                {guardando?"Guardando...":"✓ Guardar"}
              </button>
              <button onClick={()=>{setForm(null);setEditId(null);}}
                style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"8px 14px",fontSize:13}}>Cancelar</button>
            </div>
          </div>
        )}

        {/* Delete confirm */}
        {deleteId && (
          <div style={{padding:"12px 24px",background:"#FFEBEE",borderBottom:`1px solid #FFCDD2`,display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:13,color:C.danger,fontWeight:600}}>⚠️ ¿Eliminar este registro? Esta acción no se puede deshacer.</span>
            <button onClick={()=>handleDelete(deleteId)} style={{...btnStyle,background:C.danger,padding:"6px 16px",fontSize:13}}>Sí, eliminar</button>
            <button onClick={()=>setDeleteId(null)} style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"6px 12px",fontSize:13}}>Cancelar</button>
          </div>
        )}

        {/* Vista controls */}
        <div style={{padding:"10px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",gap:10,alignItems:"center",background:"#FAFAFA",flexWrap:"wrap"}}>
          <div style={{display:"flex",border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
            {[{id:"lista",l:"📋 Lista"},{id:"cliente",l:"👤 Por Cliente"},{id:"destino",l:"🗺️ Por Destino"}].map(v=>(
              <button key={v.id} onClick={()=>setVistaPF(v.id)}
                style={{padding:"6px 14px",border:"none",background:vistaPF===v.id?"#6A1B9A":"#fff",color:vistaPF===v.id?"#fff":C.text,fontWeight:vistaPF===v.id?700:400,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                {v.l}
              </button>
            ))}
          </div>
          <select value={filtroDestinoPF} onChange={e=>setFiltroDestinoPF(e.target.value)}
            style={{...inputStyle,maxWidth:160,fontSize:12,borderColor:filtroDestinoPF?"#6A1B9A":C.border,color:filtroDestinoPF?"#6A1B9A":C.text}}>
            <option value="">🗺️ Todos los destinos</option>
            {DESTINOS.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
          {filtroDestinoPF && <button onClick={()=>setFiltroDestinoPF("")} style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"5px 10px",fontSize:12}}>✕</button>}
          <span style={{fontSize:12,color:C.muted,marginLeft:"auto"}}>{pfFiltrado.length} registros</span>
        </div>
        {/* Table */}
        <div style={{overflowY:"auto",flex:1}}>
          {porFacturar.length===0 ? (
            <div style={{textAlign:"center",padding:60,color:C.muted}}>
              <div style={{fontSize:48,marginBottom:12}}>📋</div>
              <div style={{fontSize:16}}>Sin registros pendientes por facturar</div>
              <div style={{fontSize:13,marginTop:6}}>Agrega manualmente o importa desde Excel</div>
            </div>
          ) : (()=>{
            const PFRow=({r,i})=>(
              <tr key={r.id} style={{borderTop:`1px solid ${C.border}`,background:i%2===0?"#fff":"#FAFBFF"}}>
                <td style={{padding:"10px 12px",fontWeight:700,color:"#6A1B9A",fontSize:13}}>{r.cliente}</td>
                <td style={{padding:"10px 12px",color:C.muted,fontSize:12}}>{r.concepto||"—"}</td>
                <td style={{padding:"10px 12px",fontSize:12}}>
                  {r.destino?<span style={{background:"#E8EAF6",color:"#3949AB",padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700}}>{r.destino}</span>:<span style={{color:C.muted}}>—</span>}
                </td>
                <td style={{padding:"10px 12px",color:C.blue,fontWeight:600,fontSize:12}}>{r.numOs||"—"}</td>
                <td style={{padding:"10px 12px",color:C.muted,fontSize:12,whiteSpace:"nowrap"}}>{r.fechaVenta||"—"}</td>
                <td style={{padding:"10px 12px"}}>
                  <span style={{background:r.moneda==="MXN"?"#E3F2FD":"#E8F5E9",color:r.moneda==="MXN"?"#1565C0":"#2E7D32",padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700}}>{r.moneda}</span>
                </td>
                <td style={{padding:"10px 12px",textAlign:"right",fontWeight:800,fontSize:15,color:"#6A1B9A"}}>{r.moneda==="EUR"?"€":"$"}{fmt(r.importe)}</td>
                <td style={{padding:"10px 12px",textAlign:"right"}}>
                  {!esConsulta && (
                    <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                      <button onClick={()=>{setForm({...r,importe:String(r.importe)});setEditId(r.id);}}
                        style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${C.blue}`,background:"#E8F0FE",color:C.blue,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>✏️</button>
                      <button onClick={()=>setDeleteId(r.id)}
                        style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${C.danger}`,background:"#FFEBEE",color:C.danger,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>🗑️</button>
                    </div>
                  )}
                </td>
              </tr>
            );
            const COLS=["Cliente","Concepto","Destino","# OS","Fecha Venta","Moneda","Importe","Acciones"];
            const thead=(
              <thead style={{position:"sticky",top:0}}>
                <tr style={{background:C.navy}}>
                  {COLS.map(h=>(
                    <th key={h} style={{padding:"10px 12px",textAlign:h==="Importe"?"right":"left",color:"#fff",fontWeight:700,fontSize:11,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
            );
            const groupBy=(arr,fn)=>arr.reduce((acc,r)=>{const k=fn(r)||"—";if(!acc[k])acc[k]=[];acc[k].push(r);return acc;},{});
            const groupTotal=(arr)=>arr.reduce((s,r)=>s+r.importe,0);
            if(vistaPF==="lista") return(
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                {thead}<tbody>{pfFiltrado.map((r,i)=><PFRow key={r.id} r={r} i={i}/>)}</tbody>
              </table>
            );
            const grupos=vistaPF==="cliente"
              ? Object.entries(groupBy(pfFiltrado,r=>r.cliente)).sort((a,b)=>groupTotal(b[1])-groupTotal(a[1]))
              : Object.entries(groupBy(pfFiltrado,r=>r.destino||"Sin destino")).sort((a,b)=>groupTotal(b[1])-groupTotal(a[1]));
            return(
              <div>
                {grupos.map(([grupo,regs])=>{
                  const porMon=regs.reduce((acc,r)=>{if(!acc[r.moneda])acc[r.moneda]=0;acc[r.moneda]+=r.importe;return acc;},{});
                  return(
                    <div key={grupo}>
                      <div style={{background:"#EDE7F6",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"2px solid #9575CD",position:"sticky",top:0,zIndex:2}}>
                        <span style={{fontWeight:800,fontSize:14,color:"#4527A0"}}>{vistaPF==="cliente"?"👤":"🗺️"} {grupo}</span>
                        <div style={{display:"flex",gap:16,alignItems:"center"}}>
                          {Object.entries(porMon).map(([mon,t])=>(
                            <span key={mon} style={{fontSize:13,color:"#4527A0",fontWeight:700}}>
                              {mon==="MXN"?"🇲🇽":"🇺🇸"} {mon==="EUR"?"€":"$"}{fmt(t)}
                            </span>
                          ))}
                          <span style={{fontSize:12,color:"#7E57C2"}}>{regs.length} registros</span>
                        </div>
                      </div>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                        {thead}<tbody>{regs.map((r,i)=><PFRow key={r.id} r={r} i={i}/>)}</tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

/* ── OcultasModal ────────────────────────────────────────────────────── */
function OcultasModal({ ingresos, metrics, onRestore, onRestoreAll, onClose, fmt, monedaSym, C, btnStyle, diasDiff }) {
  const [restoring, setRestoring] = React.useState(new Set());

  const handleRestore = async (id) => {
    setRestoring(prev => new Set([...prev, id]));
    await onRestore(id);
    setRestoring(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const handleRestoreAll = async () => {
    await onRestoreAll();
    onClose();
  };

  // Group by cliente
  const byCliente = ingresos.reduce((acc, i) => {
    const c = i.cliente || "—";
    if (!acc[c]) acc[c] = [];
    acc[c].push(i);
    return acc;
  }, {});

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:10}}
      onClick={onClose}>
      <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:1500,maxHeight:"95vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}
        onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{padding:"18px 24px",background:"#E65100",borderRadius:"16px 16px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontWeight:800,color:"#fff",fontSize:17}}>🙈 Facturas Ocultas</div>
            <div style={{fontSize:12,color:"#FFCC80",marginTop:3}}>{ingresos.length} factura{ingresos.length!==1?"s":""}  · No aparecen en KPIs ni totales</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {ingresos.length > 0 && (
              <button onClick={handleRestoreAll}
                style={{...btnStyle,background:"rgba(255,255,255,.2)",color:"#fff",border:"1px solid rgba(255,255,255,.4)",padding:"7px 16px",fontSize:13}}>
                👁️ Restaurar todas
              </button>
            )}
            <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,color:"#fff",width:34,height:34,cursor:"pointer",fontSize:20}}>×</button>
          </div>
        </div>

        {/* Content */}
        <div style={{overflowY:"auto",flex:1}}>
          {ingresos.length === 0 ? (
            <div style={{textAlign:"center",padding:60,color:C.muted}}>
              <div style={{fontSize:40,marginBottom:12}}>✅</div>
              <div style={{fontSize:15}}>No hay facturas ocultas</div>
            </div>
          ) : (
            Object.entries(byCliente).map(([cliente, ings], ci) => (
              <div key={cliente}>
                {/* Client header */}
                <div style={{background:"#FFF3E0",padding:"10px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:ci>0?`2px solid #FFE0B2`:"none",position:"sticky",top:0,zIndex:2}}>
                  <span style={{fontWeight:800,fontSize:14,color:"#E65100"}}>👤 {cliente}</span>
                  <span style={{fontSize:12,color:"#BF360C"}}>{ings.length} factura{ings.length!==1?"s":""}</span>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead>
                    <tr style={{background:"#FBE9E7"}}>
                      {["Folio","Concepto","Segmento","Fecha","Vencimiento","Días","Moneda","Monto","Por Cobrar","Restaurar"].map(h=>(
                        <th key={h} style={{padding:"8px 12px",textAlign:["Monto","Por Cobrar"].includes(h)?"right":"left",color:"#BF360C",fontWeight:700,fontSize:11,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ings.map((ing, ii) => {
                      const m = metrics[ing.id] || {};
                      const sym = monedaSym(ing.moneda);
                      const dias = diasDiff(ing.fechaVencimiento);
                      return (
                        <tr key={ing.id} style={{borderTop:`1px solid #FFE0B2`,background:ii%2===0?"#fff":"#FFF8F5"}}>
                          <td style={{padding:"10px 12px",color:C.blue,fontWeight:600,whiteSpace:"nowrap"}}>{ing.folio||"—"}</td>
                          <td style={{padding:"10px 12px",color:C.muted,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ing.concepto||"—"}</td>
                          <td style={{padding:"10px 12px",fontSize:12}}>{ing.segmento||"—"}</td>
                          <td style={{padding:"10px 12px",fontSize:12,color:C.muted,whiteSpace:"nowrap"}}>{ing.fecha||"—"}</td>
                          <td style={{padding:"10px 12px",fontSize:12,whiteSpace:"nowrap",color:dias!==null&&dias<0?C.danger:C.text}}>{ing.fechaVencimiento||"—"}</td>
                          <td style={{padding:"10px 12px",textAlign:"center"}}>
                            {dias===null?<span style={{color:C.muted}}>—</span>:dias<0?
                              <span style={{background:"#FFEBEE",color:C.danger,fontWeight:800,fontSize:11,padding:"2px 6px",borderRadius:20}}>{Math.abs(dias)}d venc.</span>:
                              <span style={{background:"#E8F5E9",color:C.ok,fontWeight:700,fontSize:11,padding:"2px 6px",borderRadius:20}}>{dias}d</span>}
                          </td>
                          <td style={{padding:"10px 12px"}}>
                            <span style={{background:ing.moneda==="MXN"?"#E3F2FD":"#E8F5E9",color:ing.moneda==="MXN"?"#1565C0":"#2E7D32",padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700}}>{ing.moneda}</span>
                          </td>
                          <td style={{padding:"10px 12px",textAlign:"right",fontWeight:600}}>{sym}{fmt(ing.monto)}</td>
                          <td style={{padding:"10px 12px",textAlign:"right",fontWeight:700,color:(m.porCobrar||0)>0?C.warn:C.ok}}>{sym}{fmt(m.porCobrar||0)}</td>
                          <td style={{padding:"10px 12px"}}>
                            <button onClick={()=>handleRestore(ing.id)} disabled={restoring.has(ing.id)}
                              style={{padding:"5px 14px",borderRadius:8,border:"1px solid #4CAF50",background:"#E8F5E9",color:"#2E7D32",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit",opacity:restoring.has(ing.id)?0.5:1}}>
                              {restoring.has(ing.id)?"...":"👁️ Restaurar"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{padding:"12px 24px",borderTop:`1px solid ${C.border}`,background:"#FFF3E0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,color:"#BF360C",fontWeight:600}}>
            Total oculto: {ingresos.length} factura{ingresos.length!==1?"s":""}
            {" · "}
            Por cobrar oculto: <b>{Object.keys(ingresos.reduce((a,i)=>({...a,[i.moneda||"MXN"]:true}),{})).map(mon=>{
              const sym=monedaSym(mon);
              const t=ingresos.filter(i=>(i.moneda||"MXN")===mon).reduce((s,i)=>s+(metrics[i.id]?.porCobrar||0),0);
              return t>0?`${sym}${fmt(t)} ${mon}`:null;
            }).filter(Boolean).join(" · ")}</b>
          </span>
          <button onClick={onClose} style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"8px 20px"}}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
