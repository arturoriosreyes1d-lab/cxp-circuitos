import React, { useState, useMemo, useEffect } from "react";

/**
 * Modal de gestión de Egresos No Facturados (NF).
 * Muestra KPIs, mini-gráfica por clasificación, búsqueda libre,
 * lista agrupada por mes y día, y permite aplicar pagos masivos.
 */
export default function EgresosNFModal({
  egresos = [],
  payments = [],
  onClose,
  onNuevo,
  onImportar,
  onEditar,
  onPagos,
  onEliminar,
  onAplicarPagosMasivos,
  currency = "MXN",
}) {
  const [busqueda, setBusqueda] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedMonths, setExpandedMonths] = useState(new Set());
  const [expandedDays, setExpandedDays] = useState(new Set());
  const [pagoMasivoModal, setPagoMasivoModal] = useState(null);

  const fmt = (n) =>
    new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(+n || 0);
  const monedaSym = (m) => (m === "EUR" ? "€" : "$");
  const today = () => new Date().toISOString().split("T")[0];
  const inicioMesActual = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  };
  const MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const saldoOf = (e) => Math.max(0, (+e.total || 0) - (+e.montoPagado || 0));

  // KPIs
  const kpis = useMemo(() => {
    const totalActivo = { MXN: 0, USD: 0, EUR: 0 };
    const programado = { MXN: 0, USD: 0, EUR: 0 };
    const pagadoMes = { MXN: 0, USD: 0, EUR: 0 };
    const inicioMes = inicioMesActual();
    const hoy = today();
    egresos.forEach((e) => {
      const moneda = e.moneda || "MXN";
      const saldo = saldoOf(e);
      if (saldo > 0) totalActivo[moneda] += saldo;
      payments.filter((p) => p.invoiceId === e.id && p.tipo === "programado" && p.fechaPago > hoy)
        .forEach((p) => (programado[moneda] += +p.monto || 0));
      payments.filter((p) => p.invoiceId === e.id && p.tipo === "realizado" && p.fechaPago >= inicioMes)
        .forEach((p) => (pagadoMes[moneda] += +p.monto || 0));
    });
    return { totalActivo, programado, pagadoMes, total: egresos.length };
  }, [egresos, payments]);

  // Distribución por Clasificación
  const distribClasif = useMemo(() => {
    const map = {};
    egresos.forEach((e) => {
      const clasif = e.categoriaEgreso || e.clasificacion || "Sin clasificar";
      const moneda = e.moneda || "MXN";
      if (moneda !== currency) return;
      const total = +e.total || 0;
      map[clasif] = (map[clasif] || 0) + total;
    });
    const arr = Object.entries(map).map(([clasif, monto]) => ({ clasif, monto })).sort((a, b) => b.monto - a.monto);
    const total = arr.reduce((s, x) => s + x.monto, 0);
    return arr.map((x) => ({ ...x, pct: total > 0 ? (x.monto / total) * 100 : 0 }));
  }, [egresos, currency]);

  // Filtrar (búsqueda)
  const filtrados = useMemo(() => {
    let result = egresos.filter((e) => (e.moneda || "MXN") === currency);
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim();
      result = result.filter((e) => {
        const concepto = (e.concepto || "").toLowerCase();
        const proveedor = (e.proveedor || "").toLowerCase();
        const segmento = (e.segmentoEgreso || "").toLowerCase();
        const folio = (e.folio || "").toLowerCase();
        const notas = (e.notas || "").toLowerCase();
        const clasif = (e.categoriaEgreso || e.clasificacion || "").toLowerCase();
        const total = String(e.total || "");
        return concepto.includes(q) || proveedor.includes(q) || segmento.includes(q) ||
          folio.includes(q) || notas.includes(q) || clasif.includes(q) || total.includes(q);
      });
    }
    return result;
  }, [egresos, busqueda, currency]);

  // Agrupar por mes → día
  const grupos = useMemo(() => {
    const meses = new Map();
    filtrados.forEach((e) => {
      const fecha = e.fecha || "";
      if (!fecha) return;
      const mesKey = fecha.slice(0, 7);
      const diaKey = fecha;
      if (!meses.has(mesKey)) meses.set(mesKey, { total: 0, count: 0, dias: new Map() });
      const m = meses.get(mesKey);
      m.total += (+e.total || 0);
      m.count += 1;
      if (!m.dias.has(diaKey)) m.dias.set(diaKey, { total: 0, count: 0, items: [] });
      const d = m.dias.get(diaKey);
      d.total += (+e.total || 0);
      d.count += 1;
      d.items.push(e);
    });
    const sinFecha = filtrados.filter(e => !e.fecha);
    if (sinFecha.length > 0) {
      meses.set("__SIN_FECHA__", {
        total: sinFecha.reduce((s, e) => s + (+e.total || 0), 0),
        count: sinFecha.length,
        dias: new Map([["__SIN_FECHA__", { total: sinFecha.reduce((s, e) => s + (+e.total || 0), 0), count: sinFecha.length, items: sinFecha }]]),
      });
    }
    const arr = Array.from(meses.entries()).map(([mesKey, data]) => ({
      mesKey, total: data.total, count: data.count,
      dias: Array.from(data.dias.entries())
        .map(([diaKey, d]) => ({ diaKey, ...d, items: d.items.sort((a, b) => (a.folio || "").localeCompare(b.folio || "")) }))
        .sort((a, b) => {
          if (a.diaKey === "__SIN_FECHA__") return 1;
          if (b.diaKey === "__SIN_FECHA__") return -1;
          return b.diaKey.localeCompare(a.diaKey);
        }),
    })).sort((a, b) => {
      if (a.mesKey === "__SIN_FECHA__") return 1;
      if (b.mesKey === "__SIN_FECHA__") return -1;
      return b.mesKey.localeCompare(a.mesKey);
    });
    return arr;
  }, [filtrados]);

  // Auto-expandir mes y día actual al inicializar
  useEffect(() => {
    const hoy = today();
    const mesHoy = hoy.slice(0, 7);
    setExpandedMonths(prev => {
      if (prev.size > 0) return prev;
      const iniciales = new Set();
      if (grupos.length > 0) iniciales.add(grupos[0].mesKey);
      if (grupos.find(g => g.mesKey === mesHoy)) iniciales.add(mesHoy);
      return iniciales;
    });
    setExpandedDays(prev => {
      if (prev.size > 0) return prev;
      const iniciales = new Set();
      if (grupos.length > 0 && grupos[0].dias.length > 0) iniciales.add(grupos[0].dias[0].diaKey);
      if (grupos.find(g => g.mesKey === mesHoy)) iniciales.add(hoy);
      return iniciales;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupos.length]);

  const toggleMonth = (key) => setExpandedMonths(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const toggleDay = (key) => setExpandedDays(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const expandirTodo = () => {
    setExpandedMonths(new Set(grupos.map(g => g.mesKey)));
    setExpandedDays(new Set(grupos.flatMap(g => g.dias.map(d => d.diaKey))));
  };
  const colapsarTodo = () => { setExpandedMonths(new Set()); setExpandedDays(new Set()); };

  const toggleSelect = (id) => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleSelectAllVisible = () => {
    setSelectedIds(prev => {
      const idsVisibles = new Set(filtrados.map(e => e.id));
      const todosSel = [...idsVisibles].every(id => prev.has(id));
      const next = new Set(prev);
      if (todosSel) idsVisibles.forEach(id => next.delete(id));
      else idsVisibles.forEach(id => next.add(id));
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const seleccionadosArr = useMemo(() => filtrados.filter(e => selectedIds.has(e.id)), [filtrados, selectedIds]);

  const abrirPagoMasivo = () => {
    if (selectedIds.size === 0) return;
    const pendientes = seleccionadosArr.filter(e => saldoOf(e) > 0);
    const yaPagados = seleccionadosArr.length - pendientes.length;
    if (pendientes.length === 0) {
      alert("Todos los NF seleccionados ya están pagados completamente. No hay nada que aplicar.");
      return;
    }
    setPagoMasivoModal({ egresos: pendientes, yaPagados, fecha: today(), metodo: "banco", notas: "" });
  };

  const ejecutarPagoMasivo = async () => {
    if (!pagoMasivoModal) return;
    if (onAplicarPagosMasivos) {
      await onAplicarPagosMasivos(pagoMasivoModal.egresos, pagoMasivoModal.fecha, pagoMasivoModal.metodo, pagoMasivoModal.notas || "");
    }
    setPagoMasivoModal(null);
    clearSelection();
  };

  const colorClasif = ["#C62828", "#AD1457", "#6A1B9A", "#4527A0", "#283593", "#1565C0", "#00838F", "#2E7D32", "#558B2F", "#9E9D24", "#EF6C00", "#D84315"];
  const estadoMeta = {
    Pagado: { bg: "#E8F5E9", color: "#1B5E20", icon: "✅" },
    Pendiente: { bg: "#FFF8E1", color: "#E65100", icon: "📅" },
    Parcial: { bg: "#E3F2FD", color: "#1565C0", icon: "🔵" },
    Vencido: { bg: "#FFEBEE", color: "#C62828", icon: "⚠️" },
  };
  const inputStyle = { width: "100%", padding: "8px 12px", border: "1px solid #E5E7EB", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const btnPrimary = { background: "#C62828", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
  const btnSecondary = { background: "#1976D2", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };

  const nombreMes = (mesKey) => {
    if (mesKey === "__SIN_FECHA__") return "Sin fecha";
    const [yyyy, mm] = mesKey.split("-");
    return `${MESES_ES[+mm - 1]} ${yyyy}`;
  };
  const nombreDia = (diaKey) => {
    if (diaKey === "__SIN_FECHA__") return "Sin fecha";
    const [yyyy, mm, dd] = diaKey.split("-");
    const fecha = new Date(+yyyy, +mm - 1, +dd);
    const diasSem = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
    return `${diasSem[fecha.getDay()]} ${+dd} de ${MESES_ES[+mm - 1].toLowerCase()}`;
  };

  const totalSeleccionadosPendiente = seleccionadosArr.reduce((s, e) => s + saldoOf(e), 0);

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget && !pagoMasivoModal) onClose && onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div style={{ background: "#fff", borderRadius: 14, width: "97%", maxWidth: 1600, maxHeight: "94vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FFF8F8" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#C62828" }}>💵 Otros Pagos</h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6B7280" }}>Pagos como nómina, comisiones, impuestos, etc. que no tienen factura formal</p>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 22, cursor: "pointer", color: "#6B7280", padding: 4 }} title="Cerrar">×</button>
        </div>

        <div style={{ overflow: "auto", padding: 18, flex: 1, background: "#FAFBFC" }}>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 18 }}>
            <div style={{ background: "#fff", border: "1px solid #FFCDD2", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#C62828", letterSpacing: 0.5 }}>📊 TOTAL ACTIVO {currency}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#C62828", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{monedaSym(currency)}{fmt(kpis.totalActivo[currency])}</div>
              <div style={{ fontSize: 10, color: "#9E9E9E", marginTop: 2 }}>Saldo pendiente de pagar</div>
            </div>
            <div style={{ background: "#fff", border: "1px solid #A5D6A7", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#1B5E20", letterSpacing: 0.5 }}>💰 PAGADO ESTE MES</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#1B5E20", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{monedaSym(currency)}{fmt(kpis.pagadoMes[currency])}</div>
              <div style={{ fontSize: 10, color: "#9E9E9E", marginTop: 2 }}>Pagos realizados este mes</div>
            </div>
            <div style={{ background: "#fff", border: "1px solid #FFE082", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#F57F17", letterSpacing: 0.5 }}>📅 PROGRAMADO A FUTURO</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#F57F17", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{monedaSym(currency)}{fmt(kpis.programado[currency])}</div>
              <div style={{ fontSize: 10, color: "#9E9E9E", marginTop: 2 }}>Pagos programados pendientes</div>
            </div>
            <div style={{ background: "#fff", border: "1px solid #B0BEC5", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#37474F", letterSpacing: 0.5 }}>📈 TOTAL REGISTROS</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#37474F", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{kpis.total}</div>
              <div style={{ fontSize: 10, color: "#9E9E9E", marginTop: 2 }}>Otros pagos totales</div>
            </div>
          </div>

          {distribClasif.length > 0 && (
            <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: 14, marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1A237E", marginBottom: 10, letterSpacing: 0.3 }}>📊 DISTRIBUCIÓN POR CLASIFICACIÓN ({currency})</div>
              <div style={{ display: "grid", gap: 6 }}>
                {distribClasif.slice(0, 8).map((d, i) => (
                  <div key={d.clasif} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11 }}>
                    <div style={{ minWidth: 140, fontWeight: 600, color: "#374151" }}>{d.clasif}</div>
                    <div style={{ flex: 1, background: "#F3F4F6", borderRadius: 4, height: 18, position: "relative", overflow: "hidden" }}>
                      <div style={{ background: colorClasif[i % colorClasif.length], height: "100%", width: `${d.pct}%`, borderRadius: 4 }}/>
                    </div>
                    <div style={{ minWidth: 120, textAlign: "right", fontWeight: 700, color: colorClasif[i % colorClasif.length], fontVariantNumeric: "tabular-nums" }}>{monedaSym(currency)}{fmt(d.monto)}</div>
                    <div style={{ minWidth: 50, textAlign: "right", color: "#9E9E9E", fontSize: 10 }}>{d.pct.toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Toolbar acciones + búsqueda */}
          <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={onNuevo} style={btnPrimary}>+ Nuevo Otro Pago</button>
            <button onClick={onImportar} style={btnSecondary}>📥 Importar Excel</button>
            <div style={{ flex: 1, minWidth: 200 }}>
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="🔍 Buscar por concepto, folio, segmento, notas, monto..." style={inputStyle}/>
            </div>
            <button onClick={expandirTodo} style={{background:'transparent',border:'1px solid #1976D2',color:'#1976D2',padding:'6px 12px',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>▾ Expandir todo</button>
            <button onClick={colapsarTodo} style={{background:'transparent',border:'1px solid #6B7280',color:'#6B7280',padding:'6px 12px',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>▸ Colapsar todo</button>
            <div style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>{filtrados.length} de {egresos.filter(e => (e.moneda || "MXN") === currency).length} {currency}</div>
          </div>

          {/* Toolbar amarilla */}
          {selectedIds.size > 0 && (
            <div style={{background:'#FFF8E1',border:'1px solid #FFE082',borderRadius:8,padding:'10px 14px',marginBottom:12,display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
              <div style={{fontSize:13,fontWeight:800,color:'#E65100',whiteSpace:'nowrap'}}>☑️ {selectedIds.size} seleccionado{selectedIds.size === 1 ? '' : 's'}</div>
              <div style={{fontSize:12,color:'#E65100'}}>Pendiente total: <b>{monedaSym(currency)}{fmt(totalSeleccionadosPendiente)}</b></div>
              <div style={{flex:1}}/>
              <button onClick={abrirPagoMasivo} style={{background:'#2E7D32',color:'#fff',border:'none',padding:'7px 16px',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>💰 Aplicar pagos masivos</button>
              <button onClick={clearSelection} style={{background:'transparent',border:'none',color:'#1976D2',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'inherit'}}>Limpiar selección</button>
            </div>
          )}

          {/* Tabla con grupos colapsables */}
          {filtrados.length === 0 ? (
            <div style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:10,padding:'40px 20px',textAlign:'center'}}>
              <div style={{fontSize:13,color:'#9CA3AF'}}>{busqueda ? `No se encontraron egresos NF que coincidan con "${busqueda}"` : "No hay egresos no facturados registrados aún"}</div>
              <div style={{marginTop:14}}><button onClick={onNuevo} style={{...btnPrimary, fontSize:12}}>+ Crear el primer Otro Pago</button></div>
            </div>
          ) : (
            <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
              {/* Header sticky */}
              <div style={{display:'grid',gridTemplateColumns:'40px 100px 90px 1fr 130px 110px 130px 110px 110px',background:'#F8FAFC',borderBottom:'2px solid #E5E7EB',fontSize:11,fontWeight:700,color:'#1A237E',textTransform:'uppercase',padding:'8px 0'}}>
                <div style={{textAlign:'center'}}>
                  <input type="checkbox"
                    checked={filtrados.length > 0 && filtrados.every(e => selectedIds.has(e.id))}
                    ref={el => { if (el) el.indeterminate = filtrados.some(e => selectedIds.has(e.id)) && !filtrados.every(e => selectedIds.has(e.id)); }}
                    onChange={toggleSelectAllVisible} style={{cursor:'pointer'}} title="Seleccionar todos los visibles"/>
                </div>
                <div style={{padding:'0 8px'}}>Fecha</div>
                <div style={{padding:'0 8px'}}>Folio</div>
                <div style={{padding:'0 8px'}}>Concepto</div>
                <div style={{padding:'0 8px'}}>Clasificación</div>
                <div style={{padding:'0 8px'}}>Segmento</div>
                <div style={{padding:'0 8px',textAlign:'right'}}>Monto</div>
                <div style={{padding:'0 8px',textAlign:'center'}}>Estado</div>
                <div style={{padding:'0 8px',textAlign:'center'}}>Acciones</div>
              </div>

              {grupos.map(g => {
                const mesAbierto = expandedMonths.has(g.mesKey);
                return (
                  <div key={g.mesKey}>
                    <div onClick={() => toggleMonth(g.mesKey)}
                      style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'#1A237E',color:'#fff',cursor:'pointer',userSelect:'none'}}>
                      <span style={{fontSize:11,opacity:0.7,width:14}}>{mesAbierto ? '▾' : '▸'}</span>
                      <span style={{fontSize:13,fontWeight:800,letterSpacing:0.4,textTransform:'uppercase'}}>📅 {nombreMes(g.mesKey)}</span>
                      <span style={{flex:1}}/>
                      <span style={{fontSize:11,opacity:0.85}}>{g.count} {g.count === 1 ? 'NF' : 'NFs'}</span>
                      <span style={{fontSize:13,fontWeight:700,fontVariantNumeric:'tabular-nums',background:'rgba(255,255,255,0.15)',padding:'3px 10px',borderRadius:8}}>{monedaSym(currency)}{fmt(g.total)}</span>
                    </div>
                    {mesAbierto && g.dias.map(d => {
                      const diaAbierto = expandedDays.has(d.diaKey);
                      return (
                        <div key={d.diaKey}>
                          <div onClick={() => toggleDay(d.diaKey)}
                            style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px 8px 32px',background:'#E8EAF6',color:'#1A237E',cursor:'pointer',userSelect:'none',borderTop:'1px solid #C5CAE9'}}>
                            <span style={{fontSize:10,opacity:0.7,width:12}}>{diaAbierto ? '▾' : '▸'}</span>
                            <span style={{fontSize:12,fontWeight:700}}>{nombreDia(d.diaKey)}</span>
                            <span style={{flex:1}}/>
                            <span style={{fontSize:10,opacity:0.85}}>{d.count} {d.count === 1 ? 'NF' : 'NFs'}</span>
                            <span style={{fontSize:12,fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{monedaSym(currency)}{fmt(d.total)}</span>
                          </div>
                          {diaAbierto && d.items.map((e, idx) => {
                            const meta = estadoMeta[e.estatus] || { bg: "#F5F5F5", color: "#666", icon: "•" };
                            const moneda = e.moneda || "MXN";
                            const isSelected = selectedIds.has(e.id);
                            return (
                              <div key={e.id} style={{display:'grid',gridTemplateColumns:'40px 100px 90px 1fr 130px 110px 130px 110px 110px',fontSize:12,borderTop:'1px solid #F3F4F6',background: isSelected ? '#FFFDE7' : (idx % 2 === 0 ? '#fff' : '#FAFBFC'),alignItems:'center',padding:'8px 0'}}>
                                <div style={{textAlign:'center'}}>
                                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(e.id)} style={{cursor:'pointer'}}/>
                                </div>
                                <div style={{padding:'0 8px',color:'#374151',whiteSpace:'nowrap'}}>{e.fecha || '—'}</div>
                                <div style={{padding:'0 8px',fontFamily:'monospace',fontWeight:700,color:'#C62828',fontSize:11}}>{e.folio}</div>
                                <div style={{padding:'0 8px'}}>
                                  <div style={{fontWeight:600,color:'#1F2937'}}>{e.concepto || e.proveedor || "—"}</div>
                                  {e.notas && <div style={{fontSize:10,color:'#9CA3AF',marginTop:2}}>{e.notas}</div>}
                                </div>
                                <div style={{padding:'0 8px'}}>
                                  {e.categoriaEgreso || e.clasificacion ? (
                                    <span style={{background:'#FCE4EC',color:'#AD1457',padding:'2px 8px',borderRadius:12,fontSize:10,fontWeight:700}}>{e.categoriaEgreso || e.clasificacion}</span>
                                  ) : <span style={{color:'#D1D5DB'}}>—</span>}
                                </div>
                                <div style={{padding:'0 8px',color:'#6B7280'}}>{e.segmentoEgreso || <span style={{color:'#D1D5DB'}}>—</span>}</div>
                                <div style={{padding:'0 8px',textAlign:'right',fontWeight:800,color:'#C62828',fontFamily:'monospace',fontVariantNumeric:'tabular-nums'}}>
                                  {monedaSym(moneda)}{fmt(e.total)}
                                  {(+e.montoPagado || 0) > 0 && (+e.montoPagado || 0) < (+e.total || 0) && (
                                    <div style={{fontSize:10,color:'#1565C0',fontWeight:600,marginTop:2}}>Pag: {monedaSym(moneda)}{fmt(e.montoPagado)}</div>
                                  )}
                                </div>
                                <div style={{padding:'0 8px',textAlign:'center'}}>
                                  <span style={{background:meta.bg,color:meta.color,padding:'3px 10px',borderRadius:12,fontSize:11,fontWeight:700,whiteSpace:'nowrap'}}>{meta.icon} {e.estatus}</span>
                                </div>
                                <div style={{padding:'0 8px',textAlign:'center',whiteSpace:'nowrap'}}>
                                  <button onClick={() => onEditar && onEditar(e)} title="Editar" style={{background:'none',border:'none',cursor:'pointer',fontSize:14,padding:4,color:'#1976D2'}}>✏️</button>
                                  <button onClick={() => onPagos && onPagos(e)} title="Aplicar pagos" style={{background:'none',border:'none',cursor:'pointer',fontSize:14,padding:4,color:'#2E7D32'}}>💰</button>
                                  <button onClick={() => onEliminar && onEliminar(e)} title="Eliminar" style={{background:'none',border:'none',cursor:'pointer',fontSize:14,padding:4,color:'#C62828'}}>🗑️</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              <div style={{background:'#FFEBEE',borderTop:'2px solid #C62828',padding:'10px 14px',display:'flex',alignItems:'center',gap:12}}>
                <span style={{fontWeight:700,color:'#C62828',fontSize:13}}>TOTAL GENERAL ({filtrados.length} {filtrados.length === 1 ? 'registro' : 'registros'})</span>
                <span style={{flex:1}}/>
                <span style={{fontWeight:800,color:'#C62828',fontFamily:'monospace',fontVariantNumeric:'tabular-nums',fontSize:14}}>{monedaSym(currency)}{fmt(filtrados.reduce((s, e) => s + (+e.total || 0), 0))}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SUB-MODAL: Aplicar pagos masivos */}
      {pagoMasivoModal && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setPagoMasivoModal(null); }}
          style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:10001,display:'flex',alignItems:'center',justifyContent:'center',padding:14}}>
          <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:520,maxHeight:'90vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.4)'}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid #E5E7EB',display:'flex',justifyContent:'space-between',alignItems:'center',background:'#E8F5E9'}}>
              <h3 style={{margin:0,fontSize:16,fontWeight:800,color:'#1B5E20'}}>💰 Aplicar pagos masivos</h3>
              <button onClick={() => setPagoMasivoModal(null)} style={{background:'transparent',border:'none',fontSize:20,cursor:'pointer',color:'#666'}}>×</button>
            </div>
            <div style={{padding:20}}>
              {pagoMasivoModal.yaPagados > 0 && (
                <div style={{background:'#FFF3E0',border:'1px solid #FFB74D',borderRadius:8,padding:'8px 12px',marginBottom:14,fontSize:12,color:'#E65100'}}>
                  ⚠️ {pagoMasivoModal.yaPagados} NF de tu selección ya {pagoMasivoModal.yaPagados === 1 ? 'está pagado completamente' : 'están pagados completamente'} y se {pagoMasivoModal.yaPagados === 1 ? 'omitirá' : 'omitirán'}.
                </div>
              )}
              <div style={{background:'#F0F9FF',border:'1px solid #BBDEFB',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:13,color:'#0D47A1'}}>
                Se aplicarán pagos a <b>{pagoMasivoModal.egresos.length}</b> NF · Total a pagar: <b>{monedaSym(currency)}{fmt(pagoMasivoModal.egresos.reduce((s,e) => s + saldoOf(e), 0))}</b>
                <div style={{fontSize:11,marginTop:4,opacity:0.85}}>Cada NF se aplica por su monto pendiente individual.</div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:'#374151',display:'block',marginBottom:4,letterSpacing:0.3,textTransform:'uppercase'}}>Fecha de pago</label>
                  <input type="date" value={pagoMasivoModal.fecha} onChange={(e) => setPagoMasivoModal({...pagoMasivoModal, fecha: e.target.value})} style={inputStyle}/>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:'#374151',display:'block',marginBottom:4,letterSpacing:0.3,textTransform:'uppercase'}}>Método</label>
                  <select value={pagoMasivoModal.metodo} onChange={(e) => setPagoMasivoModal({...pagoMasivoModal, metodo: e.target.value})} style={inputStyle}>
                    <option value="banco">🏦 Banco (sale del saldo)</option>
                    <option value="tdc">💳 Tarjeta de Crédito</option>
                    <option value="otro">➕ Otro</option>
                  </select>
                </div>
              </div>
              <div style={{marginBottom:16}}>
                <label style={{fontSize:11,fontWeight:700,color:'#374151',display:'block',marginBottom:4,letterSpacing:0.3,textTransform:'uppercase'}}>Notas (opcional)</label>
                <input type="text" value={pagoMasivoModal.notas} onChange={(e) => setPagoMasivoModal({...pagoMasivoModal, notas: e.target.value})} placeholder="Ej: Pago masivo nómina mayo" style={inputStyle}/>
              </div>

              <div style={{maxHeight:180,overflow:'auto',border:'1px solid #E5E7EB',borderRadius:8,marginBottom:16}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                  <thead>
                    <tr style={{background:'#F8FAFC',position:'sticky',top:0}}>
                      <th style={{padding:'6px 10px',textAlign:'left',color:'#1A237E',fontWeight:700}}>Folio</th>
                      <th style={{padding:'6px 10px',textAlign:'left',color:'#1A237E',fontWeight:700}}>Concepto</th>
                      <th style={{padding:'6px 10px',textAlign:'right',color:'#1A237E',fontWeight:700}}>Pendiente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagoMasivoModal.egresos.map(e => (
                      <tr key={e.id} style={{borderBottom:'1px solid #F3F4F6'}}>
                        <td style={{padding:'5px 10px',fontFamily:'monospace',color:'#C62828',fontWeight:700}}>{e.folio}</td>
                        <td style={{padding:'5px 10px'}}>{e.concepto || e.proveedor}</td>
                        <td style={{padding:'5px 10px',textAlign:'right',fontFamily:'monospace',fontWeight:700,color:'#C62828'}}>{monedaSym(e.moneda || currency)}{fmt(saldoOf(e))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                <button onClick={() => setPagoMasivoModal(null)} style={{background:'#F1F5F9',color:'#374151',border:'none',padding:'10px 20px',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Cancelar</button>
                <button onClick={ejecutarPagoMasivo} style={{background:'#2E7D32',color:'#fff',border:'none',padding:'10px 20px',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>💾 Aplicar {pagoMasivoModal.egresos.length} pago{pagoMasivoModal.egresos.length === 1 ? '' : 's'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
