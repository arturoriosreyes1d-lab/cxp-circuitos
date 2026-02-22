import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase'
import Login from './Login'
import { Badge, TipoBadge, Btn, KPIGrid, Modal, Spinner } from './components'
import { norm, clean, parseAmt, fmtMXN, fmtUSD, cap, getImporte, getDC, parseCircuito } from './helpers'

// ── Cargar XLSX ──
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

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#12151f' }}><Spinner /></div>
  if (!session) return <Login />
  return <Dashboard session={session} />
}

// ════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════
function Dashboard({ session }) {
  const xlsxReady = useXLSX()
  const [circuits, setCircuits] = useState([])
  const [tarifario, setTarifario] = useState([])
  const [TC, setTC] = useState(17.5)
  const [dataLoading, setDataLoading] = useState(true)
  const [view, setView] = useState({ type: 'empty' })
  const [F, setFilters] = useState({ tipo: 'ALL', cat: 'ALL', pago: 'ALL', fecha: '' })
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [modal, setModal] = useState(null)
  const [pendingCircuit, setPendingCircuit] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [activeTab, setActiveTab] = useState('cxp')
  const [editingProv, setEditingProv] = useState(null)
  const [editProvVal, setEditProvVal] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()
  const tarFileRef = useRef()

  // ── Cargar datos de Supabase ──
  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    setDataLoading(true)
    try {
      // Tarifario
      const { data: tar } = await supabase.from('tarifario').select('*').order('proveedor')
      if (tar) setTarifario(tar)

      // TC
      const { data: settings } = await supabase.from('team_settings').select('tc').eq('id', 1).single()
      if (settings) setTC(settings.tc)

      // Circuitos
      const { data: circs } = await supabase.from('circuits').select('*').order('created_at', { ascending: false })
      if (circs && circs.length > 0) {
        const { data: allRows } = await supabase.from('circuit_rows').select('*').order('idx')
        const full = circs.map((c) => ({
          ...c,
          rows: (allRows || []).filter((r) => r.circuit_id === c.id).map((r) => ({
            ...r,
            fecha: r.fecha ? new Date(r.fecha) : null,
          })),
        }))
        setCircuits(full)
        if (full.length > 0) setView({ type: 'all' })
      }
    } catch (e) { console.error(e) }
    setDataLoading(false)
  }

  // ── Upload circuito ──
  const handleCircuitFile = (file) => {
    if (!xlsxReady || !file) return
    const rd = new FileReader()
    rd.onload = (e) => {
      const wb = window.XLSX.read(e.target.result, { type: 'binary', cellDates: true })
      const data = parseCircuito(wb.Sheets[wb.SheetNames[0]])
      setPendingCircuit(data)
    }
    rd.readAsBinaryString(file)
  }

  const confirmLoad = async () => {
    if (!pendingCircuit) return
    setSaving(true)
    try {
      // Upsert circuito
      await supabase.from('circuits').upsert({
        id: pendingCircuit.id,
        month_key: pendingCircuit.monthKey,
        info: pendingCircuit.info,
      })
      // Borrar filas anteriores si existe
      await supabase.from('circuit_rows').delete().eq('circuit_id', pendingCircuit.id)
      // Insertar filas
      const rowsToInsert = pendingCircuit.rows.map((r) => ({
        circuit_id: pendingCircuit.id,
        idx: r.idx,
        fecha: r.fecha,
        destino: r.destino,
        clasificacion: r.clasificacion,
        servicio: r.servicio,
        tipo: r.tipo,
        prov_general: r.prov_general,
        t_venta: r.t_venta,
        paid: false,
        fecha_pago: null,
        nota: '',
      }))
      await supabase.from('circuit_rows').insert(rowsToInsert)
      await loadAll()
      setView({ type: 'circuit', circuitId: pendingCircuit.id })
      setActiveTab('cxp')
      setModal(null)
      setPendingCircuit(null)
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  // ── Tarifario ──
  const handleTarFile = (file) => {
    if (!xlsxReady || !file) return
    const rd = new FileReader()
    rd.onload = (e) => {
      const wb = window.XLSX.read(e.target.result, { type: 'binary', cellDates: true })
      const raw = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null })
      const newTar = []
      for (let i = 1; i < raw.length; i++) {
        const r = raw[i]
        if (!r || r.every((v) => !v)) continue
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
      if (rows.length > 0) {
        await supabase.from('tarifario').insert(rows.map((r) => ({
          proveedor: r.proveedor, tipo_servicio: r.tipo_servicio || r.tipoServicio,
          precio: r.precio, moneda: r.moneda, dias_credito: r.dias_credito || r.diasCredito || 0, notas: r.notas,
        })))
      }
      const { data } = await supabase.from('tarifario').select('*').order('proveedor')
      if (data) setTarifario(data)
    } catch (e) { console.error(e) }
    setSaving(false)
    setModal(null)
  }

  // ── Acciones circuito ──
  const togglePaid = async (cid, rowId, current) => {
    await supabase.from('circuit_rows').update({ paid: !current }).eq('id', rowId)
    setCircuits((prev) => prev.map((c) => c.id !== cid ? c : { ...c, rows: c.rows.map((r) => r.id !== rowId ? r : { ...r, paid: !current }) }))
  }

  const setFechaPago = async (cid, rowId, val) => {
    await supabase.from('circuit_rows').update({ fecha_pago: val || null }).eq('id', rowId)
    setCircuits((prev) => prev.map((c) => c.id !== cid ? c : { ...c, rows: c.rows.map((r) => r.id !== rowId ? r : { ...r, fecha_pago: val }) }))
  }

  const setNota = useCallback(async (cid, rowId, val) => {
    await supabase.from('circuit_rows').update({ nota: val }).eq('id', rowId)
    setCircuits((prev) => prev.map((c) => c.id !== cid ? c : { ...c, rows: c.rows.map((r) => r.id !== rowId ? r : { ...r, nota: val }) }))
  }, [])

  const saveProvEdit = async (cid, rowId) => {
    await supabase.from('circuit_rows').update({ prov_general: editProvVal }).eq('id', rowId)
    setCircuits((prev) => prev.map((c) => c.id !== cid ? c : { ...c, rows: c.rows.map((r) => r.id !== rowId ? r : { ...r, prov_general: editProvVal }) }))
    setEditingProv(null)
  }

  const deleteCircuit = async () => {
    await supabase.from('circuits').delete().eq('id', deleteId)
    const next = circuits.filter((c) => c.id !== deleteId)
    setCircuits(next)
    setView(next.length > 0 ? { type: 'all' } : { type: 'empty' })
    setModal(null)
  }

  const updateTC = async (val) => {
    const v = parseFloat(val)
    if (!v || v <= 0) return
    setTC(v)
    await supabase.from('team_settings').update({ tc: v }).eq('id', 1)
  }

  const logout = async () => {
    await supabase.auth.signOut()
  }

  // ── Month map ──
  const monthMap = {}
  circuits.forEach((c) => {
    const mk = c.month_key || 'Sin mes'
    if (!monthMap[mk]) monthMap[mk] = []
    monthMap[mk].push(c)
  })
  const sortedMonths = Object.keys(monthMap).sort((a, b) => b.localeCompare(a))

  // ── Filtered rows ──
  const filteredRows = (rows) => rows.filter((r) => {
    if (F.tipo !== 'ALL' && norm(r.tipo) !== F.tipo) return false
    if (F.cat !== 'ALL' && norm(r.clasificacion) !== F.cat) return false
    if (F.pago === 'PAID' && !r.paid) return false
    if (F.pago === 'UNPAID' && r.paid) return false
    if (F.fecha && r.fecha_pago !== F.fecha) return false
    return true
  })

  const activeCircuit = circuits.find((c) => c.id === view.circuitId)

  if (dataLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f1eb' }}>
      <div style={{ textAlign: 'center' }}>
        <Spinner />
        <div style={{ marginTop: 12, color: '#8a8278', fontSize: 13 }}>Cargando datos...</div>
      </div>
    </div>
  )

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", background: '#f5f1eb', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* HEADER */}
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
            <input type="number" value={TC} step="0.01" onChange={(e) => updateTC(e.target.value)}
              style={{ width: 52, background: 'none', border: 'none', color: '#e0c96a', fontSize: 12, fontWeight: 600, outline: 'none' }} />
            <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 11 }}>MXN/USD</span>
          </div>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,.15)' }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>{session?.user?.email}</span>
          <HBtn onClick={logout}>Salir</HBtn>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* SIDEBAR */}
        {sidebarOpen && (
          <aside style={{ width: 240, background: '#12151f', borderRight: '1px solid rgba(255,255,255,.07)', overflowY: 'auto', flexShrink: 0, position: 'sticky', top: 54, height: 'calc(100vh - 54px)' }}>
            <SbItem label="📊 Todos los circuitos" count={circuits.length} active={view.type === 'all'} onClick={() => setView({ type: 'all' })} />
            <div style={{ height: 1, background: 'rgba(255,255,255,.07)', margin: '8px 0' }} />
            {sortedMonths.map((mk) => (
              <div key={mk}>
                <div style={{ padding: '6px 16px 2px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,.3)' }}>{mk}</div>
                <SbItem label="📅 Ver mes" count={monthMap[mk].length} active={view.type === 'month' && view.monthKey === mk} onClick={() => setView({ type: 'month', monthKey: mk })} indent />
                {monthMap[mk].map((c) => {
                  const paid = c.rows.filter((r) => r.paid).length
                  const allPaid = paid === c.rows.length && c.rows.length > 0
                  const shortId = c.id.split('-').slice(-3).join('-')
                  return (
                    <div key={c.id} onClick={() => { setView({ type: 'circuit', circuitId: c.id }); setActiveTab('cxp'); setFilters({ tipo: 'ALL', cat: 'ALL', pago: 'ALL', fecha: '' }) }}
                      style={{ padding: '6px 16px 6px 28px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, borderLeft: `3px solid ${view.circuitId === c.id ? '#b8952a' : 'transparent'}`, background: view.circuitId === c.id ? 'rgba(184,149,42,.1)' : 'transparent' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: allPaid ? '#52b788' : '#e0c96a', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: view.circuitId === c.id ? '#fff' : 'rgba(255,255,255,.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.id}>{shortId}</span>
                    </div>
                  )
                })}
              </div>
            ))}
            <div style={{ height: 1, background: 'rgba(255,255,255,.07)', margin: '8px 0' }} />
            <div onClick={() => { setPendingCircuit(null); setModal('upload') }} style={{ padding: '10px 16px', cursor: 'pointer', color: 'rgba(255,255,255,.35)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>＋</span> Agregar circuito
            </div>
          </aside>
        )}

        {/* MAIN */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {view.type === 'empty' && <EmptyState onAdd={() => { setPendingCircuit(null); setModal('upload') }} />}
          {view.type === 'all' && <AllView circuits={circuits} monthMap={monthMap} sortedMonths={sortedMonths} tarifario={tarifario} TC={TC} onSelect={(id) => { setView({ type: 'circuit', circuitId: id }); setActiveTab('cxp') }} />}
          {view.type === 'month' && <MonthView mk={view.monthKey} circuits={monthMap[view.monthKey] || []} tarifario={tarifario} TC={TC} onSelect={(id) => { setView({ type: 'circuit', circuitId: id }); setActiveTab('cxp') }} />}
          {view.type === 'circuit' && activeCircuit && (
            <CircuitDetail
              circ={activeCircuit} tarifario={tarifario} TC={TC}
              activeTab={activeTab} setActiveTab={setActiveTab}
              F={F} setFilters={setFilters} filteredRows={filteredRows}
              togglePaid={togglePaid} setFechaPago={setFechaPago} setNota={setNota}
              editingProv={editingProv} setEditingProv={setEditingProv}
              editProvVal={editProvVal} setEditProvVal={setEditProvVal}
              saveProvEdit={saveProvEdit}
              onDelete={(id) => { setDeleteId(id); setModal('delete') }}
            />
          )}
        </main>
      </div>

      {/* MODALS */}
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
          <p style={{ color: '#8a8278', fontSize: 13 }}>Esta acción eliminará el circuito y todos sus servicios. No se puede deshacer.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Btn outline onClick={() => setModal(null)}>Cancelar</Btn>
            <Btn danger onClick={deleteCircuit}>Eliminar</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Header button ──
function HBtn({ children, onClick }) {
  return <button onClick={onClick} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.25)', color: 'rgba(255,255,255,.75)', padding: '5px 13px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 500 }}>{children}</button>
}

function SbItem({ label, count, active, onClick, indent }) {
  return (
    <div onClick={onClick} style={{ padding: `7px ${indent ? 24 : 16}px`, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: `3px solid ${active ? '#e0c96a' : 'transparent'}`, background: active ? 'rgba(184,149,42,.1)' : 'transparent' }}>
      <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? '#e0c96a' : 'rgba(255,255,255,.65)' }}>{label}</span>
      <span style={{ fontSize: 10, background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.35)', borderRadius: 10, padding: '1px 7px' }}>{count}</span>
    </div>
  )
}

function EmptyState({ onAdd }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 64, opacity: .35 }}>🗺️</div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 26, color: '#8a8278' }}>Sin circuitos cargados</h2>
      <p style={{ color: '#8a8278', maxWidth: 320, lineHeight: 1.6 }}>Agrega el Excel de un circuito para comenzar a gestionar tus cuentas por pagar.</p>
      <Btn onClick={onAdd}>+ Agregar primer circuito</Btn>
    </div>
  )
}

function UploadZone({ xlsxReady, onFile, pending, fileRef }) {
  const [drag, setDrag] = useState(false)
  return (
    <div>
      {!xlsxReady && <p style={{ color: '#8a8278', fontSize: 13, marginBottom: 12 }}>⏳ Cargando lector de Excel...</p>}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]) }}
        onClick={() => fileRef.current?.click()}
        style={{ border: `2px dashed ${drag ? '#b8952a' : pending ? '#52b788' : '#d8d2c8'}`, borderRadius: 10, padding: 28, textAlign: 'center', cursor: 'pointer', background: pending ? '#f0faf4' : drag ? '#fffdf5' : '#fafafa', transition: 'all .2s' }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>{pending ? '✅' : '📊'}</div>
        <p style={{ color: '#8a8278', fontSize: 13 }}>{pending ? `✓ ${pending.id} · ${pending.rows.length} servicios` : 'Arrastra el Excel de Operaciones o haz clic'}</p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]) }} />
      </div>
    </div>
  )
}

// ── Tarifario Editor ──
function TarifarioEditor({ tarifario, circuits, tarFileRef, onTarFile, onSave, onCancel, saving }) {
  const [rows, setRows] = useState(() => {
    if (tarifario.length > 0) return tarifario.map((t) => ({ ...t, tipo_servicio: t.tipo_servicio || t.tipoServicio || 'HOSPEDAJE', dias_credito: t.dias_credito || t.diasCredito || 0 }))
    const seen = new Set()
    const out = []
    circuits.forEach((c) => c.rows.forEach((r) => {
      const p = r.prov_general
      if (p && !seen.has(p.toUpperCase())) {
        seen.add(p.toUpperCase())
        out.push({ proveedor: p, tipo_servicio: r.clasificacion || 'HOSPEDAJE', precio: 0, moneda: 'MXN', dias_credito: 30, notas: '' })
      }
    }))
    return out
  })

  const update = (i, key, val) => setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r))
  const del = (i) => setRows((prev) => prev.filter((_, idx) => idx !== i))
  const add = () => setRows((prev) => [...prev, { proveedor: '', tipo_servicio: 'HOSPEDAJE', precio: 0, moneda: 'MXN', dias_credito: 30, notas: '' }])

  const inp = { border: '1px solid #d8d2c8', borderRadius: 5, padding: '4px 7px', fontFamily: 'inherit', fontSize: 12, width: '100%', outline: 'none' }
  const sel = { border: '1px solid #d8d2c8', borderRadius: 5, padding: '4px 7px', fontFamily: 'inherit', fontSize: 12, background: '#fff', cursor: 'pointer', outline: 'none' }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <Btn outline small onClick={() => tarFileRef.current?.click()}>📥 Importar Excel</Btn>
        <input ref={tarFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => { if (e.target.files[0]) onTarFile(e.target.files[0]) }} />
        <span style={{ fontSize: 11, color: '#aaa' }}>El tarifario es compartido por todo el equipo y se guarda en el servidor.</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: '#12151f', color: '#fff' }}>
            {['Proveedor', 'Tipo Servicio', 'Precio', 'Moneda', 'Días Crédito', 'Notas', ''].map((h) => (
              <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: .7 }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #ece7df' }}>
                <td style={{ padding: '6px 8px' }}><input style={{ ...inp, width: 150 }} value={r.proveedor} onChange={(e) => update(i, 'proveedor', e.target.value)} placeholder="Proveedor" /></td>
                <td style={{ padding: '6px 8px' }}>
                  <select style={sel} value={r.tipo_servicio} onChange={(e) => update(i, 'tipo_servicio', e.target.value)}>
                    {['HOSPEDAJE', 'TRANSPORTE', 'ACTIVIDADES', 'ALIMENTOS', 'GUIA', 'OTRO'].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </td>
                <td style={{ padding: '6px 8px' }}><input style={{ ...inp, width: 90 }} type="number" value={r.precio || ''} onChange={(e) => update(i, 'precio', parseFloat(e.target.value) || 0)} placeholder="0.00" /></td>
                <td style={{ padding: '6px 8px' }}>
                  <select style={sel} value={r.moneda} onChange={(e) => update(i, 'moneda', e.target.value)}>
                    <option>MXN</option><option>USD</option>
                  </select>
                </td>
                <td style={{ padding: '6px 8px' }}><input style={{ ...inp, width: 60 }} type="number" value={r.dias_credito || ''} onChange={(e) => update(i, 'dias_credito', parseInt(e.target.value) || 0)} placeholder="30" /></td>
                <td style={{ padding: '6px 8px' }}><input style={inp} value={r.notas || ''} onChange={(e) => update(i, 'notas', e.target.value)} placeholder="Notas" /></td>
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

// ── All View ──
function AllView({ circuits, monthMap, sortedMonths, tarifario, TC, onSelect }) {
  let tMXN = 0, tUSD = 0, pMXN = 0, pUSD = 0
  circuits.forEach((c) => c.rows.forEach((r) => {
    const { mxn, usd } = getImporte(r, c.info, tarifario)
    tMXN += mxn; tUSD += usd
    if (r.paid) { pMXN += mxn; pUSD += usd }
  }))
  return (
    <div>
      <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 26, marginBottom: 4 }}>📊 Todos los circuitos</h2>
      <p style={{ color: '#8a8278', fontSize: 13, marginBottom: 20 }}>{circuits.length} circuito{circuits.length !== 1 ? 's' : ''} · {Object.keys(monthMap).length} mes{Object.keys(monthMap).length !== 1 ? 'es' : ''}</p>
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
  circuits.forEach((c) => c.rows.forEach((r) => {
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
      <CircuitCards circs={circuits} tarifario={tarifario} TC={TC} onSelect={onSelect} />
    </div>
  )
}

function CircuitCards({ circs, tarifario, TC, onSelect }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: 14 }}>
      {circs.map((c) => {
        let mxn = 0, usd = 0, pMXN = 0, pUSD = 0
        c.rows.forEach((r) => { const { mxn: m, usd: u } = getImporte(r, c.info, tarifario); mxn += m; usd += u; if (r.paid) { pMXN += m; pUSD += u } })
        const paid = c.rows.filter((r) => r.paid).length
        const pct = c.rows.length > 0 ? Math.round((paid / c.rows.length) * 100) : 0
        const allPaid = paid === c.rows.length && c.rows.length > 0
        const shortId = c.id.split('-').slice(-3).join('-')
        const fi = c.info?.fecha_inicio
        const fStr = fi ? (fi instanceof Date ? fi : new Date(fi)).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
        return (
          <div key={c.id} onClick={() => onSelect(c.id)}
            style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 2px 16px rgba(18,21,31,.07)', borderTop: `3px solid ${allPaid ? '#52b788' : '#d8d2c8'}`, cursor: 'pointer', transition: 'all .2s' }}>
            <div style={{ fontSize: 11, color: '#8a8278', marginBottom: 3 }}>{shortId}</div>
            <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{c.info?.tl || 'Sin TL'}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {[`📅 ${fStr}`, `👤 ${c.info?.pax || '—'} PAX`, `🛏 ${c.info?.habs || '—'} HAB`].map((t) => (
                <span key={t} style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 8, background: '#ece7df', color: '#8a8278' }}>{t}</span>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
              <div><div style={{ fontSize: 10, color: '#8a8278' }}>MXN</div><div style={{ fontWeight: 700, fontSize: 14 }}>{mxn > 0 ? fmtMXN(mxn) : '—'}</div></div>
              <div><div style={{ fontSize: 10, color: '#1565a0' }}>USD</div><div style={{ fontWeight: 700, fontSize: 14, color: '#1565a0' }}>{usd > 0 ? fmtUSD(usd) : '—'}</div></div>
            </div>
            <div style={{ height: 4, background: '#ece7df', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: pct + '%', background: '#52b788', borderRadius: 2 }} />
            </div>
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
function CircuitDetail({ circ, tarifario, TC, activeTab, setActiveTab, F, setFilters, filteredRows, togglePaid, setFechaPago, setNota, editingProv, setEditingProv, editProvVal, setEditProvVal, saveProvEdit, onDelete }) {
  const fi = circ.info?.fecha_inicio
  const fStr = fi ? (fi instanceof Date ? fi : new Date(fi)).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/D'
  let pMXN = 0, pUSD = 0, nMXN = 0, nUSD = 0
  circ.rows.forEach((r) => { const { mxn, usd } = getImporte(r, circ.info, tarifario); if (r.paid) { pMXN += mxn; pUSD += usd } else { nMXN += mxn; nUSD += usd } })
  const lib = circ.rows.filter((r) => norm(r.tipo) === 'LIBERO').length
  const opc = circ.rows.filter((r) => norm(r.tipo) === 'OPCIONAL').length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
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

      <KPIGrid items={[
        { cls: 'gold', label: 'Servicios', val: circ.rows.length, sub: `${lib} LIBERO · ${opc} OPCIONAL` },
        { cls: 'forest', label: '✅ Pagado MXN', val: fmtMXN(pMXN) },
        { cls: 'sky', label: '✅ Pagado USD', val: fmtUSD(pUSD) },
        { cls: 'rust', label: '⏳ Pendiente MXN', val: fmtMXN(nMXN) },
        { cls: 'rust', label: '⏳ Pendiente USD', val: fmtUSD(nUSD) },
        { cls: 'violet', label: 'Tarifario', val: tarifario.length, sub: 'proveedores' },
      ]} />

      <div style={{ display: 'flex', gap: 3, background: '#ece7df', borderRadius: 10, padding: 3, marginBottom: 18, width: 'fit-content', flexWrap: 'wrap' }}>
        {[['cxp', '💳 CxP'], ['proveedores', '🏢 Proveedores'], ['timeline', '📅 Timeline'], ['resultados', '📈 Resultados']].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            style={{ padding: '7px 15px', border: 'none', background: activeTab === id ? '#fff' : 'transparent', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: activeTab === id ? 700 : 500, color: activeTab === id ? '#12151f' : '#8a8278', fontFamily: 'inherit' }}>{label}</button>
        ))}
      </div>

      {activeTab === 'cxp' && <CxPPanel circ={circ} tarifario={tarifario} F={F} setFilters={setFilters} filteredRows={filteredRows} togglePaid={togglePaid} setFechaPago={setFechaPago} setNota={setNota} editingProv={editingProv} setEditingProv={setEditingProv} editProvVal={editProvVal} setEditProvVal={setEditProvVal} saveProvEdit={saveProvEdit} />}
      {activeTab === 'proveedores' && <ProvPanel circ={circ} tarifario={tarifario} TC={TC} />}
      {activeTab === 'timeline' && <TimelinePanel circ={circ} tarifario={tarifario} />}
      {activeTab === 'resultados' && <ResultadosPanel circ={circ} tarifario={tarifario} TC={TC} />}
    </div>
  )
}

// ── CxP Panel ──
function CxPPanel({ circ, tarifario, F, setFilters, filteredRows, togglePaid, setFechaPago, setNota, editingProv, setEditingProv, editProvVal, setEditProvVal, saveProvEdit }) {
  const rows = filteredRows(circ.rows)
  let tMXN = 0, tUSD = 0
  rows.forEach((r) => { const { mxn, usd } = getImporte(r, circ.info, tarifario); tMXN += mxn; tUSD += usd })

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
          <div key={key} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#8a8278', textTransform: 'uppercase', letterSpacing: .6, minWidth: 64 }}>{label}</span>
            {opts.map(([val, color, lbl]) => <FBtn key={val} fkey={key} val={val} label={lbl} activeColor={color} />)}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#8a8278', textTransform: 'uppercase', letterSpacing: .6, minWidth: 64 }}>Fecha Pago</span>
          <input type="date" value={F.fecha} onChange={(e) => setFilters((p) => ({ ...p, fecha: e.target.value }))}
            style={{ border: '1.5px solid #d8d2c8', borderRadius: 14, padding: '4px 10px', fontFamily: 'inherit', fontSize: 11, background: '#f5f1eb' }} />
          {F.fecha && <button onClick={() => setFilters((p) => ({ ...p, fecha: '' }))} style={{ fontSize: 11, background: 'none', border: 'none', color: '#8a8278', cursor: 'pointer' }}>✕ Limpiar</button>}
        </div>
      </div>

      {rows.length === 0 ? <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8a8278', fontSize: 13 }}>🔍 Sin resultados para ese filtro</div> : (
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 16px rgba(18,21,31,.07)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1100 }}>
            <thead><tr style={{ background: '#12151f', color: '#fff' }}>
              {['Fecha', 'Destino', 'Categoría', 'Servicio', 'Tipo', 'Proveedor (clic=editar)', 'MXN', 'USD', 'Fecha Pago', 'Estatus', 'Notas'].map((h) => (
                <th key={h} style={{ padding: '10px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: .6, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const { mxn, usd, found } = getImporte(r, circ.info, tarifario)
                const dc = getDC(r, tarifario)
                const isEditing = editingProv?.cid === circ.id && editingProv?.rowId === r.id
                let dStr = '—'
                if (r.fecha) { const d = r.fecha instanceof Date ? r.fecha : new Date(r.fecha); dStr = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) }
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #ece7df', background: r.paid ? '#f0faf4' : 'transparent' }}>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontSize: 11 }}>{dStr}</td>
                    <td style={{ padding: '8px 10px', fontSize: 11, maxWidth: 110 }}>{r.destino || '—'}</td>
                    <td style={{ padding: '8px 10px' }}><Badge text={r.clasificacion} /></td>
                    <td style={{ padding: '8px 10px', fontWeight: 500, maxWidth: 130 }}>{r.servicio || '—'}</td>
                    <td style={{ padding: '8px 10px' }}><TipoBadge tipo={r.tipo} /></td>
                    <td style={{ padding: '8px 10px' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input value={editProvVal} onChange={(e) => setEditProvVal(e.target.value)} autoFocus
                            style={{ border: '1px solid #b8952a', borderRadius: 5, padding: '3px 7px', fontSize: 12, width: 130, fontFamily: 'inherit' }} />
                          <button onClick={() => saveProvEdit(circ.id, r.id)} style={{ background: '#b8952a', color: '#12151f', border: 'none', borderRadius: 5, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>✓</button>
                          <button onClick={() => setEditingProv(null)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer' }}>✕</button>
                        </div>
                      ) : (
                        <div>
                          <span onClick={() => { setEditingProv({ cid: circ.id, rowId: r.id }); setEditProvVal(r.prov_general) }}
                            style={{ fontWeight: 600, fontSize: 12, cursor: 'pointer', borderBottom: '1px dotted #b8952a' }} title="Clic para editar">
                            {r.prov_general || '—'}{!found && tarifario.length > 0 && <span style={{ color: '#b83232', fontSize: 10 }}> ⚠</span>}
                          </span>
                          {dc > 0 && !r.paid && <div style={{ fontSize: 9, color: '#8a8278' }}>{dc}d crédito</div>}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', fontWeight: 700 }}>{mxn > 0 ? fmtMXN(mxn) : <span style={{ color: '#ccc' }}>—</span>}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: '#1565a0' }}>{usd > 0 ? fmtUSD(usd) : <span style={{ color: '#ccc' }}>—</span>}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <input type="date" value={r.fecha_pago || ''} onChange={(e) => setFechaPago(circ.id, r.id, e.target.value)}
                        style={{ border: '1px solid #d8d2c8', borderRadius: 5, padding: '3px 6px', fontSize: 11, fontFamily: 'inherit', width: 118 }} />
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                        <button onClick={() => togglePaid(circ.id, r.id, r.paid)}
                          style={{ width: 34, height: 18, borderRadius: 9, border: 'none', background: r.paid ? '#52b788' : '#ccc', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                          <div style={{ position: 'absolute', top: 2, left: r.paid ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .25s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
                        </button>
                        <span style={{ fontSize: 10, fontWeight: 700, color: r.paid ? '#1e5c3a' : '#b83232' }}>{r.paid ? 'PAGADO' : 'PENDIENTE'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <textarea defaultValue={r.nota || ''} placeholder="Nota…" rows={1}
                        onBlur={(e) => setNota(circ.id, r.id, e.target.value)}
                        style={{ width: 130, fontSize: 11, border: '1px solid transparent', borderRadius: 5, padding: '3px 5px', fontFamily: 'inherit', resize: 'none', background: 'transparent', lineHeight: 1.4 }}
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
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {[...d.cats].filter(Boolean).map((c) => <Badge key={c} text={c} />)}
              </div>
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

// ── Resultados ──
function ResultadosPanel({ circ, tarifario, TC }) {
  const ci = {}, cc = {}, rd = {}
  circ.rows.forEach((r) => {
    const cat = norm(r.clasificacion) || 'OTROS'
    const vi = parseAmt(r.t_venta); if (vi > 0) ci[cat] = (ci[cat] || 0) + vi
    const { mxn, usd } = getImporte(r, circ.info, tarifario)
    const total = mxn + usd * TC; if (total > 0) cc[cat] = (cc[cat] || 0) + total
    if (!rd[cat]) rd[cat] = { paidMXN: 0, paidUSD: 0, pendMXN: 0, pendUSD: 0 }
    if (r.paid) { rd[cat].paidMXN += mxn; rd[cat].paidUSD += usd } else { rd[cat].pendMXN += mxn; rd[cat].pendUSD += usd }
  })
  const ti = Object.values(ci).reduce((a, b) => a + b, 0)
  const tc2 = Object.values(cc).reduce((a, b) => a + b, 0)
  const mrg = ti - tc2, mPct = ti > 0 ? ((mrg / ti) * 100).toFixed(1) : 0
  let tPMXN = 0, tPUSD = 0, tNMXN = 0, tNUSD = 0
  Object.values(rd).forEach((d) => { tPMXN += d.paidMXN; tPUSD += d.paidUSD; tNMXN += d.pendMXN; tNUSD += d.pendUSD })
  const cols = { HOSPEDAJE: '#f4a261', TRANSPORTE: '#4361ee', ACTIVIDADES: '#f72585', ALIMENTOS: '#2d6a4f', GUIA: '#9b5de5' }
  const maxV = Math.max(...Object.values(cc), 1)
  const Card = ({ children, mb }) => <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 16px rgba(18,21,31,.07)', marginBottom: mb || 16 }}>{children}</div>
  const H = ({ children }) => <h3 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 15, marginBottom: 12, paddingBottom: 8, borderBottom: '2px solid #ece7df' }}>{children}</h3>
  const Row = ({ label, val, color, bold }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #ece7df', fontSize: 13 }}>
      <span style={{ color: bold ? '#12151f' : '#8a8278', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 600, color: color || '#12151f' }}>{val}</span>
    </div>
  )
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card>
          <H>📥 Ingresos (T-Venta)</H>
          {ti === 0 ? <p style={{ color: '#8a8278', fontSize: 12 }}>T-Venta no capturada.</p>
            : Object.entries(ci).map(([c, v]) => <Row key={c} label={c} val={fmtMXN(v)} color="#1e5c3a" />)}
          {ti > 0 && <Row label="TOTAL" val={fmtMXN(ti)} color="#1e5c3a" bold />}
        </Card>
        <Card>
          <H>📤 Costos (Tarifario)</H>
          {tc2 === 0 ? <p style={{ color: '#8a8278', fontSize: 12 }}>Agrega precios al tarifario.</p>
            : ['HOSPEDAJE', 'TRANSPORTE', 'ACTIVIDADES', 'ALIMENTOS', 'GUIA', 'OTROS'].filter((c) => cc[c]).map((c) => <Row key={c} label={c} val={fmtMXN(cc[c])} color="#b83232" />)}
          {tc2 > 0 && <Row label="TOTAL" val={fmtMXN(tc2)} color="#b83232" bold />}
        </Card>
      </div>
      <Card>
        <H>📊 Distribución por Categoría</H>
        {tc2 === 0 ? <p style={{ color: '#8a8278', fontSize: 12 }}>Agrega precios al tarifario.</p>
          : Object.entries(cc).sort((a, b) => b[1] - a[1]).map(([c, v]) => (
            <div key={c} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                <span>{c}</span><span style={{ fontWeight: 600 }}>{fmtMXN(v)} <span style={{ color: '#8a8278', fontWeight: 400 }}>({((v / tc2) * 100).toFixed(1)}%)</span></span>
              </div>
              <div style={{ background: '#ece7df', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: ((v / maxV) * 100) + '%', background: cols[c] || '#888', borderRadius: 4 }} />
              </div>
            </div>
          ))}
      </Card>
      <Card>
        <H>💳 Pagado / Pendiente por Rubro</H>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#12151f', color: '#fff' }}>
              {['Rubro', '✅ Pagado MXN', '✅ Pagado USD', '⏳ Pendiente MXN', '⏳ Pendiente USD'].map((h, i) => (
                <th key={h} style={{ padding: '9px 12px', textAlign: i === 0 ? 'left' : 'right', fontSize: 10, textTransform: 'uppercase', letterSpacing: .6 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {Object.entries(rd).map(([cat, d]) => (
                <tr key={cat} style={{ borderBottom: '1px solid #ece7df' }}>
                  <td style={{ padding: '8px 12px' }}><Badge text={cat} /></td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#1e5c3a' }}>{fmtMXN(d.paidMXN)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#1565a0' }}>{fmtUSD(d.paidUSD)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#b83232' }}>{fmtMXN(d.pendMXN)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#b83232' }}>{fmtUSD(d.pendUSD)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr style={{ background: '#ece7df' }}>
              <td style={{ padding: '8px 12px', fontWeight: 700 }}>TOTAL</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#1e5c3a' }}>{fmtMXN(tPMXN)}</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#1565a0' }}>{fmtUSD(tPUSD)}</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#b83232' }}>{fmtMXN(tNMXN)}</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#b83232' }}>{fmtUSD(tNUSD)}</td>
            </tr></tfoot>
          </table>
        </div>
      </Card>
      <Card>
        <H>💰 Resumen General</H>
        <Row label="Total Ingresos (T-Venta)" val={ti > 0 ? fmtMXN(ti) : 'Por capturar'} color="#1e5c3a" />
        <Row label="Total Costos (Tarifario)" val={tc2 > 0 ? fmtMXN(tc2) : 'Por capturar'} color="#b83232" />
        {ti > 0 && tc2 > 0 && <Row label="Margen Bruto" val={`${fmtMXN(mrg)} (${mPct}%)`} color={mrg >= 0 ? '#1e5c3a' : '#b83232'} bold />}
        {!(ti > 0 && tc2 > 0) && <p style={{ fontSize: 12, color: '#8a8278', marginTop: 8 }}>⚠️ Captura T-Venta y tarifario para ver el margen.</p>}
      </Card>
    </div>
  )
}

function useState(init) {
  return require('react').useState(init)
}
