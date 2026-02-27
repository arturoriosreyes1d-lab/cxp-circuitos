import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import {
  fetchInvoices, fetchSuppliers, fetchClasificaciones,
  upsertInvoice, upsertManyInvoices, deleteInvoiceDB, updateInvoiceField, bulkUpdateInvoices,
  upsertSupplier, upsertManySuppliers, saveClasificaciones,
} from "./db.js";

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
  <div onClick={onClick} style={{background:C.surface,borderRadius:16,padding:"20px 24px",border:`1px solid ${C.border}`,boxShadow:"0 2px 8px rgba(0,0,0,.05)",flex:1,minWidth:160,cursor:onClick?"pointer":"default",transition:"transform .15s"}}
    onMouseEnter={e=>{if(onClick)e.currentTarget.style.transform="scale(1.03)";}} onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div>
        <div style={{fontSize:12,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:.5}}>{label}</div>
        <div style={{fontSize:26,fontWeight:800,color,marginTop:4}}>{value}</div>
        {sub && <div style={{fontSize:12,color:C.muted,marginTop:2}}>{sub}</div>}
      </div>
      <div style={{fontSize:28}}>{icon}</div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════════
   APP
   ═══════════════════════════════════════════════════════════════════════════ */
export default function CxpApp({ user, onLogout }) {
  const [view, setView] = useState("dashboard");
  const [currency, setCurrency] = useState("MXN");
  const [suppliers, setSuppliers] = useState([]);
  const [invoices, setInvoices] = useState({MXN:[],USD:[],EUR:[]});
  const [clases, setClases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({proveedor:"",clasificacion:"",estatus:"",fechaFrom:"",fechaTo:"",pagoFrom:"",pagoTo:""});
  const [search, setSearch] = useState("");
  const [grupoPor, setGrupoPor] = useState("proveedor");
  const [grupo2, setGrupo2] = useState(""); // secondary grouping
  const [modalInv, setModalInv] = useState(null);
  const [modalSup, setModalSup] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // {id, cur}
  const [importMsg, setImportMsg] = useState("");
  const [importDupes, setImportDupes] = useState([]);
  const [projFrom, setProjFrom] = useState("");
  const [projTo, setProjTo] = useState("");
  const [projDetail, setProjDetail] = useState(null);
  const [supSearch, setSupSearch] = useState("");
  const [showDupes, setShowDupes] = useState(false);
  const [projSearch, setProjSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkClasif, setBulkClasif] = useState("");
  const [bulkProgPago, setBulkProgPago] = useState("");
  const [bulkEstatus, setBulkEstatus] = useState("");
  const [dashDetail, setDashDetail] = useState(null); // {title, invoices, type}
  const [dashSearch, setDashSearch] = useState("");
  const [dashFilterProv, setDashFilterProv] = useState("");
  const [dashFilterClasif, setDashFilterClasif] = useState("");
  const [dashFilterEstatus, setDashFilterEstatus] = useState("");
  const [dashGroupBy, setDashGroupBy] = useState("");
  const [dashSelectedIds, setDashSelectedIds] = useState(new Set());
  const [dashBulkProgPago, setDashBulkProgPago] = useState("");
  const [dashBulkAutDir, setDashBulkAutDir] = useState("");
  const fileRef = useRef();
  const searchRef = useRef();

  /* ── Load data from Supabase ────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [inv, sup, cls] = await Promise.all([fetchInvoices(), fetchSuppliers(), fetchClasificaciones()]);
      setInvoices(inv);
      setSuppliers(sup.length > 0 ? sup : []);
      setClases(cls.length > 0 ? cls : DEFAULT_CLASES);
      setLoading(false);
    })();
  }, []);

  /* ── Derived ─────────────────────────────────────────────────────────── */
  const curInvoices = invoices[currency] || [];

  const filtered = useMemo(() => {
    return curInvoices.filter(inv => {
      if(filters.proveedor && inv.proveedor!==filters.proveedor) return false;
      if(filters.clasificacion && inv.clasificacion!==filters.clasificacion) return false;
      if(filters.estatus && inv.estatus!==filters.estatus) return false;
      if(filters.fechaFrom && inv.fecha<filters.fechaFrom) return false;
      if(filters.fechaTo && inv.fecha>filters.fechaTo) return false;
      // Filter by fecha programacion de pago
      if(filters.pagoFrom || filters.pagoTo) {
        const fp = inv.fechaProgramacion || "";
        if(!fp) return false; // no payment date set = exclude
        if(filters.pagoFrom && fp < filters.pagoFrom) return false;
        if(filters.pagoTo && fp > filters.pagoTo) return false;
      }
      if(search && !JSON.stringify(inv).toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [curInvoices, filters, search]);

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
    if(bulkProgPago) fields.fechaProgramacion = bulkProgPago;
    if(bulkEstatus) fields.estatus = bulkEstatus;
    setInvoices(prev => ({
      ...prev,
      [currency]: prev[currency].map(i => {
        if(!selectedIds.has(i.id)) return i;
        const upd = { ...i };
        if(bulkClasif) upd.clasificacion = bulkClasif;
        if(bulkProgPago) upd.fechaProgramacion = bulkProgPago;
        if(bulkEstatus) {
          upd.estatus = bulkEstatus;
          if(bulkEstatus === "Pagado") upd.montoPagado = +i.total;
        }
        return upd;
      })
    }));
    // Persist: for "Pagado" we need per-invoice montoPagado, else bulk
    if(bulkEstatus === "Pagado") {
      ids.forEach(id => {
        const inv = invoices[currency].find(i=>i.id===id);
        if(inv) updateInvoiceField(id, { ...fields, montoPagado: +inv.total });
      });
    } else {
      bulkUpdateInvoices(ids, fields);
    }
    setSelectedIds(new Set());
    setBulkClasif(""); setBulkProgPago(""); setBulkEstatus("");
  };

  /* ── Grouped (supports dual grouping) ────────────────────────────────── */
  const getGroupKey = (inv, field) => {
    if(field==="proveedor") return inv.proveedor;
    if(field==="clasificacion") return inv.clasificacion;
    if(field==="estatus") return inv.estatus;
    if(field==="mes") return inv.fecha?.slice(0,7);
    return "—";
  };

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
    const updated = { ...data, iva, total, montoPagado, diasCredito:diasCred, vencimiento:venc, estatus, diasFicticios:+(data.diasFicticios||0), fechaProgramacion:data.fechaProgramacion||"", concepto:data.concepto||"", moneda:newCur, id:data.id||uid() };
    // Persist to Supabase
    const saved = await upsertInvoice(updated);
    setInvoices(prev => {
      const result = { ...prev };
      // Remove from ALL currencies first (handles currency change)
      ["MXN","USD","EUR"].forEach(c => {
        result[c] = (result[c]||[]).filter(i => i.id !== updated.id && i.id !== saved.id);
      });
      // Add to the correct currency
      result[newCur] = [...(result[newCur]||[]), saved];
      return result;
    });
    setModalInv(null);
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
    const isNew = !data.id;
    if(isNew) {
      // Create: remove id so Supabase generates a UUID
      const { id, ...rest } = data;
      const saved = await upsertSupplier({ ...rest, id: 'new' });
      setSuppliers(prev => [...prev, saved]);
    } else {
      // Update existing
      const saved = await upsertSupplier(data);
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
            : (monedaRaw==="MXN"||monedaRaw==="PESO"||monedaRaw==="PESOS"||monedaRaw==="MN"||monedaRaw==="M.N."||monedaRaw==="M.N") ? "MXN"
            : monedaRaw ? "MXN" : (sup?.moneda||"MXN");
          const diasCredito=sup?.diasCredito||30;
          const inv = {
            id:uid(), tipo:String(get(row,["TIPO"])||"Factura"), fecha,
            serie, folio, uuid:rawUuid||uid(), proveedor:proveedor||"SIN PROVEEDOR",
            clasificacion:sup?.clasificacion||"Otros",
            subtotal, iva:ivaFinal, retIsr:0, retIva:0, total, montoPagado:0, concepto:"",
            diasCredito, vencimiento:addDays(fecha,diasCredito), estatus:"Pendiente",
            fechaProgramacion:"", diasFicticios:0, referencia:"", notas:"",
          };
          if(ni[moneda]){ni[moneda].push(inv);added++;}
        });

        if(newSups.length>0) {
          setSuppliers(prev=>[...prev,...newSups]);
          upsertManySuppliers(newSups);
        }

        if(added > 0) {
          const allNew = [...ni.MXN,...ni.USD,...ni.EUR];
          setInvoices(prev=>({MXN:[...prev.MXN,...ni.MXN],USD:[...prev.USD,...ni.USD],EUR:[...prev.EUR,...ni.EUR]}));
          upsertManyInvoices(allNew);
        }

        let msg = "";
        if(added > 0) msg += "\u2705 Se importaron " + added + " factura" + (added!==1?"s":"") + " nueva" + (added!==1?"s":"") + ".";
        if(newSuppliers>0) msg += " Se registraron " + newSuppliers + " proveedor" + (newSuppliers!==1?"es":"") + " nuevo" + (newSuppliers!==1?"s":"") + ".";
        if(duplicated.length > 0) msg += (msg?" ":"") + "\u26a0\ufe0f " + duplicated.length + " factura" + (duplicated.length!==1?"s":"") + " duplicada" + (duplicated.length!==1?"s":"") + " NO se cargaron:";
        if(added === 0 && duplicated.length === 0) msg = "\u26a0\ufe0f No se encontraron facturas v\u00e1lidas en el archivo.";
        setImportMsg(msg);
        setImportDupes(duplicated);
      } catch(err){ setImportMsg("\u274c Error: "+err.message); setImportDupes([]); }
    };
    reader.readAsArrayBuffer(file); e.target.value="";
  };

  /* ── Projection matrix (uses fechaProgramacion, fallback to vencimiento) */
  const projMatrix = useMemo(() => {
    const allInvs = [...invoices.MXN.map(i=>({...i,moneda:"MXN"})),...invoices.USD.map(i=>({...i,moneda:"USD"})),...invoices.EUR.map(i=>({...i,moneda:"EUR"}))].filter(i=>i.estatus!=="Pagado");
    const matrix = {}; const provSet = new Set(); const allDatesSet = new Set();
    allInvs.forEach(inv => {
      const saldo = (+inv.total||0)-(+inv.montoPagado||0);
      if(saldo<=0) return;
      const payDate = inv.fechaProgramacion || inv.vencimiento || "";
      if(!payDate) return;
      // If date range is set, filter by it
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
      matrix[inv.proveedor][payDate].total += saldo;
      matrix[inv.proveedor][payDate].byCur[inv.moneda] = (matrix[inv.proveedor][payDate].byCur[inv.moneda]||0) + saldo;
      matrix[inv.proveedor][payDate].invoices.push({...inv,saldo});
    });
    // Build dates: use range if set, else use all dates found in invoices
    let dates;
    if(projFrom && projTo) {
      dates = getDatesInRange(projFrom, projTo);
    } else {
      dates = [...allDatesSet].sort();
    }
    return { providers:[...provSet].sort(), dates, matrix };
  }, [invoices,projFrom,projTo,projSearch]);

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
        <td style={{padding:"10px 8px"}}>{inv.tipo}</td>
        <td style={{padding:"10px 8px",whiteSpace:"nowrap"}}>{inv.fecha}</td>
        {/* Folio — red if duplicate */}
        <td style={{padding:"10px 8px",background:isDupe?"#FFEBEE":"transparent",color:isDupe?C.danger:C.text,fontWeight:isDupe?700:400,borderLeft:isDupe?`3px solid ${C.danger}`:"none"}}>
          {inv.serie}{inv.folio}
          {isDupe && <span style={{fontSize:10,marginLeft:4}} title="Folio duplicado">⚠️</span>}
        </td>
        <td style={{padding:"10px 8px",fontWeight:600,maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inv.proveedor}</td>
        {/* Concepto — editable inline */}
        <td style={{padding:"10px 8px",minWidth:120,maxWidth:180}} onClick={()=>{if(!editingConcepto){setEditingConcepto(true);setTempConcepto(inv.concepto||"");}}}>
          {editingConcepto ? (
            <input autoFocus value={tempConcepto} onChange={e=>setTempConcepto(e.target.value)}
              onBlur={()=>{updateConcepto(inv.id,tempConcepto);setEditingConcepto(false);}}
              onKeyDown={e=>{if(e.key==="Enter"){updateConcepto(inv.id,tempConcepto);setEditingConcepto(false);}if(e.key==="Escape")setEditingConcepto(false);}}
              style={{...inputStyle,padding:"4px 8px",fontSize:12,width:"100%"}} />
          ) : (
            <span style={{cursor:"pointer",color:inv.concepto?C.text:C.muted,fontSize:12,fontStyle:inv.concepto?"normal":"italic",display:"block",minHeight:20,padding:"4px 0",borderBottom:`1px dashed ${C.border}`}}>
              {inv.concepto || "Clic para agregar…"}
            </span>
          )}
        </td>
        {/* Clasificación — editable inline with dropdown */}
        <td style={{padding:"10px 8px",minWidth:100}} onClick={()=>{if(!editingClasif) setEditingClasif(true);}}>
          {editingClasif ? (
            <select autoFocus value={inv.clasificacion} onChange={e=>{updateClasificacion(inv.id,e.target.value);setEditingClasif(false);}}
              onBlur={()=>setEditingClasif(false)}
              style={{...selectStyle,padding:"4px 6px",fontSize:12,width:"100%"}}>
              {clases.map(c=><option key={c}>{c}</option>)}
            </select>
          ) : (
            <span style={{background:"#EEF2FF",color:C.blue,padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600,cursor:"pointer",display:"inline-block",borderBottom:`1px dashed ${C.blue}44`}}>{inv.clasificacion}</span>
          )}
        </td>
        <td style={{padding:"10px 8px",fontWeight:700}}>${fmt(inv.total)}</td>
        <td style={{padding:"10px 8px",fontWeight:600,color:pagado>0?C.ok:C.muted}}>${fmt(pagado)}</td>
        <td style={{padding:"10px 8px",fontWeight:700,color:saldo>0?(overdue?C.danger:C.warn):C.ok}}>${fmt(saldo)}</td>
        {/* Programación de pago — editable inline with date input */}
        <td style={{padding:"10px 8px",minWidth:130}}>
          {editingProgPago ? (
            <input autoFocus type="date" value={inv.fechaProgramacion||""}
              onChange={e=>{updateFechaProgramacion(inv.id,e.target.value);}}
              onBlur={()=>setEditingProgPago(false)}
              onClick={e=>e.stopPropagation()}
              style={{...inputStyle,padding:"4px 6px",fontSize:12,width:"100%"}} />
          ) : (
            <span onClick={()=>setEditingProgPago(true)} style={{cursor:"pointer",color:inv.fechaProgramacion?C.blue:C.muted,fontSize:12,fontStyle:inv.fechaProgramacion?"normal":"italic",display:"block",minHeight:20,padding:"4px 0",borderBottom:`1px dashed ${C.border}`}}>
              {inv.fechaProgramacion || "Clic para asignar…"}
            </span>
          )}
        </td>
        <td style={{padding:"10px 8px",whiteSpace:"nowrap",color:overdue?C.danger:C.text}}>{inv.vencimiento||"—"}</td>
        <td style={{padding:"10px 8px",color:days<0?C.danger:days<=7?C.warn:C.ok,fontWeight:600}}>
          {days!==null?(days<0?`${Math.abs(days)}d venc.`:`${days}d`):"—"}
        </td>
        <td style={{padding:"10px 8px"}}>
          <select value={inv.estatus} onChange={e=>updateEstatus(inv.id,e.target.value)}
            style={{padding:"3px 8px",borderRadius:20,border:`2px solid ${statusColor(inv.estatus)}`,background:`${statusColor(inv.estatus)}22`,color:statusColor(inv.estatus),fontWeight:700,fontSize:12,cursor:"pointer"}}>
            {["Pendiente","Pagado","Vencido","Parcial"].map(s=><option key={s}>{s}</option>)}
          </select>
        </td>
        {/* Visto Bueno — toggle with click */}
        <td style={{padding:"10px 8px",textAlign:"center"}}>
          <button onClick={()=>toggleVoBo(inv.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,padding:2,lineHeight:1}} title={inv.voBo?"Quitar VoBo":"Dar VoBo"}>
            {inv.voBo ? "✅" : "⬜"}
          </button>
        </td>
        {/* Autorizado Dirección */}
        <td style={{padding:"10px 8px",textAlign:"center"}}>
          <button onClick={()=>toggleAutorizadoDireccion(inv.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,padding:2,lineHeight:1}} title={inv.autorizadoDireccion?"Quitar Aut.Dir.":"Autorizar Dir."}>
            {inv.autorizadoDireccion ? "✅" : "⬜"}
          </button>
        </td>
        <td style={{padding:"10px 8px",whiteSpace:"nowrap"}}>
          <button onClick={()=>setModalInv({...inv,moneda:inv.moneda||currency})} style={{...iconBtn,color:C.sky}} title="Editar">✏️</button>
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
                {["Tipo","Fecha","Folio","Proveedor","Concepto","Clasif.","Total","Pagado","Saldo","Progr.Pago","Vence","Días","Estatus","VoBo","Aut.Dir.","Acciones"].map(h=>(
                  <th key={h} style={{padding:"10px 8px",textAlign:"left",color:C.muted,fontWeight:600,fontSize:11,textTransform:"uppercase",letterSpacing:.3,whiteSpace:"nowrap"}}>{h}</th>
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
    const pieData = [{name:"MXN",value:kpis.totalMXN,color:C.mxn},{name:"USD",value:kpis.totalUSD,color:C.usd},{name:"EUR",value:kpis.totalEUR,color:C.eur}].filter(d=>d.value>0);
    const claseData = Object.entries(
      [...invoices.MXN,...invoices.USD,...invoices.EUR].filter(i=>i.estatus!=="Pagado")
        .reduce((acc,inv)=>{ acc[inv.clasificacion]=(acc[inv.clasificacion]||0)+((+inv.total||0)-(+inv.montoPagado||0)); return acc; },{})
    ).map(([name,value])=>({name,value})).filter(d=>d.value>0).sort((a,b)=>b.value-a.value);

    const allInvs = [...invoices.MXN.map(i=>({...i,moneda:"MXN"})),...invoices.USD.map(i=>({...i,moneda:"USD"})),...invoices.EUR.map(i=>({...i,moneda:"EUR"}))];
    const pendAll = allInvs.filter(i=>i.estatus!=="Pagado"&&((+i.total||0)-(+i.montoPagado||0))>0);
    const saldoOf = i => (+i.total||0)-(+i.montoPagado||0);
    const daysOf = i => daysUntil(i.vencimiento);
    // Per currency helpers
    const pendByCur = cur => pendAll.filter(i=>i.moneda===cur);
    const vigByCur = cur => pendByCur(cur).filter(i=>!isOverdue(i.vencimiento,i.estatus));
    const vencByCur = cur => pendByCur(cur).filter(i=>isOverdue(i.vencimiento,i.estatus));
    const sumSaldo = arr => arr.reduce((s,i)=>s+saldoOf(i),0);
    // Aging buckets (based on days until vencimiento)
    const corriente7 = pendAll.filter(i=>{ const d=daysOf(i); return d!==null && d>=0 && d<=7; });
    const corriente15 = pendAll.filter(i=>{ const d=daysOf(i); return d!==null && d>7 && d<=15; });
    const corriente30 = pendAll.filter(i=>{ const d=daysOf(i); return d!==null && d>15 && d<=30; });
    const corrienteMas30 = pendAll.filter(i=>{ const d=daysOf(i); return d!==null && d>30; });
    const vencido7 = pendAll.filter(i=>{ const d=daysOf(i); return d!==null && d<0 && d>=-7; });
    const vencido15 = pendAll.filter(i=>{ const d=daysOf(i); return d!==null && d<-7 && d>=-15; });
    const vencido30 = pendAll.filter(i=>{ const d=daysOf(i); return d!==null && d<-15 && d>=-30; });
    const vencido60 = pendAll.filter(i=>{ const d=daysOf(i); return d!==null && d<-30 && d>=-60; });
    const vencidoMas60 = pendAll.filter(i=>{ const d=daysOf(i); return d!==null && d<-60; });
    const openDetail = (title, items) => { setDashSearch(""); setDashFilterProv(""); setDashFilterClasif(""); setDashFilterEstatus(""); setDashGroupBy(""); setDashSelectedIds(new Set()); setDashBulkProgPago(""); setDashBulkAutDir(""); setDashDetail({title, type:"invoices", items}); };

    return (
      <div>
        <h1 style={{fontSize:24,fontWeight:800,color:C.navy,marginBottom:4}}>Dashboard General</h1>
        <p style={{color:C.muted,marginBottom:20,fontSize:14}}>Haz clic en cualquier tarjeta para ver el detalle</p>
        {/* Row 1: Saldo total por moneda */}
        <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:16}}>
          <KpiCard label="Saldo MXN" value={`$${fmt(kpis.totalMXN)}`} sub="Pendiente de pago" color={C.mxn} icon="🇲🇽"
            onClick={()=>openDetail("Saldo Pendiente MXN",pendByCur("MXN"))}/>
          <KpiCard label="Saldo USD" value={`$${fmt(kpis.totalUSD)}`} sub="Pendiente de pago" color={C.usd} icon="🇺🇸"
            onClick={()=>openDetail("Saldo Pendiente USD",pendByCur("USD"))}/>
          <KpiCard label="Saldo EUR" value={`€${fmt(kpis.totalEUR)}`} sub="Pendiente de pago" color={C.eur} icon="🇪🇺"
            onClick={()=>openDetail("Saldo Pendiente EUR",pendByCur("EUR"))}/>
          <KpiCard label="Facturas Vencidas" value={kpis.vencidas} sub="Requieren atención" color={C.danger} icon="⚠️"
            onClick={()=>openDetail("Facturas Vencidas",pendAll.filter(i=>isOverdue(i.vencimiento,i.estatus)))}/>
          <KpiCard label="Total Facturas" value={kpis.facturas} color={C.sky} icon="🧾"
            onClick={()=>openDetail("Todas las Facturas",allInvs)}/>
          <KpiCard label="Proveedores" value={kpis.proveedores} sub="Activos" color={C.teal} icon="🏢"
            onClick={()=>{setDashSearch("");setDashFilterProv("");setDashFilterClasif("");setDashFilterEstatus("");setDashGroupBy("");setDashDetail({title:"Proveedores Activos",type:"suppliers",items:suppliers.filter(s=>s.activo)});}}/>
        </div>
        {/* Row 2: Vigente / Vencido por moneda */}
        <h3 style={{fontSize:14,fontWeight:700,color:C.navy,marginBottom:10}}>Vigente vs Vencido por Moneda</h3>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:20}}>
          {["MXN","USD","EUR"].map(cur=>{
            const vig=vigByCur(cur); const ven=vencByCur(cur);
            const vigSum=sumSaldo(vig); const venSum=sumSaldo(ven);
            if(vigSum===0&&venSum===0) return null;
            const sym=cur==="EUR"?"€":"$"; const flag={MXN:"🇲🇽",USD:"🇺🇸",EUR:"🇪🇺"}[cur];
            return (
              <div key={cur} style={{display:"flex",gap:8}}>
                <div onClick={()=>openDetail(`${cur} Vigente`,vig)} style={{background:"#E8F5E9",border:"1px solid #A5D6A7",borderRadius:12,padding:"12px 18px",cursor:"pointer",minWidth:140,transition:"transform .15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.03)";}} onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";}}>
                  <div style={{fontSize:11,color:C.muted,fontWeight:600}}>{flag} {cur} VIGENTE</div>
                  <div style={{fontSize:20,fontWeight:800,color:C.ok}}>{sym}{fmt(vigSum)}</div>
                  <div style={{fontSize:11,color:C.muted}}>{vig.length} fact.</div>
                </div>
                <div onClick={()=>openDetail(`${cur} Vencido`,ven)} style={{background:"#FFEBEE",border:"1px solid #EF9A9A",borderRadius:12,padding:"12px 18px",cursor:"pointer",minWidth:140,transition:"transform .15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.03)";}} onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";}}>
                  <div style={{fontSize:11,color:C.muted,fontWeight:600}}>{flag} {cur} VENCIDO</div>
                  <div style={{fontSize:20,fontWeight:800,color:C.danger}}>{sym}{fmt(venSum)}</div>
                  <div style={{fontSize:11,color:C.muted}}>{ven.length} fact.</div>
                </div>
              </div>
            );
          })}
        </div>
        {/* Row 3: Aging — per currency */}
        <h3 style={{fontSize:14,fontWeight:700,color:C.navy,marginBottom:10}}>Antigüedad de Saldos</h3>
        {["MXN","USD","EUR"].map(cur => {
          const curItems = pendAll.filter(i=>i.moneda===cur);
          if(curItems.length===0) return null;
          const sym = cur==="EUR"?"€":"$";
          const flag = {MXN:"🇲🇽",USD:"🇺🇸",EUR:"🇪🇺"}[cur];
          const curColor = {MXN:C.mxn,USD:C.usd,EUR:C.eur}[cur];
          const curBg = {MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[cur];
          const curBorder = {MXN:"#90CAF9",USD:"#A5D6A7",EUR:"#CE93D8"}[cur];
          const filterCur = arr => arr.filter(i=>i.moneda===cur);
          const corrBuckets = [
            {label:`Corriente 0-7 Días`,items:filterCur(corriente7),bg:"#E8F5E9",border:"#A5D6A7",color:C.ok},
            {label:`Corriente 8-15 Días`,items:filterCur(corriente15),bg:"#E8F5E9",border:"#A5D6A7",color:C.ok},
            {label:`Corriente 16-30 Días`,items:filterCur(corriente30),bg:"#FFF8E1",border:"#FFE082",color:"#F57F17"},
            {label:`Corriente +30 Días`,items:filterCur(corrienteMas30),bg:"#FFF3E0",border:"#FFCC80",color:C.warn},
          ];
          const vencBuckets = [
            {label:`Vencido 1-7 Días`,items:filterCur(vencido7),bg:"#FFF5F5",border:"#FFCDD2",color:"#E57373"},
            {label:`Vencido 8-15 Días`,items:filterCur(vencido15),bg:"#FFEBEE",border:"#EF9A9A",color:C.danger},
            {label:`Vencido 16-30 Días`,items:filterCur(vencido30),bg:"#FFEBEE",border:"#EF9A9A",color:C.danger},
            {label:`Vencido 31-60 Días`,items:filterCur(vencido60),bg:"#FFCDD2",border:"#E57373",color:"#C62828"},
            {label:`Vencido +60 Días`,items:filterCur(vencidoMas60),bg:"#FFCDD2",border:"#E57373",color:"#B71C1C"},
          ];
          const AgingCard = ({b}) => (
            <div onClick={()=>openDetail(`${cur} — ${b.label}`,b.items)} style={{background:b.bg,border:`1px solid ${b.border}`,borderRadius:12,padding:"10px 12px",cursor:b.items.length>0?"pointer":"default",transition:"transform .15s",opacity:b.items.length>0?1:0.5}}
              onMouseEnter={e=>{if(b.items.length>0)e.currentTarget.style.transform="scale(1.03)";}} onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";}}>
              <div style={{fontSize:9,fontWeight:700,color:C.muted,textTransform:"uppercase",marginBottom:3}}>{b.label}</div>
              <div style={{fontSize:16,fontWeight:800,color:b.items.length>0?b.color:C.muted}}>{sym}{fmt(sumSaldo(b.items))}</div>
              <div style={{fontSize:10,color:C.muted}}>{b.items.length} fact.</div>
            </div>
          );
          return (
            <div key={cur} style={{background:curBg,border:`2px solid ${curBorder}`,borderRadius:16,padding:16,marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:18}}>{flag}</span>
                <span style={{fontSize:15,fontWeight:800,color:curColor}}>{cur}</span>
                <span style={{fontSize:12,color:C.muted}}>— Saldo total: {sym}{fmt(sumSaldo(curItems))} ({curItems.length} fact.)</span>
              </div>
              <div style={{fontSize:12,fontWeight:700,color:C.ok,marginBottom:6}}>Corriente</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:8,marginBottom:10}}>
                {corrBuckets.map(b=><AgingCard key={b.label} b={b}/>)}
              </div>
              <div style={{fontSize:12,fontWeight:700,color:C.danger,marginBottom:6}}>Vencido</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:8}}>
                {vencBuckets.map(b=><AgingCard key={b.label} b={b}/>)}
              </div>
            </div>
          );
        })}
        {/* Charts */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:24}}>
          <div style={{background:C.surface,borderRadius:16,padding:24,border:`1px solid ${C.border}`}}>
            <h3 style={{fontSize:15,fontWeight:700,marginBottom:16,color:C.navy}}>Distribución por Moneda</h3>
            {pieData.length>0?(
              <ResponsiveContainer width="100%" height={200}>
                <PieChart><Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>
                  {pieData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                </Pie><Tooltip formatter={v=>fmt(v)}/></PieChart>
              </ResponsiveContainer>
            ):<div style={{textAlign:"center",color:C.muted,padding:40}}>Sin datos</div>}
          </div>
          <div style={{background:C.surface,borderRadius:16,padding:24,border:`1px solid ${C.border}`}}>
            <h3 style={{fontSize:15,fontWeight:700,marginBottom:16,color:C.navy}}>Saldo Pendiente por Clasificación</h3>
            {claseData.length>0?(
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={claseData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3"/><XAxis type="number" tickFormatter={v=>fmt(v)} fontSize={10}/>
                  <YAxis type="category" dataKey="name" fontSize={11} width={90}/><Tooltip formatter={v=>fmt(v)}/>
                  <Bar dataKey="value" fill={C.sky} radius={[0,4,4,0]}/>
                </BarChart>
              </ResponsiveContainer>
            ):<div style={{textAlign:"center",color:C.muted,padding:40}}>Sin datos</div>}
          </div>
        </div>
        <div style={{background:C.surface,borderRadius:16,padding:24,border:`1px solid ${C.border}`}}>
          <h3 style={{fontSize:15,fontWeight:700,marginBottom:16,color:C.navy}}>⚠️ Facturas Vencidas</h3>
          {[...invoices.MXN,...invoices.USD,...invoices.EUR].filter(i=>isOverdue(i.vencimiento,i.estatus)).sort((a,b)=>(a.vencimiento||"").localeCompare(b.vencimiento||"")).slice(0,8).map(inv=>{
            const saldo=(+inv.total||0)-(+inv.montoPagado||0);
            return (
              <div key={inv.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14}}>{inv.proveedor}</div>
                  <div style={{fontSize:12,color:C.muted}}>Folio {inv.folio} · {inv.fecha}</div>
                  {+inv.montoPagado>0 && <div style={{fontSize:11,color:C.ok}}>Pagado: ${fmt(inv.montoPagado)}</div>}
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontWeight:700,color:C.danger}}>${fmt(saldo)}</div>
                  <div style={{fontSize:11,color:C.danger}}>{Math.abs(daysUntil(inv.vencimiento))} días vencida</div>
                </div>
              </div>
            );
          })}
          {[...invoices.MXN,...invoices.USD,...invoices.EUR].filter(i=>isOverdue(i.vencimiento,i.estatus)).length===0 &&
            <div style={{textAlign:"center",color:C.ok,padding:20}}>✅ Sin facturas vencidas</div>}
        </div>
      </div>
    );
  };

  /* ── CARTERA ────────────────────────────────────────────────────────── */
  const renderCartera = () => {
    const totalFiltered = filtered.reduce((s,i)=>s+(+i.total||0),0);
    const totalPendiente = filtered.filter(i=>i.estatus!=="Pagado").reduce((s,i)=>s+((+i.total||0)-(+i.montoPagado||0)),0);
    const groupOptions = ["proveedor","clasificacion","estatus","mes"];

    return (
      <div>
        {/* Currency tabs */}
        <div style={{display:"flex",gap:8,marginBottom:20}}>
          {["MXN","USD","EUR"].map(cur=>(
            <button key={cur} onClick={()=>setCurrency(cur)} style={{padding:"8px 24px",borderRadius:40,border:"2px solid",borderColor:currency===cur?{MXN:C.mxn,USD:C.usd,EUR:C.eur}[cur]:C.border,background:currency===cur?{MXN:C.mxn,USD:C.usd,EUR:C.eur}[cur]:C.surface,color:currency===cur?"#fff":C.text,fontWeight:700,cursor:"pointer",fontSize:14}}>
              {cur==="MXN"?"🇲🇽":cur==="USD"?"🇺🇸":"🇪🇺"} {cur}
              <span style={{marginLeft:8,fontSize:12,opacity:.8}}>({invoices[cur]?.length||0})</span>
            </button>
          ))}
        </div>
        {/* Summary */}
        <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 18px",fontSize:13}}>
            <span style={{color:C.muted}}>Filtradas: </span><span style={{fontWeight:700}}>{filtered.length}</span>
          </div>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 18px",fontSize:13}}>
            <span style={{color:C.muted}}>Total: </span><span style={{fontWeight:700}}>${fmt(totalFiltered)} {currency}</span>
          </div>
          <div style={{background:"#FFF3E0",border:"1px solid #FFCC02",borderRadius:10,padding:"10px 18px",fontSize:13}}>
            <span style={{color:C.muted}}>Pendiente: </span><span style={{fontWeight:700,color:C.warn}}>${fmt(totalPendiente)} {currency}</span>
          </div>
        </div>
        {/* Duplicate folios alert */}
        {dupeCount>0 && (
          <div onClick={()=>setShowDupes(true)} style={{background:"#FFEBEE",border:"1px solid #EF9A9A",borderRadius:10,padding:"10px 16px",marginBottom:16,fontSize:13,display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
            <span style={{fontSize:20}}>⚠️</span>
            <span><b>{Object.keys(duplicates).length} folio{Object.keys(duplicates).length!==1?"s":""} duplicado{Object.keys(duplicates).length!==1?"s":""}</b> ({dupeCount} facturas). Haz clic aquí para revisarlas y eliminar las duplicadas.</span>
          </div>
        )}
        {/* Filters - search uses key to keep focus stable */}
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:18,marginBottom:20}}>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
            <input ref={searchRef} placeholder="🔍 Buscar…" value={search} onChange={e=>setSearch(e.target.value)} style={{...inputStyle,maxWidth:200}} />
            <select value={filters.proveedor} onChange={e=>setFilters(f=>({...f,proveedor:e.target.value}))} style={{...selectStyle,maxWidth:200}}>
              <option value="">Todos los proveedores</option>
              {[...new Set(curInvoices.map(i=>i.proveedor))].map(p=><option key={p}>{p}</option>)}
            </select>
            <select value={filters.clasificacion} onChange={e=>setFilters(f=>({...f,clasificacion:e.target.value}))} style={{...selectStyle,maxWidth:180}}>
              <option value="">Todas las clasificaciones</option>
              {clases.map(c=><option key={c}>{c}</option>)}
            </select>
            <select value={filters.estatus} onChange={e=>setFilters(f=>({...f,estatus:e.target.value}))} style={{...selectStyle,maxWidth:160}}>
              <option value="">Todos los estatus</option>
              {["Pendiente","Pagado","Vencido","Parcial"].map(s=><option key={s}>{s}</option>)}
            </select>
            <input type="date" value={filters.fechaFrom} onChange={e=>setFilters(f=>({...f,fechaFrom:e.target.value}))} style={{...inputStyle,maxWidth:150}} title="Fecha emisión desde"/>
            <input type="date" value={filters.fechaTo} onChange={e=>setFilters(f=>({...f,fechaTo:e.target.value}))} style={{...inputStyle,maxWidth:150}} title="Fecha emisión hasta"/>
            <button onClick={()=>{setFilters({proveedor:"",clasificacion:"",estatus:"",fechaFrom:"",fechaTo:"",pagoFrom:"",pagoTo:""});setSearch("");}} style={{...btnStyle,background:"#F1F5F9",color:C.text}}>Limpiar</button>
          </div>
          {/* Fecha de pago filter */}
          <div style={{display:"flex",gap:10,marginTop:10,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:C.muted,fontWeight:600}}>📅 Fecha de pago programado:</span>
            <input type="date" value={filters.pagoFrom||""} onChange={e=>setFilters(f=>({...f,pagoFrom:e.target.value}))} style={{...inputStyle,maxWidth:150}} title="Pago desde"/>
            <span style={{color:C.muted,fontSize:12}}>a</span>
            <input type="date" value={filters.pagoTo||""} onChange={e=>setFilters(f=>({...f,pagoTo:e.target.value}))} style={{...inputStyle,maxWidth:150}} title="Pago hasta"/>
            {(filters.pagoFrom||filters.pagoTo) && <span style={{fontSize:11,color:C.blue,fontStyle:"italic"}}>Filtra por fecha de programación de pago (útil para ver pagadas en un rango)</span>}
          </div>
          {/* Grouping controls */}
          <div style={{display:"flex",gap:8,marginTop:12,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:13,color:C.muted,fontWeight:600}}>Agrupar por:</span>
            {groupOptions.map(g=>(
              <button key={g} onClick={()=>{setGrupoPor(g); if(grupo2===g) setGrupo2("");}} style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${grupoPor===g?C.blue:C.border}`,background:grupoPor===g?"#E8F0FE":C.surface,color:grupoPor===g?C.blue:C.text,cursor:"pointer",fontSize:12,fontWeight:600}}>
                {g.charAt(0).toUpperCase()+g.slice(1)}
              </button>
            ))}
            <span style={{fontSize:13,color:C.muted,marginLeft:12,fontWeight:600}}>y luego por:</span>
            <button onClick={()=>setGrupo2("")} style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${grupo2===""?C.blue:C.border}`,background:grupo2===""?"#E8F0FE":C.surface,color:grupo2===""?C.blue:C.text,cursor:"pointer",fontSize:12,fontWeight:600}}>Ninguno</button>
            {groupOptions.filter(g=>g!==grupoPor).map(g=>(
              <button key={g} onClick={()=>setGrupo2(g)} style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${grupo2===g?C.teal:C.border}`,background:grupo2===g?"#E0F2F1":C.surface,color:grupo2===g?C.teal:C.text,cursor:"pointer",fontSize:12,fontWeight:600}}>
                {g.charAt(0).toUpperCase()+g.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {/* Add button */}
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}>
          <button onClick={()=>setModalInv({tipo:"Factura",fecha:today(),serie:"",folio:"",uuid:"",proveedor:"",clasificacion:clases[0],subtotal:"",iva:"",retIsr:0,retIva:0,total:"",montoPagado:0,concepto:"",diasCredito:30,vencimiento:"",estatus:"Pendiente",fechaProgramacion:"",diasFicticios:0,referencia:"",notas:"",moneda:currency})} style={btnStyle}>+ Nueva Factura</button>
        </div>
        {/* Bulk edit toolbar */}
        {selectedIds.size > 0 && (
          <div style={{background:"#E8F0FE",border:`2px solid ${C.blue}`,borderRadius:14,padding:"14px 20px",marginBottom:20,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",position:"sticky",top:0,zIndex:10,boxShadow:"0 4px 16px rgba(0,0,0,.1)"}}>
            <div style={{fontWeight:700,color:C.blue,fontSize:14,marginRight:8}}>
              ✅ {selectedIds.size} factura{selectedIds.size!==1?"s":""} seleccionada{selectedIds.size!==1?"s":""}
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",flex:1}}>
              <select value={bulkClasif} onChange={e=>setBulkClasif(e.target.value)} style={{...selectStyle,maxWidth:160,padding:"6px 10px",fontSize:12}}>
                <option value="">Clasificación…</option>
                {clases.map(c=><option key={c}>{c}</option>)}
              </select>
              <input type="date" value={bulkProgPago} onChange={e=>setBulkProgPago(e.target.value)} style={{...inputStyle,maxWidth:160,padding:"6px 10px",fontSize:12}} title="Progr. Pago"/>
              <select value={bulkEstatus} onChange={e=>setBulkEstatus(e.target.value)} style={{...selectStyle,maxWidth:140,padding:"6px 10px",fontSize:12}}>
                <option value="">Estatus…</option>
                {["Pendiente","Pagado","Vencido","Parcial"].map(s=><option key={s}>{s}</option>)}
              </select>
              <button onClick={applyBulkEdit} disabled={!bulkClasif&&!bulkProgPago&&!bulkEstatus} style={{...btnStyle,padding:"7px 18px",fontSize:13,opacity:(!bulkClasif&&!bulkProgPago&&!bulkEstatus)?0.5:1}}>
                Aplicar cambios
              </button>
              <button onClick={()=>{setSelectedIds(new Set());setBulkClasif("");setBulkProgPago("");setBulkEstatus("");}} style={{...btnStyle,background:"#F1F5F9",color:C.text,padding:"7px 14px",fontSize:13}}>
                Cancelar
              </button>
            </div>
          </div>
        )}
        {/* Grouped content */}
        {Object.entries(grouped).map(([g1, data]) => (
          <div key={g1} style={{marginBottom:24}}>
            {/* Primary group header */}
            <div style={{display:"flex",justifyContent:"space-between",padding:"10px 16px",background:C.navy,borderRadius:10,marginBottom:8}}>
              <span style={{fontWeight:700,color:"#fff",fontSize:14}}>{grupoPor.charAt(0).toUpperCase()+grupoPor.slice(1)}: {g1||"—"}</span>
              <span style={{fontSize:13,color:"#94A3B8"}}>
                {(data.invoices || Object.values(data.subgroups||{}).flat()).length} facturas
              </span>
            </div>
            {data.invoices ? (
              /* Single grouping */
              <>
                <GroupHeader label={g1} invs={data.invoices}/>
                <InvoiceTable invs={data.invoices}/>
              </>
            ) : (
              /* Dual grouping */
              Object.entries(data.subgroups).map(([g2, invs]) => (
                <div key={g2} style={{marginLeft:16,marginBottom:16}}>
                  <GroupHeader label={`${grupo2.charAt(0).toUpperCase()+grupo2.slice(1)}: ${g2}`} invs={invs}/>
                  <InvoiceTable invs={invs}/>
                </div>
              ))
            )}
          </div>
        ))}
        {filtered.length===0 && (
          <div style={{textAlign:"center",padding:60,color:C.muted}}>
            <div style={{fontSize:48,marginBottom:12}}>📭</div>
            <div style={{fontSize:16}}>Sin facturas que mostrar</div>
          </div>
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
          <button onClick={()=>setModalSup({nombre:"",rfc:"",moneda:"MXN",diasCredito:30,contacto:"",telefono:"",email:"",banco:"",clabe:"",clasificacion:clases[0],activo:true})} style={btnStyle}>+ Nuevo Proveedor</button>
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
                    <button onClick={()=>setModalSup({...sup})} style={{...iconBtn,color:C.sky}}>✏️</button>
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
  const renderProyeccion = () => {
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
        <h1 style={{fontSize:22,fontWeight:800,color:C.navy,marginBottom:4}}>Proyección de Pagos</h1>
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

  /* ── IMPORTAR ───────────────────────────────────────────────────────── */
  const renderImportar = () => (
    <div>
      <h1 style={{fontSize:22,fontWeight:800,color:C.navy,marginBottom:4}}>Importar Facturas</h1>
      <p style={{color:C.muted,fontSize:14,marginBottom:24}}>Carga tu Excel de facturas timbradas</p>
      <div style={{background:C.surface,border:`2px dashed ${C.border}`,borderRadius:20,padding:48,textAlign:"center",marginBottom:24,cursor:"pointer"}} onClick={()=>fileRef.current?.click()}>
        <div style={{fontSize:56,marginBottom:12}}>📂</div>
        <div style={{fontSize:18,fontWeight:700,color:C.navy,marginBottom:4}}>Haz clic para seleccionar archivo</div>
        <button style={btnStyle} onClick={e=>{e.stopPropagation();fileRef.current?.click();}}>Seleccionar .xlsx</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} style={{display:"none"}}/>
      </div>
      {importMsg && (
        <div style={{marginBottom:20}}>
          <div style={{padding:16,borderRadius:10,background:importMsg.includes("\u2705")?"#E8F5E9":"#FFEBEE",border:`1px solid ${importMsg.includes("\u2705")?C.ok:C.danger}`,fontSize:14,fontWeight:600,whiteSpace:"pre-line"}}>{importMsg}</div>
          {importDupes.length > 0 && (
            <div style={{marginTop:12,background:"#FFF8E1",border:"1px solid #FFE082",borderRadius:12,padding:16}}>
              <div style={{fontWeight:700,color:"#F57F17",marginBottom:10,fontSize:14}}>\u26a0\ufe0f Facturas duplicadas (no se cargaron):</div>
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

  /* ── CONFIG ─────────────────────────────────────────────────────────── */
  const renderConfig = () => {
    const [nc, setNc] = useState("");
    const removeClase = (c) => { setClases(p => { const n=p.filter(x=>x!==c); saveClasificaciones(n); return n; }); };
    const addClase = (val) => { if(val.trim()){ setClases(p => { const n=[...p,val.trim()]; saveClasificaciones(n); return n; }); setNc(""); } };
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
            <input placeholder="Nueva clasificación…" value={nc} onChange={e=>setNc(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter") addClase(nc);}}
              style={{...inputStyle,flex:1}}/>
            <button onClick={()=>addClase(nc)} style={btnStyle}>Agregar</button>
          </div>
        </div>
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
          {/* Calendar picker for fechaProgramacion */}
          <div style={{gridColumn:"1/-1",position:"relative"}}>
            <Field label="📅 Fecha Programación de Pago">
              <div onClick={()=>setShowCal(!showCal)} style={{...inputStyle,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",background:form.fechaProgramacion?"#E8F5E9":"#FAFBFC",borderColor:form.fechaProgramacion?C.ok:C.border}}>
                <span style={{color:form.fechaProgramacion?C.text:C.muted}}>{form.fechaProgramacion||"Seleccionar fecha…"}</span>
                <span>📅</span>
              </div>
            </Field>
            {showCal && (
              <div style={{position:"absolute",zIndex:10,top:"100%",left:0,marginTop:-8,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:16,boxShadow:"0 8px 30px rgba(0,0,0,.15)",width:280}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <button onClick={()=>{if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,padding:4}}>◀</button>
                  <span style={{fontWeight:700,color:C.navy,fontSize:14}}>{meses[calMonth]} {calYear}</span>
                  <button onClick={()=>{if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,padding:4}}>▶</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,textAlign:"center"}}>
                  {["Do","Lu","Ma","Mi","Ju","Vi","Sá"].map(d=><div key={d} style={{fontSize:11,color:C.muted,fontWeight:600,padding:4}}>{d}</div>)}
                  {calCells.map((d,i)=>{
                    if(!d) return <div key={i}/>;
                    const ds=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                    const isSel=ds===form.fechaProgramacion;
                    const isT=ds===today();
                    return <button key={i} onClick={()=>{set("fechaProgramacion",ds);setShowCal(false);}} style={{width:34,height:34,borderRadius:"50%",border:isT?`2px solid ${C.blue}`:"none",background:isSel?C.blue:"transparent",color:isSel?"#fff":C.text,fontWeight:isSel?700:400,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>{d}</button>;
                  })}
                </div>
                <div style={{marginTop:10,display:"flex",gap:8,justifyContent:"space-between"}}>
                  <button onClick={()=>{set("fechaProgramacion","");setShowCal(false);}} style={{...btnStyle,background:"#F1F5F9",color:C.text,fontSize:12,padding:"6px 12px"}}>Limpiar</button>
                  <button onClick={()=>setShowCal(false)} style={{...btnStyle,fontSize:12,padding:"6px 12px"}}>Cerrar</button>
                </div>
              </div>
            )}
          </div>
        </div>
        <Field label="Notas"><textarea value={form.notas||""} onChange={e=>set("notas",e.target.value)} rows={2} style={{...inputStyle,resize:"vertical"}}/></Field>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
          <button onClick={()=>setModalInv(null)} style={{...btnStyle,background:"#F1F5F9",color:C.text}}>Cancelar</button>
          <button onClick={()=>saveInvoice(form)} style={btnStyle}>Guardar</button>
        </div>
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
        <div style={{padding:"0 8px 20px",borderBottom:`1px solid ${C.border}`,marginBottom:12}}>
          <div style={{fontWeight:900,fontSize:17,color:C.navy}}>✈️ Viajes Libero</div>
          <div style={{fontSize:11,color:C.muted}}>Cuentas por Pagar</div>
        </div>
        <NavItem id="dashboard" icon="📊" label="Dashboard"/>
        <NavItem id="cartera" icon="🧾" label="Cartera"/>
        <NavItem id="proveedores" icon="🏢" label="Proveedores"/>
        <NavItem id="proyeccion" icon="📅" label="Proyección"/>
        <NavItem id="importar" icon="📥" label="Importar"/>
        <NavItem id="config" icon="⚙️" label="Configuración"/>
        {kpis.vencidas>0 && (
          <div style={{marginTop:12,background:"#FFF5F5",border:"1px solid #FFCDD2",borderRadius:10,padding:"10px 12px",fontSize:12}}>
            <div style={{fontWeight:700,color:C.danger}}>⚠️ {kpis.vencidas} factura{kpis.vencidas!==1?"s":""} vencida{kpis.vencidas!==1?"s":""}</div>
          </div>
        )}
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
        {view==="proveedores" && renderProveedores()}
        {view==="proyeccion" && renderProyeccion()}
        {view==="importar" && renderImportar()}
        {view==="config" && renderConfig()}
      </main>

      {/* Modals */}
      {modalInv && <InvoiceModal/>}
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
                        <button onClick={()=>{deleteInvoice(inv.id,inv.moneda);}} style={{...btnStyle,background:C.danger,padding:"4px 14px",fontSize:12}}>🗑️ Eliminar</button>
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
        <ModalShell title={`Detalle — ${projDetail.proveedor}`} onClose={()=>setProjDetail(null)} wide>
          <div style={{marginBottom:16}}>
            <span style={{fontSize:14,color:C.muted}}>Fecha: </span>
            <span style={{fontWeight:700,color:C.navy}}>{fmtDateLabel(projDetail.fecha)}</span>
            <span style={{marginLeft:16,fontSize:14,color:C.muted}}>Total: </span>
            <span style={{fontWeight:800,color:C.blue,fontSize:18}}>${fmt(projDetail.invoices.reduce((s,i)=>s+i.saldo,0))}</span>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr style={{background:"#F8FAFC"}}>
              {["Folio","Concepto","Clasificación","Fecha","Total","Pagado","Saldo","Vencimiento","Moneda"].map(h=><th key={h} style={{padding:"10px 12px",textAlign:"left",color:C.muted,fontWeight:600,fontSize:11,textTransform:"uppercase"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {projDetail.invoices.map(inv=>(
                <tr key={inv.id} style={{borderTop:`1px solid ${C.border}`}}>
                  <td style={{padding:"10px 12px",fontWeight:600}}>{inv.serie}{inv.folio}</td>
                  <td style={{padding:"10px 12px",color:inv.concepto?C.text:C.muted,fontStyle:inv.concepto?"normal":"italic",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inv.concepto||"—"}</td>
                  <td style={{padding:"10px 12px"}}><span style={{background:"#EEF2FF",color:C.blue,padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:600}}>{inv.clasificacion}</span></td>
                  <td style={{padding:"10px 12px"}}>{inv.fecha}</td>
                  <td style={{padding:"10px 12px"}}>${fmt(inv.total)}</td>
                  <td style={{padding:"10px 12px",color:C.ok}}>${fmt(inv.montoPagado)}</td>
                  <td style={{padding:"10px 12px",fontWeight:700,color:C.warn}}>${fmt(inv.saldo)}</td>
                  <td style={{padding:"10px 12px"}}>{inv.vencimiento}</td>
                  <td style={{padding:"10px 12px"}}><span style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[inv.moneda],color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[inv.moneda],padding:"2px 8px",borderRadius:20,fontSize:11,fontWeight:700}}>{inv.moneda}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ModalShell>
      )}

      {/* Dashboard detail modal */}
      {dashDetail && (
        <ModalShell title={dashDetail.title} onClose={()=>setDashDetail(null)} extraWide>
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
            const provsList = [...new Set(allItems.map(i=>i.proveedor))].sort();
            const clasifList = [...new Set(allItems.map(i=>i.clasificacion))].sort();
            // Selection
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
              if(dashBulkProgPago) fields.fechaProgramacion = dashBulkProgPago;
              if(dashBulkAutDir==="true") fields.autorizadoDireccion = true;
              if(dashBulkAutDir==="false") fields.autorizadoDireccion = false;
              if(Object.keys(fields).length===0) return;
              // Update local state across all currencies
              setInvoices(prev => {
                const result = {...prev};
                ["MXN","USD","EUR"].forEach(c => {
                  result[c] = result[c].map(i => ids.includes(i.id) ? {...i, ...fields} : i);
                });
                return result;
              });
              // Update dashDetail items too
              setDashDetail(prev => ({...prev, items: prev.items.map(i => ids.includes(i.id) ? {...i, ...fields} : i)}));
              bulkUpdateInvoices(ids, fields);
              setDashSelectedIds(new Set());
              setDashBulkProgPago(""); setDashBulkAutDir("");
            };
            // Grouping
            const groups = {};
            if(dashGroupBy) {
              items.forEach(inv => {
                const k = dashGroupBy==="proveedor"?inv.proveedor:dashGroupBy==="clasificacion"?inv.clasificacion:dashGroupBy==="estatus"?inv.estatus:dashGroupBy==="moneda"?inv.moneda:"\u2014";
                if(!groups[k]) groups[k]=[];
                groups[k].push(inv);
              });
            }
            const renderTable = (rows) => (
              <div style={{overflowX:"auto",marginBottom:12}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:1100}}>
                  <thead><tr style={{background:"#F8FAFC"}}>
                    <th style={{padding:"7px 4px",textAlign:"center",width:32}}>
                      <input type="checkbox" checked={allChecked} onChange={toggleDashSelAll} style={{cursor:"pointer",width:15,height:15,accentColor:C.blue}}/>
                    </th>
                    {["Folio","Proveedor","Concepto","Clasif.","Fecha","Total","Pagado","Saldo","Progr.Pago","Vence","D\u00edas","Estatus","Aut.Dir.","Moneda"].map(h=>(
                      <th key={h} style={{padding:"7px 6px",textAlign:"left",color:C.muted,fontWeight:600,fontSize:10,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {rows.map(inv=>{
                      const saldo=(+inv.total||0)-(+inv.montoPagado||0);
                      const overdue=isOverdue(inv.vencimiento,inv.estatus);
                      const dias = daysUntil(inv.vencimiento);
                      const diasLabel = dias===null ? "\u2014" : dias>=0 ? dias+" d" : Math.abs(dias)+" d";
                      const diasColor = dias===null ? C.muted : dias>=0 ? C.ok : C.danger;
                      const diasPrefix = dias===null ? "" : dias>=0 ? "\u23f3 " : "\u26a0\ufe0f ";
                      const checked = dashSelectedIds.has(inv.id);
                      return (
                        <tr key={inv.id} style={{borderTop:`1px solid ${C.border}`,background:checked?"#EEF2FF":overdue?"#FFF5F5":"transparent"}}>
                          <td style={{padding:"7px 4px",textAlign:"center"}}>
                            <input type="checkbox" checked={checked} onChange={()=>toggleDashSel(inv.id)} style={{cursor:"pointer",width:15,height:15,accentColor:C.blue}}/>
                          </td>
                          <td style={{padding:"7px 6px",fontWeight:600,whiteSpace:"nowrap"}}>{inv.serie}{inv.folio}</td>
                          <td style={{padding:"7px 6px",fontWeight:600,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inv.proveedor}</td>
                          <td style={{padding:"7px 6px",color:inv.concepto?C.text:C.muted,fontStyle:inv.concepto?"normal":"italic",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{inv.concepto||"\u2014"}</td>
                          <td style={{padding:"7px 6px"}}><span style={{background:"#EEF2FF",color:C.blue,padding:"1px 5px",borderRadius:20,fontSize:10,fontWeight:600}}>{inv.clasificacion}</span></td>
                          <td style={{padding:"7px 6px",whiteSpace:"nowrap",fontSize:11}}>{inv.fecha}</td>
                          <td style={{padding:"7px 6px",fontWeight:700}}>${fmt(inv.total)}</td>
                          <td style={{padding:"7px 6px",color:C.ok}}>${fmt(inv.montoPagado)}</td>
                          <td style={{padding:"7px 6px",fontWeight:700,color:saldo>0?(overdue?C.danger:C.warn):C.ok}}>${fmt(saldo)}</td>
                          <td style={{padding:"7px 6px",whiteSpace:"nowrap",fontSize:11}}>{inv.fechaProgramacion||"\u2014"}</td>
                          <td style={{padding:"7px 6px",whiteSpace:"nowrap",color:overdue?C.danger:C.text,fontSize:11}}>{inv.vencimiento||"\u2014"}</td>
                          <td style={{padding:"7px 6px",whiteSpace:"nowrap",fontWeight:700,color:diasColor,fontSize:11}}>{diasPrefix}{diasLabel}</td>
                          <td style={{padding:"7px 6px"}}><span style={{color:statusColor(inv.estatus),fontWeight:700,fontSize:10}}>{inv.estatus}</span></td>
                          <td style={{padding:"7px 6px",textAlign:"center"}}>
                            <button onClick={()=>toggleAutorizadoDireccion(inv.id,inv.moneda)} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,padding:1,lineHeight:1}}>
                              {inv.autorizadoDireccion ? "\u2705" : "\u2b1c"}
                            </button>
                          </td>
                          <td style={{padding:"7px 6px"}}><span style={{background:{MXN:"#E3F2FD",USD:"#E8F5E9",EUR:"#F3E5F5"}[inv.moneda],color:{MXN:C.mxn,USD:C.usd,EUR:C.eur}[inv.moneda],padding:"1px 5px",borderRadius:20,fontSize:10,fontWeight:700}}>{inv.moneda}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
            return (
              <div>
                {/* Search + Filters */}
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12,alignItems:"center"}}>
                  <input placeholder="\ud83d\udd0d Buscar\u2026" value={dashSearch} onChange={e=>setDashSearch(e.target.value)} style={{...inputStyle,maxWidth:180,padding:"6px 10px",fontSize:12}}/>
                  <select value={dashFilterProv} onChange={e=>setDashFilterProv(e.target.value)} style={{...selectStyle,maxWidth:160,padding:"6px 8px",fontSize:12}}>
                    <option value="">Todos proveedores</option>
                    {provsList.map(p=><option key={p}>{p}</option>)}
                  </select>
                  <select value={dashFilterClasif} onChange={e=>setDashFilterClasif(e.target.value)} style={{...selectStyle,maxWidth:150,padding:"6px 8px",fontSize:12}}>
                    <option value="">Todas clasif.</option>
                    {clasifList.map(c=><option key={c}>{c}</option>)}
                  </select>
                  <select value={dashFilterEstatus} onChange={e=>setDashFilterEstatus(e.target.value)} style={{...selectStyle,maxWidth:130,padding:"6px 8px",fontSize:12}}>
                    <option value="">Todo estatus</option>
                    {["Pendiente","Pagado","Vencido","Parcial"].map(s=><option key={s}>{s}</option>)}
                  </select>
                  <span style={{fontSize:12,color:C.muted,marginLeft:4}}>Agrupar:</span>
                  {["","proveedor","clasificacion","estatus","moneda"].map(g=>(
                    <button key={g} onClick={()=>setDashGroupBy(g)} style={{padding:"3px 10px",borderRadius:20,border:`1px solid ${dashGroupBy===g?C.blue:C.border}`,background:dashGroupBy===g?"#E8F0FE":C.surface,color:dashGroupBy===g?C.blue:C.text,cursor:"pointer",fontSize:11,fontWeight:600}}>
                      {g||"Ninguno"}
                    </button>
                  ))}
                </div>
                {/* Summary + Selection */}
                <div style={{display:"flex",gap:12,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
                  <div style={{background:"#F8FAFC",borderRadius:8,padding:"6px 14px",fontSize:12}}>
                    <span style={{color:C.muted}}>Facturas: </span><span style={{fontWeight:700}}>{items.length}</span>
                  </div>
                  <div style={{background:"#F8FAFC",borderRadius:8,padding:"6px 14px",fontSize:12}}>
                    <span style={{color:C.muted}}>Total: </span><span style={{fontWeight:700}}>${fmt(totalSum)}</span>
                  </div>
                  <div style={{background:"#FFF3E0",borderRadius:8,padding:"6px 14px",fontSize:12}}>
                    <span style={{color:C.muted}}>Saldo: </span><span style={{fontWeight:700,color:C.warn}}>${fmt(saldoSum)}</span>
                  </div>
                  {selCount>0 && (
                    <div style={{background:"#E8F0FE",borderRadius:8,padding:"6px 14px",fontSize:12,border:`1px solid ${C.blue}`}}>
                      <span style={{color:C.blue,fontWeight:700}}>\u2705 {selCount} seleccionada{selCount!==1?"s":""}: ${fmt(selSaldo)}</span>
                    </div>
                  )}
                </div>
                {/* Bulk edit bar */}
                {selCount>0 && (
                  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:14,padding:"10px 14px",background:"#E8F0FE",borderRadius:10,border:`1px solid ${C.blue}`}}>
                    <span style={{fontSize:12,fontWeight:700,color:C.blue}}>Edici\u00f3n masiva ({selCount}):</span>
                    <input type="date" value={dashBulkProgPago} onChange={e=>setDashBulkProgPago(e.target.value)} style={{...inputStyle,maxWidth:160,padding:"5px 8px",fontSize:12}} title="Progr. Pago"/>
                    <select value={dashBulkAutDir} onChange={e=>setDashBulkAutDir(e.target.value)} style={{...selectStyle,maxWidth:160,padding:"5px 8px",fontSize:12}}>
                      <option value="">Aut. Direcci\u00f3n</option>
                      <option value="true">\u2705 Autorizado</option>
                      <option value="false">\u2b1c No autorizado</option>
                    </select>
                    <button onClick={applyDashBulk} style={{...btnStyle,padding:"6px 16px",fontSize:12}}>Aplicar</button>
                    <button onClick={()=>{setDashSelectedIds(new Set());setDashBulkProgPago("");setDashBulkAutDir("");}} style={{...btnStyle,padding:"6px 12px",fontSize:12,background:"#F1F5F9",color:C.text}}>Cancelar</button>
                  </div>
                )}
                {/* Table or grouped tables */}
                {dashGroupBy ? (
                  Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0])).map(([grp,rows])=>{
                    const grpSaldo=rows.reduce((s,i)=>s+((+i.total||0)-(+i.montoPagado||0)),0);
                    return (
                      <div key={grp} style={{marginBottom:16}}>
                        <div style={{display:"flex",justifyContent:"space-between",padding:"6px 12px",background:C.navy,borderRadius:8,marginBottom:4}}>
                          <span style={{fontWeight:700,color:"#fff",fontSize:13}}>{grp||"\u2014"}</span>
                          <span style={{color:"#94A3B8",fontSize:12}}>{rows.length} fact. \u00b7 Saldo: ${fmt(grpSaldo)}</span>
                        </div>
                        {renderTable(rows)}
                      </div>
                    );
                  })
                ) : renderTable(items)}
                {items.length===0 && <div style={{textAlign:"center",padding:24,color:C.muted}}>Sin registros con estos filtros</div>}
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
                <input placeholder="\ud83d\udd0d Buscar proveedor\u2026" value={dashSearch} onChange={e=>setDashSearch(e.target.value)} style={{...inputStyle,maxWidth:280,padding:"6px 10px",fontSize:12,marginBottom:14}}/>
                <div style={{marginBottom:12,background:"#F8FAFC",borderRadius:8,padding:"6px 14px",fontSize:12,display:"inline-block"}}>
                  <span style={{color:C.muted}}>Mostrando: </span><span style={{fontWeight:700}}>{filtered.length} proveedores</span>
                </div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead><tr style={{background:"#F8FAFC"}}>
                      {["Nombre","RFC","Moneda","D\u00edas Cr\u00e9dito","Clasificaci\u00f3n","Contacto","Email","Tel\u00e9fono"].map(h=>(
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
                          <td style={{padding:"7px 8px",color:sup.contacto?C.text:C.muted}}>{sup.contacto||"\u2014"}</td>
                          <td style={{padding:"7px 8px",color:sup.email?C.text:C.muted}}>{sup.email||"\u2014"}</td>
                          <td style={{padding:"7px 8px"}}>{sup.telefono||"\u2014"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </ModalShell>
      )}
    </div>
  );
}
