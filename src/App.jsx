import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from './supabase'
import Login from './Login'
import { Badge, TipoBadge, Btn, KPIGrid, Modal, Spinner } from './components'
import { norm, clean, parseAmt, fmtMXN, fmtUSD, cap, getDC, parseCircuito, monthKeySortable, dateToMonthKey, parseLocalDate, dateToLocalStr } from './helpers'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts'

function useXLSX() {
  const [ready, setReady] = useState(!!window.XLSX)
  useEffect(() => {
    if (window.XLSX) return
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => setReady(true)
    document.head.appendChild(s)
  }, [])
  return ready
}

function getImporte(row, circInfo, tarifario) {
  if (row.precio_custom != null && row.precio_custom > 0) {
    const m = row.moneda_custom || 'MXN'
    return m === 'USD' ? { mxn: 0, usd: row.precio_custom, found: true, custom: true } : { mxn: row.precio_custom, usd: 0, found: true, custom: true }
  }
  const pKey = norm(row.prov_general)
  const esHosp = norm(row.clasificacion) === 'HOSPEDAJE'

  let match
  if (esHosp) {
    const provEntries = tarifario.filter(t => norm(t.proveedor) === pKey)
    if (provEntries.length === 0) return { mxn: 0, usd: 0, found: false, custom: false }
    if (provEntries.length === 1) {
      match = provEntries[0]
    } else {
      // Auto-detect temporada by service date vs fecha_inicio/fecha_fin ranges
      // Ranges are stored as "DD/MM" strings (year-agnostic)
      const svcDate = row.fecha ? (parseLocalDate(row.fecha)) : null
      if (svcDate) {
        const svcMD = svcDate.getMonth() * 100 + svcDate.getDate() // e.g. 1215 for Dec-15
        match = provEntries.find(t => {
          if (!t.temp_inicio || !t.temp_fin) return false
          const [dI, mI] = (t.temp_inicio).split('/').map(Number) // DD/MM
          const [dF, mF] = (t.temp_fin).split('/').map(Number)
          if (!dI || !mI || !dF || !mF) return false
          const start = (mI - 1) * 100 + dI
          const end   = (mF - 1) * 100 + dF
          if (start <= end) return svcMD >= start && svcMD <= end
          // Wrap-around (e.g. 15/12 → 18/01)
          return svcMD >= start || svcMD <= end
        })
      }
      // Fallback: General entry, then first
      if (!match) match = provEntries.find(t => (t.temporada || 'General') === 'General' && !t.temp_inicio)
      if (!match) match = provEntries.find(t => !t.temp_inicio)
      if (!match) match = provEntries[0]
    }
  } else {
    match = tarifario.find(t => norm(t.proveedor) === pKey)
  }
  if (!match) return { mxn: 0, usd: 0, found: false, custom: false }

  let totalAmt = 0
  if (esHosp) {
    const single = parseInt(circInfo?.habs_single) || 0
    const doble  = parseInt(circInfo?.habs_doble)  || 0
    const totalHabs = single + doble
    if (totalHabs === 0) return { mxn: 0, usd: 0, found: true, custom: false }
    // Cortesía: cada X hab se regala 1
    const cortCada = parseInt(match.cortesia_cada) || 0
    const cortesia = cortCada > 0 ? Math.floor(totalHabs / cortCada) : 0
    const cortSingle = totalHabs > 0 ? Math.round(cortesia * single / totalHabs) : 0
    const cortDoble  = cortesia - cortSingle
    const sF = Math.max(0, single - cortSingle)
    const dF = Math.max(0, doble  - cortDoble)
    const pS = parseFloat(match.precio_single) || parseFloat(match.precio) || 0
    const pD = parseFloat(match.precio_doble)  || pS
    totalAmt = sF * pS + dF * pD
  } else {
    totalAmt = parseFloat(match.precio_single) || parseFloat(match.precio) || 0
    if (totalAmt === 0) return { mxn: 0, usd: 0, found: false, custom: false }
  }
  return (match.moneda === 'USD')
    ? { mxn: 0, usd: totalAmt, found: true, custom: false }
    : { mxn: totalAmt, usd: 0, found: true, custom: false }
}

// Calcular totales LIBERO y OPCIONAL por separado
function calcCircTotals(circ, tarifario, TC) {
  let costoMXN = 0, costoUSD = 0, paidMXN = 0, paidUSD = 0
  let costoOpcMXN = 0, costoOpcUSD = 0, paidOpcMXN = 0, paidOpcUSD = 0
  circ.rows.forEach((r) => {
    const { mxn, usd } = getImporte(r, circ.info, tarifario)
    const esOpc = (r.tipo || '').toString().toUpperCase().trim() === 'OPCIONAL'
    if (esOpc) {
      costoOpcMXN += mxn; costoOpcUSD += usd
      if (r.paid) { paidOpcMXN += mxn; paidOpcUSD += usd }
    } else {
      costoMXN += mxn; costoUSD += usd
      if (r.paid) { paidMXN += mxn; paidUSD += usd }
    }
  })
  const costoTotal = costoMXN + costoUSD * TC
  const costoOpcTotal = costoOpcMXN + costoOpcUSD * TC
  const ingreso = circ.importe_cobrado || 0
  const ingresoMXN = circ.moneda_cobrado === 'USD' ? ingreso * TC : ingreso
  const utilidad = ingresoMXN - costoTotal
  // Comisión a socio (Pietro Lamprati): % manual sobre ingreso LIBERO
  const commissionPct = parseFloat(circ.commission_pct) || 0
  const comision = ingresoMXN * (commissionPct / 100)
  const utilidadNeta = utilidad - comision
  const ingresoOpcMXN = circ.ingreso_opcional_mxn || 0
  const ingresoOpcUSD = circ.ingreso_opcional_usd || 0
  const ingresoOpcTotal = ingresoOpcMXN + ingresoOpcUSD * TC
  const utilidadOpc = ingresoOpcTotal - costoOpcTotal
  return { costoMXN, costoUSD, costoTotal, paidMXN, paidUSD, ingreso, ingresoMXN, utilidad,
    commissionPct, comision, utilidadNeta,
    costoOpcMXN, costoOpcUSD, costoOpcTotal, paidOpcMXN, paidOpcUSD,
    ingresoOpcMXN, ingresoOpcUSD, ingresoOpcTotal, utilidadOpc }
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])
  if (loading) return <FullCenter dark><Spinner /></FullCenter>
  if (!session) return <Login />
  return <Dashboard session={session} />
}

function FullCenter({ children, dark }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: dark ? '#12151f' : '#f5f1eb' }}>{children}</div>
}

// ═══════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════
function Dashboard({ session }) {
  const xlsxReady = useXLSX()
  // ── Modo solo lectura ──────────────────────────────────────────────
  // Lista de emails read-only, desde variable de entorno VITE_READONLY_EMAILS (separados por coma)
  // Si no está configurada, no hay usuarios de solo lectura.
  const READONLY_EMAILS = (import.meta.env.VITE_READONLY_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  const userEmail = (session?.user?.email || '').toLowerCase()
  const isReadOnly = READONLY_EMAILS.includes(userEmail)
  // ───────────────────────────────────────────────────────────────────
  const [circuits, setCircuits] = useState([])
  const [tarifario, setTarifario] = useState([])
  const [TC, setTC] = useState(17.5)
  const [pietroFeeEur, setPietroFeeEur] = useState(500)
  const [tcEur, setTcEur] = useState(21.30)
  // Lista de conceptos de gastos operativos: [{id, nombre, monto}]
  const [gastosItems, setGastosItems] = useState([
    {id:'1', nombre:'Sueldo Operador', monto:15000},
    {id:'2', nombre:'Sueldo Logística', monto:15000},
    {id:'3', nombre:'Sueldo Administración', monto:15000},
  ])
  // Total mensual derivado de la suma de items
  const gastosOperativosMxn = gastosItems.reduce((sum, it) => sum + (parseFloat(it.monto)||0), 0)
  const [dataLoading, setDataLoading] = useState(true)
  const [view, setView] = useState({ type: 'empty' })
  const [F, setFilters] = useState({ tipo: 'ALL', cat: 'ALL', pago: 'ALL', fecha: '', proveedor: 'ALL' })
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // Meses expandidos en la sidebar (independientes, varios a la vez). Persiste en localStorage.
  const [expandedMonths, setExpandedMonths] = useState(() => {
    try {
      const raw = localStorage.getItem('cxp_expandedMonths')
      return new Set(raw ? JSON.parse(raw) : [])
    } catch { return new Set() }
  })
  useEffect(() => {
    try { localStorage.setItem('cxp_expandedMonths', JSON.stringify([...expandedMonths])) } catch {}
  }, [expandedMonths])
  const toggleMonth = (mk) => setExpandedMonths(prev => {
    const next = new Set(prev)
    if (next.has(mk)) next.delete(mk); else next.add(mk)
    return next
  })
  const openMonth = (mk) => setExpandedMonths(prev => {
    if (prev.has(mk)) return prev
    const next = new Set(prev); next.add(mk); return next
  })
  const [modal, setModal] = useState(null)
  const [pendingCircuit, setPendingCircuit] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [activeTab, setActiveTab] = useState('cxp')
  const [saving, setSaving] = useState(false)
  const [presentacion, setPresentacion] = useState(false)
  // Modo Vista Socio: oculta OPCIONAL y muestra comisión a socio
  const [socioMode, setSocioMode] = useState(() => {
    try { return localStorage.getItem('cxp_socioMode') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('cxp_socioMode', socioMode ? '1' : '0') } catch {}
  }, [socioMode])
  // Rango de meses para Vista Socio: { from, to } usando month_keys. null = sin filtro (todos).
  const [socioRange, setSocioRange] = useState(() => {
    try {
      const raw = localStorage.getItem('cxp_socioRange')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })
  useEffect(() => {
    try {
      if (socioRange) localStorage.setItem('cxp_socioRange', JSON.stringify(socioRange))
      else localStorage.removeItem('cxp_socioRange')
    } catch {}
  }, [socioRange])
  // Modal de configuración al activar Vista Socio
  const [socioConfigModal, setSocioConfigModal] = useState(false)
  // Modal para agregar servicio (en lugar de crear una fila vacía al final)
  const [addRowModal, setAddRowModal] = useState(null) // { cid } | null
  const fileRef = useRef()
  const tarFileRef = useRef()

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setDataLoading(true)
    try {
      const { data: tar } = await supabase.from('tarifario').select('*').order('proveedor')
      if (tar) setTarifario(tar)
      const { data: settings } = await supabase.from('team_settings').select('tc, pietro_fee_eur, tc_eur, gastos_operativos_items').eq('id', 1).single()
      if (settings) {
        setTC(settings.tc)
        if (settings.pietro_fee_eur != null) setPietroFeeEur(parseFloat(settings.pietro_fee_eur))
        if (settings.tc_eur != null) setTcEur(parseFloat(settings.tc_eur))
        if (Array.isArray(settings.gastos_operativos_items) && settings.gastos_operativos_items.length > 0) {
          setGastosItems(settings.gastos_operativos_items)
        }
      }
      const { data: circs } = await supabase.from('circuits').select('*').order('created_at', { ascending: false })
      if (circs && circs.length > 0) {
        // Cargar TODAS las filas en páginas de 1000 para evitar el límite de Supabase
        let allRows = [], page = 0, pageSize = 1000, done = false
        while (!done) {
          const { data: chunk, error } = await supabase
            .from('circuit_rows').select('*').order('idx')
            .range(page * pageSize, (page + 1) * pageSize - 1)
          if (error || !chunk || chunk.length === 0) { done = true; break }
          allRows = [...allRows, ...chunk]
          if (chunk.length < pageSize) done = true
          else page++
        }
        const full = circs.map((c) => ({
          ...c,
          rows: (allRows || []).filter((r) => r.circuit_id === c.id).map((r) => ({ ...r, fecha: parseLocalDate(r.fecha) })),
        }))
        setCircuits(full)
        if (full.length > 0) setView({ type: 'all' })
      }
    } catch (e) { console.error(e) }
    setDataLoading(false)
  }

  const handleCircuitFile = (file) => {
    if (!xlsxReady || !file) return
    const rd = new FileReader()
    rd.onload = (e) => {
      const wb = window.XLSX.read(e.target.result, { type: 'binary', cellDates: true })
      setPendingCircuit(parseCircuito(wb.Sheets[wb.SheetNames[0]]))
    }
    rd.readAsBinaryString(file)
  }

  const confirmLoad = async () => {
    if (!pendingCircuit) return
    if (checkReadOnly()) return
    setSaving(true)
    try {
      await supabase.from('circuits').upsert({ id: pendingCircuit.id, month_key: pendingCircuit.monthKey, info: pendingCircuit.info })
      await supabase.from('circuit_rows').delete().eq('circuit_id', pendingCircuit.id)
      await supabase.from('circuit_rows').insert(pendingCircuit.rows.map((r) => ({
        circuit_id: pendingCircuit.id, idx: r.idx, fecha: dateToLocalStr(r.fecha),
        destino: r.destino, clasificacion: r.clasificacion, servicio: r.servicio,
        tipo: r.tipo, prov_general: r.prov_general, t_venta: r.t_venta,
        paid: false, fecha_pago: null, nota: '', precio_custom: null, moneda_custom: null,
        factura_recibida: false, folio_factura: null, visto_bueno_auditoria: false, visto_bueno_pago: false,
      })))
      await loadAll()
      setView({ type: 'circuit', circuitId: pendingCircuit.id })
      setActiveTab('cxp')
      setModal(null); setPendingCircuit(null)
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const handleTarFile = (file) => {
    if (!xlsxReady || !file) return
    const rd = new FileReader()
    rd.onload = (e) => {
      const wb = window.XLSX.read(e.target.result, { type: 'binary', cellDates: true })
      const raw = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null })
      const newTar = []
      for (let i = 1; i < raw.length; i++) {
        const r = raw[i]; if (!r || r.every((v) => !v)) continue
        newTar.push({ proveedor: clean(r[0]), tipo_servicio: clean(r[1]), precio: parseAmt(r[2]), moneda: norm(r[3]) === 'USD' ? 'USD' : 'MXN', dias_credito: parseInt(r[4]) || 0, notas: clean(r[5]) })
      }
      setTarifario(newTar)
    }
    rd.readAsBinaryString(file)
  }

  const saveTarifario = async (rows) => {
    if (checkReadOnly()) return
    setSaving(true)
    try {
      // Step 1: get all existing IDs
      const { data: existing, error: selErr } = await supabase.from('tarifario').select('id')
      if (selErr) throw new Error('No se pudo leer el tarifario: ' + selErr.message)

      // Step 2: delete by ID (most reliable way, respects RLS)
      if (existing && existing.length > 0) {
        const ids = existing.map(r => r.id)
        // Delete in batches of 50 to avoid URL length limits
        for (let i = 0; i < ids.length; i += 50) {
          const { error: delErr } = await supabase.from('tarifario').delete().in('id', ids.slice(i, i + 50))
          if (delErr) throw new Error('Error al eliminar registros: ' + delErr.message)
        }
      }

      // Step 3: insert new rows (skip blank proveedores)
      const toInsert = rows.filter(r => (r.proveedor || '').trim()).map(r => ({
        proveedor:    r.proveedor.trim(),
        razon_social: (r.razon_social || '').trim() || null,
        tipo_servicio: r.tipo_servicio || 'HOSPEDAJE',
        tipo_tarifa:   r.tipo_tarifa   || 'precio_fijo',
        precio:        parseFloat(r.precio_single) || 0,
        precio_single: parseFloat(r.precio_single) || 0,
        precio_doble:  parseFloat(r.precio_doble)  || parseFloat(r.precio_single) || 0,
        precio_pax:    parseFloat(r.precio_pax)    || 0,
        incluye_tl:    !!r.incluye_tl,
        moneda:        r.moneda       || 'MXN',
        temporada:     r.temporada    || 'General',
        temp_inicio:   r.temp_inicio  || null,
        temp_fin:      r.temp_fin     || null,
        cortesia_cada: parseInt(r.cortesia_cada) || 0,
        dias_credito:  parseInt(r.dias_credito)  || 0,
        notas:         r.notas || ''
      }))

      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from('tarifario').insert(toInsert)
        if (insErr) throw new Error('Error al guardar tarifario: ' + insErr.message)
      }

      // Step 4: reload and close
      const { data: fresh } = await supabase.from('tarifario').select('*').order('proveedor')
      if (fresh) setTarifario(fresh)
      setModal(null)
    } catch (e) {
      console.error('saveTarifario:', e)
      alert('⚠️ ' + (e.message || 'Error desconocido al guardar'))
    }
    setSaving(false)
  }

  const updateRow = useCallback((cid, rowId, changes) => {
    setCircuits((prev) => prev.map((c) => c.id !== cid ? c : { ...c, rows: c.rows.map((r) => r.id !== rowId ? r : { ...r, ...changes }) }))
  }, [])

  // Guard: bloquear si el usuario es de solo lectura
  const checkReadOnly = () => {
    if (isReadOnly) {
      alert('Modo solo lectura: no tienes permiso para editar.')
      return true
    }
    return false
  }
  // Guard: bloquear si circuito está locked (la UI también desabilita los controles,
  // pero este es el safety net)
  const checkLocked = (cid) => {
    if (checkReadOnly()) return true
    const c = circuits.find(x => x.id === cid)
    if (c?.locked) { alert('Este circuito está cerrado. Ábrelo antes de editarlo.'); return true }
    return false
  }
  // ── Funciones administrativas de pago/factura ────────────────────
  // Estas NO respetan el candado del circuito (para que se puedan
  // registrar facturas/pagos aunque Irlanda ya haya bloqueado el
  // circuito). Sí respetan el modo solo lectura.
  const togglePaid = async (cid, rowId, current) => {
    if (checkReadOnly()) return
    await supabase.from('circuit_rows').update({ paid: !current }).eq('id', rowId)
    updateRow(cid, rowId, { paid: !current })
  }
  const setFechaPago = async (cid, rowId, val) => {
    if (checkReadOnly()) return
    await supabase.from('circuit_rows').update({ fecha_pago: val || null }).eq('id', rowId)
    updateRow(cid, rowId, { fecha_pago: val })
  }
  const saveFactura = async (cid, rowId, field, val) => {
    if (checkReadOnly()) return
    await supabase.from('circuit_rows').update({ [field]: val }).eq('id', rowId)
    updateRow(cid, rowId, { [field]: val })
  }
  // ── Funciones operativas del circuito ─────────────────────────────
  // Estas SÍ respetan el candado (para editar hay que desbloquear).
  const setNota = useCallback(async (cid, rowId, val) => {
    const c = circuits.find(x => x.id === cid)
    if (c?.locked) { alert('Este circuito está cerrado. Ábrelo antes de editarlo.'); return }
    await supabase.from('circuit_rows').update({ nota: val }).eq('id', rowId)
    updateRow(cid, rowId, { nota: val })
  }, [updateRow, circuits])
  const saveProv = async (cid, rowId, val) => {
    if (checkLocked(cid)) return
    // Check if this provider has PAX-based pricing — if so, freeze price now
    const circ = circuits.find(c => c.id === cid)
    const tarEntry = tarifario.find(t => (t.tipo_tarifa || 'precio_fijo') === 'precio_pax' && t.proveedor === val)
    let extra = {}
    if (tarEntry && circ) {
      const pax = parseInt(circ.info?.pax) || 0
      const tl  = tarEntry.incluye_tl ? 1 : 0
      const total = tarEntry.precio_pax * (pax + tl)
      if (total > 0) {
        extra = { precio_custom: total, moneda_custom: tarEntry.moneda || 'MXN' }
      }
    } else {
      // Non-PAX provider: clear custom price so tarifario recalculates
      extra = { precio_custom: null, moneda_custom: null }
    }
    await supabase.from('circuit_rows').update({ prov_general: val, ...extra }).eq('id', rowId)
    updateRow(cid, rowId, { prov_general: val, ...extra })
  }
  const saveImporte = async (cid, rowId, precio, moneda) => {
    if (checkLocked(cid)) return
    await supabase.from('circuit_rows').update({ precio_custom: precio || null, moneda_custom: moneda }).eq('id', rowId)
    updateRow(cid, rowId, { precio_custom: precio || null, moneda_custom: moneda })
  }
  const saveRowField = async (cid, rowId, changes) => {
    if (checkLocked(cid)) return
    await supabase.from('circuit_rows').update(changes).eq('id', rowId)
    updateRow(cid, rowId, changes)
  }
  const addRow = (cid) => {
    if (checkLocked(cid)) return
    setAddRowModal({ cid })
  }
  const addRowWithData = async (cid, fields) => {
    if (checkLocked(cid)) return
    const circ = circuits.find(c => c.id === cid)
    const nextIdx = circ ? Math.max(0, ...circ.rows.map(r => r.idx || 0)) + 1 : 1
    // Si hay proveedor con precio_pax, calcular importe automáticamente
    let extra = {}
    if (fields.prov_general) {
      const tarEntry = tarifario.find(t => (t.tipo_tarifa || 'precio_fijo') === 'precio_pax' && t.proveedor === fields.prov_general)
      if (tarEntry && circ) {
        const pax = parseInt(circ.info?.pax) || 0
        const tl  = tarEntry.incluye_tl ? 1 : 0
        const total = tarEntry.precio_pax * (pax + tl)
        if (total > 0) extra = { precio_custom: total, moneda_custom: tarEntry.moneda || 'MXN' }
      }
    }
    const { data, error } = await supabase.from('circuit_rows').insert({
      circuit_id: cid, idx: nextIdx,
      fecha: fields.fecha ? dateToLocalStr(fields.fecha) : null,
      destino: fields.destino || '',
      clasificacion: fields.clasificacion || 'HOSPEDAJE',
      servicio: fields.servicio || 'Nuevo servicio',
      tipo: fields.tipo || 'LIBERO',
      prov_general: fields.prov_general || '',
      t_venta: 0,
      paid: false, fecha_pago: null, nota: '', precio_custom: null, moneda_custom: null,
      factura_recibida: false, folio_factura: null, visto_bueno_auditoria: false, visto_bueno_pago: false,
      ...extra,
    }).select().single()
    if (!error && data) {
      setCircuits(prev => prev.map(c => c.id !== cid ? c : { ...c, rows: [...c.rows, { ...data, fecha: parseLocalDate(data.fecha) }].sort((a,b) => {
        const fa = a.fecha ? (parseLocalDate(a.fecha)) : null
        const fb = b.fecha ? (parseLocalDate(b.fecha)) : null
        if (!fa && !fb) return (a.idx||0)-(b.idx||0)
        if (!fa) return 1; if (!fb) return -1
        return fa - fb
      })}))
    }
    setAddRowModal(null)
  }
  const deleteRow = async (cid, rowId) => {
    if (checkLocked(cid)) return
    await supabase.from('circuit_rows').delete().eq('id', rowId)
    setCircuits(prev => prev.map(c => c.id !== cid ? c : { ...c, rows: c.rows.filter(r => r.id !== rowId) }))
  }
  const saveOpcional = async (cid, field, val) => {
    if (checkLocked(cid)) return
    await supabase.from('circuits').update({ [field]: parseFloat(val) || 0 }).eq('id', cid)
    setCircuits(prev => prev.map(c => c.id !== cid ? c : { ...c, [field]: parseFloat(val) || 0 }))
  }
  const saveCircInfo = async (cid, infoChanges) => {
    if (checkLocked(cid)) return
    const circ = circuits.find(c => c.id === cid)
    if (!circ) return
    const newInfo = { ...circ.info, ...infoChanges }
    await supabase.from('circuits').update({ info: newInfo }).eq('id', cid)
    setCircuits(prev => prev.map(c => c.id !== cid ? c : { ...c, info: newInfo }))
  }
  const saveImporteCobrado = async (cid, valor, moneda) => {
    if (checkLocked(cid)) return
    await supabase.from('circuits').update({ importe_cobrado: valor || null, moneda_cobrado: moneda }).eq('id', cid)
    setCircuits((prev) => prev.map((c) => c.id !== cid ? c : { ...c, importe_cobrado: valor || null, moneda_cobrado: moneda }))
  }
  const saveCommission = async (cid, pct) => {
    if (checkLocked(cid)) return
    const val = parseFloat(pct)
    const safe = isNaN(val) || val < 0 ? 0 : val
    await supabase.from('circuits').update({ commission_pct: safe }).eq('id', cid)
    setCircuits((prev) => prev.map((c) => c.id !== cid ? c : { ...c, commission_pct: safe }))
  }
  // ── Bloqueo / cierre de circuito ─────────────────────────────────────
  // Contraseña global desde env var (con fallback). Configurar VITE_LOCK_PASSWORD en Vercel.
  const LOCK_PASSWORD = import.meta.env.VITE_LOCK_PASSWORD || 'abrir2026'
  const [lockModal, setLockModal] = useState(null) // { circuitId, action: 'lock'|'unlock' }
  const [lockPwd, setLockPwd] = useState('')
  const [lockError, setLockError] = useState('')
  const openLockModal = (circuitId, action) => { setLockPwd(''); setLockError(''); setLockModal({ circuitId, action }) }
  const confirmLock = async () => {
    if (checkReadOnly()) return
    if (lockPwd !== LOCK_PASSWORD) { setLockError('Contraseña incorrecta'); return }
    const { circuitId, action } = lockModal
    const newLocked = action === 'lock'
    await supabase.from('circuits').update({ locked: newLocked }).eq('id', circuitId)
    setCircuits((prev) => prev.map((c) => c.id !== circuitId ? c : { ...c, locked: newLocked }))
    setLockModal(null); setLockPwd(''); setLockError('')
  }
  // Helper para verificar si un circuito está bloqueado
  const isLocked = (cid) => !!circuits.find((c) => c.id === cid)?.locked
  // ─────────────────────────────────────────────────────────────────────
  const deleteCircuit = async () => {
    if (checkLocked(deleteId)) return
    await supabase.from('circuits').delete().eq('id', deleteId)
    const next = circuits.filter((c) => c.id !== deleteId)
    setCircuits(next); setView(next.length > 0 ? { type: 'all' } : { type: 'empty' }); setModal(null)
  }
  const updateTC = async (val) => {
    if (checkReadOnly()) return
    const v = parseFloat(val); if (!v || v <= 0) return
    setTC(v); await supabase.from('team_settings').update({ tc: v }).eq('id', 1)
  }
  const updatePietroFeeEur = async (val) => {
    if (checkReadOnly()) return
    const v = parseFloat(val); if (isNaN(v) || v < 0) return
    setPietroFeeEur(v); await supabase.from('team_settings').update({ pietro_fee_eur: v }).eq('id', 1)
  }
  const updateTcEur = async (val) => {
    if (checkReadOnly()) return
    const v = parseFloat(val); if (!v || v <= 0) return
    setTcEur(v); await supabase.from('team_settings').update({ tc_eur: v }).eq('id', 1)
  }
  const updateGastosItems = async (items) => {
    if (checkReadOnly()) return
    setGastosItems(items)
    await supabase.from('team_settings').update({ gastos_operativos_items: items }).eq('id', 1)
  }
  // Modal para editar gastos operativos
  const [gastosModal, setGastosModal] = useState(false)
  const logout = () => supabase.auth.signOut()

  // Filtrar circuitos por rango de meses si Vista Socio está activa con rango
  const inSocioRange = (mk) => {
    if (!socioMode || !socioRange) return true
    const s = monthKeySortable(mk)
    const sFrom = monthKeySortable(socioRange.from)
    const sTo = monthKeySortable(socioRange.to)
    return s >= sFrom && s <= sTo
  }
  const visibleCircuits = (socioMode && socioRange)
    ? circuits.filter(c => inSocioRange(c.month_key || 'Sin mes'))
    : circuits

  const monthMap = {}
  visibleCircuits.forEach((c) => { const mk = c.month_key || 'Sin mes'; if (!monthMap[mk]) monthMap[mk] = []; monthMap[mk].push(c) })
  // Ordenar circuitos dentro de cada mes por fecha_inicio ascendente
  Object.keys(monthMap).forEach(mk => {
    monthMap[mk].sort((a, b) => {
      const fa = parseLocalDate(a.info?.fecha_inicio)
      const fb = parseLocalDate(b.info?.fecha_inicio)
      if (!fa && !fb) return (a.id || '').localeCompare(b.id || '')
      if (!fa) return 1; if (!fb) return -1
      return fa - fb
    })
  })
  const sortedMonths = Object.keys(monthMap).sort((a, b) => monthKeySortable(a).localeCompare(monthKeySortable(b)))
  // Lista de TODOS los meses (sin filtrar) — para el selector del modal de configuración
  const allMonthsSorted = [...new Set(circuits.map(c => c.month_key || 'Sin mes'))].sort((a, b) => monthKeySortable(a).localeCompare(monthKeySortable(b)))

  // Cuando seleccionas un circuito o un mes en el main, abre ese mes en la sidebar (sin cerrar otros)
  useEffect(() => {
    if (view.type === 'circuit' && view.circuitId) {
      const c = circuits.find(x => x.id === view.circuitId)
      if (c?.month_key) openMonth(c.month_key)
    } else if ((view.type === 'month' || view.type === 'resultados_mes') && view.monthKey) {
      openMonth(view.monthKey)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.type, view.circuitId, view.monthKey, circuits.length])

  const filteredRows = (rows) => rows.filter((r) => {
    // En modo Vista Socio, ocultar todas las filas OPCIONAL
    if (socioMode && (r.tipo || '').toString().toUpperCase().trim() === 'OPCIONAL') return false
    if (F.tipo !== 'ALL' && norm(r.tipo) !== F.tipo) return false
    if (F.cat !== 'ALL' && norm(r.clasificacion) !== F.cat) return false
    if (F.pago === 'PAID' && !r.paid) return false
    if (F.pago === 'UNPAID' && r.paid) return false
    if (F.fecha && r.fecha_pago !== F.fecha) return false
    if (F.proveedor !== 'ALL' && norm(r.prov_general) !== F.proveedor) return false
    return true
  })

  const activeCircuit = circuits.find((c) => c.id === view.circuitId)

  if (dataLoading) return (
    <FullCenter><div style={{ textAlign: 'center' }}><Spinner /><div style={{ marginTop: 12, color: '#8a8278', fontSize: 13 }}>Cargando datos...</div></div></FullCenter>
  )

  return (
    <>
    <div style={{ fontFamily: "'Outfit', sans-serif", fontVariantNumeric: 'lining-nums tabular-nums', fontFeatureSettings: '"tnum","lnum"', background: '#f5f1eb', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── HEADER ── */}
      <header style={{ background: '#000000', borderBottom: '2px solid #b8952a', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontSize: 18 }}>☰</button>
          <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 20, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            CxP <span style={{ color: '#e0c96a' }}>Circuitos</span>
            {socioMode && <span title="Vista Socio activa" style={{ width: 7, height: 7, borderRadius: '50%', background: '#52b788', display: 'inline-block', boxShadow: '0 0 6px rgba(82,183,136,.6)' }} />}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {saving && <span style={{ fontSize: 11, color: '#e0c96a' }}>Guardando...</span>}
          {isReadOnly && (
            <span style={{ background: 'rgba(149,213,178,.15)', border: '1px solid rgba(149,213,178,.4)', color: '#95d5b2', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }} title="Tu sesión es de solo lectura. No puedes editar ni eliminar.">
              👁 Solo lectura
            </span>
          )}
          {!isReadOnly && <HBtn onClick={() => { setPendingCircuit(null); setModal('upload') }}>+ Circuito</HBtn>}
          <HBtn onClick={() => setPresentacion(true)}>📊 Presentación</HBtn>
          <HBtn onClick={() => setModal('tarifario')}>📋 Tarifario</HBtn>
          <HBtn onClick={() => { if (socioMode) setSocioMode(false); else setSocioConfigModal(true) }} style={socioMode ? { background: 'rgba(149,213,178,.12)', borderColor: 'rgba(149,213,178,.35)', color: '#95d5b2', padding: '5px 10px' } : { padding: '5px 10px' }} title={socioMode ? 'Vista Socio activa (clic para desactivar)' : 'Vista Socio (clic para configurar y activar)'}>
            👥
          </HBtn>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(184,149,42,.15)', border: '1px solid rgba(224,201,106,.3)', borderRadius: 20, padding: '3px 12px' }}>
            <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 11 }}>TC:</span>
            <input type="number" value={TC} step="0.01" disabled={isReadOnly} onChange={(e) => updateTC(e.target.value)} style={{ width: 52, background: 'none', border: 'none', color: '#e0c96a', fontSize: 12, fontWeight: 600, outline: 'none', cursor: isReadOnly ? 'not-allowed' : 'text', opacity: isReadOnly ? 0.6 : 1 }} />
            <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 11 }}>MXN/USD</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(149,213,178,.12)', border: '1px solid rgba(149,213,178,.3)', borderRadius: 20, padding: '3px 12px' }} title="Fee mensual a Pietro Lamprati">
            <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 11 }}>💼 Fee:</span>
            <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 11 }}>€</span>
            <input type="number" value={pietroFeeEur} step="1" min="0" disabled={isReadOnly} onChange={(e) => updatePietroFeeEur(e.target.value)} style={{ width: 42, background: 'none', border: 'none', color: '#95d5b2', fontSize: 12, fontWeight: 600, outline: 'none', cursor: isReadOnly ? 'not-allowed' : 'text', opacity: isReadOnly ? 0.6 : 1 }} />
            <span style={{ color: 'rgba(255,255,255,.25)', fontSize: 11 }}>×</span>
            <input type="number" value={tcEur} step="0.01" min="0" disabled={isReadOnly} onChange={(e) => updateTcEur(e.target.value)} style={{ width: 45, background: 'none', border: 'none', color: '#95d5b2', fontSize: 12, fontWeight: 600, outline: 'none', cursor: isReadOnly ? 'not-allowed' : 'text', opacity: isReadOnly ? 0.6 : 1 }} />
            <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 11 }}>MXN/EUR</span>
          </div>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,.15)' }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>{session?.user?.email}</span>
          <HBtn onClick={logout}>Salir</HBtn>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* ── SIDEBAR ── */}
        {sidebarOpen && (
          <aside style={{ width: 272, background: '#000000', borderRight: '1px solid rgba(255,255,255,.07)', overflowY: 'auto', flexShrink: 0 }}>

            <SbItem label="📊 Todos los circuitos" count={circuits.length} active={view.type === 'all'} onClick={() => setView({ type: 'all' })} />
            <SbItem label="📈 Estado de Resultados" count="" active={view.type === 'resultados_all'} onClick={() => setView({ type: 'resultados_all' })} />
            {(() => {
              const sinFecha = circuits.reduce((acc,c) => acc + c.rows.filter(r=>!r.paid&&!r.fecha_pago).length, 0)
              const isActive = view.type === 'pagos'
              return (
                <div onClick={() => setView({ type: 'pagos' })} style={{ padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isActive ? 'rgba(184,149,42,.15)' : 'transparent', borderLeft: `3px solid ${isActive ? '#b8952a' : 'transparent'}` }}>
                  <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 400, color: isActive ? '#fff' : 'rgba(255,255,255,.65)' }}>💳 Pagos</span>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
  
                  </div>
                </div>
              )
            })()}
            <SbDivider />

            {sortedMonths.map((mk) => {
              const mCircs = monthMap[mk]
              const mPaid = mCircs.every((c) => c.rows.length > 0 && c.rows.every((r) => r.paid))
              const isExpanded = expandedMonths.has(mk)
              return (
                <div key={mk}>
                  {/* Cabecera del mes — clickeable para expandir/colapsar */}
                  <div
                    onClick={() => toggleMonth(mk)}
                    style={{ padding: '10px 16px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
                    title={isExpanded ? 'Colapsar' : 'Expandir'}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: 'rgba(255,255,255,.35)' }}>
                      <span style={{ fontSize: 8, transition: 'transform .15s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                      {mk}
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.45)', background: 'rgba(255,255,255,.08)', padding: '1px 6px', borderRadius: 8 }}>{mCircs.length}</span>
                    </span>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: mPaid ? '#52b788' : '#e0c96a' }} />
                  </div>

                  {isExpanded && (
                    <>
                      {/* Ver mes */}
                      <SbItem label="📅 Ver mes" count={mCircs.length} active={view.type === 'month' && view.monthKey === mk} onClick={() => setView({ type: 'month', monthKey: mk })} indent />
                      {/* Resultados del mes */}
                      <SbItem label="📈 Resultados" count="" active={view.type === 'resultados_mes' && view.monthKey === mk} onClick={() => setView({ type: 'resultados_mes', monthKey: mk })} indent />

                      {/* Circuitos */}
                      {mCircs.map((c) => {
                        const paid = c.rows.filter((r) => r.paid).length
                        const allPaid = paid === c.rows.length && c.rows.length > 0
                        const isActive = view.circuitId === c.id
                        return (
                          <div key={c.id} onClick={() => { setView({ type: 'circuit', circuitId: c.id }); setActiveTab('cxp'); setFilters({ tipo: 'ALL', cat: 'ALL', pago: 'ALL', fecha: '', proveedor: 'ALL' }) }}
                            style={{ padding: '5px 16px 5px 32px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, borderLeft: `3px solid ${isActive ? '#b8952a' : 'transparent'}` }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: allPaid ? '#52b788' : '#e0c96a', flexShrink: 0 }} />
                            <div style={{ overflow: 'hidden', flex: 1 }}>
                              <div style={{ fontSize: 9.5, color: isActive ? '#fff' : 'rgba(255,255,255,.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: 0 }} title={c.id}>{c.id}</div>
                              {c.info?.tl && <div style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.info.tl}</div>}
                            </div>
                            {c.locked && <span title="Circuito cerrado" style={{ fontSize: 11, color: '#e0c96a', flexShrink: 0 }}>🔒</span>}
                          </div>
                        )
                      })}
                    </>
                  )}
                  <div style={{ height: 6 }} />
                </div>
              )
            })}

            <SbDivider />
            {!isReadOnly && (
              <div onClick={() => { setPendingCircuit(null); setModal('upload') }} style={{ padding: '10px 16px', cursor: 'pointer', color: 'rgba(255,255,255,.35)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16 }}>＋</span> Agregar circuito
              </div>
            )}
          </aside>
        )}

        {/* ── MAIN ── */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {view.type === 'empty' && <EmptyState onAdd={() => { setPendingCircuit(null); setModal('upload') }} />}
          {view.type === 'all' && <AllView circuits={visibleCircuits} monthMap={monthMap} sortedMonths={sortedMonths} tarifario={tarifario} TC={TC} socioMode={socioMode} onSelect={(id) => { setView({ type: 'circuit', circuitId: id }); setActiveTab('cxp') }} />}
          {view.type === 'month' && <MonthView mk={view.monthKey} circuits={monthMap[view.monthKey] || []} tarifario={tarifario} TC={TC} socioMode={socioMode} onSelect={(id) => { setView({ type: 'circuit', circuitId: id }); setActiveTab('cxp') }} />}
          {view.type === 'resultados_all' && <EstadoResultados circuits={visibleCircuits} monthMap={monthMap} sortedMonths={sortedMonths} tarifario={tarifario} TC={TC} pietroFeeEur={pietroFeeEur} tcEur={tcEur} gastosOperativosMxn={gastosOperativosMxn} gastosItems={gastosItems} onEditGastos={isReadOnly ? null : () => setGastosModal(true)} socioMode={socioMode} isReadOnly={isReadOnly} />}
          {view.type === 'resultados_mes' && <EstadoResultados circuits={visibleCircuits} monthMap={monthMap} sortedMonths={sortedMonths} tarifario={tarifario} TC={TC} pietroFeeEur={pietroFeeEur} tcEur={tcEur} gastosOperativosMxn={gastosOperativosMxn} gastosItems={gastosItems} onEditGastos={isReadOnly ? null : () => setGastosModal(true)} socioMode={socioMode} isReadOnly={isReadOnly} initModo="mes" initMes={view.monthKey} />}
          {view.type === 'pagos' && <PagosView circuits={socioMode ? visibleCircuits : circuits} tarifario={tarifario} TC={TC} isReadOnly={isReadOnly} togglePaid={togglePaid} setFechaPago={setFechaPago} saveImporte={saveImporte} saveFactura={saveFactura} saveRowField={saveRowField} onGoCircuit={(id)=>{setView({type:'circuit',circuitId:id});setActiveTab('cxp')}} />}
          {view.type === 'circuit' && activeCircuit && (
            <CircuitDetail circ={activeCircuit} tarifario={tarifario} TC={TC} activeTab={activeTab} setActiveTab={setActiveTab}
              F={F} setFilters={setFilters} filteredRows={filteredRows} socioMode={socioMode} isReadOnly={isReadOnly}
              togglePaid={togglePaid} setFechaPago={setFechaPago} setNota={setNota}
              saveProv={saveProv} saveImporte={saveImporte} saveImporteCobrado={saveImporteCobrado} saveCommission={saveCommission} saveFactura={saveFactura} saveRowField={saveRowField} addRow={addRow} deleteRow={deleteRow} saveOpcional={saveOpcional} saveCircInfo={saveCircInfo}
              openLockModal={openLockModal}
              onDelete={(id) => { setDeleteId(id); setModal('delete') }} />
          )}
        </main>
      </div>

      {/* ── MODALS ── */}
      {modal === 'upload' && (
        <Modal title="Agregar Circuito" onClose={() => { setModal(null); setPendingCircuit(null) }}>
          <UploadZone xlsxReady={xlsxReady} onFile={handleCircuitFile} pending={pendingCircuit} fileRef={fileRef} onUpdatePending={setPendingCircuit} existingCircuits={circuits} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Btn outline onClick={() => { setModal(null); setPendingCircuit(null) }}>Cancelar</Btn>
            <Btn disabled={!pendingCircuit || saving} onClick={confirmLoad}>{saving ? 'Guardando...' : 'Confirmar y cargar ✓'}</Btn>
          </div>
        </Modal>
      )}
      {modal === 'tarifario' && (
        <Modal title="📋 Tarifario de Proveedores" wide onClose={() => setModal(null)}>
          <TarifarioEditor tarifario={tarifario} circuits={circuits} tarFileRef={tarFileRef} onTarFile={handleTarFile} onSave={saveTarifario} onCancel={() => setModal(null)} saving={saving} />
        </Modal>
      )}
      {modal === 'delete' && (
        <Modal title="¿Eliminar circuito?" onClose={() => setModal(null)}>
          <p style={{ color: '#8a8278', fontSize: 13 }}>Esta acción eliminará el circuito y todos sus servicios permanentemente.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Btn outline onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn danger onClick={deleteCircuit}>Eliminar</Btn>
          </div>
        </Modal>
      )}
      {lockModal && (
        <Modal title={lockModal.action === 'lock' ? '🔒 Cerrar circuito' : '🔓 Abrir circuito'} onClose={() => { setLockModal(null); setLockPwd(''); setLockError('') }}>
          <p style={{ color: '#8a8278', fontSize: 13, marginBottom: 14 }}>
            {lockModal.action === 'lock'
              ? 'Al cerrar el circuito, nadie podrá editarlo hasta que se vuelva a abrir. Ingresa la contraseña para confirmar.'
              : 'Al abrir el circuito, los usuarios podrán editarlo de nuevo. Ingresa la contraseña para confirmar.'}
          </p>
          <input
            type="password"
            value={lockPwd}
            onChange={(e) => { setLockPwd(e.target.value); setLockError('') }}
            onKeyDown={(e) => e.key === 'Enter' && confirmLock()}
            placeholder="Contraseña"
            autoFocus
            style={{ width: '100%', border: `1.5px solid ${lockError ? '#b83232' : '#d8d2c8'}`, borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontSize: 14, outline: 'none' }}
          />
          {lockError && <div style={{ color: '#b83232', fontSize: 12, marginTop: 6 }}>❌ {lockError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Btn outline onClick={() => { setLockModal(null); setLockPwd(''); setLockError('') }}>Cancelar</Btn>
            <Btn onClick={confirmLock}>{lockModal.action === 'lock' ? '🔒 Cerrar' : '🔓 Abrir'}</Btn>
          </div>
        </Modal>
      )}
      {socioConfigModal && (
        <SocioConfigModal
          allMonths={allMonthsSorted}
          currentRange={socioRange}
          onCancel={() => setSocioConfigModal(false)}
          onConfirm={(range) => { setSocioRange(range); setSocioMode(true); setSocioConfigModal(false) }}
        />
      )}
      {gastosModal && (
        <GastosOperativosModal
          items={gastosItems}
          onCancel={() => setGastosModal(false)}
          onConfirm={(items) => { updateGastosItems(items); setGastosModal(false) }}
        />
      )}
      {addRowModal && (
        <AddRowModal
          tarifario={tarifario}
          onCancel={() => setAddRowModal(null)}
          onConfirm={(fields) => addRowWithData(addRowModal.cid, fields)}
        />
      )}
    </div>
    {presentacion && <PresentacionMode circuits={visibleCircuits} monthMap={monthMap} sortedMonths={sortedMonths} tarifario={tarifario} TC={TC} socioMode={socioMode} onClose={()=>setPresentacion(false)}/>}
    </>
  )
}
// ═══════════════════════════════════════════════
//  ESTADO DE RESULTADOS
// ═══════════════════════════════════════════════
function EstadoResultados({ circuits, monthMap, sortedMonths, tarifario, TC, pietroFeeEur, tcEur, gastosOperativosMxn, gastosItems, onEditGastos, socioMode, isReadOnly, initModo, initMes }) {
  const [modo, setModo] = useState(initModo || 'todos')
  const [mesSel, setMesSel] = useState(initMes || sortedMonths[0] || '')
  const [circSel, setCircSel] = useState(circuits[0]?.id || '')

  const circsMostrar = modo === 'todos' ? circuits
    : modo === 'mes' ? (monthMap[mesSel] || [])
    : circuits.filter(c => c.id === circSel)

  // Acumular totales LIBERO y OPCIONAL separados
  let totalIngUSD=0, totalIngMXN=0, totalCosto=0
  let totalPaidMXN=0, totalPaidUSD=0, totalPendMXN=0, totalPendUSD=0
  let totalCostoOpc=0, totalIngOpcMXN=0, totalIngOpcUSD=0, totalIngOpcTotal=0
  let totalPaidOpcMXN=0, totalPaidOpcUSD=0
  let totalComision=0
  let totalPax=0
  const catCosto={}, catPaidMXN={}, catPaidUSD={}, catPendMXN={}, catPendUSD={}
  // Agrupar datos por mes (para Vista Socio: tendencia + tabla + indicadores)
  const byMonth = {} // mk -> { circuits, pax, ingreso, costo, comision, utilidadBruta }

  circsMostrar.forEach(c => {
    totalIngUSD += c.importe_cobrado || 0
    const T = calcCircTotals(c, tarifario, TC)
    totalIngMXN    += T.ingresoMXN;    totalCosto     += T.costoTotal
    totalPaidMXN   += T.paidMXN;       totalPaidUSD   += T.paidUSD
    totalPendMXN   += T.costoMXN - T.paidMXN
    totalPendUSD   += T.costoUSD - T.paidUSD
    totalCostoOpc  += T.costoOpcTotal
    totalIngOpcMXN += T.ingresoOpcMXN; totalIngOpcUSD += T.ingresoOpcUSD
    totalIngOpcTotal += T.ingresoOpcTotal
    totalPaidOpcMXN += T.paidOpcMXN;   totalPaidOpcUSD += T.paidOpcUSD
    totalComision  += T.comision
    const paxC = parseInt(c.info?.pax) || 0
    totalPax += paxC

    // Acumular por mes (en modo socio: solo LIBERO; en modo normal: LIBERO+OPC para que sea consistente con totales)
    const mk = c.month_key || 'Sin mes'
    if (!byMonth[mk]) byMonth[mk] = { circuits:0, pax:0, ingreso:0, costo:0, comision:0, utilidadBruta:0 }
    byMonth[mk].circuits += 1
    byMonth[mk].pax += paxC
    byMonth[mk].ingreso += T.ingresoMXN
    byMonth[mk].costo += T.costoTotal
    byMonth[mk].comision += T.comision
    byMonth[mk].utilidadBruta += T.utilidadNeta

    c.rows.forEach(r => {
      // En modo socio, ignoramos OPCIONAL en gráficas por categoría
      if (socioMode && (r.tipo||'').toString().toUpperCase().trim() === 'OPCIONAL') return
      const cat = (r.clasificacion||'OTROS').toUpperCase().trim()
      const {mxn,usd} = getImporte(r,c.info,tarifario)
      const v = mxn + usd*TC; if (v>0) catCosto[cat]=(catCosto[cat]||0)+v
      if (!catPaidMXN[cat]){catPaidMXN[cat]=0;catPaidUSD[cat]=0;catPendMXN[cat]=0;catPendUSD[cat]=0}
      if (r.paid){catPaidMXN[cat]+=mxn;catPaidUSD[cat]+=usd}
      else{catPendMXN[cat]+=mxn;catPendUSD[cat]+=usd}
    })
  })

  // Ordenar meses cronológicamente para los nuevos componentes
  const monthsOrdered = Object.keys(byMonth).sort((a,b) => monthKeySortable(a).localeCompare(monthKeySortable(b)))
  // Cantidad de meses (excluyendo "Sin mes")
  const monthsWithCircuits = monthsOrdered.filter(m => m && m !== 'Sin mes')
  // Fee mensual a Pietro: €500/mes × (meses con circuitos en la vista) × TC EUR
  const feeMensualEur = (pietroFeeEur || 0) * monthsWithCircuits.length
  const feeMensualMXN = feeMensualEur * (tcEur || 0)
  // Gastos operativos: $X/mes × (meses con circuitos)
  const gastosOperativosTotal = (gastosOperativosMxn || 0) * monthsWithCircuits.length
  // Mejor mes por utilidad bruta (sin contar fee, porque éste no se asigna a mes individual)
  const bestMonth = monthsOrdered.length > 0
    ? monthsOrdered.reduce((best, mk) => byMonth[mk].utilidadBruta > byMonth[best].utilidadBruta ? mk : best, monthsOrdered[0])
    : null
  const avgUtilPerCircuit = circsMostrar.length > 0 ? (totalIngMXN - totalCosto - totalComision - feeMensualMXN - gastosOperativosTotal) / circsMostrar.length : 0
  const avgMargin = totalIngMXN > 0 ? ((totalIngMXN - totalCosto - totalComision - feeMensualMXN - gastosOperativosTotal) / totalIngMXN) * 100 : 0

  const utilidad        = totalIngMXN - totalCosto
  const utilidadBruta   = utilidad  // Ingreso − Costos (sin Pietro, sin Gastos Op)
  const utilidadOperativa = utilidadBruta - gastosOperativosTotal  // después de Gastos Op
  const totalComisionFee  = totalComision + feeMensualMXN
  const utilidadNeta    = utilidadOperativa - totalComisionFee  // después de Comisión + Fee

  const marginBruto     = totalIngMXN > 0 ? (utilidadBruta / totalIngMXN) * 100 : 0
  const marginOperativo = totalIngMXN > 0 ? (utilidadOperativa / totalIngMXN) * 100 : 0
  const marginNeto      = totalIngMXN > 0 ? (utilidadNeta / totalIngMXN) * 100 : 0
  // % de la utilidad operativa que se lleva Pietro
  const pctPietroOperativa = utilidadOperativa > 0 ? (totalComisionFee / utilidadOperativa) * 100 : 0

  const utilidadOpc  = totalIngOpcTotal - totalCostoOpc
  const hayIngreso   = totalIngMXN   > 0
  const hayIngOpc    = totalIngOpcTotal > 0
  const maxCat = Math.max(...Object.values(catCosto),1)
  const CATS = ['HOSPEDAJE','TRANSPORTE','ACTIVIDADES','ALIMENTOS','GUIA','OTROS']
  const CAT_COLS = {HOSPEDAJE:'#f4a261',TRANSPORTE:'#4361ee',ACTIVIDADES:'#f72585',ALIMENTOS:'#2d6a4f',GUIA:'#9b5de5',OTROS:'#888'}
  const allCatsSet = new Set([...CATS.filter(c=>catCosto[c]||catPaidMXN[c]),
    ...Object.keys(catCosto),...Object.keys(catPaidMXN)])
  const allCats = [...allCatsSet]

  const Card = ({children}) => <div style={{background:'#fff',borderRadius:12,padding:20,boxShadow:'0 2px 16px rgba(18,21,31,.07)',marginBottom:16}}>{children}</div>
  const CH = ({t}) => <h3 style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:15,marginBottom:14,paddingBottom:8,borderBottom:'2px solid #ece7df'}}>{t}</h3>
  const DRow = ({label,val,color,bold,big}) => (
    <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid #f0ebe3',fontSize:big?15:13}}>
      <span style={{color:bold?'#12151f':'#8a8278',fontWeight:bold?700:400}}>{label}</span>
      <span className='num' style={{fontFamily:"'IBM Plex Mono',monospace",fontWeight:bold?700:600,color:color||'#12151f',fontSize:bold?14:13}}>{val}</span>
    </div>
  )
  const selStyle = {border:'1.5px solid #d8d2c8',borderRadius:8,padding:'6px 12px',fontFamily:'inherit',fontSize:12,background:'#fff',cursor:'pointer',outline:'none',color:'#12151f',minWidth:180}

  return (
    <div>
      <h2 style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:26,marginBottom:16}}>📈 Estado de Resultados</h2>

      {/* Selector modo */}
      <div style={{background:'#fff',borderRadius:12,padding:'14px 16px',boxShadow:'0 2px 16px rgba(18,21,31,.07)',marginBottom:20,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        {[['todos','📊 Todos los circuitos'],['mes','📅 Por Mes'],['circuito','🗂 Por Circuito']].map(([id,lbl])=>(
          <button key={id} onClick={()=>setModo(id)}
            style={{padding:'8px 18px',border:'none',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:modo===id?700:500,fontFamily:'inherit',background:modo===id?'#070a12':'#f5f1eb',color:modo===id?'#e0c96a':'#8a8278',transition:'all .15s'}}>
            {lbl}
          </button>
        ))}
        {modo==='mes'&&sortedMonths.length>0&&(
          <select value={mesSel} onChange={e=>setMesSel(e.target.value)} style={selStyle}>
            {sortedMonths.map(mk=><option key={mk} value={mk}>{cap(mk)} ({monthMap[mk]?.length||0} circuitos)</option>)}
          </select>
        )}
        {modo==='circuito'&&circuits.length>0&&(
          <select value={circSel} onChange={e=>setCircSel(e.target.value)} style={selStyle}>
            {circuits.map(c=><option key={c.id} value={c.id}>{c.id.split('-').slice(-3).join('-')}{c.info?.tl?' — '+c.info.tl:''}</option>)}
          </select>
        )}
        <span style={{fontSize:11,color:'#8a8278',marginLeft:'auto'}}>{circsMostrar.length} circuito{circsMostrar.length!==1?'s':''}</span>
      </div>

      {/* KPIs fila */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:12,marginBottom:20}}>
        {(socioMode ? [
          {label:'Circuitos',val:circsMostrar.length,cls:'gold'},
          {label:'👥 PAX',val:totalPax.toLocaleString('es-MX'),cls:'sky'},
          {label:'💰 Cobrado',val:totalIngUSD>0?fmtUSD(totalIngUSD):'—',sub:totalIngUSD>0?fmtMXN(totalIngMXN)+' MN':'Sin capturar',cls:'forest'},
          {label:'📤 Costo',val:fmtMXN(totalCosto)+' MN',cls:'rust'},
          {label:hayIngreso?(utilidadBruta>=0?'✅ Utilidad Bruta':'❌ Pérdida Bruta'):'💡 Utilidad',val:hayIngreso?fmtMXN(Math.abs(utilidadBruta))+' MN':'—',sub:hayIngreso?marginBruto.toFixed(1)+'%':undefined,cls:hayIngreso?(utilidadBruta>=0?'forest':'rust'):'sky'},
          ...(gastosOperativosTotal>0 ? [{label:'🏢 Gastos Op.',val:fmtMXN(gastosOperativosTotal)+' MN',sub:`${fmtMXN(gastosOperativosMxn)}/mes × ${monthsWithCircuits.length}`,cls:'rust'}] : []),
          ...(gastosOperativosTotal>0 ? [{label:hayIngreso?(utilidadOperativa>=0?'✅ Util. Operativa':'❌ Pérd. Operativa'):'💡 Util. Op.',val:hayIngreso?fmtMXN(Math.abs(utilidadOperativa))+' MN':'—',sub:hayIngreso?marginOperativo.toFixed(1)+'%':undefined,cls:hayIngreso?(utilidadOperativa>=0?'forest':'rust'):'sky'}] : []),
          ...(totalComisionFee>0 ? [{label:'👥 Comisión + Fee',val:fmtMXN(totalComisionFee)+' MN',sub:`Pietro (${pctPietroOperativa.toFixed(1)}% util. op.)`,cls:'rust'}] : []),
          {label:hayIngreso?(utilidadNeta>=0?'✅ Utilidad Neta':'❌ Pérdida Neta'):'💡 Util. Neta',val:hayIngreso?fmtMXN(Math.abs(utilidadNeta))+' MN':'—',sub:hayIngreso?marginNeto.toFixed(1)+'%':undefined,cls:hayIngreso?(utilidadNeta>=0?'forest':'rust'):'sky'},
          {label:'✅ Pagado',val:fmtMXN(totalPaidMXN)+' MN',sub:fmtUSD(totalPaidUSD)+' USD',cls:'forest'},
          {label:'⏳ Pendiente',val:fmtMXN(totalPendMXN)+' MN',sub:fmtUSD(totalPendUSD)+' USD',cls:'rust'},
        ] : [
          {label:'Circuitos',val:circsMostrar.length,cls:'gold'},
          {label:'👥 PAX',val:totalPax.toLocaleString('es-MX'),cls:'sky'},
          {label:'💰 Cobrado LIBERO',val:totalIngUSD>0?fmtUSD(totalIngUSD):'—',sub:totalIngUSD>0?fmtMXN(totalIngMXN)+' MN':'Sin capturar',cls:'forest'},
          {label:'💰 Cobrado OPCIONAL',val:(totalIngOpcMXN>0||totalIngOpcUSD>0)?(totalIngOpcMXN>0?fmtMXN(totalIngOpcMXN)+' MN':''):'—',sub:totalIngOpcUSD>0?fmtUSD(totalIngOpcUSD):'Sin capturar',cls:'sky'},
          {label:'📤 Costo LIBERO',val:fmtMXN(totalCosto)+' MN',cls:'rust'},
          {label:'📤 Costo OPCIONAL',val:fmtMXN(totalCostoOpc)+' MN',cls:'rust'},
          {label:hayIngreso?(utilidadBruta>=0?'✅ Util. Bruta':'❌ Pérd. Bruta'):'💡 LIBERO',val:hayIngreso?fmtMXN(Math.abs(utilidadBruta))+' MN':'—',sub:hayIngreso?marginBruto.toFixed(1)+'%':undefined,cls:hayIngreso?(utilidadBruta>=0?'forest':'rust'):'sky'},
          ...(gastosOperativosTotal>0 ? [{label:'🏢 Gastos Op.',val:fmtMXN(gastosOperativosTotal)+' MN',sub:`${fmtMXN(gastosOperativosMxn)}/mes × ${monthsWithCircuits.length}`,cls:'rust'}] : []),
          ...(gastosOperativosTotal>0 ? [{label:hayIngreso?(utilidadOperativa>=0?'✅ Util. Operativa':'❌ Pérd. Operativa'):'💡 Util. Op.',val:hayIngreso?fmtMXN(Math.abs(utilidadOperativa))+' MN':'—',sub:hayIngreso?marginOperativo.toFixed(1)+'%':undefined,cls:hayIngreso?(utilidadOperativa>=0?'forest':'rust'):'sky'}] : []),
          ...(totalComisionFee>0 ? [{label:'👥 Comisión + Fee',val:fmtMXN(totalComisionFee)+' MN',sub:`Pietro (${pctPietroOperativa.toFixed(1)}% util. op.)`,cls:'rust'}] : []),
          {label:hayIngreso?(utilidadNeta>=0?'✅ Util. Neta':'❌ Pérd. Neta'):'💡 Util. Neta',val:hayIngreso?fmtMXN(Math.abs(utilidadNeta))+' MN':'—',sub:hayIngreso?marginNeto.toFixed(1)+'%':undefined,cls:hayIngreso?(utilidadNeta>=0?'forest':'rust'):'sky'},
          {label:hayIngOpc?(utilidadOpc>=0?'✅ Utilidad OPC':'❌ Pérdida OPC'):'💡 OPCIONAL',val:hayIngOpc?fmtMXN(Math.abs(utilidadOpc))+' MN':'—',sub:hayIngOpc&&totalCostoOpc>0?((utilidadOpc/totalIngOpcTotal)*100).toFixed(1)+'%':undefined,cls:hayIngOpc?(utilidadOpc>=0?'forest':'rust'):'sky'},
          {label:'✅ Pagado',val:fmtMXN(totalPaidMXN)+' MN',sub:fmtUSD(totalPaidUSD)+' USD',cls:'forest'},
          {label:'⏳ Pendiente',val:fmtMXN(totalPendMXN)+' MN',sub:fmtUSD(totalPendUSD)+' USD',cls:'rust'},
        ]).map((k,i)=><KPICard key={i} {...k}/>)}
      </div>

      {/* Grid: utilidades lado a lado (UNA columna en Vista Socio) */}
      <div style={{display:'grid',gridTemplateColumns: socioMode ? '1fr' : '1fr 1fr',gap:16,marginBottom:0}}>

        {/* LIBERO */}
        <Card>
          <CH t={socioMode ? "🔵 Circuito — Utilidad" : "🔵 Circuito LIBERO — Utilidad"}/>
          <DRow label="Cobrado al cliente (USD)" val={totalIngUSD>0?fmtUSD(totalIngUSD):'Sin capturar'} color="#1565a0"/>
          {totalIngUSD>0&&<DRow label="Equivalente a pesos mexicanos" val={fmtMXN(totalIngMXN)+' MN'} color="#1565a0"/>}
          <DRow label={socioMode ? "Total Costos" : "Total Costos LIBERO"} val={fmtMXN(totalCosto)+' MN'} color="#b83232"/>
          {hayIngreso&&totalCosto>0&&<>
            {/* UTILIDAD BRUTA = Ingreso − Costos */}
            <DRow label={utilidadBruta>=0?'✅ Utilidad Bruta':'❌ Pérdida Bruta'} val={fmtMXN(Math.abs(utilidadBruta))+' MN'} color={utilidadBruta>=0?'#1e5c3a':'#b83232'} bold big/>
            <DRow label="Margen Bruto" val={`${marginBruto.toFixed(1)}%`} color={utilidadBruta>=0?'#1e5c3a':'#b83232'} bold/>

            {/* Espacio entre secciones */}
            <div style={{height:14}} />

            {/* GASTOS OPERATIVOS (clickeable) */}
            {gastosOperativosTotal>0 ? (
              <DRow
                label={isReadOnly ? (
                  <span>🏢 Gastos Operativos <span style={{fontSize:10,fontWeight:400,color:'#8a8278'}}>({fmtMXN(gastosOperativosMxn)}/mes × {monthsWithCircuits.length} {monthsWithCircuits.length===1?'mes':'meses'})</span></span>
                ) : (
                  <span onClick={onEditGastos} style={{cursor:'pointer',borderBottom:'1px dotted #b8952a'}} title="Click para editar gastos operativos">🏢 Gastos Operativos <span style={{fontSize:10,fontWeight:400,color:'#8a8278'}}>({fmtMXN(gastosOperativosMxn)}/mes × {monthsWithCircuits.length} {monthsWithCircuits.length===1?'mes':'meses'})</span> <span style={{fontSize:10,color:'#b8952a'}}>✎</span></span>
                )}
                val={'−'+fmtMXN(gastosOperativosTotal)+' MN'}
                color="#a05a00"
              />
            ) : (
              !isReadOnly && (
                <DRow
                  label={<span onClick={onEditGastos} style={{cursor:'pointer',borderBottom:'1px dotted #b8952a',color:'#8a8278'}} title="Click para capturar gastos operativos">🏢 Gastos Operativos <span style={{fontSize:10,color:'#b8952a'}}>✎ clic para capturar</span></span>}
                  val={<span style={{color:'#ccc'}}>—</span>}
                  color="#8a8278"
                />
              )
            )}

            {/* UTILIDAD OPERATIVA = Util. Bruta − Gastos Op */}
            {gastosOperativosTotal>0 && <>
              <DRow label={utilidadOperativa>=0?'✅ Utilidad Operativa':'❌ Pérdida Operativa'} val={fmtMXN(Math.abs(utilidadOperativa))+' MN'} color={utilidadOperativa>=0?'#1e5c3a':'#b83232'} bold big/>
              <DRow label="Margen Operativo" val={`${marginOperativo.toFixed(1)}%`} color={utilidadOperativa>=0?'#1e5c3a':'#b83232'} bold/>
            </>}

            {/* Espacio antes de Pietro */}
            {(totalComision>0 || feeMensualMXN>0) && <div style={{height:14}} />}

            {/* BLOQUE COMISIÓN + FEE PIETRO (resumen con sub-líneas indentadas) */}
            {(totalComision>0 || feeMensualMXN>0) && <>
              <DRow
                label={<span style={{fontWeight:600}}>👥 Comisión + Fee Mensual</span>}
                val={<span style={{fontWeight:700}}>−{fmtMXN(totalComisionFee)} MN</span>}
                color="#a05a00"
              />
              {totalComision>0 && (
                <div style={{display:'flex',justifyContent:'space-between',padding:'4px 0 4px 24px',fontSize:12,color:'#8a8278'}}>
                  <span>Comisión Pietro <span style={{fontSize:10}}>(% sobre ingreso)</span></span>
                  <span>−{fmtMXN(totalComision)} MN</span>
                </div>
              )}
              {feeMensualMXN>0 && (
                <div style={{display:'flex',justifyContent:'space-between',padding:'4px 0 4px 24px',fontSize:12,color:'#8a8278'}}>
                  <span>💼 Fee Mensual <span style={{fontSize:10}}>(€{pietroFeeEur} × {monthsWithCircuits.length} {monthsWithCircuits.length===1?'mes':'meses'} × {tcEur.toFixed(2)})</span></span>
                  <span>−{fmtMXN(feeMensualMXN)} MN</span>
                </div>
              )}
            </>}

            {/* UTILIDAD NETA = Util. Operativa − Comisión − Fee */}
            {(totalComision>0 || feeMensualMXN>0) && <>
              <DRow label={utilidadNeta>=0?'✅ Utilidad Neta':'❌ Pérdida Neta'} val={fmtMXN(Math.abs(utilidadNeta))+' MN'} color={utilidadNeta>=0?'#1e5c3a':'#b83232'} bold big/>
              <DRow label="Margen Neto" val={`${marginNeto.toFixed(1)}%`} color={utilidadNeta>=0?'#1e5c3a':'#b83232'} bold/>
            </>}
          </>}
          {!hayIngreso&&<p style={{fontSize:12,color:'#8a8278',marginTop:10}}>⚠️ Captura el importe cobrado en cada circuito.</p>}
        </Card>

        {/* OPCIONAL — oculto en Vista Socio */}
        {!socioMode && (
        <Card>
          <CH t="🔷 Opcionales — Utilidad"/>
          {totalIngOpcMXN>0&&<DRow label="Ingresos opcionales MXN" val={fmtMXN(totalIngOpcMXN)+' MN'} color="#1565a0"/>}
          {totalIngOpcUSD>0&&<DRow label="Ingresos opcionales USD" val={fmtUSD(totalIngOpcUSD)} color="#1565a0"/>}
          {(totalIngOpcMXN>0||totalIngOpcUSD>0)&&<DRow label="Total ingresos opcionales (MN)" val={fmtMXN(totalIngOpcTotal)+' MN'} color="#1565a0"/>}
          <DRow label="Total Costos OPCIONAL" val={fmtMXN(totalCostoOpc)+' MN'} color="#b83232"/>
          {hayIngOpc&&totalCostoOpc>0&&<>
            <DRow label={utilidadOpc>=0?'✅ Utilidad OPCIONAL':'❌ Pérdida OPCIONAL'} val={fmtMXN(Math.abs(utilidadOpc))+' MN'} color={utilidadOpc>=0?'#1e5c3a':'#b83232'} bold big/>
            <DRow label="Margen OPCIONAL" val={`${((utilidadOpc/totalIngOpcTotal)*100).toFixed(1)}%`} color={utilidadOpc>=0?'#1e5c3a':'#b83232'} bold/>
          </>}
          {!hayIngOpc&&<p style={{fontSize:12,color:'#8a8278',marginTop:10}}>⚠️ Captura los ingresos opcionales en cada circuito.</p>}
        </Card>
        )}
      </div>

      {/* Distribución categorías + proveedores — solo en modo normal */}
      {!socioMode && (
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:16}}>
        <Card>
          <CH t="📊 Distribución por Categoría"/>
          {(totalCosto+totalCostoOpc)===0
            ? <p style={{color:'#8a8278',fontSize:12}}>Sin costos capturados.</p>
            : allCats.map(cat=>{
                const v=catCosto[cat]||0; if(!v) return null
                return (
                  <div key={cat} style={{marginBottom:11}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                      <span style={{fontWeight:600}}>{cat}</span>
                      <span style={{fontWeight:600}}>{fmtMXN(v)} MN <span style={{color:'#8a8278',fontWeight:400}}>({(((v)/(totalCosto+totalCostoOpc))*100).toFixed(1)}%)</span></span>
                    </div>
                    <div style={{background:'#ece7df',borderRadius:4,height:7,overflow:'hidden'}}>
                      <div style={{height:'100%',width:((v/maxCat)*100)+'%',background:CAT_COLS[cat]||'#888',borderRadius:4}}/>
                    </div>
                  </div>
                )
              })
          }
        </Card>

        {/* Proveedores ranking */}
        <Card>
          <CH t="🏢 Top Proveedores"/>
          {(() => {
            const pm={}
            circsMostrar.forEach(circ=>{
              circ.rows.forEach(r=>{
                const p=r.prov_general; if(!p) return
                const k=(p||'').toUpperCase().trim()
                if(!pm[k]) pm[k]={nombre:p,totalMXN:0,totalUSD:0,paidMXN:0,paidUSD:0,pendMXN:0,pendUSD:0,servicios:0}
                const {mxn,usd}=getImporte(r,circ.info,tarifario)
                pm[k].totalMXN+=mxn;pm[k].totalUSD+=usd;pm[k].servicios++
                if(r.paid){pm[k].paidMXN+=mxn;pm[k].paidUSD+=usd}else{pm[k].pendMXN+=mxn;pm[k].pendUSD+=usd}
              })
            })
            const provs=Object.values(pm).map(p=>({...p,eq:p.totalMXN+p.totalUSD*TC})).filter(p=>p.eq>0).sort((a,b)=>b.eq-a.eq).slice(0,8)
            if(!provs.length) return <p style={{color:'#8a8278',fontSize:12}}>Sin datos.</p>
            const maxEq=provs[0].eq
            return provs.map((p,i)=>{
              const pctP=p.eq>0?Math.round(((p.paidMXN+p.paidUSD*TC)/p.eq)*100):0
              return (
                <div key={p.nombre} style={{display:'grid',gridTemplateColumns:'20px 1fr 80px 55px',gap:8,alignItems:'center',padding:'7px 8px',borderRadius:7,background:i%2===0?'#fafaf8':'#fff',border:'1px solid #f0ebe3',marginBottom:5}}>
                  <span style={{fontSize:11,fontWeight:800,color:i<3?'#b8952a':'#ccc',textAlign:'center'}}>#{i+1}</span>
                  <div>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                      <span style={{fontSize:11,fontWeight:700}}>{p.nombre}</span>
                      <span style={{fontSize:9,color:'#8a8278'}}>{p.servicios} svc</span>
                    </div>
                    <div style={{background:'#ece7df',borderRadius:3,height:5,overflow:'hidden'}}>
                      <div style={{height:'100%',width:((p.eq/maxEq)*100)+'%',background:pctP===100?'#52b788':'#b8952a',borderRadius:3}}/>
                    </div>
                  </div>
                  <div style={{textAlign:'right',fontSize:10}}>
                    {p.pendMXN>0&&<div style={{color:'#b83232',fontWeight:700}}>{fmtMXN(p.pendMXN)} MN</div>}
                    {p.pendUSD>0&&<div style={{color:'#b83232',fontWeight:700}}>{fmtUSD(p.pendUSD)}</div>}
                    {p.pendMXN===0&&p.pendUSD===0&&<div style={{color:'#52b788',fontWeight:700}}>Liquidado ✓</div>}
                  </div>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontSize:13,fontWeight:800,color:pctP===100?'#1e5c3a':'#12151f'}}>{pctP}%</div>
                    <div style={{fontSize:9,color:'#8a8278'}}>pagado</div>
                  </div>
                </div>
              )
            })
          })()}
        </Card>
      </div>
      )}

      {/* Desglose por circuito — solo en modo normal */}
      {!socioMode && circsMostrar.length>0&&(
        <div style={{background:'#fff',borderRadius:12,padding:20,boxShadow:'0 2px 16px rgba(18,21,31,.07)',marginTop:16}}>
          <CH t="🗂 Desglose por Circuito"/>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{background:'#070a12',color:'#fff'}}>
                  {(socioMode
                    ? ['Circuito','Tour Leader','PAX','Svc','Cobrado (USD)','Equiv. MN','Costo','Comisión','Util/Pérd Bruta','% Pagado']
                    : ['Circuito','Tour Leader','PAX','Svc','Cobrado LIB (USD)','Equiv. MN','Costo LIB','Util/Pérd LIB','Ing. OPC MN','Ing. OPC USD','Costo OPC','Util/Pérd OPC','% Pagado']
                  ).map(h=>(
                    <th key={h} style={{padding:'9px 10px',textAlign:'left',fontSize:9,textTransform:'uppercase',letterSpacing:.5,whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {circsMostrar.map((circ,i)=>{
                  const T=calcCircTotals(circ,tarifario,TC)
                  const liberoRows = circ.rows.filter(r=>(r.tipo||'').toString().toUpperCase().trim()!=='OPCIONAL')
                  const visibleRows = socioMode ? liberoRows : circ.rows
                  const paid = visibleRows.filter(r=>r.paid).length
                  const pct = visibleRows.length>0?Math.round((paid/visibleRows.length)*100):0
                  const hLib=T.ingresoMXN>0; const hOpc=T.ingresoOpcTotal>0
                  return (
                    <tr key={circ.id} style={{borderBottom:'1px solid #ece7df',background:i%2===0?'#fafaf8':'#fff'}}>
                      <td style={{padding:'8px 10px',fontWeight:700,fontSize:10}}>{circ.id.split('-').slice(-3).join('-')}</td>
                      <td style={{padding:'8px 10px',fontSize:11}}>{circ.info?.tl||'—'}</td>
                      <td style={{padding:'8px 10px'}}>{circ.info?.pax||'—'}</td>
                      <td style={{padding:'8px 10px'}}>{visibleRows.length}</td>
                      <td style={{padding:'8px 10px',fontWeight:700,color:'#1565a0'}}>{hLib?fmtUSD(circ.importe_cobrado):<span style={{color:'#ccc',fontSize:10}}>—</span>}</td>
                      <td style={{padding:'8px 10px',color:'#1e5c3a'}}>{hLib?fmtMXN(T.ingresoMXN)+' MN':<span style={{color:'#ccc',fontSize:10}}>—</span>}</td>
                      <td style={{padding:'8px 10px',fontWeight:700,color:'#b83232'}}>{T.costoTotal>0?fmtMXN(T.costoTotal)+' MN':'—'}</td>
                      {socioMode ? (<>
                        <td style={{padding:'8px 10px',color:'#a05a00',fontWeight:600}}>{T.commissionPct>0?<><span style={{fontSize:10,color:'#8a8278'}}>{T.commissionPct}%</span> −{fmtMXN(T.comision)}</>:<span style={{color:'#ccc',fontSize:10}}>—</span>}</td>
                        <td style={{padding:'8px 10px'}}>{hLib?<span style={{fontWeight:700,color:T.utilidadNeta>=0?'#1e5c3a':'#b83232'}}>{T.utilidadNeta>=0?'✅':'❌'} {fmtMXN(Math.abs(T.utilidadNeta))} MN</span>:<span style={{color:'#ccc',fontSize:10}}>—</span>}</td>
                      </>) : (<>
                        <td style={{padding:'8px 10px'}}>{hLib?<span style={{fontWeight:700,color:T.utilidad>=0?'#1e5c3a':'#b83232'}}>{T.utilidad>=0?'✅':'❌'} {fmtMXN(Math.abs(T.utilidad))} MN</span>:<span style={{color:'#ccc',fontSize:10}}>—</span>}</td>
                        <td style={{padding:'8px 10px',color:'#1565a0'}}>{T.ingresoOpcMXN>0?fmtMXN(T.ingresoOpcMXN)+' MN':<span style={{color:'#ccc',fontSize:10}}>—</span>}</td>
                        <td style={{padding:'8px 10px',color:'#1565a0'}}>{T.ingresoOpcUSD>0?fmtUSD(T.ingresoOpcUSD):<span style={{color:'#ccc',fontSize:10}}>—</span>}</td>
                        <td style={{padding:'8px 10px',fontWeight:700,color:'#b83232'}}>{T.costoOpcTotal>0?fmtMXN(T.costoOpcTotal)+' MN':'—'}</td>
                        <td style={{padding:'8px 10px'}}>{hOpc?<span style={{fontWeight:700,color:T.utilidadOpc>=0?'#1e5c3a':'#b83232'}}>{T.utilidadOpc>=0?'✅':'❌'} {fmtMXN(Math.abs(T.utilidadOpc))} MN</span>:<span style={{color:'#ccc',fontSize:10}}>—</span>}</td>
                      </>)}
                      <td style={{padding:'8px 10px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:5}}>
                          <div style={{flex:1,height:5,background:'#ece7df',borderRadius:3,overflow:'hidden',minWidth:40}}>
                            <div style={{height:'100%',width:pct+'%',background:pct===100?'#52b788':'#b8952a',borderRadius:3}}/>
                          </div>
                          <span style={{fontSize:11,fontWeight:600}}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════ Vista Socio: 3 secciones ejecutivas (Indicadores / Tendencia / Resumen) ════ */}
      {socioMode && circsMostrar.length>0 && (
        <>
          {/* Indicadores clave */}
          <div style={{marginTop:16}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
              <KPICard cls="sky" label="👥 PAX totales" val={totalPax.toLocaleString('es-MX')} sub={`${circsMostrar.length} circuitos`} />
              <KPICard cls="forest" label="💵 Utilidad promedio/circuito" val={fmtMXN(avgUtilPerCircuit)+' MN'} sub={hayIngreso ? null : 'Sin ingreso capturado'} />
              <KPICard cls="gold" label="📊 Margen promedio" val={hayIngreso ? avgMargin.toFixed(1)+'%' : '—'} sub={hayIngreso ? 'sobre ingreso' : null} />
              <KPICard cls="forest" label="🏆 Mejor mes" val={bestMonth ? cap(bestMonth) : '—'} sub={bestMonth ? fmtMXN(byMonth[bestMonth].utilidadBruta)+' MN' : null} />
            </div>
          </div>

          {/* Gráfica de pastel: Reparto de Utilidad Operativa (Pietro vs Nosotros) */}
          {utilidadOperativa > 0 && (totalComisionFee > 0 || true) && (
            <div style={{background:'#fff',borderRadius:12,padding:20,boxShadow:'0 2px 16px rgba(18,21,31,.07)',marginTop:16}}>
              <CH t="🥧 Reparto de la Utilidad Operativa"/>
              <p style={{ color: '#8a8278', fontSize: 12, marginBottom: 12 }}>
                De la Utilidad Operativa ({fmtMXN(utilidadOperativa)} MN), cuánto se va a la comisión + fee de Pietro y cuánto queda como Utilidad Neta.
              </p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,alignItems:'center'}}>
                <div style={{height:280}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Comisión + Fee Pietro', value: Math.max(0, totalComisionFee), color: '#a05a00' },
                          { name: 'Utilidad Neta (Viajes Libero)', value: Math.max(0, utilidadNeta), color: '#1e5c3a' },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        cx="50%" cy="50%"
                        innerRadius={50}
                        outerRadius={100}
                        paddingAngle={2}
                        label={({ percent }) => `${(percent * 100).toFixed(1)}%`}
                        labelLine={false}
                      >
                        <Cell fill="#a05a00"/>
                        <Cell fill="#1e5c3a"/>
                      </Pie>
                      <Tooltip formatter={(value) => fmtMXN(value)+' MN'} contentStyle={{borderRadius:8,border:'1px solid #d8d2c8',fontSize:12}}/>
                      <Legend wrapperStyle={{fontSize:12}} verticalAlign="bottom" iconType="circle"/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                  <div style={{padding:14,background:'#fff5e8',border:'1px solid #f0c97f',borderRadius:10}}>
                    <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:.5,color:'#7d5a00'}}>👥 Pietro</div>
                    <div style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:24,fontWeight:700,color:'#a05a00',marginTop:4}}>
                      {fmtMXN(totalComisionFee)} <span style={{fontSize:13,fontWeight:600,color:'#8a8278'}}>MN</span>
                    </div>
                    <div style={{fontSize:11,color:'#8a8278',marginTop:2}}>
                      {pctPietroOperativa.toFixed(1)}% de la utilidad operativa
                    </div>
                    <div style={{fontSize:10,color:'#8a8278',marginTop:6}}>
                      = {fmtMXN(totalComision)} comisión + {fmtMXN(feeMensualMXN)} fee
                    </div>
                  </div>
                  <div style={{padding:14,background:'#f0faf4',border:'1px solid #95d5b2',borderRadius:10}}>
                    <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:.5,color:'#1e5c3a'}}>✅ Viajes Libero (Utilidad Neta)</div>
                    <div style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:24,fontWeight:700,color:'#1e5c3a',marginTop:4}}>
                      {fmtMXN(utilidadNeta)} <span style={{fontSize:13,fontWeight:600,color:'#8a8278'}}>MN</span>
                    </div>
                    <div style={{fontSize:11,color:'#8a8278',marginTop:2}}>
                      {(100 - pctPietroOperativa).toFixed(1)}% de la utilidad operativa
                    </div>
                    <div style={{fontSize:10,color:'#8a8278',marginTop:6}}>
                      Margen Neto sobre ingreso: {marginNeto.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Resumen por mes */}
          <div style={{background:'#fff',borderRadius:12,padding:20,boxShadow:'0 2px 16px rgba(18,21,31,.07)',marginTop:16}}>
            <CH t="📋 Resumen por mes"/>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr style={{background:'#070a12',color:'#fff'}}>
                    {(() => {
                      const cols = ['Mes','Circuitos','PAX','Cobrado','Costo','Utilidad Bruta']
                      if (gastosOperativosTotal>0) { cols.push('Gastos Operativos'); cols.push('Utilidad Operativa') }
                      cols.push('Comisión Pietro')
                      if (feeMensualMXN>0) cols.push('Fee Mensual')
                      cols.push('Utilidad Neta')
                      cols.push('Margen Neto')
                      return cols
                    })().map(h=>(
                      <th key={h} style={{padding:'10px 12px',textAlign:'left',fontSize:10,textTransform:'uppercase',letterSpacing:.5,whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthsOrdered.map((mk,i) => {
                    const m = byMonth[mk]
                    const feeMes = (mk && mk !== 'Sin mes') ? (pietroFeeEur || 0) * (tcEur || 0) : 0
                    const gastosMes = (mk && mk !== 'Sin mes') ? (gastosOperativosMxn || 0) : 0
                    const utilBrutaMes = m.ingreso - m.costo  // sin Pietro, sin Gastos Op
                    const utilOperativaMes = utilBrutaMes - gastosMes
                    const comisionFeeMes = m.comision + feeMes
                    const utilNetaMes = utilOperativaMes - comisionFeeMes
                    const margenNetoMes = m.ingreso > 0 ? (utilNetaMes / m.ingreso) * 100 : null
                    return (
                      <tr key={mk} style={{borderBottom:'1px solid #ece7df',background:i%2===0?'#fafaf8':'#fff'}}>
                        <td style={{padding:'10px 12px',fontWeight:700,textTransform:'capitalize'}}>{cap(mk)}</td>
                        <td style={{padding:'10px 12px'}}>{m.circuits}</td>
                        <td style={{padding:'10px 12px'}}>{m.pax.toLocaleString('es-MX')}</td>
                        <td style={{padding:'10px 12px',color:'#1565a0',fontWeight:600}}>{m.ingreso>0 ? fmtMXN(m.ingreso)+' MN' : <span style={{color:'#ccc',fontSize:11}}>—</span>}</td>
                        <td style={{padding:'10px 12px',color:'#b83232',fontWeight:600}}>{fmtMXN(m.costo)+' MN'}</td>
                        <td style={{padding:'10px 12px',fontWeight:700,color:utilBrutaMes>=0?'#1e5c3a':'#b83232'}}>
                          {m.ingreso>0 ? <>{utilBrutaMes>=0?'✅':'❌'} {fmtMXN(Math.abs(utilBrutaMes))} MN</> : <span style={{color:'#ccc',fontSize:11,fontWeight:400}}>—</span>}
                        </td>
                        {gastosOperativosTotal>0 && (
                          <td style={{padding:'10px 12px',color:'#a05a00'}}>{gastosMes>0 ? '−'+fmtMXN(gastosMes)+' MN' : <span style={{color:'#ccc',fontSize:11}}>—</span>}</td>
                        )}
                        {gastosOperativosTotal>0 && (
                          <td style={{padding:'10px 12px',fontWeight:700,color:utilOperativaMes>=0?'#1e5c3a':'#b83232'}}>
                            {m.ingreso>0 ? <>{utilOperativaMes>=0?'✅':'❌'} {fmtMXN(Math.abs(utilOperativaMes))} MN</> : <span style={{color:'#ccc',fontSize:11,fontWeight:400}}>—</span>}
                          </td>
                        )}
                        <td style={{padding:'10px 12px',color:'#a05a00'}}>{m.comision>0 ? '−'+fmtMXN(m.comision)+' MN' : <span style={{color:'#ccc',fontSize:11}}>—</span>}</td>
                        {feeMensualMXN>0 && (
                          <td style={{padding:'10px 12px',color:'#a05a00'}}>{feeMes>0 ? '−'+fmtMXN(feeMes)+' MN' : <span style={{color:'#ccc',fontSize:11}}>—</span>}</td>
                        )}
                        <td style={{padding:'10px 12px',fontWeight:700,color:utilNetaMes>=0?'#1e5c3a':'#b83232'}}>
                          {m.ingreso>0 ? <>{utilNetaMes>=0?'✅':'❌'} {fmtMXN(Math.abs(utilNetaMes))} MN</> : <span style={{color:'#ccc',fontSize:11,fontWeight:400}}>—</span>}
                        </td>
                        <td style={{padding:'10px 12px',fontWeight:600,color:margenNetoMes!==null ? (margenNetoMes>=0?'#1e5c3a':'#b83232') : '#ccc'}}>
                          {margenNetoMes!==null ? margenNetoMes.toFixed(1)+'%' : '—'}
                        </td>
                      </tr>
                    )
                  })}
                  {/* Fila de total */}
                  <tr style={{borderTop:'2px solid #121512',background:'#f5f3ef',fontWeight:700}}>
                    <td style={{padding:'12px',fontSize:12,textTransform:'uppercase',letterSpacing:.5}}>Total</td>
                    <td style={{padding:'12px'}}>{circsMostrar.length}</td>
                    <td style={{padding:'12px'}}>{totalPax.toLocaleString('es-MX')}</td>
                    <td style={{padding:'12px',color:'#1565a0'}}>{fmtMXN(totalIngMXN)+' MN'}</td>
                    <td style={{padding:'12px',color:'#b83232'}}>{fmtMXN(totalCosto)+' MN'}</td>
                    <td style={{padding:'12px',color:utilidadBruta>=0?'#1e5c3a':'#b83232'}}>{hayIngreso ? <>{utilidadBruta>=0?'✅':'❌'} {fmtMXN(Math.abs(utilidadBruta))} MN</> : '—'}</td>
                    {gastosOperativosTotal>0 && (
                      <td style={{padding:'12px',color:'#a05a00'}}>{'−'+fmtMXN(gastosOperativosTotal)+' MN'}</td>
                    )}
                    {gastosOperativosTotal>0 && (
                      <td style={{padding:'12px',color:utilidadOperativa>=0?'#1e5c3a':'#b83232'}}>{hayIngreso ? <>{utilidadOperativa>=0?'✅':'❌'} {fmtMXN(Math.abs(utilidadOperativa))} MN</> : '—'}</td>
                    )}
                    <td style={{padding:'12px',color:'#a05a00'}}>{totalComision>0 ? '−'+fmtMXN(totalComision)+' MN' : '—'}</td>
                    {feeMensualMXN>0 && (
                      <td style={{padding:'12px',color:'#a05a00'}}>{'−'+fmtMXN(feeMensualMXN)+' MN'}</td>
                    )}
                    <td style={{padding:'12px',color:utilidadNeta>=0?'#1e5c3a':'#b83232'}}>{hayIngreso ? <>{utilidadNeta>=0?'✅':'❌'} {fmtMXN(Math.abs(utilidadNeta))} MN</> : '—'}</td>
                    <td style={{padding:'12px',color:hayIngreso ? (marginNeto>=0?'#1e5c3a':'#b83232') : '#ccc'}}>{hayIngreso ? marginNeto.toFixed(1)+'%' : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Helpers de celda para tabla de presentación ──
function Num({ v, color, bold }) {
  if (!v) return <td style={{padding:'14px 14px',color:'rgba(255,255,255,.25)',fontSize:14,fontFamily:"'IBM Plex Mono',monospace"}}>—</td>
  const [num, ...rest] = v.split(' ')
  return (
    <td style={{padding:'14px 14px',fontFamily:"'IBM Plex Mono',monospace",fontSize:14,color:color||'#fff',fontWeight:bold?700:500}}>
      <span>{num}</span>
      {rest.length>0&&<span style={{fontSize:11,color:'rgba(255,255,255,.45)',marginLeft:4,fontWeight:400}}>{rest.join(' ')}</span>}
    </td>
  )
}
function Pct({ v, color, bold }) {
  return <td style={{padding:'14px 14px',fontSize:14,color:color||'#fff',fontWeight:bold?700:500}}>{v||'—'}</td>
}

// ═══════════════════════════════════════════════
//  MODO PRESENTACIÓN
// ═══════════════════════════════════════════════

function Chip({ k, onOpen, w }) {
  return (
    <div onClick={k.id?()=>onOpen(k.id):undefined}
      style={{background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:16,padding:'20px 24px',cursor:k.id?'pointer':'default',transition:'border-color .15s,background .15s',width:w?w+'px':undefined}}
      onMouseEnter={e=>{if(k.id){e.currentTarget.style.borderColor='rgba(224,201,106,.5)';e.currentTarget.style.background='rgba(255,255,255,.1)'}}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,.1)';e.currentTarget.style.background='rgba(255,255,255,.06)'}}>
      <div style={{fontSize:11,textTransform:'uppercase',letterSpacing:1,color:'rgba(255,255,255,.4)',marginBottom:8,display:'flex',justifyContent:'space-between'}}>
        <span>{k.label}</span>
        {k.id&&<span style={{color:'rgba(224,201,106,.4)',fontSize:10}}>ver detalle ↗</span>}
      </div>
      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:22,fontWeight:700,color:k.green===false?'#fca5a5':k.green?'#86efac':'#e0c96a'}}>{k.val}</div>
      {k.sub&&<div style={{fontSize:12,color:'rgba(255,255,255,.4)',marginTop:4}}>{k.sub}</div>}
    </div>
  )
}

function PresentacionMode({ circuits, monthMap, sortedMonths, tarifario, TC, socioMode, onClose }) {
  const MESES_NOM = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const [slide, setSlide] = useState(0)
  const [kpiModal, setKpiModal] = useState(null)
  const [mesExpandido, setMesExpandido] = useState(null)
  const [mesDe, setMesDe] = useState(sortedMonths[0] || '')
  const [mesA,  setMesA]  = useState(sortedMonths[sortedMonths.length-1] || '')

  // Filtrar circuitos en el rango seleccionado (comparación cronológica)
  const _sDe = monthKeySortable(mesDe), _sA = monthKeySortable(mesA)
  const mesesRango = sortedMonths.filter(mk => {
    const s = monthKeySortable(mk)
    return s >= _sDe && s <= _sA
  })
  const circsMostrar = mesesRango.flatMap(mk => monthMap[mk] || [])

  // Acumular totales
  let totIngUSD=0, totIngMXN=0, totCostoLib=0, totIngOpcMXN=0, totIngOpcUSD=0, totCostoOpc=0
  const catCosto = {}
  const provMap = {}
  const porMes = {}
  const CAT_COLORS_PRES = {HOSPEDAJE:'#f4a261',TRANSPORTE:'#4361ee',ACTIVIDADES:'#f72585',ALIMENTOS:'#2d6a4f',GUIA:'#9b5de5',OTROS:'#888'}

  circsMostrar.forEach(c => {
    const T = calcCircTotals(c, tarifario, TC)
    totIngUSD    += c.importe_cobrado || 0
    totIngMXN    += T.ingresoMXN
    totCostoLib  += T.costoTotal
    totIngOpcMXN += T.ingresoOpcMXN
    totIngOpcUSD += T.ingresoOpcUSD
    totCostoOpc  += T.costoOpcTotal

    const mk = c.month_key || 'Sin mes'
    if (!porMes[mk]) porMes[mk] = { ingMXN:0, costoLib:0, utilLib:0, ingOpc:0, costoOpc:0, utilOpc:0, circs:0 }
    porMes[mk].ingMXN   += T.ingresoMXN
    porMes[mk].costoLib += T.costoTotal
    porMes[mk].utilLib  += T.utilidad
    porMes[mk].ingOpc   += T.ingresoOpcTotal
    porMes[mk].costoOpc += T.costoOpcTotal
    porMes[mk].utilOpc  += T.utilidadOpc
    porMes[mk].circs    += 1

    c.rows.forEach(r => {
      const {mxn, usd} = getImporte(r, c.info, tarifario)
      const v = mxn + usd * TC
      const cat = (r.clasificacion||'OTROS').toUpperCase()
      catCosto[cat] = (catCosto[cat]||0) + v
      const pn = (r.prov_general||'').toUpperCase()
      if (pn) {
        if (!provMap[pn]) provMap[pn] = { nombre: r.prov_general, total: 0 }
        provMap[pn].total += v
      }
    })
  })

  const ingOpcTotal = totIngOpcMXN + totIngOpcUSD * TC
  const utilLib = totIngMXN - totCostoLib
  const utilOpc = ingOpcTotal - totCostoOpc
  const margenLib = totIngMXN > 0 ? ((utilLib/totIngMXN)*100).toFixed(1) : '—'
  const margenOpc = ingOpcTotal > 0 ? ((utilOpc/ingOpcTotal)*100).toFixed(1) : '—'

  const totPax = circsMostrar.reduce((a,c)=>a+(parseInt(c.info?.pax)||0),0)
  const topProvs = Object.values(provMap).sort((a,b)=>b.total-a.total).slice(0,6)
  const maxProv = topProvs[0]?.total || 1
  const maxCat = Math.max(...Object.values(catCosto), 1)
  const totalCat = Object.values(catCosto).reduce((a,v)=>a+v, 0) || 1

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setSlide(s => Math.min(s+1, 4))
      if (e.key === 'ArrowLeft')  setSlide(s => Math.max(s-1, 0))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const SLIDES = ['Resumen Ejecutivo','LIBERO vs OPCIONAL','Comparativo por Mes','Distribución por Categoría','Top Proveedores']
  const N = (v, gold) => <span style={{fontFamily:"'IBM Plex Mono',monospace",color:gold?'#e0c96a':'#fff',fontWeight:700}}>{v}</span>

  const mkLabel = (mk) => {
    if (!mk) return ''
    const parts = mk.split(' ')
    return cap(parts[0]) + (parts[2] ? ' '+parts[2] : '')
  }

  const selStyle = {background:'#1a1d26',border:'1px solid rgba(255,255,255,.25)',color:'#fff',borderRadius:8,padding:'6px 12px',fontFamily:'inherit',fontSize:13,cursor:'pointer',outline:'none'}

  // ── SLIDES ──
  const renderSlide = () => {
    switch(slide) {
      case 0: return (
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',flex:1,gap:40}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:13,letterSpacing:3,textTransform:'uppercase',color:'rgba(255,255,255,.4)',marginBottom:12}}>Reporte Trimestral</div>
            <h1 style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:56,fontWeight:700,color:'#fff',margin:0,lineHeight:1.1}}>
              {mkLabel(mesDe)} {mesDe===mesA?'':' — '+mkLabel(mesA)}
            </h1>
            <div style={{fontSize:16,color:'rgba(255,255,255,.4)',marginTop:8}}>{circsMostrar.length} circuitos operados</div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:16,width:'100%',maxWidth:980}}>
            {/* Fila 1: 2 chips centrados */}
            <div style={{display:'flex',justifyContent:'center',gap:24}}>
              {[
                {id:'circuitos', label:'No. Circuitos', val: circsMostrar.length, sub: mesesRango.length+' mes'+(mesesRango.length!==1?'es':'')},
                {id:'pax',       label:'No. PAX',       val: totPax+' PAX',        sub: circsMostrar.length+' circuitos'},
              ].map((k,i)=>(
                <Chip key={i} k={k} onOpen={id=>{setKpiModal(id);setMesExpandido(null)}} w={280}/>
              ))}
            </div>
            {/* Fila 2: LIBERO */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}>
              {[
                {id:'ing_lib',  label:'Ingresos LIBERO',  val: fmtUSD(totIngUSD)+' USD', sub: fmtMXN(totIngMXN)+' MN'},
                {id:'costos',   label:'Costos LIBERO',     val: fmtMXN(totCostoLib)+' MN', sub:''},
                {id:'util_lib', label:'Utilidad LIBERO',   val: fmtMXN(Math.abs(utilLib))+' MN', sub:'Margen: '+margenLib+'%', green: utilLib>=0},
              ].map((k,i)=><Chip key={i} k={k} onOpen={id=>{setKpiModal(id);setMesExpandido(null)}}/>)}
            </div>
            {/* Fila 3: OPCIONAL */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}>
              {[
                {id:'ing_opc',  label:'Ingresos OPCIONAL', val: totIngOpcMXN>0||totIngOpcUSD>0 ? fmtMXN(totIngOpcMXN)+' MN'+(totIngOpcUSD>0?' · '+fmtUSD(totIngOpcUSD)+' USD':'') : '—', sub:''},
                {id:'costos_opc',label:'Costos OPCIONAL',  val: fmtMXN(totCostoOpc)+' MN', sub:''},
                {id:'util_opc', label:'Utilidad OPCIONAL', val: fmtMXN(Math.abs(utilOpc))+' MN', sub:'Margen: '+margenOpc+'%', green: utilOpc>=0},
              ].map((k,i)=><Chip key={i} k={k} onOpen={id=>{setKpiModal(id);setMesExpandido(null)}}/>)}
            </div>
          </div>
        </div>
      )

      case 1: return (
        <div style={{display:'flex',flexDirection:'column',flex:1,justifyContent:'center',gap:32}}>
          <h2 style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:38,fontWeight:700,color:'#fff',margin:0,textAlign:'center'}}>LIBERO vs OPCIONAL</h2>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:32}}>
            {[
              {title:'🔵 Circuito LIBERO', color:'#60a5fa',
               rows:[
                 ['Cobrado al cliente (USD)', fmtUSD(totIngUSD)],
                 ['Equivalente MN', fmtMXN(totIngMXN)],
                 ['Costo LIBERO', fmtMXN(totCostoLib)],
                 ['Utilidad', fmtMXN(Math.abs(utilLib))+' MN'],
                 ['Margen', margenLib+'%'],
               ]},
              {title:'🔷 Opcionales', color:'#a78bfa',
               rows:[
                 ['Ingresos MXN', fmtMXN(totIngOpcMXN)],
                 ['Ingresos USD', totIngOpcUSD>0?fmtUSD(totIngOpcUSD):'—'],
                 ['Costo OPCIONAL', fmtMXN(totCostoOpc)],
                 ['Utilidad', fmtMXN(Math.abs(utilOpc))+' MN'],
                 ['Margen', margenOpc+'%'],
               ]},
            ].map(panel => (
              <div key={panel.title} style={{background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',borderRadius:16,padding:28}}>
                <div style={{fontSize:20,fontWeight:700,color:panel.color,marginBottom:20}}>{panel.title}</div>
                {panel.rows.map(([l,v],i) => (
                  <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,.07)',fontSize:15}}>
                    <span style={{color:'rgba(255,255,255,.5)'}}>{l}</span>
                    <span style={{fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,color:'#fff'}}>{v}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )

      case 2: return (
        <div style={{display:'flex',flexDirection:'column',flex:1,justifyContent:'center',gap:28}}>
          <h2 style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:38,fontWeight:700,color:'#fff',margin:0,textAlign:'center'}}>Comparativo por Mes</h2>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}>
              <thead>
                <tr style={{borderBottom:'1px solid rgba(255,255,255,.15)'}}>
                  {[
                    {h:'Mes',            w:160},
                    {h:'Circuitos',      w:70},
                    {h:'Ingreso LIBERO', w:170},
                    {h:'Costo LIBERO',   w:160},
                    {h:'Utilidad LIBERO',w:170},
                    {h:'Margen LIBERO',  w:110},
                    {h:'Ingreso OPC',    w:160},
                    {h:'Costo OPC',      w:150},
                    {h:'Utilidad OPC',   w:160},
                    {h:'Margen OPC',     w:110},
                  ].map(({h,w})=>(
                    <th key={h} style={{padding:'12px 14px',textAlign:'left',fontSize:11,textTransform:'uppercase',letterSpacing:.8,color:'rgba(255,255,255,.45)',fontWeight:600,whiteSpace:'nowrap',minWidth:w}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mesesRango.map((mk,i) => {
                  const m = porMes[mk] || {}
                  const mgLib = (m.ingMXN||0)>0?(((m.utilLib||0)/(m.ingMXN||1))*100).toFixed(1)+'%':'—'
                  const mgOpc = (m.ingOpc||0)>0?(((m.utilOpc||0)/(m.ingOpc||1))*100).toFixed(1)+'%':'—'
                  return (
                    <tr key={mk} style={{borderBottom:'1px solid rgba(255,255,255,.06)',background:i%2===0?'rgba(255,255,255,.03)':'transparent'}}>
                      <td style={{padding:'14px 14px',fontWeight:700,fontSize:14,color:'#e0c96a',whiteSpace:'nowrap'}}>{cap(mk)}</td>
                      <td style={{padding:'14px 14px',color:'rgba(255,255,255,.7)',textAlign:'center',fontSize:14}}>{m.circs||0}</td>
                      <Num v={fmtMXN(m.ingMXN||0)} color='#60a5fa'/>
                      <Num v={fmtMXN(m.costoLib||0)} color='#fca5a5'/>
                      <Num v={fmtMXN(Math.abs(m.utilLib||0))} color={(m.utilLib||0)>=0?'#86efac':'#fca5a5'} bold/>
                      <Pct v={mgLib} color={(m.utilLib||0)>=0?'#86efac':'#fca5a5'}/>
                      <Num v={(m.ingOpc||0)>0?fmtMXN(m.ingOpc):null} color='#a78bfa'/>
                      <Num v={(m.costoOpc||0)>0?fmtMXN(m.costoOpc):null} color='#d8b4fe'/>
                      <Num v={(m.ingOpc||0)>0?fmtMXN(Math.abs(m.utilOpc||0)):null} color={(m.utilOpc||0)>=0?'#86efac':'#fca5a5'} bold/>
                      <Pct v={mgOpc} color={(m.utilOpc||0)>=0?'#86efac':'#fca5a5'}/>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{borderTop:'2px solid rgba(255,255,255,.2)'}}>
                  <td style={{padding:'14px 14px',fontWeight:800,fontSize:14,color:'#e0c96a'}}>TOTAL</td>
                  <td style={{padding:'14px 14px',color:'#fff',fontWeight:800,textAlign:'center',fontSize:14}}>{circsMostrar.length}</td>
                  <Num v={fmtMXN(totIngMXN)} color='#60a5fa' bold/>
                  <Num v={fmtMXN(totCostoLib)} color='#fca5a5' bold/>
                  <Num v={fmtMXN(Math.abs(utilLib))} color={utilLib>=0?'#86efac':'#fca5a5'} bold/>
                  <Pct v={margenLib+'%'} color={utilLib>=0?'#86efac':'#fca5a5'} bold/>
                  <Num v={ingOpcTotal>0?fmtMXN(ingOpcTotal):null} color='#a78bfa' bold/>
                  <Num v={totCostoOpc>0?fmtMXN(totCostoOpc):null} color='#d8b4fe' bold/>
                  <Num v={ingOpcTotal>0?fmtMXN(Math.abs(utilOpc)):null} color={utilOpc>=0?'#86efac':'#fca5a5'} bold/>
                  <Pct v={ingOpcTotal>0?margenOpc+'%':'—'} color={utilOpc>=0?'#86efac':'#fca5a5'} bold/>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )

      case 3: return (
        <div style={{display:'flex',flexDirection:'column',flex:1,justifyContent:'center',gap:28}}>
          <h2 style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:38,fontWeight:700,color:'#fff',margin:0,textAlign:'center'}}>Distribución por Categoría</h2>
          <div style={{maxWidth:800,margin:'0 auto',width:'100%',display:'flex',flexDirection:'column',gap:16}}>
            {Object.entries(catCosto).sort((a,b)=>b[1]-a[1]).map(([cat,val]) => (
              <div key={cat}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                  <span style={{fontSize:15,fontWeight:600,color:'#fff'}}>{cat}</span>
                  <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:15,color:'rgba(255,255,255,.7)'}}>{fmtMXN(val)} MN <span style={{color:'rgba(255,255,255,.4)',fontSize:12}}>({((val/totalCat)*100).toFixed(1)}%)</span></span>
                </div>
                <div style={{background:'rgba(255,255,255,.08)',borderRadius:6,height:10,overflow:'hidden'}}>
                  <div style={{height:'100%',width:((val/maxCat)*100)+'%',background:CAT_COLORS_PRES[cat]||'#888',borderRadius:6,transition:'width .5s'}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )

      case 4: return (
        <div style={{display:'flex',flexDirection:'column',flex:1,justifyContent:'center',gap:28}}>
          <h2 style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:38,fontWeight:700,color:'#fff',margin:0,textAlign:'center'}}>Top Proveedores</h2>
          <div style={{maxWidth:860,margin:'0 auto',width:'100%',display:'flex',flexDirection:'column',gap:12}}>
            {topProvs.map((p,i) => (
              <div key={p.nombre} style={{display:'grid',gridTemplateColumns:'32px 1fr 200px',gap:16,alignItems:'center',background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)',borderRadius:12,padding:'14px 20px'}}>
                <span style={{fontSize:16,fontWeight:800,color:i<3?'#e0c96a':'rgba(255,255,255,.3)',textAlign:'center'}}>#{i+1}</span>
                <div>
                  <div style={{fontSize:16,fontWeight:700,color:'#fff',marginBottom:5}}>{p.nombre}</div>
                  <div style={{background:'rgba(255,255,255,.08)',borderRadius:4,height:6,overflow:'hidden'}}>
                    <div style={{height:'100%',width:((p.total/maxProv)*100)+'%',background:'#e0c96a',borderRadius:4}}/>
                  </div>
                </div>
                <div style={{textAlign:'right',fontFamily:"'IBM Plex Mono',monospace",fontSize:15,fontWeight:700,color:'#e0c96a'}}>{fmtMXN(p.total)} MN</div>
              </div>
            ))}
          </div>
        </div>
      )

      default: return null
    }
  }

  return (
    <div style={{position:'fixed',inset:0,background:'#080a0f',zIndex:999,display:'flex',flexDirection:'column',fontFamily:"'Outfit',sans-serif"}}>

      {/* Header barra superior */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 32px',borderBottom:'1px solid rgba(255,255,255,.08)'}}>
        <div style={{display:'flex',alignItems:'center',gap:20}}>
          <span style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:18,fontWeight:700,color:'#fff'}}>CxP <span style={{color:'#e0c96a'}}>Circuitos</span></span>
          <div style={{width:1,height:20,background:'rgba(255,255,255,.15)'}}/>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:12,color:'rgba(255,255,255,.4)'}}>Rango:</span>
            <select value={mesDe} onChange={e=>setMesDe(e.target.value)} style={selStyle}>
              {sortedMonths.map(mk=><option key={mk} value={mk}>{cap(mk)}</option>)}
            </select>
            <span style={{color:'rgba(255,255,255,.3)'}}>→</span>
            <select value={mesA} onChange={e=>setMesA(e.target.value)} style={selStyle}>
              {sortedMonths.filter(mk=>monthKeySortable(mk)>=monthKeySortable(mesDe)).map(mk=><option key={mk} value={mk}>{cap(mk)}</option>)}
            </select>
          </div>
        </div>
        <button onClick={onClose} style={{background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.15)',color:'rgba(255,255,255,.7)',borderRadius:8,padding:'6px 14px',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>✕ Cerrar</button>
      </div>

      {/* Contenido del slide */}
      <div style={{flex:1,padding:'32px 64px',display:'flex',flexDirection:'column',overflow:'auto'}}>
        {renderSlide()}
      </div>

      {/* ── Modal KPI ── */}
      {kpiModal && (()=>{
        // ── Agrupa circsMostrar por mes ──
        const porMesModal = {}
        mesesRango.forEach(mk => { porMesModal[mk] = (monthMap[mk]||[]).filter(c=>circsMostrar.includes(c)) })

        const mkLabel = mk => cap(mk)

        // Calcular totales por mes según el tipo de chip
        const mesTotales = mesesRango.map(mk => {
          const circs = porMesModal[mk] || []
          let ingUSD=0, ingMXN=0, costoLib=0, ingOpcMXN=0, ingOpcUSD=0, costoOpc=0, utilLib=0, utilOpc=0
          circs.forEach(c => {
            const T = calcCircTotals(c, tarifario, TC)
            ingUSD   += c.importe_cobrado||0
            ingMXN   += T.ingresoMXN
            costoLib += T.costoTotal
            ingOpcMXN+= T.ingresoOpcMXN
            ingOpcUSD+= T.ingresoOpcUSD
            costoOpc += T.costoOpcTotal
            utilLib  += T.utilidad
            utilOpc  += T.utilidadOpc
          })
          const ingOpcTotal = ingOpcMXN + ingOpcUSD*TC
          return { mk, circs, ingUSD, ingMXN, costoLib, ingOpcMXN, ingOpcUSD, ingOpcTotal, costoOpc, utilLib, utilOpc }
        })

        const MODAL_CFG = {
          ing_lib:   { title:'💰 Ingresos LIBERO — Por mes',
            cols:['Mes','Circuitos','Cobrado (USD)','Equivalente MN'],
            rowFn: m=>[mkLabel(m.mk), m.circs.length, fmtUSD(m.ingUSD), fmtMXN(m.ingMXN)+' MN'],
            detCols:['Circuito','Tour Leader','PAX','Cobrado (USD)','Equiv. MN'],
            detFn: c=>{ return [c.id.split('-').slice(-4).join('-'), c.info?.tl||'—', c.info?.pax||'—', fmtUSD(c.importe_cobrado||0), fmtMXN((c.importe_cobrado||0)*TC)+' MN'] },
            totalFn: ()=>['TOTAL', circsMostrar.length, fmtUSD(totIngUSD), fmtMXN(totIngMXN)+' MN'] },
          ing_opc:   { title:'🔷 Ingresos OPCIONAL — Por mes',
            cols:['Mes','Circuitos','Ing. MXN','Ing. USD','Total MN'],
            rowFn: m=>[mkLabel(m.mk), m.circs.length, fmtMXN(m.ingOpcMXN), m.ingOpcUSD>0?fmtUSD(m.ingOpcUSD):'—', fmtMXN(m.ingOpcTotal)+' MN'],
            detCols:['Circuito','Tour Leader','MXN','USD','Total MN'],
            detFn: c=>{ const T=calcCircTotals(c,tarifario,TC); return [c.id.split('-').slice(-4).join('-'), c.info?.tl||'—', fmtMXN(T.ingresoOpcMXN), T.ingresoOpcUSD>0?fmtUSD(T.ingresoOpcUSD):'—', fmtMXN(T.ingresoOpcTotal)+' MN'] },
            totalFn: ()=>['TOTAL', circsMostrar.length, fmtMXN(totIngOpcMXN), totIngOpcUSD>0?fmtUSD(totIngOpcUSD):'—', fmtMXN(ingOpcTotal)+' MN'] },
          costos:    { title:'📤 Costos LIBERO — Por mes',
            cols:['Mes','Circuitos','Costo LIBERO'],
            rowFn: m=>[mkLabel(m.mk), m.circs.length, fmtMXN(m.costoLib)+' MN'],
            detCols:['Circuito','Tour Leader','Costo LIBERO'],
            detFn: c=>{ const T=calcCircTotals(c,tarifario,TC); return [c.id.split('-').slice(-4).join('-'), c.info?.tl||'—', fmtMXN(T.costoTotal)+' MN'] },
            totalFn: ()=>['TOTAL', circsMostrar.length, fmtMXN(totCostoLib)+' MN'] },
          costos_opc:{ title:'📤 Costos OPCIONAL — Por mes',
            cols:['Mes','Circuitos','Costo OPCIONAL'],
            rowFn: m=>[mkLabel(m.mk), m.circs.length, fmtMXN(m.costoOpc)+' MN'],
            detCols:['Circuito','Tour Leader','Costo OPCIONAL'],
            detFn: c=>{ const T=calcCircTotals(c,tarifario,TC); return [c.id.split('-').slice(-4).join('-'), c.info?.tl||'—', fmtMXN(T.costoOpcTotal)+' MN'] },
            totalFn: ()=>['TOTAL', circsMostrar.length, fmtMXN(totCostoOpc)+' MN'] },
          util_lib:  { title:'✅ Utilidad LIBERO — Por mes',
            cols:['Mes','Circuitos','Ingreso MN','Costo MN','Utilidad','Margen'],
            rowFn: m=>{ const mg=m.ingMXN>0?((m.utilLib/m.ingMXN)*100).toFixed(1)+'%':'—'; return [mkLabel(m.mk), m.circs.length, fmtMXN(m.ingMXN)+' MN', fmtMXN(m.costoLib)+' MN', fmtMXN(Math.abs(m.utilLib))+' MN', mg] },
            detCols:['Circuito','Tour Leader','Ingreso','Costo','Utilidad','Margen'],
            detFn: c=>{ const T=calcCircTotals(c,tarifario,TC); const m=T.ingresoMXN>0?((T.utilidad/T.ingresoMXN)*100).toFixed(1)+'%':'—'; return [c.id.split('-').slice(-4).join('-'), c.info?.tl||'—', T.ingresoMXN>0?fmtMXN(T.ingresoMXN)+' MN':'—', fmtMXN(T.costoTotal)+' MN', fmtMXN(Math.abs(T.utilidad))+' MN', m] },
            totalFn: ()=>['TOTAL', circsMostrar.length, fmtMXN(totIngMXN)+' MN', fmtMXN(totCostoLib)+' MN', fmtMXN(Math.abs(utilLib))+' MN', margenLib+'%'] },
          util_opc:  { title:'✅ Utilidad OPCIONAL — Por mes',
            cols:['Mes','Circuitos','Ingreso OPC','Costo OPC','Utilidad','Margen'],
            rowFn: m=>{ const mg=m.ingOpcTotal>0?((m.utilOpc/m.ingOpcTotal)*100).toFixed(1)+'%':'—'; return [mkLabel(m.mk), m.circs.length, fmtMXN(m.ingOpcTotal)+' MN', fmtMXN(m.costoOpc)+' MN', fmtMXN(Math.abs(m.utilOpc))+' MN', mg] },
            detCols:['Circuito','Tour Leader','Ingreso OPC','Costo OPC','Utilidad','Margen'],
            detFn: c=>{ const T=calcCircTotals(c,tarifario,TC); const m=T.ingresoOpcTotal>0?((T.utilidadOpc/T.ingresoOpcTotal)*100).toFixed(1)+'%':'—'; return [c.id.split('-').slice(-4).join('-'), c.info?.tl||'—', fmtMXN(T.ingresoOpcTotal)+' MN', fmtMXN(T.costoOpcTotal)+' MN', fmtMXN(Math.abs(T.utilidadOpc))+' MN', m] },
            totalFn: ()=>['TOTAL', circsMostrar.length, fmtMXN(ingOpcTotal)+' MN', fmtMXN(totCostoOpc)+' MN', fmtMXN(Math.abs(utilOpc))+' MN', margenOpc+'%'] },
          circuitos: { title:'🗂 Circuitos — Por mes',
            cols:['Mes','Circuitos','Total PAX','Servicios'],
            rowFn: m=>{ const paxMes=m.circs.reduce((a,c)=>a+(parseInt(c.info?.pax)||0),0); return [mkLabel(m.mk), m.circs.length, paxMes+' PAX', m.circs.reduce((a,c)=>a+c.rows.length,0)] },
            detCols:['Circuito','Tour Leader','PAX','HAB','Servicios'],
            detFn: c=>[c.id.split('-').slice(-4).join('-'), c.info?.tl||'—', c.info?.pax||'—', ((parseInt(c.info?.habs_single)||0)+(parseInt(c.info?.habs_doble)||0))||'—', c.rows.length],
            totalFn: ()=>['TOTAL', circsMostrar.length, totPax+' PAX', circsMostrar.reduce((a,c)=>a+c.rows.length,0)] },
          pax: { title:'👥 PAX — Por mes',
            cols:['Mes','Circuitos','Total PAX'],
            rowFn: m=>{ const paxMes=m.circs.reduce((a,c)=>a+(parseInt(c.info?.pax)||0),0); return [mkLabel(m.mk), m.circs.length, paxMes+' PAX'] },
            detCols:['Circuito','Tour Leader','PAX','HAB'],
            detFn: c=>[c.id.split('-').slice(-4).join('-'), c.info?.tl||'—', c.info?.pax||'—', ((parseInt(c.info?.habs_single)||0)+(parseInt(c.info?.habs_doble)||0))||'—'],
            totalFn: ()=>['TOTAL', circsMostrar.length, totPax+' PAX'] }
        }

        const cfg = MODAL_CFG[kpiModal]
        if (!cfg) return null
        const total = cfg.totalFn()

        return (
          <div onClick={e=>e.target===e.currentTarget&&setKpiModal(null)}
            style={{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',zIndex:1100,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
            <div style={{background:'#13161f',border:'1px solid rgba(255,255,255,.12)',borderRadius:16,width:'min(1100px,96vw)',maxHeight:'85vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,.7)'}}>
              {/* Header */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'20px 28px',borderBottom:'1px solid rgba(255,255,255,.08)'}}>
                <div>
                  <h3 style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:22,fontWeight:700,color:'#fff',margin:0}}>{cfg.title}</h3>
                  <div style={{fontSize:12,color:'rgba(255,255,255,.35)',marginTop:4}}>{cap(mesDe)} → {cap(mesA)} · {circsMostrar.length} circuitos · clic en mes para ver detalle</div>
                </div>
                <button onClick={()=>setKpiModal(null)} style={{background:'rgba(255,255,255,.08)',border:'none',color:'rgba(255,255,255,.6)',borderRadius:8,padding:'6px 12px',fontSize:15,cursor:'pointer'}}>✕</button>
              </div>
              {/* Body */}
              <div style={{overflowY:'auto',flex:1,padding:'0 0 16px'}}>
                {mesTotales.map((m, mi) => {
                  const row = cfg.rowFn(m)
                  const isExp = mesExpandido === m.mk
                  return (
                    <div key={m.mk}>
                      {/* Fila de mes */}
                      <div onClick={()=>setMesExpandido(isExp?null:m.mk)}
                        style={{display:'grid',gridTemplateColumns:`180px repeat(${row.length-1},1fr) 36px`,alignItems:'center',padding:'14px 28px',cursor:'pointer',borderBottom:'1px solid rgba(255,255,255,.06)',background:isExp?'rgba(224,201,106,.07)':'transparent',transition:'background .15s'}}
                        onMouseEnter={e=>{if(!isExp)e.currentTarget.style.background='rgba(255,255,255,.04)'}}
                        onMouseLeave={e=>{e.currentTarget.style.background=isExp?'rgba(224,201,106,.07)':'transparent'}}>
                        <div style={{fontWeight:700,fontSize:14,color:'#e0c96a'}}>{row[0]}</div>
                        {row.slice(1).map((cell,ci)=>(
                          <div key={ci} style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:14,color:'rgba(255,255,255,.85)',fontWeight:500}}>{cell}</div>
                        ))}
                        <div style={{textAlign:'center',fontSize:14,color:'rgba(255,255,255,.3)',transition:'transform .2s',transform:isExp?'rotate(90deg)':'rotate(0deg)'}}>▶</div>
                      </div>
                      {/* Detalle del mes expandido */}
                      {isExp && (
                        <div style={{background:'rgba(255,255,255,.03)',borderBottom:'1px solid rgba(255,255,255,.08)'}}>
                          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                            <thead>
                              <tr style={{background:'rgba(255,255,255,.05)'}}>
                                {cfg.detCols.map(h=><th key={h} style={{padding:'8px 28px',textAlign:'left',fontSize:10,textTransform:'uppercase',letterSpacing:.7,color:'rgba(255,255,255,.35)',fontWeight:500}}>{h}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {m.circs.map((c,ci)=>{
                                const cells = cfg.detFn(c)
                                return (
                                  <tr key={c.id} style={{borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                                    {cells.map((cell,cii)=>(
                                      <td key={cii} style={{padding:'9px 28px',color:'rgba(255,255,255,.7)',fontFamily:cii>=2?"'IBM Plex Mono',monospace":'inherit',fontSize:cii===0?11:12,fontWeight:cii===0?600:400}}>{cell}</td>
                                    ))}
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
                {/* Fila de totales */}
                <div style={{display:'grid',gridTemplateColumns:`180px repeat(${total.length-1},1fr) 36px`,alignItems:'center',padding:'14px 28px',borderTop:'2px solid rgba(255,255,255,.15)',marginTop:4}}>
                  <div style={{fontWeight:800,fontSize:14,color:'#e0c96a'}}>{total[0]}</div>
                  {total.slice(1).map((cell,ci)=>(
                    <div key={ci} style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:14,color:'#e0c96a',fontWeight:800}}>{cell}</div>
                  ))}
                  <div/>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Footer navegación */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 32px',borderTop:'1px solid rgba(255,255,255,.08)'}}>
        <button onClick={()=>setSlide(s=>Math.max(s-1,0))} disabled={slide===0}
          style={{background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.15)',color:slide===0?'rgba(255,255,255,.2)':'rgba(255,255,255,.8)',borderRadius:8,padding:'8px 20px',fontSize:14,cursor:slide===0?'default':'pointer',fontFamily:'inherit'}}>← Anterior</button>

        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {SLIDES.map((name,i) => (
            <button key={i} onClick={()=>setSlide(i)}
              style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,background:'none',border:'none',cursor:'pointer',padding:'4px 8px'}}>
              <div style={{width:i===slide?28:8,height:8,borderRadius:4,background:i===slide?'#e0c96a':'rgba(255,255,255,.2)',transition:'all .2s'}}/>
              {i===slide&&<span style={{fontSize:10,color:'rgba(255,255,255,.5)',whiteSpace:'nowrap'}}>{name}</span>}
            </button>
          ))}
        </div>

        <button onClick={()=>setSlide(s=>Math.min(s+1,SLIDES.length-1))} disabled={slide===SLIDES.length-1}
          style={{background:'rgba(255,255,255,.08)',border:'1px solid rgba(255,255,255,.15)',color:slide===SLIDES.length-1?'rgba(255,255,255,.2)':'rgba(255,255,255,.8)',borderRadius:8,padding:'8px 20px',fontSize:14,cursor:slide===SLIDES.length-1?'default':'pointer',fontFamily:'inherit'}}>Siguiente →</button>
      </div>
    </div>
  )
}

function KPICard({ label, val, sub, cls }) {
  const colors = { gold: '#b8952a', forest: '#52b788', rust: '#b83232', sky: '#1565a0', violet: '#5c35a0' }
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', boxShadow: '0 2px 16px rgba(18,21,31,.07)', borderLeft: `3px solid ${colors[cls] || '#d8d2c8'}` }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: .8, color: '#8a8278', fontWeight: 600, marginBottom: 5 }}>{label}</div>
      <div className="num" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 600, lineHeight: 1.2, color: colors[cls] || '#12151f' }}>{val}</div>
      {sub && <div className="num" style={{ fontSize: 11, color: '#8a8278', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}


// ═══════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════
function HBtn({ children, onClick, style }) {
  return <button onClick={onClick} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.25)', color: 'rgba(255,255,255,.75)', padding: '5px 13px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 500, ...(style||{}) }}>{children}</button>
}

// Modal de configuración de Vista Socio: rango de meses a presentar
// Modal para editar la lista de conceptos de Gastos Operativos
// Modal para agregar un nuevo servicio a un circuito
function AddRowModal({ tarifario, onCancel, onConfirm }) {
  const [fecha, setFecha] = useState('')
  const [destino, setDestino] = useState('')
  const [clasificacion, setClasificacion] = useState('HOSPEDAJE')
  const [servicio, setServicio] = useState('')
  const [tipo, setTipo] = useState('LIBERO')
  const [prov, setProv] = useState('')

  // Solo se requiere fecha + servicio para agregar (según decisión del usuario)
  const puedeAgregar = fecha && servicio.trim().length > 0

  // Lista única de proveedores del tarifario para el dropdown
  const proveedores = [...new Set((tarifario || []).map(t => t.proveedor).filter(Boolean))].sort()

  const CLASIFICACIONES = ['HOSPEDAJE', 'TRANSPORTE', 'ACTIVIDADES', 'ALIMENTOS', 'GUIA', 'OTROS']

  const handleConfirm = () => {
    if (!puedeAgregar) return
    onConfirm({
      fecha, destino: destino.trim(), clasificacion,
      servicio: servicio.trim(), tipo, prov_general: prov.trim(),
    })
  }

  return (
    <Modal title="＋ Agregar servicio" onClose={onCancel}>
      <p style={{ color: '#8a8278', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
        Captura los datos básicos. Los campos con <span style={{ color: '#b83232', fontWeight: 700 }}>*</span> son obligatorios; el resto puedes editarlos después en la fila.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            Fecha <span style={{ color: '#b83232' }}>*</span>
          </label>
          <input
            type="date" value={fecha} onChange={e => setFecha(e.target.value)} autoFocus
            style={{ width: '100%', border: '1.5px solid #d8d2c8', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontSize: 14, background: '#fff', outline: 'none' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Destino</label>
          <input
            type="text" value={destino} onChange={e => setDestino(e.target.value)}
            placeholder="Ej. CANCUN"
            style={{ width: '100%', border: '1.5px solid #d8d2c8', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontSize: 14, background: '#fff', outline: 'none' }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Clasificación</label>
          <select
            value={clasificacion} onChange={e => setClasificacion(e.target.value)}
            style={{ width: '100%', border: '1.5px solid #d8d2c8', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontSize: 14, background: '#fff', outline: 'none', cursor: 'pointer' }}
          >
            {CLASIFICACIONES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Tipo</label>
          <select
            value={tipo} onChange={e => setTipo(e.target.value)}
            style={{ width: '100%', border: '1.5px solid #d8d2c8', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontSize: 14, background: '#fff', outline: 'none', cursor: 'pointer' }}
          >
            <option value="LIBERO">LIBERO</option>
            <option value="OPCIONAL">OPCIONAL</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
          Servicio <span style={{ color: '#b83232' }}>*</span>
        </label>
        <input
          type="text" value={servicio} onChange={e => setServicio(e.target.value)}
          placeholder="Ej. HOTEL/B&B, TRANSFER-APTO, TOUR CENOTES…"
          style={{ width: '100%', border: '1.5px solid #d8d2c8', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontSize: 14, background: '#fff', outline: 'none' }}
        />
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Proveedor (opcional)</label>
        <input
          type="text" value={prov} onChange={e => setProv(e.target.value)} list="prov-list"
          placeholder="Elegir del tarifario o teclear…"
          style={{ width: '100%', border: '1.5px solid #d8d2c8', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontSize: 14, background: '#fff', outline: 'none' }}
        />
        <datalist id="prov-list">
          {proveedores.map(p => <option key={p} value={p}/>)}
        </datalist>
        <div style={{ fontSize: 10, color: '#8a8278', marginTop: 4, fontStyle: 'italic' }}>
          Si el proveedor tiene precio en el tarifario, se calculará automáticamente.
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
        <Btn outline onClick={onCancel}>Cancelar</Btn>
        <Btn disabled={!puedeAgregar} onClick={handleConfirm}>Agregar ✓</Btn>
      </div>
    </Modal>
  )
}

function GastosOperativosModal({ items, onCancel, onConfirm }) {
  const [list, setList] = useState(() => items.map(it => ({...it, monto: it.monto ?? 0})))
  const total = list.reduce((sum, it) => sum + (parseFloat(it.monto)||0), 0)

  const updateItem = (i, key, val) => {
    const next = [...list]
    next[i] = { ...next[i], [key]: val }
    setList(next)
  }
  const addItem = () => {
    setList([...list, { id: Date.now().toString(), nombre: 'Nuevo concepto', monto: 0 }])
  }
  const removeItem = (i) => {
    setList(list.filter((_, idx) => idx !== i))
  }
  const handleConfirm = () => {
    // Filtrar conceptos vacíos
    const cleaned = list.filter(it => (it.nombre||'').trim() && (parseFloat(it.monto)||0) >= 0)
      .map(it => ({ id: it.id, nombre: it.nombre.trim(), monto: parseFloat(it.monto)||0 }))
    onConfirm(cleaned)
  }

  return (
    <Modal title="🏢 Gastos Operativos" onClose={onCancel}>
      <p style={{ color: '#8a8278', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
        Captura los conceptos mensuales de gastos operativos (nómina del equipo, renta, servicios, etc.).
        El total se multiplica por la cantidad de meses con circuitos en la vista actual.
      </p>

      <div style={{ background: '#fafafa', border: '1px solid #e8e3da', borderRadius: 10, padding: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#8a8278', marginBottom: 10 }}>Conceptos mensuales</div>

        {list.length === 0 && (
          <p style={{ color: '#aaa', fontSize: 12, fontStyle: 'italic', padding: '12px 0' }}>Sin conceptos. Agrega uno abajo.</p>
        )}

        {list.map((it, i) => (
          <div key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              type="text"
              value={it.nombre}
              onChange={e => updateItem(i, 'nombre', e.target.value)}
              placeholder="Nombre del concepto"
              style={{ flex: 1, border: '1px solid #d8d2c8', borderRadius: 6, padding: '6px 10px', fontFamily: 'inherit', fontSize: 13, background: '#fff', outline: 'none' }}
            />
            <span style={{ fontSize: 13, color: '#8a8278' }}>$</span>
            <input
              type="number" min="0" step="100"
              value={it.monto}
              onChange={e => updateItem(i, 'monto', e.target.value)}
              placeholder="0"
              style={{ width: 110, border: '1px solid #d8d2c8', borderRadius: 6, padding: '6px 10px', fontFamily: 'inherit', fontSize: 13, background: '#fff', outline: 'none', textAlign: 'right', fontWeight: 600 }}
            />
            <span style={{ fontSize: 11, color: '#8a8278' }}>MN</span>
            <button onClick={() => removeItem(i)} title="Eliminar" style={{ background: 'none', border: '1px solid #d8d2c8', borderRadius: 6, padding: '5px 9px', cursor: 'pointer', color: '#b83232', fontSize: 12 }}>✕</button>
          </div>
        ))}

        <button onClick={addItem} style={{ marginTop: 8, background: 'none', border: '1.5px dashed #b8952a', color: '#b8952a', padding: '8px 14px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 600, width: '100%' }}>
          + Agregar concepto
        </button>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '2px solid #ece7df', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#121512' }}>Total mensual:</span>
          <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 700, color: '#121512' }}>{fmtMXN(total)} <span style={{ fontSize: 12, color: '#8a8278', fontWeight: 600 }}>MN/mes</span></span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
        <Btn outline onClick={onCancel}>Cancelar</Btn>
        <Btn onClick={handleConfirm}>Guardar ✓</Btn>
      </div>
    </Modal>
  )
}

function SocioConfigModal({ allMonths, currentRange, onCancel, onConfirm }) {
  // Meses reales (no "Sin mes")
  const months = allMonths.filter(m => m && m !== 'Sin mes')
  // Estado: si hay rango previo lo usamos, si no, por defecto "sin filtro"
  const [mode, setMode] = useState(currentRange ? 'rango' : 'todos')
  const [from, setFrom] = useState(currentRange?.from || months[0] || '')
  const [to, setTo] = useState(currentRange?.to || months[months.length - 1] || '')

  const handleConfirm = () => {
    if (mode === 'todos') onConfirm(null)
    else onConfirm({ from, to })
  }

  // Validación: from no puede ser mayor que to
  const invalid = mode === 'rango' && (!from || !to || monthKeySortable(from) > monthKeySortable(to))

  return (
    <Modal title="Configurar Vista Socio" onClose={onCancel}>
      <p style={{ color: '#8a8278', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
        Selecciona qué período de meses se mostrará en la presentación. El socio solo verá los meses dentro del rango.
      </p>

      {/* Switch: todos los meses vs rango */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, background: '#f5f3ef', padding: 4, borderRadius: 8 }}>
        <button onClick={() => setMode('todos')} style={{ flex: 1, padding: '8px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13, background: mode === 'todos' ? '#fff' : 'transparent', color: mode === 'todos' ? '#121512' : '#8a8278', boxShadow: mode === 'todos' ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>
          📅 Todos los meses
        </button>
        <button onClick={() => setMode('rango')} style={{ flex: 1, padding: '8px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13, background: mode === 'rango' ? '#fff' : 'transparent', color: mode === 'rango' ? '#121512' : '#8a8278', boxShadow: mode === 'rango' ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>
          🎯 Rango específico
        </button>
      </div>

      {mode === 'rango' && (
        <div style={{ background: '#fafafa', border: '1px solid #e8e3da', borderRadius: 10, padding: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Desde</label>
            <select value={from} onChange={e => setFrom(e.target.value)} style={{ width: '100%', border: '1.5px solid #d8d2c8', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontSize: 14, background: '#fff', outline: 'none', cursor: 'pointer' }}>
              {months.map(m => <option key={m} value={m}>{cap(m)}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Hasta</label>
            <select value={to} onChange={e => setTo(e.target.value)} style={{ width: '100%', border: '1.5px solid #d8d2c8', borderRadius: 8, padding: '8px 12px', fontFamily: 'inherit', fontSize: 14, background: '#fff', outline: 'none', cursor: 'pointer' }}>
              {months.map(m => <option key={m} value={m}>{cap(m)}</option>)}
            </select>
          </div>
          {invalid && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12, color: '#b83232' }}>
              ⚠️ El mes "Desde" debe ser anterior o igual al mes "Hasta".
            </div>
          )}
        </div>
      )}

      {mode === 'todos' && (
        <div style={{ background: '#f0faf4', border: '1px solid #c5e8d3', borderRadius: 10, padding: 14, fontSize: 13, color: '#1f6e3f' }}>
          ✓ Se mostrarán todos los meses con circuitos al socio.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
        <Btn outline onClick={onCancel}>Cancelar</Btn>
        <Btn disabled={invalid} onClick={handleConfirm}>Activar Vista Socio ✓</Btn>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════
//  PAGOS VIEW
// ═══════════════════════════════════════════════
function PagosView({ circuits, tarifario, TC, isReadOnly, togglePaid, setFechaPago, saveImporte, saveFactura, saveRowField, onGoCircuit }) {
  const today = new Date(); today.setHours(0,0,0,0)
  const [mesVista, setMesVista] = useState(() => { const d=new Date(); return {y:d.getFullYear(),m:d.getMonth()} })
  const [diaSeleccionado, setDiaSeleccionado] = useState(null) // 'YYYY-MM-DD'
  const [filtro, setFiltro] = useState('todos') // todos | semana | vencidos | sin_fecha

  const [kpiModal, setKpiModal] = useState(null)
  const [mesExpandido, setMesExpandido] = useState(null) // null | 'pendiente' | 'semana' | 'vencidos' | 'sin_fecha' | 'pagado'
  const [busqProv, setBusqProv] = useState('')   // texto que se está escribiendo (todavía no es chip)
  const [chips, setChips] = useState([])          // array de strings — filtros ya confirmados con Enter
  const [fechaFiltro, setFechaFiltro] = useState('')  // 'YYYY-MM-DD' — filtra por fecha de pago exacta
  const [seleccionados, setSeleccionados] = useState(() => new Set())  // Set de row.id seleccionados
  const [exportModal, setExportModal] = useState(null) // null | { desde, hasta }
  const [marcarPagadosModal, setMarcarPagadosModal] = useState(null) // null | { desde, hasta }
  const [validarFlujoModal, setValidarFlujoModal] = useState(null) // null | true

  // Recopilar TODOS los servicios (pagados y pendientes)
  const todos = []
  circuits.forEach(circ => {
    circ.rows.forEach(r => {
      const { mxn, usd } = getImporte(r, circ.info, tarifario)
      todos.push({ ...r, _circ: circ, _mxn: mxn, _usd: usd })
    })
  })
  const pendientes = todos.filter(r => !r.paid)
  const pagados    = todos.filter(r => r.paid)

  // Clasificar pendientes
  const inicioSemana = new Date(today); inicioSemana.setDate(today.getDate() - today.getDay() + 1)
  const finSemana = new Date(inicioSemana); finSemana.setDate(inicioSemana.getDate() + 6)
  const sinFecha   = pendientes.filter(r => !r.fecha_pago)
  const conFecha   = pendientes.filter(r => !!r.fecha_pago)
  const vencidos   = conFecha.filter(r => { const d=parseLocalDate(r.fecha_pago); d.setHours(0,0,0,0); return d < today })
  const estaSemana = conFecha.filter(r => { const d=parseLocalDate(r.fecha_pago); d.setHours(0,0,0,0); return d >= inicioSemana && d <= finSemana })

  const sumMXN = arr => arr.reduce((a,r)=>a+r._mxn,0)
  const sumUSD = arr => arr.reduce((a,r)=>a+r._usd,0)
  const totMXN = sumMXN(conFecha); const totUSD = sumUSD(conFecha)
  const vMXN   = sumMXN(vencidos); const vUSD   = sumUSD(vencidos)
  const sMXN   = sumMXN(sinFecha); const sUSD   = sumUSD(sinFecha)
  const wMXN   = sumMXN(estaSemana); const wUSD  = sumUSD(estaSemana)
  const pMXN   = sumMXN(pagados);    const pUSD  = sumUSD(pagados)

  // Mapa fecha -> servicios pendientes (para calendario)
  const porFecha = {}
  conFecha.forEach(r => {
    const k = r.fecha_pago
    if (!porFecha[k]) porFecha[k] = []
    porFecha[k].push(r)
  })
  // Mapa fecha -> servicios pagados (para calendario)
  const porFechaPagado = {}
  pagados.filter(r=>r.fecha_pago).forEach(r => {
    const k = r.fecha_pago
    if (!porFechaPagado[k]) porFechaPagado[k] = []
    porFechaPagado[k].push(r)
  })

  // Días del mes en vista
  const primerDia = new Date(mesVista.y, mesVista.m, 1)
  const ultimoDia = new Date(mesVista.y, mesVista.m+1, 0)
  const offsetInicio = (primerDia.getDay()+6)%7 // Lunes=0
  const diasEnMes = ultimoDia.getDate()
  const celdas = []
  for (let i=0; i<offsetInicio; i++) celdas.push(null)
  for (let d=1; d<=diasEnMes; d++) celdas.push(d)
  while (celdas.length % 7 !== 0) celdas.push(null)

  const diaKey = (d) => {
    const y = mesVista.y, m = String(mesVista.m+1).padStart(2,'0'), dd = String(d).padStart(2,'0')
    return y+'-'+m+'-'+dd
  }

  const DIAS_SEM = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
  const MESES_NOM = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

  // Servicios del día seleccionado agrupados por circuito
  const serviciosDia = diaSeleccionado ? (porFecha[diaSeleccionado] || []) : []
  const porCircuito = {}
  serviciosDia.forEach(r => {
    const k = r._circ.id
    if (!porCircuito[k]) porCircuito[k] = { circ: r._circ, rows: [] }
    porCircuito[k].rows.push(r)
  })

  // Lista filtrada para sección pendientes
  const listaFiltrada = filtro==='sin_fecha' ? sinFecha
    : filtro==='vencidos' ? vencidos
    : filtro==='semana' ? estaSemana
    : filtro==='pagados' ? [...pagados].sort((a,b)=>(a.fecha_pago||'').localeCompare(b.fecha_pago||''))
    : [...conFecha].sort((a,b)=>(a.fecha_pago||'').localeCompare(b.fecha_pago||''))

  const porCircuitoLista = {}
  listaFiltrada.forEach(r => {
    const k = r._circ.id
    if (!porCircuitoLista[k]) porCircuitoLista[k] = { circ: r._circ, rows: [] }
    porCircuitoLista[k].rows.push(r)
  })

  const FBtn = ({id,lbl,cnt,color}) => (
    <button onClick={()=>setFiltro(id)} style={{padding:'5px 12px',borderRadius:14,border:'none',cursor:'pointer',fontSize:11,fontWeight:filtro===id?700:500,fontFamily:'inherit',background:filtro===id?(color||'#12151f'):'#f5f1eb',color:filtro===id?'#fff':'#8a8278',display:'flex',alignItems:'center',gap:5}}>
      {lbl}{cnt>0&&<span style={{background:filtro===id?'rgba(255,255,255,.25)':'#d8d2c8',borderRadius:8,fontSize:9,padding:'1px 5px',fontWeight:800}}>{cnt}</span>}
    </button>
  )

  // Fila info compartida
  const InfoRow = ({r, showDate}) => (
    <div>
      <div style={{fontWeight:600,fontSize:12}}>{r.prov_general||<span style={{color:'#ccc'}}>Sin proveedor</span>} <span style={{fontWeight:400,color:'#8a8278',fontSize:11}}>· {r.servicio||'—'}</span></div>
      <div style={{display:'flex',gap:6,marginTop:2,flexWrap:'wrap',alignItems:'center'}}>
        <Badge text={r.clasificacion}/>
        {showDate && r.fecha_pago && <span style={{fontSize:10,color:'#1565a0',fontWeight:600}}>📅 {r.fecha_pago}</span>}
        {r.visto_bueno_auditoria ? <span style={{fontSize:9,color:'#1e5c3a',fontWeight:700}}>✅ VB Aud.</span> : <span style={{fontSize:9,color:'#b83232',fontWeight:600}}>⏳ VB Aud.</span>}
        {r.visto_bueno_pago ? <span style={{fontSize:9,color:'#1e5c3a',fontWeight:700}}>✅ VB Pago</span> : <span style={{fontSize:9,color:'#b83232',fontWeight:600}}>⏳ VB Pago</span>}
        {r.folio_factura && <span style={{fontSize:9,color:'#8a8278'}}>Folio: {r.folio_factura}</span>}
      </div>
    </div>
  )
  const MontoRow = ({r}) => (
    <div style={{textAlign:'right',minWidth:110}}>
      {r._mxn>0&&<div style={{fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:13}}>{fmtMXN(r._mxn)} <span style={{fontSize:10,color:'#8a8278',fontWeight:600}}>MN</span></div>}
      {r._usd>0&&<div style={{fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:13,color:'#1565a0'}}>{fmtUSD(r._usd)} <span style={{fontSize:10,fontWeight:600}}>USD</span></div>}
      {r._mxn===0&&r._usd===0&&<span style={{fontSize:10,color:'#ccc'}}>Sin tarifa</span>}
    </div>
  )

  // Fila PENDIENTE — botón "Marcar como pagado" (distinto a la etiqueta de pagado)
  const RowPendiente = ({r, showDate}) => {
    const [editFecha, setEditFecha] = useState(false)
    return (
      <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:8,alignItems:'center',padding:'10px 14px',borderBottom:'1px solid #f0ebe3'}}>
        <div>
          <InfoRow r={r} showDate={showDate}/>
          {!r.fecha_pago && (
            <div style={{marginTop:4}}>
              {editFecha
                ? <div style={{display:'flex',gap:4,alignItems:'center'}}>
                    <input type="date" autoFocus style={{border:'1px solid #b8952a',borderRadius:4,padding:'2px 6px',fontSize:11,fontFamily:'inherit'}}
                      onChange={e=>{if(e.target.value){setFechaPago(r._circ.id,r.id,e.target.value);setEditFecha(false)}}}/>
                    <button onClick={()=>setEditFecha(false)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer'}}>✕</button>
                  </div>
                : <button onClick={()=>setEditFecha(true)} style={{background:'none',border:'1px dashed #b8952a',color:'#b8952a',borderRadius:4,padding:'2px 8px',fontSize:10,cursor:'pointer',fontWeight:600}}>+ Asignar fecha</button>
              }
            </div>
          )}
        </div>
        <MontoRow r={r}/>
        {/* Botón claro y diferenciado: fondo azul oscuro, texto blanco */}
        <button onClick={()=>togglePaid(r._circ.id,r.id,false)}
          style={{background:'#1565a0',color:'#fff',border:'none',borderRadius:6,padding:'5px 12px',fontSize:11,cursor:'pointer',fontWeight:700,whiteSpace:'nowrap',letterSpacing:.3}}>
          Marcar pagado ✓
        </button>
        <button onClick={()=>onGoCircuit(r._circ.id)} style={{background:'none',border:'1px solid #d8d2c8',color:'#8a8278',borderRadius:6,padding:'4px 8px',fontSize:10,cursor:'pointer',whiteSpace:'nowrap'}}>
          Ver →
        </button>
      </div>
    )
  }

  // Fila PAGADO — etiqueta verde + botón pequeño gris para revertir
  const RowPagado = ({r, showDate}) => (
    <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:8,alignItems:'center',padding:'10px 14px',borderBottom:'1px solid #f0ebe3',background:'#f9fef9'}}>
      <div><InfoRow r={r} showDate={showDate}/></div>
      <MontoRow r={r}/>
      <span style={{background:'#d8f3dc',color:'#1b4332',borderRadius:6,padding:'5px 10px',fontSize:11,fontWeight:700,whiteSpace:'nowrap',textAlign:'center'}}>
        ✅ Liquidado
      </span>
      <div style={{display:'flex',flexDirection:'column',gap:3,alignItems:'center'}}>
        <button onClick={()=>onGoCircuit(r._circ.id)} style={{background:'none',border:'1px solid #d8d2c8',color:'#8a8278',borderRadius:5,padding:'3px 7px',fontSize:10,cursor:'pointer',whiteSpace:'nowrap'}}>Ver →</button>
        <button onClick={()=>togglePaid(r._circ.id,r.id,true)} style={{background:'none',border:'1px solid #e0d0d0',color:'#b83232',borderRadius:5,padding:'2px 7px',fontSize:9,cursor:'pointer',whiteSpace:'nowrap'}}>↩ Revertir</button>
      </div>
    </div>
  )

  // ── Lógica búsqueda multi-filtro ──────────────────────────────────
  // Índice de razón social del tarifario por nombre comercial (upper trim)
  const rsIndex = {}
  tarifario.forEach(t => {
    if (t.proveedor && t.razon_social) {
      rsIndex[String(t.proveedor).toUpperCase().trim()] = String(t.razon_social).toUpperCase()
    }
  })

  // "todos" ya está construido más arriba; le agrego el campo de búsqueda combinado
  const allFilters = [...chips, ...(busqProv.trim() ? [busqProv.trim()] : [])]
  const hayFiltro = allFilters.length > 0 || !!fechaFiltro

  const resultadosProv = !hayFiltro ? [] : todos.filter(r => {
    // Filtro por fecha de pago exacta (si está)
    if (fechaFiltro) {
      if (!r.fecha_pago) return false
      if (r.fecha_pago !== fechaFiltro) return false
    }
    // Cada chip debe coincidir en algún campo (AND entre chips)
    if (allFilters.length === 0) return true
    const rs = rsIndex[(r.prov_general || '').toUpperCase().trim()] || ''
    const searchable = [
      r.prov_general || '',
      r._circ?.id || '',
      r.folio_factura || '',
      r.servicio || '',
      r.destino || '',
      rs
    ].join(' | ').toLowerCase()
    return allFilters.every(f => searchable.includes(f.toLowerCase()))
  })
  // Agrupar por proveedor exacto (normalizado) → luego por circuito
  const provNombres = [...new Set(resultadosProv.map(r => r.prov_general || ''))].sort()

  // Cálculo de la suma de los seleccionados (solo lo que aparece en resultados)
  const resultsIdSet = new Set(resultadosProv.map(r => r.id))
  const sumaSel = { count:0, mn:0, usd:0 }
  seleccionados.forEach(rowId => {
    // Solo sumamos si el row está en los resultados actuales (para que no se acumule "invisible")
    const r = resultadosProv.find(x => x.id === rowId)
    if (r) {
      sumaSel.count++
      sumaSel.mn += r._mxn || 0
      sumaSel.usd += r._usd || 0
    }
  })

  // Helpers para chips
  const commitChip = () => {
    const t = busqProv.trim()
    if (!t) return
    // Evitar duplicados
    if (chips.some(c => c.toLowerCase() === t.toLowerCase())) { setBusqProv(''); return }
    setChips([...chips, t])
    setBusqProv('')
    setSeleccionados(new Set())  // Reset selección al cambiar filtro
  }
  const removeChip = (i) => {
    setChips(chips.filter((_, idx) => idx !== i))
    setSeleccionados(new Set())
  }
  const limpiarTodo = () => {
    setChips([]); setBusqProv(''); setFechaFiltro(''); setSeleccionados(new Set())
  }
  const toggleSel = (rowId) => {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId); else next.add(rowId)
      return next
    })
  }
  const selectAllResults = () => {
    setSeleccionados(new Set(resultadosProv.map(r => r.id)))
  }

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,gap:12,flexWrap:'wrap'}}>
        <h2 style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:26,margin:0}}>💳 Programación de Pagos</h2>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {!isReadOnly && (
            <button
              onClick={() => {
                const d = new Date()
                setValidarFlujoModal({ desde: dateToLocalStr(d), hasta: dateToLocalStr(d) })
              }}
              style={{background:'#fff',color:'#12151f',border:'1.5px solid #d8d2c8',borderRadius:8,padding:'8px 14px',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}
              title="Validar tu Excel de flujo maestro contra los datos de la app"
            >
              📤 Validar Flujo Maestro
            </button>
          )}
          {!isReadOnly && (
            <button
              onClick={() => {
                const d = new Date(); d.setHours(0,0,0,0)
                setMarcarPagadosModal({ desde: dateToLocalStr(d), hasta: dateToLocalStr(d) })
              }}
              style={{background:'#fff',color:'#1e5c3a',border:'1.5px solid #52b788',borderRadius:8,padding:'8px 14px',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}
              title="Marcar como pagados los servicios del rango"
            >
              ✅ Marcar pagados
            </button>
          )}
          <button
            onClick={() => {
              // Por defecto: mañana como fecha desde y +7 días como hasta
              const d = new Date(); d.setDate(d.getDate() + 1)
              const h = new Date(); h.setDate(h.getDate() + 7)
              setExportModal({ desde: dateToLocalStr(d), hasta: dateToLocalStr(h) })
            }}
            style={{background:'#12151f',color:'#e0c96a',border:'none',borderRadius:8,padding:'8px 16px',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}
            title="Exportar pagos pendientes a Excel (formato flujo de efectivo)"
          >
            📥 Exportar Excel
          </button>
        </div>
      </div>

      {/* ── BUSCADOR DE PROVEEDOR — siempre visible ── */}
      <div style={{background:'#fff',borderRadius:12,padding:'16px 18px',boxShadow:'0 2px 16px rgba(18,21,31,.07)',marginBottom:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,gap:8,flexWrap:'wrap'}}>
          <div style={{fontSize:12,fontWeight:700,color:'#12151f'}}>
            🔍 Buscar por proveedor, circuito o razón social
            <span style={{fontSize:10,fontWeight:400,color:'#8a8278',marginLeft:8}}>
              (escribe y presiona <strong>Enter</strong> para agregar un filtro)
            </span>
          </div>
          {hayFiltro && (
            <button onClick={limpiarTodo} style={{background:'none',border:'1px solid #d8d2c8',color:'#8a8278',padding:'3px 10px',borderRadius:12,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>
              Limpiar todo
            </button>
          )}
        </div>

        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {/* Input principal con chips */}
          <div style={{flex:1,minWidth:280,display:'flex',alignItems:'center',flexWrap:'wrap',gap:4,background:'#f5f1eb',border:'1.5px solid #d8d2c8',borderRadius:20,padding:'6px 12px'}}>
            <span style={{fontSize:14,color:'#8a8278'}}>🏢</span>
            {chips.map((c, i) => (
              <span key={i} style={{background:'#12151f',color:'#e0c96a',borderRadius:12,padding:'2px 4px 2px 10px',fontSize:11,fontWeight:600,display:'inline-flex',alignItems:'center',gap:4}}>
                {c}
                <button onClick={()=>removeChip(i)} style={{background:'rgba(224,201,106,.2)',border:'none',color:'#e0c96a',cursor:'pointer',borderRadius:10,width:16,height:16,fontSize:10,lineHeight:1,padding:0,display:'inline-flex',alignItems:'center',justifyContent:'center'}} title="Quitar filtro">✕</button>
              </span>
            ))}
            <input
              type="text" value={busqProv}
              onChange={e=>setBusqProv(e.target.value)}
              onKeyDown={e=>{
                if (e.key === 'Enter') { e.preventDefault(); commitChip() }
                if (e.key === 'Backspace' && !busqProv && chips.length > 0) { removeChip(chips.length - 1) }
              }}
              placeholder={chips.length === 0 ? "Ej. COCONUTS, AY-20260815, LIBEOR…" : "Agregar otro filtro…"}
              style={{flex:1,minWidth:120,border:'none',background:'transparent',fontFamily:'inherit',fontSize:13,outline:'none',color:'#12151f',padding:'2px 0'}}
            />
            {busqProv && <button onClick={()=>setBusqProv('')} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:16,lineHeight:1}}>✕</button>}
          </div>

          {/* Selector de fecha de pago */}
          <div style={{display:'flex',alignItems:'center',gap:6,background:'#f5f1eb',border:'1.5px solid #d8d2c8',borderRadius:20,padding:'6px 12px'}}>
            <span style={{fontSize:11,fontWeight:700,color:'#8a8278',textTransform:'uppercase',letterSpacing:.4}}>📅 Fecha Pago:</span>
            <input type="date" value={fechaFiltro} onChange={e=>{setFechaFiltro(e.target.value);setSeleccionados(new Set())}}
              style={{border:'none',background:'transparent',fontFamily:'inherit',fontSize:12,outline:'none',color:'#12151f',minWidth:105}}/>
            {fechaFiltro && <button onClick={()=>setFechaFiltro('')} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:14,lineHeight:1}} title="Quitar filtro de fecha">✕</button>}
          </div>
        </div>

        {/* Barra flotante de selección */}
        {sumaSel.count > 0 && (
          <div style={{marginTop:12,padding:'10px 14px',background:'#12151f',color:'#e0c96a',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
            <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
              <span style={{fontSize:13,fontWeight:700}}>
                ✓ {sumaSel.count} {sumaSel.count===1?'servicio seleccionado':'servicios seleccionados'}
              </span>
              {sumaSel.mn>0 && (
                <span style={{fontSize:13}}>
                  Total MN: <strong style={{color:'#fff'}}>{fmtMXN(sumaSel.mn)}</strong>
                </span>
              )}
              {sumaSel.usd>0 && (
                <span style={{fontSize:13}}>
                  Total USD: <strong style={{color:'#fff'}}>{fmtUSD(sumaSel.usd)}</strong>
                </span>
              )}
            </div>
            <button onClick={()=>setSeleccionados(new Set())} style={{background:'rgba(224,201,106,.2)',color:'#e0c96a',border:'none',borderRadius:6,padding:'4px 10px',fontSize:11,cursor:'pointer',fontFamily:'inherit',fontWeight:600}}>
              Deseleccionar todo
            </button>
          </div>
        )}

        {/* Resultados de búsqueda — agrupados por mes colapsables */}
        {hayFiltro && (
          <div style={{marginTop:14}}>
            {resultadosProv.length === 0
              ? <div style={{fontSize:12,color:'#8a8278',padding:'8px 0'}}>Sin resultados para los filtros aplicados</div>
              : <>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,fontSize:11,color:'#8a8278'}}>
                    <span><strong>{resultadosProv.length}</strong> {resultadosProv.length===1?'servicio encontrado':'servicios encontrados'}</span>
                    {sumaSel.count === 0 && (
                      <button onClick={selectAllResults} style={{background:'none',border:'1px solid #d8d2c8',color:'#8a8278',padding:'3px 10px',borderRadius:12,fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>
                        ☐ Seleccionar todos
                      </button>
                    )}
                  </div>
                  <BuscadorResultados
                    filas={resultadosProv}
                    provNombres={provNombres}
                    saveImporte={saveImporte}
                    saveFactura={saveFactura}
                    setFechaPago={setFechaPago}
                    togglePaid={togglePaid}
                    onGoCircuit={onGoCircuit}
                    tarifario={tarifario}
                    isReadOnly={isReadOnly}
                    seleccionados={seleccionados}
                    toggleSel={toggleSel}
                  />
                </>
            }
          </div>
        )}
      </div>

      {/* KPIs — clic para desglose */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:12,marginBottom:24}}>
        {[
          {id:'pendiente', label:'⏳ Por pagar MXN',    val:fmtMXN(totMXN)+' MN', sub:totUSD>0?fmtUSD(totUSD)+' USD':undefined, cls:'rust'},
          {id:'semana',    label:'📅 Esta semana',       val:fmtMXN(wMXN)+' MN',   sub:wUSD>0?fmtUSD(wUSD)+' USD':undefined,    cls:'sky'},
          {id:'vencidos',  label:'🚨 Vencidos',          val:fmtMXN(vMXN)+' MN',   sub:vUSD>0?fmtUSD(vUSD)+' USD':undefined,    cls:'rust'},
          {id:'sin_fecha', label:'⚠️ Sin fecha',         val:sinFecha.length+' servicios', sub:fmtMXN(sMXN)+' MN'+(sUSD>0?' · '+fmtUSD(sUSD)+' USD':''), cls:'gold'},
          {id:'pagado',    label:'✅ Pagado',             val:fmtMXN(pMXN)+' MN',   sub:pUSD>0?fmtUSD(pUSD)+' USD':undefined,    cls:'forest'},
        ].map((k)=>(
          <div key={k.id} onClick={()=>setKpiModal(k.id)} style={{cursor:'pointer'}}>
            <KPICard label={k.label} val={k.val} sub={k.sub} cls={k.cls}/>
          </div>
        ))}
      </div>

      {/* Modal desglose KPI */}
      {kpiModal && (()=>{
        const lista = kpiModal==='pendiente' ? conFecha
          : kpiModal==='semana'    ? estaSemana
          : kpiModal==='vencidos'  ? vencidos
          : kpiModal==='sin_fecha' ? sinFecha
          : pagados
        const titulo = kpiModal==='pendiente'?'⏳ Por pagar':kpiModal==='semana'?'📅 Esta semana':kpiModal==='vencidos'?'🚨 Vencidos':kpiModal==='sin_fecha'?'⚠️ Sin fecha asignada':'✅ Pagado'
        const agrup = {}
        lista.forEach(r=>{ const k=r._circ.id; if(!agrup[k]) agrup[k]={circ:r._circ,rows:[]}; agrup[k].rows.push(r) })
        return (
          <div onClick={e=>e.target===e.currentTarget&&setKpiModal(null)}
            style={{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
            <div style={{background:'#fff',borderRadius:16,width:'min(760px,95vw)',maxHeight:'85vh',overflowY:'auto',boxShadow:'0 8px 40px rgba(0,0,0,.2)'}}>
              <div style={{padding:'20px 24px',borderBottom:'1px solid #ece7df',display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',top:0,background:'#fff',zIndex:1}}>
                <div>
                  <h3 style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:18,fontWeight:700}}>{titulo}</h3>
                  <div style={{fontSize:12,color:'#8a8278',marginTop:2}}>
                    {lista.length} servicio{lista.length!==1?'s':''} · {fmtMXN(sumMXN(lista))} MN{sumUSD(lista)>0?' · '+fmtUSD(sumUSD(lista))+' USD':''}
                  </div>
                </div>
                <button onClick={()=>setKpiModal(null)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#aaa'}}>✕</button>
              </div>
              {lista.length===0
                ? <div style={{padding:40,textAlign:'center',color:'#8a8278'}}>Sin servicios en esta categoría</div>
                : Object.values(agrup).map(({circ,rows})=>(
                  <div key={circ.id}>
                    <div style={{padding:'8px 24px',background:'#f5f1eb',borderBottom:'1px solid #ece7df',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div>
                        <span style={{fontSize:12,fontWeight:700}}>{circ.id.split('-').slice(-3).join('-')}</span>
                        {circ.info?.tl&&<span style={{fontSize:11,color:'#8a8278',marginLeft:8}}>{circ.info.tl}</span>}
                      </div>
                      <span style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,color:'#b83232'}}>
                        {fmtMXN(sumMXN(rows))+' MN'}{sumUSD(rows)>0&&' · '+fmtUSD(sumUSD(rows))+' USD'}
                      </span>
                    </div>
                    {rows.map(r=>(
                      <div key={r.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 24px',borderBottom:'1px solid #f5f1eb'}}>
                        <div>
                          <div style={{fontWeight:600,fontSize:13}}>{r.prov_general||'—'} <span style={{fontWeight:400,color:'#8a8278',fontSize:12}}>· {r.servicio||'—'}</span></div>
                          <div style={{display:'flex',gap:6,marginTop:3,alignItems:'center',flexWrap:'wrap'}}>
                            <Badge text={r.clasificacion}/>
                            {r.fecha_pago&&<span style={{fontSize:10,color:'#1565a0',fontWeight:600}}>📅 {r.fecha_pago}</span>}
                            {r.folio_factura&&<span style={{fontSize:10,color:'#8a8278'}}>Folio: {r.folio_factura}</span>}
                          </div>
                        </div>
                        <div style={{textAlign:'right',minWidth:100}}>
                          {r._mxn>0&&<div style={{fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:13}}>{fmtMXN(r._mxn)} <span style={{fontSize:10,color:'#8a8278'}}>MN</span></div>}
                          {r._usd>0&&<div style={{fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:13,color:'#1565a0'}}>{fmtUSD(r._usd)} <span style={{fontSize:10}}>USD</span></div>}
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              }
            </div>
          </div>
        )
      })()}

      {/* Calendario */}
      <div style={{background:'#fff',borderRadius:12,padding:20,boxShadow:'0 2px 16px rgba(18,21,31,.07)',marginBottom:24}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
          <h3 style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:17,fontWeight:700}}>
            {MESES_NOM[mesVista.m]} {mesVista.y}
          </h3>
          <div style={{display:'flex',gap:6}}>
            <button onClick={()=>setMesVista(p=>{const d=new Date(p.y,p.m-1,1);return{y:d.getFullYear(),m:d.getMonth()}})}
              style={{background:'#f5f1eb',border:'none',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:14}}>‹</button>
            <button onClick={()=>setMesVista(p=>{const d=new Date(p.y,p.m+1,1);return{y:d.getFullYear(),m:d.getMonth()}})}
              style={{background:'#f5f1eb',border:'none',borderRadius:6,padding:'4px 10px',cursor:'pointer',fontSize:14}}>›</button>
          </div>
        </div>

        {/* Grid del calendario */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4}}>
          {DIAS_SEM.map(d=>(
            <div key={d} style={{textAlign:'center',fontSize:10,fontWeight:700,color:'#8a8278',textTransform:'uppercase',letterSpacing:.6,padding:'4px 0'}}>{d}</div>
          ))}
          {celdas.map((d,i)=>{
            if (!d) return <div key={i}/>
            const k = diaKey(d)
            const pagos = porFecha[k] || []
            const pagadosDia = porFechaPagado[k] || []
            const mxnDia = pagos.reduce((a,r)=>a+r._mxn,0)
            const usdDia = pagos.reduce((a,r)=>a+r._usd,0)
            const esHoy = k === dateToLocalStr(today)
            const esSel = k === diaSeleccionado
            const vencido = pagos.length>0 && new Date(k)<today
            const hayPagos = pagos.length > 0
            const hayPagadosDia = pagadosDia.length > 0
            return (
              <div key={i} onClick={()=>setDiaSeleccionado(esSel?null:k)}
                style={{
                  minHeight:100, padding:7, borderRadius:8, cursor:(hayPagos||hayPagadosDia)?'pointer':'default',
                  border: esSel?'2px solid #b8952a': esHoy?'2px solid #52b788':'1px solid #ece7df',
                  background: esSel?'#fffbf0': vencido&&hayPagos?'#fff5f5': hayPagos?'#f0f6ff':'#fafaf8',
                  transition:'all .15s'
                }}>
                <div style={{fontSize:16,fontWeight:esHoy?800:700,color:esHoy?'#1e5c3a':vencido&&hayPagos?'#b83232':'#12151f',marginBottom:5}}>{d}</div>
                {mxnDia>0&&<div style={{fontSize:11,fontWeight:700,color:'#b83232',fontFamily:"'IBM Plex Mono',monospace",lineHeight:1.5}}>{fmtMXN(mxnDia)} <span style={{fontSize:9,fontWeight:700}}>MN</span></div>}
                {usdDia>0&&<div style={{fontSize:11,fontWeight:700,color:'#1565a0',fontFamily:"'IBM Plex Mono',monospace",lineHeight:1.5}}>{fmtUSD(usdDia)} <span style={{fontSize:9,fontWeight:700}}>USD</span></div>}
                {hayPagadosDia&&<div style={{fontSize:10,color:'#52b788',fontWeight:700,marginTop:3}}>✅ {pagadosDia.length} pag.</div>}
                {hayPagos&&<div style={{fontSize:10,color:vencido?'#b83232':'#8a8278',fontWeight:600,marginTop:1}}>{pagos.length} pend.</div>}
              </div>
            )
          })}
        </div>

        {/* Panel de día seleccionado — agrupado por circuito, pendientes+pagados juntos */}
        {diaSeleccionado && (()=>{
          const pendDia = porFecha[diaSeleccionado] || []
          const pagDia  = porFechaPagado[diaSeleccionado] || []
          if(pendDia.length===0 && pagDia.length===0) return null

          // Unir todo y agrupar por circuito
          const agCirc = {}
          ;[...pendDia, ...pagDia].forEach(r => {
            const k = r._circ.id
            if(!agCirc[k]) agCirc[k] = { circ: r._circ, pend: [], pag: [] }
            if(r.paid) agCirc[k].pag.push(r)
            else       agCirc[k].pend.push(r)
          })

          return (
            <div style={{marginTop:20,borderTop:'2px solid #ece7df',paddingTop:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                <div>
                  <h4 style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:16,fontWeight:700,marginBottom:3}}>
                    {new Date(diaSeleccionado+'T12:00:00').toLocaleDateString('es-MX',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}
                  </h4>
                  <div style={{display:'flex',gap:12,fontSize:12}}>
                    {pendDia.length>0&&<span style={{color:'#b83232',fontWeight:600}}>⏳ {pendDia.length} pendiente{pendDia.length!==1?'s':''} · {fmtMXN(sumMXN(pendDia))} MN{sumUSD(pendDia)>0?' · '+fmtUSD(sumUSD(pendDia))+' USD':''}</span>}
                    {pagDia.length>0&&<span style={{color:'#1e5c3a',fontWeight:600}}>✅ {pagDia.length} pagado{pagDia.length!==1?'s':''} · {fmtMXN(sumMXN(pagDia))} MN{sumUSD(pagDia)>0?' · '+fmtUSD(sumUSD(pagDia))+' USD':''}</span>}
                  </div>
                </div>
                <button onClick={()=>setDiaSeleccionado(null)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:18}}>✕</button>
              </div>

              {Object.values(agCirc).map(({circ, pend, pag})=>{
                const totPendMXN = sumMXN(pend), totPendUSD = sumUSD(pend)
                const totPagMXN  = sumMXN(pag),  totPagUSD  = sumUSD(pag)
                return (
                  <div key={circ.id} style={{borderRadius:10,border:'1px solid #ece7df',marginBottom:12,overflow:'hidden'}}>
                    {/* Header del circuito */}
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 14px',background:'#12151f',color:'#fff'}}>
                      <div>
                        <span style={{fontSize:12,fontWeight:700,color:'#e0c96a'}}>{circ.id.split('-').slice(-3).join('-')}</span>
                        {circ.info?.tl&&<span style={{fontSize:10,color:'rgba(255,255,255,.5)',marginLeft:8}}>TL: {circ.info.tl}</span>}
                      </div>
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        {pend.length>0&&<span style={{fontSize:10,color:'#fca5a5',fontFamily:"'IBM Plex Mono',monospace"}}>⏳ {fmtMXN(totPendMXN)} MN{totPendUSD>0?' / '+fmtUSD(totPendUSD)+' USD':''}</span>}
                        {pag.length>0&&<span style={{fontSize:10,color:'#86efac',fontFamily:"'IBM Plex Mono',monospace"}}>✅ {fmtMXN(totPagMXN)} MN{totPagUSD>0?' / '+fmtUSD(totPagUSD)+' USD':''}</span>}
                        <button onClick={()=>onGoCircuit(circ.id)} style={{background:'none',border:'1px solid rgba(255,255,255,.2)',color:'rgba(255,255,255,.7)',borderRadius:5,padding:'2px 8px',fontSize:10,cursor:'pointer'}}>Ver →</button>
                      </div>
                    </div>
                    {/* Pendientes primero */}
                    {pend.map(r=><RowPendiente key={r.id} r={r} showDate={false}/>)}
                    {/* Pagados debajo con fondo diferenciado */}
                    {pag.map(r=><RowPagado key={r.id} r={r} showDate={false}/>)}
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>

      {/* Lista de servicios */}
      <div style={{background:'#fff',borderRadius:12,boxShadow:'0 2px 16px rgba(18,21,31,.07)',overflow:'hidden'}}>
        <div style={{padding:'16px 20px',borderBottom:'1px solid #ece7df'}}>
          <h3 style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:17,fontWeight:700,marginBottom:12}}>Todos los servicios</h3>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            <FBtn id="todos"     lbl="Por pagar"      cnt={conFecha.length}    color="#12151f"/>
            <FBtn id="semana"    lbl="Esta semana"    cnt={estaSemana.length}  color="#1565a0"/>
            <FBtn id="vencidos"  lbl="🚨 Vencidos"    cnt={vencidos.length}    color="#b83232"/>
            <FBtn id="sin_fecha" lbl="⚠️ Sin fecha"   cnt={sinFecha.length}    color="#b8952a"/>
            <FBtn id="pagados"   lbl="✅ Pagados"      cnt={pagados.length}     color="#1e5c3a"/>
          </div>
        </div>

        {listaFiltrada.length===0
          ? <div style={{padding:40,textAlign:'center',color:'#8a8278',fontSize:13}}>
              {filtro==='sin_fecha' ? '✅ Todos los servicios tienen fecha asignada' : '✅ Sin registros en esta categoría'}
            </div>
          : <div>
              {Object.values(porCircuitoLista).map(({circ,rows})=>(
                <div key={circ.id}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 16px',background: filtro==='pagados'?'#f0faf4':'#f5f1eb',borderBottom:'1px solid #ece7df'}}>
                    <div>
                      <span style={{fontSize:11,fontWeight:700,color:'#12151f'}}>{circ.id.split('-').slice(-3).join('-')}</span>
                      {circ.info?.tl&&<span style={{fontSize:10,color:'#8a8278',marginLeft:8}}>{circ.info.tl}</span>}
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      {(()=>{const m=rows.reduce((a,r)=>a+r._mxn,0);const u=rows.reduce((a,r)=>a+r._usd,0);const col=filtro==='pagados'?'#1e5c3a':'#b83232';return<span style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:col,fontWeight:700}}>{m>0&&fmtMXN(m)+' MN'}{m>0&&u>0&&' · '}{u>0&&fmtUSD(u)+' USD'}</span>})()}
                      <button onClick={()=>onGoCircuit(circ.id)} style={{background:'none',border:'1px solid #d8d2c8',color:'#8a8278',borderRadius:5,padding:'2px 8px',fontSize:10,cursor:'pointer'}}>Ver →</button>
                    </div>
                  </div>
                  {rows.map(r => filtro==='pagados'
                    ? <RowPagado   key={r.id} r={r} showDate={true}/>
                    : <RowPendiente key={r.id} r={r} showDate={filtro!=='sin_fecha'}/>
                  )}
                </div>
              ))}
            </div>
        }
      </div>

      {exportModal && (
        <ExportPagosModal
          circuits={circuits}
          tarifario={tarifario}
          TC={TC}
          initial={exportModal}
          onClose={() => setExportModal(null)}
        />
      )}
      {marcarPagadosModal && (
        <MarcarPagadosModal
          circuits={circuits}
          tarifario={tarifario}
          initial={marcarPagadosModal}
          togglePaid={togglePaid}
          onClose={() => setMarcarPagadosModal(null)}
        />
      )}
      {validarFlujoModal && (
        <ValidarFlujoModal
          circuits={circuits}
          tarifario={tarifario}
          initial={validarFlujoModal}
          onClose={() => setValidarFlujoModal(null)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// ExportPagosModal — Exporta pagos pendientes a Excel formato flujo de efectivo
// ═══════════════════════════════════════════════════════════════════
function ExportPagosModal({ circuits, tarifario, TC, initial, onClose }) {
  const [desde, setDesde] = useState(initial.desde)
  const [hasta, setHasta] = useState(initial.hasta)

  // ── Cálculo de servicios que se van a exportar ────────────────────
  const { filasExport, resumen } = useMemo(() => {
    if (!desde || !hasta) return { filasExport: [], resumen: { servicios:0, circuitos:0, mn:0, usd:0 } }
    const dDesde = parseLocalDate(desde)
    const dHasta = parseLocalDate(hasta)
    if (!dDesde || !dHasta || dDesde > dHasta) return { filasExport: [], resumen: { servicios:0, circuitos:0, mn:0, usd:0 } }

    // Índice razón social por proveedor (upper trim)
    const rsIndex = {}
    tarifario.forEach(t => {
      if (t.proveedor && t.razon_social) {
        rsIndex[String(t.proveedor).toUpperCase().trim()] = t.razon_social
      }
    })

    // Colectar rows: pendientes (paid=false) con fecha_pago en rango
    // Guardo por (circuito_id, proveedor_norm, clasificacion, moneda) para agrupar
    const grupos = {} // key -> { circ, rows: [], moneda }
    circuits.forEach(circ => {
      circ.rows.forEach(r => {
        if (r.paid) return
        if (!r.fecha_pago) return
        const fp = parseLocalDate(r.fecha_pago)
        if (!fp) return
        if (fp < dDesde || fp > dHasta) return
        const { mxn, usd } = getImporte(r, circ.info, tarifario)
        const imp = mxn > 0 ? mxn : usd
        if (!imp || imp <= 0) return
        const moneda = usd > 0 ? 'USD' : 'MN'
        const provNorm = (r.prov_general || '').toUpperCase().trim()
        const clas = (r.clasificacion || '').toUpperCase().trim()
        // Agrupación: sólo HOSPEDAJE del mismo (circuito+proveedor+moneda) se junta
        // Los demás quedan como línea individual (key único por r.id)
        const isHospedaje = clas === 'HOSPEDAJE'
        const key = isHospedaje
          ? `H|${circ.id}|${provNorm}|${moneda}`
          : `S|${r.id}`
        if (!grupos[key]) {
          grupos[key] = { circ, prov_general: r.prov_general || '', clasificacion: r.clasificacion || '', moneda, rows: [] }
        }
        grupos[key].rows.push({ r, fp, imp, fs: r.fecha ? parseLocalDate(r.fecha) : null })
      })
    })

    // Convertir grupos a filas del Excel
    const filas = []
    Object.entries(grupos).forEach(([key, g]) => {
      // Ordenar por fecha del SERVICIO (no fecha de pago) para agrupar hospedajes correctamente
      // Si un row no tiene fecha de servicio, cae al final
      g.rows.sort((a, b) => {
        if (!a.fs && !b.fs) return a.fp - b.fp
        if (!a.fs) return 1
        if (!b.fs) return -1
        return a.fs - b.fs
      })
      // Fecha de pago del grupo: usamos la primera (la más temprana)
      const fechaPagoGrupo = g.rows[0].fp
      // Importe total
      const importeTotal = g.rows.reduce((s, x) => s + x.imp, 0)
      // Concepto: usa la FECHA DEL SERVICIO (no la de pago)
      //   - HOSPEDAJE: "HOSPEDAJE DEL X AL Y DE MES" donde Y = último_día_servicio + 1 (checkout)
      //     • 1 noche: "HOSPEDAJE DEL 13 AL 14 DE AGOSTO"
      //     • 2 noches (13 y 14): "HOSPEDAJE DEL 13 AL 15 DE AGOSTO"
      //   - Otros: "{CLASIFICACION} {DD} {MES}" con fecha del servicio
      const clas = (g.clasificacion || '').toUpperCase().trim()
      const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
      const MESES_CORTO = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
      // Fecha del servicio para el concepto: si no hay, fallback a fecha de pago
      const fsPrimera = g.rows[0].fs || g.rows[0].fp
      const fsUltima  = g.rows[g.rows.length - 1].fs || g.rows[g.rows.length - 1].fp
      let concepto
      if (clas === 'HOSPEDAJE') {
        // Sumar +1 día al último para el checkout
        const checkout = new Date(fsUltima); checkout.setDate(checkout.getDate() + 1)
        concepto = `HOSPEDAJE DEL ${fsPrimera.getDate()} AL ${checkout.getDate()} DE ${MESES[fsPrimera.getMonth()]}`
      } else {
        concepto = `${clas} ${String(fsPrimera.getDate()).padStart(2,'0')} ${MESES_CORTO[fsPrimera.getMonth()]}`
      }
      // Razón social
      const rs = rsIndex[(g.prov_general || '').toUpperCase().trim()] || g.prov_general || ''
      // Destino: del primer row
      const destino = g.rows[0].r.destino || ''
      filas.push({
        rubro: 'Circuitos',
        segmento: 'Circuitos',
        egresos: rs,
        nombre_comercial: g.prov_general,
        destino,
        fecha_pago: fechaPagoGrupo,
        importe: importeTotal,
        moneda: g.moneda,
        concepto,
        nombre_circuito: g.circ.id,
      })
    })

    // Ordenar filas: primero por moneda (MN antes de USD), luego por fecha de pago, luego por razón social
    filas.sort((a, b) => {
      if (a.moneda !== b.moneda) return a.moneda === 'MN' ? -1 : 1
      if (a.fecha_pago - b.fecha_pago !== 0) return a.fecha_pago - b.fecha_pago
      return a.egresos.localeCompare(b.egresos)
    })

    const totalMn = filas.filter(f => f.moneda === 'MN').reduce((s, f) => s + f.importe, 0)
    const totalUsd = filas.filter(f => f.moneda === 'USD').reduce((s, f) => s + f.importe, 0)
    const circuitosUnicos = new Set(filas.map(f => f.nombre_circuito)).size

    return {
      filasExport: filas,
      resumen: { servicios: filas.length, circuitos: circuitosUnicos, mn: totalMn, usd: totalUsd }
    }
  }, [circuits, tarifario, desde, hasta])

  // ── Validaciones automáticas antes de exportar ────────────────────
  const alertas = useMemo(() => {
    if (filasExport.length === 0) return { criticas: [], revisar: [], warnings: [], okCount: 0 }
    // También necesito revisar las filas ANTES de agrupar (por si un servicio individual tiene problema)
    // Reconstruyo la lista de rows individuales del rango
    if (!desde || !hasta) return { criticas: [], revisar: [], warnings: [], okCount: 0 }
    const dDesde = parseLocalDate(desde)
    const dHasta = parseLocalDate(hasta)
    if (!dDesde || !dHasta) return { criticas: [], revisar: [], warnings: [], okCount: 0 }

    const rsIndex = {}
    tarifario.forEach(t => {
      if (t.proveedor && t.razon_social) {
        rsIndex[String(t.proveedor).toUpperCase().trim()] = t.razon_social
      }
    })

    const criticas = []
    const revisar = []
    const warnings = []
    // Total de rows (individuales, sin agrupar) para el conteo final "OK"
    let totalRows = 0
    // Track para detectar duplicados por (circuito+proveedor+moneda+importe+fecha)
    const dedupSeen = {}

    circuits.forEach(circ => {
      circ.rows.forEach(r => {
        if (r.paid) return
        if (!r.fecha_pago) return
        const fp = parseLocalDate(r.fecha_pago)
        if (!fp) return
        if (fp < dDesde || fp > dHasta) return
        const { mxn, usd } = getImporte(r, circ.info, tarifario)
        const imp = mxn > 0 ? mxn : usd
        const moneda = usd > 0 ? 'USD' : 'MN'
        totalRows++
        const circIdCorto = circ.id.split('-').slice(-3).join('-')
        const provDisplay = r.prov_general || '(sin proveedor)'
        const clas = (r.clasificacion || '').toUpperCase().trim()

        // CRÍTICO: sin proveedor
        if (!r.prov_general || r.prov_general.trim() === '') {
          criticas.push({
            tipo: 'sin_proveedor',
            circuito: circIdCorto,
            servicio: r.servicio || '(sin servicio)',
            fecha: fp,
            mensaje: `Servicio sin proveedor asignado — no se sabe a quién pagar`
          })
        }

        // CRÍTICO: importe cero o inválido
        if (!imp || imp <= 0) {
          criticas.push({
            tipo: 'importe_cero',
            circuito: circIdCorto,
            proveedor: provDisplay,
            servicio: r.servicio || '',
            fecha: fp,
            mensaje: `Importe = 0 — no se sabe cuánto pagar`
          })
        }

        // REVISAR: sin razón social (se usará nombre comercial como fallback)
        if (r.prov_general) {
          const rs = rsIndex[r.prov_general.toUpperCase().trim()]
          if (!rs) {
            revisar.push({
              tipo: 'sin_razon_social',
              circuito: circIdCorto,
              proveedor: provDisplay,
              fecha: fp,
              importe: imp,
              moneda,
              mensaje: `Sin razón social capturada — se usará "${provDisplay}" en EGRESOS`
            })
          }
        }

        // REVISAR: sin clasificación
        if (!clas) {
          revisar.push({
            tipo: 'sin_clasificacion',
            circuito: circIdCorto,
            proveedor: provDisplay,
            fecha: fp,
            mensaje: `Sin clasificación — concepto quedará vacío`
          })
        }

        // WARNING: detectar duplicados (mismo circuito+prov+moneda+importe+fecha)
        const dupKey = `${circ.id}|${(r.prov_general||'').toUpperCase().trim()}|${moneda}|${imp}|${fp.getTime()}`
        if (dedupSeen[dupKey]) {
          warnings.push({
            tipo: 'posible_duplicado',
            circuito: circIdCorto,
            proveedor: provDisplay,
            fecha: fp,
            importe: imp,
            moneda,
            mensaje: `Posible duplicado: ${provDisplay} con mismo importe y misma fecha en el mismo circuito`
          })
        } else {
          dedupSeen[dupKey] = true
        }

        // WARNING: fecha de pago muy alejada del inicio del circuito
        const fechaInicioCirc = circ.info?.fecha_inicio ? parseLocalDate(circ.info.fecha_inicio) : null
        if (fechaInicioCirc && clas !== 'HOSPEDAJE') {
          const diffDias = Math.abs((fp - fechaInicioCirc) / (1000*60*60*24))
          if (diffDias > 30) {
            warnings.push({
              tipo: 'fecha_lejana',
              circuito: circIdCorto,
              proveedor: provDisplay,
              fecha: fp,
              mensaje: `Fecha de pago ${fp.toLocaleDateString('es-MX')} está a ${Math.round(diffDias)} días del inicio del circuito`
            })
          }
        }
      })
    })

    // Detectar mismo proveedor en el MISMO circuito con importes muy distintos (posible typo)
    const provPorCirc = {}
    circuits.forEach(circ => {
      circ.rows.forEach(r => {
        if (r.paid || !r.fecha_pago) return
        const fp = parseLocalDate(r.fecha_pago)
        if (!fp || fp < dDesde || fp > dHasta) return
        const { mxn, usd } = getImporte(r, circ.info, tarifario)
        const imp = mxn > 0 ? mxn : usd
        if (!imp || imp <= 0) return
        const key = `${circ.id}|${(r.prov_general||'').toUpperCase().trim()}|${usd > 0 ? 'USD' : 'MN'}`
        if (!provPorCirc[key]) provPorCirc[key] = []
        provPorCirc[key].push({ imp, r, circ, fp })
      })
    })
    Object.entries(provPorCirc).forEach(([k, items]) => {
      if (items.length < 2) return
      const imps = items.map(x => x.imp)
      const min = Math.min(...imps)
      const max = Math.max(...imps)
      // Si el mayor es más del doble del menor Y no es hospedaje (donde varias noches suelen tener el mismo precio, no muy distinto)
      // Solo alertamos si son muy distintos (2x o más)
      if (max > min * 2 && min > 0) {
        const first = items[0]
        warnings.push({
          tipo: 'importes_dispersos',
          circuito: first.circ.id.split('-').slice(-3).join('-'),
          proveedor: first.r.prov_general || '(sin proveedor)',
          mensaje: `${first.r.prov_general || 'Proveedor'} aparece ${items.length} veces en el circuito con importes muy distintos (${fmtMXN(min)} vs ${fmtMXN(max)}) — ¿posible typo?`
        })
      }
    })

    const okCount = totalRows - criticas.length - revisar.length - warnings.length
    return { criticas, revisar, warnings, okCount: Math.max(0, okCount) }
  }, [circuits, tarifario, desde, hasta, filasExport])

  // Generar días del rango
  const diasRango = useMemo(() => {
    if (!desde || !hasta) return []
    const d0 = parseLocalDate(desde); const d1 = parseLocalDate(hasta)
    if (!d0 || !d1 || d0 > d1) return []
    const arr = []
    const d = new Date(d0)
    while (d <= d1) {
      arr.push(new Date(d))
      d.setDate(d.getDate() + 1)
    }
    return arr
  }, [desde, hasta])

  // ── Descarga del Excel ────────────────────────────────────────────
  const descargar = () => {
    if (!window.XLSX) { alert('La librería de Excel aún se está cargando. Espera unos segundos y vuelve a intentar.'); return }
    if (filasExport.length === 0) { alert('No hay pagos pendientes en el rango seleccionado.'); return }

    const MESES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
    const fmtDia = d => `${String(d.getDate()).padStart(2,'0')}-${MESES_CORTO[d.getMonth()]}`

    // Headers exactos
    const headersFijosIzq = ['RUBRO', 'SEGMENTO', 'EGRESOS', 'NOMBRE COMERCIAL', 'DESTINO']
    const headersDias = diasRango.map(fmtDia)
    const headersFijosDer = ['TOTAL', 'MONEDA', 'CONCEPTO', 'NOMBRE']
    const headers = [...headersFijosIzq, ...headersDias, ...headersFijosDer]

    // Datos: array de arrays
    const aoa = [headers]
    filasExport.forEach(f => {
      const row = [f.rubro, f.segmento, f.egresos, f.nombre_comercial, f.destino]
      // Columnas de días: importe en la columna del día correcto
      diasRango.forEach(d => {
        const mismoDia = d.getFullYear() === f.fecha_pago.getFullYear() &&
                         d.getMonth() === f.fecha_pago.getMonth() &&
                         d.getDate() === f.fecha_pago.getDate()
        row.push(mismoDia ? f.importe : '')
      })
      // TOTAL, MONEDA, CONCEPTO, NOMBRE
      row.push(f.importe, f.moneda, f.concepto, f.nombre_circuito)
      aoa.push(row)
    })

    // Fila subtotal MN y USD
    const totalRowMn = ['TOTAL MN', '', '', '', '']
    const totalRowUsd = ['TOTAL USD', '', '', '', '']
    diasRango.forEach((d, idx) => {
      const iCol = 5 + idx  // 0-indexed column
      const mnDia = filasExport.filter(f => f.moneda==='MN' &&
        f.fecha_pago.getFullYear()===d.getFullYear() &&
        f.fecha_pago.getMonth()===d.getMonth() &&
        f.fecha_pago.getDate()===d.getDate()).reduce((s,f)=>s+f.importe, 0)
      const usdDia = filasExport.filter(f => f.moneda==='USD' &&
        f.fecha_pago.getFullYear()===d.getFullYear() &&
        f.fecha_pago.getMonth()===d.getMonth() &&
        f.fecha_pago.getDate()===d.getDate()).reduce((s,f)=>s+f.importe, 0)
      totalRowMn.push(mnDia || '')
      totalRowUsd.push(usdDia || '')
    })
    totalRowMn.push(resumen.mn, 'MN', '', '')
    totalRowUsd.push(resumen.usd, 'USD', '', '')
    aoa.push(totalRowMn)
    aoa.push(totalRowUsd)

    // Crear workbook
    const wb = window.XLSX.utils.book_new()
    const ws = window.XLSX.utils.aoa_to_sheet(aoa)

    // Anchos de columna
    const widths = [
      { wch: 11 }, { wch: 11 }, { wch: 42 }, { wch: 26 }, { wch: 18 },
      ...diasRango.map(() => ({ wch: 11 })),
      { wch: 12 }, { wch: 8 }, { wch: 34 }, { wch: 34 }
    ]
    ws['!cols'] = widths

    // Formato de moneda para columnas numéricas
    const colDiaStart = 5
    const colTotal = 5 + diasRango.length
    const range = window.XLSX.utils.decode_range(ws['!ref'])
    for (let R = 1; R <= range.e.r; R++) {
      for (let C = colDiaStart; C <= colTotal; C++) {
        const ref = window.XLSX.utils.encode_cell({ r: R, c: C })
        if (ws[ref] && typeof ws[ref].v === 'number') {
          ws[ref].z = '"$"#,##0.00'
        }
      }
    }

    window.XLSX.utils.book_append_sheet(wb, ws, 'Flujo de Efectivo')

    // Nombre de archivo
    const dEsp = parseLocalDate(desde)
    const dHst = parseLocalDate(hasta)
    const nombreArchivo = `pagos_${fmtDia(dEsp)}_al_${fmtDia(dHst)}.xlsx`
    window.XLSX.writeFile(wb, nombreArchivo)

    onClose()
  }

  const rangoValido = desde && hasta && parseLocalDate(desde) && parseLocalDate(hasta) && parseLocalDate(desde) <= parseLocalDate(hasta)

  return (
    <Modal title="📥 Exportar Excel de Flujo de Efectivo" onClose={onClose}>
      <p style={{color:'#8a8278',fontSize:13,marginBottom:16,lineHeight:1.5}}>
        Se exportarán únicamente los <strong>pagos pendientes</strong> con fecha de pago dentro del rango seleccionado.
      </p>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
        <div>
          <label style={{display:'block',fontSize:11,fontWeight:700,color:'#8a8278',textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}}>Desde</label>
          <input type="date" value={desde} onChange={e=>setDesde(e.target.value)}
            style={{width:'100%',border:'1.5px solid #d8d2c8',borderRadius:8,padding:'8px 12px',fontFamily:'inherit',fontSize:14,background:'#fff',outline:'none'}}/>
        </div>
        <div>
          <label style={{display:'block',fontSize:11,fontWeight:700,color:'#8a8278',textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}}>Hasta</label>
          <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)}
            style={{width:'100%',border:'1.5px solid #d8d2c8',borderRadius:8,padding:'8px 12px',fontFamily:'inherit',fontSize:14,background:'#fff',outline:'none'}}/>
        </div>
      </div>

      <div style={{background:'#f5f1eb',border:'1px solid #ece7df',borderRadius:8,padding:'12px 14px',marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,color:'#8a8278',textTransform:'uppercase',letterSpacing:0.5,marginBottom:8}}>
          📊 Vista previa del reporte
        </div>
        {!rangoValido ? (
          <div style={{fontSize:12,color:'#b83232',fontStyle:'italic'}}>Selecciona un rango de fechas válido</div>
        ) : (
          <>
            <div style={{fontSize:13,color:'#12151f',marginBottom:6}}>
              <strong>{resumen.servicios}</strong> {resumen.servicios===1?'servicio':'servicios'} pendientes
              &nbsp;·&nbsp;
              <strong>{resumen.circuitos}</strong> {resumen.circuitos===1?'circuito':'circuitos'} distintos
            </div>
            <div style={{fontSize:13,color:'#12151f'}}>
              {resumen.mn>0 && <span>Total <strong style={{color:'#12151f'}}>{fmtMXN(resumen.mn)} MN</strong></span>}
              {resumen.mn>0 && resumen.usd>0 && <span style={{color:'#8a8278'}}> · </span>}
              {resumen.usd>0 && <span>Total <strong style={{color:'#1565a0'}}>{fmtUSD(resumen.usd)} USD</strong></span>}
              {resumen.mn===0 && resumen.usd===0 && <span style={{color:'#8a8278',fontStyle:'italic'}}>No hay pagos pendientes en este rango</span>}
            </div>
          </>
        )}
      </div>

      {/* ── Panel de Auditor pre-exportación ────────────────────── */}
      {rangoValido && resumen.servicios > 0 && (
        <div style={{border:'1px solid #ece7df',borderRadius:8,marginBottom:16,overflow:'hidden'}}>
          <div style={{background:'#f5f1eb',padding:'8px 14px',fontSize:11,fontWeight:700,color:'#12151f',textTransform:'uppercase',letterSpacing:0.5,display:'flex',alignItems:'center',gap:6}}>
            🔍 Auditor de exportación
            {(alertas.criticas.length + alertas.revisar.length + alertas.warnings.length) === 0
              ? <span style={{background:'#d8f3dc',color:'#1b4332',padding:'1px 8px',borderRadius:10,fontSize:10,fontWeight:700}}>✅ Sin alertas</span>
              : <span style={{background:'#fff3d6',color:'#7d5a00',padding:'1px 8px',borderRadius:10,fontSize:10,fontWeight:700}}>{alertas.criticas.length + alertas.revisar.length + alertas.warnings.length} alertas</span>}
          </div>
          <div style={{maxHeight:220,overflowY:'auto',background:'#fff'}}>
            {alertas.criticas.length === 0 && alertas.revisar.length === 0 && alertas.warnings.length === 0 ? (
              <div style={{padding:'12px 14px',fontSize:12,color:'#1b4332',fontStyle:'italic'}}>
                ✅ Los {alertas.okCount} servicios están listos para exportar sin alertas.
              </div>
            ) : (
              <div style={{padding:'8px 14px'}}>
                {alertas.criticas.length > 0 && (
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#b83232',marginBottom:4}}>🔴 CRÍTICO ({alertas.criticas.length}) — revisar antes de pagar</div>
                    {alertas.criticas.map((a, i) => (
                      <div key={i} style={{fontSize:11,color:'#12151f',padding:'4px 8px',marginBottom:2,background:'#ffe0e0',borderRadius:4,lineHeight:1.4}}>
                        <strong>{a.circuito}</strong> · {a.mensaje}
                        {a.servicio && <span style={{color:'#8a8278'}}> ({a.servicio})</span>}
                      </div>
                    ))}
                  </div>
                )}
                {alertas.revisar.length > 0 && (
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#7d5a00',marginBottom:4}}>🟠 REVISAR ({alertas.revisar.length}) — se exportarán con fallback</div>
                    {alertas.revisar.slice(0, 10).map((a, i) => (
                      <div key={i} style={{fontSize:11,color:'#12151f',padding:'4px 8px',marginBottom:2,background:'#fff3d6',borderRadius:4,lineHeight:1.4}}>
                        <strong>{a.circuito}</strong> · {a.mensaje}
                      </div>
                    ))}
                    {alertas.revisar.length > 10 && (
                      <div style={{fontSize:10,color:'#8a8278',fontStyle:'italic',padding:'2px 8px'}}>...y {alertas.revisar.length - 10} más</div>
                    )}
                  </div>
                )}
                {alertas.warnings.length > 0 && (
                  <div>
                    <div style={{fontSize:11,fontWeight:700,color:'#1565a0',marginBottom:4}}>🟡 ADVERTENCIA ({alertas.warnings.length}) — posibles inconsistencias</div>
                    {alertas.warnings.slice(0, 10).map((a, i) => (
                      <div key={i} style={{fontSize:11,color:'#12151f',padding:'4px 8px',marginBottom:2,background:'#d6e7f5',borderRadius:4,lineHeight:1.4}}>
                        <strong>{a.circuito}</strong> · {a.mensaje}
                      </div>
                    ))}
                    {alertas.warnings.length > 10 && (
                      <div style={{fontSize:10,color:'#8a8278',fontStyle:'italic',padding:'2px 8px'}}>...y {alertas.warnings.length - 10} más</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{background:'#fef8e6',border:'1px solid #e0c96a',borderRadius:8,padding:'10px 14px',marginBottom:16}}>
        <div style={{fontSize:11,color:'#7d5a00',lineHeight:1.5}}>
          ✎ <strong>Notas del formato:</strong><br/>
          • Los hospedajes de varios días del mismo proveedor + circuito se agrupan en una línea con concepto "HOSPEDAJE DEL X AL Y DE MES".<br/>
          • Los servicios sin razón social capturada muestran el nombre comercial como fallback (podrás corregirlos en el Tarifario).
        </div>
      </div>

      <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
        <Btn outline onClick={onClose}>Cancelar</Btn>
        <Btn onClick={descargar} disabled={!rangoValido || resumen.servicios===0}>📥 Descargar</Btn>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════
// MarcarPagadosModal — Marca en bloque como pagados los servicios del rango
// ═══════════════════════════════════════════════════════════════════
function MarcarPagadosModal({ circuits, tarifario, initial, togglePaid, onClose }) {
  const [desde, setDesde] = useState(initial.desde)
  const [hasta, setHasta] = useState(initial.hasta)
  const [confirmando, setConfirmando] = useState(false)
  const [ejecutando, setEjecutando] = useState(false)

  const { servicios, resumen } = useMemo(() => {
    if (!desde || !hasta) return { servicios: [], resumen: { mn:0, usd:0, circuitos:0 } }
    const dDesde = parseLocalDate(desde)
    const dHasta = parseLocalDate(hasta)
    if (!dDesde || !dHasta || dDesde > dHasta) return { servicios: [], resumen: { mn:0, usd:0, circuitos:0 } }

    const lista = []
    circuits.forEach(circ => {
      circ.rows.forEach(r => {
        if (r.paid) return
        if (!r.fecha_pago) return
        const fp = parseLocalDate(r.fecha_pago)
        if (!fp || fp < dDesde || fp > dHasta) return
        const { mxn, usd } = getImporte(r, circ.info, tarifario)
        const imp = mxn > 0 ? mxn : usd
        if (!imp || imp <= 0) return
        lista.push({ circ, row: r, mxn, usd, fecha_pago: fp })
      })
    })

    const mn = lista.reduce((s,x) => s + x.mxn, 0)
    const usd = lista.reduce((s,x) => s + x.usd, 0)
    const circuitos = new Set(lista.map(x => x.circ.id)).size
    return { servicios: lista, resumen: { mn, usd, circuitos } }
  }, [circuits, tarifario, desde, hasta])

  const ejecutar = async () => {
    setEjecutando(true)
    // Ejecutar togglePaid en serie para no saturar; cada uno hace update en Supabase
    for (const s of servicios) {
      // togglePaid espera (cid, rowId, current); current=false porque queremos pasarlos a paid=true
      await togglePaid(s.circ.id, s.row.id, false)
    }
    setEjecutando(false)
    onClose()
  }

  const rangoValido = desde && hasta && parseLocalDate(desde) && parseLocalDate(hasta) && parseLocalDate(desde) <= parseLocalDate(hasta)

  return (
    <Modal title="✅ Marcar servicios como pagados" onClose={onClose}>
      <p style={{color:'#8a8278',fontSize:13,marginBottom:16,lineHeight:1.5}}>
        Marca en <strong>bloque</strong> todos los servicios pendientes con fecha de pago dentro del rango. Úsalo después de haber realizado los pagos reales para cerrar el ciclo y evitar que vuelvan a salir en próximas exportaciones.
      </p>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
        <div>
          <label style={{display:'block',fontSize:11,fontWeight:700,color:'#8a8278',textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}}>Desde</label>
          <input type="date" value={desde} onChange={e=>{setDesde(e.target.value);setConfirmando(false)}}
            style={{width:'100%',border:'1.5px solid #d8d2c8',borderRadius:8,padding:'8px 12px',fontFamily:'inherit',fontSize:14,background:'#fff',outline:'none'}}/>
        </div>
        <div>
          <label style={{display:'block',fontSize:11,fontWeight:700,color:'#8a8278',textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}}>Hasta</label>
          <input type="date" value={hasta} onChange={e=>{setHasta(e.target.value);setConfirmando(false)}}
            style={{width:'100%',border:'1.5px solid #d8d2c8',borderRadius:8,padding:'8px 12px',fontFamily:'inherit',fontSize:14,background:'#fff',outline:'none'}}/>
        </div>
      </div>

      <div style={{background:'#f5f1eb',border:'1px solid #ece7df',borderRadius:8,padding:'12px 14px',marginBottom:16}}>
        {!rangoValido ? (
          <div style={{fontSize:12,color:'#b83232',fontStyle:'italic'}}>Selecciona un rango de fechas válido</div>
        ) : servicios.length === 0 ? (
          <div style={{fontSize:12,color:'#8a8278',fontStyle:'italic'}}>No hay servicios pendientes en este rango.</div>
        ) : (
          <>
            <div style={{fontSize:13,color:'#12151f',marginBottom:6}}>
              Se marcarán como pagados <strong>{servicios.length}</strong> {servicios.length===1?'servicio':'servicios'} de <strong>{resumen.circuitos}</strong> {resumen.circuitos===1?'circuito':'circuitos'}
            </div>
            <div style={{fontSize:13,color:'#12151f'}}>
              {resumen.mn>0 && <span>Total <strong>{fmtMXN(resumen.mn)} MN</strong></span>}
              {resumen.mn>0 && resumen.usd>0 && <span style={{color:'#8a8278'}}> · </span>}
              {resumen.usd>0 && <span>Total <strong style={{color:'#1565a0'}}>{fmtUSD(resumen.usd)} USD</strong></span>}
            </div>
          </>
        )}
      </div>

      <div style={{background:'#ffe0e0',border:'1px solid #b83232',borderRadius:8,padding:'10px 14px',marginBottom:16}}>
        <div style={{fontSize:11,color:'#7f1d1d',lineHeight:1.5}}>
          ⚠ <strong>Esta acción no se puede deshacer en bloque.</strong> Si te equivocas, tendrías que desmarcar cada servicio uno por uno desde el módulo Pagos. Asegúrate de que los pagos reales ya se realizaron.
        </div>
      </div>

      <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
        <Btn outline onClick={onClose} disabled={ejecutando}>Cancelar</Btn>
        {!confirmando ? (
          <Btn onClick={()=>setConfirmando(true)} disabled={!rangoValido || servicios.length === 0}>
            Continuar →
          </Btn>
        ) : (
          <Btn onClick={ejecutar} disabled={ejecutando} style={{background:'#52b788',borderColor:'#52b788',color:'#fff'}}>
            {ejecutando ? `⏳ Marcando... (${servicios.length})` : `✅ Sí, marcar los ${servicios.length} como pagados`}
          </Btn>
        )}
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════
// ValidarFlujoModal — Audita el Excel maestro contra los datos de la app
// ═══════════════════════════════════════════════════════════════════
function ValidarFlujoModal({ circuits, tarifario, initial, onClose }) {
  const [desde, setDesde] = useState(initial.desde)
  const [hasta, setHasta] = useState(initial.hasta)
  const [file, setFile] = useState(null)
  const [hojasDetectadas, setHojasDetectadas] = useState([]) // [{ nombre, desde, hasta, incluida }]
  const [reporte, setReporte] = useState(null) // null | { ok:[], warn:[], falta:[], solo:[] }
  const [procesando, setProcesando] = useState(false)
  const fileRef = useRef(null)

  // Parseo el nombre de la hoja para extraer rango
  const parseNombreHoja = (nombre) => {
    // Patrones esperados:
    //   "01 AL 08 AGO"           → misma mes
    //   "06 AL 12 DE SEPT"       → misma mes con "DE"
    //   "30 DE AGOST AL 05 DE SEP"  → cambio de mes
    const MESES = {
      'ENE':0,'ENERO':0,'ENR':0,
      'FEB':1,'FEBRERO':1,
      'MAR':2,'MARZO':2,'MZO':2,
      'ABR':3,'ABRIL':3,
      'MAY':4,'MAYO':4,
      'JUN':5,'JUNIO':5,
      'JUL':6,'JULIO':6,
      'AGO':7,'AGOST':7,'AGOSTO':7,'AGT':7,
      'SEP':8,'SEPT':8,'SEPTIEMBRE':8,
      'OCT':9,'OCTUBRE':9,
      'NOV':10,'NOVIEMBRE':10,
      'DIC':11,'DICIEMBRE':11
    }
    const s = String(nombre).toUpperCase().trim()
    const currentYear = new Date().getFullYear()
    // Patrón cross-mes: "30 DE AGOST AL 05 DE SEP"
    let m = s.match(/^(\d{1,2})\s+DE\s+(\w+)\s+AL\s+(\d{1,2})\s+DE\s+(\w+)/)
    if (m) {
      const [_,d1,mes1,d2,mes2] = m
      const idx1 = MESES[mes1]; const idx2 = MESES[mes2]
      if (idx1 == null || idx2 == null) return null
      // Determinar año: si mes2 < mes1, es año siguiente
      const y1 = currentYear, y2 = idx2 < idx1 ? currentYear + 1 : currentYear
      return { desde: new Date(y1, idx1, parseInt(d1)), hasta: new Date(y2, idx2, parseInt(d2)) }
    }
    // Patrón mismo-mes: "01 AL 08 AGO" o "06 AL 12 DE SEPT"
    m = s.match(/^(\d{1,2})\s+AL\s+(\d{1,2})\s+(?:DE\s+)?(\w+)/)
    if (m) {
      const [_,d1,d2,mes] = m
      const idx = MESES[mes]
      if (idx == null) return null
      return { desde: new Date(currentYear, idx, parseInt(d1)), hasta: new Date(currentYear, idx, parseInt(d2)) }
    }
    return null
  }

  const handleFileChange = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setReporte(null)
    if (!window.XLSX) { alert('La librería de Excel aún se está cargando. Espera unos segundos y vuelve a intentar.'); return }
    try {
      const buf = await f.arrayBuffer()
      const wb = window.XLSX.read(buf, { type: 'array', cellDates: true })
      const dDesde = parseLocalDate(desde)
      const dHasta = parseLocalDate(hasta)
      const hojas = wb.SheetNames.map(nombre => {
        const rango = parseNombreHoja(nombre)
        const incluida = rango && dDesde && dHasta && !(rango.hasta < dDesde || rango.desde > dHasta)
        return { nombre, rango, incluida: !!incluida }
      })
      setHojasDetectadas(hojas)
    } catch(err) {
      alert('No pude leer el Excel: ' + err.message)
    }
  }

  // Cuando cambia el rango, recalculo qué hojas están incluidas
  useEffect(() => {
    if (hojasDetectadas.length === 0) return
    const dDesde = parseLocalDate(desde)
    const dHasta = parseLocalDate(hasta)
    setHojasDetectadas(hojas => hojas.map(h => ({
      ...h,
      incluida: h.rango && dDesde && dHasta && !(h.rango.hasta < dDesde || h.rango.desde > dHasta)
    })))
  // eslint-disable-next-line
  }, [desde, hasta])

  const auditar = async () => {
    if (!file || !window.XLSX) { alert('Sube el Excel primero'); return }
    const dDesde = parseLocalDate(desde)
    const dHasta = parseLocalDate(hasta)
    if (!dDesde || !dHasta || dDesde > dHasta) { alert('Rango de fechas inválido'); return }
    setProcesando(true)

    try {
      // 1) Leer todas las filas relevantes del Excel
      const buf = await file.arrayBuffer()
      const wb = window.XLSX.read(buf, { type: 'array', cellDates: true })
      const hojasIncluidas = hojasDetectadas.filter(h => h.incluida)

      // Estructura de fila del Excel: extraeré RUBRO, EGRESOS, NOMBRE COMERCIAL, día del pago, TOTAL, MONEDA, CONCEPTO, NOMBRE
      const filasExcel = []
      hojasIncluidas.forEach(hoja => {
        const ws = wb.Sheets[hoja.nombre]
        if (!ws) return
        const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
        if (rows.length === 0) return
        // Buscar la fila de header — la que contenga RUBRO y SEGMENTO juntos (o al menos EGRESOS+MONEDA)
        // En algunos Excel el header está muy abajo (ej. fila 59) porque arriba hay saldos iniciales.
        // Se busca en TODA la hoja porque puede haber múltiples secciones.
        let headerRow = -1
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i]
          if (!r) continue
          const upper = r.map(c => String(c || '').trim().toUpperCase())
          // Header válido: tiene RUBRO Y SEGMENTO Y EGRESOS (todos juntos)
          if (upper.includes('RUBRO') && upper.includes('SEGMENTO') && upper.includes('EGRESOS')) {
            headerRow = i
            break
          }
        }
        if (headerRow === -1) return

        const headers = rows[headerRow].map(h => String(h || '').trim().toUpperCase())
        const idxRubro = headers.indexOf('RUBRO')
        const idxSegmento = headers.indexOf('SEGMENTO')
        const idxEgresos = headers.indexOf('EGRESOS')
        const idxNomCom = headers.indexOf('NOMBRE COMERCIAL')
        const idxDestino = headers.indexOf('DESTINO')
        const idxTotal = headers.indexOf('TOTAL')
        const idxMoneda = headers.indexOf('MONEDA')
        const idxConcepto = headers.indexOf('CONCEPTO')
        const idxNombre = headers.indexOf('NOMBRE')
        // Identificar columnas de días. Un día viene como "10-ago", "11-ago", "10-AGO", o incluso Date object
        const MESES = {'ENE':0,'FEB':1,'MAR':2,'ABR':3,'MAY':4,'JUN':5,'JUL':6,'AGO':7,'SEP':8,'OCT':9,'NOV':10,'DIC':11,
                       'JAN':0,'APR':3,'AUG':7,'DEC':11}
        const parseColDia = (v) => {
          if (!v) return null
          if (v instanceof Date) return v
          const s = String(v).trim().toUpperCase().replace(/\./g,'')
          // Formatos: "10-AGO", "10 AGO", "10AGO", "10/08", "10-AUG"
          let m = s.match(/^(\d{1,2})[\s\-\/]+([A-Z]{3,})/)
          if (m) {
            const d = parseInt(m[1]); const idx = MESES[m[2].substring(0,3)]
            if (idx == null) return null
            return new Date(new Date().getFullYear(), idx, d)
          }
          m = s.match(/^(\d{1,2})[\s\-\/]+(\d{1,2})/)
          if (m) return new Date(new Date().getFullYear(), parseInt(m[2])-1, parseInt(m[1]))
          return null
        }
        const diasColumns = []
        headers.forEach((h, ci) => {
          const d = parseColDia(h)
          if (d) diasColumns.push({ col: ci, fecha: d })
        })

        // Iterar filas de datos
        for (let i = headerRow + 1; i < rows.length; i++) {
          const r = rows[i]
          if (!r || r.length === 0) continue
          const rubro = String(r[idxRubro] || '').trim().toUpperCase()
          const segmento = String(r[idxSegmento] || '').trim().toUpperCase()
          // "Circuitos" puede estar en RUBRO (formato exportado por la app) o en SEGMENTO (formato del Excel maestro real)
          if (rubro !== 'CIRCUITOS' && segmento !== 'CIRCUITOS') continue
          const egresos = String(r[idxEgresos] || '').trim()
          const nomCom = String(r[idxNomCom] || '').trim()
          const nombre = String(r[idxNombre] || '').trim()
          const moneda = String(r[idxMoneda] || '').trim().toUpperCase()
          const concepto = String(r[idxConcepto] || '').trim()
          const total = parseAmt(r[idxTotal])
          // Fecha: la columna donde haya un importe
          let fechaPago = null; let importeDia = 0
          for (const dc of diasColumns) {
            const val = parseAmt(r[dc.col])
            if (val > 0) {
              fechaPago = dc.fecha
              importeDia = val
              break
            }
          }
          // Solo consideramos filas dentro del rango
          if (!fechaPago) continue
          if (fechaPago < dDesde || fechaPago > dHasta) continue
          filasExcel.push({
            hoja: hoja.nombre,
            rubro, egresos, nomCom, nombre, moneda, concepto,
            fechaPago, importe: total || importeDia,
            rowNum: i + 1,
          })
        }
      })

      // 2) Construir la lista de servicios de la app en el rango
      const rsIndex = {}
      tarifario.forEach(t => {
        if (t.proveedor && t.razon_social) {
          rsIndex[String(t.proveedor).toUpperCase().trim()] = t.razon_social
        }
      })

      const serviciosApp = []
      circuits.forEach(circ => {
        // Agrupar HOSPEDAJEs del mismo (circuito+prov+moneda) como se agrupan al exportar
        const grupos = {}
        circ.rows.forEach(r => {
          if (r.paid) return
          if (!r.fecha_pago) return
          const fp = parseLocalDate(r.fecha_pago)
          if (!fp || fp < dDesde || fp > dHasta) return
          const { mxn, usd } = getImporte(r, circ.info, tarifario)
          const imp = mxn > 0 ? mxn : usd
          if (!imp || imp <= 0) return
          const moneda = usd > 0 ? 'USD' : 'MN'
          const provNorm = (r.prov_general || '').toUpperCase().trim()
          const clas = (r.clasificacion || '').toUpperCase().trim()
          const isHosp = clas === 'HOSPEDAJE'
          const key = isHosp
            ? `H|${provNorm}|${moneda}`
            : `S|${r.id}`
          if (!grupos[key]) grupos[key] = { rows: [], prov: r.prov_general || '', moneda, clas }
          grupos[key].rows.push({ r, fp, imp })
        })

        Object.values(grupos).forEach(g => {
          g.rows.sort((a,b) => a.fp - b.fp)
          const fechaPago = g.rows[0].fp
          const importe = g.rows.reduce((s,x)=>s+x.imp, 0)
          const rs = rsIndex[g.prov.toUpperCase().trim()] || g.prov
          serviciosApp.push({
            circuito: circ.id,
            prov: g.prov,
            rs,
            moneda: g.moneda,
            fechaPago,
            importe,
            clas: g.clas,
          })
        })
      })

      // 3) Matching
      const norm = s => String(s || '').toUpperCase().trim()
      const sameDay = (a,b) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()

      const usadosExcel = new Set()
      const ok = []
      const warn = []
      const falta = []

      serviciosApp.forEach(s => {
        // Buscar mejor match en Excel usando RAZON SOCIAL (EGRESOS), no nombre comercial.
        // En el Excel maestro real de Flujo de Efectivo, el "nombre comercial" a veces es genérico
        // (ej: "CENOTES", "LANCHAS") mientras que EGRESOS es la razón social real y consistente.
        //
        // Nivel 1: circuito + razón social + moneda + importe + fecha exactos
        let match = filasExcel.findIndex((e,i) => !usadosExcel.has(i) &&
          norm(e.nombre) === norm(s.circuito) &&
          norm(e.egresos) === norm(s.rs) &&
          e.moneda === s.moneda &&
          Math.abs(e.importe - s.importe) < 0.01 &&
          sameDay(e.fechaPago, s.fechaPago))
        if (match >= 0) {
          usadosExcel.add(match)
          ok.push({ app: s, excel: filasExcel[match] })
          return
        }

        // Nivel 2a: circuito + razón social + moneda coinciden — pero importe o fecha distintos
        const candidatos2a = filasExcel
          .map((e,i)=>({e,i}))
          .filter(({e,i}) => !usadosExcel.has(i) && norm(e.nombre)===norm(s.circuito) && norm(e.egresos)===norm(s.rs) && e.moneda===s.moneda)
        if (candidatos2a.length > 0) {
          const {e,i} = candidatos2a[0]
          usadosExcel.add(i)
          const problemas = []
          if (Math.abs(e.importe - s.importe) >= 0.01) {
            problemas.push(`Importe app ${s.moneda==='USD'?fmtUSD(s.importe):fmtMXN(s.importe)} vs Excel ${s.moneda==='USD'?fmtUSD(e.importe):fmtMXN(e.importe)}`)
          }
          if (!sameDay(e.fechaPago, s.fechaPago)) {
            problemas.push(`Fecha app ${s.fechaPago.toLocaleDateString('es-MX')} vs Excel ${e.fechaPago.toLocaleDateString('es-MX')}`)
          }
          warn.push({ tipo:'partial_match', app: s, excel: e, mensaje: problemas.join(' · ') })
          return
        }

        // Nivel 2b: circuito + moneda + importe + fecha coinciden — razón social distinta
        const candidatos2b = filasExcel
          .map((e,i)=>({e,i}))
          .filter(({e,i}) => !usadosExcel.has(i) && norm(e.nombre)===norm(s.circuito) && e.moneda===s.moneda && Math.abs(e.importe-s.importe)<0.01 && sameDay(e.fechaPago, s.fechaPago))
        if (candidatos2b.length > 0) {
          const {e,i} = candidatos2b[0]
          usadosExcel.add(i)
          warn.push({ tipo:'rs_diff', app: s, excel: e, mensaje: `Razón social distinta: app "${s.rs}" vs Excel "${e.egresos}"` })
          return
        }

        // Nivel 2c: intentar con nombre comercial como fallback (por si Excel maestro sí lo tiene)
        const candidatos2c = filasExcel
          .map((e,i)=>({e,i}))
          .filter(({e,i}) => !usadosExcel.has(i) && norm(e.nombre)===norm(s.circuito) && norm(e.nomCom)===norm(s.prov) && e.moneda===s.moneda && Math.abs(e.importe-s.importe)<0.01 && sameDay(e.fechaPago, s.fechaPago))
        if (candidatos2c.length > 0) {
          const {e,i} = candidatos2c[0]
          usadosExcel.add(i)
          ok.push({ app: s, excel: e })
          return
        }

        // Sin match: falta en el flujo
        falta.push({ app: s })
      })

      // Detectar duplicados en el Excel (misma fila lógica repetida)
      const dupsMap = {}
      filasExcel.forEach((e,i) => {
        const key = `${norm(e.nombre)}|${norm(e.nomCom)}|${e.moneda}|${e.importe}|${e.fechaPago.getTime()}`
        if (!dupsMap[key]) dupsMap[key] = []
        dupsMap[key].push({ e, i })
      })
      const duplicados = []
      Object.values(dupsMap).forEach(arr => {
        if (arr.length > 1) duplicados.push(arr)
      })

      // Filas del Excel que no se usaron (solo Excel — informativo, no crítico)
      const soloExcel = filasExcel
        .map((e,i)=>({e,i}))
        .filter(({i})=>!usadosExcel.has(i))
        .map(({e})=>e)

      setReporte({ ok, warn, falta, soloExcel, duplicados, totalApp: serviciosApp.length, totalExcel: filasExcel.length })
    } catch (err) {
      alert('Error al auditar: ' + err.message)
    } finally {
      setProcesando(false)
    }
  }

  const rangoValido = desde && hasta && parseLocalDate(desde) && parseLocalDate(hasta) && parseLocalDate(desde) <= parseLocalDate(hasta)

  return (
    <Modal title="📤 Validar Flujo Maestro contra la app" onClose={onClose}>
      {!reporte ? (
        <>
          <p style={{color:'#8a8278',fontSize:13,marginBottom:16,lineHeight:1.5}}>
            Sube tu Excel de flujo de efectivo y compararé fila por fila contra los datos de la app. Solo se auditan filas con <strong>RUBRO="Circuitos"</strong>.
          </p>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
            <div>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:'#8a8278',textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}}>Desde</label>
              <input type="date" value={desde} onChange={e=>setDesde(e.target.value)}
                style={{width:'100%',border:'1.5px solid #d8d2c8',borderRadius:8,padding:'8px 12px',fontFamily:'inherit',fontSize:14,background:'#fff',outline:'none'}}/>
            </div>
            <div>
              <label style={{display:'block',fontSize:11,fontWeight:700,color:'#8a8278',textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}}>Hasta</label>
              <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)}
                style={{width:'100%',border:'1.5px solid #d8d2c8',borderRadius:8,padding:'8px 12px',fontFamily:'inherit',fontSize:14,background:'#fff',outline:'none'}}/>
            </div>
          </div>

          <div style={{marginBottom:16}}>
            <label style={{display:'block',fontSize:11,fontWeight:700,color:'#8a8278',textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}}>Excel maestro</label>
            <input type="file" ref={fileRef} accept=".xlsx,.xls" onChange={handleFileChange} style={{display:'none'}}/>
            <button onClick={()=>fileRef.current?.click()} style={{background:'#fff',color:'#12151f',border:'1.5px dashed #d8d2c8',borderRadius:8,padding:'10px 14px',fontSize:12,cursor:'pointer',fontFamily:'inherit',width:'100%',textAlign:'left'}}>
              📎 {file ? file.name : 'Elegir archivo…'}
            </button>
          </div>

          {hojasDetectadas.length > 0 && (
            <div style={{background:'#f5f1eb',border:'1px solid #ece7df',borderRadius:8,padding:'10px 14px',marginBottom:16,maxHeight:160,overflowY:'auto'}}>
              <div style={{fontSize:11,fontWeight:700,color:'#8a8278',textTransform:'uppercase',letterSpacing:0.5,marginBottom:6}}>
                Hojas detectadas ({hojasDetectadas.filter(h=>h.incluida).length} incluidas de {hojasDetectadas.length})
              </div>
              {hojasDetectadas.map((h,i) => (
                <div key={i} style={{fontSize:11,color:h.incluida?'#12151f':'#aaa',padding:'2px 0',display:'flex',alignItems:'center',gap:6}}>
                  {h.incluida ? '✅' : '⚪'} <strong>{h.nombre}</strong>
                  {h.rango && <span style={{color:'#8a8278'}}>({h.rango.desde.toLocaleDateString('es-MX')} — {h.rango.hasta.toLocaleDateString('es-MX')})</span>}
                  {!h.rango && <span style={{color:'#8a8278',fontStyle:'italic'}}>no reconozco el formato del nombre</span>}
                  {h.rango && !h.incluida && <span style={{color:'#aaa'}}>fuera del rango</span>}
                </div>
              ))}
            </div>
          )}

          <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
            <Btn outline onClick={onClose}>Cancelar</Btn>
            <Btn onClick={auditar} disabled={!rangoValido || !file || procesando || hojasDetectadas.filter(h=>h.incluida).length===0}>
              {procesando ? '⏳ Auditando...' : '🔍 Auditar'}
            </Btn>
          </div>
        </>
      ) : (
        <ReporteAuditoria reporte={reporte} desde={desde} hasta={hasta} onVolver={()=>setReporte(null)} onCerrar={onClose}/>
      )}
    </Modal>
  )
}

// Componente del reporte de auditoría
function ReporteAuditoria({ reporte, desde, hasta, onVolver, onCerrar }) {
  const { ok, warn, falta, soloExcel, duplicados, totalApp, totalExcel } = reporte
  const fmtF = d => d.toLocaleDateString('es-MX', { day:'2-digit', month:'short' })

  return (
    <>
      <div style={{background:'#12151f',color:'#e0c96a',padding:'10px 14px',borderRadius:8,marginBottom:12}}>
        <div style={{fontSize:11,textTransform:'uppercase',letterSpacing:0.5,marginBottom:4}}>REPORTE DE AUDITORÍA</div>
        <div style={{fontSize:13,color:'#fff'}}>Rango: <strong>{parseLocalDate(desde).toLocaleDateString('es-MX')}</strong> al <strong>{parseLocalDate(hasta).toLocaleDateString('es-MX')}</strong></div>
        <div style={{fontSize:11,color:'rgba(255,255,255,.6)',marginTop:4}}>{totalApp} servicios en la app · {totalExcel} filas de Circuitos en el Excel</div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:8,marginBottom:16}}>
        <div style={{background:'#d8f3dc',borderRadius:6,padding:8,textAlign:'center'}}>
          <div style={{fontSize:20,fontWeight:700,color:'#1b4332'}}>{ok.length}</div>
          <div style={{fontSize:10,color:'#1b4332'}}>✅ OK</div>
        </div>
        <div style={{background:'#d6e7f5',borderRadius:6,padding:8,textAlign:'center'}}>
          <div style={{fontSize:20,fontWeight:700,color:'#1565a0'}}>{warn.length}</div>
          <div style={{fontSize:10,color:'#1565a0'}}>🟡 Advertencias</div>
        </div>
        <div style={{background:'#ffe0e0',borderRadius:6,padding:8,textAlign:'center'}}>
          <div style={{fontSize:20,fontWeight:700,color:'#b83232'}}>{falta.length}</div>
          <div style={{fontSize:10,color:'#b83232'}}>🔴 Faltan</div>
        </div>
        <div style={{background:'#fff3d6',borderRadius:6,padding:8,textAlign:'center'}}>
          <div style={{fontSize:20,fontWeight:700,color:'#7d5a00'}}>{duplicados.length}</div>
          <div style={{fontSize:10,color:'#7d5a00'}}>🟠 Duplicados</div>
        </div>
      </div>

      <div style={{maxHeight:340,overflowY:'auto',border:'1px solid #ece7df',borderRadius:8,background:'#fff'}}>
        {falta.length > 0 && (
          <div style={{padding:'10px 14px',borderBottom:'1px solid #ece7df'}}>
            <div style={{fontSize:12,fontWeight:700,color:'#b83232',marginBottom:6}}>🔴 FALTAN EN EL FLUJO ({falta.length})</div>
            {falta.map((x,i) => (
              <div key={i} style={{fontSize:11,padding:'5px 8px',marginBottom:3,background:'#ffe0e0',borderRadius:4,lineHeight:1.4}}>
                <strong>{x.app.prov}</strong> · <span style={{color:'#8a8278'}}>{x.app.circuito.split('-').slice(-3).join('-')}</span> · {x.app.moneda==='USD'?fmtUSD(x.app.importe):fmtMXN(x.app.importe)} {x.app.moneda} · {fmtF(x.app.fechaPago)}
                <div style={{color:'#7f1d1d',fontSize:10,marginTop:2}}>No lo encontré en el Excel — ¿lo pegaste?</div>
              </div>
            ))}
          </div>
        )}

        {warn.length > 0 && (
          <div style={{padding:'10px 14px',borderBottom:'1px solid #ece7df'}}>
            <div style={{fontSize:12,fontWeight:700,color:'#1565a0',marginBottom:6}}>🟡 CON ADVERTENCIAS ({warn.length})</div>
            {warn.map((x,i) => (
              <div key={i} style={{fontSize:11,padding:'5px 8px',marginBottom:3,background:'#d6e7f5',borderRadius:4,lineHeight:1.4}}>
                <strong>{x.app.prov}</strong> · <span style={{color:'#8a8278'}}>{x.app.circuito.split('-').slice(-3).join('-')}</span> · <span style={{fontSize:10,color:'#8a8278'}}>fila {x.excel.rowNum} del Excel (hoja "{x.excel.hoja}")</span>
                <div style={{color:'#1e3a5c',fontSize:10,marginTop:2}}>{x.mensaje}</div>
                {x.tipo === 'rs_diff' && (
                  <div style={{fontSize:10,color:'#8a8278',marginTop:2}}>
                    App: <em>{x.app.rs}</em> · Excel: <em>{x.excel.egresos}</em>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {duplicados.length > 0 && (
          <div style={{padding:'10px 14px',borderBottom:'1px solid #ece7df'}}>
            <div style={{fontSize:12,fontWeight:700,color:'#7d5a00',marginBottom:6}}>🟠 POSIBLES DUPLICADOS EN EL EXCEL ({duplicados.length})</div>
            {duplicados.map((arr,i) => (
              <div key={i} style={{fontSize:11,padding:'5px 8px',marginBottom:3,background:'#fff3d6',borderRadius:4,lineHeight:1.4}}>
                <strong>{arr[0].e.nomCom}</strong> · {arr[0].e.moneda==='USD'?fmtUSD(arr[0].e.importe):fmtMXN(arr[0].e.importe)} {arr[0].e.moneda} en {fmtF(arr[0].e.fechaPago)}
                <div style={{color:'#7d5a00',fontSize:10,marginTop:2}}>
                  Aparece {arr.length} veces: filas {arr.map(x=>x.i+2).join(', ')} — ¿pegaste dos veces?
                </div>
              </div>
            ))}
          </div>
        )}

        {ok.length > 0 && (
          <div style={{padding:'10px 14px'}}>
            <div style={{fontSize:12,fontWeight:700,color:'#1b4332',marginBottom:6}}>✅ COINCIDENCIAS PERFECTAS ({ok.length})</div>
            <div style={{fontSize:11,color:'#8a8278',fontStyle:'italic'}}>
              Estos {ok.length} servicios están correctamente pegados en el Excel.
            </div>
          </div>
        )}

        {ok.length === 0 && warn.length === 0 && falta.length === 0 && duplicados.length === 0 && (
          <div style={{padding:20,textAlign:'center',color:'#8a8278',fontSize:12,fontStyle:'italic'}}>
            No hay servicios de la app en este rango para auditar.
          </div>
        )}
      </div>

      <div style={{display:'flex',justifyContent:'space-between',gap:8,marginTop:16}}>
        <Btn outline onClick={onVolver}>← Nueva auditoría</Btn>
        <Btn onClick={onCerrar}>Cerrar</Btn>
      </div>
    </>
  )
}

function SbItem({ label, count, active, onClick, indent }) {
  return (
    <div onClick={onClick} style={{ padding: `6px ${indent ? 24 : 16}px`, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: `3px solid ${active ? '#e0c96a' : 'transparent'}`, background: active ? 'rgba(184,149,42,.1)' : 'transparent', transition: 'all .15s' }}>
      <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? '#e0c96a' : 'rgba(255,255,255,.65)' }}>{label}</span>
      {count !== '' && <span style={{ fontSize: 10, background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.35)', borderRadius: 10, padding: '1px 7px' }}>{count}</span>}
    </div>
  )
}
function SbDivider() { return <div style={{ height: 1, background: 'rgba(255,255,255,.07)', margin: '6px 0' }} /> }

function EmptyState({ onAdd }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 64, opacity: .35 }}>🗺️</div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 26, color: '#8a8278' }}>Sin circuitos cargados</h2>
      <p style={{ color: '#8a8278', maxWidth: 320, lineHeight: 1.6 }}>Agrega el Excel de un circuito para comenzar.</p>
      <Btn onClick={onAdd}>+ Agregar primer circuito</Btn>
    </div>
  )
}

function UploadZone({ xlsxReady, onFile, pending, fileRef, onUpdatePending, existingCircuits }) {
  const [drag, setDrag] = useState(false)

  // Si ya hay un circuito cargado, mostrar el preview enriquecido
  if (pending) {
    const fechaIni = parseLocalDate(pending.info?.fecha_inicio)
    const fechaIniValid = fechaIni && !isNaN(fechaIni.getTime())
    // Valor para input type="date" (formato YYYY-MM-DD)
    const fechaIsoForInput = fechaIniValid
      ? `${fechaIni.getFullYear()}-${String(fechaIni.getMonth()+1).padStart(2,'0')}-${String(fechaIni.getDate()).padStart(2,'0')}`
      : ''
    const fechaLargo = fechaIniValid
      ? fechaIni.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : 'Sin fecha detectada'

    const yaExiste = existingCircuits?.some(c => c.id === pending.id)
    const totalServicios = pending.rows.length
    const monthLabel = pending.monthKey === 'Sin mes' ? '⚠ Sin mes asignado' : cap(pending.monthKey)
    const monthOk = pending.monthKey !== 'Sin mes'

    const onChangeFecha = (isoYmd) => {
      if (!isoYmd) {
        onUpdatePending({ ...pending, info: { ...pending.info, fecha_inicio: null }, monthKey: 'Sin mes' })
        return
      }
      // isoYmd viene como "YYYY-MM-DD". Construyo Date local para evitar shift por TZ.
      const [y, m, d] = isoYmd.split('-').map(Number)
      const newDate = new Date(y, m - 1, d)
      onUpdatePending({
        ...pending,
        info: { ...pending.info, fecha_inicio: newDate.toISOString() },
        monthKey: dateToMonthKey(newDate),
      })
    }

    const reset = () => { onUpdatePending(null); if (fileRef.current) fileRef.current.value = '' }

    return (
      <div>
        {/* Encabezado: archivo cargado */}
        <div style={{ background: '#f0faf4', border: '1px solid #c5e8d3', borderRadius: 10, padding: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 24 }}>✅</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1f6e3f' }}>Excel cargado correctamente</div>
            <div style={{ fontSize: 11, color: '#5a7d68' }}>Revisa los datos detectados antes de guardar</div>
          </div>
          <button onClick={reset} style={{ background: 'none', border: '1px solid #c5e8d3', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: '#5a7d68' }}>Cambiar archivo</button>
        </div>

        {/* Aviso si el ID ya existe */}
        {yaExiste && (
          <div style={{ background: '#fff8e1', border: '1px solid #f0d97f', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12, color: '#7d5a00' }}>
            ⚠ Ya existe un circuito con el ID <strong>{pending.id}</strong>. Si confirmas, se reemplazarán sus datos.
          </div>
        )}

        {/* Datos clave del circuito */}
        <div style={{ background: '#fafafa', border: '1px solid #e8e3da', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: '#8a8278', marginBottom: 10 }}>Datos detectados</div>

          <Row label="ID del circuito"><strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{pending.id}</strong></Row>
          <Row label="Tour Leader">{pending.info?.tl || <em style={{ color: '#aaa' }}>—</em>}</Row>
          <Row label="Operador">{pending.info?.operador || <em style={{ color: '#aaa' }}>—</em>}</Row>
          <Row label="PAX / Habitaciones">{pending.info?.pax || '—'} pax · {pending.info?.habs || '—'} habs</Row>
          <Row label="Total de servicios"><strong>{totalServicios}</strong> servicios LIBERO/OPCIONAL</Row>

          {/* Fecha de inicio editable — la parte crítica */}
          <div style={{ borderTop: '1px solid #e8e3da', marginTop: 10, paddingTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: '#8a8278', marginBottom: 6 }}>📅 Fecha de inicio</div>
            <div style={{ fontSize: 13, color: '#121512', marginBottom: 6, textTransform: 'capitalize' }}>{fechaLargo}</div>
            <input
              type="date"
              value={fechaIsoForInput}
              onChange={(e) => onChangeFecha(e.target.value)}
              style={{ border: '1.5px solid #d8d2c8', borderRadius: 6, padding: '6px 10px', fontFamily: 'inherit', fontSize: 13, background: '#fff', outline: 'none' }}
            />
            <div style={{ fontSize: 11, color: '#8a8278', marginTop: 6, fontStyle: 'italic' }}>
              Si la fecha no es la correcta (porque el Excel la interpretó mal), modifícala aquí.
            </div>
          </div>

          {/* Mes destino */}
          <div style={{ borderTop: '1px solid #e8e3da', marginTop: 10, paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: '#8a8278' }}>Mes destino</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: monthOk ? '#1f6e3f' : '#a05a00', marginTop: 4 }}>
                {monthOk ? '📂 ' : ''}{monthLabel}
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#8a8278', textAlign: 'right', maxWidth: 200 }}>
              El circuito se agrupará bajo este mes en la app.
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Sin archivo aún: zona de drop
  return (
    <div>
      {!xlsxReady && <p style={{ color: '#8a8278', fontSize: 13, marginBottom: 12 }}>⏳ Cargando lector de Excel...</p>}
      <div onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]) }}
        onClick={() => fileRef.current?.click()}
        style={{ border: `2px dashed ${drag ? '#b8952a' : '#d8d2c8'}`, borderRadius: 10, padding: 28, textAlign: 'center', cursor: 'pointer', background: '#fafafa', transition: 'all .2s' }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
        <p style={{ color: '#8a8278', fontSize: 13 }}>Arrastra el Excel o haz clic</p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]) }} />
      </div>
    </div>
  )
}

// Pequeño helper visual para filas label/value en el preview
function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: 13 }}>
      <span style={{ color: '#8a8278' }}>{label}</span>
      <span style={{ color: '#121512', textAlign: 'right' }}>{children}</span>
    </div>
  )
}

function TarifarioEditor({ tarifario, circuits, tarFileRef, onTarFile, onSave, onCancel, saving }) {
  const TEMPORADAS = ['General','Temporada Alta','Temporada Baja','Temporada Media','Temporada Navideña','Semana Santa']
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const DIAS = Array.from({length:31},(_,i)=>i+1)

  // DD/MM picker — two selects (day + month), no year confusion
  const DayMonthPicker = ({ value, onChange, placeholder }) => {
    const [d, m] = value ? value.split('/').map(Number) : [0, 0]
    return (
      <div style={{display:'flex',gap:3,alignItems:'center'}}>
        <select
          value={d||''}
          onChange={e => { const nd=e.target.value; if(nd&&m) onChange(nd.padStart(2,'0')+'/'+String(m).padStart(2,'0')); else if(nd) onChange(nd.padStart(2,'0')+'/'+(m?String(m).padStart(2,'0'):'01')) }}
          style={{border:'1px solid #d8d2c8',borderRadius:5,padding:'3px 5px',fontFamily:'inherit',fontSize:11,background:'#fff',cursor:'pointer',outline:'none',width:52}}
        >
          <option value="">Día</option>
          {DIAS.map(n=><option key={n} value={n}>{n}</option>)}
        </select>
        <select
          value={m||''}
          onChange={e => { const nm=e.target.value; if(nm&&d) onChange(String(d).padStart(2,'0')+'/'+String(nm).padStart(2,'0')); else if(nm) onChange((d?String(d).padStart(2,'0'):'01')+'/'+String(nm).padStart(2,'0')) }}
          style={{border:'1px solid #d8d2c8',borderRadius:5,padding:'3px 5px',fontFamily:'inherit',fontSize:11,background:'#fff',cursor:'pointer',outline:'none',width:60}}
        >
          <option value="">Mes</option>
          {MESES.map((mn,i)=><option key={i+1} value={i+1}>{mn}</option>)}
        </select>
      </div>
    )
  }
  const [busqueda, setBusqueda] = useState('')
  const [rows, setRows] = useState(() => {
    if (tarifario.length > 0) return tarifario.map(t => ({
      proveedor: t.proveedor || '',
      razon_social: t.razon_social || '',
      tipo_servicio: t.tipo_servicio || 'HOSPEDAJE',
      tipo_tarifa: t.tipo_tarifa || 'precio_fijo',
      precio_single: t.precio_single || t.precio || 0,
      precio_doble: t.precio_doble || t.precio_single || t.precio || 0,
      precio_pax: t.precio_pax || 0,
      incluye_tl: !!t.incluye_tl,
      moneda: t.moneda || 'MXN',
      temporada: t.temporada || 'General',
      temp_inicio: t.temp_inicio || null,
      temp_fin: t.temp_fin || null,
      cortesia_cada: t.cortesia_cada || 0,
      dias_credito: t.dias_credito || 0,
      notas: t.notas || '',
    }))
    const seen = new Set(); const out = []
    circuits.forEach(c => c.rows.forEach(r => {
      const p = r.prov_general; if (p && !seen.has(p.toUpperCase())) {
        seen.add(p.toUpperCase())
        out.push({ proveedor: p, razon_social: '', tipo_servicio: r.clasificacion||'HOSPEDAJE', precio_single: 0, precio_doble: 0, moneda: 'MXN', temporada: 'General', cortesia_cada: 0, dias_credito: 30, notas: '' })
      }
    }))
    return out
  })
  const update = (i, k, v) => setRows(prev => prev.map((r, idx) => idx===i ? {...r,[k]:v} : r))
  const del = (i) => setRows(prev => prev.filter((_, idx) => idx!==i))
  const add = (tipo) => setRows(prev => [...prev, { proveedor:'', tipo_servicio: tipo||'HOSPEDAJE', tipo_tarifa: tipo==='PAX'?'precio_pax':'precio_fijo', precio_single:0, precio_doble:0, precio_pax:0, incluye_tl:false, moneda:'MXN', temporada:'General', cortesia_cada:0, dias_credito:30, notas:'' }])
  const dupRow = (i) => setRows(prev => { const r={...prev[i], temporada:'Nueva temporada'}; const arr=[...prev]; arr.splice(i+1,0,r); return arr })
  const inp = { border:'1px solid #d8d2c8',borderRadius:5,padding:'4px 7px',fontFamily:'inherit',fontSize:12,width:'100%',outline:'none' }
  const sel = { border:'1px solid #d8d2c8',borderRadius:5,padding:'4px 7px',fontFamily:'inherit',fontSize:12,background:'#fff',cursor:'pointer',outline:'none' }

  // Group by proveedor for display
  const hotelRows = rows.filter(r => (r.tipo_servicio||'').toUpperCase() === 'HOSPEDAJE')
  const otherRows = rows.filter(r => (r.tipo_servicio||'').toUpperCase() !== 'HOSPEDAJE')

  const q = busqueda.trim().toLowerCase()
  const rowsVis = q ? rows.map((r,i)=>({...r,_i:i})).filter(r=>(r.proveedor||'').toLowerCase().includes(q)||(r.temporada||'').toLowerCase().includes(q)||(r.notas||'').toLowerCase().includes(q)) : rows.map((r,i)=>({...r,_i:i}))
  const hoteles  = rowsVis.filter(r=>(r.tipo_servicio||'').toUpperCase()==='HOSPEDAJE')
  const porPax   = rowsVis.filter(r=>(r.tipo_tarifa||'precio_fijo')==='precio_pax')
  const otros    = rowsVis.filter(r=>(r.tipo_servicio||'').toUpperCase()!=='HOSPEDAJE'&&(r.tipo_tarifa||'precio_fijo')!=='precio_pax')

  return (
    <div>
      {/* Toolbar */}
      <div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center',flexWrap:'wrap'}}>
        <Btn outline small onClick={()=>tarFileRef.current?.click()}>📥 Importar Excel</Btn>
        <input ref={tarFileRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={e=>{if(e.target.files[0])onTarFile(e.target.files[0])}}/>
        {/* Buscador */}
        <div style={{display:'flex',alignItems:'center',gap:6,flex:1,maxWidth:320,marginLeft:'auto',background:'#f5f1eb',border:'1.5px solid #d8d2c8',borderRadius:20,padding:'4px 12px'}}>
          <span style={{fontSize:13,color:'#8a8278'}}>🔍</span>
          <input
            type="text" value={busqueda} onChange={e=>setBusqueda(e.target.value)}
            placeholder="Buscar proveedor, temporada…"
            style={{flex:1,border:'none',background:'transparent',fontFamily:'inherit',fontSize:12,outline:'none',color:'#12151f'}}
          />
          {busqueda&&<button onClick={()=>setBusqueda('')} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:14,lineHeight:1}}>✕</button>}
        </div>
        {busqueda&&<span style={{fontSize:11,color:'#8a8278'}}>{rowsVis.length} resultado{rowsVis.length!==1?'s':''}</span>}
      </div>

      {/* ── SECCIÓN HOSPEDAJE ── */}
      <div style={{marginBottom:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:15,fontWeight:700}}>🏨 Hospedaje <span style={{fontSize:12,fontWeight:400,color:'#8a8278'}}>({hoteles.length})</span></div>
          <button onClick={()=>add('HOSPEDAJE')} style={{background:'transparent',border:'1.5px dashed #d8d2c8',color:'#8a8278',padding:'4px 12px',borderRadius:7,cursor:'pointer',fontSize:11}}>+ Agregar hotel</button>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr style={{background:'#12151f',color:'#fff'}}>
              {['Hotel','Temporada / Vigencia','Precio Single','Precio Doble','Moneda','Cortesía (cada N hab)','Días Crédito','Notas',''].map(h=>(
                <th key={h} style={{padding:'8px 10px',textAlign:'left',fontSize:10,textTransform:'uppercase',letterSpacing:.6,whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {hoteles.map(({_i:i,...r}) => {
                if ((r.tipo_servicio||'').toUpperCase() !== 'HOSPEDAJE') return null
                return (
                  <tr key={i} style={{borderBottom:'1px solid #ece7df',background:i%2===0?'#fafaf8':'#fff'}}>
                    <td style={{padding:'5px 7px',minWidth:150}}><input style={{...inp,width:140}} value={r.proveedor} onChange={e=>update(i,'proveedor',e.target.value)} placeholder="Nombre del hotel"/></td>
                    <td style={{padding:'5px 7px',minWidth:160}}>
                      <div style={{display:'flex',gap:4,alignItems:'center',marginBottom:3}}>
                        <select style={{...sel,flex:1}} value={r.temporada} onChange={e=>update(i,'temporada',e.target.value)}>
                          {TEMPORADAS.map(t=><option key={t}>{t}</option>)}
                          {!TEMPORADAS.includes(r.temporada)&&<option value={r.temporada}>{r.temporada}</option>}
                        </select>
                        <button onClick={()=>dupRow(i)} title="Duplicar con otra temporada"
                          style={{background:'#ece7df',border:'none',borderRadius:5,padding:'3px 7px',cursor:'pointer',fontSize:11,color:'#8a8278',fontWeight:700}}>+T</button>
                      </div>
                      {r.temporada!=='General'&&<div style={{display:'flex',gap:4,alignItems:'center',marginTop:4}}>
                        <DayMonthPicker value={r.temp_inicio} onChange={v=>update(i,'temp_inicio',v)} placeholder="Inicio"/>
                        <span style={{fontSize:11,color:'#8a8278',flexShrink:0}}>→</span>
                        <DayMonthPicker value={r.temp_fin} onChange={v=>update(i,'temp_fin',v)} placeholder="Fin"/>
                      </div>}
                    </td>
                    <td style={{padding:'5px 7px',minWidth:100}}>
                      <div style={{display:'flex',gap:3,alignItems:'center'}}>
                        <input style={{...inp,width:85}} type="number" value={r.precio_single||''} onChange={e=>update(i,'precio_single',parseFloat(e.target.value)||0)} placeholder="0"/>
                      </div>
                    </td>
                    <td style={{padding:'5px 7px',minWidth:100}}>
                      <input style={{...inp,width:85}} type="number" value={r.precio_doble||''} onChange={e=>update(i,'precio_doble',parseFloat(e.target.value)||0)} placeholder="= Single si vacío"/>
                    </td>
                    <td style={{padding:'5px 7px'}}><select style={sel} value={r.moneda} onChange={e=>update(i,'moneda',e.target.value)}><option>MXN</option><option>USD</option></select></td>
                    <td style={{padding:'5px 7px',minWidth:140}}>
                      <div style={{display:'flex',gap:5,alignItems:'center'}}>
                        <input style={{...inp,width:55}} type="number" min="0" value={r.cortesia_cada||''} onChange={e=>update(i,'cortesia_cada',parseInt(e.target.value)||0)} placeholder="0"/>
                        {r.cortesia_cada>0&&<span style={{fontSize:10,color:'#1e5c3a',fontWeight:600,whiteSpace:'nowrap'}}>1 cortesía c/{r.cortesia_cada} hab</span>}
                        {!r.cortesia_cada&&<span style={{fontSize:10,color:'#ccc'}}>Sin cortesía</span>}
                      </div>
                    </td>
                    <td style={{padding:'5px 7px'}}><input style={{...inp,width:55}} type="number" value={r.dias_credito||''} onChange={e=>update(i,'dias_credito',parseInt(e.target.value)||0)}/></td>
                    <td style={{padding:'5px 7px'}}><input style={inp} value={r.notas||''} onChange={e=>update(i,'notas',e.target.value)}/></td>
                    <td style={{padding:'5px 7px'}}><button onClick={()=>del(i)} style={{background:'none',border:'none',color:'#ccc',cursor:'pointer',fontSize:15}}>✕</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{fontSize:11,color:'#8a8278',marginTop:6,padding:'6px 10px',background:'#f5f1eb',borderRadius:6}}>
          💡 <strong>Precio Doble</strong> vacío = usa el mismo que Single. <strong>Cortesía</strong>: escribe 10 para "1 hab gratis c/10". <strong>+T</strong> duplica el hotel para otra temporada, luego selecciona Día/Mes de inicio y fin. <strong>General</strong> aplica cuando ninguna vigencia coincide con la fecha del servicio.
        </div>
      </div>

      {/* ── OTROS SERVICIOS ── */}
      <div style={{marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:15,fontWeight:700}}>🚌 Otros proveedores <span style={{fontSize:12,fontWeight:400,color:'#8a8278'}}>({otros.length})</span></div>
          <button onClick={()=>add('TRANSPORTE')} style={{background:'transparent',border:'1.5px dashed #d8d2c8',color:'#8a8278',padding:'4px 12px',borderRadius:7,cursor:'pointer',fontSize:11}}>+ Agregar proveedor</button>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr style={{background:'#12151f',color:'#fff'}}>
              {['Proveedor','Tipo','Precio','Moneda','Días Crédito','Notas',''].map(h=>(
                <th key={h} style={{padding:'8px 10px',textAlign:'left',fontSize:10,textTransform:'uppercase',letterSpacing:.6}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {otros.map(({_i:i,...r}) => {
                if ((r.tipo_servicio||'').toUpperCase() === 'HOSPEDAJE') return null
                return (
                  <tr key={i} style={{borderBottom:'1px solid #ece7df'}}>
                    <td style={{padding:'5px 7px'}}><input style={{...inp,width:150}} value={r.proveedor} onChange={e=>update(i,'proveedor',e.target.value)}/></td>
                    <td style={{padding:'5px 7px'}}><select style={sel} value={r.tipo_servicio} onChange={e=>update(i,'tipo_servicio',e.target.value)}>{['TRANSPORTE','ACTIVIDADES','ALIMENTOS','GUIA','OTRO'].map(t=><option key={t}>{t}</option>)}</select></td>
                    <td style={{padding:'5px 7px'}}><input style={{...inp,width:90}} type="number" value={r.precio_single||''} onChange={e=>update(i,'precio_single',parseFloat(e.target.value)||0)}/></td>
                    <td style={{padding:'5px 7px'}}><select style={sel} value={r.moneda} onChange={e=>update(i,'moneda',e.target.value)}><option>MXN</option><option>USD</option></select></td>
                    <td style={{padding:'5px 7px'}}><input style={{...inp,width:60}} type="number" value={r.dias_credito||''} onChange={e=>update(i,'dias_credito',parseInt(e.target.value)||0)}/></td>
                    <td style={{padding:'5px 7px'}}><input style={inp} value={r.notas||''} onChange={e=>update(i,'notas',e.target.value)}/></td>
                    <td style={{padding:'5px 7px'}}><button onClick={()=>del(i)} style={{background:'none',border:'none',color:'#ccc',cursor:'pointer',fontSize:15}}>✕</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SECCIÓN TARIFA POR PAX ── */}
      <div style={{marginBottom:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div>
            <div style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:15,fontWeight:700}}>👥 Tarifa por PAX <span style={{fontSize:12,fontWeight:400,color:'#8a8278'}}>({porPax.length})</span></div>
            <div style={{fontSize:11,color:'#8a8278',marginTop:2}}>El costo se congela automáticamente al asignar el proveedor al circuito (PAX del circuito × precio por PAX).</div>
          </div>
          <button onClick={()=>add('PAX')} style={{background:'transparent',border:'1.5px dashed #d8d2c8',color:'#8a8278',padding:'4px 12px',borderRadius:7,cursor:'pointer',fontSize:11,whiteSpace:'nowrap'}}>+ Agregar proveedor PAX</button>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr style={{background:'#12151f',color:'#fff'}}>
              {['Proveedor','Precio por PAX','Moneda','¿Incluye TL?','Días Crédito','Notas',''].map(h=>(
                <th key={h} style={{padding:'8px 10px',textAlign:'left',fontSize:10,textTransform:'uppercase',letterSpacing:.6,whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {porPax.length===0&&!q&&(
                <tr><td colSpan={7} style={{padding:'20px',textAlign:'center',color:'#ccc',fontSize:12}}>Sin proveedores por PAX — agrega uno arriba</td></tr>
              )}
              {porPax.map(({_i:i,...r})=>(
                <tr key={i} style={{borderBottom:'1px solid #ece7df',background:i%2===0?'#fafaf8':'#fff'}}>
                  <td style={{padding:'5px 7px',minWidth:160}}><input style={{...inp,width:150}} value={r.proveedor} onChange={e=>update(i,'proveedor',e.target.value)} placeholder="Nombre del proveedor"/></td>
                  <td style={{padding:'5px 7px',minWidth:110}}>
                    <div style={{display:'flex',gap:4,alignItems:'center'}}>
                      <input style={{...inp,width:90}} type="number" min="0" value={r.precio_pax||''} onChange={e=>update(i,'precio_pax',parseFloat(e.target.value)||0)} placeholder="0.00"/>
                    </div>
                  </td>
                  <td style={{padding:'5px 7px'}}><select style={sel} value={r.moneda} onChange={e=>update(i,'moneda',e.target.value)}><option>MXN</option><option>USD</option></select></td>
                  <td style={{padding:'5px 7px',textAlign:'center'}}>
                    <button onClick={()=>update(i,'incluye_tl',!r.incluye_tl)}
                      style={{padding:'3px 12px',borderRadius:12,border:'none',cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'inherit',background:r.incluye_tl?'#d8f3dc':'#ffe0e0',color:r.incluye_tl?'#1b4332':'#7f1d1d'}}>
                      {r.incluye_tl?'✅ Sí':'❌ No'}
                    </button>
                    {r.incluye_tl&&<div style={{fontSize:9,color:'#1e5c3a',marginTop:2}}>PAX + 1 TL</div>}
                    {!r.incluye_tl&&<div style={{fontSize:9,color:'#8a8278',marginTop:2}}>Solo PAX</div>}
                  </td>
                  <td style={{padding:'5px 7px'}}><input style={{...inp,width:55}} type="number" value={r.dias_credito||''} onChange={e=>update(i,'dias_credito',parseInt(e.target.value)||0)}/></td>
                  <td style={{padding:'5px 7px'}}><input style={inp} value={r.notas||''} onChange={e=>update(i,'notas',e.target.value)}/></td>
                  <td style={{padding:'5px 7px'}}><button onClick={()=>del(i)} style={{background:'none',border:'none',color:'#ccc',cursor:'pointer',fontSize:15}}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {porPax.length>0&&(
          <div style={{fontSize:11,color:'#8a8278',marginTop:6,padding:'6px 10px',background:'#f0f6ff',borderRadius:6,borderLeft:'3px solid #1565a0'}}>
            💡 Al seleccionar este proveedor en un renglón del circuito, el importe se calcula y <strong>congela automáticamente</strong> según el número de PAX capturado en ese circuito. Actualizar el precio aquí <strong>no afecta</strong> circuitos anteriores.
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/* 🏢 PANEL DE RAZONES SOCIALES                    */}
      {/* ═══════════════════════════════════════════════ */}
      <RazonesSocialesPanel rows={rows} update={update}/>

      <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:20,paddingTop:14,borderTop:'1px solid #ece7df'}}>
        <Btn outline onClick={onCancel}>Cancelar</Btn>
        <span style={{fontSize:11,color:'#8a8278',marginRight:'auto'}}>{rows.filter(r=>(r.proveedor||'').trim()).length} proveedores a guardar</span>
        <Btn disabled={saving} onClick={()=>onSave(rows)}>{saving?'⏳ Guardando...':'💾 Guardar tarifario'}</Btn>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// RazonesSocialesPanel — Vista dedicada para capturar/editar razones sociales
// ═══════════════════════════════════════════════════════════════════
function RazonesSocialesPanel({ rows, update }) {
  const [filtro, setFiltro] = useState('todos') // todos | con | sin
  const [busq, setBusq] = useState('')
  const [expandido, setExpandido] = useState(true)

  const filtered = useMemo(() => {
    // rows viene ya como array indexado; necesitamos preservar el _i original para el update
    // Como acá recibimos "rows" directo (que tiene _i por scope de update), reconstruyo con índice del array
    const withIdx = rows.map((r, i) => ({ ...r, _i: i }))
    let list = withIdx.filter(r => (r.proveedor || '').trim())
    if (filtro === 'con') list = list.filter(r => (r.razon_social || '').trim())
    else if (filtro === 'sin') list = list.filter(r => !(r.razon_social || '').trim())
    if (busq.trim()) {
      const q = busq.toLowerCase().trim()
      list = list.filter(r =>
        (r.proveedor || '').toLowerCase().includes(q) ||
        (r.razon_social || '').toLowerCase().includes(q)
      )
    }
    // Ordenar: primero SIN razón social (para que las veas primero), después CON
    list.sort((a, b) => {
      const aTiene = !!(a.razon_social || '').trim()
      const bTiene = !!(b.razon_social || '').trim()
      if (aTiene !== bTiene) return aTiene ? 1 : -1
      return (a.proveedor || '').localeCompare(b.proveedor || '')
    })
    return list
  }, [rows, filtro, busq])

  const conCount = rows.filter(r => (r.proveedor || '').trim() && (r.razon_social || '').trim()).length
  const sinCount = rows.filter(r => (r.proveedor || '').trim() && !(r.razon_social || '').trim()).length

  return (
    <div style={{marginTop:24,border:'1.5px solid #12151f',borderRadius:10,background:'#fff',overflow:'hidden'}}>
      <div
        onClick={()=>setExpandido(!expandido)}
        style={{background:'#12151f',color:'#e0c96a',padding:'12px 16px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between'}}
      >
        <div style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:17,fontWeight:700,display:'flex',alignItems:'center',gap:8}}>
          🏢 Razones Sociales
          <span style={{background:'rgba(224,201,106,.15)',color:'#e0c96a',padding:'2px 10px',borderRadius:12,fontSize:11,fontWeight:400}}>
            {conCount} capturadas · {sinCount} faltantes
          </span>
        </div>
        <span style={{fontSize:16}}>{expandido ? '▲' : '▼'}</span>
      </div>

      {expandido && (
        <div style={{padding:16}}>
          <div style={{fontSize:12,color:'#8a8278',marginBottom:12,lineHeight:1.5}}>
            La <strong>razón social</strong> es el nombre que aparecerá en la columna <strong>EGRESOS</strong> del Excel de flujo de efectivo (a quién le facturas/pagas). Si está vacía, el Excel usará el nombre comercial como fallback.
          </div>

          {/* Filtros */}
          <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
            <input
              type="text" placeholder="🔍 Buscar por nombre..." value={busq} onChange={e=>setBusq(e.target.value)}
              style={{flex:1,minWidth:200,border:'1px solid #d8d2c8',borderRadius:6,padding:'6px 10px',fontFamily:'inherit',fontSize:12,outline:'none'}}
            />
            <div style={{display:'flex',gap:4}}>
              {[
                {v:'todos', label:`Todos (${rows.filter(r=>(r.proveedor||'').trim()).length})`},
                {v:'sin', label:`⚠ Faltantes (${sinCount})`, color:'#b83232'},
                {v:'con', label:`✓ Con razón (${conCount})`, color:'#1e5c3a'},
              ].map(f => (
                <button
                  key={f.v}
                  onClick={()=>setFiltro(f.v)}
                  style={{
                    background: filtro===f.v ? '#12151f' : '#f5f1eb',
                    color: filtro===f.v ? '#e0c96a' : (f.color || '#8a8278'),
                    border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 11, cursor: 'pointer',
                    fontWeight: filtro===f.v ? 700 : 500, fontFamily: 'inherit', whiteSpace: 'nowrap'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lista */}
          <div style={{maxHeight:400,overflowY:'auto',border:'1px solid #ece7df',borderRadius:6}}>
            {filtered.length === 0 ? (
              <div style={{padding:20,textAlign:'center',color:'#8a8278',fontSize:12,fontStyle:'italic'}}>
                {busq ? 'Sin resultados para tu búsqueda.' : 'No hay proveedores.'}
              </div>
            ) : (
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{background:'#f5f1eb',position:'sticky',top:0,zIndex:1}}>
                    <th style={{padding:'8px 10px',textAlign:'left',fontSize:10,textTransform:'uppercase',letterSpacing:.6,color:'#8a8278',fontWeight:700,minWidth:220}}>Nombre Comercial (app)</th>
                    <th style={{padding:'8px 10px',textAlign:'left',fontSize:10,textTransform:'uppercase',letterSpacing:.6,color:'#8a8278',fontWeight:700}}>Razón Social (para EGRESOS)</th>
                    <th style={{padding:'8px 10px',textAlign:'center',fontSize:10,textTransform:'uppercase',letterSpacing:.6,color:'#8a8278',fontWeight:700,width:80}}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idx) => {
                    const tiene = !!(r.razon_social || '').trim()
                    return (
                      <tr key={r._i} style={{borderBottom:'1px solid #f0ebe3',background: idx%2===0 ? '#fff' : '#fafaf8'}}>
                        <td style={{padding:'6px 10px',fontWeight:600}}>{r.proveedor}</td>
                        <td style={{padding:'6px 10px'}}>
                          <input
                            type="text"
                            value={r.razon_social || ''}
                            onChange={e => update(r._i, 'razon_social', e.target.value)}
                            placeholder={tiene ? '' : '⚠ Sin capturar — el Excel usará el nombre comercial'}
                            style={{
                              width:'100%',
                              border:'1px solid ' + (tiene ? '#d8d2c8' : '#f0d4d4'),
                              borderRadius:5,padding:'5px 8px',fontFamily:'inherit',fontSize:12,
                              background: tiene ? '#fff' : '#fdf5f5',
                              outline:'none'
                            }}
                          />
                        </td>
                        <td style={{padding:'6px 10px',textAlign:'center'}}>
                          {tiene ? (
                            <span style={{fontSize:11,color:'#1e5c3a',fontWeight:700}}>✓ OK</span>
                          ) : (
                            <span style={{fontSize:11,color:'#b83232',fontWeight:700}}>⚠ Falta</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div style={{fontSize:10,color:'#8a8278',marginTop:8,fontStyle:'italic'}}>
            ✎ Los cambios se aplican cuando presionas "💾 Guardar tarifario" abajo.
          </div>
        </div>
      )}
    </div>
  )
}

// ── All / Month Views ──
function AllView({ circuits, monthMap, sortedMonths, tarifario, TC, socioMode, onSelect }) {
  let tMXN = 0, tUSD = 0, pMXN = 0, pUSD = 0
  circuits.forEach((c) => c.rows.forEach((r) => {
    // En modo socio, ignoramos las filas OPCIONAL en los KPIs
    if (socioMode && (r.tipo || '').toString().toUpperCase().trim() === 'OPCIONAL') return
    const { mxn, usd } = getImporte(r, c.info, tarifario)
    tMXN += mxn; tUSD += usd
    if (r.paid) { pMXN += mxn; pUSD += usd }
  }))
  const totalServicios = circuits.reduce((a, c) => a + c.rows.filter(r => !socioMode || (r.tipo||'').toString().toUpperCase().trim() !== 'OPCIONAL').length, 0)
  return (
    <div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 26, marginBottom: 4 }}>📊 Todos los circuitos</h2>
      <p style={{ color: '#8a8278', fontSize: 13, marginBottom: 20 }}>{circuits.length} circuito{circuits.length !== 1 ? 's' : ''} · {sortedMonths.length} mes{sortedMonths.length !== 1 ? 'es' : ''}</p>
      <KPIGrid items={[
        { cls: 'gold', label: 'Circuitos', val: circuits.length },
        { cls: 'forest', label: '✅ Pagado MXN', val: fmtMXN(pMXN), sub: fmtUSD(pUSD) + ' USD' },
        { cls: 'rust', label: '⏳ Pendiente MXN', val: fmtMXN(tMXN - pMXN), sub: fmtUSD(tUSD - pUSD) + ' USD' },
        { cls: 'sky', label: 'Total Servicios', val: totalServicios },
      ]} />
      {sortedMonths.map((mk) => (
        <div key={mk} style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 18, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            {cap(mk)} <span style={{ background: '#b8952a', color: '#12151f', borderRadius: 10, padding: '1px 9px', fontSize: 12, fontFamily: 'inherit', fontWeight: 700 }}>{monthMap[mk].length}</span>
          </div>
          <CircuitCards circs={monthMap[mk]} tarifario={tarifario} TC={TC} socioMode={socioMode} onSelect={onSelect} />
        </div>
      ))}
    </div>
  )
}
function MonthView({ mk, circuits, tarifario, TC, socioMode, onSelect }) {
  let tMXN = 0, tUSD = 0, pMXN = 0, pUSD = 0
  circuits.forEach((c) => c.rows.forEach((r) => {
    if (socioMode && (r.tipo || '').toString().toUpperCase().trim() === 'OPCIONAL') return
    const { mxn, usd } = getImporte(r, c.info, tarifario)
    tMXN += mxn; tUSD += usd
    if (r.paid) { pMXN += mxn; pUSD += usd }
  }))
  return (
    <div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 26, marginBottom: 16 }}>{cap(mk)}</h2>
      <KPIGrid items={[
        { cls: 'gold', label: 'Circuitos', val: circuits.length },
        { cls: 'forest', label: '✅ Pagado MXN', val: fmtMXN(pMXN), sub: fmtUSD(pUSD) + ' USD' },
        { cls: 'rust', label: '⏳ Pendiente MXN', val: fmtMXN(tMXN - pMXN), sub: fmtUSD(tUSD - pUSD) + ' USD' },
        { cls: 'sky', label: 'Total MXN', val: fmtMXN(tMXN), sub: fmtUSD(tUSD) + ' USD' },
      ]} />
      <CircuitCards circs={circuits} tarifario={tarifario} TC={TC} socioMode={socioMode} onSelect={onSelect} />
    </div>
  )
}
function CircuitCards({ circs, tarifario, TC, socioMode, onSelect }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: 14 }}>
      {circs.map((c) => {
        const T = calcCircTotals(c, tarifario, TC)
        const costoMXN = T.costoMXN, costoUSD = T.costoUSD, ingresoMXN = T.ingresoMXN
        // En modo socio: utilidad neta (libero - comisión); en modo normal: utilidad libero
        const utilidad = socioMode ? T.utilidadNeta : T.utilidad
        const liberoRows = c.rows.filter(r => (r.tipo||'').toString().toUpperCase().trim() !== 'OPCIONAL')
        const visibleRows = socioMode ? liberoRows : c.rows
        const paid = visibleRows.filter((r) => r.paid).length
        const pct = visibleRows.length > 0 ? Math.round((paid / visibleRows.length) * 100) : 0
        const allPaid = paid === visibleRows.length && visibleRows.length > 0
        const fi = c.info?.fecha_inicio
        const fStr = fi ? (fi instanceof Date ? fi : new Date(fi)).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
        const hayIng = ingresoMXN > 0
        return (
          <div key={c.id} onClick={() => onSelect(c.id)} style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 2px 16px rgba(18,21,31,.07)', borderTop: `3px solid ${c.locked ? '#e0c96a' : (allPaid ? '#52b788' : '#d8d2c8')}`, cursor: 'pointer', position: 'relative' }}>
            {c.locked && (
              <div style={{ position: 'absolute', top: 10, right: 10, background: '#fef8e6', border: '1px solid #e0c96a', borderRadius: 12, padding: '2px 8px', fontSize: 10, fontWeight: 700, color: '#7d5a00', display: 'flex', alignItems: 'center', gap: 3 }} title="Circuito cerrado">
                🔒 Cerrado
              </div>
            )}
            <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 3 }}>{c.id.split('-').slice(-3).join('-')}</div>
            <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{c.info?.tl || 'Sin TL'}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {[`📅 ${fStr}`, `👤 ${c.info?.pax || '—'} PAX`, `🛏 ${c.info?.habs || '—'} HAB`].map((t) => (
                <span key={t} style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 8, background: '#ece7df', color: '#8a8278' }}>{t}</span>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
              <div><div style={{ fontSize: 10, color: '#b83232' }}>Costo MXN</div><div style={{ fontWeight: 700, fontSize: 13 }}>{costoMXN > 0 ? <>{fmtMXN(costoMXN)} <span style={{ fontSize: 10, color: '#8a8278' }}>MN</span></> : '—'}</div></div>
              <div><div style={{ fontSize: 10, color: '#1565a0' }}>Costo USD</div><div style={{ fontWeight: 700, fontSize: 13, color: '#1565a0' }}>{costoUSD > 0 ? fmtUSD(costoUSD) : '—'}</div></div>
            </div>
            {hayIng && (
              <div style={{ marginBottom: 8, padding: '6px 10px', borderRadius: 8, background: utilidad >= 0 ? '#f0faf4' : '#fff5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#8a8278' }}>{utilidad >= 0 ? '✅ UTILIDAD' : '❌ PÉRDIDA'}{socioMode && T.commissionPct>0 ? ' BRUTA' : ''}</span>
                <span style={{ fontWeight: 800, fontSize: 13, color: utilidad >= 0 ? '#1e5c3a' : '#b83232' }}>{fmtMXN(Math.abs(utilidad))} <span style={{ fontSize: 10, fontWeight: 600 }}>MN</span></span>
              </div>
            )}
            <div style={{ height: 4, background: '#ece7df', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}><div style={{ height: '100%', width: pct + '%', background: '#52b788', borderRadius: 2 }} /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#8a8278' }}>{paid}/{visibleRows.length} pagados ({pct}%)</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9, background: allPaid ? '#d8f3dc' : '#caf0f8', color: allPaid ? '#1b4332' : '#03045e' }}>{allPaid ? '✅ Completo' : '⏳ Pendiente'}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}


// ── EditableInfoField — campo editable inline en header ──
function EditableInfoField({ label, value, type, onSave, isReadOnly }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value || '')
  if (editing) return (
    <div>
      <div style={{fontSize:11,color:'#8a8278',marginBottom:2}}>{label}</div>
      <div style={{display:'flex',gap:4,alignItems:'center'}}>
        <input autoFocus type={type||'text'} value={val} onChange={e=>setVal(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'){onSave(val);setEditing(false)}if(e.key==='Escape')setEditing(false)}}
          style={{border:'1px solid #b8952a',borderRadius:5,padding:'3px 7px',fontSize:12,fontFamily:'inherit',width:type==='number'?60:120,outline:'none'}}/>
        <button onClick={()=>{onSave(val);setEditing(false)}} style={{background:'#b8952a',color:'#12151f',border:'none',borderRadius:4,padding:'3px 7px',fontSize:11,cursor:'pointer',fontWeight:700}}>✓</button>
        <button onClick={()=>setEditing(false)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:14}}>✕</button>
      </div>
    </div>
  )
  return (
    <div onClick={()=>{if(isReadOnly)return;setVal(value||'');setEditing(true)}} style={{cursor:isReadOnly?'default':'pointer'}}>
      <div style={{fontSize:11,color:'#8a8278',marginBottom:2}}>{label}</div>
      <div style={{fontSize:13,fontWeight:600,borderBottom:isReadOnly?'none':'1px dotted #b8952a',display:'inline-block',minWidth:24}}>
        {value||<span style={{color:'#ccc'}}>—</span>} {!isReadOnly && <span style={{fontSize:10,color:'#b8952a'}}>✎</span>}
      </div>
    </div>
  )
}

// ── Circuit Detail ──
function CircuitDetail({ circ, tarifario, TC, activeTab, setActiveTab, F, setFilters, filteredRows, socioMode, isReadOnly, togglePaid, setFechaPago, setNota, saveProv, saveImporte, saveImporteCobrado, saveCommission, saveFactura, saveRowField, addRow, deleteRow, saveOpcional, saveCircInfo, openLockModal, onDelete }) {
  const [editIC, setEditIC] = useState(false)
  const [icVal, setIcVal] = useState(circ.importe_cobrado || '')
  const [editOpc, setEditOpc] = useState(false)
  const [opcMXN, setOpcMXN] = useState(circ.ingreso_opcional_mxn || '')
  const [opcUSD, setOpcUSD] = useState(circ.ingreso_opcional_usd || '')
  const [editHabs, setEditHabs] = useState(false)
  const [habSingle, setHabSingle] = useState(circ.info?.habs_single || '')
  const [habDoble, setHabDoble] = useState(circ.info?.habs_doble || '')
  // Edición de comisión a socio
  const [editCom, setEditCom] = useState(false)
  const [comVal, setComVal] = useState(circ.commission_pct ?? '')
  // Sincronizar al cambiar de circuito
  useEffect(() => { setComVal(circ.commission_pct ?? '') }, [circ.id])

  const fi = circ.info?.fecha_inicio
  const fStr = fi ? (fi instanceof Date ? fi : new Date(fi)).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/D'
  const T = calcCircTotals(circ, tarifario, TC)
  const pendMXN = T.costoMXN - T.paidMXN
  const pendUSD = T.costoUSD - T.paidUSD
  const lib = circ.rows.filter((r) => (r.tipo||'').toUpperCase().trim() !== 'OPCIONAL').length
  const opc = circ.rows.filter((r) => (r.tipo||'').toUpperCase().trim() === 'OPCIONAL').length
  const hayIngLib = T.ingresoMXN > 0
  const hayIngOpc = T.ingresoOpcTotal > 0

  const confirmIC = () => { saveImporteCobrado(circ.id, parseFloat(icVal)||0, 'USD'); setEditIC(false) }
  const confirmOpc = () => { saveOpcional(circ.id,'ingreso_opcional_mxn', opcMXN); saveOpcional(circ.id,'ingreso_opcional_usd', opcUSD); setEditOpc(false) }

  const BannerBtn = ({onClick,children}) => (
    <button onClick={onClick} style={{background:'none',border:'none',color:'#b8952a',cursor:'pointer',fontSize:11,fontWeight:700,padding:'2px 6px',borderRadius:4,textDecoration:'underline dotted'}}>
      {children}
    </button>
  )
  const UtilBadge = ({util}) => util >= 0
    ? <span className="num" style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:22,fontWeight:700,color:'#1e5c3a'}}>{fmtMXN(util)} MN</span>
    : <span className="num" style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:22,fontWeight:700,color:'#b83232'}}>{fmtMXN(Math.abs(util))} MN</span>

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:12,marginBottom:16}}>
        <div>
          <h2 style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:22,marginBottom:6}}>{circ.id}</h2>
          <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'flex-start'}}>
            {/* Fecha (solo lectura) */}
            <div><div style={{fontSize:11,color:'#8a8278'}}>Fecha</div><div style={{fontSize:13,fontWeight:600}}>{fStr}</div></div>
            {/* TL, PAX, Operador — editables inline */}
            {[['tl','Tour Leader','text'],['pax','PAX','number'],['operador','Operador','text']].map(([field,label,type]) => (
              <EditableInfoField key={field} label={label} value={circ.info?.[field]} type={type} isReadOnly={isReadOnly}
                onSave={v => saveCircInfo(circ.id, {[field]: type==='number'?parseInt(v)||0:v})}/>
            ))}
            {/* Habitaciones Single + Doble */}
            <div style={{borderLeft:'1px solid #d8d2c8',paddingLeft:16}}>
              <div style={{fontSize:11,color:'#8a8278',marginBottom:4}}>Número de habitaciones</div>
              {editHabs ? (
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <div>
                    <div style={{fontSize:9,fontWeight:700,color:'#8a8278',marginBottom:2}}>SINGLE</div>
                    <input type="number" min="0" value={habSingle} onChange={e=>setHabSingle(e.target.value)} autoFocus
                      style={{border:'1px solid #b8952a',borderRadius:5,padding:'3px 7px',fontSize:12,fontFamily:'inherit',width:56}}/>
                  </div>
                  <div>
                    <div style={{fontSize:9,fontWeight:700,color:'#8a8278',marginBottom:2}}>DOBLE</div>
                    <input type="number" min="0" value={habDoble} onChange={e=>setHabDoble(e.target.value)}
                      style={{border:'1px solid #b8952a',borderRadius:5,padding:'3px 7px',fontSize:12,fontFamily:'inherit',width:56}}/>
                  </div>
                  <div style={{display:'flex',gap:4,marginTop:14}}>
                    <button onClick={()=>{saveCircInfo(circ.id,{habs_single:parseInt(habSingle)||0,habs_doble:parseInt(habDoble)||0});setEditHabs(false)}}
                      style={{background:'#b8952a',color:'#12151f',border:'none',borderRadius:5,padding:'3px 9px',fontSize:11,cursor:'pointer',fontWeight:700}}>✓</button>
                    <button onClick={()=>setEditHabs(false)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:14}}>✕</button>
                  </div>
                </div>
              ) : (
                <div onClick={()=>setEditHabs(true)} style={{cursor:'pointer',display:'flex',gap:10}}>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontSize:9,fontWeight:700,color:'#8a8278'}}>SINGLE</div>
                    <div style={{fontSize:15,fontWeight:700,borderBottom:'1px dotted #b8952a',minWidth:28,textAlign:'center'}}>{circ.info?.habs_single||'—'}</div>
                  </div>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontSize:9,fontWeight:700,color:'#8a8278'}}>DOBLE</div>
                    <div style={{fontSize:15,fontWeight:700,borderBottom:'1px dotted #b8952a',minWidth:28,textAlign:'center'}}>{circ.info?.habs_doble||'—'}</div>
                  </div>
                  <span style={{fontSize:10,color:'#b8952a',marginTop:14}}>✎</span>
                </div>
              )}
            </div>
          </div>
        </div>
        {!isReadOnly && (
          <div style={{display:'flex',gap:8,flexDirection:'column',alignItems:'flex-end'}}>
            {circ.locked ? (
              <button onClick={() => openLockModal(circ.id, 'unlock')} style={{background:'#fef8e6',border:'1px solid #e0c96a',color:'#7d5a00',padding:'6px 13px',borderRadius:7,cursor:'pointer',fontSize:12,fontWeight:600,whiteSpace:'nowrap'}}>🔓 Abrir circuito</button>
            ) : (
              <button onClick={() => openLockModal(circ.id, 'lock')} style={{background:'none',border:'1px solid #d8d2c8',color:'#8a8278',padding:'6px 13px',borderRadius:7,cursor:'pointer',fontSize:12,whiteSpace:'nowrap'}}>🔒 Cerrar circuito</button>
            )}
            <button onClick={() => onDelete(circ.id)} disabled={circ.locked} style={{background:'none',border:'1px solid #d8d2c8',color: circ.locked?'#ccc':'#8a8278',padding:'6px 13px',borderRadius:7,cursor: circ.locked?'not-allowed':'pointer',fontSize:12,whiteSpace:'nowrap'}}>🗑 Eliminar</button>
          </div>
        )}
      </div>

      {/* Banner de circuito bloqueado */}
      {circ.locked && (
        <div style={{ background: '#fef8e6', border: '1px solid #e0c96a', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🔒</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#7d5a00' }}>Circuito cerrado</div>
            <div style={{ fontSize: 11, color: '#8a7a3a' }}>Datos operativos bloqueados. Puedes registrar facturas y pagos sin desbloquearlo.</div>
          </div>
        </div>
      )}

      {/* ── BANNERS DE UTILIDAD — DOS COLUMNAS (UNA EN VISTA SOCIO) ── */}
      <div style={{display:'grid',gridTemplateColumns: socioMode ? '1fr' : '1fr 1fr',gap:12,marginBottom:16}}>

        {/* LIBERO */}
        <div style={{background: hayIngLib ? (T.utilidadNeta>=0?'#f0faf4':'#fff5f5') : '#fafafa', border:`1px solid ${hayIngLib?(T.utilidadNeta>=0?'#95d5b2':'#fca5a5'):'#d8d2c8'}`, borderRadius:12, padding:'14px 18px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
            <div>
              <div style={{fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:.8,color:'#1e5c3a',marginBottom:2}}>🔵 Circuito {socioMode ? '' : 'LIBERO'}</div>
              <div style={{fontSize:10,color:'#8a8278'}}>{lib} servicios incluidos</div>
            </div>
            <div style={{textAlign:'right'}}>
              {hayIngLib ? <>
                {T.utilidadNeta>=0?<span style={{fontSize:9,fontWeight:700,color:'#1e5c3a',textTransform:'uppercase'}}>✅ UTILIDAD{T.commissionPct>0?' BRUTA':''}</span>:<span style={{fontSize:9,fontWeight:700,color:'#b83232',textTransform:'uppercase'}}>❌ PÉRDIDA{T.commissionPct>0?' BRUTA':''}</span>}
                <br/><UtilBadge util={T.utilidadNeta}/>
                {T.ingresoMXN>0&&<div style={{fontSize:10,color:'#8a8278'}}>Margen: {((T.utilidadNeta/T.ingresoMXN)*100).toFixed(1)}%</div>}
              </> : <span style={{fontSize:11,color:'#8a8278'}}>Sin ingreso</span>}
            </div>
          </div>
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            <div>
              <div style={{fontSize:9,fontWeight:700,color:'#8a8278',textTransform:'uppercase',marginBottom:2}}>Cobrado al cliente</div>
              {editIC ? (
                <div style={{display:'flex',gap:5,alignItems:'center'}}>
                  <input type="number" value={icVal} onChange={e=>setIcVal(e.target.value)} placeholder="0.00" autoFocus style={{border:'1px solid #b8952a',borderRadius:5,padding:'3px 7px',fontSize:12,fontFamily:'inherit',width:110}}/>
                  <span style={{fontSize:11,fontWeight:700,color:'#1565a0'}}>USD</span>
                  <button onClick={confirmIC} style={{background:'#b8952a',color:'#12151f',border:'none',borderRadius:5,padding:'3px 8px',fontSize:11,cursor:'pointer',fontWeight:700}}>✓</button>
                  <button onClick={()=>setEditIC(false)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:14}}>✕</button>
                </div>
              ) : (
                <div onClick={()=>{if(isReadOnly)return;setEditIC(true)}} style={{cursor:isReadOnly?'default':'pointer'}}>
                  <span style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:18,fontWeight:700,color:hayIngLib?'#1565a0':'#8a8278',borderBottom:isReadOnly?'none':'1px dotted #b8952a'}}>
                    {hayIngLib?fmtUSD(circ.importe_cobrado):(isReadOnly?'—':'Clic para capturar')} {!isReadOnly && <span style={{fontSize:10,color:'#b8952a'}}>✎</span>}
                  </span>
                  {hayIngLib&&<div style={{fontSize:10,color:'#8a8278'}}>{fmtMXN(circ.importe_cobrado*TC)} MN</div>}
                </div>
              )}
            </div>
            <div style={{width:1,background:'#d8d2c8'}}/>
            <div>
              <div style={{fontSize:9,fontWeight:700,color:'#8a8278',textTransform:'uppercase',marginBottom:2}}>Costo {socioMode ? '' : 'LIBERO'}</div>
              <span style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:18,fontWeight:700,color:'#b83232'}}>{fmtMXN(T.costoTotal)} MN</span>
              {T.costoUSD>0&&<div style={{fontSize:10,color:'#1565a0'}}>{fmtUSD(T.costoUSD)}</div>}
            </div>
            <div style={{width:1,background:'#d8d2c8'}}/>
            {/* Comisión a Socio (Pietro Lamprati) */}
            <div>
              <div style={{fontSize:9,fontWeight:700,color:'#8a8278',textTransform:'uppercase',marginBottom:2}}>👥 Comisión Pietro</div>
              {editCom ? (
                <div style={{display:'flex',gap:5,alignItems:'center'}}>
                  <input type="number" step="0.01" min="0" value={comVal} onChange={e=>setComVal(e.target.value)} placeholder="0" autoFocus
                    style={{border:'1px solid #b8952a',borderRadius:5,padding:'3px 7px',fontSize:12,fontFamily:'inherit',width:60}}/>
                  <span style={{fontSize:11,fontWeight:700,color:'#8a8278'}}>%</span>
                  <button onClick={()=>{ saveCommission(circ.id, comVal); setEditCom(false) }} style={{background:'#b8952a',color:'#12151f',border:'none',borderRadius:5,padding:'3px 8px',fontSize:11,cursor:'pointer',fontWeight:700}}>✓</button>
                  <button onClick={()=>{ setComVal(circ.commission_pct ?? ''); setEditCom(false) }} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:14}}>✕</button>
                </div>
              ) : (
                <div onClick={()=>{if(isReadOnly)return;setEditCom(true)}} style={{cursor:isReadOnly?'default':'pointer'}}>
                  <span style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:18,fontWeight:700,color:T.commissionPct>0?'#a05a00':'#8a8278',borderBottom:isReadOnly?'none':'1px dotted #b8952a'}}>
                    {T.commissionPct>0 ? `${T.commissionPct}%` : '0%'} {!isReadOnly && <span style={{fontSize:10,color:'#b8952a'}}>✎</span>}
                  </span>
                  {T.commissionPct>0 && hayIngLib && <div style={{fontSize:10,color:'#a05a00'}}>−{fmtMXN(T.comision)} MN</div>}
                  {!T.commissionPct && !isReadOnly && <div style={{fontSize:10,color:'#8a8278',fontStyle:'italic'}}>Clic para capturar</div>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* OPCIONAL — oculto en Vista Socio */}
        {!socioMode && (
        <div style={{background: hayIngOpc?(T.utilidadOpc>=0?'#f0f4ff':'#fff5f5'):'#fafafa', border:`1px solid ${hayIngOpc?(T.utilidadOpc>=0?'#93c5fd':'#fca5a5'):'#d8d2c8'}`, borderRadius:12, padding:'14px 18px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
            <div>
              <div style={{fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:.8,color:'#1565a0',marginBottom:2}}>🔷 Opcionales</div>
              <div style={{fontSize:10,color:'#8a8278'}}>{opc} servicios opcionales</div>
            </div>
            <div style={{textAlign:'right'}}>
              {hayIngOpc ? <>{T.utilidadOpc>=0?<span style={{fontSize:9,fontWeight:700,color:'#1e5c3a',textTransform:'uppercase'}}>✅ UTILIDAD</span>:<span style={{fontSize:9,fontWeight:700,color:'#b83232',textTransform:'uppercase'}}>❌ PÉRDIDA</span>}<br/><UtilBadge util={T.utilidadOpc}/>{T.ingresoOpcTotal>0&&<div style={{fontSize:10,color:'#8a8278'}}>Margen: {((T.utilidadOpc/T.ingresoOpcTotal)*100).toFixed(1)}%</div>}</> : <span style={{fontSize:11,color:'#8a8278'}}>Sin ingreso</span>}
            </div>
          </div>
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            <div>
              <div style={{fontSize:9,fontWeight:700,color:'#8a8278',textTransform:'uppercase',marginBottom:2}}>Ingresos opcionales</div>
              {editOpc ? (
                <div>
                  <div style={{display:'flex',gap:5,alignItems:'center',marginBottom:4}}>
                    <input type="number" value={opcMXN} onChange={e=>setOpcMXN(e.target.value)} placeholder="0.00" style={{border:'1px solid #1565a0',borderRadius:5,padding:'3px 7px',fontSize:11,fontFamily:'inherit',width:90}}/>
                    <span style={{fontSize:10,fontWeight:700,color:'#8a8278'}}>MXN</span>
                  </div>
                  <div style={{display:'flex',gap:5,alignItems:'center'}}>
                    <input type="number" value={opcUSD} onChange={e=>setOpcUSD(e.target.value)} placeholder="0.00" style={{border:'1px solid #1565a0',borderRadius:5,padding:'3px 7px',fontSize:11,fontFamily:'inherit',width:90}}/>
                    <span style={{fontSize:10,fontWeight:700,color:'#1565a0'}}>USD</span>
                    <button onClick={confirmOpc} style={{background:'#1565a0',color:'#fff',border:'none',borderRadius:5,padding:'3px 8px',fontSize:11,cursor:'pointer',fontWeight:700}}>✓</button>
                    <button onClick={()=>setEditOpc(false)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:14}}>✕</button>
                  </div>
                </div>
              ) : (
                <div onClick={()=>{if(isReadOnly)return;setEditOpc(true)}} style={{cursor:isReadOnly?'default':'pointer'}}>
                  {hayIngOpc ? (
                    <div>
                      {T.ingresoOpcMXN>0&&<div style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:15,fontWeight:700}}>{fmtMXN(T.ingresoOpcMXN)} <span style={{fontSize:10,color:'#8a8278'}}>MXN</span></div>}
                      {T.ingresoOpcUSD>0&&<div style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:15,fontWeight:700,color:'#1565a0'}}>{fmtUSD(T.ingresoOpcUSD)} <span style={{fontSize:10}}>USD</span></div>}
                      {!isReadOnly && <span style={{fontSize:10,color:'#b8952a'}}>✎ editar</span>}
                    </div>
                  ) : <span style={{fontSize:13,color:'#8a8278',borderBottom:'1px dotted #1565a0'}}>Clic para capturar <span style={{color:'#b8952a'}}>✎</span></span>}
                </div>
              )}
            </div>
            <div style={{width:1,background:'#d8d2c8'}}/>
            <div>
              <div style={{fontSize:9,fontWeight:700,color:'#8a8278',textTransform:'uppercase',marginBottom:2}}>Costo Opcionales</div>
              <span style={{fontFamily:'Cormorant Garamond,Georgia,serif',fontSize:18,fontWeight:700,color:'#b83232'}}>{fmtMXN(T.costoOpcTotal)} MN</span>
              {T.costoOpcUSD>0&&<div style={{fontSize:10,color:'#1565a0'}}>{fmtUSD(T.costoOpcUSD)}</div>}
            </div>
          </div>
        </div>
        )}
      </div>

      {/* KPIs */}
      <KPIGrid items={[
        socioMode
          ? { cls:'gold', label:'Servicios', val:lib, sub:'incluidos' }
          : { cls:'gold', label:'Servicios', val:circ.rows.length, sub:`${lib} LIBERO · ${opc} OPCIONAL` },
        { cls:'forest', label:'✅ Pagado MXN', val:fmtMXN(T.paidMXN) },
        { cls:'sky', label:'✅ Pagado USD', val:fmtUSD(T.paidUSD) },
        { cls:'rust', label:'⏳ Pendiente MXN', val:fmtMXN(pendMXN) },
        { cls:'rust', label:'⏳ Pendiente USD', val:fmtUSD(pendUSD) },
        { cls:'violet', label:'Tarifario', val:tarifario.length, sub:'proveedores' },
      ]} />

      {/* Tabs */}
      <div style={{display:'flex',gap:3,background:'#ece7df',borderRadius:10,padding:3,marginBottom:18,width:'fit-content',flexWrap:'wrap'}}>
        {[['cxp','💳 CxP'],['proveedores','🏢 Proveedores'],['timeline','📅 Timeline']].map(([id,label]) => (
          <button key={id} onClick={()=>setActiveTab(id)} style={{padding:'7px 15px',border:'none',background:activeTab===id?'#fff':'transparent',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:activeTab===id?700:500,color:activeTab===id?'#12151f':'#8a8278',fontFamily:'inherit'}}>{label}</button>
        ))}
      </div>

      {activeTab==='cxp'&&<CxPPanel circ={circ} tarifario={tarifario} F={F} setFilters={setFilters} filteredRows={filteredRows} socioMode={socioMode} isReadOnly={isReadOnly} togglePaid={togglePaid} setFechaPago={setFechaPago} setNota={setNota} saveProv={saveProv} saveImporte={saveImporte} saveFactura={saveFactura} saveRowField={saveRowField} addRow={addRow} deleteRow={deleteRow}/>}
      {activeTab==='proveedores'&&<ProvPanel circ={circ} tarifario={tarifario} TC={TC}/>}
      {activeTab==='timeline'&&<TimelinePanel circ={circ} tarifario={tarifario}/>}
    </div>
  )
}
// ── CxP Panel ──
function CxPPanel({ circ, tarifario, F, setFilters, filteredRows, socioMode, isReadOnly, togglePaid, setFechaPago, setNota, saveProv, saveImporte, saveFactura, saveRowField, addRow, deleteRow }) {
  const [editCell, setEditCell] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [editVal2, setEditVal2] = useState('')
  const [editMoneda, setEditMoneda] = useState('MXN')
  const [busqueda, setBusqueda] = useState('')
  const tableRef = useRef(null)
  const topScrollRef = useRef(null)
  const syncingRef = useRef(false)

  useEffect(() => {
    const top = topScrollRef.current; const tbl = tableRef.current
    if (!top || !tbl) return
    const sync = (src, dst) => () => { if (syncingRef.current) return; syncingRef.current = true; dst.scrollLeft = src.scrollLeft; requestAnimationFrame(() => { syncingRef.current = false }) }
    const onTop = sync(top, tbl); const onTbl = sync(tbl, top)
    top.addEventListener('scroll', onTop); tbl.addEventListener('scroll', onTbl)
    return () => { top.removeEventListener('scroll', onTop); tbl.removeEventListener('scroll', onTbl) }
  }, [])

  const [tableInnerW, setTableInnerW] = useState(0)
  useEffect(() => {
    if (!tableRef.current) return
    const obs = new ResizeObserver(() => { const t = tableRef.current?.querySelector('table'); if (t) setTableInnerW(t.scrollWidth) })
    obs.observe(tableRef.current); return () => obs.disconnect()
  }, [])

  let rows = filteredRows(circ.rows)
  if (busqueda.trim()) {
    const q = busqueda.trim().toLowerCase()
    rows = rows.filter(r => {
      const imp = getImporte(r, circ.info, tarifario)
      return (r.prov_general||'').toLowerCase().includes(q)||(r.folio_factura||'').toLowerCase().includes(q)||
        (r.servicio||'').toLowerCase().includes(q)||(r.destino||'').toLowerCase().includes(q)||
        (r.clasificacion||'').toLowerCase().includes(q)||(r.tipo||'').toLowerCase().includes(q)||
        (imp.mxn>0&&imp.mxn.toString().includes(q))||(imp.usd>0&&imp.usd.toString().includes(q))
    })
  }
  let tMXN=0, tUSD=0
  rows.forEach(r => { const {mxn,usd}=getImporte(r,circ.info,tarifario); tMXN+=mxn; tUSD+=usd })

  const proveedoresCircuito = [...new Set(circ.rows.map(r=>norm(r.prov_general)).filter(Boolean))].sort()

  const startEdit = (rowId, field, row) => {
    if (isReadOnly) return
    setEditCell({rowId,field}); setEditVal2('')
    if (field==='prov') setEditVal(row.prov_general||'')
    else if (field==='importe') {
      const {mxn,usd}=getImporte(row,circ.info,tarifario)
      setEditMoneda(row.moneda_custom||(usd>0?'USD':'MXN'))
      setEditVal(row.precio_custom||(usd>0?usd:mxn)||'')
    }
    else if (field==='fecha') setEditVal(row.fecha ? dateToLocalStr(row.fecha) : '')
    else if (field==='destino') setEditVal(row.destino||'')
    else if (field==='clasificacion') setEditVal(row.clasificacion||'HOSPEDAJE')
    else if (field==='servicio') setEditVal(row.servicio||'')
    else if (field==='tipo') setEditVal(row.tipo||'LIBERO')
  }

  const confirmEdit = (cid, rowId, field) => {
    if (field==='prov') saveProv(cid,rowId,editVal)
    else if (field==='importe') saveImporte(cid,rowId,parseFloat(editVal)||0,editMoneda)
    else if (field==='fecha') saveRowField(cid,rowId,{fecha:editVal||null})
    else if (field==='destino') saveRowField(cid,rowId,{destino:editVal})
    else if (field==='clasificacion') saveRowField(cid,rowId,{clasificacion:editVal})
    else if (field==='servicio') saveRowField(cid,rowId,{servicio:editVal})
    else if (field==='tipo') saveRowField(cid,rowId,{tipo:editVal})
    setEditCell(null)
  }

  const FBtn = ({fkey,val,label,activeColor}) => {
    const isActive=F[fkey]===val
    return <button onClick={()=>setFilters(p=>({...p,[fkey]:val}))}
      style={{padding:'4px 11px',borderRadius:14,border:`1.5px solid ${isActive?'transparent':'#d8d2c8'}`,background:isActive?(activeColor||'#12151f'):'#f5f1eb',color:isActive?(activeColor==='#b8952a'?'#12151f':'#fff'):'#8a8278',cursor:'pointer',fontSize:11,fontWeight:500,fontFamily:'inherit'}}>{label}</button>
  }

  const hayFiltros = F.tipo!=='ALL'||F.cat!=='ALL'||F.pago!=='ALL'||F.fecha||F.proveedor!=='ALL'||busqueda.trim()
  const EditTD = ({children,onClick,style}) => <td onClick={onClick} style={{padding:'8px 10px',cursor:'pointer',...style}} title="Clic para editar">{children}</td>
  const YesNo = ({val,onClick,small}) => (
    <button onClick={isReadOnly ? undefined : onClick} disabled={isReadOnly} style={{padding:small?'2px 8px':'3px 10px',borderRadius:12,border:'none',cursor:isReadOnly?'default':'pointer',fontSize:11,fontWeight:700,fontFamily:'inherit',background:val?'#d8f3dc':'#ffe0e0',color:val?'#1b4332':'#7f1d1d',whiteSpace:'nowrap',opacity:isReadOnly?0.85:1}}>
      {val?'✅ Sí':'❌ No'}
    </button>
  )

  return (
    <div>
      <div style={{background:'#fff',borderRadius:12,padding:'12px 14px',boxShadow:'0 2px 16px rgba(18,21,31,.07)',marginBottom:14}}>
        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:10,paddingBottom:10,borderBottom:'1px solid #f0ebe3'}}>
          <span style={{fontSize:15}}>🔍</span>
          <input type="text" value={busqueda} onChange={e=>setBusqueda(e.target.value)}
            placeholder="Buscar por proveedor, folio, servicio, tipo, importe…"
            style={{flex:1,border:'1.5px solid #d8d2c8',borderRadius:20,padding:'6px 14px',fontFamily:'inherit',fontSize:12,outline:'none',background:busqueda?'#fffdf5':'#f5f1eb'}}
            onFocus={e=>e.target.style.borderColor='#b8952a'} onBlur={e=>e.target.style.borderColor='#d8d2c8'}/>
          {busqueda&&<button onClick={()=>setBusqueda('')} style={{background:'none',border:'none',color:'#8a8278',cursor:'pointer',fontSize:16}}>✕</button>}
        </div>
        {[
          {key:'tipo',label:'Tipo',opts: socioMode
            ? [['ALL','#12151f','Todos'],['LIBERO','#1e5c3a','🔵 LIBERO']]
            : [['ALL','#12151f','Todos'],['LIBERO','#1e5c3a','🔵 LIBERO'],['OPCIONAL','#1565a0','🔷 OPCIONAL']]},
          {key:'cat',label:'Categoría',opts:[['ALL','#b8952a','Todas'],['HOSPEDAJE','#b8952a','🏨 Hospedaje'],['TRANSPORTE','#b8952a','🚌 Transporte'],['ACTIVIDADES','#b8952a','🎯 Actividades'],['ALIMENTOS','#b8952a','🍽 Alimentos'],['GUIA','#b8952a','🧭 Guía']]},
          {key:'pago',label:'Estatus',opts:[['ALL','#12151f','Todos'],['PAID','#1e5c3a','✅ Pagado'],['UNPAID','#b83232','⏳ Pendiente']]},
        ].map(({key,label,opts})=>(
          <div key={key} style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',marginBottom:7}}>
            <span style={{fontSize:10,fontWeight:700,color:'#8a8278',textTransform:'uppercase',letterSpacing:.6,minWidth:64}}>{label}</span>
            {opts.map(([val,color,lbl])=><FBtn key={val} fkey={key} val={val} label={lbl} activeColor={color}/>)}
          </div>
        ))}
        <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:7}}>
          <span style={{fontSize:10,fontWeight:700,color:'#8a8278',textTransform:'uppercase',letterSpacing:.6,minWidth:64}}>Proveedor</span>
          <select value={F.proveedor} onChange={e=>setFilters(p=>({...p,proveedor:e.target.value}))}
            style={{border:`1.5px solid ${F.proveedor!=='ALL'?'#b8952a':'#d8d2c8'}`,borderRadius:14,padding:'4px 10px',fontFamily:'inherit',fontSize:11,background:F.proveedor!=='ALL'?'#fffdf5':'#f5f1eb',color:'#12151f',cursor:'pointer',outline:'none',minWidth:160}}>
            <option value="ALL">Todos los proveedores</option>
            {proveedoresCircuito.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
          {F.proveedor!=='ALL'&&<button onClick={()=>setFilters(p=>({...p,proveedor:'ALL'}))} style={{fontSize:11,background:'none',border:'none',color:'#8a8278',cursor:'pointer'}}>✕</button>}
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <span style={{fontSize:10,fontWeight:700,color:'#8a8278',textTransform:'uppercase',letterSpacing:.6,minWidth:64}}>Fecha Pago</span>
          <input type="date" value={F.fecha} onChange={e=>setFilters(p=>({...p,fecha:e.target.value}))} style={{border:'1.5px solid #d8d2c8',borderRadius:14,padding:'4px 10px',fontFamily:'inherit',fontSize:11,background:'#f5f1eb'}}/>
          {F.fecha&&<button onClick={()=>setFilters(p=>({...p,fecha:''}))} style={{fontSize:11,background:'none',border:'none',color:'#8a8278',cursor:'pointer'}}>✕</button>}
        </div>
      </div>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div style={{fontSize:12,color:'#8a8278',display:'flex',alignItems:'center',gap:10}}>
          {hayFiltros&&<><span>Mostrando <strong>{rows.length}</strong> de {circ.rows.length} servicios</span><button onClick={()=>{setFilters({tipo:'ALL',cat:'ALL',pago:'ALL',fecha:'',proveedor:'ALL'});setBusqueda('')}} style={{fontSize:11,background:'none',border:'1px solid #d8d2c8',borderRadius:10,padding:'2px 8px',color:'#8a8278',cursor:'pointer'}}>Limpiar filtros</button></>}
        </div>
        {!isReadOnly && <button onClick={()=>addRow(circ.id)} style={{background:'#12151f',color:'#e0c96a',border:'none',borderRadius:8,padding:'7px 14px',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:5}}>＋ Agregar servicio</button>}
      </div>

      {rows.length===0
        ? <div style={{textAlign:'center',padding:'40px 20px',color:'#8a8278',fontSize:13}}>🔍 Sin resultados</div>
        : (
          <div style={{borderRadius:12,boxShadow:'0 2px 16px rgba(18,21,31,.07)',overflow:'hidden'}}>
            {/* Scroll superior — usa scrollWidth exacto */}
            <div ref={topScrollRef} style={{overflowX:'scroll',overflowY:'hidden',height:16,background:'#f0ebe3',borderBottom:'1px solid #e0d9d0'}}>
              <div style={{width:tableInnerW?tableInnerW+'px':'200%',height:1,minWidth:'100%'}}/>
            </div>
            <div ref={tableRef} style={{background:'#fff',overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:1700}}>
                <thead>
                  <tr style={{background:'#070a12',color:'#fff'}}>
                    {['Fecha ✏','Destino ✏','Cat. ✏','Servicio ✏','Tipo ✏','Proveedor ✏','MXN ✏','USD ✏','VB Auditoria','Factura Rec.','Folio Factura','VB Pago','Fecha Pago','Estatus','Notas',''].map(h=>(
                      <th key={h} style={{padding:'10px 8px',textAlign:'left',fontSize:10,textTransform:'uppercase',letterSpacing:.5,whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const {mxn,usd,found,custom}=getImporte(r,circ.info,tarifario)
                    const dc=getDC(r,tarifario)
                    const eC=(f)=>editCell?.rowId===r.id&&editCell?.field===f
                    let dStr='—'
                    if (r.fecha){const d=parseLocalDate(r.fecha);dStr=d.toLocaleDateString('es-MX',{day:'2-digit',month:'short'})}
                    const InlineBtn = ({f,display}) => eC(f)
                      ? null
                      : <span onClick={()=>startEdit(r.id,f,r)} style={{cursor:isReadOnly?'default':'pointer',borderBottom:isReadOnly?'none':'1px dotted #d8d2c8'}}>{display}</span>

                    return (
                      <tr key={r.id} style={{borderBottom:'1px solid #ece7df',background:r.paid?'#f0faf4':'transparent'}}>

                        {/* Fecha */}
                        <td style={{padding:'8px 8px',whiteSpace:'nowrap',minWidth:90}}>
                          {eC('fecha')
                            ? <div style={{display:'flex',gap:3}}><input type="date" autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} style={{border:'1px solid #b8952a',borderRadius:4,padding:'2px 5px',fontSize:11,fontFamily:'inherit',width:110}}/><button onClick={()=>confirmEdit(circ.id,r.id,'fecha')} style={{background:'#b8952a',color:'#12151f',border:'none',borderRadius:4,padding:'2px 7px',fontSize:11,cursor:'pointer',fontWeight:700}}>✓</button><button onClick={()=>setEditCell(null)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:14}}>✕</button></div>
                            : <span onClick={()=>startEdit(r.id,'fecha',r)} style={{cursor:isReadOnly?'default':'pointer',fontSize:11,borderBottom:isReadOnly?'none':'1px dotted #d8d2c8'}}>{dStr}</span>}
                        </td>

                        {/* Destino */}
                        <td style={{padding:'8px 8px',minWidth:90}}>
                          {eC('destino')
                            ? <div style={{display:'flex',gap:3}}><input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} style={{border:'1px solid #b8952a',borderRadius:4,padding:'2px 5px',fontSize:11,fontFamily:'inherit',width:90}}/><button onClick={()=>confirmEdit(circ.id,r.id,'destino')} style={{background:'#b8952a',color:'#12151f',border:'none',borderRadius:4,padding:'2px 7px',fontSize:11,cursor:'pointer',fontWeight:700}}>✓</button><button onClick={()=>setEditCell(null)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:14}}>✕</button></div>
                            : <span onClick={()=>startEdit(r.id,'destino',r)} style={{cursor:isReadOnly?'default':'pointer',fontSize:11,borderBottom:isReadOnly?'none':'1px dotted #d8d2c8'}}>{r.destino||'—'}</span>}
                        </td>

                        {/* Categoría */}
                        <td style={{padding:'8px 8px',minWidth:110}}>
                          {eC('clasificacion')
                            ? <div style={{display:'flex',gap:3}}><select autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} style={{border:'1px solid #b8952a',borderRadius:4,padding:'2px 5px',fontSize:11,fontFamily:'inherit',background:'#fff'}}>
                                {['HOSPEDAJE','TRANSPORTE','ACTIVIDADES','ALIMENTOS','GUIA','OTRO'].map(o=><option key={o}>{o}</option>)}
                              </select><button onClick={()=>confirmEdit(circ.id,r.id,'clasificacion')} style={{background:'#b8952a',color:'#12151f',border:'none',borderRadius:4,padding:'2px 7px',fontSize:11,cursor:'pointer',fontWeight:700}}>✓</button><button onClick={()=>setEditCell(null)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:14}}>✕</button></div>
                            : <span onClick={()=>startEdit(r.id,'clasificacion',r)} style={{cursor:isReadOnly?'default':'pointer'}}><Badge text={r.clasificacion}/></span>}
                        </td>

                        {/* Servicio */}
                        <td style={{padding:'8px 8px',minWidth:130}}>
                          {eC('servicio')
                            ? <div style={{display:'flex',gap:3}}><input autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} style={{border:'1px solid #b8952a',borderRadius:4,padding:'2px 5px',fontSize:11,fontFamily:'inherit',width:120}}/><button onClick={()=>confirmEdit(circ.id,r.id,'servicio')} style={{background:'#b8952a',color:'#12151f',border:'none',borderRadius:4,padding:'2px 7px',fontSize:11,cursor:'pointer',fontWeight:700}}>✓</button><button onClick={()=>setEditCell(null)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:14}}>✕</button></div>
                            : <span onClick={()=>startEdit(r.id,'servicio',r)} style={{cursor:isReadOnly?'default':'pointer',fontWeight:500,fontSize:11,borderBottom:isReadOnly?'none':'1px dotted #d8d2c8'}}>{r.servicio||'—'}</span>}
                        </td>

                        {/* Tipo */}
                        <td style={{padding:'8px 8px',minWidth:90}}>
                          {eC('tipo')
                            ? <div style={{display:'flex',gap:3}}><select autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} style={{border:'1px solid #b8952a',borderRadius:4,padding:'2px 5px',fontSize:11,fontFamily:'inherit',background:'#fff'}}>
                                <option>LIBERO</option><option>OPCIONAL</option>
                              </select><button onClick={()=>confirmEdit(circ.id,r.id,'tipo')} style={{background:'#b8952a',color:'#12151f',border:'none',borderRadius:4,padding:'2px 7px',fontSize:11,cursor:'pointer',fontWeight:700}}>✓</button><button onClick={()=>setEditCell(null)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:14}}>✕</button></div>
                            : <span onClick={()=>startEdit(r.id,'tipo',r)} style={{cursor:isReadOnly?'default':'pointer'}}><TipoBadge tipo={r.tipo}/></span>}
                        </td>

                        {/* Proveedor */}
                        <td style={{padding:'8px 8px',minWidth:155}}>
                          {eC('prov')
                            ? <div style={{display:'flex',gap:3,alignItems:'center'}}><select value={editVal} onChange={e=>setEditVal(e.target.value)} autoFocus style={{border:'1px solid #b8952a',borderRadius:4,padding:'3px 6px',fontSize:11,fontFamily:'inherit',background:'#fff',maxWidth:150}}><option value="">— Sin proveedor —</option>{tarifario.map(t=><option key={t.id||t.proveedor} value={t.proveedor}>{t.proveedor}{(t.tipo_tarifa||'precio_fijo')==='precio_pax'?' 👥 x PAX':''}</option>)}</select><button onClick={()=>confirmEdit(circ.id,r.id,'prov')} style={{background:'#b8952a',color:'#12151f',border:'none',borderRadius:4,padding:'2px 7px',fontSize:11,cursor:'pointer',fontWeight:700}}>✓</button><button onClick={()=>setEditCell(null)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:14}}>✕</button></div>
                            : <div>
                                <span onClick={()=>startEdit(r.id,'prov',r)} style={{fontWeight:600,fontSize:11,cursor:isReadOnly?'default':'pointer',borderBottom:isReadOnly?'none':'1px dotted #b8952a'}}>{r.prov_general||<span style={{color:'#ccc'}}>Sin proveedor</span>}{!found&&tarifario.length>0&&<span style={{color:'#b83232',fontSize:10}}> ⚠</span>}</span>
                                {dc>0&&!r.paid&&<div style={{fontSize:9,color:'#8a8278'}}>{dc}d crédito</div>}
                                {(()=>{ const t=tarifario.find(x=>(x.tipo_tarifa||'precio_fijo')==='precio_pax'&&x.proveedor===r.prov_general); if(!t) return null; const pax=parseInt(circ.info?.pax)||0; const tl=t.incluye_tl?1:0; return <div style={{fontSize:9,color:'#1565a0',fontWeight:600,marginTop:1}}>👥 {pax+tl} PAX{t.incluye_tl?' (c/TL)':''} × {t.moneda==='USD'?'$'+t.precio_pax+' USD':'$'+t.precio_pax+' MN'}</div> })()}
                                {/* Temporada detectada automáticamente por fecha */}
                                {(r.clasificacion||'').toUpperCase()==='HOSPEDAJE'&&(()=>{
                                  const svcDate = r.fecha ? (parseLocalDate(r.fecha)) : null
                                  const provEntries = tarifario.filter(t=>(t.proveedor||'').toUpperCase().trim()===(r.prov_general||'').toUpperCase().trim())
                                  if(provEntries.length < 2 || !svcDate) return null
                                  const svcMD = svcDate.getMonth()*100 + svcDate.getDate()
                                  const matched = provEntries.find(t=>{
                                    if(!t.temp_inicio||!t.temp_fin) return false
                                    const [dI,mI]=(t.temp_inicio).split('/').map(Number)
                                    const [dF,mF]=(t.temp_fin).split('/').map(Number)
                                    if(!dI||!mI||!dF||!mF) return false
                                    const start=(mI-1)*100+dI, end=(mF-1)*100+dF
                                    return start<=end ? svcMD>=start&&svcMD<=end : svcMD>=start||svcMD<=end
                                  })
                                  if(!matched || (matched.temporada||'General')==='General') return null
                                  return <div style={{fontSize:9,color:'#1565a0',fontWeight:600,marginTop:2}}>📅 {matched.temporada} ({matched.temp_inicio}→{matched.temp_fin})</div>
                                })()}
                              </div>}
                        </td>

                        {/* MXN */}
                        <td style={{padding:'8px 8px',minWidth:105}}>
                          {eC('importe')
                            ? <div style={{display:'flex',flexDirection:'column',gap:3}}><input type="number" value={editVal} onChange={e=>setEditVal(e.target.value)} placeholder="Importe" autoFocus style={{border:'1px solid #b8952a',borderRadius:4,padding:'2px 6px',fontSize:11,fontFamily:'inherit',width:90}}/><div style={{display:'flex',gap:3,alignItems:'center'}}><select value={editMoneda} onChange={e=>setEditMoneda(e.target.value)} style={{border:'1px solid #b8952a',borderRadius:4,padding:'2px 4px',fontSize:11,fontFamily:'inherit',background:'#fff'}}><option>MXN</option><option>USD</option></select><button onClick={()=>confirmEdit(circ.id,r.id,'importe')} style={{background:'#b8952a',color:'#12151f',border:'none',borderRadius:4,padding:'2px 7px',fontSize:11,cursor:'pointer',fontWeight:700}}>✓</button><button onClick={()=>setEditCell(null)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:14}}>✕</button></div></div>
                            : <span onClick={()=>startEdit(r.id,'importe',r)} style={{fontWeight:700,cursor:isReadOnly?'default':'pointer',borderBottom:isReadOnly?'none':`1px dotted ${custom?'#b8952a':'#ddd'}`,color:custom?'#b8952a':'#12151f'}}>{mxn>0?fmtMXN(mxn):<span style={{color:'#ccc'}}>—</span>}{custom&&mxn>0&&<span style={{fontSize:9,marginLeft:2}}>✎</span>}</span>}
                        </td>

                        {/* USD */}
                        <td style={{padding:'8px 8px',minWidth:85}}>
                          <span onClick={()=>startEdit(r.id,'importe',r)} style={{fontWeight:700,cursor:isReadOnly?'default':'pointer',borderBottom:isReadOnly?'none':`1px dotted ${custom?'#b8952a':'#ddd'}`,color:usd>0?(custom?'#b8952a':'#1565a0'):'#ccc'}}>{usd>0?fmtUSD(usd):'—'}{custom&&usd>0&&<span style={{fontSize:9,marginLeft:2}}>✎</span>}</span>
                        </td>

                        {/* VB Auditoria */}
                        <td style={{padding:'8px 8px',textAlign:'center',minWidth:100}}>
                          <YesNo val={r.visto_bueno_auditoria} onClick={()=>saveFactura(circ.id,r.id,'visto_bueno_auditoria',!r.visto_bueno_auditoria)}/>
                        </td>

                        {/* Factura Recibida */}
                        <td style={{padding:'8px 8px',textAlign:'center',minWidth:95}}>
                          <YesNo val={r.factura_recibida} onClick={()=>saveFactura(circ.id,r.id,'factura_recibida',!r.factura_recibida)}/>
                        </td>

                        {/* Folio Factura */}
                        <td style={{padding:'8px 8px',minWidth:115}}>
                          <input type="text" defaultValue={r.folio_factura||''} placeholder="Folio…" disabled={isReadOnly}
                            onBlur={e=>{if(e.target.value!==(r.folio_factura||''))saveFactura(circ.id,r.id,'folio_factura',e.target.value)}}
                            style={{width:'100%',fontSize:11,border:'1px solid transparent',borderRadius:5,padding:'3px 6px',fontFamily:'inherit',background:r.folio_factura?'#fffdf5':'transparent',color:'#12151f',outline:'none',cursor:isReadOnly?'default':'text'}}
                            onFocus={e=>{if(isReadOnly)return;e.target.style.borderColor='#b8952a';e.target.style.background='#fffdf5'}}
                            onBlurCapture={e=>{e.target.style.borderColor='transparent';if(!r.folio_factura)e.target.style.background='transparent'}}/>
                        </td>

                        {/* VB Pago */}
                        <td style={{padding:'8px 8px',textAlign:'center',minWidth:100}}>
                          <YesNo val={r.visto_bueno_pago} onClick={()=>saveFactura(circ.id,r.id,'visto_bueno_pago',!r.visto_bueno_pago)}/>
                        </td>

                        {/* Fecha Pago */}
                        <td style={{padding:'8px 8px',minWidth:118}}>
                          <input type="date" value={r.fecha_pago||''} disabled={isReadOnly} onChange={e=>setFechaPago(circ.id,r.id,e.target.value)} style={{border:'1px solid #d8d2c8',borderRadius:5,padding:'3px 6px',fontSize:11,fontFamily:'inherit',width:115,cursor:isReadOnly?'default':'text',opacity:isReadOnly?0.7:1}}/>
                        </td>

                        {/* Estatus */}
                        <td style={{padding:'8px 8px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:5,whiteSpace:'nowrap'}}>
                            <button onClick={isReadOnly?undefined:()=>togglePaid(circ.id,r.id,r.paid)} disabled={isReadOnly} style={{width:32,height:17,borderRadius:9,border:'none',background:r.paid?'#52b788':'#ccc',cursor:isReadOnly?'default':'pointer',position:'relative',flexShrink:0,opacity:isReadOnly?0.85:1}}>
                              <div style={{position:'absolute',top:2,left:r.paid?15:2,width:13,height:13,borderRadius:'50%',background:'#fff',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.2)'}}/>
                            </button>
                            <span style={{fontSize:10,fontWeight:700,color:r.paid?'#1e5c3a':'#b83232'}}>{r.paid?'PAGADO':'PENDIENTE'}</span>
                          </div>
                        </td>

                        {/* Notas */}
                        <td style={{padding:'8px 8px'}}>
                          <textarea defaultValue={r.nota||''} placeholder="Nota…" rows={1} disabled={isReadOnly} onBlur={e=>setNota(circ.id,r.id,e.target.value)}
                            style={{width:110,fontSize:11,border:'1px solid transparent',borderRadius:5,padding:'3px 5px',fontFamily:'inherit',resize:'none',background:'transparent',lineHeight:1.4,cursor:isReadOnly?'default':'text',opacity:isReadOnly?0.85:1}}
                            onFocus={e=>{if(isReadOnly)return;e.target.style.borderColor='#b8952a';e.target.style.background='#fffdf5'}}
                            onBlurCapture={e=>{e.target.style.borderColor='transparent';e.target.style.background='transparent'}}/>
                        </td>

                        {/* Eliminar */}
                        <td style={{padding:'8px 8px',textAlign:'center',minWidth:30}}>
                          {!isReadOnly && <button onClick={()=>deleteRow(circ.id,r.id)} style={{background:'none',border:'none',color:'#e0b8b8',cursor:'pointer',fontSize:14,lineHeight:1}} title="Eliminar fila">🗑</button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{background:'#ece7df'}}>
                    <td colSpan={6} style={{padding:'8px 10px',fontSize:11,color:'#8a8278'}}>{rows.length} servicio{rows.length!==1?'s':''}</td>
                    <td style={{padding:'8px 10px',fontWeight:700}}>{tMXN>0?fmtMXN(tMXN):'—'}</td>
                    <td style={{padding:'8px 10px',fontWeight:700,color:'#1565a0'}}>{tUSD>0?fmtUSD(tUSD):'—'}</td>
                    <td colSpan={8}/>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      }
    </div>
  )
}
// ── Proveedores ──
function ProvPanel({ circ, tarifario, TC }) {
  const pm = {}
  circ.rows.forEach((r) => {
    const p = r.prov_general; if (!p) return
    const k = p.toUpperCase()
    if (!pm[k]) pm[k] = { s: [], mxn: 0, usd: 0, cats: new Set(), paid: 0, unpaid: 0 }
    pm[k].s.push(r); pm[k].cats.add(r.clasificacion || '')
    const { mxn, usd } = getImporte(r, circ.info, tarifario)
    pm[k].mxn += mxn; pm[k].usd += usd
    r.paid ? pm[k].paid++ : pm[k].unpaid++
  })
  const provs = Object.entries(pm).sort((a, b) => (b[1].mxn + b[1].usd * TC) - (a[1].mxn + a[1].usd * TC))
  return (
    <div>
      <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 17, fontWeight: 700, marginBottom: 14 }}>
        Proveedores <span style={{ background: '#b8952a', color: '#12151f', borderRadius: 10, padding: '1px 8px', fontSize: 12, fontFamily: 'inherit' }}>{provs.length}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: 12 }}>
        {provs.map(([name, d]) => {
          const tar = tarifario.find((t) => norm(t.proveedor) === name)
          return (
            <div key={name} style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 2px 16px rgba(18,21,31,.07)', borderTop: `3px solid ${d.unpaid === 0 ? '#52b788' : '#b83232'}` }}>
              <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 15, fontWeight: 700, marginBottom: 3 }}>{name}</div>
              <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 10 }}>{d.s.length} svc · ✅ {d.paid} · ⏳ {d.unpaid} {tar ? `· ${tar.dias_credito}d crédito` : ''}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div style={{ background: '#ece7df', borderRadius: 7, padding: '7px 10px' }}><div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#8a8278' }}>MXN</div><div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 16, fontWeight: 700 }}>{d.mxn > 0 ? fmtMXN(d.mxn) : '—'}</div></div>
                <div style={{ background: '#e3f2fd', borderRadius: 7, padding: '7px 10px' }}><div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#1565a0' }}>USD</div><div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 16, fontWeight: 700, color: '#1565a0' }}>{d.usd > 0 ? fmtUSD(d.usd) : '—'}</div></div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{[...d.cats].filter(Boolean).map((c) => <Badge key={c} text={c} />)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Timeline ──
function TimelinePanel({ circ, tarifario }) {
  const dm = {}
  circ.rows.forEach((r) => {
    let k = 'Sin fecha', dl = ''
    if (r.fecha) { const d = parseLocalDate(r.fecha); k = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); dl = d.toLocaleDateString('es-MX', { weekday: 'long' }) }
    if (!dm[k]) dm[k] = { dl, items: [] }
    dm[k].items.push(r)
  })
  return (
    <div>
      {Object.entries(dm).map(([date, d]) => (
        <div key={date} style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 12, marginBottom: 8 }}>
          <div style={{ textAlign: 'right', paddingTop: 12 }}>
            <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 13, fontWeight: 700 }}>{date}</div>
            <div style={{ fontSize: 10, color: '#8a8278' }}>{d.dl}</div>
          </div>
          <div style={{ borderLeft: '2px solid #d8d2c8', paddingLeft: 16, paddingBottom: 12 }}>
            {d.items.map((r) => {
              const { mxn, usd } = getImporte(r, circ.info, tarifario)
              const amt = mxn > 0 ? fmtMXN(mxn) : usd > 0 ? fmtUSD(usd) + ' USD' : '—'
              return (
                <div key={r.id} style={{ background: '#fff', borderRadius: 9, padding: '10px 13px', marginBottom: 7, boxShadow: '0 1px 6px rgba(0,0,0,.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.servicio || '—'} <span style={{ fontWeight: 400, color: '#8a8278' }}>· {r.destino || ''}</span></div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}><Badge text={r.clasificacion} /><TipoBadge tipo={r.tipo} /><span style={{ fontSize: 11, color: '#8a8278' }}>{r.prov_general || ''}</span></div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{amt}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: r.paid ? '#1e5c3a' : '#b83232' }}>{r.paid ? '✅ PAGADO' : '⏳ PENDIENTE'}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}


// ── BuscadorResultados — agrupa por proveedor → mes colapsable ──
function BuscadorResultados({ filas, provNombres, saveImporte, saveFactura, setFechaPago, togglePaid, onGoCircuit, tarifario, isReadOnly, seleccionados, toggleSel }) {
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const [mesesAbiertos, setMesesAbiertos] = useState({}) // key: "provNombre|YYYY-MM"
  const toggleMes = (key) => setMesesAbiertos(p => ({...p, [key]: !p[key]}))

  const FilaTabla = ({r}) => {
    const fi = r.fecha ? (parseLocalDate(r.fecha)) : null
    const fStr = fi ? fi.toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}) : '—'
    const pax = r._circ.info?.pax || '—'
    const habs = ((parseInt(r._circ.info?.habs_single)||0)+(parseInt(r._circ.info?.habs_doble)||0)) || '—'
    const isSel = seleccionados && seleccionados.has(r.id)
    return (
      <tr style={{borderBottom:'1px solid #f0ebe3',background: isSel ? '#fffdf5' : (r.paid?'#f9fef9':'#fff')}}>
        <td style={{padding:'6px 6px',textAlign:'center',width:30}}>
          <input type="checkbox" checked={!!isSel} onChange={()=>toggleSel && toggleSel(r.id)}
            style={{width:15,height:15,cursor:'pointer',accentColor:'#b8952a'}}
            title="Seleccionar para sumar"/>
        </td>
        <td style={{padding:'6px 8px',fontWeight:700,fontSize:10,whiteSpace:'nowrap',maxWidth:240}}>
          <div style={{color:'#b8952a',lineHeight:1.3}}>{r._circ.id}</div>
        </td>
        <td style={{padding:'6px 8px',fontSize:11,whiteSpace:'nowrap'}}>{fStr}</td>
        <td style={{padding:'6px 8px',fontSize:11,maxWidth:130}}>{r.servicio||'—'}</td>
        <td style={{padding:'6px 8px',fontSize:11,textAlign:'center',fontWeight:600}}>{pax}</td>
        <td style={{padding:'6px 8px',fontSize:11,textAlign:'center',fontWeight:600}}>{habs}</td>
        <td style={{padding:'4px 6px',minWidth:130}}>
          <FilaImporte r={r} saveImporte={saveImporte} tarifario={tarifario} isReadOnly={isReadOnly}/>
        </td>
        <td style={{padding:'4px 6px',textAlign:'center'}}>
          <button onClick={isReadOnly?undefined:()=>saveFactura(r._circ.id,r.id,'factura_recibida',!r.factura_recibida)} disabled={isReadOnly}
            style={{padding:'2px 6px',borderRadius:10,border:'none',cursor:isReadOnly?'default':'pointer',fontSize:10,fontWeight:700,background:r.factura_recibida?'#d8f3dc':'#ffe0e0',color:r.factura_recibida?'#1b4332':'#7f1d1d',opacity:isReadOnly?0.85:1}}>
            {r.factura_recibida?'✅':'❌'}
          </button>
        </td>
        <td style={{padding:'4px 6px',minWidth:80}}>
          <input type="text" defaultValue={r.folio_factura||''} placeholder="Folio…" disabled={isReadOnly}
            onBlur={e=>{if(e.target.value!==(r.folio_factura||''))saveFactura(r._circ.id,r.id,'folio_factura',e.target.value)}}
            style={{width:78,fontSize:11,border:'1px solid transparent',borderRadius:5,padding:'3px 5px',fontFamily:'inherit',background:r.folio_factura?'#fffdf5':'#f5f1eb',outline:'none',cursor:isReadOnly?'default':'text'}}
            onFocus={e=>{if(isReadOnly)return;e.target.style.borderColor='#b8952a';e.target.style.background='#fffdf5'}}
            onBlurCapture={e=>{e.target.style.borderColor='transparent';if(!r.folio_factura)e.target.style.background='#f5f1eb'}}/>
        </td>
        <td style={{padding:'4px 6px',minWidth:118}}>
          <input type="date" defaultValue={r.fecha_pago||''} disabled={isReadOnly}
            onBlur={e=>{if(e.target.value!==(r.fecha_pago||''))setFechaPago(r._circ.id,r.id,e.target.value)}}
            style={{border:'1px solid #d8d2c8',borderRadius:5,padding:'3px 5px',fontSize:11,fontFamily:'inherit',width:115,background:'#fff',cursor:isReadOnly?'default':'text',opacity:isReadOnly?0.7:1}}/>
        </td>
        <td style={{padding:'4px 6px',textAlign:'center'}}>
          <button onClick={isReadOnly?undefined:()=>saveFactura(r._circ.id,r.id,'visto_bueno_auditoria',!r.visto_bueno_auditoria)} disabled={isReadOnly}
            style={{padding:'2px 6px',borderRadius:10,border:'none',cursor:isReadOnly?'default':'pointer',fontSize:10,fontWeight:700,background:r.visto_bueno_auditoria?'#d8f3dc':'#ffe0e0',color:r.visto_bueno_auditoria?'#1b4332':'#7f1d1d',opacity:isReadOnly?0.85:1}}>
            {r.visto_bueno_auditoria?'✅ Sí':'❌ No'}
          </button>
        </td>
        <td style={{padding:'4px 6px',textAlign:'center'}}>
          <button onClick={isReadOnly?undefined:()=>saveFactura(r._circ.id,r.id,'visto_bueno_pago',!r.visto_bueno_pago)} disabled={isReadOnly}
            style={{padding:'2px 6px',borderRadius:10,border:'none',cursor:isReadOnly?'default':'pointer',fontSize:10,fontWeight:700,background:r.visto_bueno_pago?'#d8f3dc':'#ffe0e0',color:r.visto_bueno_pago?'#1b4332':'#7f1d1d',opacity:isReadOnly?0.85:1}}>
            {r.visto_bueno_pago?'✅ Sí':'❌ No'}
          </button>
        </td>
        <td style={{padding:'4px 6px',textAlign:'center'}}>
          {r.paid
            ? <span style={{background:'#d8f3dc',color:'#1b4332',borderRadius:8,padding:'3px 7px',fontSize:10,fontWeight:700,whiteSpace:'nowrap'}}>✅ Pagado</span>
            : <button onClick={isReadOnly?undefined:()=>togglePaid(r._circ.id,r.id,false)} disabled={isReadOnly}
                style={{background:'#1565a0',color:'#fff',border:'none',borderRadius:6,padding:'3px 8px',fontSize:10,cursor:isReadOnly?'default':'pointer',fontWeight:700,whiteSpace:'nowrap',opacity:isReadOnly?0.7:1}}>
                Marcar pagado ✓
              </button>
          }
        </td>
        <td style={{padding:'4px 6px'}}>
          <button onClick={()=>onGoCircuit(r._circ.id)} style={{background:'none',border:'1px solid #d8d2c8',color:'#8a8278',borderRadius:5,padding:'2px 6px',fontSize:10,cursor:'pointer',whiteSpace:'nowrap'}}>Ver →</button>
        </td>
      </tr>
    )
  }

  const ColHeaders = () => (
    <tr style={{background:'#f5f1eb'}}>
      {['','Circuito','Fecha svc','Servicio','PAX','HAB','Importe','Fact. Rec.','Folio','Fecha Pago','VB Aud.','VB Pago','Estatus',''].map((h, i)=>(
        <th key={i} style={{padding:'7px 8px',textAlign:'left',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:.5,color:'#8a8278',whiteSpace:'nowrap',width: i===0 ? 30 : 'auto'}}>{h}</th>
      ))}
    </tr>
  )

  return (
    <div>
      {provNombres.map(provNombre => {
        const filasP = filas.filter(r => r.prov_general === provNombre)
        const pendP = filasP.filter(r=>!r.paid), pagP = filasP.filter(r=>r.paid)
        const totalCircs = new Set(filasP.map(r=>r._circ.id)).size

        // Agrupar por mes YYYY-MM basado en fecha del servicio
        const porMes = {}
        filasP.forEach(r => {
          const fi = r.fecha ? (parseLocalDate(r.fecha)) : null
          const mk = fi ? fi.getFullYear()+'-'+String(fi.getMonth()+1).padStart(2,'0') : '0000-00'
          if (!porMes[mk]) porMes[mk] = []
          porMes[mk].push(r)
        })
        const mesesOrdenados = Object.keys(porMes).sort()

        const mkLabel = (mk) => {
          if (mk === '0000-00') return 'Sin fecha'
          const [y, m] = mk.split('-')
          return MESES[parseInt(m)-1] + ' ' + y
        }

        return (
          <div key={provNombre} style={{marginBottom:20}}>
            {/* Cabecera proveedor — siempre visible */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 16px',background:'#12151f',borderRadius:10,color:'#fff'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                <span style={{fontSize:15,fontWeight:700,color:'#e0c96a'}}>{provNombre}</span>
                <span style={{fontSize:10,color:'rgba(255,255,255,.4)'}}>{filasP.length} servicio{filasP.length!==1?'s':''} · {totalCircs} circuito{totalCircs!==1?'s':''} · {mesesOrdenados.length} mes{mesesOrdenados.length!==1?'es':''}</span>
              </div>
              <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
                {pendP.length>0&&<span style={{fontSize:11,color:'#fca5a5',fontFamily:"'IBM Plex Mono',monospace",fontWeight:700}}>
                  ⏳ {fmtMXN(pendP.reduce((a,r)=>a+r._mxn,0))+' MN'}{pendP.reduce((a,r)=>a+r._usd,0)>0&&' · '+fmtUSD(pendP.reduce((a,r)=>a+r._usd,0))+' USD'}
                </span>}
                {pagP.length>0&&<span style={{fontSize:11,color:'#86efac',fontFamily:"'IBM Plex Mono',monospace",fontWeight:700}}>
                  ✅ {fmtMXN(pagP.reduce((a,r)=>a+r._mxn,0))+' MN'}{pagP.reduce((a,r)=>a+r._usd,0)>0&&' · '+fmtUSD(pagP.reduce((a,r)=>a+r._usd,0))+' USD'}
                </span>}
              </div>
            </div>

            {/* Meses colapsables */}
            <div style={{border:'1px solid #ece7df',borderTop:'none',borderRadius:'0 0 10px 10px',overflow:'hidden'}}>
              {mesesOrdenados.map((mk, mi) => {
                const filasMes = porMes[mk]
                const pendM = filasMes.filter(r=>!r.paid), pagM = filasMes.filter(r=>r.paid)
                const mxnM = filasMes.reduce((a,r)=>a+r._mxn,0), usdM = filasMes.reduce((a,r)=>a+r._usd,0)
                const abierto = !!mesesAbiertos[provNombre+'|'+mk]
                const esUltimo = mi === mesesOrdenados.length - 1

                return (
                  <div key={mk}>
                    {/* Header mes — clic para expandir */}
                    <div onClick={()=>toggleMes(provNombre+'|'+mk)}
                      style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 14px',background:abierto?'#f0f4ff':'#fafaf8',cursor:'pointer',borderBottom: abierto||!esUltimo?'1px solid #ece7df':'none',transition:'background .15s',userSelect:'none'}}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <span style={{fontSize:13,transition:'transform .2s',display:'inline-block',transform:abierto?'rotate(90deg)':'rotate(0deg)',color:'#8a8278'}}>▶</span>
                        <span style={{fontWeight:700,fontSize:13,color:'#12151f'}}>{mkLabel(mk)}</span>
                        <span style={{fontSize:11,color:'#8a8278'}}>{filasMes.length} servicio{filasMes.length!==1?'s':''}</span>
                        {pendM.length>0&&<span style={{fontSize:10,color:'#b83232',fontWeight:600}}>⏳ {pendM.length} pend.</span>}
                        {pagM.length>0&&<span style={{fontSize:10,color:'#1e5c3a',fontWeight:600}}>✅ {pagM.length} pag.</span>}
                      </div>
                      <div style={{display:'flex',gap:10,fontSize:11,fontFamily:"'IBM Plex Mono',monospace",fontWeight:700}}>
                        {mxnM>0&&<span style={{color:'#12151f'}}>{fmtMXN(mxnM)} MN</span>}
                        {usdM>0&&<span style={{color:'#1565a0'}}>{fmtUSD(usdM)} USD</span>}
                      </div>
                    </div>

                    {/* Tabla del mes — solo visible si abierto */}
                    {abierto && (
                      <div style={{overflowX:'auto',borderBottom:esUltimo?'none':'1px solid #ece7df'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:1100}}>
                          <thead><ColHeaders/></thead>
                          <tbody>
                            {filasMes.map(r=><FilaTabla key={r.id} r={r}/>)}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── FilaImporte — importe editable en tabla de búsqueda de Pagos ──
function FilaImporte({ r, saveImporte, tarifario, isReadOnly }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')
  const [mon, setMon] = useState('MXN')

  const startEdit = () => {
    if (isReadOnly) return
    setEditing(true)
    if (r.precio_custom != null && r.precio_custom > 0) {
      setVal(r.precio_custom); setMon(r.moneda_custom || 'MXN')
    } else {
      setVal(r._mxn > 0 ? r._mxn : r._usd); setMon(r._usd > 0 ? 'USD' : 'MXN')
    }
  }
  const confirm = () => {
    saveImporte(r._circ.id, r.id, parseFloat(val) || 0, mon)
    setEditing(false)
  }
  const custom = r.precio_custom != null && r.precio_custom > 0

  if (editing) return (
    <div style={{display:'flex',flexDirection:'column',gap:3}}>
      <input type="number" autoFocus value={val} onChange={e=>setVal(e.target.value)}
        style={{border:'1px solid #b8952a',borderRadius:4,padding:'2px 5px',fontSize:11,fontFamily:'inherit',width:90,outline:'none'}}/>
      <div style={{display:'flex',gap:3,alignItems:'center'}}>
        <select value={mon} onChange={e=>setMon(e.target.value)}
          style={{border:'1px solid #b8952a',borderRadius:4,padding:'2px 4px',fontSize:11,fontFamily:'inherit',background:'#fff'}}>
          <option>MXN</option><option>USD</option>
        </select>
        <button onClick={confirm} style={{background:'#b8952a',color:'#12151f',border:'none',borderRadius:4,padding:'2px 6px',fontSize:11,cursor:'pointer',fontWeight:700}}>✓</button>
        <button onClick={()=>setEditing(false)} style={{background:'none',border:'none',color:'#aaa',cursor:'pointer',fontSize:13}}>✕</button>
      </div>
    </div>
  )

  return (
    <div onClick={startEdit} style={{cursor:isReadOnly?'default':'pointer',minWidth:110}}>
      {r._mxn>0&&<div style={{fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:12,borderBottom:isReadOnly?'none':'1px dotted '+(custom?'#b8952a':'#ddd'),color:custom?'#b8952a':'#12151f',display:'inline-block'}}>
        {fmtMXN(r._mxn)} <span style={{fontSize:9,color:'#8a8278'}}>MN</span>{custom&&!isReadOnly&&<span style={{fontSize:9,marginLeft:2}}>✎</span>}
      </div>}
      {r._usd>0&&<div style={{fontFamily:"'IBM Plex Mono',monospace",fontWeight:700,fontSize:12,borderBottom:isReadOnly?'none':'1px dotted '+(custom?'#b8952a':'#ddd'),color:custom?'#b8952a':'#1565a0',display:'inline-block'}}>
        {fmtUSD(r._usd)} <span style={{fontSize:9}}>USD</span>{custom&&!isReadOnly&&<span style={{fontSize:9,marginLeft:2}}>✎</span>}
      </div>}
      {r._mxn===0&&r._usd===0&&<span style={{fontSize:10,color:'#ccc',borderBottom:isReadOnly?'none':'1px dotted #ddd'}}>—{!isReadOnly&&' ✎'}</span>}
    </div>
  )
}

