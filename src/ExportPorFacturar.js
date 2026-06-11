// src/ExportPorFacturar.js
// Generador de Excel profesional (con estilos reales) para enviar a clientes
// la relación de servicios pendientes de facturación.
//
// Implementado con ExcelJS porque SheetJS Community no aplica estilos al
// guardar XLSX. ExcelJS sí los aplica y permite control total: colores,
// bordes, merges, freeze, anchos de columna, formatos numéricos.

// ─── Paleta corporativa (TravelAirSolutions) ──────────────────────
const COLOR_MORADO    = "FF6A1B9A";
const COLOR_MORADO_2  = "FF8E24AA";
const COLOR_LAVANDA   = "FFF3E5F5";
const COLOR_LAVANDA_2 = "FFEDE7F6";
const COLOR_GRISCLARO = "FFFAFAFA";
const COLOR_BLANCO    = "FFFFFFFF";
const COLOR_TEXTO     = "FF212121";
const COLOR_MUTED     = "FF757575";
const COLOR_LAVANDA_TXT = "FFE1BEE7";
const COLOR_BORDE     = "FFBDBDBD";
const COLOR_BORDE_FUERTE = "FF424242";

const FONT = "Calibri";
const fmtMoney = '"$"#,##0.00';
const fmtFecha = "dd/mm/yyyy";

const EMPRESA_NOMBRE = "TravelAirSolutions";

// ─── Helpers ──────────────────────────────────────────────────────
const fechaCorta = (d=new Date()) => {
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  return `${dd}/${mm}/${d.getFullYear()}`;
};
const fechaISO = (d=new Date()) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
};
const parseISO = (s) => {
  if (!s) return null;
  const [y,m,d] = String(s).split("-").map(Number);
  if (!y||!m||!d) return null;
  return new Date(Date.UTC(y, m-1, d));
};
const sanitizeFile = (s) => String(s||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-zA-Z0-9_\-]/g,"_")
  .replace(/_+/g,"_")
  .replace(/^_|_$/g,"");
const sanitizeSheet = (s) => {
  let n = String(s||"Cliente").replace(/[\[\]:*?/\\]/g, "");
  if (n.length > 31) n = n.slice(0,28) + "...";
  return n || "Cliente";
};

// ─── Estilos reutilizables (ExcelJS) ──────────────────────────────
const borde = (color=COLOR_BORDE) => ({ style: "thin", color: { argb: color } });
const bordeFuerte = () => borde(COLOR_BORDE_FUERTE);

const styleBandaTit = () => ({
  font: { name: FONT, size: 16, bold: true, color: { argb: COLOR_BLANCO } },
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_MORADO } },
  alignment: { vertical: "middle", horizontal: "left", indent: 1 },
  border: { top: bordeFuerte(), bottom: bordeFuerte(), left: bordeFuerte(), right: bordeFuerte() },
});
const styleBandaDer = () => ({
  font: { name: FONT, size: 11, color: { argb: COLOR_LAVANDA_TXT } },
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_MORADO } },
  alignment: { vertical: "middle", horizontal: "right", indent: 1 },
  border: { top: bordeFuerte(), bottom: bordeFuerte(), left: bordeFuerte(), right: bordeFuerte() },
});
const styleSubtitulo = () => ({
  font: { name: FONT, size: 11, italic: true, color: { argb: COLOR_MUTED } },
  alignment: { vertical: "middle", horizontal: "left", indent: 1 },
});
const styleLabel = () => ({
  font: { name: FONT, size: 10, bold: true, color: { argb: COLOR_MORADO } },
  alignment: { vertical: "middle", horizontal: "right" },
});
const styleValor = (opts={}) => ({
  font: { name: FONT, size: opts.size||11, bold: !!opts.bold, color: { argb: opts.color || COLOR_TEXTO } },
  alignment: { vertical: "middle", horizontal: "left", indent: 1 },
});
const styleMensaje = () => ({
  font: { name: FONT, size: 10, color: { argb: COLOR_TEXTO } },
  alignment: { vertical: "middle", horizontal: "left", indent: 1, wrapText: true },
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_LAVANDA } },
  border: { top: borde(), bottom: borde(), left: borde(), right: borde() },
});
const styleSeccionMon = () => ({
  font: { name: FONT, size: 11, bold: true, color: { argb: COLOR_BLANCO } },
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_MORADO_2 } },
  alignment: { vertical: "middle", horizontal: "left", indent: 1 },
});
const styleTablaHeader = (align="left") => ({
  font: { name: FONT, size: 10, bold: true, color: { argb: COLOR_BLANCO } },
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_MORADO } },
  alignment: { vertical: "middle", horizontal: align },
  border: { top: bordeFuerte(), bottom: bordeFuerte(), left: borde(), right: borde() },
});
const styleTablaDato = ({align="left", par=false, bold=false, importe=false}={}) => ({
  font: { name: FONT, size: 10, bold, color: { argb: importe ? COLOR_MORADO : COLOR_TEXTO } },
  alignment: { vertical: "middle", horizontal: align, indent: align==="left"?1:0 },
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: par ? COLOR_GRISCLARO : COLOR_BLANCO } },
  border: { top: borde(), bottom: borde(), left: borde(), right: borde() },
});
const styleTotal = (align="right") => ({
  font: { name: FONT, size: 11, bold: true, color: { argb: COLOR_MORADO } },
  alignment: { vertical: "middle", horizontal: align, indent: align==="left"?1:0 },
  fill: { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_LAVANDA_2 } },
  border: { top: bordeFuerte(), bottom: bordeFuerte(), left: borde(), right: borde() },
});
const stylePie = () => ({
  font: { name: FONT, size: 9, italic: true, color: { argb: COLOR_MUTED } },
  alignment: { vertical: "middle", horizontal: "left", indent: 1 },
});

// Aplica un estilo a un rango "A1:F1"
function aplicar(ws, rango, estilo) {
  const [from, to] = rango.split(":");
  const fc = ws.getCell(from);
  const tc = to ? ws.getCell(to) : fc;
  for (let r = fc.row; r <= tc.row; r++) {
    for (let c = fc.col; c <= tc.col; c++) {
      const cell = ws.getCell(r, c);
      if (estilo.font) cell.font = { ...(cell.font||{}), ...estilo.font };
      if (estilo.fill) cell.fill = estilo.fill;
      if (estilo.alignment) cell.alignment = estilo.alignment;
      if (estilo.border) cell.border = estilo.border;
    }
  }
}

// ─── Hoja para UN cliente ─────────────────────────────────────────
function escribirHojaCliente(ws, clienteNombre, regs, clienteInfo, fechaReporte) {
  ws.columns = [
    { width: 6  }, // A
    { width: 22 }, // B
    { width: 10 }, // C
    { width: 18 }, // D
    { width: 13 }, // E
    { width: 20 }, // F
  ];

  let r = 1;

  // Banda título
  ws.mergeCells(`A${r}:E${r}`);
  ws.getCell(`A${r}`).value = EMPRESA_NOMBRE;
  ws.getCell(`F${r}`).value = `Reporte: ${fechaReporte}`;
  aplicar(ws, `A${r}:E${r}`, styleBandaTit());
  aplicar(ws, `F${r}:F${r}`, styleBandaDer());
  ws.getRow(r).height = 28;
  r++;

  // Subtítulo
  ws.mergeCells(`A${r}:F${r}`);
  ws.getCell(`A${r}`).value = "Relación de servicios pendientes de facturación";
  aplicar(ws, `A${r}:F${r}`, styleSubtitulo());
  ws.getRow(r).height = 18;
  r++;

  // Espaciador
  r++;

  // Bloque cliente: una sola celda mergeada A:F (resuelve el corte de
  // "Cliente:" en la columna A que es estrecha para la tabla)
  ws.mergeCells(`A${r}:F${r}`);
  ws.getCell(`A${r}`).value = `Cliente:  ${clienteNombre}`;
  aplicar(ws, `A${r}:F${r}`, {
    font: { name: FONT, size: 13, bold: true, color: { argb: COLOR_MORADO } },
    alignment: { vertical: "middle", horizontal: "left", indent: 1 },
  });
  ws.getRow(r).height = 22;
  r++;

  // Espaciador
  r++;

  // Mensaje
  ws.mergeCells(`A${r}:F${r}`);
  ws.getCell(`A${r}`).value = "Estimado cliente, le compartimos los servicios pendientes de facturación. Solicitamos confirmar para emitir las facturas correspondientes.";
  aplicar(ws, `A${r}:F${r}`, styleMensaje());
  ws.getRow(r).height = 32;
  r++;

  // Espaciador
  r++;

  // Separar por moneda
  const porMon = {};
  regs.forEach(x => {
    const m = x.moneda || "MXN";
    if (!porMon[m]) porMon[m] = [];
    porMon[m].push(x);
  });
  const ordenMon = ["MXN", "USD", "EUR"];
  const monedas = Object.keys(porMon).sort((a, b) => {
    const ia = ordenMon.indexOf(a); const ib = ordenMon.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  monedas.forEach(mon => {
    // Orden por # OS descendente. Numeric-aware: si los OS son números puros
    // los ordena numéricamente; si tienen letras, usa localeCompare con {numeric:true}.
    const filas = [...porMon[mon]].sort((a, b) => {
      const na = parseFloat(a.numOs);
      const nb = parseFloat(b.numOs);
      if (!isNaN(na) && !isNaN(nb)) return nb - na;
      return String(b.numOs || "").localeCompare(String(a.numOs || ""), "es", { numeric: true });
    });
    const subtotal = filas.reduce((s, x) => s + (+x.importe || 0), 0);

    // Header moneda
    ws.mergeCells(`A${r}:F${r}`);
    ws.getCell(`A${r}`).value = `Moneda: ${mon}  ·  ${filas.length} ${filas.length === 1 ? "registro" : "registros"}`;
    aplicar(ws, `A${r}:F${r}`, styleSeccionMon());
    ws.getRow(r).height = 22;
    r++;

    // Header tabla
    ws.getCell(`A${r}`).value = "#";
    ws.getCell(`B${r}`).value = "Concepto";
    ws.getCell(`C${r}`).value = "# OS";
    ws.getCell(`D${r}`).value = "Destino";
    ws.getCell(`E${r}`).value = "Fecha";
    ws.getCell(`F${r}`).value = "Importe";
    aplicar(ws, `A${r}:A${r}`, styleTablaHeader("center"));
    aplicar(ws, `B${r}:B${r}`, styleTablaHeader("left"));
    aplicar(ws, `C${r}:C${r}`, styleTablaHeader("center"));
    aplicar(ws, `D${r}:D${r}`, styleTablaHeader("left"));
    aplicar(ws, `E${r}:E${r}`, styleTablaHeader("center"));
    aplicar(ws, `F${r}:F${r}`, styleTablaHeader("right"));
    ws.getRow(r).height = 20;
    r++;

    // Filas
    filas.forEach((it, idx) => {
      const par = idx % 2 === 0;
      ws.getCell(`A${r}`).value = idx + 1;
      ws.getCell(`B${r}`).value = it.concepto || "—";
      ws.getCell(`C${r}`).value = it.numOs || "—";
      ws.getCell(`D${r}`).value = it.destino || "—";
      const fecha = parseISO(it.fechaVenta);
      const cellFecha = ws.getCell(`E${r}`);
      if (fecha) { cellFecha.value = fecha; cellFecha.numFmt = fmtFecha; }
      else cellFecha.value = it.fechaVenta || "—";

      const cellImp = ws.getCell(`F${r}`);
      cellImp.value = +it.importe || 0;
      cellImp.numFmt = fmtMoney;

      aplicar(ws, `A${r}:A${r}`, styleTablaDato({align:"center", par}));
      aplicar(ws, `B${r}:B${r}`, styleTablaDato({align:"left",   par}));
      aplicar(ws, `C${r}:C${r}`, styleTablaDato({align:"center", par}));
      aplicar(ws, `D${r}:D${r}`, styleTablaDato({align:"left",   par}));
      aplicar(ws, `E${r}:E${r}`, styleTablaDato({align:"center", par}));
      aplicar(ws, `F${r}:F${r}`, styleTablaDato({align:"right",  par, bold:true, importe:true}));
      r++;
    });

    // Subtotal
    ws.getCell(`E${r}`).value = `Subtotal ${mon}:`;
    const cellSub = ws.getCell(`F${r}`);
    cellSub.value = subtotal;
    cellSub.numFmt = fmtMoney;
    aplicar(ws, `A${r}:D${r}`, styleTotal("left"));
    aplicar(ws, `E${r}:E${r}`, styleTotal("right"));
    aplicar(ws, `F${r}:F${r}`, styleTotal("right"));
    ws.getRow(r).height = 22;
    r++;

    // Espaciador
    r++;
  });

  // Espaciador extra
  r++;

  // Pie
  ws.mergeCells(`A${r}:F${r}`);
  ws.getCell(`A${r}`).value = `Atentamente, ${EMPRESA_NOMBRE}`;
  aplicar(ws, `A${r}:F${r}`, stylePie());
  r++;
  ws.mergeCells(`A${r}:F${r}`);
  ws.getCell(`A${r}`).value = `Documento generado el ${fechaReporte}`;
  aplicar(ws, `A${r}:F${r}`, stylePie());

  // Freeze de cabezera
  ws.views = [{ state: "frozen", ySplit: 3, showGridLines: false }];
}

// ─── Hoja "Resumen" para consolidado ──────────────────────────────
function escribirHojaResumen(ws, porCliente, fechaReporte) {
  ws.columns = [
    { width: 36 },
    { width: 14 },
    { width: 18 },
    { width: 20 },
  ];
  let r = 1;

  ws.mergeCells(`A${r}:C${r}`);
  ws.getCell(`A${r}`).value = EMPRESA_NOMBRE;
  ws.getCell(`D${r}`).value = `Reporte: ${fechaReporte}`;
  aplicar(ws, `A${r}:C${r}`, styleBandaTit());
  aplicar(ws, `D${r}:D${r}`, styleBandaDer());
  ws.getRow(r).height = 28;
  r++;

  ws.mergeCells(`A${r}:D${r}`);
  ws.getCell(`A${r}`).value = "Resumen consolidado de pendientes por facturar";
  aplicar(ws, `A${r}:D${r}`, styleSubtitulo());
  ws.getRow(r).height = 18;
  r++;

  r++;

  ws.getCell(`A${r}`).value = "Cliente";
  ws.getCell(`B${r}`).value = "# Registros";
  ws.getCell(`C${r}`).value = "Total MXN";
  ws.getCell(`D${r}`).value = "Total USD";
  aplicar(ws, `A${r}:A${r}`, styleTablaHeader("left"));
  aplicar(ws, `B${r}:B${r}`, styleTablaHeader("center"));
  aplicar(ws, `C${r}:C${r}`, styleTablaHeader("right"));
  aplicar(ws, `D${r}:D${r}`, styleTablaHeader("right"));
  ws.getRow(r).height = 20;
  r++;

  const filas = porCliente.map(({nombre, regs}) => {
    const t = { MXN: 0, USD: 0 };
    regs.forEach(x => {
      const m = x.moneda || "MXN";
      t[m] = (t[m] || 0) + (+x.importe || 0);
    });
    return { nombre, count: regs.length, mxn: t.MXN || 0, usd: t.USD || 0, total: (t.MXN || 0) + (t.USD || 0) };
  }).sort((a, b) => b.total - a.total);

  filas.forEach((f, idx) => {
    const par = idx % 2 === 0;
    ws.getCell(`A${r}`).value = f.nombre;
    ws.getCell(`B${r}`).value = f.count;
    const cMxn = ws.getCell(`C${r}`); cMxn.value = f.mxn; cMxn.numFmt = fmtMoney;
    const cUsd = ws.getCell(`D${r}`); cUsd.value = f.usd; cUsd.numFmt = fmtMoney;
    aplicar(ws, `A${r}:A${r}`, styleTablaDato({align:"left",   par, bold:true, importe:true}));
    aplicar(ws, `B${r}:B${r}`, styleTablaDato({align:"center", par}));
    aplicar(ws, `C${r}:C${r}`, styleTablaDato({align:"right",  par}));
    aplicar(ws, `D${r}:D${r}`, styleTablaDato({align:"right",  par}));
    r++;
  });

  const totMxn = filas.reduce((s, f) => s + f.mxn, 0);
  const totUsd = filas.reduce((s, f) => s + f.usd, 0);
  const totReg = filas.reduce((s, f) => s + f.count, 0);
  ws.getCell(`A${r}`).value = "TOTAL GENERAL";
  ws.getCell(`B${r}`).value = totReg;
  const cTM = ws.getCell(`C${r}`); cTM.value = totMxn; cTM.numFmt = fmtMoney;
  const cTU = ws.getCell(`D${r}`); cTU.value = totUsd; cTU.numFmt = fmtMoney;
  aplicar(ws, `A${r}:A${r}`, styleTotal("left"));
  aplicar(ws, `B${r}:B${r}`, styleTotal("center"));
  aplicar(ws, `C${r}:C${r}`, styleTotal("right"));
  aplicar(ws, `D${r}:D${r}`, styleTotal("right"));
  ws.getRow(r).height = 22;

  ws.views = [{ state: "frozen", ySplit: 4, showGridLines: false }];
}

// ─── API pública ──────────────────────────────────────────────────
export async function exportarPendientesFacturar({ porCliente, modo }) {
  const ExcelJS = (await import("exceljs")).default;
  const fechaReporte = fechaCorta();
  const fechaFile = fechaISO();
  const usados = new Set();

  const nombreDeHoja = (clienteNombre) => {
    let base = sanitizeSheet(clienteNombre);
    let n = base, i = 2;
    while (usados.has(n)) {
      const suf = ` (${i++})`;
      n = base.slice(0, 31 - suf.length) + suf;
    }
    usados.add(n);
    return n;
  };

  const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (modo === "consolidado") {
    const wb = new ExcelJS.Workbook();
    wb.creator = EMPRESA_NOMBRE;
    wb.created = new Date();
    escribirHojaResumen(wb.addWorksheet("Resumen"), porCliente, fechaReporte);
    porCliente.forEach(({nombre, regs, info}) => {
      escribirHojaCliente(wb.addWorksheet(nombreDeHoja(nombre)), nombre, regs, info, fechaReporte);
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const filename = `Pendiente_Facturar_TravelAirSolutions_${fechaFile}.xlsx`;
    triggerDownload(blob, filename);
    return { tipo: "xlsx", filename, archivos: 1 };
  }

  // modo === "separados"
  if (porCliente.length === 1) {
    const { nombre, regs, info } = porCliente[0];
    const wb = new ExcelJS.Workbook();
    wb.creator = EMPRESA_NOMBRE;
    wb.created = new Date();
    escribirHojaCliente(wb.addWorksheet(nombreDeHoja(nombre)), nombre, regs, info, fechaReporte);
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const filename = `Pendiente_Facturar_${sanitizeFile(nombre)}_${fechaFile}.xlsx`;
    triggerDownload(blob, filename);
    return { tipo: "xlsx", filename, archivos: 1 };
  }

  // ZIP múltiple
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const {nombre, regs, info} of porCliente) {
    const wb = new ExcelJS.Workbook();
    wb.creator = EMPRESA_NOMBRE;
    wb.created = new Date();
    escribirHojaCliente(wb.addWorksheet(nombreDeHoja(nombre)), nombre, regs, info, fechaReporte);
    const buf = await wb.xlsx.writeBuffer();
    const fname = `Pendiente_Facturar_${sanitizeFile(nombre)}_${fechaFile}.xlsx`;
    zip.file(fname, buf);
  }
  const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const filename = `Pendientes_Facturar_TAS_${fechaFile}.zip`;
  triggerDownload(zipBlob, filename);
  return { tipo: "zip", filename, archivos: porCliente.length };
}
