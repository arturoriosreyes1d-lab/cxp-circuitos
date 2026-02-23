import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase'
import Login from './Login'
import { Badge, TipoBadge, Btn, KPIGrid, Modal, Spinner } from './components'
import { norm, clean, parseAmt, fmtMXN, fmtUSD, cap, getDC, parseCircuito } from './helpers'

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
  const match = tarifario.find((t) => norm(t.proveedor) === pKey)
  if (!match || match.precio === 0) return { mxn: 0, usd: 0, found: false, custom: false }
  const unidades = norm(row.clasificacion) === 'HOSPEDAJE' ? (parseInt(circInfo?.habs) || 1) : 1
  const total = match.precio * unidades
  return match.moneda === 'USD' ? { mxn: 0, usd: total, found: true, custom: false } : { mxn: total, usd: 0, found: true, custom: false }
}

// Calcular totales de un circuito
function calcCircTotals(circ, tarifario, TC) {
  let costoMXN = 0, costoUSD = 0, paidMXN = 0, paidUSD = 0
  circ.rows.forEach((r) => {
    const { mxn, usd } = getImporte(r, circ.info, tarifario)
    costoMXN += mxn; costoUSD += usd
    if (r.paid) { paidMXN += mxn; paidUSD += usd }
  })
  const costoTotal = costoMXN + costoUSD * TC
  const ingreso = circ.importe_cobrado || 0
  const ingresoMXN = circ.moneda_cobrado === 'USD' ? ingreso * TC : ingreso
  const utilidad = ingresoMXN - costoTotal
  return { costoMXN, costoUSD, costoTotal, paidMXN, paidUSD, ingreso, ingresoMXN, utilidad }
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
  const [circuits, setCircuits] = useState([])
  const [tarifario, setTarifario] = useState([])
  const [TC, setTC] = useState(17.5)
  const [dataLoading, setDataLoading] = useState(true)
  const [view, setView] = useState({ type: 'empty' })
  const [F, setFilters] = useState({ tipo: 'ALL', cat: 'ALL', pago: 'ALL', fecha: '', proveedor: 'ALL' })
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [modal, setModal] = useState(null)
  const [pendingCircuit, setPendingCircuit] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [activeTab, setActiveTab] = useState('cxp')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()
  const tarFileRef = useRef()

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setDataLoading(true)
    try {
      const { data: tar } = await supabase.from('tarifario').select('*').order('proveedor')
      if (tar) setTarifario(tar)
      const { data: settings } = await supabase.from('team_settings').select('tc').eq('id', 1).single()
      if (settings) setTC(settings.tc)
      const { data: circs } = await supabase.from('circuits').select('*').order('created_at', { ascending: false })
      if (circs && circs.length > 0) {
        const { data: allRows } = await supabase.from('circuit_rows').select('*').order('idx')
        const full = circs.map((c) => ({
          ...c,
          rows: (allRows || []).filter((r) => r.circuit_id === c.id).map((r) => ({ ...r, fecha: r.fecha ? new Date(r.fecha) : null })),
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
    setSaving(true)
    try {
      await supabase.from('circuits').upsert({ id: pendingCircuit.id, month_key: pendingCircuit.monthKey, info: pendingCircuit.info })
      await supabase.from('circuit_rows').delete().eq('circuit_id', pendingCircuit.id)
      await supabase.from('circuit_rows').insert(pendingCircuit.rows.map((r) => ({
        circuit_id: pendingCircuit.id, idx: r.idx, fecha: r.fecha,
        destino: r.destino, clasificacion: r.clasificacion, servicio: r.servicio,
        tipo: r.tipo, prov_general: r.prov_general, t_venta: r.t_venta,
        paid: false, fecha_pago: null, nota: '', precio_custom: null, moneda_custom: null,
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
    setSaving(true)
    try {
      await supabase.from('tarifario').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (rows.length > 0) await supabase.from('tarifario').insert(rows.map((r) => ({ proveedor: r.proveedor, tipo_servicio: r.tipo_servicio, precio: r.precio, moneda: r.moneda, dias_credito: r.dias_credito || 0, notas: r.notas })))
      const { data } = await supabase.from('tarifario').select('*').order('proveedor')
      if (data) setTarifario(data)
    } catch (e) { console.error(e) }
    setSaving(false); setModal(null)
  }

  const updateRow = useCallback((cid, rowId, changes) => {
    setCircuits((prev) => prev.map((c) => c.id !== cid ? c : { ...c, rows: c.rows.map((r) => r.id !== rowId ? r : { ...r, ...changes }) }))
  }, [])

  const togglePaid = async (cid, rowId, current) => {
    await supabase.from('circuit_rows').update({ paid: !current }).eq('id', rowId)
    updateRow(cid, rowId, { paid: !current })
  }
  const setFechaPago = async (cid, rowId, val) => {
    await supabase.from('circuit_rows').update({ fecha_pago: val || null }).eq('id', rowId)
    updateRow(cid, rowId, { fecha_pago: val })
  }
  const setNota = useCallback(async (cid, rowId, val) => {
    await supabase.from('circuit_rows').update({ nota: val }).eq('id', rowId)
    updateRow(cid, rowId, { nota: val })
  }, [updateRow])
  const saveProv = async (cid, rowId, val) => {
    await supabase.from('circuit_rows').update({ prov_general: val, precio_custom: null, moneda_custom: null }).eq('id', rowId)
    updateRow(cid, rowId, { prov_general: val, precio_custom: null, moneda_custom: null })
  }
  const saveImporte = async (cid, rowId, precio, moneda) => {
    await supabase.from('circuit_rows').update({ precio_custom: precio || null, moneda_custom: moneda }).eq('id', rowId)
    updateRow(cid, rowId, { precio_custom: precio || null, moneda_custom: moneda })
  }
  const saveImporteCobrado = async (cid, valor, moneda) => {
    await supabase.from('circuits').update({ importe_cobrado: valor || null, moneda_cobrado: moneda }).eq('id', cid)
    setCircuits((prev) => prev.map((c) => c.id !== cid ? c : { ...c, importe_cobrado: valor || null, moneda_cobrado: moneda }))
  }
  const deleteCircuit = async () => {
    await supabase.from('circuits').delete().eq('id', deleteId)
    const next = circuits.filter((c) => c.id !== deleteId)
    setCircuits(next); setView(next.length > 0 ? { type: 'all' } : { type: 'empty' }); setModal(null)
  }
  const updateTC = async (val) => {
    const v = parseFloat(val); if (!v || v <= 0) return
    setTC(v); await supabase.from('team_settings').update({ tc: v }).eq('id', 1)
  }
  const logout = () => supabase.auth.signOut()

  const monthMap = {}
  circuits.forEach((c) => { const mk = c.month_key || 'Sin mes'; if (!monthMap[mk]) monthMap[mk] = []; monthMap[mk].push(c) })
  const sortedMonths = Object.keys(monthMap).sort((a, b) => a.localeCompare(b))

  const filteredRows = (rows) => rows.filter((r) => {
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
    <div style={{ fontFamily: "'Outfit', sans-serif", background: '#f5f1eb', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ── HEADER ── */}
      <header style={{ background: '#12151f', borderBottom: '2px solid #b8952a', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.5)', cursor: 'pointer', fontSize: 18 }}>☰</button>
          <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 20, fontWeight: 700, color: '#fff' }}>CxP <span style={{ color: '#e0c96a' }}>Circuitos</span></span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {saving && <span style={{ fontSize: 11, color: '#e0c96a' }}>Guardando...</span>}
          <HBtn onClick={() => { setPendingCircuit(null); setModal('upload') }}>+ Circuito</HBtn>
          <HBtn onClick={() => setModal('tarifario')}>📋 Tarifario</HBtn>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(184,149,42,.15)', border: '1px solid rgba(224,201,106,.3)', borderRadius: 20, padding: '3px 12px' }}>
            <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 11 }}>TC:</span>
            <input type="number" value={TC} step="0.01" onChange={(e) => updateTC(e.target.value)} style={{ width: 52, background: 'none', border: 'none', color: '#e0c96a', fontSize: 12, fontWeight: 600, outline: 'none' }} />
            <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 11 }}>MXN/USD</span>
          </div>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,.15)' }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>{session?.user?.email}</span>
          <HBtn onClick={logout}>Salir</HBtn>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── SIDEBAR ── */}
        {sidebarOpen && (
          <aside style={{ width: 252, background: '#12151f', borderRight: '1px solid rgba(255,255,255,.07)', overflowY: 'auto', flexShrink: 0, position: 'sticky', top: 54, height: 'calc(100vh - 54px)' }}>

            <SbItem label="📊 Todos los circuitos" count={circuits.length} active={view.type === 'all'} onClick={() => setView({ type: 'all' })} />
            <SbItem label="📈 Estado de Resultados" count="" active={view.type === 'resultados_all'} onClick={() => setView({ type: 'resultados_all' })} />
            <SbDivider />

            {sortedMonths.map((mk) => {
              const mCircs = monthMap[mk]
              const mPaid = mCircs.every((c) => c.rows.length > 0 && c.rows.every((r) => r.paid))
              return (
                <div key={mk}>
                  {/* Cabecera del mes */}
                  <div style={{ padding: '10px 16px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: 'rgba(255,255,255,.35)' }}>{mk}</span>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: mPaid ? '#52b788' : '#e0c96a' }} />
                  </div>

                  {/* Ver mes */}
                  <SbItem label="📅 Ver mes" count={mCircs.length} active={view.type === 'month' && view.monthKey === mk} onClick={() => setView({ type: 'month', monthKey: mk })} indent />
                  {/* Resultados del mes */}
                  <SbItem label="📈 Resultados" count="" active={view.type === 'resultados_mes' && view.monthKey === mk} onClick={() => setView({ type: 'resultados_mes', monthKey: mk })} indent />

                  {/* Circuitos */}
                  {mCircs.map((c) => {
                    const paid = c.rows.filter((r) => r.paid).length
                    const allPaid = paid === c.rows.length && c.rows.length > 0
                    const shortId = c.id.split('-').slice(-3).join('-')
                    const isActive = view.circuitId === c.id
                    return (
                      <div key={c.id} onClick={() => { setView({ type: 'circuit', circuitId: c.id }); setActiveTab('cxp'); setFilters({ tipo: 'ALL', cat: 'ALL', pago: 'ALL', fecha: '', proveedor: 'ALL' }) }}
                        style={{ padding: '5px 16px 5px 32px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, borderLeft: `3px solid ${isActive ? '#b8952a' : 'transparent'}` }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: allPaid ? '#52b788' : '#e0c96a', flexShrink: 0 }} />
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ fontSize: 11, color: isActive ? '#fff' : 'rgba(255,255,255,.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.id}>{shortId}</div>
                          {c.info?.tl && <div style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.info.tl}</div>}
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ height: 6 }} />
                </div>
              )
            })}

            <SbDivider />
            <div onClick={() => { setPendingCircuit(null); setModal('upload') }} style={{ padding: '10px 16px', cursor: 'pointer', color: 'rgba(255,255,255,.35)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>＋</span> Agregar circuito
            </div>
          </aside>
        )}

        {/* ── MAIN ── */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {view.type === 'empty' && <EmptyState onAdd={() => { setPendingCircuit(null); setModal('upload') }} />}
          {view.type === 'all' && <AllView circuits={circuits} monthMap={monthMap} sortedMonths={sortedMonths} tarifario={tarifario} TC={TC} onSelect={(id) => { setView({ type: 'circuit', circuitId: id }); setActiveTab('cxp') }} />}
          {view.type === 'month' && <MonthView mk={view.monthKey} circuits={monthMap[view.monthKey] || []} tarifario={tarifario} TC={TC} onSelect={(id) => { setView({ type: 'circuit', circuitId: id }); setActiveTab('cxp') }} />}
          {view.type === 'resultados_all' && <EstadoResultados circuits={circuits} monthMap={monthMap} sortedMonths={sortedMonths} tarifario={tarifario} TC={TC} />}
          {view.type === 'resultados_mes' && <EstadoResultados circuits={circuits} monthMap={monthMap} sortedMonths={sortedMonths} tarifario={tarifario} TC={TC} initModo="mes" initMes={view.monthKey} />}
          {view.type === 'circuit' && activeCircuit && (
            <CircuitDetail circ={activeCircuit} tarifario={tarifario} TC={TC} activeTab={activeTab} setActiveTab={setActiveTab}
              F={F} setFilters={setFilters} filteredRows={filteredRows}
              togglePaid={togglePaid} setFechaPago={setFechaPago} setNota={setNota}
              saveProv={saveProv} saveImporte={saveImporte} saveImporteCobrado={saveImporteCobrado}
              onDelete={(id) => { setDeleteId(id); setModal('delete') }} />
          )}
        </main>
      </div>

      {/* ── MODALS ── */}
      {modal === 'upload' && (
        <Modal title="Agregar Circuito" onClose={() => { setModal(null); setPendingCircuit(null) }}>
          <UploadZone xlsxReady={xlsxReady} onFile={handleCircuitFile} pending={pendingCircuit} fileRef={fileRef} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Btn outline onClick={() => { setModal(null); setPendingCircuit(null) }}>Cancelar</Btn>
            <Btn disabled={!pendingCircuit || saving} onClick={confirmLoad}>{saving ? 'Guardando...' : 'Cargar circuito ✓'}</Btn>
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
    </div>
  )
}

// ═══════════════════════════════════════════════
//  ESTADO DE RESULTADOS
// ═══════════════════════════════════════════════
function EstadoResultados({ circuits, monthMap, sortedMonths, tarifario, TC, initModo, initMes }) {
  const [modo, setModo] = useState(initModo || 'todos')
  const [mesSel, setMesSel] = useState(initMes || sortedMonths[0] || '')
  const [circSel, setCircSel] = useState(circuits[0]?.id || '')

  // Circuitos a mostrar según modo
  const circsMostrar = modo === 'todos' ? circuits
    : modo === 'mes' ? (monthMap[mesSel] || [])
    : circuits.filter((c) => c.id === circSel)

  // Totales de los circuitos seleccionados
  let totalIngUSD = 0, totalIngMXN = 0, totalCosto = 0
  let totalPaidMXN = 0, totalPaidUSD = 0, totalPendMXN = 0, totalPendUSD = 0
  const catCosto = {}, catPaidMXN = {}, catPaidUSD = {}, catPendMXN = {}, catPendUSD = {}

  circsMostrar.forEach((c) => {
    totalIngUSD += c.importe_cobrado || 0
    const { costoTotal, paidMXN, paidUSD, costoMXN, costoUSD, ingresoMXN } = calcCircTotals(c, tarifario, TC)
    totalIngMXN += ingresoMXN
    totalCosto += costoTotal
    totalPaidMXN += paidMXN; totalPaidUSD += paidUSD
    totalPendMXN += costoMXN - paidMXN; totalPendUSD += costoUSD - paidUSD

    c.rows.forEach((r) => {
      const cat = norm(r.clasificacion) || 'OTROS'
      const { mxn, usd } = getImporte(r, c.info, tarifario)
      const v = mxn + usd * TC; if (v > 0) catCosto[cat] = (catCosto[cat] || 0) + v
      if (!catPaidMXN[cat]) { catPaidMXN[cat] = 0; catPaidUSD[cat] = 0; catPendMXN[cat] = 0; catPendUSD[cat] = 0 }
      if (r.paid) { catPaidMXN[cat] += mxn; catPaidUSD[cat] += usd }
      else { catPendMXN[cat] += mxn; catPendUSD[cat] += usd }
    })
  })

  const utilidad = totalIngMXN - totalCosto
  const hayIngreso = totalIngMXN > 0
  const maxCat = Math.max(...Object.values(catCosto), 1)
  const CATS = ['HOSPEDAJE', 'TRANSPORTE', 'ACTIVIDADES', 'ALIMENTOS', 'GUIA', 'OTROS']
  const CAT_COLS = { HOSPEDAJE: '#f4a261', TRANSPORTE: '#4361ee', ACTIVIDADES: '#f72585', ALIMENTOS: '#2d6a4f', GUIA: '#9b5de5', OTROS: '#888' }
  // Incluir todas las categorías que tengan algún dato (costo o pagado/pendiente)
  const allCatsSet = new Set([
    ...CATS.filter((c) => catCosto[c] || catPaidMXN[c] || catPendMXN[c]),
    ...Object.keys(catCosto),
    ...Object.keys(catPaidMXN),
  ])
  const allCats = [...allCatsSet]

  const Card = ({ children, col }) => <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 16px rgba(18,21,31,.07)', marginBottom: 16, gridColumn: col }}>{children}</div>
  const CH = ({ t }) => <h3 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 15, marginBottom: 14, paddingBottom: 8, borderBottom: '2px solid #ece7df' }}>{t}</h3>
  const DRow = ({ label, val, color, bold, big }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f0ebe3', fontSize: big ? 15 : 13 }}>
      <span style={{ color: bold ? '#12151f' : '#8a8278', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: color || '#12151f' }}>{val}</span>
    </div>
  )

  const selStyle = { border: '1.5px solid #d8d2c8', borderRadius: 8, padding: '6px 12px', fontFamily: 'inherit', fontSize: 12, background: '#fff', cursor: 'pointer', outline: 'none', color: '#12151f', minWidth: 180 }

  return (
    <div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 26, marginBottom: 16 }}>📈 Estado de Resultados</h2>

      {/* ── Selector de modo ── */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', boxShadow: '0 2px 16px rgba(18,21,31,.07)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {[['todos', '📊 Todos los circuitos'], ['mes', '📅 Por Mes'], ['circuito', '🗂 Por Circuito']].map(([id, lbl]) => (
          <button key={id} onClick={() => setModo(id)}
            style={{ padding: '8px 18px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: modo === id ? 700 : 500, fontFamily: 'inherit', background: modo === id ? '#12151f' : '#f5f1eb', color: modo === id ? '#e0c96a' : '#8a8278', transition: 'all .15s' }}>
            {lbl}
          </button>
        ))}

        {modo === 'mes' && sortedMonths.length > 0 && (
          <select value={mesSel} onChange={(e) => setMesSel(e.target.value)} style={selStyle}>
            {sortedMonths.map((mk) => <option key={mk} value={mk}>{cap(mk)} ({monthMap[mk]?.length || 0} circuitos)</option>)}
          </select>
        )}

        {modo === 'circuito' && circuits.length > 0 && (
          <select value={circSel} onChange={(e) => setCircSel(e.target.value)} style={selStyle}>
            {circuits.map((c) => <option key={c.id} value={c.id}>{c.id.split('-').slice(-3).join('-')}{c.info?.tl ? ` — ${c.info.tl}` : ''}</option>)}
          </select>
        )}

        <span style={{ fontSize: 11, color: '#8a8278', marginLeft: 'auto' }}>
          {circsMostrar.length} circuito{circsMostrar.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── KPIs resumen ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(148px,1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Circuitos', val: circsMostrar.length, cls: 'gold' },
          { label: '💰 Cobrado (USD)', val: totalIngUSD > 0 ? fmtUSD(totalIngUSD) : '—', sub: totalIngUSD > 0 ? fmtMXN(totalIngMXN) + ' MN' : 'Sin capturar', cls: 'forest' },
          { label: '📤 Total Costos', val: fmtMXN(totalCosto), sub: 'MN', cls: 'rust' },
          { label: hayIngreso ? (utilidad >= 0 ? '✅ Utilidad' : '❌ Pérdida') : '💡 Margen', val: hayIngreso ? fmtMXN(Math.abs(utilidad)) : '—', sub: hayIngreso ? (totalCosto > 0 ? `${((utilidad / totalIngMXN) * 100).toFixed(1)}% · MN` : 'MN') : undefined, cls: hayIngreso ? (utilidad >= 0 ? 'forest' : 'rust') : 'sky' },
          { label: '✅ Pagado', val: fmtMXN(totalPaidMXN) + ' MN', sub: fmtUSD(totalPaidUSD) + ' USD', cls: 'forest' },
          { label: '⏳ Pendiente', val: fmtMXN(totalPendMXN) + ' MN', sub: fmtUSD(totalPendUSD) + ' USD', cls: 'rust' },
        ].map((k, i) => <KPICard key={i} {...k} />)}
      </div>

      {/* ── Cuerpo principal en grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Utilidad / Pérdida */}
        <Card>
          <CH t="💰 Utilidad / Pérdida" />
          <DRow label="Total Cobrado (USD)" val={totalIngUSD > 0 ? fmtUSD(totalIngUSD) : 'Sin capturar'} color="#1565a0" />
          {totalIngUSD > 0 && <DRow label="Equivalente MXN" val={fmtMXN(totalIngMXN)} color="#1565a0" />}
          <DRow label="Total Costos MXN" val={fmtMXN(totalCosto)} color="#b83232" />
          {hayIngreso && totalCosto > 0 && (
            <>
              <DRow label={utilidad >= 0 ? '✅ Utilidad Bruta' : '❌ Pérdida'} val={fmtMXN(Math.abs(utilidad))} color={utilidad >= 0 ? '#1e5c3a' : '#b83232'} bold big />
              <DRow label="Margen" val={`${((utilidad / totalIngMXN) * 100).toFixed(1)}%`} color={utilidad >= 0 ? '#1e5c3a' : '#b83232'} bold />
            </>
          )}
          {!hayIngreso && <p style={{ fontSize: 12, color: '#8a8278', marginTop: 10 }}>⚠️ Captura el importe cobrado en cada circuito para ver la utilidad.</p>}
        </Card>

        {/* Distribución por Categoría */}
        <Card>
          <CH t="📊 Distribución por Categoría" />
          {totalCosto === 0
            ? <p style={{ color: '#8a8278', fontSize: 12 }}>Sin costos capturados en el tarifario.</p>
            : allCats.map((cat) => {
                const v = catCosto[cat] || 0; if (!v) return null
                return (
                  <div key={cat} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span style={{ fontWeight: 600 }}>{cat}</span>
                      <span style={{ fontWeight: 600 }}>{fmtMXN(v)} <span style={{ color: '#8a8278', fontWeight: 400 }}>({((v / totalCosto) * 100).toFixed(1)}%)</span></span>
                    </div>
                    <div style={{ background: '#ece7df', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: ((v / maxCat) * 100) + '%', background: CAT_COLS[cat] || '#888', borderRadius: 4 }} />
                    </div>
                  </div>
                )
              })
          }
          {totalCosto > 0 && <DRow label="Total Costos" val={fmtMXN(totalCosto)} color="#b83232" bold />}
        </Card>
      </div>

      {/* Top Proveedores por Costo */}
      {(() => {
        // Construir ranking de proveedores a partir de los circuitos mostrados
        const pm = {}
        circsMostrar.forEach((circ) => {
          circ.rows.forEach((r) => {
            const p = r.prov_general; if (!p) return
            const k = norm(p)
            if (!pm[k]) pm[k] = { nombre: p, totalMXN: 0, totalUSD: 0, paidMXN: 0, paidUSD: 0, pendMXN: 0, pendUSD: 0, servicios: 0 }
            const { mxn, usd } = getImporte(r, circ.info, tarifario)
            pm[k].totalMXN += mxn; pm[k].totalUSD += usd; pm[k].servicios++
            if (r.paid) { pm[k].paidMXN += mxn; pm[k].paidUSD += usd }
            else { pm[k].pendMXN += mxn; pm[k].pendUSD += usd }
          })
        })
        const provs = Object.values(pm)
          .map((p) => ({ ...p, totalMXNEq: p.totalMXN + p.totalUSD * TC }))
          .filter((p) => p.totalMXNEq > 0)
          .sort((a, b) => b.totalMXNEq - a.totalMXNEq)
        if (provs.length === 0) return null
        const maxProv = provs[0].totalMXNEq
        return (
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 16px rgba(18,21,31,.07)', marginBottom: 16 }}>
            <CH t="🏢 Proveedores — Costo Total y Estatus de Pago" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {provs.map((p, i) => {
                const pctPaid = p.totalMXNEq > 0 ? Math.round(((p.paidMXN + p.paidUSD * TC) / p.totalMXNEq) * 100) : 0
                const allPaid = pctPaid === 100
                return (
                  <div key={p.nombre} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 140px 140px 60px', gap: 12, alignItems: 'center', padding: '10px 12px', borderRadius: 8, background: i % 2 === 0 ? '#fafaf8' : '#fff', border: '1px solid #f0ebe3' }}>
                    {/* Rank */}
                    <span style={{ fontSize: 11, fontWeight: 800, color: i < 3 ? '#b8952a' : '#ccc', textAlign: 'center' }}>#{i + 1}</span>
                    {/* Nombre + barra */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{p.nombre}</span>
                        <span style={{ fontSize: 10, color: '#8a8278' }}>{p.servicios} svc</span>
                      </div>
                      <div style={{ background: '#ece7df', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: (p.totalMXNEq / maxProv * 100) + '%', background: allPaid ? '#52b788' : '#b8952a', borderRadius: 4 }} />
                      </div>
                    </div>
                    {/* Pagado */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#1e5c3a', textTransform: 'uppercase', marginBottom: 1 }}>✅ Pagado</div>
                      {p.paidMXN > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: '#1e5c3a' }}>{fmtMXN(p.paidMXN)} <span style={{ fontSize: 9 }}>MN</span></div>}
                      {p.paidUSD > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: '#1565a0' }}>{fmtUSD(p.paidUSD)}</div>}
                      {p.paidMXN === 0 && p.paidUSD === 0 && <div style={{ fontSize: 11, color: '#ccc' }}>—</div>}
                    </div>
                    {/* Pendiente */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#b83232', textTransform: 'uppercase', marginBottom: 1 }}>⏳ Pendiente</div>
                      {p.pendMXN > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: '#b83232' }}>{fmtMXN(p.pendMXN)} <span style={{ fontSize: 9 }}>MN</span></div>}
                      {p.pendUSD > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: '#b83232' }}>{fmtUSD(p.pendUSD)}</div>}
                      {p.pendMXN === 0 && p.pendUSD === 0 && <div style={{ fontSize: 11, color: '#52b788', fontWeight: 700 }}>Liquidado ✓</div>}
                    </div>
                    {/* % pagado */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: allPaid ? '#1e5c3a' : '#12151f' }}>{pctPaid}%</div>
                      <div style={{ fontSize: 9, color: '#8a8278' }}>pagado</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Desglose por circuito */}
      {circsMostrar.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 16px rgba(18,21,31,.07)', marginBottom: 16 }}>
          <CH t="🗂 Desglose por Circuito" />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: '#12151f', color: '#fff' }}>
                {['Circuito', 'Tour Leader', 'PAX', 'Servicios', 'Cobrado USD', 'Equivalente MN', 'Costo MXN', 'Costo USD', '% Pagado', 'Utilidad/Pérdida'].map((h) => (
                  <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: .6, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {circsMostrar.map((circ) => {
                  const { costoMXN, costoUSD, ingresoMXN, utilidad } = calcCircTotals(circ, tarifario, TC)
                  const paid = circ.rows.filter((r) => r.paid).length
                  const pct = circ.rows.length > 0 ? Math.round((paid / circ.rows.length) * 100) : 0
                  const hayIng = ingresoMXN > 0
                  return (
                    <tr key={circ.id} style={{ borderBottom: '1px solid #ece7df' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, fontSize: 11 }}>{circ.id.split('-').slice(-3).join('-')}</td>
                      <td style={{ padding: '8px 10px', fontSize: 11 }}>{circ.info?.tl || '—'}</td>
                      <td style={{ padding: '8px 10px' }}>{circ.info?.pax || '—'}</td>
                      <td style={{ padding: '8px 10px' }}>{circ.rows.length}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: '#1565a0' }}>
                        {hayIng ? fmtUSD(circ.importe_cobrado) : <span style={{ color: '#ccc', fontSize: 10 }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1e5c3a' }}>
                        {hayIng ? fmtMXN(ingresoMXN) : <span style={{ color: '#ccc', fontSize: 10 }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 700 }}>{costoMXN > 0 ? fmtMXN(costoMXN) : '—'}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: '#1565a0' }}>{costoUSD > 0 ? fmtUSD(costoUSD) : '—'}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1, height: 6, background: '#ece7df', borderRadius: 3, overflow: 'hidden', minWidth: 50 }}>
                            <div style={{ height: '100%', width: pct + '%', background: pct === 100 ? '#52b788' : '#b8952a', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600 }}>{pct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        {hayIng
                          ? <span style={{ fontWeight: 700, color: utilidad >= 0 ? '#1e5c3a' : '#b83232' }}>{utilidad >= 0 ? '✅' : '❌'} {fmtMXN(Math.abs(utilidad))}</span>
                          : <span style={{ color: '#ccc', fontSize: 10 }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function KPICard({ label, val, sub, cls }) {
  const colors = { gold: '#b8952a', forest: '#52b788', rust: '#b83232', sky: '#1565a0', violet: '#5c35a0' }
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', boxShadow: '0 2px 16px rgba(18,21,31,.07)', borderLeft: `3px solid ${colors[cls] || '#d8d2c8'}` }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: .8, color: '#8a8278', fontWeight: 600, marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 19, fontWeight: 700, lineHeight: 1.2 }}>{val}</div>
      {sub && <div style={{ fontSize: 11, color: '#8a8278', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}


// ═══════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════
function HBtn({ children, onClick }) {
  return <button onClick={onClick} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.25)', color: 'rgba(255,255,255,.75)', padding: '5px 13px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 500 }}>{children}</button>
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

function UploadZone({ xlsxReady, onFile, pending, fileRef }) {
  const [drag, setDrag] = useState(false)
  return (
    <div>
      {!xlsxReady && <p style={{ color: '#8a8278', fontSize: 13, marginBottom: 12 }}>⏳ Cargando lector de Excel...</p>}
      <div onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]) }}
        onClick={() => fileRef.current?.click()}
        style={{ border: `2px dashed ${drag ? '#b8952a' : pending ? '#52b788' : '#d8d2c8'}`, borderRadius: 10, padding: 28, textAlign: 'center', cursor: 'pointer', background: pending ? '#f0faf4' : '#fafafa', transition: 'all .2s' }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>{pending ? '✅' : '📊'}</div>
        <p style={{ color: '#8a8278', fontSize: 13 }}>{pending ? `✓ ${pending.id} · ${pending.rows.length} servicios` : 'Arrastra el Excel o haz clic'}</p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]) }} />
      </div>
    </div>
  )
}

function TarifarioEditor({ tarifario, circuits, tarFileRef, onTarFile, onSave, onCancel, saving }) {
  const [rows, setRows] = useState(() => {
    if (tarifario.length > 0) return tarifario.map((t) => ({ ...t, tipo_servicio: t.tipo_servicio || 'HOSPEDAJE', dias_credito: t.dias_credito || 0 }))
    const seen = new Set(); const out = []
    circuits.forEach((c) => c.rows.forEach((r) => { const p = r.prov_general; if (p && !seen.has(p.toUpperCase())) { seen.add(p.toUpperCase()); out.push({ proveedor: p, tipo_servicio: r.clasificacion || 'HOSPEDAJE', precio: 0, moneda: 'MXN', dias_credito: 30, notas: '' }) } }))
    return out
  })
  const update = (i, k, v) => setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [k]: v } : r))
  const del = (i) => setRows((prev) => prev.filter((_, idx) => idx !== i))
  const add = () => setRows((prev) => [...prev, { proveedor: '', tipo_servicio: 'HOSPEDAJE', precio: 0, moneda: 'MXN', dias_credito: 30, notas: '' }])
  const inp = { border: '1px solid #d8d2c8', borderRadius: 5, padding: '4px 7px', fontFamily: 'inherit', fontSize: 12, width: '100%', outline: 'none' }
  const sel = { border: '1px solid #d8d2c8', borderRadius: 5, padding: '4px 7px', fontFamily: 'inherit', fontSize: 12, background: '#fff', cursor: 'pointer', outline: 'none' }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <Btn outline small onClick={() => tarFileRef.current?.click()}>📥 Importar Excel</Btn>
        <input ref={tarFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => { if (e.target.files[0]) onTarFile(e.target.files[0]) }} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: '#12151f', color: '#fff' }}>
            {['Proveedor', 'Tipo', 'Precio', 'Moneda', 'Días Crédito', 'Notas', ''].map((h) => <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: .7 }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #ece7df' }}>
                <td style={{ padding: '6px 8px' }}><input style={{ ...inp, width: 150 }} value={r.proveedor} onChange={(e) => update(i, 'proveedor', e.target.value)} /></td>
                <td style={{ padding: '6px 8px' }}><select style={sel} value={r.tipo_servicio} onChange={(e) => update(i, 'tipo_servicio', e.target.value)}>{['HOSPEDAJE', 'TRANSPORTE', 'ACTIVIDADES', 'ALIMENTOS', 'GUIA', 'OTRO'].map((t) => <option key={t}>{t}</option>)}</select></td>
                <td style={{ padding: '6px 8px' }}><input style={{ ...inp, width: 90 }} type="number" value={r.precio || ''} onChange={(e) => update(i, 'precio', parseFloat(e.target.value) || 0)} /></td>
                <td style={{ padding: '6px 8px' }}><select style={sel} value={r.moneda} onChange={(e) => update(i, 'moneda', e.target.value)}><option>MXN</option><option>USD</option></select></td>
                <td style={{ padding: '6px 8px' }}><input style={{ ...inp, width: 60 }} type="number" value={r.dias_credito || ''} onChange={(e) => update(i, 'dias_credito', parseInt(e.target.value) || 0)} /></td>
                <td style={{ padding: '6px 8px' }}><input style={inp} value={r.notas || ''} onChange={(e) => update(i, 'notas', e.target.value)} /></td>
                <td style={{ padding: '6px 8px' }}><button onClick={() => del(i)} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 15 }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={add} style={{ marginTop: 10, background: 'transparent', border: '1.5px dashed #d8d2c8', color: '#8a8278', padding: '6px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>+ Agregar proveedor</button>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 14, borderTop: '1px solid #ece7df' }}>
        <Btn outline onClick={onCancel}>Cancelar</Btn>
        <Btn disabled={saving} onClick={() => onSave(rows)}>{saving ? 'Guardando...' : 'Guardar tarifario ✓'}</Btn>
      </div>
    </div>
  )
}

// ── All / Month Views ──
function AllView({ circuits, monthMap, sortedMonths, tarifario, TC, onSelect }) {
  let tMXN = 0, tUSD = 0, pMXN = 0, pUSD = 0
  circuits.forEach((c) => c.rows.forEach((r) => { const { mxn, usd } = getImporte(r, c.info, tarifario); tMXN += mxn; tUSD += usd; if (r.paid) { pMXN += mxn; pUSD += usd } }))
  return (
    <div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 26, marginBottom: 4 }}>📊 Todos los circuitos</h2>
      <p style={{ color: '#8a8278', fontSize: 13, marginBottom: 20 }}>{circuits.length} circuito{circuits.length !== 1 ? 's' : ''} · {sortedMonths.length} mes{sortedMonths.length !== 1 ? 'es' : ''}</p>
      <KPIGrid items={[
        { cls: 'gold', label: 'Circuitos', val: circuits.length },
        { cls: 'forest', label: '✅ Pagado MXN', val: fmtMXN(pMXN), sub: fmtUSD(pUSD) + ' USD' },
        { cls: 'rust', label: '⏳ Pendiente MXN', val: fmtMXN(tMXN - pMXN), sub: fmtUSD(tUSD - pUSD) + ' USD' },
        { cls: 'sky', label: 'Total Servicios', val: circuits.reduce((a, c) => a + c.rows.length, 0) },
      ]} />
      {sortedMonths.map((mk) => (
        <div key={mk} style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 18, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            {cap(mk)} <span style={{ background: '#b8952a', color: '#12151f', borderRadius: 10, padding: '1px 9px', fontSize: 12, fontFamily: 'inherit', fontWeight: 700 }}>{monthMap[mk].length}</span>
          </div>
          <CircuitCards circs={monthMap[mk]} tarifario={tarifario} TC={TC} onSelect={onSelect} />
        </div>
      ))}
    </div>
  )
}
function MonthView({ mk, circuits, tarifario, TC, onSelect }) {
  let tMXN = 0, tUSD = 0, pMXN = 0, pUSD = 0
  circuits.forEach((c) => c.rows.forEach((r) => { const { mxn, usd } = getImporte(r, c.info, tarifario); tMXN += mxn; tUSD += usd; if (r.paid) { pMXN += mxn; pUSD += usd } }))
  return (
    <div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 26, marginBottom: 16 }}>{cap(mk)}</h2>
      <KPIGrid items={[
        { cls: 'gold', label: 'Circuitos', val: circuits.length },
        { cls: 'forest', label: '✅ Pagado MXN', val: fmtMXN(pMXN), sub: fmtUSD(pUSD) + ' USD' },
        { cls: 'rust', label: '⏳ Pendiente MXN', val: fmtMXN(tMXN - pMXN), sub: fmtUSD(tUSD - pUSD) + ' USD' },
        { cls: 'sky', label: 'Total MXN', val: fmtMXN(tMXN), sub: fmtUSD(tUSD) + ' USD' },
      ]} />
      <CircuitCards circs={circuits} tarifario={tarifario} TC={TC} onSelect={onSelect} />
    </div>
  )
}
function CircuitCards({ circs, tarifario, TC, onSelect }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: 14 }}>
      {circs.map((c) => {
        const { costoMXN, costoUSD, ingresoMXN, utilidad } = calcCircTotals(c, tarifario, TC)
        const paid = c.rows.filter((r) => r.paid).length
        const pct = c.rows.length > 0 ? Math.round((paid / c.rows.length) * 100) : 0
        const allPaid = paid === c.rows.length && c.rows.length > 0
        const fi = c.info?.fecha_inicio
        const fStr = fi ? (fi instanceof Date ? fi : new Date(fi)).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
        const hayIng = ingresoMXN > 0
        return (
          <div key={c.id} onClick={() => onSelect(c.id)} style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 2px 16px rgba(18,21,31,.07)', borderTop: `3px solid ${allPaid ? '#52b788' : '#d8d2c8'}`, cursor: 'pointer' }}>
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
                <span style={{ fontSize: 10, fontWeight: 700, color: '#8a8278' }}>{utilidad >= 0 ? '✅ UTILIDAD' : '❌ PÉRDIDA'}</span>
                <span style={{ fontWeight: 800, fontSize: 13, color: utilidad >= 0 ? '#1e5c3a' : '#b83232' }}>{fmtMXN(Math.abs(utilidad))} <span style={{ fontSize: 10, fontWeight: 600 }}>MN</span></span>
              </div>
            )}
            <div style={{ height: 4, background: '#ece7df', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}><div style={{ height: '100%', width: pct + '%', background: '#52b788', borderRadius: 2 }} /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#8a8278' }}>{paid}/{c.rows.length} pagados ({pct}%)</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 9, background: allPaid ? '#d8f3dc' : '#caf0f8', color: allPaid ? '#1b4332' : '#03045e' }}>{allPaid ? '✅ Completo' : '⏳ Pendiente'}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Circuit Detail ──
function CircuitDetail({ circ, tarifario, TC, activeTab, setActiveTab, F, setFilters, filteredRows, togglePaid, setFechaPago, setNota, saveProv, saveImporte, saveImporteCobrado, onDelete }) {
  const [editIC, setEditIC] = useState(false)
  const [icVal, setIcVal] = useState(circ.importe_cobrado || '')
  const [icMon, setIcMon] = useState(circ.moneda_cobrado || 'MXN')

  const fi = circ.info?.fecha_inicio
  const fStr = fi ? (fi instanceof Date ? fi : new Date(fi)).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/D'
  const { costoMXN, costoUSD, costoTotal, paidMXN, paidUSD, ingresoMXN, utilidad } = calcCircTotals(circ, tarifario, TC)
  const pendMXN = costoMXN - paidMXN
  const pendUSD = costoUSD - paidUSD
  const lib = circ.rows.filter((r) => norm(r.tipo) === 'LIBERO').length
  const opc = circ.rows.filter((r) => norm(r.tipo) === 'OPCIONAL').length
  const hayIng = ingresoMXN > 0

  const confirmIC = () => {
    saveImporteCobrado(circ.id, parseFloat(icVal) || 0, 'USD')
    setEditIC(false)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, marginBottom: 6 }}>{circ.id}</h2>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {[['Fecha', fStr], ['Tour Leader', circ.info?.tl], ['PAX', circ.info?.pax], ['HAB', circ.info?.habs], ['Operador', circ.info?.operador]].map(([l, v]) => (
              <div key={l}><div style={{ fontSize: 11, color: '#8a8278' }}>{l}</div><div style={{ fontSize: 13, fontWeight: 600 }}>{v || '—'}</div></div>
            ))}
          </div>
        </div>
        <button onClick={() => onDelete(circ.id)} style={{ background: 'none', border: '1px solid #d8d2c8', color: '#8a8278', padding: '6px 13px', borderRadius: 7, cursor: 'pointer', fontSize: 12 }}>🗑 Eliminar</button>
      </div>

      {/* ── Utilidad/Pérdida banner ── */}
      <div style={{ background: hayIng ? (utilidad >= 0 ? '#f0faf4' : '#fff5f5') : '#fafafa', border: `1px solid ${hayIng ? (utilidad >= 0 ? '#95d5b2' : '#fca5a5') : '#d8d2c8'}`, borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#8a8278', marginBottom: 2 }}>Importe Cobrado al Cliente</div>
            {editIC ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="number" value={icVal} onChange={(e) => setIcVal(e.target.value)} placeholder="0.00" autoFocus
                  style={{ border: '1px solid #b8952a', borderRadius: 5, padding: '4px 8px', fontSize: 13, fontFamily: 'inherit', width: 130 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1565a0' }}>USD</span>
                <button onClick={confirmIC} style={{ background: '#b8952a', color: '#12151f', border: 'none', borderRadius: 5, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>✓</button>
                <button onClick={() => setEditIC(false)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>
            ) : (
              <div onClick={() => setEditIC(true)} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 22, fontWeight: 700, color: hayIng ? '#1565a0' : '#8a8278', borderBottom: '1px dotted #b8952a' }}>
                    {hayIng ? fmtUSD(circ.importe_cobrado) : 'Clic para capturar'}
                  </span>
                  {hayIng && <span style={{ fontSize: 11, fontWeight: 700, color: '#1565a0' }}>USD</span>}
                  <span style={{ fontSize: 11, color: '#b8952a' }}>✎</span>
                </div>
                {hayIng && <div style={{ fontSize: 11, color: '#8a8278', marginTop: 2 }}>{fmtMXN(circ.importe_cobrado * TC)} <span style={{ fontWeight: 600 }}>MN</span></div>}
              </div>
            )}
          </div>
          <div style={{ width: 1, height: 36, background: '#d8d2c8' }} />
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#8a8278', marginBottom: 2 }}>Total Costos</div>
            <span style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 20, fontWeight: 700, color: '#b83232' }}>{fmtMXN(costoTotal)}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {hayIng ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8a8278', textTransform: 'uppercase', marginBottom: 2 }}>{utilidad >= 0 ? '✅ Utilidad Bruta' : '❌ Pérdida'}</div>
              <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 26, fontWeight: 800, color: utilidad >= 0 ? '#1e5c3a' : '#b83232' }}>{fmtMXN(Math.abs(utilidad))}</div>
              <div style={{ fontSize: 12, color: '#8a8278' }}>Margen: {((utilidad / ingresoMXN) * 100).toFixed(1)}%</div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#8a8278' }}>Captura el importe cobrado para ver la utilidad</div>
          )}
        </div>
      </div>

      {/* KPIs */}
      <KPIGrid items={[
        { cls: 'gold', label: 'Servicios', val: circ.rows.length, sub: `${lib} LIBERO · ${opc} OPCIONAL` },
        { cls: 'forest', label: '✅ Pagado MXN', val: fmtMXN(paidMXN) },
        { cls: 'sky', label: '✅ Pagado USD', val: fmtUSD(paidUSD) },
        { cls: 'rust', label: '⏳ Pendiente MXN', val: fmtMXN(pendMXN) },
        { cls: 'rust', label: '⏳ Pendiente USD', val: fmtUSD(pendUSD) },
        { cls: 'violet', label: 'Tarifario', val: tarifario.length, sub: 'proveedores' },
      ]} />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 3, background: '#ece7df', borderRadius: 10, padding: 3, marginBottom: 18, width: 'fit-content', flexWrap: 'wrap' }}>
        {[['cxp', '💳 CxP'], ['proveedores', '🏢 Proveedores'], ['timeline', '📅 Timeline']].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{ padding: '7px 15px', border: 'none', background: activeTab === id ? '#fff' : 'transparent', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: activeTab === id ? 700 : 500, color: activeTab === id ? '#12151f' : '#8a8278', fontFamily: 'inherit' }}>{label}</button>
        ))}
      </div>

      {activeTab === 'cxp' && <CxPPanel circ={circ} tarifario={tarifario} F={F} setFilters={setFilters} filteredRows={filteredRows} togglePaid={togglePaid} setFechaPago={setFechaPago} setNota={setNota} saveProv={saveProv} saveImporte={saveImporte} />}
      {activeTab === 'proveedores' && <ProvPanel circ={circ} tarifario={tarifario} TC={TC} />}
      {activeTab === 'timeline' && <TimelinePanel circ={circ} tarifario={tarifario} />}
    </div>
  )
}

// ── CxP Panel ──
function CxPPanel({ circ, tarifario, F, setFilters, filteredRows, togglePaid, setFechaPago, setNota, saveProv, saveImporte }) {
  const [editCell, setEditCell] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [editMoneda, setEditMoneda] = useState('MXN')

  const rows = filteredRows(circ.rows)
  let tMXN = 0, tUSD = 0
  rows.forEach((r) => { const { mxn, usd } = getImporte(r, circ.info, tarifario); tMXN += mxn; tUSD += usd })

  // Lista única de proveedores en este circuito (para filtro)
  const proveedoresCircuito = [...new Set(circ.rows.map((r) => norm(r.prov_general)).filter(Boolean))].sort()

  const startEdit = (rowId, field, row) => {
    setEditCell({ rowId, field })
    if (field === 'prov') setEditVal(row.prov_general || '')
    if (field === 'importe') {
      const { mxn, usd } = getImporte(row, circ.info, tarifario)
      setEditMoneda(row.moneda_custom || (usd > 0 ? 'USD' : 'MXN'))
      setEditVal(row.precio_custom || (usd > 0 ? usd : mxn) || '')
    }
  }
  const confirmEdit = (cid, rowId, field) => {
    if (field === 'prov') saveProv(cid, rowId, editVal)
    if (field === 'importe') saveImporte(cid, rowId, parseFloat(editVal) || 0, editMoneda)
    setEditCell(null)
  }
  const FBtn = ({ fkey, val, label, activeColor }) => {
    const isActive = F[fkey] === val
    return (
      <button onClick={() => setFilters((p) => ({ ...p, [fkey]: val }))}
        style={{ padding: '4px 11px', borderRadius: 14, border: `1.5px solid ${isActive ? 'transparent' : '#d8d2c8'}`, background: isActive ? (activeColor || '#12151f') : '#f5f1eb', color: isActive ? (activeColor === '#b8952a' ? '#12151f' : '#fff') : '#8a8278', cursor: 'pointer', fontSize: 11, fontWeight: 500, fontFamily: 'inherit' }}>
        {label}
      </button>
    )
  }

  return (
    <div>
      <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', boxShadow: '0 2px 16px rgba(18,21,31,.07)', marginBottom: 14 }}>
        {[
          { key: 'tipo', label: 'Tipo', opts: [['ALL', '#12151f', 'Todos'], ['LIBERO', '#1e5c3a', '🔵 LIBERO'], ['OPCIONAL', '#1565a0', '🔷 OPCIONAL']] },
          { key: 'cat', label: 'Categoría', opts: [['ALL', '#b8952a', 'Todas'], ['HOSPEDAJE', '#b8952a', '🏨 Hospedaje'], ['TRANSPORTE', '#b8952a', '🚌 Transporte'], ['ACTIVIDADES', '#b8952a', '🎯 Actividades'], ['ALIMENTOS', '#b8952a', '🍽 Alimentos'], ['GUIA', '#b8952a', '🧭 Guía']] },
          { key: 'pago', label: 'Estatus', opts: [['ALL', '#12151f', 'Todos'], ['PAID', '#1e5c3a', '✅ Pagado'], ['UNPAID', '#b83232', '⏳ Pendiente']] },
        ].map(({ key, label, opts }) => (
          <div key={key} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 7 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#8a8278', textTransform: 'uppercase', letterSpacing: .6, minWidth: 64 }}>{label}</span>
            {opts.map(([val, color, lbl]) => <FBtn key={val} fkey={key} val={val} label={lbl} activeColor={color} />)}
          </div>
        ))}

        {/* Filtro por proveedor — dropdown */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 7 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#8a8278', textTransform: 'uppercase', letterSpacing: .6, minWidth: 64 }}>Proveedor</span>
          <select
            value={F.proveedor}
            onChange={(e) => setFilters((p) => ({ ...p, proveedor: e.target.value }))}
            style={{ border: `1.5px solid ${F.proveedor !== 'ALL' ? '#b8952a' : '#d8d2c8'}`, borderRadius: 14, padding: '4px 10px', fontFamily: 'inherit', fontSize: 11, background: F.proveedor !== 'ALL' ? '#fffdf5' : '#f5f1eb', color: '#12151f', cursor: 'pointer', outline: 'none', minWidth: 160 }}>
            <option value="ALL">Todos los proveedores</option>
            {proveedoresCircuito.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          {F.proveedor !== 'ALL' && (
            <button onClick={() => setFilters((p) => ({ ...p, proveedor: 'ALL' }))} style={{ fontSize: 11, background: 'none', border: 'none', color: '#8a8278', cursor: 'pointer' }}>✕</button>
          )}
        </div>

        {/* Filtro fecha */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#8a8278', textTransform: 'uppercase', letterSpacing: .6, minWidth: 64 }}>Fecha Pago</span>
          <input type="date" value={F.fecha} onChange={(e) => setFilters((p) => ({ ...p, fecha: e.target.value }))} style={{ border: '1.5px solid #d8d2c8', borderRadius: 14, padding: '4px 10px', fontFamily: 'inherit', fontSize: 11, background: '#f5f1eb' }} />
          {F.fecha && <button onClick={() => setFilters((p) => ({ ...p, fecha: '' }))} style={{ fontSize: 11, background: 'none', border: 'none', color: '#8a8278', cursor: 'pointer' }}>✕</button>}
        </div>
      </div>

      {rows.length === 0 ? <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8a8278', fontSize: 13 }}>🔍 Sin resultados para ese filtro</div> : (
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 16px rgba(18,21,31,.07)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1150 }}>
            <thead><tr style={{ background: '#12151f', color: '#fff' }}>
              {['Fecha', 'Destino', 'Cat.', 'Servicio', 'Tipo', 'Proveedor ✏️', 'MXN ✏️', 'USD ✏️', 'Fecha Pago', 'Estatus', 'Notas'].map((h) => (
                <th key={h} style={{ padding: '10px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: .6, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const { mxn, usd, found, custom } = getImporte(r, circ.info, tarifario)
                const dc = getDC(r, tarifario)
                const isEditProv = editCell?.rowId === r.id && editCell?.field === 'prov'
                const isEditImp = editCell?.rowId === r.id && editCell?.field === 'importe'
                let dStr = '—'
                if (r.fecha) { const d = r.fecha instanceof Date ? r.fecha : new Date(r.fecha); dStr = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) }
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #ece7df', background: r.paid ? '#f0faf4' : 'transparent' }}>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontSize: 11 }}>{dStr}</td>
                    <td style={{ padding: '8px 10px', fontSize: 11, maxWidth: 100 }}>{r.destino || '—'}</td>
                    <td style={{ padding: '8px 10px' }}><Badge text={r.clasificacion} /></td>
                    <td style={{ padding: '8px 10px', fontWeight: 500, maxWidth: 130 }}>{r.servicio || '—'}</td>
                    <td style={{ padding: '8px 10px' }}><TipoBadge tipo={r.tipo} /></td>

                    {/* Proveedor */}
                    <td style={{ padding: '8px 10px', minWidth: 160 }}>
                      {isEditProv ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <select value={editVal} onChange={(e) => setEditVal(e.target.value)} autoFocus style={{ border: '1px solid #b8952a', borderRadius: 5, padding: '3px 7px', fontSize: 12, fontFamily: 'inherit', background: '#fff', maxWidth: 160 }}>
                            <option value="">— Sin proveedor —</option>
                            {tarifario.map((t) => <option key={t.id || t.proveedor} value={t.proveedor}>{t.proveedor}</option>)}
                          </select>
                          <button onClick={() => confirmEdit(circ.id, r.id, 'prov')} style={{ background: '#b8952a', color: '#12151f', border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>✓</button>
                          <button onClick={() => setEditCell(null)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 16 }}>✕</button>
                        </div>
                      ) : (
                        <div>
                          <span onClick={() => startEdit(r.id, 'prov', r)} style={{ fontWeight: 600, fontSize: 12, cursor: 'pointer', borderBottom: '1px dotted #b8952a' }} title="Clic para cambiar proveedor">
                            {r.prov_general || <span style={{ color: '#ccc' }}>Sin proveedor</span>}
                            {!found && tarifario.length > 0 && <span style={{ color: '#b83232', fontSize: 10 }}> ⚠</span>}
                          </span>
                          {dc > 0 && !r.paid && <div style={{ fontSize: 9, color: '#8a8278' }}>{dc}d crédito</div>}
                        </div>
                      )}
                    </td>

                    {/* Importe MXN */}
                    <td style={{ padding: '8px 10px', minWidth: 110 }}>
                      {isEditImp ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <input type="number" value={editVal} onChange={(e) => setEditVal(e.target.value)} placeholder="Importe" autoFocus style={{ border: '1px solid #b8952a', borderRadius: 5, padding: '3px 7px', fontSize: 12, fontFamily: 'inherit', width: 100 }} />
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <select value={editMoneda} onChange={(e) => setEditMoneda(e.target.value)} style={{ border: '1px solid #b8952a', borderRadius: 5, padding: '2px 5px', fontSize: 11, fontFamily: 'inherit', background: '#fff' }}>
                              <option>MXN</option><option>USD</option>
                            </select>
                            <button onClick={() => confirmEdit(circ.id, r.id, 'importe')} style={{ background: '#b8952a', color: '#12151f', border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>✓</button>
                            <button onClick={() => setEditCell(null)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 16 }}>✕</button>
                          </div>
                        </div>
                      ) : (
                        <span onClick={() => startEdit(r.id, 'importe', r)} style={{ fontWeight: 700, cursor: 'pointer', borderBottom: `1px dotted ${custom ? '#b8952a' : '#ddd'}`, color: custom ? '#b8952a' : '#12151f' }} title="Clic para editar importe">
                          {mxn > 0 ? fmtMXN(mxn) : <span style={{ color: '#ccc' }}>—</span>}
                          {custom && mxn > 0 && <span style={{ fontSize: 9, marginLeft: 2 }}>✎</span>}
                        </span>
                      )}
                    </td>

                    {/* Importe USD */}
                    <td style={{ padding: '8px 10px', minWidth: 90 }}>
                      <span onClick={() => startEdit(r.id, 'importe', r)} style={{ fontWeight: 700, cursor: 'pointer', borderBottom: `1px dotted ${custom ? '#b8952a' : '#ddd'}`, color: usd > 0 ? (custom ? '#b8952a' : '#1565a0') : '#ccc' }} title="Clic para editar">
                        {usd > 0 ? fmtUSD(usd) : '—'}
                        {custom && usd > 0 && <span style={{ fontSize: 9, marginLeft: 2 }}>✎</span>}
                      </span>
                    </td>

                    <td style={{ padding: '8px 10px' }}>
                      <input type="date" value={r.fecha_pago || ''} onChange={(e) => setFechaPago(circ.id, r.id, e.target.value)} style={{ border: '1px solid #d8d2c8', borderRadius: 5, padding: '3px 6px', fontSize: 11, fontFamily: 'inherit', width: 118 }} />
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                        <button onClick={() => togglePaid(circ.id, r.id, r.paid)} style={{ width: 34, height: 18, borderRadius: 9, border: 'none', background: r.paid ? '#52b788' : '#ccc', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                          <div style={{ position: 'absolute', top: 2, left: r.paid ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .25s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
                        </button>
                        <span style={{ fontSize: 10, fontWeight: 700, color: r.paid ? '#1e5c3a' : '#b83232' }}>{r.paid ? 'PAGADO' : 'PENDIENTE'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <textarea defaultValue={r.nota || ''} placeholder="Nota…" rows={1} onBlur={(e) => setNota(circ.id, r.id, e.target.value)}
                        style={{ width: 120, fontSize: 11, border: '1px solid transparent', borderRadius: 5, padding: '3px 5px', fontFamily: 'inherit', resize: 'none', background: 'transparent', lineHeight: 1.4 }}
                        onFocus={(e) => { e.target.style.borderColor = '#b8952a'; e.target.style.background = '#fffdf5' }}
                        onBlurCapture={(e) => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent' }} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot><tr style={{ background: '#ece7df' }}>
              <td colSpan={6} style={{ padding: '8px 10px', fontSize: 11, color: '#8a8278' }}>{rows.length} servicio{rows.length !== 1 ? 's' : ''}</td>
              <td style={{ padding: '8px 10px', fontWeight: 700 }}>{tMXN > 0 ? fmtMXN(tMXN) : '—'}</td>
              <td style={{ padding: '8px 10px', fontWeight: 700, color: '#1565a0' }}>{tUSD > 0 ? fmtUSD(tUSD) : '—'}</td>
              <td colSpan={3} />
            </tr></tfoot>
          </table>
        </div>
      )}
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
    if (r.fecha) { const d = r.fecha instanceof Date ? r.fecha : new Date(r.fecha); k = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); dl = d.toLocaleDateString('es-MX', { weekday: 'long' }) }
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
