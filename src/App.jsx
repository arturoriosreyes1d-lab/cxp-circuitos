import { useState, useEffect } from "react";
import Login from "./Login.jsx";
import CxpApp from "./CxpApp.jsx";

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem("cxp_user");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const handleLogin = (userData) => {
    setUser(userData);
    try { sessionStorage.setItem("cxp_user", JSON.stringify(userData)); } catch {}
  };

  const handleLogout = () => {
    setUser(null);
    try { sessionStorage.removeItem("cxp_user"); } catch {}
  };

  if (!user) return <Login onLogin={handleLogin} />;
  return <CxpApp user={user} onLogout={handleLogout} />;
}
