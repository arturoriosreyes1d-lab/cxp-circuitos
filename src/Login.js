import { useState } from 'react'
import { supabase } from './supabase'
import { Btn } from './components'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Correo o contraseña incorrectos')
    setLoading(false)
  }

  const inp = {
    width: '100%', padding: '11px 14px', border: '1.5px solid #d8d2c8',
    borderRadius: 9, fontFamily: 'inherit', fontSize: 14, outline: 'none',
    transition: 'border-color .2s', background: '#fafaf8',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#12151f', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '40px 36px', width: 'min(420px,100%)', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: 32, fontWeight: 700, color: '#12151f' }}>
            CxP <span style={{ color: '#b8952a' }}>Circuitos</span>
          </div>
          <div style={{ color: '#8a8278', fontSize: 13, marginTop: 6 }}>Control de Cuentas por Pagar</div>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#8a8278', display: 'block', marginBottom: 5 }}>CORREO</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              style={inp} placeholder="tu@correo.com" required
              onFocus={(e) => e.target.style.borderColor = '#b8952a'}
              onBlur={(e) => e.target.style.borderColor = '#d8d2c8'} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#8a8278', display: 'block', marginBottom: 5 }}>CONTRASEÑA</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              style={inp} placeholder="••••••••" required
              onFocus={(e) => e.target.style.borderColor = '#b8952a'}
              onBlur={(e) => e.target.style.borderColor = '#d8d2c8'} />
          </div>

          {error && (
            <div style={{ background: '#fff0f0', border: '1px solid #ffcdd2', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b83232' }}>
              ⚠️ {error}
            </div>
          )}

          <Btn full disabled={loading} onClick={handleLogin}>
            {loading ? 'Ingresando...' : 'Ingresar →'}
          </Btn>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#bbb' }}>
          ¿Problemas para ingresar? Contacta al administrador.
        </div>
      </div>
    </div>
  )
}
