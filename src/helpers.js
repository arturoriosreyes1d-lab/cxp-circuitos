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

// Convierte un month_key como "abril de 2026", "diciembre 2025", "Mayo De 2026"
// a una clave cronológicamente ordenable tipo "2026-04". Devuelve "9999-99"
// para meses desconocidos para que queden al final del listado.
const _MESES_ES = {
  enero: '01', febrero: '02', marzo: '03', abril: '04',
  mayo: '05', junio: '06', julio: '07', agosto: '08',
  septiembre: '09', setiembre: '09', octubre: '10',
  noviembre: '11', diciembre: '12',
}
export function monthKeySortable(mk) {
  if (!mk || mk === 'Sin mes') return '9999-99'
  const s = String(mk).toLowerCase().trim()
  // Acepta "abril 2026", "abril de 2026", con o sin acentos
  const m = s.match(/([a-záéíóúñ]+)\s+(?:de\s+)?(\d{4})/i)
  if (!m) return '9999-99'
  const month = _MESES_ES[m[1]]
  if (!month) return '9999-99'
  return `${m[2]}-${month}`
}

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

// Convierte un valor de celda de Excel a Date.
// Prioriza objetos Date (cuando cellDates:true funciona), pero también
// entiende strings en formato DD/MM/AAAA, DD-MM-AAAA, AAAA-MM-DD, etc.
// Si no se puede interpretar, devuelve null.
export function excelCellToDate(v) {
  if (!v) return null
  if (v instanceof Date && !isNaN(v.getTime())) return v
  if (typeof v === 'number') {
    // Serial date de Excel (días desde 1900-01-01)
    const ms = (v - 25569) * 86400 * 1000
    const d = new Date(ms)
    return isNaN(d.getTime()) ? null : d
  }
  const s = String(v).trim()
  if (!s) return null
  // ISO: 2026-05-02 o 2026-05-02T00:00:00...
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/)
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3])
    return isNaN(d.getTime()) ? null : d
  }
  // DD/MM/AAAA o DD-MM-AAAA (formato MX, día primero — el que usa Operaciones)
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) {
    let yyyy = +m[3]; if (yyyy < 100) yyyy += 2000
    const dd = +m[1], mm = +m[2]
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const d = new Date(yyyy, mm - 1, dd)
      return isNaN(d.getTime()) ? null : d
    }
  }
  return null
}

// Genera el month_key ("mayo de 2026") a partir de un Date.
export function dateToMonthKey(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return 'Sin mes'
  return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })
}

export function parseCircuito(ws) {
  const raw = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const fechaInicioRaw = raw[3]?.[7]
  const fechaInicioDate = excelCellToDate(fechaInicioRaw)
  const info = {
    tl: raw[0]?.[1], rep: raw[1]?.[1], operador: raw[2]?.[1],
    id: clean(raw[3]?.[1]), habs: raw[0]?.[5], pax: raw[1]?.[5],
    fecha_inicio: fechaInicioDate ? fechaInicioDate.toISOString() : null,
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
    const fechaRow = excelCellToDate(r[0])
    rows.push({
      idx: idx++,
      fecha: fechaRow ? fechaRow.toISOString() : null,
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
  return { id: circId, info, rows, monthKey: dateToMonthKey(fechaInicioDate) }
}
