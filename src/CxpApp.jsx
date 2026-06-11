import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { parsearEstadoCuenta } from "./EstadoCuentaImporter";
import EgresosNFModal from "./EgresosNFModal";
import html2canvas from "html2canvas";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import {
  fetchInvoices, fetchSuppliers, fetchClasificaciones,
  upsertInvoice, upsertManyInvoices, deleteInvoiceDB, updateInvoiceField, bulkUpdateInvoices,
  upsertSupplier, upsertManySuppliers, saveClasificaciones,
  fetchPayments, insertPayment, deletePayment, updatePayment,
  fetchIngresos, fetchCobros, fetchInvoiceIngresos, fetchCategoriasIngreso,
  upsertInvoiceIngreso, deleteInvoiceIngreso,
  fetchClientes, upsertCliente, deleteCliente,
  fetchPorFacturar, insertPorFacturar, updatePorFacturar, deletePorFacturar, bulkInsertPorFacturar, bulkInsertPorFacturarPlain,
  fetchFinanciamientos, insertFinanciamiento, updateFinanciamiento, deleteFinanciamiento,
  fetchFinanciamientoPagos, insertFinanciamientoPago, deleteFinanciamientoPago,
  fetchTarjetas, updateTarjetaSaldo, fetchTarjetaMovimientos, bulkInsertMovimientos,
  fetchProgramados, upsertProgramado, deleteProgramado,
  fetchReporteSaldos, upsertReporteSaldos,
  fetchCuentasBancarias, upsertCuentaBancaria, deleteCuentaBancaria,
  fetchSaldosDiarios, upsertSaldoDiario, fetchFechasHistoricoSaldos,
  fetchIngresosDia, upsertIngresoDia, deleteIngresoDia,
  fetchSugerenciasIngresos,
  fetchCambiosDia, upsertCambioDia, deleteCambioDia,
  fetchSaldosTotalesPorFecha,
  fetchSaldoReporteDia, upsertSaldoReporteDia,
  fetchUltimoSaldoReporteAntes, fetchMovimientosDia,
  fetchAuditLog,
  fetchPrestamos, upsertPrestamo, deletePrestamo,
  fetchPrestamoMovimientos, upsertPrestamoMovimiento, deletePrestamoMovimiento,
  calcularUtilizadoPrestamo,
  buscarPlanesActivosDeFactura, marcarAbonoPagado,
} from "./db.js";
import CxcView from "./CxcView.jsx";
import ReportesView from "./ReportesView.jsx";
import FlujoIngresos from "./FlujoIngresos.jsx";
import { EMPRESAS } from "./empresas.js";

/* ── Palette ─────────────────────────────────────────────────────────────── */
const C = {
  navy: "#0F2D4A", blue: "#1565C0", sky: "#2196F3", teal: "#00897B",
  cream: "#FAFBFC", surface: "#FFFFFF", border: "#E2E8F0", muted: "#64748B",
  text: "#1A2332", danger: "#E53935", warn: "#F59E0B", ok: "#43A047",
  mxn: "#1565C0", usd: "#2E7D32", eur: "#6A1B9A",
};

/* ── Styles ──────────────────────────────────────────────────────────────── */
const inputStyle = { padding:"8px 12px", borderRadius:8, border:"1px solid #E2E8F0", fontSize:14, outline:"none", background:"#FAFBFC", width:"100%", fontFamily:"inherit", color:"#1A2332", boxSizing:"border-box" };
const selectStyle = { ...inputStyle, cursor:"pointer" };
const btnStyle = { padding:"9px 20px", borderRadius:10, border:"none", background:"#1565C0", color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" };
const iconBtn = { background:"none", border:"none", cursor:"pointer", fontSize:16, padding:"4px 6px" };

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const fmt = n => isNaN(n)||n===""||n===null ? "—" : new Intl.NumberFormat("es-MX",{minimumFractionDigits:2,maximumFractionDigits:2}).format(+n);
const today = () => new Date().toISOString().split("T")[0];
const addDays = (ds,d) => { if(!ds||!d) return ""; const x=new Date(ds); x.setDate(x.getDate()+ +d); return x.toISOString().split("T")[0]; };
const isOverdue = (v,e) => v && e!=="Pagado" && new Date(v)<new Date(today());
const daysUntil = ds => { if(!ds) return null; return Math.ceil((new Date(ds)-new Date(today()))/864e5); };

// Detect mes from concepto text
const detectarMesCxP = (concepto) => {
  const t = String(concepto||"").toUpperCase();
  if(/\bENE\b|\bENERO\b|\bJAN\b|\bJANUARY\b/.test(t)) return "Enero";
  if(/\bFEB\b|\bFEBRERO\b|\bFEBR\b/.test(t)) return "Febrero";
  if(/\bMAR\b|\bMARZO\b|\bMZO\b|\bMARZ\b/.test(t)) return "Marzo";
  if(/\bABR\b|\bABRIL\b|\bAPR\b/.test(t)) return "Abril";
  if(/\bMAY\b|\bMAYO\b/.test(t)) return "Mayo";
  if(/\bJUN\b|\bJUNIO\b|\bJUNE\b/.test(t)) return "Junio";
  if(/\bJUL\b|\bJULIO\b|\bJULY\b/.test(t)) return "Julio";
  if(/\bAGO\b|\bAGOSTO\b|\bAUG\b/.test(t)) return "Agosto";
  if(/\bSEP\b|\bSEPT\b|\bSEPTIEMBRE\b|\bSEPTIEM\b/.test(t)) return "Septiembre";
  if(/\bOCT\b|\bOCTUBRE\b/.test(t)) return "Octubre";
  if(/\bNOV\b|\bNOVIEMBRE\b|\bNOVIEM\b/.test(t)) return "Noviembre";
  if(/\bDIC\b|\bDICIEMBRE\b|\bDEC\b/.test(t)) return "Diciembre";
  return null;
};
const uid = () => Math.random().toString(36).slice(2,10);
const fmtDateShort = d => { if(!d) return ""; const [,m,dy]=d.split("-"); return `${dy}/${m}`; };
const fmtDateLabel = d => { if(!d) return ""; const dias=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"]; return `${dias[new Date(d+"T12:00:00").getDay()]} ${fmtDateShort(d)}`; };
const getDatesInRange = (f,t) => { if(!f||!t) return []; const r=[]; let c=new Date(f+"T12:00:00"); const e=new Date(t+"T12:00:00"); while(c<=e){ r.push(c.toISOString().split("T")[0]); c.setDate(c.getDate()+1); } return r; };
const parseExcelDate = v => { if(!v) return ""; if(v instanceof Date) return v.toISOString().split("T")[0]; if(typeof v==="number"){ const d=new Date(Math.round((v-25569)*864e5)); return d.toISOString().split("T")[0]; } const p=String(v).match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/); if(p){ return `${p[3].length===2?"20"+p[3]:p[3]}-${p[2].padStart(2,"0")}-${p[1].padStart(2,"0")}`; } return String(v); };
const statusColor = s => s==="Pagado"?C.ok:s==="Vencido"?C.danger:s==="Parcial"?C.warn:C.sky;

/* ── Data ────────────────────────────────────────────────────────────────── */
const DEFAULT_CLASES = ["Reprotección","Circuitos","Gastos Fijos","Materiales","Servicios","Honorarios","Importaciones","Otros"];
const SAMPLE_SUPPLIERS = [
  { id:"s1", nombre:"EDUARDO VELAZQUEZ", rfc:"VEFE801010XXX", moneda:"MXN", diasCredito:30, contacto:"Eduardo Velázquez", telefono:"55 1234 5678", email:"edu@email.com", banco:"BBVA", clabe:"012345678901234567", clasificacion:"Gastos Fijos", activo:true },
  { id:"s2", nombre:"TECH SUPPLIES SA", rfc:"TESA900101YYY", moneda:"USD", diasCredito:60, contacto:"Ana López", telefono:"55 9876 5432", email:"ana@tech.com", banco:"Banorte", clabe:"072345678901234567", clasificacion:"Circuitos", activo:true },
];
const mk = (id,fecha,serie,folio,uuid,prov,clas,sub,iva,total,dias,venc,est) => ({
  id, tipo:"Factura", fecha, serie, folio, uuid, proveedor:prov, clasificacion:clas,
  subtotal:sub, iva, retIsr:0, retIva:0, total, montoPagado:0, concepto:"",
  diasCredito:dias, vencimiento:venc, estatus:est,
  fechaProgramacion:"", diasFicticios:0, referencia:"", notas:"",
});
const INIT_INVOICES = {
  MXN: [
    mk("i1","2026-01-07","A","3200","4733f910-3c0f-4667-a5ff-b7ff523cc28a","EDUARDO VELAZQUEZ","Gastos Fijos",6400,1024,7424,30,"2026-02-06","Pendiente"),
    mk("i2","2026-01-15","A","3201","5844g021-4d1g-5778-b6gg-c8gg634dd39b","EDUARDO VELAZQUEZ","Circuitos",12000,1920,13920,30,"2026-02-14","Vencido"),
  ],
  USD: [mk("i3","2026-01-20","B","100","6955h132-5e2h-6889-c7hh-d9hh745ee40c","TECH SUPPLIES SA","Circuitos",5000,0,5000,60,"2026-03-21","Pendiente")],
  EUR: [],
};

/* ── Reusable small components ───────────────────────────────────────────── */
const Field = ({label,children}) => (
  <div style={{marginBottom:16}}>
    <label style={{display:"block",fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.4,marginBottom:6}}>{label}</label>
    {children}
  </div>
);

const ModalShell = ({title,onClose,wide,extraWide,children}) => (
  <div style={{position:"fixed",inset:0,background:"rgba(15,45,74,.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.surface,borderRadius:20,padding:32,width:"100%",maxWidth:extraWide?1200:wide?800:600,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.25)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
        <h2 style={{fontSize:20,fontWeight:800,color:C.navy,margin:0}}>{title}</h2>
        <button onClick={onClose} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:36,height:36,cursor:"pointer",fontSize:18}}>×</button>
      </div>
      {children}
    </div>
  </div>
);

const KpiCard = ({label,value,sub,color=C.navy,icon,onClick}) => (
  <div onClick={onClick} style={{background:"#fff",borderRadius:16,padding:"18px 22px",border:`1px solid ${C.border}`,borderLeft:`4px solid ${color}`,boxShadow:"0 2px 10px rgba(0,0,0,.06)",flex:1,minWidth:160,cursor:onClick?"pointer":"default",transition:"all .15s"}}
    onMouseEnter={e=>{if(onClick){e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 8px 24px rgba(0,0,0,.12)`;e.currentTarget.style.borderLeftColor=color;}}}
    onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 2px 10px rgba(0,0,0,.06)";}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div>
        <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:.7,marginBottom:4}}>{label}</div>
        <div style={{fontSize:24,fontWeight:900,color,lineHeight:1.1}}>{value}</div>
        {sub && <div style={{fontSize:11,color:C.muted,marginTop:4}}>{sub}</div>}
      </div>
      <div style={{fontSize:26,background:`${color}15`,borderRadius:10,width:42,height:42,display:"flex",alignItems:"center",justifyContent:"center"}}>{icon}</div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════════
   APP
   ═══════════════════════════════════════════════════════════════════════════ */
export default function CxpApp({ user, onLogout }) {
  const esConsulta = user?.rol === 'consulta';
  const esSuperadmin = (user?.rol || '').toLowerCase() === 'superadmin';
  const [view, setView] = useState("dashboard");
  const [currency, setCurrency] = useState("MXN");
  const [suppliers, setSuppliers] = useState([]);
  const [invoices, setInvoices] = useState({MXN:[],USD:[],EUR:[]});
  const [clases, setClases] = useState([]);
  const [loading, setLoading] = useState(true);
  /* ── Empresa activa ──────────────────────────────────────────── */
  const [empresaId, setEmpresaId] = useState(() => {
    return sessionStorage.getItem("cxp_empresa") || EMPRESAS[0].id;
  });
  const empresa = EMPRESAS.find(e => e.id === empresaId) || EMPRESAS[0];
  const [filters, setFilters] = useState({proveedor:"",clasificacion:"",estatus:"",fechaFrom:"",fechaTo:"",pagoFrom:"",pagoTo:""});
  const [search, setSearch] = useState("");
  const [filtroMesConcepto, setFiltroMesConcepto] = useState("");
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [grupoPickerOpenMain, setGrupoPickerOpenMain] = useState(false);
  const grupoPickerBtnRef = React.useRef(null);
  const [dashMesMoneda, setDashMesMoneda] = useState("MXN");
  const [carteraTab, setCarteraTab] = useState("activas"); // "activas" | "pagadas" | "resumen"
  const [filtroGrupo, setFiltroGrupo] = useState("");
  const [filtroProveedores, setFiltroProveedores] = useState(new Set()); // multi-select
  const [grupoPor, setGrupoPor] = useState("proveedor");
  const [grupo2, setGrupo2] = useState(""); // secondary grouping
  const [modalInv, setModalInv] = useState(null);
  // Egresos No Facturados
  const [modalEgreso, setModalEgreso] = useState(null);
  const [modalImportarEgresos, setModalImportarEgresos] = useState(null);
  const [modalListaNF, setModalListaNF] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState('todos'); // 'todos' | 'facturas' | 'egresos'
  const [modalSup, setModalSup] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // {id, cur}
  const [importMsg, setImportMsg] = useState("");
  const [importDupes, setImportDupes] = useState([]);
  const [projFrom, setProjFrom] = useState("");
  const [projTo, setProjTo] = useState("");
  const [projDetail, setProjDetail] = useState(null);
  const [proyeccionTab, setProyeccionTab] = useState("matriz"); // "matriz" | "reporte"
  const [supSearch, setSupSearch] = useState("");
  const [showDupes, setShowDupes] = useState(false);
  const [projSearch, setProjSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkClasif, setBulkClasif] = useState("");
  const [bulkEstatus, setBulkEstatus] = useState("");
  const [bulkPayModal, setBulkPayModal] = useState(null); // "programado" or "realizado"
  const [dashDetail, setDashDetail] = useState(null); // {title, invoices, type}
  const [dashSearch, setDashSearch] = useState("");
  const [dashFilterProv, setDashFilterProv] = useState("");
  const [dashFilterClasif, setDashFilterClasif] = useState("");
  const [dashFilterEstatus, setDashFilterEstatus] = useState("");
  const [dashGroupBy, setDashGroupBy] = useState("");
  const [dashSelectedIds, setDashSelectedIds] = useState(new Set());
  const [dashBulkAutDir, setDashBulkAutDir] = useState("");
  const [pagosDetail, setPagosDetail] = useState(null);
  const [pagosExpandedDates, setPagosExpandedDates] = useState(new Set()); // {proveedor, facturas}
  const [pagosSearch, setPagosSearch] = useState("");
  const [ncInput, setNcInput] = useState("");
  const [sortCol, setSortCol] = useState("");
  const [sortDir, setSortDir] = useState("asc");
  const [payments, setPayments] = useState([]); // all payments from DB
  const [payModal, setPayModal] = useState(null); // {invoiceId, proveedor, folio, total, moneda}
  const [planMatchModal, setPlanMatchModal] = useState(null); // {planes, montoPago, invoiceId, fechaPago, ...}
  const [planMatchQueue, setPlanMatchQueue] = useState([]); // cola pendiente cuando viene de bulk: array de {planes, montoPago, invoiceId, fechaPago, proveedor, folio, moneda}
  const [pagosFechaFrom, setPagosFechaFrom] = useState("");
  const [pagosFechaTo, setPagosFechaTo] = useState("");
  const fileRef = useRef();
  const searchRef = useRef();
  const financImportRef = useRef();

  /* ── CxC State ──────────────────────────────────────────────────────── */
  const [ingresos, setIngresos] = useState([]);
  const [cobros, setCobros] = useState([]);
  const [invoiceIngresos, setInvoiceIngresos] = useState([]);
  const [categoriasIngreso, setCategoriasIngreso] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [porFacturar, setPorFacturar] = useState([]);
  const [financiamientos, setFinanciamientos] = useState([]);
  const [financiamientoPagos, setFinanciamientoPagos] = useState([]);
  const [financModalId, setFinancModalId] = useState(null);
  const [financCollapsed, setFinancCollapsed] = useState(true);
  const [financImportPreview, setFinancImportPreview] = useState(null);
  const [financImportando, setFinancImportando] = useState(false);
  const [tarjetas, setTarjetas] = useState([]);
  const [tarjetasCollapsed, setTarjetasCollapsed] = useState(true);
  const [tarjetaMovimientos, setTarjetaMovimientos] = useState([]);
  const [tarjetaModalId, setTarjetaModalId] = useState(null);
  const [tarjetaImportPreview, setTarjetaImportPreview] = useState(null);
  const [tarjetaImportando, setTarjetaImportando] = useState(false);
  const tarjetaImportRef = useRef();
  const [editingSaldoId, setEditingSaldoId] = useState(null);
  const [editingSaldoVal, setEditingSaldoVal] = useState("");
  const [tarjetaFiltroInt, setTarjetaFiltroInt] = useState("");
  const [tarjetaFiltroTipo, setTarjetaFiltroTipo] = useState("");
  const [tarjetaFiltroMes, setTarjetaFiltroMes] = useState("");
  const [tarjetaTab, setTarjetaTab] = useState("calendario"); // calendario | resumen | programados
  const [calMes, setCalMes] = useState(() => { const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`; });
  const [calDiaSeleccionado, setCalDiaSeleccionado] = useState(null);
  const [calShowMovs, setCalShowMovs] = useState(true);
  const [calShowProgs, setCalShowProgs] = useState(true);
  const [programados, setProgramados] = useState([]);
  const [formProg, setFormProg] = useState(null); // null | {} para nuevo/editar
  const [editSaldoModal, setEditSaldoModal] = useState(false);
  const [editSaldoVal, setEditSaldoVal] = useState("");
  const [resumenGrupo, setResumenGrupo] = useState("integrante"); // integrante | tipo | mes
  const [resumenFiltroInt, setResumenFiltroInt] = useState("");
  const [resumenFiltroTipo, setResumenFiltroTipo] = useState("");
  const [resumenFiltroMes, setResumenFiltroMes] = useState("");
  const [progSeriePopup, setProgSeriePopup] = useState(null); // key of serie to show popup
  const [vincularModal, setVincularModal] = useState(null); // {invoiceId, proveedor, folio, total, moneda}

  /* ── Load data from Supabase ────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      setLoading(true);
      const results = await Promise.allSettled([
        fetchInvoices(empresaId), fetchSuppliers(empresaId), fetchClasificaciones(empresaId), fetchPayments(empresaId),
        fetchIngresos(empresaId), fetchCobros(empresaId), fetchInvoiceIngresos(empresaId), fetchCategoriasIngreso(empresaId),
        fetchClientes(empresaId), fetchPorFacturar(empresaId),
        fetchFinanciamientos(empresaId), fetchFinanciamientoPagos(empresaId),
        fetchTarjetas(empresaId), fetchTarjetaMovimientos(empresaId),
        fetchProgramados(empresaId),
      ]);
      const [inv, sup, cls, pays, ings, cbs, invIngs, cats, clts, pf, fins, finPagos, tarjs, tarjMovs, progs] =
        results.map(r => r.status==="fulfilled" ? r.value : []);
      setInvoices(inv);
      setSuppliers(sup.length > 0 ? sup : []);
      setClases(cls.length > 0 ? cls : DEFAULT_CLASES);
      setPayments(pays);
      setIngresos(ings);
      setCobros(cbs);
      setInvoiceIngresos(invIngs);
      setCategoriasIngreso(cats);
      setClientes(clts);
      setPorFacturar(pf);
      setFinanciamientos(fins);
      setFinanciamientoPagos(finPagos);
      setTarjetas(tarjs);
      setTarjetaMovimientos(tarjMovs);
      setProgramados(progs);
      setLoading(false);
    })();
  }, [empresaId]);

  /* ── Payments helpers ───────────────────────────────────────────── */
  const paymentsFor = (invoiceId) => payments.filter(p => p.invoiceId === invoiceId);
  const realizedPayments = (invoiceId) => paymentsFor(invoiceId).filter(p => p.tipo === 'realizado');
  const scheduledPayments = (invoiceId) => paymentsFor(invoiceId).filter(p => p.tipo === 'programado');
  const totalPaidViaPayments = (invoiceId) => realizedPayments(invoiceId).reduce((s,p) => s + p.monto, 0);
  const totalScheduled = (invoiceId) => scheduledPayments(invoiceId).reduce((s,p) => s + p.monto, 0);

  const addPayment = async (invoiceId, monto, fechaPago, notas, tipo, metodoPago) => {
    const saved = await insertPayment({
      invoiceId, monto: +monto, fechaPago, notas,
      tipo: tipo || 'realizado',
      metodoPago: metodoPago || 'banco',
    });
    setPayments(prev => [saved, ...prev]);
    // Only sync invoice estatus/montoPagado for realized payments
    if(tipo !== 'programado') {
      const allRealized = [...payments.filter(p=>p.invoiceId===invoiceId && p.tipo==='realizado'), saved];
      const totalPaid = allRealized.reduce((s,p)=>s+p.monto,0);
      syncInvoicePayment(invoiceId, totalPaid);
    }
  };

  const removePayment = async (paymentId, invoiceId) => {
    const pay = payments.find(p=>p.id===paymentId);
    await deletePayment(paymentId);
    setPayments(prev => prev.filter(p => p.id !== paymentId));
    // Only sync if it was a realized payment
    if(!pay || pay.tipo !== 'programado') {
      const remaining = payments.filter(p => p.invoiceId === invoiceId && p.id !== paymentId && p.tipo === 'realizado');
      const totalPaid = remaining.reduce((s,p)=>s+p.monto,0);
      syncInvoicePayment(invoiceId, totalPaid);
    }
  };

  const syncInvoicePayment = (invoiceId, totalPaid) => {
    setInvoices(prev => {
      const result = {...prev};
      ["MXN","USD","EUR"].forEach(c => {
        result[c] = result[c].map(i => {
          if(i.id !== invoiceId) return i;
          const estatus = totalPaid >= (+i.total||0) && (+i.total||0)>0 ? "Pagado" : totalPaid > 0 ? "Parcial" : "Pendiente";
          return {...i, montoPagado: totalPaid, estatus};
        });
      });
      return result;
    });
    let inv = null;
    ["MXN","USD","EUR"].forEach(c => { const f = invoices[c].find(i=>i.id===invoiceId); if(f) inv=f; });
    if(inv) {
      const estatus = totalPaid >= (+inv.total||0) && (+inv.total||0)>0 ? "Pagado" : totalPaid > 0 ? "Parcial" : "Pendiente";
      updateInvoiceField(invoiceId, { montoPagado: totalPaid, estatus });
    }
  };

  /* ── Derived ─────────────────────────────────────────────────────────── */
  const curInvoices = invoices[currency] || [];

  // Serialize Set to string so useMemo detects changes
  const filtroProveedoresKey = [...filtroProveedores].sort().join("|");

  const filtered = useMemo(() => {
    const getSupGrupo = (nombre) => suppliers.find(s=>s.nombre===nombre)?.grupo || "";
    let result = curInvoices.filter(inv => {
      // Filtro Tipo: facturas / egresos / todos
      if (filtroTipo === 'facturas' && inv.tipo === 'EgresoNF') return false;
      if (filtroTipo === 'egresos'  && inv.tipo !== 'EgresoNF') return false;
      // Tab filter
      if(carteraTab === "activas" && inv.estatus === "Pagado") return false;
      if(carteraTab === "pagadas" && inv.estatus !== "Pagado") return false;
      if(filters.proveedor && inv.proveedor!==filters.proveedor) return false;
      if(filtroProveedoresKey && !filtroProveedoresKey.split("|").includes(inv.proveedor)) return false;
      if(filters.clasificacion && inv.clasificacion!==filters.clasificacion) return false;
      if(filters.estatus && inv.estatus!==filters.estatus) return false;
      if(filters.fechaFrom && inv.fecha<filters.fechaFrom) return false;
      if(filters.fechaTo && inv.fecha>filters.fechaTo) return false;
      if(filters.pagoFrom || filters.pagoTo) {
        const fp = inv.fechaProgramacion || "";
        if(!fp) return false;
        if(filters.pagoFrom && fp < filters.pagoFrom) return false;
        if(filters.pagoTo && fp > filters.pagoTo) return false;
      }
      if(filtroGrupo && getSupGrupo(inv.proveedor) !== filtroGrupo) return false;
      if(search && !JSON.stringify(inv).toLowerCase().includes(search.toLowerCase())) return false;
      if(filtroMesConcepto) {
        if(filtroMesConcepto === "__sin_mes__") { if(detectarMesCxP(inv.concepto)!==null) return false; }
        else { if(detectarMesCxP(inv.concepto) !== filtroMesConcepto) return false; }
      }
      return true;
    });
    if(sortCol) {
      result = [...result].sort((a,b) => {
        let va, vb;
        if(sortCol==="fecha"||sortCol==="vencimiento"||sortCol==="fechaProgramacion") { va=a[sortCol]||""; vb=b[sortCol]||""; }
        else if(sortCol==="total"||sortCol==="montoPagado"||sortCol==="saldo") {
          va = sortCol==="saldo" ? ((+a.total||0)-(+a.montoPagado||0)) : (+a[sortCol]||0);
          vb = sortCol==="saldo" ? ((+b.total||0)-(+b.montoPagado||0)) : (+b[sortCol]||0);
        }
        else if(sortCol==="dias") { va=daysUntil(a.vencimiento)??999; vb=daysUntil(b.vencimiento)??999; }
        else { va=String(a[sortCol]||"").toLowerCase(); vb=String(b[sortCol]||"").toLowerCase(); }
        if(va<vb) return sortDir==="asc"?-1:1;
        if(va>vb) return sortDir==="asc"?1:-1;
        return 0;
      });
    }
    return result;
  }, [curInvoices, filters, search, sortCol, sortDir, carteraTab, filtroGrupo, filtroProveedoresKey, suppliers, filtroMesConcepto, filtroTipo]);

  const kpis = useMemo(() => {
    const allInvs = [...invoices.MXN,...invoices.USD,...invoices.EUR];
    const pend = list => list.filter(i=>i.estatus!=="Pagado").reduce((s,i)=>s+((+i.total||0)-(+i.montoPagado||0)),0);
    return {
      totalMXN:pend(invoices.MXN), totalUSD:pend(invoices.USD), totalEUR:pend(invoices.EUR),
      vencidas:allInvs.filter(i=>isOverdue(i.vencimiento,i.estatus)).length,
      facturas:allInvs.length, proveedores:suppliers.filter(s=>s.activo).length,
    };
  }, [invoices, suppliers]);

  /* ── Duplicate folio detection ───────────────────────────────────────── */
  const duplicates = useMemo(() => {
    const allInvs = [
      ...invoices.MXN.map(i=>({...i,moneda:"MXN"})),
      ...invoices.USD.map(i=>({...i,moneda:"USD"})),
      ...invoices.EUR.map(i=>({...i,moneda:"EUR"})),
    ];
    const folioMap = {};
    allInvs.forEach(inv => {
      const key = `${inv.serie}${inv.folio}`.trim();
      if(!key) return;
      if(!folioMap[key]) folioMap[key] = [];
      folioMap[key].push(inv);
    });
    const dupes = {};
    Object.entries(folioMap).forEach(([k,v]) => { if(v.length>1) dupes[k]=v; });
    return dupes;
  }, [invoices]);

  const dupeCount = Object.values(duplicates).reduce((s,v) => s + v.length, 0);
  const dupeFolioSet = useMemo(() => {
    const s = new Set();
    Object.values(duplicates).forEach(arr => arr.forEach(i => s.add(i.id)));
    return s;
  }, [duplicates]);

  /* ── Inline field updates (local + DB) ──────────────────────────── */
  const updateClasificacion = (id, clasificacion) => {
    setInvoices(prev => ({ ...prev, [currency]: prev[currency].map(i => i.id===id ? { ...i, clasificacion } : i) }));
    updateInvoiceField(id, { clasificacion });
  };

  const updateFechaProgramacion = (id, fechaProgramacion) => {
    setInvoices(prev => ({ ...prev, [currency]: prev[currency].map(i => i.id===id ? { ...i, fechaProgramacion } : i) }));
    updateInvoiceField(id, { fechaProgramacion });
  };

  const toggleVoBo = (id) => {
    let newVal;
    setInvoices(prev => ({ ...prev, [currency]: prev[currency].map(i => {
      if(i.id!==id) return i;
      newVal = !i.voBo;
      return { ...i, voBo: newVal };
    }) }));
    setTimeout(() => updateInvoiceField(id, { voBo: newVal }), 0);
  };

  const toggleAutorizadoDireccion = (id, cur) => {
    const c = cur || currency;
    let newVal;
    setInvoices(prev => ({ ...prev, [c]: prev[c].map(i => {
      if(i.id!==id) return i;
      newVal = !i.autorizadoDireccion;
      return { ...i, autorizadoDireccion: newVal };
    }) }));
    setTimeout(() => updateInvoiceField(id, { autorizadoDireccion: newVal }), 0);
  };

  // Universal updater: updates an invoice across any currency
  const updateInvoiceAny = (id, fields) => {
    setInvoices(prev => {
      const result = {...prev};
      ["MXN","USD","EUR"].forEach(c => {
        result[c] = result[c].map(i => i.id===id ? {...i, ...fields} : i);
      });
      return result;
    });
    updateInvoiceField(id, fields);
  };

  /* ── Bulk selection & update ──────────────────────────────────────── */
  const toggleSelect = (id) => {
    setSelectedIds(prev => { const n = new Set(prev); if(n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleSelectAll = (invs) => {
    const allSelected = invs.every(i => selectedIds.has(i.id));
    if(allSelected) setSelectedIds(prev => { const n = new Set(prev); invs.forEach(i => n.delete(i.id)); return n; });
    else setSelectedIds(prev => { const n = new Set(prev); invs.forEach(i => n.add(i.id)); return n; });
  };
  const applyBulkEdit = () => {
    if(selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const fields = {};
    if(bulkClasif) fields.clasificacion = bulkClasif;
    if(bulkEstatus) fields.estatus = bulkEstatus;
    setInvoices(prev => ({
      ...prev,
      [currency]: prev[currency].map(i => {
        if(!selectedIds.has(i.id)) return i;
        const upd = { ...i };
        if(bulkClasif) upd.clasificacion = bulkClasif;
        if(bulkEstatus) {
          upd.estatus = bulkEstatus;
          if(bulkEstatus === "Pagado") upd.montoPagado = +i.total;
        }
        return upd;
      })
    }));
    if(bulkEstatus === "Pagado") {
      ids.forEach(id => {
        const inv = invoices[currency].find(i=>i.id===id);
        if(inv) updateInvoiceField(id, { ...fields, montoPagado: +inv.total });
      });
    } else {
      bulkUpdateInvoices(ids, fields);
    }
    setSelectedIds(new Set());
    setBulkClasif(""); setBulkEstatus("");
  };

  // Bulk payment: add a payment record for each selected invoice
  const applyBulkPayment = async (tipo, montoMode, montoFijo, fecha, notas) => {
    if(selectedIds.size === 0 || !fecha) return;
    const ids = [...selectedIds];
    // Vamos recopilando los pagos realizados para luego verificar planes activos
    const pagosRealizados = []; // {invoiceId, monto, inv}
    for(const id of ids) {
      let monto = 0;
      let invRef = null;
      if(montoMode === "saldo") {
        // Pay each invoice's full remaining saldo
        let inv = null;
        ["MXN","USD","EUR"].forEach(c => { const f = invoices[c].find(i=>i.id===id); if(f) inv=f; });
        if(inv) {
          invRef = inv;
          const paid = realizedPayments(id).reduce((s,p)=>s+p.monto,0);
          monto = (+inv.total||0) - paid;
        }
      } else {
        monto = +montoFijo;
        // Encontrar la factura para tener datos del proveedor/folio
        ["MXN","USD","EUR"].forEach(c => { const f = invoices[c].find(i=>i.id===id); if(f) invRef=f; });
      }
      if(monto > 0) {
        await addPayment(id, monto, fecha, notas, tipo);
        if (tipo === 'realizado' && invRef) {
          pagosRealizados.push({ invoiceId: id, monto, inv: invRef });
        }
      }
    }
    setSelectedIds(new Set());
    setBulkPayModal(null);
    // Después de procesar todos, verificar planes activos (solo para pagos REALIZADOS)
    if (tipo === 'realizado' && pagosRealizados.length > 0) {
      try {
        const cola = [];
        for (const pago of pagosRealizados) {
          const planesActivos = await buscarPlanesActivosDeFactura(pago.invoiceId, empresaId);
          if (planesActivos && planesActivos.length > 0) {
            cola.push({
              planes: planesActivos,
              montoPago: pago.monto,
              fechaPago: fecha,
              invoiceId: pago.invoiceId,
              proveedor: pago.inv.proveedor || '',
              folio: pago.inv.folio || '',
              moneda: pago.inv.moneda || 'MXN',
            });
          }
        }
        // Si hay matches: abrir el primer modal y dejar el resto en cola
        if (cola.length > 0) {
          const [primero, ...resto] = cola;
          setPlanMatchModal(primero);
          setPlanMatchQueue(resto);
        }
      } catch (err) {
        console.error('Verificando planes activos en bulk:', err);
      }
    }
  };

  /* ── Grouped (supports dual grouping) ────────────────────────────────── */
  const getGroupKey = (inv, field) => {
    if(field==="proveedor") return inv.proveedor;
    if(field==="clasificacion") return inv.clasificacion;
    if(field==="estatus") return inv.estatus;
    if(field==="mes") return inv.fecha?.slice(0,7);
    if(field==="grupo") return suppliers.find(s=>s.nombre===inv.proveedor)?.grupo || "Sin Grupo";
    return "—";
  };

  // List of unique grupos for filter
  const gruposList = useMemo(() => {
    const s = new Set(suppliers.map(s=>s.grupo).filter(Boolean));
    return [...s].sort();
  }, [suppliers]);

  const grouped = useMemo(() => {
    // Returns { "GroupKey": { invoices?: [...], subgroups?: { "SubKey": [...] } } }
    const result = {};
    filtered.forEach(inv => {
      const k1 = getGroupKey(inv, grupoPor) || "—";
      if(!result[k1]) result[k1] = grupo2 ? { subgroups:{} } : { invoices:[] };
      if(grupo2) {
        const k2 = getGroupKey(inv, grupo2) || "—";
        if(!result[k1].subgroups[k2]) result[k1].subgroups[k2] = [];
        result[k1].subgroups[k2].push(inv);
      } else {
        result[k1].invoices.push(inv);
      }
    });
    return result;
  }, [filtered, grupoPor, grupo2]);

  /* ── CRUD (local + Supabase) ────────────────────────────────────── */
  const saveInvoice = async (data) => {
    const newCur = data.moneda || currency;
    const iva = +(data.iva ?? (+data.subtotal*0.16).toFixed(2));
    const total = +(+data.subtotal + iva - +data.retIsr - +data.retIva).toFixed(2);
    const diasCred = data.diasCredito || (suppliers.find(s=>s.nombre===data.proveedor)?.diasCredito||30);
    const venc = addDays(data.fecha, diasCred);
    const montoPagado = +(data.montoPagado||0);
    let estatus = data.estatus;
    if(montoPagado>=total && total>0) estatus="Pagado";
    else if(montoPagado>0 && montoPagado<total) estatus="Parcial";
    const updated = { ...data, iva, total, montoPagado, diasCredito:diasCred, vencimiento:venc, estatus, diasFicticios:+(data.diasFicticios||0), fechaProgramacion:data.fechaProgramacion||"", concepto:data.concepto||"", moneda:newCur, id:data.id||uid(), empresaId };
    const saved = await upsertInvoice(updated);
    setInvoices(prev => {
      const result = { ...prev };
      ["MXN","USD","EUR"].forEach(c => {
        result[c] = (result[c]||[]).filter(i => i.id !== updated.id && i.id !== saved.id);
      });
      result[newCur] = [...(result[newCur]||[]), saved];
      return result;
    });
    setModalInv(null);
  };

  /* ── Egresos No Facturados ─────────────────────────────────────── */
  // Generar folio interno NF-001, NF-002...
  const generarFolioEgreso = () => {
    const todos = ['MXN','USD','EUR'].flatMap(c => invoices[c] || [])
      .filter(i => i.tipo === 'EgresoNF' && i.empresaId === empresaId);
    const numeros = todos.map(i => {
      const m = (i.folio || '').match(/^NF-(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    });
    const max = numeros.length > 0 ? Math.max(...numeros) : 0;
    return `NF-${String(max + 1).padStart(3, '0')}`;
  };

  const saveEgreso = async (data) => {
    const monedaFinal = data.moneda || currency;
    const total = +(parseFloat(data.total) || 0);
    if (total <= 0) { alert('El monto debe ser mayor a 0'); return; }
    const folio = data.folio || generarFolioEgreso();
    const ya = !!data._yaPagado;
    // Construir factura virtual (tipo='EgresoNF')
    const invObj = {
      id: data.id || uid(),
      tipo: 'EgresoNF',
      fecha: data.fecha || today(),
      serie: 'NF',
      folio,
      uuid: '',
      proveedor: data.concepto || data.categoriaEgreso || 'Egreso',
      clasificacion: data.categoriaEgreso || 'Otro',
      subtotal: total, iva: 0, retIsr: 0, retIva: 0,
      total,
      montoPagado: ya ? total : 0,
      concepto: data.concepto || '',
      diasCredito: 0,
      vencimiento: data.fecha || today(),
      estatus: ya ? 'Pagado' : 'Pendiente',
      fechaProgramacion: data.fechaProgramacion || data.fecha || today(),
      diasFicticios: 0,
      referencia: '',
      notas: data.notas || '',
      moneda: monedaFinal,
      voBo: true,
      autorizadoDireccion: true,
      empresaId,
      categoriaEgreso: data.categoriaEgreso || 'Otro',
      segmentoEgreso: data.segmentoEgreso || '',
    };
    const saved = await upsertInvoice(invObj);
    // Guardar en estado
    setInvoices(prev => {
      const result = { ...prev };
      ['MXN','USD','EUR'].forEach(c => {
        result[c] = (result[c]||[]).filter(i => i.id !== invObj.id && i.id !== saved.id);
      });
      result[monedaFinal] = [...(result[monedaFinal]||[]), saved];
      return result;
    });
    // Si se marcó "ya pagado": crear pago realizado en la fecha que indicó
    if (ya) {
      await addPayment(saved.id, total, data.fechaProgramacion || data.fecha || today(),
                       data.notas || 'Egreso no facturado', 'realizado', data.metodoPago || 'banco');
    } else {
      // Programar pago en fecha indicada (igual que se programan facturas)
      await addPayment(saved.id, total, data.fechaProgramacion || data.fecha || today(),
                       data.notas || 'Egreso programado', 'programado', data.metodoPago || 'banco');
    }
    setModalEgreso(null);
  };

  const confirmDelete = () => {
    if(!deleteConfirm) return;
    setInvoices(prev => ({ ...prev, [deleteConfirm.cur]: prev[deleteConfirm.cur].filter(i=>i.id!==deleteConfirm.id) }));
    deleteInvoiceDB(deleteConfirm.id);
    setDeleteConfirm(null);
  };

  const deleteInvoice = (id, cur) => {
    setInvoices(prev => ({ ...prev, [cur]: prev[cur].filter(i=>i.id!==id) }));
    deleteInvoiceDB(id);
  };

  const updateEstatus = (id, estatus) => {
    let mp;
    setInvoices(prev => ({ ...prev, [currency]: prev[currency].map(i => {
      if(i.id!==id) return i;
      const upd = { ...i, estatus };
      if(estatus==="Pagado") { upd.montoPagado = +i.total; mp = +i.total; }
      return upd;
    }) }));
    const fields = { estatus };
    if(estatus==="Pagado") fields.montoPagado = mp;
    setTimeout(() => updateInvoiceField(id, fields), 0);
  };

  const updateConcepto = (id, concepto) => {
    setInvoices(prev => ({ ...prev, [currency]: prev[currency].map(i => i.id===id ? { ...i, concepto } : i) }));
    updateInvoiceField(id, { concepto });
  };

  const saveSupplier = async (data) => {
    const dataWithEmpresa = { ...data, empresaId };
    const isNew = !data.id;
    if(isNew) {
      const { id, ...rest } = dataWithEmpresa;
      const saved = await upsertSupplier({ ...rest, id: 'new' });
      setSuppliers(prev => [...prev, saved]);
    } else {
      const saved = await upsertSupplier(dataWithEmpresa);
      setSuppliers(prev => prev.map(s => s.id === data.id ? saved : s));
    }
    setModalSup(null);
  };

  /* ── Import ──────────────────────────────────────────────────────────── */
  // Clean numeric values: remove $, commas, spaces
  const cleanNum = v => {
    if(v===null||v===undefined||v==="") return 0;
    if(typeof v==="number") return v;
    return +(String(v).replace(/[$€,\s]/g,""))||0;
  };

  const handleImport = e => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(ev.target.result,{type:"array"});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws,{header:1});
        let hi = rows.findIndex(r=>r.some(c=>String(c).toUpperCase().includes("UUID")));
        if(hi<0) hi=0;
        const headers = rows[hi].map(h=>String(h||"").trim().toUpperCase());
        const dataRows = rows.slice(hi+1).filter(r=>r.some(c=>c));
        const get = (row,keys,exclude=[]) => {
          for(const k of keys){
            const idx=headers.findIndex(h => {
              if(!h.includes(k)) return false;
              for(const ex of exclude){ if(h.includes(ex)) return false; }
              return true;
            });
            if(idx>=0&&row[idx]!==undefined) return row[idx];
          }
          return "";
        };

        // Build lookup of existing invoices for duplicate detection
        const existingKeys = new Set();
        [...invoices.MXN,...invoices.USD,...invoices.EUR].forEach(inv => {
          if(inv.uuid && inv.uuid.length > 8) existingKeys.add("uuid:" + inv.uuid.trim().toLowerCase());
          const sfp = (inv.serie||"") + (inv.folio||"") + ":" + (inv.proveedor||"");
          if(sfp.length > 2) existingKeys.add("sfp:" + sfp.trim().toLowerCase());
        });

        let added=0; let newSuppliers=0;
        const ni={MXN:[],USD:[],EUR:[]};
        const duplicated = [];
        const newSups = [];

        dataRows.forEach(row => {
          const fecha=parseExcelDate(get(row,["FECHA"]));
          const proveedor=String(get(row,["PROVEEDOR","RAZON SOCIAL","NOMBRE","EMISOR"])||"").trim();
          const subtotal=cleanNum(get(row,["SUBTOTAL"]));
          const iva=cleanNum(get(row,["IVA"],["RETIVA","RET IVA","RET. IVA"]));
          const rawTotal=cleanNum(get(row,["TOTAL"],["SUBTOTAL","SUB TOTAL","SUB-TOTAL"]));
          const total = rawTotal > 0 ? rawTotal : (subtotal + (iva || subtotal*0.16));
          const ivaFinal = iva > 0 ? iva : +(subtotal*0.16).toFixed(2);
          const serie = String(get(row,["SERIE"])||"");
          const folio = String(get(row,["FOLIO"])||"");
          const rawUuid = String(get(row,["UUID"])||"");

          // Check for duplicates by UUID or serie+folio+proveedor
          const uuidKey = rawUuid.length > 8 ? "uuid:" + rawUuid.trim().toLowerCase() : "";
          const sfpKey = "sfp:" + (serie + folio + ":" + proveedor).trim().toLowerCase();
          const isDupe = (uuidKey && existingKeys.has(uuidKey)) || (sfpKey.length > 6 && existingKeys.has(sfpKey));

          if(isDupe) {
            duplicated.push({ serie, folio, proveedor, total, fecha });
            return;
          }

          // Mark to avoid intra-file duplicates
          if(uuidKey) existingKeys.add(uuidKey);
          if(sfpKey.length > 6) existingKeys.add(sfpKey);

          let sup = suppliers.find(s=>s.nombre.toUpperCase()===proveedor.toUpperCase());
          if(!sup) sup = newSups.find(s=>s.nombre.toUpperCase()===proveedor.toUpperCase());
          if(!sup && proveedor) {
            const newSup = {
              id:uid(), nombre:proveedor, rfc:"", moneda:"MXN", diasCredito:30,
              contacto:"", telefono:"", email:"", banco:"", clabe:"",
              clasificacion:"Otros", activo:true,
            };
            newSups.push(newSup);
            sup = newSup;
            newSuppliers++;
          }

          const monedaRaw=String(get(row,["MONEDA","CURRENCY","MON"])||"").trim().toUpperCase();
          const moneda = (monedaRaw==="USD"||monedaRaw==="DOLAR"||monedaRaw==="DOLARES"||monedaRaw==="DOLLAR"||monedaRaw==="US DOLLAR") ? "USD"
            : (monedaRaw==="EUR"||monedaRaw==="EURO"||monedaRaw==="EUROS") ? "EUR"
            : "MXN";
          const diasCredito=sup?.diasCredito||30;
          const inv = {
            id:uid(), tipo:String(get(row,["TIPO"])||"Factura"), fecha,
            serie, folio, uuid:rawUuid||uid(), proveedor:proveedor||"SIN PROVEEDOR",
            clasificacion:sup?.clasificacion||"Otros",
            subtotal, iva:ivaFinal, retIsr:0, retIva:0, total, montoPagado:0, concepto:"",
            diasCredito, vencimiento:addDays(fecha,diasCredito), estatus:"Pendiente",
            fechaProgramacion:"", diasFicticios:0, referencia:"", notas:"", moneda,
            empresaId,
          };
          if(ni[moneda]){ni[moneda].push(inv);added++;}
        });

        if(newSups.length>0) {
          setSuppliers(prev=>[...prev,...newSups]);
          upsertManySuppliers(newSups);
        }

        if(added > 0) {
          const allNew = [...ni.MXN,...ni.USD,...ni.EUR];
          // Save to Supabase and then reload from DB to get correct UUIDs
          upsertManyInvoices(allNew).then(() => {
            fetchInvoices(empresaId).then(inv => setInvoices(inv));
          });
          // Optimistic local update
          setInvoices(prev=>({MXN:[...prev.MXN,...ni.MXN],USD:[...prev.USD,...ni.USD],EUR:[...prev.EUR,...ni.EUR]}));
        }

        let msg = "";
        if(added > 0) msg += "✅ Se importaron " + added + " factura" + (added!==1?"s":"") + " nueva" + (added!==1?"s":"") + ".";
        if(newSuppliers>0) msg += " Se registraron " + newSuppliers + " proveedor" + (newSuppliers!==1?"es":"") + " nuevo" + (newSuppliers!==1?"s":"") + ".";
        if(duplicated.length > 0) msg += (msg?" ":"") + "⚠️ " + duplicated.length + " factura" + (duplicated.length!==1?"s":"") + " duplicada" + (duplicated.length!==1?"s":"") + " NO se cargaron:";
        if(added === 0 && duplicated.length === 0) msg = "⚠️ No se encontraron facturas válidas en el archivo.";
        setImportMsg(msg);
        setImportDupes(duplicated);
      } catch(err){ setImportMsg("❌ Error: "+err.message); setImportDupes([]); }
    };
    reader.readAsArrayBuffer(file); e.target.value="";
  };

  /* ── Projection matrix (uses payments, fallback to fechaProgramacion/vencimiento) */
  const projMatrix = useMemo(() => {
    const allInvs = [...invoices.MXN.map(i=>({...i,moneda:"MXN"})),...invoices.USD.map(i=>({...i,moneda:"USD"})),...invoices.EUR.map(i=>({...i,moneda:"EUR"}))].filter(i=>i.estatus!=="Pagado");
    const matrix = {}; const provSet = new Set(); const allDatesSet = new Set();

    allInvs.forEach(inv => {
      const totalSaldo = (+inv.total||0)-(+inv.montoPagado||0);
      if(totalSaldo<=0) return;

      // Get scheduled (programado) payments for this invoice — these go in Proyección
      const invPayments = payments.filter(p => p.invoiceId === inv.id && p.fechaPago && p.tipo === 'programado');
      const scheduledTotal = invPayments.reduce((s,p)=>s+p.monto,0);
      const unscheduledSaldo = totalSaldo - scheduledTotal;

      // Add each scheduled payment as a separate entry
      invPayments.forEach(pay => {
        const payDate = pay.fechaPago;
        if(projFrom && payDate<projFrom) return;
        if(projTo && payDate>projTo) return;
        if(projSearch) {
          const q = projSearch.toLowerCase();
          const match = inv.proveedor.toLowerCase().includes(q) || (inv.serie+inv.folio).toLowerCase().includes(q) || String(inv.total).includes(q) || (inv.concepto||"").toLowerCase().includes(q) || inv.clasificacion.toLowerCase().includes(q);
          if(!match) return;
        }
        allDatesSet.add(payDate);
        provSet.add(inv.proveedor);
        if(!matrix[inv.proveedor]) matrix[inv.proveedor]={};
        if(!matrix[inv.proveedor][payDate]) matrix[inv.proveedor][payDate]={total:0,invoices:[],byCur:{MXN:0,USD:0,EUR:0}};
        matrix[inv.proveedor][payDate].total += pay.monto;
        matrix[inv.proveedor][payDate].byCur[inv.moneda] = (matrix[inv.proveedor][payDate].byCur[inv.moneda]||0) + pay.monto;
        matrix[inv.proveedor][payDate].invoices.push({...inv,saldo:pay.monto,paymentNote:pay.notas});
      });

      // If there's unscheduled saldo, use fechaProgramacion or vencimiento as fallback
      if(unscheduledSaldo > 0) {
        const payDate = inv.fechaProgramacion || inv.vencimiento || "";
        if(!payDate) return;
        if(projFrom && payDate<projFrom) return;
        if(projTo && payDate>projTo) return;
        if(projSearch) {
          const q = projSearch.toLowerCase();
          const match = inv.proveedor.toLowerCase().includes(q) || (inv.serie+inv.folio).toLowerCase().includes(q) || String(inv.total).includes(q) || (inv.concepto||"").toLowerCase().includes(q) || inv.clasificacion.toLowerCase().includes(q);
          if(!match) return;
        }
        allDatesSet.add(payDate);
        provSet.add(inv.proveedor);
        if(!matrix[inv.proveedor]) matrix[inv.proveedor]={};
        if(!matrix[inv.proveedor][payDate]) matrix[inv.proveedor][payDate]={total:0,invoices:[],byCur:{MXN:0,USD:0,EUR:0}};
        matrix[inv.proveedor][payDate].total += unscheduledSaldo;
        matrix[inv.proveedor][payDate].byCur[inv.moneda] = (matrix[inv.proveedor][payDate].byCur[inv.moneda]||0) + unscheduledSaldo;
        matrix[inv.proveedor][payDate].invoices.push({...inv,saldo:unscheduledSaldo});
      }
    });
    let dates;
    if(projFrom && projTo) {
      dates = getDatesInRange(projFrom, projTo);
    } else {
      dates = [...allDatesSet].sort();
    }
    return { providers:[...provSet].sort(), dates, matrix };
  }, [invoices,payments,projFrom,projTo,projSearch]);

  /* ── Nav item ────────────────────────────────────────────────────────── */
  const NavItem = ({id,icon,label}) => (
    <button onClick={()=>setView(id)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 16px",borderRadius:10,border:"none",cursor:"pointer",background:view===id?"#E8F0FE":"transparent",color:view===id?C.blue:C.text,fontWeight:view===id?700:500,fontSize:14}}>
      <span style={{fontSize:18}}>{icon}</span> {label}
    </button>
  );

  /* ── Invoice table row ───────────────────────────────────────────────── */
  const InvoiceRow = ({inv, idx}) => {
    const [editingConcepto, setEditingConcepto] = useState(false);
    const [tempConcepto, setTempConcepto] = useState(inv.concepto||"");
    const [editingClasif, setEditingClasif] = useState(false);
    const [editingProgPago, setEditingProgPago] = useState(false);
    const overdue = isOverdue(inv.vencimiento, inv.estatus);
    const days = daysUntil(inv.vencimiento);
    const pagado = +(inv.montoPagado||0);
    const saldo = (+inv.total||0) - pagado;
    const isDupe = dupeFolioSet.has(inv.id);

    return (
      <tr style={{background:selectedIds.has(inv.id)?"#E8F0FE":overdue?"#FFF5F5":idx%2===0?C.surface:"#FAFBFC",borderTop:`1px solid ${C.border}`}}>
        {/* Checkbox for bulk selection */}
        <td style={{padding:"10px 4px",textAlign:"center",width:32}}>
          <input type="checkbox" checked={selectedIds.has(inv.id)} onChange={()=>toggleSelect(inv.id)} style={{cursor:"pointer",width:16,height:16,accentColor:C.blue}}/>
        </td>
        <td style={{padding:"11px 8px",fontSize:14}}>{inv.tipo}</td>
        <td style={{padding:"11px 8px",whiteSpace:"nowrap",fontSize:14}}>{inv.fecha}</td>
        {/* Folio — red if duplicate; badge NF si es Egreso No Facturado */}
        <td style={{padding:"11px 8px",background:isDupe?"#FFEBEE":(inv.tipo==='EgresoNF'?"#FFF8F8":"transparent"),color:isDupe?C.danger:C.text,fontWeight:isDupe?700:600,fontSize:14,borderLeft:isDupe?`3px solid ${C.danger}`:(inv.tipo==='EgresoNF'?"3px solid #C62828":"none")}}>
          {inv.tipo === 'EgresoNF' && (
            <span title="Otro Pago (sin factura)" style={{display:'inline-block',background:'#C62828',color:'#fff',padding:'1px 6px',borderRadius:4,fontSize:9,fontWeight:800,marginRight:6,verticalAlign:'middle'}}>NF</span>
          )}
          {inv.serie}{inv.folio}
          {isDupe && <span style={{fontSize:11,marginLeft:4}} title="Folio duplicado">⚠️</span>}
        </td>
        <td style={{padding:"11px 8px",fontWeight:700,fontSize:14,maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inv.proveedor}</td>
        {/* Concepto — editable inline */}
        <td style={{padding:"11px 8px",minWidth:120,maxWidth:180}} onClick={()=>{if(!esConsulta&&!editingConcepto){setEditingConcepto(true);setTempConcepto(inv.concepto||"");}}}>
          {editingConcepto ? (
            <input autoFocus value={tempConcepto} onChange={e=>setTempConcepto(e.target.value)}
              onBlur={()=>{updateConcepto(inv.id,tempConcepto);setEditingConcepto(false);}}
              onKeyDown={e=>{if(e.key==="Enter"){updateConcepto(inv.id,tempConcepto);setEditingConcepto(false);}if(e.key==="Escape")setEditingConcepto(false);}}
              style={{...inputStyle,padding:"4px 8px",fontSize:13,width:"100%"}} />
          ) : (
            <span style={{cursor:"pointer",color:inv.concepto?C.text:C.muted,fontSize:13,fontStyle:inv.concepto?"normal":"italic",display:"block",minHeight:20,padding:"4px 0",borderBottom:`1px dashed ${C.border}`}}>
              {inv.concepto || (esConsulta ? "—" : "Clic para agregar…")}
            </span>
          )}
        </td>
        {/* Clasificación — editable inline with dropdown */}
        <td style={{padding:"11px 8px",minWidth:100}} onClick={()=>{if(!editingClasif) setEditingClasif(true);}}>
          {editingClasif ? (
            <select autoFocus value={inv.clasificacion} onChange={e=>{updateClasificacion(inv.id,e.target.value);setEditingClasif(false);}}
              onBlur={()=>setEditingClasif(false)}
              style={{...selectStyle,padding:"4px 6px",fontSize:13,width:"100%"}}>
              {clases.map(c=><option key={c}>{c}</option>)}
            </select>
          ) : (
            <span style={{background:"#EEF2FF",color:C.blue,padding:"2px 8px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",display:"inline-block",borderBottom:`1px dashed ${C.blue}44`}}>{inv.clasificacion}</span>
          )}
        </td>
        <td style={{padding:"11px 8px",fontWeight:700,fontSize:15}}>${fmt(inv.total)}</td>
        <td style={{padding:"11px 8px",fontWeight:600,fontSize:15,color:pagado>0?C.ok:C.muted}}>${fmt(pagado)}</td>
        <td style={{padding:"11px 8px",fontWeight:700,fontSize:15,color:saldo>0?(overdue?C.danger:C.warn):C.ok}}>${fmt(saldo)}</td>
        {/* Pago/Programación — informativo desde tabla payments */}
        <td style={{padding:"11px 8px",whiteSpace:"nowrap",fontSize:12}}>
          {(()=>{
            const invPays = paymentsFor(inv.id);
            const lastRealized = invPays.filter(p=>p.tipo==='realizado').sort((a,b)=>b.fechaPago.localeCompare(a.fechaPago))[0];
            const nextScheduled = invPays.filter(p=>p.tipo==='programado').sort((a,b)=>a.fechaPago.localeCompare(b.fechaPago))[0];
            if(lastRealized && inv.estatus==='Pagado') return <span style={{color:C.ok,fontWeight:600}} title={`Pagado: $${fmt(lastRealized.monto)}`}>✅ {lastRealized.fechaPago}</span>;
            if(nextScheduled && lastRealized) return <div><div style={{color:C.ok,fontWeight:600}} title={`Último pago: $${fmt(lastRealized.monto)}`}>💰 {lastRealized.fechaPago}</div><div style={{color:"#F57F17",fontWeight:600}} title={`Programado: $${fmt(nextScheduled.monto)}`}>📅 {nextScheduled.fechaPago}</div></div>;
            if(nextScheduled) return <span style={{color:"#F57F17",fontWeight:600}} title={`Programado: $${fmt(nextScheduled.monto)}`}>📅 {nextScheduled.fechaPago}</span>;
            if(lastRealized) return <span style={{color:C.ok,fontWeight:600}} title={`Pagado: $${fmt(lastRealized.monto)}`}>💰 {lastRealized.fechaPago}</span>;
            return <span style={{color:C.muted}}>—</span>;
          })()}
        </td>
        <td style={{padding:"11px 8px",whiteSpace:"nowrap",fontSize:14,color:overdue?C.danger:C.text}}>{inv.vencimiento||"—"}</td>
        <td style={{padding:"11px 8px",whiteSpace:"nowrap"}}>
          {inv.estatus === "Pagado" || days===null ? <span style={{color:C.muted}}>—</span> : days >= 0 ? (
            <span style={{
              background: days<=7?"#FFF3E0":days<=30?"#FFFDE7":"#E8F5E9",
              color: days<=7?C.warn:days<=30?"#F57F17":C.ok,
              fontWeight:700, fontSize:13, padding:"3px 9px", borderRadius:20, whiteSpace:"nowrap"
            }}>{days}d</span>
          ) : (
            <span style={{
              background: Math.abs(days)<=7?"#FFF5F5":Math.abs(days)<=15?"#FFEBEE":Math.abs(days)<=30?"#FFCDD2":Math.abs(days)<=60?"#EF9A9A":"#E57373",
              color: Math.abs(days)<=7?"#E57373":Math.abs(days)<=15?C.danger:Math.abs(days)<=30?"#C62828":Math.abs(days)<=60?"#B71C1C":"#7F0000",
              fontWeight:800, fontSize:13, padding:"3px 9px", borderRadius:20, whiteSpace:"nowrap"
            }}>{Math.abs(days)}d venc.</span>
          )}
        </td>
        <td style={{padding:"11px 8px"}}>
          <select value={inv.estatus} onChange={e=>!esConsulta&&updateEstatus(inv.id,e.target.value)} disabled={esConsulta}
            style={{padding:"4px 9px",borderRadius:20,border:`2px solid ${statusColor(inv.estatus)}`,background:`${statusColor(inv.estatus)}22`,color:statusColor(inv.estatus),fontWeight:700,fontSize:13,cursor:"pointer"}}>
            {["Pendiente","Pagado","Vencido","Parcial"].map(s=><option key={s}>{s}</option>)}
          </select>
        </td>
        {/* Visto Bueno — toggle with click */}
        <td style={{padding:"10px 8px",textAlign:"center"}}>
          <button onClick={e=>{e.preventDefault();e.stopPropagation();if(!esConsulta)toggleVoBo(inv.id);}} style={{background:"none",border:"none",cursor:esConsulta?"default":"pointer",fontSize:18,padding:2,lineHeight:1,outline:"none",opacity:esConsulta?0.5:1}} title={inv.voBo?"Quitar VoBo":"Dar VoBo"} tabIndex={-1}>
            {inv.voBo ? "✅" : "⬜"}
          </button>
        </td>
        {/* Autorizado Dirección */}
        <td style={{padding:"10px 8px",textAlign:"center"}}>
          <button onClick={e=>{e.preventDefault();e.stopPropagation();if(!esConsulta)toggleAutorizadoDireccion(inv.id);}} style={{background:"none",border:"none",cursor:esConsulta?"default":"pointer",fontSize:18,padding:2,lineHeight:1,outline:"none",opacity:esConsulta?0.5:1}} title={inv.autorizadoDireccion?"Quitar Aut.Dir.":"Autorizar Dir."} tabIndex={-1}>
            {inv.autorizadoDireccion ? "✅" : "⬜"}
          </button>
        </td>
        <td style={{padding:"10px 8px",whiteSpace:"nowrap"}}>
          {!esConsulta && <button onClick={e=>{e.stopPropagation();setPayModal({invoiceId:inv.id,proveedor:inv.proveedor,folio:`${inv.serie}${inv.folio}`,total:inv.total,moneda:inv.moneda||currency});}} style={{...iconBtn,color:C.ok}} title="Pagos">💰</button>}
          {!esConsulta && <button onClick={e=>{e.stopPropagation();setVincularModal({invoiceId:inv.id,proveedor:inv.proveedor,folio:`${inv.serie}${inv.folio}`,total:inv.total,moneda:inv.moneda||currency});}} style={{...iconBtn,color:C.teal}} title="Vincular a Ingreso CxC">🔗</button>}
          <button onClick={()=>setModalInv({...inv,moneda:inv.moneda||currency})} style={{...iconBtn,color:C.sky}} title="Editar" hidden={esConsulta}>✏️</button>
          <button onClick={()=>setDeleteConfirm({id:inv.id,cur:currency,label:`${inv.serie}${inv.folio} - ${inv.proveedor}`})} style={{...iconBtn,color:C.danger}} title="Eliminar">🗑️</button>
        </td>
      </tr>
    );
  };

  /* ── Invoice table with dual scrollbar ─────────────────────────────── */
  const InvoiceTable = ({invs}) => {
    const topScrollRef = useRef(null);
    const bottomScrollRef = useRef(null);
    const syncingRef = useRef(false);
    const onTopScroll = () => { if(syncingRef.current) return; syncingRef.current=true; if(bottomScrollRef.current) bottomScrollRef.current.scrollLeft=topScrollRef.current.scrollLeft; syncingRef.current=false; };
    const onBottomScroll = () => { if(syncingRef.current) return; syncingRef.current=true; if(topScrollRef.current) topScrollRef.current.scrollLeft=bottomScrollRef.current.scrollLeft; syncingRef.current=false; };
    const allChecked = invs.length > 0 && invs.every(i => selectedIds.has(i.id));
    return (
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12}}>
        {/* Top scrollbar */}
        <div ref={topScrollRef} onScroll={onTopScroll} style={{overflowX:"auto",overflowY:"hidden",height:14}}>
          <div style={{width:1300,height:1}}/>
        </div>
        {/* Table */}
        <div ref={bottomScrollRef} onScroll={onBottomScroll} style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:1300}}>
            <thead>
              <tr style={{background:"#F8FAFC"}}>
                <th style={{padding:"10px 4px",textAlign:"center",width:32}}>
                  <input type="checkbox" checked={allChecked} onChange={()=>toggleSelectAll(invs)} style={{cursor:"pointer",width:16,height:16,accentColor:C.blue}}/>
                </th>
                {[
                  {h:"Tipo",col:"tipo"},{h:"Fecha",col:"fecha"},{h:"Folio",col:"folio"},{h:"Proveedor",col:"proveedor"},
                  {h:"Concepto",col:"concepto"},{h:"Clasif.",col:"clasificacion"},{h:"Total",col:"total"},{h:"Pagado",col:"montoPagado"},
                  {h:"Saldo Total",col:"saldo"},{h:"Pago/Prog.",col:""},{h:"Vence",col:"vencimiento"},{h:"Días",col:"dias"},
                  {h:"Estatus",col:"estatus"},{h:"VoBo",col:""},{h:"Aut.Dir.",col:""},{h:"Acciones",col:""}
                ].map(({h,col})=>(
                  <th key={h} onClick={col?()=>{if(sortCol===col) setSortDir(d=>d==="asc"?"desc":"asc"); else {setSortCol(col);setSortDir("asc");}}:undefined}
                    style={{padding:"10px 8px",textAlign:"left",color:C.muted,fontWeight:600,fontSize:11,textTransform:"uppercase",letterSpacing:.3,whiteSpace:"nowrap",cursor:col?"pointer":"default",userSelect:"none"}}>
                    {h}{sortCol===col ? (sortDir==="asc"?" ▲":" ▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invs.map((inv,idx)=> <InvoiceRow key={inv.id} inv={inv} idx={idx} />)}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const GroupHeader = ({label,invs}) => {
    const total = invs.reduce((s,i)=>s+(+i.total||0),0);
    const saldo = invs.reduce((s,i)=>s+((+i.total||0)-(+i.montoPagado||0)),0);
    return (
      <div style={{display:"flex",justifyContent:"space-between",padding:"8px 14px",background:"#EEF2FF",borderRadius:10,marginBottom:6}}>
        <span style={{fontWeight:700,color:C.navy,fontSize:14}}>{label||"—"}</span>
        <span style={{fontSize:13,color:C.muted}}>{invs.length} fact. · Total: ${fmt(total)} · Saldo: ${fmt(saldo)} {currency}</span>
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════════════════
     VIEWS
     ═══════════════════════════════════════════════════════════════════════ */

  /* ── DASHBOARD ──────────────────────────────────────────────────────── */
  const renderDashboard = () => {
    // Excluimos los Egresos No Facturados del dashboard, métricas y gráficas
    const allInvs = [...invoices.MXN.map(i=>({...i,moneda:"MXN"})),...invoices.USD.map(i=>({...i,moneda:"USD"})),...invoices.EUR.map(i=>({...i,moneda:"EUR"}))]
      .filter(i => i.tipo !== 'EgresoNF');
    const pendAll = allInvs.filter(i=>i.estatus!=="Pagado"&&((+i.total||0)-(+i.montoPagado||0))>0);
    const saldoOf = i => (+i.total||0)-(+i.montoPagado||0);
    const daysOf = i => daysUntil(i.vencimiento);
    const pendByCur = cur => pendAll.filter(i=>i.moneda===cur);
    const sumSaldo = arr => arr.reduce((s,i)=>s+saldoOf(i),0);

    const openDetailGrouped = (title, items) => {
      setDashSearch(""); setDashFilterProv(""); setDashFilterClasif(""); setDashFilterEstatus(""); setDashGroupBy(""); setDashSelectedIds(new Set()); setDashBulkAutDir("");
      setDashDetail({title, type:"invoices", items, grouped:true});
    };

    // Aging buckets
    const corriente   = pendAll.filter(i=>{ const d=daysOf(i); return d===null||d>=0; });
    const vencido7    = pendAll.filter(i=>{ const d=daysOf(i); return d!==null&&d<0&&d>=-7; });
    const vencido15   = pendAll.filter(i=>{ const d=daysOf(i); return d!==null&&d<-7&&d>=-15; });
    const vencido30   = pendAll.filter(i=>{ const d=daysOf(i); return d!==null&&d<-15&&d>=-30; });
    const vencido60   = pendAll.filter(i=>{ const d=daysOf(i); return d!==null&&d<-30&&d>=-60; });
    const vencidoMas60= pendAll.filter(i=>{ const d=daysOf(i); return d!==null&&d<-60; });

    // Semáforo
    const totalPend = sumSaldo(pendAll);
    const totalVenc = sumSaldo(pendAll.filter(i=>isOverdue(i.vencimiento,i.estatus)));
    const pctVenc = totalPend>0?(totalVenc/totalPend)*100:0;
    const saludColor = pctVenc<20?"#2E7D32":pctVenc<50?"#F57F17":"#C62828";
    const saludBg    = pctVenc<20?"#E8F5E9":pctVenc<50?"#FFF8E1":"#FFEBEE";
    const saludIcon  = pctVenc<20?"🟢":pctVenc<50?"🟡":"🔴";
    const saludLabel = pctVenc<20?"Saludable":pctVenc<50?"Moderado":"Atención";

    // CxP por Clasificación — por moneda
    const clasifByCur = (cur) => Object.entries(
      pendAll.filter(i=>i.moneda===cur).reduce((acc,i)=>{ const c=i.clasificacion||"Sin clasificar"; acc[c]=(acc[c]||{sum:0,items:[]}); acc[c].sum+=saldoOf(i); acc[c].items.push(i); return acc; },{})
    ).sort((a,b)=>b[1].sum-a[1].sum);
    const clasifDataMXN = clasifByCur("MXN");
    const clasifDataUSD = clasifByCur("USD");
    const clasifColors = ["#4527A0","#6A1B9A","#7B1FA2","#8E24AA","#AB47BC","#BA68C8","#CE93D8","#9575CD","#5E35B1","#7E57C2"];

    // Por Mes × Clasificación — usa dashMesMoneda
    const MESES_ORDER = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const MESES_PREV_YEAR = ["Noviembre","Diciembre"]; // si hay meses de año actual, estos son del año anterior
    const pendMesMoneda = pendAll.filter(i=>i.moneda===dashMesMoneda);
    const mesClasiMap = {};
    const sinMesItems = []; // facturas sin mes detectable en concepto
    pendMesMoneda.forEach(i=>{
      const mes = detectarMesCxP(i.concepto);
      if(!mes) { sinMesItems.push(i); return; }
      const clas = i.clasificacion||"Sin clasificar";
      if(!mesClasiMap[mes]) mesClasiMap[mes]={};
      if(!mesClasiMap[mes][clas]) mesClasiMap[mes][clas]={sum:0,items:[]};
      mesClasiMap[mes][clas].sum+=saldoOf(i);
      mesClasiMap[mes][clas].items.push(i);
    });
    const mesesRaw = MESES_ORDER.filter(m=>mesClasiMap[m]);
    // If we have "current year" months (Jan-Oct) AND "prev year" months (Nov-Dec), reorder
    const hayMesesActuales = mesesRaw.some(m=>!MESES_PREV_YEAR.includes(m));
    const mesesPresentes = hayMesesActuales
      ? [...mesesRaw.filter(m=>MESES_PREV_YEAR.includes(m)), ...mesesRaw.filter(m=>!MESES_PREV_YEAR.includes(m))]
      : mesesRaw;
    const clasifPresentes = [...new Set(pendMesMoneda.filter(i=>detectarMesCxP(i.concepto)).map(i=>i.clasificacion||"Sin clasificar"))];

    return (
      <div>
        {/* ── Header + Semáforo ── */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
          <div>
            <h1 style={{fontSize:24,fontWeight:800,color:C.navy,margin:0}}>Dashboard General</h1>
            <p style={{color:C.muted,marginTop:4,fontSize:14}}>Haz clic en cualquier tarjeta para ver el detalle</p>
          </div>
          <div style={{background:saludBg,border:`2px solid ${saludColor}`,borderRadius:14,padding:"12px 20px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:24}}>{saludIcon}</span>
            <div>
              <div style={{fontWeight:800,fontSize:15,color:saludColor}}>Salud: {saludLabel}</div>
              <div style={{fontSize:12,color:saludColor,opacity:.8}}>{pctVenc.toFixed(1)}% del saldo vencido</div>
            </div>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:24}}>
          <KpiCard label="Saldo MXN" value={`$${fmt(kpis.totalMXN)}`} sub="Pendiente de pago" color={C.mxn} icon="🇲🇽" onClick={()=>openDetailGrouped("Saldo Pendiente MXN",pendByCur("MXN"))}/>
          <KpiCard label="Saldo USD" value={`$${fmt(kpis.totalUSD)}`} sub="Pendiente de pago" color={C.usd} icon="🇺🇸" onClick={()=>openDetailGrouped("Saldo Pendiente USD",pendByCur("USD"))}/>
          <KpiCard label="Saldo EUR" value={`€${fmt(kpis.totalEUR)}`} sub="Pendiente de pago" color={C.eur} icon="🇪🇺" onClick={()=>openDetailGrouped("Saldo Pendiente EUR",pendByCur("EUR"))}/>
          <KpiCard label="Facturas Vencidas" value={kpis.vencidas} sub="Requieren atención" color={C.danger} icon="⚠️" onClick={()=>openDetailGrouped("Facturas Vencidas",pendAll.filter(i=>isOverdue(i.vencimiento,i.estatus)))}/>
          <KpiCard label="Total Facturas" value={kpis.facturas} color={C.sky} icon="🧾" onClick={()=>openDetailGrouped("Todas las Facturas",allInvs)}/>
          <KpiCard label="Proveedores" value={kpis.proveedores} sub="Activos" color={C.teal} icon="🏢" onClick={()=>{setDashSearch("");setDashFilterProv("");setDashFilterClasif("");setDashFilterEstatus("");setDashGroupBy("");setDashDetail({title:"Proveedores Activos",type:"suppliers",items:suppliers.filter(s=>s.activo)});}}/>
        </div>

        {/* ── Antigüedad de Saldos ── */}
        <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:18,padding:24,marginBottom:24,boxShadow:"0 2px 12px rgba(0,0,0,.05)"}}>
          <h2 style={{fontSize:17,fontWeight:800,color:C.navy,marginBottom:20,margin:"0 0 20px",display:"flex",alignItems:"center",gap:8}}>
            📊 Antigüedad de Saldos
          </h2>
          {["MXN","USD","EUR"].map(cur=>{
            const curItems = pendAll.filter(i=>i.moneda===cur);
            if(!curItems.length) return null;
            const sym = cur==="EUR"?"€":"$";
            const flag = {MXN:"🇲🇽",USD:"🇺🇸",EUR:"🇪🇺"}[cur];
            const curColor = {MXN:C.mxn,USD:C.usd,EUR:C.eur}[cur];
            const filterCur = arr=>arr.filter(i=>i.moneda===cur);
            const totalCur = sumSaldo(curItems);
            const agingChips = [
              {l:"Corriente",         v:sumSaldo(filterCur(corriente)),    c:"#1B5E20", bg:"#E8F5E9", border:"#81C784", items:filterCur(corriente)},
              {l:"Vencido 1-7 Días",  v:sumSaldo(filterCur(vencido7)),    c:"#BF360C", bg:"#FFF3E0", border:"#FFB74D", items:filterCur(vencido7)},
              {l:"Vencido 8-15 Días", v:sumSaldo(filterCur(vencido15)),   c:"#7F0000", bg:"#FFCCBC", border:"#FF7043", items:filterCur(vencido15)},
              {l:"Vencido 16-30 Días",v:sumSaldo(filterCur(vencido30)),   c:"#7F0000", bg:"#FFCDD2", border:"#EF9A9A", items:filterCur(vencido30)},
              {l:"Vencido 31-60 Días",v:sumSaldo(filterCur(vencido60)),   c:"#4A0000", bg:"#EF9A9A", border:"#E57373", items:filterCur(vencido60)},
              {l:"Vencido +60 Días",  v:sumSaldo(filterCur(vencidoMas60)),c:"#fff",    bg:"#C62828", border:"#B71C1C", items:filterCur(vencidoMas60)},
            ].filter(ch=>ch.v>0);
            return(
              <div key={cur} style={{marginBottom:cur!=="EUR"?20:0}}>
                {/* Moneda header */}
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                  <span style={{fontSize:18}}>{flag}</span>
                  <span style={{fontSize:16,fontWeight:900,color:curColor}}>{cur}</span>
                  <span style={{fontSize:13,color:C.muted}}>· Saldo total: {sym}{fmt(totalCur)} · {curItems.length} facturas</span>
                  {/* Progress bar inline */}
                  <div style={{flex:1,height:8,borderRadius:4,background:"#EEF2FF",overflow:"hidden",maxWidth:300,marginLeft:8}}>
                    <div style={{height:"100%",width:`${totalCur>0?(sumSaldo(filterCur(corriente))/totalCur)*100:0}%`,background:"#43A047",borderRadius:4,transition:"width .5s"}}/>
                  </div>
                  <span style={{fontSize:11,color:C.muted}}>{totalCur>0?((sumSaldo(filterCur(corriente))/totalCur)*100).toFixed(0):0}% corriente</span>
                </div>
                {/* Chips grandes */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12}}>
                  {agingChips.map(ch=>(
                    <div key={ch.l} onClick={()=>openDetailGrouped(`${cur} — ${ch.l}`,ch.items)}
                      style={{background:ch.bg,border:`2px solid ${ch.border}`,borderRadius:16,padding:"18px 20px",cursor:"pointer",boxShadow:"0 2px 6px rgba(0,0,0,.06)"}}>
                      <div style={{fontSize:10,color:ch.c,fontWeight:700,textTransform:"uppercase",marginBottom:6,letterSpacing:.8,opacity:.9}}>{ch.l}</div>
                      <div style={{fontSize:22,fontWeight:900,color:ch.c,lineHeight:1}}>{sym}{fmt(ch.v)}</div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                        <span style={{fontSize:11,color:ch.c,fontWeight:600}}>{ch.items.length} fact.</span>
                        <span style={{fontSize:11,color:ch.c,fontWeight:600}}>{totalCur>0?((ch.v/totalCur)*100).toFixed(0):0}%</span>
                      </div>
                      <div style={{height:3,borderRadius:2,background:`${ch.border}50`,marginTop:8,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${totalCur>0?(ch.v/totalCur)*100:0}%`,background:ch.border,borderRadius:2}}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── CxP por Clasificación ── */}
        <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:18,padding:24,marginBottom:24,boxShadow:"0 2px 12px rgba(0,0,0,.05)"}}>
          <h2 style={{fontSize:17,fontWeight:800,color:C.navy,margin:"0 0 20px",display:"flex",alignItems:"center",gap:8}}>
            🗂️ Saldo por Clasificación
          </h2>
          {[{cur:"MXN",flag:"🇲🇽",data:clasifDataMXN,sym:"$"},{cur:"USD",flag:"🇺🇸",data:clasifDataUSD,sym:"$"}].map(({cur,flag,data,sym})=>{
            if(!data.length) return null;
            const maxVal = data[0]?.[1]?.sum||1;
            const totalCur = data.reduce((s,[,{sum}])=>s+sum,0);
            return(
              <div key={cur} style={{marginBottom:24}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,padding:"12px 16px",background:{MXN:"#F3E5F5",USD:"#E8F5E9"}[cur],borderRadius:12,border:`1px solid ${{MXN:"#CE93D8",USD:"#A5D6A7"}[cur]}`}}>
                  <span style={{fontSize:22}}>{flag}</span>
                  <span style={{fontSize:20,fontWeight:900,color:{MXN:"#6A1B9A",USD:"#2E7D32"}[cur]}}>{cur}</span>
                  <span style={{fontSize:14,color:{MXN:"#7B1FA2",USD:"#388E3C"}[cur],fontWeight:600}}>· Total: <b>{sym}{fmt(totalCur)}</b></span>
                  <span style={{marginLeft:4,fontSize:12,color:{MXN:"#9C27B0",USD:"#43A047"}[cur]}}>{data.length} clasificaciones</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {data.map(([clas,{sum,items}],idx)=>{
                    const pct = maxVal>0?(sum/maxVal)*100:0;
                    const pctTotal = totalCur>0?(sum/totalCur)*100:0;
                    const color = clasifColors[idx%clasifColors.length];
                    return(
                      <div key={clas} onClick={()=>openDetailGrouped(`${clas} (${cur})`,items)}
                        style={{cursor:"pointer",padding:"12px 16px",borderRadius:12,border:`1px solid ${C.border}`,background:"#FAFBFC",transition:"all .15s"}}
                        onMouseEnter={e=>{e.currentTarget.style.background="#F0F7FF";e.currentTarget.style.borderColor=color;e.currentTarget.style.transform="translateX(4px)";}}
                        onMouseLeave={e=>{e.currentTarget.style.background="#FAFBFC";e.currentTarget.style.borderColor=C.border;e.currentTarget.style.transform="translateX(0)";}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <div style={{width:12,height:12,borderRadius:3,background:color,flexShrink:0}}/>
                            <span style={{fontWeight:700,fontSize:15,color:C.navy}}>{clas}</span>
                            <span style={{fontSize:12,color:C.muted}}>{items.length} factura{items.length!==1?"s":""}</span>
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:12}}>
                            <span style={{fontSize:11,color:C.muted,background:"#EEF2FF",padding:"2px 8px",borderRadius:20,fontWeight:600}}>{pctTotal.toFixed(1)}% del total</span>
                            <span style={{fontWeight:900,fontSize:18,color}}>{sym}{fmt(sum)}</span>
                            <span style={{fontSize:11,background:{MXN:"#E3F2FD",USD:"#E8F5E9"}[cur],color:{MXN:"#1565C0",USD:"#2E7D32"}[cur],padding:"2px 8px",borderRadius:20,fontWeight:700}}>{flag} {cur}</span>
                          </div>
                        </div>
                        <div style={{height:10,borderRadius:6,background:"#EDE7F6",overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:6,transition:"width .6s ease"}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Por Mes × Clasificación ── */}
        {mesesPresentes.length>0 && (
          <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:18,padding:24,marginBottom:24,boxShadow:"0 2px 12px rgba(0,0,0,.05)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"0 0 20px"}}>
              <h2 style={{fontSize:17,fontWeight:800,color:C.navy,margin:0,display:"flex",alignItems:"center",gap:8}}>
                📅 Por Mes × Clasificación
              </h2>
              {/* Currency toggle */}
              <div style={{display:"flex",gap:4,background:"#F1F5F9",borderRadius:10,padding:3}}>
                {[{cur:"MXN",flag:"🇲🇽"},{cur:"USD",flag:"🇺🇸"}].map(({cur,flag})=>(
                  <button key={cur} onClick={()=>setDashMesMoneda(cur)}
                    style={{padding:"5px 14px",borderRadius:8,border:"none",background:dashMesMoneda===cur?"#fff":"transparent",color:dashMesMoneda===cur?{MXN:C.mxn,USD:C.usd}[cur]:C.muted,fontWeight:dashMesMoneda===cur?700:400,fontSize:13,cursor:"pointer",fontFamily:"inherit",boxShadow:dashMesMoneda===cur?"0 1px 4px rgba(0,0,0,.1)":"none",transition:"all .15s"}}>
                    {flag} {cur}
                  </button>
                ))}
              </div>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr style={{background:C.navy}}>
                    <th style={{padding:"16px 20px",textAlign:"left",color:"#fff",fontWeight:600,fontSize:13,textTransform:"uppercase",whiteSpace:"nowrap",minWidth:140,letterSpacing:.3}}>Mes</th>
                    {clasifPresentes.map((c,ci)=>(
                      <th key={c} style={{padding:"16px 16px",textAlign:"center",color:"#CBD5E1",fontWeight:600,fontSize:12,textTransform:"uppercase",whiteSpace:"nowrap",letterSpacing:.3}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                          <div style={{width:8,height:8,borderRadius:3,background:clasifColors[(dashMesMoneda==="MXN"?clasifDataMXN:clasifDataUSD).findIndex(([n])=>n===c)%clasifColors.length],flexShrink:0}}/>
                          {c}
                        </div>
                      </th>
                    ))}
                    {sinMesItems.length>0 && (
                      <th style={{padding:"16px 16px",textAlign:"center",color:"#CE93D8",fontWeight:600,fontSize:12,textTransform:"uppercase",whiteSpace:"nowrap",letterSpacing:.3,borderLeft:`1px solid #4A2060`}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                          <div style={{width:8,height:8,borderRadius:3,background:"#9C27B0",flexShrink:0}}/>
                          Sin mes en concepto
                        </div>
                      </th>
                    )}
                    <th style={{padding:"16px 16px",textAlign:"center",color:"#94A3B8",fontWeight:600,fontSize:12,whiteSpace:"nowrap",letterSpacing:.3}}>Total Mes</th>
                  </tr>
                  {/* Totals row */}
                  <tr style={{background:"#EDE7F6",borderBottom:`2px solid #B39DDB`}}>
                    <td style={{padding:"12px 20px",fontWeight:700,color:"#4527A0",fontSize:13}}>Total General</td>
                    {clasifPresentes.map(c=>{
                      const totalClasif = mesesPresentes.reduce((s,m)=>s+(mesClasiMap[m]?.[c]?.sum||0),0);
                      return <td key={c} style={{padding:"12px 16px",textAlign:"center",fontWeight:700,color:"#4527A0",fontSize:15}}>{totalClasif>0?`$${fmt(totalClasif)}`:""}</td>;
                    })}
                    {sinMesItems.length>0 && <td style={{padding:"12px 16px",textAlign:"center",fontWeight:700,color:"#7B1FA2",fontSize:15}}>${fmt(sinMesItems.reduce((s,i)=>s+saldoOf(i),0))}</td>}
                    <td style={{padding:"12px 16px",textAlign:"center",fontWeight:800,color:"#4527A0",fontSize:17,borderLeft:`1px solid #B39DDB`}}>
                      ${fmt(mesesPresentes.reduce((s,m)=>s+clasifPresentes.reduce((ss,c)=>ss+(mesClasiMap[m]?.[c]?.sum||0),0),0) + sinMesItems.reduce((s,i)=>s+saldoOf(i),0))}
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {mesesPresentes.map((mes,mi)=>{
                    const totalMes = clasifPresentes.reduce((s,c)=>s+(mesClasiMap[mes]?.[c]?.sum||0),0);
                    const esPrevYear = hayMesesActuales && MESES_PREV_YEAR.includes(mes);
                    const yearLabel = esPrevYear ? " '25" : hayMesesActuales ? " '26" : "";
                    return(
                      <tr key={mes} style={{borderTop:`1px solid ${C.border}`,background:mi%2===0?"#FAFBFF":"#fff"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#E8F0FE"}
                        onMouseLeave={e=>e.currentTarget.style.background=mi%2===0?"#FAFBFF":"#fff"}>
                        <td style={{padding:"14px 20px",fontWeight:700,color:C.navy,fontSize:15}}>
                          {mes}
                          {yearLabel && <span style={{fontSize:11,color:C.muted,marginLeft:4,fontWeight:400}}>{yearLabel}</span>}
                        </td>
                        {clasifPresentes.map(c=>{
                          const cell = mesClasiMap[mes]?.[c];
                          return(
                            <td key={c} style={{padding:"14px 16px",textAlign:"center"}}>
                              {cell && cell.sum>0 ? (
                                <span onClick={()=>openDetailGrouped(`${mes}${yearLabel} · ${c}`,cell.items)}
                                  style={{cursor:"pointer",display:"inline-block",textAlign:"center"}}>
                                  <div style={{fontWeight:800,fontSize:16,color:C.navy,borderBottom:`1px dotted ${C.blue}`}}>${fmt(cell.sum)}</div>
                                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>{cell.items.length} fact.</div>
                                </span>
                              ) : <span style={{color:"#E2E8F0",fontSize:14}}>—</span>}
                            </td>
                          );
                        })}
                        {sinMesItems.length>0 && <td style={{padding:"14px 16px",textAlign:"center",borderLeft:`1px solid ${C.border}`}}><span style={{color:"#E2E8F0",fontSize:14}}>—</span></td>}
                        <td style={{padding:"14px 16px",textAlign:"center",fontWeight:900,color:C.navy,fontSize:17,borderLeft:`2px solid ${C.border}`}}>
                          {totalMes>0?`$${fmt(totalMes)}`:"—"}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Fila: Sin mes en concepto */}
                  {sinMesItems.length>0 && (
                    <tr style={{borderTop:`2px solid #CE93D8`,background:"#F9F0FF"}}
                      onMouseEnter={e=>e.currentTarget.style.background="#EDE7F6"}
                      onMouseLeave={e=>e.currentTarget.style.background="#F9F0FF"}>
                      <td style={{padding:"14px 20px",fontWeight:700,color:"#7B1FA2",fontSize:14}}>
                        ⚠️ Sin mes en concepto
                        <div style={{fontSize:11,color:"#9C27B0",marginTop:2,fontWeight:400}}>No se detectó mes en el concepto</div>
                      </td>
                      {clasifPresentes.map(c=><td key={c} style={{padding:"14px 16px",textAlign:"center"}}><span style={{color:"#E2E8F0"}}>—</span></td>)}
                      <td style={{padding:"14px 16px",textAlign:"center",borderLeft:`1px solid #CE93D8`}}>
                        <span onClick={()=>openDetailGrouped("Sin mes en concepto",sinMesItems)}
                          style={{cursor:"pointer",display:"inline-block",textAlign:"center"}}>
                          <div style={{fontWeight:800,fontSize:16,color:"#7B1FA2",borderBottom:`1px dotted #9C27B0`}}>${fmt(sinMesItems.reduce((s,i)=>s+saldoOf(i),0))}</div>
                          <div style={{fontSize:11,color:"#9C27B0",marginTop:2}}>{sinMesItems.length} fact.</div>
                        </span>
                      </td>
                      <td style={{padding:"14px 16px",textAlign:"center",fontWeight:900,color:"#7B1FA2",fontSize:17,borderLeft:`2px solid #CE93D8`}}>
                        ${fmt(sinMesItems.reduce((s,i)=>s+saldoOf(i),0))}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ── CARTERA ────────────────────────────────────────────────────────── */
  const renderCartera = () => {
    const totalFiltered = filtered.reduce((s,i)=>s+(+i.total||0),0);
    const totalPendiente = filtered.filter(i=>i.estatus!=="Pagado").reduce((s,i)=>s+((+i.total||0)-(+i.montoPagado||0)),0);
    const groupOptions = ["proveedor","clasificacion","estatus","mes","grupo"];

    /* ── Tab styles ── */
    const tabBtn = (id, label, icon) => (
      <button key={id} onClick={()=>setCarteraTab(id)} style={{
        padding:"10px 22px", border:"none", borderBottom: carteraTab===id?`3px solid ${C.blue}`:"3px solid transparent",
        background:"transparent", color: carteraTab===id?C.blue:C.muted,
        fontWeight: carteraTab===id?800:500, fontSize:14, cursor:"pointer", fontFamily:"inherit",
        transition:"all .15s", whiteSpace:"nowrap",
      }}>{icon} {label}</button>
    );

    return (
      <div>
        {/* ── Financiamientos + Tarjetas de Crédito ── */}
        {(()=>{
          const activos = financiamientos.filter(f=>f.activo);
          const today = new Date(); today.setHours(0,0,0,0);
          const getPlazos = (f) => {
            const plazos = [];
            if (!f.fechaInicio || !f.fechaFin) return plazos;
            let d = new Date(f.fechaInicio+"T12:00:00");
            const fin = new Date(f.fechaFin+"T12:00:00");
            while (d <= fin) { plazos.push(d.toISOString().slice(0,10)); d = new Date(d.getFullYear(), d.getMonth()+1, d.getDate()); }
            return plazos;
          };
          const ChipFinanc = ({f}) => {
            const plazos = getPlazos(f);
            const pagosF = financiamientoPagos.filter(p=>p.financiamientoId===f.id);
            const pagosFechas = new Set(pagosF.map(p=>p.fechaPago));
            const totalPlazos = plazos.length;
            const pagados = plazos.filter(pl=>pagosFechas.has(pl)).length;
            const pendientes = totalPlazos - pagados;
            const saldo = f.montoMensual * pendientes;
            const pct = totalPlazos>0 ? Math.round((pagados/totalPlazos)*100) : 0;
            const proxPlazo = plazos.find(pl=>!pagosFechas.has(pl)&&new Date(pl+"T12:00:00")>=today);
            const vencidos = plazos.filter(pl=>!pagosFechas.has(pl)&&new Date(pl+"T12:00:00")<today).length;
            return (
              <div onClick={()=>setFinancModalId(f.id)}
                style={{background:"#fff",border:`2px solid ${vencidos>0?"#C62828":"#1565C0"}`,borderRadius:12,
                  padding:"14px 16px",cursor:"pointer",flex:"1 1 0",minWidth:0,
                  boxShadow:"0 2px 8px rgba(0,0,0,.08)",transition:"all .15s",position:"relative"}}
                onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 6px 16px rgba(0,0,0,.13)";}}
                onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.08)";}}>
                {vencidos>0&&<div style={{position:"absolute",top:8,right:8,background:"#FFEBEE",color:"#C62828",fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:20}}>⚠️ {vencidos}</div>}
                <div style={{fontWeight:900,fontSize:15,color:"#0F2D4A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3,paddingRight:vencidos>0?50:0}}>{f.nombre}</div>
                <div style={{fontSize:12,color:C.muted,marginBottom:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.concepto}</div>
                <div style={{fontSize:22,fontWeight:900,color:saldo>0?"#C62828":"#2E7D32",marginBottom:6}}>${fmt(saldo)}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                  <span style={{fontSize:13,color:C.muted,fontWeight:600}}>{pagados}/{totalPlazos} meses · ${fmt(f.montoMensual)}/mes</span>
                  <span style={{fontSize:13,fontWeight:800,color:"#1565C0"}}>{pct}%</span>
                </div>
                <div style={{height:7,borderRadius:4,background:"#EEF2FF",overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,background:pct>=100?"#2E7D32":"#1565C0",borderRadius:4,transition:"width .4s"}}/>
                </div>
                {proxPlazo&&<div style={{fontSize:12,color:"#1565C0",marginTop:7,fontWeight:700}}>📅 Próx. pago: {proxPlazo}</div>}
              </div>
            );
          };
          return (
            <div style={{display:"flex",gap:12,marginBottom:16,flexWrap:"wrap"}}>
              {/* Financiamientos */}
              <div style={{background:"#0F2D4A",borderRadius:12,overflow:"hidden",flex:"3 1 0",minWidth:0}}>
                <div onClick={()=>setFinancCollapsed(c=>!c)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 14px",cursor:"pointer",userSelect:"none"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:15}}>🏦</span>
                    <span style={{fontWeight:800,fontSize:12,color:"#fff",textTransform:"uppercase",letterSpacing:.5}}>Financiamientos</span>
                    {activos.length>0&&<span style={{background:"rgba(255,255,255,.15)",color:"rgba(255,255,255,.9)",fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:20}}>{activos.length} activo{activos.length!==1?"s":""}</span>}
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <div style={{display:"flex",gap:6,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
                      {activos.length===0&&<span style={{fontSize:11,color:"rgba(255,255,255,.4)"}}>Sin registros</span>}
                      <button onClick={()=>financImportRef.current?.click()}
                        style={{padding:"4px 10px",borderRadius:7,border:"1px solid rgba(255,255,255,.25)",background:"rgba(255,255,255,.1)",color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>
                        📥 Importar
                      </button>
                    </div>
                    <span style={{color:"rgba(255,255,255,.6)",fontSize:16,marginLeft:4,transition:"transform .2s",display:"inline-block",transform:financCollapsed?"rotate(-90deg)":"rotate(0deg)"}}>▼</span>
                  </div>
                </div>
                {!financCollapsed && activos.length>0&&(
                  <div style={{display:"flex",gap:8,padding:"8px 10px 12px",background:"#F0F4FF"}}>
                    {activos.map(f=><ChipFinanc key={f.id} f={f}/>)}
                  </div>
                )}
              </div>
              {/* Tarjetas de Crédito */}
              <div style={{background:"#1A0533",borderRadius:12,overflow:"hidden",flex:"1 1 0",minWidth:220}}>
                <div onClick={()=>setTarjetasCollapsed(c=>!c)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 14px",cursor:"pointer",userSelect:"none"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:15}}>💳</span>
                    <span style={{fontWeight:800,fontSize:12,color:"#fff",textTransform:"uppercase",letterSpacing:.5}}>Tarjetas de Crédito</span>
                    {tarjetas.filter(t=>t.activo).length>0&&<span style={{background:"rgba(255,255,255,.15)",color:"rgba(255,255,255,.9)",fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:20}}>{tarjetas.filter(t=>t.activo).length}</span>}
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <div style={{display:"flex",gap:6,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>tarjetaImportRef.current?.click()}
                        style={{padding:"4px 10px",borderRadius:7,border:"1px solid rgba(255,255,255,.25)",background:"rgba(255,255,255,.1)",color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>
                        📥 Importar CSV
                      </button>
                    </div>
                    <span style={{color:"rgba(255,255,255,.6)",fontSize:16,marginLeft:4,transition:"transform .2s",display:"inline-block",transform:tarjetasCollapsed?"rotate(-90deg)":"rotate(0deg)"}}>▼</span>
                  </div>
                </div>
                {!tarjetasCollapsed && (tarjetas.filter(t=>t.activo).length>0 ? (
                  <div style={{display:"flex",gap:8,padding:"8px 10px 12px",background:"#F5F0FF",flexWrap:"wrap"}}>
                    {tarjetas.filter(t=>t.activo).map(t=>{
                      const pct = t.limite>0 ? Math.round((t.saldoActual/t.limite)*100) : 0;
                      const disponible = t.limite - t.saldoActual;
                      const movT = tarjetaMovimientos.filter(m=>m.tarjetaId===t.id);
                      const now = new Date();
                      const mesPrefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
                      const cargosM = movT.filter(m=>m.monto>0&&m.tipo!=="PAGO"&&m.fecha?.startsWith(mesPrefix));
                      const totalCargosM = cargosM.reduce((s,m)=>s+m.monto,0);
                      return (
                        <div key={t.id} onClick={()=>setTarjetaModalId(t.id)}
                          style={{background:"#fff",border:"2px solid #7B1FA2",borderRadius:12,padding:"14px 16px",cursor:"pointer",flex:"1 1 0",minWidth:0,boxShadow:"0 2px 8px rgba(0,0,0,.08)",transition:"all .15s"}}
                          onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 6px 16px rgba(0,0,0,.13)";}}
                          onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,.08)";}}>
                        <div style={{fontWeight:900,fontSize:15,color:"#1A0533",marginBottom:1}}>{t.banco}</div>
                          <div style={{fontSize:12,color:"#7B1FA2",marginBottom:8,fontWeight:600}}>{t.titular}</div>
                          {editingSaldoId===t.id ? (
                            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4}} onClick={e=>e.stopPropagation()}>
                              <span style={{fontSize:15,fontWeight:700,color:"#C62828"}}>$</span>
                              <input autoFocus value={editingSaldoVal}
                                onChange={e=>setEditingSaldoVal(e.target.value)}
                                onKeyDown={async e=>{
                                  if(e.key==="Enter"){
                                    const nuevo=parseFloat(editingSaldoVal.replace(/,/g,""));
                                    if(!isNaN(nuevo)){await updateTarjetaSaldo(t.id,nuevo);setTarjetas(prev=>prev.map(x=>x.id===t.id?{...x,saldoActual:nuevo}:x));}
                                    setEditingSaldoId(null);
                                  }
                                  if(e.key==="Escape") setEditingSaldoId(null);
                                }}
                                onBlur={()=>setEditingSaldoId(null)}
                                placeholder={fmt(t.saldoActual)}
                                style={{width:"100%",fontSize:22,fontWeight:900,color:"#C62828",border:"none",borderBottom:"2px solid #7B1FA2",outline:"none",background:"transparent",fontFamily:"inherit"}}/>
                            </div>
                          ) : (
                            <div onClick={e=>{e.stopPropagation();setEditingSaldoId(t.id);setEditingSaldoVal(String(t.saldoActual));}}
                              style={{fontSize:22,fontWeight:900,color:"#C62828",marginBottom:6,cursor:"text",borderBottom:"1px dashed #EF9A9A",display:"inline-block"}}
                              title="Clic para editar saldo">
                              ${fmt(t.saldoActual)}
                            </div>
                          )}
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                            <span style={{fontSize:13,color:"#666"}}>Disponible: <b style={{color:"#2E7D32"}}>${fmt(disponible)}</b></span>
                            <span style={{fontSize:13,fontWeight:800,color:"#7B1FA2"}}>{pct}% usado</span>
                          </div>
                          <div style={{height:6,borderRadius:3,background:"#EDE7F6",overflow:"hidden"}}>
                            <div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:pct>80?"#C62828":pct>50?"#E65100":"#7B1FA2",borderRadius:3}}/>
                          </div>
                          {totalCargosM>0&&<div style={{fontSize:12,color:"#7B1FA2",marginTop:6,fontWeight:700}}>🛒 Este mes: ${fmt(totalCargosM)}</div>}
                          <div style={{fontSize:11,color:"#999",marginTop:4}}>Corte día {t.fechaCorte} · Contrato {t.contrato}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{padding:"12px 14px",background:"#F5F0FF",display:"flex",alignItems:"center",justifyContent:"center",minHeight:80}}>
                    <span style={{fontSize:12,color:"#9C27B0",fontWeight:600,opacity:.7}}>Importa un CSV de Konfio para comenzar</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Internal tabs: Activas / Pagadas / Resumen */}
        <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,marginBottom:12,background:C.surface,borderRadius:"12px 12px 0 0",paddingLeft:8}}>
          {tabBtn("activas","Activas","📋")}
          {tabBtn("pagadas","Pagadas","✅")}
          {tabBtn("resumen","Resumen","📊")}
        </div>

        {/* Monedas — debajo de los tabs */}
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          {["MXN","USD","EUR"].map(cur=>(
            <button key={cur} onClick={()=>setCurrency(cur)} style={{padding:"8px 24px",borderRadius:40,border:"2px solid",borderColor:currency===cur?{MXN:C.mxn,USD:C.usd,EUR:C.eur}[cur]:C.border,background:currency===cur?{MXN:C.mxn,USD:C.usd,EUR:C.eur}[cur]:C.surface,color:currency===cur?"#fff":C.text,fontWeight:700,cursor:"pointer",fontSize:14}}>
              {cur==="MXN"?"🇲🇽":cur==="USD"?"🇺🇸":"🇪🇺"} {cur}
              <span style={{marginLeft:8,fontSize:12,opacity:.8}}>({invoices[cur]?.length||0})</span>
            </button>
          ))}
        </div>

        {/* ── Input oculto para importar Excel de financiamientos ── */}
        <input ref={financImportRef} type="file" accept=".xlsx,.xls" style={{display:"none"}}
          onChange={async(e)=>{
            const file = e.target.files[0];
            if(!file) return;
            e.target.value="";
            try {
              const buf = await file.arrayBuffer();
              const wb = XLSX.read(buf, {type:"array", cellDates:true});
              const creditos = [];
              const MESES_MAP = {ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,oct:10,nov:11,dic:12};
              const parseFecha = (val) => {
                if (!val) return null;
                if (val instanceof Date && !isNaN(val)) return val.toISOString().slice(0,10);
                const s = String(val).trim().toLowerCase();
                let m;
                m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
                if (m) { const y=m[3].length===2?2000+parseInt(m[3]):parseInt(m[3]); return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
                m = s.match(/^(\d{1,2})[\/\-]([a-záéíóú]+)[\/\-](\d{2,4})$/);
                if (m) { const mes=MESES_MAP[m[2].slice(0,3)]; if(mes){const y=m[3].length===2?2000+parseInt(m[3]):parseInt(m[3]);return `${y}-${String(mes).padStart(2,'0')}-${m[1].padStart(2,'0')}`;} }
                return null;
              };
              const parseMonto = (val) => { if(!val&&val!==0) return null; const n=parseFloat(String(val).replace(/[$,\s]/g,"")); return isNaN(n)?null:n; };

              wb.SheetNames.forEach(sheetName => {
                const ws = wb.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:false, defval:""});
                if (!rows.length) return;
                const nombre = String(rows[0]?.[0]||"").trim() || sheetName;
                const concepto = String(rows[1]?.[0]||"").trim();
                const pagosPorFecha = {};
                rows.forEach(row => {
                  for (let c=0; c<row.length; c+=2) {
                    const fecha = parseFecha(row[c]);
                    const monto = parseMonto(row[c+1]);
                    if (fecha && monto && monto>0) pagosPorFecha[fecha]=(pagosPorFecha[fecha]||0)+monto;
                  }
                });
                const plazos = Object.entries(pagosPorFecha).sort((a,b)=>a[0].localeCompare(b[0]));
                if (!plazos.length) return;
                creditos.push({
                  nombre, concepto, moneda:"MXN",
                  montoMensual: plazos[0][1],
                  fechaInicio: plazos[0][0],
                  fechaFin: plazos[plazos.length-1][0],
                  diaPago: parseInt(plazos[0][0].slice(8,10)),
                  totalMeses: plazos.length,
                  sheetName,
                });
              });
              if (!creditos.length) { alert("No se encontraron créditos válidos en el Excel"); return; }
              setFinancImportPreview(creditos);
            } catch(err) { console.error(err); alert("Error al leer el Excel: "+err.message); }
          }}/>

        {/* ── Modal Preview Importación ── */}
        {financImportPreview && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
            onClick={()=>setFinancImportPreview(null)}>
            <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:800,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}
              onClick={e=>e.stopPropagation()}>
              <div style={{padding:"18px 24px",background:"#0F2D4A",borderRadius:"18px 18px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:800,fontSize:17,color:"#fff"}}>📥 Importar Financiamientos</div>
                  <div style={{fontSize:12,color:"#90CAF9",marginTop:2}}>{financImportPreview.length} crédito{financImportPreview.length!==1?"s":""} detectado{financImportPreview.length!==1?"s":""}</div>
                </div>
                <button onClick={()=>setFinancImportPreview(null)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,color:"#fff",width:34,height:34,cursor:"pointer",fontSize:18}}>×</button>
              </div>
              <div style={{overflowY:"auto",flex:1,padding:20}}>
                {financImportPreview.map((cr,i)=>(
                  <div key={i} style={{background:"#F8FAFC",border:`1px solid ${C.border}`,borderRadius:14,padding:18,marginBottom:12}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                      <div>
                        <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Nombre (editable)</div>
                        <input defaultValue={cr.nombre} onChange={e=>{const p=[...financImportPreview];p[i]={...p[i],nombre:e.target.value};setFinancImportPreview(p);}}
                          style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
                      </div>
                      <div>
                        <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Concepto (editable)</div>
                        <input defaultValue={cr.concepto} onChange={e=>{const p=[...financImportPreview];p[i]={...p[i],concepto:e.target.value};setFinancImportPreview(p);}}
                          style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:16,marginTop:14,flexWrap:"wrap"}}>
                      {[
                        {l:"Mensualidad",  v:`$${fmt(cr.montoMensual)}`},
                        {l:"Total meses",  v:cr.totalMeses},
                        {l:"Inicio",       v:cr.fechaInicio},
                        {l:"Fin",          v:cr.fechaFin},
                        {l:"Día de pago",  v:`Día ${cr.diaPago}`},
                        {l:"Monto total",  v:`$${fmt(cr.montoMensual*cr.totalMeses)}`},
                      ].map(k=>(
                        <div key={k.l} style={{background:"#fff",borderRadius:10,padding:"8px 14px",border:`1px solid ${C.border}`}}>
                          <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase"}}>{k.l}</div>
                          <div style={{fontSize:14,fontWeight:800,color:C.navy,marginTop:2}}>{k.v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{padding:"14px 24px",borderTop:`1px solid ${C.border}`,display:"flex",gap:10,justifyContent:"flex-end",background:"#F8FAFC",borderRadius:"0 0 18px 18px"}}>
                <button onClick={()=>setFinancImportPreview(null)}
                  style={{padding:"9px 20px",borderRadius:10,border:`1px solid ${C.border}`,background:"#fff",color:C.text,cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:600}}>
                  Cancelar
                </button>
                <button disabled={financImportando} onClick={async()=>{
                  setFinancImportando(true);
                  for (const cr of financImportPreview) {
                    const nuevo = await insertFinanciamiento({...cr, empresaId});
                    if (nuevo) setFinanciamientos(prev=>[...prev, nuevo]);
                  }
                  setFinancImportPreview(null);
                  setFinancImportando(false);
                }} style={{padding:"9px 24px",borderRadius:10,border:"none",background:financImportando?"#90CAF9":"#0F2D4A",color:"#fff",cursor:financImportando?"wait":"pointer",fontSize:13,fontFamily:"inherit",fontWeight:700}}>
                  {financImportando?"Guardando…":"✅ Confirmar e importar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Financiamiento Detail Modal ── */}
        {financModalId && (()=>{
          const f = financiamientos.find(x=>x.id===financModalId);
          if (!f) return null;
          const today2 = new Date(); today2.setHours(0,0,0,0);
          const sym = "$";
          const getPlazos2 = (fin) => {
            const plazos = [];
            if (!fin.fechaInicio || !fin.fechaFin) return plazos;
            let d = new Date(fin.fechaInicio+"T12:00:00");
            const fe = new Date(fin.fechaFin+"T12:00:00");
            while (d <= fe) { plazos.push(d.toISOString().slice(0,10)); d = new Date(d.getFullYear(), d.getMonth()+1, d.getDate()); }
            return plazos;
          };
          const plazos = getPlazos2(f);
          const pagosF = financiamientoPagos.filter(p=>p.financiamientoId===f.id);
          const pagosFechas = new Set(pagosF.map(p=>p.fechaPago));
          const totalPlazos = plazos.length;
          const pagados = plazos.filter(pl=>pagosFechas.has(pl)).length;
          const pendientes = totalPlazos - pagados;
          const totalPagado = pagosF.reduce((s,p)=>s+p.monto,0);
          const montoTotal = f.montoMensual * totalPlazos;
          const saldo = f.montoMensual * pendientes;
          const pct = totalPlazos>0 ? Math.round((pagados/totalPlazos)*100) : 0;
          const proxPlazo = plazos.find(pl=>!pagosFechas.has(pl)&&new Date(pl+"T12:00:00")>=today2);
          const vencidos = plazos.filter(pl=>!pagosFechas.has(pl)&&new Date(pl+"T12:00:00")<today2);
          const MESES_N = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
          const togglePago = async(fecha) => {
            if (pagosFechas.has(fecha)) {
              const pago = pagosF.find(p=>p.fechaPago===fecha);
              if (pago) { await deleteFinanciamientoPago(pago.id); setFinanciamientoPagos(prev=>prev.filter(p=>p.id!==pago.id)); }
            } else {
              const nuevo = await insertFinanciamientoPago({financiamientoId:f.id,fechaPago:fecha,monto:f.montoMensual,notas:""});
              if (nuevo) setFinanciamientoPagos(prev=>[...prev,nuevo]);
            }
          };
          return (
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:10}}
              onClick={()=>setFinancModalId(null)}>
              <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:"95vw",maxHeight:"94vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}
                onClick={e=>e.stopPropagation()}>
                <div style={{padding:"20px 28px",background:"#0F2D4A",borderRadius:"20px 20px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:11,color:"#90CAF9",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>🏦 Financiamiento · MXN</div>
                    <div style={{fontWeight:900,fontSize:20,color:"#fff"}}>{f.nombre}</div>
                    <div style={{fontSize:13,color:"rgba(255,255,255,.65)",marginTop:2}}>{f.concepto}</div>
                  </div>
                  <button onClick={()=>setFinancModalId(null)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:10,color:"#fff",width:38,height:38,cursor:"pointer",fontSize:22}}>×</button>
                </div>
                <div style={{padding:"14px 28px",background:"#F8FAFC",borderBottom:`1px solid ${C.border}`,display:"flex",gap:10,flexWrap:"wrap"}}>
                  {[
                    {icon:"💰",l:"Monto Total",      v:`${sym}${fmt(montoTotal)}`,    c:"#0F2D4A"},
                    {icon:"✅",l:"Total Pagado",      v:`${sym}${fmt(totalPagado)}`,   c:"#1B5E20"},
                    {icon:"⏳",l:"Saldo Restante",    v:`${sym}${fmt(saldo)}`,         c:saldo>0?"#C62828":"#1B5E20"},
                    {icon:"📅",l:"Meses Pagados",     v:`${pagados} de ${totalPlazos}`,c:"#1565C0"},
                    {icon:"💵",l:"Mensualidad",       v:`${sym}${fmt(f.montoMensual)}`,c:"#0F2D4A"},
                    {icon:"📆",l:"Próximo Pago",      v:proxPlazo||"—",               c:proxPlazo?"#1565C0":C.muted},
                    {icon:"🏁",l:"Liquidación",       v:f.fechaFin||"—",             c:"#4A0000"},
                    ...(vencidos.length>0?[{icon:"⚠️",l:"Vencidos sin pagar",v:`${vencidos.length} pago${vencidos.length!==1?"s":""}`,c:"#C62828"}]:[]),
                  ].map(k=>(
                    <div key={k.l} style={{background:"#fff",borderRadius:12,padding:"10px 16px",border:`1px solid ${C.border}`,flex:"1 1 130px",minWidth:130}}>
                      <div style={{fontSize:10,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:.4,marginBottom:3}}>{k.icon} {k.l}</div>
                      <div style={{fontSize:14,fontWeight:900,color:k.c}}>{k.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{padding:"10px 28px",background:"#F8FAFC",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:12,color:C.muted,fontWeight:600}}>
                    <span>{pct}% liquidado</span><span>{pendientes} meses restantes</span>
                  </div>
                  <div style={{height:8,borderRadius:4,background:"#EEF2FF",overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:pct>=100?"#2E7D32":"#1565C0",borderRadius:4,transition:"width .5s"}}/>
                  </div>
                </div>
                <div style={{overflowY:"auto",flex:1,padding:"20px 28px"}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.navy,marginBottom:14}}>📋 Calendario de pagos — clic para marcar como pagado/pendiente</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:8}}>
                    {plazos.map((pl,idx)=>{
                      const fechaD = new Date(pl+"T12:00:00");
                      const isPagado = pagosFechas.has(pl);
                      const isVencido = !isPagado && fechaD < today2;
                      const isProximo = pl === proxPlazo;
                      const mes = MESES_N[fechaD.getMonth()];
                      const anio = fechaD.getFullYear();
                      const bg = isPagado?"#E8F5E9":isVencido?"#FFEBEE":isProximo?"#E3F2FD":"#F8FAFC";
                      const border = isPagado?"#A5D6A7":isVencido?"#EF9A9A":isProximo?"#90CAF9":"#E2E8F0";
                      const color = isPagado?"#1B5E20":isVencido?"#C62828":isProximo?"#1565C0":C.muted;
                      return (
                        <div key={pl} onClick={()=>togglePago(pl)}
                          style={{background:bg,border:`1.5px solid ${border}`,borderRadius:10,padding:"10px 14px",cursor:"pointer",transition:"all .1s"}}
                          onMouseEnter={e=>e.currentTarget.style.opacity=".8"}
                          onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                            <span style={{fontSize:11,fontWeight:700,color,textTransform:"uppercase"}}>{mes} {anio}</span>
                            <span style={{fontSize:16}}>{isPagado?"✅":isVencido?"🔴":isProximo?"🔵":"⏳"}</span>
                          </div>
                          <div style={{fontSize:13,fontWeight:800,color}}>{sym}{fmt(f.montoMensual)}</div>
                          <div style={{fontSize:10,color,marginTop:2,opacity:.8}}>{isPagado?"Pagado":isVencido?"Vencido":isProximo?"Próximo":"Pendiente"} · #{idx+1}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Tarjeta Import Preview Modal ── */}
        {tarjetaImportPreview && (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:10}}
            onClick={()=>setTarjetaImportPreview(null)}>
            <div style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:"95vw",maxHeight:"94vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}
              onClick={e=>e.stopPropagation()}>
              <div style={{padding:"18px 24px",background:"#1A0533",borderRadius:"18px 18px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:800,fontSize:17,color:"#fff"}}>💳 Importar Movimientos — {tarjetaImportPreview.fileName}</div>
                  <div style={{fontSize:12,color:"#CE93D8",marginTop:2}}>{tarjetaImportPreview.movs.length} movimientos detectados</div>
                </div>
                <button onClick={()=>setTarjetaImportPreview(null)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,color:"#fff",width:34,height:34,cursor:"pointer",fontSize:18}}>×</button>
              </div>
              {/* KPI preview */}
              <div style={{padding:"14px 24px",background:"#F5F0FF",borderBottom:"1px solid #E1BEE7",display:"flex",gap:12,flexWrap:"wrap"}}>
                {[
                  {l:"Total movimientos", v:tarjetaImportPreview.movs.length, c:"#1A0533"},
                  {l:"Cargos/Compras",    v:tarjetaImportPreview.cargos.length, c:"#C62828"},
                  {l:"Total cargos",      v:`$${fmt(tarjetaImportPreview.cargos.reduce((s,m)=>s+m.monto,0))}`, c:"#C62828"},
                  {l:"Pagos",            v:tarjetaImportPreview.pagos.length, c:"#1B5E20"},
                  {l:"Total pagos",      v:`$${fmt(Math.abs(tarjetaImportPreview.pagos.reduce((s,m)=>s+m.monto,0)))}`, c:"#1B5E20"},
                ].map(k=>(
                  <div key={k.l} style={{background:"#fff",borderRadius:10,padding:"8px 14px",border:"1px solid #E1BEE7",flex:"1 1 120px"}}>
                    <div style={{fontSize:10,color:"#7B1FA2",fontWeight:700,textTransform:"uppercase"}}>{k.l}</div>
                    <div style={{fontSize:16,fontWeight:900,color:k.c,marginTop:2}}>{k.v}</div>
                  </div>
                ))}
              </div>
              {/* Preview table */}
              <div style={{overflowY:"auto",flex:1}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead style={{position:"sticky",top:0}}>
                    <tr style={{background:"#1A0533"}}>
                      {["Fecha","Descripción","Integrante","Tipo","Monto"].map(h=>(
                        <th key={h} style={{padding:"9px 12px",textAlign:h==="Monto"?"right":"left",color:"rgba(255,255,255,.85)",fontWeight:700,fontSize:11,textTransform:"uppercase"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tarjetaImportPreview.movs.slice(0,50).map((m,i)=>(
                      <tr key={i} style={{borderTop:"1px solid #F3E5F5",background:i%2===0?"#fff":"#FDF7FF"}}>
                        <td style={{padding:"8px 12px",color:"#666",whiteSpace:"nowrap"}}>{m.fecha}</td>
                        <td style={{padding:"8px 12px",maxWidth:260,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.descripcion}</td>
                        <td style={{padding:"8px 12px",color:"#7B1FA2",fontWeight:600}}>{m.integrante||"—"}</td>
                        <td style={{padding:"8px 12px"}}>
                          <span style={{background:m.tipo==="PAGO"?"#E8F5E9":m.tipo==="TRANSFERENCIA"?"#E3F2FD":"#FFF3E0",
                            color:m.tipo==="PAGO"?"#1B5E20":m.tipo==="TRANSFERENCIA"?"#1565C0":"#E65100",
                            fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20}}>{m.tipo}</span>
                        </td>
                        <td style={{padding:"8px 12px",textAlign:"right",fontWeight:700,color:m.monto<0?"#1B5E20":"#C62828"}}>{m.monto<0?"-":""}${fmt(Math.abs(m.monto))}</td>
                      </tr>
                    ))}
                    {tarjetaImportPreview.movs.length>50&&(
                      <tr><td colSpan={5} style={{padding:"10px",textAlign:"center",color:"#7B1FA2",fontStyle:"italic"}}>
                        ... y {tarjetaImportPreview.movs.length-50} movimientos más
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{padding:"14px 24px",borderTop:"1px solid #E1BEE7",display:"flex",gap:10,justifyContent:"flex-end",background:"#F5F0FF",borderRadius:"0 0 18px 18px"}}>
                <button onClick={()=>setTarjetaImportPreview(null)}
                  style={{padding:"9px 20px",borderRadius:10,border:"1px solid #E1BEE7",background:"#fff",color:"#333",cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:600}}>
                  Cancelar
                </button>
                <button disabled={tarjetaImportando} onClick={async()=>{
                  setTarjetaImportando(true);
                  const {inserted, dupes} = await bulkInsertMovimientos(tarjetaImportPreview.movs);
                  const nuevos = await fetchTarjetaMovimientos(empresaId);
                  setTarjetaMovimientos(nuevos);
                  setTarjetaImportPreview(null);
                  setTarjetaImportando(false);
                  alert(`✅ ${inserted} nuevos movimientos importados · ${dupes||0} duplicados ignorados`);
                }} style={{padding:"9px 24px",borderRadius:10,border:"none",background:tarjetaImportando?"#CE93D8":"#7B1FA2",color:"#fff",cursor:tarjetaImportando?"wait":"pointer",fontSize:13,fontFamily:"inherit",fontWeight:700}}>
                  {tarjetaImportando?"Importando…":"✅ Confirmar e importar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Tarjeta Detail Modal ── */}
        {tarjetaModalId && (()=>{
          const t = tarjetas.find(x=>x.id===tarjetaModalId);
          if (!t) return null;
          const movT = tarjetaMovimientos.filter(m=>m.tarjetaId===t.id);
          const progsT = programados.filter(p=>p.tarjetaId===t.id);
          const integrantes = [...new Set(movT.map(m=>m.integrante).filter(Boolean))].sort();
          const MESES_N = ["Enero","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
          const CATS = ["Seguros","Servicios","Gasolina","Hospedaje","Alimentación","Transporte","Software","Otros"];

          const filtrados = movT.filter(m=>{
            if(tarjetaFiltroInt && m.integrante!==tarjetaFiltroInt) return false;
            if(tarjetaFiltroTipo && m.tipo!==tarjetaFiltroTipo) return false;
            if(tarjetaFiltroMes && !m.fecha?.startsWith(tarjetaFiltroMes)) return false;
            return true;
          });
          const mesesDisp = [...new Set(movT.map(m=>m.fecha?.slice(0,7)).filter(Boolean))].sort().reverse();
          const cargosF = filtrados.filter(m=>m.monto>0&&m.tipo!=="PAGO");
          const pagosF  = filtrados.filter(m=>m.monto<0||m.tipo==="PAGO");
          const totalCargos = cargosF.reduce((s,m)=>s+m.monto,0);
          const totalPagos  = Math.abs(pagosF.reduce((s,m)=>s+m.monto,0));
          const pct = t.limite>0?Math.round((t.saldoActual/t.limite)*100):0;
          const porInt = {};
          cargosF.forEach(m=>{ const k=m.integrante||"Sin asignar"; porInt[k]=(porInt[k]||0)+m.monto; });
          const intSorted = Object.entries(porInt).sort((a,b)=>b[1]-a[1]);

          /* ── Calendario helpers ── */
          const [calY, calM] = calMes.split("-").map(Number);
          const diasEnMes = new Date(calY, calM, 0).getDate();
          const primerDia = new Date(calY, calM-1, 1).getDay(); // 0=Dom
          const inicioSemana = (primerDia+6)%7; // Lunes=0

          const movPorDia = {}; // "YYYY-MM-DD" → [movs]
          movT.filter(m=>m.fecha?.startsWith(calMes)).forEach(m=>{
            movPorDia[m.fecha] = [...(movPorDia[m.fecha]||[]), m];
          });
          const progPorDia = {}; // "YYYY-MM-DD" → [progs]
          progsT.filter(p=>p.fecha?.startsWith(calMes)).forEach(p=>{
            progPorDia[p.fecha] = [...(progPorDia[p.fecha]||[]), p];
          });

          const cerrar = () => {
            setTarjetaModalId(null);
            setTarjetaFiltroInt(""); setTarjetaFiltroTipo(""); setTarjetaFiltroMes("");
            setCalDiaSeleccionado(null); setFormProg(null); setEditSaldoModal(false);
            setResumenFiltroInt(""); setResumenFiltroTipo(""); setResumenFiltroMes("");
          };

          return (
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:10}}
              onClick={cerrar}>
              <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:"98vw",maxHeight:"96vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}
                onClick={e=>e.stopPropagation()}>

                {/* ── HEADER ── */}
                <div style={{padding:"16px 28px",background:"#1A0533",borderRadius:"20px 20px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:11,color:"#CE93D8",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>💳 Tarjeta de Crédito</div>
                    <div style={{fontWeight:900,fontSize:20,color:"#fff",marginTop:2}}>{t.banco} · {t.titular}</div>
                    <div style={{fontSize:12,color:"rgba(255,255,255,.5)",marginTop:1}}>Contrato {t.contrato} · Corte día {t.fechaCorte}</div>
                  </div>
                  <button onClick={cerrar} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:10,color:"#fff",width:38,height:38,cursor:"pointer",fontSize:22}}>×</button>
                </div>

                {/* ── 4 KPIs ── */}
                <div style={{padding:"16px 24px",background:"#F5F0FF",borderBottom:"1px solid #E1BEE7",display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
                  {[
                    {l:"💳 Límite",       v:`$${fmt(t.limite)}`,              c:"#1A0533"},
                    {l:"🔴 Saldo Actual",  v:`$${fmt(t.saldoActual)}`,         c:"#C62828"},
                    {l:"✅ Disponible",    v:`$${fmt(t.limite-t.saldoActual)}`, c:"#1B5E20"},
                    {l:`📊 ${pct}% usado`, v:<div style={{height:10,borderRadius:5,background:"#EDE7F6",overflow:"hidden",width:140,marginTop:6}}><div style={{height:"100%",width:`${Math.min(pct,100)}%`,background:pct>80?"#C62828":pct>50?"#E65100":"#7B1FA2",borderRadius:5}}/></div>, c:"#7B1FA2"},
                  ].map((k,i)=>(
                    <div key={i} style={{background:"#fff",borderRadius:14,padding:"14px 20px",border:"1px solid #E1BEE7",flex:"1 1 160px",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
                      <div style={{fontSize:11,color:"#7B1FA2",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>{k.l}</div>
                      <div style={{fontSize:22,fontWeight:900,color:k.c,lineHeight:1}}>{k.v}</div>
                    </div>
                  ))}
                  {/* Editar saldo */}
                  {editSaldoModal ? (
                    <div style={{display:"flex",gap:6,alignItems:"center",background:"#fff",borderRadius:14,padding:"12px 18px",border:"2px solid #7B1FA2",flex:"1 1 200px"}}>
                      <span style={{fontSize:12,fontWeight:700,color:"#7B1FA2"}}>Nuevo saldo:</span>
                      <input autoFocus value={editSaldoVal} onChange={e=>setEditSaldoVal(e.target.value)}
                        style={{border:"none",borderBottom:"2px solid #7B1FA2",outline:"none",fontSize:18,fontWeight:800,color:"#C62828",width:140,background:"transparent",fontFamily:"inherit"}}
                        placeholder={fmt(t.saldoActual)}
                        onKeyDown={async e=>{
                          if(e.key==="Enter"){
                            const nuevo=parseFloat(editSaldoVal.replace(/,/g,""));
                            if(!isNaN(nuevo)){
                              await updateTarjetaSaldo(t.id,nuevo);
                              setTarjetas(prev=>prev.map(x=>x.id===t.id?{...x,saldoActual:nuevo}:x));
                            }
                            setEditSaldoModal(false);
                          }
                          if(e.key==="Escape") setEditSaldoModal(false);
                        }}
                        onBlur={()=>setEditSaldoModal(false)}/>
                      <button onClick={()=>setEditSaldoModal(false)} style={{background:"none",border:"none",cursor:"pointer",color:"#999",fontSize:16}}>✕</button>
                    </div>
                  ) : (
                    <button onClick={()=>{setEditSaldoModal(true);setEditSaldoVal(String(t.saldoActual));}}
                      style={{padding:"14px 20px",borderRadius:14,border:"1.5px solid #7B1FA2",background:"#fff",color:"#7B1FA2",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
                      ✏️ Editar saldo
                    </button>
                  )}
                </div>

                {/* ── TABS ── */}
                <div style={{display:"flex",gap:2,padding:"10px 24px 0",background:"#FAFAFA",borderBottom:"1px solid #E1BEE7"}}>
                  {[
                    {k:"calendario",  l:"📅 Calendario"},
                    {k:"resumen",     l:"📊 Resumen"},
                    {k:"programados", l:"🔮 Programados"},
                  ].map(tab=>(
                    <button key={tab.k} onClick={()=>{setTarjetaTab(tab.k);setCalDiaSeleccionado(null);}}
                      style={{padding:"8px 20px",borderRadius:"10px 10px 0 0",border:`1px solid ${tarjetaTab===tab.k?"#E1BEE7":"transparent"}`,
                        borderBottom:tarjetaTab===tab.k?"1px solid #FAFAFA":"1px solid #E1BEE7",
                        background:tarjetaTab===tab.k?"#FAFAFA":"transparent",
                        color:tarjetaTab===tab.k?"#1A0533":"#7B1FA2",
                        fontWeight:tarjetaTab===tab.k?800:600,fontSize:13,cursor:"pointer",fontFamily:"inherit",
                        marginBottom:tarjetaTab===tab.k?-1:0,transition:"all .15s"}}>
                      {tab.l}
                    </button>
                  ))}
                </div>

                {/* ── TAB: RESUMEN ── */}
                {tarjetaTab==="resumen" && (()=>{
                  const MESES_N2 = ["Enero","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
                  const mesesDisp = [...new Set(movT.map(m=>m.fecha?.slice(0,7)).filter(Boolean))].sort().reverse();
                  const filtrados = movT.filter(m=>{
                    if(resumenFiltroInt && m.integrante!==resumenFiltroInt) return false;
                    if(resumenFiltroTipo && m.tipo!==resumenFiltroTipo) return false;
                    if(resumenFiltroMes && !m.fecha?.startsWith(resumenFiltroMes)) return false;
                    return true;
                  });
                  const cargos = filtrados.filter(m=>m.monto>0&&m.tipo!=="PAGO");
                  const pagos  = filtrados.filter(m=>m.monto<0||m.tipo==="PAGO");
                  const totalC = cargos.reduce((s,m)=>s+m.monto,0);
                  const totalP = Math.abs(pagos.reduce((s,m)=>s+m.monto,0));

                  // Agrupación
                  const grupos = {};
                  filtrados.forEach(m=>{
                    let k;
                    if(resumenGrupo==="integrante") k = m.integrante||"Sin asignar";
                    else if(resumenGrupo==="tipo") k = m.tipo||"—";
                    else if(resumenGrupo==="mes") { const mo=m.fecha?.slice(0,7); k = mo ? `${MESES_N2[+mo.split("-")[1]-1]} ${mo.split("-")[0]}` : "Sin fecha"; }
                    if(!grupos[k]) grupos[k]={cargos:0,pagos:0,movs:[]};
                    if(m.monto>0&&m.tipo!=="PAGO") grupos[k].cargos+=m.monto;
                    else grupos[k].pagos+=Math.abs(m.monto);
                    grupos[k].movs.push(m);
                  });
                  const gruposSorted = Object.entries(grupos).sort((a,b)=>b[1].cargos-a[1].cargos);

                  return (
                    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
                      {/* Filtros */}
                      <div style={{padding:"10px 24px",borderBottom:"1px solid #E1BEE7",background:"#FAFAFA",display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                        {/* Agrupar por */}
                        <div style={{display:"flex",gap:4,alignItems:"center"}}>
                          <span style={{fontSize:11,fontWeight:700,color:"#7B1FA2",marginRight:4}}>AGRUPAR:</span>
                          {[{k:"integrante",l:"👥 Integrante"},{k:"tipo",l:"📋 Tipo"},{k:"mes",l:"📅 Mes"}].map(g=>(
                            <button key={g.k} onClick={()=>setResumenGrupo(g.k)}
                              style={{padding:"5px 12px",borderRadius:20,border:`1.5px solid ${resumenGrupo===g.k?"#7B1FA2":"#E1BEE7"}`,
                                background:resumenGrupo===g.k?"#7B1FA2":"#fff",color:resumenGrupo===g.k?"#fff":"#7B1FA2",
                                fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
                              {g.l}
                            </button>
                          ))}
                        </div>
                        <div style={{width:1,height:20,background:"#E1BEE7"}}/>
                        {/* Filtros */}
                        <select value={resumenFiltroInt} onChange={e=>setResumenFiltroInt(e.target.value)}
                          style={{padding:"5px 10px",borderRadius:8,border:"1px solid #E1BEE7",fontSize:12,fontFamily:"inherit"}}>
                          <option value="">👥 Todos los integrantes</option>
                          {integrantes.map(i=><option key={i}>{i}</option>)}
                        </select>
                        <select value={resumenFiltroTipo} onChange={e=>setResumenFiltroTipo(e.target.value)}
                          style={{padding:"5px 10px",borderRadius:8,border:"1px solid #E1BEE7",fontSize:12,fontFamily:"inherit"}}>
                          <option value="">📋 Todos los tipos</option>
                          {["COMPRA","CARGO","PAGO","TRANSFERENCIA"].map(tp=><option key={tp}>{tp}</option>)}
                        </select>
                        <select value={resumenFiltroMes} onChange={e=>setResumenFiltroMes(e.target.value)}
                          style={{padding:"5px 10px",borderRadius:8,border:"1px solid #E1BEE7",fontSize:12,fontFamily:"inherit"}}>
                          <option value="">📅 Todos los meses</option>
                          {mesesDisp.map(m=>{const[y,mo]=m.split("-");return <option key={m} value={m}>{MESES_N2[+mo-1]} {y}</option>;})}
                        </select>
                        {(resumenFiltroInt||resumenFiltroTipo||resumenFiltroMes)&&
                          <button onClick={()=>{setResumenFiltroInt("");setResumenFiltroTipo("");setResumenFiltroMes("");}}
                            style={{padding:"5px 10px",borderRadius:8,border:"1px solid #E1BEE7",background:"#fff",cursor:"pointer",fontSize:11,fontFamily:"inherit"}}>✕ Limpiar</button>}
                        {/* Totales rápidos */}
                        <div style={{marginLeft:"auto",display:"flex",gap:10}}>
                          <span style={{fontSize:12,fontWeight:800,color:"#C62828"}}>Cargos: ${fmt(totalC)}</span>
                          <span style={{fontSize:12,fontWeight:800,color:"#1B5E20"}}>Pagos: ${fmt(totalP)}</span>
                          <span style={{fontSize:11,color:"#999"}}>{filtrados.length} movs.</span>
                        </div>
                      </div>
                      {/* Cards por grupo */}
                      <div style={{overflowY:"auto",flex:1,padding:"16px 24px",display:"flex",flexDirection:"column",gap:10}}>
                        {gruposSorted.map(([k,v])=>(
                          <div key={k} style={{background:"#fff",borderRadius:14,border:"1px solid #E1BEE7",overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
                            {/* Cabecera grupo */}
                            <div style={{padding:"10px 18px",background:"#F5F0FF",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <div style={{fontWeight:800,fontSize:14,color:"#1A0533"}}>{k}</div>
                              <div style={{display:"flex",gap:16,alignItems:"center"}}>
                                {v.cargos>0 && <span style={{fontSize:13,fontWeight:800,color:"#C62828"}}>Cargos: ${fmt(v.cargos)}</span>}
                                {v.pagos>0  && <span style={{fontSize:13,fontWeight:800,color:"#1B5E20"}}>Pagos: ${fmt(v.pagos)}</span>}
                                <span style={{fontSize:11,color:"#999"}}>{v.movs.length} mov.</span>
                              </div>
                            </div>
                            {/* Tabla mini */}
                            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                              <tbody>
                                {v.movs.sort((a,b)=>b.fecha?.localeCompare(a.fecha||"")||0).map((m,i)=>(
                                  <tr key={i} style={{borderTop:"1px solid #F3E5F5",background:i%2===0?"#fff":"#FDF7FF"}}>
                                    <td style={{padding:"7px 18px",color:"#888",whiteSpace:"nowrap"}}>{m.fecha}</td>
                                    <td style={{padding:"7px 12px",maxWidth:240,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.descripcion}</td>
                                    <td style={{padding:"7px 12px",color:"#7B1FA2",fontSize:11}}>{m.integrante||"—"}</td>
                                    <td style={{padding:"7px 12px"}}>
                                      <span style={{background:m.tipo==="PAGO"?"#E8F5E9":m.tipo==="TRANSFERENCIA"?"#E3F2FD":"#FFF3E0",
                                        color:m.tipo==="PAGO"?"#1B5E20":m.tipo==="TRANSFERENCIA"?"#1565C0":"#E65100",
                                        fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:20}}>{m.tipo}</span>
                                    </td>
                                    <td style={{padding:"7px 18px",textAlign:"right",fontWeight:800,color:m.monto<0?"#1B5E20":"#C62828"}}>
                                      {m.monto<0?"-":""}${fmt(Math.abs(m.monto))}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))}
                        {gruposSorted.length===0 && <div style={{textAlign:"center",padding:"40px",color:"#999",fontSize:13}}>Sin movimientos con los filtros seleccionados</div>}
                      </div>
                    </div>
                  );
                })()}

                {/* ── TAB: CALENDARIO ── */}
                {tarjetaTab==="calendario" && (()=>{
                  const dias = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
                  const celdas = [];
                  for(let i=0;i<inicioSemana;i++) celdas.push(null);
                  for(let d=1;d<=diasEnMes;d++) celdas.push(d);

                  const diaKey = d => `${calMes}-${String(d).padStart(2,"0")}`;
                  const movsDia = d => calShowMovs ? (movPorDia[diaKey(d)]||[]) : [];
                  const progsDia = d => calShowProgs ? (progPorDia[diaKey(d)]||[]) : [];
                  const totalMovsDia = d => movsDia(d).filter(m=>m.monto>0&&m.tipo!=="PAGO").reduce((s,m)=>s+m.monto,0);
                  const totalProgsDia = d => progsDia(d).reduce((s,p)=>s+p.monto,0);
                  const MESES_N2 = ["Enero","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

                  const [y,m_] = calMes.split("-").map(Number);
                  const prevMes = m_===1?`${y-1}-12`:`${y}-${String(m_-1).padStart(2,"0")}`;
                  const nextMes = m_===12?`${y+1}-01`:`${y}-${String(m_+1).padStart(2,"0")}`;

                  // Totales del mes para el resumen top
                  const movsDelMes = movT.filter(m=>m.fecha?.startsWith(calMes));
                  const cargosDelMes = movsDelMes.filter(m=>m.monto>0&&m.tipo!=="PAGO").reduce((s,m)=>s+m.monto,0);
                  const pagosDelMes  = Math.abs(movsDelMes.filter(m=>m.monto<0||m.tipo==="PAGO").reduce((s,m)=>s+m.monto,0));
                  const progsDelMes  = progsT.filter(p=>p.fecha?.startsWith(calMes)&&p.estatus==="pendiente").reduce((s,p)=>s+p.monto,0);

                  return (
                    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
                      {/* Barra top: nav mes + toggles */}
                      <div style={{padding:"10px 20px",background:"#1A0533",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                        {/* Nav mes */}
                        <button onClick={()=>{setCalMes(prevMes);setCalDiaSeleccionado(null);}}
                          style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:14,color:"#fff",fontFamily:"inherit"}}>◀</button>
                        <span style={{fontWeight:800,fontSize:15,color:"#fff",minWidth:110,textAlign:"center"}}>{MESES_N2[m_-1]} {y}</span>
                        <button onClick={()=>{setCalMes(nextMes);setCalDiaSeleccionado(null);}}
                          style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.2)",borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:14,color:"#fff",fontFamily:"inherit"}}>▶</button>
                        <div style={{width:1,height:20,background:"rgba(255,255,255,.2)"}}/>
                        {/* Toggles — mutuamente exclusivos */}
                        <span style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.5)"}}>VER:</span>
                        <button onClick={()=>{setCalShowMovs(true);setCalShowProgs(false);}}
                          style={{padding:"5px 16px",borderRadius:20,border:`1.5px solid ${calShowMovs&&!calShowProgs?"#CE93D8":"rgba(255,255,255,.2)"}`,
                            background:calShowMovs&&!calShowProgs?"#CE93D8":"rgba(255,255,255,.08)",
                            color:calShowMovs&&!calShowProgs?"#1A0533":"rgba(255,255,255,.7)",
                            fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
                          📋 Movimientos
                        </button>
                        <button onClick={()=>{setCalShowProgs(true);setCalShowMovs(false);}}
                          style={{padding:"5px 16px",borderRadius:20,border:`1.5px solid ${calShowProgs&&!calShowMovs?"#CE93D8":"rgba(255,255,255,.2)"}`,
                            background:calShowProgs&&!calShowMovs?"#CE93D8":"rgba(255,255,255,.08)",
                            color:calShowProgs&&!calShowMovs?"#1A0533":"rgba(255,255,255,.7)",
                            fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
                          🔮 Programados
                        </button>
                        {/* Total del mes */}
                        <div style={{marginLeft:"auto",display:"flex",gap:12,alignItems:"center"}}>
                          {calShowMovs && !calShowProgs && <span style={{fontSize:13,fontWeight:800,color:"#CE93D8"}}>${fmt(movsDelMes.filter(m=>m.monto>0&&m.tipo!=="PAGO").reduce((s,m)=>s+m.monto,0))} en {MESES_N2[m_-1]}</span>}
                          {calShowProgs && !calShowMovs && progsDelMes>0 && <span style={{fontSize:13,fontWeight:800,color:"#CE93D8"}}>🔮 ${fmt(progsDelMes)} pendiente</span>}
                        </div>
                      </div>

                      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
                        {/* Calendario */}
                        <div style={{flex:1,overflowY:"auto",padding:"14px 16px",background:"#F5F0FF"}}>
                          {/* Cabecera días */}
                          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
                            {dias.map(d=><div key={d} style={{textAlign:"center",fontSize:11,fontWeight:800,color:"#7B1FA2",padding:"4px 0",textTransform:"uppercase",letterSpacing:.3}}>{d}</div>)}
                          </div>
                          {/* Celdas */}
                          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
                            {celdas.map((d,i)=>{
                              if(!d) return <div key={`e${i}`}/>;
                              const tieneMovs  = (movPorDia[diaKey(d)]||[]).length>0;
                              const tieneProgs = (progPorDia[diaKey(d)]||[]).length>0;
                              const mostrarMov  = calShowMovs && !calShowProgs && tieneMovs;
                              const mostrarProg = calShowProgs && !calShowMovs && tieneProgs;
                              const tieneAlgo   = mostrarMov || mostrarProg;
                              const seleccionado = calDiaSeleccionado===d;
                              const hoy = today()===diaKey(d);
                              const totalDia = mostrarMov
                                ? (movPorDia[diaKey(d)]||[]).filter(m=>m.monto>0&&m.tipo!=="PAGO").reduce((s,m)=>s+m.monto,0)
                                : (progPorDia[diaKey(d)]||[]).reduce((s,p)=>s+p.monto,0);
                              return (
                                <div key={d} onClick={()=>tieneAlgo&&setCalDiaSeleccionado(seleccionado?null:d)}
                                  style={{minHeight:74,borderRadius:12,
                                    border:`2px solid ${seleccionado?"#4A148C":hoy?"#9C27B0":tieneAlgo?"#CE93D8":"#EDE7F6"}`,
                                    background:seleccionado?"#7B1FA2":hoy?"#EDE7F6":tieneAlgo?"#fff":"#FAF8FF",
                                    cursor:tieneAlgo?"pointer":"default",padding:"7px 8px",transition:"all .1s",
                                    boxShadow:seleccionado?"0 2px 8px rgba(123,31,162,.3)":tieneAlgo?"0 1px 4px rgba(0,0,0,.06)":"none"}}>
                                  <div style={{fontWeight:hoy?900:600,fontSize:13,
                                    color:seleccionado?"#fff":hoy?"#6A1B9A":"#4A148C",marginBottom:4}}>{d}</div>
                                  {tieneAlgo && (
                                    <div style={{fontSize:13,fontWeight:900,
                                      color:seleccionado?"#fff":mostrarMov?"#4A148C":"#6A1B9A",
                                      background:seleccionado?"rgba(255,255,255,.2)":mostrarMov?"#EDE7F6":"#E1BEE7",
                                      borderRadius:7,padding:"3px 7px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginTop:2}}>
                                      {mostrarProg && "🔮 "}${fmt(totalDia)}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        {/* Panel detalle día */}
                        {calDiaSeleccionado && (
                          <div style={{width:300,borderLeft:"1px solid #E1BEE7",background:"#FAF5FF",overflowY:"auto",padding:"16px"}}>
                            <div style={{fontWeight:800,fontSize:15,color:"#4A148C",marginBottom:12}}>
                              {calDiaSeleccionado} de {MESES_N2[m_-1]} {y}
                            </div>
                            {calShowMovs && !calShowProgs && (movPorDia[diaKey(calDiaSeleccionado)]||[]).length>0 && <>
                              <div style={{fontSize:11,fontWeight:800,color:"#6A1B9A",textTransform:"uppercase",letterSpacing:.4,marginBottom:8}}>📋 Movimientos</div>
                              {(movPorDia[diaKey(calDiaSeleccionado)]||[]).sort((a,b)=>b.monto-a.monto).map((m,i)=>(
                                <div key={i} style={{background:"#fff",borderRadius:10,border:"1px solid #E1BEE7",padding:"9px 12px",marginBottom:7}}>
                                  <div style={{fontSize:12,fontWeight:700,color:"#4A148C",marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.descripcion}</div>
                                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                    <span style={{background:m.tipo==="PAGO"?"#E8F5E9":m.tipo==="TRANSFERENCIA"?"#E3F2FD":"#EDE7F6",
                                      color:m.tipo==="PAGO"?"#1B5E20":m.tipo==="TRANSFERENCIA"?"#1565C0":"#7B1FA2",
                                      fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:20}}>{m.tipo}</span>
                                    <span style={{fontWeight:800,fontSize:13,color:m.monto<0?"#1B5E20":"#4A148C"}}>{m.monto<0?"-":""}${fmt(Math.abs(m.monto))}</span>
                                  </div>
                                  {m.integrante && <div style={{fontSize:10,color:"#9C27B0",marginTop:3}}>{m.integrante}</div>}
                                </div>
                              ))}
                            </>}
                            {calShowProgs && !calShowMovs && (progPorDia[diaKey(calDiaSeleccionado)]||[]).length>0 && <>
                              <div style={{fontSize:11,fontWeight:800,color:"#6A1B9A",textTransform:"uppercase",letterSpacing:.4,marginBottom:8}}>🔮 Programados</div>
                              {(progPorDia[diaKey(calDiaSeleccionado)]||[]).map((p,i)=>(
                                <div key={i} style={{background:"#fff",borderRadius:10,border:"1px solid #E1BEE7",padding:"9px 12px",marginBottom:7}}>
                                  <div style={{fontSize:12,fontWeight:700,color:"#4A148C",marginBottom:3}}>{p.descripcion}</div>
                                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                    <span style={{fontSize:10,color:"#9C27B0",background:"#EDE7F6",padding:"1px 7px",borderRadius:20,fontWeight:600}}>{p.categoria}</span>
                                    <span style={{fontWeight:800,fontSize:13,color:"#4A148C"}}>${fmt(p.monto)}</span>
                                  </div>
                                  {p.notas && <div style={{fontSize:10,color:"#999",marginTop:3}}>{p.notas}</div>}
                                </div>
                              ))}
                            </>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* ── TAB: PROGRAMADOS ── */}
                {tarjetaTab==="programados" && (()=>{
                  const CATS = ["Seguros","Servicios","Luz","Internet","Gasolina","Hospedaje","Alimentación","Transporte","Software","Otros"];
                  const pendientes = progsT.filter(p=>p.estatus==="pendiente").sort((a,b)=>a.fecha.localeCompare(b.fecha));
                  const pagados    = progsT.filter(p=>p.estatus==="pagado").sort((a,b)=>b.fecha.localeCompare(a.fecha));
                  const totalPend  = pendientes.reduce((s,p)=>s+p.monto,0);
                  const totalPagado= pagados.reduce((s,p)=>s+p.monto,0);
                  const totalGlobal= progsT.reduce((s,p)=>s+p.monto,0);

                  const calcFechas = (fechaInicio, frecuencia, n) => {
                    const fechas = [];
                    let d = new Date(fechaInicio + "T12:00:00");
                    for(let i=0;i<n;i++){
                      fechas.push(d.toISOString().split("T")[0]);
                      const next = new Date(d);
                      if(frecuencia==="mensual")    next.setMonth(next.getMonth()+1);
                      else if(frecuencia==="bimestral") next.setMonth(next.getMonth()+2);
                      else if(frecuencia==="trimestral") next.setMonth(next.getMonth()+3);
                      else if(frecuencia==="semestral") next.setMonth(next.getMonth()+6);
                      else if(frecuencia==="anual")  next.setFullYear(next.getFullYear()+1);
                      d = next;
                    }
                    return fechas;
                  };

                  const guardarProg = async () => {
                    if(!formProg?.descripcion||!formProg?.monto||!formProg?.fecha) return;
                    const monto = parseFloat(String(formProg.monto).replace(/,/g,""));
                    if(formProg.recurrente && !formProg.id) {
                      const n = parseInt(formProg.numPagos)||1;
                      const fechas = calcFechas(formProg.fecha, formProg.frecuencia||"trimestral", n);
                      const serieId = `serie_${Date.now()}`;
                      for(const fecha of fechas){
                        await upsertProgramado({descripcion:formProg.descripcion, monto, fecha,
                          categoria:formProg.categoria||"Seguros", notas:formProg.notas||"",
                          estatus:"pendiente", empresaId, tarjetaId:t.id, serieId});
                      }
                    } else {
                      await upsertProgramado({...formProg, empresaId, tarjetaId:t.id, monto, estatus:formProg.estatus||"pendiente"});
                    }
                    const nuevos = await fetchProgramados(empresaId);
                    setProgramados(nuevos);
                    setFormProg(null);
                  };

                  const previewFechas = formProg?.recurrente && formProg?.fecha && formProg?.numPagos
                    ? calcFechas(formProg.fecha, formProg.frecuencia||"trimestral", Math.min(parseInt(formProg.numPagos)||1, 12))
                    : null;

                  const seriesMap = {};
                  progsT.forEach(p=>{
                    const key = p.serieId || `solo_${p.id}`;
                    if(!seriesMap[key]) seriesMap[key]={key, desc:p.descripcion, cat:p.categoria, pagos:[], totalPagado:0, totalPend:0, total:0, serieId:p.serieId};
                    seriesMap[key].pagos.push(p);
                    seriesMap[key].total += p.monto;
                    if(p.estatus==="pagado") seriesMap[key].totalPagado += p.monto;
                    else seriesMap[key].totalPend += p.monto;
                  });
                  const seriesSorted = Object.values(seriesMap).sort((a,b)=>b.total-a.total);
                  const popupSerie = progSeriePopup ? seriesMap[progSeriePopup] : null;

                  return (
                    <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden",position:"relative"}}>

                      {/* ── BARRA SUPERIOR: KPIs + chips + agregar ── */}
                      <div style={{padding:"14px 24px",background:"#1A0533",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                        {/* KPIs globales */}
                        {[
                          {l:"Total",    v:`$${fmt(totalGlobal)}`, c:"#CE93D8"},
                          {l:"Pagado",   v:`$${fmt(totalPagado)}`, c:"#81C784"},
                          {l:"Pendiente",v:`$${fmt(totalPend)}`,   c:"#FFB74D"},
                        ].map((k,i)=>(
                          <div key={i} style={{background:"rgba(255,255,255,.07)",borderRadius:10,padding:"6px 14px",border:"1px solid rgba(255,255,255,.1)",flexShrink:0}}>
                            <div style={{fontSize:9,color:"rgba(255,255,255,.4)",fontWeight:700,textTransform:"uppercase",letterSpacing:.4}}>{k.l}</div>
                            <div style={{fontSize:15,fontWeight:900,color:k.c}}>{k.v}</div>
                          </div>
                        ))}
                        <div style={{width:1,height:32,background:"rgba(255,255,255,.1)",flexShrink:0}}/>
                        {/* Chips por serie — más grandes */}
                        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",flex:1}}>
                          {seriesSorted.map((s,si)=>{
                            const nPag = s.pagos.filter(p=>p.estatus==="pagado").length;
                            const nTot = s.pagos.length;
                            const pct  = nTot>0?Math.round((nPag/nTot)*100):0;
                            const proxP = s.pagos.filter(p=>p.estatus==="pendiente").sort((a,b)=>a.fecha.localeCompare(b.fecha))[0];
                            const dias = proxP?daysUntil(proxP.fecha):null;
                            const isOpen = progSeriePopup===s.key;
                            return (
                              <button key={si} onClick={()=>setProgSeriePopup(isOpen?null:s.key)}
                                style={{padding:"12px 18px",borderRadius:14,border:`2px solid ${isOpen?"#CE93D8":"rgba(255,255,255,.25)"}`,
                                  background:isOpen?"rgba(206,147,216,.25)":"rgba(255,255,255,.08)",
                                  cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"all .15s",minWidth:180}}>
                                <div style={{fontWeight:800,fontSize:14,color:"#fff",marginBottom:4}}>{s.desc}</div>
                                <div style={{fontSize:11,color:"rgba(255,255,255,.5)",marginBottom:6}}>{s.cat}{nTot>1?" · serie":""}</div>
                                {/* Barra */}
                                <div style={{height:4,borderRadius:2,background:"rgba(255,255,255,.15)",overflow:"hidden",marginBottom:5}}>
                                  <div style={{height:"100%",width:`${pct}%`,background:pct===100?"#81C784":"#CE93D8",borderRadius:2}}/>
                                </div>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                  <span style={{fontSize:11,color:"rgba(255,255,255,.5)",fontWeight:600}}>{nPag}/{nTot} pagados</span>
                                  <span style={{fontSize:13,color:"#CE93D8",fontWeight:900}}>${fmt(s.total)}</span>
                                </div>
                                {proxP && <div style={{fontSize:10,fontWeight:700,marginTop:4,
                                  color:dias<=0?"#FF8A65":dias<=7?"#FFB74D":"rgba(255,255,255,.35)"}}>
                                  Próx: {proxP.fecha}{dias===0?" · Hoy":dias<0?` · Vencido ${Math.abs(dias)}d`:` · En ${dias}d`}
                                </div>}
                              </button>
                            );
                          })}
                          <button onClick={()=>{setProgSeriePopup(null);setFormProg({descripcion:"",monto:"",fecha:"",categoria:"Seguros",notas:"",estatus:"pendiente",recurrente:false,numPagos:4,frecuencia:"trimestral"});}}
                            style={{padding:"12px 18px",borderRadius:14,border:"2px dashed rgba(255,255,255,.3)",background:"transparent",
                              color:"rgba(255,255,255,.6)",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",alignSelf:"stretch",display:"flex",alignItems:"center"}}>
                            + Agregar
                          </button>
                        </div>
                      </div>


                      {/* ── FORMULARIO ── */}
                      {formProg && (
                        <div style={{margin:"12px 20px 0",background:"#F3E5F5",borderRadius:14,border:"2px solid #7B1FA2",padding:"16px"}}>
                          <div style={{fontWeight:800,fontSize:13,color:"#1A0533",marginBottom:12}}>{formProg.id?"Editar pago":"Nuevo pago programado"}</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                            <div style={{gridColumn:"1/-1"}}>
                              <div style={{fontSize:11,fontWeight:700,color:"#7B1FA2",marginBottom:4}}>Descripción *</div>
                              <input value={formProg.descripcion} onChange={e=>setFormProg(p=>({...p,descripcion:e.target.value}))}
                                placeholder="Ej: GMM Dirección" style={{...inputStyle,fontSize:13}}/>
                            </div>
                            <div>
                              <div style={{fontSize:11,fontWeight:700,color:"#7B1FA2",marginBottom:4}}>Monto por pago *</div>
                              <input value={formProg.monto} onChange={e=>setFormProg(p=>({...p,monto:e.target.value}))}
                                placeholder="196403" type="number" style={{...inputStyle,fontSize:13}}/>
                            </div>
                            <div>
                              <div style={{fontSize:11,fontWeight:700,color:"#7B1FA2",marginBottom:4}}>Categoría</div>
                              <select value={formProg.categoria} onChange={e=>setFormProg(p=>({...p,categoria:e.target.value}))}
                                style={{...selectStyle,fontSize:13}}>
                                {CATS.map(c=><option key={c}>{c}</option>)}
                              </select>
                            </div>
                            <div>
                              <div style={{fontSize:11,fontWeight:700,color:"#7B1FA2",marginBottom:4}}>Fecha {formProg.recurrente?"inicial":""}*</div>
                              <input value={formProg.fecha} onChange={e=>setFormProg(p=>({...p,fecha:e.target.value}))}
                                type="date" style={{...inputStyle,fontSize:13}}/>
                            </div>
                            <div>
                              <div style={{fontSize:11,fontWeight:700,color:"#7B1FA2",marginBottom:4}}>Notas</div>
                              <input value={formProg.notas} onChange={e=>setFormProg(p=>({...p,notas:e.target.value}))}
                                placeholder="Ej: 4 trimestres dirección" style={{...inputStyle,fontSize:13}}/>
                            </div>
                          </div>
                          {!formProg.id && (
                            <div style={{marginBottom:12}}>
                              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",userSelect:"none"}}>
                                <div onClick={()=>setFormProg(p=>({...p,recurrente:!p.recurrente}))}
                                  style={{width:36,height:20,borderRadius:10,background:formProg.recurrente?"#7B1FA2":"#E1BEE7",position:"relative",transition:"background .2s",cursor:"pointer",flexShrink:0}}>
                                  <div style={{position:"absolute",top:2,left:formProg.recurrente?18:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
                                </div>
                                <span style={{fontSize:12,fontWeight:700,color:formProg.recurrente?"#7B1FA2":"#999"}}>Pagos recurrentes (serie)</span>
                              </label>
                              {formProg.recurrente && (
                                <div style={{marginTop:10,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                                  <div>
                                    <div style={{fontSize:11,fontWeight:700,color:"#7B1FA2",marginBottom:4}}>Número de pagos</div>
                                    <input value={formProg.numPagos} onChange={e=>setFormProg(p=>({...p,numPagos:e.target.value}))}
                                      type="number" min="2" max="24" style={{...inputStyle,fontSize:13}}/>
                                  </div>
                                  <div>
                                    <div style={{fontSize:11,fontWeight:700,color:"#7B1FA2",marginBottom:4}}>Frecuencia</div>
                                    <select value={formProg.frecuencia} onChange={e=>setFormProg(p=>({...p,frecuencia:e.target.value}))}
                                      style={{...selectStyle,fontSize:13}}>
                                      <option value="mensual">Mensual</option>
                                      <option value="bimestral">Bimestral</option>
                                      <option value="trimestral">Trimestral</option>
                                      <option value="semestral">Semestral</option>
                                      <option value="anual">Anual</option>
                                    </select>
                                  </div>
                                </div>
                              )}
                              {previewFechas && formProg.monto && (
                                <div style={{marginTop:10,background:"#EDE7F6",borderRadius:10,padding:"10px 12px"}}>
                                  <div style={{fontSize:11,fontWeight:800,color:"#7B1FA2",marginBottom:6}}>Vista previa · {previewFechas.length} pagos</div>
                                  {previewFechas.map((f,i)=>(
                                    <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#4A148C",marginBottom:2}}>
                                      <span style={{fontWeight:600}}>Pago {i+1} · {f}</span>
                                      <span style={{fontWeight:800}}>${fmt(parseFloat(String(formProg.monto).replace(/,/g,""))||0)}</span>
                                    </div>
                                  ))}
                                  <div style={{marginTop:6,paddingTop:6,borderTop:"1px solid #CE93D8",display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:900,color:"#4A148C"}}>
                                    <span>Total serie</span>
                                    <span>${fmt((parseFloat(String(formProg.monto).replace(/,/g,""))||0)*previewFechas.length)}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                            <button onClick={()=>setFormProg(null)}
                              style={{padding:"7px 16px",borderRadius:9,border:"1px solid #E1BEE7",background:"#fff",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>Cancelar</button>
                            <button onClick={guardarProg}
                              style={{padding:"7px 16px",borderRadius:9,border:"none",background:"#7B1FA2",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                              {formProg.recurrente&&!formProg.id?`Guardar ${formProg.numPagos||""} pagos`:"Guardar"}
                            </button>
                          </div>
                        </div>
                      )}

                      {progsT.length===0 && !formProg && (
                        <div style={{textAlign:"center",padding:"60px 20px",color:"#999"}}>
                          <div style={{fontSize:44,marginBottom:12}}>🔮</div>
                          <div style={{fontWeight:700,fontSize:15,color:"#7B1FA2"}}>Sin pagos programados</div>
                          <div style={{fontSize:12,marginTop:4}}>Usa "+ Agregar" para registrar seguros, servicios, etc.</div>
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>
            </div>
          );
        })()}

        {/* ── SERIE POPUP (raíz, sin restricciones de overflow) ── */}
        {progSeriePopup && tarjetaModalId && (()=>{
          const t2 = tarjetas.find(x=>x.id===tarjetaModalId);
          if(!t2) return null;
          const progsT2 = programados.filter(p=>p.tarjetaId===t2.id);
          const seriesMap2 = {};
          progsT2.forEach(p=>{
            const key = p.serieId || `solo_${p.id}`;
            if(!seriesMap2[key]) seriesMap2[key]={key, desc:p.descripcion, cat:p.categoria, pagos:[], totalPagado:0, totalPend:0, total:0, serieId:p.serieId};
            seriesMap2[key].pagos.push(p);
            seriesMap2[key].total += p.monto;
            if(p.estatus==="pagado") seriesMap2[key].totalPagado += p.monto;
            else seriesMap2[key].totalPend += p.monto;
          });
          const ps = seriesMap2[progSeriePopup];
          if(!ps) return null;
          const nPag = ps.pagos.filter(p=>p.estatus==="pagado").length;
          const nTot = ps.pagos.length;
          const pct  = nTot>0?Math.round((nPag/nTot)*100):0;
          const pags = [...ps.pagos].sort((a,b)=>a.fecha.localeCompare(b.fecha));
          const diasLabel = d => d<0?`Vencido hace ${Math.abs(d)} días`:d===0?"Hoy":`En ${d} días`;
          return (
            <>
            <div onClick={()=>setProgSeriePopup(null)}
              style={{position:"fixed",inset:0,zIndex:5000,background:"rgba(0,0,0,.55)"}}/>
            <div style={{position:"fixed",top:"50%",left:"50%",
              marginTop:"-420px",marginLeft:"-420px",
              zIndex:5001,background:"#fff",borderRadius:26,border:"2px solid #CE93D8",
              boxShadow:"0 24px 64px rgba(74,20,140,.35)",width:840,maxHeight:"90vh",
              display:"flex",flexDirection:"column",overflow:"hidden",
              fontFamily:"inherit"}}
              onClick={e=>e.stopPropagation()}>
              <div style={{background:"#4A148C",padding:"12px 36px",flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:14,fontWeight:800,color:"rgba(255,255,255,.85)",textTransform:"uppercase",letterSpacing:1.5}}>Propuesta de Pagos con TC</span>
                <span style={{fontSize:13,color:"rgba(255,255,255,.5)"}}>{t2.banco} · {t2.titular}</span>
              </div>
              {/* KPIs tarjeta */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:0,borderBottom:"1px solid #E1BEE7",flexShrink:0}}>
                {(()=>{
                  const pct2 = t2.limite>0?Math.round((t2.saldoActual/t2.limite)*100):0;
                  return [
                    {l:"Límite",       v:`$${fmt(t2.limite)}`,              c:"#4A148C"},
                    {l:"Saldo Actual", v:`$${fmt(t2.saldoActual)}`,         c:"#C62828"},
                    {l:"Disponible",   v:`$${fmt(t2.limite-t2.saldoActual)}`,c:"#1B5E20"},
                    {l:`${pct2}% Usado`, v:<div style={{height:6,borderRadius:3,background:"#EDE7F6",overflow:"hidden",marginTop:6}}><div style={{height:"100%",width:`${Math.min(pct2,100)}%`,background:pct2>80?"#C62828":pct2>50?"#E65100":"#7B1FA2",borderRadius:3}}/></div>, c:"#7B1FA2"},
                  ].map((k,i)=>(
                    <div key={i} style={{padding:"14px 22px",borderRight:i<3?"1px solid #F3E5F5":"none",background:"#FAF5FF"}}>
                      <div style={{fontSize:11,color:"#9C27B0",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:3}}>{k.l}</div>
                      <div style={{fontSize:18,fontWeight:900,color:k.c}}>{k.v}</div>
                    </div>
                  ));
                })()}
              </div>
              <div style={{background:"#1A0533",padding:"18px 26px 16px",flexShrink:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                  <div>
                    <div style={{fontWeight:900,fontSize:26,color:"#fff"}}>{ps.desc}</div>
                    <div style={{fontSize:14,color:"#CE93D8",marginTop:4}}>{ps.cat} · {nTot} pago{nTot!==1?"s":""}</div>
                  </div>
                  <button onClick={()=>setProgSeriePopup(null)}
                    style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,color:"#fff",width:40,height:40,cursor:"pointer",fontSize:24,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                  {[
                    {l:"Total",      v:`$${fmt(ps.total)}`,       c:"#CE93D8", bg:"rgba(206,147,216,.15)"},
                    {l:"✓ Pagado",   v:`$${fmt(ps.totalPagado)}`, c:"#81C784", bg:"rgba(129,199,132,.15)"},
                    {l:"⏳ Pendiente",v:`$${fmt(ps.totalPend)}`,   c:"#FFB74D", bg:"rgba(255,183,77,.15)"},
                  ].map((k,i)=>(
                    <div key={i} style={{background:k.bg,borderRadius:12,padding:"14px 20px",border:`1px solid ${k.c}33`}}>
                      <div style={{fontSize:12,color:"rgba(255,255,255,.5)",fontWeight:700,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>{k.l}</div>
                      <div style={{fontSize:24,fontWeight:900,color:k.c}}>{k.v}</div>
                    </div>
                  ))}
                </div>
              </div>
              {nTot>1 && <div style={{padding:"14px 36px 10px",background:"#F3E5F5",flexShrink:0}}>
                <div style={{height:10,borderRadius:5,background:"#EDE7F6",overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,background:pct===100?"#43A047":"#7B1FA2",borderRadius:4,transition:"width .4s"}}/>
                </div>
                <div style={{fontSize:14,color:"#9C27B0",fontWeight:700,marginTop:6}}>{nPag} de {nTot} pagos realizados · {pct}%</div>
              </div>}
              <div style={{overflowY:"auto",flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:20,padding:"12px 36px",background:"#F5F0FF",borderBottom:"2px solid #EDE7F6"}}>
                  {nTot>1 && <div style={{width:40,flexShrink:0,fontSize:12,fontWeight:800,color:"#7B1FA2",textTransform:"uppercase",letterSpacing:.6,textAlign:"center"}}>No.</div>}
                  <div style={{flex:1,fontSize:12,fontWeight:800,color:"#7B1FA2",textTransform:"uppercase",letterSpacing:.6}}>Fecha de pago</div>
                  <div style={{fontSize:12,fontWeight:800,color:"#7B1FA2",textTransform:"uppercase",letterSpacing:.6,flexShrink:0,minWidth:160,textAlign:"right"}}>Importe</div>
                  <div style={{minWidth:130,textAlign:"right",flexShrink:0,fontSize:12,fontWeight:800,color:"#7B1FA2",textTransform:"uppercase",letterSpacing:.6}}>Vencimiento</div>
                  <div style={{width:148,flexShrink:0,fontSize:12,fontWeight:800,color:"#7B1FA2",textTransform:"uppercase",letterSpacing:.6,textAlign:"center"}}>Acciones</div>
                </div>
                {pags.map((p,pi)=>{
                  const dias=daysUntil(p.fecha);
                  const pagado=p.estatus==="pagado";
                  return (
                    <div key={p.id} style={{display:"flex",alignItems:"center",gap:20,padding:"18px 36px",
                      borderTop:"1px solid #F3E5F5",background:pagado?"#F8FFF8":"#fff"}}>
                      {nTot>1 && <div style={{width:40,height:40,borderRadius:"50%",flexShrink:0,
                        background:pagado?"#43A047":"#EDE7F6",color:pagado?"#fff":"#7B1FA2",
                        fontSize:16,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        {pi+1}
                      </div>}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:18,fontWeight:700,color:pagado?"#999":"#333",
                          textDecoration:pagado?"line-through":"none",whiteSpace:"nowrap"}}>{p.fecha}</div>
                        {p.notas && <div style={{fontSize:13,color:"#9C27B0",marginTop:2,fontStyle:"italic"}}>{p.notas}</div>}
                      </div>
                      <div style={{fontWeight:900,fontSize:22,color:pagado?"#1B5E20":"#7B1FA2",flexShrink:0,minWidth:160,textAlign:"right"}}>${fmt(p.monto)}</div>
                      <div style={{minWidth:130,textAlign:"right",flexShrink:0,fontSize:15,fontWeight:700,
                        color:pagado?"#1B5E20":dias<0?"#C62828":dias===0?"#E65100":dias<=7?"#E65100":"#999"}}>
                        {diasLabel(dias)}
                      </div>
                      <div style={{display:"flex",gap:4,flexShrink:0,width:148,justifyContent:"center"}}>
                        {!pagado && <button onClick={async()=>{await upsertProgramado({...p,estatus:"pagado"});const n=await fetchProgramados(empresaId);setProgramados(n);}}
                          style={{background:"#E8F5E9",border:"none",borderRadius:9,padding:"8px 12px",cursor:"pointer",fontSize:17}}>✅</button>}
                        {pagado && <button onClick={async()=>{await upsertProgramado({...p,estatus:"pendiente"});const n=await fetchProgramados(empresaId);setProgramados(n);}}
                          style={{background:"#EDE7F6",border:"none",borderRadius:9,padding:"8px 12px",cursor:"pointer",fontSize:16}}>↩️</button>}
                        <button onClick={()=>{setFormProg({...p});setProgSeriePopup(null);}}
                          style={{background:"#EDE7F6",border:"none",borderRadius:9,padding:"8px 12px",cursor:"pointer",fontSize:16}}>✏️</button>
                        <button onClick={async()=>{await deleteProgramado(p.id);const n=await fetchProgramados(empresaId);setProgramados(n);}}
                          style={{background:"#FFEBEE",border:"none",borderRadius:9,padding:"8px 12px",cursor:"pointer",fontSize:16}}>🗑️</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </>
          );
        })()}

        {/* ── Input oculto tarjeta CSV ── */}
        <input ref={tarjetaImportRef} type="file" accept=".csv" style={{display:"none"}}
          onChange={async(e)=>{
            const file = e.target.files[0];
            if(!file) return;
            e.target.value="";
            const text = await file.text();
            const lines = text.split("\n").filter(l=>l.trim());
            const headers = lines[0].split(",").map(h=>h.trim().replace(/"/g,""));
            const rows = lines.slice(1).map(line=>{
              const cols=[]; let cur="",inQ=false;
              for(let ch of line){if(ch==='"'){inQ=!inQ;}else if(ch===','&&!inQ){cols.push(cur);cur="";}else{cur+=ch;}}
              cols.push(cur);
              const r={}; headers.forEach((h,i)=>r[h]=cols[i]?.trim().replace(/"/g,"")||""); return r;
            }).filter(r=>r["Fecha operacion"]);
            const tarjetaId = tarjetas.find(t=>t.activo)?.id;
            const movs = rows.map(r=>({
              empresa_id: empresaId, tarjeta_id: tarjetaId||null,
              fecha: r["Fecha operacion"]||null,
              descripcion: r["Descripcion"]||"",
              monto: parseFloat((r["Monto ($)"]||"0").replace(/,/g,"")),
              tipo: r["Tipo"]||"", integrante: r["Integrante"]||"",
              no_autorizacion: r["No autorizacion"]||"",
              tarjeta_num: r["Número"]||"", estatus: r["Estatus"]||"", rfc: r["RFC"]||"",
            }));
            const cargos = movs.filter(m=>m.monto>0&&m.tipo!=="PAGO");
            const pagos  = movs.filter(m=>m.monto<0||m.tipo==="PAGO");
            setTarjetaImportPreview({movs, cargos, pagos, fileName:file.name});
          }}/>

        {/* Duplicate folios alert */}
        {dupeCount>0 && (
          <div onClick={()=>setShowDupes(true)} style={{background:"#FFEBEE",border:"1px solid #EF9A9A",borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
            <span style={{fontSize:20}}>⚠️</span>
            <span><b>{Object.keys(duplicates).length} folio{Object.keys(duplicates).length!==1?"s":""} duplicado{Object.keys(duplicates).length!==1?"s":""}</b> ({dupeCount} facturas). Haz clic para revisarlas.</span>
          </div>
        )}

        {/* ── UNIFIED FILTER + ACTION BAR ── */}
        <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:16,marginBottom:20,boxShadow:"0 2px 8px rgba(0,0,0,.05)",overflow:"hidden"}}>

          {/* Row 1: Filters — todas en una línea, fechas pareadas */}
          <div style={{padding:"12px 16px",display:"flex",gap:8,alignItems:"center",borderBottom:`1px solid ${C.border}`,flexWrap:"wrap"}}>

            <input ref={searchRef} placeholder="🔍 Buscar por proveedor, folio, concepto…" value={search} onChange={e=>setSearch(e.target.value)}
              style={{...inputStyle,width:340,flex:"0 0 auto"}} />

            {carteraTab !== "resumen" && gruposList.length>0 && (
              <select value={filtroGrupo} onChange={e=>setFiltroGrupo(e.target.value)}
                style={{...selectStyle,width:140,borderColor:filtroGrupo?C.blue:C.border,color:filtroGrupo?C.blue:C.text,fontWeight:filtroGrupo?700:400,flex:"0 0 auto"}}>
                <option value="">🏨 Grupo</option>
                {gruposList.map(g=><option key={g} value={g}>{g}</option>)}
              </select>
            )}

            <ProveedorPicker curInvoices={curInvoices} filtroProveedores={filtroProveedores} setFiltroProveedores={setFiltroProveedores} inputStyle={inputStyle} C={C}/>

            <select value={filters.clasificacion} onChange={e=>setFilters(f=>({...f,clasificacion:e.target.value}))}
              style={{...selectStyle,width:210,flex:"0 0 auto"}}>
              <option value="">Todas las clasificaciones</option>
              {clases.map(c=><option key={c}>{c}</option>)}
            </select>

            {carteraTab !== "activas" && (
              <select value={filters.estatus} onChange={e=>setFilters(f=>({...f,estatus:e.target.value}))}
                style={{...selectStyle,width:140,flex:"0 0 auto"}}>
                <option value="">Todos los estatus</option>
                {["Pendiente","Pagado","Vencido","Parcial"].map(s=><option key={s}>{s}</option>)}
              </select>
            )}

            {/* Filtro Tipo: Todos / Facturas / Egresos NF */}
            <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)}
              style={{...selectStyle,width:160,borderColor:filtroTipo!=='todos'?'#C62828':C.border,color:filtroTipo!=='todos'?'#C62828':C.text,fontWeight:filtroTipo!=='todos'?700:400,flex:"0 0 auto"}}>
              <option value="todos">📋 Todos los tipos</option>
              <option value="facturas">📄 Solo Facturas</option>
              <option value="egresos">💵 Solo Otros Pagos</option>
            </select>

            {(()=>{
              const mesesEnConcepto=[...new Set(curInvoices.filter(i=>i.estatus!=="Pagado").map(i=>detectarMesCxP(i.concepto)).filter(Boolean))];
              const hayNoIdent=curInvoices.filter(i=>i.estatus!=="Pagado"&&!detectarMesCxP(i.concepto)).length>0;
              return(
                <select value={filtroMesConcepto} onChange={e=>setFiltroMesConcepto(e.target.value)}
                  style={{...selectStyle,width:172,borderColor:filtroMesConcepto?C.blue:C.border,color:filtroMesConcepto?C.blue:C.text,fontWeight:filtroMesConcepto?700:400,flex:"0 0 auto"}}>
                  <option value="">📅 Mes en concepto</option>
                  {["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"].filter(m=>mesesEnConcepto.includes(m)).map(m=>(
                    <option key={m} value={m}>{m}</option>
                  ))}
                  {hayNoIdent&&<option value="__sin_mes__">⚠️ Sin mes identificado</option>}
                </select>
              );
            })()}



            <div style={{flex:1,minWidth:4}}/>

            {/* ✕ Limpiar — solo si hay algo activo */}
            {(search||filters.clasificacion||filters.estatus||filtroGrupo||filtroProveedores.size>0||filtroMesConcepto) && (
              <button onClick={()=>{setFilters({proveedor:"",clasificacion:"",estatus:"",fechaFrom:"",fechaTo:"",pagoFrom:"",pagoTo:""});setSearch("");setFiltroGrupo("");setFiltroProveedores(new Set());setFiltroMesConcepto("");}}
                style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${C.danger}`,background:"#FFEBEE",color:C.danger,cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit",flex:"0 0 auto",whiteSpace:"nowrap"}}>
                ✕ Limpiar
              </button>
            )}
          </div>

          {/* Row 2: Agrupar (Activas/Pagadas) | Ver por Grupo (Resumen) + Nueva Factura */}
          <div style={{padding:"8px 16px",background:"#FAFBFC",display:"flex",alignItems:"center",gap:8}}>
            {carteraTab !== "resumen" ? (
              <>
                <span style={{fontSize:12,color:C.muted,fontWeight:600,whiteSpace:"nowrap"}}>Agrupar:</span>
                {groupOptions.map(g=>(
                  <button key={g} onClick={()=>{setGrupoPor(g);if(grupo2===g)setGrupo2("");}}
                    style={{padding:"5px 13px",borderRadius:20,border:`1px solid ${grupoPor===g?C.blue:C.border}`,background:grupoPor===g?C.blue:"#fff",color:grupoPor===g?"#fff":C.text,cursor:"pointer",fontSize:12,fontWeight:grupoPor===g?700:500,fontFamily:"inherit",transition:"all .15s",whiteSpace:"nowrap"}}>
                    {g==="grupo"?"Grupo":g.charAt(0).toUpperCase()+g.slice(1)}
                  </button>
                ))}
                <span style={{width:1,height:20,background:C.border,margin:"0 4px",flexShrink:0}}/>
                <span style={{fontSize:12,color:C.muted,fontWeight:600,whiteSpace:"nowrap"}}>Luego:</span>
                <select value={grupo2} onChange={e=>setGrupo2(e.target.value)}
                  style={{...selectStyle,width:150,fontSize:12,borderColor:grupo2?C.teal:C.border,color:grupo2?C.teal:C.text,fontWeight:grupo2?700:400}}>
                  <option value="">Ninguno</option>
                  {groupOptions.filter(g=>g!==grupoPor).map(g=>(
                    <option key={g} value={g}>{g==="grupo"?"Grupo":g.charAt(0).toUpperCase()+g.slice(1)}</option>
                  ))}
                </select>
                <div style={{flex:1}}/>
                {!esConsulta && (
                  <>
                    <button onClick={()=>setModalListaNF(true)}
                      style={{padding:"7px 14px",fontSize:13,whiteSpace:"nowrap",border:`1px solid #C62828`,borderRadius:10,background:"#FFEBEE",color:"#C62828",cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>
                      💵 Otros Pagos
                    </button>
                    <button onClick={()=>setModalInv({tipo:"Factura",fecha:today(),serie:"",folio:"",uuid:"",proveedor:"",clasificacion:clases[0],subtotal:"",iva:"",retIsr:0,retIva:0,total:"",montoPagado:0,concepto:"",diasCredito:30,vencimiento:"",estatus:"Pendiente",fechaProgramacion:"",diasFicticios:0,referencia:"",notas:"",moneda:currency})}
                      style={{...btnStyle,padding:"7px 18px",fontSize:13,whiteSpace:"nowrap"}}>
                      + Nueva Factura
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <button ref={grupoPickerBtnRef} onClick={()=>setGrupoPickerOpenMain(p=>!p)}
                  style={{display:"flex",alignItems:"center",gap:6,padding:"6px 14px",border:`1px solid ${filtroGrupo?C.blue:C.border}`,borderRadius:10,background:filtroGrupo?"#E8F0FE":"#fff",color:filtroGrupo?C.blue:C.text,cursor:"pointer",fontSize:13,fontWeight:filtroGrupo?700:500,fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  🏨 {filtroGrupo||"Ver por Grupo"} ▾
                </button>
                {filtroGrupo && (
                  <button onClick={()=>setFiltroGrupo("")}
                    style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${C.danger}`,background:"#FFEBEE",color:C.danger,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>✕</button>
                )}
                <div style={{flex:1}}/>
                {!esConsulta && (
                  <>
                    <button onClick={()=>setModalListaNF(true)}
                      style={{padding:"7px 14px",fontSize:13,whiteSpace:"nowrap",border:`1px solid #C62828`,borderRadius:10,background:"#FFEBEE",color:"#C62828",cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>
                      💵 Otros Pagos
                    </button>
                    <button onClick={()=>setModalInv({tipo:"Factura",fecha:today(),serie:"",folio:"",uuid:"",proveedor:"",clasificacion:clases[0],subtotal:"",iva:"",retIsr:0,retIva:0,total:"",montoPagado:0,concepto:"",diasCredito:30,vencimiento:"",estatus:"Pendiente",fechaProgramacion:"",diasFicticios:0,referencia:"",notas:"",moneda:currency})}
                      style={{...btnStyle,padding:"7px 18px",fontSize:13,whiteSpace:"nowrap"}}>
                      + Nueva Factura
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Grupo picker dropdown for Resumen */}
        {carteraTab==="resumen" && grupoPickerOpenMain && (()=>{
          const rect = grupoPickerBtnRef.current?.getBoundingClientRect();
          const top = rect ? rect.bottom + 6 : 300;
          const left = rect ? rect.left : 200;
          return(
            <div style={{position:"fixed",inset:0,zIndex:500}} onClick={()=>setGrupoPickerOpenMain(false)}>
              <div style={{position:"fixed",top,left,background:"#fff",border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 8px 24px rgba(0,0,0,.2)",minWidth:220,overflow:"hidden",zIndex:501}}
                onClick={e=>e.stopPropagation()}>
                <div style={{padding:"10px 16px",background:C.navy,color:"#fff",fontWeight:700,fontSize:13}}>🏨 Seleccionar Grupo</div>
                <div onClick={()=>{setFiltroGrupo("");setGrupoPickerOpenMain(false);}}
                  style={{padding:"10px 16px",cursor:"pointer",fontSize:13,color:!filtroGrupo?C.blue:C.text,fontWeight:!filtroGrupo?700:400,background:!filtroGrupo?"#E8F0FE":"#fff",borderBottom:`1px solid ${C.border}`}}>
                  Todos los grupos
                </div>
                {gruposList.map(g=>(
                  <div key={g} onClick={()=>{setFiltroGrupo(g);setGrupoPickerOpenMain(false);}}
                    style={{padding:"10px 16px",cursor:"pointer",fontSize:13,color:filtroGrupo===g?C.blue:C.text,fontWeight:filtroGrupo===g?700:400,background:filtroGrupo===g?"#E8F0FE":"#fff",borderBottom:`1px solid ${C.border}`}}
                    onMouseEnter={e=>{if(filtroGrupo!==g)e.currentTarget.style.background="#F8FAFC";}}
                    onMouseLeave={e=>{e.currentTarget.style.background=filtroGrupo===g?"#E8F0FE":"#fff";}}>
                    {g}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
        {selectedIds.size > 0 && (()=>{
          const selInvs = (invoices[currency]||[]).filter(i=>selectedIds.has(i.id));
          const selTotal = selInvs.reduce((s,i)=>s+(+i.total||0),0);
          const selSaldo = selInvs.reduce((s,i)=>s+((+i.total||0)-(+i.montoPagado||0)),0);
          return (
          <div style={{background:"#E8F0FE",border:`2px solid ${C.blue}`,borderRadius:14,padding:"16px 22px",marginBottom:20,display:"flex",gap:14,alignItems:"center",flexWrap:"wrap",position:"sticky",top:0,zIndex:10,boxShadow:"0 4px 16px rgba(0,0,0,.1)"}}>
            <div style={{fontWeight:800,color:C.blue,fontSize:16,marginRight:8}}>
              ✅ {selectedIds.size} factura{selectedIds.size!==1?"s":""} seleccionada{selectedIds.size!==1?"s":""}
              <span style={{fontWeight:700,fontSize:14,color:C.navy,marginLeft:12}}>Total: ${fmt(selTotal)} · Saldo: ${fmt(selSaldo)}</span>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",flex:1}}>
              <select value={bulkClasif} onChange={e=>!esConsulta&&setBulkClasif(e.target.value)} style={{...selectStyle,maxWidth:160,padding:"8px 12px",fontSize:13}}>
                <option value="">Clasificación…</option>
                {clases.map(c=><option key={c}>{c}</option>)}
              </select>
              <select value={bulkEstatus} onChange={e=>setBulkEstatus(e.target.value)} style={{...selectStyle,maxWidth:140,padding:"8px 12px",fontSize:13}}>
                <option value="">Estatus…</option>
                {["Pendiente","Pagado","Vencido","Parcial"].map(s=><option key={s}>{s}</option>)}
              </select>
              {!esConsulta && <button onClick={applyBulkEdit} disabled={!bulkClasif&&!bulkEstatus} style={{...btnStyle,padding:"9px 20px",fontSize:14,opacity:(!bulkClasif&&!bulkEstatus)?0.5:1}}>
                Aplicar cambios
              </button>}
              {!esConsulta && <span style={{width:1,height:28,background:C.border,margin:"0 4px"}}/>}
              {!esConsulta && <button onClick={()=>setBulkPayModal("programado")} style={{...btnStyle,padding:"9px 18px",fontSize:13,background:"#F57F17",color:"#fff"}}>📅 Programar pago</button>}
              {!esConsulta && <button onClick={()=>setBulkPayModal("realizado")} style={{...btnStyle,padding:"9px 18px",fontSize:13,background:C.ok,color:"#fff"}}>💰 Registrar pago</button>}
              <button onClick={()=>{setSelectedIds(new Set());setBulkClasif("");setBulkEstatus("");setBulkPayModal(null);}} style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"9px 16px",fontSize:14,fontWeight:700}}>
                Cancelar
              </button>
            </div>
          </div>
          );
        })()}
        {/* ── PESTAÑA RESUMEN ── */}
        {carteraTab === "resumen" && (
          <>
          {/* Excel + PDF top right */}
          <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:12}}>
            <button id="cxp-excel-btn"
              style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:10,border:"1px solid #2E7D32",background:"#E8F5E9",color:"#2E7D32",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
              📊 Excel
            </button>
            <button id="cxp-pdf-btn"
              style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:10,border:"1px solid #1565C0",background:"#E3F2FD",color:"#1565C0",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
              🖨️ PDF / Imprimir
            </button>
          </div>
          <ResumenCartera
            invoices={curInvoices}
            suppliers={suppliers}
            currency={currency}
            filtroGrupo={filtroGrupo}
            setFiltroGrupo={setFiltroGrupo}
            gruposList={gruposList}
            filtroProveedores={filtroProveedores}
            searchQuery={search}
            filtroMesConcepto={filtroMesConcepto}
            filtroClasif={filters.clasificacion}
            filtroEstatus={filters.estatus}
            excelBtnId="cxp-excel-btn"
            pdfBtnId="cxp-pdf-btn"
            fmt={fmt}
            C={C}
          />
          </>
        )}

        {/* ── PESTAÑAS ACTIVAS / PAGADAS ── */}
        {carteraTab !== "resumen" && (
        <>
        {/* ── KPI Aging chips ── */}
        {(()=>{
          const pend = filtered.filter(i=>i.estatus!=="Pagado");
          const sOf = i => (+i.total||0)-(+i.montoPagado||0);
          const calcD = v => v?Math.ceil((new Date(v)-new Date(today()))/864e5):null;
          const sumS = arr => arr.reduce((s,i)=>s+sOf(i),0);
          const total = sumS(pend);
          const corriente = sumS(pend.filter(i=>{ const d=calcD(i.vencimiento); return d===null||d>=0; }));
          const v7   = sumS(pend.filter(i=>{ const d=calcD(i.vencimiento); return d!==null&&d<0&&Math.abs(d)<=7; }));
          const v15  = sumS(pend.filter(i=>{ const d=calcD(i.vencimiento); return d!==null&&d<0&&Math.abs(d)>7&&Math.abs(d)<=15; }));
          const v30  = sumS(pend.filter(i=>{ const d=calcD(i.vencimiento); return d!==null&&d<0&&Math.abs(d)>15&&Math.abs(d)<=30; }));
          const v60  = sumS(pend.filter(i=>{ const d=calcD(i.vencimiento); return d!==null&&d<0&&Math.abs(d)>30&&Math.abs(d)<=60; }));
          const vmas = sumS(pend.filter(i=>{ const d=calcD(i.vencimiento); return d!==null&&d<0&&Math.abs(d)>60; }));

          const openChip=(title,items)=>{ setDashSearch("");setDashFilterProv("");setDashFilterClasif("");setDashFilterEstatus("");setDashGroupBy("");setDashSelectedIds(new Set());setDashBulkAutDir(""); setDashDetail({title,type:"invoices",items,grouped:true}); };

          const chips = [
            {l:"Saldo Total",      v:total,     c:"#fff",    bg:"#0F2D4A",border:"#0F2D4A", inv:pend},
            {l:"Corriente",  v:corriente, c:"#1B5E20", bg:"#E8F5E9",border:"#A5D6A7", inv:pend.filter(i=>{const d=calcD(i.vencimiento);return d===null||d>=0;})},
            {l:"Vencido 1-7 Días",  v:v7,        c:"#E65100", bg:"#FFF3E0",border:"#FFCC80", inv:pend.filter(i=>{const d=calcD(i.vencimiento);return d!==null&&d<0&&Math.abs(d)<=7;})},
            {l:"Vencido 8-15 Días", v:v15,       c:"#BF360C", bg:"#FBE9E7",border:"#FF8A65", inv:pend.filter(i=>{const d=calcD(i.vencimiento);return d!==null&&d<0&&Math.abs(d)>7&&Math.abs(d)<=15;})},
            {l:"Vencido 16-30 Días",v:v30,       c:"#fff",    bg:"#E53935",border:"#E53935", inv:pend.filter(i=>{const d=calcD(i.vencimiento);return d!==null&&d<0&&Math.abs(d)>15&&Math.abs(d)<=30;})},
            {l:"Vencido 31-60 Días",v:v60,       c:"#fff",    bg:"#B71C1C",border:"#B71C1C", inv:pend.filter(i=>{const d=calcD(i.vencimiento);return d!==null&&d<0&&Math.abs(d)>30&&Math.abs(d)<=60;})},
            {l:"Vencido +60 Días",  v:vmas,      c:"#fff",    bg:"#4A0000",border:"#4A0000", inv:pend.filter(i=>{const d=calcD(i.vencimiento);return d!==null&&d<0&&Math.abs(d)>60;})},
          ].filter(k=>k.v>0);

          if(!chips.length) return null;
          return(
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
              {chips.map(k=>(
                <div key={k.l} onClick={()=>openChip(`${currency} — ${k.l}`,k.inv)}
                  style={{background:k.bg,border:`2px solid ${k.border}`,borderRadius:14,padding:"14px 20px",cursor:"pointer",minWidth:130,transition:"all .15s",boxShadow:"0 2px 6px rgba(0,0,0,.08)"}}
                  onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.04)";e.currentTarget.style.boxShadow="0 6px 16px rgba(0,0,0,.15)";}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="0 2px 6px rgba(0,0,0,.08)";}}>
                  <div style={{fontSize:10,color:k.c,fontWeight:700,textTransform:"uppercase",opacity:.85,marginBottom:4,letterSpacing:.5}}>{k.l}</div>
                  <div style={{fontSize:20,fontWeight:900,color:k.c}}>${fmt(k.v)}</div>
                  <div style={{fontSize:10,color:k.c,opacity:.75,marginTop:2}}>{k.inv.length} fact.</div>
                </div>
              ))}
            </div>
          );
        })()}
        {Object.entries(grouped).sort((a,b)=>{
          const sA=( a[1].invoices||Object.values(a[1].subgroups||{}).flat()).filter(i=>i.estatus!=="Pagado").reduce((s,i)=>s+((+i.total||0)-(+i.montoPagado||0)),0);
          const sB=(b[1].invoices||Object.values(b[1].subgroups||{}).flat()).filter(i=>i.estatus!=="Pagado").reduce((s,i)=>s+((+i.total||0)-(+i.montoPagado||0)),0);
          return sB-sA;
        }).map(([g1, data]) => {
          const invs = data.invoices || Object.values(data.subgroups||{}).flat();
          const saldo = invs.filter(i=>i.estatus!=="Pagado").reduce((s,i)=>s+((+i.total||0)-(+i.montoPagado||0)),0);
          const vencidas = invs.filter(i=>isOverdue(i.vencimiento,i.estatus)).length;
          const expanded = expandedGroups.has(g1);
          const toggle = () => setExpandedGroups(prev=>{const n=new Set(prev);n.has(g1)?n.delete(g1):n.add(g1);return n;});
          return(
            <div key={g1} style={{marginBottom:12,border:`1px solid ${expanded?"#90CAF9":C.border}`,borderRadius:12,overflow:"hidden",transition:"border-color .2s"}}>
              {/* Accordion header */}
              <div onClick={toggle} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 18px",background:expanded?"#E8F0FE":"#F8FAFC",cursor:"pointer",transition:"background .15s"}}
                onMouseEnter={e=>{if(!expanded)e.currentTarget.style.background="#F0F4FF";}}
                onMouseLeave={e=>{if(!expanded)e.currentTarget.style.background="#F8FAFC";}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:13,color:expanded?C.blue:C.muted,transition:"transform .2s",display:"inline-block",transform:expanded?"rotate(90deg)":"rotate(0deg)"}}>▶</span>
                  <div>
                    <span style={{fontWeight:800,fontSize:15,color:C.navy}}>{g1||"—"}</span>
                    <span style={{fontSize:12,color:C.muted,marginLeft:10}}>{invs.length} factura{invs.length!==1?"s":""}</span>
                    {vencidas>0 && <span style={{marginLeft:8,background:"#FFEBEE",color:C.danger,fontWeight:700,fontSize:11,padding:"1px 8px",borderRadius:20}}>⚠️ {vencidas} vencida{vencidas!==1?"s":""}</span>}
                  </div>
                </div>
                <div style={{display:"flex",gap:20,alignItems:"center"}}>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:13,color:C.muted,fontWeight:600}}>Saldo</div>
                    <div style={{fontSize:16,fontWeight:800,color:saldo>0?C.warn:C.ok}}>${fmt(saldo)}</div>
                  </div>
                </div>
              </div>
              {/* Accordion content */}
              {expanded && (
                <div>
                  {data.invoices ? (
                    <>
                      <InvoiceTable invs={data.invoices}/>
                    </>
                  ) : (
                    Object.entries(data.subgroups).map(([g2, invs2]) => (
                      <div key={g2} style={{marginLeft:16,marginBottom:16}}>
                        <GroupHeader label={`${grupo2.charAt(0).toUpperCase()+grupo2.slice(1)}: ${g2}`} invs={invs2}/>
                        <InvoiceTable invs={invs2}/>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length===0 && carteraTab !== "resumen" && (
          <div style={{textAlign:"center",padding:60,color:C.muted}}>
            <div style={{fontSize:48,marginBottom:12}}>📭</div>
            <div style={{fontSize:16}}>Sin facturas que mostrar</div>
          </div>
        )}
        </>
        )}
      </div>
    );
  };

  /* ── PROVEEDORES ────────────────────────────────────────────────────── */
  const renderProveedores = () => {
    const filteredSups = suppliers.filter(sup => {
      if(!supSearch) return true;
      const q = supSearch.toLowerCase();
      return sup.nombre.toLowerCase().includes(q) || sup.rfc.toLowerCase().includes(q) || sup.contacto.toLowerCase().includes(q) || sup.email.toLowerCase().includes(q) || sup.clasificacion.toLowerCase().includes(q);
    });
    const incomplete = suppliers.filter(s=>!s.rfc || !s.contacto || !s.email).length;

    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <h1 style={{fontSize:22,fontWeight:800,color:C.navy}}>Catálogo de Proveedores</h1>
            <p style={{color:C.muted,fontSize:14}}>{suppliers.filter(s=>s.activo).length} activos · {suppliers.length} total</p>
          </div>
          {!esConsulta && <button onClick={()=>setModalSup({nombre:"",rfc:"",moneda:"MXN",diasCredito:30,contacto:"",telefono:"",email:"",banco:"",clabe:"",clasificacion:clases[0],activo:true,grupo:""})} style={btnStyle}>+ Nuevo Proveedor</button>}
        </div>
        {/* Alert for incomplete suppliers */}
        {incomplete>0 && (
          <div style={{background:"#FFF3E0",border:"1px solid #FFB74D",borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:20}}>⚠️</span>
            <span><b>{incomplete} proveedor{incomplete!==1?"es":""}</b> con datos incompletos (sin RFC, contacto o email). Búscalos y completa su información.</span>
          </div>
        )}
        {/* Search bar */}
        <div style={{marginBottom:20}}>
          <input placeholder="🔍 Buscar proveedor por nombre, RFC, contacto, email o clasificación…" value={supSearch} onChange={e=>setSupSearch(e.target.value)}
            style={{...inputStyle,maxWidth:500,fontSize:14}}/>
        </div>
        {filteredSups.length===0 && (
          <div style={{textAlign:"center",padding:40,color:C.muted}}>
            <div style={{fontSize:36,marginBottom:8}}>🔍</div>
            <div>No se encontraron proveedores con "{supSearch}"</div>
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:16}}>
          {filteredSups.map(sup=>{
            const isIncomplete = !sup.rfc || !sup.contacto || !sup.email;
            return (
              <div key={sup.id} style={{background:C.surface,border:`1px solid ${isIncomplete?"#FFB74D":C.border}`,borderRadius:16,padding:20,opacity:sup.activo?1:.5,position:"relative"}}>
                {isIncomplete && <div style={{position:"absolute",top:8,right:8,background:"#FFF3E0",color:"#E65100",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700}}>⚠️ Incompleto</div>}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,color:C.navy}}>{sup.nombre}</div>
                    <div style={{fontSize:12,color:sup.rfc?C.muted:C.danger,fontStyle:sup.rfc?"normal":"italic"}}>{sup.rfc||"Sin RFC — completar"}</div>
                  </div>
                  <div style={{display:"flex",gap:6,marginTop:isIncomplete?16:0}}>
                    <span style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[sup.moneda],color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[sup.moneda],padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700}}>{sup.moneda}</span>
                    {!esConsulta && <button onClick={()=>setModalSup({...sup})} style={{...iconBtn,color:C.sky}}>✏️</button>}
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:13}}>
                  <div><span style={{color:C.muted}}>Crédito: </span><b>{sup.diasCredito} días</b></div>
                  <div><span style={{color:C.muted}}>Categ: </span><b>{sup.clasificacion}</b></div>
                  <div style={{gridColumn:"1/-1"}}><span style={{color:C.muted}}>👤 </span>{sup.contacto||<span style={{color:C.danger,fontStyle:"italic"}}>Sin contacto</span>}</div>
                  <div><span style={{color:C.muted}}>📞 </span>{sup.telefono||"—"}</div>
                  <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><span style={{color:C.muted}}>📧 </span>{sup.email||<span style={{color:C.danger,fontStyle:"italic"}}>Sin email</span>}</div>
                  <div><span style={{color:C.muted}}>🏦 </span>{sup.banco||"—"}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* ── PROYECCIÓN ─────────────────────────────────────────────────────── */
  const renderProyeccionCxP = () => {
    return (
      <div>
        <h1 style={{fontSize:22,fontWeight:800,color:C.navy,marginBottom:4}}>Proyección de Pagos</h1>
        <p style={{color:C.muted,fontSize:14,marginBottom:24}}>Matriz de proveedores por día</p>
        {renderMatrizProyeccion()}
      </div>
    );
  };

  // Función original de proyección (sin tabs) para CxC  
  const renderProyeccion = () => {
    return renderMatrizProyeccion();
  };

  // Separar la matriz original en su propia función
  const renderMatrizProyeccion = () => {
    const {providers,dates,matrix} = projMatrix;
    const dateTotals = {};
    dates.forEach(d=>{ dateTotals[d]=providers.reduce((s,p)=>s+(matrix[p]?.[d]?.total||0),0); });
    const grandTotal = Object.values(dateTotals).reduce((s,v)=>s+v,0);
    // Currency color helpers for cells
    const curBg = {MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"};
    const curBorder = {MXN:"#90CAF9",USD:"#A5D6A7",EUR:"#CE93D8"};
    const curColor = {MXN:C.mxn,USD:C.usd,EUR:C.eur};
    const curSymbol = {MXN:"$",USD:"US$",EUR:"€"};
    // Determine dominant currency for a cell
    const cellCurrency = (cell) => {
      if(!cell) return "MXN";
      const {byCur} = cell;
      const curs = Object.entries(byCur).filter(([,v])=>v>0);
      if(curs.length===1) return curs[0][0];
      // Mixed currencies
      return "MIXED";
    };

    return (
      <div>
        <p style={{color:C.muted,fontSize:14,marginBottom:16}}>Basada en la fecha de programación de pago. Si no tiene, usa la fecha de vencimiento.</p>
        {/* Currency legend */}
        <div style={{display:"flex",gap:16,marginBottom:20,flexWrap:"wrap"}}>
          {[["MXN","🇲🇽"],["USD","🇺🇸"],["EUR","🇪🇺"]].map(([c,flag])=>(
            <div key={c} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 12px",borderRadius:20,background:curBg[c],border:`1px solid ${curBorder[c]}`}}>
              <span>{flag}</span>
              <span style={{fontWeight:700,color:curColor[c],fontSize:12}}>{c}</span>
              <span style={{width:16,height:16,borderRadius:4,background:curColor[c],display:"inline-block",opacity:.7}}/>
            </div>
          ))}
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 12px",borderRadius:20,background:"#FFF8E1",border:"1px solid #FFE082"}}>
            <span style={{fontWeight:700,color:"#F57F17",fontSize:12}}>Multi-moneda</span>
            <span style={{width:16,height:16,borderRadius:4,background:"linear-gradient(135deg,#1565C0,#2E7D32,#6A1B9A)",display:"inline-block"}}/>
          </div>
        </div>
        {/* Date range + search (optional) */}
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:20,marginBottom:24,display:"flex",gap:20,alignItems:"center",flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:12,color:C.muted,fontWeight:600,marginBottom:4}}>FILTRAR POR RANGO <span style={{fontWeight:400,fontStyle:"italic"}}>(opcional)</span></div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <input type="date" value={projFrom} onChange={e=>setProjFrom(e.target.value)} style={{...inputStyle,width:160}}/>
              <span style={{color:C.muted}}>a</span>
              <input type="date" value={projTo} onChange={e=>setProjTo(e.target.value)} style={{...inputStyle,width:160}}/>
              {(projFrom||projTo) && <button onClick={()=>{setProjFrom("");setProjTo("");}} style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"6px 12px",fontSize:12}}>✕ Limpiar</button>}
            </div>
          </div>
          <div>
            <div style={{fontSize:12,color:C.muted,fontWeight:600,marginBottom:4}}>BUSCAR</div>
            <input placeholder="🔍 Proveedor, folio, importe…" value={projSearch} onChange={e=>setProjSearch(e.target.value)} style={{...inputStyle,width:250}}/>
          </div>
          <div style={{display:"flex",gap:12,alignItems:"center",marginLeft:"auto",flexWrap:"wrap"}}>
            <div style={{background:"#E8F5E9",border:"1px solid #A5D6A7",borderRadius:8,padding:"8px 14px",fontSize:13}}>📅 {dates.length} fecha{dates.length!==1?"s":""} · {providers.length} prov.</div>
            {(()=>{
              // Compute totals per currency from all matrix cells
              const totByCur = {MXN:0,USD:0,EUR:0};
              providers.forEach(p=>dates.forEach(d=>{
                const cell=matrix[p]?.[d];
                if(cell) Object.entries(cell.byCur).forEach(([c,v])=>{totByCur[c]=(totByCur[c]||0)+v;});
              }));
              return Object.entries(totByCur).filter(([,v])=>v>0).map(([cur,v])=>(
                <div key={cur} style={{background:curBg[cur],border:`1px solid ${curBorder[cur]}`,borderRadius:8,padding:"6px 14px",fontSize:13,fontWeight:700,color:curColor[cur],display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:11,opacity:.7}}>{cur}</span>
                  <span>{cur==="EUR"?"€":cur==="USD"?"US$":"$"}{fmt(v)}</span>
                </div>
              ));
            })()}
          </div>
        </div>
        {/* Matrix — always shown if there's data */}
        {dates.length>0&&(
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden"}}>
            <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,background:"#F8FAFC"}}>
              <h3 style={{fontSize:15,fontWeight:700,color:C.navy,margin:0}}>📊 Matriz de Pagos por Proveedor × Día</h3>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{borderCollapse:"collapse",fontSize:12,minWidth:Math.max(600,180+dates.length*130)}}>
                <thead><tr style={{background:C.navy}}>
                  <th style={{padding:"10px 14px",textAlign:"left",color:"#fff",fontWeight:700,fontSize:12,position:"sticky",left:0,background:C.navy,zIndex:2,minWidth:160}}>Proveedor</th>
                  {dates.map(d=><th key={d} style={{padding:"10px 8px",textAlign:"center",color:"#fff",fontWeight:600,fontSize:11,whiteSpace:"nowrap",minWidth:120}}>{fmtDateLabel(d)}</th>)}
                  <th style={{padding:"10px 14px",textAlign:"right",color:"#FFC107",fontWeight:800,fontSize:12}}>TOTAL</th>
                </tr></thead>
                <tbody>
                  {providers.map((prov,pIdx)=>{
                    const provTotal=dates.reduce((s,d)=>s+(matrix[prov]?.[d]?.total||0),0);
                    return (
                      <tr key={prov} style={{borderTop:`1px solid ${C.border}`,background:pIdx%2===0?C.surface:"#FAFBFC"}}>
                        <td style={{padding:"10px 14px",fontWeight:700,color:C.navy,position:"sticky",left:0,background:pIdx%2===0?C.surface:"#FAFBFC",zIndex:1,borderRight:`1px solid ${C.border}`}}>{prov}</td>
                        {dates.map(d=>{
                          const cell=matrix[prov]?.[d];
                          if(!cell) return <td key={d} style={{padding:"8px 8px",textAlign:"center"}}><span style={{color:"#E0E0E0"}}>—</span></td>;
                          const cc = cellCurrency(cell);
                          const isMixed = cc==="MIXED";
                          const bg = isMixed ? "#FFF8E1" : curBg[cc];
                          const border = isMixed ? "#FFE082" : curBorder[cc];
                          const color = isMixed ? "#F57F17" : curColor[cc];
                          return (
                            <td key={d} style={{padding:"6px 6px",textAlign:"center"}}>
                              <button onClick={()=>setProjDetail({proveedor:prov,fecha:d,invoices:cell.invoices})}
                                style={{background:bg,border:`2px solid ${border}`,borderRadius:8,padding:"5px 8px",cursor:"pointer",fontWeight:700,fontSize:12,color,width:"100%",fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}
                                onMouseEnter={e=>{e.currentTarget.style.opacity="0.8";e.currentTarget.style.transform="scale(1.03)";}}
                                onMouseLeave={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.transform="scale(1)";}}>
                                <span>${fmt(cell.total)}</span>
                                {/* Currency label(s) only */}
                                <span style={{display:"flex",gap:3,justifyContent:"center",flexWrap:"wrap"}}>
                                  {Object.entries(cell.byCur).filter(([,v])=>v>0).map(([cur])=>(
                                    <span key={cur} style={{fontSize:9,fontWeight:700,color:curColor[cur],background:`${curColor[cur]}18`,padding:"1px 5px",borderRadius:8,lineHeight:"14px"}}>
                                      {cur}
                                    </span>
                                  ))}
                                </span>
                              </button>
                            </td>
                          );
                        })}
                        <td style={{padding:"10px 14px",textAlign:"right",fontWeight:800,color:C.navy}}>${fmt(provTotal)}</td>
                      </tr>
                    );
                  })}
                  <tr style={{borderTop:`2px solid ${C.navy}`,background:"#EEF2FF"}}>
                    <td style={{padding:"10px 14px",fontWeight:800,color:C.navy,position:"sticky",left:0,background:"#EEF2FF",zIndex:1,borderRight:`1px solid ${C.border}`}}>TOTAL</td>
                    {dates.map(d=><td key={d} style={{padding:"10px 8px",textAlign:"center",fontWeight:800,color:C.navy,fontSize:12}}>{dateTotals[d]>0?`$${fmt(dateTotals[d])}`:"—"}</td>)}
                    <td style={{padding:"10px 14px",textAlign:"right",fontWeight:900,color:C.danger,fontSize:14}}>${fmt(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {providers.length===0 && <div style={{textAlign:"center",padding:40,color:C.muted}}>No hay facturas pendientes{projSearch?" con ese filtro":""}</div>}
          </div>
        )}
        {dates.length===0 && (
          <div style={{textAlign:"center",padding:60,color:C.muted,background:C.surface,borderRadius:14,border:`1px solid ${C.border}`}}>
            <div style={{fontSize:48,marginBottom:12}}>📭</div>
            <div style={{fontSize:16,fontWeight:600}}>No hay facturas pendientes de pago</div>
            <div style={{fontSize:13}}>Agrega facturas en Cartera o importa desde Excel</div>
          </div>
        )}
      </div>
    );
  };

  /* ── Reporte Diario de Pagos (CxP) ─────────────────────────────── */
  const ReporteDiarioCxP = () => {
    // Selector de fecha (default = hoy)
    const [fechaSeleccionada, setFechaSeleccionada] = useState(today());
    const esHoy = fechaSeleccionada === today();
    const esVistaHistorica = !esHoy;
    
    // Modal de detalle (drill-down al hacer clic en importes)
    const [detalleModal, setDetalleModal] = useState(null); // { pago, tipo: 'adeudo' | 'pago' }
    
    // Modal de importación de Ingresos del Día (estado de cuenta)
    const [importarIngresosModal, setImportarIngresosModal] = useState(null);

    // Edición histórica: solo admin, requiere confirmación
    const [edicionHistoricaHabilitada, setEdicionHistoricaHabilitada] = useState(false);
    const esAdmin = (user?.rol || '').toLowerCase() === 'superadmin';
    // bloqueoEdicion = true cuando NO se puede editar
    const bloqueoEdicion = esVistaHistorica && !edicionHistoricaHabilitada;

    // Si cambia la fecha, resetear edición histórica
    useEffect(() => { setEdicionHistoricaHabilitada(false); }, [fechaSeleccionada]);

    const [saldosEmpresas, setSaldosEmpresas] = useState({ [empresaId]: { mxn: "0", usd: "0", eur: "0" } });
    const [saldosMeta, setSaldosMeta] = useState({ updatedAt: null, updatedBy: null, fuente: null });
    const [saldosLoading, setSaldosLoading] = useState(true);
    const [saldosSaving, setSaldosSaving] = useState(false);
    const [editando, setEditando] = useState({});
    const [tiposCambio, setTiposCambio] = useState({ usdMxn: "20.00", eurMxn: "22.00" });
    const [conversiones, setConversiones] = useState({ usd_to_mxn: "", eur_to_mxn: "" });
    const [sortBy, setSortBy] = useState(null);
    const [sortDir, setSortDir] = useState('desc');

    // Ingresos del día
    const [ingresosDia, setIngresosDia] = useState([]);
    const [ingresosLoading, setIngresosLoading] = useState(true);
    const [editandoIngreso, setEditandoIngreso] = useState(null);
    const [valorIngreso, setValorIngreso] = useState("");
    
    // Cambios de divisa
    const [cambiosHoy, setCambiosHoy] = useState([]);
    const [editandoCambio, setEditandoCambio] = useState(null);
    const [valorCambio, setValorCambio] = useState('');

    // Sugerencias de autocompletado para Ingresos (rubro/cliente/concepto)
    const [sugerencias, setSugerencias] = useState({ rubros: [], clientes: [], conceptos: [] });
    const [sugerenciaIdx, setSugerenciaIdx] = useState(-1); // índice navegado con flechas
    useEffect(() => {
      fetchSugerenciasIngresos(empresaId).then(setSugerencias);
    }, [empresaId, ingresosDia.length]); // recargar si cambia la cantidad (nueva captura)

    // Cargar saldos del Reporte Diario por fecha:
    // 1. Si la fecha tiene saldo guardado en saldos_reporte_dia → usarlo
    // 2. Si no: buscar el último saldo guardado anterior, calcular el saldo final
    //    de ese día (saldo + ingresos ± cambios − pagos) y heredarlo
    // 3. Si no hay nada anterior: ceros (primer día de uso)
    useEffect(() => {
      let cancelado = false;
      setSaldosLoading(true);
      const cargar = async () => {
        // Paso 1: ¿hay saldo guardado para la fecha seleccionada?
        const guardado = await fetchSaldoReporteDia(empresaId, fechaSeleccionada);
        if (cancelado) return;
        if (guardado) {
          setSaldosEmpresas({ [empresaId]: { mxn: guardado.mxn, usd: guardado.usd, eur: guardado.eur } });
          setSaldosMeta({ updatedAt: guardado.updatedAt, updatedBy: guardado.updatedBy, fuente: 'guardado' });
          setSaldosLoading(false);
          return;
        }
        // Paso 2: buscar el último día con saldo guardado anterior a la fecha seleccionada
        const ultimo = await fetchUltimoSaldoReporteAntes(empresaId, fechaSeleccionada);
        if (cancelado) return;
        if (!ultimo) {
          setSaldosEmpresas({ [empresaId]: { mxn: "0", usd: "0", eur: "0" } });
          setSaldosMeta({ updatedAt: null, updatedBy: null, fuente: 'inicial' });
          setSaldosLoading(false);
          return;
        }
        // Reconstrucción en cadena: aplicar movimientos de TODOS los días desde `ultimo.fecha`
        // hasta el día anterior a `fechaSeleccionada`.
        let saldoMXN = ultimo.mxn;
        let saldoUSD = ultimo.usd;
        let saldoEUR = ultimo.eur;
        // Generar todas las fechas desde ultimo.fecha hasta fechaSeleccionada-1
        const fechas = [];
        const cursor = new Date(ultimo.fecha + 'T12:00:00');
        const fin = new Date(fechaSeleccionada + 'T12:00:00');
        while (cursor < fin) {
          fechas.push(cursor.toISOString().slice(0, 10));
          cursor.setDate(cursor.getDate() + 1);
        }
        // Para cada fecha, aplicar: + ingresos ± cambios − pagos (programados Y realizados)
        for (const f of fechas) {
          const movs = await fetchMovimientosDia(empresaId, f);
          if (cancelado) return;
          // Ingresos
          const ingMXN = movs.ingresos.reduce((s, i) => s + (+i.montoMXN || 0), 0);
          const ingUSD = movs.ingresos.reduce((s, i) => s + (+i.montoUSD || 0), 0);
          const ingEUR = movs.ingresos.reduce((s, i) => s + (+i.montoEUR || 0), 0);
          // Cambios de divisa
          const porDir = {};
          movs.cambios.forEach(c => { porDir[c.direccion] = c; });
          const usdMxn = porDir['USD_MXN'] || { montoVendido:0, montoComprado:0 };
          const mxnUsd = porDir['MXN_USD'] || { montoVendido:0, montoComprado:0 };
          const eurMxn = porDir['EUR_MXN'] || { montoVendido:0, montoComprado:0 };
          const mxnEur = porDir['MXN_EUR'] || { montoVendido:0, montoComprado:0 };
          const camMXN = (+usdMxn.montoComprado||0) + (+eurMxn.montoComprado||0)
                       - (+mxnUsd.montoVendido||0)  - (+mxnEur.montoVendido||0);
          const camUSD = (+mxnUsd.montoComprado||0) - (+usdMxn.montoVendido||0);
          const camEUR = (+mxnEur.montoComprado||0) - (+eurMxn.montoVendido||0);
          // Pagos de ese día: si una factura tiene pago realizado en esa fecha,
          // ignoramos el programado (es el mismo pago, ya ejecutado).
          const todosLosPagos = (payments || []).filter(p => 
            (p.tipo === 'programado' || p.tipo === 'realizado') && p.fechaPago === f
          );
          // Agrupar por invoiceId y priorizar realizados
          const pagosPorFactura = new Map(); // invoiceId → array de pagos
          todosLosPagos.forEach(p => {
            if (!pagosPorFactura.has(p.invoiceId)) pagosPorFactura.set(p.invoiceId, []);
            pagosPorFactura.get(p.invoiceId).push(p);
          });
          const pagosFecha = [];
          pagosPorFactura.forEach((arr) => {
            const realizados = arr.filter(p => p.tipo === 'realizado');
            if (realizados.length > 0) {
              pagosFecha.push(...realizados);
            } else {
              pagosFecha.push(...arr);
            }
          });
          const pagosPorMon = { MXN:0, USD:0, EUR:0 };
          pagosFecha.forEach(p => {
            // SOLO los pagos por BANCO afectan el saldo bancario.
            // Los pagos con TDC u Otro NO salen del banco (se cargan a TDC y se pagan después).
            const metodo = (p.metodo_pago || p.metodoPago || 'banco').toLowerCase();
            if (metodo !== 'banco') return;
            let monedaFactura = 'MXN';
            for (const mon of ['MXN','USD','EUR']) {
              if ((invoices[mon] || []).find(f2 => f2.id === p.invoiceId && f2.empresaId === empresaId)) {
                monedaFactura = mon; break;
              }
            }
            pagosPorMon[monedaFactura] += (+p.monto || 0);
          });
          // Aplicar movimientos del día al saldo acumulado
          saldoMXN = saldoMXN + ingMXN + camMXN - pagosPorMon.MXN;
          saldoUSD = saldoUSD + ingUSD + camUSD - pagosPorMon.USD;
          saldoEUR = saldoEUR + ingEUR + camEUR - pagosPorMon.EUR;
        }
        // Determinar fecha del último día procesado (el que realmente le da su saldo al nuevo día)
        const fechaOrigen = fechas.length > 0 ? fechas[fechas.length - 1] : ultimo.fecha;
        setSaldosEmpresas({ [empresaId]: {
          mxn: String(saldoMXN),
          usd: String(saldoUSD),
          eur: String(saldoEUR)
        }});
        setSaldosMeta({
          updatedAt: null,
          updatedBy: null,
          fuente: 'heredado',
          fechaOrigen,
        });
        setSaldosLoading(false);
      };
      cargar();
      return () => { cancelado = true; };
    }, [empresaId, fechaSeleccionada, payments, invoices]);

    // Cargar ingresos del día (de la fecha seleccionada)
    const cargarIngresos = async () => {
      setIngresosLoading(true);
      const data = await fetchIngresosDia(empresaId, fechaSeleccionada);
      setIngresosDia(data);
      setIngresosLoading(false);
    };
    useEffect(() => { cargarIngresos(); /* eslint-disable-next-line */ }, [empresaId, fechaSeleccionada]);

    // Cargar cambios de divisa (4 direcciones) de la fecha seleccionada
    const cargarCambios = async () => {
      const data = await fetchCambiosDia(empresaId, fechaSeleccionada);
      setCambiosHoy(data || []);
    };
    useEffect(() => { cargarCambios(); /* eslint-disable-next-line */ }, [empresaId, fechaSeleccionada]);

    // Helper: obtener un cambio por dirección
    const getCambio = (direccion) => {
      return cambiosHoy.find(c => c.direccion === direccion) || { direccion, montoVendido: 0, montoComprado: 0 };
    };

    // Guardar una celda de cambio (vendido o comprado)
    const guardarCeldaCambio = async () => {
      if (bloqueoEdicion) { setEditandoCambio(null); setValorCambio(''); return; }
      if (!editandoCambio) return;
      // Formato: USD_MXN_vendido o EUR_MXN_comprado
      const partes = editandoCambio.split('_');
      const direccion = `${partes[0]}_${partes[1]}`;
      const campo = partes[2]; // 'vendido' | 'comprado'
      const actual = getCambio(direccion);
      const valor = parseFloat(valorCambio.replace(/[,$€]/g, '')) || 0;
      const nuevo = {
        empresaId,
        fecha: fechaSeleccionada,
        direccion,
        montoVendido: campo === 'vendido' ? valor : actual.montoVendido,
        montoComprado: campo === 'comprado' ? valor : actual.montoComprado,
      };
      await upsertCambioDia(nuevo, user?.nombre || 'desconocido');
      // Actualizar estado local
      setCambiosHoy(prev => {
        const otros = prev.filter(c => c.direccion !== direccion);
        if (nuevo.montoVendido === 0 && nuevo.montoComprado === 0) return otros; // si ambos son 0, no guardamos fila
        return [...otros, nuevo];
      });
      setEditandoCambio(null);
      setValorCambio('');
    };
    const cancelarCeldaCambio = () => { setEditandoCambio(null); setValorCambio(''); };

    // Agregar fila vacía
    const agregarIngreso = async (esEsperado = false) => {
      if (esConsulta || bloqueoEdicion) return;
      const nuevo = {
        empresaId,
        fecha: fechaSeleccionada,
        rubro: '',
        cliente: '',
        concepto: '',
        montoMXN: 0, montoUSD: 0, montoEUR: 0,
        orden: ingresosDia.length,
        confirmado: !esEsperado, // si esEsperado=true → confirmado=false (proyectado)
      };
      const id = await upsertIngresoDia(nuevo, user?.nombre || 'desconocido');
      if (id) {
        setIngresosDia(prev => [...prev, { ...nuevo, id }]);
        setTimeout(() => {
          setEditandoIngreso(`${id}_rubro`);
          setValorIngreso('');
        }, 50);
      }
    };

    // Toggle real ↔ proyectado
    const toggleConfirmadoIngreso = async (id) => {
      if (esConsulta || bloqueoEdicion) return;
      const ing = ingresosDia.find(x => x.id === id);
      if (!ing) return;
      const nuevo = { ...ing, confirmado: !(ing.confirmado !== false) };
      await upsertIngresoDia(nuevo, user?.nombre || 'desconocido');
      setIngresosDia(prev => prev.map(x => x.id === id ? nuevo : x));
    };

    // Guardar cambio de una celda
    const guardarCeldaIngreso = async () => {
      if (!editandoIngreso) return;
      // Si el bloqueo está activo Y es vista histórica, no guardamos
      // (se permite edición solo si edicionHistoricaHabilitada === true)
      if (esVistaHistorica && !edicionHistoricaHabilitada) {
        console.warn('[ingreso] edición bloqueada (vista histórica sin habilitar)');
        setEditandoIngreso(null); setValorIngreso(""); return;
      }
      // Buscar el ingreso usando rfind con startsWith para soportar UUIDs con guiones
      // (la key tiene formato `${id}_${campo}` donde id es un UUID y campo es: rubro/cliente/concepto/MXN/USD/EUR)
      const ultimoSubrayado = editandoIngreso.lastIndexOf('_');
      if (ultimoSubrayado === -1) { setEditandoIngreso(null); return; }
      const id = editandoIngreso.substring(0, ultimoSubrayado);
      const campo = editandoIngreso.substring(ultimoSubrayado + 1);
      const ing = ingresosDia.find(x => x.id === id);
      if (!ing) {
        console.warn('[ingreso] no se encontró el id:', id, 'campo:', campo, 'ingresosDia:', ingresosDia.length);
        setEditandoIngreso(null); setValorIngreso(""); return;
      }
      const esTexto = ['rubro', 'cliente', 'concepto'].includes(campo);
      let valor;
      if (esTexto) {
        valor = valorIngreso.trim();
      } else {
        valor = parseFloat(valorIngreso.replace(/[,$€\s]/g, '')) || 0;
      }
      const nuevo = { ...ing };
      if (campo === 'rubro') nuevo.rubro = valor;
      if (campo === 'cliente') nuevo.cliente = valor;
      if (campo === 'concepto') nuevo.concepto = valor;
      if (campo === 'MXN') nuevo.montoMXN = valor;
      if (campo === 'USD') nuevo.montoUSD = valor;
      if (campo === 'EUR') nuevo.montoEUR = valor;
      const result = await upsertIngresoDia(nuevo, user?.nombre || 'desconocido');
      if (result === null) {
        console.error('[ingreso] upsertIngresoDia retornó null - guardado falló');
      }
      setIngresosDia(prev => prev.map(x => x.id === id ? nuevo : x));
      setEditandoIngreso(null);
      setValorIngreso("");
    };
    const cancelarCeldaIngreso = () => { setEditandoIngreso(null); setValorIngreso(""); };

    // Eliminar fila
    const eliminarIngreso = async (id) => {
      if (esConsulta || bloqueoEdicion) return;
      if (!confirm('¿Eliminar esta fila?')) return;
      await deleteIngresoDia(id);
      setIngresosDia(prev => prev.filter(x => x.id !== id));
    };

    // Totales de ingresos: separados entre reales (confirmados) y proyectados.
    // totalesIngresos sigue siendo "solo reales" para mantener compat con el resto del código
    // (Saldo Disponible, PDF, copiar resumen, etc. ya usan esta variable).
    const totalesIngresos = useMemo(() => {
      const t = { MXN: 0, USD: 0, EUR: 0 };
      ingresosDia.forEach(x => {
        // Solo reales (confirmado !== false → default true)
        if (x.confirmado === false) return;
        t.MXN += +x.montoMXN || 0;
        t.USD += +x.montoUSD || 0;
        t.EUR += +x.montoEUR || 0;
      });
      return t;
    }, [ingresosDia]);

    // Totales solo de proyectados (para mostrar separado en la tabla)
    const totalesIngresosProyectados = useMemo(() => {
      const t = { MXN: 0, USD: 0, EUR: 0 };
      ingresosDia.forEach(x => {
        if (x.confirmado !== false) return; // excluir reales
        t.MXN += +x.montoMXN || 0;
        t.USD += +x.montoUSD || 0;
        t.EUR += +x.montoEUR || 0;
      });
      return t;
    }, [ingresosDia]);

    // Helper: ordena un array de ingresos por bloques de moneda y monto
    // Bloques: USD → EUR → MXN. Dentro de cada bloque: mayor a menor.
    // Filas vacías (sin montos) van al final.
    const ordenarIngresosBloques = (arr) => {
      const conMonto = arr.filter(x => (+x.montoUSD || 0) > 0 || (+x.montoEUR || 0) > 0 || (+x.montoMXN || 0) > 0);
      const sinMonto = arr.filter(x => (+x.montoUSD || 0) === 0 && (+x.montoEUR || 0) === 0 && (+x.montoMXN || 0) === 0);
      // Asignar bloque y monto del bloque a cada ingreso con monto
      const conBloque = conMonto.map(x => {
        const usd = +x.montoUSD || 0, eur = +x.montoEUR || 0, mxn = +x.montoMXN || 0;
        // Si tiene varios, va al bloque del que tenga monto más alto (con prioridad USD > EUR > MXN)
        if (usd > 0) return { ing: x, bloque: 0, monto: usd };
        if (eur > 0) return { ing: x, bloque: 1, monto: eur };
        return { ing: x, bloque: 2, monto: mxn };
      });
      // Ordenar por bloque ascendente (0=USD, 1=EUR, 2=MXN), monto descendente
      conBloque.sort((a, b) => {
        if (a.bloque !== b.bloque) return a.bloque - b.bloque;
        return b.monto - a.monto;
      });
      return [...conBloque.map(x => x.ing), ...sinMonto];
    };

    // Lista de ingresos ordenada — el orden solo se recalcula al cargar/agregar/eliminar/cambiar moneda dominante,
    // NO durante edición de montos. Esto se logra usando una "signatura" estable.
    // Usamos el conjunto de IDs + el bloque dominante de cada uno como dependencia.
    const ordenSignatura = useMemo(() => {
      // signatura: lista de "id|bloque|tieneMonto" — solo cambia si se agrega/elimina o cambia el bloque dominante
      return ingresosDia.map(x => {
        const usd = +x.montoUSD || 0, eur = +x.montoEUR || 0, mxn = +x.montoMXN || 0;
        const tieneMonto = (usd > 0 || eur > 0 || mxn > 0) ? 1 : 0;
        const bloque = usd > 0 ? 0 : (eur > 0 ? 1 : (mxn > 0 ? 2 : 3));
        return `${x.id}|${bloque}|${tieneMonto}|${x.confirmado === false ? 'P' : 'R'}`;
      }).join(',');
    }, [ingresosDia]);

    const ingresosRealesOrdenados = useMemo(() => {
      const reales = ingresosDia.filter(x => x.confirmado !== false);
      return ordenarIngresosBloques(reales);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ordenSignatura]);

    const ingresosProyectadosOrdenados = useMemo(() => {
      const proyectados = ingresosDia.filter(x => x.confirmado === false);
      return ordenarIngresosBloques(proyectados);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ordenSignatura]);

    // En vista histórica: la fecha de referencia para "qué se programó pagar"
    // En vista actual: hoy
    const fechaRef = fechaSeleccionada;
    
    const pagosProgramadosHoy = useMemo(() => {
      // PASO 1: Construir mapa de adeudo TOTAL por proveedor+moneda (todas las facturas activas)
      const adeudoTotal = new Map();   // key: "proveedor-moneda" → { adeudado, facturasActivas }
      // PASO 2: Construir mapa de pagos del día por proveedor+moneda
      const pagosHoy = new Map();      // key: "proveedor-moneda" → { pagoHoy, tipo, detalleFacturas, estado }
      
      Object.entries(invoices).forEach(([moneda, facturas]) => {
        facturas.forEach(factura => {
          if (factura.empresaId !== empresaId) return;
          
          const saldoActual = (+factura.total || 0) - (+factura.montoPagado || 0);
          
          // Buscar pagos programados para fechaRef (puede ser hoy o histórico)
          const pagosProgFecha = payments.filter(p => 
            p.invoiceId === factura.id && 
            p.tipo === 'programado' && 
            p.fechaPago === fechaRef
          );
          
          // Buscar pagos realizados en esa fecha (tanto hoy como histórico)
          // Esto es importante para Otros Pagos pagados hoy: aunque saldo=0, el pago ocurrió hoy
          // y debe aparecer en el reporte para reflejar correctamente los saldos del día.
          const pagosRealizadosFecha = payments.filter(p =>
            p.invoiceId === factura.id &&
            p.tipo === 'realizado' &&
            p.fechaPago === fechaRef
          );
          
          // SALDO INICIAL DEL DÍA: lo que se debía cuando empezó este día.
          // = saldo actual + pagos realizados hoy (porque esos pagos redujeron el saldo durante el día)
          // Esto hace que el "Importe Adeudado" sea consistente independientemente
          // de si ya aplicaste o no los pagos del día.
          const totalRealizadosFecha = pagosRealizadosFecha.reduce((s, p) => s + (+p.monto || 0), 0);
          const saldoInicialDia = saldoActual + totalRealizadosFecha;
          
          // Filtro: solo descartar si NO hay pagos en esta fecha Y la factura está pagada
          // (caso típico: factura pagada hace tiempo, ningún pago hoy → no nos interesa)
          const tienePagoEnFecha = pagosProgFecha.length > 0 || pagosRealizadosFecha.length > 0;
          if (saldoActual <= 0 && !tienePagoEnFecha) return;
          
          // Egresos No Facturados se agrupan todos bajo "Otros Pagos" (no por concepto)
          const esEgresoNF = factura.tipo === 'EgresoNF';
          const proveedorKey = esEgresoNF
            ? `__EGRESOS_NF__-${moneda}`
            : `${factura.proveedor}-${moneda}`;
          const proveedorDisplay = esEgresoNF ? 'Otros Pagos' : factura.proveedor;
          
          // Acumular adeudo del DÍA del proveedor (saldo inicial del día)
          // Cuenta tanto facturas con saldo actual > 0 como las pagadas hoy (que tenían saldo a inicio del día)
          if (saldoInicialDia > 0) {
            if (adeudoTotal.has(proveedorKey)) {
              const ex = adeudoTotal.get(proveedorKey);
              ex.adeudado += saldoInicialDia;
              ex.facturasActivas += 1;
            } else {
              adeudoTotal.set(proveedorKey, {
                proveedor: proveedorDisplay,
                moneda,
                adeudado: saldoInicialDia,
                facturasActivas: 1
              });
            }
          }
          
          // (Las variables pagosProgFecha y pagosRealizadosFecha ya se calcularon arriba
          //  con la lógica correcta — no las recalculamos)
          
          // Combinar: si hay pagos realizados, esos son la fuente de verdad (el programado ya se ejecutó).
          // Si no hay realizados, usar los programados.
          const todosPagosFecha = pagosRealizadosFecha.length > 0
            ? pagosRealizadosFecha
            : pagosProgFecha;
          
          if (todosPagosFecha.length > 0) {
            const totalPagoHoy = todosPagosFecha.reduce((sum, p) => sum + p.monto, 0);
            // Determinar estado:
            // - Si hay pagos realizados, está pagado
            // - Si solo hay programados sin realizar, está pendiente
            // - Si la fecha es pasada y no hay pago realizado pero sí programado: atrasado
            let estado = 'programado'; // default
            if (pagosRealizadosFecha.length > 0) {
              estado = 'pagado';
            } else if (pagosProgFecha.length > 0) {
              // Verificar si la factura tiene pago realizado en cualquier fecha posterior
              const pagosPosteriores = payments.filter(p =>
                p.invoiceId === factura.id &&
                p.tipo === 'realizado' &&
                p.fechaPago > fechaRef
              );
              if (pagosPosteriores.length > 0) {
                estado = 'pagado_atraso';
              } else if (esHoy) {
                estado = 'programado';
              } else {
                // Vista histórica, fecha pasada, no hay pago realizado: atrasado
                estado = 'atrasado';
              }
            }
            
            // Detectar método de pago (banco/tdc/otro). Si hay realizados, usar el de éstos; si no, banco por default
            const pagosParaMetodo = pagosRealizadosFecha.length > 0 ? pagosRealizadosFecha : pagosProgFecha;
            // Si la factura tiene varios pagos en la misma fecha con distinto método, separamos por método
            const metodosEstefacha = pagosParaMetodo.reduce((acc, p) => {
              const m = p.metodoPago || 'banco';
              acc[m] = (acc[m] || 0) + (p.monto || 0);
              return acc;
            }, {});
            // Método "principal": el que aporta más monto (para el badge del proveedor/factura)
            const metodoPrincipal = Object.keys(metodosEstefacha).reduce((a, b) => 
              metodosEstefacha[a] > metodosEstefacha[b] ? a : b, 'banco');
            
            const detalleFactura = esEgresoNF
              ? {
                  // Para egresos NF: el "folio" muestra el beneficiario (Konfio Banco)
                  // y el "concepto" muestra las notas reales (EDO CTA 14 MZO AL 14 ABR)
                  serie: '',
                  folio: factura.proveedor || factura.concepto || '',  // beneficiario
                  concepto: factura.notas || factura.concepto || '',   // descripción real
                  pagoHoy: totalPagoHoy,
                  estado,
                  metodoPago: metodoPrincipal,
                  pagoBanco: metodosEstefacha.banco || 0,
                  pagoTDC:   metodosEstefacha.tdc   || 0,
                  pagoOtro:  metodosEstefacha.otro  || 0,
                  esEgresoNF: true,
                }
              : {
                  serie: factura.serie || '',
                  folio: factura.folio || '',
                  concepto: factura.concepto || '',
                  pagoHoy: totalPagoHoy,
                  estado,
                  metodoPago: metodoPrincipal,
                  pagoBanco: metodosEstefacha.banco || 0,
                  pagoTDC:   metodosEstefacha.tdc   || 0,
                  pagoOtro:  metodosEstefacha.otro  || 0,
                  esEgresoNF: false,
                };
            if (pagosHoy.has(proveedorKey)) {
              const ex = pagosHoy.get(proveedorKey);
              ex.pagoHoy += totalPagoHoy;
              ex.pagoBanco += detalleFactura.pagoBanco;
              ex.pagoTDC   += detalleFactura.pagoTDC;
              ex.pagoOtro  += detalleFactura.pagoOtro;
              ex.detalleFacturas.push(detalleFactura);
              // Estado del proveedor: el "peor" de sus facturas (atrasado > programado > pagado_atraso > pagado)
              const ranking = { atrasado: 4, programado: 3, pagado_atraso: 2, pagado: 1 };
              if ((ranking[estado] || 0) > (ranking[ex.estado] || 0)) ex.estado = estado;
            } else {
              pagosHoy.set(proveedorKey, {
                pagoHoy: totalPagoHoy,
                tipo: 'programado',
                detalleFacturas: [detalleFactura],
                estado,
                pagoBanco: detalleFactura.pagoBanco,
                pagoTDC:   detalleFactura.pagoTDC,
                pagoOtro:  detalleFactura.pagoOtro,
              });
            }
          }
        });
      });
      
      // PASO 3: Combinar — proveedores con pago en la fecha
      const resultado = [];
      pagosHoy.forEach((pagoInfo, key) => {
        // Detectar si es el grupo especial de Egresos NF (Otros Pagos)
        const esGrupoNF = key.startsWith('__EGRESOS_NF__-');
        const adeudoInfo = adeudoTotal.get(key) || { 
          proveedor: esGrupoNF ? 'Otros Pagos' : key.split('-')[0],
          moneda: esGrupoNF ? key.replace('__EGRESOS_NF__-', '') : (key.split('-')[1] || 'MXN'),
          adeudado: 0,
          facturasActivas: 0
        };
        const detalleOrdenado = [...pagoInfo.detalleFacturas].sort((a,b) => b.pagoHoy - a.pagoHoy);
        resultado.push({
          proveedor: adeudoInfo.proveedor,
          moneda: adeudoInfo.moneda,
          importeAdeudado: adeudoInfo.adeudado,
          pagoHoy: pagoInfo.pagoHoy,
          pagoBanco: pagoInfo.pagoBanco || 0,
          pagoTDC:   pagoInfo.pagoTDC   || 0,
          pagoOtro:  pagoInfo.pagoOtro  || 0,
          facturas: adeudoInfo.facturasActivas,
          tipo: pagoInfo.tipo,
          estado: pagoInfo.estado,
          saldoDespuesPago: Math.max(0, adeudoInfo.adeudado - pagoInfo.pagoHoy),
          detalleFacturas: detalleOrdenado
        });
      });

      // Ordenar: USD primero (mayor a menor), luego MXN (mayor a menor)
      return resultado.sort((a, b) => {
        if (a.moneda === 'USD' && b.moneda !== 'USD') return -1;
        if (b.moneda === 'USD' && a.moneda !== 'USD') return 1;
        if (a.moneda === 'MXN' && b.moneda === 'EUR') return -1;
        if (b.moneda === 'MXN' && a.moneda === 'EUR') return 1;
        return b.pagoHoy - a.pagoHoy;
      });
    }, [invoices, payments, empresaId, fechaRef, esHoy]);

    // totalesPagos: SOLO suma pagos de método "banco" (los que realmente salen del banco
    // y afectan el saldo después). Los pagos con TDC/Otro no afectan los saldos bancarios.
    const totalesPagos = useMemo(() => {
      const totales = { MXN: 0, USD: 0, EUR: 0 };
      pagosProgramadosHoy.forEach(p => {
        // Solo sumar la parte que se pagó por banco
        totales[p.moneda] = (totales[p.moneda] || 0) + (p.pagoBanco || 0);
      });
      return totales;
    }, [pagosProgramadosHoy]);

    // Totales por TDC y Otro (informativos, no afectan saldos)
    const totalesPagosTDC = useMemo(() => {
      const t = { MXN: 0, USD: 0, EUR: 0 };
      pagosProgramadosHoy.forEach(p => { t[p.moneda] = (t[p.moneda] || 0) + (p.pagoTDC || 0); });
      return t;
    }, [pagosProgramadosHoy]);

    const totalesPagosOtro = useMemo(() => {
      const t = { MXN: 0, USD: 0, EUR: 0 };
      pagosProgramadosHoy.forEach(p => { t[p.moneda] = (t[p.moneda] || 0) + (p.pagoOtro || 0); });
      return t;
    }, [pagosProgramadosHoy]);

    // Lista de pagos en el orden seleccionado por el usuario (o por defecto USD/MXN/EUR)
    const pagosOrdenados = useMemo(() => {
      if (!sortBy) return pagosProgramadosHoy; // Orden por defecto
      const factor = sortDir === 'asc' ? 1 : -1;
      return [...pagosProgramadosHoy].sort((a, b) => {
        const va = a[sortBy], vb = b[sortBy];
        if (typeof va === 'string') return va.localeCompare(vb) * factor;
        return ((va || 0) - (vb || 0)) * factor;
      });
    }, [pagosProgramadosHoy, sortBy, sortDir]);

    // Totales completos por moneda: adeudo, pago, saldo después
    const totalesCompletos = useMemo(() => {
      const t = {
        MXN: { adeudado: 0, pago: 0, saldoDespues: 0, facturas: 0 },
        USD: { adeudado: 0, pago: 0, saldoDespues: 0, facturas: 0 },
        EUR: { adeudado: 0, pago: 0, saldoDespues: 0, facturas: 0 },
      };
      pagosProgramadosHoy.forEach(p => {
        if (!t[p.moneda]) return;
        t[p.moneda].adeudado     += p.importeAdeudado;
        t[p.moneda].pago         += p.pagoHoy;
        t[p.moneda].saldoDespues += p.saldoDespuesPago;
        t[p.moneda].facturas     += p.facturas;
      });
      return t;
    }, [pagosProgramadosHoy]);

    const toggleSort = (col) => {
      if (sortBy === col) {
        // Mismo column: alternar dirección, o quitar orden si ya estaba en asc
        if (sortDir === 'desc') setSortDir('asc');
        else { setSortBy(null); setSortDir('desc'); }
      } else {
        setSortBy(col);
        setSortDir(col === 'proveedor' || col === 'moneda' ? 'asc' : 'desc');
      }
    };

    const sortIcon = (col) => sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

    const analisisLiquidez = useMemo(() => {
      const parseSaldo = (val) => parseFloat(val.replace(/[,$]/g, '')) || 0;
      const parseTc = (val) => parseFloat(val) || 1;
      
      const saldos = saldosEmpresas[empresaId] || { mxn: "", usd: "", eur: "" };
      const saldoMXN = parseSaldo(saldos.mxn);
      const saldoUSD = parseSaldo(saldos.usd);  
      const saldoEUR = parseSaldo(saldos.eur);
      
      const convUSD = parseSaldo(conversiones.usd_to_mxn) * parseTc(tiposCambio.usdMxn);
      const convEUR = parseSaldo(conversiones.eur_to_mxn) * parseTc(tiposCambio.eurMxn);
      
      // Ingresos del día — SEPARADOS por confirmado (real) vs esperado
      // Los esperados NO suman al saldo disponible "real", solo al "esperado"
      const ingresosRealesMXN = ingresosDia.reduce((s, i) => i.confirmado !== false ? s + (+i.montoMXN || 0) : s, 0);
      const ingresosRealesUSD = ingresosDia.reduce((s, i) => i.confirmado !== false ? s + (+i.montoUSD || 0) : s, 0);
      const ingresosRealesEUR = ingresosDia.reduce((s, i) => i.confirmado !== false ? s + (+i.montoEUR || 0) : s, 0);
      const ingresosEsperadosMXN = ingresosDia.reduce((s, i) => i.confirmado === false ? s + (+i.montoMXN || 0) : s, 0);
      const ingresosEsperadosUSD = ingresosDia.reduce((s, i) => i.confirmado === false ? s + (+i.montoUSD || 0) : s, 0);
      const ingresosEsperadosEUR = ingresosDia.reduce((s, i) => i.confirmado === false ? s + (+i.montoEUR || 0) : s, 0);
      // Compat: ingresosMXN/USD/EUR ahora solo son los reales (para no romper código existente)
      const ingresosMXN = ingresosRealesMXN;
      const ingresosUSD = ingresosRealesUSD;
      const ingresosEUR = ingresosRealesEUR;
      
      // Cambios de divisa de HOY (efecto neto por moneda)
      // direcciones: 'USD_MXN', 'MXN_USD', 'EUR_MXN', 'MXN_EUR'
      // USD_MXN: vendo USD (sale), compro MXN (entra)
      // MXN_USD: vendo MXN (sale), compro USD (entra)
      // etc.
      const porDir = {};
      cambiosHoy.forEach(c => { porDir[c.direccion] = c; });
      const usdMxn = porDir['USD_MXN'] || { montoVendido: 0, montoComprado: 0 };
      const mxnUsd = porDir['MXN_USD'] || { montoVendido: 0, montoComprado: 0 };
      const eurMxn = porDir['EUR_MXN'] || { montoVendido: 0, montoComprado: 0 };
      const mxnEur = porDir['MXN_EUR'] || { montoVendido: 0, montoComprado: 0 };
      
      const cambiosNetoMXN = (+usdMxn.montoComprado || 0) + (+eurMxn.montoComprado || 0) - (+mxnUsd.montoVendido || 0) - (+mxnEur.montoVendido || 0);
      const cambiosNetoUSD = (+mxnUsd.montoComprado || 0) - (+usdMxn.montoVendido || 0);
      const cambiosNetoEUR = (+mxnEur.montoComprado || 0) - (+eurMxn.montoVendido || 0);
      
      // Saldo inicial ajustado por cambios de divisa
      // (conversiones antiguas se mantienen por compatibilidad pero conversiones siempre es 0 porque se eliminó la UI)
      const saldoInicialMXN = saldoMXN + convUSD + convEUR + cambiosNetoMXN;
      const saldoInicialUSD = saldoUSD - parseSaldo(conversiones.usd_to_mxn) + cambiosNetoUSD;
      const saldoInicialEUR = saldoEUR - parseSaldo(conversiones.eur_to_mxn) + cambiosNetoEUR;
      
      // Saldo disponible REAL = saldo inicial + ingresos REALES del día
      const disponibleMXN = saldoInicialMXN + ingresosMXN;
      const disponibleUSD = saldoInicialUSD + ingresosUSD;
      const disponibleEUR = saldoInicialEUR + ingresosEUR;

      // Saldo disponible ESPERADO = saldo disponible REAL + ingresos esperados
      const disponibleEsperadoMXN = disponibleMXN + ingresosEsperadosMXN;
      const disponibleEsperadoUSD = disponibleUSD + ingresosEsperadosUSD;
      const disponibleEsperadoEUR = disponibleEUR + ingresosEsperadosEUR;

      // Déficit/Excedente = disponible - pagos (versión real)
      const deficitMXN = disponibleMXN - totalesPagos.MXN;
      const deficitUSD = disponibleUSD - totalesPagos.USD;
      const deficitEUR = disponibleEUR - totalesPagos.EUR;

      // Déficit/Excedente ESPERADO = disponible esperado - pagos
      const deficitEsperadoMXN = disponibleEsperadoMXN - totalesPagos.MXN;
      const deficitEsperadoUSD = disponibleEsperadoUSD - totalesPagos.USD;
      const deficitEsperadoEUR = disponibleEsperadoEUR - totalesPagos.EUR;

      return {
        saldoInicial: { MXN: saldoInicialMXN, USD: saldoInicialUSD, EUR: saldoInicialEUR },
        ingresos: { MXN: ingresosMXN, USD: ingresosUSD, EUR: ingresosEUR }, // solo reales (compat)
        ingresosReales: { MXN: ingresosRealesMXN, USD: ingresosRealesUSD, EUR: ingresosRealesEUR },
        ingresosEsperados: { MXN: ingresosEsperadosMXN, USD: ingresosEsperadosUSD, EUR: ingresosEsperadosEUR },
        hayEsperados: (ingresosEsperadosMXN + ingresosEsperadosUSD + ingresosEsperadosEUR) > 0,
        cambios: { MXN: cambiosNetoMXN, USD: cambiosNetoUSD, EUR: cambiosNetoEUR },
        disponible: { MXN: disponibleMXN, USD: disponibleUSD, EUR: disponibleEUR },
        disponibleEsperado: { MXN: disponibleEsperadoMXN, USD: disponibleEsperadoUSD, EUR: disponibleEsperadoEUR },
        saldoFinal: { MXN: disponibleMXN, USD: disponibleUSD, EUR: disponibleEUR },
        deficit: { MXN: deficitMXN, USD: deficitUSD, EUR: deficitEUR },
        deficitEsperado: { MXN: deficitEsperadoMXN, USD: deficitEsperadoUSD, EUR: deficitEsperadoEUR },
        statusMXN: deficitMXN >= 0 ? '✅' : deficitMXN > -50000 ? '🟡' : '🔴',
        statusUSD: deficitUSD >= 0 ? '✅' : deficitUSD > -5000 ? '🟡' : '🔴',
        statusEUR: deficitEUR >= 0 ? '✅' : '🟡'
      };
    }, [saldosEmpresas, conversiones, tiposCambio, totalesPagos, empresaId, ingresosDia, cambiosHoy]);

    const handleSaldoChange = (moneda, value) => {
      // Bloquear edición si vista histórica sin habilitar
      if (bloqueoEdicion) return;
      setSaldosEmpresas(prev => ({
        ...prev,
        [empresaId]: { ...(prev[empresaId] || {}), [moneda]: value }
      }));
    };

    const guardarSaldosEnSupabase = async () => {
      if (bloqueoEdicion) return;
      const saldosActuales = saldosEmpresas[empresaId] || { mxn: "0", usd: "0", eur: "0" };
      setSaldosSaving(true);
      // Guarda en saldos_reporte_dia (por fecha)
      const ok = await upsertSaldoReporteDia(empresaId, fechaSeleccionada, saldosActuales, user?.nombre || "desconocido");
      if (ok) {
        setSaldosMeta({ updatedAt: new Date().toISOString(), updatedBy: user?.nombre || "desconocido", fuente: 'guardado' });
      }
      setSaldosSaving(false);
    };

    const handleEditToggle = (key, estado) => {
      // Si está cerrando edición, guardar en Supabase
      if (editando[key] && !estado) {
        guardarSaldosEnSupabase();
      }
      setEditando(prev => ({ ...prev, [key]: estado }));
    };

    const handleConversionChange = (key, value) => {
      setConversiones(prev => ({ ...prev, [key]: value }));
    };

    const [pdfModalOpen, setPdfModalOpen] = useState(false);
    const [exportModalOpen, setExportModalOpen] = useState(false); // nuevo: modal unificado PDF/PNG
    const [generandoPng, setGenerandoPng] = useState(false);
    const refResumen = useRef(null);   // Saldos + Ingresos + Cambios + Flujo
    const refDetalle = useRef(null);   // Pagos Programados + Saldos Después

    const construirHtmlReporte = (modo = 'resumen', orientacion = 'portrait') => {
      const detallado = modo === 'detallado';
      // fechaTexto = fecha del REPORTE (la seleccionada), no la de hoy
      const fechaTexto = new Date(fechaSeleccionada + 'T12:00:00').toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
      // horaTexto = hora actual (cuando se generó la imagen)
      const horaTexto = new Date().toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
      // Si es histórico, también lo señalamos en el subtítulo
      const tituloPDF = esVistaHistorica ? 'Reporte de Tesorería Histórico' : 'Reporte de Tesorería del Día';
      const sym = (m) => m === 'EUR' ? '€' : '$';
      const saldosCap = saldosEmpresas[empresaId] || { mxn:0, usd:0, eur:0 };
      const saldoNum = (k) => parseFloat(String(saldosCap[k] || '0').replace(/[,$]/g, '')) || 0;
      const trunc = (s, n=60) => { s = String(s||''); return s.length > n ? s.slice(0,n-1) + '…' : s; };

      // Helper: renderiza una fila de proveedor + opcionalmente sub-filas de facturas
      const renderFilaProveedor = (p) => {
        const filaProveedor = `
          <tr class="prov ${detallado ? 'prov-det' : ''}">
            <td>${p.proveedor}</td>
            <td class="c"><span class="badge badge-${p.moneda.toLowerCase()}">${p.moneda}</span></td>
            <td class="r">${sym(p.moneda)}${fmt(p.importeAdeudado)}</td>
            <td class="r pago">${sym(p.moneda)}${fmt(p.pagoHoy)}</td>
            <td class="r ${p.saldoDespuesPago === 0 ? 'ok' : 'pend'}">${sym(p.moneda)}${fmt(p.saldoDespuesPago)}</td>
            <td class="c">${p.facturas}</td>
          </tr>`;
        if (!detallado || !p.detalleFacturas?.length) return filaProveedor;
        // Sub-filas de detalle
        const subFilas = p.detalleFacturas.map(f => {
          const ref = ((f.serie || '') + (f.folio || '')).trim() || '—';
          return `
            <tr class="det">
              <td colspan="3"><span class="det-ico">↳</span> <span class="det-ref">${ref}</span> <span class="det-conc">${trunc(f.concepto, 60) || '<i class="muted">(sin concepto)</i>'}</span></td>
              <td class="r det-monto">${sym(p.moneda)}${fmt(f.pagoHoy)}</td>
              <td colspan="2"></td>
            </tr>`;
        }).join('');
        return filaProveedor + subFilas;
      };

      // Si el usuario aplicó orden manual: tabla plana en ese orden.
      // Si no: agrupada por moneda con encabezado de sección.
      let filasHTML = '';
      if (sortBy) {
        pagosOrdenados.forEach(p => { filasHTML += renderFilaProveedor(p); });
      } else {
        const monedasOrdenadas = ['USD','MXN','EUR'];
        monedasOrdenadas.forEach(mon => {
          const filas = pagosProgramadosHoy.filter(p => p.moneda === mon);
          if (filas.length === 0) return;
          // Solo mostrar separador en modo detallado (en resumen ahorra espacio)
          if (detallado) {
            filasHTML += `<tr class="sep"><td colspan="6">${mon} &middot; ${filas.length} ${filas.length === 1 ? 'proveedor' : 'proveedores'}</td></tr>`;
          }
          filas.forEach(p => { filasHTML += renderFilaProveedor(p); });
        });
      }

      // Totales por moneda al final de la tabla (siempre, en ambos modos)
      let totalesHTML = '';
      ['USD','MXN','EUR'].forEach(m => {
        const t = totalesCompletos[m];
        if (t.pago === 0 && t.adeudado === 0) return;
        totalesHTML += `
          <tr class="totalrow">
            <td><b>TOTAL ${m}</b></td>
            <td class="c"><span class="badge badge-${m.toLowerCase()}">${m}</span></td>
            <td class="r"><b>${sym(m)}${fmt(t.adeudado)}</b></td>
            <td class="r pago"><b>${sym(m)}${fmt(t.pago)}</b></td>
            <td class="r ${t.saldoDespues === 0 ? 'ok' : 'pend'}"><b>${sym(m)}${fmt(t.saldoDespues)}</b></td>
            <td class="c"><b>${t.facturas}</b></td>
          </tr>`;
      });

      const filaSaldoFinal = (k, label, sm) => {
        const inicial = saldoNum(k);
        const ingresos = analisisLiquidez.ingresos[label] || 0;
        const cambios = analisisLiquidez.cambios[label] || 0;
        const disponible = inicial + ingresos + cambios;
        const pago = totalesPagos[label] || 0;
        const final = disponible - pago;
        const colorClass = final >= 0 ? 'ok' : 'pend';
        const ingresosCell = ingresos > 0
          ? `<td class="r" style="color:#2E7D32;">+${sm}${fmt(ingresos)}</td>`
          : `<td class="r" style="color:#999;">—</td>`;
        // cambios puede ser positivo o negativo
        let cambiosCell;
        if (cambios === 0) {
          cambiosCell = `<td class="r" style="color:#999;">—</td>`;
        } else if (cambios > 0) {
          cambiosCell = `<td class="r" style="color:#2E7D32;">+${sm}${fmt(cambios)}</td>`;
        } else {
          cambiosCell = `<td class="r" style="color:#C62828;">−${sm}${fmt(Math.abs(cambios))}</td>`;
        }
        return `
          <tr>
            <td>${label}</td>
            <td class="r">${sm}${fmt(inicial)}</td>
            ${ingresosCell}
            ${cambiosCell}
            <td class="r"><b>${sm}${fmt(disponible)}</b></td>
            <td class="r" style="color:#C62828;">−${sm}${fmt(pago)}</td>
            <td class="r ${colorClass}">${sm}${fmt(final)}</td>
          </tr>`;
      };

      const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<title>Reporte Tesorería ${empresa.nombre} - ${new Date().toISOString().slice(0,10)}</title>
<style>
  @page { size: A4 ${orientacion}; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Arial, sans-serif; color:#1F2937; margin:0; font-size:11px; line-height:1.45; }
  body.compact { font-size:10px; line-height:1.35; }

  /* HEADER */
  .header { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:18px; padding-bottom:12px; border-bottom:3px solid #4A148C; }
  body.compact .header { margin-bottom:10px; padding-bottom:8px; border-bottom-width:2px; }
  .header .brand { font-size:10px; color:#9575CD; letter-spacing:2px; text-transform:uppercase; font-weight:700; margin-bottom:4px; }
  body.compact .header .brand { font-size:8px; margin-bottom:2px; }
  .header h1 { font-size:22px; margin:0; color:#1F2937; font-weight:700; letter-spacing:-0.3px; }
  body.compact .header h1 { font-size:16px; }
  .header .empresa { font-size:13px; color:#4A148C; font-weight:600; margin-top:4px; }
  body.compact .header .empresa { font-size:11px; margin-top:2px; }
  .header .meta-right { text-align:right; font-size:9px; color:#6B7280; line-height:1.5; }
  body.compact .header .meta-right { font-size:8px; line-height:1.4; }
  .header .meta-right .fecha { font-size:11px; color:#1F2937; font-weight:600; text-transform:capitalize; }
  body.compact .header .meta-right .fecha { font-size:9px; }

  /* SECCIONES */
  h2 { font-size:11px; margin:18px 0 8px; color:#4A148C; font-weight:700; text-transform:uppercase; letter-spacing:1px; }
  body.compact h2 { font-size:9px; margin:10px 0 4px; letter-spacing:0.8px; }
  h2 .num { color:#9CA3AF; font-weight:500; text-transform:none; letter-spacing:0; margin-left:6px; font-size:10px; }
  body.compact h2 .num { font-size:9px; }

  /* CARDS DE SALDOS */
  .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px; }
  .card { border:1px solid #E5E7EB; border-radius:8px; padding:10px 14px; background:#FAFAFA; }
  .card .lbl { font-size:9px; color:#6B7280; text-transform:uppercase; letter-spacing:1px; font-weight:600; margin-bottom:3px; }
  .card .val { font-size:18px; font-weight:700; letter-spacing:-0.3px; }
  body.compact .card { padding:6px 10px; }
  body.compact .card .val { font-size:13px; }
  body.compact .card .lbl { font-size:8px; }
  .card.mxn { border-left:3px solid #1565C0; } .card.mxn .val { color:#1565C0; }
  .card.usd { border-left:3px solid #2E7D32; } .card.usd .val { color:#2E7D32; }
  .card.eur { border-left:3px solid #6A1B9A; } .card.eur .val { color:#6A1B9A; }
  .tc-line { font-size:10px; color:#6B7280; margin-bottom:6px; padding:6px 12px; background:#F9F5FB; border-radius:6px; border-left:3px solid #9575CD; }
  body.compact .tc-line { font-size:9px; padding:4px 10px; margin-bottom:4px; }
  .tc-line b { color:#4A148C; }

  /* TABLAS */
  table { width:100%; border-collapse:collapse; font-size:10px; }
  body.compact table { font-size:9px; }
  thead { display:table-header-group; } /* repetir header en cada página */
  th { background:#4A148C; color:#fff; padding:8px 10px; text-align:left; font-weight:600; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; }
  body.compact th { padding:5px 8px; font-size:8.5px; letter-spacing:0.3px; }
  th:first-child { border-radius:6px 0 0 0; }
  th:last-child { border-radius:0 6px 0 0; }
  th.r { text-align:right; } th.c { text-align:center; }
  td { padding:7px 10px; border-bottom:1px solid #F3F4F6; }
  body.compact td { padding:4px 8px; }
  td.r { text-align:right; font-variant-numeric:tabular-nums; }
  td.c { text-align:center; }
  tr.prov { background:#fff; page-break-inside:avoid; }
  tr.prov:nth-child(even) { background:#FBFAFC; }
  tr.prov td { font-weight:500; }
  tr.prov td:first-child { font-weight:600; color:#1F2937; }
  tr.prov-det td { border-bottom:none; padding-bottom:4px; background:#F9F5FB; font-weight:700; }
  td.pago { color:#C62828; font-weight:700; }
  td.ok { color:#1B5E20; font-weight:600; }
  td.pend { color:#E65100; font-weight:600; }

  /* SEPARADOR DE MONEDA */
  tr.sep td { background:#EDE7F6; font-weight:700; color:#4A148C; padding:6px 10px; font-size:10px; letter-spacing:1px; text-transform:uppercase; border-top:2px solid #9575CD; }
  body.compact tr.sep td { padding:3px 8px; font-size:8.5px; letter-spacing:0.5px; border-top-width:1px; }

  /* BADGES DE MONEDA */
  .badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:9px; font-weight:700; letter-spacing:0.5px; }
  body.compact .badge { padding:1px 6px; font-size:8px; }
  .badge-mxn { background:#E3F2FD; color:#1565C0; }
  .badge-usd { background:#E8F5E9; color:#2E7D32; }
  .badge-eur { background:#F3E5F5; color:#6A1B9A; }

  /* SUB-FILAS DE DETALLE (modo detallado) */
  tr.det { background:#FAFAFA; page-break-inside:avoid; }
  tr.det td { padding:4px 10px 4px 24px; border-bottom:1px dotted #E5E7EB; font-size:9.5px; color:#4B5563; }
  tr.det td:last-child { border-bottom:1px dotted #E5E7EB; }
  .det-ico { color:#9575CD; font-weight:700; margin-right:4px; }
  .det-ref { display:inline-block; min-width:70px; font-weight:700; color:#4A148C; font-family:'SF Mono','Monaco','Consolas',monospace; font-size:9px; }
  .det-conc { color:#4B5563; }
  .det-monto { color:#C62828; font-weight:600; font-size:9.5px; }
  .muted { color:#9CA3AF; font-style:italic; }

  /* TOTALES */
  tr.totalrow td { background:#F5F0FA; font-size:12px; padding:11px 10px; border-top:2px solid #4A148C; border-bottom:1px solid #C5B5DC; color:#4A148C; }
  body.compact tr.totalrow td { font-size:11px; padding:7px 8px; }
  tr.totalrow td:first-child { font-weight:800; }
  tr.totalrow td.pago { color:#C62828; }
  tr.totalrow td.ok { color:#1B5E20; }
  tr.totalrow td.pend { color:#E65100; }

  /* SALDOS FINALES TABLE */
  table.saldos-final th { background:#6B7280; }
  table.saldos-final tr:nth-child(even) td { background:#FAFAFA; }

  /* FOOTER */
  .footer { margin-top:24px; padding-top:10px; border-top:1px solid #E5E7EB; color:#9CA3AF; font-size:9px; display:flex; justify-content:space-between; align-items:center; }
  body.compact .footer { margin-top:10px; padding-top:6px; font-size:8px; }
  .footer .brand-foot { color:#4A148C; font-weight:700; letter-spacing:1px; }

  @media print { 
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    tr { page-break-inside:avoid; }
  }
</style></head><body class="${detallado ? '' : 'compact'}">

<div class="header">
  <div>
    <div class="brand">CxP Manager</div>
    <h1>${tituloPDF}</h1>
    <div class="empresa">${empresa.nombre}</div>
  </div>
  <div class="meta-right">
    <div class="fecha">${fechaTexto}</div>
    <div>Generado ${horaTexto} hrs &middot; ${user?.nombre || 'usuario'}</div>
    ${detallado ? '<div style="color:#9575CD;font-weight:700;margin-top:2px;">VERSIÓN DETALLADA</div>' : ''}
  </div>
</div>

${detallado ? `
<h2>Saldos bancarios</h2>
<div class="grid">
  <div class="card mxn"><div class="lbl">Saldo MXN</div><div class="val">$${fmt(saldoNum('mxn'))}</div></div>
  <div class="card usd"><div class="lbl">Saldo USD</div><div class="val">$${fmt(saldoNum('usd'))}</div></div>
  <div class="card eur"><div class="lbl">Saldo EUR</div><div class="val">€${fmt(saldoNum('eur'))}</div></div>
</div>
<div class="tc-line">
  💱 Tipos de cambio aplicados &middot; USD/MXN <b>${tiposCambio.usdMxn}</b> &middot; EUR/MXN <b>${tiposCambio.eurMxn}</b>
</div>

<h2>Flujo del día — Saldos finales después de pagos</h2>
<table class="saldos-final">
  <thead><tr><th>Moneda</th><th class="r">Saldo inicial</th><th class="r">+ Ingresos</th><th class="r">± Cambio Divisas</th><th class="r">= Disponible</th><th class="r">− Pagos</th><th class="r">Saldo final</th></tr></thead>
  <tbody>
    ${filaSaldoFinal('mxn','MXN','$')}
    ${filaSaldoFinal('usd','USD','$')}
    ${filaSaldoFinal('eur','EUR','€')}
  </tbody>
</table>
` : `
<div class="tc-line" style="margin-bottom:6px;">
  💱 Tipos de cambio &middot; USD/MXN <b>${tiposCambio.usdMxn}</b> &middot; EUR/MXN <b>${tiposCambio.eurMxn}</b>
</div>
<div class="grid" style="margin-bottom:8px;">
  ${['mxn','usd','eur'].map(k => {
    const m = k.toUpperCase();
    const s = k === 'eur' ? '€' : '$';
    const inicial = saldoNum(k);
    const ingresos = analisisLiquidez.ingresos[m] || 0;
    const cambios = analisisLiquidez.cambios[m] || 0;
    const disponible = inicial + ingresos + cambios;
    const pago = totalesPagos[m] || 0;
    const final = disponible - pago;
    const colorFinal = final >= 0 ? '#1B5E20' : '#C62828';
    return `<div class="card ${k}">
      <div class="lbl">${m} · Inicial${ingresos>0?' + Ingresos':''}${cambios!==0?' ± Cambios':''} − Pagos = Final</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px;margin-top:2px;flex-wrap:wrap;">
        <div style="font-size:11px;color:#6B7280;">${s}${fmt(inicial)}</div>
        ${ingresos>0?`<div style="font-size:11px;color:#2E7D32;">+${s}${fmt(ingresos)}</div>`:''}
        ${cambios>0?`<div style="font-size:11px;color:#2E7D32;">+${s}${fmt(cambios)}</div>`:''}
        ${cambios<0?`<div style="font-size:11px;color:#C62828;">−${s}${fmt(Math.abs(cambios))}</div>`:''}
        <div style="font-size:11px;color:#C62828;">−${s}${fmt(pago)}</div>
        <div style="font-size:14px;font-weight:800;color:${colorFinal};">${s}${fmt(final)}</div>
      </div>
    </div>`;
  }).join('')}
</div>
`}

${ingresosDia.length > 0 ? `
<h2>💵 Ingresos del día<span class="num">(${ingresosDia.length} ${ingresosDia.length === 1 ? 'entrada' : 'entradas'})</span></h2>
<table>
  <thead>
    <tr>
      <th style="width:16%;">Rubro</th>
      <th style="width:20%;">Cliente</th>
      <th style="width:26%;">Concepto</th>
      <th class="r" style="width:13%;">MXN</th>
      <th class="r" style="width:13%;">USD</th>
      <th class="r" style="width:12%;">EUR</th>
    </tr>
  </thead>
  <tbody>
    ${ingresosDia.map(ing => `
      <tr>
        <td><b>${ing.rubro || '—'}</b></td>
        <td>${ing.cliente || '—'}</td>
        <td>${ing.concepto || '—'}</td>
        <td class="r">${ing.montoMXN > 0 ? '$' + fmt(ing.montoMXN) : '—'}</td>
        <td class="r">${ing.montoUSD > 0 ? '$' + fmt(ing.montoUSD) : '—'}</td>
        <td class="r">${ing.montoEUR > 0 ? '€' + fmt(ing.montoEUR) : '—'}</td>
      </tr>
    `).join('')}
  </tbody>
  <tfoot>
    <tr style="background:#E8F5E9;font-weight:800;">
      <td colspan="3" style="color:#1B5E20;">TOTAL</td>
      <td class="r" style="color:#1B5E20;">${totalesIngresos.MXN > 0 ? '$' + fmt(totalesIngresos.MXN) : '—'}</td>
      <td class="r" style="color:#1B5E20;">${totalesIngresos.USD > 0 ? '$' + fmt(totalesIngresos.USD) : '—'}</td>
      <td class="r" style="color:#1B5E20;">${totalesIngresos.EUR > 0 ? '€' + fmt(totalesIngresos.EUR) : '—'}</td>
    </tr>
  </tfoot>
</table>
` : ''}

${(() => {
  // Cambios de divisa: solo mostrar si hay al menos una operación capturada
  const cambiosActivos = cambiosHoy.filter(c => (+c.montoVendido || 0) > 0 || (+c.montoComprado || 0) > 0);
  if (cambiosActivos.length === 0) return '';
  const labelDir = (dir) => {
    const map = { USD_MXN: 'USD → MXN', MXN_USD: 'MXN → USD', EUR_MXN: 'EUR → MXN', MXN_EUR: 'MXN → EUR' };
    return map[dir] || dir;
  };
  const simByMon = (m) => m === 'EUR' ? '€' : '$';
  // Asegurar orden lógico
  const orden = ['USD_MXN', 'MXN_USD', 'EUR_MXN', 'MXN_EUR'];
  const cambiosOrdenados = orden
    .map(d => cambiosActivos.find(c => c.direccion === d))
    .filter(Boolean);
  return `
<h2>💱 Cambio de divisas hoy<span class="num">(${cambiosOrdenados.length} ${cambiosOrdenados.length === 1 ? 'operación' : 'operaciones'})</span></h2>
<table>
  <thead>
    <tr>
      <th style="width:22%;">Operación</th>
      <th class="r" style="width:23%;">Vendió</th>
      <th style="width:4%;text-align:center;"></th>
      <th class="r" style="width:23%;">Compró</th>
      <th class="r" style="width:14%;">T.C. efectivo</th>
    </tr>
  </thead>
  <tbody>
    ${cambiosOrdenados.map(c => {
      const [monedaV, monedaC] = c.direccion.split('_');
      const simV = simByMon(monedaV);
      const simC = simByMon(monedaC);
      const tc = (c.montoVendido > 0 && c.montoComprado > 0)
        ? (monedaV === 'MXN' ? (c.montoVendido / c.montoComprado) : (c.montoComprado / c.montoVendido))
        : 0;
      return `
      <tr>
        <td><b>${labelDir(c.direccion)}</b></td>
        <td class="r" style="color:#C62828;">−${simV}${fmt(c.montoVendido)} ${monedaV}</td>
        <td style="text-align:center;color:#999;">→</td>
        <td class="r" style="color:#2E7D32;">+${simC}${fmt(c.montoComprado)} ${monedaC}</td>
        <td class="r">${tc > 0 ? tc.toFixed(4) : '—'}</td>
      </tr>`;
    }).join('')}
  </tbody>
  <tfoot>
    <tr style="background:#E3F2FD;font-weight:800;">
      <td colspan="5" style="color:#0D47A1;font-size:11px;">
        Efecto neto: 
        ${analisisLiquidez.cambios.MXN !== 0 ? `MXN ${analisisLiquidez.cambios.MXN >= 0 ? '+' : '−'}$${fmt(Math.abs(analisisLiquidez.cambios.MXN))}` : ''}
        ${analisisLiquidez.cambios.USD !== 0 ? ` · USD ${analisisLiquidez.cambios.USD >= 0 ? '+' : '−'}$${fmt(Math.abs(analisisLiquidez.cambios.USD))}` : ''}
        ${analisisLiquidez.cambios.EUR !== 0 ? ` · EUR ${analisisLiquidez.cambios.EUR >= 0 ? '+' : '−'}€${fmt(Math.abs(analisisLiquidez.cambios.EUR))}` : ''}
      </td>
    </tr>
  </tfoot>
</table>
`;
})()}

<h2>Pagos programados para hoy<span class="num">(${pagosProgramadosHoy.length} ${pagosProgramadosHoy.length === 1 ? 'proveedor' : 'proveedores'}${detallado ? ' · con detalle de facturas' : ''})</span></h2>
<table>
  <thead>
    <tr>
      <th>Proveedor</th>
      <th class="c">Moneda</th>
      <th class="r">Importe adeudado</th>
      <th class="r">Pago del día</th>
      <th class="r">Saldo después</th>
      <th class="c">Facturas</th>
    </tr>
  </thead>
  <tbody>${filasHTML}${totalesHTML}</tbody>
</table>

<div class="footer">
  <div class="brand-foot">CxP MANAGER</div>
  <div>${empresa.nombre} &middot; Generado el ${new Date().toLocaleString('es-MX')}</div>
</div>

<script>
  window.onload = function() { setTimeout(function() { window.print(); }, 300); };
</script>
</body></html>`;

      return html;
    };

    const generarPDF = (modo = 'resumen', orientacion = 'portrait') => {
      setPdfModalOpen(false);
      const html = construirHtmlReporte(modo, orientacion);
      const win = window.open('', '_blank');
      if (!win) {
        alert('El navegador bloqueó la ventana emergente. Permite ventanas emergentes para este sitio e intenta de nuevo.');
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
    };

    const copiarResumen = () => {
      const ingresosTxt = ingresosDia.length > 0 ? `

💵 INGRESOS DEL DÍA (${ingresosDia.length}):
${ingresosDia.map(i => {
  const partes = [];
  if (i.montoMXN > 0) partes.push(`$${fmt(i.montoMXN)} MXN`);
  if (i.montoUSD > 0) partes.push(`$${fmt(i.montoUSD)} USD`);
  if (i.montoEUR > 0) partes.push(`€${fmt(i.montoEUR)} EUR`);
  const etiqueta = [i.rubro, i.cliente, i.concepto].filter(s => s && s.trim()).join(' / ') || '(sin detalle)';
  return `• ${etiqueta}: ${partes.join(' · ') || '—'}`;
}).join('\n')}
Total: ${totalesIngresos.MXN > 0 ? `$${fmt(totalesIngresos.MXN)} MXN` : ''}${totalesIngresos.USD > 0 ? ` · $${fmt(totalesIngresos.USD)} USD` : ''}${totalesIngresos.EUR > 0 ? ` · €${fmt(totalesIngresos.EUR)} EUR` : ''}` : '';

      const resumen = `📊 REPORTE DE PAGOS - ${new Date().toLocaleDateString()}
💼 Empresa: ${empresa.nombre}

💰 PAGOS PROGRAMADOS HOY:
• MXN: $${fmt(totalesPagos.MXN)}
• USD: $${fmt(totalesPagos.USD)}  
• EUR: €${fmt(totalesPagos.EUR)}

🏦 ANÁLISIS DE LIQUIDEZ:
• MXN: ${analisisLiquidez.statusMXN} ${analisisLiquidez.deficit.MXN >= 0 ? 'Excedente' : 'Déficit'}: $${fmt(Math.abs(analisisLiquidez.deficit.MXN))}
• USD: ${analisisLiquidez.statusUSD} ${analisisLiquidez.deficit.USD >= 0 ? 'Excedente' : 'Déficit'}: $${fmt(Math.abs(analisisLiquidez.deficit.USD))}${ingresosTxt}

📋 PROVEEDORES (${pagosProgramadosHoy.length}):
${pagosProgramadosHoy.map(p => `• ${p.proveedor}: Adeuda $${fmt(p.importeAdeudado)} ${p.moneda}, Pago hoy $${fmt(p.pagoHoy)} ${p.moneda}`).join('\n')}`;
      navigator.clipboard.writeText(resumen);
      alert("Resumen copiado al portapapeles");
    };

    // ── Generación de PNG de secciones del reporte ──────────────────────
    // Construir nodo decorado con header + contenido a capturar
    const construirNodoCapturable = (tituloImg, subtitulo, contenidos) => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:absolute;top:-99999px;left:0;width:1100px;background:#ffffff;padding:24px 28px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,sans-serif;box-sizing:border-box;';

      // Header elegante
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:3px solid #1A237E;margin-bottom:20px;';
      // fechaReporte = fecha del reporte (la seleccionada)
      const fechaReporte = new Date(fechaSeleccionada + 'T12:00:00').toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
      // fechaGen = fecha actual de generación (puede ser distinta si el reporte es histórico)
      const fechaGen = new Date().toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric' });
      const horaGen = new Date().toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
      // Si la fecha de generación coincide con la del reporte, no la repetimos para no saturar
      const mostrarFechaGen = fechaSeleccionada !== today();
      header.innerHTML = `
        <div>
          <div style="font-size:10px;font-weight:700;color:#6366F1;letter-spacing:3px;text-transform:uppercase;margin-bottom:4px;">CxP Manager</div>
          <div style="font-size:22px;font-weight:800;color:#1A237E;letter-spacing:-0.4px;line-height:1.15;">${tituloImg}</div>
          <div style="font-size:13px;color:#1F2937;margin-top:4px;font-weight:500;">${subtitulo}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px;color:#4B5563;font-weight:600;">${fechaReporte}</div>
          <div style="font-size:11px;color:#6B7280;margin-top:2px;">Generado${mostrarFechaGen ? ' el ' + fechaGen + ' a las ' : ' '}${horaGen} hrs · ${user?.nombre || 'usuario'}</div>
        </div>
      `;
      wrapper.appendChild(header);

      // Clones de los contenidos
      // Si no hay cambios de divisa activos, ocultar esa sección en el export
      // (se conserva visible en pantalla para capturar nuevos, pero no se exporta)
      const hayCambiosDivisa = cambiosHoy.some(c => (+c.montoVendido || 0) > 0 || (+c.montoComprado || 0) > 0);
      contenidos.forEach((nodoOriginal, idx) => {
        if (!nodoOriginal) return;
        const clon = nodoOriginal.cloneNode(true);
        // Remover bordes redondeados externos para look más continuo
        clon.style.marginBottom = idx === contenidos.length - 1 ? '0' : '18px';
        // Quitar la sección de Cambio de Divisas si está vacía
        if (!hayCambiosDivisa) {
          const seccionDivisas = clon.querySelectorAll('[data-seccion="cambio-divisas"]');
          seccionDivisas.forEach(n => n.remove());
        }
        wrapper.appendChild(clon);
      });

      // Footer
      const footer = document.createElement('div');
      footer.style.cssText = 'margin-top:22px;padding-top:12px;border-top:1px solid #E5E7EB;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#9CA3AF;';
      footer.innerHTML = `
        <div style="font-weight:600;letter-spacing:0.3px;">${empresa.nombre}</div>
        <div style="font-style:italic;">Reporte generado automáticamente por CxP Manager</div>
      `;
      wrapper.appendChild(footer);

      return wrapper;
    };

    // Captura un nodo construido y descarga el PNG
    const capturarWrapper = async (wrapper, nombreArchivo) => {
      document.body.appendChild(wrapper);
      try {
        // Pequeña espera para que el browser pinte
        await new Promise(r => setTimeout(r, 150));
        const canvas = await html2canvas(wrapper, {
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false,
          useCORS: true,
          windowWidth: wrapper.scrollWidth,
          windowHeight: wrapper.scrollHeight,
        });
        return new Promise(resolve => {
          canvas.toBlob(blob => {
            if (!blob) { resolve(null); return; }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = nombreArchivo;
            a.click();
            URL.revokeObjectURL(url);
            resolve(blob);
          }, 'image/png');
        });
      } finally {
        if (wrapper.parentNode) document.body.removeChild(wrapper);
      }
    };

    // ── Partición automática del detalle en múltiples imágenes ─────────
    // Divide el tbody en "páginas" de ~20 filas respetando siempre al proveedor
    // completo (una fila de proveedor + todas sus subfilas de facturas).
    const particionarDetalle = (filasPorPagina = 20) => {
      const refNodo = refDetalle.current;
      if (!refNodo) return [];
      const originalClon = refNodo.cloneNode(true);
      const tabla = originalClon.querySelector('table');
      if (!tabla) return [originalClon];
      const tbody = tabla.querySelector('tbody');
      if (!tbody) return [originalClon];

      const filas = Array.from(tbody.children);
      // Si son pocas filas, no dividir
      if (filas.length <= filasPorPagina + 5) return [originalClon];

      // Agrupar filas en bloques: fila de proveedor + sus subfilas de facturas.
      // Una subfila tiene padding-left grande (32px) y contiene el símbolo ↳.
      const bloques = [];
      let bloqueActual = null;
      filas.forEach(fila => {
        const textoFila = fila.textContent || '';
        const esSubfila = textoFila.includes('↳');
        if (esSubfila && bloqueActual) {
          bloqueActual.push(fila);
        } else {
          if (bloqueActual) bloques.push(bloqueActual);
          bloqueActual = [fila];
        }
      });
      if (bloqueActual) bloques.push(bloqueActual);

      if (bloques.length <= 1) return [originalClon];

      // Agrupar bloques en páginas de máximo ~filasPorPagina filas
      const paginas = [];
      let paginaActual = [];
      let filasAcumuladas = 0;
      bloques.forEach(bloque => {
        const filasBloque = bloque.length;
        // Si el bloque por sí solo excede el límite, lo dejamos en su propia página
        // (un proveedor con 27 facturas — no partimos dentro)
        if (paginaActual.length > 0 && filasAcumuladas + filasBloque > filasPorPagina) {
          paginas.push(paginaActual);
          paginaActual = [];
          filasAcumuladas = 0;
        }
        paginaActual.push(bloque);
        filasAcumuladas += filasBloque;
      });
      if (paginaActual.length > 0) paginas.push(paginaActual);

      if (paginas.length === 1) return [originalClon];

      // Crear un clon por página con solo sus bloques
      const clones = paginas.map((pagina, idx) => {
        const clon = refNodo.cloneNode(true);
        const tablaClon = clon.querySelector('table');
        const tbodyClon = tablaClon?.querySelector('tbody');
        const tfootClon = tablaClon?.querySelector('tfoot');
        if (!tbodyClon) return clon;
        tbodyClon.innerHTML = '';
        pagina.forEach(bloque => {
          bloque.forEach(fila => tbodyClon.appendChild(fila.cloneNode(true)));
        });
        // tfoot (totales) y chips verdes "Saldos Después de Pagos": solo en la ÚLTIMA página
        const esUltima = idx === paginas.length - 1;
        if (!esUltima) {
          if (tfootClon) tfootClon.remove();
          // Quitar bloque verde "Saldos Después de Pagos" — lo identificamos por el texto del h3
          const headers = Array.from(clon.querySelectorAll('h3'));
          const headerSaldosDespues = headers.find(h => (h.textContent || '').includes('Saldos Después de Pagos'));
          if (headerSaldosDespues) {
            // Encontrar el div ancestro más cercano (el contenedor verde)
            const bloqueVerde = headerSaldosDespues.closest('div');
            if (bloqueVerde) bloqueVerde.remove();
          }
          // Nota "Continúa..."
          const nota = document.createElement('div');
          nota.style.cssText = 'text-align:center;padding:14px 16px;font-size:12px;color:#6B7280;font-style:italic;background:#F9FAFB;border:1px dashed #D1D5DB;border-radius:10px;margin-top:8px;';
          nota.textContent = '⋯ Continúa en la siguiente imagen ⋯';
          clon.appendChild(nota);
        }
        return clon;
      });
      return clones;
    };

    const generarPNG = async (modo) => {
      setExportModalOpen(false);
      setGenerandoPng(true);
      // Usar la fecha del REPORTE (la seleccionada), no la de hoy
      const fechaStr = fechaSeleccionada;
      const empresaSlug = empresa.nombre.replace(/\s+/g, '_');
      // fechaBonita refleja el día del REPORTE, no el día de generación
      const fechaBonita = new Date(fechaSeleccionada + 'T12:00:00').toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' });
      // Título e identificación de histórico
      const tituloReporte = esVistaHistorica ? 'Reporte de Tesorería Histórico' : 'Reporte de Tesorería del Día';
      const prefijoSubtitulo = esVistaHistorica ? `📅 Datos del ${fechaBonita}` : `Resumen financiero · ${fechaBonita}`;
      const subtituloDetalle = esVistaHistorica ? `📅 Detalle del ${fechaBonita}` : `Proveedores y saldos después de pagos · ${fechaBonita}`;
      const subtituloCompleto = esVistaHistorica ? `📅 Reporte completo del ${fechaBonita}` : `Reporte completo · ${fechaBonita}`;
      // Sufijo de archivo: si es histórico agrega -historico
      const sufijoHist = esVistaHistorica ? '_historico' : '';
      try {
        if (modo === 'resumen') {
          // Solo la parte superior (saldos, ingresos, cambios, saldo disponible)
          const w = construirNodoCapturable(
            tituloReporte,
            prefijoSubtitulo,
            [refResumen.current]
          );
          await capturarWrapper(w, `Tesoreria_Resumen_${empresaSlug}_${fechaStr}${sufijoHist}.png`);
        } else if (modo === 'detalle') {
          // Particionar el detalle en múltiples imágenes (~20 filas por imagen)
          const partesDetalle = particionarDetalle(20);
          const totalImagenes = 1 + partesDetalle.length; // 1 resumen + N partes detalle

          // Imagen 1: resumen (arriba)
          const w1 = construirNodoCapturable(
            tituloReporte,
            `${prefijoSubtitulo} · Parte 1/${totalImagenes}`,
            [refResumen.current]
          );
          await capturarWrapper(w1, `1_Tesoreria_Resumen_${empresaSlug}_${fechaStr}${sufijoHist}.png`);
          await new Promise(r => setTimeout(r, 300));

          // Imágenes 2..N: partes del detalle
          for (let i = 0; i < partesDetalle.length; i++) {
            const numParte = i + 2; // 2, 3, 4...
            const parteLabel = partesDetalle.length === 1
              ? ''
              : ` (${i + 1} de ${partesDetalle.length})`;
            const sufijoArchivo = partesDetalle.length === 1
              ? 'Detalle'
              : `Detalle_${i + 1}de${partesDetalle.length}`;
            const wParte = construirNodoCapturable(
              `Detalle de Pagos Programados${parteLabel}`,
              `${subtituloDetalle} · Parte ${numParte}/${totalImagenes}`,
              [partesDetalle[i]]
            );
            await capturarWrapper(wParte, `${numParte}_Tesoreria_${sufijoArchivo}_${empresaSlug}_${fechaStr}${sufijoHist}.png`);
            await new Promise(r => setTimeout(r, 300));
          }
        } else if (modo === 'completo') {
          // Todo en una imagen larga: resumen + detalle sin duplicación
          const w = construirNodoCapturable(
            tituloReporte,
            subtituloCompleto,
            [refResumen.current, refDetalle.current]
          );
          await capturarWrapper(w, `Tesoreria_Completo_${empresaSlug}_${fechaStr}${sufijoHist}.png`);
        }
      } catch (err) {
        console.error('generarPNG error:', err);
        alert('Hubo un error al generar la imagen. Intenta de nuevo.');
      }
      setGenerandoPng(false);
    };

    const monedaSym = (moneda) => ({ MXN: "$", USD: "$", EUR: "€" }[moneda] || "$");

    return (
      <div>
        {/* Banner de vista histórica */}
        {esVistaHistorica && !edicionHistoricaHabilitada && (
          <div style={{background:'linear-gradient(135deg, #FFF8E1 0%, #FFFDE7 100%)',border:'1px solid #FFB300',borderRadius:10,padding:'10px 16px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:18}}>📅</span>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:'#E65100'}}>Vista histórica · solo lectura</div>
                <div style={{fontSize:11,color:'#BF6E0A'}}>Estás viendo el reporte de una fecha pasada. Los datos son históricos y no se pueden modificar.</div>
              </div>
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {esAdmin && (
                <button
                  onClick={() => {
                    const fechaTxt = new Date(fechaSeleccionada+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'});
                    if (confirm(`¿Habilitar edición del reporte del ${fechaTxt}?\n\nVas a poder editar saldos, ingresos y cambios de divisa de esa fecha.\nLos cambios afectan el histórico permanentemente.`)) {
                      setEdicionHistoricaHabilitada(true);
                    }
                  }}
                  style={{background:'#fff',color:'#E65100',border:'1px solid #FFB300',padding:'6px 14px',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}
                >
                  🔓 Habilitar edición
                </button>
              )}
              <button
                onClick={() => setFechaSeleccionada(today())}
                style={{background:'#FFB300',color:'#fff',border:'none',padding:'6px 14px',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}
              >
                ↻ Volver a Hoy
              </button>
            </div>
          </div>
        )}

        {/* Banner de modo EDICIÓN histórica (solo admin) */}
        {esVistaHistorica && edicionHistoricaHabilitada && (
          <div style={{background:'linear-gradient(135deg, #FFEBEE 0%, #FFCDD2 100%)',border:'2px solid #C62828',borderRadius:10,padding:'10px 16px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',animation:'pulse 2s infinite'}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:20}}>✏️</span>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:'#B71C1C'}}>EDITANDO vista histórica · {new Date(fechaSeleccionada+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'})}</div>
                <div style={{fontSize:11,color:'#C62828'}}>Los cambios afectan el histórico permanentemente. Termina la edición cuando hayas terminado.</div>
              </div>
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <button
                onClick={() => setEdicionHistoricaHabilitada(false)}
                style={{background:'#fff',color:'#B71C1C',border:'1px solid #C62828',padding:'6px 14px',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}
              >
                🔒 Terminar edición
              </button>
              <button
                onClick={() => { setEdicionHistoricaHabilitada(false); setFechaSeleccionada(today()); }}
                style={{background:'#C62828',color:'#fff',border:'none',padding:'6px 14px',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}
              >
                ↻ Volver a Hoy
              </button>
            </div>
          </div>
        )}

        {/* Mostrar origen del saldo cuando es heredado */}
        {esHoy && saldosMeta.fuente === 'heredado' && saldosMeta.fechaOrigen && (
          <div style={{background:'#E8F5E9',border:'1px solid #66BB6A',borderRadius:8,padding:'8px 14px',marginBottom:14,fontSize:12,color:'#1B5E20',display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:14}}>📥</span>
            <span><b>Saldo heredado del cierre del {new Date(saldosMeta.fechaOrigen+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'long'})}.</b> Puedes ajustarlo si difiere del banco real.</span>
          </div>
        )}

        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
          <div>
            <h2 style={{fontSize:18,fontWeight:800,color:C.navy,margin:0}}>
              📊 Reporte de Tesorería {esHoy ? 'del Día' : 'Histórico'}
            </h2>
            <p style={{color:C.muted,fontSize:13,margin:"4px 0 0"}}>
              Flujo de tesorería · {empresa.nombre}
            </p>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            {/* Selector de fecha */}
            <div style={{display:"flex",alignItems:"center",gap:6,background:esHoy?"#E3F2FD":"#FFF8E1",border:`1px solid ${esHoy?C.blue:'#FFB300'}`,borderRadius:10,padding:"4px 10px"}}>
              <span style={{fontSize:13}}>📅</span>
              <input
                type="date"
                value={fechaSeleccionada}
                max={today()}
                onChange={(e) => setFechaSeleccionada(e.target.value || today())}
                style={{background:"transparent",border:"none",fontSize:12,fontWeight:700,color:esHoy?C.navy:'#E65100',outline:"none",fontFamily:"inherit",cursor:"pointer"}}
              />
            </div>
            {/* Tipos de cambio compactos */}
            <div style={{display:"flex",alignItems:"center",gap:6,background:"#F3E5F5",border:"1px solid #CE93D8",borderRadius:10,padding:"4px 8px"}}>
              <span style={{fontSize:11,fontWeight:700,color:C.eur,letterSpacing:0.3}}>TC</span>
              <span style={{fontSize:10,color:C.usd,fontWeight:600}}>USD</span>
              <input
                value={tiposCambio.usdMxn}
                onChange={(e) => setTiposCambio(prev => ({...prev, usdMxn: e.target.value.replace(/[^\d.]/g, '')}))}
                placeholder="20.00"
                style={{width:50,background:"#fff",border:`1px solid ${C.usd}`,borderRadius:6,padding:"3px 6px",fontSize:12,fontWeight:700,textAlign:"center",color:C.usd,outline:"none"}}
              />
              <span style={{fontSize:10,color:C.eur,fontWeight:600,marginLeft:4}}>EUR</span>
              <input
                value={tiposCambio.eurMxn}
                onChange={(e) => setTiposCambio(prev => ({...prev, eurMxn: e.target.value.replace(/[^\d.]/g, '')}))}
                placeholder="22.00"
                style={{width:50,background:"#fff",border:`1px solid ${C.eur}`,borderRadius:6,padding:"3px 6px",fontSize:12,fontWeight:700,textAlign:"center",color:C.eur,outline:"none"}}
              />
            </div>
            <button onClick={() => setExportModalOpen(true)} disabled={generandoPng} style={{...btnStyle,background:generandoPng ? "#999" : "#E53E3E",color:"#fff",padding:"8px 16px",fontSize:13,cursor:generandoPng?'wait':'pointer'}}>
              {generandoPng ? '⏳ Generando...' : '📤 Exportar'}
            </button>
            <button onClick={copiarResumen} style={{...btnStyle,background:"#38A169",color:"#fff",padding:"8px 16px",fontSize:13}}>📋 Copiar</button>
          </div>
        </div>

        {/* ═══════ WRAPPER PARA CAPTURA PNG - RESUMEN ═══════ */}
        <div ref={refResumen}>

        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:20,marginBottom:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
            <h3 style={{fontSize:20,fontWeight:800,color:C.navy,margin:0,letterSpacing:0.2}}>🏦 Saldos Bancarios - {empresa.nombre}</h3>
            <div style={{fontSize:11,color:C.muted,display:"flex",alignItems:"center",gap:6}}>
              {saldosLoading && <span>⏳ Cargando...</span>}
              {saldosSaving && <span style={{color:"#FB8C00"}}>💾 Guardando...</span>}
              {!saldosLoading && !saldosSaving && saldosMeta.updatedAt && (
                <span>✓ Última actualización: {new Date(saldosMeta.updatedAt).toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'})}{saldosMeta.updatedBy ? ` · ${saldosMeta.updatedBy}` : ''}</span>
              )}
              {!saldosLoading && !saldosSaving && !saldosMeta.updatedAt && (
                <span style={{color:"#999"}}>Sin saldos guardados aún</span>
              )}
            </div>
          </div>
          
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20}}>
            {[
              {key: 'mxn', label: 'MXN', symbol: '$', bg: '#E3F2FD', color: C.mxn, border: '#90CAF9'},
              {key: 'usd', label: 'USD', symbol: '$', bg: '#E8F5E9', color: C.usd, border: '#A5D6A7'},
              {key: 'eur', label: 'EUR', symbol: '€', bg: '#F3E5F5', color: C.eur, border: '#CE93D8'}
            ].map(({key, label, symbol, bg, color, border}) => {
              const valor = saldosEmpresas[empresaId]?.[key] || "0";
              const valorNumerico = parseFloat(String(valor).replace(/[,$]/g, '')) || 0;
              const isEditing = editando[key];
              
              return (
                <div key={key} style={{
                  background:bg,
                  border:`2px solid ${border}`,
                  borderRadius:12,
                  padding:20,
                  minHeight:120,
                  display:'flex',
                  flexDirection:'column',
                  justifyContent:'center',
                  alignItems:'center',
                  cursor: isEditing ? 'default' : (esConsulta ? 'not-allowed' : 'pointer'),
                  opacity: esConsulta ? 0.85 : 1,
                  transition:'all 0.2s ease',
                  transform: isEditing ? 'scale(1.02)' : 'scale(1)'
                }}
                onClick={() => !isEditing && !esConsulta && handleEditToggle(key, true)}>
                  
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                    <span style={{fontSize:16,fontWeight:700,color}}>{label}</span>
                    <span style={{width:12,height:12,borderRadius:6,background:color}}/>
                  </div>
                  
                  {!isEditing ? (
                    <div style={{textAlign:'center'}}>
                      <div style={{fontSize:28,fontWeight:800,color,textShadow:'0 2px 4px rgba(0,0,0,0.1)',marginBottom:4}}>
                        {symbol}{fmt(valorNumerico)}
                      </div>
                      <div style={{fontSize:11,color:color,opacity:0.7}}>
                        {esConsulta ? 'Solo lectura' : 'Clic para editar'}
                      </div>
                    </div>
                  ) : (
                    <input 
                      value={valor}
                      onChange={(e) => {
                        let inputValue = e.target.value.replace(/[^\d.]/g, '');
                        handleSaldoChange(key, inputValue);
                      }}
                      onBlur={() => handleEditToggle(key, false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditToggle(key, false);
                        if (e.key === 'Escape') handleEditToggle(key, false);
                      }}
                      autoFocus
                      placeholder="0"
                      style={{
                        background:'white',
                        border:`3px solid ${color}`,
                        borderRadius:8,
                        padding:'8px 12px',
                        fontSize:24,
                        fontWeight:800,
                        textAlign:'center',
                        width:'100%',
                        boxSizing:'border-box',
                        outline:'none',
                        color: color,
                        fontFamily:'inherit',
                        boxShadow: `0 0 0 3px ${color}20`
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Separador sutil */}
          <div style={{borderTop:`1px solid ${C.border}`,marginTop:22,marginBottom:18}}/>

          {/* Sub-sección: Ingresos del Día */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:8}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:42,height:42,borderRadius:10,background:'#E8F5E9',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>💵</div>
              <div>
                <h4 style={{fontSize:20,fontWeight:800,color:'#1B5E20',margin:0,letterSpacing:0.2}}>Ingresos del Día</h4>
                <p style={{fontSize:12,color:C.muted,margin:'3px 0 0'}}>Captura manual · {ingresosDia.length} {ingresosDia.length === 1 ? 'entrada' : 'entradas'}</p>
              </div>
            </div>
            {!esConsulta && (
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button
                  onClick={() => agregarIngreso(false)}
                  title="Ingreso que YA entró al banco (real, confirmado)"
                  style={{background:'#1B5E20',color:'#fff',border:'none',padding:'8px 14px',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',boxShadow:'0 1px 3px rgba(27,94,32,0.25)'}}
                >
                  ✅ + Ingreso Real
                </button>
                <button
                  onClick={() => agregarIngreso(true)}
                  title="Ingreso que esperas recibir HOY (cobranza probable, aún no entra)"
                  style={{background:'#6A1B9A',color:'#fff',border:'none',padding:'8px 14px',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',boxShadow:'0 1px 3px rgba(106,27,154,0.25)'}}
                >
                  ⏳ + Ingreso Esperado
                </button>
                <button onClick={() => setImportarIngresosModal({ open: true, monedaGlobal: 'MXN', archivo: null, textoPegado: '', rows: [] })} style={{background:'#1976D2',color:'#fff',border:'none',padding:'8px 14px',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',boxShadow:'0 1px 3px rgba(25,118,210,0.25)'}}>📥 Importar Excel</button>
              </div>
            )}
          </div>

          <div style={{border:`1px solid #C8E6C9`,borderRadius:10,overflow:'hidden',background:'#fff'}}>
          {ingresosLoading ? (
            <div style={{padding:20,textAlign:'center',color:C.muted,fontSize:13}}>Cargando ingresos...</div>
          ) : ingresosDia.length === 0 ? (
            <div style={{padding:'22px 20px',textAlign:'center',color:C.muted,display:'flex',alignItems:'center',justifyContent:'center',gap:10,flexWrap:'wrap'}}>
              <div style={{fontSize:22}}>💵</div>
              <div style={{fontSize:13,color:'#1B5E20',fontWeight:600}}>Aún no hay ingresos capturados hoy.</div>
              <div style={{fontSize:12,color:C.muted}}>Usa "+ Ingreso Real" o "+ Ingreso Esperado" para la primera entrada.</div>
            </div>
          ) : (
            <>
              <div style={{overflow:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13,tableLayout:'fixed'}}>
                  <colgroup>
                    <col style={{width:'16%'}}/>
                    <col style={{width:'18%'}}/>
                    <col style={{width:'22%'}}/>
                    <col style={{width:'12%'}}/>
                    <col style={{width:'12%'}}/>
                    <col style={{width:'12%'}}/>
                    {!esConsulta && <col style={{width:'8%'}}/>}
                  </colgroup>
                  <thead>
                    <tr style={{background:'#E8F5E9'}}>
                      <th style={{padding:'10px 12px',textAlign:'left',fontWeight:700,color:'#1B5E20',fontSize:11,textTransform:'uppercase',letterSpacing:0.5}}>Rubro</th>
                      <th style={{padding:'10px 12px',textAlign:'left',fontWeight:700,color:'#1B5E20',fontSize:11,textTransform:'uppercase',letterSpacing:0.5}}>Cliente</th>
                      <th style={{padding:'10px 12px',textAlign:'left',fontWeight:700,color:'#1B5E20',fontSize:11,textTransform:'uppercase',letterSpacing:0.5}}>Concepto</th>
                      <th style={{padding:'10px 12px',textAlign:'right',fontWeight:700,color:'#1B5E20',fontSize:11,textTransform:'uppercase',letterSpacing:0.5}}>MXN</th>
                      <th style={{padding:'10px 12px',textAlign:'right',fontWeight:700,color:'#1B5E20',fontSize:11,textTransform:'uppercase',letterSpacing:0.5}}>USD</th>
                      <th style={{padding:'10px 12px',textAlign:'right',fontWeight:700,color:'#1B5E20',fontSize:11,textTransform:'uppercase',letterSpacing:0.5}}>EUR</th>
                      {!esConsulta && <th style={{padding:'10px 12px',textAlign:'center'}}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Usar las listas memoizadas ordenadas (USD → EUR → MXN, mayor a menor)
                      const reales = ingresosRealesOrdenados;
                      const proyectados = ingresosProyectadosOrdenados;

                      const renderFila = (ing, esProyectado) => {
                      const keyRubro = `${ing.id}_rubro`;
                      const keyCliente = `${ing.id}_cliente`;
                      const keyConcepto = `${ing.id}_concepto`;
                      const keyMXN = `${ing.id}_MXN`;
                      const keyUSD = `${ing.id}_USD`;
                      const keyEUR = `${ing.id}_EUR`;
                      const editable = !esConsulta;

                      const renderCelda = (key, valorMostrar, alignRight = true) => {
                        const enEdicion = editandoIngreso === key;
                        const esCampoTexto = key.endsWith('_rubro') || key.endsWith('_cliente') || key.endsWith('_concepto');
                        if (enEdicion) {
                          // Calcular sugerencias filtradas (solo para campos de texto)
                          let sugerenciasFiltradas = [];
                          if (esCampoTexto && valorIngreso.trim().length >= 2) {
                            const lista = key.endsWith('_rubro') ? sugerencias.rubros
                                       : key.endsWith('_cliente') ? sugerencias.clientes
                                       : sugerencias.conceptos;
                            const q = valorIngreso.trim().toLowerCase();
                            const empiezan = lista.filter(s => s.toLowerCase().startsWith(q) && s.toLowerCase() !== q);
                            const contienen = lista.filter(s => {
                              const sl = s.toLowerCase();
                              return sl.includes(q) && !sl.startsWith(q) && sl !== q;
                            });
                            sugerenciasFiltradas = [...empiezan, ...contienen].slice(0, 8);
                          }

                          const seleccionarSugerencia = async (texto) => {
                            setValorIngreso(texto);
                            setTimeout(() => {
                              const [id, campo] = key.split('_');
                              const ingActual = ingresosDia.find(x => x.id === id);
                              if (ingActual) {
                                const nuevo = { ...ingActual };
                                if (campo === 'rubro') nuevo.rubro = texto;
                                if (campo === 'cliente') nuevo.cliente = texto;
                                if (campo === 'concepto') nuevo.concepto = texto;
                                upsertIngresoDia(nuevo, user?.nombre || 'desconocido');
                                setIngresosDia(prev => prev.map(x => x.id === id ? nuevo : x));
                              }
                              setEditandoIngreso(null);
                              setValorIngreso('');
                              setSugerenciaIdx(-1);
                            }, 0);
                          };

                          return (
                            <div style={{position:'relative'}}>
                              <input
                                autoFocus
                                value={valorIngreso}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setValorIngreso(esCampoTexto ? v : v.replace(/[^\d.]/g, ''));
                                  setSugerenciaIdx(-1);
                                }}
                                onBlur={() => { setTimeout(() => guardarCeldaIngreso(), 150); }}
                                onKeyDown={(e) => {
                                  if (esCampoTexto && sugerenciasFiltradas.length > 0) {
                                    if (e.key === 'ArrowDown') { e.preventDefault(); setSugerenciaIdx(prev => Math.min(prev + 1, sugerenciasFiltradas.length - 1)); return; }
                                    if (e.key === 'ArrowUp')   { e.preventDefault(); setSugerenciaIdx(prev => Math.max(prev - 1, -1)); return; }
                                    if (e.key === 'Enter' && sugerenciaIdx >= 0) { e.preventDefault(); seleccionarSugerencia(sugerenciasFiltradas[sugerenciaIdx]); return; }
                                  }
                                  if (e.key === 'Enter') guardarCeldaIngreso();
                                  if (e.key === 'Escape') { cancelarCeldaIngreso(); setSugerenciaIdx(-1); }
                                }}
                                style={{width:'100%',border:`2px solid ${esProyectado ? '#6A1B9A' : '#1B5E20'}`,borderRadius:5,padding:'6px 8px',fontSize:12,textAlign:alignRight?'right':'left',fontFamily:alignRight?'monospace':'inherit',fontVariantNumeric:alignRight?'tabular-nums':'normal',outline:'none',boxSizing:'border-box'}}
                              />
                              {esCampoTexto && sugerenciasFiltradas.length > 0 && (
                                <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#fff',border:`1px solid ${esProyectado ? '#6A1B9A' : '#1B5E20'}`,borderTop:'none',borderRadius:'0 0 6px 6px',boxShadow:'0 4px 12px rgba(0,0,0,0.12)',zIndex:1000,maxHeight:240,overflowY:'auto'}}>
                                  {sugerenciasFiltradas.map((s, idx) => (
                                    <div
                                      key={s}
                                      onMouseDown={(e) => { e.preventDefault(); seleccionarSugerencia(s); }}
                                      onMouseEnter={() => setSugerenciaIdx(idx)}
                                      style={{padding:'8px 12px',fontSize:12,cursor:'pointer',background: idx === sugerenciaIdx ? (esProyectado?'#F3E5F5':'#E8F5E9') : 'transparent',borderBottom: idx < sugerenciasFiltradas.length - 1 ? '1px solid #F3F4F6' : 'none',color: '#1F2937',fontFamily: 'inherit'}}
                                    >{s}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        }
                        return (
                          <div
                            onClick={() => {
                              if (!editable) return;
                              setEditandoIngreso(key);
                              setSugerenciaIdx(-1);
                              if (key.endsWith('_rubro')) setValorIngreso(ing.rubro || '');
                              else if (key.endsWith('_cliente')) setValorIngreso(ing.cliente || '');
                              else if (key.endsWith('_concepto')) setValorIngreso(ing.concepto || '');
                              else if (key.endsWith('_MXN')) setValorIngreso(String(ing.montoMXN || ''));
                              else if (key.endsWith('_USD')) setValorIngreso(String(ing.montoUSD || ''));
                              else if (key.endsWith('_EUR')) setValorIngreso(String(ing.montoEUR || ''));
                            }}
                            style={{padding:'6px 8px',borderRadius:5,cursor:editable?'pointer':'default',transition:'background 0.15s',minHeight:20,wordBreak:'break-word',whiteSpace:'normal'}}
                            onMouseEnter={(e) => { if (editable) e.currentTarget.style.background = esProyectado ? '#F3E5F5' : '#E8F5E9'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            title={editable ? (typeof valorMostrar === 'string' ? valorMostrar : 'Clic para editar') : ''}
                          >{valorMostrar}</div>
                        );
                      };

                      const placeholderVacio = (txt) => <span style={{color:'#bbb',fontStyle:'italic',fontSize:12}}>{txt}</span>;
                      const bgFila = esProyectado ? '#FAFAFD' : undefined;
                      const colorMonto = esProyectado ? '#6A1B9A' : '#1F2937';

                      return (
                        <tr key={ing.id} style={{borderBottom:`1px solid ${C.border}`, background: bgFila}}>
                          <td style={{padding:'6px 8px',fontWeight:600,color: esProyectado ? '#6A1B9A' : '#1F2937'}}>
                            {renderCelda(keyRubro, ing.rubro || placeholderVacio('— Rubro —'), false)}
                          </td>
                          <td style={{padding:'6px 8px',color:'#374151'}}>
                            {renderCelda(keyCliente, ing.cliente || placeholderVacio('— Cliente —'), false)}
                          </td>
                          <td style={{padding:'6px 8px',color:'#374151'}}>
                            {renderCelda(keyConcepto, ing.concepto || placeholderVacio('— Concepto —'), false)}
                          </td>
                          <td style={{padding:'6px 8px',textAlign:'right',fontFamily:'monospace',fontVariantNumeric:'tabular-nums',fontWeight:ing.montoMXN>0?700:400,color:ing.montoMXN>0?colorMonto:'#bbb'}}>
                            {renderCelda(keyMXN, ing.montoMXN > 0 ? `$${fmt(ing.montoMXN)}` : '—')}
                          </td>
                          <td style={{padding:'6px 8px',textAlign:'right',fontFamily:'monospace',fontVariantNumeric:'tabular-nums',fontWeight:ing.montoUSD>0?700:400,color:ing.montoUSD>0?colorMonto:'#bbb'}}>
                            {renderCelda(keyUSD, ing.montoUSD > 0 ? `$${fmt(ing.montoUSD)}` : '—')}
                          </td>
                          <td style={{padding:'6px 8px',textAlign:'right',fontFamily:'monospace',fontVariantNumeric:'tabular-nums',fontWeight:ing.montoEUR>0?700:400,color:ing.montoEUR>0?colorMonto:'#bbb'}}>
                            {renderCelda(keyEUR, ing.montoEUR > 0 ? `€${fmt(ing.montoEUR)}` : '—')}
                          </td>
                          {!esConsulta && (
                            <td style={{padding:'6px 8px',textAlign:'center',whiteSpace:'nowrap'}}>
                              <button
                                onClick={() => toggleConfirmadoIngreso(ing.id)}
                                title={esProyectado ? 'Confirmar como real' : 'Cambiar a proyectado'}
                                style={{background:esProyectado?'#6A1B9A':'#E8F5E9',color:esProyectado?'#fff':'#1B5E20',border:esProyectado?'none':'1px solid #A5D6A7',cursor:'pointer',fontSize:10,fontWeight:700,padding:'3px 7px',borderRadius:5,marginRight:4,fontFamily:'inherit'}}
                              >{esProyectado ? '✅' : '⏳'}</button>
                              <button onClick={() => eliminarIngreso(ing.id)} title="Eliminar" style={{background:'transparent',border:'none',cursor:'pointer',fontSize:14,color:'#999',padding:4}}>🗑️</button>
                            </td>
                          )}
                        </tr>
                      );
                      };

                      return (
                        <>
                          {/* Subheader Reales (solo si hay proyectados, para no saturar) */}
                          {reales.length > 0 && proyectados.length > 0 && (
                            <tr style={{background:'#F1F8E9'}}>
                              <td colSpan={!esConsulta ? 7 : 6} style={{padding:'7px 12px',fontSize:10,fontWeight:800,color:'#1B5E20',letterSpacing:0.5,textTransform:'uppercase',borderBottom:'1px solid #C8E6C9'}}>
                                ✅ Reales · {reales.length} {reales.length === 1 ? 'entrada' : 'entradas'}
                              </td>
                            </tr>
                          )}
                          {reales.map(ing => renderFila(ing, false))}
                          {/* Subheader Proyectados */}
                          {proyectados.length > 0 && (
                            <tr style={{background:'#F3E5F5'}}>
                              <td colSpan={!esConsulta ? 7 : 6} style={{padding:'7px 12px',fontSize:10,fontWeight:800,color:'#6A1B9A',letterSpacing:0.5,textTransform:'uppercase',borderTop:'1px solid #CE93D8',borderBottom:'1px solid #CE93D8'}}>
                                ⏳ Proyectados · {proyectados.length} {proyectados.length === 1 ? 'entrada' : 'entradas'} · no suman al Saldo Disponible
                              </td>
                            </tr>
                          )}
                          {proyectados.map(ing => renderFila(ing, true))}
                        </>
                      );
                    })()}
                  </tbody>
                  <tfoot>
                    {/* TOTAL REAL (siempre visible) */}
                    <tr style={{background:'#E8F5E9',borderTop:'2px solid #1B5E20'}}>
                      <td colSpan={3} style={{padding:'12px',fontWeight:800,color:'#1B5E20',fontSize:14}}>
                        {totalesIngresosProyectados.MXN+totalesIngresosProyectados.USD+totalesIngresosProyectados.EUR > 0 ? 'TOTAL REAL' : 'TOTAL'}
                      </td>
                      <td style={{padding:'12px 8px',textAlign:'right',fontWeight:800,color:'#1B5E20',fontSize:14,fontFamily:'monospace',fontVariantNumeric:'tabular-nums'}}>{totalesIngresos.MXN > 0 ? `$${fmt(totalesIngresos.MXN)}` : '—'}</td>
                      <td style={{padding:'12px 8px',textAlign:'right',fontWeight:800,color:'#1B5E20',fontSize:14,fontFamily:'monospace',fontVariantNumeric:'tabular-nums'}}>{totalesIngresos.USD > 0 ? `$${fmt(totalesIngresos.USD)}` : '—'}</td>
                      <td style={{padding:'12px 8px',textAlign:'right',fontWeight:800,color:'#1B5E20',fontSize:14,fontFamily:'monospace',fontVariantNumeric:'tabular-nums'}}>{totalesIngresos.EUR > 0 ? `€${fmt(totalesIngresos.EUR)}` : '—'}</td>
                      {!esConsulta && <td/>}
                    </tr>
                    {/* TOTAL PROYECTADO (solo si hay proyectados) */}
                    {(totalesIngresosProyectados.MXN+totalesIngresosProyectados.USD+totalesIngresosProyectados.EUR) > 0 && (
                      <tr style={{background:'#F3E5F5',borderTop:'1px solid #CE93D8'}}>
                        <td colSpan={3} style={{padding:'12px',fontWeight:800,color:'#6A1B9A',fontSize:14}}>TOTAL PROYECTADO</td>
                        <td style={{padding:'12px 8px',textAlign:'right',fontWeight:800,color:'#6A1B9A',fontSize:14,fontFamily:'monospace',fontVariantNumeric:'tabular-nums'}}>{totalesIngresosProyectados.MXN > 0 ? `$${fmt(totalesIngresosProyectados.MXN)}` : '—'}</td>
                        <td style={{padding:'12px 8px',textAlign:'right',fontWeight:800,color:'#6A1B9A',fontSize:14,fontFamily:'monospace',fontVariantNumeric:'tabular-nums'}}>{totalesIngresosProyectados.USD > 0 ? `$${fmt(totalesIngresosProyectados.USD)}` : '—'}</td>
                        <td style={{padding:'12px 8px',textAlign:'right',fontWeight:800,color:'#6A1B9A',fontSize:14,fontFamily:'monospace',fontVariantNumeric:'tabular-nums'}}>{totalesIngresosProyectados.EUR > 0 ? `€${fmt(totalesIngresosProyectados.EUR)}` : '—'}</td>
                        {!esConsulta && <td/>}
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            </>
          )}
          </div>
        </div>

        {/* ═══════════ CAMBIO DE DIVISAS ═══════════ */}
        <div data-seccion="cambio-divisas" style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:16,marginBottom:20}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
            <div style={{width:42,height:42,borderRadius:10,background:'#E3F2FD',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>💱</div>
            <div>
              <h3 style={{fontSize:20,fontWeight:800,color:C.navy,margin:0,letterSpacing:0.2}}>Cambio de Divisas</h3>
              <p style={{fontSize:12,color:C.muted,margin:'3px 0 0'}}>Operaciones de cambio del día · afectan el Saldo Disponible</p>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))',gap:12}}>
            {(() => {
              const casillas = [
                { dir: 'USD_MXN', label: 'USD → MXN', badgeFrom: 'USD', badgeTo: 'MXN', simFrom: '$', simTo: '$', colFrom: C.usd, colTo: C.mxn, bgFrom: '#E8F5E9', bgTo: '#E3F2FD' },
                { dir: 'MXN_USD', label: 'MXN → USD', badgeFrom: 'MXN', badgeTo: 'USD', simFrom: '$', simTo: '$', colFrom: C.mxn, colTo: C.usd, bgFrom: '#E3F2FD', bgTo: '#E8F5E9' },
                { dir: 'EUR_MXN', label: 'EUR → MXN', badgeFrom: 'EUR', badgeTo: 'MXN', simFrom: '€', simTo: '$', colFrom: C.eur, colTo: C.mxn, bgFrom: '#F3E5F5', bgTo: '#E3F2FD' },
                { dir: 'MXN_EUR', label: 'MXN → EUR', badgeFrom: 'MXN', badgeTo: 'EUR', simFrom: '$', simTo: '€', colFrom: C.mxn, colTo: C.eur, bgFrom: '#E3F2FD', bgTo: '#F3E5F5' },
              ];
              return casillas.map(cs => {
                const ca = getCambio(cs.dir);
                const keyV = `${cs.dir}_vendido`;
                const keyC = `${cs.dir}_comprado`;
                const enEdicionV = editandoCambio === keyV;
                const enEdicionC = editandoCambio === keyC;
                const editable = !esConsulta;
                const tc = (ca.montoVendido > 0 && ca.montoComprado > 0)
                  ? (cs.badgeFrom === 'MXN' ? (ca.montoVendido / ca.montoComprado) : (ca.montoComprado / ca.montoVendido))
                  : 0;

                const renderCelda = (key, valor, sim, color) => {
                  const enEdicion = editandoCambio === key;
                  const tieneValor = valor > 0;
                  const textoMostrar = tieneValor ? `${sim}${fmt(valor)}` : `${sim}0.00`;
                  if (enEdicion) {
                    return (
                      <input
                        autoFocus
                        value={valorCambio}
                        onChange={(e) => setValorCambio(e.target.value.replace(/[^\d.]/g, ''))}
                        onBlur={guardarCeldaCambio}
                        onKeyDown={(e) => { if (e.key === 'Enter') guardarCeldaCambio(); if (e.key === 'Escape') cancelarCeldaCambio(); }}
                        style={{width:'100%',border:`2px solid ${color}`,borderRadius:6,padding:'7px 10px',fontSize:15,fontFamily:'monospace',fontVariantNumeric:'tabular-nums',fontWeight:700,textAlign:'right',outline:'none',boxSizing:'border-box',color:'#1F2937',background:'#fff'}}
                      />
                    );
                  }
                  return (
                    <div
                      onClick={() => {
                        if (!editable) return;
                        setEditandoCambio(key);
                        const campo = key.endsWith('_vendido') ? 'vendido' : 'comprado';
                        setValorCambio(campo === 'vendido' ? String(ca.montoVendido || '') : String(ca.montoComprado || ''));
                      }}
                      style={{
                        padding:'7px 10px',
                        borderRadius:6,
                        cursor:editable?'pointer':'default',
                        background: tieneValor ? '#fff' : '#F9FAFB',
                        border:`1px solid ${C.border}`,
                        borderLeft:`4px solid ${color}`,
                        textAlign:'right',
                        fontFamily:'monospace',
                        fontVariantNumeric:'tabular-nums',
                        fontWeight: tieneValor ? 700 : 500,
                        color: tieneValor ? '#1F2937' : '#9CA3AF',
                        fontSize:15,
                        transition:'background 0.15s, border-color 0.15s',
                      }}
                      onMouseEnter={(e) => { if (editable) { e.currentTarget.style.background = '#F0F4FF'; e.currentTarget.style.borderColor = color; e.currentTarget.style.borderLeftColor = color; } }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = tieneValor ? '#fff' : '#F9FAFB'; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.borderLeftColor = color; }}
                      title={editable ? 'Clic para editar' : ''}
                    >
                      {textoMostrar}
                    </div>
                  );
                };

                return (
                  <div key={cs.dir} style={{border:`1px solid ${C.border}`,borderRadius:10,padding:12,background:'#FAFBFC'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10,paddingBottom:8,borderBottom:`1px solid ${C.border}`}}>
                      <span style={{fontSize:11,fontWeight:800,color:cs.colFrom,background:cs.bgFrom,padding:'2px 8px',borderRadius:10}}>{cs.badgeFrom}</span>
                      <span style={{fontSize:13,color:C.muted}}>→</span>
                      <span style={{fontSize:11,fontWeight:800,color:cs.colTo,background:cs.bgTo,padding:'2px 8px',borderRadius:10}}>{cs.badgeTo}</span>
                    </div>

                    <div style={{fontSize:11,color:C.muted,fontWeight:600,marginBottom:3}}>Vendió ({cs.badgeFrom})</div>
                    {renderCelda(keyV, ca.montoVendido, cs.simFrom, cs.colFrom)}

                    <div style={{fontSize:11,color:C.muted,fontWeight:600,margin:'8px 0 3px'}}>Compró ({cs.badgeTo})</div>
                    {renderCelda(keyC, ca.montoComprado, cs.simTo, cs.colTo)}

                    {tc > 0 && (
                      <div style={{marginTop:8,paddingTop:6,borderTop:`1px dashed ${C.border}`,fontSize:11,color:C.muted,display:'flex',justifyContent:'space-between'}}>
                        <span>T.C. efectivo:</span>
                        <span style={{fontFamily:'monospace',fontWeight:700,color:'#4A148C'}}>{tc.toFixed(4)}</span>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Saldo Disponible = Saldos + Ingresos ± Cambio de Divisas */}
        <div style={{background:'linear-gradient(135deg, #E3F2FD 0%, #F5FAFF 50%, #E1F5FE 100%)',border:`2px solid #1976D2`,borderRadius:14,padding:16,marginBottom:20,position:'relative',overflow:'hidden'}}>
          <div style={{position:'relative',zIndex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
              <div style={{fontSize:26}}>💰</div>
              <div>
                <h3 style={{fontSize:20,fontWeight:800,color:"#0D47A1",margin:0,letterSpacing:0.2}}>
                  Saldo Disponible
                  {analisisLiquidez.hayEsperados && (
                    <span style={{fontSize:12,fontWeight:600,color:'#6A1B9A',marginLeft:10,padding:'3px 10px',background:'#F3E5F5',borderRadius:6,verticalAlign:'middle'}}>
                      ⏳ Con cobranza esperada disponible
                    </span>
                  )}
                </h3>
                <p style={{fontSize:12,color:"#1565C0",margin:"3px 0 0",opacity:0.85}}>
                  {analisisLiquidez.hayEsperados
                    ? 'Saldos bancarios + Ingresos reales · Versión esperada incluye cobranzas probables'
                    : 'Saldos bancarios + Ingresos ± Cambio de divisas'}
                </p>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
              {[
                {moneda: 'MXN', disponible: analisisLiquidez.disponible.MXN, esperado: analisisLiquidez.disponibleEsperado.MXN, espIng: analisisLiquidez.ingresosEsperados.MXN, color: C.mxn, bg: '#E3F2FD', border: '#90CAF9', sym: '$'},
                {moneda: 'USD', disponible: analisisLiquidez.disponible.USD, esperado: analisisLiquidez.disponibleEsperado.USD, espIng: analisisLiquidez.ingresosEsperados.USD, color: C.usd, bg: '#E8F5E9', border: '#A5D6A7', sym: '$'},
                {moneda: 'EUR', disponible: analisisLiquidez.disponible.EUR, esperado: analisisLiquidez.disponibleEsperado.EUR, espIng: analisisLiquidez.ingresosEsperados.EUR, color: C.eur, bg: '#F3E5F5', border: '#CE93D8', sym: '€'}
              ].map(({moneda, disponible, esperado, espIng, color, bg, border, sym}) => (
                <div key={moneda} style={{
                  background:bg,
                  border:`2px solid ${border}`,
                  borderRadius:12,
                  padding:'14px 16px',
                  textAlign:'center'
                }}>
                  <div style={{fontSize:14,fontWeight:700,color,marginBottom:6,letterSpacing:0.3}}>{moneda}</div>
                  <div style={{fontSize:24,fontWeight:800,color,lineHeight:1.1,fontVariantNumeric:'tabular-nums'}}>
                    {sym}{fmt(disponible)}
                  </div>
                  <div style={{fontSize:10,fontWeight:600,color,marginTop:4,opacity:0.75,letterSpacing:0.3,textTransform:'uppercase'}}>
                    ✓ Real
                  </div>
                  {espIng > 0 && (
                    <div style={{marginTop:12,paddingTop:12,borderTop:`1px dashed ${border}`}}>
                      <div style={{fontSize:24,fontWeight:800,color:'#6A1B9A',lineHeight:1.1,fontVariantNumeric:'tabular-nums'}}>
                        {sym}{fmt(esperado)}
                      </div>
                      <div style={{fontSize:11,fontWeight:700,color:'#6A1B9A',marginTop:4,letterSpacing:0.3,textTransform:'uppercase'}}>
                        ⏳ Con cobranza esperada
                      </div>
                      <div style={{fontSize:11,color:'#6A1B9A',marginTop:3,opacity:0.75,fontWeight:500}}>
                        (+{sym}{fmt(espIng)} probable)
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        </div>
        {/* ═══════ FIN WRAPPER RESUMEN ═══════ */}

        {/* ═══════ WRAPPER PARA CAPTURA PNG - DETALLE ═══════ */}
        <div ref={refDetalle}>

        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden",marginBottom:20}}>
          <div style={{padding:"18px 22px",background:C.navy,color:"#fff"}}>
            <h3 style={{fontSize:20,fontWeight:800,margin:0,letterSpacing:0.2}}>📋 Pagos Programados para Hoy</h3>
            <p style={{fontSize:14,margin:"4px 0 0",opacity:0.85}}>Total: {pagosProgramadosHoy.length} proveedores</p>
          </div>
          
          {pagosProgramadosHoy.length === 0 ? (
            <div style={{padding:40,textAlign:"center",color:C.muted}}>
              <div style={{fontSize:48,marginBottom:12}}>📅</div>
              <div style={{fontSize:16}}>No hay pagos programados para hoy</div>
              <div style={{fontSize:13,marginTop:4}}>Ve a Cartera para programar pagos</div>
            </div>
          ) : (
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:15}}>
                <thead>
                  <tr style={{background:"#F8FAFC"}}>
                    {[
                      {k:'proveedor',         label:'Proveedor',         align:'left'},
                      {k:'moneda',            label:'Moneda',            align:'center'},
                      {k:'importeAdeudado',   label:'Importe Adeudado',  align:'right'},
                      {k:'pagoHoy',           label:esHoy ? 'Pago del Día' : 'Pago Programado',      align:'right'},
                      {k:'saldoDespuesPago',  label:'Saldo Después',     align:'right'},
                      {k:'facturas',          label:'Facturas',          align:'center'},
                      ...(esVistaHistorica ? [{k:'estado', label:'Estado', align:'center'}] : []),
                    ].map(h => (
                      <th key={h.k}
                          onClick={() => toggleSort(h.k)}
                          title="Clic para ordenar"
                          style={{padding:"14px 18px",textAlign:h.align,color:C.navy,fontWeight:800,fontSize:13,textTransform:"uppercase",borderBottom:`2px solid ${C.border}`,cursor:"pointer",userSelect:"none",background:sortBy===h.k?"#E3F2FD":"transparent",letterSpacing:0.3}}>
                        {h.label}{sortIcon(h.k)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagosOrdenados.map((pago, i) => {
                    // Helper de estado visual
                    const estadoMeta = {
                      pagado:        { label: '✅ Pagado',        bg: '#E8F5E9', color: '#1B5E20' },
                      pagado_atraso: { label: '💰 Pagado tarde',  bg: '#FFF3E0', color: '#E65100' },
                      programado:    { label: '📅 Programado',    bg: '#E3F2FD', color: '#1565C0' },
                      atrasado:      { label: '⚠️ Atrasado',       bg: '#FFEBEE', color: '#C62828' },
                    }[pago.estado] || { label: pago.estado, bg: '#F5F5F5', color: '#666' };
                    return (
                    <React.Fragment key={i}>
                      <tr style={{borderBottom:(pago.detalleFacturas && pago.detalleFacturas.length > 0) ? 'none' : `1px solid ${C.border}`,background:i%2===0?"#fff":"#FAFBFC"}}>
                        <td style={{padding:"14px 18px",fontWeight:700,fontSize:15,color:C.navy}}>{pago.proveedor}</td>
                        <td style={{padding:"14px 18px",textAlign:"center"}}>
                          <span style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[pago.moneda],color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[pago.moneda],padding:"3px 10px",borderRadius:20,fontSize:13,fontWeight:700}}>{pago.moneda}</span>
                        </td>
                        <td onClick={() => setDetalleModal({ pago, tipo: 'adeudo' })}
                          title="Clic para ver desglose del importe adeudado"
                          style={{padding:"14px 18px",textAlign:"right",fontWeight:700,fontSize:15,cursor:'pointer',color:'#1976D2',textDecoration:'underline',textDecorationStyle:'dotted',textDecorationColor:'#1976D2'}}>
                          {monedaSym(pago.moneda)}{fmt(pago.importeAdeudado)}
                        </td>
                        <td onClick={() => setDetalleModal({ pago, tipo: 'pago' })}
                          title="Clic para ver desglose del pago del día"
                          style={{padding:"14px 18px",textAlign:"right",fontWeight:800,fontSize:16,color:"#D32F2F",cursor:'pointer',textDecoration:'underline',textDecorationStyle:'dotted',textDecorationColor:'#D32F2F'}}>
                          {monedaSym(pago.moneda)}{fmt(pago.pagoHoy)}
                          {pago.pagoTDC > 0 && (
                            <span title={`Pagado con TDC: ${monedaSym(pago.moneda)}${fmt(pago.pagoTDC)}`} style={{display:'inline-block',marginLeft:6,background:'#F3E5F5',color:'#6A1B9A',padding:'2px 7px',borderRadius:8,fontSize:10,fontWeight:700,verticalAlign:'middle'}}>💳 TDC</span>
                          )}
                          {pago.pagoOtro > 0 && (
                            <span title={`Otro método: ${monedaSym(pago.moneda)}${fmt(pago.pagoOtro)}`} style={{display:'inline-block',marginLeft:6,background:'#F5F5F5',color:'#616161',padding:'2px 7px',borderRadius:8,fontSize:10,fontWeight:700,verticalAlign:'middle'}}>➕ Otro</span>
                          )}
                        </td>
                        <td style={{padding:"14px 18px",textAlign:"right",fontWeight:700,fontSize:15,color:pago.saldoDespuesPago <= 0 ? "#2E7D32" : "#F57C00"}}>{monedaSym(pago.moneda)}{fmt(pago.saldoDespuesPago)}</td>
                        <td style={{padding:"14px 18px",textAlign:"center",fontSize:14,fontWeight:600,color:C.muted}}>{pago.facturas}</td>
                        {esVistaHistorica && (
                          <td style={{padding:"14px 18px",textAlign:"center"}}>
                            <span style={{background:estadoMeta.bg,color:estadoMeta.color,padding:"4px 12px",borderRadius:12,fontSize:13,fontWeight:700,whiteSpace:'nowrap'}}>{estadoMeta.label}</span>
                          </td>
                        )}
                      </tr>
                      {/* Subfilas: desglose de facturas que se pagan hoy */}
                      {pago.detalleFacturas && pago.detalleFacturas.length > 0 && pago.detalleFacturas.map((f, j) => (
                        <tr key={`${i}-f-${j}`} style={{borderBottom:j === pago.detalleFacturas.length - 1 ? `1px solid ${C.border}` : 'none', background:i%2===0?"#F9FAFB":"#F5F6F8"}}>
                          <td style={{padding:"10px 18px 10px 38px",fontSize:13,color:"#6B7280",display:'flex',alignItems:'center',gap:8}}>
                            <span style={{color:'#9CA3AF',fontSize:13}}>↳</span>
                            <span style={{fontFamily:'monospace',fontWeight:700,background:'#E5E7EB',padding:'2px 8px',borderRadius:4,color:'#374151',fontSize:12,letterSpacing:0.3}}>{f.serie}{f.folio ? ` ${f.folio}` : ''}</span>
                            <span style={{color:'#4B5563',fontSize:13}}>{f.concepto || '—'}</span>
                          </td>
                          <td></td>
                          <td></td>
                          <td style={{padding:"10px 18px",textAlign:"right",fontSize:14,fontWeight:700,color:"#6B7280",fontVariantNumeric:'tabular-nums'}}>
                            {monedaSym(pago.moneda)}{fmt(f.pagoHoy)}
                            {f.metodoPago === 'tdc' && (
                              <span style={{display:'inline-block',marginLeft:6,background:'#F3E5F5',color:'#6A1B9A',padding:'1px 6px',borderRadius:6,fontSize:9,fontWeight:700,verticalAlign:'middle'}}>💳</span>
                            )}
                            {f.metodoPago === 'otro' && (
                              <span style={{display:'inline-block',marginLeft:6,background:'#F5F5F5',color:'#616161',padding:'1px 6px',borderRadius:6,fontSize:9,fontWeight:700,verticalAlign:'middle'}}>➕</span>
                            )}
                          </td>
                          <td></td>
                          <td></td>
                          {esVistaHistorica && <td></td>}
                        </tr>
                      ))}
                    </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  {['USD','MXN','EUR'].filter(m => totalesCompletos[m].pago > 0 || totalesCompletos[m].adeudado > 0).map((m, idx, arr) => (
                    <tr key={m} style={{background:"#EEF2FF",borderTop:idx===0?`2px solid ${C.blue}`:`1px solid ${C.border}`}}>
                      <td style={{padding:"16px 18px",fontWeight:800,color:C.navy,fontSize:16,letterSpacing:0.2}}>
                        TOTAL {m}
                      </td>
                      <td style={{padding:"16px 18px",textAlign:"center"}}>
                        <span style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[m],color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[m],padding:"4px 12px",borderRadius:20,fontSize:13,fontWeight:800}}>{m}</span>
                      </td>
                      <td style={{padding:"16px 18px",textAlign:"right",fontWeight:800,color:C.navy,fontSize:20,fontVariantNumeric:'tabular-nums'}}>
                        {monedaSym(m)}{fmt(totalesCompletos[m].adeudado)}
                      </td>
                      <td style={{padding:"16px 18px",textAlign:"right",fontWeight:800,color:"#D32F2F",fontSize:20,fontVariantNumeric:'tabular-nums'}}>
                        {monedaSym(m)}{fmt(totalesCompletos[m].pago)}
                      </td>
                      <td style={{padding:"16px 18px",textAlign:"right",fontWeight:800,color:totalesCompletos[m].saldoDespues <= 0 ? "#2E7D32" : "#F57C00",fontSize:20,fontVariantNumeric:'tabular-nums'}}>
                        {monedaSym(m)}{fmt(totalesCompletos[m].saldoDespues)}
                      </td>
                      <td style={{padding:"16px 18px",textAlign:"center",fontWeight:800,color:C.navy,fontSize:16}}>
                        {totalesCompletos[m].facturas}
                      </td>
                      {esVistaHistorica && <td></td>}
                    </tr>
                  ))}
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div style={{background:"#F0FFF4",border:`1px solid #A5D6A7`,borderRadius:14,padding:20}}>
          <h3 style={{fontSize:20,fontWeight:800,color:"#1B5E20",margin:"0 0 18px",letterSpacing:0.2}}>
            💰 Saldos Después de Pagos
            {analisisLiquidez.hayEsperados && (
              <span style={{fontSize:12,fontWeight:600,color:'#6A1B9A',marginLeft:10,padding:'3px 10px',background:'#F3E5F5',borderRadius:6,verticalAlign:'middle'}}>
                ⏳ Comparativa con cobranza esperada
              </span>
            )}
          </h3>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
            {['MXN','USD','EUR'].map(mon => {
              const sym = mon === 'EUR' ? '€' : '$';
              const disponible = analisisLiquidez.disponible[mon];
              const disponibleEsperado = analisisLiquidez.disponibleEsperado[mon];
              const espIng = analisisLiquidez.ingresosEsperados[mon];
              const pagos = totalesPagos[mon];
              const saldoFinal = disponible - pagos;
              const saldoFinalEsperado = disponibleEsperado - pagos;
              const esPositivo = saldoFinal >= 0;
              const esPositivoEsp = saldoFinalEsperado >= 0;
              return (
                <div key={mon} style={{textAlign:"center"}}>
                  <div style={{fontSize:14,fontWeight:600,color:"#2E7D32",marginBottom:4}}>{mon}</div>
                  <div style={{fontSize:22,fontWeight:800,color:esPositivo ? "#1B5E20" : "#D32F2F",fontVariantNumeric:'tabular-nums',letterSpacing:0.2}}>
                    {saldoFinal < 0 ? '-' : ''}{sym}{fmt(Math.abs(saldoFinal))}
                  </div>
                  <div style={{fontSize:11,color:esPositivo?"#2E7D32":"#C62828",marginTop:2,fontWeight:600}}>
                    {esPositivo ? '+ Excedente · ✓ Real' : '- Déficit · ✓ Real'}
                  </div>
                  {espIng > 0 && (
                    <div style={{marginTop:12,paddingTop:12,borderTop:'1px dashed #A5D6A7'}}>
                      <div style={{fontSize:22,fontWeight:800,color:esPositivoEsp ? "#6A1B9A" : "#C62828",fontVariantNumeric:'tabular-nums',letterSpacing:0.2}}>
                        {saldoFinalEsperado < 0 ? '-' : '+'}{sym}{fmt(Math.abs(saldoFinalEsperado))}
                      </div>
                      <div style={{fontSize:11,color:esPositivoEsp?"#6A1B9A":"#C62828",marginTop:3,fontWeight:700,letterSpacing:0.3,textTransform:'uppercase'}}>
                        {esPositivoEsp ? '⏳ Con cobranza esperada' : '⏳ Aún con déficit'}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Nota informativa de pagos no bancarios */}
          {(() => {
            const totalTDC   = totalesPagosTDC.MXN + totalesPagosTDC.USD + totalesPagosTDC.EUR;
            const totalOtro  = totalesPagosOtro.MXN + totalesPagosOtro.USD + totalesPagosOtro.EUR;
            if (totalTDC === 0 && totalOtro === 0) return null;
            return (
              <div style={{marginTop:14,paddingTop:14,borderTop:'1px dashed #A5D6A7',display:'flex',gap:14,flexWrap:'wrap',justifyContent:'center'}}>
                {totalTDC > 0 && (
                  <div style={{background:'#F3E5F5',color:'#6A1B9A',padding:'6px 12px',borderRadius:10,fontSize:11,fontWeight:600,display:'flex',alignItems:'center',gap:6}}>
                    <span>💳</span>
                    <span>
                      Pagado con TDC hoy:&nbsp;
                      {totalesPagosTDC.MXN > 0 && <b>${fmt(totalesPagosTDC.MXN)} MXN</b>}
                      {totalesPagosTDC.MXN > 0 && totalesPagosTDC.USD > 0 && ' · '}
                      {totalesPagosTDC.USD > 0 && <b>${fmt(totalesPagosTDC.USD)} USD</b>}
                      {totalesPagosTDC.EUR > 0 && (totalesPagosTDC.MXN > 0 || totalesPagosTDC.USD > 0) && ' · '}
                      {totalesPagosTDC.EUR > 0 && <b>€{fmt(totalesPagosTDC.EUR)} EUR</b>}
                      <span style={{opacity:0.75,marginLeft:6}}>(no afecta saldo bancario)</span>
                    </span>
                  </div>
                )}
                {totalOtro > 0 && (
                  <div style={{background:'#F5F5F5',color:'#616161',padding:'6px 12px',borderRadius:10,fontSize:11,fontWeight:600,display:'flex',alignItems:'center',gap:6}}>
                    <span>➕</span>
                    <span>
                      Otro método hoy:&nbsp;
                      {totalesPagosOtro.MXN > 0 && <b>${fmt(totalesPagosOtro.MXN)} MXN</b>}
                      {totalesPagosOtro.USD > 0 && (totalesPagosOtro.MXN > 0) && ' · '}
                      {totalesPagosOtro.USD > 0 && <b>${fmt(totalesPagosOtro.USD)} USD</b>}
                      {totalesPagosOtro.EUR > 0 && (totalesPagosOtro.MXN > 0 || totalesPagosOtro.USD > 0) && ' · '}
                      {totalesPagosOtro.EUR > 0 && <b>€{fmt(totalesPagosOtro.EUR)} EUR</b>}
                      <span style={{opacity:0.75,marginLeft:6}}>(no afecta saldo bancario)</span>
                    </span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        </div>
        {/* ═══════ FIN WRAPPER DETALLE ═══════ */}

        {/* MODAL: Exportar (PDF + Imágenes) */}
        {exportModalOpen && (
          <div onClick={() => setExportModalOpen(false)} style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(31,41,55,0.55)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20,overflow:'auto'}}>
            <div onClick={(e) => e.stopPropagation()} style={{background:"#fff",borderRadius:18,padding:28,maxWidth:820,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.3)",maxHeight:'92vh',overflow:'auto'}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"#E53E3E",letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>Exportar Reporte</div>
                  <h2 style={{fontSize:20,fontWeight:800,color:"#1F2937",margin:0,letterSpacing:-0.3}}>¿En qué formato lo quieres?</h2>
                  <p style={{fontSize:13,color:"#6B7280",margin:"6px 0 0"}}>Elige PDF para imprimir o Imagen para compartir por WhatsApp.</p>
                </div>
                <button onClick={() => setExportModalOpen(false)} style={{background:"transparent",border:"none",fontSize:26,cursor:"pointer",color:"#9CA3AF",padding:0,lineHeight:1}}>×</button>
              </div>

              {/* SECCIÓN PDF */}
              <div style={{marginBottom:24}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                  <span style={{fontSize:18}}>📄</span>
                  <h3 style={{fontSize:14,fontWeight:800,color:"#1F2937",margin:0,textTransform:'uppercase',letterSpacing:0.5}}>PDF · para imprimir o archivar</h3>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                  {[
                    {id:'r',  modo:'resumen',   ori:'portrait',  icon:'📋', titulo:'Resumen',   sub:'Solo totales por proveedor',          paginas:'1 hoja'},
                    {id:'dv', modo:'detallado', ori:'portrait',  icon:'📑', titulo:'Detallado vertical', sub:'Con desglose de facturas', paginas:'2-3 hojas'},
                    {id:'dh', modo:'detallado', ori:'landscape', icon:'📑', titulo:'Detallado horizontal', sub:'Más espacio por fila',   paginas:'1-2 hojas'},
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => { setExportModalOpen(false); generarPDF(opt.modo, opt.ori); }}
                      style={{
                        background:"#FFF5F5",
                        border:`2px solid #FEB2B2`,
                        borderRadius:12,
                        padding:14,
                        cursor:"pointer",
                        textAlign:"left",
                        transition:"all 0.15s ease",
                        fontFamily:"inherit"
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#E53E3E'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(229,62,62,0.2)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#FEB2B2'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      <div style={{fontSize:24,marginBottom:6}}>{opt.icon}</div>
                      <div style={{fontSize:13,fontWeight:800,color:"#1F2937",marginBottom:2}}>{opt.titulo}</div>
                      <div style={{fontSize:11,color:"#6B7280",lineHeight:1.3,marginBottom:8,minHeight:28}}>{opt.sub}</div>
                      <div style={{display:"inline-block",fontSize:9,fontWeight:700,color:"#C53030",background:"#FED7D7",padding:"2px 6px",borderRadius:5,letterSpacing:0.4,textTransform:"uppercase"}}>~{opt.paginas}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* SECCIÓN IMÁGENES */}
              <div>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                  <span style={{fontSize:18}}>📸</span>
                  <h3 style={{fontSize:14,fontWeight:800,color:"#1F2937",margin:0,textTransform:'uppercase',letterSpacing:0.5}}>Imágenes · para WhatsApp o móvil</h3>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                  {[
                    {id:'png_r', modo:'resumen',  icon:'📊', titulo:'Solo Resumen',           sub:'Saldos + ingresos + cambios + disponible', imgs:'1 imagen'},
                    {id:'png_d', modo:'detalle',  icon:'📁', titulo:'Resumen + Detalle',     sub:'Resumen y pagos por proveedor (se parte si son muchos)',              imgs:'2-4 imágenes'},
                    {id:'png_c', modo:'completo', icon:'📑', titulo:'Reporte Completo',            sub:'Todo en una imagen larga',              imgs:'1 imagen'},
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => generarPNG(opt.modo)}
                      disabled={generandoPng}
                      style={{
                        background:"#EBF8FF",
                        border:`2px solid #90CDF4`,
                        borderRadius:12,
                        padding:14,
                        cursor:generandoPng?"wait":"pointer",
                        textAlign:"left",
                        transition:"all 0.15s ease",
                        fontFamily:"inherit",
                        opacity:generandoPng?0.6:1,
                      }}
                      onMouseEnter={(e) => { if(!generandoPng){ e.currentTarget.style.borderColor = '#3182CE'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(49,130,206,0.2)'; } }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#90CDF4'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      <div style={{fontSize:24,marginBottom:6}}>{opt.icon}</div>
                      <div style={{fontSize:13,fontWeight:800,color:"#1F2937",marginBottom:2}}>{opt.titulo}</div>
                      <div style={{fontSize:11,color:"#6B7280",lineHeight:1.3,marginBottom:8,minHeight:28}}>{opt.sub}</div>
                      <div style={{display:"inline-block",fontSize:9,fontWeight:700,color:"#2C5282",background:"#BEE3F8",padding:"2px 6px",borderRadius:5,letterSpacing:0.4,textTransform:"uppercase"}}>{opt.imgs}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{marginTop:20,paddingTop:14,borderTop:"1px solid #F3F4F6",fontSize:11,color:"#9CA3AF",textAlign:"center"}}>
                Las imágenes se descargarán automáticamente. El PDF abrirá el diálogo de impresión.
              </div>
            </div>
          </div>
        )}

        {/* Modal de importación de Ingresos del Día */}
        {importarIngresosModal?.open && (() => {
          const m = importarIngresosModal;
          const setM = (patch) => setImportarIngresosModal(prev => ({ ...prev, ...patch }));
          
          // Helper: detecta columnas en la primera fila del Excel
          const detectarColsIngreso = (firstRow) => {
            const norm = (s) => String(s || '').toUpperCase().trim();
            let idxFecha = -1, idxDescripcion = -1, idxDeposito = -1, idxRetiro = -1, idxConcepto = -1, idxRubro = -1, idxCliente = -1;
            firstRow.forEach((cel, i) => {
              const c = norm(cel);
              if (c === 'FECHA' || c === 'DATE') idxFecha = i;
              else if (c === 'DESCRIPCION' || c === 'DESCRIPCIÓN' || c === 'DESCRIPTION') idxDescripcion = i;
              else if (c === 'DEPOSITO' || c === 'DEPOSITOS' || c === 'DEPÓSITO' || c === 'DEPÓSITOS' || c === 'INGRESO' || c === 'INGRESOS' || c === 'ABONO' || c === 'ABONOS') idxDeposito = i;
              else if (c === 'RETIRO' || c === 'RETIROS' || c === 'CARGO' || c === 'CARGOS') idxRetiro = i;
              else if (c === 'CONCEPTO' || c === 'CONCEPT') idxConcepto = i;
              else if (c === 'RUBRO' || c === 'CATEGORIA' || c === 'CATEGORÍA') idxRubro = i;
              else if (c === 'CLIENTE' || c === 'CLIENTE / PROVEEDOR' || c === 'CLIENTE/PROVEEDOR' || c === 'PROVEEDOR') idxCliente = i;
            });
            const hayHeader = idxFecha !== -1 || idxDeposito !== -1 || idxConcepto !== -1 || idxRubro !== -1;
            if (!hayHeader) {
              // Fallback: asumir orden A=Fecha, B=Descripcion, C=Depositos, D=Retiros, E=Saldo, F=Concepto, G=Rubro, H=Cliente
              idxFecha = 0; idxDescripcion = 1; idxDeposito = 2; idxRetiro = 3;
              idxConcepto = 5; idxRubro = 6; idxCliente = 7;
            }
            return { idxFecha, idxDescripcion, idxDeposito, idxRetiro, idxConcepto, idxRubro, idxCliente, hayHeader };
          };
          
          // Helper: parsea fecha (mismo que en Otros Pagos)
          const parsearFechaIng = (raw) => {
            if (!raw && raw !== 0) return null;
            if (raw instanceof Date) {
              if (isNaN(raw.getTime())) return null;
              return `${raw.getFullYear()}-${String(raw.getMonth()+1).padStart(2,'0')}-${String(raw.getDate()).padStart(2,'0')}`;
            }
            const s = String(raw).trim();
            if (!s) return null;
            if (/^\d+(\.\d+)?$/.test(s) && +s > 25569 && +s < 60000) {
              const dias = Math.floor(+s);
              const ms = (dias - 25569) * 86400 * 1000;
              const d = new Date(ms);
              if (!isNaN(d.getTime())) {
                return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
              }
            }
            const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
            if (iso) return `${iso[1]}-${String(+iso[2]).padStart(2,'0')}-${String(+iso[3]).padStart(2,'0')}`;
            const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
            if (dmy) {
              const a = +dmy[1], b = +dmy[2];
              let yyyy = dmy[3];
              if (yyyy.length === 2) yyyy = (+yyyy > 50 ? '19' : '20') + yyyy;
              let dd, mm;
              if (a > 12 && b <= 12)       { dd = a; mm = b; }
              else if (b > 12 && a <= 12)  { dd = b; mm = a; }
              else                          { dd = a; mm = b; }
              if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
              return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
            }
            return null;
          };
          
          // Auto-excluir basado en RUBRO o CONCEPTO
          const debeExcluir = (rubro, concepto) => {
            const norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const r = norm(rubro), c = norm(concepto);
            const palabrasClave = ['INVERSION', 'INVERSIONES', 'TRASPASO', 'TRASPASOS', 'DIVISA', 'DIVISAS', 'CAMBIO DE DIVISA'];
            for (const p of palabrasClave) {
              if (r.includes(p) || c.includes(p)) return true;
            }
            // Concepto-específico: "RETIRO DE INVERSION", "COMPRA DIVISA", etc.
            if (c.includes('RETIRO') && (c.includes('INVERSION') || c.includes('FONDO'))) return true;
            if (c.includes('COMPRA') && c.includes('DIVISA')) return true;
            if (c.includes('VENTA') && c.includes('DIVISA')) return true;
            return false;
          };
          
          const cellToStrIng = (v) => {
            if (v === null || v === undefined) return '';
            if (v instanceof Date) {
              if (isNaN(v.getTime())) return '';
              return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
            }
            return String(v).trim();
          };
          
          const parsearFilasIngreso = (filas) => {
            if (!filas || filas.length === 0) return [];
            const cols = detectarColsIngreso(filas[0]);
            const datos = cols.hayHeader ? filas.slice(1) : filas;
            const result = [];
            datos.forEach(fila => {
              if (!fila || fila.length === 0) return;
              const fechaCelda = cols.idxFecha >= 0 ? fila[cols.idxFecha] : null;
              let fecha = null;
              if (fechaCelda instanceof Date) fecha = parsearFechaIng(fechaCelda);
              else if (fechaCelda !== null && fechaCelda !== undefined && String(fechaCelda).trim()) fecha = parsearFechaIng(String(fechaCelda).trim());
              const descripcion = cols.idxDescripcion >= 0 ? cellToStrIng(fila[cols.idxDescripcion]) : '';
              const depositoStr = cols.idxDeposito >= 0 ? cellToStrIng(fila[cols.idxDeposito]) : '';
              const retiroStr = cols.idxRetiro >= 0 ? cellToStrIng(fila[cols.idxRetiro]) : '';
              const deposito = parseFloat(depositoStr.replace(/[\$,\s]/g, '')) || 0;
              const retiro = parseFloat(retiroStr.replace(/[\$,\s]/g, '')) || 0;
              // Solo nos interesan ingresos (deposito > 0, no retiros)
              if (deposito <= 0) return;
              if (retiro > 0) return; // si por error trae retiro, ignorar
              const concepto = cols.idxConcepto >= 0 ? cellToStrIng(fila[cols.idxConcepto]) : '';
              const rubro = cols.idxRubro >= 0 ? cellToStrIng(fila[cols.idxRubro]) : '';
              const cliente = cols.idxCliente >= 0 ? cellToStrIng(fila[cols.idxCliente]) : '';
              const autoExcluir = debeExcluir(rubro, concepto || descripcion);
              result.push({
                fecha: fecha || fechaSeleccionada,
                descripcion,
                concepto: concepto || descripcion.slice(0, 60),
                rubro: rubro || 'Ingreso',
                cliente,
                monto: deposito,
                incluir: !autoExcluir,
                autoExcluido: autoExcluir,
              });
            });
            return result;
          };
          
          const handleArchivoIngreso = (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
              try {
                const data = new Uint8Array(ev.target.result);
                const wb = XLSX.read(data, { type: 'array', cellDates: true });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
                const filasNoVacias = filas.filter(f => f.some(c => {
                  if (c instanceof Date) return true;
                  return String(c || '').trim();
                }));
                const rows = parsearFilasIngreso(filasNoVacias);
                if (rows.length === 0) {
                  alert('No se detectaron ingresos válidos en el archivo.\n\nAsegúrate que tenga columnas: Fecha, Depositos (con valor > 0), y opcionalmente CONCEPTO/RUBRO/CLIENTE.');
                  return;
                }
                setM({ rows });
              } catch (err) {
                console.error(err);
                alert('Error al leer el archivo: ' + err.message);
              }
            };
            reader.readAsArrayBuffer(file);
            e.target.value = '';
          };
          
          const handleParsearTextoIngreso = () => {
            if (!m.textoPegado.trim()) return;
            const lineas = m.textoPegado.split('\n').map(l => l).filter(l => l.trim());
            const filas = lineas.map(l => l.split(/\t|;/).map(p => p.trim()));
            const rows = parsearFilasIngreso(filas);
            if (rows.length === 0) {
              alert('No se detectaron ingresos válidos en el texto pegado.');
              return;
            }
            setM({ rows });
          };
          
          const descargarPlantillaIng = () => {
            const data = [
              ['Fecha', 'Descripción', 'Depósitos', 'Retiros', 'Saldo', 'CONCEPTO', 'RUBRO', 'CLIENTE / PROVEEDOR'],
              ['29/04/2026', 'Ventas netas tarjetas Sucursal: 342', 16310.00, '', 29309.29, 'HOSPEDAJE Y TRASLADO', 'CLIENTE', 'PUBLICO EN GENERAL'],
              ['29/04/2026', 'Abono Interbancario Sucursal: 859', 9187.53, '', 38496.82, 'BOLETO, VTA DE CUBA', 'CLIENTE', 'OPERADORA PAYPAL'],
              ['29/04/2026', 'Traspaso Ref Sucursal: 519', 100000.00, '', 138496.82, 'RETIRO DE INVERSION', 'INVERSION', 'INVERSION'],
              ['', '', '', '', '', '', '', ''],
            ];
            const ws = XLSX.utils.aoa_to_sheet(data);
            ws['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 28 }, { wch: 16 }, { wch: 24 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Ingresos');
            XLSX.writeFile(wb, 'Plantilla_Ingresos_Estado_Cuenta.xlsx');
          };
          
          const toggleIncluir = (idx) => {
            setM({ rows: m.rows.map((r, i) => i === idx ? { ...r, incluir: !r.incluir } : r) });
          };
          
          const updateRow = (idx, campo, valor) => {
            setM({ rows: m.rows.map((r, i) => i === idx ? { ...r, [campo]: valor } : r) });
          };
          
          const handleGuardar = async () => {
            const aImportar = m.rows.filter(r => r.incluir && r.monto > 0);
            if (aImportar.length === 0) { alert('No hay ingresos seleccionados para importar.'); return; }
            let creados = 0;
            for (const r of aImportar) {
              const ingreso = {
                empresaId,
                fecha: r.fecha || fechaSeleccionada,
                rubro: r.rubro || '',
                cliente: r.cliente || '',
                concepto: r.concepto || '',
                montoMXN: m.monedaGlobal === 'MXN' ? r.monto : 0,
                montoUSD: m.monedaGlobal === 'USD' ? r.monto : 0,
                montoEUR: m.monedaGlobal === 'EUR' ? r.monto : 0,
                orden: ingresosDia.length + creados,
                confirmado: true,  // todos los importados son reales (ya entraron al banco)
              };
              const id = await upsertIngresoDia(ingreso, user?.nombre || 'desconocido');
              if (id) {
                setIngresosDia(prev => [...prev, { ...ingreso, id }]);
                creados++;
              }
            }
            alert(`✅ Se importaron ${creados} ${creados === 1 ? 'ingreso' : 'ingresos'} correctamente.`);
            setImportarIngresosModal(null);
          };
          
          const totalAImportar = m.rows.filter(r => r.incluir && r.monto > 0).reduce((s, r) => s + r.monto, 0);
          const countAImportar = m.rows.filter(r => r.incluir && r.monto > 0).length;
          const countExcluir = m.rows.length - countAImportar;
          const sym = m.monedaGlobal === 'EUR' ? '€' : '$';
          const anchoModal = m.rows.length > 0 ? 1300 : 720;
          
          return (
            <div onClick={(e) => { if (e.target === e.currentTarget) setImportarIngresosModal(null); }}
              style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:14}}>
              <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:anchoModal,maxHeight:'94vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}}>
                {/* Header */}
                <div style={{padding:'16px 22px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center',background:'#E8F5E9'}}>
                  <div>
                    <h3 style={{margin:0,fontSize:16,fontWeight:800,color:'#1B5E20'}}>📥 Importar Ingresos del Estado de Cuenta</h3>
                    <p style={{margin:'2px 0 0',fontSize:12,color:'#6B7280'}}>Sube tu Excel con depósitos · se asignan a la fecha de cada fila</p>
                  </div>
                  <button onClick={() => setImportarIngresosModal(null)} style={{background:'transparent',border:'none',fontSize:22,cursor:'pointer',color:'#666'}}>×</button>
                </div>
                
                {/* Body */}
                <div style={{overflow:'auto',padding:18,flex:1}}>
                  {m.rows.length === 0 ? (
                    <>
                      {/* Instrucciones */}
                      <div style={{background:'#FFFDE7',border:'1px solid #FFE082',borderRadius:8,padding:'12px 14px',marginBottom:16,fontSize:12,color:'#5D4037'}}>
                        <div style={{fontWeight:700,marginBottom:6,color:'#E65100'}}>📋 ESTRUCTURA DEL EXCEL</div>
                        <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'4px 10px',fontSize:11}}>
                          <span style={{fontWeight:700,color:'#1976D2'}}>① Fecha</span>
                          <span>Fecha del depósito · ej: <i style={{color:C.muted}}>29/04/2026</i></span>
                          <span style={{fontWeight:700,color:'#9E9E9E'}}>② Descripción</span>
                          <span>Texto del banco · se guarda como referencia</span>
                          <span style={{fontWeight:700,color:'#1976D2'}}>③ Depósitos</span>
                          <span>Monto del ingreso · solo filas con depósito &gt; 0</span>
                          <span style={{fontWeight:700,color:'#9E9E9E'}}>④ Retiros / Saldo</span>
                          <span>Se ignoran (no son ingresos)</span>
                          <span style={{fontWeight:700,color:'#1B5E20'}}>⑤ CONCEPTO</span>
                          <span>Tu descripción corta · ej: <i style={{color:C.muted}}>HOSPEDAJE Y TRASLADO</i></span>
                          <span style={{fontWeight:700,color:'#1B5E20'}}>⑥ RUBRO</span>
                          <span>Categoría · ej: <i style={{color:C.muted}}>CLIENTE, INVERSION, REPROTECCION</i></span>
                          <span style={{fontWeight:700,color:'#1B5E20'}}>⑦ CLIENTE / PROVEEDOR</span>
                          <span>Quién pagó · ej: <i style={{color:C.muted}}>PUBLICO EN GENERAL</i></span>
                        </div>
                        <div style={{marginTop:8,padding:'6px 10px',background:'#FFF3E0',border:'1px solid #FFCC80',borderRadius:6,fontSize:11}}>
                          ⚠️ Filas con RUBRO o CONCEPTO que contenga: <b>INVERSION, TRASPASO, DIVISA</b> se auto-excluyen (puedes incluirlas manualmente).
                        </div>
                      </div>
                      
                      {/* Configuración */}
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
                        <div>
                          <label style={{fontSize:11,fontWeight:700,color:'#374151',display:'block',marginBottom:4,letterSpacing:0.3,textTransform:'uppercase'}}>Moneda del estado de cuenta</label>
                          <select value={m.monedaGlobal} onChange={e => setM({ monedaGlobal: e.target.value })}
                            style={{width:'100%',padding:'8px 12px',border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:'inherit',outline:'none'}}>
                            <option value="MXN">MXN — Pesos</option>
                            <option value="USD">USD — Dólares</option>
                            <option value="EUR">EUR — Euros</option>
                          </select>
                        </div>
                        <div style={{display:'flex',alignItems:'flex-end'}}>
                          <button onClick={descargarPlantillaIng}
                            style={{background:'transparent',color:'#1976D2',border:'1px solid #1976D2',padding:'8px 14px',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',width:'100%'}}>
                            ⬇ Descargar plantilla .xlsx
                          </button>
                        </div>
                      </div>
                      
                      {/* Métodos de importación */}
                      <div style={{fontSize:11,fontWeight:700,color:'#1A237E',marginBottom:8,letterSpacing:0.3,textTransform:'uppercase'}}>Elegir método de importación</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                        <label style={{background:'#E8F5E9',border:'2px dashed #2E7D32',borderRadius:10,padding:20,textAlign:'center',cursor:'pointer',display:'block'}}>
                          <div style={{fontSize:32,marginBottom:6}}>📁</div>
                          <div style={{fontSize:13,fontWeight:700,color:'#1B5E20',marginBottom:4}}>Subir archivo</div>
                          <div style={{fontSize:11,color:'#388E3C'}}>.xlsx o .xls</div>
                          <input type="file" accept=".xlsx,.xls" onChange={handleArchivoIngreso} style={{display:'none'}}/>
                        </label>
                        <div style={{background:'#E3F2FD',border:'2px dashed #1565C0',borderRadius:10,padding:14}}>
                          <div style={{textAlign:'center',marginBottom:8}}>
                            <div style={{fontSize:28}}>✏️</div>
                            <div style={{fontSize:13,fontWeight:700,color:'#0D47A1'}}>Pegar datos</div>
                          </div>
                          <textarea value={m.textoPegado} onChange={e => setM({ textoPegado: e.target.value })}
                            placeholder={`Fecha\tDescripción\tDepósitos\tRetiros\tSaldo\tCONCEPTO\tRUBRO\tCLIENTE / PROVEEDOR\n29/04/2026\tVentas netas\t16310\t\t29309\tHOSPEDAJE\tCLIENTE\tPUBLICO EN GENERAL`}
                            style={{width:'100%',minHeight:80,padding:8,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,fontFamily:'monospace',outline:'none',resize:'vertical',boxSizing:'border-box'}}/>
                          <button onClick={handleParsearTextoIngreso} disabled={!m.textoPegado.trim()}
                            style={{marginTop:8,width:'100%',background:m.textoPegado.trim() ? '#1565C0' : '#B0BEC5',color:'#fff',border:'none',padding:'7px 12px',borderRadius:6,fontSize:11,fontWeight:700,cursor:m.textoPegado.trim() ? 'pointer' : 'not-allowed',fontFamily:'inherit'}}>
                            Procesar texto
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Vista previa */}
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexWrap:'wrap',gap:8}}>
                        <div style={{fontSize:13,fontWeight:700,color:C.navy}}>
                          📥 Vista previa · {m.rows.length} {m.rows.length === 1 ? 'fila detectada' : 'filas detectadas'}
                        </div>
                        <div style={{fontSize:11,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                          <span style={{background:'#E8F5E9',color:'#1B5E20',padding:'2px 8px',borderRadius:6,fontWeight:700}}>✅ {countAImportar} a importar</span>
                          {countExcluir > 0 && <span style={{background:'#FFEBEE',color:'#C62828',padding:'2px 8px',borderRadius:6,fontWeight:700}}>⚠ {countExcluir} excluidas</span>}
                          <span style={{background:'#E3F2FD',color:'#1565C0',padding:'2px 8px',borderRadius:6,fontWeight:700}}>{m.monedaGlobal}</span>
                          <button onClick={() => setM({ rows: [] })} style={{background:'transparent',border:'none',color:'#1976D2',cursor:'pointer',fontSize:11,fontWeight:600}}>← Empezar de nuevo</button>
                        </div>
                      </div>
                      
                      {/* Toolbar selección masiva */}
                      <div style={{display:'flex',gap:8,marginBottom:8,fontSize:11}}>
                        <button onClick={() => setM({ rows: m.rows.map(r => ({ ...r, incluir: true })) })}
                          style={{background:'#E8F5E9',color:'#1B5E20',border:'1px solid #A5D6A7',padding:'5px 10px',borderRadius:6,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>☑️ Incluir todas</button>
                        <button onClick={() => setM({ rows: m.rows.map(r => ({ ...r, incluir: false })) })}
                          style={{background:'#FFEBEE',color:'#C62828',border:'1px solid #FFCDD2',padding:'5px 10px',borderRadius:6,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>☐ Excluir todas</button>
                        <button onClick={() => setM({ rows: m.rows.map(r => ({ ...r, incluir: !r.autoExcluido })) })}
                          style={{background:'#FFF3E0',color:'#E65100',border:'1px solid #FFCC80',padding:'5px 10px',borderRadius:6,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>↺ Restaurar auto-exclusión</button>
                      </div>
                      
                      {/* Tabla */}
                      <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'auto',maxHeight:'50vh'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                          <thead>
                            <tr style={{background:'#F8FAFC',borderBottom:`2px solid ${C.border}`,position:'sticky',top:0,zIndex:1}}>
                              <th style={{padding:'8px',width:50,textAlign:'center',color:C.navy,fontWeight:700,fontSize:10,textTransform:'uppercase'}}>Incluir</th>
                              <th style={{padding:'8px',width:110,textAlign:'left',color:C.navy,fontWeight:700,fontSize:10,textTransform:'uppercase'}}>Fecha</th>
                              <th style={{padding:'8px',width:130,textAlign:'left',color:C.navy,fontWeight:700,fontSize:10,textTransform:'uppercase'}}>Rubro</th>
                              <th style={{padding:'8px',width:200,textAlign:'left',color:C.navy,fontWeight:700,fontSize:10,textTransform:'uppercase'}}>Cliente</th>
                              <th style={{padding:'8px',textAlign:'left',color:C.navy,fontWeight:700,fontSize:10,textTransform:'uppercase'}}>Concepto</th>
                              <th style={{padding:'8px',width:120,textAlign:'right',color:C.navy,fontWeight:700,fontSize:10,textTransform:'uppercase'}}>Monto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {m.rows.map((r, i) => {
                              const excluida = !r.incluir;
                              return (
                                <tr key={i} style={{borderBottom:`1px solid ${C.border}`,background: excluida ? '#FAFAFA' : (i % 2 === 0 ? '#fff' : '#FAFBFC'),opacity: excluida ? 0.5 : 1}}>
                                  <td style={{padding:'5px',textAlign:'center'}}>
                                    <input type="checkbox" checked={r.incluir} onChange={() => toggleIncluir(i)}
                                      title={r.autoExcluido && !r.incluir ? 'Auto-excluida (rubro/concepto contiene INVERSION/TRASPASO/DIVISA)' : ''}
                                      style={{cursor:'pointer',transform:'scale(1.2)'}}/>
                                  </td>
                                  <td style={{padding:'4px 6px'}}>
                                    <input type="date" value={r.fecha || ''} onChange={e => updateRow(i, 'fecha', e.target.value)}
                                      style={{width:'100%',fontSize:11,padding:'4px',border:`1px solid ${C.border}`,borderRadius:5,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}/>
                                  </td>
                                  <td style={{padding:'4px 6px'}}>
                                    <input type="text" value={r.rubro} onChange={e => updateRow(i, 'rubro', e.target.value)}
                                      style={{width:'100%',fontSize:11,padding:'4px 6px',border:`1px solid ${C.border}`,borderRadius:5,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}/>
                                  </td>
                                  <td style={{padding:'4px 6px'}}>
                                    <input type="text" value={r.cliente} onChange={e => updateRow(i, 'cliente', e.target.value)}
                                      style={{width:'100%',fontSize:11,padding:'4px 6px',border:`1px solid ${C.border}`,borderRadius:5,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}/>
                                  </td>
                                  <td style={{padding:'4px 6px'}}>
                                    <input type="text" value={r.concepto} onChange={e => updateRow(i, 'concepto', e.target.value)}
                                      title={r.descripcion ? `Descripción del banco: ${r.descripcion}` : ''}
                                      style={{width:'100%',fontSize:11,padding:'4px 6px',border:`1px solid ${C.border}`,borderRadius:5,fontFamily:'inherit',outline:'none',boxSizing:'border-box'}}/>
                                  </td>
                                  <td style={{padding:'4px 6px'}}>
                                    <input type="number" step="0.01" value={r.monto} onChange={e => updateRow(i, 'monto', parseFloat(e.target.value) || 0)}
                                      style={{width:'100%',fontSize:11,padding:'4px 6px',border:`1px solid ${C.border}`,borderRadius:5,fontFamily:'monospace',outline:'none',textAlign:'right',fontWeight:700,color:'#1B5E20',boxSizing:'border-box'}}/>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{background:'#E8F5E9',borderTop:'2px solid #2E7D32'}}>
                              <td colSpan={5} style={{padding:'10px',fontWeight:700,color:'#1B5E20'}}>TOTAL A IMPORTAR ({countAImportar} {countAImportar === 1 ? 'fila' : 'filas'} en {m.monedaGlobal})</td>
                              <td style={{padding:'10px',textAlign:'right',fontFamily:'monospace',fontWeight:800,color:'#1B5E20',fontSize:14}}>{sym}{fmt(totalAImportar)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  )}
                </div>
                
                {/* Footer botones */}
                {m.rows.length > 0 && (
                  <div style={{padding:'12px 22px',borderTop:`1px solid ${C.border}`,display:'flex',justifyContent:'flex-end',gap:10}}>
                    <button onClick={() => setImportarIngresosModal(null)} style={{background:'#F1F5F9',color:'#374151',border:'none',padding:'10px 20px',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Cancelar</button>
                    <button onClick={handleGuardar} disabled={countAImportar === 0}
                      style={{background:countAImportar > 0 ? '#1B5E20' : '#B0BEC5',color:'#fff',border:'none',padding:'10px 20px',borderRadius:8,fontSize:13,fontWeight:700,cursor:countAImportar > 0 ? 'pointer' : 'not-allowed',fontFamily:'inherit'}}>
                      💾 Guardar {countAImportar} {countAImportar === 1 ? 'ingreso' : 'ingresos'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Modal de detalle de importe (drill-down) */}
        {detalleModal && (() => {
          const { pago, tipo } = detalleModal;
          const esGrupoNF = pago.proveedor === 'Otros Pagos';
          let facturasMostrar = [];
          if (tipo === 'adeudo') {
            facturasMostrar = (invoices[pago.moneda] || [])
              .filter(f => f.empresaId === empresaId)
              .filter(f => esGrupoNF ? f.tipo === 'EgresoNF' : (f.proveedor === pago.proveedor && f.tipo !== 'EgresoNF'))
              .map(f => {
                const saldoActual = (+f.total || 0) - (+f.montoPagado || 0);
                // Pagos realizados HOY a esta factura
                const pagadoHoy = payments
                  .filter(p => p.invoiceId === f.id && p.tipo === 'realizado' && p.fechaPago === fechaSeleccionada)
                  .reduce((s, p) => s + (+p.monto || 0), 0);
                // Saldo inicial del día = saldo actual + lo que se pagó hoy
                const saldoInicial = saldoActual + pagadoHoy;
                // Pagado antes de hoy = total pagado − pagado hoy
                const pagadoAntes = (+f.montoPagado || 0) - pagadoHoy;
                return {
                  folio: esGrupoNF ? (f.proveedor || f.concepto || f.folio) : `${f.serie || ''}${f.folio || ''}`,
                  fecha: f.fecha,
                  total: +f.total || 0,
                  pagadoAntes: Math.max(0, pagadoAntes),
                  pagadoHoy,
                  saldo: saldoInicial,        // saldo inicio del día (antes de pagos de hoy)
                  saldoActual,                // saldo después de pagos de hoy
                  concepto: esGrupoNF ? (f.notas || '') : (f.concepto || ''),
                  esEgresoNF: f.tipo === 'EgresoNF',
                };
              })
              .filter(f => f.saldo > 0)         // mostrar solo las que tenían saldo a inicio del día
              .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
          } else {
            facturasMostrar = (pago.detalleFacturas || []).map(d => ({
              folio: d.esEgresoNF ? d.folio : `${d.serie || ''}${d.folio || ''}`,
              concepto: d.concepto || '',
              pagoHoy: d.pagoHoy,
              estado: d.estado,
              metodoPago: d.metodoPago,
              esEgresoNF: !!d.esEgresoNF,
            }));
          }
          const totalCol = tipo === 'adeudo'
            ? facturasMostrar.reduce((s, f) => s + f.saldo, 0)
            : facturasMostrar.reduce((s, f) => s + f.pagoHoy, 0);
          const sym = monedaSym(pago.moneda);
          return (
            <div onClick={(e) => { if (e.target === e.currentTarget) setDetalleModal(null); }}
              style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:14}}>
              <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:900,maxHeight:'90vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}}>
                <div style={{padding:'16px 22px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center',background: tipo === 'adeudo' ? '#E3F2FD' : '#FFEBEE'}}>
                  <div>
                    <h3 style={{margin:0,fontSize:16,fontWeight:800,color: tipo === 'adeudo' ? '#0D47A1' : '#C62828'}}>
                      {tipo === 'adeudo' ? '📋 Detalle del Importe Adeudado' : '💰 Detalle del Pago del Día'}
                    </h3>
                    <p style={{margin:'2px 0 0',fontSize:12,color:'#6B7280'}}>
                      <b>{pago.proveedor}</b> · {pago.moneda} · {fechaSeleccionada}
                    </p>
                  </div>
                  <button onClick={() => setDetalleModal(null)} style={{background:'transparent',border:'none',fontSize:22,cursor:'pointer',color:'#6B7280'}}>×</button>
                </div>

                <div style={{overflow:'auto',padding:18,flex:1}}>
                  <div style={{background:'#F8FAFC',border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 14px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:13,flexWrap:'wrap',gap:8}}>
                    <div style={{color:C.muted}}>
                      {tipo === 'adeudo' 
                        ? `${facturasMostrar.length} ${facturasMostrar.length === 1 ? 'factura activa' : 'facturas activas'} · saldo pendiente`
                        : `${facturasMostrar.length} ${facturasMostrar.length === 1 ? 'factura' : 'facturas'} con pago en esta fecha`}
                    </div>
                    <div style={{fontWeight:800,fontSize:16,color: tipo === 'adeudo' ? '#0D47A1' : '#C62828',fontVariantNumeric:'tabular-nums'}}>
                      Total: {sym}{fmt(totalCol)}
                    </div>
                  </div>

                  {facturasMostrar.length === 0 ? (
                    <div style={{textAlign:'center',padding:'30px 16px',color:'#9CA3AF',fontSize:13}}>
                      No hay {tipo === 'adeudo' ? 'facturas activas' : 'pagos en esta fecha'}.
                    </div>
                  ) : (
                    <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                        <thead>
                          <tr style={{background:'#F8FAFC',borderBottom:`2px solid ${C.border}`}}>
                            <th style={{padding:'8px 12px',textAlign:'left',color:C.navy,fontWeight:700,fontSize:11,textTransform:'uppercase'}}>Folio</th>
                            <th style={{padding:'8px 12px',textAlign:'left',color:C.navy,fontWeight:700,fontSize:11,textTransform:'uppercase'}}>Concepto</th>
                            {tipo === 'adeudo' ? (
                              <>
                                <th style={{padding:'8px 12px',textAlign:'left',color:C.navy,fontWeight:700,fontSize:11,textTransform:'uppercase'}}>Fecha</th>
                                <th style={{padding:'8px 12px',textAlign:'right',color:C.navy,fontWeight:700,fontSize:11,textTransform:'uppercase'}}>Total</th>
                                <th style={{padding:'8px 12px',textAlign:'right',color:C.navy,fontWeight:700,fontSize:11,textTransform:'uppercase'}} title="Pagado antes de este día">Pagado antes</th>
                                <th style={{padding:'8px 12px',textAlign:'right',color:C.navy,fontWeight:700,fontSize:11,textTransform:'uppercase'}} title="Pagado en este día">Pagado hoy</th>
                                <th style={{padding:'8px 12px',textAlign:'right',color:C.navy,fontWeight:700,fontSize:11,textTransform:'uppercase'}} title="Saldo al inicio del día (lo que se debía)">Adeudado</th>
                              </>
                            ) : (
                              <>
                                <th style={{padding:'8px 12px',textAlign:'right',color:C.navy,fontWeight:700,fontSize:11,textTransform:'uppercase'}}>Monto</th>
                                <th style={{padding:'8px 12px',textAlign:'center',color:C.navy,fontWeight:700,fontSize:11,textTransform:'uppercase'}}>Método</th>
                                <th style={{padding:'8px 12px',textAlign:'center',color:C.navy,fontWeight:700,fontSize:11,textTransform:'uppercase'}}>Estado</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {facturasMostrar.map((f, idx) => (
                            <tr key={idx} style={{borderBottom:`1px solid ${C.border}`,background:idx % 2 === 0 ? '#fff' : '#FAFBFC'}}>
                              <td style={{padding:'8px 12px',fontFamily:'monospace',fontWeight:700,color: f.esEgresoNF ? '#C62828' : C.text}}>{f.folio}</td>
                              <td style={{padding:'8px 12px',color:'#374151'}}>{f.concepto || <span style={{color:'#D1D5DB'}}>—</span>}</td>
                              {tipo === 'adeudo' ? (
                                <>
                                  <td style={{padding:'8px 12px',color:C.muted,whiteSpace:'nowrap'}}>{f.fecha || '—'}</td>
                                  <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'monospace',color:C.text}}>{sym}{fmt(f.total)}</td>
                                  <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'monospace',color:'#1B5E20'}}>{sym}{fmt(f.pagadoAntes)}</td>
                                  <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'monospace',color: f.pagadoHoy > 0 ? '#1565C0' : '#9CA3AF',fontWeight: f.pagadoHoy > 0 ? 700 : 400}}>{sym}{fmt(f.pagadoHoy)}</td>
                                  <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'monospace',fontWeight:700,color:'#0D47A1'}}>{sym}{fmt(f.saldo)}</td>
                                </>
                              ) : (
                                <>
                                  <td style={{padding:'8px 12px',textAlign:'right',fontFamily:'monospace',fontWeight:700,color:'#C62828'}}>{sym}{fmt(f.pagoHoy)}</td>
                                  <td style={{padding:'8px 12px',textAlign:'center'}}>
                                    {f.metodoPago === 'tdc' ? <span style={{background:'#F3E5F5',color:'#6A1B9A',padding:'2px 8px',borderRadius:8,fontSize:10,fontWeight:700}}>💳 TDC</span> :
                                     f.metodoPago === 'otro' ? <span style={{background:'#F5F5F5',color:'#616161',padding:'2px 8px',borderRadius:8,fontSize:10,fontWeight:700}}>➕ Otro</span> :
                                     <span style={{background:'#E3F2FD',color:'#1565C0',padding:'2px 8px',borderRadius:8,fontSize:10,fontWeight:700}}>🏦 Banco</span>}
                                  </td>
                                  <td style={{padding:'8px 12px',textAlign:'center'}}>
                                    {(() => {
                                      const meta = {
                                        atrasado: { label: '⚠️ Atrasado', bg: '#FFEBEE', color: '#C62828' },
                                        pagado: { label: '✅ Pagado', bg: '#E8F5E9', color: '#1B5E20' },
                                        pagado_atraso: { label: '🟡 Pagado tarde', bg: '#FFF3E0', color: '#E65100' },
                                        programado: { label: '📅 Programado', bg: '#E3F2FD', color: '#1565C0' },
                                      }[f.estado] || { label: f.estado, bg: '#F5F5F5', color: '#666' };
                                      return <span style={{background:meta.bg,color:meta.color,padding:'2px 8px',borderRadius:8,fontSize:10,fontWeight:700}}>{meta.label}</span>;
                                    })()}
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{background: tipo === 'adeudo' ? '#E3F2FD' : '#FFEBEE',borderTop:`2px solid ${tipo === 'adeudo' ? '#1976D2' : '#C62828'}`}}>
                            <td colSpan={tipo === 'adeudo' ? 6 : 2} style={{padding:'10px 12px',fontWeight:700,color: tipo === 'adeudo' ? '#0D47A1' : '#C62828'}}>TOTAL</td>
                            <td style={{padding:'10px 12px',textAlign:'right',fontFamily:'monospace',fontWeight:800,color: tipo === 'adeudo' ? '#0D47A1' : '#C62828',fontSize:13}}>
                              {sym}{fmt(totalCol)}
                            </td>
                            {tipo === 'pago' && <td colSpan={2}/>}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}

                  {tipo === 'adeudo' && pago.pagoHoy > 0 && (
                    <div style={{marginTop:14,padding:'10px 14px',background:'#FFFDE7',border:'1px solid #FFE082',borderRadius:8,fontSize:12,color:'#E65100'}}>
                      💡 Pago programado para el {fechaSeleccionada}: <b>{sym}{fmt(pago.pagoHoy)}</b>
                      {pago.pagoHoy > totalCol && (
                        <span style={{marginLeft:8,color:'#C62828',fontWeight:700}}>
                          ⚠️ El pago programado es MAYOR al saldo adeudado (diferencia: {sym}{fmt(pago.pagoHoy - totalCol)})
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div style={{padding:'12px 22px',borderTop:`1px solid ${C.border}`,display:'flex',justifyContent:'flex-end'}}>
                  <button onClick={() => setDetalleModal(null)} style={{background:'#1976D2',color:'#fff',border:'none',padding:'8px 20px',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Cerrar</button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  /* ── SALDOS BANCARIOS ───────────────────────────────────────────────── */
  const SaldosBancarios = () => {
    const [cuentas, setCuentas] = useState([]);
    const [saldosInicio, setSaldosInicio] = useState({});  // {cuentaId: {saldoReal, movsPendientes}}
    const [saldosCierre, setSaldosCierre] = useState({});  // idem
    const [metaInicio, setMetaInicio] = useState({ updatedAt: null, updatedBy: null });
    const [metaCierre, setMetaCierre] = useState({ updatedAt: null, updatedBy: null });
    const [loading, setLoading] = useState(true);
    const [savingCuenta, setSavingCuenta] = useState(null);   // `${cuentaId}_${momento}` que se está guardando
    const [editandoSaldo, setEditandoSaldo] = useState(null); // `${cuentaId}_${momento}` en edición
    const [valorEdicion, setValorEdicion] = useState("");
    const [showCuentas, setShowCuentas] = useState(false);
    const [showPendientes, setShowPendientes] = useState(false);
    const [pendientesMomento, setPendientesMomento] = useState('inicio');
    const [showHistorico, setShowHistorico] = useState(false);
    const [verHistorico, setVerHistorico] = useState(null); // {fecha, momento}
    const [edicionHistoricaSaldos, setEdicionHistoricaSaldos] = useState(false);
    const [showCopiarMenu, setShowCopiarMenu] = useState(false);
    const [importarECModal, setImportarECModal] = useState(null);
    // Préstamos: por ahora un solo préstamo activo por empresa
    const [prestamo, setPrestamo] = useState(null);          // {id, banco, montoAutorizado, ...} o null
    const [prestamoMovs, setPrestamoMovs] = useState([]);    // movimientos del préstamo activo
    const [showPrestamoMov, setShowPrestamoMov] = useState(null);  // {tipo, mov} o null — modal nuevo/editar
    const [showPrestamoHist, setShowPrestamoHist] = useState(false);
    const [editandoMontoPrestamo, setEditandoMontoPrestamo] = useState(false);
    const [valorMontoPrestamo, setValorMontoPrestamo] = useState('');
    const refInicio = useRef(null);
    const refCierre = useRef(null);
    const refAmbos = useRef(null);

    const fechaHoy = today();
    const fechaConsulta = verHistorico?.fecha || fechaHoy;
    const esHoy = !verHistorico;
    const momentoConsulta = verHistorico?.momento || null; // null = mostrar ambos cuadros
    
    // Resetear el flag de edición histórica cuando cambia la fecha o se vuelve a hoy
    useEffect(() => { setEdicionHistoricaSaldos(false); }, [fechaConsulta, verHistorico]);
    
    // Determinar si el usuario puede habilitar edición histórica
    // Solo Admin y Usuario (no Consulta)
    const puedeEditarHistorico = !esConsulta;
    
    // Bloqueo de edición: solo bloqueamos en histórico SIN edición habilitada
    const bloqueoSaldos = !esHoy && !edicionHistoricaSaldos;

    // Cargar cuentas + saldos del día (ambos momentos en paralelo) + préstamo activo
    const recargar = async () => {
      setLoading(true);
      const [cs, ssIni, ssCie, prestamos] = await Promise.all([
        fetchCuentasBancarias(empresaId),
        fetchSaldosDiarios(empresaId, fechaConsulta, 'inicio'),
        fetchSaldosDiarios(empresaId, fechaConsulta, 'cierre'),
        fetchPrestamos(empresaId),
      ]);
      setCuentas(cs);
      const procesar = (arr) => {
        const map = {};
        let lastUpdate = null, lastBy = null;
        arr.forEach(s => {
          map[s.cuentaId] = { saldoReal: s.saldoReal, movsPendientes: s.movsPendientes };
          if (!lastUpdate || s.updatedAt > lastUpdate) {
            lastUpdate = s.updatedAt;
            lastBy = s.updatedBy;
          }
        });
        return { map, lastUpdate, lastBy };
      };
      const ini = procesar(ssIni);
      const cie = procesar(ssCie);
      setSaldosInicio(ini.map);
      setSaldosCierre(cie.map);
      setMetaInicio({ updatedAt: ini.lastUpdate, updatedBy: ini.lastBy });
      setMetaCierre({ updatedAt: cie.lastUpdate, updatedBy: cie.lastBy });
      // Préstamo activo (por ahora tomamos el primero; futuro: soporte multi-préstamo)
      const pActivo = prestamos[0] || null;
      setPrestamo(pActivo);
      if (pActivo) {
        const movs = await fetchPrestamoMovimientos(pActivo.id);
        setPrestamoMovs(movs);
      } else {
        setPrestamoMovs([]);
      }
      setLoading(false);
    };

    // Recargar solo movimientos (después de crear/editar/borrar)
    const recargarMovsPrestamo = async () => {
      if (!prestamo) return;
      const movs = await fetchPrestamoMovimientos(prestamo.id);
      setPrestamoMovs(movs);
    };

    useEffect(() => { recargar(); /* eslint-disable-next-line */ }, [empresaId, fechaConsulta]);

    // Helpers genéricos por momento
    const sym = (m) => m === 'EUR' ? '€' : '$';
    const getSaldosByMomento = (m) => m === 'cierre' ? saldosCierre : saldosInicio;
    const getMetaByMomento = (m) => m === 'cierre' ? metaCierre : metaInicio;
    const saldoReal = (cId, m) => getSaldosByMomento(m)[cId]?.saldoReal || 0;
    const movsPend  = (cId, m) => getSaldosByMomento(m)[cId]?.movsPendientes || 0;
    const reservaCta = (c) => +c.reservaMinima || 0;
    // Permitir negativos: si saldo - reserva - pendientes da negativo,
    // significa que la cuenta está por debajo de su reserva mínima.
    // Ej: saldo $1,215 - reserva $2,000 = -$784 (debes meter $784 para cumplir reserva)
    const disponible = (c, m) => saldoReal(c.id, m) - reservaCta(c) - movsPend(c.id, m);
    const ajusteVisible = (c, m) => reservaCta(c) > 0 || movsPend(c.id, m) !== 0;

    // ─── Cálculos del préstamo ─────────────────────────────────────
    // utilizado = suma de disposiciones - suma de pagos
    // bloqueado = autorizado - utilizado  (lo que NO se ha tomado)
    // El bloqueado se resta del Total Disponible MN para que el flujo
    // proyectado no contemple ese dinero como operativo.
    const prestamoCalc = useMemo(() => {
      if (!prestamo) return null;
      const utilizado = calcularUtilizadoPrestamo(prestamoMovs);
      const autorizado = +prestamo.montoAutorizado || 0;
      const bloqueado = Math.max(0, autorizado - utilizado);
      const pctUtilizado = autorizado > 0 ? Math.round((utilizado / autorizado) * 100) : 0;
      // Estado del chip: 'bloqueado' (sin uso) | 'enUso' (parcial) | 'agotado' (100%)
      let estado = 'bloqueado';
      if (utilizado > 0 && utilizado < autorizado) estado = 'enUso';
      else if (utilizado >= autorizado && autorizado > 0) estado = 'agotado';
      const movsContables = (prestamoMovs || []).filter(m => m.tipo !== 'inicial').length;
      return { autorizado, utilizado, bloqueado, pctUtilizado, estado, movsContables };
    }, [prestamo, prestamoMovs]);

    // Tema por momento
    const tema = (m) => {
      if (m === 'cierre') return { primario: '#1B5E20', claroFondo: '#C8E6C9', claroTexto: '#1B5E20' };
      return { primario: C.navy, claroFondo: '#BBDEFB', claroTexto: '#0C447C' };
    };

    // Limpiar prefijo "CTA" duplicado en el texto del número
    const limpiaCta = (n) => {
      if (!n) return '';
      return String(n).replace(/^\s*(cta\.?|CTA\.?)\s*/i, '').trim();
    };

    // Agrupar cuentas por banco preservando orden
    const cuentasPorBanco = useMemo(() => {
      const grupos = {};
      cuentas.forEach(c => {
        if (!grupos[c.banco]) grupos[c.banco] = [];
        grupos[c.banco].push(c);
      });
      return grupos;
    }, [cuentas]);

    // Totales por momento
    const calcTotales = (m) => {
      const t = { realMN: 0, realDL: 0, realEUR: 0, inversion: 0, dispMN: 0, dispDL: 0, dispEUR: 0, dispInversion: 0 };
      cuentas.forEach(c => {
        const r = saldoReal(c.id, m);
        const d = disponible(c, m);
        if (c.tipo === 'inversion') {
          t.inversion += r;
          t.dispInversion += d;
        } else if (c.moneda === 'MXN') {
          t.realMN += r;
          t.dispMN += d;
        } else if (c.moneda === 'USD') {
          t.realDL += r;
          t.dispDL += d;
        } else if (c.moneda === 'EUR') {
          t.realEUR += r;
          t.dispEUR += d;
        }
      });
      return t;
    };

    // Editar saldo real
    const iniciarEdicion = (cuenta, m) => {
      if (esConsulta || bloqueoSaldos) return;
      const key = `${cuenta.id}_${m}`;
      setEditandoSaldo(key);
      setValorEdicion(String(saldoReal(cuenta.id, m) || ''));
    };
    const guardarEdicion = async () => {
      if (!editandoSaldo) return;
      const [cId, m] = editandoSaldo.split('_');
      const cuenta = cuentas.find(c => c.id === cId);
      if (!cuenta) { setEditandoSaldo(null); return; }
      const nuevoReal = parseFloat(valorEdicion.replace(/[,$]/g, '')) || 0;
      const pendiente = movsPend(cuenta.id, m);
      setSavingCuenta(editandoSaldo);
      const ok = await upsertSaldoDiario({
        cuentaId: cuenta.id,
        empresaId,
        fecha: fechaConsulta,  // usa fecha del día consultado, no necesariamente hoy
        momento: m,
        saldoReal: nuevoReal,
        movsPendientes: pendiente,
      }, user?.nombre || 'desconocido');
      if (ok) {
        if (m === 'cierre') {
          setSaldosCierre(prev => ({ ...prev, [cuenta.id]: { saldoReal: nuevoReal, movsPendientes: pendiente } }));
          setMetaCierre({ updatedAt: new Date().toISOString(), updatedBy: user?.nombre || 'desconocido' });
        } else {
          setSaldosInicio(prev => ({ ...prev, [cuenta.id]: { saldoReal: nuevoReal, movsPendientes: pendiente } }));
          setMetaInicio({ updatedAt: new Date().toISOString(), updatedBy: user?.nombre || 'desconocido' });
        }
        // Si editaste un día histórico, avisar sobre el efecto cascada
        if (!esHoy) {
          setTimeout(() => {
            alert('💡 Los saldos heredados de los días siguientes se actualizarán automáticamente al consultarlos.');
          }, 100);
        }
      }
      setSavingCuenta(null);
      setEditandoSaldo(null);
      setValorEdicion("");
    };
    const cancelarEdicion = () => { setEditandoSaldo(null); setValorEdicion(""); };

    // Copiar imagen de un nodo específico
    const copiarNodoComoImagen = async (node, nombreArchivo) => {
      if (!node) return;
      try {
        const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff' });
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          if (navigator.clipboard && window.ClipboardItem) {
            try {
              await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
              alert('✅ Imagen copiada al portapapeles. Pégala con Ctrl+V en WhatsApp/Teams/Email.');
              return;
            } catch (e) { /* fallback abajo */ }
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = nombreArchivo;
          a.click();
          URL.revokeObjectURL(url);
        });
      } catch (err) {
        console.error('copiar imagen:', err);
        alert('No se pudo generar la imagen. Intenta de nuevo.');
      }
    };

    const copiarSoloInicio = () => {
      setShowCopiarMenu(false);
      copiarNodoComoImagen(refInicio.current, `Saldos_${empresa.nombre.replace(/\s/g,'_')}_INICIO_${fechaHoy}.png`);
    };
    const copiarSoloCierre = () => {
      setShowCopiarMenu(false);
      copiarNodoComoImagen(refCierre.current, `Saldos_${empresa.nombre.replace(/\s/g,'_')}_CIERRE_${fechaHoy}.png`);
    };
    const copiarAmbos = () => {
      setShowCopiarMenu(false);
      copiarNodoComoImagen(refAmbos.current, `Saldos_${empresa.nombre.replace(/\s/g,'_')}_DIA_${fechaHoy}.png`);
    };

    // Abrir pendientes con momento específico
    const abrirPendientes = (m) => {
      setPendientesMomento(m);
      setShowPendientes(true);
    };

    const fmtFechaLarga = (f) => {
      if (!f) return '';
      const d = new Date(f + 'T12:00:00');
      return d.toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    };
    const fmtFechaCorta = (f) => {
      if (!f) return '';
      const d = new Date(f + 'T12:00:00');
      return d.toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' });
    };

    // ──── Sub-componente: Cuadro de un momento (INICIO o CIERRE) ────
    const CuadroSaldos = ({ momento, innerRef }) => {
      const t = tema(momento);
      const meta = getMetaByMomento(momento);
      const totales = calcTotales(momento);
      const titulo = momento === 'cierre' ? 'CIERRE DE DÍA' : 'INICIO DE DÍA';
      const editable = !esConsulta && (esHoy || edicionHistoricaSaldos);

      return (
        <div ref={innerRef} style={{width:820,maxWidth:'100%',background:'#fff',margin:'0 auto'}}>
          <div style={{border:`1px solid ${t.primario}`,borderRadius:8,overflow:'hidden'}}>
            {/* BARRA TÍTULO */}
            <div style={{background:t.primario,color:'#fff',padding:'14px 18px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                {empresa.logo && (
                  <div style={{width:48,height:48,borderRadius:'50%',background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',padding:4,flexShrink:0,overflow:'hidden'}}>
                    <img src={empresa.logo} alt={empresa.nombre} style={{width:'100%',height:'100%',objectFit:'contain',borderRadius:'50%'}}/>
                  </div>
                )}
                <div style={{textAlign:'left'}}>
                  <div style={{fontSize:17,fontWeight:700,lineHeight:1.2}}>{empresa.nombre}</div>
                  <div style={{fontSize:13,opacity:0.85}}>{fmtFechaCorta(fechaConsulta)}</div>
                </div>
              </div>
              <div style={{fontWeight:800,fontSize:17,letterSpacing:0.5}}>SALDOS BANCARIOS · {titulo}</div>
            </div>

            {/* META */}
            <div style={{padding:'8px 18px',background:'#FAFAFA',fontSize:12,color:C.muted,borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              {meta.updatedAt
                ? <span><span style={{color:'#1B5E20'}}>✓</span> Actualizado: {new Date(meta.updatedAt).toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'})}{meta.updatedBy ? ` · ${meta.updatedBy}` : ''}</span>
                : <span style={{color:'#999'}}>Sin captura</span>}
              {(esHoy || edicionHistoricaSaldos) && !esConsulta && (
                <button onClick={() => abrirPendientes(momento)} style={{background:'transparent',border:`1px solid ${t.primario}`,color:t.primario,padding:'3px 10px',borderRadius:4,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>⚡ Pendientes</button>
              )}
            </div>

            {/* CUENTAS POR BANCO */}
            {Object.entries(cuentasPorBanco).map(([banco, ctas]) => (
              <div key={banco}>
                <div style={{background:t.claroFondo,color:t.claroTexto,padding:'9px 18px',textAlign:'center',fontWeight:800,fontSize:15,letterSpacing:1}}>{banco.toUpperCase()}</div>
                {(() => {
                  const filas = [];
                  for (let i = 0; i < ctas.length; i += 2) filas.push([ctas[i], ctas[i+1] || null]);
                  return filas.map((par, idx) => (
                    <div key={idx} style={{display:'grid',gridTemplateColumns:'80px 1fr 50px 100px 1fr',gap:0,padding:'14px 18px',alignItems:'center',borderBottom:idx<filas.length-1?`1px solid ${C.border}`:'none'}}>
                      {[0,1].map(slot => {
                        const c = par[slot];
                        if (!c) {
                          if (slot === 0) return <React.Fragment key={slot}><div/><div/></React.Fragment>;
                          return <React.Fragment key={slot}><div/><div/><div/></React.Fragment>;
                        }
                        const labelMoneda = c.tipo === 'inversion' ? 'PESOS' : (c.moneda === 'MXN' ? 'PESOS' : (c.moneda === 'USD' ? 'Dólares' : 'Euros'));
                        const refTexto = c.tipo === 'inversion' ? 'Inversión' : `CTA. ${limpiaCta(c.numeroCuenta)}`;
                        const tieneAjuste = ajusteVisible(c, momento);
                        const keyEdicion = `${c.id}_${momento}`;
                        const enEdicion = editandoSaldo === keyEdicion;
                        const isSaving = savingCuenta === keyEdicion;
                        const separador = slot === 1 ? [<div key="sep"/>] : [];
                        return (
                          <React.Fragment key={slot}>
                            {separador}
                            <div style={{fontSize:15,color:'#555',fontWeight:600,paddingLeft:slot===1?16:0}}>{labelMoneda}</div>
                            <div
                              onClick={() => !enEdicion && iniciarEdicion(c, momento)}
                              style={{textAlign:'center',cursor:editable && !enEdicion ?'pointer':'default',padding:'4px 4px',borderRadius:6,transition:'background 0.15s'}}
                              onMouseEnter={(e) => { if (editable && !enEdicion) e.currentTarget.style.background='#F0F4FF'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background='transparent'; }}
                              title={editable && !enEdicion ? 'Clic para editar saldo' : ''}
                            >
                              <div style={{fontSize:13,color:'#1F2937',fontWeight:800,fontStyle:'italic',marginBottom:4}}>{refTexto}</div>
                              {tieneAjuste && !enEdicion && (
                                <div style={{fontSize:15,color:'#1F2937',marginBottom:5,fontVariantNumeric:'tabular-nums'}}>{sym(c.moneda)}{fmt(saldoReal(c.id, momento))}</div>
                              )}
                              {enEdicion ? (
                                <input
                                  autoFocus
                                  value={valorEdicion}
                                  onChange={(e) => setValorEdicion(e.target.value.replace(/[^\d.]/g, ''))}
                                  onBlur={guardarEdicion}
                                  onKeyDown={(e) => { if (e.key === 'Enter') guardarEdicion(); if (e.key === 'Escape') cancelarEdicion(); }}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{background:'#fff',border:`2px solid ${t.primario}`,padding:'6px 14px',borderRadius:6,fontWeight:800,color:t.primario,fontSize:18,textAlign:'center',width:170,outline:'none',fontFamily:'inherit',fontVariantNumeric:'tabular-nums'}}
                                />
                              ) : isSaving ? (
                                <span style={{background:t.claroFondo,padding:'6px 18px',borderRadius:6,fontWeight:800,color:t.claroTexto,fontSize:18,opacity:0.6}}>guardando...</span>
                              ) : (() => {
                                const disp = disponible(c, momento);
                                const esNeg = disp < 0;
                                return (
                                  <span
                                    title={esNeg ? `Saldo por debajo de la reserva mínima ($${fmt(reservaCta(c))}). Falta ${sym(c.moneda)}${fmt(Math.abs(disp))} para alcanzarla.` : ''}
                                    style={{
                                      background: esNeg ? '#FFEBEE' : t.claroFondo,
                                      border: esNeg ? '1px solid #EF9A9A' : 'none',
                                      padding:'6px 18px',
                                      borderRadius:6,
                                      display:'inline-block',
                                      fontWeight:800,
                                      color: esNeg ? '#C62828' : t.claroTexto,
                                      fontSize:18,
                                      userSelect:'none',
                                      fontVariantNumeric:'tabular-nums',
                                      letterSpacing:0.3
                                    }}
                                  >
                                    {disp < 0 ? '-' : ''}{sym(c.moneda)}{fmt(Math.abs(disp))}
                                  </span>
                                );
                              })()}
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
            ))}

            {/* TOTALES */}
            <div style={{background:'#F9FAFB',padding:'16px 20px',borderTop:`1px solid ${C.border}`}}>
              {/* Subtotales por moneda */}
              <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:'6px 18px',fontSize:15}}>
                {totales.realMN > 0 && (<>
                  <div style={{color:'#555',fontWeight:500}}>Total Saldos Bancarios MN</div>
                  <div style={{textAlign:'right',fontWeight:700,color:'#1F2937',fontFamily:'monospace',fontVariantNumeric:'tabular-nums',fontSize:16}}>${fmt(totales.realMN)}</div>
                </>)}
                {totales.realDL > 0 && (<>
                  <div style={{color:'#555',fontWeight:500}}>Total Saldos Bancarios DL</div>
                  <div style={{textAlign:'right',fontWeight:700,color:'#1F2937',fontFamily:'monospace',fontVariantNumeric:'tabular-nums',fontSize:16}}>${fmt(totales.realDL)}</div>
                </>)}
                {totales.realEUR > 0 && (<>
                  <div style={{color:'#555',fontWeight:500}}>Total Saldos Bancarios EU</div>
                  <div style={{textAlign:'right',fontWeight:700,color:'#1F2937',fontFamily:'monospace',fontVariantNumeric:'tabular-nums',fontSize:16}}>€{fmt(totales.realEUR)}</div>
                </>)}
                {totales.inversion > 0 && (<>
                  <div style={{color:'#555',fontWeight:500}}>Inversión</div>
                  <div style={{textAlign:'right',fontWeight:700,color:'#1F2937',fontFamily:'monospace',fontVariantNumeric:'tabular-nums',fontSize:16}}>${fmt(totales.inversion)}</div>
                </>)}
              </div>

              {/* Separador continuo de ancho completo */}
              <div style={{borderTop:`2px solid ${C.border}`,marginTop:12,paddingTop:12,display:'flex',justifyContent:'space-between',alignItems:'center',gap:16,flexWrap:'wrap'}}>
                <div>
                  <div style={{color:t.primario,fontWeight:800,fontSize:17}}>Total Disponible</div>
                  {prestamoCalc && prestamoCalc.bloqueado > 0 && (
                    <div style={{fontSize:10,color:C.muted,marginTop:2,fontWeight:500}}>
                      MN excluye <span style={{fontVariantNumeric:'tabular-nums',color:'#B45309'}}>${fmt(prestamoCalc.bloqueado)}</span> bloqueado del préstamo
                    </div>
                  )}
                </div>
                <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:8}}>
                  {(() => {
                    const bloq = prestamoCalc ? prestamoCalc.bloqueado : 0;
                    const tot = totales.dispMN + totales.dispInversion - bloq;
                    const esNeg = tot < 0;
                    return (
                      <span style={{background: esNeg ? '#C62828' : t.primario,padding:'8px 18px',borderRadius:5,fontWeight:800,color:'#fff',fontSize:22,fontVariantNumeric:'tabular-nums',letterSpacing:0.3}}>{esNeg ? '-' : ''}${fmt(Math.abs(tot))} MN</span>
                    );
                  })()}
                  {(totales.dispDL !== 0) && (() => {
                    const esNeg = totales.dispDL < 0;
                    return <span style={{background: esNeg ? '#C62828' : t.primario,padding:'5px 14px',borderRadius:5,fontWeight:700,color:'#fff',fontSize:16,fontVariantNumeric:'tabular-nums',letterSpacing:0.3}}>{esNeg ? '-' : ''}${fmt(Math.abs(totales.dispDL))} USD</span>;
                  })()}
                  {(totales.dispEUR !== 0) && (() => {
                    const esNeg = totales.dispEUR < 0;
                    return <span style={{background: esNeg ? '#C62828' : t.primario,padding:'5px 14px',borderRadius:5,fontWeight:700,color:'#fff',fontSize:16,fontVariantNumeric:'tabular-nums',letterSpacing:0.3}}>{esNeg ? '-' : ''}€{fmt(Math.abs(totales.dispEUR))} EUR</span>;
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    };

    // ──── Sub-componente: Chip lateral del préstamo ────
    const ChipPrestamo = () => {
      if (!prestamo || !prestamoCalc) return null;
      const pc = prestamoCalc;
      // Paleta por estado
      const skin = {
        bloqueado: { headerBg:'#FEF3C7', headerText:'#92400E', icon:'🔒', estado:'PRÉSTAMO BLOQUEADO', sub:'Sin utilizar', barColor:'#F59E0B' },
        enUso:     { headerBg:'#DBEAFE', headerText:'#1E40AF', icon:'⏳', estado:'PRÉSTAMO EN USO',     sub:'Parcialmente utilizado', barColor:'#3B82F6' },
        agotado:   { headerBg:'#FEE2E2', headerText:'#991B1B', icon:'⚠️', estado:'PRÉSTAMO AGOTADO',     sub:'Totalmente utilizado', barColor:'#DC2626' },
      }[pc.estado];
      const colorUtilizado = pc.estado === 'agotado' ? '#DC2626' : (pc.estado === 'enUso' ? '#1E40AF' : '#1F2937');
      return (
        <div style={{width:300,flexShrink:0,background:'#fff',border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden',alignSelf:'flex-start'}}>
          <div style={{background:skin.headerBg,padding:'12px 14px',borderBottom:`1px solid ${C.border}`}}>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:16}}>{skin.icon}</span>
              <span style={{fontSize:11,fontWeight:800,color:skin.headerText,letterSpacing:0.6}}>{skin.estado}</span>
            </div>
            <div style={{fontSize:10,color:skin.headerText,opacity:0.85,marginTop:2}}>{skin.sub}</div>
          </div>
          <div style={{padding:14}}>
            <div style={{fontSize:10,color:C.muted,marginBottom:2}}>Banco</div>
            <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>{prestamo.banco}{prestamo.numeroCuenta ? ` · Cta. ${limpiaCta(prestamo.numeroCuenta)}` : ''}</div>

            <div style={{fontSize:10,color:C.muted,marginBottom:2}}>Bloqueado</div>
            {editandoMontoPrestamo ? (
              <div style={{display:'flex',gap:4,marginBottom:10,alignItems:'center'}}>
                <input
                  autoFocus
                  value={valorMontoPrestamo}
                  onChange={(e) => setValorMontoPrestamo(e.target.value.replace(/[^\d.]/g, ''))}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      const nuevoMonto = parseFloat(valorMontoPrestamo) || 0;
                      await upsertPrestamo({ ...prestamo, montoAutorizado: nuevoMonto }, user?.nombre);
                      setEditandoMontoPrestamo(false);
                      await recargar();
                    } else if (e.key === 'Escape') {
                      setEditandoMontoPrestamo(false);
                    }
                  }}
                  style={{flex:1,border:`2px solid ${C.navy}`,padding:'4px 8px',borderRadius:4,fontSize:14,fontFamily:'inherit',fontVariantNumeric:'tabular-nums'}}
                />
                <button onClick={() => setEditandoMontoPrestamo(false)} style={{background:'transparent',border:`1px solid ${C.border}`,padding:'4px 8px',borderRadius:4,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>×</button>
              </div>
            ) : (
              <div style={{display:'flex',alignItems:'baseline',gap:6,marginBottom:10}}>
                <div style={{fontSize:18,fontWeight:800,color:'#1F2937',fontVariantNumeric:'tabular-nums'}}>${fmt(pc.bloqueado)}</div>
                {esHoy && !esConsulta && (
                  <button
                    onClick={() => { setValorMontoPrestamo(String(prestamo.montoAutorizado)); setEditandoMontoPrestamo(true); }}
                    title="Editar monto autorizado"
                    style={{background:'transparent',border:`1px solid ${C.border}`,padding:'2px 6px',borderRadius:4,fontSize:10,cursor:'pointer',color:C.muted,fontFamily:'inherit'}}
                  >✎</button>
                )}
              </div>
            )}

            {/* Barra de progreso */}
            <div style={{height:6,background:'#F3F4F6',borderRadius:999,overflow:'hidden',marginBottom:5}}>
              <div style={{width:`${Math.min(100, pc.pctUtilizado)}%`,height:'100%',background:skin.barColor,transition:'width 0.3s'}}/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:C.muted,marginBottom:10}}>
              <span>{pc.pctUtilizado}% utilizado</span>
              <span style={{fontVariantNumeric:'tabular-nums'}}>${fmt(pc.autorizado)}</span>
            </div>

            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10,marginTop:4,fontSize:11,color:C.muted}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                <span>Utilizado</span>
                <span style={{color:colorUtilizado,fontWeight:700,fontVariantNumeric:'tabular-nums'}}>${fmt(pc.utilizado)}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span>Movimientos</span>
                <span style={{color:'#1F2937',fontWeight:600}}>{pc.movsContables}</span>
              </div>
            </div>

            {esHoy && !esConsulta && (
              <button
                onClick={() => setShowPrestamoMov({ tipo:'disposicion', mov:null })}
                style={{width:'100%',marginTop:12,padding:'8px',background:C.navy,color:'#fff',border:'none',borderRadius:6,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}
              >+ Registrar movimiento</button>
            )}
            <button
              onClick={() => setShowPrestamoHist(true)}
              style={{width:'100%',marginTop:6,padding:'8px',background:'#fff',color:C.text,border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}
            >📜 Ver histórico</button>
          </div>
        </div>
      );
    };

    if (loading) {
      return (
        <div style={{textAlign:'center',padding:60,color:C.muted}}>
          <div style={{fontSize:48,marginBottom:12}}>🏦</div>
          <div>Cargando saldos bancarios...</div>
        </div>
      );
    }

    return (
      <div style={{
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeLegibility',
      }}>
        {/* HEADER */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14,paddingBottom:12,borderBottom:`1px solid ${C.border}`,flexWrap:'wrap',gap:12}}>
          <div>
            <h1 style={{fontSize:20,fontWeight:800,color:C.navy,margin:0}}>🏦 Saldos Bancarios · {empresa.nombre}</h1>
            <p style={{fontSize:13,color:C.muted,margin:'4px 0 0',textTransform:'capitalize'}}>{fmtFechaLarga(fechaConsulta)}{!esHoy && !edicionHistoricaSaldos && <span style={{marginLeft:8,background:'#FFF3E0',color:'#E65100',padding:'2px 8px',borderRadius:8,fontSize:11,fontWeight:700,textTransform:'uppercase'}}>Histórico · solo lectura</span>}{!esHoy && edicionHistoricaSaldos && <span style={{marginLeft:8,background:'#FFEBEE',color:'#C62828',padding:'2px 8px',borderRadius:8,fontSize:11,fontWeight:700,textTransform:'uppercase'}}>✏️ EDITANDO histórico</span>}</p>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
            {!esHoy && (
              <button onClick={() => setVerHistorico(null)} style={{background:'#FFF3E0',color:'#E65100',border:'none',padding:'7px 12px',borderRadius:7,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>← Volver a hoy</button>
            )}
            <button onClick={() => setShowCuentas(true)} disabled={esConsulta} style={{background:'#fff',border:`1px solid ${C.border}`,padding:'7px 12px',borderRadius:7,fontSize:11,color:C.text,fontWeight:600,cursor:esConsulta?'not-allowed':'pointer',opacity:esConsulta?0.5:1,fontFamily:'inherit'}}>⚙️ Cuentas</button>
            <button onClick={() => setShowHistorico(true)} style={{background:'#fff',border:`1px solid ${C.border}`,padding:'7px 12px',borderRadius:7,fontSize:11,color:C.text,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>📜 Histórico</button>
            {!prestamo && esHoy && !esConsulta && (
              <button onClick={() => setShowPrestamoMov({ tipo:'crear-prestamo', mov:null })} style={{background:'#fff',border:`1px solid #F59E0B`,color:'#92400E',padding:'7px 12px',borderRadius:7,fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>+ Registrar préstamo</button>
            )}
            <button onClick={() => setImportarECModal({ open: true, archivo: null, parseando: false, resultado: null, sobreescribir: new Set() })} disabled={esConsulta} style={{background:esConsulta?'#999':'#1976D2',color:'#fff',border:'none',padding:'7px 12px',borderRadius:7,fontSize:11,fontWeight:700,cursor:esConsulta?'not-allowed':'pointer',fontFamily:'inherit'}}>📥 Importar Excel</button>
            <button onClick={() => setShowCopiarMenu(true)} disabled={cuentas.length===0} style={{background:cuentas.length===0?'#999':C.navy,color:'#fff',border:'none',padding:'7px 12px',borderRadius:7,fontSize:11,fontWeight:700,cursor:cuentas.length===0?'not-allowed':'pointer',fontFamily:'inherit'}}>📸 Copiar Imagen</button>
          </div>
        </div>

        {/* Banner: Vista histórica - solo lectura → habilitar edición */}
        {!esHoy && !edicionHistoricaSaldos && puedeEditarHistorico && (
          <div style={{background:'#FFF8E1',border:'1px solid #FFE082',borderRadius:10,padding:'12px 16px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:'#E65100'}}>📅 Vista histórica · solo lectura</div>
              <div style={{fontSize:11,color:'#5D4037',marginTop:2}}>Estás viendo los saldos de una fecha pasada. Si necesitas modificarlos, habilita la edición.</div>
            </div>
            <button onClick={() => {
              if (window.confirm('Vas a editar los saldos del histórico. Los cambios afectarán permanentemente y los saldos heredados de los días siguientes se actualizarán automáticamente.\n\n¿Continuar?')) {
                setEdicionHistoricaSaldos(true);
              }
            }} style={{background:'#fff',border:'1px solid #FFB74D',color:'#E65100',padding:'8px 16px',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
              🔓 Habilitar edición
            </button>
          </div>
        )}

        {/* Banner: EDITANDO histórico → terminar edición */}
        {!esHoy && edicionHistoricaSaldos && (
          <div style={{background:'#FFEBEE',border:'1px solid #EF9A9A',borderRadius:10,padding:'12px 16px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:'#C62828'}}>✏️ EDITANDO saldos históricos · {fmtFechaLarga(fechaConsulta)}</div>
              <div style={{fontSize:11,color:'#7F1D1D',marginTop:2}}>Los cambios afectan el histórico permanentemente. Termina la edición cuando hayas terminado.</div>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={() => setEdicionHistoricaSaldos(false)} style={{background:'#fff',border:`1px solid ${C.border}`,color:C.text,padding:'8px 14px',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                🔒 Terminar edición
              </button>
              <button onClick={() => { setEdicionHistoricaSaldos(false); setVerHistorico(null); }} style={{background:'#FF9800',color:'#fff',border:'none',padding:'8px 14px',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                ↶ Volver a Hoy
              </button>
            </div>
          </div>
        )}

        {cuentas.length === 0 ? (
          <div style={{textAlign:'center',padding:60,background:C.surface,border:`1px dashed ${C.border}`,borderRadius:14,color:C.muted}}>
            <div style={{fontSize:48,marginBottom:12}}>🏦</div>
            <div style={{fontSize:16,fontWeight:700,color:C.navy,marginBottom:6}}>No hay cuentas configuradas</div>
            <div style={{fontSize:13,marginBottom:14}}>Agrega tus cuentas bancarias para empezar a registrar saldos.</div>
            {!esConsulta && <button onClick={() => setShowCuentas(true)} style={btnStyle}>⚙️ Configurar cuentas</button>}
          </div>
        ) : verHistorico ? (
          /* MODO HISTÓRICO: si momento === null muestra ambos cuadros, si no solo el seleccionado.
             Cada cuadro va dentro de un wrapper flex (ref de captura) que incluye el chip
             del préstamo, para que las 3 opciones de "Copiar Imagen" lo incluyan. */
          momentoConsulta === null ? (
            <div ref={refAmbos} style={{display:'flex',flexDirection:'column',gap:24,alignItems:'center'}}>
              <div ref={refInicio} style={{display:'flex',gap:16,alignItems:'flex-start',justifyContent:'center',flexWrap:'wrap',background:'#fff',padding:8}}>
                <CuadroSaldos momento="inicio"/>
                <ChipPrestamo/>
              </div>
              <div ref={refCierre} style={{display:'flex',gap:16,alignItems:'flex-start',justifyContent:'center',flexWrap:'wrap',background:'#fff',padding:8}}>
                <CuadroSaldos momento="cierre"/>
                <ChipPrestamo/>
              </div>
            </div>
          ) : (
            <div ref={refAmbos} style={{display:'flex',gap:16,alignItems:'flex-start',justifyContent:'center',flexWrap:'wrap',background:'#fff',padding:8}}>
              <CuadroSaldos momento={momentoConsulta} innerRef={momentoConsulta==='cierre'?refCierre:refInicio}/>
              <ChipPrestamo/>
            </div>
          )
        ) : (
          /* MODO HOY: chip al lado de CADA cuadro; refAmbos engloba todo. */
          <div ref={refAmbos} style={{display:'flex',flexDirection:'column',gap:24,alignItems:'center'}}>
            <div ref={refInicio} style={{display:'flex',gap:16,alignItems:'flex-start',justifyContent:'center',flexWrap:'wrap',background:'#fff',padding:8}}>
              <CuadroSaldos momento="inicio"/>
              <ChipPrestamo/>
            </div>
            <div ref={refCierre} style={{display:'flex',gap:16,alignItems:'flex-start',justifyContent:'center',flexWrap:'wrap',background:'#fff',padding:8}}>
              <CuadroSaldos momento="cierre"/>
              <ChipPrestamo/>
            </div>
          </div>
        )}

        {/* MODAL: Selección de qué imagen copiar */}
        {showCopiarMenu && (
          <div onClick={() => setShowCopiarMenu(false)} style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(31,41,55,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:20}}>
            <div onClick={(e) => e.stopPropagation()} style={{background:'#fff',borderRadius:14,padding:24,maxWidth:480,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:18,paddingBottom:12,borderBottom:`1px solid ${C.border}`}}>
                <div>
                  <h3 style={{fontSize:16,fontWeight:800,color:C.navy,margin:0}}>📸 ¿Qué imagen quieres copiar?</h3>
                  <p style={{fontSize:11,color:C.muted,margin:'4px 0 0'}}>Selecciona qué cuadro enviar</p>
                </div>
                <button onClick={() => setShowCopiarMenu(false)} style={{background:'transparent',border:'none',fontSize:22,cursor:'pointer',color:C.muted,padding:0,lineHeight:1}}>×</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {!verHistorico && (<>
                  <button onClick={copiarSoloInicio} style={{background:'#fff',border:`2px solid ${C.navy}`,padding:'14px 16px',borderRadius:10,fontSize:13,color:C.navy,fontWeight:700,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit'}}>
                    <div style={{width:36,height:36,background:C.navy,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:18,flexShrink:0}}>🌅</div>
                    <div><div>Solo INICIO de día</div><div style={{fontSize:10,fontWeight:500,color:C.muted,marginTop:2}}>Cuadro azul · 1 imagen</div></div>
                  </button>
                  <button onClick={copiarSoloCierre} style={{background:'#fff',border:'2px solid #1B5E20',padding:'14px 16px',borderRadius:10,fontSize:13,color:'#1B5E20',fontWeight:700,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit'}}>
                    <div style={{width:36,height:36,background:'#1B5E20',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:18,flexShrink:0}}>🌙</div>
                    <div><div>Solo CIERRE de día</div><div style={{fontSize:10,fontWeight:500,color:C.muted,marginTop:2}}>Cuadro verde · 1 imagen</div></div>
                  </button>
                  <button onClick={copiarAmbos} style={{background:'#F3F4F6',border:'2px solid #6B7280',padding:'14px 16px',borderRadius:10,fontSize:13,color:'#1F2937',fontWeight:700,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit'}}>
                    <div style={{width:36,height:36,background:'#1F2937',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:18,flexShrink:0}}>📊</div>
                    <div><div>Ambos (Inicio + Cierre)</div><div style={{fontSize:10,fontWeight:500,color:C.muted,marginTop:2}}>Comparativa del día completo · 1 imagen larga</div></div>
                  </button>
                </>)}
                {verHistorico && momentoConsulta === null && (<>
                  <button onClick={copiarSoloInicio} style={{background:'#fff',border:`2px solid ${C.navy}`,padding:'14px 16px',borderRadius:10,fontSize:13,color:C.navy,fontWeight:700,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit'}}>
                    <div style={{width:36,height:36,background:C.navy,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:18,flexShrink:0}}>🌅</div>
                    <div><div>Solo INICIO de día</div><div style={{fontSize:10,fontWeight:500,color:C.muted,marginTop:2}}>Cuadro azul · 1 imagen</div></div>
                  </button>
                  <button onClick={copiarSoloCierre} style={{background:'#fff',border:'2px solid #1B5E20',padding:'14px 16px',borderRadius:10,fontSize:13,color:'#1B5E20',fontWeight:700,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit'}}>
                    <div style={{width:36,height:36,background:'#1B5E20',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:18,flexShrink:0}}>🌙</div>
                    <div><div>Solo CIERRE de día</div><div style={{fontSize:10,fontWeight:500,color:C.muted,marginTop:2}}>Cuadro verde · 1 imagen</div></div>
                  </button>
                  <button onClick={copiarAmbos} style={{background:'#F3F4F6',border:'2px solid #6B7280',padding:'14px 16px',borderRadius:10,fontSize:13,color:'#1F2937',fontWeight:700,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit'}}>
                    <div style={{width:36,height:36,background:'#1F2937',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:18,flexShrink:0}}>📊</div>
                    <div><div>Ambos (Inicio + Cierre)</div><div style={{fontSize:10,fontWeight:500,color:C.muted,marginTop:2}}>Comparativa del día completo · 1 imagen larga</div></div>
                  </button>
                </>)}
                {verHistorico && momentoConsulta !== null && (
                  <button onClick={momentoConsulta==='cierre'?copiarSoloCierre:copiarSoloInicio} style={{background:'#fff',border:`2px solid ${tema(momentoConsulta).primario}`,padding:'14px 16px',borderRadius:10,fontSize:13,color:tema(momentoConsulta).primario,fontWeight:700,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,fontFamily:'inherit'}}>
                    <div style={{width:36,height:36,background:tema(momentoConsulta).primario,borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:18,flexShrink:0}}>{momentoConsulta==='cierre'?'🌙':'🌅'}</div>
                    <div><div>Copiar este cuadro</div><div style={{fontSize:10,fontWeight:500,color:C.muted,marginTop:2}}>{momentoConsulta==='cierre'?'CIERRE':'INICIO'} de día · 1 imagen</div></div>
                  </button>
                )}
              </div>
              <div style={{marginTop:14,padding:10,background:'#F0F4FF',borderRadius:8,fontSize:10,color:C.navy}}>
                💡 La imagen se copia al portapapeles. Pégala con <strong>Ctrl+V</strong> en WhatsApp, Teams o correo.
              </div>
            </div>
          </div>
        )}

        {showCuentas && <ModalCuentas onClose={() => { setShowCuentas(false); recargar(); }} />}
        {showPendientes && <ModalPendientes onClose={() => { setShowPendientes(false); recargar(); }} cuentas={cuentas} saldosHoy={getSaldosByMomento(pendientesMomento)} fechaHoy={fechaConsulta} momento={pendientesMomento} temaPrimario={tema(pendientesMomento).primario} />}
        {showHistorico && <ModalHistorico onClose={() => setShowHistorico(false)} onSelectFecha={(f, m) => {
          if (f === null) {
            // Volver a hoy
            setVerHistorico(null);
          } else {
            // Mostrar la fecha seleccionada (con momento si vino, o ambos cuadros si momento=null)
            setVerHistorico({fecha: f, momento: m});
          }
          setShowHistorico(false);
        }} />}

        {/* MODAL: Nuevo/editar movimiento de préstamo, o crear préstamo */}
        {showPrestamoMov && (() => {
          const isCrearPrestamo = showPrestamoMov.tipo === 'crear-prestamo';
          const isEditarMov = !!showPrestamoMov.mov;
          const movDefault = showPrestamoMov.mov || { tipo:'disposicion', fecha:today(), monto:'', concepto:'' };
          return (
            <PrestamoMovModal
              isCrearPrestamo={isCrearPrestamo}
              isEditarMov={isEditarMov}
              movDefault={movDefault}
              prestamo={prestamo}
              prestamoCalc={prestamoCalc}
              empresaId={empresaId}
              empresa={empresa}
              usuario={user}
              onClose={() => setShowPrestamoMov(null)}
              onSaved={async () => { setShowPrestamoMov(null); await recargar(); }}
            />
          );
        })()}

        {/* MODAL: Histórico de movimientos del préstamo */}
        {showPrestamoHist && prestamo && (
          <PrestamoHistoricoModal
            prestamo={prestamo}
            movimientos={prestamoMovs}
            prestamoCalc={prestamoCalc}
            esConsulta={esConsulta}
            usuario={user}
            onClose={() => setShowPrestamoHist(false)}
            onEditar={(mov) => { setShowPrestamoHist(false); setShowPrestamoMov({ tipo:mov.tipo, mov }); }}
            onBorrar={async (id) => {
              if (window.confirm('¿Borrar este movimiento? No se puede deshacer.')) {
                await deletePrestamoMovimiento(id);
                await recargarMovsPrestamo();
              }
            }}
            onNuevo={() => { setShowPrestamoHist(false); setShowPrestamoMov({ tipo:'disposicion', mov:null }); }}
          />
        )}
        
        {importarECModal?.open && (() => {
          const m = importarECModal;
          const setM = (patch) => setImportarECModal(prev => ({ ...prev, ...patch }));
          
          // Procesar archivo subido
          const handleArchivo = async (ev) => {
            const file = ev.target.files?.[0];
            if (!file) return;
            setM({ archivo: file, parseando: true, resultado: null });
            try {
              const buf = await file.arrayBuffer();
              const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
              const res = parsearEstadoCuenta(XLSX, wb, empresaId, fechaConsulta);
              if (res.errores.length > 0 && res.saldos.length === 0) {
                alert(`Error al procesar el archivo:\n\n${res.errores.join('\n')}`);
                setM({ parseando: false, archivo: null });
                return;
              }
              // Para cada saldo, encontrar la cuenta de la BD que matchea
              const saldosConCuenta = res.saldos.map(s => {
                const cuentaBD = cuentas.find(c => s.cuentaConfig.match(c));
                return {
                  ...s,
                  cuentaId: cuentaBD?.id || null,
                  cuentaInfo: cuentaBD ? `${cuentaBD.banco} (${cuentaBD.numeroCuenta || 's/n'})` : `${s.cuentaConfig.label} - NO ENCONTRADA EN BD`,
                  saldoActualBD: cuentaBD ? null : null, // se llena después
                };
              });
              setM({ parseando: false, resultado: { ...res, saldosConCuenta }, sobreescribir: new Set() });
            } catch (err) {
              console.error('Error procesando Excel:', err);
              alert('Error al procesar el archivo: ' + err.message);
              setM({ parseando: false, archivo: null });
            }
            ev.target.value = '';
          };
          
          // Aplicar todos los saldos seleccionados
          const aplicar = async () => {
            if (!m.resultado) return;
            const aGuardarRaw = m.resultado.saldosConCuenta.filter(s => s.cuentaId !== null);
            if (aGuardarRaw.length === 0) { alert('No hay saldos para guardar.'); return; }
            
            // DEDUP: si para la misma (cuentaId, fecha) hay varios saldos
            // (ejemplo: hojas ENE/FEB/MAR USD BNMX todas dan fallback INICIAL al mismo día),
            // preferimos: (1) los que NO son INICIAL, (2) el de la hoja más reciente.
            const dedupMap = new Map(); // key = `${cuentaId}_${fecha}` → saldo
            const ordenMes = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC','INVERSION'];
            const scoreHoja = (hoja) => {
              const hojaUp = hoja.toUpperCase();
              for (let i = ordenMes.length - 1; i >= 0; i--) {
                if (hojaUp.includes(ordenMes[i])) return i;
              }
              return -1;
            };
            for (const s of aGuardarRaw) {
              const key = `${s.cuentaId}_${s.fecha}`;
              const prev = dedupMap.get(key);
              if (!prev) { dedupMap.set(key, s); continue; }
              // Preferir el que NO es INICIAL
              if (prev.esInicial && !s.esInicial) { dedupMap.set(key, s); continue; }
              if (!prev.esInicial && s.esInicial) continue;
              // Ambos del mismo tipo → preferir hoja del mes más reciente
              if (scoreHoja(s.hojaOrigen) > scoreHoja(prev.hojaOrigen)) dedupMap.set(key, s);
            }
            const aGuardar = Array.from(dedupMap.values());
            
            setM({ guardando: true });
            let guardados = 0, errores = 0;
            for (const s of aGuardar) {
              const cuenta = cuentas.find(c => c.id === s.cuentaId);
              if (!cuenta) { errores++; continue; }
              const pendActual = (s.fecha === fechaConsulta ? movsPend(cuenta.id, 'cierre') : 0); // mantener pendientes existentes para hoy
              const ok = await upsertSaldoDiario({
                cuentaId: cuenta.id, empresaId, fecha: s.fecha, momento: 'cierre',
                saldoReal: s.saldo, movsPendientes: pendActual,
              }, user?.nombre || 'desconocido');
              if (ok) guardados++; else errores++;
            }
            // Recargar saldos del día actual
            await recargar();
            setM({ guardando: false });
            alert(`✅ Se importaron ${guardados} saldo${guardados === 1 ? '' : 's'} de cierre.${errores > 0 ? `\n⚠️ ${errores} con error.` : ''}`);
            setImportarECModal(null);
          };
          
          // Agrupar saldos por cuenta para vista previa
          const saldosPorCuenta = (m.resultado?.saldosConCuenta || []).reduce((acc, s) => {
            const k = s.cuentaConfig.label;
            if (!acc[k]) acc[k] = { config: s.cuentaConfig, cuentaInfo: s.cuentaInfo, cuentaId: s.cuentaId, items: [] };
            acc[k].items.push(s);
            return acc;
          }, {});
          // Ordenar items de cada cuenta por fecha desc
          Object.values(saldosPorCuenta).forEach(g => g.items.sort((a, b) => b.fecha.localeCompare(a.fecha)));
          
          const totalSaldos = m.resultado?.saldos.length || 0;
          const totalSinCuenta = (m.resultado?.saldosConCuenta || []).filter(s => !s.cuentaId).length;
          
          return (
            <div onClick={(e) => { if (e.target === e.currentTarget) setImportarECModal(null); }}
              style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:14}}>
              <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:m.resultado ? 900 : 600,maxHeight:'92vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}}>
                <div style={{padding:'16px 22px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center',background:'#E3F2FD'}}>
                  <div>
                    <h3 style={{margin:0,fontSize:16,fontWeight:800,color:'#0D47A1'}}>📥 Importar Saldos del Estado de Cuenta</h3>
                    <p style={{margin:'2px 0 0',fontSize:12,color:'#1565C0'}}>{empresa.nombre} · Solo se importan saldos de CIERRE</p>
                  </div>
                  <button onClick={() => setImportarECModal(null)} style={{background:'transparent',border:'none',fontSize:22,cursor:'pointer',color:'#666'}}>×</button>
                </div>
                
                <div style={{overflow:'auto',padding:18,flex:1}}>
                  {!m.resultado ? (
                    <>
                      <div style={{background:'#FFFDE7',border:'1px solid #FFE082',borderRadius:8,padding:'12px 14px',marginBottom:16,fontSize:12,color:'#5D4037'}}>
                        <div style={{fontWeight:700,marginBottom:6,color:'#E65100'}}>📋 ¿Cómo funciona?</div>
                        <div style={{lineHeight:1.6}}>
                          1. Sube el Excel del estado de cuenta del banco<br/>
                          2. La app detecta automáticamente cada hoja → cuenta correspondiente<br/>
                          3. Por cada hoja, extrae el <b>saldo final de cada día</b> (última fila)<br/>
                          4. Vista previa para que confirmes antes de guardar<br/>
                          5. Solo se actualiza el saldo de <b>CIERRE</b>; el inicio se hereda automáticamente
                        </div>
                      </div>
                      
                      {m.parseando ? (
                        <div style={{textAlign:'center',padding:40,color:'#1976D2',fontSize:14}}>
                          ⏳ Procesando archivo...
                        </div>
                      ) : (
                        <label style={{background:'#E3F2FD',border:'2px dashed #1976D2',borderRadius:10,padding:'30px 20px',textAlign:'center',cursor:'pointer',display:'block'}}>
                          <div style={{fontSize:42,marginBottom:8}}>📁</div>
                          <div style={{fontSize:14,fontWeight:700,color:'#0D47A1',marginBottom:4}}>Subir archivo Excel</div>
                          <div style={{fontSize:11,color:'#1565C0'}}>.xlsx · clic aquí para seleccionar</div>
                          <input type="file" accept=".xlsx,.xls" onChange={handleArchivo} style={{display:'none'}}/>
                        </label>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:8}}>
                        <div style={{fontSize:13,fontWeight:700,color:C.navy}}>
                          📊 Vista previa · {totalSaldos} saldo{totalSaldos === 1 ? '' : 's'} detectado{totalSaldos === 1 ? '' : 's'}
                        </div>
                        <div style={{fontSize:11,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                          <span style={{background:'#E8F5E9',color:'#1B5E20',padding:'2px 8px',borderRadius:6,fontWeight:700}}>✅ {totalSaldos - totalSinCuenta} listos</span>
                          {totalSinCuenta > 0 && <span style={{background:'#FFEBEE',color:'#C62828',padding:'2px 8px',borderRadius:6,fontWeight:700}}>⚠ {totalSinCuenta} sin cuenta</span>}
                          <button onClick={() => setM({ resultado: null, archivo: null })} style={{background:'transparent',border:'none',color:'#1976D2',cursor:'pointer',fontSize:11,fontWeight:600}}>← Subir otro archivo</button>
                        </div>
                      </div>
                      
                      {m.resultado.errores.length > 0 && (
                        <div style={{background:'#FFEBEE',border:'1px solid #EF9A9A',borderRadius:8,padding:'10px 14px',marginBottom:12,fontSize:12,color:'#C62828'}}>
                          ⚠️ {m.resultado.errores.join(' · ')}
                        </div>
                      )}
                      
                      {m.resultado.hojasNoMapeadas.length > 0 && (
                        <div style={{background:'#FFF3E0',border:'1px solid #FFB74D',borderRadius:8,padding:'10px 14px',marginBottom:12,fontSize:11,color:'#E65100'}}>
                          ℹ️ Hojas ignoradas: {m.resultado.hojasNoMapeadas.join(', ')}
                        </div>
                      )}
                      
                      {/* Tabla agrupada por cuenta */}
                      {Object.entries(saldosPorCuenta).map(([label, g]) => {
                        const sinCuenta = !g.cuentaId;
                        const sym = g.config.match.toString().includes('USD') || (cuentas.find(c => c.id === g.cuentaId)?.moneda === 'USD') ? '$' : '$';
                        return (
                          <div key={label} style={{border:`1px solid ${sinCuenta ? '#EF9A9A' : C.border}`,borderRadius:8,marginBottom:12,overflow:'hidden'}}>
                            <div style={{background: sinCuenta ? '#FFEBEE' : '#F8FAFC', padding:'10px 14px', borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                              <div>
                                <div style={{fontSize:13,fontWeight:800,color: sinCuenta ? '#C62828' : C.navy}}>
                                  {sinCuenta ? '⚠️' : '✅'} {g.config.label}
                                </div>
                                <div style={{fontSize:11,color:C.muted,marginTop:2}}>{g.cuentaInfo}</div>
                              </div>
                              <div style={{fontSize:11,color:C.muted}}>{g.items.length} día{g.items.length === 1 ? '' : 's'}</div>
                            </div>
                            {!sinCuenta && (
                              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                                <thead>
                                  <tr style={{background:'#FAFBFC',borderBottom:`1px solid ${C.border}`}}>
                                    <th style={{padding:'6px 14px',textAlign:'left',color:C.muted,fontWeight:700,fontSize:10,textTransform:'uppercase'}}>Fecha</th>
                                    <th style={{padding:'6px 14px',textAlign:'right',color:C.muted,fontWeight:700,fontSize:10,textTransform:'uppercase'}}>Saldo final</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {g.items.map((it, idx) => (
                                    <tr key={`${it.fecha}_${idx}`} style={{borderBottom:`1px solid ${C.border}`}}>
                                      <td style={{padding:'6px 14px',whiteSpace:'nowrap',color:C.text}}>
                                        {it.fecha}
                                        {it.esInicial && <span style={{marginLeft:6,background:'#FFF3E0',color:'#E65100',padding:'1px 6px',borderRadius:4,fontSize:9,fontWeight:700}} title="Saldo inicial (sin movimientos en esta hoja)">INICIAL</span>}
                                      </td>
                                      <td style={{padding:'6px 14px',textAlign:'right',fontFamily:'monospace',fontWeight:700,color:C.navy}}>
                                        ${(+it.saldo).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        );
                      })}
                      
                      {totalSinCuenta > 0 && (
                        <div style={{background:'#FFFDE7',border:'1px solid #FFE082',borderRadius:8,padding:'10px 14px',marginTop:8,fontSize:11,color:'#5D4037'}}>
                          💡 Los saldos sin cuenta se omitirán. Verifica que las cuentas existan en ⚙️ Cuentas.
                        </div>
                      )}
                    </>
                  )}
                </div>
                
                {m.resultado && (
                  <div style={{padding:'12px 22px',borderTop:`1px solid ${C.border}`,display:'flex',justifyContent:'flex-end',gap:10}}>
                    <button onClick={() => setImportarECModal(null)} disabled={m.guardando} style={{background:'#F1F5F9',color:'#374151',border:'none',padding:'10px 20px',borderRadius:8,fontSize:13,fontWeight:700,cursor:m.guardando?'not-allowed':'pointer',fontFamily:'inherit'}}>Cancelar</button>
                    <button onClick={aplicar} disabled={m.guardando || (totalSaldos - totalSinCuenta) === 0} style={{background:m.guardando||(totalSaldos-totalSinCuenta)===0?'#B0BEC5':'#1B5E20',color:'#fff',border:'none',padding:'10px 20px',borderRadius:8,fontSize:13,fontWeight:700,cursor:m.guardando||(totalSaldos-totalSinCuenta)===0?'not-allowed':'pointer',fontFamily:'inherit'}}>
                      {m.guardando ? '⏳ Guardando...' : `💾 Aplicar ${totalSaldos - totalSinCuenta} saldo${(totalSaldos-totalSinCuenta)===1?'':'s'}`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  /* ── MODAL: Gestión de Cuentas ──────────────────────────────────────── */
  const ModalCuentas = ({ onClose }) => {
    const [cuentas, setCuentas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [nueva, setNueva] = useState({ banco:'', numeroCuenta:'', tipo:'corriente', moneda:'MXN', reservaMinima:'' });
    const [editId, setEditId] = useState(null);
    const [editForm, setEditForm] = useState({});
    
    const cargar = async () => {
      setLoading(true);
      const c = await fetchCuentasBancarias(empresaId);
      setCuentas(c);
      setLoading(false);
    };
    useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

    const agregar = async () => {
      if (!nueva.banco.trim()) { alert('El banco es requerido'); return; }
      await upsertCuentaBancaria({
        empresaId,
        banco: nueva.banco.trim(),
        numeroCuenta: nueva.numeroCuenta.trim(),
        tipo: nueva.tipo,
        moneda: nueva.moneda,
        reservaMinima: parseFloat(nueva.reservaMinima) || 0,
        orden: cuentas.length,
      });
      setNueva({ banco:'', numeroCuenta:'', tipo:'corriente', moneda:'MXN', reservaMinima:'' });
      cargar();
    };
    
    const guardarEdit = async () => {
      await upsertCuentaBancaria({
        ...editForm,
        empresaId,
        reservaMinima: parseFloat(editForm.reservaMinima) || 0,
      });
      setEditId(null);
      cargar();
    };

    const eliminar = async (c) => {
      if (!confirm(`¿Eliminar la cuenta ${c.banco} ${c.moneda}? El histórico se conservará pero la cuenta no se podrá usar más.`)) return;
      await deleteCuentaBancaria(c.id);
      cargar();
    };

    return (
      <div onClick={onClose} style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(31,41,55,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:20}}>
        <div onClick={(e) => e.stopPropagation()} style={{background:'#fff',borderRadius:14,padding:24,maxWidth:760,width:'100%',maxHeight:'90vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:18,paddingBottom:14,borderBottom:`1px solid ${C.border}`}}>
            <div>
              <h3 style={{fontSize:17,fontWeight:800,color:C.navy,margin:0}}>⚙️ Gestión de Cuentas Bancarias</h3>
              <p style={{fontSize:12,color:C.muted,margin:'4px 0 0'}}>{empresa.nombre} · La reserva mínima se descuenta automáticamente del disponible</p>
            </div>
            <button onClick={onClose} style={{background:'transparent',border:'none',fontSize:24,cursor:'pointer',color:C.muted,padding:0,lineHeight:1}}>×</button>
          </div>

          {loading ? <div style={{textAlign:'center',padding:30,color:C.muted}}>Cargando...</div> : (
            <>
              {cuentas.length === 0 ? (
                <div style={{textAlign:'center',padding:30,color:C.muted,fontSize:13}}>No hay cuentas. Agrega la primera abajo.</div>
              ) : (
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,marginBottom:16}}>
                  <thead>
                    <tr style={{background:'#F3F4F6'}}>
                      <th style={{padding:8,textAlign:'left',fontWeight:700,color:C.navy,fontSize:11,textTransform:'uppercase'}}>Banco</th>
                      <th style={{padding:8,textAlign:'left',fontWeight:700,color:C.navy,fontSize:11,textTransform:'uppercase'}}>Cuenta</th>
                      <th style={{padding:8,textAlign:'left',fontWeight:700,color:C.navy,fontSize:11,textTransform:'uppercase'}}>Tipo</th>
                      <th style={{padding:8,textAlign:'center',fontWeight:700,color:C.navy,fontSize:11,textTransform:'uppercase'}}>Moneda</th>
                      <th style={{padding:8,textAlign:'right',fontWeight:700,color:C.navy,fontSize:11,textTransform:'uppercase'}}>Reserva</th>
                      <th style={{padding:8,textAlign:'center',fontWeight:700,color:C.navy,fontSize:11,textTransform:'uppercase'}}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentas.map(c => editId === c.id ? (
                      <tr key={c.id} style={{background:'#F0F4FF'}}>
                        <td style={{padding:6}}><input value={editForm.banco||''} onChange={(e) => setEditForm(f => ({...f, banco:e.target.value}))} style={{width:'100%',padding:'4px 6px',border:`1px solid ${C.border}`,borderRadius:5,fontSize:12,fontFamily:'inherit'}}/></td>
                        <td style={{padding:6}}><input value={editForm.numeroCuenta||''} onChange={(e) => setEditForm(f => ({...f, numeroCuenta:e.target.value}))} style={{width:'100%',padding:'4px 6px',border:`1px solid ${C.border}`,borderRadius:5,fontSize:12,fontFamily:'monospace'}}/></td>
                        <td style={{padding:6}}><select value={editForm.tipo||'corriente'} onChange={(e) => setEditForm(f => ({...f, tipo:e.target.value}))} style={{width:'100%',padding:'4px 6px',border:`1px solid ${C.border}`,borderRadius:5,fontSize:12,fontFamily:'inherit'}}><option value="corriente">Cuenta corriente</option><option value="inversion">Inversión</option></select></td>
                        <td style={{padding:6}}><select value={editForm.moneda||'MXN'} onChange={(e) => setEditForm(f => ({...f, moneda:e.target.value}))} style={{width:'100%',padding:'4px 6px',border:`1px solid ${C.border}`,borderRadius:5,fontSize:12,fontFamily:'inherit'}}><option>MXN</option><option>USD</option><option>EUR</option></select></td>
                        <td style={{padding:6}}><input value={editForm.reservaMinima||''} onChange={(e) => setEditForm(f => ({...f, reservaMinima:e.target.value.replace(/[^\d.]/g,'')}))} style={{width:'100%',padding:'4px 6px',border:`1px solid ${C.border}`,borderRadius:5,fontSize:12,textAlign:'right',fontFamily:'monospace'}}/></td>
                        <td style={{padding:6,textAlign:'center'}}>
                          <button onClick={guardarEdit} style={{background:C.navy,color:'#fff',border:'none',padding:'4px 10px',borderRadius:5,fontSize:11,marginRight:4,cursor:'pointer',fontFamily:'inherit'}}>✓</button>
                          <button onClick={() => setEditId(null)} style={{background:'#F3F4F6',color:C.text,border:'none',padding:'4px 10px',borderRadius:5,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>×</button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={c.id} style={{borderBottom:`1px solid ${C.border}`}}>
                        <td style={{padding:8,fontWeight:600}}>{c.banco}</td>
                        <td style={{padding:8,fontFamily:'monospace',color:'#555'}}>{c.numeroCuenta || '—'}</td>
                        <td style={{padding:8}}>{c.tipo === 'inversion' ? <span style={{background:'#FFF3E0',color:'#E65100',padding:'2px 6px',borderRadius:4,fontSize:10,fontWeight:700}}>Inversión</span> : 'Cuenta corriente'}</td>
                        <td style={{padding:8,textAlign:'center'}}><span style={{background:{MXN:'#E3F2FD',USD:'#E8F5E9',EUR:'#F3E5F5'}[c.moneda],color:{MXN:'#1565C0',USD:'#2E7D32',EUR:'#6A1B9A'}[c.moneda],padding:'2px 8px',borderRadius:10,fontSize:10,fontWeight:700}}>{c.moneda}</span></td>
                        <td style={{padding:8,textAlign:'right',color:c.reservaMinima > 0 ? C.navy : '#888',fontWeight:c.reservaMinima > 0 ? 700 : 400,fontFamily:'monospace'}}>${fmt(c.reservaMinima)}</td>
                        <td style={{padding:8,textAlign:'center'}}>
                          <button onClick={() => { setEditId(c.id); setEditForm({...c, reservaMinima:String(c.reservaMinima || '')}); }} title="Editar" style={{background:'transparent',border:'none',cursor:'pointer',fontSize:13,marginRight:4}}>✏️</button>
                          <button onClick={() => eliminar(c)} title="Eliminar" style={{background:'transparent',border:'none',cursor:'pointer',fontSize:13}}>🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div style={{background:'#F0F4FF',border:`1px dashed ${C.navy}`,borderRadius:10,padding:14}}>
                <div style={{fontSize:12,fontWeight:700,color:C.navy,marginBottom:10}}>+ Agregar nueva cuenta</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 80px 100px auto',gap:6,alignItems:'center'}}>
                  <input placeholder="Banco" value={nueva.banco} onChange={(e) => setNueva(n => ({...n, banco:e.target.value}))} style={{padding:'6px 8px',border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:'inherit'}}/>
                  <input placeholder="Núm. cuenta" value={nueva.numeroCuenta} onChange={(e) => setNueva(n => ({...n, numeroCuenta:e.target.value}))} style={{padding:'6px 8px',border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:'monospace'}}/>
                  <select value={nueva.tipo} onChange={(e) => setNueva(n => ({...n, tipo:e.target.value}))} style={{padding:'6px 8px',border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:'inherit'}}>
                    <option value="corriente">Cuenta corriente</option>
                    <option value="inversion">Inversión</option>
                  </select>
                  <select value={nueva.moneda} onChange={(e) => setNueva(n => ({...n, moneda:e.target.value}))} style={{padding:'6px 8px',border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,fontFamily:'inherit'}}>
                    <option>MXN</option><option>USD</option><option>EUR</option>
                  </select>
                  <input placeholder="Reserva" value={nueva.reservaMinima} onChange={(e) => setNueva(n => ({...n, reservaMinima:e.target.value.replace(/[^\d.]/g,'')}))} style={{padding:'6px 8px',border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,textAlign:'right',fontFamily:'monospace'}}/>
                  <button onClick={agregar} style={{background:C.navy,color:'#fff',border:'none',padding:'7px 14px',borderRadius:6,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Agregar</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  /* ── MODAL: Movimientos Pendientes ──────────────────────────────────── */
  const ModalPendientes = ({ onClose, cuentas, saldosHoy, fechaHoy, momento, temaPrimario }) => {
    const [pendientes, setPendientes] = useState({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
      const map = {};
      cuentas.forEach(c => {
        map[c.id] = String(saldosHoy[c.id]?.movsPendientes || 0);
      });
      setPendientes(map);
    }, [cuentas, saldosHoy]);

    const calcDisp = (c) => {
      const real = saldosHoy[c.id]?.saldoReal || 0;
      const reserva = +c.reservaMinima || 0;
      const pend = parseFloat(pendientes[c.id]) || 0;
      return Math.max(0, real - reserva - pend);
    };

    const guardar = async () => {
      setSaving(true);
      for (const c of cuentas) {
        const real = saldosHoy[c.id]?.saldoReal || 0;
        const pendNuevo = parseFloat(pendientes[c.id]) || 0;
        const pendActual = saldosHoy[c.id]?.movsPendientes || 0;
        if (pendNuevo !== pendActual) {
          await upsertSaldoDiario({
            cuentaId: c.id, empresaId, fecha: fechaHoy, momento,
            saldoReal: real, movsPendientes: pendNuevo,
          }, user?.nombre || 'desconocido');
        }
      }
      setSaving(false);
      onClose();
    };

    const sym = (m) => m === 'EUR' ? '€' : '$';
    const colorTema = temaPrimario || C.navy;

    return (
      <div onClick={onClose} style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(31,41,55,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:20}}>
        <div onClick={(e) => e.stopPropagation()} style={{background:'#fff',borderRadius:14,padding:24,maxWidth:720,width:'100%',maxHeight:'90vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:18,paddingBottom:14,borderBottom:`1px solid ${C.border}`}}>
            <div>
              <h3 style={{fontSize:17,fontWeight:800,color:colorTema,margin:0}}>⚡ Movimientos Pendientes · {momento==='cierre'?'CIERRE':'INICIO'} DE DÍA</h3>
              <p style={{fontSize:12,color:C.muted,margin:'4px 0 0'}}>Captura cheques en tránsito, transferencias en proceso, etc. Se descuentan del disponible. Los pendientes se guardan por separado para inicio y cierre del día.</p>
            </div>
            <button onClick={onClose} style={{background:'transparent',border:'none',fontSize:24,cursor:'pointer',color:C.muted,padding:0,lineHeight:1}}>×</button>
          </div>

          {cuentas.length === 0 ? (
            <div style={{textAlign:'center',padding:30,color:C.muted,fontSize:13}}>No hay cuentas configuradas.</div>
          ) : (
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,marginBottom:14}}>
              <thead>
                <tr style={{background:'#F3F4F6'}}>
                  <th style={{padding:8,textAlign:'left',fontWeight:700,color:C.navy,fontSize:11,textTransform:'uppercase'}}>Cuenta</th>
                  <th style={{padding:8,textAlign:'right',fontWeight:700,color:C.navy,fontSize:11,textTransform:'uppercase'}}>Saldo Real</th>
                  <th style={{padding:8,textAlign:'right',fontWeight:700,color:C.navy,fontSize:11,textTransform:'uppercase'}}>Reserva</th>
                  <th style={{padding:8,textAlign:'right',fontWeight:700,color:C.navy,fontSize:11,textTransform:'uppercase'}}>Pendientes</th>
                  <th style={{padding:8,textAlign:'right',fontWeight:700,color:C.navy,fontSize:11,textTransform:'uppercase'}}>Disponible</th>
                </tr>
              </thead>
              <tbody>
                {cuentas.map(c => (
                  <tr key={c.id} style={{borderBottom:`1px solid ${C.border}`}}>
                    <td style={{padding:'10px 8px'}}>
                      <div style={{fontWeight:700,color:'#1F2937'}}>{c.banco} {c.tipo === 'inversion' ? '(Inv.)' : c.moneda}</div>
                      <div style={{fontSize:10,color:'#888',fontFamily:'monospace'}}>{c.tipo === 'inversion' ? 'Inversión' : `CTA. ${c.numeroCuenta || '—'}`}</div>
                    </td>
                    <td style={{padding:'10px 8px',textAlign:'right',color:'#555',fontFamily:'monospace'}}>{sym(c.moneda)}{fmt(saldosHoy[c.id]?.saldoReal || 0)}</td>
                    <td style={{padding:'10px 8px',textAlign:'right',color:c.reservaMinima > 0 ? colorTema : '#888',fontFamily:'monospace',fontWeight:c.reservaMinima > 0 ? 700 : 400}}>{sym(c.moneda)}{fmt(c.reservaMinima)}</td>
                    <td style={{padding:'10px 8px',textAlign:'right'}}>
                      <input
                        value={pendientes[c.id] || ''}
                        onChange={(e) => setPendientes(p => ({...p, [c.id]: e.target.value.replace(/[^\d.\-]/g,'')}))}
                        style={{border:`1px solid ${C.border}`,borderRadius:5,padding:'4px 8px',fontSize:12,textAlign:'right',width:95,fontFamily:'monospace'}}
                        placeholder="0.00"
                      />
                    </td>
                    <td style={{padding:'10px 8px',textAlign:'right',fontWeight:800,color:colorTema,fontFamily:'monospace'}}>{sym(c.moneda)}{fmt(calcDisp(c))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <div style={{fontSize:11,color:C.muted}}>Los pendientes se guardan por día. Mañana se inicializan en 0.</div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={onClose} style={{background:'#fff',border:`1px solid ${C.border}`,padding:'8px 16px',borderRadius:8,fontSize:12,color:C.text,cursor:'pointer',fontFamily:'inherit'}}>Cancelar</button>
              <button onClick={guardar} disabled={saving} style={{background:colorTema,color:'#fff',border:'none',padding:'8px 18px',borderRadius:8,fontSize:12,fontWeight:700,cursor:saving?'not-allowed':'pointer',opacity:saving?0.6:1,fontFamily:'inherit'}}>{saving ? 'Guardando...' : 'Guardar Cambios'}</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ── MODAL: Histórico ───────────────────────────────────────────────── */
  const ModalHistorico = ({ onClose, onSelectFecha }) => {
    const [fechas, setFechas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [periodo, setPeriodo] = useState(30);
    const [fechaLibre, setFechaLibre] = useState('');

    useEffect(() => {
      const cargar = async () => {
        setLoading(true);
        const desde = new Date();
        desde.setDate(desde.getDate() - periodo);
        const desdeStr = desde.toISOString().slice(0,10);
        const data = await fetchFechasHistoricoSaldos(empresaId, desdeStr);
        setFechas(data);
        setLoading(false);
      };
      cargar();
    }, [periodo]);

    const fmtFecha = (f) => {
      const d = new Date(f + 'T12:00:00');
      return d.toLocaleDateString('es-MX', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
    };
    const hoy = today();

    // Agrupar por fecha: {fecha: {momentos: ['inicio','cierre'], updatedByInicio, updatedByCierre}}
    const fechasAgrupadas = (() => {
      const map = new Map();
      fechas.forEach(f => {
        if (!map.has(f.fecha)) {
          map.set(f.fecha, { fecha: f.fecha, tieneInicio: false, tieneCierre: false, byInicio: null, byCierre: null });
        }
        const g = map.get(f.fecha);
        if (f.momento === 'inicio') { g.tieneInicio = true; g.byInicio = f.updatedBy; }
        if (f.momento === 'cierre') { g.tieneCierre = true; g.byCierre = f.updatedBy; }
      });
      // Orden descendente por fecha (más reciente primero)
      return Array.from(map.values()).sort((a, b) => b.fecha.localeCompare(a.fecha));
    })();

    const irAFechaLibre = () => {
      if (!fechaLibre) { alert('Selecciona una fecha primero.'); return; }
      // Si es hoy, cerrar modal (se vuelve al modo "hoy" normal)
      if (fechaLibre === hoy) {
        onSelectFecha(null, null); // null fecha = volver a hoy
        return;
      }
      // Pasar la fecha sin momento → se mostrarán ambos cuadros (inicio y cierre)
      onSelectFecha(fechaLibre, null);
    };

    return (
      <div onClick={onClose} style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(31,41,55,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:20}}>
        <div onClick={(e) => e.stopPropagation()} style={{background:'#fff',borderRadius:14,padding:24,maxWidth:600,width:'100%',maxHeight:'90vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:18,paddingBottom:14,borderBottom:`1px solid ${C.border}`}}>
            <div>
              <h3 style={{fontSize:17,fontWeight:800,color:C.navy,margin:0}}>📜 Histórico de Saldos</h3>
              <p style={{fontSize:12,color:C.muted,margin:'4px 0 0'}}>{empresa.nombre}</p>
            </div>
            <button onClick={onClose} style={{background:'transparent',border:'none',fontSize:24,cursor:'pointer',color:C.muted,padding:0,lineHeight:1}}>×</button>
          </div>

          {/* Selector de fecha libre — para ir a cualquier fecha (incluso sin captura) */}
          <div style={{background:'#E3F2FD',border:'1px solid #BBDEFB',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:'#0D47A1',marginBottom:8,letterSpacing:0.3,textTransform:'uppercase'}}>🔍 Ir a fecha específica</div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input type="date" value={fechaLibre} onChange={(e) => setFechaLibre(e.target.value)} max={hoy}
                style={{flex:1,padding:'7px 10px',border:`1px solid ${C.border}`,borderRadius:7,fontSize:13,fontFamily:'inherit',outline:'none'}}/>
              <button onClick={irAFechaLibre} disabled={!fechaLibre}
                style={{background:fechaLibre ? '#1976D2' : '#B0BEC5',color:'#fff',border:'none',padding:'7px 18px',borderRadius:7,fontSize:12,fontWeight:700,cursor:fechaLibre?'pointer':'not-allowed',fontFamily:'inherit',whiteSpace:'nowrap'}}>
                Ir →
              </button>
            </div>
            <div style={{fontSize:10,color:'#1565C0',marginTop:6,fontStyle:'italic'}}>
              💡 Útil para capturar saldos de días que no tienen registro previo (ej: 30/04, 02/05, etc.)
            </div>
          </div>

          <div style={{display:'flex',gap:6,marginBottom:14,alignItems:'center'}}>
            <span style={{fontSize:12,color:C.muted}}>O elige de los días ya capturados:</span>
            {[7, 30, 90].map(p => (
              <button key={p} onClick={() => setPeriodo(p)} style={{background:periodo===p?C.navy:'#fff',color:periodo===p?'#fff':C.text,border:`1px solid ${periodo===p?C.navy:C.border}`,padding:'4px 10px',borderRadius:6,fontSize:11,cursor:'pointer',fontWeight:600,fontFamily:'inherit'}}>{p} días</button>
            ))}
          </div>

          {loading ? <div style={{textAlign:'center',padding:30,color:C.muted}}>Cargando...</div> : fechasAgrupadas.length === 0 ? (
            <div style={{textAlign:'center',padding:30,color:C.muted,fontSize:13}}>No hay registros en este periodo.</div>
          ) : (
            <div style={{maxHeight:380,overflow:'auto'}}>
              {fechasAgrupadas.map(g => {
                const ambosCapturados = g.tieneInicio && g.tieneCierre;
                const colorTitulo = ambosCapturados ? '#1B5E20' : C.navy;
                return (
                  <button key={g.fecha} onClick={() => onSelectFecha(g.fecha, null)}
                    style={{width:'100%',display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',marginBottom:6,background:g.fecha===hoy?'#FAFAFA':'#FAFAFA',border:`1px solid ${C.border}`,borderRadius:8,cursor:'pointer',textAlign:'left',fontFamily:'inherit'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,flex:1}}>
                      {/* Chips de momentos capturados */}
                      <div style={{display:'flex',gap:4,flexShrink:0}}>
                        {g.tieneInicio && (
                          <span style={{background:'#E8EAF6',color:C.navy,padding:'4px 8px',borderRadius:6,fontSize:9,fontWeight:800,whiteSpace:'nowrap'}}>🌅 INI</span>
                        )}
                        {g.tieneCierre && (
                          <span style={{background:'#E8F5E9',color:'#1B5E20',padding:'4px 8px',borderRadius:6,fontSize:9,fontWeight:800,whiteSpace:'nowrap'}}>🌙 CIE</span>
                        )}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:700,color:colorTitulo,textTransform:'capitalize'}}>
                          {fmtFecha(g.fecha)}
                          {g.fecha === hoy && <span style={{marginLeft:8,background:colorTitulo,color:'#fff',padding:'2px 6px',borderRadius:4,fontSize:9,fontWeight:700}}>HOY</span>}
                        </div>
                        <div style={{fontSize:10,color:C.muted,marginTop:2}}>
                          {g.tieneInicio && g.tieneCierre
                            ? `Inicio: ${g.byInicio || '—'} · Cierre: ${g.byCierre || '—'}`
                            : g.tieneInicio
                              ? `Inicio: ${g.byInicio || '—'} · Cierre: pendiente`
                              : `Inicio: pendiente · Cierre: ${g.byCierre || '—'}`}
                        </div>
                      </div>
                    </div>
                    <div style={{fontSize:14,color:colorTitulo}}>👁</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════
  // MODAL: Nuevo / Editar movimiento de préstamo (o crear préstamo)
  // ═══════════════════════════════════════════════════════════════════
  const PrestamoMovModal = ({ isCrearPrestamo, isEditarMov, movDefault, prestamo, prestamoCalc, empresaId, empresa, usuario, onClose, onSaved }) => {
    // Si crear préstamo: campos del préstamo
    const [banco, setBanco] = useState('BANAMEX');
    const [numeroCuenta, setNumeroCuenta] = useState('');
    const [montoAutorizado, setMontoAutorizado] = useState('');
    const [fechaRecepcion, setFechaRecepcion] = useState(today());
    // Si movimiento: campos del movimiento
    const [tipoMov, setTipoMov] = useState(movDefault.tipo || 'disposicion');
    const [fechaMov, setFechaMov] = useState(movDefault.fecha || today());
    const [montoMov, setMontoMov] = useState(movDefault.monto !== '' && movDefault.monto != null ? String(movDefault.monto) : '');
    const [conceptoMov, setConceptoMov] = useState(movDefault.concepto || '');
    const [guardando, setGuardando] = useState(false);

    const parseMonto = (v) => parseFloat(String(v).replace(/[^\d.]/g, '')) || 0;

    // Preview del efecto del movimiento (solo cuando no es crear-prestamo)
    const previewEfecto = useMemo(() => {
      if (isCrearPrestamo || !prestamoCalc) return null;
      const monto = parseMonto(montoMov);
      let utilizadoNuevo = prestamoCalc.utilizado;
      if (isEditarMov) {
        // Si editamos, primero revertir el efecto del movimiento original
        if (movDefault.tipo === 'disposicion') utilizadoNuevo -= +movDefault.monto || 0;
        else if (movDefault.tipo === 'pago')   utilizadoNuevo += +movDefault.monto || 0;
      }
      if (tipoMov === 'disposicion') utilizadoNuevo += monto;
      else if (tipoMov === 'pago')   utilizadoNuevo -= monto;
      utilizadoNuevo = Math.max(0, utilizadoNuevo);
      const bloqueadoNuevo = Math.max(0, prestamoCalc.autorizado - utilizadoNuevo);
      return {
        utilizadoAntes: prestamoCalc.utilizado,
        utilizadoDespues: utilizadoNuevo,
        bloqueadoAntes: prestamoCalc.bloqueado,
        bloqueadoDespues: bloqueadoNuevo,
      };
    }, [montoMov, tipoMov, isCrearPrestamo, isEditarMov, prestamoCalc, movDefault]);

    const puedeGuardar = isCrearPrestamo
      ? (banco.trim() && parseMonto(montoAutorizado) > 0)
      : (parseMonto(montoMov) > 0);

    const handleGuardar = async () => {
      if (!puedeGuardar || guardando) return;
      setGuardando(true);
      try {
        if (isCrearPrestamo) {
          // Crear préstamo nuevo + movimiento "inicial" informativo
          const monto = parseMonto(montoAutorizado);
          const nuevoId = await upsertPrestamo({
            empresaId,
            banco: banco.trim(),
            numeroCuenta: numeroCuenta.trim() || null,
            montoAutorizado: monto,
            moneda: 'MXN',
            fechaRecepcion: fechaRecepcion || null,
            concepto: `Préstamo recibido de ${banco.trim()}`,
            activo: true,
          }, usuario?.nombre);
          if (nuevoId) {
            await upsertPrestamoMovimiento({
              prestamoId: nuevoId,
              empresaId,
              fecha: fechaRecepcion || today(),
              tipo: 'inicial',
              monto: monto,
              concepto: `Recepción de préstamo ${banco.trim()}`,
            }, usuario?.nombre);
          }
        } else {
          // Crear o editar movimiento
          await upsertPrestamoMovimiento({
            id: isEditarMov ? movDefault.id : undefined,
            prestamoId: prestamo.id,
            empresaId,
            fecha: fechaMov,
            tipo: tipoMov,
            monto: parseMonto(montoMov),
            concepto: conceptoMov.trim() || null,
          }, usuario?.nombre);
        }
        await onSaved();
      } catch (err) {
        console.error('guardar préstamo:', err);
        alert('No se pudo guardar. Revisa la consola.');
      } finally {
        setGuardando(false);
      }
    };

    return (
      <div onClick={onClose} style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(31,41,55,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:20,fontFamily:'"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',WebkitFontSmoothing:'antialiased',MozOsxFontSmoothing:'grayscale',textRendering:'optimizeLegibility'}}>
        <div onClick={(e) => e.stopPropagation()} style={{background:'#fff',borderRadius:14,padding:24,maxWidth:460,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16,paddingBottom:12,borderBottom:`1px solid ${C.border}`}}>
            <div>
              <h3 style={{fontSize:16,fontWeight:800,color:C.navy,margin:0}}>
                {isCrearPrestamo ? '💰 Registrar préstamo' : (isEditarMov ? '✎ Editar movimiento' : '+ Nuevo movimiento')}
              </h3>
              <p style={{fontSize:11,color:C.muted,margin:'4px 0 0'}}>
                {isCrearPrestamo ? `Empresa: ${empresa?.nombre || ''}` : `${prestamo?.banco || ''}${prestamo?.numeroCuenta ? ' · Cta. ' + prestamo.numeroCuenta : ''}`}
              </p>
            </div>
            <button onClick={onClose} style={{background:'transparent',border:'none',fontSize:22,cursor:'pointer',color:C.muted,padding:0,lineHeight:1}}>×</button>
          </div>

          {isCrearPrestamo ? (
            <>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4,fontWeight:600}}>Banco</label>
                <input value={banco} onChange={(e) => setBanco(e.target.value)} style={{width:'100%',border:`1px solid ${C.border}`,padding:'8px 10px',borderRadius:6,fontSize:13,fontFamily:'inherit'}}/>
              </div>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4,fontWeight:600}}>Número de cuenta (opcional)</label>
                <input value={numeroCuenta} onChange={(e) => setNumeroCuenta(e.target.value)} placeholder="Ej: 1032831260" style={{width:'100%',border:`1px solid ${C.border}`,padding:'8px 10px',borderRadius:6,fontSize:13,fontFamily:'inherit'}}/>
              </div>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4,fontWeight:600}}>Monto autorizado</label>
                <input value={montoAutorizado} onChange={(e) => setMontoAutorizado(e.target.value.replace(/[^\d.]/g, ''))} placeholder="2900000" style={{width:'100%',border:`1px solid ${C.border}`,padding:'8px 10px',borderRadius:6,fontSize:14,fontFamily:'monospace',fontVariantNumeric:'tabular-nums'}}/>
                {parseMonto(montoAutorizado) > 0 && (
                  <div style={{fontSize:11,color:C.muted,marginTop:4}}>${fmt(parseMonto(montoAutorizado))} MXN</div>
                )}
              </div>
              <div style={{marginBottom:16}}>
                <label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4,fontWeight:600}}>Fecha de recepción</label>
                <input type="date" value={fechaRecepcion} onChange={(e) => setFechaRecepcion(e.target.value)} style={{width:'100%',border:`1px solid ${C.border}`,padding:'8px 10px',borderRadius:6,fontSize:13,fontFamily:'inherit'}}/>
              </div>
            </>
          ) : (
            <>
              {/* Tabs Disposición / Pago */}
              <div style={{display:'flex',gap:6,padding:4,background:'#F3F4F6',borderRadius:8,marginBottom:14}}>
                <button onClick={() => setTipoMov('disposicion')} style={{flex:1,padding:'8px',background:tipoMov==='disposicion'?'#fff':'transparent',border:tipoMov==='disposicion'?`1px solid ${C.border}`:'1px solid transparent',borderRadius:6,fontSize:12,fontWeight:tipoMov==='disposicion'?700:500,color:tipoMov==='disposicion'?C.navy:C.muted,cursor:'pointer',fontFamily:'inherit'}}>↓ Disposición</button>
                <button onClick={() => setTipoMov('pago')} style={{flex:1,padding:'8px',background:tipoMov==='pago'?'#fff':'transparent',border:tipoMov==='pago'?`1px solid ${C.border}`:'1px solid transparent',borderRadius:6,fontSize:12,fontWeight:tipoMov==='pago'?700:500,color:tipoMov==='pago'?'#92400E':C.muted,cursor:'pointer',fontFamily:'inherit'}}>↑ Pago</button>
              </div>

              <div style={{marginBottom:12}}>
                <label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4,fontWeight:600}}>Fecha</label>
                <input type="date" value={fechaMov} onChange={(e) => setFechaMov(e.target.value)} style={{width:'100%',border:`1px solid ${C.border}`,padding:'8px 10px',borderRadius:6,fontSize:13,fontFamily:'inherit'}}/>
              </div>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4,fontWeight:600}}>Monto</label>
                <input value={montoMov} onChange={(e) => setMontoMov(e.target.value.replace(/[^\d.]/g, ''))} placeholder="500000" style={{width:'100%',border:`1px solid ${C.border}`,padding:'8px 10px',borderRadius:6,fontSize:14,fontFamily:'monospace',fontVariantNumeric:'tabular-nums'}}/>
                {parseMonto(montoMov) > 0 && (
                  <div style={{fontSize:11,color:C.muted,marginTop:4}}>${fmt(parseMonto(montoMov))} MXN</div>
                )}
              </div>
              <div style={{marginBottom:14}}>
                <label style={{fontSize:11,color:C.muted,display:'block',marginBottom:4,fontWeight:600}}>Concepto</label>
                <input value={conceptoMov} onChange={(e) => setConceptoMov(e.target.value)} placeholder="Ej: Pago nómina quincena 1" style={{width:'100%',border:`1px solid ${C.border}`,padding:'8px 10px',borderRadius:6,fontSize:13,fontFamily:'inherit'}}/>
              </div>

              {/* Preview del efecto */}
              {previewEfecto && parseMonto(montoMov) > 0 && (
                <div style={{background:'#F9FAFB',border:`1px solid ${C.border}`,borderRadius:8,padding:'10px 12px',marginBottom:16}}>
                  <div style={{fontSize:10,color:C.muted,marginBottom:6,fontWeight:600,textTransform:'uppercase',letterSpacing:0.5}}>Después de este movimiento:</div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3,fontVariantNumeric:'tabular-nums'}}>
                    <span style={{color:C.muted}}>Bloqueado</span>
                    <span>${fmt(previewEfecto.bloqueadoAntes)} → <span style={{color:tipoMov==='disposicion'?'#1E40AF':'#92400E',fontWeight:700}}>${fmt(previewEfecto.bloqueadoDespues)}</span></span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,fontVariantNumeric:'tabular-nums'}}>
                    <span style={{color:C.muted}}>Utilizado</span>
                    <span>${fmt(previewEfecto.utilizadoAntes)} → <span style={{color:tipoMov==='disposicion'?'#1E40AF':'#92400E',fontWeight:700}}>${fmt(previewEfecto.utilizadoDespues)}</span></span>
                  </div>
                </div>
              )}
            </>
          )}

          <div style={{display:'flex',gap:8}}>
            <button onClick={onClose} disabled={guardando} style={{flex:1,background:'#fff',border:`1px solid ${C.border}`,color:C.text,padding:'9px',borderRadius:7,fontSize:13,fontWeight:600,cursor:guardando?'not-allowed':'pointer',fontFamily:'inherit'}}>Cancelar</button>
            <button onClick={handleGuardar} disabled={!puedeGuardar || guardando} style={{flex:1,background:puedeGuardar?C.navy:'#9CA3AF',color:'#fff',border:'none',padding:'9px',borderRadius:7,fontSize:13,fontWeight:700,cursor:(!puedeGuardar||guardando)?'not-allowed':'pointer',fontFamily:'inherit'}}>
              {guardando ? 'Guardando...' : (isCrearPrestamo ? 'Crear préstamo' : 'Guardar')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════
  // MODAL: Histórico de movimientos del préstamo
  // ═══════════════════════════════════════════════════════════════════
  const PrestamoHistoricoModal = ({ prestamo, movimientos, prestamoCalc, esConsulta, onClose, onEditar, onBorrar, onNuevo }) => {
    // Calcular saldo bloqueado después de cada movimiento (recorrido cronológico)
    const movsConSaldo = useMemo(() => {
      let utilAcum = 0;
      return (movimientos || []).map(m => {
        if (m.tipo === 'disposicion') utilAcum += +m.monto || 0;
        else if (m.tipo === 'pago')   utilAcum -= +m.monto || 0;
        utilAcum = Math.max(0, utilAcum);
        return { ...m, bloqueadoDespues: Math.max(0, (+prestamo.montoAutorizado || 0) - utilAcum) };
      });
    }, [movimientos, prestamo]);

    const tipoBadge = (tipo) => {
      if (tipo === 'inicial')     return { bg:'#D1FAE5', color:'#065F46', text:'Inicial', sign:'+' };
      if (tipo === 'disposicion') return { bg:'#DBEAFE', color:'#1E40AF', text:'Disposición', sign:'−' };
      if (tipo === 'pago')        return { bg:'#FEF3C7', color:'#92400E', text:'Pago', sign:'+' };
      return { bg:'#F3F4F6', color:'#374151', text:tipo, sign:'' };
    };

    return (
      <div onClick={onClose} style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(31,41,55,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:20,fontFamily:'"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',WebkitFontSmoothing:'antialiased',MozOsxFontSmoothing:'grayscale',textRendering:'optimizeLegibility'}}>
        <div onClick={(e) => e.stopPropagation()} style={{background:'#fff',borderRadius:14,padding:24,maxWidth:760,width:'100%',maxHeight:'85vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14,paddingBottom:12,borderBottom:`1px solid ${C.border}`}}>
            <div>
              <h3 style={{fontSize:16,fontWeight:800,color:C.navy,margin:0}}>📜 Histórico del préstamo</h3>
              <p style={{fontSize:11,color:C.muted,margin:'4px 0 0'}}>{prestamo.banco}{prestamo.numeroCuenta ? ` · Cta. ${prestamo.numeroCuenta}` : ''}</p>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              {!esConsulta && (
                <button onClick={onNuevo} style={{background:C.navy,color:'#fff',border:'none',padding:'7px 14px',borderRadius:7,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>+ Nuevo movimiento</button>
              )}
              <button onClick={onClose} style={{background:'transparent',border:'none',fontSize:22,cursor:'pointer',color:C.muted,padding:0,lineHeight:1}}>×</button>
            </div>
          </div>

          {/* KPIs */}
          {prestamoCalc && (
            <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:10,marginBottom:14}}>
              <div style={{background:'#F9FAFB',borderRadius:8,padding:'10px 12px'}}>
                <div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:'uppercase',letterSpacing:0.5}}>Autorizado</div>
                <div style={{fontSize:16,fontWeight:800,marginTop:2,fontFamily:'monospace',fontVariantNumeric:'tabular-nums',color:'#1F2937'}}>${fmt(prestamoCalc.autorizado)}</div>
              </div>
              <div style={{background:'#EFF6FF',borderRadius:8,padding:'10px 12px'}}>
                <div style={{fontSize:10,color:'#1E40AF',fontWeight:600,textTransform:'uppercase',letterSpacing:0.5}}>Utilizado</div>
                <div style={{fontSize:16,fontWeight:800,marginTop:2,fontFamily:'monospace',fontVariantNumeric:'tabular-nums',color:'#1E40AF'}}>${fmt(prestamoCalc.utilizado)}</div>
              </div>
              <div style={{background:'#FEF3C7',borderRadius:8,padding:'10px 12px'}}>
                <div style={{fontSize:10,color:'#92400E',fontWeight:600,textTransform:'uppercase',letterSpacing:0.5}}>Bloqueado</div>
                <div style={{fontSize:16,fontWeight:800,marginTop:2,fontFamily:'monospace',fontVariantNumeric:'tabular-nums',color:'#92400E'}}>${fmt(prestamoCalc.bloqueado)}</div>
              </div>
            </div>
          )}

          {/* Tabla */}
          <div style={{flex:1,overflowY:'auto',border:`1px solid ${C.border}`,borderRadius:8}}>
            {movsConSaldo.length === 0 ? (
              <div style={{padding:40,textAlign:'center',color:C.muted}}>
                <div style={{fontSize:36,marginBottom:8}}>📋</div>
                <div style={{fontSize:13}}>Sin movimientos registrados todavía.</div>
              </div>
            ) : (
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead style={{background:'#F9FAFB',position:'sticky',top:0}}>
                  <tr style={{borderBottom:`1px solid ${C.border}`}}>
                    <th style={{textAlign:'left',padding:'9px 10px',fontWeight:700,color:C.muted,fontSize:10,letterSpacing:0.5,textTransform:'uppercase'}}>Fecha</th>
                    <th style={{textAlign:'left',padding:'9px 10px',fontWeight:700,color:C.muted,fontSize:10,letterSpacing:0.5,textTransform:'uppercase'}}>Tipo</th>
                    <th style={{textAlign:'left',padding:'9px 10px',fontWeight:700,color:C.muted,fontSize:10,letterSpacing:0.5,textTransform:'uppercase'}}>Concepto</th>
                    <th style={{textAlign:'right',padding:'9px 10px',fontWeight:700,color:C.muted,fontSize:10,letterSpacing:0.5,textTransform:'uppercase'}}>Monto</th>
                    <th style={{textAlign:'right',padding:'9px 10px',fontWeight:700,color:C.muted,fontSize:10,letterSpacing:0.5,textTransform:'uppercase'}}>Bloqueado</th>
                    <th style={{width:80}}></th>
                  </tr>
                </thead>
                <tbody>
                  {movsConSaldo.map((m, idx) => {
                    const b = tipoBadge(m.tipo);
                    return (
                      <tr key={m.id || idx} style={{borderBottom:idx<movsConSaldo.length-1?`1px solid ${C.border}`:'none'}}>
                        <td style={{padding:'9px 10px',fontFamily:'monospace',fontSize:11,color:'#1F2937'}}>{m.fecha}</td>
                        <td style={{padding:'9px 10px'}}>
                          <span style={{padding:'2px 9px',background:b.bg,color:b.color,borderRadius:999,fontSize:10,fontWeight:700,letterSpacing:0.3}}>{b.text}</span>
                        </td>
                        <td style={{padding:'9px 10px',color:'#1F2937'}}>{m.concepto || '—'}</td>
                        <td style={{padding:'9px 10px',textAlign:'right',fontFamily:'monospace',fontVariantNumeric:'tabular-nums',fontWeight:700,color:b.color}}>{b.sign}${fmt(m.monto)}</td>
                        <td style={{padding:'9px 10px',textAlign:'right',fontFamily:'monospace',fontVariantNumeric:'tabular-nums',color:C.muted}}>${fmt(m.bloqueadoDespues)}</td>
                        <td style={{textAlign:'center',padding:'4px 6px'}}>
                          {!esConsulta && m.tipo !== 'inicial' && (
                            <div style={{display:'flex',gap:4,justifyContent:'center'}}>
                              <button onClick={() => onEditar(m)} title="Editar" style={{background:'transparent',border:`1px solid ${C.border}`,padding:'3px 6px',borderRadius:4,fontSize:10,cursor:'pointer',color:C.muted,fontFamily:'inherit'}}>✎</button>
                              <button onClick={() => onBorrar(m.id)} title="Borrar" style={{background:'transparent',border:`1px solid #FCA5A5`,padding:'3px 6px',borderRadius:4,fontSize:10,cursor:'pointer',color:'#DC2626',fontFamily:'inherit'}}>🗑</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ── IMPORTAR ───────────────────────────────────────────────────────── */
  const renderImportar = () => (
    <div>
      <h1 style={{fontSize:22,fontWeight:800,color:C.navy,marginBottom:4}}>Importar Facturas</h1>
      <p style={{color:C.muted,fontSize:14,marginBottom:24}}>Carga tu Excel de facturas timbradas</p>
      <div style={{background:C.surface,border:`2px dashed ${C.border}`,borderRadius:20,padding:48,textAlign:"center",marginBottom:24,cursor:esConsulta?"not-allowed":"pointer",opacity:esConsulta?0.5:1}} onClick={()=>!esConsulta&&fileRef.current?.click()}>
        <div style={{fontSize:56,marginBottom:12}}>📂</div>
        <div style={{fontSize:18,fontWeight:700,color:C.navy,marginBottom:4}}>Haz clic para seleccionar archivo</div>
        <button style={btnStyle} disabled={esConsulta} onClick={e=>{e.stopPropagation();if(!esConsulta)fileRef.current?.click();}}>Seleccionar .xlsx</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} style={{display:"none"}}/>
      </div>
      {importMsg && (
        <div style={{marginBottom:20}}>
          <div style={{padding:16,borderRadius:10,background:importMsg.includes("✅")?"#E8F5E9":"#FFEBEE",border:`1px solid ${importMsg.includes("✅")?C.ok:C.danger}`,fontSize:14,fontWeight:600,whiteSpace:"pre-line"}}>{importMsg}</div>
          {importDupes.length > 0 && (
            <div style={{marginTop:12,background:"#FFF8E1",border:"1px solid #FFE082",borderRadius:12,padding:16}}>
              <div style={{fontWeight:700,color:"#F57F17",marginBottom:10,fontSize:14}}>⚠️ Facturas duplicadas (no se cargaron):</div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead><tr style={{background:"#FFF3E0"}}>
                    {["Folio","Proveedor","Fecha","Total"].map(h=>(
                      <th key={h} style={{padding:"8px 10px",textAlign:"left",color:"#E65100",fontWeight:700,fontSize:11,textTransform:"uppercase"}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {importDupes.map((d,i)=>(
                      <tr key={i} style={{borderTop:"1px solid #FFE082",background:i%2===0?"#FFFDE7":"#FFF8E1"}}>
                        <td style={{padding:"8px 10px",fontWeight:600}}>{d.serie}{d.folio}</td>
                        <td style={{padding:"8px 10px"}}>{d.proveedor}</td>
                        <td style={{padding:"8px 10px"}}>{d.fecha}</td>
                        <td style={{padding:"8px 10px",fontWeight:700}}>${fmt(d.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{background:"#EEF2FF",border:"1px solid #C7D7FD",borderRadius:14,padding:20}}>
        <h3 style={{fontWeight:700,color:C.navy,marginBottom:12}}>📋 Formato esperado</h3>
        <div style={{overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",fontSize:13,minWidth:700}}>
            <thead><tr>{["TIPO","FECHA","SERIE","FOLIO","UUID","PROVEEDOR","SUBTOTAL","IVA","TOTAL","MONEDA"].map(h=><th key={h} style={{padding:"8px 12px",background:C.navy,color:"#fff",fontSize:11,fontWeight:600,textAlign:"center"}}>{h}</th>)}</tr></thead>
            <tbody><tr style={{background:"#fff"}}>{["Factura","07/01/2026","A","3200","4733f910…","EDUARDO VELAZQUEZ","$6,400","$1,024","$7,424","MXN"].map((v,i)=><td key={i} style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,textAlign:"center"}}>{v}</td>)}</tr></tbody>
          </table>
        </div>
        <div style={{marginTop:12,fontSize:12,color:C.muted,display:"flex",flexDirection:"column",gap:6}}>
          <div>💡 <b>TOTAL tiene prioridad:</b> Si la columna TOTAL tiene valor, se usa directamente. Solo si está vacía se calcula como SUBTOTAL + IVA.</div>
          <div>💱 <b>MONEDA:</b> Acepta MXN, USD, EUR, M.N., PESOS, DOLAR, EURO. Si no hay columna MONEDA, se usa la moneda del proveedor registrado.</div>
          <div>👤 <b>Proveedores nuevos:</b> Si el proveedor no existe en el catálogo, se registra automáticamente con datos mínimos. Luego puedes completar sus datos en la sección de Proveedores.</div>
          <div>💲 <b>Formato libre:</b> Los importes pueden incluir símbolos ($, €) y comas — se limpian automáticamente.</div>
          <div>🔍 <b>Columnas flexibles:</b> También busca columnas como RAZON SOCIAL, NOMBRE o EMISOR como proveedor.</div>
        </div>
      </div>
    </div>
  );

  /* ── PAGOS ─────────────────────────────────────────────────────────── */
  const renderPagos = () => {
    const allInvs = [
      ...invoices.MXN.map(i=>({...i,moneda:"MXN"})),
      ...invoices.USD.map(i=>({...i,moneda:"USD"})),
      ...invoices.EUR.map(i=>({...i,moneda:"EUR"})),
    ];
    // Build payment records: merge realized payment rows with invoice data
    const payRecords = payments.filter(p => p.tipo === 'realizado').map(p => {
      const inv = allInvs.find(i=>i.id===p.invoiceId);
      if(!inv) return null;
      return { ...p, proveedor:inv.proveedor, folio:`${inv.serie}${inv.folio}`, tipo:inv.tipo, fecha:inv.fecha, concepto:inv.concepto, moneda:inv.moneda, totalFactura:inv.total };
    }).filter(Boolean);

    // Filter by date range
    const byDate = payRecords.filter(p => {
      if(pagosFechaFrom && p.fechaPago < pagosFechaFrom) return false;
      if(pagosFechaTo && p.fechaPago > pagosFechaTo) return false;
      return true;
    });

    // Filter by search
    const filtered = byDate.filter(p => {
      if(!pagosSearch) return true;
      const q = pagosSearch.toLowerCase();
      return p.proveedor.toLowerCase().includes(q) || p.folio.toLowerCase().includes(q) || (p.concepto||"").toLowerCase().includes(q) || String(p.monto).includes(q) || p.moneda.toLowerCase().includes(q);
    });

    // Group by proveedor
    const porProveedor = {};
    filtered.forEach(p => {
      if(!porProveedor[p.proveedor]) porProveedor[p.proveedor] = { pagos:[], totalPagado:0, monedas:new Set() };
      porProveedor[p.proveedor].pagos.push(p);
      porProveedor[p.proveedor].totalPagado += p.monto;
      porProveedor[p.proveedor].monedas.add(p.moneda);
    });
    const proveedores = Object.entries(porProveedor).sort((a,b) => a[0].localeCompare(b[0]));
    const totalGeneral = filtered.reduce((s,p) => s+p.monto, 0);
    const porMoneda = {MXN:0,USD:0,EUR:0};
    filtered.forEach(p => { porMoneda[p.moneda] = (porMoneda[p.moneda]||0) + p.monto; });

    return (
      <div>
        <h1 style={{fontSize:22,fontWeight:800,color:C.navy,marginBottom:4}}>💰 Pagos Realizados</h1>
        <p style={{color:C.muted,fontSize:14,marginBottom:20}}>Consulta pagos por rango de fechas o por proveedor</p>
        {/* Filters */}
        <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:24,flexWrap:"wrap"}}>
          <label style={{fontSize:13,fontWeight:700,color:C.navy}}>Desde:</label>
          <input type="date" value={pagosFechaFrom} onChange={e=>setPagosFechaFrom(e.target.value)} style={{...inputStyle,maxWidth:180}}/>
          <label style={{fontSize:13,fontWeight:700,color:C.navy}}>Hasta:</label>
          <input type="date" value={pagosFechaTo} onChange={e=>setPagosFechaTo(e.target.value)} style={{...inputStyle,maxWidth:180}}/>
          <input placeholder="🔍 Buscar proveedor, folio, concepto…" value={pagosSearch} onChange={e=>setPagosSearch(e.target.value)} style={{...inputStyle,maxWidth:320}}/>
          {(pagosFechaFrom||pagosFechaTo||pagosSearch) && (
            <button onClick={()=>{setPagosFechaFrom("");setPagosFechaTo("");setPagosSearch("");}} style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"6px 12px",fontSize:12}}>✕ Limpiar</button>
          )}
        </div>
        {/* Summary */}
        {filtered.length > 0 && (
          <div style={{display:"flex",gap:16,marginBottom:20,flexWrap:"wrap"}}>
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 20px"}}>
              <div style={{fontSize:11,color:C.muted,fontWeight:600,textTransform:"uppercase"}}>Proveedores</div>
              <div style={{fontSize:24,fontWeight:800,color:C.navy}}>{proveedores.length}</div>
            </div>
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 20px"}}>
              <div style={{fontSize:11,color:C.muted,fontWeight:600,textTransform:"uppercase"}}>Pagos registrados</div>
              <div style={{fontSize:24,fontWeight:800,color:C.navy}}>{filtered.length}</div>
            </div>
            <div style={{background:"#E8F5E9",border:"1px solid #A5D6A7",borderRadius:12,padding:"14px 20px"}}>
              <div style={{fontSize:11,color:C.muted,fontWeight:600,textTransform:"uppercase"}}>Total pagado</div>
              <div style={{fontSize:24,fontWeight:800,color:C.ok}}>${fmt(totalGeneral)}</div>
            </div>
            {porMoneda.MXN>0 && <div style={{background:"#E3F2FD",border:"1px solid #90CAF9",borderRadius:12,padding:"14px 20px"}}><div style={{fontSize:11,color:C.muted,fontWeight:600}}>🇲🇽 MXN</div><div style={{fontSize:20,fontWeight:800,color:C.mxn}}>${fmt(porMoneda.MXN)}</div></div>}
            {porMoneda.USD>0 && <div style={{background:"#E8F5E9",border:"1px solid #A5D6A7",borderRadius:12,padding:"14px 20px"}}><div style={{fontSize:11,color:C.muted,fontWeight:600}}>🇺🇸 USD</div><div style={{fontSize:20,fontWeight:800,color:C.usd}}>${fmt(porMoneda.USD)}</div></div>}
            {porMoneda.EUR>0 && <div style={{background:"#F3E5F5",border:"1px solid #CE93D8",borderRadius:12,padding:"14px 20px"}}><div style={{fontSize:11,color:C.muted,fontWeight:600}}>🇪🇺 EUR</div><div style={{fontSize:20,fontWeight:800,color:C.eur}}>€{fmt(porMoneda.EUR)}</div></div>}
          </div>
        )}
        {/* Providers list */}
        {proveedores.length > 0 ? (
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
              <thead><tr style={{background:"#F8FAFC"}}>
                <th style={{padding:"12px 16px",textAlign:"left",color:C.muted,fontWeight:600,fontSize:11,textTransform:"uppercase"}}>Proveedor</th>
                <th style={{padding:"12px 16px",textAlign:"center",color:C.muted,fontWeight:600,fontSize:11,textTransform:"uppercase"}}>Pagos</th>
                <th style={{padding:"12px 16px",textAlign:"center",color:C.muted,fontWeight:600,fontSize:11,textTransform:"uppercase"}}>Moneda(s)</th>
                <th style={{padding:"12px 16px",textAlign:"right",color:C.muted,fontWeight:600,fontSize:11,textTransform:"uppercase"}}>Total Pagado</th>
              </tr></thead>
              <tbody>
                {proveedores.map(([prov, data]) => (
                  <tr key={prov} onClick={()=>{setPagosExpandedDates(new Set());setPagosDetail({proveedor:prov, pagos:data.pagos});}}
                    style={{borderTop:`1px solid ${C.border}`,cursor:"pointer",transition:"background .15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.background="#F0F7FF";}}
                    onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                    <td style={{padding:"14px 16px",fontWeight:700,color:C.navy}}>{prov}</td>
                    <td style={{padding:"14px 16px",textAlign:"center"}}>{data.pagos.length}</td>
                    <td style={{padding:"14px 16px",textAlign:"center"}}>
                      {[...data.monedas].map(m=><span key={m} style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[m],color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[m],padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700,marginRight:4}}>{m}</span>)}
                    </td>
                    <td style={{padding:"14px 16px",textAlign:"right",fontWeight:800,color:C.ok,fontSize:16}}>${fmt(data.totalPagado)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr style={{borderTop:`2px solid ${C.navy}`,background:"#F8FAFC"}}>
                <td style={{padding:"14px 16px",fontWeight:800,color:C.navy}}>TOTAL</td>
                <td style={{padding:"14px 16px",textAlign:"center",fontWeight:700}}>{filtered.length}</td>
                <td/>
                <td style={{padding:"14px 16px",textAlign:"right",fontWeight:800,color:C.navy,fontSize:16}}>${fmt(totalGeneral)}</td>
              </tr></tfoot>
            </table>
          </div>
        ) : (
          <div style={{textAlign:"center",padding:60,color:C.muted,background:C.surface,borderRadius:14,border:`1px solid ${C.border}`}}>
            <div style={{fontSize:48,marginBottom:12}}>📭</div>
            <div style={{fontSize:16,fontWeight:600}}>No se encontraron pagos</div>
            <div style={{fontSize:13,marginTop:4}}>Busca por proveedor o ajusta el rango de fechas. Si no hay fechas, se muestran todos los pagos registrados.</div>
          </div>
        )}
      </div>
    );
  };

  /* ── CONFIG ─────────────────────────────────────────────────────────── */
  const renderConfig = () => {
    const removeClase = (c) => { setClases(p => { const n=p.filter(x=>x!==c); saveClasificaciones(n, empresaId); return n; }); };
    const addClase = (val) => { if(val.trim()){ setClases(p => { const n=[...p,val.trim()]; saveClasificaciones(n, empresaId); return n; }); setNcInput(""); } };
    return (
      <div>
        <h1 style={{fontSize:22,fontWeight:800,color:C.navy,marginBottom:24}}>⚙️ Configuración</h1>
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:24,maxWidth:480}}>
          <h3 style={{fontWeight:700,color:C.navy,marginBottom:16}}>Clasificaciones</h3>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:20}}>
            {clases.map(c=>(
              <div key={c} style={{display:"flex",alignItems:"center",gap:4,background:"#EEF2FF",border:"1px solid #C7D7FD",borderRadius:20,padding:"4px 12px"}}>
                <span style={{fontSize:13,color:C.blue,fontWeight:600}}>{c}</span>
                {clases.length>1 && <button onClick={()=>removeClase(c)} style={{background:"none",border:"none",cursor:"pointer",color:C.danger,fontSize:14,padding:0}}>×</button>}
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <input placeholder="Nueva clasificación…" value={ncInput} onChange={e=>setNcInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter") addClase(ncInput);}}
              style={{...inputStyle,flex:1}}/>
            <button onClick={()=>addClase(ncInput)} style={btnStyle}>Agregar</button>
          </div>
        </div>
        {esSuperadmin && (
          <HistorialActividad C={C} btnStyle={btnStyle} inputStyle={inputStyle} />
        )}
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════════════════
     MODALS
     ═══════════════════════════════════════════════════════════════════════ */

  /* ── Invoice Modal ──────────────────────────────────────────────────── */
  const InvoiceModal = () => {
    const [form, setForm] = useState({...modalInv});
    const [showCal, setShowCal] = useState(false);
    const [calYear, setCalYear] = useState(()=>{ const d=form.fechaProgramacion?new Date(form.fechaProgramacion+"T12:00:00"):new Date(); return d.getFullYear(); });
    const [calMonth, setCalMonth] = useState(()=>{ const d=form.fechaProgramacion?new Date(form.fechaProgramacion+"T12:00:00"):new Date(); return d.getMonth(); });

    const set = (k,v) => setForm(f=>{
      const u={...f,[k]:v};
      if(k==="subtotal") u.iva=+(+v*0.16).toFixed(2);
      if(["subtotal","iva","retIsr","retIva"].includes(k)) u.total=+(+(u.subtotal||0)+ +(u.iva||0)- +(u.retIsr||0)- +(u.retIva||0)).toFixed(2);
      if(k==="proveedor"){ const sup=suppliers.find(s=>s.nombre===v); if(sup) u.diasCredito=sup.diasCredito; }
      if((k==="fecha"||k==="diasCredito")&&u.fecha&&u.diasCredito) u.vencimiento=addDays(u.fecha,+u.diasCredito);
      return u;
    });

    const meses=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const firstDay=new Date(calYear,calMonth,1).getDay();
    const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
    const calCells=[]; for(let i=0;i<firstDay;i++) calCells.push(null); for(let d=1;d<=daysInMonth;d++) calCells.push(d);

    return (
      <ModalShell title={form.id?"Editar Factura":"Nueva Factura"} onClose={()=>setModalInv(null)}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <Field label="Tipo"><select value={form.tipo} onChange={e=>set("tipo",e.target.value)} style={selectStyle}>{["Factura","Nota de Crédito","Anticipo"].map(t=><option key={t}>{t}</option>)}</select></Field>
          <Field label="Moneda"><select value={form.moneda||currency} onChange={e=>set("moneda",e.target.value)} style={selectStyle}>{["MXN","USD","EUR"].map(m=><option key={m}>{m}</option>)}</select></Field>
          <Field label="Fecha Emisión"><input type="date" value={form.fecha} onChange={e=>set("fecha",e.target.value)} style={inputStyle}/></Field>
          <Field label="Serie / Folio"><div style={{display:"flex",gap:6}}><input placeholder="Serie" value={form.serie} onChange={e=>set("serie",e.target.value)} style={{...inputStyle,width:70}}/><input placeholder="Folio" value={form.folio} onChange={e=>set("folio",e.target.value)} style={{...inputStyle,flex:1}}/></div></Field>
          <Field label="UUID"><input value={form.uuid} onChange={e=>set("uuid",e.target.value)} style={inputStyle}/></Field>
          <Field label="Proveedor"><select value={form.proveedor} onChange={e=>set("proveedor",e.target.value)} style={selectStyle}><option value="">— Seleccionar —</option>{suppliers.filter(s=>s.activo).map(s=><option key={s.id}>{s.nombre}</option>)}</select></Field>
          <Field label="Clasificación"><select value={form.clasificacion} onChange={e=>set("clasificacion",e.target.value)} style={selectStyle}>{clases.map(c=><option key={c}>{c}</option>)}</select></Field>
          <Field label="Concepto"><input value={form.concepto||""} onChange={e=>set("concepto",e.target.value)} placeholder="Descripción breve…" style={inputStyle}/></Field>
          <Field label="Subtotal"><input type="number" value={form.subtotal} onChange={e=>set("subtotal",e.target.value)} style={inputStyle}/></Field>
          <Field label="IVA 16%"><input type="number" value={form.iva} onChange={e=>set("iva",e.target.value)} style={inputStyle}/></Field>
          <Field label="Ret. ISR"><input type="number" value={form.retIsr} onChange={e=>set("retIsr",e.target.value)} style={inputStyle}/></Field>
          <Field label="Ret. IVA"><input type="number" value={form.retIva} onChange={e=>set("retIva",e.target.value)} style={inputStyle}/></Field>
          <Field label="TOTAL"><input type="number" value={form.total} readOnly style={{...inputStyle,fontWeight:800,color:C.navy,background:"#F0F4FF"}}/></Field>
          <Field label="Días Crédito"><input type="number" value={form.diasCredito} onChange={e=>set("diasCredito",e.target.value)} style={inputStyle}/></Field>
          <Field label="Vencimiento"><input type="date" value={form.vencimiento} onChange={e=>set("vencimiento",e.target.value)} style={inputStyle}/></Field>
          <Field label="Estatus"><select value={form.estatus} onChange={e=>set("estatus",e.target.value)} style={selectStyle}>{["Pendiente","Pagado","Vencido","Parcial"].map(s=><option key={s}>{s}</option>)}</select></Field>
          <Field label="Monto Pagado"><input type="number" min="0" value={form.montoPagado||0} onChange={e=>set("montoPagado",e.target.value)} style={{...inputStyle,color:C.ok,fontWeight:700}}/></Field>
          <Field label="Saldo Pendiente"><div style={{padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,background:"#FFF8E1",fontWeight:800,fontSize:14,color:((+form.total||0)-(+form.montoPagado||0))>0?C.warn:C.ok}}>${fmt((+form.total||0)-(+form.montoPagado||0))}</div></Field>
          <Field label="Referencia Pago"><input value={form.referencia||""} onChange={e=>set("referencia",e.target.value)} style={inputStyle}/></Field>
          <Field label="Días Ficticios"><input type="number" min="0" value={form.diasFicticios||0} onChange={e=>set("diasFicticios",e.target.value)} style={inputStyle}/></Field>
        </div>
        <Field label="Notas"><textarea value={form.notas||""} onChange={e=>set("notas",e.target.value)} rows={2} style={{...inputStyle,resize:"vertical"}}/></Field>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
          <button onClick={()=>setModalInv(null)} style={{...btnStyle,background:"#F1F5F9",color:C.text}}>Cancelar</button>
          <button onClick={()=>saveInvoice(form)} style={btnStyle}>Guardar</button>
        </div>
      </ModalShell>
    );
  };

  /* ── Egreso No Facturado Modal ──────────────────────────────────── */
  const EgresoModal = () => {
    const [form, setForm] = useState({
      ...modalEgreso,
      // Si la categoría inicial no existe en clases (caso default 'Nómina'), usar la primera disponible
      categoriaEgreso: (modalEgreso.categoriaEgreso && clases.includes(modalEgreso.categoriaEgreso))
        ? modalEgreso.categoriaEgreso
        : (clases[0] || ''),
    });
    const set = (k, v) => setForm(f => ({...f, [k]: v}));
    const editando = !form._esNuevo;
    return (
      <ModalShell title={editando ? "Editar Otro Pago" : "💵 Nuevo Otro Pago"} onClose={() => setModalEgreso(null)}>
        <div style={{background:'#FFEBEE',border:'1px solid #FFCDD2',borderRadius:8,padding:'10px 14px',marginBottom:18,fontSize:12,color:'#B71C1C',display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:18}}>💵</span>
          <div>
            <b>Egreso sin factura</b> — pagos como nómina, comisiones, impuestos, etc. que no tienen factura formal pero salen del banco.
            <div style={{fontSize:11,marginTop:2,opacity:0.85}}>Aparecerán en el Reporte Diario junto a los pagos de facturas, pero NO en el Dashboard ni gráficas.</div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <Field label="Concepto *">
            <input value={form.concepto} onChange={e => set('concepto', e.target.value)}
              placeholder="Ej: Sueldos y salarios Operadores" style={inputStyle} autoFocus/>
          </Field>
          <Field label="Clasificación">
            <select value={form.categoriaEgreso} onChange={e => set('categoriaEgreso', e.target.value)} style={inputStyle}>
              {clases.length === 0 && <option value="">— Sin clasificaciones configuradas —</option>}
              {clases.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Segmento / Rubro">
            <input value={form.segmentoEgreso} onChange={e => set('segmentoEgreso', e.target.value)}
              placeholder="Ej: Transporte, TAS, AFE…" style={inputStyle}/>
          </Field>
          <Field label="Moneda">
            <select value={form.moneda} onChange={e => set('moneda', e.target.value)} style={inputStyle}>
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </Field>
          <Field label="Monto *">
            <input type="number" step="0.01" value={form.total} onChange={e => set('total', e.target.value)}
              placeholder="0.00" style={inputStyle}/>
          </Field>
          <Field label="Fecha de pago">
            <input type="date" value={form.fechaProgramacion} onChange={e => set('fechaProgramacion', e.target.value)} style={inputStyle}/>
          </Field>
          <Field label="Estado del pago">
            <select value={form._yaPagado ? 'pagado' : 'programado'}
              onChange={e => set('_yaPagado', e.target.value === 'pagado')} style={inputStyle}>
              <option value="pagado">✅ Ya pagado</option>
              <option value="programado">📅 Programado</option>
            </select>
          </Field>
          <Field label="Método de pago">
            <select value={form.metodoPago} onChange={e => set('metodoPago', e.target.value)} style={inputStyle}>
              <option value="banco">🏦 Banco (sale del saldo)</option>
              <option value="tdc">💳 Tarjeta de Crédito (no sale del saldo)</option>
              <option value="otro">➕ Otro</option>
            </select>
          </Field>
          <div style={{gridColumn:'span 2'}}>
            <Field label="Notas">
              <input value={form.notas} onChange={e => set('notas', e.target.value)}
                placeholder="Ej: NOM 2DA QNA ABR" style={inputStyle}/>
            </Field>
          </div>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',gap:10,marginTop:24,alignItems:'center'}}>
          {!editando ? (
            <button onClick={() => { setModalEgreso(null); setModalImportarEgresos({ rows: [], categoriaEgreso: '', metodoPago: 'banco', fechaPago: today(), moneda: currency, _yaPagado: true }); }}
              style={{...btnStyle, background:'#1976D2', padding:'9px 16px', fontSize:13}}>
              📥 Importar varios desde Excel
            </button>
          ) : <div/>}
          <div style={{display:'flex',gap:10}}>
            <button onClick={() => setModalEgreso(null)} style={{...btnStyle, background:'#F1F5F9', color:C.text}}>Cancelar</button>
            <button onClick={() => saveEgreso(form)} style={{...btnStyle, background:'#C62828'}}>Guardar Egreso</button>
          </div>
        </div>
      </ModalShell>
    );
  };

  /* ── Importar Egresos desde Excel Modal ────────────────────────── */
  const ImportarEgresosModal = () => {
    const [form, setForm] = useState({...modalImportarEgresos});
    const [textoPegado, setTextoPegado] = useState('');
    // Estados nuevos para edición individual y masiva
    const [selectedRows, setSelectedRows] = useState(new Set()); // Set de índices seleccionados
    const [editingCell, setEditingCell] = useState(null);        // { rowIdx, col }
    const [editingValue, setEditingValue] = useState('');
    const [bulkClasifNF, setBulkClasifNF] = useState('');
    const [bulkFecha, setBulkFecha] = useState('');
    const [bulkEstado, setBulkEstado] = useState('');             // 'pagado' | 'programado' | ''
    const [bulkMetodo, setBulkMetodo] = useState('');             // 'banco' | 'tdc' | 'otro' | ''
    const set = (k, v) => setForm(f => ({...f, [k]: v}));

    // Helpers para selección
    const toggleSelectRow = (idx) => {
      setSelectedRows(prev => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx); else next.add(idx);
        return next;
      });
    };
    const toggleSelectAll = () => {
      setSelectedRows(prev => {
        if (prev.size === form.rows.length) return new Set();
        return new Set(form.rows.map((_, i) => i));
      });
    };
    const clearSelection = () => setSelectedRows(new Set());

    // Iniciar edición de celda
    const startEdit = (rowIdx, col) => {
      const r = form.rows[rowIdx];
      let valorInicial = '';
      if (col === 'clasificacion') valorInicial = r.clasificacion || '';
      else if (col === 'concepto') valorInicial = r.concepto || '';
      else if (col === 'monto') valorInicial = String(r.monto || '');
      else if (col === 'notas') valorInicial = r.notas || '';
      setEditingCell({ rowIdx, col });
      setEditingValue(valorInicial);
    };
    // Guardar edición
    const saveEdit = () => {
      if (!editingCell) return;
      const { rowIdx, col } = editingCell;
      const nuevo = [...form.rows];
      const r = { ...nuevo[rowIdx] };
      if (col === 'monto') {
        const n = parseFloat(String(editingValue).replace(/[\$,\s]/g, '')) || 0;
        r.monto = n;
      } else {
        r[col] = editingValue;
      }
      nuevo[rowIdx] = r;
      set('rows', nuevo);
      setEditingCell(null);
      setEditingValue('');
    };
    const cancelEdit = () => {
      setEditingCell(null);
      setEditingValue('');
    };

    // Acciones masivas
    const aplicarMasivo = (campo, valor) => {
      if (selectedRows.size === 0) return;
      const nuevo = form.rows.map((r, i) => {
        if (!selectedRows.has(i)) return r;
        const updated = { ...r };
        if (campo === 'fecha') { updated.fecha = valor || null; updated.fechaRaw = valor || ''; }
        else if (campo === 'clasificacion') { updated.clasificacion = valor; updated.clasifRaw = valor; }
        else updated[campo] = valor;
        return updated;
      });
      set('rows', nuevo);
    };
    const eliminarSeleccionadas = () => {
      if (selectedRows.size === 0) return;
      if (!window.confirm(`¿Eliminar ${selectedRows.size} ${selectedRows.size === 1 ? 'fila' : 'filas'} seleccionada${selectedRows.size === 1 ? '' : 's'}?`)) return;
      const nuevo = form.rows.filter((_, i) => !selectedRows.has(i));
      set('rows', nuevo);
      clearSelection();
    };

    // Parser flexible de fechas: soporta múltiples formatos
    // Devuelve string YYYY-MM-DD o null si no se puede parsear
    // En MX se usa DD/MM/YYYY → preferimos esa interpretación cuando sea ambigua
    const parsearFecha = (raw) => {
      if (!raw && raw !== 0) return null;
      // Caso 1: ya es un objeto Date (xlsx con cellDates:true)
      if (raw instanceof Date) {
        if (isNaN(raw.getTime())) return null;
        const yyyy = raw.getFullYear();
        const mm = String(raw.getMonth() + 1).padStart(2, '0');
        const dd = String(raw.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
      const s = String(raw).trim();
      if (!s) return null;
      // Caso 2: número serial Excel (días desde 1900-01-01)
      if (/^\d+(\.\d+)?$/.test(s) && +s > 25569 && +s < 60000) {
        const dias = Math.floor(+s);
        const ms = (dias - 25569) * 86400 * 1000; // 25569 = 1970-01-01 desde Excel epoch
        const d = new Date(ms);
        if (!isNaN(d.getTime())) {
          const yyyy = d.getUTCFullYear();
          const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
          const dd = String(d.getUTCDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        }
      }
      // Caso 3: ISO YYYY-MM-DD (4 dígitos primero)
      const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (iso) {
        const yyyy = iso[1];
        const mm = String(+iso[2]).padStart(2, '0');
        const dd = String(+iso[3]).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
      // Caso 4: DD/MM/YYYY o MM/DD/YYYY (ambiguos)
      // En MX se usa DD/MM/YYYY → preferimos DD/MM cuando ambiguo.
      // Pero si el primer número > 12 → SEGURO es DD/MM
      // Si el segundo número > 12 → SEGURO es MM/DD (caso raro, archivos en inglés)
      const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
      if (dmy) {
        const a = +dmy[1];
        const b = +dmy[2];
        let yyyy = dmy[3];
        if (yyyy.length === 2) yyyy = (+yyyy > 50 ? '19' : '20') + yyyy;
        let dd, mm;
        if (a > 12 && b <= 12)       { dd = a; mm = b; }       // claramente DD/MM
        else if (b > 12 && a <= 12)  { dd = b; mm = a; }       // claramente MM/DD (gringo)
        else                          { dd = a; mm = b; }       // ambiguo → DD/MM (formato MX)
        if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
        return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
      }
      // Caso 5: con nombre de mes en español: "30 abril 2026", "30/Abr/2026", "30 abr 26"
      const mesesEs = { ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06', jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12' };
      const conMes = s.toLowerCase().match(/(\d{1,2})\s*[\/\-\s]\s*([a-záéíóú]+)\s*[\/\-\s]\s*(\d{2,4})/i);
      if (conMes) {
        const dd = String(+conMes[1]).padStart(2, '0');
        const mesKey = conMes[2].slice(0, 3).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const mm = mesesEs[mesKey];
        let yyyy = conMes[3];
        if (yyyy.length === 2) yyyy = (+yyyy > 50 ? '19' : '20') + yyyy;
        if (mm) return `${yyyy}-${mm}-${dd}`;
      }
      // Último recurso: Date.parse (fechas en inglés tipo "Apr 30 2026")
      const t = Date.parse(s);
      if (!isNaN(t)) {
        const d = new Date(t);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
      return null;
    };

    // Detecta columnas a partir de un array de cells de la primera fila
    // Devuelve { idxSegmento, idxEgreso, idxMonto, idxConcepto, idxFecha, idxMoneda, hayHeader }
    const detectarColumnas = (firstRow) => {
      const norm = (s) => String(s || '').toUpperCase().trim();
      let idxSegmento = -1, idxEgreso = -1, idxMonto = -1, idxConcepto = -1, idxFecha = -1, idxMoneda = -1;
      firstRow.forEach((cel, i) => {
        const c = norm(cel);
        if (c === 'SEGMENTO' || c === 'RUBRO') idxSegmento = i;
        else if (c === 'EGRESOS' || c === 'EGRESO' || c === 'BENEFICIARIO' || c === 'PROVEEDOR') idxEgreso = i;
        else if (c === 'MONTO' || c === 'IMPORTE' || c === 'CANTIDAD') idxMonto = i;
        else if (c === 'CONCEPTO' || c === 'NOTAS' || c === 'DESCRIPCION' || c === 'DESCRIPCIÓN') idxConcepto = i;
        else if (c === 'FECHA' || c === 'DATE' || c === 'FECHA_PAGO' || c === 'FECHA PAGO' || c === 'DIA' || c === 'DÍA') idxFecha = i;
        else if (c === 'MONEDA' || c === 'MONEDAS' || c === 'CURRENCY' || c === 'DIVISA' || c === 'DIVISAS') idxMoneda = i;
      });
      const hayHeader = (idxSegmento !== -1 || idxEgreso !== -1 || idxMonto !== -1 || idxConcepto !== -1 || idxFecha !== -1 || idxMoneda !== -1);
      // Si no detectamos headers, asumir orden por defecto: 0=SEGMENTO, 1=EGRESO, 2=MONTO, 3=MONEDA, 4=CONCEPTO, 5=FECHA (opcionales: MONEDA y FECHA)
      if (!hayHeader) { idxSegmento = 0; idxEgreso = 1; idxMonto = 2; idxMoneda = 3; idxConcepto = 4; idxFecha = 5; }
      return { idxSegmento, idxEgreso, idxMonto, idxConcepto, idxFecha, idxMoneda, hayHeader };
    };

    // Parsear filas en formato array-of-arrays.
    // Mapeo: SEGMENTO→segmento, EGRESOS→concepto (principal), MONTO→monto, CONCEPTO→notas, FECHA→fecha
    // Helper: convierte el texto de la columna MONEDA a un código válido (MXN/USD/EUR)
    // Acepta: "MXN", "USD", "EUR", "$", "USD$", "Dolar", "Dolares", "Peso", "Pesos", "Euro", "Euros", etc.
    // Devuelve el código oficial o null si no se reconoce.
    const matchMoneda = (rawText) => {
      if (!rawText && rawText !== 0) return null;
      const norm = (s) => String(s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const t = norm(rawText);
      if (!t) return null;
      // USD: dolar/dollar/usd/us/$/usd$
      if (/^(usd|us|dolar|dolares|dollar|dollars|us\$|usd\$|u\.s\.d\.?)$/.test(t)) return 'USD';
      // EUR: euro/euros/eur/€
      if (/^(eur|euro|euros|€)$/.test(t)) return 'EUR';
      // MXN: peso/pesos/mxn/mn/mexicano/$ (default cuando hay $ ambiguo)
      if (/^(mxn|mn|peso|pesos|mexicano|mexicanos|pesos? mexicanos?)$/.test(t)) return 'MXN';
      // Solo "$" sin más contexto → asumimos MXN (es lo más común para usuarios mexicanos)
      if (t === '$') return 'MXN';
      return null;
    };

    // Helper: encuentra la clasificación oficial que mejor matchea el texto raw
    // Ignora mayúsculas, acentos y espacios extras. Devuelve la clasificación oficial o null.
    const matchClasificacion = (rawText) => {
      if (!rawText) return null;
      const norm = (s) => String(s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const target = norm(rawText);
      if (!target) return null;
      // Match exacto primero
      for (const c of clases) {
        if (norm(c) === target) return c;
      }
      // Match por inclusión (ej: "Honorarios médicos" contra "Honorarios")
      for (const c of clases) {
        const nc = norm(c);
        if (target.includes(nc) || nc.includes(target)) return c;
      }
      return null;
    };

    const parsearFilas = (filas) => {
      if (!filas || filas.length === 0) return [];
      const cols = detectarColumnas(filas[0]);
      const datos = cols.hayHeader ? filas.slice(1) : filas;
      const rows = [];
      // Helper para convertir cualquier celda a string razonable (excepto fechas que se manejan aparte)
      const cellToStr = (v) => {
        if (v === null || v === undefined) return '';
        if (v instanceof Date) {
          // Fechas en columnas de texto: convertir a YYYY-MM-DD
          if (isNaN(v.getTime())) return '';
          return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
        }
        return String(v).trim();
      };
      datos.forEach(fila => {
        if (!fila || fila.length === 0) return;
        const clasifRaw = cellToStr(fila[cols.idxSegmento]);                // SEGMENTO del Excel = Clasificación
        const concepto  = cellToStr(fila[cols.idxEgreso]);                  // EGRESOS → concepto principal
        const montoRaw  = cellToStr(fila[cols.idxMonto]);
        const notas     = cellToStr(fila[cols.idxConcepto]);                // CONCEPTO → notas
        // Moneda (opcional): si no viene → fallback global. Si viene texto irreconocible → fallback global + advertencia
        const monedaRaw = cols.idxMoneda >= 0 ? cellToStr(fila[cols.idxMoneda]) : '';
        const monedaParsed = monedaRaw ? matchMoneda(monedaRaw) : null;
        // La fecha puede venir como Date (xlsx con cellDates), número (serial), o string (texto pegado)
        const fechaCelda = cols.idxFecha >= 0 ? fila[cols.idxFecha] : null;
        let fechaParsed = null;
        let fechaRaw = '';
        if (fechaCelda instanceof Date) {
          fechaParsed = parsearFecha(fechaCelda);
          fechaRaw = fechaParsed || '';
        } else if (fechaCelda !== null && fechaCelda !== undefined && String(fechaCelda).trim()) {
          fechaRaw = String(fechaCelda).trim();
          fechaParsed = parsearFecha(fechaRaw);
        }
        const montoNum = parseFloat(montoRaw.replace(/[\$,\s]/g, '')) || 0;
        if (montoNum <= 0 || !concepto) return;
        // Intentar matchear con clasificación oficial (tolerante)
        const clasifValida = matchClasificacion(clasifRaw);
        rows.push({
          clasificacion: clasifValida || '',  // string vacío si no matcheó
          clasifRaw,                          // texto original del Excel (para mostrar la advertencia)
          concepto,
          monto: montoNum,
          notas,
          fecha: fechaParsed,                 // null si no había o no se pudo parsear
          fechaRaw,                           // para mostrar advertencia si no se pudo parsear
          moneda: monedaParsed,               // null si no había o no se pudo parsear → usa global
          monedaRaw,                          // texto original (para advertencia)
        });
      });
      return rows;
    };

    // Parsear texto pegado (TAB-separado, fallback a punto y coma)
    const parsearTexto = (txt) => {
      const lineas = txt.split('\n').map(l => l).filter(l => l.trim());
      const filas = lineas.map(l => l.split(/\t|;/).map(p => p.trim()));
      return parsearFilas(filas);
    };

    const handleParsear = () => {
      const rows = parsearTexto(textoPegado);
      if (rows.length === 0) {
        alert('No se detectaron filas válidas.\n\nFormato esperado (4 columnas TAB-separadas):\nSEGMENTO    EGRESOS    MONTO    CONCEPTO\n\nEjemplo:\nTraslados    Konfio Banco    742130    EDO CTA 14 MZO AL 14 ABR');
        return;
      }
      set('rows', rows);
    };

    // Importar archivo .xlsx
    const handleArchivo = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = new Uint8Array(ev.target.result);
          const wb = XLSX.read(data, { type: 'array', cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          // raw:true → fechas vienen como objetos Date (gracias a cellDates),
          // números como números. Texto sin tocar. Sin reformateo regional.
          const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
          // Filtrar filas completamente vacías
          const filasNoVacias = filas.filter(f => f.some(c => {
            if (c instanceof Date) return true;
            return String(c || '').trim();
          }));
          const rows = parsearFilas(filasNoVacias);
          if (rows.length === 0) {
            alert('No se detectaron filas válidas en el archivo.');
            return;
          }
          set('rows', rows);
        } catch (err) {
          console.error(err);
          alert('Error al leer el archivo: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
      e.target.value = ''; // reset para poder subir el mismo archivo otra vez
    };

    // Descargar plantilla .xlsx con headers y 1 fila de ejemplo
    const descargarPlantilla = () => {
      const data = [
        ['SEGMENTO', 'EGRESOS', 'MONTO', 'MONEDA', 'CONCEPTO', 'FECHA'],
        ['Traslados', 'Konfio Banco', 742130, 'MXN', 'EDO CTA 14 MZO AL 14 ABR', '30/04/2026'],
        ['Reprotección', 'Seguros Ve por Más', 53811.03, 'MXN', 'POLIZA DE SEGURO GMM DIRECCIÓN', '28/04/2026'],
        ['Servicios', 'Hotel Marriott NYC', 1500, 'USD', 'Reserva grupo abril', '25/04/2026'],
        ['', '', '', '', '', ''],
      ];
      const ws = XLSX.utils.aoa_to_sheet(data);
      // Anchos de columna
      ws['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 36 }, { wch: 14 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Otros Pagos');
      XLSX.writeFile(wb, 'Plantilla_Otros_Pagos.xlsx');
    };

    const handleGuardarTodos = async () => {
      if (form.rows.length === 0) { alert('No hay filas para importar'); return; }
      // Validar: cada fila debe tener una clasificación válida
      const filasInvalidas = form.rows.filter(r => !r.clasificacion);
      if (filasInvalidas.length > 0) {
        alert(`Hay ${filasInvalidas.length} fila${filasInvalidas.length === 1 ? '' : 's'} sin clasificación válida.\n\nClic en la columna "Clasificación" de cada fila para asignar una válida (las que están en rojo).`);
        return;
      }
      const ya = !!form._yaPagado;
      // Generar todos los egresos uno por uno
      let folioBase = (() => {
        const todos = ['MXN','USD','EUR'].flatMap(c => invoices[c] || [])
          .filter(i => i.tipo === 'EgresoNF' && i.empresaId === empresaId);
        const numeros = todos.map(i => {
          const m = (i.folio || '').match(/^NF-(\d+)$/);
          return m ? parseInt(m[1], 10) : 0;
        });
        return numeros.length > 0 ? Math.max(...numeros) : 0;
      })();
      const nuevosArr = [];
      for (let idx = 0; idx < form.rows.length; idx++) {
        const r = form.rows[idx];
        folioBase++;
        const folio = `NF-${String(folioBase).padStart(3, '0')}`;
        // Fecha por fila: usa la fecha individual si existe, sino la global
        const fechaFinal = r.fecha || form.fechaPago || today();
        const invObj = {
          id: uid(), tipo: 'EgresoNF',
          fecha: fechaFinal, serie: 'NF', folio, uuid: '',
          proveedor: r.concepto, clasificacion: r.clasificacion,
          subtotal: r.monto, iva: 0, retIsr: 0, retIva: 0, total: r.monto,
          montoPagado: ya ? r.monto : 0,
          concepto: r.concepto,
          diasCredito: 0,
          vencimiento: fechaFinal,
          estatus: ya ? 'Pagado' : 'Pendiente',
          fechaProgramacion: fechaFinal,
          diasFicticios: 0, referencia: '', notas: r.notas || '',
          moneda: r.moneda || form.moneda || 'MXN',
          voBo: true, autorizadoDireccion: true, empresaId,
          categoriaEgreso: r.clasificacion,
          segmentoEgreso: '',
        };
        const saved = await upsertInvoice(invObj);
        nuevosArr.push(saved);
        await addPayment(saved.id, r.monto, fechaFinal,
                         r.notas || r.clasificacion, ya ? 'realizado' : 'programado',
                         form.metodoPago || 'banco');
      }
      // Actualizar estado: agrupar por moneda
      setInvoices(prev => {
        const result = { ...prev };
        nuevosArr.forEach(saved => {
          const c = saved.moneda || 'MXN';
          result[c] = [...(result[c]||[]), saved];
        });
        return result;
      });
      alert(`✅ Se importaron ${nuevosArr.length} egresos correctamente.`);
      setModalImportarEgresos(null);
    };

    return (
      <ModalShell title="📥 Importar Otros Pagos" wide={form.rows.length === 0} extraWide={form.rows.length > 0} onClose={() => setModalImportarEgresos(null)}>
        {form.rows.length === 0 ? (
          <>
            {/* SECCIÓN 1: Estructura del Excel */}
            <div style={{background:'#FAFBFC',border:`1px solid ${C.border}`,borderRadius:10,padding:'14px 16px',marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:800,color:C.navy,marginBottom:10,letterSpacing:0.3}}>
                📋 ESTRUCTURA DEL EXCEL
              </div>
              <div style={{display:'grid',gridTemplateColumns:'auto 1fr',rowGap:8,columnGap:12,fontSize:12}}>
                <div style={{fontWeight:700,color:'#1976D2',whiteSpace:'nowrap'}}>① SEGMENTO</div>
                <div style={{color:'#374151'}}>
                  <b style={{color:'#1B5E20'}}>= Clasificación</b> · debe coincidir con una clasificación configurada — ej: <i style={{color:C.muted}}>Traslados, Reprotección, Servicios, Honorarios</i>
                </div>

                <div style={{fontWeight:700,color:'#1976D2',whiteSpace:'nowrap'}}>② EGRESOS</div>
                <div style={{color:'#374151'}}>Beneficiario o concepto corto — ej: <i style={{color:C.muted}}>Konfio Banco</i></div>

                <div style={{fontWeight:700,color:'#1976D2',whiteSpace:'nowrap'}}>③ MONTO</div>
                <div style={{color:'#374151'}}>Cantidad numérica (sin <code>$</code>) — ej: <i style={{color:C.muted}}>742130</i> o <i style={{color:C.muted}}>742,130.00</i></div>

                <div style={{fontWeight:700,color:'#9E9E9E',whiteSpace:'nowrap'}}>④ MONEDA <span style={{fontSize:10,fontWeight:600}}>(opcional)</span></div>
                <div style={{color:'#374151'}}>Código de moneda — ej: <i style={{color:C.muted}}>MXN, USD, EUR</i> · acepta también: <i style={{color:C.muted}}>Dólar, Pesos, €</i> · si falta, usa la moneda global</div>

                <div style={{fontWeight:700,color:'#1976D2',whiteSpace:'nowrap'}}>⑤ CONCEPTO</div>
                <div style={{color:'#374151'}}>Descripción detallada (notas) — ej: <i style={{color:C.muted}}>EDO CTA 14 MZO AL 14 ABR</i></div>

                <div style={{fontWeight:700,color:'#9E9E9E',whiteSpace:'nowrap'}}>⑥ FECHA <span style={{fontSize:10,fontWeight:600}}>(opcional)</span></div>
                <div style={{color:'#374151'}}>Fecha de pago — ej: <i style={{color:C.muted}}>30/04/2026</i> · si falta, usa la fecha global</div>
              </div>
            </div>

            {/* SECCIÓN 2: Ejemplo visual como tabla */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:6,letterSpacing:0.3}}>
                💡 EJEMPLO DE FILAS VÁLIDAS
              </div>
              <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                  <thead>
                    <tr style={{background:'#E3F2FD'}}>
                      <th style={{padding:'7px 10px',textAlign:'left',fontWeight:700,color:'#0D47A1',fontSize:10,textTransform:'uppercase'}}>Segmento</th>
                      <th style={{padding:'7px 10px',textAlign:'left',fontWeight:700,color:'#0D47A1',fontSize:10,textTransform:'uppercase'}}>Egresos</th>
                      <th style={{padding:'7px 10px',textAlign:'right',fontWeight:700,color:'#0D47A1',fontSize:10,textTransform:'uppercase'}}>Monto</th>
                      <th style={{padding:'7px 10px',textAlign:'center',fontWeight:700,color:'#0D47A1',fontSize:10,textTransform:'uppercase'}}>Moneda</th>
                      <th style={{padding:'7px 10px',textAlign:'left',fontWeight:700,color:'#0D47A1',fontSize:10,textTransform:'uppercase'}}>Concepto</th>
                      <th style={{padding:'7px 10px',textAlign:'center',fontWeight:700,color:'#0D47A1',fontSize:10,textTransform:'uppercase'}}>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{borderBottom:`1px solid ${C.border}`,background:'#fff'}}>
                      <td style={{padding:'7px 10px',fontWeight:600,color:'#1B5E20'}}>Traslados</td>
                      <td style={{padding:'7px 10px',fontWeight:600}}>Konfio Banco</td>
                      <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'monospace'}}>742,130.00</td>
                      <td style={{padding:'7px 10px',textAlign:'center',fontFamily:'monospace',fontWeight:700}}>MXN</td>
                      <td style={{padding:'7px 10px',color:C.muted}}>EDO CTA 14 MZO AL 14 ABR</td>
                      <td style={{padding:'7px 10px',textAlign:'center',fontFamily:'monospace'}}>30/04/2026</td>
                    </tr>
                    <tr style={{borderBottom:`1px solid ${C.border}`,background:'#FAFBFC'}}>
                      <td style={{padding:'7px 10px',fontWeight:600,color:'#1B5E20'}}>Reprotección</td>
                      <td style={{padding:'7px 10px',fontWeight:600}}>Seguros Ve por Más</td>
                      <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'monospace'}}>53,811.03</td>
                      <td style={{padding:'7px 10px',textAlign:'center',fontFamily:'monospace',fontWeight:700}}>MXN</td>
                      <td style={{padding:'7px 10px',color:C.muted}}>POLIZA DE SEGURO GMM DIRECCIÓN</td>
                      <td style={{padding:'7px 10px',textAlign:'center',fontFamily:'monospace'}}>28/04/2026</td>
                    </tr>
                    <tr style={{background:'#fff'}}>
                      <td style={{padding:'7px 10px',fontWeight:600,color:'#1B5E20'}}>Servicios</td>
                      <td style={{padding:'7px 10px',fontWeight:600}}>Hotel Marriott NYC</td>
                      <td style={{padding:'7px 10px',textAlign:'right',fontFamily:'monospace'}}>1,500.00</td>
                      <td style={{padding:'7px 10px',textAlign:'center',fontFamily:'monospace',fontWeight:700,color:'#2E7D32'}}>USD</td>
                      <td style={{padding:'7px 10px',color:C.muted}}>Reserva grupo abril</td>
                      <td style={{padding:'7px 10px',textAlign:'center',fontFamily:'monospace'}}>25/04/2026</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{fontSize:11,color:C.muted,marginTop:6}}>
                Formatos de fecha aceptados: <code>30/04/2026</code> · <code>2026-04-30</code> · <code>30-Abr-2026</code> · Monedas: <code>MXN, USD, EUR</code> (también acepta <i>Dólar, Pesos, €</i>)
              </div>
            </div>

            {/* Botón descargar plantilla */}
            <div style={{marginBottom:14,textAlign:'right'}}>
              <button onClick={descargarPlantilla}
                style={{background:'transparent',color:'#1976D2',border:`1px solid #1976D2`,padding:'6px 14px',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                ⬇ Descargar plantilla .xlsx
              </button>
            </div>

            {/* SECCIÓN 3: Métodos de importación lado a lado */}
            <div style={{fontSize:12,fontWeight:800,color:C.navy,marginBottom:10,letterSpacing:0.3,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
              ELEGIR MÉTODO DE IMPORTACIÓN
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
              {/* Método 1: subir archivo */}
              <div style={{background:'#E0F2F1',border:'1px solid #80CBC4',borderRadius:10,padding:14,display:'flex',flexDirection:'column',gap:8}}>
                <div style={{fontSize:13,fontWeight:800,color:'#00695C'}}>📁 Subir archivo</div>
                <div style={{fontSize:11,color:'#00695C',opacity:0.85,minHeight:30}}>
                  Sube tu archivo <code>.xlsx</code> o <code>.xls</code> directamente.
                </div>
                <label style={{background:'#00897B',color:'#fff',border:'none',padding:'9px 14px',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',textAlign:'center'}}>
                  Seleccionar archivo
                  <input type="file" accept=".xlsx,.xls" onChange={handleArchivo} style={{display:'none'}}/>
                </label>
              </div>
              {/* Método 2: pegar texto */}
              <div style={{background:'#E3F2FD',border:'1px solid #90CAF9',borderRadius:10,padding:14,display:'flex',flexDirection:'column',gap:8}}>
                <div style={{fontSize:13,fontWeight:800,color:'#0D47A1'}}>✏️ Pegar datos</div>
                <div style={{fontSize:11,color:'#0D47A1',opacity:0.85,minHeight:30}}>
                  Copia las celdas desde Excel y pégalas aquí (separadas por TAB).
                </div>
                <textarea value={textoPegado} onChange={e => setTextoPegado(e.target.value)}
                  placeholder={`SEGMENTO\tEGRESOS\tMONTO\tMONEDA\tCONCEPTO\tFECHA\nTraslados\tKonfio Banco\t742130\tMXN\tEDO CTA 14 MZO AL 14 ABR\t30/04/2026\nServicios\tHotel Marriott NYC\t1500\tUSD\tReserva grupo abril\t25/04/2026`}
                  style={{...inputStyle, minHeight: 90, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre', background:'#fff'}}/>
                <button onClick={handleParsear}
                  style={{background:'#1976D2',color:'#fff',border:'none',padding:'9px 14px',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}
                  disabled={!textoPegado.trim()}>
                  Procesar datos →
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:14,marginBottom:14}}>
              <Field label="Fecha global (fallback)">
                <input type="date" value={form.fechaPago} onChange={e => set('fechaPago', e.target.value)} style={inputStyle}
                  title="Esta fecha se usa para las filas que NO tengan fecha individual en el Excel"/>
              </Field>
              <Field label="Moneda global (fallback)">
                <select value={form.moneda} onChange={e => set('moneda', e.target.value)} style={inputStyle}
                  title="Esta moneda se usa para las filas que NO tengan moneda individual en el Excel">
                  <option value="MXN">MXN</option><option value="USD">USD</option><option value="EUR">EUR</option>
                </select>
              </Field>
              <Field label="Estado del pago">
                <select value={form._yaPagado ? 'pagado' : 'programado'}
                  onChange={e => set('_yaPagado', e.target.value === 'pagado')} style={inputStyle}>
                  <option value="pagado">✅ Ya pagado</option>
                  <option value="programado">📅 Programado</option>
                </select>
              </Field>
              <Field label="Método de pago">
                <select value={form.metodoPago} onChange={e => set('metodoPago', e.target.value)} style={inputStyle}>
                  <option value="banco">🏦 Banco</option>
                  <option value="tdc">💳 TDC</option>
                  <option value="otro">➕ Otro</option>
                </select>
              </Field>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <div style={{fontSize:13,fontWeight:700,color:C.navy}}>
                Vista previa · {form.rows.length} {form.rows.length===1?'fila':'filas'}
              </div>
              {(() => {
                const conFecha = form.rows.filter(r => r.fecha).length;
                const sinFecha = form.rows.length - conFecha;
                const conClasif = form.rows.filter(r => r.clasificacion).length;
                const sinClasif = form.rows.length - conClasif;
                const conMoneda = form.rows.filter(r => r.moneda).length;
                const sinMoneda = form.rows.length - conMoneda;
                const monedasInvalidas = form.rows.filter(r => r.monedaRaw && !r.moneda).length;
                if (form.rows.length === 0) return null;
                return (
                  <div style={{fontSize:11,color:C.muted,display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                    {sinClasif > 0 && (
                      <span style={{color:'#C62828',fontWeight:700,background:'#FFEBEE',padding:'2px 8px',borderRadius:6}}>
                        ⚠️ {sinClasif} sin clasificación válida
                      </span>
                    )}
                    {conClasif === form.rows.length && form.rows.length > 0 && (
                      <span style={{color:'#1B5E20',fontWeight:700,background:'#E8F5E9',padding:'2px 8px',borderRadius:6}}>
                        ✅ Todas con clasificación
                      </span>
                    )}
                    <span>·</span>
                    {conFecha > 0 && <span style={{color:'#1B5E20',fontWeight:600}}>📅 {conFecha} con fecha</span>}
                    {conFecha > 0 && sinFecha > 0 && <span>·</span>}
                    {sinFecha > 0 && <span style={{color:'#E65100',fontWeight:600}}>{sinFecha} usarán fecha global</span>}
                    <span>·</span>
                    {conMoneda > 0 && <span style={{color:'#1B5E20',fontWeight:600}}>💱 {conMoneda} con moneda</span>}
                    {(conMoneda > 0 && sinMoneda > 0) && <span>·</span>}
                    {sinMoneda > 0 && <span style={{color:'#E65100',fontWeight:600}}>{sinMoneda} usarán moneda global</span>}
                    {monedasInvalidas > 0 && (
                      <>
                        <span>·</span>
                        <span style={{color:'#C62828',fontWeight:700,background:'#FFEBEE',padding:'2px 6px',borderRadius:4}}>⚠ {monedasInvalidas} moneda no reconocida</span>
                      </>
                    )}
                    <span style={{color:C.muted,fontStyle:'italic'}}>· clic en una celda para editar</span>
                  </div>
                );
              })()}
            </div>

            {/* Toolbar de edición masiva (aparece cuando hay filas seleccionadas) */}
            {selectedRows.size > 0 && (
              <div style={{background:'#FFF8E1',border:'1px solid #FFE082',borderRadius:8,padding:'10px 12px',marginBottom:8,display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
                <div style={{fontSize:12,fontWeight:800,color:'#E65100',whiteSpace:'nowrap'}}>
                  ☑️ {selectedRows.size} seleccionada{selectedRows.size === 1 ? '' : 's'} · Aplicar a todas:
                </div>
                <select value={bulkClasifNF} onChange={e => { const v = e.target.value; setBulkClasifNF(''); if (v) aplicarMasivo('clasificacion', v); }}
                  style={{...inputStyle, width:'auto', minWidth:160, fontSize:11, padding:'5px 8px'}}>
                  <option value="">Clasificación…</option>
                  {clases.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="date" value={bulkFecha} onChange={e => { const v = e.target.value; setBulkFecha(''); if (v) aplicarMasivo('fecha', v); }}
                  style={{...inputStyle, width:150, fontSize:11, padding:'5px 8px'}}
                  title="Aplicar esta fecha a las filas seleccionadas"/>
                <span style={{fontSize:10,color:'#9E9E9E',marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}>
                  <button onClick={clearSelection} style={{background:'transparent',border:'none',color:'#1976D2',cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:'inherit'}}>
                    Limpiar selección
                  </button>
                  <button onClick={eliminarSeleccionadas} style={{background:'#C62828',color:'#fff',border:'none',padding:'5px 10px',borderRadius:6,fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                    🗑️ Eliminar {selectedRows.size}
                  </button>
                </span>
              </div>
            )}

            <div style={{maxHeight:380,overflow:'auto',border:`1px solid ${C.border}`,borderRadius:8}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{background:'#F8FAFC',position:'sticky',top:0,zIndex:1}}>
                    <th style={{padding:'8px',textAlign:'center',borderBottom:`1px solid ${C.border}`,width:36}}>
                      <input
                        type="checkbox"
                        checked={selectedRows.size === form.rows.length && form.rows.length > 0}
                        ref={el => { if (el) el.indeterminate = selectedRows.size > 0 && selectedRows.size < form.rows.length; }}
                        onChange={toggleSelectAll}
                        style={{cursor:'pointer'}}
                        title={selectedRows.size === form.rows.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                      />
                    </th>
                    <th style={{padding:'8px',textAlign:'left',borderBottom:`1px solid ${C.border}`,width:170}}>Clasificación</th>
                    <th style={{padding:'8px',textAlign:'left',borderBottom:`1px solid ${C.border}`}}>Concepto</th>
                    <th style={{padding:'8px',textAlign:'right',borderBottom:`1px solid ${C.border}`,width:120}}>Monto</th>
                    <th style={{padding:'8px',textAlign:'center',borderBottom:`1px solid ${C.border}`,width:90}}>Moneda</th>
                    <th style={{padding:'8px',textAlign:'left',borderBottom:`1px solid ${C.border}`}}>Notas</th>
                    <th style={{padding:'8px',textAlign:'center',borderBottom:`1px solid ${C.border}`,width:150}}>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {form.rows.map((r, i) => {
                    const fechaUsada = r.fecha || form.fechaPago || today();
                    const usaFechaIndividual = !!r.fecha;
                    const errorParseo = r.fechaRaw && !r.fecha;
                    const isSelected = selectedRows.has(i);
                    const isEditing = (col) => editingCell && editingCell.rowIdx === i && editingCell.col === col;
                    const cellStyle = (extra={}) => ({
                      padding:'7px 8px',
                      cursor:'pointer',
                      borderRight:'1px solid transparent',
                      ...extra,
                    });
                    const editInputStyle = {
                      width:'100%',
                      padding:'5px 6px',
                      border:'1px solid #1976D2',
                      borderRadius:4,
                      fontSize:12,
                      fontFamily:'inherit',
                      outline:'none',
                      background:'#fff',
                      boxSizing:'border-box',
                    };
                    const handleKey = (e) => {
                      if (e.key === 'Enter') saveEdit();
                      if (e.key === 'Escape') cancelEdit();
                    };
                    return (
                      <tr key={i} style={{
                        borderBottom:`1px solid ${C.border}`,
                        background: isSelected ? '#FFF8E1' : (i % 2 === 0 ? '#fff' : '#FAFBFC'),
                      }}>
                        <td style={{padding:'7px',textAlign:'center'}}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelectRow(i)} style={{cursor:'pointer'}}/>
                        </td>
                        {/* Clasificación (con dropdown nativo, badge en rojo si inválida) */}
                        <td style={{padding:'5px 6px'}}>
                          {(() => {
                            const esValida = !!r.clasificacion;
                            return (
                              <select
                                value={r.clasificacion || ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  set('rows', form.rows.map((rr, j) => j === i ? { ...rr, clasificacion: v, clasifRaw: v } : rr));
                                }}
                                title={esValida ? `Clasificación: ${r.clasificacion}` : `"${r.clasifRaw || '(vacío)'}" no es una clasificación válida. Clic para elegir una.`}
                                style={{
                                  width:'100%',
                                  fontSize:11,
                                  padding:'5px 6px',
                                  border:`1px solid ${esValida ? '#A5D6A7' : '#C62828'}`,
                                  borderRadius:5,
                                  background: esValida ? '#E8F5E9' : '#FFEBEE',
                                  color: esValida ? '#1B5E20' : '#C62828',
                                  fontFamily:'inherit',
                                  outline:'none',
                                  fontWeight: esValida ? 700 : 600,
                                  boxSizing:'border-box',
                                  cursor:'pointer',
                                }}
                              >
                                <option value="">— Seleccionar —</option>
                                {clases.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            );
                          })()}
                          {!r.clasificacion && r.clasifRaw && (
                            <div title={`Texto original: ${r.clasifRaw}`} style={{fontSize:9,color:'#C62828',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                              ⚠ "{r.clasifRaw}"
                            </div>
                          )}
                        </td>
                        {/* Concepto */}
                        <td style={cellStyle({fontWeight:600})} onClick={() => !isEditing('concepto') && startEdit(i, 'concepto')}>
                          {isEditing('concepto') ? (
                            <input autoFocus value={editingValue} onChange={e => setEditingValue(e.target.value)}
                              onBlur={saveEdit} onKeyDown={handleKey} style={editInputStyle}/>
                          ) : (
                            <span>{r.concepto || <span style={{color:'#D1D5DB',fontWeight:400}}>clic para editar…</span>}</span>
                          )}
                        </td>
                        {/* Monto */}
                        <td style={cellStyle({textAlign:'right',fontFamily:'monospace',fontWeight:700,color:'#C62828'})}
                          onClick={() => !isEditing('monto') && startEdit(i, 'monto')}>
                          {isEditing('monto') ? (
                            <input autoFocus type="number" step="0.01" min="0" value={editingValue}
                              onChange={e => setEditingValue(e.target.value)}
                              onBlur={saveEdit} onKeyDown={handleKey}
                              style={{...editInputStyle, textAlign:'right', fontFamily:'monospace'}}/>
                          ) : (
                            <span>${fmt(r.monto)}</span>
                          )}
                        </td>
                        {/* Moneda — siempre editable como dropdown */}
                        <td style={{padding:'4px 6px',textAlign:'center'}}>
                          {(() => {
                            const monedaUsada = r.moneda || form.moneda || 'MXN';
                            const usaMonedaIndividual = !!r.moneda;
                            const errorParseo = r.monedaRaw && !r.moneda;
                            return (
                              <>
                                <select
                                  value={monedaUsada}
                                  onChange={(e) => {
                                    const nueva = e.target.value;
                                    set('rows', form.rows.map((rr, j) => j === i ? { ...rr, moneda: nueva, monedaRaw: nueva } : rr));
                                  }}
                                  title={errorParseo ? `No se reconoció "${r.monedaRaw}". Edita aquí.` : (usaMonedaIndividual ? 'Moneda del Excel' : 'Moneda global (no había en Excel)')}
                                  style={{
                                    fontSize:11,
                                    padding:'4px 6px',
                                    border:`1px solid ${errorParseo ? '#C62828' : (usaMonedaIndividual ? '#1B5E20' : '#E5E7EB')}`,
                                    borderRadius:5,
                                    background: errorParseo ? '#FFEBEE' : (usaMonedaIndividual ? '#E8F5E9' : '#F8FAFC'),
                                    fontFamily:'inherit',
                                    outline:'none',
                                    width:'100%',
                                    boxSizing:'border-box',
                                    fontWeight: usaMonedaIndividual ? 700 : 400,
                                    cursor:'pointer',
                                  }}
                                >
                                  <option value="MXN">MXN</option>
                                  <option value="USD">USD</option>
                                  <option value="EUR">EUR</option>
                                </select>
                                {errorParseo && (
                                  <div title={`Texto original: ${r.monedaRaw}`} style={{fontSize:9,color:'#C62828',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>⚠ "{r.monedaRaw}"</div>
                                )}
                              </>
                            );
                          })()}
                        </td>
                        {/* Notas */}
                        <td style={cellStyle({color:C.muted})} onClick={() => !isEditing('notas') && startEdit(i, 'notas')}>
                          {isEditing('notas') ? (
                            <input autoFocus value={editingValue} onChange={e => setEditingValue(e.target.value)}
                              onBlur={saveEdit} onKeyDown={handleKey} style={editInputStyle}/>
                          ) : (
                            <span style={{color: r.notas ? C.muted : '#D1D5DB'}}>{r.notas || 'clic para editar…'}</span>
                          )}
                        </td>
                        {/* Fecha (sigue siendo date picker directo) */}
                        <td style={{padding:'4px 6px',textAlign:'center'}}>
                          <input
                            type="date"
                            value={fechaUsada}
                            onChange={(e) => {
                              const nueva = e.target.value;
                              set('rows', form.rows.map((rr, j) => j === i ? { ...rr, fecha: nueva || null, fechaRaw: nueva || '' } : rr));
                            }}
                            title={errorParseo ? `No se pudo interpretar "${r.fechaRaw}". Edita aquí.` : (usaFechaIndividual ? 'Fecha del Excel' : 'Fecha global (no había en Excel)')}
                            style={{
                              fontSize:11,
                              padding:'4px 6px',
                              border:`1px solid ${errorParseo ? '#C62828' : (usaFechaIndividual ? '#1B5E20' : '#E5E7EB')}`,
                              borderRadius:5,
                              background: errorParseo ? '#FFEBEE' : (usaFechaIndividual ? '#E8F5E9' : '#F8FAFC'),
                              fontFamily:'inherit',
                              outline:'none',
                              width:'100%',
                              boxSizing:'border-box',
                              fontWeight: usaFechaIndividual ? 700 : 400,
                            }}
                          />
                          {errorParseo && (
                            <div title={`Texto original: ${r.fechaRaw}`} style={{fontSize:9,color:'#C62828',marginTop:2}}>⚠ "{r.fechaRaw}"</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{background:'#FFEBEE',borderTop:`2px solid #C62828`}}>
                    <td/>
                    <td colSpan={2} style={{padding:'10px',fontWeight:700,color:'#C62828'}}>TOTAL</td>
                    <td style={{padding:'10px',textAlign:'right',fontFamily:'monospace',fontWeight:800,color:'#C62828'}}>
                      ${fmt(form.rows.reduce((s, r) => s + r.monto, 0))}
                    </td>
                    <td colSpan={3}/>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',gap:10,marginTop:18}}>
              <button onClick={() => set('rows', [])} style={{...btnStyle, background:'#F1F5F9', color:C.text}}>← Volver a editar</button>
              <button onClick={handleGuardarTodos} style={{...btnStyle, background:'#C62828', padding:'9px 24px'}}>
                💾 Guardar {form.rows.length} egresos
              </button>
            </div>
          </>
        )}
      </ModalShell>
    );
  };

  const SupplierModal = () => {
    const [form,setForm]=useState({...modalSup});
    const set=(k,v)=>setForm(f=>({...f,[k]:v}));
    return (
      <ModalShell title={form.id?"Editar Proveedor":"Nuevo Proveedor"} onClose={()=>setModalSup(null)}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <Field label="Nombre"><input value={form.nombre} onChange={e=>set("nombre",e.target.value)} style={inputStyle}/></Field>
          <Field label="RFC"><input value={form.rfc} onChange={e=>set("rfc",e.target.value)} style={inputStyle}/></Field>
          <Field label="Moneda"><select value={form.moneda} onChange={e=>set("moneda",e.target.value)} style={selectStyle}>{["MXN","USD","EUR"].map(m=><option key={m}>{m}</option>)}</select></Field>
          <Field label="Días Crédito"><input type="number" value={form.diasCredito} onChange={e=>set("diasCredito",e.target.value)} style={inputStyle}/></Field>
          <Field label="Contacto"><input value={form.contacto} onChange={e=>set("contacto",e.target.value)} style={inputStyle}/></Field>
          <Field label="Teléfono"><input value={form.telefono} onChange={e=>set("telefono",e.target.value)} style={inputStyle}/></Field>
          <Field label="Email"><input value={form.email} onChange={e=>set("email",e.target.value)} style={inputStyle}/></Field>
          <Field label="Banco"><input value={form.banco} onChange={e=>set("banco",e.target.value)} style={inputStyle}/></Field>
          <Field label="CLABE"><input value={form.clabe} onChange={e=>set("clabe",e.target.value)} style={inputStyle}/></Field>
          <Field label="Clasificación"><select value={form.clasificacion} onChange={e=>set("clasificacion",e.target.value)} style={selectStyle}>{clases.map(c=><option key={c}>{c}</option>)}</select></Field>
          <Field label="Grupo Empresarial">
            <input value={form.grupo||""} onChange={e=>set("grupo",e.target.value)} style={inputStyle} placeholder="Ej. Grupo Krystal, Grupo Kavia…"/>
          </Field>
          <Field label="Activo"><select value={form.activo?"Sí":"No"} onChange={e=>set("activo",e.target.value==="Sí")} style={selectStyle}><option>Sí</option><option>No</option></select></Field>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
          <button onClick={()=>setModalSup(null)} style={{...btnStyle,background:"#F1F5F9",color:C.text}}>Cancelar</button>
          <button onClick={()=>saveSupplier(form)} style={btnStyle}>Guardar</button>
        </div>
      </ModalShell>
    );
  };

  /* ═══════════════════════════════════════════════════════════════════════
     LAYOUT
     ═══════════════════════════════════════════════════════════════════════ */
  if(loading) return (
    <div style={{display:"flex",height:"100vh",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans','Segoe UI',sans-serif",background:C.cream}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:56,marginBottom:16}}>✈️</div>
        <div style={{fontSize:20,fontWeight:800,color:C.navy,marginBottom:8}}>Viajes Libero</div>
        <div style={{fontSize:14,color:C.muted}}>Cargando datos…</div>
      </div>
    </div>
  );

  return (
    <div style={{display:"flex",height:"100vh",fontFamily:"'DM Sans','Segoe UI',sans-serif",background:C.cream,color:C.text,overflow:"hidden"}}>
      {/* Sidebar */}
      <aside style={{width:220,background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",padding:"24px 12px",flexShrink:0}}>
        <div style={{padding:"0 8px 16px",borderBottom:`1px solid ${C.border}`,marginBottom:12}}>
          {/* Logo de empresa */}
          <div style={{display:"flex",justifyContent:"center",marginBottom:10}}>
            <img src={empresa.logo} alt={empresa.nombre}
              style={{maxWidth:140,maxHeight:48,objectFit:"contain",borderRadius:6}}/>
          </div>
          {/* Selector de empresa */}
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {EMPRESAS.map(e=>(
              <button key={e.id} onClick={()=>{
                sessionStorage.setItem("cxp_empresa", e.id);
                setEmpresaId(e.id);
                setView("dashboard");
              }} style={{
                display:"flex",alignItems:"center",gap:8,width:"100%",padding:"6px 10px",
                borderRadius:8,border:`2px solid ${empresaId===e.id?e.color:C.border}`,
                background:empresaId===e.id?`${e.color}18`:"transparent",
                cursor:"pointer",fontFamily:"inherit",transition:"all .15s",
              }}>
                <div style={{width:8,height:8,borderRadius:"50%",background:e.color,flexShrink:0}}/>
                <span style={{fontSize:11,fontWeight:empresaId===e.id?800:500,color:empresaId===e.id?e.color:C.muted,textAlign:"left",lineHeight:1.2}}>{e.nombre}</span>
                {empresaId===e.id && <span style={{marginLeft:"auto",fontSize:10,color:e.color}}>●</span>}
              </button>
            ))}
          </div>
        </div>
        <NavItem id="dashboard" icon="📊" label="Dashboard"/>
        <NavItem id="cartera" icon="🧾" label="Cartera (CxP)"/>
        <NavItem id="pagos" icon="💰" label="Pagos"/>
        <NavItem id="proyeccion" icon="📅" label="Proyección"/>
        <NavItem id="reporte" icon="📊" label="Reporte Diario"/>
        <NavItem id="importar" icon="📥" label="Importar"/>
        <NavItem id="proveedores" icon="🏢" label="Proveedores"/>
        <NavItem id="saldos" icon="🏦" label="Saldos Bancarios"/>
        {empresaId === "empresa_2" && (
          <NavItem id="flujo_efectivo" icon="💧" label="Flujo de Efectivo"/>
        )}
        <NavItem id="reportes" icon="📊" label="Reportes"/>
        <NavItem id="cxc" icon="💵" label="CxC — Ingresos"/>
        <NavItem id="clientes" icon="👥" label="Clientes CxC"/>
        <NavItem id="config" icon="⚙️" label="Configuración"/>
        {kpis.vencidas>0 && (
          <div style={{marginTop:12,background:"#FFF5F5",border:"1px solid #FFCDD2",borderRadius:10,padding:"10px 12px",fontSize:12}}>
            <div style={{fontWeight:700,color:C.danger}}>⚠️ {kpis.vencidas} factura{kpis.vencidas!==1?"s":""} vencida{kpis.vencidas!==1?"s":""}</div>
          </div>
        )}
        {ingresos.length > 0 && (() => {
          const porCobrar = ingresos.filter(ing => {
            const cobrado = cobros.filter(c=>c.ingresoId===ing.id).reduce((s,c)=>s+c.monto,0);
            return cobrado < ing.monto;
          }).length;
          if (porCobrar === 0) return null;
          return (
            <div style={{marginTop:8,background:"#E0F2F1",border:"1px solid #80CBC4",borderRadius:10,padding:"10px 12px",fontSize:12}}>
              <div style={{fontWeight:700,color:C.teal}}>💵 {porCobrar} ingreso{porCobrar!==1?"s":""} por cobrar</div>
            </div>
          );
        })()}
        {/* User info & logout */}
        <div style={{marginTop:"auto",borderTop:`1px solid ${C.border}`,paddingTop:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"0 8px",marginBottom:10}}>
            <div style={{width:32,height:32,borderRadius:"50%",background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:14}}>
              {(user?.nombre||"U").charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:C.navy}}>{user?.nombre||"Usuario"}</div>
              <div style={{fontSize:10,color:C.muted,textTransform:"capitalize"}}>{user?.rol||"usuario"}</div>
            </div>
          </div>
          <button onClick={onLogout} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"8px 16px",borderRadius:10,border:"none",cursor:"pointer",background:"#FFF5F5",color:C.danger,fontWeight:600,fontSize:13,fontFamily:"inherit"}}>
            🚪 Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{flex:1,overflowY:"auto",padding:32}}>
        {view==="dashboard" && renderDashboard()}
        {view==="cartera" && renderCartera()}
        {view==="pagos" && renderPagos()}
        {view==="proveedores" && renderProveedores()}
        {view==="proyeccion" && renderProyeccionCxP()}
        {view==="reporte" && <ReporteDiarioCxP />}
        {view==="importar" && renderImportar()}
        {view==="config" && renderConfig()}
        {view==="saldos" && <SaldosBancarios />}
        {view==="flujo_efectivo" && empresaId === "empresa_2" && (
          <FlujoIngresos
            empresaId={empresaId}
            invoices={invoices}
            payments={payments}
          />
        )}
        {view==="reportes" && (
          <ReportesView
            empresaId={empresaId}
            user={user}
            esConsulta={esConsulta}
          />
        )}
        {view==="cxc" && (
          <CxcView
            invoices={invoices}
            payments={payments}
            ingresos={ingresos}
            setIngresos={setIngresos}
            cobros={cobros}
            setCobros={setCobros}
            invoiceIngresos={invoiceIngresos}
            setInvoiceIngresos={setInvoiceIngresos}
            categorias={categoriasIngreso}
            setCategorias={setCategoriasIngreso}
            empresaId={empresaId}
            clientes={clientes}
            esConsulta={esConsulta}
            porFacturar={porFacturar}
            setPorFacturar={setPorFacturar}
            insertPorFacturar={insertPorFacturar}
            updatePorFacturar={updatePorFacturar}
            deletePorFacturar={deletePorFacturar}
            bulkInsertPorFacturar={bulkInsertPorFacturar}
            bulkInsertPorFacturarPlain={bulkInsertPorFacturarPlain}
          />
        )}

        {view==="clientes" && (
          <ClientesView
            clientes={clientes}
            setClientes={setClientes}
            empresaId={empresaId}
            esConsulta={esConsulta}
          />
        )}
      </main>

      {/* Modals */}
      {modalInv && <InvoiceModal/>}
      {modalEgreso && <EgresoModal/>}
      {modalImportarEgresos && <ImportarEgresosModal/>}
      {modalListaNF && (
        <EgresosNFModal
          egresos={['MXN','USD','EUR'].flatMap(c => (invoices[c]||[]).map(i => ({...i, moneda:c}))).filter(i => i.tipo === 'EgresoNF' && i.empresaId === empresaId)}
          payments={payments}
          currency={currency}
          onClose={() => setModalListaNF(false)}
          onNuevo={() => {
            setModalListaNF(false);
            setModalEgreso({
              _esNuevo: true, _yaPagado: true,
              fecha: today(), categoriaEgreso: '', segmentoEgreso: '',
              concepto: '', total: '', moneda: currency,
              fechaProgramacion: today(), metodoPago: 'banco', notas: '',
            });
          }}
          onImportar={() => {
            setModalListaNF(false);
            setModalImportarEgresos({ rows: [], categoriaEgreso: '', metodoPago: 'banco', fechaPago: today(), moneda: currency, _yaPagado: true });
          }}
          onEditar={(eg) => {
            setModalListaNF(false);
            setModalEgreso({
              ...eg,
              _esNuevo: false,
              _yaPagado: eg.estatus === 'Pagado' || (+eg.montoPagado > 0),
              fechaProgramacion: eg.fechaProgramacion || eg.fecha,
              metodoPago: 'banco',
            });
          }}
          onPagos={(eg) => {
            setModalListaNF(false);
            setPayModal({ invoiceId: eg.id, proveedor: eg.proveedor, folio: eg.folio, total: eg.total, moneda: eg.moneda || currency });
          }}
          onEliminar={(eg) => {
            if (!confirm(`¿Eliminar el egreso ${eg.folio} (${eg.concepto || eg.proveedor})?\n\nEsta acción no se puede deshacer.`)) return;
            setInvoices(prev => ({ ...prev, [eg.moneda || currency]: (prev[eg.moneda || currency] || []).filter(i => i.id !== eg.id) }));
            deleteInvoiceDB(eg.id);
          }}
          onAplicarPagosMasivos={async (egresosArr, fecha, metodo, notas) => {
            // Aplica un pago realizado a cada egreso por su saldo pendiente individual
            let aplicados = 0;
            for (const eg of egresosArr) {
              const saldoPend = Math.max(0, (+eg.total || 0) - (+eg.montoPagado || 0));
              if (saldoPend <= 0) continue;
              await addPayment(eg.id, saldoPend, fecha, notas || 'Pago masivo', 'realizado', metodo);
              aplicados++;
            }
            alert(`✅ Se aplicaron ${aplicados} pago${aplicados === 1 ? '' : 's'} correctamente.`);
          }}
        />
      )}
      {modalSup && <SupplierModal/>}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <ModalShell title="Confirmar Eliminación" onClose={()=>setDeleteConfirm(null)}>
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:48,marginBottom:16}}>🗑️</div>
            <p style={{fontSize:16,color:C.text,marginBottom:8}}>¿Estás seguro de eliminar esta factura?</p>
            <p style={{fontSize:14,fontWeight:700,color:C.navy,marginBottom:24}}>{deleteConfirm.label}</p>
            <p style={{fontSize:13,color:C.danger,marginBottom:24}}>Esta acción no se puede deshacer.</p>
            <div style={{display:"flex",gap:12,justifyContent:"center"}}>
              <button onClick={()=>setDeleteConfirm(null)} style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"10px 32px"}}>Cancelar</button>
              <button onClick={confirmDelete} style={{...btnStyle,background:C.danger,padding:"10px 32px"}}>Sí, Eliminar</button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Duplicates modal */}
      {showDupes && (
        <ModalShell title="Folios Duplicados" onClose={()=>setShowDupes(false)} wide>
          <p style={{fontSize:13,color:C.muted,marginBottom:16}}>Selecciona las facturas duplicadas que deseas eliminar. Se agrupan por folio.</p>
          {Object.entries(duplicates).map(([folio, invs]) => (
            <div key={folio} style={{marginBottom:20}}>
              <div style={{background:"#FFEBEE",padding:"8px 14px",borderRadius:8,marginBottom:6,fontWeight:700,color:C.danger,fontSize:14}}>
                Folio: {folio} — {invs.length} facturas
              </div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead><tr style={{background:"#F8FAFC"}}>
                  {["Fecha","Proveedor","Total","Moneda","Estatus","Eliminar"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"left",color:C.muted,fontWeight:600,fontSize:11,textTransform:"uppercase"}}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {invs.map(inv=>(
                    <tr key={inv.id} style={{borderTop:`1px solid ${C.border}`}}>
                      <td style={{padding:"8px 10px"}}>{inv.fecha}</td>
                      <td style={{padding:"8px 10px",fontWeight:600}}>{inv.proveedor}</td>
                      <td style={{padding:"8px 10px",fontWeight:700}}>${fmt(inv.total)}</td>
                      <td style={{padding:"8px 10px"}}><span style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[inv.moneda],color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[inv.moneda],padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700}}>{inv.moneda}</span></td>
                      <td style={{padding:"8px 10px"}}><span style={{color:statusColor(inv.estatus),fontWeight:700}}>{inv.estatus}</span></td>
                      <td style={{padding:"8px 10px"}}>
                        {!esConsulta && <button onClick={()=>{deleteInvoice(inv.id,inv.moneda);}} style={{...btnStyle,background:C.danger,padding:"4px 14px",fontSize:12}}>🗑️ Eliminar</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {Object.keys(duplicates).length===0 && (
            <div style={{textAlign:"center",padding:30,color:C.ok}}>✅ No hay folios duplicados</div>
          )}
        </ModalShell>
      )}

      {/* Projection detail modal */}
      {projDetail && (
        <ModalShell title={`Detalle — ${projDetail.proveedor}`} onClose={()=>setProjDetail(null)} extraWide>
          <div style={{marginBottom:16}}>
            <span style={{fontSize:14,color:C.muted}}>Fecha: </span>
            <span style={{fontWeight:700,color:C.navy}}>{fmtDateLabel(projDetail.fecha)}</span>
            <span style={{marginLeft:16,fontSize:14,color:C.muted}}>Total: </span>
            <span style={{fontWeight:800,color:C.blue,fontSize:18}}>${fmt(projDetail.invoices.reduce((s,i)=>s+i.saldo,0))}</span>
          </div>
          <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr style={{background:"#F8FAFC"}}>
              {["Folio","Concepto","Clasificación","Fecha","Total","Pagado","Pago Programado","Importe Pendiente","Vencimiento","Moneda"].map(h=><th key={h} style={{padding:"10px 12px",textAlign:"left",color:C.muted,fontWeight:600,fontSize:11,textTransform:"uppercase"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {projDetail.invoices.map(inv=>{
                // inv.saldo = monto programado a pagar en esta fecha
                // Importe pendiente DESPUÉS de aplicar este pago = Total - Pagado previo - Pago programado
                const pendienteDespues = Math.max(0, (+inv.total||0) - (+inv.montoPagado||0) - (+inv.saldo||0));
                return (
                  <tr key={inv.id} style={{borderTop:`1px solid ${C.border}`}}>
                    <td style={{padding:"10px 12px",fontWeight:600,whiteSpace:"nowrap"}}>{inv.serie}{inv.folio}</td>
                    <td style={{padding:"10px 12px",color:inv.concepto?C.text:C.muted,fontStyle:inv.concepto?"normal":"italic"}}>{inv.concepto||"—"}</td>
                    <td style={{padding:"10px 12px"}}><span style={{background:"#EEF2FF",color:C.blue,padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600}}>{inv.clasificacion}</span></td>
                    <td style={{padding:"10px 12px",whiteSpace:"nowrap"}}>{inv.fecha}</td>
                    <td style={{padding:"10px 12px",whiteSpace:"nowrap"}}>${fmt(inv.total)}</td>
                    <td style={{padding:"10px 12px",color:C.ok,whiteSpace:"nowrap"}}>${fmt(inv.montoPagado)}</td>
                    <td style={{padding:"10px 12px",fontWeight:700,color:C.warn,whiteSpace:"nowrap"}}>${fmt(inv.saldo)}</td>
                    <td style={{padding:"10px 12px",fontWeight:700,whiteSpace:"nowrap",color: pendienteDespues > 0 ? '#E65100' : C.muted}}>
                      {pendienteDespues > 0 ? `$${fmt(pendienteDespues)}` : '—'}
                    </td>
                    <td style={{padding:"10px 12px",whiteSpace:"nowrap"}}>{inv.vencimiento}</td>
                    <td style={{padding:"10px 12px"}}><span style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[inv.moneda],color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[inv.moneda],padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700}}>{inv.moneda}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </ModalShell>
      )}

      {/* Pagos detail modal — grouped by date */}
      {pagosDetail && (()=>{
        const totalPagDetail = pagosDetail.pagos.reduce((s,p)=>s+p.monto,0);
        // Group by fechaPago
        const byDate = {};
        pagosDetail.pagos.forEach(p => {
          const d = p.fechaPago || "Sin fecha";
          if(!byDate[d]) byDate[d] = { pagos:[], total:0, monedas:new Set() };
          byDate[d].pagos.push(p);
          byDate[d].total += p.monto;
          byDate[d].monedas.add(p.moneda);
        });
        const sortedDates = Object.keys(byDate).sort((a,b) => b.localeCompare(a));
        const toggleDate = (d) => setPagosExpandedDates(prev => { const n=new Set(prev); if(n.has(d)) n.delete(d); else n.add(d); return n; });
        return (
        <ModalShell title={`Pagos a ${pagosDetail.proveedor}`} onClose={()=>setPagosDetail(null)} extraWide>
          {/* Summary */}
          <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
            <div style={{background:"#F8FAFC",borderRadius:8,padding:"8px 14px",fontSize:13}}>
              <span style={{color:C.muted}}>Total pagos: </span><span style={{fontWeight:700}}>{pagosDetail.pagos.length}</span>
            </div>
            <div style={{background:"#F8FAFC",borderRadius:8,padding:"8px 14px",fontSize:13}}>
              <span style={{color:C.muted}}>Fechas de pago: </span><span style={{fontWeight:700}}>{sortedDates.length}</span>
            </div>
            <div style={{background:"#E8F5E9",borderRadius:8,padding:"8px 14px",fontSize:13}}>
              <span style={{color:C.muted}}>Total pagado: </span><span style={{fontWeight:700,color:C.ok}}>${fmt(totalPagDetail)}</span>
            </div>
            <button onClick={()=>{
              if(pagosExpandedDates.size===sortedDates.length) setPagosExpandedDates(new Set());
              else setPagosExpandedDates(new Set(sortedDates));
            }} style={{...btnStyle,padding:"6px 14px",fontSize:12,background:"#F1F5F9",color:C.text}}>
              {pagosExpandedDates.size===sortedDates.length ? "Colapsar todo" : "Expandir todo"}
            </button>
          </div>
          {/* Date groups */}
          {sortedDates.map(date => {
            const group = byDate[date];
            const isOpen = pagosExpandedDates.has(date);
            return (
              <div key={date} style={{marginBottom:10,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
                {/* Date header — clickable */}
                <div onClick={()=>toggleDate(date)}
                  style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 18px",background:isOpen?"#E8F0FE":"#F8FAFC",cursor:"pointer",transition:"background .15s"}}
                  onMouseEnter={e=>{if(!isOpen) e.currentTarget.style.background="#F0F4FF";}}
                  onMouseLeave={e=>{if(!isOpen) e.currentTarget.style.background="#F8FAFC";}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:16}}>{isOpen?"▼":"▶"}</span>
                    <span style={{fontWeight:800,color:C.navy,fontSize:15}}>📅 {date}</span>
                    <span style={{fontSize:12,color:C.muted}}>{group.pagos.length} pago{group.pagos.length!==1?"s":""}</span>
                    {[...group.monedas].map(m=><span key={m} style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[m],color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[m],padding:"1px 7px",borderRadius:20,fontSize:10,fontWeight:700}}>{m}</span>)}
                  </div>
                  <div style={{fontWeight:800,color:C.ok,fontSize:18}}>${fmt(group.total)}</div>
                </div>
                {/* Expanded: invoice detail */}
                {isOpen && (
                  <div style={{padding:"0 8px 8px"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead><tr style={{background:"#FAFBFC"}}>
                        {["Tipo","Fecha Fact.","Folio","Concepto","Moneda","Importe","Notas"].map(h=>(
                          <th key={h} style={{padding:"8px 10px",textAlign:"left",color:C.muted,fontWeight:600,fontSize:10,textTransform:"uppercase"}}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {group.pagos.map(p=>(
                          <tr key={p.id} style={{borderTop:`1px solid ${C.border}`}}>
                            <td style={{padding:"8px 10px"}}>{p.tipo}</td>
                            <td style={{padding:"8px 10px",whiteSpace:"nowrap"}}>{p.fecha}</td>
                            <td style={{padding:"8px 10px",fontWeight:700}}>{p.folio}</td>
                            <td style={{padding:"8px 10px",color:p.concepto?C.text:C.muted,fontStyle:p.concepto?"normal":"italic"}}>{p.concepto||"—"}</td>
                            <td style={{padding:"8px 10px"}}><span style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[p.moneda],color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[p.moneda],padding:"1px 6px",borderRadius:20,fontSize:10,fontWeight:700}}>{p.moneda}</span></td>
                            <td style={{padding:"8px 10px",fontWeight:800,color:C.ok}}>${fmt(p.monto)}</td>
                            <td style={{padding:"8px 10px",color:C.muted,fontSize:11}}>{p.notas||"—"}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot><tr style={{borderTop:`2px solid ${C.border}`,background:"#FAFBFC"}}>
                        <td colSpan={5} style={{padding:"8px 10px",fontWeight:700,color:C.navy,fontSize:11}}>Subtotal {date}</td>
                        <td style={{padding:"8px 10px",fontWeight:800,color:C.navy}}>${fmt(group.total)}</td>
                        <td/>
                      </tr></tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          {/* Grand total */}
          <div style={{display:"flex",justifyContent:"space-between",padding:"14px 18px",background:C.navy,borderRadius:12,marginTop:12}}>
            <span style={{fontWeight:800,color:"#fff",fontSize:15}}>TOTAL GENERAL</span>
            <span style={{fontWeight:800,color:"#fff",fontSize:18}}>${fmt(totalPagDetail)}</span>
          </div>
        </ModalShell>
        );
      })()}

      {/* Payment modal — programar y registrar pagos */}
      {payModal && (()=>{
        const invPaysAll = paymentsFor(payModal.invoiceId);
        const realized = invPaysAll.filter(p=>p.tipo==='realizado');
        const scheduled = invPaysAll.filter(p=>p.tipo==='programado');
        const totalPaid = realized.reduce((s,p)=>s+p.monto,0);
        const totalSched = scheduled.reduce((s,p)=>s+p.monto,0);
        const saldoRest = (+payModal.total||0) - totalPaid;
        const saldoSinProgramar = saldoRest - totalSched;
        const PayTable = ({items,color,showType}) => (
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:8}}>
            <thead><tr style={{background:"#F8FAFC"}}>
              {["Fecha","Monto","Notas",""].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"left",color:C.muted,fontWeight:600,fontSize:11,textTransform:"uppercase"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {items.map(p=>{
                const metodo = p.metodoPago || 'banco';
                const metodoMeta = {
                  banco: { label: '🏦 Banco', bg: '#E3F2FD', color: '#1565C0' },
                  tdc:   { label: '💳 TDC',   bg: '#F3E5F5', color: '#6A1B9A' },
                  otro:  { label: '➕ Otro',  bg: '#F5F5F5', color: '#616161' },
                }[metodo] || { label: metodo, bg: '#F5F5F5', color: '#666' };
                return (
                <tr key={p.id} style={{borderTop:`1px solid ${C.border}`}}>
                  <td style={{padding:"8px 10px",fontWeight:600}}>{p.fechaPago}</td>
                  <td style={{padding:"8px 10px",fontWeight:800,color:color}}>${fmt(p.monto)}</td>
                  <td style={{padding:"8px 10px",color:C.muted}}>
                    {!esConsulta ? (
                      <select
                        value={metodo}
                        onChange={async (e) => {
                          const nuevoMetodo = e.target.value;
                          await updatePayment(p.id, { metodoPago: nuevoMetodo });
                          setPayments(prev => prev.map(x => x.id === p.id ? { ...x, metodoPago: nuevoMetodo } : x));
                        }}
                        style={{background:metodoMeta.bg,color:metodoMeta.color,border:'none',padding:'3px 8px',borderRadius:6,fontSize:11,fontWeight:700,fontFamily:'inherit',cursor:'pointer'}}
                      >
                        <option value="banco">🏦 Banco</option>
                        <option value="tdc">💳 TDC</option>
                        <option value="otro">➕ Otro</option>
                      </select>
                    ) : (
                      <span style={{background:metodoMeta.bg,color:metodoMeta.color,padding:'3px 8px',borderRadius:6,fontSize:11,fontWeight:700}}>{metodoMeta.label}</span>
                    )}
                    {p.notas ? <span style={{marginLeft:8,color:C.muted}}>{p.notas}</span> : null}
                  </td>
                  <td style={{padding:"8px 10px",textAlign:"right"}}>
                    {!esConsulta && <button onClick={()=>removePayment(p.id,payModal.invoiceId)} style={{background:"none",border:"none",cursor:"pointer",color:C.danger,fontSize:14}} title="Eliminar">🗑️</button>}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        );
        const AddForm = ({tipo,label,defaultMonto,color}) => (
          <div style={{background:tipo==='programado'?"#FFFDE7":"#F0F7FF",border:`1px solid ${tipo==='programado'?"#FFE082":C.blue+"22"}`,borderRadius:12,padding:16,marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:700,color:C.navy,marginBottom:10}}>{label}</div>
            <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:C.muted,display:"block",marginBottom:4}}>Monto</label>
                <input id={`pay-${tipo}-monto`} type="number" defaultValue={defaultMonto>0?defaultMonto.toFixed(2):""} placeholder="0.00" style={{...inputStyle,width:140}} step="0.01"/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:C.muted,display:"block",marginBottom:4}}>Fecha</label>
                <input id={`pay-${tipo}-fecha`} type="date" defaultValue={today()} style={{...inputStyle,width:160}}/>
              </div>
              {tipo === 'realizado' && (
                <div>
                  <label style={{fontSize:11,fontWeight:600,color:C.muted,display:"block",marginBottom:4}}>Método</label>
                  <select id={`pay-${tipo}-metodo`} defaultValue="banco" style={{...inputStyle,width:130}}>
                    <option value="banco">🏦 Banco</option>
                    <option value="tdc">💳 TDC</option>
                    <option value="otro">➕ Otro</option>
                  </select>
                </div>
              )}
              <div style={{flex:1,minWidth:120}}>
                <label style={{fontSize:11,fontWeight:600,color:C.muted,display:"block",marginBottom:4}}>Notas</label>
                <input id={`pay-${tipo}-notas`} type="text" placeholder={tipo==='programado'?"Pago parcial, 50%…":"Transferencia, cheque…"} style={{...inputStyle,width:"100%"}}/>
              </div>
              <button onClick={async ()=>{
                const m = +document.getElementById(`pay-${tipo}-monto`).value;
                const f = document.getElementById(`pay-${tipo}-fecha`).value;
                const n = document.getElementById(`pay-${tipo}-notas`).value;
                const metodoEl = document.getElementById(`pay-${tipo}-metodo`);
                const metodo = metodoEl ? metodoEl.value : 'banco';
                if(!m||m<=0||!f) return;
                // Guardar el pago primero
                await addPayment(payModal.invoiceId, m, f, n, tipo, metodo);
                document.getElementById(`pay-${tipo}-monto`).value="";
                document.getElementById(`pay-${tipo}-notas`).value="";
                // Solo para pagos REALIZADOS verificar si la factura está en algún plan activo
                if (tipo === 'realizado') {
                  try {
                    const planesActivos = await buscarPlanesActivosDeFactura(payModal.invoiceId, empresaId);
                    if (planesActivos && planesActivos.length > 0) {
                      // Hay match potencial: abrir modal preguntando si aplicar al plan
                      setPlanMatchQueue([]); // limpiar cola (es flujo individual)
                      setPlanMatchModal({
                        planes: planesActivos,
                        montoPago: m,
                        fechaPago: f,
                        invoiceId: payModal.invoiceId,
                        proveedor: payModal.proveedor,
                        folio: payModal.folio,
                        moneda: payModal.moneda,
                      });
                    }
                  } catch (err) {
                    console.error('Verificando planes activos:', err);
                  }
                }
              }} disabled={esConsulta} style={{...btnStyle,padding:"8px 20px",fontSize:13,background:tipo==='programado'?"#F57F17":C.blue,color:"#fff",opacity:esConsulta?0.4:1}}>+ Agregar</button>
            </div>
          </div>
        );
        return (
        <ModalShell title={`Pagos — ${payModal.folio} · ${payModal.proveedor}`} onClose={()=>setPayModal(null)} extraWide>
          {/* Summary */}
          <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
            <div style={{background:"#F8FAFC",borderRadius:8,padding:"8px 14px",fontSize:13}}>
              <span style={{color:C.muted}}>Total factura: </span><span style={{fontWeight:800}}>${fmt(payModal.total)}</span>
            </div>
            <div style={{background:"#E8F5E9",borderRadius:8,padding:"8px 14px",fontSize:13}}>
              <span style={{color:C.muted}}>Pagado: </span><span style={{fontWeight:800,color:C.ok}}>${fmt(totalPaid)}</span>
            </div>
            <div style={{background:"#FFFDE7",borderRadius:8,padding:"8px 14px",fontSize:13}}>
              <span style={{color:C.muted}}>Programado: </span><span style={{fontWeight:800,color:"#F57F17"}}>${fmt(totalSched)}</span>
            </div>
            <div style={{background:saldoRest>0?"#FFF3E0":"#E8F5E9",borderRadius:8,padding:"8px 14px",fontSize:13}}>
              <span style={{color:C.muted}}>Saldo pendiente: </span><span style={{fontWeight:800,color:saldoRest>0?C.warn:C.ok}}>${fmt(saldoRest)}</span>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            {/* LEFT: Programar pagos */}
            <div>
              <h3 style={{fontSize:15,fontWeight:800,color:"#F57F17",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>📅 Pagos Programados <span style={{fontSize:11,fontWeight:500,color:C.muted}}>(aparecen en Proyección)</span></h3>
              {scheduled.length > 0 && <PayTable items={scheduled} color="#F57F17"/>}
              {saldoSinProgramar > 0 && <AddForm tipo="programado" label="Programar nuevo pago:" defaultMonto={saldoSinProgramar} color="#F57F17"/>}
              {saldoSinProgramar <= 0 && scheduled.length > 0 && <div style={{fontSize:12,color:C.muted,textAlign:"center",padding:8}}>Todo el saldo está programado</div>}
              {saldoRest <= 0 && <div style={{fontSize:12,color:C.ok,textAlign:"center",padding:8,fontWeight:600}}>✅ Sin saldo pendiente</div>}
            </div>

            {/* RIGHT: Registrar pagos */}
            <div>
              <h3 style={{fontSize:15,fontWeight:800,color:C.ok,marginBottom:12,display:"flex",alignItems:"center",gap:6}}>💰 Pagos Realizados <span style={{fontSize:11,fontWeight:500,color:C.muted}}>(aparecen en Pagos, afectan saldo)</span></h3>
              {realized.length > 0 && <PayTable items={realized} color={C.ok}/>}
              {saldoRest > 0 && <AddForm tipo="realizado" label="Registrar pago realizado:" defaultMonto={saldoRest} color={C.blue}/>}
              {saldoRest <= 0 && realized.length > 0 && <div style={{textAlign:"center",padding:12,background:"#E8F5E9",borderRadius:10,color:C.ok,fontWeight:700,fontSize:13}}>✅ Factura completamente pagada</div>}
            </div>
          </div>
        </ModalShell>
        );
      })()}

      {/* PlanMatchModal — pregunta si aplicar el pago a un abono del plan */}
      {planMatchModal && (() => {
        // Helper para avanzar a siguiente match si hay cola pendiente
        const avanzarColaMatch = () => {
          if (planMatchQueue.length > 0) {
            const [siguiente, ...resto] = planMatchQueue;
            setPlanMatchModal(siguiente);
            setPlanMatchQueue(resto);
          } else {
            setPlanMatchModal(null);
          }
        };
        const restantes = planMatchQueue.length;
        return (
        <ModalShell title={restantes > 0 ? `Plan de pago activo (${restantes + 1} factura${restantes > 0 ? 's' : ''} en plan)` : "Plan de pago activo"} onClose={() => { setPlanMatchModal(null); setPlanMatchQueue([]); }} wide>
          <div style={{padding: '4px 0 12px'}}>
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              background: '#DBEAFE', border: `1px solid #1565C0`, borderRadius: 8,
              padding: '12px 14px', marginBottom: 14,
            }}>
              <div style={{fontSize: 22, lineHeight: 1}}>💡</div>
              <div style={{flex: 1}}>
                <div style={{fontSize: 13, fontWeight: 700, color: '#1E40AF', marginBottom: 4}}>
                  Esta factura está en un plan de pago activo
                </div>
                <div style={{fontSize: 12, color: '#1E40AF', opacity: 0.9}}>
                  Acabas de registrar un pago de <strong>${fmt(planMatchModal.montoPago)} {planMatchModal.moneda}</strong> a la factura <strong>{planMatchModal.folio}</strong>.
                  ¿Quieres marcar también el abono del plan?
                </div>
              </div>
            </div>

            {planMatchModal.planes.map((item, idx) => {
              const { plan, proximoAbono } = item;
              const hayAbono = !!proximoAbono;
              const monto = planMatchModal.montoPago;
              const montoProgramado = hayAbono ? proximoAbono.montoProgramado : 0;
              const diferencia = monto - montoProgramado;
              const hayDif = Math.abs(diferencia) > 0.01;
              const esMenor = diferencia < -0.01;

              return (
                <div key={idx} style={{
                  border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 10,
                }}>
                  <div style={{fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 8}}>
                    📋 {plan.proveedor}
                  </div>
                  {!hayAbono ? (
                    <div style={{fontSize: 12, color: C.muted, padding: 8, background: '#F8FAFC', borderRadius: 6}}>
                      Este plan no tiene abonos pendientes (puede estar al día). Acción no disponible.
                    </div>
                  ) : (
                    <>
                      <div style={{fontSize: 12, color: C.muted, marginBottom: 10, lineHeight: 1.6}}>
                        Próximo abono: <strong style={{color: C.text}}>#{proximoAbono.numero} · {proximoAbono.fechaProgramada} · ${fmt(montoProgramado)} {plan.moneda}</strong>
                      </div>
                      {hayDif && (
                        <div style={{
                          background: esMenor ? '#FEF3C7' : '#DBEAFE',
                          border: `1px solid ${esMenor ? '#D97706' : '#1565C0'}`,
                          borderRadius: 6, padding: '8px 10px', marginBottom: 10,
                          fontSize: 11, color: esMenor ? '#92400E' : '#1E40AF',
                        }}>
                          {esMenor
                            ? `⚠ Pagaste $${fmt(monto)}, ${fmt(Math.abs(diferencia))} menos que el abono ($${fmt(montoProgramado)}). El abono se marcará como PARCIAL.`
                            : `↑ Pagaste $${fmt(monto)}, ${fmt(diferencia)} más que el abono. El abono se marcará como pagado completo y el excedente se considera adelanto.`}
                        </div>
                      )}
                      <div style={{display: 'flex', justifyContent: 'flex-end', gap: 6}}>
                        <button
                          onClick={async () => {
                            // No marcar — avanzar a siguiente match si hay cola
                            avanzarColaMatch();
                          }}
                          style={{...btnStyle, padding: '7px 14px', fontSize: 12, background: '#F1F5F9', color: C.text}}>
                          No, pago independiente
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              const estado = monto >= montoProgramado - 0.01 ? 'pagado' : 'parcial';
                              await marcarAbonoPagado(proximoAbono.id, {
                                fechaPagado: planMatchModal.fechaPago,
                                montoPagado: monto,
                                facturaIdAplicada: String(planMatchModal.invoiceId),
                                notas: `Match automático desde CxP (factura ${planMatchModal.folio})`,
                                estado,
                              }, user?.nombre);
                              avanzarColaMatch();
                            } catch (err) {
                              console.error('Marcar abono desde CxP:', err);
                              alert('Error al marcar el abono. Revisa la consola.');
                            }
                          }}
                          style={{...btnStyle, padding: '7px 14px', fontSize: 12, background: C.ok, color: '#fff', border: 'none', fontWeight: 700}}>
                          ✓ Sí, marcar abono
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            <div style={{fontSize: 11, color: C.muted, paddingTop: 10, borderTop: `1px solid ${C.border}`, lineHeight: 1.5}}>
              💡 El pago ya fue registrado en CxP. Esta acción solo enlaza también el abono del plan.
            </div>
          </div>
        </ModalShell>
        );
      })()}

      {/* Bulk payment modal */}
      {bulkPayModal && (()=>{
        const tipo = bulkPayModal;
        const count = selectedIds.size;
        const selInvs = (invoices[currency]||[]).filter(i=>selectedIds.has(i.id));
        const totalSaldoSel = selInvs.reduce((s,i)=>s+((+i.total||0)-realizedPayments(i.id).reduce((a,p)=>a+p.monto,0)),0);
        const label = tipo==="programado" ? "📅 Programar pago masivo" : "💰 Registrar pago masivo";
        const color = tipo==="programado" ? "#F57F17" : C.ok;
        return (
        <ModalShell title={`${label} (${count} factura${count!==1?"s":""})`} onClose={()=>setBulkPayModal(null)}>
          <p style={{fontSize:13,color:C.muted,marginBottom:12}}>
            {tipo==="programado"
              ? "Se programará un pago en cada factura seleccionada. Aparecerá en Proyección."
              : "Se registrará un pago realizado en cada factura seleccionada. Actualizará el saldo y estatus."}
          </p>
          <div style={{background:"#F8FAFC",borderRadius:8,padding:"8px 14px",fontSize:13,marginBottom:16}}>
            <span style={{color:C.muted}}>Saldo total de las {count} facturas: </span><span style={{fontWeight:800,color:C.navy}}>${fmt(totalSaldoSel)}</span>
          </div>
          <div style={{marginBottom:16}}>
            <label style={{fontSize:12,fontWeight:700,color:C.navy,marginBottom:8,display:"block"}}>Modo de monto:</label>
            <div style={{display:"flex",gap:10,marginBottom:12}}>
              <button id="bulk-mode-saldo" onClick={()=>{document.getElementById("bulk-mode-saldo").style.background="#E8F0FE";document.getElementById("bulk-mode-saldo").dataset.active="true";document.getElementById("bulk-mode-fijo").style.background="#F1F5F9";document.getElementById("bulk-mode-fijo").dataset.active="false";document.getElementById("bulk-pay-monto-row").style.display="none";}}
                data-active="true"
                style={{padding:"8px 16px",borderRadius:8,border:`1px solid ${C.blue}`,background:"#E8F0FE",color:C.blue,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                Saldo total de cada factura
              </button>
              <button id="bulk-mode-fijo" onClick={()=>{document.getElementById("bulk-mode-fijo").style.background="#E8F0FE";document.getElementById("bulk-mode-fijo").dataset.active="true";document.getElementById("bulk-mode-saldo").style.background="#F1F5F9";document.getElementById("bulk-mode-saldo").dataset.active="false";document.getElementById("bulk-pay-monto-row").style.display="flex";}}
                data-active="false"
                style={{padding:"8px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:"#F1F5F9",color:C.text,fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                Monto fijo por factura
              </button>
            </div>
          </div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:20,alignItems:"flex-end"}}>
            <div id="bulk-pay-monto-row" style={{display:"none"}}>
              <label style={{fontSize:11,fontWeight:600,color:C.muted,display:"block",marginBottom:4}}>Monto por factura</label>
              <input id="bulk-pay-monto" type="number" placeholder="0.00" style={{...inputStyle,width:160}} step="0.01"/>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:600,color:C.muted,display:"block",marginBottom:4}}>Fecha</label>
              <input id="bulk-pay-fecha" type="date" defaultValue={today()} style={{...inputStyle,width:160}}/>
            </div>
            <div style={{flex:1,minWidth:150}}>
              <label style={{fontSize:11,fontWeight:600,color:C.muted,display:"block",marginBottom:4}}>Notas</label>
              <input id="bulk-pay-notas" type="text" placeholder="Pago masivo…" style={{...inputStyle,width:"100%"}}/>
            </div>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button onClick={()=>setBulkPayModal(null)} style={{...btnStyle,background:"#F1F5F9",color:C.text}}>Cancelar</button>
            <button onClick={()=>{
              const isSaldo = document.getElementById("bulk-mode-saldo").dataset.active === "true";
              const f = document.getElementById("bulk-pay-fecha").value;
              const n = document.getElementById("bulk-pay-notas").value;
              if(!f) return;
              if(isSaldo) {
                applyBulkPayment(tipo, "saldo", 0, f, n);
              } else {
                const m = document.getElementById("bulk-pay-monto").value;
                if(!m||+m<=0) return;
                applyBulkPayment(tipo, "fijo", m, f, n);
              }
            }} style={{...btnStyle,background:color,color:"#fff",padding:"10px 28px"}}>
              {tipo==="programado" ? "📅 Programar" : "💰 Registrar"} {count} pago{count!==1?"s":""}
            </button>
          </div>
        </ModalShell>
        );
      })()}

      {/* Dashboard detail modal */}
      {dashDetail && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}} onClick={()=>setDashDetail(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:1400,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 64px rgba(74,20,140,.4)",overflow:"hidden"}}>
          {dashDetail.type==="invoices" && (()=>{
            const allItems = dashDetail.items;
            const items = allItems.filter(inv => {
              if(dashSearch) { const q=dashSearch.toLowerCase(); if(!JSON.stringify(inv).toLowerCase().includes(q)) return false; }
              if(dashFilterProv && inv.proveedor!==dashFilterProv) return false;
              if(dashFilterClasif && inv.clasificacion!==dashFilterClasif) return false;
              if(dashFilterEstatus && inv.estatus!==dashFilterEstatus) return false;
              return true;
            });
            const totalSum = items.reduce((s,i)=>s+(+i.total||0),0);
            const saldoSum = items.reduce((s,i)=>s+((+i.total||0)-(+i.montoPagado||0)),0);
            const pagadoSum = items.reduce((s,i)=>s+(+i.montoPagado||0),0);
            const provsList = [...new Set(allItems.map(i=>i.proveedor))].sort();
            const clasifList = [...new Set(allItems.map(i=>i.clasificacion))].sort();
            const selSaldo = items.filter(i=>dashSelectedIds.has(i.id)).reduce((s,i)=>s+((+i.total||0)-(+i.montoPagado||0)),0);
            const selCount = items.filter(i=>dashSelectedIds.has(i.id)).length;
            const allChecked = items.length > 0 && items.every(i=>dashSelectedIds.has(i.id));
            const toggleDashSel = (id) => setDashSelectedIds(prev => { const n=new Set(prev); if(n.has(id)) n.delete(id); else n.add(id); return n; });
            const toggleDashSelAll = () => {
              if(allChecked) setDashSelectedIds(prev => { const n=new Set(prev); items.forEach(i=>n.delete(i.id)); return n; });
              else setDashSelectedIds(prev => { const n=new Set(prev); items.forEach(i=>n.add(i.id)); return n; });
            };
            const applyDashBulk = () => {
              if(dashSelectedIds.size===0) return;
              const ids = [...dashSelectedIds].filter(id => items.some(i=>i.id===id));
              const fields = {};
              if(dashBulkAutDir==="true") fields.autorizadoDireccion = true;
              if(dashBulkAutDir==="false") fields.autorizadoDireccion = false;
              if(Object.keys(fields).length===0) return;
              setInvoices(prev => { const result = {...prev}; ["MXN","USD","EUR"].forEach(c => { result[c] = result[c].map(i => ids.includes(i.id) ? {...i, ...fields} : i); }); return result; });
              setDashDetail(prev => ({...prev, items: prev.items.map(i => ids.includes(i.id) ? {...i, ...fields} : i)}));
              bulkUpdateInvoices(ids, fields);
              setDashSelectedIds(new Set()); setDashBulkAutDir("");
            };

            // Siempre agrupado por proveedor por defecto
            const groupBy = dashGroupBy || "proveedor";
            const groups = {};
            items.forEach(inv => {
              const k = groupBy==="proveedor"?inv.proveedor:groupBy==="clasificacion"?inv.clasificacion:groupBy==="estatus"?inv.estatus:groupBy==="moneda"?inv.moneda:"—";
              if(!groups[k]) groups[k]=[];
              groups[k].push(inv);
            });
            const groupsSorted = Object.entries(groups).sort((a,b)=>{
              const sA=a[1].reduce((s,i)=>s+((+i.total||0)-(+i.montoPagado||0)),0);
              const sB=b[1].reduce((s,i)=>s+((+i.total||0)-(+i.montoPagado||0)),0);
              return sB-sA;
            });

            const renderRows = (rows) => rows.map(inv=>{
              const saldo=(+inv.total||0)-(+inv.montoPagado||0);
              const overdue=isOverdue(inv.vencimiento,inv.estatus);
              const dias = daysUntil(inv.vencimiento);
              const diasLabel = dias===null?"—":dias>=0?dias+" d":Math.abs(dias)+" d";
              const diasColor = dias===null?C.muted:dias>=0?C.ok:C.danger;
              const checked = dashSelectedIds.has(inv.id);
              return (
                <tr key={inv.id} style={{borderTop:"1px solid #F3E5F5",background:checked?"#EDE7F6":overdue?"#FFF5F5":"#fff"}}
                  onMouseEnter={e=>{ if(!checked&&!overdue) e.currentTarget.style.background="#FAF5FF"; }}
                  onMouseLeave={e=>{ e.currentTarget.style.background=checked?"#EDE7F6":overdue?"#FFF5F5":"#fff"; }}>
                  <td style={{padding:"8px 6px",textAlign:"center"}}>
                    <input type="checkbox" checked={checked} onChange={()=>toggleDashSel(inv.id)} style={{cursor:"pointer",width:14,height:14,accentColor:"#7B1FA2"}}/>
                  </td>
                  <td style={{padding:"8px 8px",fontWeight:700,color:"#4A148C",whiteSpace:"nowrap",fontSize:13}}>{inv.serie}{inv.folio}</td>
                  <td style={{padding:"8px 8px",fontWeight:600,color:"#333",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:13}}>{inv.proveedor}</td>
                  <td style={{padding:"8px 8px",color:inv.concepto?C.text:C.muted,maxWidth:240,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:13}}>{inv.concepto||"—"}</td>
                  <td style={{padding:"8px 8px"}}><span style={{background:"#EDE7F6",color:"#7B1FA2",padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700}}>{inv.clasificacion}</span></td>
                  <td style={{padding:"8px 8px",whiteSpace:"nowrap",fontSize:12,color:C.muted}}>{inv.fecha}</td>
                  <td style={{padding:"8px 8px",fontWeight:800,fontSize:14,color:"#1A0533",textAlign:"right"}}>${fmt(inv.total)}</td>
                  <td style={{padding:"8px 8px",fontWeight:600,color:C.ok,textAlign:"right",fontSize:13}}>${fmt(inv.montoPagado)}</td>
                  <td style={{padding:"8px 8px",fontWeight:900,fontSize:15,color:saldo>0?(overdue?"#C62828":"#E65100"):"#1B5E20",textAlign:"right"}}>${fmt(saldo)}</td>
                  <td style={{padding:"8px 8px",whiteSpace:"nowrap",color:overdue?"#C62828":C.text,fontSize:12}}>{inv.vencimiento||"—"}</td>
                  <td style={{padding:"8px 8px",whiteSpace:"nowrap",fontWeight:700,color:diasColor,fontSize:12}}>{dias===null?"":dias>=0?"⏳ ":"⚠️ "}{diasLabel}</td>
                  <td style={{padding:"8px 8px"}}><span style={{color:statusColor(inv.estatus),fontWeight:700,fontSize:11}}>{inv.estatus}</span></td>
                  <td style={{padding:"8px 8px",textAlign:"center"}}>
                    <button onClick={()=>toggleAutorizadoDireccion(inv.id,inv.moneda)} style={{background:"none",border:"none",cursor:"pointer",fontSize:15,padding:1}}>
                      {inv.autorizadoDireccion?"✅":"⬜"}
                    </button>
                  </td>
                </tr>
              );
            });

            return (
              <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
                {/* Header morado */}
                <div style={{background:"#1A0533",padding:"18px 28px",flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:11,color:"#CE93D8",fontWeight:700,textTransform:"uppercase",letterSpacing:.6}}>CxP — Detalle</div>
                    <div style={{fontSize:20,fontWeight:900,color:"#fff",marginTop:2}}>{dashDetail.title}</div>
                  </div>
                  <div style={{display:"flex",gap:16,alignItems:"center"}}>
                    {/* KPIs */}
                    {[
                      {l:"Facturas", v:items.length,           c:"#CE93D8"},
                      {l:"Total",    v:`$${fmt(totalSum)}`,    c:"#CE93D8"},
                      {l:"Pagado",   v:`$${fmt(pagadoSum)}`,   c:"#81C784"},
                      {l:"Saldo",    v:`$${fmt(saldoSum)}`,    c:"#FFB74D"},
                    ].map((k,i)=>(
                      <div key={i} style={{background:"rgba(255,255,255,.07)",borderRadius:12,padding:"8px 16px",textAlign:"center",border:"1px solid rgba(255,255,255,.1)"}}>
                        <div style={{fontSize:10,color:"rgba(255,255,255,.45)",fontWeight:700,textTransform:"uppercase",letterSpacing:.4,marginBottom:2}}>{k.l}</div>
                        <div style={{fontSize:18,fontWeight:900,color:k.c}}>{k.v}</div>
                      </div>
                    ))}
                    <button onClick={()=>setDashDetail(null)} style={{background:"rgba(255,255,255,.12)",border:"none",borderRadius:10,color:"#fff",width:36,height:36,cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",marginLeft:8}}>×</button>
                  </div>
                </div>

                {/* Filtros */}
                <div style={{padding:"10px 24px",background:"#F5F0FF",borderBottom:"1px solid #E1BEE7",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",flexShrink:0}}>
                  <input placeholder="🔍 Buscar…" value={dashSearch} onChange={e=>setDashSearch(e.target.value)} style={{...inputStyle,width:200,padding:"6px 10px",fontSize:12,border:"1px solid #CE93D8"}}/>
                  <select value={dashFilterProv} onChange={e=>setDashFilterProv(e.target.value)} style={{...selectStyle,width:180,padding:"6px 8px",fontSize:12}}>
                    <option value="">Todos los proveedores</option>
                    {provsList.map(p=><option key={p}>{p}</option>)}
                  </select>
                  <select value={dashFilterClasif} onChange={e=>setDashFilterClasif(e.target.value)} style={{...selectStyle,width:160,padding:"6px 8px",fontSize:12}}>
                    <option value="">Todas las clasif.</option>
                    {clasifList.map(c=><option key={c}>{c}</option>)}
                  </select>
                  <select value={dashFilterEstatus} onChange={e=>setDashFilterEstatus(e.target.value)} style={{...selectStyle,width:140,padding:"6px 8px",fontSize:12}}>
                    <option value="">Todo estatus</option>
                    {["Pendiente","Pagado","Vencido","Parcial"].map(s=><option key={s}>{s}</option>)}
                  </select>
                  <div style={{width:1,height:20,background:"#E1BEE7"}}/>
                  <span style={{fontSize:11,fontWeight:700,color:"#7B1FA2"}}>AGRUPAR:</span>
                  {["proveedor","clasificacion","estatus","moneda"].map(g=>(
                    <button key={g} onClick={()=>setDashGroupBy(dashGroupBy===g?"":g)}
                      style={{padding:"4px 12px",borderRadius:20,border:`1.5px solid ${(dashGroupBy||"proveedor")===g?"#7B1FA2":"#E1BEE7"}`,
                        background:(dashGroupBy||"proveedor")===g?"#7B1FA2":"#fff",
                        color:(dashGroupBy||"proveedor")===g?"#fff":"#7B1FA2",
                        cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>
                      {g.charAt(0).toUpperCase()+g.slice(1)}
                    </button>
                  ))}
                  {selCount>0 && <>
                    <div style={{marginLeft:"auto",background:"#EDE7F6",borderRadius:8,padding:"4px 14px",fontSize:12,border:"1px solid #CE93D8"}}>
                      <span style={{color:"#7B1FA2",fontWeight:700}}>✅ {selCount} selec.: ${fmt(selSaldo)}</span>
                    </div>
                    <select value={dashBulkAutDir} onChange={e=>setDashBulkAutDir(e.target.value)} style={{...selectStyle,width:150,padding:"5px 8px",fontSize:12}}>
                      <option value="">Aut. Dirección</option>
                      <option value="true">✅ Autorizado</option>
                      <option value="false">⬜ No autorizado</option>
                    </select>
                    <button onClick={applyDashBulk} style={{...btnStyle,padding:"5px 14px",fontSize:12,background:"#7B1FA2"}}>Aplicar</button>
                    <button onClick={()=>{setDashSelectedIds(new Set());setDashBulkAutDir("");}} style={{...btnStyle,padding:"5px 10px",fontSize:12,background:"#F1F5F9",color:C.text}}>✕</button>
                  </>}
                </div>

                {/* Cabecera de columnas */}
                <div style={{display:"flex",alignItems:"center",padding:"8px 24px",background:"#EDE7F6",borderBottom:"2px solid #CE93D8",flexShrink:0}}>
                  <div style={{flex:1}}/>
                  <div style={{display:"flex",gap:0,alignItems:"center"}}>
                    <div style={{width:160,paddingRight:24,fontSize:11,fontWeight:800,color:"#7B1FA2",textTransform:"uppercase",letterSpacing:.5,textAlign:"center"}}>Total</div>
                    <div style={{width:140,paddingRight:24,fontSize:11,fontWeight:800,color:"#1B5E20",textTransform:"uppercase",letterSpacing:.5,textAlign:"center"}}>Pagado</div>
                    <div style={{width:160,fontSize:11,fontWeight:800,color:"#E65100",textTransform:"uppercase",letterSpacing:.5,textAlign:"center"}}>Saldo</div>
                  </div>
                </div>

                {/* Tabla agrupada */}
                <div style={{overflowY:"auto",flex:1}}>
                  {groupsSorted.map(([grp, rows])=>{
                    const grpTotal = rows.reduce((s,i)=>s+(+i.total||0),0);
                    const grpSaldo = rows.reduce((s,i)=>s+((+i.total||0)-(+i.montoPagado||0)),0);
                    const grpPagado = rows.reduce((s,i)=>s+(+i.montoPagado||0),0);
                    const grpOverdue = rows.filter(i=>isOverdue(i.vencimiento,i.estatus)).length;
                    const grpExpanded = expandedGroups.has(`chip_${grp}`);
                    const toggleGrp = () => setExpandedGroups(prev=>{const n=new Set(prev);n.has(`chip_${grp}`)?n.delete(`chip_${grp}`):n.add(`chip_${grp}`);return n;});
                    return (
                      <div key={grp} style={{borderBottom:"1px solid #F3E5F5"}}>
                        {/* Cabecera grupo */}
                        <div onClick={toggleGrp} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 24px",background:grpExpanded?"#F3E5F5":"#FAF5FF",cursor:"pointer",transition:"background .15s"}}
                          onMouseEnter={e=>{ if(!grpExpanded) e.currentTarget.style.background="#EDE7F6"; }}
                          onMouseLeave={e=>{ e.currentTarget.style.background=grpExpanded?"#F3E5F5":"#FAF5FF"; }}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <span style={{fontSize:12,color:"#7B1FA2",transition:"transform .2s",display:"inline-block",transform:grpExpanded?"rotate(90deg)":"rotate(0deg)"}}>▶</span>
                            <span style={{fontWeight:800,fontSize:15,color:"#1A0533"}}>{grp||"—"}</span>
                            <span style={{fontSize:12,color:"#9C27B0"}}>{rows.length} factura{rows.length!==1?"s":""}</span>
                            {grpOverdue>0 && <span style={{background:"#FFEBEE",color:"#C62828",fontWeight:700,fontSize:11,padding:"1px 8px",borderRadius:20}}>⚠️ {grpOverdue} vencida{grpOverdue!==1?"s":""}</span>}
                          </div>
                          <div style={{display:"flex",gap:0,alignItems:"center"}}>
                            <div style={{width:160,paddingRight:24,textAlign:"center"}}>
                              <div style={{fontSize:16,fontWeight:800,color:"#4A148C"}}>${fmt(grpTotal)}</div>
                            </div>
                            <div style={{width:140,paddingRight:24,textAlign:"center"}}>
                              <div style={{fontSize:16,fontWeight:800,color:"#1B5E20"}}>${fmt(grpPagado)}</div>
                            </div>
                            <div style={{width:160,textAlign:"center"}}>
                              <div style={{fontSize:18,fontWeight:900,color:grpSaldo>0?"#E65100":"#1B5E20"}}>${fmt(grpSaldo)}</div>
                            </div>
                          </div>
                        </div>
                        {/* Tabla de facturas */}
                        {grpExpanded && (
                          <div style={{overflowX:"auto"}}>
                            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:1100}}>
                              <thead>
                                <tr style={{background:"#EDE7F6"}}>
                                  <th style={{padding:"7px 6px",textAlign:"center",width:32}}>
                                    <input type="checkbox" checked={rows.every(i=>dashSelectedIds.has(i.id))} onChange={()=>{
                                      const all = rows.every(i=>dashSelectedIds.has(i.id));
                                      setDashSelectedIds(prev=>{const n=new Set(prev);rows.forEach(i=>all?n.delete(i.id):n.add(i.id));return n;});
                                    }} style={{cursor:"pointer",width:13,height:13,accentColor:"#7B1FA2"}}/>
                                  </th>
                                  {["Folio","Proveedor","Concepto","Clasif.","Fecha","Total","Pagado","Saldo","Vence","Días","Estatus","Aut."].map(h=>(
                                    <th key={h} style={{padding:"7px 8px",textAlign:["Total","Pagado","Saldo"].includes(h)?"right":"left",color:"#7B1FA2",fontWeight:700,fontSize:10,textTransform:"uppercase",whiteSpace:"nowrap",letterSpacing:.4}}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>{renderRows(rows)}</tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {items.length===0 && <div style={{textAlign:"center",padding:32,color:"#9C27B0",fontSize:14}}>Sin registros con estos filtros</div>}
                </div>
              </div>
            );
          })()}
          {dashDetail.type==="suppliers" && (()=>{
            const allSups = dashDetail.items;
            const filtered = allSups.filter(sup => {
              if(dashSearch) { const q=dashSearch.toLowerCase(); if(!(sup.nombre+sup.rfc+sup.contacto+sup.email+sup.clasificacion).toLowerCase().includes(q)) return false; }
              return true;
            });
            return (
              <div>
                <input placeholder="🔍 Buscar proveedor…" value={dashSearch} onChange={e=>setDashSearch(e.target.value)} style={{...inputStyle,maxWidth:280,padding:"6px 10px",fontSize:12,marginBottom:14}}/>
                <div style={{marginBottom:12,background:"#F8FAFC",borderRadius:8,padding:"6px 14px",fontSize:12,display:"inline-block"}}>
                  <span style={{color:C.muted}}>Mostrando: </span><span style={{fontWeight:700}}>{filtered.length} proveedores</span>
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead><tr style={{background:"#F8FAFC"}}>
                      {["Nombre","RFC","Moneda","Días Crédito","Clasificación","Contacto","Email","Teléfono"].map(h=>(
                        <th key={h} style={{padding:"7px 8px",textAlign:"left",color:C.muted,fontWeight:600,fontSize:10,textTransform:"uppercase"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {filtered.map(sup=>(
                        <tr key={sup.id} style={{borderTop:`1px solid ${C.border}`}}>
                          <td style={{padding:"7px 8px",fontWeight:700}}>{sup.nombre}</td>
                          <td style={{padding:"7px 8px",color:sup.rfc?C.text:C.danger,fontStyle:sup.rfc?"normal":"italic"}}>{sup.rfc||"Sin RFC"}</td>
                          <td style={{padding:"7px 8px"}}><span style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[sup.moneda],color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[sup.moneda],padding:"1px 6px",borderRadius:20,fontSize:10,fontWeight:700}}>{sup.moneda}</span></td>
                          <td style={{padding:"7px 8px"}}>{sup.diasCredito}</td>
                          <td style={{padding:"7px 8px"}}><span style={{background:"#EEF2FF",color:C.blue,padding:"1px 6px",borderRadius:20,fontSize:10,fontWeight:600}}>{sup.clasificacion}</span></td>
                          <td style={{padding:"7px 8px",color:sup.contacto?C.text:C.muted}}>{sup.contacto||"—"}</td>
                          <td style={{padding:"7px 8px",color:sup.email?C.text:C.muted}}>{sup.email||"—"}</td>
                          <td style={{padding:"7px 8px"}}>{sup.telefono||"—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
          </div>
        </div>
      )}

      {/* Vincular Ingreso Modal */}
      {vincularModal && (()=>{
        const inv = [...invoices.MXN,...invoices.USD,...invoices.EUR].find(i=>i.id===vincularModal.invoiceId);
        const currentVincs = invoiceIngresos.filter(v=>v.invoiceId===vincularModal.invoiceId);
        const sym = vincularModal.moneda==="EUR"?"€":"$";
        const fmt2 = n => isNaN(n)||n===""||n===null ? "—" : new Intl.NumberFormat("es-MX",{minimumFractionDigits:2,maximumFractionDigits:2}).format(+n);

        const VincularForm = () => {
          const [selectedIngreso, setSelectedIngreso] = useState("");
          const [montoAsig, setMontoAsig] = useState("");
          const [saving, setSaving] = useState(false);

          const calcSugerido = (ingId) => {
            if(!ingId) return "";
            const saldo = (+vincularModal.total||0) - (+inv?.montoPagado||0);
            return saldo > 0 ? saldo.toFixed(2) : "";
          };

          const handleAdd = async () => {
            if(!selectedIngreso||!montoAsig||+montoAsig<=0) return;
            setSaving(true);
            const saved = await upsertInvoiceIngreso({ invoiceId:vincularModal.invoiceId, ingresoId:selectedIngreso, montoAsignado:+montoAsig });
            setInvoiceIngresos(prev=>[...prev,saved]);
            setSelectedIngreso("");
            setMontoAsig("");
            setSaving(false);
          };

          const handleRemove = async (id) => {
            await deleteInvoiceIngreso(id);
            setInvoiceIngresos(prev=>prev.filter(v=>v.id!==id));
          };

          const availableIngresos = ingresos.filter(ing=>!currentVincs.some(v=>v.ingresoId===ing.id));

          return (
            <ModalShell title={`🔗 Vincular — ${vincularModal.folio}`} onClose={()=>setVincularModal(null)} wide>
              <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
                <div style={{background:"#F8FAFC",borderRadius:8,padding:"8px 14px",fontSize:13}}>
                  <span style={{color:"#64748B"}}>Proveedor: </span><span style={{fontWeight:700}}>{vincularModal.proveedor}</span>
                </div>
                <div style={{background:"#F8FAFC",borderRadius:8,padding:"8px 14px",fontSize:13}}>
                  <span style={{color:"#64748B"}}>Total: </span><span style={{fontWeight:700}}>{sym}{fmt2(vincularModal.total)} {vincularModal.moneda}</span>
                </div>
              </div>
              {currentVincs.length > 0 && (
                <div style={{marginBottom:20}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#0F2D4A",marginBottom:8}}>Vinculaciones actuales</div>
                  {currentVincs.map(v=>{
                    const ing = ingresos.find(i=>i.id===v.ingresoId);
                    if(!ing) return null;
                    const sameCur = ing.moneda===vincularModal.moneda;
                    const tc = ing.tipoCambio||1;
                    return (
                      <div key={v.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderRadius:10,border:"1px solid #80CBC4",background:"#E0F2F1",marginBottom:6}}>
                        <div>
                          <span style={{fontWeight:700,color:"#0F2D4A"}}>{ing.cliente}</span>
                          <span style={{color:"#64748B",fontSize:12,marginLeft:8}}>{ing.concepto||ing.categoria}</span>
                          <span style={{fontSize:11,color:"#64748B",marginLeft:8}}>{ing.moneda}</span>
                          {!sameCur && <span style={{fontSize:10,color:"#64748B",marginLeft:4}}>TC:{fmt2(tc)}</span>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <span style={{fontWeight:700,color:"#00897B"}}>{sym}{fmt2(v.montoAsignado)}</span>
                          {!sameCur && (() => {
                            let cv = 0;
                            if(ing.moneda==="MXN" && vincularModal.moneda!=="MXN") cv = v.montoAsignado/tc;
                            else if(ing.moneda!=="MXN" && vincularModal.moneda==="MXN") cv = v.montoAsignado*tc;
                            if(!cv) return null;
                            return <span style={{fontSize:11,color:"#64748B"}}>≈ {ing.moneda==="EUR"?"€":"$"}{fmt2(cv)} {ing.moneda}</span>;
                          })()}
                          <button onClick={()=>handleRemove(v.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#E53935",fontSize:14,padding:"2px 4px"}}>🗑️</button>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{fontSize:12,color:"#64748B",padding:"4px 0"}}>
                    Total asignado: {sym}{fmt2(currentVincs.reduce((s,v)=>s+v.montoAsignado,0))} / {sym}{fmt2(vincularModal.total)}
                  </div>
                </div>
              )}
              {ingresos.length === 0 ? (
                <div style={{textAlign:"center",padding:24,color:"#64748B",background:"#F8FAFC",borderRadius:10}}>
                  <div style={{fontSize:32,marginBottom:8}}>💵</div>
                  <div>Primero crea un ingreso en <b>CxC — Ingresos</b>.</div>
                </div>
              ) : availableIngresos.length === 0 && currentVincs.length > 0 ? (
                <div style={{textAlign:"center",padding:12,color:"#43A047",background:"#E8F5E9",borderRadius:10,fontSize:13}}>
                  ✅ Factura vinculada a todos los ingresos disponibles.
                </div>
              ) : availableIngresos.length > 0 ? (
                <div style={{background:"#F0FFF4",border:"1px solid #A5D6A7",borderRadius:12,padding:16}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#43A047",marginBottom:12}}>+ Agregar vinculación</div>
                  <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
                    <div style={{flex:2,minWidth:200}}>
                      <div style={{fontSize:11,color:"#64748B",fontWeight:600,marginBottom:4}}>Ingreso</div>
                      <select value={selectedIngreso}
                        onChange={e=>{setSelectedIngreso(e.target.value); setMontoAsig(calcSugerido(e.target.value));}}
                        style={{padding:"8px 12px",borderRadius:8,border:"1px solid #E2E8F0",fontSize:13,width:"100%",background:"#FAFBFC",fontFamily:"inherit",cursor:"pointer"}}>
                        <option value="">— Seleccionar ingreso —</option>
                        {availableIngresos.map(ing=>(
                          <option key={ing.id} value={ing.id}>
                            {ing.cliente} | {ing.concepto||ing.categoria} | {ing.moneda==="EUR"?"€":"$"}{fmt2(ing.monto)} {ing.moneda}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{minWidth:140}}>
                      <div style={{fontSize:11,color:"#64748B",fontWeight:600,marginBottom:4}}>Monto ({vincularModal.moneda})</div>
                      <input type="number" value={montoAsig} onChange={e=>setMontoAsig(e.target.value)}
                        placeholder="0.00" style={{padding:"8px 12px",borderRadius:8,border:"1px solid #E2E8F0",fontSize:13,width:"100%",fontFamily:"inherit",boxSizing:"border-box"}} step="0.01"/>
                    </div>
                    <button onClick={handleAdd} disabled={saving||!selectedIngreso||!montoAsig||+montoAsig<=0}
                      style={{padding:"9px 20px",borderRadius:10,border:"none",background:"#00897B",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit",opacity:(saving||!selectedIngreso||!montoAsig)?0.5:1}}>
                      {saving?"Guardando…":"🔗 Vincular"}
                    </button>
                  </div>
                  {selectedIngreso && (() => {
                    const ing = ingresos.find(i=>i.id===selectedIngreso);
                    if(!ing||ing.moneda===vincularModal.moneda) return null;
                    const tc = ing.tipoCambio||1;
                    const monto = +montoAsig||0;
                    let cv = 0;
                    if(ing.moneda==="MXN") cv = monto/tc;
                    else cv = monto*tc;
                    return (
                      <div style={{fontSize:11,color:"#64748B",marginTop:8,padding:"6px 10px",background:"#FFFDE7",borderRadius:6}}>
                        💱 TC: 1 {ing.moneda} = {fmt2(tc)} MXN · {sym}{fmt2(monto)} {vincularModal.moneda} ≈ {ing.moneda==="EUR"?"€":"$"}{fmt2(cv)} {ing.moneda}
                      </div>
                    );
                  })()}
                </div>
              ) : null}
              <div style={{display:"flex",justifyContent:"flex-end",marginTop:20}}>
                <button onClick={()=>setVincularModal(null)} style={{padding:"9px 20px",borderRadius:10,border:"none",background:"#1565C0",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Cerrar</button>
              </div>
            </ModalShell>
          );
        };
        return <VincularForm/>;
      })()}
    </div>
  );
}

/* ── Clientes CxC View ───────────────────────────────────────── */
function ClientesView({ clientes, setClientes, empresaId, esConsulta = false }) {
  const C = {navy:"#0F2D4A",blue:"#1565C0",sky:"#2196F3",teal:"#00897B",cream:"#FAFBFC",surface:"#FFFFFF",border:"#E2E8F0",muted:"#64748B",text:"#1A2332",danger:"#E53935",warn:"#F59E0B",ok:"#43A047"};
  const inputStyle = {padding:"10px 14px",borderRadius:10,border:`2px solid ${C.border}`,fontSize:14,outline:"none",background:C.cream,width:"100%",fontFamily:"inherit",color:C.text,boxSizing:"border-box"};
  const btnStyle = {padding:"10px 20px",borderRadius:10,border:"none",background:C.blue,color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"inherit",fontSize:13};
  const iconBtn = {background:"none",border:"none",cursor:"pointer",padding:"4px 6px",borderRadius:6,fontSize:15,transition:"background .15s"};

  const [modalCliente, setModalCliente] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [search, setSearch] = useState("");

  const filtered = clientes.filter(c =>
    !search || c.nombre.toLowerCase().includes(search.toLowerCase()) || (c.rfc||"").toLowerCase().includes(search.toLowerCase())
  );

  const saveCliente = async (data) => {
    const saved = await upsertCliente({ ...data, empresaId });
    setClientes(prev => {
      const exists = prev.find(c => c.id === saved.id);
      if (exists) return prev.map(c => c.id === saved.id ? saved : c);
      return [saved, ...prev];
    });
    setModalCliente(null);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deleteCliente(deleteConfirm.id);
    setClientes(prev => prev.filter(c => c.id !== deleteConfirm.id));
    setDeleteConfirm(null);
  };

  const ClienteModal = () => {
    const [form, setForm] = useState({
      id: modalCliente.id || "",
      nombre: modalCliente.nombre || "",
      rfc: modalCliente.rfc || "",
      moneda: modalCliente.moneda || "MXN",
      diasCredito: modalCliente.diasCredito || 30,
      contacto: modalCliente.contacto || "",
      telefono: modalCliente.telefono || "",
      email: modalCliente.email || "",
      notas: modalCliente.notas || "",
      activo: modalCliente.activo !== false,
    });
    const set = (k,v) => setForm(f=>({...f,[k]:v}));
    const Field = ({label,children}) => (
      <div><label style={{display:"block",fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>{label}</label>{children}</div>
    );
    return (
      <div style={{position:"fixed",inset:0,background:"rgba(15,45,74,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,padding:20}}>
        <div style={{background:C.surface,borderRadius:20,padding:28,width:"100%",maxWidth:560,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <h2 style={{fontSize:18,fontWeight:800,color:C.navy,margin:0}}>{form.id?"Editar Cliente":"Nuevo Cliente"}</h2>
            <button onClick={()=>setModalCliente(null)} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:18}}>×</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <div style={{gridColumn:"1/-1"}}>
              <Field label="Nombre *"><input value={form.nombre} onChange={e=>set("nombre",e.target.value)} placeholder="Nombre del cliente…" style={inputStyle}/></Field>
            </div>
            <Field label="RFC"><input value={form.rfc} onChange={e=>set("rfc",e.target.value)} placeholder="RFC…" style={inputStyle}/></Field>
            <Field label="Moneda">
              <select value={form.moneda} onChange={e=>set("moneda",e.target.value)} style={inputStyle}>
                <option value="MXN">🇲🇽 MXN</option>
                <option value="USD">🇺🇸 USD</option>
                <option value="EUR">🇪🇺 EUR</option>
              </select>
            </Field>
            <Field label="Días de Crédito">
              <input type="number" value={form.diasCredito} onChange={e=>set("diasCredito",e.target.value)} placeholder="30" style={inputStyle} min="0"/>
            </Field>
            <Field label="Contacto"><input value={form.contacto} onChange={e=>set("contacto",e.target.value)} placeholder="Nombre del contacto…" style={inputStyle}/></Field>
            <Field label="Teléfono"><input value={form.telefono} onChange={e=>set("telefono",e.target.value)} placeholder="+52 999…" style={inputStyle}/></Field>
            <Field label="Email"><input type="email" value={form.email} onChange={e=>set("email",e.target.value)} placeholder="correo@ejemplo.com" style={inputStyle}/></Field>
          </div>
          <div style={{marginBottom:16}}>
            <Field label="Notas"><textarea value={form.notas} onChange={e=>set("notas",e.target.value)} rows={2} style={{...inputStyle,resize:"vertical"}} placeholder="Observaciones…"/></Field>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button onClick={()=>setModalCliente(null)} style={{...btnStyle,background:"#F1F5F9",color:C.text}}>Cancelar</button>
            <button onClick={()=>{if(!form.nombre) return; saveCliente(form);}} disabled={!form.nombre} style={btnStyle}>Guardar</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:800,color:C.navy,margin:0}}>👥 Clientes CxC</h1>
          <p style={{color:C.muted,fontSize:14,margin:"4px 0 0"}}>Catálogo de clientes con días de crédito y datos de contacto</p>
        </div>
        {!esConsulta && <button onClick={()=>setModalCliente({id:"",nombre:"",rfc:"",moneda:"MXN",diasCredito:30,contacto:"",telefono:"",email:"",notas:"",activo:true})} style={btnStyle}>
          + Nuevo Cliente
        </button>}
      </div>

      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:16,marginBottom:20}}>
        <input placeholder="🔍 Buscar por nombre o RFC…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{...inputStyle,maxWidth:320}}/>
      </div>

      {filtered.length === 0 ? (
        <div style={{textAlign:"center",padding:60,color:C.muted,background:C.surface,borderRadius:14,border:`1px solid ${C.border}`}}>
          <div style={{fontSize:48,marginBottom:12}}>👥</div>
          <div style={{fontSize:16,fontWeight:600}}>{clientes.length===0?"Sin clientes registrados":"Sin resultados"}</div>
          {clientes.length===0 && <button onClick={()=>setModalCliente({id:"",nombre:"",rfc:"",moneda:"MXN",diasCredito:30,contacto:"",telefono:"",email:"",notas:"",activo:true})} style={{...btnStyle,marginTop:16}}>+ Crear primer cliente</button>}
        </div>
      ) : (
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{background:C.navy}}>
                {["Nombre","RFC","Moneda","Días Créd.","Contacto","Teléfono","Email","Acciones"].map(h=>(
                  <th key={h} style={{padding:"10px 12px",textAlign:"left",color:"#fff",fontWeight:600,fontSize:11,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c,idx)=>(
                <tr key={c.id} style={{borderTop:`1px solid ${C.border}`,background:idx%2===0?C.surface:"#FAFBFC"}}
                  onMouseEnter={e=>{e.currentTarget.style.background="#F0F7FF";}}
                  onMouseLeave={e=>{e.currentTarget.style.background=idx%2===0?C.surface:"#FAFBFC";}}>
                  <td style={{padding:"12px 12px",fontWeight:700,color:C.navy}}>{c.nombre}</td>
                  <td style={{padding:"12px 12px",color:C.muted,fontSize:12}}>{c.rfc||"—"}</td>
                  <td style={{padding:"12px 12px"}}>
                    <span style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[c.moneda]||"#F8FAFC",color:{MXN:"#1565C0",USD:"#2E7D32",EUR:"#6A1B9A"}[c.moneda]||C.navy,padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700}}>{c.moneda}</span>
                  </td>
                  <td style={{padding:"12px 12px",fontWeight:700,color:C.blue,textAlign:"center"}}>{c.diasCredito}</td>
                  <td style={{padding:"12px 12px",color:C.text}}>{c.contacto||"—"}</td>
                  <td style={{padding:"12px 12px",color:C.muted,fontSize:12}}>{c.telefono||"—"}</td>
                  <td style={{padding:"12px 12px",color:C.sky,fontSize:12}}>{c.email||"—"}</td>
                  <td style={{padding:"12px 8px",whiteSpace:"nowrap"}}>
                    {!esConsulta && <button onClick={()=>setModalCliente({...c})} style={{...iconBtn,color:C.blue}} title="Editar">✏️</button>}
                    {!esConsulta && <button onClick={()=>setDeleteConfirm({id:c.id,label:c.nombre})} style={{...iconBtn,color:C.danger}} title="Eliminar">🗑️</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalCliente && <ClienteModal/>}

      {deleteConfirm && (
        <div style={{position:"fixed",inset:0,background:"rgba(15,45,74,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2500,padding:20}}>
          <div style={{background:C.surface,borderRadius:20,padding:28,maxWidth:400,width:"100%",textAlign:"center",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}>
            <div style={{fontSize:48,marginBottom:16}}>🗑️</div>
            <p style={{fontSize:15,color:C.text,marginBottom:8}}>¿Eliminar este cliente?</p>
            <p style={{fontSize:14,fontWeight:700,color:C.navy,marginBottom:24}}>{deleteConfirm.label}</p>
            <div style={{display:"flex",gap:12,justifyContent:"center"}}>
              <button onClick={()=>setDeleteConfirm(null)} style={{...btnStyle,background:"#F1F5F9",color:C.text}}>Cancelar</button>
              <button onClick={handleDelete} style={{...btnStyle,background:C.danger}}>Sí, Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── ResumenCartera component ────────────────────────────────────────── */
function ResumenCartera({ invoices, suppliers, currency, filtroGrupo, setFiltroGrupo, gruposList, filtroProveedores, searchQuery, filtroMesConcepto, filtroClasif, filtroEstatus, excelBtnId, pdfBtnId, fmt, C }) {
  const hoy = new Date().toISOString().slice(0,10);
  const [detailModal, setDetailModal] = React.useState(null);
  const [grupoPickerOpen, setGrupoPickerOpen] = React.useState(false);
  const [expandedGruposMon, setExpandedGruposMon] = React.useState(new Set());
  const [expandedProveedores, setExpandedProveedores] = React.useState(new Set());
  const toggleProv = (key) => setExpandedProveedores(prev => { const n=new Set(prev); n.has(key)?n.delete(key):n.add(key); return n; });
  const toggleGrupoMon = (key) => setExpandedGruposMon(prev => { const n=new Set(prev); n.has(key)?n.delete(key):n.add(key); return n; });

  const calcDias = (venc) => venc ? Math.ceil((new Date(venc)-new Date(hoy))/864e5) : null;

  // Wire external Excel/PDF buttons
  React.useEffect(()=>{
    const excelBtn = excelBtnId ? document.getElementById(excelBtnId) : null;
    const pdfBtn   = pdfBtnId   ? document.getElementById(pdfBtnId)   : null;
    const doExcel = () => exportExcel();
    const doPdf   = () => printResumen();
    if(excelBtn) excelBtn.addEventListener('click', doExcel);
    if(pdfBtn)   pdfBtn.addEventListener('click',   doPdf);
    return () => {
      if(excelBtn) excelBtn.removeEventListener('click', doExcel);
      if(pdfBtn)   pdfBtn.removeEventListener('click',   doPdf);
    };
  });

  const aging = (saldo, vencimiento, estatus) => {
    if(estatus==="Pagado"||saldo<=0) return {corriente:0,v7:0,v15:0,v30:0,v60:0,vmas:0};
    if(!vencimiento) return {corriente:saldo,v7:0,v15:0,v30:0,v60:0,vmas:0};
    const d2 = calcDias(vencimiento);
    if(d2>=0) return {corriente:saldo,v7:0,v15:0,v30:0,v60:0,vmas:0};
    const d=Math.abs(d2);
    if(d<=7)  return {corriente:0,v7:saldo,v15:0,v30:0,v60:0,vmas:0};
    if(d<=15) return {corriente:0,v7:0,v15:saldo,v30:0,v60:0,vmas:0};
    if(d<=30) return {corriente:0,v7:0,v15:0,v30:saldo,v60:0,vmas:0};
    if(d<=60) return {corriente:0,v7:0,v15:0,v30:0,v60:saldo,vmas:0};
    return {corriente:0,v7:0,v15:0,v30:0,v60:0,vmas:saldo};
  };
  const addAging=(acc,a)=>{acc.corriente+=a.corriente;acc.v7+=a.v7;acc.v15+=a.v15;acc.v30+=a.v30;acc.v60+=a.v60;acc.vmas+=a.vmas;};
  const zeroAging=()=>({corriente:0,v7:0,v15:0,v30:0,v60:0,vmas:0});

  const activeInvoices = React.useMemo(()=>invoices.filter(i=>{
    if(i.estatus==="Pagado") return false;
    if(filtroClasif && i.clasificacion!==filtroClasif) return false;
    if(filtroEstatus && i.estatus!==filtroEstatus) return false;
    if(filtroMesConcepto) {
      if(filtroMesConcepto==="__sin_mes__") { if(detectarMesCxP(i.concepto)!==null) return false; }
      else { if(detectarMesCxP(i.concepto)!==filtroMesConcepto) return false; }
    }
    return true;
  }),[invoices, filtroMesConcepto, filtroClasif, filtroEstatus]);
  const currencies = ["MXN","USD","EUR"];
  const monedaSym = m=>m==="EUR"?"€":"$";
  const monedaFlag = {MXN:"🇲🇽",USD:"🇺🇸",EUR:"🇪🇺"};
  const monedaColor = {MXN:C.mxn,USD:C.usd,EUR:C.eur};
  const monedaBg = {MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"};

  // ── Export to Excel ──
  const exportExcel = () => {
    const XLSX2 = XLSX;
    const hoy2 = new Date().toLocaleDateString('es-MX');
    const wb = XLSX2.utils.book_new();
    const titulo = filtroGrupo ? `Grupo ${filtroGrupo}` : "Todos los Proveedores";
    currencies.forEach(mon => {
      const fpArr = filtroProveedores ? [...filtroProveedores] : [];
      const invs = activeInvoices.filter(i=>(i.moneda||"MXN")===mon && (fpArr.length===0||fpArr.includes(i.proveedor)));
      if(!invs.length) return;
      const map = {};
      invs.forEach(inv=>{
        const p=inv.proveedor||"—";
        if(filtroGrupo && (suppliers.find(s=>s.nombre===p)?.grupo||"")!==filtroGrupo) return;
        if(!map[p]) map[p]={nombre:p,total:0,pagado:0,saldo:0,count:0,corriente:0,v7:0,v15:0,v30:0,v60:0,vmas:0};
        const saldo=(+inv.total||0)-(+inv.montoPagado||0);
        map[p].total+=(+inv.total||0); map[p].pagado+=(+inv.montoPagado||0); map[p].saldo+=saldo; map[p].count+=1;
        const a=aging(saldo,inv.vencimiento,inv.estatus);
        map[p].corriente+=a.corriente; map[p].v7+=a.v7; map[p].v15+=a.v15; map[p].v30+=a.v30; map[p].v60+=a.v60; map[p].vmas+=a.vmas;
      });
      const rows = Object.values(map).filter(p=>p.total>0).sort((a,b)=>b.saldo-a.saldo);
      if(!rows.length) return;
      const headers = ["Proveedor","# Facturas","Total","Pagado","Saldo Total","Corriente","Vencido 1-7 Días","Vencido 8-15 Días","Vencido 16-30 Días","Vencido 31-60 Días","Vencido +60 Días"];
      const data = [
        [`Reporte de Cartera — ${titulo} — ${mon}`, "", `Fecha: ${hoy2}`],
        [],
        headers,
        ...rows.map(p=>[p.nombre,p.count,p.total,p.pagado,p.saldo,p.corriente,p.v7,p.v15,p.v30,p.v60,p.vmas]),
        [],
        ["TOTAL",rows.reduce((s,p)=>s+p.count,0),rows.reduce((s,p)=>s+p.total,0),rows.reduce((s,p)=>s+p.pagado,0),rows.reduce((s,p)=>s+p.saldo,0),rows.reduce((s,p)=>s+p.corriente,0),rows.reduce((s,p)=>s+p.v7,0),rows.reduce((s,p)=>s+p.v15,0),rows.reduce((s,p)=>s+p.v30,0),rows.reduce((s,p)=>s+p.v60,0),rows.reduce((s,p)=>s+p.vmas,0)],
      ];
      const ws = XLSX2.utils.aoa_to_sheet(data);
      ws['!cols'] = [{wch:35},{wch:10},{wch:14},{wch:14},{wch:14},{wch:14},{wch:16},{wch:16},{wch:16},{wch:16},{wch:14}];
      XLSX2.utils.book_append_sheet(wb, ws, mon);
    });
    const fecha = new Date().toISOString().slice(0,10);
    XLSX2.writeFile(wb, `Resumen_Cartera_${fecha}.xlsx`);
  };

  // ── Print / PDF ──
  const printResumen = () => {
    const hoy2 = new Date().toLocaleDateString('es-MX');
    const titulo = filtroGrupo ? `Grupo: ${filtroGrupo}` : "Todos los Proveedores";
    const fpArr = filtroProveedores ? [...filtroProveedores] : [];
    let html = `<html><head><meta charset="utf-8"><title>Resumen Cartera</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9px; color: #1A2332; padding: 10mm; }
      h1 { font-size: 13px; color: #0F2D4A; margin-bottom: 2px; }
      .sub { font-size: 8px; color: #64748B; margin-bottom: 10px; }
      h2 { font-size: 10px; color: #1565C0; margin: 10px 0 5px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th { background: #0F2D4A; color: #fff; padding: 5px 6px; text-align: center; font-size: 8px; text-transform: uppercase; white-space: nowrap; overflow: hidden; }
      th:first-child { text-align: left; width: 22%; }
      td { padding: 5px 6px; border-bottom: 1px solid #E2E8F0; text-align: right; font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      td:first-child { text-align: left; font-weight: 600; }
      td:nth-child(2) { text-align: center; width: 5%; }
      tr:nth-child(even) { background: #F8FAFC; }
      .total-row { background: #EEF2FF !important; font-weight: 800; border-top: 2px solid #0F2D4A; }
      .danger { color: #E53935; font-weight: 700; }
      .ok { color: #43A047; }
      .navy { color: #0F2D4A; font-weight: 800; }
      .muted { color: #94A3B8; }
      @page { size: A4 landscape; margin: 8mm; }
      @media print {
        body { padding: 0; }
        html, body { width: 100%; }
      }
    </style></head><body>
    <h1>📋 Resumen de Cartera — ${titulo}</h1>
    <div class="sub">Fecha: ${hoy2} &nbsp;·&nbsp; Solo facturas activas (Pendientes, Vencidas, Parciales)</div>`;

    currencies.forEach(mon=>{
      const invs = activeInvoices.filter(i=>(i.moneda||"MXN")===mon && (fpArr.length===0||fpArr.includes(i.proveedor)));
      if(!invs.length) return;
      const map={};
      invs.forEach(inv=>{
        const p=inv.proveedor||"—";
        if(filtroGrupo && (suppliers.find(s=>s.nombre===p)?.grupo||"")!==filtroGrupo) return;
        if(!map[p]) map[p]={nombre:p,total:0,pagado:0,saldo:0,count:0,corriente:0,v7:0,v15:0,v30:0,v60:0,vmas:0};
        const s=(+inv.total||0)-(+inv.montoPagado||0);
        map[p].total+=(+inv.total||0); map[p].pagado+=(+inv.montoPagado||0); map[p].saldo+=s; map[p].count+=1;
        const a=aging(s,inv.vencimiento,inv.estatus);
        map[p].corriente+=a.corriente; map[p].v7+=a.v7; map[p].v15+=a.v15; map[p].v30+=a.v30; map[p].v60+=a.v60; map[p].vmas+=a.vmas;
      });
      const rows=Object.values(map).filter(p=>p.total>0).sort((a,b)=>b.saldo-a.saldo);
      if(!rows.length) return;
      const sym=monedaSym(mon);
      const f=v=>v.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
      const c=v=>v>0?`<span class="danger">${sym}${f(v)}</span>`:`<span style="color:#94A3B8">—</span>`;
      const grand={total:0,pagado:0,saldo:0,count:0,corriente:0,v7:0,v15:0,v30:0,v60:0,vmas:0};
      rows.forEach(p=>{Object.keys(grand).forEach(k=>grand[k]+=p[k]||0);});
      html+=`<h2>${{MXN:"🇲🇽",USD:"🇺🇸",EUR:"🇪🇺"}[mon]} ${mon} — ${rows.length} proveedores · ${rows.reduce((s,p)=>s+p.count,0)} facturas</h2>
      <table><thead><tr>
        <th>Proveedor</th><th># Fact</th><th>Total</th><th>Pagado</th><th>Saldo</th>
        <th>Corriente</th><th>Venc 1-7d</th><th>Venc 8-15d</th><th>Venc 16-30d</th><th>Venc 31-60d</th><th>Venc +60d</th>
      </tr></thead><tbody>`;
      rows.forEach(p=>{
        html+=`<tr>
          <td>${p.nombre}</td><td style="text-align:center">${p.count}</td>
          <td>${sym}${f(p.total)}</td><td class="ok">${sym}${f(p.pagado)}</td>
          <td class="navy"><strong>${sym}${f(p.saldo)}</strong></td>
          <td class="ok">${p.corriente>0?sym+f(p.corriente):'<span style="color:#94A3B8">—</span>'}</td>
          <td>${c(p.v7)}</td><td>${c(p.v15)}</td><td>${c(p.v30)}</td><td>${c(p.v60)}</td><td>${c(p.vmas)}</td>
        </tr>`;
      });
      html+=`<tr class="total-row">
        <td>TOTAL</td><td style="text-align:center">${grand.count}</td>
        <td>${sym}${f(grand.total)}</td><td class="ok">${sym}${f(grand.pagado)}</td>
        <td class="navy"><strong>${sym}${f(grand.saldo)}</strong></td>
        <td class="ok">${grand.corriente>0?sym+f(grand.corriente):'—'}</td>
        <td>${grand.v7>0?`<span class="danger">${sym}${f(grand.v7)}</span>`:'—'}</td>
        <td>${grand.v15>0?`<span class="danger">${sym}${f(grand.v15)}</span>`:'—'}</td>
        <td>${grand.v30>0?`<span class="danger">${sym}${f(grand.v30)}</span>`:'—'}</td>
        <td>${grand.v60>0?`<span class="danger">${sym}${f(grand.v60)}</span>`:'—'}</td>
        <td>${grand.vmas>0?`<span class="danger">${sym}${f(grand.vmas)}</span>`:'—'}</td>
      </tr></tbody></table>`;
    });
    html+=`</body></html>`;
    const w=window.open('','_blank','width=1200,height=800');
    w.document.write(html);
    w.document.close();
    w.onload=()=>{ w.focus(); w.print(); };
  };

  // Build per-proveedor+moneda data
  const allProvData = React.useMemo(()=>{
    const fpArr = filtroProveedores ? [...filtroProveedores] : [];
    const map = {};
    activeInvoices.forEach(inv=>{
      const p=inv.proveedor||"—";
      if(fpArr.length>0 && !fpArr.includes(p)) return;
      const mon=(inv.moneda||"MXN");
      const key=`${p}||${mon}`;
      if(!map[key]){
        const sup=suppliers.find(s=>s.nombre===p);
        map[key]={nombre:p,grupo:sup?.grupo||"",moneda:mon,total:0,pagado:0,saldo:0,count:0,invoices:[],...zeroAging()};
      }
      const saldo=(+inv.total||0)-(+inv.montoPagado||0);
      map[key].total+=(+inv.total||0);
      map[key].pagado+=(+inv.montoPagado||0);
      map[key].saldo+=saldo;
      map[key].count+=1;
      map[key].invoices.push(inv);
      addAging(map[key],aging(saldo,inv.vencimiento,inv.estatus));
    });
    return Object.values(map);
  },[activeInvoices, suppliers, filtroProveedores]);

  // Flat proveedor list (no grouping) — filtered by search
  const provFlat = React.useMemo(()=>{
    // Merge same proveedor across monedas for flat view
    const map={};
    allProvData.forEach(p=>{
      if(searchQuery && !p.nombre.toLowerCase().includes(searchQuery.toLowerCase())) return;
      if(!map[p.nombre]) map[p.nombre]={nombre:p.nombre,grupo:p.grupo,byMon:{}};
      map[p.nombre].byMon[p.moneda]=p;
    });
    return Object.values(map).sort((a,b)=>{
      const sA=Object.values(a.byMon).reduce((s,v)=>s+v.saldo,0);
      const sB=Object.values(b.byMon).reduce((s,v)=>s+v.saldo,0);
      return sB-sA;
    });
  },[allProvData,searchQuery]);

  // Group view — only when filtroGrupo is set
  const grupoData = React.useMemo(()=>{
    if(!filtroGrupo) return null;
    const byMon={};
    allProvData.forEach(p=>{
      if(p.grupo !== filtroGrupo) return;
      const mon=p.moneda;
      if(!byMon[mon]) byMon[mon]={total:0,pagado:0,saldo:0,count:0,...zeroAging(),proveedores:[]};
      byMon[mon].proveedores.push(p);
      byMon[mon].total+=p.total; byMon[mon].pagado+=p.pagado; byMon[mon].saldo+=p.saldo; byMon[mon].count+=p.count;
      addAging(byMon[mon],p);
    });
    return byMon;
  },[allProvData,filtroGrupo]);

  const openDetail=(title,invList,grouped=true)=>{ if(!invList||!invList.length) return; setDetailModal({title,invoices:invList,grouped}); };

  const vCell=(v,sym,invList,label,color=C.danger)=>v>0?(
    <span onClick={()=>openDetail(label,invList,true)}
      style={{fontWeight:700,color,cursor:"pointer",borderBottom:`1px dotted ${color}`}}>
      {sym}{fmt(v)}
    </span>
  ):<span style={{color:C.muted}}>—</span>;

  // Detail Modal — grouped by proveedor
  const DetailModal=()=>{
    if(!detailModal) return null;
    const invs=detailModal.invoices;
    const grouped=detailModal.grouped!==false;
    const total=invs.reduce((s,i)=>s+(+i.total||0),0);
    const pagado=invs.reduce((s,i)=>s+(+i.montoPagado||0),0);
    const saldo=total-pagado;
    const sym=invs[0]?monedaSym(invs[0].moneda||"MXN"):"$";

    // Group by proveedor
    const byProv = grouped ? invs.reduce((acc,i)=>{
      const p=i.proveedor||"—";
      if(!acc[p]) acc[p]={proveedor:p,invs:[],saldo:0};
      acc[p].invs.push(i);
      acc[p].saldo+=((+i.total||0)-(+i.montoPagado||0));
      return acc;
    },{}) : null;
    const provList = byProv ? Object.values(byProv).sort((a,b)=>b.saldo-a.saldo) : null;

    const thead=(
      <thead style={{position:"sticky",top:0}}>
        <tr style={{background:C.navy}}>
          {["Fecha","Folio","Proveedor","Concepto","Mes","Clasif.","Total","Pagado","Saldo Total","Vencimiento","Días","Estatus"].map(h=>(
            <th key={h} style={{padding:"10px 12px",textAlign:["Total","Pagado","Saldo Total"].includes(h)?"right":"left",color:"#fff",fontWeight:700,fontSize:11,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
          ))}
        </tr>
      </thead>
    );

    const InvRow=({inv,i})=>{
      const saldoInv=(+inv.total||0)-(+inv.montoPagado||0);
      const dias=calcDias(inv.vencimiento);
      const mes=detectarMesCxP(inv.concepto);
      return(
        <tr style={{borderTop:`1px solid ${C.border}`,background:i%2===0?"#fff":"#FAFBFC"}}>
          <td style={{padding:"10px 12px",fontSize:12,color:C.muted,whiteSpace:"nowrap"}}>{inv.fecha||"—"}</td>
          <td style={{padding:"10px 12px",fontWeight:600,color:C.blue,whiteSpace:"nowrap"}}>{inv.serie}{inv.folio}</td>
          <td style={{padding:"10px 12px",fontWeight:600,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inv.proveedor}</td>
          <td style={{padding:"10px 12px",fontSize:12,color:C.muted,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inv.concepto||"—"}</td>
          <td style={{padding:"10px 12px"}}>
            {mes?<span style={{background:"#E8EAF6",color:"#3949AB",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>{mes}</span>:<span style={{color:C.muted,fontSize:11}}>—</span>}
          </td>
          <td style={{padding:"10px 12px"}}><span style={{background:"#EEF2FF",color:C.blue,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>{inv.clasificacion}</span></td>
          <td style={{padding:"10px 12px",textAlign:"right",fontWeight:700,whiteSpace:"nowrap"}}>{sym}{fmt(+inv.total||0)}</td>
          <td style={{padding:"10px 12px",textAlign:"right",color:C.ok,whiteSpace:"nowrap"}}>{sym}{fmt(+inv.montoPagado||0)}</td>
          <td style={{padding:"10px 12px",textAlign:"right",fontWeight:800,color:saldoInv>0?C.danger:C.ok,whiteSpace:"nowrap"}}>{sym}{fmt(saldoInv)}</td>
          <td style={{padding:"10px 12px",fontSize:12,color:C.muted,whiteSpace:"nowrap"}}>{inv.vencimiento||"—"}</td>
          <td style={{padding:"10px 12px",textAlign:"center"}}>
            {dias===null?<span style={{color:C.muted}}>—</span>:dias<0?(
              <span style={{background:"#FFEBEE",color:C.danger,fontWeight:800,fontSize:11,padding:"2px 7px",borderRadius:20,whiteSpace:"nowrap"}}>{Math.abs(dias)}d venc.</span>
            ):<span style={{background:"#E8F5E9",color:C.ok,fontWeight:700,fontSize:11,padding:"2px 7px",borderRadius:20,whiteSpace:"nowrap"}}>{dias}d</span>}
          </td>
          <td style={{padding:"10px 12px"}}><span style={{background:`${statusColor(inv.estatus)}22`,color:statusColor(inv.estatus),border:`1px solid ${statusColor(inv.estatus)}`,padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{inv.estatus}</span></td>
        </tr>
      );
    };

    return(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
        onClick={()=>setDetailModal(null)}>
        <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:1300,maxHeight:"88vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 64px rgba(0,0,0,.3)"}}
          onClick={e=>e.stopPropagation()}>
          <div style={{padding:"18px 28px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:C.navy,borderRadius:"16px 16px 0 0"}}>
            <div>
              <div style={{fontWeight:800,fontSize:17,color:"#fff"}}>{detailModal.title}</div>
              <div style={{fontSize:13,color:"#A5D6A7",marginTop:3}}>
                {invs.length} factura{invs.length!==1?"s":""} · Saldo: <b>{sym}{fmt(saldo)}</b>
                {grouped&&provList?` · ${provList.length} proveedor${provList.length!==1?"es":""}`:""}</div>
            </div>
            <button onClick={()=>setDetailModal(null)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:20,color:"#fff"}}>×</button>
          </div>
          <div style={{overflowY:"auto",flex:1}}>
            {grouped && provList ? (
              provList.map((pg,pi)=>(
                <div key={pg.proveedor}>
                  <div style={{background:"#EEF2FF",padding:"10px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:pi>0?`3px solid #C5CAE9`:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:2}}>
                    <span style={{fontWeight:800,fontSize:14,color:C.navy}}>🏢 {pg.proveedor}</span>
                    <div style={{display:"flex",gap:20,fontSize:13}}>
                      <span style={{color:C.muted}}>{pg.invs.length} factura{pg.invs.length!==1?"s":""}</span>
                      <span style={{color:C.danger,fontWeight:700}}>Saldo: {sym}{fmt(pg.saldo)}</span>
                    </div>
                  </div>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                    {thead}<tbody>{pg.invs.sort((a,b)=>(a.vencimiento||"").localeCompare(b.vencimiento||"")).map((inv,i)=><InvRow key={inv.id} inv={inv} i={i}/>)}</tbody>
                  </table>
                </div>
              ))
            ):(
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                {thead}<tbody>{invs.sort((a,b)=>(a.vencimiento||"").localeCompare(b.vencimiento||"")).map((inv,i)=><InvRow key={inv.id} inv={inv} i={i}/>)}</tbody>
              </table>
            )}
          </div>
          <div style={{padding:"14px 28px",borderTop:`1px solid ${C.border}`,display:"flex",gap:24,background:"#F8FAFC"}}>
            <span style={{fontSize:13,color:C.muted}}>Total: <b style={{color:C.navy}}>{sym}{fmt(total)}</b></span>
            <span style={{fontSize:13,color:C.muted}}>Pagado: <b style={{color:C.ok}}>{sym}{fmt(pagado)}</b></span>
            <span style={{fontSize:13,color:C.muted}}>Saldo: <b style={{color:C.danger}}>{sym}{fmt(saldo)}</b></span>
            {grouped&&provList&&<span style={{fontSize:13,color:C.muted}}>Proveedores: <b style={{color:C.navy}}>{provList.length}</b></span>}
          </div>
        </div>
      </div>
    );
  };

  // Grupo Picker Modal
  const GrupoPicker=()=>{
    if(!grupoPickerOpen) return null;
    return(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
        onClick={()=>setGrupoPickerOpen(false)}>
        <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:400,boxShadow:"0 24px 64px rgba(0,0,0,.25)",overflow:"hidden"}}
          onClick={e=>e.stopPropagation()}>
          <div style={{padding:"16px 20px",background:C.navy,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontWeight:800,color:"#fff",fontSize:15}}>🏨 Seleccionar Grupo</span>
            <button onClick={()=>setGrupoPickerOpen(false)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:6,color:"#fff",width:28,height:28,cursor:"pointer",fontSize:16}}>×</button>
          </div>
          <div style={{padding:"8px 0"}}>
            {/* All option */}
            <div onClick={()=>{setFiltroGrupo("");setGrupoPickerOpen(false);}}
              style={{padding:"12px 20px",cursor:"pointer",fontSize:14,color:!filtroGrupo?C.blue:C.text,fontWeight:!filtroGrupo?700:400,background:!filtroGrupo?"#E8F0FE":"#fff",display:"flex",alignItems:"center",gap:8}}
              onMouseEnter={e=>e.currentTarget.style.background=!filtroGrupo?"#E8F0FE":"#F0F4FF"}
              onMouseLeave={e=>e.currentTarget.style.background=!filtroGrupo?"#E8F0FE":"#fff"}>
              <span>📋</span> Todos los proveedores
              {!filtroGrupo && <span style={{marginLeft:"auto",fontSize:12,color:C.blue}}>✓ Activo</span>}
            </div>
            {gruposList.length===0 && (
              <div style={{padding:"20px",textAlign:"center",color:C.muted,fontSize:13,fontStyle:"italic"}}>
                Sin grupos configurados.<br/>Asígnalos en Proveedores → Grupo Empresarial.
              </div>
            )}
            {gruposList.map(g=>(
              <div key={g} onClick={()=>{setFiltroGrupo(g);setGrupoPickerOpen(false);}}
                style={{padding:"12px 20px",cursor:"pointer",fontSize:14,color:filtroGrupo===g?C.blue:C.text,fontWeight:filtroGrupo===g?700:400,background:filtroGrupo===g?"#E8F0FE":"#fff",display:"flex",alignItems:"center",gap:8}}
                onMouseEnter={e=>e.currentTarget.style.background=filtroGrupo===g?"#E8F0FE":"#F0F4FF"}
                onMouseLeave={e=>e.currentTarget.style.background=filtroGrupo===g?"#E8F0FE":"#fff"}>
                <span>🏨</span> {g}
                {filtroGrupo===g && <span style={{marginLeft:"auto",fontSize:12,color:C.blue}}>✓ Activo</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const COLS = ["# Facturas","Total","Pagado","Saldo Total","Corriente","Vencido 1-7 Días","Vencido 8-15 Días","Vencido 16-30 Días","Vencido 31-60 Días","Vencido +60 Días",""];

  // Render flat proveedor table for a given moneda
  const ProvTable=({mon, provs})=>{
    const [expandedProveedores, setExpandedProveedores] = React.useState(new Set());
    const [sortCol, setSortCol] = React.useState("saldo");
    const [sortDir, setSortDir] = React.useState("desc");
    const toggleSort = col => { if(sortCol===col) setSortDir(d=>d==="asc"?"desc":"asc"); else {setSortCol(col);setSortDir("desc");} };
    const arrow = col => sortCol===col ? (sortDir==="asc"?" ↑":" ↓") : "";
    const toggleProv = (key) => setExpandedProveedores(prev => { const n=new Set(prev); n.has(key)?n.delete(key):n.add(key); return n; });
    const sym=monedaSym(mon);
    const grand=provs.reduce((acc,p)=>{
      acc.total+=p.total;acc.pagado+=p.pagado;acc.saldo+=p.saldo;acc.count+=p.count;addAging(acc,p);return acc;
    },{total:0,pagado:0,saldo:0,count:0,...zeroAging()});
    const allInvs=provs.flatMap(p=>p.invoices);
    const filterInvs=(fn)=>allInvs.filter(inv=>{const d=calcDias(inv.vencimiento);return fn(d);});

    const sortedProvs = [...provs].sort((a,b)=>{
      let va,vb;
      switch(sortCol){
        case "nombre":  va=a.nombre||""; vb=b.nombre||""; break;
        case "count":   va=a.count;       vb=b.count; break;
        case "total":   va=a.total;       vb=b.total; break;
        case "pagado":  va=a.pagado;      vb=b.pagado; break;
        case "saldo":   va=a.saldo;       vb=b.saldo; break;
        case "corriente":va=a.corriente||0;vb=b.corriente||0; break;
        case "v7":      va=a.v7||0;       vb=b.v7||0; break;
        case "v15":     va=a.v15||0;      vb=b.v15||0; break;
        case "v30":     va=a.v30||0;      vb=b.v30||0; break;
        case "v60":     va=a.v60||0;      vb=b.v60||0; break;
        case "vmas":    va=a.vmas||0;     vb=b.vmas||0; break;
        default:        va=a.saldo;       vb=b.saldo;
      }
      const cmp=typeof va==="number"?va-vb:String(va).localeCompare(String(vb));
      return sortDir==="asc"?cmp:-cmp;
    });

    // Column definitions for header
    const COL_DEFS = [
      {k:"nombre",   l:"Proveedor",         align:"left"},
      {k:"count",    l:"# Facturas",        align:"center"},
      {k:"total",    l:"Total",             align:"center"},
      {k:"pagado",   l:"Pagado",            align:"center"},
      {k:"saldo",    l:"Saldo Total",       align:"center"},
      {k:"corriente",l:"Corriente",         align:"center", hc:"#80CBC4"},
      {k:"v7",       l:"Vencido 1-7 Días",  align:"center", hc:"#FFCC80"},
      {k:"v15",      l:"Vencido 8-15 Días", align:"center", hc:"#FF8A65"},
      {k:"v30",      l:"Vencido 16-30 Días",align:"center", hc:"#F1948A"},
      {k:"v60",      l:"Vencido 31-60 Días",align:"center", hc:"#E57373"},
      {k:"vmas",     l:"Vencido +60 Días",  align:"center", hc:"#FFCDD2"},
      {k:"_",        l:"",                  align:"center"},
    ];

    return(
      <div style={{marginBottom:28}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <span style={{fontSize:20}}>{monedaFlag[mon]}</span>
          <span style={{fontSize:17,fontWeight:900,color:monedaColor[mon]}}>{mon}</span>
          <span style={{fontSize:13,color:C.muted}}>{grand.count} facturas activas · {provs.length} proveedores</span>
        </div>
        {/* Chips — grande con paleta de urgencia */}
        <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
          {[
            {l:"Saldo Total",       v:grand.saldo,     c:"#fff",    bg:"#0F2D4A", border:"#0F2D4A", inv:allInvs},
            {l:"Corriente",         v:grand.corriente, c:"#1B5E20", bg:"#E8F5E9", border:"#A5D6A7", inv:filterInvs(d=>d!==null&&d>=0)},
            {l:"Vencido 1-7 Días",  v:grand.v7,        c:"#E65100", bg:"#FFF3E0", border:"#FFCC80", inv:filterInvs(d=>d!==null&&d<0&&Math.abs(d)<=7)},
            {l:"Vencido 8-15 Días", v:grand.v15,       c:"#BF360C", bg:"#FBE9E7", border:"#FF8A65", inv:filterInvs(d=>d!==null&&d<0&&Math.abs(d)>7&&Math.abs(d)<=15)},
            {l:"Vencido 16-30 Días",v:grand.v30,       c:"#fff",    bg:"#C0392B", border:"#C0392B", inv:filterInvs(d=>d!==null&&d<0&&Math.abs(d)>15&&Math.abs(d)<=30)},
            {l:"Vencido 31-60 Días",v:grand.v60,       c:"#fff",    bg:"#B71C1C", border:"#B71C1C", inv:filterInvs(d=>d!==null&&d<0&&Math.abs(d)>30&&Math.abs(d)<=60)},
            {l:"Vencido +60 Días",  v:grand.vmas,      c:"#fff",    bg:"#4A0000", border:"#4A0000", inv:filterInvs(d=>d!==null&&d<0&&Math.abs(d)>60)},
          ].filter(k=>k.v>0).map(k=>(
            <div key={k.l} onClick={()=>openDetail(`${mon} — ${k.l}`,k.inv,true)}
              style={{background:k.bg,border:`2px solid ${k.border}`,borderRadius:16,padding:"16px 22px",cursor:"pointer",minWidth:150,flex:"1 1 150px",transition:"all .15s",boxShadow:"0 2px 6px rgba(0,0,0,.08)"}}
              onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.03)";e.currentTarget.style.boxShadow="0 6px 18px rgba(0,0,0,.15)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="0 2px 6px rgba(0,0,0,.08)";}}>
              <div style={{fontSize:12,color:k.c,fontWeight:800,textTransform:"uppercase",opacity:.9,marginBottom:6,letterSpacing:.5}}>{k.l}</div>
              <div style={{fontSize:24,fontWeight:900,color:k.c,letterSpacing:-.5}}>{sym}{fmt(k.v)}</div>
            </div>
          ))}
        </div>
        {/* Table */}
        <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:1100}}>
              <thead>
                <tr style={{background:C.navy}}>
                  {COL_DEFS.map(col=>(
                    <th key={col.k} onClick={col.k!=="_"?()=>toggleSort(col.k):undefined}
                      style={{padding:"13px 10px",textAlign:col.align||"center",
                        color:sortCol===col.k?"#90CAF9":(col.hc||"#fff"),
                        fontWeight:800,fontSize:12,textTransform:"uppercase",whiteSpace:"nowrap",
                        cursor:col.k!=="_"?"pointer":"default",userSelect:"none",
                        borderBottom:sortCol===col.k?"2px solid #90CAF9":"2px solid transparent",
                        transition:"color .15s",letterSpacing:.3}}
                      onMouseEnter={e=>{if(col.k!=="_")e.currentTarget.style.color="#fff";}}
                      onMouseLeave={e=>{if(col.k!=="_")e.currentTarget.style.color=sortCol===col.k?"#90CAF9":(col.hc||"#fff");}}>
                      {col.l}{arrow(col.k)}
                    </th>
                  ))}
                </tr>
                {/* Totals row */}
                <tr style={{background:"#1A2F4A",borderBottom:`2px solid #2D4A6B`}}>
                  <td style={{padding:"10px 14px",fontWeight:800,color:"#fff",fontSize:14}}>TOTAL ({provs.length} proveedores)</td>
                  <td style={{padding:"10px 10px",textAlign:"center",fontWeight:700,color:"rgba(255,255,255,.75)",fontSize:13}}>{grand.count}</td>
                  <td style={{padding:"10px 10px",textAlign:"center",fontWeight:700,color:"rgba(255,255,255,.75)",fontSize:13}}>{sym}{fmt(grand.total)}</td>
                  <td style={{padding:"10px 10px",textAlign:"center",fontWeight:700,color:"rgba(255,255,255,.75)",fontSize:13}}>{sym}{fmt(grand.pagado)}</td>
                  <td style={{padding:"10px 10px",textAlign:"center",fontWeight:900,color:"#fff",fontSize:15}}>{sym}{fmt(grand.saldo)}</td>
                  <td style={{padding:"10px 10px",textAlign:"center",fontWeight:700,color:"rgba(255,255,255,.75)",fontSize:13}}>{grand.corriente>0?`${sym}${fmt(grand.corriente)}`:""}</td>
                  <td style={{padding:"10px 10px",textAlign:"center",fontWeight:700,color:"rgba(255,255,255,.75)",fontSize:13}}>{grand.v7>0?`${sym}${fmt(grand.v7)}`:""}</td>
                  <td style={{padding:"10px 10px",textAlign:"center",fontWeight:700,color:"rgba(255,255,255,.75)",fontSize:13}}>{grand.v15>0?`${sym}${fmt(grand.v15)}`:""}</td>
                  <td style={{padding:"10px 10px",textAlign:"center",fontWeight:700,color:"rgba(255,255,255,.75)",fontSize:13}}>{grand.v30>0?`${sym}${fmt(grand.v30)}`:""}</td>
                  <td style={{padding:"10px 10px",textAlign:"center",fontWeight:700,color:"rgba(255,255,255,.75)",fontSize:13}}>{grand.v60>0?`${sym}${fmt(grand.v60)}`:""}</td>
                  <td style={{padding:"10px 10px",textAlign:"center",fontWeight:700,color:"rgba(255,255,255,.75)",fontSize:13}}>{grand.vmas>0?`${sym}${fmt(grand.vmas)}`:""}</td>
                  <td/>
                </tr>
              </thead>
              <tbody>
                {sortedProvs.map((p,pi)=>{
                  const fi=(fn)=>p.invoices.filter(inv=>{const d=calcDias(inv.vencimiento);return fn(d);});
                  const provKey=`${mon}-${p.nombre}`;
                  const expanded=expandedProveedores.has(provKey);
                  return(
                    <React.Fragment key={p.nombre}>
                    <tr style={{borderTop:`1px solid ${C.border}`,background:expanded?"#E8F0FE":pi%2===0?"#FAFBFF":"#fff",cursor:"pointer"}}
                      onClick={()=>toggleProv(provKey)}
                      onMouseEnter={e=>{if(!expanded)e.currentTarget.style.background="#F0F7FF";}}
                      onMouseLeave={e=>{e.currentTarget.style.background=expanded?"#E8F0FE":pi%2===0?"#FAFBFF":"#fff";}}>
                      <td style={{padding:"11px 14px",fontWeight:700,fontSize:14,color:C.navy}}>
                        <span style={{marginRight:8,fontSize:11,color:C.blue,display:"inline-block",transform:expanded?"rotate(90deg)":"rotate(0deg)",transition:"transform .2s"}}>▶</span>
                        {p.nombre}
                      </td>
                      <td style={{padding:"11px 10px",textAlign:"center",color:C.muted,fontSize:14}}>{p.count}</td>
                      <td style={{padding:"11px 10px",textAlign:"center",fontWeight:600,fontSize:15}}>{sym}{fmt(p.total)}</td>
                      <td style={{padding:"11px 10px",textAlign:"center",color:C.ok,fontWeight:600,fontSize:15}}>{sym}{fmt(p.pagado)}</td>
                      <td style={{padding:"11px 10px",textAlign:"center",fontSize:15}} onClick={e=>e.stopPropagation()}>
                        <span onClick={()=>openDetail(`${p.nombre} — Todas`,p.invoices)} style={{fontWeight:900,color:p.saldo>0?C.navy:C.muted,borderBottom:`1px dotted ${C.navy}`,cursor:"pointer"}}>{sym}{fmt(p.saldo)}</span>
                      </td>
                      <td style={{padding:"11px 10px",textAlign:"center",fontSize:15}} onClick={e=>e.stopPropagation()}>{p.corriente>0?<span style={{color:"#2E7D32",fontWeight:600,cursor:"pointer",borderBottom:"1px dotted #2E7D32"}} onClick={()=>openDetail(`${p.nombre} — Corriente`,fi(d=>d!==null&&d>=0))}>{sym}{fmt(p.corriente)}</span>:<span style={{color:C.muted}}>—</span>}</td>
                      <td style={{padding:"11px 10px",textAlign:"center",fontSize:15}} onClick={e=>e.stopPropagation()}>{vCell(p.v7,sym,fi(d=>d!==null&&d<0&&Math.abs(d)<=7),`${p.nombre} — Venc 1-7d`,"#E65100")}</td>
                      <td style={{padding:"11px 10px",textAlign:"center",fontSize:15}} onClick={e=>e.stopPropagation()}>{vCell(p.v15,sym,fi(d=>d!==null&&d<0&&Math.abs(d)>7&&Math.abs(d)<=15),`${p.nombre} — Venc 8-15d`,"#BF360C")}</td>
                      <td style={{padding:"11px 10px",textAlign:"center",fontSize:15}} onClick={e=>e.stopPropagation()}>{vCell(p.v30,sym,fi(d=>d!==null&&d<0&&Math.abs(d)>15&&Math.abs(d)<=30),`${p.nombre} — Venc 16-30d`,"#C0392B")}</td>
                      <td style={{padding:"11px 10px",textAlign:"center",fontSize:15}} onClick={e=>e.stopPropagation()}>{vCell(p.v60,sym,fi(d=>d!==null&&d<0&&Math.abs(d)>30&&Math.abs(d)<=60),`${p.nombre} — Venc 31-60d`,"#B71C1C")}</td>
                      <td style={{padding:"11px 10px",textAlign:"center",fontSize:15}} onClick={e=>e.stopPropagation()}>{vCell(p.vmas,sym,fi(d=>d!==null&&d<0&&Math.abs(d)>60),`${p.nombre} — Venc +60d`,"#6A0000")}</td>
                      <td style={{padding:"11px 10px",textAlign:"right"}} onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>openDetail(`${p.nombre} — Todas`,p.invoices)}
                          style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${C.blue}`,background:"#E8F0FE",color:C.blue,cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit",whiteSpace:"nowrap"}}>Ver →</button>
                      </td>
                    </tr>
                    {/* Accordion: facturas del proveedor */}
                    {expanded && (
                      <tr style={{background:"#F8FAFC"}}>
                        <td colSpan={12} style={{padding:0}}>
                          <div style={{overflowX:"auto",borderTop:`1px solid ${C.border}`}}>
                            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                              <thead>
                                <tr style={{background:"#EEF2FF"}}>
                                  {["Fecha","Folio","Concepto","Clasif.","Vencimiento","Días","Total","Pagado","Saldo Total","Estatus"].map(h=>(
                                    <th key={h} style={{padding:"7px 12px",textAlign:["Total","Pagado","Saldo Total"].includes(h)?"right":"left",color:C.navy,fontWeight:700,fontSize:11,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {p.invoices.filter(i=>i.estatus!=="Pagado").sort((a,b)=>(a.vencimiento||"").localeCompare(b.vencimiento||"")).map((inv,ii)=>{
                                  const saldoInv=(+inv.total||0)-(+inv.montoPagado||0);
                                  const dias=calcDias(inv.vencimiento);
                                  return(
                                    <tr key={inv.id} style={{borderTop:`1px solid ${C.border}`,background:ii%2===0?"#fff":"#F8FAFC"}}>
                                      <td style={{padding:"7px 12px",fontSize:11,color:C.muted,whiteSpace:"nowrap"}}>{inv.fecha||"—"}</td>
                                      <td style={{padding:"7px 12px",color:C.blue,fontWeight:600,whiteSpace:"nowrap"}}>{inv.serie}{inv.folio}</td>
                                      <td style={{padding:"7px 12px",color:C.muted,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inv.concepto||"—"}</td>
                                      <td style={{padding:"7px 12px"}}><span style={{background:"#EEF2FF",color:C.blue,padding:"2px 6px",borderRadius:20,fontSize:10,fontWeight:700}}>{inv.clasificacion}</span></td>
                                      <td style={{padding:"7px 12px",fontSize:11,whiteSpace:"nowrap",color:dias!==null&&dias<0?C.danger:C.text}}>{inv.vencimiento||"—"}</td>
                                      <td style={{padding:"7px 12px",textAlign:"center"}}>
                                        {dias===null?<span style={{color:C.muted}}>—</span>:dias<0?
                                          <span style={{background:"#FFEBEE",color:C.danger,fontWeight:800,fontSize:10,padding:"2px 6px",borderRadius:20}}>{Math.abs(dias)}d venc.</span>:
                                          <span style={{background:"#E8F5E9",color:C.ok,fontWeight:700,fontSize:10,padding:"2px 6px",borderRadius:20}}>{dias}d</span>}
                                      </td>
                                      <td style={{padding:"7px 12px",textAlign:"right",fontWeight:600}}>{sym}{fmt(+inv.total||0)}</td>
                                      <td style={{padding:"7px 12px",textAlign:"right",color:C.ok}}>{sym}{fmt(+inv.montoPagado||0)}</td>
                                      <td style={{padding:"7px 12px",textAlign:"right",fontWeight:800,color:saldoInv>0?C.danger:C.ok}}>{sym}{fmt(saldoInv)}</td>
                                      <td style={{padding:"7px 12px"}}><span style={{background:`${statusColor(inv.estatus)}22`,color:statusColor(inv.estatus),border:`1px solid ${statusColor(inv.estatus)}`,padding:"2px 7px",borderRadius:20,fontSize:10,fontWeight:700}}>{inv.estatus}</span></td>
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

  return(
    <div>
      <DetailModal/>
      <GrupoPicker/>

      {/* Export buttons only — now wired from outside */}
      <div style={{display:"none"}}></div>

      {/* ── VISTA GRUPO SELECCIONADO ── */}
      {filtroGrupo && grupoData && (
        <div>
          <div style={{fontWeight:800,fontSize:16,color:C.navy,marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
            🏨 {filtroGrupo}
            <span style={{fontSize:13,color:C.muted,fontWeight:400}}>— deuda consolidada por moneda</span>
          </div>
          {currencies.map(mon=>{
            const v=grupoData[mon];
            if(!v||!v.proveedores.length) return null;
            return <ProvTable key={mon} mon={mon} provs={v.proveedores}/>;
          })}
        </div>
      )}

      {/* ── VISTA TODOS LOS PROVEEDORES ── */}
      {!filtroGrupo && (
        <div>
          {currencies.map(mon=>{
            const provs=provFlat.map(p=>p.byMon[mon]).filter(Boolean);
            if(!provs.length) return null;
            return <ProvTable key={mon} mon={mon} provs={provs}/>;
          })}
        </div>
      )}
    </div>
  );
}

/* ── ProveedorPicker component ───────────────────────────────────────── */
function ProveedorPicker({ curInvoices, filtroProveedores, setFiltroProveedores, inputStyle, C }) {
  const [open, setOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState("");
  const [localSel, setLocalSel] = useState(new Set());

  const provList = useMemo(() =>
    [...new Set(curInvoices.map(i=>i.proveedor))].sort(),
  [curInvoices]);

  const filtered = localSearch
    ? provList.filter(p=>p.toLowerCase().includes(localSearch.toLowerCase()))
    : provList;

  const handleOpen = () => {
    setLocalSel(new Set(filtroProveedores));
    setLocalSearch("");
    setOpen(true);
  };

  const handleApply = () => {
    setFiltroProveedores(new Set(localSel));
    setOpen(false);
  };

  const handleClear = () => {
    setLocalSel(new Set());
    setFiltroProveedores(new Set());
    setOpen(false);
  };

  const toggleAll = () => {
    if(localSel.size === filtered.length) setLocalSel(new Set());
    else setLocalSel(new Set(filtered));
  };

  const toggle = (p) => {
    const n = new Set(localSel);
    n.has(p) ? n.delete(p) : n.add(p);
    setLocalSel(n);
  };

  const label = filtroProveedores.size === 0
    ? "Todos los proveedores"
    : filtroProveedores.size === 1
      ? [...filtroProveedores][0]
      : `${filtroProveedores.size} proveedores seleccionados`;

  return (
    <>
      <button onClick={handleOpen} style={{
        ...inputStyle, display:"flex", alignItems:"center", gap:6, cursor:"pointer",
        background: filtroProveedores.size>0 ? "#E8F0FE" : "#fff",
        borderColor: filtroProveedores.size>0 ? C.blue : C.border,
        color: filtroProveedores.size>0 ? C.blue : C.muted,
        fontWeight: filtroProveedores.size>0 ? 700 : 400,
        minWidth: 200, maxWidth: 240, justifyContent:"space-between",
      }}>
        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:13}}>{label}</span>
        <span style={{fontSize:10,flexShrink:0}}>▼</span>
      </button>

      {open && (
        <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.35)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
          onClick={()=>setOpen(false)}>
          <div style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:440,maxHeight:"75vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 64px rgba(0,0,0,.25)"}}
            onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{padding:"16px 20px",background:C.navy,borderRadius:"16px 16px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:800,color:"#fff",fontSize:15}}>🏢 Seleccionar Proveedores</span>
              <button onClick={()=>setOpen(false)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:6,color:"#fff",width:28,height:28,cursor:"pointer",fontSize:16}}>×</button>
            </div>
            {/* Search */}
            <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`}}>
              <input autoFocus placeholder="🔍 Buscar proveedor…" value={localSearch}
                onChange={e=>setLocalSearch(e.target.value)}
                style={{padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,width:"100%",boxSizing:"border-box",fontFamily:"inherit"}}/>
            </div>
            {/* Select all */}
            <div style={{padding:"10px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10,cursor:"pointer",background:"#F8FAFC"}}
              onClick={toggleAll}>
              <input type="checkbox" checked={localSel.size===filtered.length&&filtered.length>0} onChange={toggleAll}
                style={{cursor:"pointer",accentColor:C.blue,width:15,height:15}} onClick={e=>e.stopPropagation()}/>
              <span style={{fontSize:13,fontWeight:600,color:C.navy}}>
                {localSel.size===filtered.length&&filtered.length>0 ? "Deseleccionar todos" : "Seleccionar todos"}
              </span>
              <span style={{fontSize:12,color:C.muted,marginLeft:"auto"}}>{filtered.length} proveedores</span>
            </div>
            {/* List */}
            <div style={{overflowY:"auto",flex:1}}>
              {filtered.map(p=>(
                <div key={p} onClick={()=>toggle(p)}
                  style={{padding:"10px 16px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",
                    background:localSel.has(p)?"#E8F0FE":"#fff",borderBottom:`1px solid ${C.border}`}}
                  onMouseEnter={e=>{if(!localSel.has(p))e.currentTarget.style.background="#F0F4FF";}}
                  onMouseLeave={e=>{e.currentTarget.style.background=localSel.has(p)?"#E8F0FE":"#fff";}}>
                  <input type="checkbox" checked={localSel.has(p)} readOnly
                    style={{cursor:"pointer",accentColor:C.blue,width:15,height:15}}/>
                  <span style={{fontSize:13,color:localSel.has(p)?C.blue:C.text,fontWeight:localSel.has(p)?600:400}}>{p}</span>
                </div>
              ))}
              {filtered.length===0 && (
                <div style={{padding:24,textAlign:"center",color:C.muted,fontSize:13}}>Sin resultados</div>
              )}
            </div>
            {/* Footer */}
            <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",gap:8,justifyContent:"space-between",alignItems:"center",background:"#F8FAFC"}}>
              <span style={{fontSize:12,color:C.muted}}>{localSel.size} seleccionados</span>
              <div style={{display:"flex",gap:8}}>
                <button onClick={handleClear}
                  style={{padding:"8px 16px",borderRadius:8,border:`1px solid ${C.border}`,background:"#F1F5F9",color:C.text,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>
                  Limpiar
                </button>
                <button onClick={handleApply}
                  style={{padding:"8px 20px",borderRadius:8,border:"none",background:C.blue,color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700,fontFamily:"inherit"}}>
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── HistorialActividad ───────────────────────────────────────────────
   Vista de auditoría (light): muestra la tabla audit_log con filtros.
   Solo accesible para rol superadmin (gated en renderConfig).
*/
function HistorialActividad({ C, btnStyle, inputStyle }) {
  const [logs, setLogs] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [filtros, setFiltros] = React.useState({
    username: "",
    entidad: "",
    accion: "",
    desde: "",
    hasta: "",
    limit: 200,
  });

  const cargar = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const opts = {
        limit: filtros.limit,
        username: filtros.username || undefined,
        entidad: filtros.entidad || undefined,
        accion: filtros.accion || undefined,
        desde: filtros.desde || undefined,
        hasta: filtros.hasta ? filtros.hasta + "T23:59:59" : undefined,
      };
      const data = await fetchAuditLog(opts);
      setLogs(data);
    } catch (e) {
      setError(e.message || String(e));
    }
    setLoading(false);
  }, [filtros]);

  React.useEffect(() => { cargar(); }, [cargar]);

  const usernamesUnicos = React.useMemo(() => {
    const s = new Set(logs.map(l => l.username).filter(Boolean));
    return [...s].sort();
  }, [logs]);

  const entidadesUnicas = React.useMemo(() => {
    const s = new Set(logs.map(l => l.entidad).filter(Boolean));
    return [...s].sort();
  }, [logs]);

  const accionLabel = (a) => {
    const m = {
      crear: { l: "Crear", color: "#2E7D32", bg: "#E8F5E9" },
      editar: { l: "Editar", color: "#1565C0", bg: "#E3F2FD" },
      eliminar: { l: "Eliminar", color: "#C62828", bg: "#FFEBEE" },
      importar: { l: "Importar", color: "#6A1B9A", bg: "#F3E5F5" },
      conciliar_insert: { l: "Conciliar", color: "#6A1B9A", bg: "#F3E5F5" },
    };
    return m[a] || { l: a, color: "#616161", bg: "#F5F5F5" };
  };

  const entidadLabel = (e) => {
    const m = {
      ingreso: "💰 Ingreso CxC",
      cobro: "💵 Cobro",
      por_facturar: "📋 Por Facturar",
      financiamiento: "🏦 Financiamiento",
      pago_cxp: "💸 Pago CxP",
      factura_cxp: "🧾 Factura CxP",
    };
    return m[e] || e;
  };

  const fmtFecha = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2,"0");
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2,"0");
    const min = String(d.getMinutes()).padStart(2,"0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  };

  return (
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:24,marginTop:24}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <h3 style={{fontWeight:700,color:C.navy,margin:0}}>📋 Historial de actividad</h3>
        <span style={{fontSize:12,color:C.muted}}>
          Solo visible para superadmin · {logs.length} registros mostrados
        </span>
      </div>

      {/* Filtros */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:16,padding:12,background:"#FAFAFA",borderRadius:10,border:`1px solid ${C.border}`}}>
        <div>
          <label style={{display:"block",fontSize:11,color:C.muted,fontWeight:600,marginBottom:4}}>Usuario</label>
          <select value={filtros.username} onChange={e=>setFiltros(f=>({...f,username:e.target.value}))} style={{...inputStyle,fontSize:12,padding:"6px 8px",width:"100%"}}>
            <option value="">Todos</option>
            {usernamesUnicos.map(u=><option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label style={{display:"block",fontSize:11,color:C.muted,fontWeight:600,marginBottom:4}}>Entidad</label>
          <select value={filtros.entidad} onChange={e=>setFiltros(f=>({...f,entidad:e.target.value}))} style={{...inputStyle,fontSize:12,padding:"6px 8px",width:"100%"}}>
            <option value="">Todas</option>
            {entidadesUnicas.map(e=><option key={e} value={e}>{entidadLabel(e)}</option>)}
          </select>
        </div>
        <div>
          <label style={{display:"block",fontSize:11,color:C.muted,fontWeight:600,marginBottom:4}}>Acción</label>
          <select value={filtros.accion} onChange={e=>setFiltros(f=>({...f,accion:e.target.value}))} style={{...inputStyle,fontSize:12,padding:"6px 8px",width:"100%"}}>
            <option value="">Todas</option>
            <option value="crear">Crear</option>
            <option value="editar">Editar</option>
            <option value="eliminar">Eliminar</option>
            <option value="importar">Importar</option>
            <option value="conciliar_insert">Conciliar</option>
          </select>
        </div>
        <div>
          <label style={{display:"block",fontSize:11,color:C.muted,fontWeight:600,marginBottom:4}}>Desde</label>
          <input type="date" value={filtros.desde} onChange={e=>setFiltros(f=>({...f,desde:e.target.value}))} style={{...inputStyle,fontSize:12,padding:"6px 8px",width:"100%"}}/>
        </div>
        <div>
          <label style={{display:"block",fontSize:11,color:C.muted,fontWeight:600,marginBottom:4}}>Hasta</label>
          <input type="date" value={filtros.hasta} onChange={e=>setFiltros(f=>({...f,hasta:e.target.value}))} style={{...inputStyle,fontSize:12,padding:"6px 8px",width:"100%"}}/>
        </div>
        <div>
          <label style={{display:"block",fontSize:11,color:C.muted,fontWeight:600,marginBottom:4}}>Máximo</label>
          <select value={filtros.limit} onChange={e=>setFiltros(f=>({...f,limit:+e.target.value}))} style={{...inputStyle,fontSize:12,padding:"6px 8px",width:"100%"}}>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
        </div>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <button onClick={cargar} disabled={loading} style={{...btnStyle,padding:"6px 14px",fontSize:12,opacity:loading?0.5:1}}>
          {loading?"Cargando…":"🔄 Refrescar"}
        </button>
        <button
          onClick={()=>setFiltros({username:"",entidad:"",accion:"",desde:"",hasta:"",limit:200})}
          style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"6px 14px",fontSize:12}}>
          Limpiar filtros
        </button>
      </div>

      {error && (
        <div style={{padding:10,background:"#FFEBEE",color:C.danger,borderRadius:8,fontSize:12,marginBottom:12}}>
          ⚠️ {error}
        </div>
      )}

      {logs.length === 0 && !loading ? (
        <div style={{textAlign:"center",padding:40,color:C.muted,fontSize:13}}>
          <div style={{fontSize:36,marginBottom:8}}>📭</div>
          Sin actividad registrada con esos filtros
        </div>
      ) : (
        <div style={{overflowX:"auto",border:`1px solid ${C.border}`,borderRadius:10}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{background:C.navy,color:"#fff"}}>
                <th style={{padding:"10px 12px",textAlign:"left",fontSize:11,textTransform:"uppercase",whiteSpace:"nowrap"}}>Fecha y hora</th>
                <th style={{padding:"10px 12px",textAlign:"left",fontSize:11,textTransform:"uppercase"}}>Usuario</th>
                <th style={{padding:"10px 12px",textAlign:"left",fontSize:11,textTransform:"uppercase"}}>Acción</th>
                <th style={{padding:"10px 12px",textAlign:"left",fontSize:11,textTransform:"uppercase"}}>Entidad</th>
                <th style={{padding:"10px 12px",textAlign:"left",fontSize:11,textTransform:"uppercase"}}>ID afectado</th>
                <th style={{padding:"10px 12px",textAlign:"left",fontSize:11,textTransform:"uppercase"}}>Contexto</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l,i) => {
                const ac = accionLabel(l.accion);
                return (
                  <tr key={l.id} style={{borderTop:`1px solid ${C.border}`,background:i%2===0?"#fff":"#FAFBFF"}}>
                    <td style={{padding:"8px 12px",color:C.muted,whiteSpace:"nowrap"}}>{fmtFecha(l.createdAt)}</td>
                    <td style={{padding:"8px 12px",fontWeight:700,color:C.navy}}>{l.username || "—"}</td>
                    <td style={{padding:"8px 12px"}}>
                      <span style={{background:ac.bg,color:ac.color,padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:700}}>{ac.l}</span>
                    </td>
                    <td style={{padding:"8px 12px",color:C.text}}>{entidadLabel(l.entidad)}</td>
                    <td style={{padding:"8px 12px",fontFamily:"monospace",fontSize:11,color:C.muted}}>{l.entidadId || "—"}</td>
                    <td style={{padding:"8px 12px",fontSize:11,color:C.muted,maxWidth:300,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
                      title={l.contexto ? JSON.stringify(l.contexto) : ""}>
                      {l.contexto ? (
                        l.contexto.campos ? `Campos: ${l.contexto.campos.join(", ")}` :
                        l.contexto.count != null ? `${l.contexto.count} registros` :
                        JSON.stringify(l.contexto).slice(0,80)
                      ) : "—"}
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
}
