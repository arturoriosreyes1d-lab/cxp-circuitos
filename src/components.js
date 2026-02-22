import { norm, CAT_COLORS, CAT_ICONS } from './helpers'

export function Badge({ text }) {
  const c = norm(text)
  const style = CAT_COLORS[c] || { bg: '#f0f0f0', color: '#666' }
  const ico = CAT_ICONS[c] || '📌'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 9, fontSize: 11, fontWeight: 700, background: style.bg, color: style.color, whiteSpace: 'nowrap' }}>
      {ico} {text || '—'}
    </span>
  )
}

export function TipoBadge({ tipo }) {
  const t = norm(tipo)
  if (t === 'LIBERO') return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 9, fontSize: 11, fontWeight: 700, background: '#d8f3dc', color: '#1b4332' }}>LIBERO</span>
  if (t === 'OPCIONAL') return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 9, fontSize: 11, fontWeight: 700, background: '#caf0f8', color: '#03045e' }}>OPCIONAL</span>
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 9, fontSize: 11, background: '#eee', color: '#666' }}>{tipo || '—'}</span>
}

export function Btn({ children, onClick, outline, danger, disabled, small, full }) {
  const base = {
    padding: small ? '5px 13px' : '8px 18px',
    borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: small ? 12 : 13, fontFamily: 'inherit', fontWeight: 600,
    border: 'none', opacity: disabled ? 0.5 : 1, transition: 'all .2s',
    width: full ? '100%' : 'auto', display: 'inline-flex', alignItems: 'center', gap: 6,
  }
  if (danger) return <button style={{ ...base, background: '#b83232', color: '#fff' }} onClick={onClick} disabled={disabled}>{children}</button>
  if (outline) return <button style={{ ...base, background: 'transparent', border: '1.5px solid #d8d2c8', color: '#8a8278' }} onClick={onClick} disabled={disabled}>{children}</button>
  return <button style={{ ...base, background: '#b8952a', color: '#12151f' }} onClick={onClick} disabled={disabled}>{children}</button>
}

export function KPIGrid({ items }) {
  const colors = { gold: '#b8952a', forest: '#52b788', rust: '#b83232', sky: '#1565a0', violet: '#5c35a0' }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 22 }}>
      {items.map((kpi, i) => (
        <div key={i} style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', boxShadow: '0 2px 16px rgba(18,21,31,.07)', borderLeft: `3px solid ${colors[kpi.cls] || '#d8d2c8'}` }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: .8, color: '#8a8278', fontWeight: 600, marginBottom: 5 }}>{kpi.label}</div>
          <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{kpi.val}</div>
          {kpi.sub && <div style={{ fontSize: 11, color: '#8a8278', marginTop: 3 }}>{kpi.sub}</div>}
        </div>
      ))}
    </div>
  )
}

export function Modal({ title, children, onClose, wide }) {
  return (
    <div onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: `min(${wide ? '900px' : '500px'}, 95vw)`, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 20 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
      <div style={{ width: 32, height: 32, border: '3px solid #ece7df', borderTop: '3px solid #b8952a', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
