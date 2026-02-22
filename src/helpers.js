export const norm = (v) => (v ? String(v).toUpperCase().trim().replace(/\s+/g, ' ') : '')
export const clean = (v) => (!v || v === '\xa0' ? '' : String(v).trim())
export const parseAmt = (v) => {
  if (!v || v === '\xa0') return 0
  if (typeof v === 'number') return Math.abs(v)
  return parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0
}
export const fmtMXN = (v) =>
  v > 0 ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v) : '—'
export const fmtUSD = (v) =>
  v > 0 ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v) : '—'
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

export const CAT_ICONS = { HOSPEDAJE: '🏨', TRANSPORTE: '🚌', ACTIVIDADES: '🎯', ALIMENTOS: '🍽', GUIA: '🧭' }
export const CAT_COLORS = {
  HOSPEDAJE: { bg: '#fff3cd', color: '#7d5a00' },
  TRANSPORTE: { bg: '#e0e7ff', color: '#1e1b8b' },
  ACTIVIDADES: { bg: '#fce7f3', color: '#831843' },
  ALIMENTOS: { bg: '#ecfdf5', color: '#064e3b' },
  GUIA: { bg: '#f3e8ff', color: '#4a0072' },
}

export function getImporte(row, circInfo, tarifario) {
  const pKey = norm(row.prov_general)
  const match = tarifario.find((t) => norm(t.proveedor) === pKey)
  if (!match || match.precio === 0) return { mxn: 0, usd: 0, found: false }
  let unidades = 1
  if (norm(row.clasificacion) === 'HOSPEDAJE') unidades = parseInt(circInfo?.habs) || 1
  const total = match.precio * unidades
  return match.moneda === 'USD'
    ? { mxn: 0, usd: total, found: true }
    : { mxn: total, usd: 0, found: true }
}

export function getDC(row, tarifario) {
  const m = tarifario.find((t) => norm(t.proveedor) === norm(row.prov_general))
  return m ? m.dias_credito || 0 : 0
}

export function parseCircuito(ws) {
  const raw = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const info = {
    tl: raw[0]?.[1], rep: raw[1]?.[1], operador: raw[2]?.[1],
    id: clean(raw[3]?.[1]), habs: raw[0]?.[5], pax: raw[1]?.[5],
    fecha_inicio: raw[3]?.[7],
  }
  const circId = info.id || 'CIRC-' + Date.now()
  const rows = []
  let idx = 0
  for (let i = 6; i < raw.length; i++) {
    const r = raw[i]
    if (!r || r.every((v) => !v || v === '\xa0')) continue
    if (!r[3] && !r[5] && !r[6]) continue
    const tipo = norm(r[6])
    if (tipo !== 'LIBERO' && tipo !== 'OPCIONAL') continue
    rows.push({
      idx: idx++,
      fecha: r[0] instanceof Date ? r[0].toISOString() : null,
      destino: clean(r[3]),
      clasificacion: clean(r[4]),
      servicio: clean(r[5]),
      tipo: clean(r[6]),
      prov_general: clean(r[7]),
      t_venta: parseAmt(r[10]),
      paid: false,
      fecha_pago: null,
      nota: '',
    })
  }
  let monthKey = 'Sin mes'
  const fi = info.fecha_inicio
  if (fi instanceof Date) monthKey = fi.toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })
  return { id: circId, info, rows, monthKey }
}
