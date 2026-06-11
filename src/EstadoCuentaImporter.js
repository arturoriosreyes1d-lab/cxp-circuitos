// Importador de saldos bancarios desde estados de cuenta en Excel
// Estructura: una hoja por banco/moneda/mes, con movimientos diarios
// Estrategia: para cada hoja, agrupar por fecha y tomar la ÚLTIMA fila del día = saldo final

// =====================================================================
// CONFIG POR EMPRESA: mapea patrón de nombre de hoja → cuenta destino y formato
// =====================================================================
// matcher: función que recibe una cuenta de la BD y devuelve true si esta hoja le corresponde.
// La cuenta tiene: { banco, moneda, tipo: 'corriente'|'inversion', numeroCuenta }
// formato: 'banamex' | 'banorte' | 'inversion'
const matchBanamexMxnCte  = (c) => /banamex|bnmx/i.test(c.banco) && c.moneda === 'MXN' && c.tipo !== 'inversion';
const matchBanamexUsdCte  = (c) => /banamex|bnmx/i.test(c.banco) && c.moneda === 'USD' && c.tipo !== 'inversion';
const matchBanorteMxnCte  = (c) => /banorte/i.test(c.banco)      && c.moneda === 'MXN' && c.tipo !== 'inversion';
const matchBanorteUsdCte  = (c) => /banorte/i.test(c.banco)      && c.moneda === 'USD' && c.tipo !== 'inversion';
const matchInversionMxn   = (c) => c.tipo === 'inversion' && c.moneda === 'MXN';

export const EMPRESA_CONFIG = {
  // TravelAirSolutions
  empresa_2: [
    { patron: /^[A-ZÁÉÍÓÚÑ]+\s+BNMX$/i,                  match: matchBanamexMxnCte,  label: 'Banamex MXN',     formato: 'banamex'   },
    { patron: /^[A-ZÁÉÍÓÚÑ]+\s+USD\s+BNMX$/i,            match: matchBanamexUsdCte,  label: 'Banamex USD',     formato: 'banamex'   },
    { patron: /^[A-ZÁÉÍÓÚÑ]+\s+MN\s+BANORTE$/i,          match: matchBanorteMxnCte,  label: 'Banorte MXN',     formato: 'banorte'   },
    { patron: /^[A-ZÁÉÍÓÚÑ]+\s+USD\s+BANORTE$/i,         match: matchBanorteUsdCte,  label: 'Banorte USD',     formato: 'banorte'   },
    { patron: /^INVERSION$/i,                            match: matchInversionMxn,   label: 'Inversión MXN',   formato: 'inversion' },
  ],
  // Viajes Libero — pendiente, lo definimos cuando llegue su Excel
  empresa_1: [],
};

// =====================================================================
// FORMATOS: define qué columnas leer en cada tipo de hoja
// =====================================================================
const FORMATOS = {
  banamex: {
    columnaFecha:  ['fecha', 'date'],
    columnaSaldo:  ['saldo', 'balance'],
    headerSearchRows: 25,
  },
  banorte: {
    columnaFecha:  ['fecha', 'fecha de operación', 'fecha operación', 'date'],
    columnaSaldo:  ['saldo', 'balance'],
    headerSearchRows: 25,
  },
  // Inversión: caso especial. Hay 2 columnas que parecen ser saldo:
  //   - "SALDO FINAL" (col B) = saldo ANTES de aplicar la operación de la fila
  //   - "TOTAL"       (col G) = saldo DESPUÉS de la operación → este es el correcto
  inversion: {
    columnaFecha:  ['fecha', 'date'],
    columnaSaldo:  ['total'],
    headerSearchRows: 25,
  },
};

// =====================================================================
// HELPERS
// =====================================================================
const norm = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const detectarColumnas = (rows, alias, maxRows = 25) => {
  const result = { headerRow: -1, fechaCol: -1, saldoCol: -1 };
  const aliasFecha = alias.columnaFecha.map(norm);
  const aliasSaldo = alias.columnaSaldo.map(norm);
  const limit = Math.min(maxRows, rows.length);
  for (let r = 0; r < limit; r++) {
    const row = rows[r] || [];
    let foundFecha = -1;
    let foundSaldo = -1;
    for (let c = 0; c < row.length; c++) {
      const cellNorm = norm(row[c]);
      if (cellNorm && foundFecha === -1 && aliasFecha.includes(cellNorm)) foundFecha = c;
      if (cellNorm && foundSaldo === -1 && aliasSaldo.includes(cellNorm)) foundSaldo = c;
    }
    if (foundFecha >= 0 && foundSaldo >= 0) {
      result.headerRow = r;
      result.fechaCol = foundFecha;
      result.saldoCol = foundSaldo;
      return result;
    }
  }
  return result;
};

const toFechaISO = (v) => {
  if (!v && v !== 0) return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
  }
  if (typeof v === 'number' && v > 25569 && v < 60000) {
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${String(+iso[2]).padStart(2,'0')}-${String(+iso[3]).padStart(2,'0')}`;
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (dmy) {
    const a = +dmy[1], b = +dmy[2];
    let yyyy = dmy[3];
    if (yyyy.length === 2) yyyy = (+yyyy > 50 ? '19' : '20') + yyyy;
    let dd, mm;
    if (a > 12 && b <= 12) { dd = a; mm = b; }
    else if (b > 12 && a <= 12) { dd = b; mm = a; }
    else { dd = a; mm = b; }
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  }
  return null;
};

const toNumero = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[$,\s]/g, '').trim();
  if (!s || s === '-') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

// =====================================================================
// PARSER PRINCIPAL
// =====================================================================
// Devuelve: {
//   saldos:           [{ cuentaConfig, fecha, saldo, hojaOrigen }],   ← cuentaConfig viene del EMPRESA_CONFIG
//   hojasNoMapeadas:  [string],
//   errores:          [string]
// }
export function parsearEstadoCuenta(XLSX, workbook, empresaId, fechaFallback = null) {
  const config = EMPRESA_CONFIG[empresaId] || [];
  if (config.length === 0) {
    return { saldos: [], hojasNoMapeadas: [], errores: [`No hay configuración para esta empresa todavía.`] };
  }
  const saldos = [];
  const hojasNoMapeadas = [];
  const errores = [];

  for (const nombreHoja of workbook.SheetNames) {
    const cfg = config.find(c => c.patron.test(nombreHoja));
    if (!cfg) {
      // Ignorar hojas conocidas que no son de saldos (ej: "Saldos", "Saldos ene", etc.)
      if (/^saldos/i.test(nombreHoja)) continue;
      hojasNoMapeadas.push(nombreHoja);
      continue;
    }

    const ws = workbook.Sheets[nombreHoja];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, cellDates: true });
    if (!rows || rows.length === 0) continue;

    const formato = FORMATOS[cfg.formato];
    if (!formato) { errores.push(`Formato desconocido "${cfg.formato}" para hoja ${nombreHoja}.`); continue; }

    const dets = detectarColumnas(rows, formato, formato.headerSearchRows);
    if (dets.headerRow < 0) {
      errores.push(`No se encontraron columnas requeridas en hoja "${nombreHoja}".`);
      continue;
    }

    // Recorrer y agrupar por fecha → último saldo del día
    const saldoPorFecha = new Map();
    for (let r = dets.headerRow + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const fechaCelda = row[dets.fechaCol];
      const saldoCelda = row[dets.saldoCol];
      if (fechaCelda === null || fechaCelda === undefined || fechaCelda === '') continue;
      const fechaStr = toFechaISO(fechaCelda);
      if (!fechaStr) continue;
      const saldoNum = toNumero(saldoCelda);
      if (saldoNum === null) continue;
      saldoPorFecha.set(fechaStr, saldoNum);
    }

    // FALLBACK: si la hoja NO tiene movimientos detectados, buscar celda "INICIAL"
    // (típico de hojas de meses sin movimientos todavía → traen saldo arrastrado del mes anterior)
    if (saldoPorFecha.size === 0 && fechaFallback) {
      const saldoInicial = buscarSaldoInicial(rows);
      if (saldoInicial !== null) {
        saldos.push({
          cuentaConfig: cfg,
          fecha: fechaFallback,
          saldo: saldoInicial,
          hojaOrigen: nombreHoja,
          esInicial: true, // marca: vino de la celda INICIAL, no de movimientos
        });
        continue; // ya guardamos el fallback, no hace falta el for de abajo
      }
    }

    for (const [fecha, saldo] of saldoPorFecha) {
      saldos.push({
        cuentaConfig: cfg, // contiene match, label, formato
        fecha,
        saldo,
        hojaOrigen: nombreHoja,
        esInicial: false,
      });
    }
  }

  return { saldos, hojasNoMapeadas, errores };
}

// =====================================================================
// FALLBACK: buscar celda "INICIAL" y devolver el valor numérico vecino
// =====================================================================
// Recorre las primeras filas buscando una celda cuyo texto sea "INICIAL"
// (con o sin ":" alrededor). Devuelve el primer número que encuentre en la
// misma fila a la derecha de esa celda.
function buscarSaldoInicial(rows) {
  const limit = Math.min(20, rows.length);
  for (let r = 0; r < limit; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell) continue;
      const cellNorm = norm(cell).replace(/[:.\s]/g, '');
      if (cellNorm === 'inicial' || cellNorm === 'saldoinicial') {
        // Buscar el primer número a la derecha en la misma fila
        for (let cc = c + 1; cc < row.length && cc <= c + 5; cc++) {
          const v = row[cc];
          const num = toNumero(v);
          if (num !== null && num !== 0) return num;
        }
      }
    }
  }
  return null;
}
