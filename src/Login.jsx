import { useState } from "react";
import { supabase } from "./supabase.js";

const C = {
  navy: "#0F2D4A", blue: "#1565C0", sky: "#2196F3",
  cream: "#FAFBFC", surface: "#FFFFFF", border: "#E2E8F0", muted: "#64748B",
  text: "#1A2332", danger: "#E53935",
};

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error: dbError } = await supabase
        .from("app_users")
        .select("*")
        .eq("username", username.trim().toLowerCase())
        .eq("password", password)
        .eq("activo", true)
        .single();

      if (dbError || !data) {
        setError("Usuario o contraseña incorrectos");
        setLoading(false);
        return;
      }

      onLogin(data);
    } catch (err) {
      setError("Error al conectar con el servidor");
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: `linear-gradient(135deg, ${C.navy} 0%, #1a3a5c 50%, ${C.blue} 100%)`,
      fontFamily: "'DM Sans','Segoe UI',sans-serif",
    }}>
      <div style={{
        background: C.surface, borderRadius: 24, padding: 48, width: "100%", maxWidth: 420,
        boxShadow: "0 20px 60px rgba(0,0,0,.3)",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 56, marginBottom: 8 }}>✈️</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: C.navy, margin: 0 }}>Viajes Libero</h1>
          <p style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>Sistema de Cuentas por Pagar</p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>
              Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Ingresa tu usuario"
              autoFocus
              style={{
                padding: "12px 16px", borderRadius: 12, border: `2px solid ${C.border}`, fontSize: 15,
                outline: "none", background: C.cream, width: "100%", fontFamily: "inherit", color: C.text,
                boxSizing: "border-box", transition: "border-color .2s",
              }}
              onFocus={e => e.target.style.borderColor = C.blue}
              onBlur={e => e.target.style.borderColor = C.border}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Ingresa tu contraseña"
              style={{
                padding: "12px 16px", borderRadius: 12, border: `2px solid ${C.border}`, fontSize: 15,
                outline: "none", background: C.cream, width: "100%", fontFamily: "inherit", color: C.text,
                boxSizing: "border-box", transition: "border-color .2s",
              }}
              onFocus={e => e.target.style.borderColor = C.blue}
              onBlur={e => e.target.style.borderColor = C.border}
            />
          </div>

          {error && (
            <div style={{
              background: "#FFEBEE", border: "1px solid #EF9A9A", borderRadius: 10,
              padding: "10px 14px", marginBottom: 16, color: C.danger, fontSize: 13, fontWeight: 600,
              textAlign: "center",
            }}>
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            style={{
              width: "100%", padding: "14px 20px", borderRadius: 12, border: "none",
              background: loading ? C.muted : C.blue, color: "#fff", fontWeight: 800,
              fontSize: 16, cursor: loading ? "wait" : "pointer", fontFamily: "inherit",
              transition: "background .2s",
              opacity: (!username || !password) ? 0.6 : 1,
            }}
          >
            {loading ? "Verificando…" : "Iniciar Sesión"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 12, color: C.muted }}>
          Sistema de gestión de cuentas por pagar
        </div>
      </div>
    </div>
  );
}
