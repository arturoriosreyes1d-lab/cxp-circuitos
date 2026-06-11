import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import {
  fetchBoletosCC,
  upsertBoletoCC,
  upsertManyBoletosCC,
  deleteBoletoCC,
  deleteManyBoletosCC,
  updateBoletoCCFields,
  fetchMovimientosCC,
  upsertMovimientoCC,
  deleteMovimientoCC,
  makeBusinessId,
  findExistingBoleto,
} from './db_caribe_cool.js';

// ─── Iconos como componentes locales (reemplazan lucide-react) ──
// Mantenemos la interfaz <Icon size={n} color="..." /> para no tocar
// todos los call sites del prototipo.
function makeIcon(emoji) {
  return function Icon({ size = 16, color, style = {} }) {
    return (
      <span
        style={{
          display: 'inline-block',
          fontSize: size,
          lineHeight: 1,
          color: color || 'inherit',
          ...style,
        }}
      >
        {emoji}
      </span>
    );
  };
}
const Upload = makeIcon('⬆');
const X = makeIcon('✕');
const Edit2 = makeIcon('✏');
const Filter = makeIcon('🔻');
const RotateCcw = makeIcon('↻');
const CheckCircle2 = makeIcon('✓');
const Circle = makeIcon('○');
const FileSpreadsheet = makeIcon('📊');
const Search = makeIcon('🔍');
const ClipboardPaste = makeIcon('📋');
const Calendar = makeIcon('📅');
const ChevronLeft = makeIcon('‹');
const ChevronRight = makeIcon('›');
const Trash2 = makeIcon('🗑');
const AlertTriangle = makeIcon('⚠');
const Plus = makeIcon('+');


export const MIVUELO_LOGO = 'data:image/png;base64,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';


// 3 boletos de la muestra real del usuario, con el primero ya "conciliado"
// (campos manuales llenos) y los otros 2 pendientes.
const FORMAS_PAGO = [
  'EFECTIVO CUBA',
  'EFECTIVO MEX OPERACIONES',
  'EFECTIVO MEX CONTABILIDAD',
  'BNMX USD',
  'BNMX MN',
  'TARJETA',
  'TRANSFERENCIA',
  'PAYPAL',
  'CREDITO',
];

const ESTATUS_OPCIONES = ['COBRADO', 'PENDIENTE'];

// Catálogo inicial de clientes pagadores. Crece a medida que se identifican
// clientes con crédito. Por ahora solo el público general.
const CLIENTES_PAGADORES = ['PUBLICO EN GENERAL'];

// ─── Mapeo Forma de Pago → Destino del dinero ───────────────────────
// Cada forma de pago va a una "categoría" que representa dónde queda el dinero.
// El orden de las categorías controla cómo se muestran en la vista Caja & Bancos.
const CATEGORIAS = [
  {
    id: 'caja_operaciones',
    label: 'Caja Operaciones (México)',
    icon: '💵',
    color: '#854F0B',
    bg: '#FAEEDA',
    bgSoft: '#FEF9F0',
    note: 'Entrega a contabilidad: viernes',
    formas: ['EFECTIVO MEX OPERACIONES'],
  },
  {
    id: 'caja_contabilidad',
    label: 'Caja Contabilidad (México)',
    icon: '🧾',
    color: '#3C3489',
    bg: '#EEEDFE',
    bgSoft: '#F8F7FE',
    note: 'Caja final de contabilidad',
    formas: ['EFECTIVO MEX CONTABILIDAD'],
  },
  {
    id: 'bancos',
    label: 'Bancos',
    icon: '🏦',
    color: '#0C447C',
    bg: '#E6F1FB',
    bgSoft: '#F4F8FD',
    note: null,
    formas: ['BNMX USD', 'BNMX MN', 'TARJETA', 'TRANSFERENCIA', 'PAYPAL'],
  },
  {
    id: 'caja_cuba',
    label: 'Caja Cuba',
    icon: '🏝',
    color: '#085041',
    bg: '#E1F5EE',
    bgSoft: '#F4FAF7',
    note: null,
    formas: ['EFECTIVO CUBA', 'SO CUBA'],
  },
  {
    id: 'credito_cuba',
    label: 'CxC Cuba',
    icon: '⏳',
    color: '#854F0B',
    bg: '#FAEEDA',
    bgSoft: '#FEF9F0',
    note: 'Por cobrar al cliente (Cuba)',
    formas: ['CREDITO'], // requiere plaza=CUBA
  },
  {
    id: 'credito_mexico',
    label: 'CxC México',
    icon: '⏳',
    color: '#854F0B',
    bg: '#FAEEDA',
    bgSoft: '#FEF9F0',
    note: 'Por cobrar al cliente (México)',
    formas: ['CREDITO'], // requiere plaza=MEX (o sin plaza definida)
  },
  {
    id: 'sin_cobrar',
    label: 'Sin cobrar / sin clasificar',
    icon: '❓',
    color: '#A32D2D',
    bg: '#FCEBEB',
    bgSoft: '#FEF5F5',
    note: 'Estos requieren tu atención',
    formas: [], // catch-all
  },
];

// Detecta boletos en estado "POR CONFIRMAR":
// Son ventas en EFECTIVO CUBA marcadas como PENDIENTE. El dinero
// posiblemente ya entró a la caja de Cuba pero el equipo allá aún no
// nos confirmó. Se cuentan en Caja Cuba pero con etiqueta visual ámbar.
// Cuando el equipo confirma, el usuario cambia el estatus a COBRADO
// y la marca "Por confirmar" desaparece.
function esPorConfirmar(b) {
  return (
    b.forma_pago === 'EFECTIVO CUBA' &&
    b.estatus === 'PENDIENTE' &&
    b.precio_venta != null
  );
}

// Dado un boleto, retorna el id de la categoría a la que pertenece su cobro
function categoriaDelBoleto(b) {
  // Caso especial: EFECTIVO CUBA + PENDIENTE = "Por confirmar" → va a Caja Cuba
  if (esPorConfirmar(b)) return 'caja_cuba';

  if (!b.forma_pago || b.estatus !== 'COBRADO') {
    // CREDITO va a CxC, diferenciando por plaza
    if (b.forma_pago === 'CREDITO') {
      // Si la plaza es CUBA → CxC Cuba, en otro caso (MEX o sin plaza) → CxC México
      return b.plaza === 'CUBA' ? 'credito_cuba' : 'credito_mexico';
    }
    return 'sin_cobrar';
  }
  for (const cat of CATEGORIAS) {
    if (cat.formas.includes(b.forma_pago)) return cat.id;
  }
  return 'sin_cobrar';
}

// ─── Catálogo de Cajas reales (para módulo de Movimientos) ───────────
// Cada caja es un "contenedor" de dinero que tiene saldo. A diferencia de
// CATEGORIAS (vista agrupada), aquí cada cuenta es independiente.
// Tipos:
//   'efectivo'      → caja física, puede ser origen y destino de movimientos
//   'banco'         → cuenta bancaria, puede ser origen y destino
//   'digital'       → cuenta virtual (PayPal), puede ser origen y destino
//   'externa_out'   → solo aparece como DESTINO (le pagas a alguien)
//   'externa_in'    → solo aparece como ORIGEN (alguien te paga, entra dinero)
const CAJAS = [
  {
    id: 'caja_cuba',
    label: 'Caja Cuba',
    moneda: 'USD',
    tipo: 'efectivo',
    icon: '🏝',
    color: '#085041',
  },
  {
    id: 'caja_ops_mex',
    label: 'Caja Operaciones MEX',
    moneda: 'MULTI', // USD + MXN
    tipo: 'efectivo',
    icon: '💵',
    color: '#854F0B',
  },
  {
    id: 'caja_contab_mex',
    label: 'Caja Contabilidad MEX',
    moneda: 'MULTI',
    tipo: 'efectivo',
    icon: '🧾',
    color: '#3C3489',
  },
  {
    id: 'bnmx_usd',
    label: 'BNMX USD',
    moneda: 'USD',
    tipo: 'banco',
    icon: '🏦',
    color: '#0C447C',
  },
  {
    id: 'bnmx_mn',
    label: 'BNMX MN',
    moneda: 'MXN',
    tipo: 'banco',
    icon: '🏦',
    color: '#0C447C',
  },
  {
    id: 'paypal',
    label: 'PayPal',
    moneda: 'USD',
    tipo: 'digital',
    icon: '💳',
    color: '#534AB7',
  },
  {
    id: 'caribe_cool',
    label: 'Caribe Cool (proveedor)',
    moneda: 'USD',
    tipo: 'externa_out',
    icon: '🔻',
    color: '#A32D2D',
  },
  {
    id: 'gastos_nomina',
    label: 'Gastos / Nómina',
    moneda: 'MXN',
    tipo: 'externa_out',
    icon: '🔻',
    color: '#A32D2D',
  },
  {
    id: 'aporte_socio',
    label: 'Aportación de socios',
    moneda: 'MULTI',
    tipo: 'externa_in',
    icon: '🔺',
    color: '#0F6E56',
  },
  {
    id: 'aumento_saldo',
    label: 'Aumento de saldo',
    moneda: 'MULTI',
    tipo: 'externa_in',
    icon: '➕',
    color: '#534AB7',
  },
];

// Helper: obtener caja por id
function getCaja(id) {
  return CAJAS.find((c) => c.id === id) || null;
}

// Helper: detecta si un movimiento es un saldo inicial
// Convención: origen = aporte_socio + destino = caribe_cool + nota contiene "saldo inicial"
function esSaldoInicial(m) {
  if (!m) return false;
  if (m.caja_origen !== 'aporte_socio') return false;
  if (m.caja_destino !== 'caribe_cool') return false;
  const nota = (m.nota || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return nota.includes('saldo inicial');
}

// Mapeo: dada una venta cobrada (boleto), retorna a qué caja real va el dinero
// según su forma_pago + moneda_cobro.
// Retorna { caja_id, monto, moneda, porConfirmar } o null si no aplica.
// porConfirmar=true cuando el dinero "probablemente" ya entró pero falta
// que el equipo en Cuba confirme (EFECTIVO CUBA + PENDIENTE).
function ventaACaja(b) {
  if (b.precio_venta == null || !b.forma_pago) return null;
  const porConfirmar = esPorConfirmar(b);
  // Solo procede si está COBRADO o si es un caso "Por confirmar"
  if (b.estatus !== 'COBRADO' && !porConfirmar) return null;
  // Monto en moneda de cobro (no en USD necesariamente)
  const monto =
    b.moneda_cobro === 'MXN' && b.precio_venta_local != null
      ? b.precio_venta_local
      : b.precio_venta;
  const moneda = b.moneda_cobro === 'MXN' ? 'MXN' : 'USD';

  switch (b.forma_pago) {
    case 'EFECTIVO CUBA':
    case 'SO CUBA':
      return { caja_id: 'caja_cuba', monto, moneda: 'USD', porConfirmar };
    case 'EFECTIVO MEX OPERACIONES':
      return { caja_id: 'caja_ops_mex', monto, moneda, porConfirmar };
    case 'EFECTIVO MEX CONTABILIDAD':
      return { caja_id: 'caja_contab_mex', monto, moneda, porConfirmar };
    case 'BNMX USD':
      return { caja_id: 'bnmx_usd', monto: b.precio_venta, moneda: 'USD', porConfirmar };
    case 'BNMX MN':
      return { caja_id: 'bnmx_mn', monto, moneda: 'MXN', porConfirmar };
    case 'TARJETA':
    case 'TRANSFERENCIA':
      // Caen en BNMX según moneda
      if (moneda === 'MXN') {
        return { caja_id: 'bnmx_mn', monto, moneda: 'MXN', porConfirmar };
      }
      return { caja_id: 'bnmx_usd', monto: b.precio_venta, moneda: 'USD', porConfirmar };
    case 'PAYPAL':
      return { caja_id: 'paypal', monto: b.precio_venta, moneda: 'USD', porConfirmar };
    case 'CREDITO':
      return null; // crédito no entra a ninguna caja todavía
    default:
      return null;
  }
}

// Helpers ───────────────────────────────────────────────────────────
const fmt = (n) =>
  n == null || isNaN(n)
    ? '—'
    : Number(n).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const fmtPct = (n) =>
  n == null || isNaN(n) ? '—' : `${(n * 100).toFixed(1)}%`;

// ─── Componente: Celda de dinero con formato contable ────────────
// Renderiza un importe en formato contable:
//   - $ alineado a la izquierda
//   - número alineado a la derecha
//   - cero o null → "—" centrado (gris claro)
//   - negativos → entre paréntesis (formato contable clásico)
function MoneyCell({ amount, color, weight }) {
  const isNull = amount == null || isNaN(amount);
  const num = isNull ? 0 : Number(amount);
  const isZero = !isNull && num === 0;
  const isNeg = !isNull && num < 0;
  const absStr = isNull
    ? ''
    : Math.abs(num).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

  if (isNull || isZero) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: '#CBD5E1',
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>$</span>
        <span>—</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: color || 'inherit',
        fontWeight: weight || 600,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span>$</span>
      <span>{isNeg ? `(${absStr})` : absStr}</span>
    </div>
  );
}

function parseVenta2(s) {
  // "319,00  USD" → { amount: 319, currency: 'USD' }
  if (!s || typeof s !== 'string') return { amount: null, currency: null };
  const m = s.replace(/\u00a0/g, ' ').match(/([\d.,]+)\s+([A-Z]{3})/);
  if (!m) return { amount: null, currency: null };
  const amount = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
  return { amount: isNaN(amount) ? null : amount, currency: m[2] };
}

function parseDescripcion(desc) {
  if (!desc) return { tipo_viaje: null, ruta: null };
  const tipo = desc.match(/\[(RT|OW)\]/);
  const ruta = desc.match(/\]\s+([A-Z]{3}>[A-Z]{3})/);
  return { tipo_viaje: tipo ? tipo[1] : null, ruta: ruta ? ruta[1] : null };
}

// Helper: formato YYYY-MM-DD en zona horaria LOCAL (NO UTC).
// La columna fecha_venta es DATE en la DB (solo día, sin hora ni timezone),
// así que la fecha "11/05/2026 19:31:04" del Excel debe guardarse como
// "2026-05-11" sin importar la zona horaria. Usar toISOString() causa que
// fechas de la tarde/noche local salten al día siguiente en UTC.
function toLocalDateString(date) {
  if (!date || isNaN(date.getTime())) return null;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function excelDateToISO(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return toLocalDateString(v);
  if (typeof v === 'number') {
    // Serial date de Excel: días desde 1900-01-01 (con bug del año bisiesto).
    // Lo construimos componente a componente para evitar el shift por UTC.
    const dUtc = new Date(Math.round((v - 25569) * 86400 * 1000));
    // Como el serial de Excel representa una fecha "wall-clock", usamos los
    // componentes UTC para obtener la fecha de calendario correcta.
    const yyyy = dUtc.getUTCFullYear();
    const mm = String(dUtc.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dUtc.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof v === 'string') {
    // Quitar prefijo de día de semana si lo hay: "Fri 15/05/2026", "Lun 11/05/2026", etc.
    // Acepta inglés (Mon-Sun), español (Lun-Dom), y abreviaturas con/sin punto
    const cleaned = v
      .replace(
        /^(mon|tue|wed|thu|fri|sat|sun|lun|mar|mi[eé]|jue|vie|s[aá]b|dom)\.?\s+/i,
        ''
      )
      .trim();
    // Si el string ya viene en formato ISO con fecha, intentar parsear sin shift
    // Casos: "2026-05-11", "2026-05-11T19:31:04", "11/05/2026", etc.
    // Primero probar formato dd/mm/yyyy
    const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (slashMatch) {
      const dd = slashMatch[1].padStart(2, '0');
      const mm = slashMatch[2].padStart(2, '0');
      const yyyy = slashMatch[3];
      return `${yyyy}-${mm}-${dd}`;
    }
    // Formato yyyy-mm-dd directamente (con o sin hora después)
    const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
    // Fallback: parsear como Date y extraer fecha local
    const d = new Date(cleaned);
    return isNaN(d.getTime()) ? null : toLocalDateString(d);
  }
  return null;
}

// "12/05/2026 9:09:28" → "2026-05-12" (formato YYYY-MM-DD local)
function parseFechaPaste(s) {
  if (!s) return null;
  const m = String(s).match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (m) {
    // Día y mes pueden venir como 1-2 dígitos: padStart a 2
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    const yyyy = m[3];
    // Validar que sea una fecha real (mes 1-12, día 1-31)
    const month = parseInt(mm, 10);
    const day = parseInt(dd, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  // Fallback: intentar Date y extraer fecha local
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : toLocalDateString(d);
}

// Parsea texto pegado de Caribe Cool. Soporta 2 formatos:
//  1) Tab-separated por fila (copiado directo del navegador con tabs)
//  2) Una celda por línea (lo que llega cuando se pierden los tabs)
// Las "Transacciones negativas" cuando están vacías pueden venir omitidas.
function parsePastedText(text) {
  if (!text || !text.trim()) return [];
  const rawLines = text.split(/\r?\n/).map((l) => l.replace(/\u00a0/g, ' '));
  // Solo modo tabular si alguna línea tiene 2+ celdas NO vacías separadas por tab
  // (un tab al final de "0  USD\t" no debe activarlo)
  const hasTabs = rawLines.some((l) => {
    const parts = l.split('\t').filter((p) => p.trim() !== '');
    return parts.length >= 2;
  });
  const PNR_RE = /^[A-Z0-9]{5,7}$/i;

  const tickets = [];

  if (hasTabs) {
    for (const line of rawLines) {
      if (!line.trim()) continue;
      const cells = line.split('\t').map((c) => c.trim());
      // Encuentra la celda PNR (saltando posibles columnas vacías al inicio)
      const pnrIdx = cells.findIndex((c) => PNR_RE.test(c));
      if (pnrIdx < 0) continue;
      const c = cells.slice(pnrIdx);
      const ticket = buildTicket(c);
      if (ticket) tickets.push(ticket);
    }
  } else {
    const lines = rawLines.map((l) => l.trim()).filter(Boolean);
    let i = 0;
    while (i < lines.length) {
      if (!PNR_RE.test(lines[i])) {
        i++;
        continue;
      }
      // Tomamos 8 o 9 líneas dependiendo si hay trans_negativa
      const block = [lines[i]];
      let j = i + 1;
      // Sigue tomando líneas hasta encontrar otro PNR o llegar al final
      while (j < lines.length && !PNR_RE.test(lines[j]) && block.length < 9) {
        block.push(lines[j]);
        j++;
      }
      const ticket = buildTicket(block);
      if (ticket) tickets.push(ticket);
      i = j;
    }
  }

  return tickets;
}

// A partir de un array de celdas en el orden de Caribe Cool, construye un boleto normalizado
function buildTicket(cells) {
  if (cells.length < 4) return null;
  const pnr = String(cells[0] || '').trim().toUpperCase();
  const cliente = cells[1] || '';
  const fechaRaw = cells[2] || '';
  const descripcion = cells[3] || '';
  let venta2Raw = cells[4] || '';

  // Detecta si hay trans_negativa antes de "Validado/etc"
  // Patrón: número o número+moneda
  let trans_neg = null;
  let baseIdx = 5;
  const cell5 = String(cells[5] || '').trim();
  if (cell5 && /^-?[\d.,]+(\s+[A-Z]{3})?$/.test(cell5)) {
    trans_neg = cell5;
    baseIdx = 6;
  }

  // FIX celdas colapsadas: cuando copias desde Caribe Cool web, las celdas
  // vacías de "Venta" se colapsan y el monto de "Transacciones negativas"
  // se desplaza a la posición de Venta. Aplicamos esta regla a conceptos
  // que NUNCA generan venta (siempre devuelven dinero o cargan trans neg):
  //   - Cancelación      → siempre Venta=0, monto va en Trans Neg
  //   - Reembolso        → siempre Venta=0, monto va en Trans Neg
  // Para otros conceptos (asientos priority, cambios, equipaje, boletos)
  // SÍ puede haber venta real, así que NO movemos el monto.
  const _lowerDesc = String(descripcion).toLowerCase();
  const esTransNegPura =
    _lowerDesc.startsWith('cancelación') ||
    _lowerDesc.startsWith('cancelacion') ||
    _lowerDesc.startsWith('reembolso') ||
    _lowerDesc.startsWith('reembolzo'); // por si hay typo

  // LOG TEMPORAL: para diagnosticar Reembolso
  if (_lowerDesc.includes('reembolso')) {
    // eslint-disable-next-line no-console
    console.log('[buildTicket REEMBOLSO]', {
      pnr,
      descripcion: descripcion.slice(0, 60),
      venta2Raw,
      cell5,
      esTransNegPura,
      antes_trans_neg: trans_neg,
    });
  }

  if (esTransNegPura) {
    const ventaParsed = parseVenta2(String(venta2Raw));
    if (ventaParsed.amount != null) {
      trans_neg = String(venta2Raw).trim();
      venta2Raw = '';
      if (_lowerDesc.includes('reembolso')) {
        // eslint-disable-next-line no-console
        console.log('[buildTicket REEMBOLSO] → trans_neg movido:', { trans_neg, venta2Raw });
      }
    }
  }

  const venta2 = parseVenta2(venta2Raw);
  const desc = parseDescripcion(descripcion);
  const descTrim = String(descripcion).trim();

  return {
    id: makeBoletoId(pnr, descTrim),
    pnr,
    cliente: String(cliente).trim(),
    fecha_venta: parseFechaPaste(fechaRaw),
    descripcion: descTrim,
    tipo_viaje: desc.tipo_viaje,
    ruta: desc.ruta,
    costo_usd: venta2.amount,
    moneda_costo: venta2.currency || 'USD',
    estado_caribe: String(cells[baseIdx] || '').trim(),
    tipo_pago_caribe: String(cells[baseIdx + 1] || '').trim(),
    vendedor: String(cells[baseIdx + 2] || '').trim(),
    trans_negativa: trans_neg,
    so_mexico: '',
    so_cuba: '',
    forma_pago: '',
    precio_venta: null,
    fecha_cobro: '',
    cliente_pagador: '',
    dias_credito: null,
    estatus: '',
    plaza: '',
    notas: '',
  };
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    let d;
    // Si viene "YYYY-MM-DD" sin hora, parsear como LOCAL (no UTC)
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const [y, m, day] = iso.split('-').map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date(iso);
    }
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

// Formato numérico DD/MM/YYYY (usado en tabla de Boletería)
function formatDateDmy(iso) {
  if (!iso) return '—';
  try {
    let d;
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const [y, m, day] = iso.split('-').map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date(iso);
    }
    if (isNaN(d.getTime())) return '—';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return '—';
  }
}

// Convierte ISO o fecha local "YYYY-MM-DD" a "YYYY-MM-DD" (zona local)
function dateOnly(input) {
  if (!input) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input; // ya viene así
  const d = new Date(input);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

// Parsea el campo SO de Caribe Cool. Soporta:
//   "SO42701CU/SO42704MEX" → { so_cuba: "SO42701", so_mexico: "SO42704" }
//   "SO42717"  + plaza="MEX"  → { so_mexico: "SO42717" }
//   "SO42717"  + plaza="CUBA" → { so_cuba: "SO42717" }
function parseSoField(raw, plaza) {
  const result = { so_mexico: '', so_cuba: '' };
  if (!raw) return result;
  const s = String(raw).trim();
  const parts = s.includes('/') ? s.split('/').map((p) => p.trim()) : [s];
  for (const p of parts) {
    if (/CU$/i.test(p)) {
      result.so_cuba = p.replace(/CU$/i, '');
    } else if (/MEX$/i.test(p)) {
      result.so_mexico = p.replace(/MEX$/i, '');
    } else {
      // Sin sufijo — usar plaza para decidir
      if (plaza === 'CUBA') result.so_cuba = p;
      else result.so_mexico = p;
    }
  }
  return result;
}

// Parsea el campo "FECHA DE INGRESO" que puede contener:
//  - una fecha real → fecha_cobro
//  - "JERAS TRAVEL CREDITO 5 DIAS" → cliente_pagador + dias_credito
//  - "P.GENERAL S/CREDITO" → cliente_pagador, dias_credito=0
function parseFechaIngresoOrCredit(raw) {
  const out = { fecha_cobro: '', cliente_pagador: '', dias_credito: null };
  if (raw == null || raw === '') return out;
  // Date object → extraer fecha LOCAL directamente (no pasar por toISOString)
  if (raw instanceof Date) {
    out.fecha_cobro = toLocalDateString(raw);
    return out;
  }
  const s = String(raw).trim();
  if (!s) return out;
  // "X CREDITO N DIAS"
  let m = s.match(/^(.+?)\s+CREDITO\s+(\d+)\s+D[IÍ]AS?$/i);
  if (m) {
    out.cliente_pagador = m[1].trim();
    out.dias_credito = parseInt(m[2]);
    return out;
  }
  // "X S/CREDITO" (sin crédito = contado)
  m = s.match(/^(.+?)\s+S\/?CREDITO$/i);
  if (m) {
    out.cliente_pagador = m[1].trim();
    out.dias_credito = 0;
    return out;
  }
  // Intentar como fecha (Date, ISO, etc.)
  const dParsed = new Date(s);
  if (!isNaN(dParsed.getTime()) && /\d{4}/.test(s)) {
    out.fecha_cobro = toLocalDateString(dParsed);
    return out;
  }
  // Fallback: tratar como cliente
  out.cliente_pagador = s;
  return out;
}

// Normaliza un valor de COBRO contra el catálogo. Retorna { value, recognized }
function normalizeFormaPago(raw) {
  if (!raw) return { value: '', recognized: true };
  const trimmed = String(raw).trim();
  const upper = trimmed.toUpperCase();
  const match = FORMAS_PAGO.find((c) => c.toUpperCase() === upper);
  if (match) return { value: match, recognized: true };
  return { value: trimmed, recognized: false };
}

// Normaliza plaza: "HAB" / "HABANA" → "CUBA"; "MEX" / "MEXICO" → "MEX"
function normalizePlaza(raw) {
  if (!raw) return '';
  const s = String(raw).trim().toUpperCase();
  if (s === 'MEX' || s === 'MEXICO' || s === 'MÉXICO') return 'MEX';
  if (s === 'CUBA' || s === 'HAB' || s === 'HABANA') return 'CUBA';
  return '';
}

// ID compuesto y estable para cada LÍNEA de Caribe Cool.
// Múltiples líneas con el mismo PNR (reservas grupales, extras) son ID distinto.
// La normalización (lowercase + collapsing whitespace) hace que pequeñas variaciones
// en la descripción no rompan el matching.
function makeBoletoId(pnr, descripcion) {
  const p = String(pnr || 'NOPNR').toUpperCase();
  const d = String(descripcion || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return `${p}||${d.slice(0, 200)}`;
}

// Asegura que cada boleto tenga `id` y los campos del modelo nuevo.
// Migra campos legacy:
//   so_odoo → so_mexico/so_cuba (según plaza)
//   cobro_metodo (legacy) → forma_pago
//   cliente_credito (legacy) → cliente_pagador
//   fecha_ingreso (legacy) → fecha_cobro
function ensureIds(boletos) {
  return (boletos || []).map((b) => {
    let so_mexico = b.so_mexico || '';
    let so_cuba = b.so_cuba || '';
    if (b.so_odoo && !so_mexico && !so_cuba) {
      if (b.plaza === 'CUBA') so_cuba = b.so_odoo;
      else so_mexico = b.so_odoo;
    }
    return {
      ...b,
      id: b.id || makeBoletoId(b.pnr, b.descripcion),
      so_mexico,
      so_cuba,
      // Los renames anteriores (cobro_metodo → forma_pago, etc.) ya operaron
      // sobre los nombres de campo: la migración aquí es defensiva por si
      // queda data en storage con nombres viejos.
      forma_pago: b.forma_pago || '',
      cliente_pagador: b.cliente_pagador || '',
      fecha_cobro: b.fecha_cobro || '',
      dias_credito: b.dias_credito != null ? b.dias_credito : null,
      estatus: b.estatus || '',
      // Campos de moneda local (cuando se cobra en MXN, etc.)
      moneda_cobro: b.moneda_cobro || 'USD',
      precio_venta_local:
        b.precio_venta_local != null ? b.precio_venta_local : null,
      tipo_cambio: b.tipo_cambio != null ? b.tipo_cambio : null,
    };
  });
}

// Presets de rango (zona local, basado en "hoy")
function presetRange(preset) {
  const today = new Date();
  const todayStr = dateOnly(today.toISOString());
  switch (preset) {
    case 'today':
      return { from: todayStr, to: todayStr };
    case 'thisWeek': {
      // Lunes a hoy
      const dow = today.getDay(); // 0=Dom
      const offset = (dow + 6) % 7; // días desde lunes
      const monday = new Date(today);
      monday.setDate(today.getDate() - offset);
      return { from: dateOnly(monday.toISOString()), to: todayStr };
    }
    case 'thisMonth': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: dateOnly(first.toISOString()), to: todayStr };
    }
    case 'lastMonth': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return {
        from: dateOnly(first.toISOString()),
        to: dateOnly(last.toISOString()),
      };
    }
    case 'thisYear': {
      const first = new Date(today.getFullYear(), 0, 1);
      return { from: dateOnly(first.toISOString()), to: todayStr };
    }
    case 'last30': {
      const d = new Date(today);
      d.setDate(today.getDate() - 29);
      return { from: dateOnly(d.toISOString()), to: todayStr };
    }
    case 'all':
    default:
      return { from: '', to: '' };
  }
}

// Etiqueta humana para mostrar el rango activo
function rangeLabel(from, to) {
  if (!from && !to) return null;
  const f = from ? formatDate(from) : '—';
  const t = to ? formatDate(to) : 'hoy';
  if (from && to && from === to) return f;
  return `${f} → ${t}`;
}

function isConciliado(b) {
  // Boletos con costo $0 (transacciones negativas, ajustes, equipaje sin
  // cobro) NO requieren conciliación: no son ventas reales.
  if (b.costo_usd != null && b.costo_usd === 0) return true;
  const hasOrder = !!(b.so_mexico || b.so_cuba);
  const hasVenta = b.precio_venta != null;
  const hasPlaza = !!b.plaza;
  // "Conciliado" = Pamela explícitamente marcó el estatus
  // (COBRADO si entró, PENDIENTE si está a crédito)
  const hasEstatus = !!b.estatus;
  return hasOrder && hasVenta && hasPlaza && hasEstatus;
}

// Helper: detecta si un boleto NO requiere conciliación (transacción negativa
// o de costo cero). Útil para mostrarles UI distinta del resto.
function noRequiereConciliacion(b) {
  return b.costo_usd != null && b.costo_usd === 0;
}

// Compara campos de Caribe Cool entre el boleto existente y el pegado.
// Retorna array de {label, oldVal, newVal} con SOLO los campos que cambiaron.
function diffBoletos(existing, incoming) {
  const fields = [
    { k: 'cliente', l: 'Cliente' },
    {
      k: 'costo_usd',
      l: 'Costo',
      fmt: (v) => (v != null ? `$${fmt(v)}` : '—'),
    },
    { k: 'descripcion', l: 'Descripción' },
    { k: 'ruta', l: 'Ruta' },
    { k: 'tipo_viaje', l: 'Tipo' },
    { k: 'vendedor', l: 'Vendedor' },
    { k: 'estado_caribe', l: 'Estado' },
    { k: 'tipo_pago_caribe', l: 'Tipo pago' },
    {
      k: 'fecha_venta',
      l: 'Fecha',
      fmt: (v) => formatDate(v),
      eq: (a, b) => {
        // Compara solo hasta el segundo, ignorando ms y zona
        const da = a ? new Date(a).getTime() : 0;
        const db = b ? new Date(b).getTime() : 0;
        return Math.abs(da - db) < 1000;
      },
    },
  ];
  const diffs = [];
  for (const f of fields) {
    const a = existing[f.k];
    const b = incoming[f.k];
    const equal = f.eq
      ? f.eq(a, b)
      : String(a == null ? '' : a).trim() === String(b == null ? '' : b).trim();
    if (!equal) {
      diffs.push({
        label: f.l,
        oldVal: f.fmt ? f.fmt(a) : a || '—',
        newVal: f.fmt ? f.fmt(b) : b || '—',
      });
    }
  }
  return diffs;
}

// Búsqueda accent/case-insensitive sobre TODO el boleto
function normalize(s) {
  if (s == null) return '';
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function matchesSearch(b, q) {
  if (!q || !q.trim()) return true;
  const utilidad =
    b.precio_venta != null ? b.precio_venta - b.costo_usd : null;
  const haystack = normalize(
    [
      b.pnr,
      b.cliente,
      b.descripcion,
      b.ruta,
      b.tipo_viaje,
      b.vendedor,
      b.estado_caribe,
      b.tipo_pago_caribe,
      b.trans_negativa,
      b.so_mexico,
      b.so_cuba,
      b.forma_pago,
      b.estatus,
      b.plaza,
      b.cliente_pagador,
      b.dias_credito != null ? String(b.dias_credito) : '',
      b.notas,
      b.moneda_cobro,
      b.precio_venta_local != null ? b.precio_venta_local.toFixed(2) : '',
      b.tipo_cambio != null ? b.tipo_cambio.toFixed(2) : '',
      b.costo_usd != null ? b.costo_usd.toFixed(2) : '',
      b.precio_venta != null ? b.precio_venta.toFixed(2) : '',
      utilidad != null ? utilidad.toFixed(2) : '',
      formatDate(b.fecha_venta),
      b.fecha_cobro,
    ].join(' ')
  );
  // multi-palabra: TODAS las palabras deben aparecer
  return normalize(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => haystack.includes(w));
}

// Estilos compartidos ───────────────────────────────────────────────
const C = {
  navy: '#0F172A',
  slate: '#475569',
  muted: '#64748B',
  border: '#E2E8F0',
  bgSoft: '#F8FAFC',
  costo: '#0F172A',
  danger: '#B91C1C',
  venta: '#15803D',
  utilidad: '#1D4ED8',
  warn: '#CA8A04',
  warnBg: '#FEFCE8',
};

// ─── Concepto limpio (derivado de descripcion) ───────────────────
// Toma la descripción de Caribe Cool y le quita toda la metadata
// (PNR, ruta, cliente, asiento, coupons, etc) para mostrar solo el
// CONCEPTO del cargo. Ej:
//   "Cambio del billete [0002...] [OW] CUN>HAV [GLADYS] [coupons: [...]]"
//   →  "Cambio del billete"
//   "ASIENTO PRIORITY (Equipaje de mano 15 Kg) [CUN>HAV] [...]"
//   →  "ASIENTO PRIORITY (Equipaje de mano 15 Kg)"
function getConceptoLimpio(descripcion) {
  const raw = String(descripcion || '').trim();
  if (!raw) return { label: '', bg: '#F1F5F9', color: '#475569' };

  // Cortar en el primer [ (donde inicia la metadata)
  const idx = raw.indexOf('[');
  let concepto = idx >= 0 ? raw.slice(0, idx).trim() : raw;

  // Quitar separadores residuales al final
  concepto = concepto.replace(/[:\-\s]+$/, '').trim();

  if (!concepto) return { label: '', bg: '#F1F5F9', color: '#475569' };

  // Detectar tipo para asignar color
  const lower = concepto.toLowerCase();

  // Cancelaciones / Reembolsos → rojo (devuelven dinero)
  if (
    lower.startsWith('cancelación') ||
    lower.startsWith('cancelacion') ||
    lower.startsWith('reembolso') ||
    lower.startsWith('reembolzo')
  ) {
    return { label: concepto, bg: '#FCEBEB', color: '#791F1F' };
  }

  // Penalizaciones / Cambios → ámbar
  if (lower.includes('penaliz') || lower.startsWith('cambio')) {
    return { label: concepto, bg: '#FAEEDA', color: '#854F0B' };
  }

  // Venta del billete = Boleto → azul
  if (lower.startsWith('venta del billete') || lower.startsWith('venta de billete')) {
    return { label: 'Boleto', bg: '#E6F1FB', color: '#0C447C' };
  }

  // Equipaje → verde
  if (lower.includes('equipaje')) {
    return { label: concepto, bg: '#EAF3DE', color: '#27500A' };
  }

  // Mascotas en carga → cian (transporte de animales)
  if (lower.includes('mascota')) {
    return { label: concepto, bg: '#DEF2F4', color: '#0E4F5C' };
  }

  // Asiento priority → morado
  if (lower.includes('asiento')) {
    return { label: concepto, bg: '#EEEDFE', color: '#3C3489' };
  }

  // Default → gris
  return { label: concepto, bg: '#F1F5F9', color: '#475569' };
}

const th = {
  padding: '11px 12px',
  textAlign: 'center',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  position: 'sticky',
  top: 0,
  background: '#042C53',
  color: '#fff',
  zIndex: 5,
};

const td = { padding: '8px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' };

const btnPrimary = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '9px 14px',
  borderRadius: 8,
  background: C.navy,
  color: 'white',
  border: 'none',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 13,
};

const btnSecondary = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '9px 14px',
  borderRadius: 8,
  background: 'white',
  color: C.slate,
  border: `1px solid #CBD5E1`,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 13,
};

const input = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: `1px solid #CBD5E1`,
  fontSize: 13,
  background: 'white',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

// Componente principal ─────────────────────────────────────────────

export default function CaribeCoolModule({ empresaId, user, esConsulta = false }) {
  const [boletos, setBoletos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentReport, setCurrentReport] = useState('caribecool'); // saltamos el index intermedio
  const [activeTab, setActiveTab] = useState('captura'); // 'captura' | 'caja_bancos' | 'movimientos'
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlaza, setFilterPlaza] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterVendedor, setFilterVendedor] = useState('all');
  const [dateField, setDateField] = useState('fecha_venta'); // 'fecha_venta' | 'fecha_cobro'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [importStatus, setImportStatus] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [importDiffOpen, setImportDiffOpen] = useState(false);
  const [importDiff, setImportDiff] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [movimientoModalOpen, setMovimientoModalOpen] = useState(false);
  const [editingMovimientoId, setEditingMovimientoId] = useState(null);
  const [movimientoPrefill, setMovimientoPrefill] = useState(null);
  const [capturaDetailKpi, setCapturaDetailKpi] = useState(null);
  const fileInputRef = useRef(null);

  // Carga inicial desde Supabase
  useEffect(() => {
    if (!empresaId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [bs, ms] = await Promise.all([
          fetchBoletosCC(empresaId),
          fetchMovimientosCC(empresaId),
        ]);
        if (!cancelled) {
          setBoletos(bs);
          setMovimientos(ms);
        }
      } catch (e) {
        console.error('Error cargando datos de Caribe Cool:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [empresaId]);

  // NOTA: en la app real NO guardamos todo el array en cada cambio.
  // Cada operación (crear, editar, borrar) llama directamente a Supabase
  // a través de las funciones de db_caribe_cool.js y actualiza el state local.

  const vendedoresOptions = useMemo(
    () =>
      Array.from(new Set(boletos.map((b) => b.vendedor).filter(Boolean))).sort(),
    [boletos]
  );

  const filtered = useMemo(() => {
    return boletos.filter((b) => {
      if (!matchesSearch(b, searchQuery)) return false;
      if (filterPlaza === 'mex' && b.plaza !== 'MEX') return false;
      if (filterPlaza === 'cuba' && b.plaza !== 'CUBA') return false;
      if (filterPlaza === 'pendiente' && b.plaza) return false;
      if (filterStatus === 'conciliado' && !isConciliado(b)) return false;
      if (filterStatus === 'pendiente' && isConciliado(b)) return false;
      if (filterVendedor !== 'all' && b.vendedor !== filterVendedor)
        return false;
      // Filtro por rango de fechas
      if (dateFrom || dateTo) {
        const raw = b[dateField];
        const d = dateOnly(raw);
        if (!d) return false; // sin fecha → fuera cuando hay filtro de fechas
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
      }
      return true;
    });
  }, [
    boletos,
    searchQuery,
    filterPlaza,
    filterStatus,
    filterVendedor,
    dateField,
    dateFrom,
    dateTo,
  ]);

  const kpis = useMemo(() => {
    const num = filtered.length;
    const totalCosto = filtered.reduce((s, b) => s + (b.costo_usd || 0), 0);
    const conVenta = filtered.filter((b) => b.precio_venta != null);
    const totalVenta = conVenta.reduce(
      (s, b) => s + (b.precio_venta || 0),
      0
    );
    const costoDeConVenta = conVenta.reduce(
      (s, b) => s + (b.costo_usd || 0),
      0
    );
    const totalUtilidad = totalVenta - costoDeConVenta;
    const margen = totalVenta > 0 ? totalUtilidad / totalVenta : null;
    const pendientes = filtered.filter((b) => !isConciliado(b)).length;
    const cancelaciones = filtered.filter(
      (b) => (b.descripcion || '').toLowerCase().startsWith('cancelación')
    ).length;
    return { num, totalVenta, totalCosto, totalUtilidad, margen, pendientes, cancelaciones };
  }, [filtered]);

  async function mergeImported(parsed, skipIds) {
    if (!parsed || parsed.length === 0) {
      setImportStatus({
        ok: false,
        msg: 'No se detectaron boletos en los datos proporcionados.',
      });
      return;
    }
    const skip = skipIds instanceof Set ? skipIds : new Set();
    let nuevos = 0,
      sobrescritos = 0,
      omitidos = 0;
    const toUpsert = [];

    for (const p of parsed) {
      // Modo strict: solo mergear si descripción es 100% idéntica.
      // Un mismo PNR puede tener varios cargos (billete, equipaje, asiento)
      // y NO queremos fusionarlos automáticamente.
      const existing = findExistingBoleto(p, boletos, { strict: true });
      if (existing) {
        if (skip.has(p.id) || skip.has(existing.id)) {
          omitidos++;
          continue;
        }
        toUpsert.push({
          ...p,
          id: existing.id, // mantener UUID existente
          so_mexico: existing.so_mexico || '',
          so_cuba: existing.so_cuba || '',
          forma_pago: existing.forma_pago || '',
          precio_venta: existing.precio_venta,
          fecha_cobro: existing.fecha_cobro || '',
          cliente_pagador: existing.cliente_pagador || '',
          dias_credito:
            existing.dias_credito != null ? existing.dias_credito : null,
          estatus: existing.estatus || '',
          plaza: existing.plaza || '',
          notas: existing.notas || '',
          moneda_cobro: existing.moneda_cobro || 'USD',
          precio_venta_local:
            existing.precio_venta_local != null
              ? existing.precio_venta_local
              : null,
          tipo_cambio:
            existing.tipo_cambio != null ? existing.tipo_cambio : null,
        });
        sobrescritos++;
      } else {
        toUpsert.push({ ...p, id: undefined });
        nuevos++;
      }
    }

    const parts = [];
    if (nuevos) parts.push(`${nuevos} nuevo${nuevos !== 1 ? 's' : ''}`);
    if (sobrescritos)
      parts.push(`${sobrescritos} sobrescrito${sobrescritos !== 1 ? 's' : ''}`);
    if (omitidos)
      parts.push(`${omitidos} omitido${omitidos !== 1 ? 's' : ''}`);

    try {
      if (toUpsert.length > 0) {
        await upsertManyBoletosCC(toUpsert, empresaId);
      }
      const fresh = await fetchBoletosCC(empresaId);
      setBoletos(fresh);
      setImportStatus({
        ok: true,
        msg: `Import OK · ${parts.join(', ') || 'sin cambios'}.`,
      });
    } catch (e) {
      console.error('Error guardando import:', e);
      setImportStatus({
        ok: false,
        msg: 'Error guardando en la base de datos. Intenta de nuevo.',
      });
    }
  }

  // Localiza columnas en headers del Excel — soporta nombres alternativos
  function locateExcelColumns(headers) {
    const norm = headers.map((h) =>
      String(h == null ? '' : h)
        .toLowerCase()
        .trim()
    );
    const find = (...candidates) => {
      for (const c of candidates) {
        const idx = norm.indexOf(c.toLowerCase());
        if (idx >= 0) return idx;
      }
      return -1;
    };
    const cols = {
      // Caribe Cool
      pnr: find('PNR'),
      cliente: find('Cliente'),
      fecha: find('Fecha'),
      descripcion: find('Descripción', 'Descripcion'),
      venta2: find('VENTA2', 'Venta2'),
      transNeg: find('Transacciones negativas'),
      estado: find('Estado de escritura', 'Estado'),
      tipoPago: find('Tipo de pago'),
      vendedor: find('Vendedor'),
      // Pamela / Manuales
      so: find('SO', 'Orden ODOO', 'Orden de Venta'),
      soMexico: find('SO México', 'SO Mexico', 'SO MEX'),
      soCuba: find('SO Cuba', 'SO CU', 'SO Habana'),
      cobro: find(
        'Forma de Pago',
        'Método de Cobro',
        'Metodo de Cobro',
        'COBRO',
        'Cobro'
      ),
      estatus: find('Estatus', 'Status', 'ESTATUS', 'STATUS'),
      ingresosOdoo: find(
        'Precio de Venta (USD)',
        'Precio de Venta',
        'Ingresos ODOO',
        'Ingreos ODOO',
        'Precio Venta'
      ),
      fechaIngreso: find(
        'Fecha de Cobro',
        'Fecha Cobro',
        'Fecha de Ingreso',
        'FECHA DE INGRESO',
        'Fecha Ingreso'
      ),
      clienteCredito: find(
        'Cliente Pagador',
        'Cliente con Crédito',
        'Cliente Crédito',
        'Cliente con Credito',
        'Cliente Credito'
      ),
      diasCredito: find(
        'Días Crédito',
        'Días de Crédito',
        'Dias de Credito',
        'Dias Credito'
      ),
      monedaCobro: find('Moneda Cobro', 'Moneda', 'Currency'),
      precioVentaLocal: find(
        'Precio Local',
        'Precio Venta Local',
        'Precio en Moneda Local'
      ),
      tipoCambio: find('TC', 'Tipo de Cambio', 'Tipo Cambio'),
      plaza: find(
        'Plaza de Venta',
        'Plaza',
        'INGRESO (MEX / HAB)',
        'INGRESO'
      ),
      notas: find('Notas', 'NOTAS'),
    };
    // Detectar formato Pamela: presencia de headers específicos del template
    const hasFormaPago =
      find('Forma de Pago') >= 0;
    const hasEstatus = find('Estatus') >= 0;
    const hasClientePagador =
      find('Cliente Pagador') >= 0 ||
      find('Cliente Crédito') >= 0 ||
      find('Cliente con Crédito') >= 0;
    cols.isPamelaFormat = hasFormaPago && hasEstatus && hasClientePagador;

    // Logging temporal para diagnóstico
    // eslint-disable-next-line no-console
    console.log('[locateExcelColumns] headers:', headers);
    // eslint-disable-next-line no-console
    console.log('[locateExcelColumns] cols mapping:', {
      pnr: cols.pnr,
      cliente: cols.cliente,
      fecha: cols.fecha,
      descripcion: cols.descripcion,
      venta2: cols.venta2,
      transNeg: cols.transNeg,
      so: cols.so,
      soMexico: cols.soMexico,
      soCuba: cols.soCuba,
      cobro: cols.cobro,
      ingresosOdoo: cols.ingresosOdoo,
      fechaIngreso: cols.fechaIngreso,
      clienteCredito: cols.clienteCredito,
      diasCredito: cols.diasCredito,
      estatus: cols.estatus,
      plaza: cols.plaza,
      notas: cols.notas,
      isPamelaFormat: cols.isPamelaFormat,
    });
    return cols;
  }

  // Convierte una fila del Excel a un "patch" con solo los campos detectados
  function rowToPatch(r, cols) {
    if (!r || cols.pnr < 0 || !r[cols.pnr]) return null;
    const has = (idx) =>
      idx >= 0 && r[idx] != null && String(r[idx]).trim() !== '';
    const patch = { pnr: String(r[cols.pnr]).trim().toUpperCase() };

    // Caribe Cool fields
    if (has(cols.cliente)) patch.cliente = String(r[cols.cliente]).trim();
    if (has(cols.fecha)) {
      const d = excelDateToISO(r[cols.fecha]);
      if (d) patch.fecha_venta = d;
    }
    if (has(cols.descripcion)) {
      patch.descripcion = String(r[cols.descripcion]).trim();
      const d = parseDescripcion(patch.descripcion);
      if (d.tipo_viaje) patch.tipo_viaje = d.tipo_viaje;
      if (d.ruta) patch.ruta = d.ruta;
    }
    if (has(cols.venta2)) {
      const v = parseVenta2(String(r[cols.venta2]));
      if (v.amount != null) {
        patch.costo_usd = v.amount;
        patch.moneda_costo = v.currency || 'USD';
      }
    }
    // ───────── Transacciones Negativas (Caribe Cool) ─────────
    if (has(cols.transNeg)) {
      const raw = String(r[cols.transNeg]).trim();
      // Solo guarda si tiene un valor "real" (no vacío, no cero)
      if (raw && raw !== '0' && raw !== '0.00' && raw !== '-') {
        patch.trans_negativa = raw;
      }
    }
    if (has(cols.estado)) patch.estado_caribe = String(r[cols.estado]).trim();
    if (has(cols.tipoPago))
      patch.tipo_pago_caribe = String(r[cols.tipoPago]).trim();
    if (has(cols.vendedor)) patch.vendedor = String(r[cols.vendedor]).trim();

    // Plaza primero (otros campos dependen de ella)
    if (has(cols.plaza)) {
      const p = normalizePlaza(r[cols.plaza]);
      if (p) patch.plaza = p;
    }

    // Manual fields (Pamela)
    // ───────── SO: prefer separate columns, fallback to legacy compound ─────────
    if (has(cols.soMexico)) {
      patch.so_mexico = String(r[cols.soMexico]).trim();
    }
    if (has(cols.soCuba)) {
      patch.so_cuba = String(r[cols.soCuba]).trim();
    }
    if (cols.soMexico < 0 && cols.soCuba < 0 && has(cols.so)) {
      // Legacy: parsea formato compuesto "SO42701CU/SO42704MEX"
      const so = parseSoField(r[cols.so], patch.plaza);
      patch.so_mexico = so.so_mexico;
      patch.so_cuba = so.so_cuba;
    }
    // ───────── Forma de Pago ─────────
    if (has(cols.cobro)) {
      const c = normalizeFormaPago(r[cols.cobro]);
      patch.forma_pago = c.value;
      if (!c.recognized) {
        if (!patch._unrecognizedFormas) patch._unrecognizedFormas = [];
        patch._unrecognizedFormas.push(c.value);
      }
    }
    // ───────── Estatus ─────────
    if (has(cols.estatus)) {
      const s = String(r[cols.estatus]).trim().toUpperCase();
      if (ESTATUS_OPCIONES.includes(s)) patch.estatus = s;
    }
    // ───────── Precio de Venta ─────────
    if (has(cols.ingresosOdoo)) {
      const raw = String(r[cols.ingresosOdoo])
        .replace(/[^\d.,-]/g, '')
        .replace(',', '.');
      const v = parseFloat(raw);
      if (!isNaN(v)) patch.precio_venta = v;
    }
    // ───────── Cliente Crédito / Días Crédito ─────────
    // Si existen columnas separadas, usarlas directamente
    if (has(cols.clienteCredito)) {
      patch.cliente_pagador = String(r[cols.clienteCredito]).trim();
    }
    if (has(cols.diasCredito)) {
      const v = parseInt(r[cols.diasCredito]);
      if (!isNaN(v)) patch.dias_credito = v;
    }
    // ───────── Fecha de Ingreso ─────────
    if (has(cols.fechaIngreso)) {
      // Si hay columnas separadas de crédito, solo trata como fecha
      const hasCreditCols =
        cols.clienteCredito >= 0 || cols.diasCredito >= 0;
      if (hasCreditCols) {
        const d = excelDateToISO(r[cols.fechaIngreso]);
        if (d) patch.fecha_cobro = dateOnly(d);
      } else {
        // Legacy: puede contener texto "CLIENTE CREDITO X DIAS"
        const parsed = parseFechaIngresoOrCredit(r[cols.fechaIngreso]);
        if (parsed.fecha_cobro)
          patch.fecha_cobro = parsed.fecha_cobro;
        if (parsed.cliente_pagador)
          patch.cliente_pagador = parsed.cliente_pagador;
        if (parsed.dias_credito != null)
          patch.dias_credito = parsed.dias_credito;
      }
    }
    if (has(cols.notas)) patch.notas = String(r[cols.notas]).trim();

    // ───────── Moneda de cobro / TC ─────────
    if (has(cols.monedaCobro)) {
      const m = String(r[cols.monedaCobro]).trim().toUpperCase();
      if (m === 'USD' || m === 'MXN') patch.moneda_cobro = m;
    }
    if (has(cols.precioVentaLocal)) {
      const raw = String(r[cols.precioVentaLocal])
        .replace(/[^\d.,-]/g, '')
        .replace(',', '.');
      const v = parseFloat(raw);
      if (!isNaN(v)) patch.precio_venta_local = v;
    }
    if (has(cols.tipoCambio)) {
      const raw = String(r[cols.tipoCambio])
        .replace(/[^\d.,-]/g, '')
        .replace(',', '.');
      const v = parseFloat(raw);
      if (!isNaN(v) && v > 0) patch.tipo_cambio = v;
    }

    // Derivamos el id natural (pnr + descripcion)
    patch.id = makeBoletoId(patch.pnr, patch.descripcion || '');

    // Log temporal: primera fila procesada para diagnóstico
    if (patch.pnr && !window.__loggedFirstPatch) {
      window.__loggedFirstPatch = true;
      // eslint-disable-next-line no-console
      console.log('[rowToPatch] raw row:', r);
      // eslint-disable-next-line no-console
      console.log('[rowToPatch] patch result:', patch);
    }

    return patch;
  }

  // Para Excel formato Pamela: calcula el diff entre lo que viene en el Excel
  // y lo que ya está en la app. Retorna 3 categorías:
  //   matches  — boleto existe en la app: data manual del Excel se podrá aplicar
  //   orphans  — boleto NO existe en la app (Pamela lo tiene, nosotros no)
  //   missing  — en la app pero NO en el Excel (Pamela no lo procesó)
  //
  // Matching robusto en 3 estrategias (ver findExistingBoleto):
  //   1. exact:  pnr + descripción completa
  //   2. loose:  pnr + descripción sin nombre del pasajero entre [...]
  //   3. pnr:    si solo hay 1 boleto con ese PNR, asumir match
  //
  // NOTA: Este flujo SÍ usa estrategias laxas porque Pamela a veces manda
  // la descripción con [NOMBRE PASAJERO] adicional que no está en lo que
  // pegamos directo de Caribe Cool. Para el pegado/Excel raw usamos modo
  // strict (solo coincidencia exacta).
  function buildDiff(patches, existingBoletos) {
    const matches = [];
    const orphans = [];
    const matchedExistingIds = new Set(); // Para detectar "missing"

    const MANUAL_KEYS = [
      'so_mexico',
      'so_cuba',
      'forma_pago',
      'precio_venta',
      'fecha_cobro',
      'cliente_pagador',
      'dias_credito',
      'estatus',
      'plaza',
      'notas',
      'moneda_cobro',
      'precio_venta_local',
      'tipo_cambio',
      'trans_negativa',
    ];

    const cobrosDesconocidos = new Set();

    // Diagnóstico: muestra primer match/no-match en consola para debug
    let diagPrinted = 0;
    const MAX_DIAG = 3;

    for (const p of patches) {
      if (p._unrecognizedFormas) {
        p._unrecognizedFormas.forEach((c) => cobrosDesconocidos.add(c));
      }
      // Excluir boletos ya matchados por filas anteriores del Excel
      // (evita que Postgres rechace upsert por ON CONFLICT duplicado)
      const candidatos = existingBoletos.filter((b) => !matchedExistingIds.has(b.id));
      const existing = findExistingBoleto(p, candidatos);

      // Log diagnóstico de los primeros casos
      if (diagPrinted < MAX_DIAG) {
        // eslint-disable-next-line no-console
        console.log(
          `[buildDiff] PNR=${p.pnr} desc="${(p.descripcion || '').slice(0, 80)}" → ` +
            (existing
              ? `MATCH (existing.id=${existing.id?.slice(0, 8)}..., existing.desc="${(existing.descripcion || '').slice(0, 80)}")`
              : 'NO MATCH (huérfano)')
        );
        diagPrinted++;
      }

      // Construir el patch manual (solo MANUAL_KEYS con valores presentes)
      const manualPatch = {};
      const changes = [];
      for (const k of MANUAL_KEYS) {
        if (p[k] !== undefined && p[k] !== null && p[k] !== '') {
          manualPatch[k] = p[k];
          const prev = existing ? existing[k] : null;
          const prevStr = prev == null || prev === '' ? '' : String(prev);
          const newStr = String(p[k]);
          if (prevStr !== newStr) {
            changes.push({ field: k, prev: prevStr, next: newStr });
          }
        }
      }
      if (existing) {
        matchedExistingIds.add(existing.id);
        matches.push({
          id: existing.id, // UUID real de Supabase
          pnr: p.pnr,
          existing,
          manualPatch,
          changes,
        });
      } else {
        // Huérfano: tomamos todos los campos del Excel para crear nuevo si así
        // decide el usuario. El `id` aquí es solo para identificar la fila
        // en el modal (checkbox), no es un UUID de DB.
        orphans.push({
          id: p.id || makeBusinessId(p.pnr, p.descripcion),
          pnr: p.pnr,
          fullPatch: p,
        });
      }
    }

    // Faltantes: en la app pero no fueron matched por ningún patch
    const missing = existingBoletos.filter((b) => !matchedExistingIds.has(b.id));

    // eslint-disable-next-line no-console
    console.log(
      `[buildDiff] Resumen: ${matches.length} matches, ${orphans.length} huérfanos, ${missing.length} faltantes (en app, no en Excel)`
    );

    return {
      matches,
      orphans,
      missing,
      cobrosDesconocidos: [...cobrosDesconocidos],
    };
  }

  // Aplica los cambios decididos en el diff modal
  async function applyPamelaDiff(applyMatches, createOrphans) {
    let actualizados = 0;
    let creados = 0;
    const toUpsert = [];

    // Aplicar matches: merge solo MANUAL_KEYS
    for (const m of applyMatches) {
      const existing = boletos.find((b) => b.id === m.id);
      if (!existing) continue;
      const merged = { ...existing, ...m.manualPatch };
      toUpsert.push(merged);
      actualizados++;
    }

    // Crear huérfanos como nuevos boletos
    for (const o of createOrphans) {
      const p = o.fullPatch;
      toUpsert.push({
        // No mandamos id — Supabase asigna UUID
        pnr: p.pnr,
        cliente: p.cliente || '',
        fecha_venta: p.fecha_venta || null,
        descripcion: p.descripcion || '',
        tipo_viaje: p.tipo_viaje || null,
        ruta: p.ruta || null,
        costo_usd: p.costo_usd != null ? p.costo_usd : null,
        moneda_costo: p.moneda_costo || 'USD',
        estado_caribe: p.estado_caribe || '',
        tipo_pago_caribe: p.tipo_pago_caribe || '',
        vendedor: p.vendedor || '',
        trans_negativa: p.trans_negativa || null,
        so_mexico: p.so_mexico || '',
        so_cuba: p.so_cuba || '',
        forma_pago: p.forma_pago || '',
        precio_venta: p.precio_venta != null ? p.precio_venta : null,
        fecha_cobro: p.fecha_cobro || '',
        cliente_pagador: p.cliente_pagador || '',
        dias_credito: p.dias_credito != null ? p.dias_credito : null,
        estatus: p.estatus || '',
        plaza: p.plaza || '',
        notas: p.notas || '',
        moneda_cobro: p.moneda_cobro || 'USD',
        precio_venta_local:
          p.precio_venta_local != null ? p.precio_venta_local : null,
        tipo_cambio: p.tipo_cambio != null ? p.tipo_cambio : null,
      });
      creados++;
    }

    const parts = [];
    if (actualizados > 0)
      parts.push(`${actualizados} actualizado${actualizados !== 1 ? 's' : ''}`);
    if (creados > 0) parts.push(`${creados} creado${creados !== 1 ? 's' : ''}`);
    const msg = parts.length
      ? `Import OK · ${parts.join(', ')}.`
      : 'Sin cambios.';

    try {
      if (toUpsert.length > 0) {
        await upsertManyBoletosCC(toUpsert, empresaId);
      }
      const fresh = await fetchBoletosCC(empresaId);
      setBoletos(fresh);
      setImportStatus({ ok: true, msg });
    } catch (e) {
      console.error('Error aplicando diff Pamela:', e);
      setImportStatus({
        ok: false,
        msg: 'Error guardando en la base de datos. Intenta de nuevo.',
      });
    }
    setImportDiffOpen(false);
    setImportDiff(null);
  }

  // Aplica patches: solo toca los campos que vienen en cada patch
  async function mergeSmart(patches) {
    if (!patches || patches.length === 0) {
      setImportStatus({
        ok: false,
        msg: 'No se detectaron filas con PNR en el Excel.',
      });
      return;
    }
    let nuevos = 0,
      actualizados = 0,
      sinCambios = 0;
    let manualFields = 0;
    let caribeFields = 0;

    const MANUAL_KEYS = [
      'so_mexico',
      'so_cuba',
      'forma_pago',
      'precio_venta',
      'fecha_cobro',
      'cliente_pagador',
      'dias_credito',
      'estatus',
      'plaza',
      'notas',
      'moneda_cobro',
      'precio_venta_local',
      'tipo_cambio',
      'trans_negativa',
    ];
    const cobrosDesconocidos = new Set();
    const CARIBE_KEYS = [
      'cliente',
      'fecha_venta',
      'descripcion',
      'tipo_viaje',
      'ruta',
      'costo_usd',
      'estado_caribe',
      'tipo_pago_caribe',
      'vendedor',
    ];

    const toUpsert = [];

    for (const p of patches) {
      if (p._unrecognizedFormas) {
        p._unrecognizedFormas.forEach((c) => cobrosDesconocidos.add(c));
      }
      const hasManual = MANUAL_KEYS.some((k) => p[k] !== undefined);
      const hasCaribe = CARIBE_KEYS.some((k) => p[k] !== undefined);
      if (hasManual) manualFields++;
      if (hasCaribe) caribeFields++;

      // Usar findExistingBoleto en modo STRICT (solo match exacto).
      // Un mismo PNR puede tener varios cargos distintos (billete, equipaje,
      // asiento, reproteccion). NO queremos fusionarlos automáticamente.
      const existing = findExistingBoleto(p, boletos, { strict: true });

      if (existing) {
        const merged = { ...existing, ...p };
        delete merged._unrecognizedFormas;
        const changed = Object.keys(p).some(
          (k) =>
            k !== 'id' &&
            k !== 'pnr' &&
            k !== '_unrecognizedFormas' &&
            String(existing[k] == null ? '' : existing[k]) !==
              String(p[k] == null ? '' : p[k])
        );
        if (changed) {
          toUpsert.push({ ...merged, id: existing.id });
          actualizados++;
        } else {
          sinCambios++;
        }
      } else {
        toUpsert.push({
          pnr: p.pnr,
          cliente: p.cliente || '',
          fecha_venta: p.fecha_venta || null,
          descripcion: p.descripcion || '',
          tipo_viaje: p.tipo_viaje || null,
          ruta: p.ruta || null,
          costo_usd: p.costo_usd != null ? p.costo_usd : null,
          moneda_costo: p.moneda_costo || 'USD',
          estado_caribe: p.estado_caribe || '',
          tipo_pago_caribe: p.tipo_pago_caribe || '',
          vendedor: p.vendedor || '',
          trans_negativa: null,
          so_mexico: p.so_mexico || '',
          so_cuba: p.so_cuba || '',
          forma_pago: p.forma_pago || '',
          precio_venta: p.precio_venta != null ? p.precio_venta : null,
          fecha_cobro: p.fecha_cobro || '',
          cliente_pagador: p.cliente_pagador || '',
          dias_credito: p.dias_credito != null ? p.dias_credito : null,
          estatus: p.estatus || '',
          plaza: p.plaza || '',
          notas: p.notas || '',
          moneda_cobro: p.moneda_cobro || 'USD',
          precio_venta_local:
            p.precio_venta_local != null ? p.precio_venta_local : null,
          tipo_cambio: p.tipo_cambio != null ? p.tipo_cambio : null,
        });
        nuevos++;
      }
    }

    const parts = [];
    if (nuevos > 0) parts.push(`${nuevos} nuevo${nuevos !== 1 ? 's' : ''}`);
    if (actualizados > 0)
      parts.push(`${actualizados} actualizado${actualizados !== 1 ? 's' : ''}`);
    if (sinCambios > 0)
      parts.push(`${sinCambios} sin cambio${sinCambios !== 1 ? 's' : ''}`);
    let msg = `Import OK · ${parts.join(', ')}`;
    const tags = [];
    if (caribeFields > 0) tags.push(`${caribeFields} con datos de Caribe Cool`);
    if (manualFields > 0) tags.push(`${manualFields} con datos manuales`);
    if (tags.length) msg += ` · ${tags.join(', ')}`;
    msg += '.';
    if (cobrosDesconocidos.size > 0) {
      msg += ` ⚠ COBROS no reconocidos: ${[...cobrosDesconocidos]
        .map((c) => `"${c}"`)
        .join(', ')} (corrígelos en el Excel y vuelve a importar).`;
    }

    try {
      if (toUpsert.length > 0) {
        await upsertManyBoletosCC(toUpsert, empresaId);
      }
      const fresh = await fetchBoletosCC(empresaId);
      setBoletos(fresh);
      setImportStatus({ ok: true, msg });
    } catch (e) {
      console.error('Error en mergeSmart:', e);
      setImportStatus({
        ok: false,
        msg: 'Error guardando en la base de datos. Intenta de nuevo.',
      });
    }
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    window.__loggedFirstPatch = false; // reset para que log salga cada import
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });

        let headerIdx = -1;
        for (let i = 0; i < rows.length; i++) {
          if (rows[i] && rows[i].some((c) => c === 'PNR')) {
            headerIdx = i;
            break;
          }
        }
        if (headerIdx < 0) {
          setImportStatus({
            ok: false,
            msg: 'No encontré la fila de headers con "PNR" en el Excel.',
          });
          return;
        }
        const headers = rows[headerIdx];
        const cols = locateExcelColumns(headers);

        const patches = [];
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const p = rowToPatch(rows[i], cols);
          if (p) patches.push(p);
        }

        if (cols.isPamelaFormat) {
          // Excel de Pamela: mostrar diff antes de aplicar
          const diff = buildDiff(patches, boletos);
          setImportDiff(diff);
          setImportDiffOpen(true);
        } else {
          // Excel raw de Caribe Cool: aplicar directo (flujo anterior)
          mergeSmart(patches);
        }
      } catch (err) {
        console.error(err);
        setImportStatus({
          ok: false,
          msg: 'Error al parsear el Excel: ' + err.message,
        });
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  async function updateBoleto(id, changes) {
    // Optimistic update local
    setBoletos((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...changes } : b))
    );
    // Persistir a Supabase
    try {
      const updated = await updateBoletoCCFields(id, changes);
      if (updated) {
        setBoletos((prev) => prev.map((b) => (b.id === id ? updated : b)));
      }
    } catch (e) {
      console.error('Error guardando boleto:', e);
      alert('⚠ Error guardando los cambios. Intenta de nuevo.');
      const fresh = await fetchBoletosCC(empresaId);
      setBoletos(fresh);
    }
  }

  // ─── CRUD Movimientos ──────────────────────────────────────────────
  async function saveMovimiento(mov) {
    try {
      const saved = await upsertMovimientoCC(mov, empresaId);
      if (mov.id) {
        setMovimientos((prev) =>
          prev.map((m) => (m.id === mov.id ? saved : m))
        );
      } else {
        setMovimientos((prev) => [...prev, saved]);
      }
    } catch (e) {
      console.error('Error guardando movimiento:', e);
      alert('⚠ Error guardando el movimiento. Intenta de nuevo.');
    }
    setMovimientoModalOpen(false);
    setEditingMovimientoId(null);
    setMovimientoPrefill(null);
  }

  async function deleteMovimiento(id) {
    setMovimientos((prev) => prev.filter((m) => m.id !== id));
    try {
      await deleteMovimientoCC(id);
    } catch (e) {
      console.error('Error borrando movimiento:', e);
      alert('⚠ Error borrando el movimiento.');
      const fresh = await fetchMovimientosCC(empresaId);
      setMovimientos(fresh);
    }
  }

  async function doReset() {
    // En la app real "reset" es destructivo de DB: borra TODOS los boletos
    // y movimientos de la empresa. Doble confirmación obligatoria.
    if (
      !window.confirm(
        '⚠ Esto BORRARÁ permanentemente TODOS los boletos y movimientos de Caribe Cool de esta empresa.\n\n¿Estás seguro?'
      )
    ) {
      setConfirmReset(false);
      return;
    }
    if (
      !window.confirm(
        '⚠⚠ Última confirmación: esto NO se puede deshacer. ¿Continuar?'
      )
    ) {
      setConfirmReset(false);
      return;
    }
    try {
      const allIds = boletos.map((b) => b.id);
      if (allIds.length > 0) await deleteManyBoletosCC(allIds);
      for (const m of movimientos) {
        await deleteMovimientoCC(m.id);
      }
      setBoletos([]);
      setMovimientos([]);
    } catch (e) {
      console.error('Error en reset:', e);
      alert('⚠ Hubo errores borrando los datos. Recarga la página.');
    }
    setImportStatus(null);
    setConfirmReset(false);
    setSelectedIds(new Set());
  }

  function navigateToIndex() {
    setEditingId(null);
    setPasteModalOpen(false);
    setConfirmReset(false);
    setDeleteConfirmOpen(false);
    setImportDiffOpen(false);
    setImportDiff(null);
    setMovimientoModalOpen(false);
    setEditingMovimientoId(null);
    setMovimientoPrefill(null);
    setSelectedIds(new Set());
    setCurrentReport(null);
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function toggleAllFiltered() {
    const allSelected =
      filtered.length > 0 && filtered.every((b) => selectedIds.has(b.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        filtered.forEach((b) => next.delete(b.id));
      } else {
        filtered.forEach((b) => next.add(b.id));
      }
      return next;
    });
  }

  async function confirmDelete() {
    const toDelete = new Set(selectedIds);
    const ids = Array.from(toDelete);
    setBoletos((prev) => prev.filter((b) => !toDelete.has(b.id)));
    setSelectedIds(new Set());
    setDeleteConfirmOpen(false);
    try {
      await deleteManyBoletosCC(ids);
      setImportStatus({
        ok: true,
        msg: `Eliminado${toDelete.size !== 1 ? 's' : ''} ${
          toDelete.size
        } boleto${toDelete.size !== 1 ? 's' : ''}.`,
      });
    } catch (e) {
      console.error('Error borrando boletos:', e);
      alert('⚠ Error borrando boletos. Recargando datos...');
      const fresh = await fetchBoletosCC(empresaId);
      setBoletos(fresh);
    }
  }

  const editing = boletos.find((b) => b.id === editingId);

  // Loading inicial (mientras se carga de Supabase)
  if (loading) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: 'center',
          color: '#64748B',
          fontSize: 14,
        }}
      >
        Cargando boletos de Caribe Cool...
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Title bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 18,
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 800,
              color: C.navy,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}
          >
            Caribe Cool · Boletería
          </h1>
          <div style={{ color: C.slate, fontSize: 13, marginTop: 4 }}>
            Concentrador de boletos · Viajes Libero
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ ...btnPrimary, background: '#16A34A' }}
          >
            <Upload size={15} /> Importar Excel
          </button>
          <button
            onClick={() => setPasteModalOpen(true)}
            style={{ ...btnPrimary, background: '#7C3AED' }}
          >
            <ClipboardPaste size={15} /> Pegar texto
          </button>
          {confirmReset ? (
            <>
              <span style={{ fontSize: 12, color: C.costo, fontWeight: 600 }}>
                ¿Borrar todo?
              </span>
              <button
                onClick={doReset}
                style={{ ...btnPrimary, background: C.costo, padding: '7px 10px' }}
              >
                Sí, restaurar
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                style={{ ...btnSecondary, padding: '7px 10px' }}
              >
                No
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              style={btnSecondary}
              title="Restaurar a los 3 boletos de muestra"
            >
              <RotateCcw size={14} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Import status banner */}
      {importStatus && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            marginBottom: 16,
            background: importStatus.ok ? '#ECFDF5' : '#FEF2F2',
            color: importStatus.ok ? '#065F46' : '#991B1B',
            border: `1px solid ${importStatus.ok ? '#A7F3D0' : '#FECACA'}`,
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            justifyContent: 'space-between',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileSpreadsheet size={16} />
            {importStatus.msg}
          </span>
          <button
            onClick={() => setImportStatus(null)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'inherit',
              padding: 0,
              display: 'flex',
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: `1px solid ${C.border}`,
          marginBottom: 18,
        }}
      >
        {[
          { id: 'captura', label: 'Captura', icon: '📝' },
          { id: 'caja_bancos', label: 'Caja & Bancos', icon: '💰' },
          { id: 'movimientos', label: 'Movimientos', icon: '📦' },
          { id: 'cuenta_cc', label: 'Caribe Cool', icon: '🔻' },
          { id: 'reporte_diario', label: 'Reporte Diario', icon: '📤' },
          { id: 'reporte_semanal', label: 'Reporte Semanal', icon: '📅' },
        ].map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 18px',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${active ? C.navy : 'transparent'}`,
                color: active ? C.navy : C.muted,
                fontWeight: active ? 700 : 500,
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: -1,
              }}
            >
              <span style={{ fontSize: 15 }}>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Vista Caja & Bancos */}
      {activeTab === 'caja_bancos' && (
        <CajaYBancos
          boletos={boletos}
          movimientos={movimientos}
          dateFrom={dateFrom}
          dateTo={dateTo}
          dateField={dateField}
          onChangeRange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
          onChangeDateField={setDateField}
          presetRange={presetRange}
        />
      )}

      {/* Vista Movimientos */}
      {activeTab === 'movimientos' && (
        <MovimientosView
          movimientos={movimientos}
          onOpenNew={() => {
            setEditingMovimientoId(null);
            setMovimientoModalOpen(true);
          }}
          onEdit={(id) => {
            setEditingMovimientoId(id);
            setMovimientoModalOpen(true);
          }}
          onDelete={deleteMovimiento}
        />
      )}

      {/* Vista Estado de Cuenta Caribe Cool */}
      {activeTab === 'cuenta_cc' && (
        <EstadoCuentaCaribeCool
          boletos={boletos}
          movimientos={movimientos}
          presetRange={presetRange}
          onOpenNewRecarga={() => {
            setEditingMovimientoId(null);
            setMovimientoPrefill({
              caja_destino: 'caribe_cool',
              moneda: 'USD',
            });
            setMovimientoModalOpen(true);
          }}
          onOpenSaldoInicial={() => {
            setEditingMovimientoId(null);
            setMovimientoPrefill({
              caja_origen: 'aporte_socio',
              caja_destino: 'caribe_cool',
              moneda: 'USD',
              nota: 'Saldo inicial',
            });
            setMovimientoModalOpen(true);
          }}
        />
      )}

      {/* Vista Reporte Diario */}
      {activeTab === 'reporte_diario' && (
        <ReporteDiario
          boletos={boletos}
          movimientos={movimientos}
          onEditBoleto={(id) => setEditingId(id)}
        />
      )}

      {/* Vista Reporte Semanal */}
      {activeTab === 'reporte_semanal' && (
        <ReporteSemanal boletos={boletos} />
      )}

      {/* Vista Captura: KPIs + Filtros + Tabla */}
      {activeTab === 'captura' && (
      <>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gap: 10,
          marginBottom: 16,
        }}
      >
        <KpiClickable onClick={() => setCapturaDetailKpi('boletos_total')}>
          <KpiCard label="Boletos" value={kpis.num} accent={C.navy} />
        </KpiClickable>
        <KpiClickable onClick={() => setCapturaDetailKpi('venta_total')}>
          <KpiCard
            label="Venta total"
            value={`$${fmt(kpis.totalVenta)}`}
            accent={C.venta}
            subtitle="USD"
          />
        </KpiClickable>
        <KpiClickable onClick={() => setCapturaDetailKpi('costo_total')}>
          <KpiCard
            label="Costo total"
            value={`$${fmt(kpis.totalCosto)}`}
            accent={C.costo}
            subtitle="USD"
          />
        </KpiClickable>
        <KpiClickable onClick={() => setCapturaDetailKpi('utilidad_total')}>
          <KpiCard
            label="Utilidad"
            value={`$${fmt(kpis.totalUtilidad)}`}
            accent={C.utilidad}
            subtitle="USD (solo conciliados)"
          />
        </KpiClickable>
        <KpiCard
          label="% Margen"
          value={fmtPct(kpis.margen)}
          accent="#7C3AED"
        />
        <KpiClickable onClick={() => setCapturaDetailKpi('pendientes')}>
          <KpiCard
            label="Pendientes"
            value={kpis.pendientes}
            accent="#EA580C"
            subtitle="sin conciliar"
          />
        </KpiClickable>
      </div>

      {/* Search + Filter bar */}
      <div
        style={{
          background: 'white',
          borderRadius: 10,
          border: `1px solid ${C.border}`,
          marginBottom: 12,
          overflow: 'hidden',
        }}
      >
        {/* Search row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderBottom: `1px solid ${C.border}`,
            background: C.bgSoft,
          }}
        >
          <Search size={17} color={C.muted} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar PNR, cliente, ruta, monto, vendedor, SO, cobro, notas…"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 14,
              color: C.navy,
              fontFamily: 'inherit',
              padding: 0,
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: C.muted,
                padding: 4,
                display: 'flex',
                alignItems: 'center',
              }}
              title="Limpiar búsqueda"
            >
              <X size={15} />
            </button>
          )}
          {searchQuery && (
            <span
              style={{
                fontSize: 11,
                color: C.muted,
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Filters row */}
        <div
          style={{
            display: 'flex',
            gap: 14,
            alignItems: 'center',
            flexWrap: 'wrap',
            padding: '11px 14px',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <Filter size={15} color={C.muted} />
          <FilterSelect
            label="Plaza"
            value={filterPlaza}
            onChange={setFilterPlaza}
            options={[
              { v: 'all', l: 'Todas' },
              { v: 'mex', l: 'México' },
              { v: 'cuba', l: 'Cuba' },
              { v: 'pendiente', l: 'Sin plaza' },
            ]}
          />
          <FilterSelect
            label="Estado"
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { v: 'all', l: 'Todos' },
              { v: 'conciliado', l: '✓ Conciliados' },
              { v: 'pendiente', l: '○ Pendientes' },
            ]}
          />
          <FilterSelect
            label="Vendedor"
            value={filterVendedor}
            onChange={setFilterVendedor}
            options={[
              { v: 'all', l: 'Todos' },
              ...vendedoresOptions.map((v) => ({ v, l: v })),
            ]}
          />
          <div
            style={{
              marginLeft: 'auto',
              fontSize: 12,
              color: C.muted,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            {rangeLabel(dateFrom, dateTo) && (
              <span
                style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 99,
                  background: '#EDE9FE',
                  color: '#5B21B6',
                  fontWeight: 700,
                }}
              >
                📅 {rangeLabel(dateFrom, dateTo)}
              </span>
            )}
            <span>
              Mostrando{' '}
              <strong style={{ color: C.navy }}>{filtered.length}</strong> de{' '}
              {boletos.length}
            </span>
          </div>
        </div>

        {/* Date filter row */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
            padding: '10px 14px',
            background: '#FAFBFF',
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: C.muted,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            📅 Periodo:
          </span>
          {[
            { k: 'today', l: 'Hoy' },
            { k: 'thisWeek', l: 'Esta semana' },
            { k: 'thisMonth', l: 'Este mes' },
            { k: 'lastMonth', l: 'Mes pasado' },
            { k: 'last30', l: 'Últimos 30 días' },
            { k: 'thisYear', l: 'Este año' },
            { k: 'all', l: 'Todo' },
          ].map((p) => {
            const { from, to } = presetRange(p.k);
            const active = dateFrom === from && dateTo === to;
            return (
              <button
                key={p.k}
                onClick={() => {
                  setDateFrom(from);
                  setDateTo(to);
                }}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: `1px solid ${active ? C.navy : '#CBD5E1'}`,
                  background: active ? C.navy : 'white',
                  color: active ? 'white' : C.slate,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {p.l}
              </button>
            );
          })}
          <span
            style={{
              width: 1,
              height: 22,
              background: C.border,
              margin: '0 4px',
            }}
          />
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onChange={(f, t) => {
              setDateFrom(f);
              setDateTo(t);
            }}
          />
          <span
            style={{
              width: 1,
              height: 22,
              background: C.border,
              margin: '0 4px',
            }}
          />
          <label
            style={{
              fontSize: 11,
              color: C.slate,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Por:
            <select
              value={dateField}
              onChange={(e) => setDateField(e.target.value)}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                background: 'white',
                fontSize: 12,
                color: C.navy,
                fontFamily: 'inherit',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              <option value="fecha_venta">Fecha de venta</option>
              <option value="fecha_cobro">Fecha de ingreso</option>
            </select>
          </label>
        </div>
      </div>

      {/* Selection bar */}
      {selectedIds.size > 0 && (
        <div
          style={{
            background: '#0F172A',
            color: 'white',
            borderRadius: 10,
            padding: '11px 16px',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
            boxShadow: '0 4px 12px -2px rgba(15, 23, 42, 0.3)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
            }}
          >
            <CheckCircle2 size={16} />
            <strong style={{ fontSize: 15 }}>{selectedIds.size}</strong>
            <span style={{ opacity: 0.85 }}>
              boleto{selectedIds.size !== 1 ? 's' : ''} seleccionado
              {selectedIds.size !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={clearSelection}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.3)',
                color: 'white',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Limpiar selección
            </button>
            <button
              onClick={() => setDeleteConfirmOpen(true)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                background: C.costo,
                border: '1px solid ' + C.costo,
                color: 'white',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Trash2 size={13} /> Eliminar {selectedIds.size}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div
        style={{
          background: 'white',
          borderRadius: 12,
          overflow: 'hidden',
          border: `1px solid ${C.border}`,
        }}
      >
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 380px)', minHeight: 300 }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 14,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
              minWidth: 1100,
            }}
          >
            <thead>
              <tr style={{ background: C.navy, color: 'white' }}>
                <th style={{ ...th, width: 36, padding: '11px 6px' }}>
                  <input
                    type="checkbox"
                    checked={
                      filtered.length > 0 &&
                      filtered.every((b) => selectedIds.has(b.id))
                    }
                    ref={(el) => {
                      if (el) {
                        const allSel =
                          filtered.length > 0 &&
                          filtered.every((b) => selectedIds.has(b.id));
                        const someSel =
                          !allSel &&
                          filtered.some((b) => selectedIds.has(b.id));
                        el.indeterminate = someSel;
                      }
                    }}
                    onChange={toggleAllFiltered}
                    style={{ cursor: 'pointer', accentColor: '#7C3AED' }}
                    title="Seleccionar todos los visibles"
                  />
                </th>
                <th style={{ ...th, width: 30 }}></th>
                <th style={th}>PNR</th>
                <th style={th}>Cliente</th>
                <th style={th}>Concepto</th>
                <th style={th}>Fecha de Venta</th>
                <th style={th}>Ruta</th>
                <th style={th}>Tipo de Viaje</th>
                <th style={th}>Vendedor</th>
                <th style={th}>Costo</th>
                <th style={th}>Transacciones Negativas</th>
                <th style={th}>Precio de Venta</th>
                <th style={th}>Utilidad</th>
                <th style={th}>Plaza de Venta</th>
                <th style={th}>SO México</th>
                <th style={th}>SO Cuba</th>
                <th style={th}>Forma de Pago</th>
                <th style={th}>Cliente Pagador</th>
                <th style={th}>Días Crédito</th>
                <th style={th}>Estatus</th>
                <th style={th}>Fecha de Cobro</th>
                <th style={th}>Moneda</th>
                <th style={th}>Precio Local</th>
                <th style={th}>Tipo de Cambio</th>
                <th style={{ ...th, width: 30 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={24}
                    style={{
                      padding: 40,
                      textAlign: 'center',
                      color: '#94A3B8',
                    }}
                  >
                    Sin boletos con esos filtros.
                  </td>
                </tr>
              )}
              {filtered.map((b, i) => {
                const utilidad =
                  b.precio_venta != null ? b.precio_venta - b.costo_usd : null;
                const conc = isConciliado(b);
                const selected = selectedIds.has(b.id);
                const baseBg = conc
                  ? i % 2 === 0
                    ? 'white'
                    : '#FAFBFF'
                  : C.warnBg;
                const rowBg = selected ? '#EDE9FE' : baseBg;
                const esCancelacion = (b.descripcion || '').toLowerCase().startsWith('cancelación');
                return (
                  <tr
                    key={b.id}
                    style={{
                      background: esCancelacion ? '#FEFCFC' : rowBg,
                      borderBottom: '1px solid #F1F5F9',
                      boxShadow: esCancelacion ? 'inset 3px 0 0 0 #E24B4A' : 'none',
                      cursor: 'pointer',
                    }}
                    onClick={() => setEditingId(b.id)}
                    onMouseEnter={(e) => {
                      if (!selected)
                        e.currentTarget.style.background = esCancelacion ? '#FCEBEB' : '#EFF6FF';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = esCancelacion ? '#FEFCFC' : rowBg;
                    }}
                  >
                    <td
                      style={{ ...td, padding: '10px 6px', textAlign: 'center' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelected(b.id)}
                        style={{ cursor: 'pointer', accentColor: '#7C3AED' }}
                      />
                    </td>
                    <td style={td}>
                      {noRequiereConciliacion(b) ? (
                        <span
                          title="No requiere conciliación (costo $0)"
                          style={{
                            display: 'inline-block',
                            width: 16,
                            height: 16,
                            lineHeight: '16px',
                            textAlign: 'center',
                            color: '#94A3B8',
                            fontSize: 14,
                            fontWeight: 700,
                          }}
                        >
                          —
                        </span>
                      ) : conc ? (
                        <CheckCircle2 size={16} color={C.utilidad} />
                      ) : (
                        <Circle size={16} color={C.warn} />
                      )}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontWeight: 700,
                        color: C.navy,
                      }}
                    >
                      {b.pnr}
                    </td>
                    <td style={td}>{b.cliente}</td>
                    <td style={td}>
                      {(() => {
                        const c = getConceptoLimpio(b.descripcion);
                        if (!c.label) {
                          return <span style={{ color: '#E5E7EB', fontSize: 11 }}>—</span>;
                        }
                        return (
                          <span
                            title={b.descripcion}
                            style={{
                              display: 'inline-block',
                              background: c.bg,
                              color: c.color,
                              fontSize: 12,
                              fontWeight: 600,
                              padding: '4px 10px',
                              borderRadius: 4,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {c.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td style={td}>{formatDateDmy(b.fecha_venta)}</td>
                    <td style={td}>
                      {b.ruta ? b.ruta.replace(/>/g, ' › ') : '—'}
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background:
                            b.tipo_viaje === 'RT' ? '#DBEAFE' : '#FEF3C7',
                          color:
                            b.tipo_viaje === 'RT' ? '#1E40AF' : '#92400E',
                        }}
                      >
                        {b.tipo_viaje || '—'}
                      </span>
                    </td>
                    <td style={{ ...td, fontSize: 13 }}>{b.vendedor}</td>
                    <td
                      style={{
                        ...td,
                        textAlign: 'right',
                      }}
                    >
                      <MoneyCell amount={b.costo_usd} color={C.costo} weight={600} />
                    </td>
                    <td
                      style={{
                        ...td,
                        textAlign: 'right',
                      }}
                    >
                      {b.trans_negativa ? (
                        <MoneyCell amount={-Math.abs(Number(b.trans_negativa))} color="#C62828" weight={700} />
                      ) : (
                        <MoneyCell amount={null} />
                      )}
                    </td>
                    <td
                      style={{
                        ...td,
                        textAlign: 'right',
                      }}
                    >
                      <MoneyCell amount={b.precio_venta} color={C.venta} weight={600} />
                    </td>
                    <td
                      style={{
                        ...td,
                        textAlign: 'right',
                      }}
                    >
                      <MoneyCell
                        amount={utilidad}
                        color={utilidad != null ? (utilidad >= 0 ? C.utilidad : C.danger) : undefined}
                        weight={700}
                      />
                    </td>
                    <td style={td}>
                      {b.plaza ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 4,
                            background:
                              b.plaza === 'MEX' ? '#DCFCE7' : '#FEE2E2',
                            color:
                              b.plaza === 'MEX' ? '#166534' : '#991B1B',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {b.plaza === 'MEX' ? 'México' : 'Cuba'}
                        </span>
                      ) : (
                        <span style={{ color: '#E5E7EB', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontFamily: 'ui-monospace, monospace',
                        fontSize: 12,
                      }}
                    >
                      {b.so_mexico || (
                        <span style={{ color: '#E5E7EB', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontFamily: 'ui-monospace, monospace',
                        fontSize: 12,
                      }}
                    >
                      {b.so_cuba || (
                        <span style={{ color: '#E5E7EB', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td style={{ ...td, fontSize: 12 }}>
                      {b.forma_pago || (
                        <span style={{ color: '#E5E7EB', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td style={{ ...td, fontSize: 12 }}>
                      {b.cliente_pagador || (
                        <span style={{ color: '#E5E7EB', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontSize: 12,
                        textAlign: 'center',
                      }}
                    >
                      {b.dias_credito != null ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 4,
                            background:
                              b.dias_credito === 0 ? '#DCFCE7' : '#FEF3C7',
                            color:
                              b.dias_credito === 0 ? '#166534' : '#92400E',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {b.dias_credito === 0
                            ? 'Contado'
                            : `${b.dias_credito} días`}
                        </span>
                      ) : (
                        <span style={{ color: '#E5E7EB', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontSize: 12,
                        textAlign: 'center',
                      }}
                    >
                      {b.estatus ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 4,
                            background:
                              b.estatus === 'COBRADO' ? '#DCFCE7' : '#FEF3C7',
                            color:
                              b.estatus === 'COBRADO' ? '#166534' : '#92400E',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {b.estatus}
                        </span>
                      ) : (
                        <span style={{ color: '#E5E7EB', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td style={{ ...td, fontSize: 12 }}>
                      {b.fecha_cobro ? (
                        formatDate(b.fecha_cobro)
                      ) : (
                        <span style={{ color: '#E5E7EB', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontSize: 11,
                        textAlign: 'center',
                      }}
                    >
                      {b.moneda_cobro && b.moneda_cobro !== 'USD' ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: '#FEF3C7',
                            color: '#92400E',
                          }}
                        >
                          {b.moneda_cobro}
                        </span>
                      ) : b.moneda_cobro === 'USD' ? (
                        <span
                          style={{ color: '#94A3B8', fontSize: 11 }}
                        >
                          USD
                        </span>
                      ) : (
                        <span style={{ color: '#E5E7EB', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontSize: 12,
                        textAlign: 'right',
                      }}
                    >
                      {b.precio_venta_local != null &&
                      b.moneda_cobro &&
                      b.moneda_cobro !== 'USD' ? (
                        `$${fmt(b.precio_venta_local)}`
                      ) : (
                        <span style={{ color: '#E5E7EB', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontSize: 12,
                        textAlign: 'center',
                        fontFamily: 'ui-monospace, monospace',
                      }}
                    >
                      {b.tipo_cambio != null ? (
                        b.tipo_cambio.toFixed(2)
                      ) : (
                        <span style={{ color: '#E5E7EB', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td style={td}>
                      <Edit2 size={13} color="#94A3B8" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          fontSize: 11,
          color: C.muted,
          lineHeight: 1.6,
        }}
      >
        💡 Tip · Click en cualquier fila para editar los datos manuales (SO,
        plaza, precio de venta, etc.) · El botón verde permite subir el .xlsx
        real que descargas de Caribe Cool · Los datos persisten entre sesiones ·
        Las filas amarillas son boletos pendientes de conciliar.
      </div>

      </>
      )}

      {/* Edit Modal */}
      {editing && (
        <EditModal
          boleto={editing}
          onClose={() => setEditingId(null)}
          onSave={(changes) => {
            updateBoleto(editing.id, changes);
            setEditingId(null);
          }}
        />
      )}

      {/* Paste Modal */}
      {pasteModalOpen && (
        <PasteModal
          existingBoletos={boletos}
          onClose={() => setPasteModalOpen(false)}
          onImport={(parsed, skipIds) => {
            mergeImported(parsed, skipIds);
            setPasteModalOpen(false);
          }}
        />
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirmOpen && (
        <DeleteConfirmModal
          boletos={boletos.filter((b) => selectedIds.has(b.id))}
          onClose={() => setDeleteConfirmOpen(false)}
          onConfirm={confirmDelete}
        />
      )}

      {/* Import Diff Modal (cuando se importa Excel formato Pamela) */}
      {importDiffOpen && importDiff && (
        <ImportDiffModal
          diff={importDiff}
          onClose={() => {
            setImportDiffOpen(false);
            setImportDiff(null);
          }}
          onConfirm={applyPamelaDiff}
        />
      )}

      {/* Movimiento Modal (captura/edición) */}
      {movimientoModalOpen && (
        <MovimientoModal
          movimiento={
            editingMovimientoId
              ? movimientos.find((m) => m.id === editingMovimientoId)
              : null
          }
          prefill={movimientoPrefill}
          onClose={() => {
            setMovimientoModalOpen(false);
            setEditingMovimientoId(null);
            setMovimientoPrefill(null);
          }}
          onSave={saveMovimiento}
        />
      )}

      {/* KPI Detail Modal — desglose de chips clickeables (Vista Captura) */}
      {capturaDetailKpi && (
        <KpiDetailModal
          kpiType={capturaDetailKpi}
          boletos={filtered}
          onClose={() => setCapturaDetailKpi(null)}
        />
      )}
    </div>
  );
}

// Subcomponentes ───────────────────────────────────────────────────
// Modal de desglose para los 3 KPIs de Estado de Cuenta Caribe Cool
function CaribeCoolKpiModal({
  kpiType,
  movimientosTabla,
  movimientosFiltrados,
  kpis,
  onClose,
}) {
  // Filtrar según el tipo
  let titulo, subtitulo, accent, filas, total;
  if (kpiType === 'recargas') {
    titulo = 'Detalle de Recargas';
    subtitulo = 'Movimientos que aumentaron el saldo en Caribe Cool';
    accent = '#16A34A';
    filas = movimientosFiltrados.filter(
      (m) => m.tipo === 'recarga' || m.tipo === 'saldo_inicial'
    );
    total = kpis.recargasPeriodo;
  } else if (kpiType === 'consumos') {
    titulo = 'Detalle de Consumos';
    subtitulo = 'Boletos vendidos que consumieron saldo del proveedor';
    accent = '#DC2626';
    filas = movimientosFiltrados.filter((m) => m.tipo === 'consumo');
    total = kpis.consumosPeriodo;
  } else {
    titulo = 'Estado de cuenta completo';
    subtitulo =
      'TODOS los movimientos cronológicos · saldo corriente al lado';
    accent = '#0F172A';
    filas = movimientosTabla;
    total = kpis.saldoFinal;
  }

  const fmt = (n) =>
    n == null || isNaN(n)
      ? '$0.00'
      : '$' +
        Math.abs(n).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 16,
          width: '100%',
          maxWidth: 1100,
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(15,23,42,0.4)',
        }}
      >
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#F8FAFC',
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 700,
                color: '#0F172A',
              }}
            >
              🔻 {titulo}
            </h3>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: 12,
                color: '#64748B',
              }}
            >
              {subtitulo} · {filas.length} fila{filas.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                fontSize: 11,
                color: '#64748B',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                textAlign: 'right',
              }}
            >
              <div>{kpiType === 'saldo' ? 'Saldo' : 'Total'}</div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: total < 0 ? '#DC2626' : accent,
                  marginTop: 2,
                  fontFamily: 'ui-monospace, monospace',
                  letterSpacing: '-0.01em',
                }}
              >
                {total < 0 ? '-' : ''}
                {fmt(total)}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 24,
                color: '#64748B',
                padding: 4,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div style={{ overflow: 'auto', flex: 1 }}>
          {filas.length === 0 ? (
            <div
              style={{
                padding: 40,
                textAlign: 'center',
                color: '#94A3B8',
              }}
            >
              No hay movimientos en este periodo.
            </div>
          ) : (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 12,
              }}
            >
              <thead
                style={{
                  position: 'sticky',
                  top: 0,
                  background: '#0F172A',
                  zIndex: 1,
                }}
              >
                <tr>
                  <th
                    style={{
                      ...kpiDetailTh,
                      textAlign: 'center',
                      width: 100,
                    }}
                  >
                    Fecha
                  </th>
                  <th style={{ ...kpiDetailTh, width: 130 }}>Tipo</th>
                  <th style={kpiDetailTh}>Descripción</th>
                  <th
                    style={{
                      ...kpiDetailTh,
                      textAlign: 'right',
                      width: 120,
                    }}
                  >
                    Monto
                  </th>
                  {kpiType === 'saldo' && (
                    <th
                      style={{
                        ...kpiDetailTh,
                        textAlign: 'right',
                        width: 130,
                      }}
                    >
                      Saldo
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filas.map((m, idx) => {
                  const isRecarga = m.tipo === 'recarga';
                  const isSaldoInicial = m.tipo === 'saldo_inicial';
                  const esEntrada = isRecarga || isSaldoInicial;
                  return (
                    <tr
                      key={m.id}
                      style={{
                        background: isSaldoInicial
                          ? '#FEFCE8'
                          : idx % 2 === 0
                          ? 'white'
                          : '#FAFBFF',
                        borderBottom: '1px solid #F1F5F9',
                      }}
                    >
                      <td
                        style={{
                          ...kpiDetailTd,
                          textAlign: 'center',
                          fontWeight: 600,
                        }}
                      >
                        {formatDate(m.fecha)}
                      </td>
                      <td style={kpiDetailTd}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            background: isSaldoInicial
                              ? '#FEF3C7'
                              : isRecarga
                              ? '#DCFCE7'
                              : '#FEE2E2',
                            color: isSaldoInicial
                              ? '#92400E'
                              : isRecarga
                              ? '#166534'
                              : '#991B1B',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {isSaldoInicial
                            ? '📍 Saldo inicial'
                            : isRecarga
                            ? '↑ Recarga'
                            : '↓ Consumo'}
                        </span>
                      </td>
                      <td style={kpiDetailTd}>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>
                          {m.descripcion}
                        </div>
                        {m.subDesc && (
                          <div
                            style={{
                              fontSize: 11,
                              color: '#64748B',
                              marginTop: 2,
                            }}
                          >
                            {m.subDesc}
                          </div>
                        )}
                        {m.nota && !isSaldoInicial && (
                          <div
                            style={{
                              fontSize: 11,
                              color: '#64748B',
                              marginTop: 2,
                              fontStyle: 'italic',
                            }}
                          >
                            {m.nota}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          ...kpiDetailTd,
                          textAlign: 'right',
                          fontFamily: 'ui-monospace, monospace',
                          fontWeight: 700,
                          color: esEntrada ? '#16A34A' : '#DC2626',
                        }}
                      >
                        {esEntrada ? '+' : '−'}
                        {fmt(m.monto)}
                      </td>
                      {kpiType === 'saldo' && (
                        <td
                          style={{
                            ...kpiDetailTd,
                            textAlign: 'right',
                            fontFamily: 'ui-monospace, monospace',
                            fontWeight: 800,
                            color:
                              m.saldoCorriente >= 0 ? '#0F172A' : '#DC2626',
                          }}
                        >
                          {m.saldoCorriente < 0 ? '-' : ''}
                          {fmt(m.saldoCorriente)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr
                  style={{
                    background: '#F8FAFC',
                    borderTop: '2px solid #CBD5E1',
                  }}
                >
                  <td
                    colSpan={kpiType === 'saldo' ? 4 : 3}
                    style={{
                      ...kpiDetailTd,
                      textAlign: 'right',
                      fontWeight: 700,
                      color: '#475569',
                      textTransform: 'uppercase',
                      fontSize: 11,
                      letterSpacing: '0.05em',
                    }}
                  >
                    {kpiType === 'saldo' ? 'SALDO FINAL' : 'TOTAL'}
                  </td>
                  <td
                    style={{
                      ...kpiDetailTd,
                      textAlign: 'right',
                      fontFamily: 'ui-monospace, monospace',
                      fontWeight: 800,
                      fontSize: 14,
                      color: total < 0 ? '#DC2626' : accent,
                    }}
                  >
                    {total < 0 ? '-' : ''}
                    {fmt(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// Modal de desglose del saldo de una caja específica
// Muestra entradas por cobros + movs entrantes + salidas por movs
function SaldoCajaDetailModal({ cajaId, boletos, movimientos, onClose }) {
  const caja = getCaja(cajaId);
  if (!caja) return null;

  // Cobros que llegan a esta caja
  const cobrosEntrantes = useMemo(() => {
    const list = [];
    for (const b of boletos) {
      const v = ventaACaja(b);
      if (v && v.caja_id === cajaId) {
        list.push({
          id: 'cobro_' + b.id,
          tipo: 'cobro',
          fecha:
            b.fecha_cobro ||
            (b.fecha_venta && typeof b.fecha_venta === 'string'
              ? b.fecha_venta.slice(0, 10)
              : b.fecha_venta),
          descripcion: `Cobro: ${b.pnr} · ${b.cliente || ''}`,
          subDesc: b.forma_pago || '',
          monto: v.monto,
          moneda: v.moneda,
          esEntrada: true,
        });
      }
    }
    return list;
  }, [boletos, cajaId]);

  // Movimientos que entran o salen de esta caja
  const movsRelacionados = useMemo(() => {
    const list = [];
    for (const m of movimientos) {
      if (m.caja_origen === cajaId) {
        const cD = getCaja(m.caja_destino);
        list.push({
          id: 'movout_' + m.id,
          tipo: 'mov_salida',
          fecha: m.fecha,
          descripcion: `Salida hacia ${cD?.label || m.caja_destino}`,
          subDesc: m.nota || '',
          monto: m.monto,
          moneda: m.moneda,
          esEntrada: false,
        });
      }
      if (m.caja_destino === cajaId) {
        const cO = getCaja(m.caja_origen);
        list.push({
          id: 'movin_' + m.id,
          tipo: 'mov_entrada',
          fecha: m.fecha,
          descripcion: `Entrada desde ${cO?.label || m.caja_origen}`,
          subDesc: m.nota || '',
          monto: m.monto_destino != null ? m.monto_destino : m.monto,
          moneda: m.moneda_destino || m.moneda,
          esEntrada: true,
        });
      }
    }
    return list;
  }, [movimientos, cajaId]);

  const todasFilas = useMemo(() => {
    const all = [...cobrosEntrantes, ...movsRelacionados];
    all.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    return all;
  }, [cobrosEntrantes, movsRelacionados]);

  // Totales por moneda
  const totales = useMemo(() => {
    const t = { USD: 0, MXN: 0 };
    for (const f of todasFilas) {
      const signo = f.esEntrada ? 1 : -1;
      if (f.moneda === 'MXN') t.MXN += signo * f.monto;
      else t.USD += signo * f.monto;
    }
    return t;
  }, [todasFilas]);

  const fmt = (n, moneda) => {
    if (n == null || isNaN(n)) return '$0.00';
    const locale = moneda === 'MXN' ? 'es-MX' : 'en-US';
    return (
      '$' +
      Math.abs(n).toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 16,
          width: '100%',
          maxWidth: 1100,
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(15,23,42,0.4)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#F8FAFC',
            borderLeft: `4px solid ${caja.color}`,
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 700,
                color: '#0F172A',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 22 }}>{caja.icon}</span>
              {caja.label}
            </h3>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: 12,
                color: '#64748B',
              }}
            >
              Cobros + transferencias · {todasFilas.length} movimiento
              {todasFilas.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontSize: 11,
                  color: '#64748B',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Saldo
              </div>
              {Math.abs(totales.USD) > 0.005 && (
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: totales.USD >= 0 ? caja.color : '#DC2626',
                    fontFamily: 'ui-monospace, monospace',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {totales.USD < 0 ? '-' : ''}
                  {fmt(totales.USD, 'USD')}{' '}
                  <span
                    style={{ fontSize: 11, color: '#64748B', fontWeight: 500 }}
                  >
                    USD
                  </span>
                </div>
              )}
              {Math.abs(totales.MXN) > 0.005 && (
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: totales.MXN >= 0 ? caja.color : '#DC2626',
                    fontFamily: 'ui-monospace, monospace',
                    marginTop: 2,
                  }}
                >
                  {totales.MXN < 0 ? '-' : ''}
                  {fmt(totales.MXN, 'MXN')}{' '}
                  <span
                    style={{ fontSize: 11, color: '#64748B', fontWeight: 500 }}
                  >
                    MXN
                  </span>
                </div>
              )}
              {Math.abs(totales.USD) < 0.005 &&
                Math.abs(totales.MXN) < 0.005 && (
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: '#94A3B8',
                    }}
                  >
                    $0.00
                  </div>
                )}
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 24,
                color: '#64748B',
                padding: 4,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div style={{ overflow: 'auto', flex: 1 }}>
          {todasFilas.length === 0 ? (
            <div
              style={{
                padding: 40,
                textAlign: 'center',
                color: '#94A3B8',
              }}
            >
              Esta caja aún no tiene cobros ni movimientos registrados.
            </div>
          ) : (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 12,
              }}
            >
              <thead
                style={{
                  position: 'sticky',
                  top: 0,
                  background: '#0F172A',
                  zIndex: 1,
                }}
              >
                <tr>
                  <th
                    style={{ ...kpiDetailTh, textAlign: 'center', width: 100 }}
                  >
                    Fecha
                  </th>
                  <th style={{ ...kpiDetailTh, width: 120 }}>Tipo</th>
                  <th style={kpiDetailTh}>Descripción</th>
                  <th
                    style={{
                      ...kpiDetailTh,
                      textAlign: 'right',
                      width: 130,
                    }}
                  >
                    Monto
                  </th>
                </tr>
              </thead>
              <tbody>
                {todasFilas.map((f, idx) => {
                  let badgeBg, badgeColor, badgeLabel;
                  if (f.tipo === 'cobro') {
                    badgeBg = '#DCFCE7';
                    badgeColor = '#166534';
                    badgeLabel = '↓ Cobro';
                  } else if (f.tipo === 'mov_entrada') {
                    badgeBg = '#DBEAFE';
                    badgeColor = '#1E40AF';
                    badgeLabel = '↓ Mov. entrada';
                  } else {
                    badgeBg = '#FEE2E2';
                    badgeColor = '#991B1B';
                    badgeLabel = '↑ Mov. salida';
                  }
                  return (
                    <tr
                      key={f.id}
                      style={{
                        background: idx % 2 === 0 ? 'white' : '#FAFBFF',
                        borderBottom: '1px solid #F1F5F9',
                      }}
                    >
                      <td
                        style={{
                          ...kpiDetailTd,
                          textAlign: 'center',
                          fontWeight: 600,
                        }}
                      >
                        {formatDate(f.fecha)}
                      </td>
                      <td style={kpiDetailTd}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            background: badgeBg,
                            color: badgeColor,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {badgeLabel}
                        </span>
                      </td>
                      <td style={kpiDetailTd}>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>
                          {f.descripcion}
                        </div>
                        {f.subDesc && (
                          <div
                            style={{
                              fontSize: 11,
                              color: '#64748B',
                              marginTop: 2,
                            }}
                          >
                            {f.subDesc}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          ...kpiDetailTd,
                          textAlign: 'right',
                          fontFamily: 'ui-monospace, monospace',
                          fontWeight: 700,
                          color: f.esEntrada ? '#16A34A' : '#DC2626',
                        }}
                      >
                        {f.esEntrada ? '+' : '−'}
                        {fmt(f.monto, f.moneda)}{' '}
                        <span
                          style={{ fontSize: 10, color: '#64748B', fontWeight: 500 }}
                        >
                          {f.moneda}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Total */}
              <tfoot>
                <tr
                  style={{
                    background: '#F8FAFC',
                    borderTop: '2px solid #CBD5E1',
                  }}
                >
                  <td
                    colSpan={3}
                    style={{
                      ...kpiDetailTd,
                      textAlign: 'right',
                      fontWeight: 700,
                      color: '#475569',
                      textTransform: 'uppercase',
                      fontSize: 11,
                      letterSpacing: '0.05em',
                    }}
                  >
                    SALDO TOTAL
                  </td>
                  <td
                    style={{
                      ...kpiDetailTd,
                      textAlign: 'right',
                      fontFamily: 'ui-monospace, monospace',
                      fontWeight: 800,
                      fontSize: 13,
                      color: caja.color,
                    }}
                  >
                    {Math.abs(totales.USD) > 0.005 && (
                      <div>
                        {totales.USD < 0 ? '-' : ''}
                        {fmt(totales.USD, 'USD')} USD
                      </div>
                    )}
                    {Math.abs(totales.MXN) > 0.005 && (
                      <div>
                        {totales.MXN < 0 ? '-' : ''}
                        {fmt(totales.MXN, 'MXN')} MXN
                      </div>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// Modal de desglose: muestra los boletos que componen el monto de un KPI
function KpiDetailModal({ kpiType, boletos, onClose }) {
  // Filtrar y preparar boletos según el tipo de KPI
  const config = {
    // ─── Vista Captura ─────────────────────────────────────
    boletos_total: {
      title: 'Detalle de Boletos',
      subtitle: 'Todos los boletos del periodo filtrado',
      accent: '#0F172A',
      filter: () => true,
      montoCampo: 'costo_usd',
      montoLabel: 'Costo',
    },
    venta_total: {
      title: 'Detalle de Venta Total',
      subtitle: 'Boletos con precio de venta capturado',
      accent: '#0D9488',
      filter: (b) => b.precio_venta != null,
      montoCampo: 'precio_venta',
      montoLabel: 'Precio Venta',
    },
    costo_total: {
      title: 'Detalle de Costo Total',
      subtitle: 'Costo de Caribe Cool por boleto',
      accent: '#DC2626',
      filter: (b) => b.costo_usd != null && b.costo_usd > 0,
      montoCampo: 'costo_usd',
      montoLabel: 'Costo',
    },
    utilidad_total: {
      title: 'Detalle de Utilidad',
      subtitle: 'Solo boletos conciliados (con utilidad calculable)',
      accent: '#16A34A',
      filter: (b) => isConciliado(b) && b.precio_venta != null,
      montoCampo: '__utilidad',
      montoLabel: 'Utilidad',
      sortDesc: true,
      showVentaCosto: true,
    },
    pendientes: {
      title: 'Detalle de Pendientes',
      subtitle: 'Boletos sin conciliar (faltan datos manuales)',
      accent: '#EA580C',
      filter: (b) => !isConciliado(b) && !noRequiereConciliacion(b),
      montoCampo: 'costo_usd',
      montoLabel: 'Costo',
    },
    // ─── Vista Caja & Bancos ──────────────────────────────
    venta: {
      title: 'Detalle de Venta',
      subtitle: 'Boletos con precio de venta capturado en el periodo',
      accent: '#0D9488',
      filter: (b) => b.precio_venta != null,
      montoCampo: 'precio_venta',
      montoLabel: 'Precio Venta',
    },
    costo: {
      title: 'Detalle de Costo Caribe Cool',
      subtitle: 'Costo de todos los boletos del periodo',
      accent: '#DC2626',
      filter: (b) => b.costo_usd != null && b.costo_usd > 0,
      montoCampo: 'costo_usd',
      montoLabel: 'Costo',
    },
    utilidad: {
      title: 'Detalle de Utilidad',
      subtitle: 'Precio Venta − Costo, por boleto (ordenado mayor a menor)',
      accent: '#16A34A',
      filter: (b) => b.precio_venta != null,
      montoCampo: '__utilidad',
      montoLabel: 'Utilidad',
      sortDesc: true,
      showVentaCosto: true,
    },
    cobrado: {
      title: 'Detalle de Cobrado',
      subtitle: 'Boletos con Estatus = COBRADO (el dinero ya entró)',
      accent: '#0F172A',
      filter: (b) => b.estatus === 'COBRADO' && b.precio_venta != null,
      montoCampo: 'precio_venta',
      montoLabel: 'Cobrado',
    },
    cxc: {
      title: 'Detalle de CxC (Cuentas por Cobrar)',
      subtitle: 'Créditos pendientes — dinero que está por cobrarse',
      accent: '#CA8A04',
      filter: (b) =>
        b.estatus !== 'COBRADO' &&
        b.precio_venta != null &&
        b.forma_pago === 'CREDITO',
      montoCampo: 'precio_venta',
      montoLabel: 'Pendiente',
    },
  };

  const cfg = config[kpiType];
  if (!cfg) return null;

  const rows = useMemo(() => {
    const list = boletos
      .filter(cfg.filter)
      .map((b) => ({
        ...b,
        __utilidad:
          b.precio_venta != null && b.costo_usd != null
            ? b.precio_venta - b.costo_usd
            : 0,
      }));
    if (cfg.sortDesc) {
      list.sort((a, b) => (b[cfg.montoCampo] || 0) - (a[cfg.montoCampo] || 0));
    } else {
      list.sort((a, b) =>
        (a.fecha_venta || '').localeCompare(b.fecha_venta || '')
      );
    }
    return list;
  }, [boletos, cfg]);

  const total = rows.reduce((s, r) => s + (r[cfg.montoCampo] || 0), 0);

  const fmt = (n) =>
    n == null || isNaN(n)
      ? '$0.00'
      : '$' +
        Math.abs(n).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 16,
          width: '100%',
          maxWidth: 1100,
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(15,23,42,0.4)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: `1px solid #E2E8F0`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#F8FAFC',
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 700,
                color: '#0F172A',
              }}
            >
              {cfg.title}
            </h3>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: 12,
                color: '#64748B',
              }}
            >
              {cfg.subtitle} · {rows.length} boleto
              {rows.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                fontSize: 11,
                color: '#64748B',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                textAlign: 'right',
              }}
            >
              <div>Total</div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: cfg.accent,
                  marginTop: 2,
                  fontFamily: 'ui-monospace, monospace',
                  letterSpacing: '-0.01em',
                }}
              >
                {(total < 0 ? '-' : '') + fmt(total)}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 24,
                color: '#64748B',
                padding: 4,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div style={{ overflow: 'auto', flex: 1 }}>
          {rows.length === 0 ? (
            <div
              style={{
                padding: 40,
                textAlign: 'center',
                color: '#94A3B8',
              }}
            >
              No hay boletos que cumplan este criterio en el periodo.
            </div>
          ) : (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 12,
              }}
            >
              <thead
                style={{
                  position: 'sticky',
                  top: 0,
                  background: '#0F172A',
                  zIndex: 1,
                }}
              >
                <tr>
                  <th style={kpiDetailTh}>PNR</th>
                  <th style={kpiDetailTh}>Cliente</th>
                  <th
                    style={{ ...kpiDetailTh, textAlign: 'center' }}
                  >
                    Fecha
                  </th>
                  <th style={kpiDetailTh}>Vendedor</th>
                  <th
                    style={{ ...kpiDetailTh, textAlign: 'center' }}
                  >
                    Plaza
                  </th>
                  <th style={kpiDetailTh}>Forma de Pago</th>
                  <th
                    style={{ ...kpiDetailTh, textAlign: 'center' }}
                  >
                    Estatus
                  </th>
                  {cfg.showVentaCosto && (
                    <>
                      <th
                        style={{
                          ...kpiDetailTh,
                          textAlign: 'right',
                        }}
                      >
                        Venta
                      </th>
                      <th
                        style={{
                          ...kpiDetailTh,
                          textAlign: 'right',
                        }}
                      >
                        Costo
                      </th>
                    </>
                  )}
                  <th
                    style={{ ...kpiDetailTh, textAlign: 'right' }}
                  >
                    {cfg.montoLabel}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b, idx) => (
                  <tr
                    key={b.id}
                    style={{
                      background:
                        idx % 2 === 0 ? 'white' : '#FAFBFF',
                      borderBottom: '1px solid #F1F5F9',
                    }}
                  >
                    <td style={kpiDetailTd}>
                      <span
                        style={{
                          fontFamily: 'ui-monospace, monospace',
                          fontWeight: 700,
                          color: '#0F172A',
                        }}
                      >
                        {b.pnr}
                      </span>
                    </td>
                    <td style={kpiDetailTd}>{b.cliente || '—'}</td>
                    <td
                      style={{
                        ...kpiDetailTd,
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatDate(b.fecha_venta)}
                    </td>
                    <td style={kpiDetailTd}>{b.vendedor || '—'}</td>
                    <td
                      style={{
                        ...kpiDetailTd,
                        textAlign: 'center',
                      }}
                    >
                      {b.plaza === 'MEX' ? (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: '#DCFCE7',
                            color: '#166534',
                          }}
                        >
                          México
                        </span>
                      ) : b.plaza === 'CUBA' ? (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: '#FCE7F3',
                            color: '#9D174D',
                          }}
                        >
                          Cuba
                        </span>
                      ) : (
                        <span style={{ color: '#E5E7EB', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td style={kpiDetailTd}>{b.forma_pago || '—'}</td>
                    <td
                      style={{
                        ...kpiDetailTd,
                        textAlign: 'center',
                      }}
                    >
                      {b.estatus ? (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background:
                              b.estatus === 'COBRADO'
                                ? '#DCFCE7'
                                : '#FEF3C7',
                            color:
                              b.estatus === 'COBRADO'
                                ? '#166534'
                                : '#92400E',
                          }}
                        >
                          {b.estatus}
                        </span>
                      ) : (
                        <span style={{ color: '#E5E7EB', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    {cfg.showVentaCosto && (
                      <>
                        <td
                          style={{
                            ...kpiDetailTd,
                            textAlign: 'right',
                            fontFamily: 'ui-monospace, monospace',
                          }}
                        >
                          {fmt(b.precio_venta)}
                        </td>
                        <td
                          style={{
                            ...kpiDetailTd,
                            textAlign: 'right',
                            fontFamily: 'ui-monospace, monospace',
                            color: '#DC2626',
                          }}
                        >
                          −{fmt(b.costo_usd)}
                        </td>
                      </>
                    )}
                    <td
                      style={{
                        ...kpiDetailTd,
                        textAlign: 'right',
                        fontFamily: 'ui-monospace, monospace',
                        fontWeight: 700,
                        color:
                          b[cfg.montoCampo] >= 0
                            ? cfg.accent
                            : '#DC2626',
                      }}
                    >
                      {b[cfg.montoCampo] < 0 ? '-' : ''}
                      {fmt(b[cfg.montoCampo])}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Total row */}
              <tfoot>
                <tr
                  style={{
                    background: '#F8FAFC',
                    borderTop: '2px solid #CBD5E1',
                  }}
                >
                  <td
                    colSpan={cfg.showVentaCosto ? 9 : 7}
                    style={{
                      ...kpiDetailTd,
                      textAlign: 'right',
                      fontWeight: 700,
                      color: '#475569',
                      textTransform: 'uppercase',
                      fontSize: 11,
                      letterSpacing: '0.05em',
                    }}
                  >
                    TOTAL
                  </td>
                  <td
                    style={{
                      ...kpiDetailTd,
                      textAlign: 'right',
                      fontFamily: 'ui-monospace, monospace',
                      fontWeight: 800,
                      fontSize: 14,
                      color: cfg.accent,
                    }}
                  >
                    {(total < 0 ? '-' : '') + fmt(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const kpiDetailTh = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'white',
  whiteSpace: 'nowrap',
};

const kpiDetailTd = {
  padding: '8px 12px',
  fontSize: 12,
  color: '#0F172A',
  verticalAlign: 'middle',
};

// Wrapper que hace clickeable un KpiCard manteniendo su look
function KpiClickable({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'block',
        transition: 'transform 0.1s ease, box-shadow 0.1s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,23,42,0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {children}
    </button>
  );
}

function KpiCard({ label, value, accent, subtitle }) {
  return (
    <div
      style={{
        background: 'white',
        padding: 14,
        borderRadius: 12,
        border: `1px solid ${C.border}`,
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: C.muted,
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 22,
          fontWeight: 800,
          color: accent,
          lineHeight: 1.1,
          letterSpacing: '-0.01em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: C.slate,
        fontWeight: 600,
      }}
    >
      {label}:
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '6px 10px',
          borderRadius: 6,
          border: `1px solid #CBD5E1`,
          background: 'white',
          fontSize: 13,
          color: C.navy,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </label>
  );
}

function EditModal({ boleto, onClose, onSave }) {
  const [form, setForm] = useState({
    so_mexico: boleto.so_mexico || '',
    so_cuba: boleto.so_cuba || '',
    forma_pago: boleto.forma_pago || '',
    precio_venta:
      boleto.precio_venta != null ? String(boleto.precio_venta) : '',
    fecha_cobro: boleto.fecha_cobro || '',
    cliente_pagador: boleto.cliente_pagador || '',
    dias_credito:
      boleto.dias_credito != null ? String(boleto.dias_credito) : '',
    estatus: boleto.estatus || '',
    plaza: boleto.plaza || '',
    notas: boleto.notas || '',
    moneda_cobro: boleto.moneda_cobro || 'USD',
    precio_venta_local:
      boleto.precio_venta_local != null
        ? String(boleto.precio_venta_local)
        : '',
    tipo_cambio:
      boleto.tipo_cambio != null ? String(boleto.tipo_cambio) : '',
  });

  const venta = form.precio_venta ? parseFloat(form.precio_venta) : null;
  const util =
    venta != null && !isNaN(venta) ? venta - boleto.costo_usd : null;

  // Validación de coherencia entre moneda_cobro, precio_venta_local, tipo_cambio
  // y el precio_venta en USD.
  const precioLocal = form.precio_venta_local
    ? parseFloat(form.precio_venta_local)
    : null;
  const tc = form.tipo_cambio ? parseFloat(form.tipo_cambio) : null;
  let monedaWarning = null;
  if (form.moneda_cobro === 'MXN') {
    if (precioLocal != null && tc != null && tc > 0 && venta != null) {
      const calculado = precioLocal / tc;
      const diff = Math.abs(calculado - venta);
      const pctDiff = venta > 0 ? diff / venta : 0;
      if (pctDiff > 0.02) {
        monedaWarning = `⚠ Precio Local / TC = $${calculado.toFixed(
          2
        )} USD pero capturaste $${venta.toFixed(
          2
        )} USD (dif ${(pctDiff * 100).toFixed(1)}%).`;
      }
    } else if (precioLocal != null && (tc == null || tc <= 0)) {
      monedaWarning = 'Falta el Tipo de Cambio para validar la conversión.';
    } else if (tc != null && precioLocal == null) {
      monedaWarning = 'Falta el Precio Local para validar la conversión.';
    }
  } else if (form.moneda_cobro === 'USD') {
    // Si es USD, precio_venta_local debería ser igual a precio_venta
    if (precioLocal != null && venta != null) {
      if (Math.abs(precioLocal - venta) > 0.01) {
        monedaWarning = `⚠ Si la moneda de cobro es USD, el Precio Local ($${precioLocal.toFixed(
          2
        )}) debería coincidir con el Precio de Venta ($${venta.toFixed(2)}).`;
      }
    }
  }

  // Auto-sugerencia de moneda según forma_pago
  function setFormaPago(value) {
    let nextMoneda = form.moneda_cobro;
    if (value === 'BNMX MN' && form.moneda_cobro !== 'MXN') {
      nextMoneda = 'MXN';
    }
    setForm({ ...form, forma_pago: value, moneda_cobro: nextMoneda });
  }

  function save() {
    const dc = form.dias_credito === '' ? null : parseInt(form.dias_credito);
    const pl = form.precio_venta_local
      ? parseFloat(form.precio_venta_local)
      : null;
    const tcVal = form.tipo_cambio ? parseFloat(form.tipo_cambio) : null;
    onSave({
      so_mexico: form.so_mexico.trim(),
      so_cuba: form.so_cuba.trim(),
      forma_pago: form.forma_pago,
      precio_venta: form.precio_venta ? parseFloat(form.precio_venta) : null,
      fecha_cobro: form.fecha_cobro || '',
      cliente_pagador: form.cliente_pagador.trim(),
      dias_credito: isNaN(dc) ? null : dc,
      estatus: form.estatus || '',
      plaza: form.plaza,
      notas: form.notas.trim(),
      moneda_cobro: form.moneda_cobro || 'USD',
      precio_venta_local: pl != null && !isNaN(pl) ? pl : null,
      tipo_cambio: tcVal != null && !isNaN(tcVal) ? tcVal : null,
    });
  }

  function clearManual() {
    setForm({
      so_mexico: '',
      so_cuba: '',
      forma_pago: '',
      precio_venta: '',
      fecha_cobro: '',
      cliente_pagador: '',
      dias_credito: '',
      estatus: '',
      plaza: '',
      notas: '',
      moneda_cobro: 'USD',
      precio_venta_local: '',
      tipo_cambio: '',
    });
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 16,
          width: '100%',
          maxWidth: 760,
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                color: C.muted,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Editar boleto · PNR
            </div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 800,
                color: C.navy,
                fontFamily: 'ui-monospace, monospace',
                marginTop: 2,
              }}
            >
              {boleto.pnr}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#94A3B8',
              padding: 4,
              display: 'flex',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Caribe Cool readonly block */}
        <div
          style={{
            padding: '16px 24px',
            background: C.bgSoft,
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: C.muted,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 10,
            }}
          >
            🔒 De Caribe Cool (no editable)
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '10px 18px',
              fontSize: 13,
            }}
          >
            <Field label="Cliente">{boleto.cliente}</Field>
            <Field label="Fecha de Venta">{formatDate(boleto.fecha_venta)}</Field>
            <Field label="Ruta">
              {boleto.ruta}{' '}
              <span style={{ color: C.muted }}>({boleto.tipo_viaje})</span>
            </Field>
            <Field label="Vendedor">{boleto.vendedor}</Field>
            <Field label="Costo (USD)" highlight={C.costo}>
              ${fmt(boleto.costo_usd)}
            </Field>
            <Field label="Estado en Caribe Cool">{boleto.estado_caribe}</Field>
          </div>
        </div>

        {/* Manual fields */}
        <div style={{ padding: '18px 24px' }}>
          <div
            style={{
              fontSize: 10,
              color: C.muted,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 12,
            }}
          >
            ✏️ Datos manuales
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 14,
            }}
          >
            <FormField label="SO México">
              <input
                value={form.so_mexico}
                onChange={(e) =>
                  setForm({ ...form, so_mexico: e.target.value })
                }
                style={input}
                placeholder="SO42697"
              />
            </FormField>
            <FormField label="SO Cuba">
              <input
                value={form.so_cuba}
                onChange={(e) =>
                  setForm({ ...form, so_cuba: e.target.value })
                }
                style={input}
                placeholder="SO42698"
              />
            </FormField>
            <FormField label="Plaza de venta">
              <div style={{ display: 'flex', gap: 6 }}>
                {['MEX', 'CUBA'].map((p) => (
                  <button
                    key={p}
                    onClick={() =>
                      setForm({ ...form, plaza: form.plaza === p ? '' : p })
                    }
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: `1px solid ${
                        form.plaza === p ? C.navy : '#CBD5E1'
                      }`,
                      background: form.plaza === p ? C.navy : 'white',
                      color: form.plaza === p ? 'white' : C.slate,
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    {p === 'MEX' ? 'México' : 'Cuba'}
                  </button>
                ))}
              </div>
            </FormField>
            <FormField label="Estatus">
              <div style={{ display: 'flex', gap: 6 }}>
                {ESTATUS_OPCIONES.map((s) => {
                  const active = form.estatus === s;
                  const isCobrado = s === 'COBRADO';
                  return (
                    <button
                      key={s}
                      onClick={() =>
                        setForm({ ...form, estatus: active ? '' : s })
                      }
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: `1px solid ${
                          active
                            ? isCobrado
                              ? '#166534'
                              : '#92400E'
                            : '#CBD5E1'
                        }`,
                        background: active
                          ? isCobrado
                            ? '#DCFCE7'
                            : '#FEF3C7'
                          : 'white',
                        color: active
                          ? isCobrado
                            ? '#166534'
                            : '#92400E'
                          : C.slate,
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </FormField>
            <FormField label="Precio de venta (USD)">
              <input
                type="number"
                step="0.01"
                value={form.precio_venta}
                onChange={(e) =>
                  setForm({ ...form, precio_venta: e.target.value })
                }
                style={input}
                placeholder="445.00"
              />
            </FormField>
            <FormField label="Forma de pago">
              <select
                value={form.forma_pago}
                onChange={(e) => setFormaPago(e.target.value)}
                style={input}
              >
                <option value="">— Seleccionar —</option>
                {FORMAS_PAGO.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Fecha de cobro">
              <input
                type="date"
                value={form.fecha_cobro}
                onChange={(e) =>
                  setForm({ ...form, fecha_cobro: e.target.value })
                }
                style={input}
              />
            </FormField>
            <FormField label="Utilidad calculada">
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: `1px solid ${C.border}`,
                  background: C.bgSoft,
                  fontWeight: 700,
                  color:
                    util != null
                      ? util >= 0
                        ? C.utilidad
                        : C.costo
                      : '#94A3B8',
                  fontSize: 13,
                }}
              >
                {util != null ? `$${fmt(util)} USD` : 'Falta precio de venta'}
              </div>
            </FormField>
          </div>
          <div
            style={{
              marginTop: 14,
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 14,
            }}
          >
            <FormField label="Cliente pagador">
              <input
                value={form.cliente_pagador}
                onChange={(e) =>
                  setForm({ ...form, cliente_pagador: e.target.value })
                }
                style={input}
                placeholder="PUBLICO EN GENERAL"
              />
            </FormField>
            <FormField label="Días de crédito (0 = contado)">
              <input
                type="number"
                min="0"
                value={form.dias_credito}
                onChange={(e) =>
                  setForm({ ...form, dias_credito: e.target.value })
                }
                style={input}
                placeholder="5"
              />
            </FormField>
          </div>
          <div style={{ marginTop: 14 }}>
            <FormField label="Notas">
              <textarea
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                style={{ ...input, height: 60, resize: 'vertical' }}
              />
            </FormField>
          </div>

          {/* ─── Sección: Cobro al cliente (moneda local) ─── */}
          <div
            style={{
              marginTop: 18,
              paddingTop: 14,
              borderTop: `1px dashed ${C.border}`,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: C.muted,
                textTransform: 'uppercase',
                letterSpacing: 0.06,
                marginBottom: 10,
              }}
            >
              Cobro al cliente (moneda local)
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 14,
              }}
            >
              <FormField label="Moneda de cobro">
                <div style={{ display: 'flex', gap: 6 }}>
                  {['USD', 'MXN'].map((m) => {
                    const active = form.moneda_cobro === m;
                    return (
                      <button
                        key={m}
                        onClick={() =>
                          setForm({ ...form, moneda_cobro: m })
                        }
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: `1px solid ${
                            active ? C.navy : '#CBD5E1'
                          }`,
                          background: active ? C.navy : 'white',
                          color: active ? 'white' : C.slate,
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </FormField>
              <FormField
                label={`Precio Local (${form.moneda_cobro || 'USD'})`}
              >
                <input
                  type="number"
                  step="0.01"
                  value={form.precio_venta_local}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      precio_venta_local: e.target.value,
                    })
                  }
                  style={input}
                  placeholder={
                    form.moneda_cobro === 'MXN' ? '6800.00' : '445.00'
                  }
                />
              </FormField>
              <FormField label="Tipo de Cambio">
                <input
                  type="number"
                  step="0.01"
                  value={form.tipo_cambio}
                  onChange={(e) =>
                    setForm({ ...form, tipo_cambio: e.target.value })
                  }
                  style={{
                    ...input,
                    background:
                      form.moneda_cobro === 'USD' ? C.bgSoft : 'white',
                  }}
                  placeholder={
                    form.moneda_cobro === 'MXN' ? '17.00' : '—'
                  }
                  disabled={form.moneda_cobro === 'USD'}
                />
              </FormField>
            </div>
            {monedaWarning && (
              <div
                style={{
                  marginTop: 10,
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: '#FEF3C7',
                  border: `1px solid #FCD34D`,
                  fontSize: 12,
                  color: '#92400E',
                  lineHeight: 1.5,
                }}
              >
                {monedaWarning}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: `1px solid ${C.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: C.bgSoft,
          }}
        >
          <button
            onClick={clearManual}
            style={{ ...btnSecondary, color: C.costo, borderColor: '#FCA5A5' }}
          >
            Limpiar datos manuales
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={btnSecondary}>
              Cancelar
            </button>
            <button
              onClick={save}
              style={{ ...btnPrimary, background: C.utilidad }}
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DateRangePicker (estilo aerolínea: popover con 2 meses lado a lado) ──
function DateRangePicker({ from, to, onChange }) {
  const [open, setOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState(null);
  const [hover, setHover] = useState(null);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const wrapRef = useRef(null);
  const popoverRef = useRef(null);

  // Al abrir: reset estado y posiciona la vista en el "from" o en hoy
  useEffect(() => {
    if (!open) return;
    setPendingStart(null);
    setHover(null);
    const seed = from || dateOnly(new Date().toISOString());
    const [y, m] = seed.split('-').map(Number);
    setViewYear(y);
    setViewMonth(m - 1);
  }, [open, from]);

  // Calcular posición del popover (fixed) y mantenerla sincronizada en scroll/resize
  useEffect(() => {
    if (!open) return;
    function updatePos() {
      if (!wrapRef.current) return;
      const rect = wrapRef.current.getBoundingClientRect();
      const POPOVER_W = 560;
      const POPOVER_H = 380;
      let top = rect.bottom + 6;
      let left = rect.left;
      // Si se sale por la derecha → alinear con la derecha del viewport
      if (left + POPOVER_W > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - POPOVER_W - 8);
      }
      // Si se sale por abajo → mostrar arriba del trigger
      if (top + POPOVER_H > window.innerHeight - 8) {
        top = Math.max(8, rect.top - POPOVER_H - 6);
      }
      setPos({ top, left });
    }
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open]);

  // Cerrar al click afuera
  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      const inTrigger =
        wrapRef.current && wrapRef.current.contains(e.target);
      const inPopover =
        popoverRef.current && popoverRef.current.contains(e.target);
      if (!inTrigger && !inPopover) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function navMonth(delta) {
    let m = viewMonth + delta;
    let y = viewYear;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    while (m > 11) {
      m -= 12;
      y += 1;
    }
    setViewYear(y);
    setViewMonth(m);
  }

  function pickDay(ds) {
    if (!pendingStart) {
      setPendingStart(ds);
      setHover(null);
    } else {
      let f = pendingStart,
        t = ds;
      if (t < f) [f, t] = [t, f];
      onChange(f, t);
      setOpen(false);
    }
  }

  // Rango destacado en el calendario:
  // si hay pendingStart, usa pendingStart→hover (en orden); si no, usa from→to
  let hl1 = from,
    hl2 = to;
  if (pendingStart) {
    const h = hover || pendingStart;
    if (h < pendingStart) {
      hl1 = h;
      hl2 = pendingStart;
    } else {
      hl1 = pendingStart;
      hl2 = h;
    }
  }

  const triggerLabel =
    from || to ? rangeLabel(from, to) : 'Seleccionar periodo';
  const hasRange = !!(from || to);

  // Calcula 2do mes
  let m2 = viewMonth + 1,
    y2 = viewYear;
  if (m2 > 11) {
    m2 = 0;
    y2 += 1;
  }

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: '5px 12px',
          borderRadius: 6,
          border: `1px solid ${open || hasRange ? '#7C3AED' : '#CBD5E1'}`,
          background: hasRange ? '#F5F3FF' : 'white',
          fontSize: 12,
          fontWeight: 600,
          color: hasRange ? '#5B21B6' : C.navy,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'inherit',
        }}
      >
        <Calendar size={13} />
        {triggerLabel}
      </button>
      {open && (
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 1000,
            background: 'white',
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            boxShadow: '0 12px 32px -8px rgba(0,0,0,0.25)',
            padding: 0,
            minWidth: 540,
          }}
        >
          {/* Hint del pendingStart */}
          {pendingStart && (
            <div
              style={{
                padding: '8px 14px',
                background: '#FEF3C7',
                color: '#92400E',
                fontSize: 11,
                fontWeight: 600,
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              📍 Inicio: <strong>{formatDate(pendingStart)}</strong> — click
              otra fecha para completar el rango (o ESC para cancelar)
            </div>
          )}

          {/* 2 calendarios lado a lado */}
          <div style={{ display: 'flex', padding: 8 }}>
            <CalendarMonth
              year={viewYear}
              month={viewMonth}
              showPrev
              showNext={false}
              onNavMonth={navMonth}
              hl1={hl1}
              hl2={hl2}
              onPick={pickDay}
              onHover={setHover}
            />
            <CalendarMonth
              year={y2}
              month={m2}
              showPrev={false}
              showNext
              onNavMonth={navMonth}
              hl1={hl1}
              hl2={hl2}
              onPick={pickDay}
              onHover={setHover}
            />
          </div>

          {/* Footer del popover */}
          <div
            style={{
              padding: '10px 14px',
              borderTop: `1px solid ${C.border}`,
              background: C.bgSoft,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 12,
            }}
          >
            <div style={{ fontSize: 11, color: C.muted }}>
              {from && to
                ? `Rango actual: ${formatDate(from)} → ${formatDate(to)}`
                : 'Sin rango aplicado'}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => {
                  onChange('', '');
                  setOpen(false);
                }}
                disabled={!hasRange}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: `1px solid ${hasRange ? '#FCA5A5' : '#E2E8F0'}`,
                  background: 'white',
                  color: hasRange ? C.costo : '#CBD5E1',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: hasRange ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                }}
              >
                Limpiar
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  background: 'white',
                  color: C.slate,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Un mes del calendario
function CalendarMonth({
  year,
  month,
  showPrev,
  showNext,
  onNavMonth,
  hl1,
  hl2,
  onPick,
  onHover,
}) {
  const monthLabel = new Date(year, month, 1).toLocaleDateString('es-MX', {
    month: 'long',
    year: 'numeric',
  });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Lu=0
  const todayStr = dateOnly(new Date().toISOString());

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div style={{ padding: 8, width: 260 }}>
      {/* Header con nav */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
          height: 24,
        }}
      >
        <button
          onClick={() => onNavMonth(-1)}
          style={{
            visibility: showPrev ? 'visible' : 'hidden',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
            color: C.slate,
            display: 'flex',
            alignItems: 'center',
            borderRadius: 4,
          }}
          title="Mes anterior"
        >
          <ChevronLeft size={16} />
        </button>
        <div
          style={{
            fontWeight: 700,
            color: C.navy,
            fontSize: 13,
            textTransform: 'capitalize',
          }}
        >
          {monthLabel}
        </div>
        <button
          onClick={() => onNavMonth(1)}
          style={{
            visibility: showNext ? 'visible' : 'hidden',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
            color: C.slate,
            display: 'flex',
            alignItems: 'center',
            borderRadius: 4,
          }}
          title="Mes siguiente"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Días de la semana */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          fontSize: 10,
          color: C.muted,
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((d) => (
          <div key={d} style={{ textAlign: 'center', padding: '4px 0' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Celdas */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 1,
        }}
      >
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(
            d
          ).padStart(2, '0')}`;
          const isStart = ds === hl1;
          const isEnd = ds === hl2 && hl2 !== hl1;
          const isInRange = hl1 && hl2 && ds > hl1 && ds < hl2;
          const isSingle = hl1 === hl2 && ds === hl1;
          const isToday = ds === todayStr;

          let bg = 'transparent';
          let color = C.navy;
          let fontWeight = 500;
          let borderRadius = 4;
          if (isInRange) {
            bg = '#EDE9FE';
            color = '#5B21B6';
            borderRadius = 0;
          }
          if (isStart && !isSingle) {
            bg = '#7C3AED';
            color = 'white';
            fontWeight = 700;
            borderRadius = '4px 0 0 4px';
          }
          if (isEnd) {
            bg = '#7C3AED';
            color = 'white';
            fontWeight = 700;
            borderRadius = '0 4px 4px 0';
          }
          if (isSingle) {
            bg = '#7C3AED';
            color = 'white';
            fontWeight = 700;
            borderRadius = 4;
          }

          return (
            <button
              key={i}
              onClick={() => onPick(ds)}
              onMouseEnter={() => onHover(ds)}
              style={{
                padding: '6px 0',
                background: bg,
                color,
                fontWeight,
                fontSize: 12,
                border:
                  isToday && bg === 'transparent'
                    ? `1px solid ${C.navy}`
                    : 'none',
                borderRadius,
                cursor: 'pointer',
                fontFamily: 'inherit',
                outline: 'none',
                transition: 'background 80ms',
              }}
              onMouseOver={(e) => {
                if (bg === 'transparent')
                  e.currentTarget.style.background = '#F1F5F9';
              }}
              onMouseOut={(e) => {
                if (bg === 'transparent')
                  e.currentTarget.style.background = 'transparent';
              }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PasteModal({ existingBoletos, onClose, onImport }) {
  const [text, setText] = useState('');
  const [overwriteSet, setOverwriteSet] = useState(() => new Set());

  const existingById = useMemo(
    () => new Map(existingBoletos.map((b) => [b.id, b])),
    [existingBoletos]
  );

  // Cada item: { ticket, isNew, existing, diffs }
  const enriched = useMemo(() => {
    const parsed = parsePastedText(text);
    return parsed.map((t) => {
      const ex = existingById.get(t.id) || null;
      return {
        ticket: t,
        isNew: !ex,
        existing: ex,
        diffs: ex ? diffBoletos(ex, t) : [],
      };
    });
  }, [text, existingById]);

  // Reset overwriteSet cuando cambia el texto (evita PNRs huérfanos)
  useEffect(() => {
    setOverwriteSet(new Set());
  }, [text]);

  const existingIds = useMemo(
    () => enriched.filter((e) => !e.isNew).map((e) => e.ticket.id),
    [enriched]
  );
  const existingWithChanges = useMemo(
    () =>
      enriched
        .filter((e) => !e.isNew && e.diffs.length > 0)
        .map((e) => e.ticket.id),
    [enriched]
  );

  const counts = useMemo(() => {
    const nuevos = enriched.filter((e) => e.isNew).length;
    const sobrescritos = enriched.filter(
      (e) => !e.isNew && overwriteSet.has(e.ticket.id)
    ).length;
    const omitidos = enriched.filter(
      (e) => !e.isNew && !overwriteSet.has(e.ticket.id)
    ).length;
    return { nuevos, sobrescritos, omitidos, total: enriched.length };
  }, [enriched, overwriteSet]);

  function toggleOverwrite(id) {
    setOverwriteSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function markAll() {
    setOverwriteSet(new Set(existingIds));
  }
  function unmarkAll() {
    setOverwriteSet(new Set());
  }
  function markOnlyChanged() {
    setOverwriteSet(new Set(existingWithChanges));
  }

  function doImport() {
    // skipIds = IDs existentes que NO están en overwriteSet
    const skip = new Set(
      existingIds.filter((id) => !overwriteSet.has(id))
    );
    onImport(
      enriched.map((e) => e.ticket),
      skip
    );
  }

  const totalDetected = enriched.length;
  const canImport = counts.nuevos + counts.sobrescritos > 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 16,
          width: '100%',
          maxWidth: 1000,
          maxHeight: '92vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                color: C.muted,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Importar desde Caribe Cool
            </div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 800,
                color: C.navy,
                marginTop: 2,
              }}
            >
              Pegar texto copiado
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#94A3B8',
              padding: 4,
              display: 'flex',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div style={{ padding: '18px 24px', overflow: 'auto', flex: 1 }}>
          <div
            style={{
              fontSize: 13,
              color: C.slate,
              marginBottom: 10,
              lineHeight: 1.5,
            }}
          >
            Copia los registros desde Caribe Cool y pégalos abajo. Detecto el
            formato automáticamente (tabs o un campo por línea). Para PNRs que
            ya existen, tú decides si los sobrescribes.
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Pega aquí los datos. Ejemplo:

008FN8
GONZALEZ VILLORIA AGUSTIN
12/05/2026 9:09:28
Venta del billete [RT] HAV>CUN [AGUSTIN GONZALEZ VILLORIA]
319,00  USD
Validado
A cuenta
TIO AYMEE (VIAJES LIBERO)`}
            style={{
              width: '100%',
              minHeight: 160,
              padding: 12,
              borderRadius: 8,
              border: `1px solid #CBD5E1`,
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12,
              resize: 'vertical',
              boxSizing: 'border-box',
              outline: 'none',
              lineHeight: 1.5,
            }}
          />

          {/* Preview */}
          {text.trim() && (
            <div style={{ marginTop: 14 }}>
              {/* Summary chips */}
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  marginBottom: 10,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <SummaryChip
                  count={totalDetected}
                  label="detectados"
                  bg="#E2E8F0"
                  color={C.navy}
                />
                {counts.nuevos > 0 && (
                  <SummaryChip
                    count={counts.nuevos}
                    label="nuevos"
                    bg="#DCFCE7"
                    color="#166534"
                  />
                )}
                {existingIds.length > 0 && (
                  <>
                    <SummaryChip
                      count={counts.sobrescritos}
                      label="a sobrescribir"
                      bg="#FEF3C7"
                      color="#92400E"
                    />
                    <SummaryChip
                      count={counts.omitidos}
                      label="a omitir"
                      bg="#F1F5F9"
                      color={C.slate}
                    />
                  </>
                )}
              </div>

              {/* Master controls (solo si hay existentes) */}
              {existingIds.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    flexWrap: 'wrap',
                    marginBottom: 10,
                    padding: '8px 10px',
                    background: C.bgSoft,
                    borderRadius: 8,
                    border: `1px solid ${C.border}`,
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: C.muted,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginRight: 4,
                    }}
                  >
                    Acciones rápidas:
                  </span>
                  <MiniBtn onClick={markAll}>
                    Marcar todos ({existingIds.length})
                  </MiniBtn>
                  <MiniBtn onClick={unmarkAll}>Desmarcar todos</MiniBtn>
                  <MiniBtn
                    onClick={markOnlyChanged}
                    disabled={existingWithChanges.length === 0}
                  >
                    ✨ Solo los que cambiaron ({existingWithChanges.length})
                  </MiniBtn>
                </div>
              )}

              {totalDetected === 0 && (
                <div
                  style={{
                    padding: 14,
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: 8,
                    fontSize: 12,
                    color: '#991B1B',
                  }}
                >
                  No se detectaron boletos. Asegúrate que el PNR (ej. 008FN8)
                  aparezca al inicio de cada registro.
                </div>
              )}

              {totalDetected > 0 && (
                <div
                  style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    overflow: 'hidden',
                    maxHeight: 360,
                    overflowY: 'auto',
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: 12,
                    }}
                  >
                    <thead
                      style={{
                        background: C.bgSoft,
                        position: 'sticky',
                        top: 0,
                        zIndex: 1,
                      }}
                    >
                      <tr>
                        <th
                          style={{
                            ...th,
                            padding: '8px 10px',
                            width: 40,
                            textAlign: 'center',
                          }}
                        >
                          Sob.
                        </th>
                        <th style={{ ...th, padding: '8px 10px', width: 100 }}>
                          Estado
                        </th>
                        <th style={{ ...th, padding: '8px 10px' }}>PNR</th>
                        <th style={{ ...th, padding: '8px 10px' }}>Cliente</th>
                        <th style={{ ...th, padding: '8px 10px' }}>Ruta</th>
                        <th
                          style={{
                            ...th,
                            padding: '8px 10px',
                          }}
                        >
                          Costo
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {enriched.map((e, i) => {
                        const checked = overwriteSet.has(e.ticket.id);
                        const willImport = e.isNew || checked;
                        const baseBg = i % 2 === 0 ? 'white' : '#FAFBFF';
                        const rowBg = willImport ? baseBg : '#F8FAFC';
                        const opacity = willImport ? 1 : 0.55;
                        return (
                          <React.Fragment key={e.ticket.id + '_' + i}>
                            <tr
                              style={{
                                background: rowBg,
                                borderBottom:
                                  !e.isNew && e.existing
                                    ? '0'
                                    : '1px solid #F1F5F9',
                                opacity,
                                cursor: e.isNew ? 'default' : 'pointer',
                              }}
                              onClick={() =>
                                !e.isNew && toggleOverwrite(e.ticket.id)
                              }
                            >
                              <td
                                style={{
                                  padding: '8px 10px',
                                  textAlign: 'center',
                                }}
                              >
                                {e.isNew ? (
                                  <span style={{ color: '#E5E7EB', fontSize: 11 }}>—</span>
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      toggleOverwrite(e.ticket.id)
                                    }
                                    onClick={(ev) => ev.stopPropagation()}
                                    style={{ cursor: 'pointer' }}
                                  />
                                )}
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                {e.isNew ? (
                                  <Badge bg="#DCFCE7" color="#166534">
                                    🟢 Nuevo
                                  </Badge>
                                ) : e.diffs.length > 0 ? (
                                  <Badge bg="#FEF3C7" color="#92400E">
                                    🟡 Existe · {e.diffs.length} cambio
                                    {e.diffs.length !== 1 ? 's' : ''}
                                  </Badge>
                                ) : (
                                  <Badge bg="#F1F5F9" color={C.slate}>
                                    ⚪ Existe · sin cambios
                                  </Badge>
                                )}
                              </td>
                              <td
                                style={{
                                  padding: '8px 10px',
                                  fontFamily: 'ui-monospace, monospace',
                                  fontWeight: 700,
                                  color: C.navy,
                                }}
                              >
                                {e.ticket.pnr}
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                {e.ticket.cliente}
                              </td>
                              <td
                                style={{
                                  padding: '8px 10px',
                                  fontFamily: 'ui-monospace, monospace',
                                  fontSize: 11,
                                }}
                              >
                                {e.ticket.ruta || '—'}{' '}
                                <span style={{ color: C.muted }}>
                                  ({e.ticket.tipo_viaje || '—'})
                                </span>
                              </td>
                              <td
                                style={{
                                  padding: '8px 10px',
                                  textAlign: 'right',
                                  color: C.costo,
                                  fontWeight: 600,
                                }}
                              >
                                ${fmt(e.ticket.costo_usd)}
                              </td>
                            </tr>
                            {/* Sub-row con diffs si hay */}
                            {!e.isNew && e.diffs.length > 0 && (
                              <tr
                                style={{
                                  background: rowBg,
                                  borderBottom: '1px solid #F1F5F9',
                                  opacity,
                                }}
                              >
                                <td></td>
                                <td
                                  colSpan={5}
                                  style={{
                                    padding: '0 10px 8px 10px',
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      flexWrap: 'wrap',
                                      gap: 6,
                                      paddingTop: 2,
                                    }}
                                  >
                                    {e.diffs.map((d, k) => (
                                      <DiffPill key={k} diff={d} />
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: `1px solid ${C.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            background: C.bgSoft,
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 12, color: C.muted }}>
            {counts.omitidos > 0 && (
              <>
                {counts.omitidos} PNR{counts.omitidos !== 1 ? 's' : ''}{' '}
                existente{counts.omitidos !== 1 ? 's' : ''} se omitirá
                {counts.omitidos !== 1 ? 'n' : ''} (sin cambios).
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={btnSecondary}>
              Cancelar
            </button>
            <button
              onClick={doImport}
              disabled={!canImport}
              style={{
                ...btnPrimary,
                background: !canImport ? '#94A3B8' : '#7C3AED',
                cursor: !canImport ? 'not-allowed' : 'pointer',
              }}
            >
              <ClipboardPaste size={14} />{' '}
              {!canImport
                ? 'Nada que importar'
                : `Importar ${counts.nuevos} nuevo${
                    counts.nuevos !== 1 ? 's' : ''
                  }` +
                  (counts.sobrescritos > 0
                    ? ` + ${counts.sobrescritos} sobrescritura${
                        counts.sobrescritos !== 1 ? 's' : ''
                      }`
                    : '')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CajaYBancos({
  boletos,
  movimientos,
  dateFrom,
  dateTo,
  dateField,
  onChangeRange,
  onChangeDateField,
  presetRange,
}) {
  // Modal de detalle al hacer click en un KPI
  const [detailKpi, setDetailKpi] = useState(null);
  // detailKpi puede ser: 'venta' | 'costo' | 'utilidad' | 'cobrado' | 'cxc' | null
  const [saldoCajaDetail, setSaldoCajaDetail] = useState(null);
  // Filtra boletos por rango de fechas (siempre usa fecha_cobro para esta vista,
  // porque lo que importa aquí es CUÁNDO entró el dinero, no cuándo se vendió)
  const filtered = useMemo(() => {
    return boletos.filter((b) => {
      const field = dateField === 'fecha_cobro' ? b.fecha_cobro : b.fecha_venta;
      if (!field) return false;
      const d = String(field).slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [boletos, dateFrom, dateTo, dateField]);

  // ─── Saldos por caja (acumulados, NO respeta filtro de fecha) ─────
  // Para cada caja real, calculamos: cobros que llegan + movs entrantes - movs salientes
  const saldosPorCaja = useMemo(() => {
    const saldos = {};
    CAJAS.forEach((c) => {
      saldos[c.id] = {
        caja: c,
        usd: 0,
        mxn: 0,
        entradasCobros: 0, // suma de ventas cobradas que llegaron aquí (en moneda nativa)
        entradasMovs: 0,
        salidasMovs: 0,
        porConfirmarUsd: 0, // monto en USD de cobros "por confirmar" (EFECTIVO CUBA + PENDIENTE)
        porConfirmarMxn: 0,
        porConfirmarCount: 0, // cuántos boletos están "por confirmar"
      };
    });

    // 1. Ventas cobradas → entrada automática a su caja real
    for (const b of boletos) {
      const v = ventaACaja(b);
      if (!v) continue;
      const s = saldos[v.caja_id];
      if (!s) continue;
      if (v.moneda === 'MXN') s.mxn += v.monto;
      else s.usd += v.monto;
      s.entradasCobros += v.monto;
      // Trackear cuánto es "por confirmar" (suma al saldo igual, pero lo guardamos
      // separado para mostrar el desglose visual)
      if (v.porConfirmar) {
        if (v.moneda === 'MXN') s.porConfirmarMxn += v.monto;
        else s.porConfirmarUsd += v.monto;
        s.porConfirmarCount += 1;
      }
    }

    // 2. Movimientos: ajustar origen (salida) y destino (entrada)
    for (const m of movimientos) {
      const sO = saldos[m.caja_origen];
      const sD = saldos[m.caja_destino];
      if (sO && m.monto != null) {
        if (m.moneda === 'MXN') sO.mxn -= m.monto;
        else sO.usd -= m.monto;
        sO.salidasMovs += m.monto;
      }
      if (sD && m.monto_destino != null) {
        if (m.moneda_destino === 'MXN') sD.mxn += m.monto_destino;
        else sD.usd += m.monto_destino;
        sD.entradasMovs += m.monto_destino;
      }
    }

    return saldos;
  }, [boletos, movimientos]);

  // Agrupa por categoría de destino
  const grouped = useMemo(() => {
    const result = {};
    CATEGORIAS.forEach((c) => {
      result[c.id] = {
        categoria: c,
        boletos: [],
        breakdown: {}, // por forma_pago
        porConfirmarCount: 0, // cuántos boletos están "por confirmar" en este grupo
        porConfirmarUSD: 0,
      };
    });
    for (const b of filtered) {
      const catId = categoriaDelBoleto(b);
      const grupo = result[catId];
      if (!grupo) continue;
      grupo.boletos.push(b);
      const porConfirmar = esPorConfirmar(b);
      if (porConfirmar) {
        grupo.porConfirmarCount += 1;
        grupo.porConfirmarUSD += b.precio_venta || 0;
      }
      const fp = b.forma_pago || '(sin forma de pago)';
      if (!grupo.breakdown[fp]) {
        grupo.breakdown[fp] = {
          count: 0,
          totalUSD: 0,
          totalMXN: 0,
          totalLocalOtras: {}, // por si en el futuro hay otras monedas
          porConfirmarCount: 0,
          porConfirmarUSD: 0,
        };
      }
      const row = grupo.breakdown[fp];
      row.count++;
      row.totalUSD += b.precio_venta || 0;
      if (b.moneda_cobro === 'MXN' && b.precio_venta_local != null) {
        row.totalMXN += b.precio_venta_local;
      }
      if (porConfirmar) {
        row.porConfirmarCount += 1;
        row.porConfirmarUSD += b.precio_venta || 0;
      }
    }
    return result;
  }, [filtered]);

  // KPIs totales
  const kpis = useMemo(() => {
    // Venta = suma de precio_venta de TODOS los boletos con precio capturado
    // (cobrados + pendientes + créditos). Es la "venta total" del periodo.
    const venta = filtered.reduce((s, b) => s + (b.precio_venta || 0), 0);
    // Cobrado = solo los que están en estatus COBRADO (dinero ya entró)
    const cobrado = filtered
      .filter((b) => b.estatus === 'COBRADO')
      .reduce((s, b) => s + (b.precio_venta || 0), 0);
    // Por confirmar = EFECTIVO CUBA + PENDIENTE (probable en caja, falta confirmar)
    const porConfirmarBoletos = filtered.filter((b) => esPorConfirmar(b));
    const porConfirmar = porConfirmarBoletos.reduce(
      (s, b) => s + (b.precio_venta || 0),
      0
    );
    const porConfirmarCount = porConfirmarBoletos.length;
    const totalCosto = filtered.reduce((s, b) => s + (b.costo_usd || 0), 0);
    // Utilidad = venta - costo (sobre todo lo capturado)
    const utilidad = filtered
      .filter((b) => b.precio_venta != null)
      .reduce((s, b) => s + ((b.precio_venta || 0) - (b.costo_usd || 0)), 0);
    // Crédito pendiente = boletos con forma_pago=CREDITO y no cobrados
    const pendiente = filtered
      .filter(
        (b) =>
          b.estatus !== 'COBRADO' &&
          b.precio_venta != null &&
          b.forma_pago === 'CREDITO'
      )
      .reduce((s, b) => s + (b.precio_venta || 0), 0);
    const margen = venta > 0 ? (utilidad / venta) * 100 : 0;
    return {
      venta,
      cobrado,
      porConfirmar,
      porConfirmarCount,
      totalCosto,
      utilidad,
      pendiente,
      margen,
    };
  }, [filtered]);

  const fmtMoney = (n) =>
    n == null || isNaN(n)
      ? '$0.00'
      : '$' +
        n.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  const fmtMxn = (n) =>
    n == null || isNaN(n) || n === 0
      ? ''
      : '$' +
        n.toLocaleString('es-MX', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) +
        ' MXN';

  return (
    <div>
      {/* Selector de periodo */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 18,
          padding: '12px 16px',
          background: C.bgSoft,
          borderRadius: 10,
          border: `1px solid ${C.border}`,
        }}
      >
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>
          📅 PERIODO:
        </span>
        {[
          { id: 'today', label: 'Hoy' },
          { id: 'thisWeek', label: 'Esta semana' },
          { id: 'thisMonth', label: 'Este mes' },
          { id: 'lastMonth', label: 'Mes pasado' },
          { id: 'last30', label: 'Últimos 30 días' },
          { id: 'all', label: 'Todo' },
        ].map((p) => {
          const r = presetRange(p.id);
          const isActive =
            (r.from || '') === (dateFrom || '') &&
            (r.to || '') === (dateTo || '');
          return (
            <button
              key={p.id}
              onClick={() => onChangeRange(r.from, r.to)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: `1px solid ${isActive ? C.navy : '#CBD5E1'}`,
                background: isActive ? C.navy : 'white',
                color: isActive ? 'white' : C.slate,
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          );
        })}
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            color: C.muted,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          Por:
          <select
            value={dateField}
            onChange={(e) => onChangeDateField(e.target.value)}
            style={{
              padding: '4px 8px',
              borderRadius: 4,
              border: `1px solid #CBD5E1`,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <option value="fecha_venta">Fecha de venta</option>
            <option value="fecha_cobro">Fecha de cobro</option>
          </select>
        </span>
      </div>

      {/* Saldos actuales por caja (acumulados, sin filtro) */}
      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <div>
            <h4
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                color: C.navy,
              }}
            >
              💰 Saldos actuales por caja
            </h4>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: C.muted }}>
              Acumulado: cobros recibidos − transferencias salientes (no
              respeta el filtro de fecha)
            </p>
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
          }}
        >
          {CAJAS.filter(
            (c) => !c.tipo.startsWith('externa_')
          ).map((c) => {
            const s = saldosPorCaja[c.id];
            if (!s) return null;
            const hasUsd = Math.abs(s.usd) > 0.005;
            const hasMxn = Math.abs(s.mxn) > 0.005;
            const empty = !hasUsd && !hasMxn;
            return (
              <button
                key={c.id}
                onClick={() => setSaldoCajaDetail(c.id)}
                style={{
                  background: empty ? '#FAFBFF' : 'white',
                  border: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${c.color}`,
                  borderRadius: 10,
                  padding: '10px 12px',
                  opacity: empty ? 0.7 : 1,
                  textAlign: 'left',
                  cursor: 'pointer',
                  font: 'inherit',
                  transition: 'transform 0.1s, box-shadow 0.1s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow =
                    '0 4px 12px rgba(15,23,42,0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    color: C.muted,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 14 }}>{c.icon}</span>
                  <span style={{ color: c.color }}>{c.label}</span>
                </div>
                {empty ? (
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: '#94A3B8',
                    }}
                  >
                    $0.00
                  </div>
                ) : (
                  <div>
                    {hasUsd && (
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: s.usd >= 0 ? C.navy : C.costo,
                          fontFamily: 'ui-monospace, monospace',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {s.usd >= 0 ? '' : '-'}$
                        {Math.abs(s.usd).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        <span
                          style={{
                            fontSize: 11,
                            color: C.muted,
                            fontWeight: 500,
                          }}
                        >
                          USD
                        </span>
                      </div>
                    )}
                    {hasMxn && (
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: s.mxn >= 0 ? C.navy : C.costo,
                          fontFamily: 'ui-monospace, monospace',
                          marginTop: hasUsd ? 2 : 0,
                        }}
                      >
                        {s.mxn >= 0 ? '' : '-'}$
                        {Math.abs(s.mxn).toLocaleString('es-MX', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        <span
                          style={{
                            fontSize: 11,
                            color: C.muted,
                            fontWeight: 500,
                          }}
                        >
                          MXN
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {/* Badge "Por confirmar" — solo si hay boletos EFECTIVO CUBA + PENDIENTE */}
                {s.porConfirmarCount > 0 && (
                  <div
                    style={{
                      marginTop: 6,
                      padding: '4px 8px',
                      background: '#FEF3C7',
                      border: '1px solid #FCD34D',
                      borderRadius: 6,
                      fontSize: 11,
                      color: '#92400E',
                      fontWeight: 600,
                      lineHeight: 1.3,
                    }}
                  >
                    🟡 Por confirmar:{' '}
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 800 }}>
                      ${s.porConfirmarUsd.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>{' '}
                    <span style={{ fontWeight: 500, opacity: 0.8 }}>
                      ({s.porConfirmarCount} {s.porConfirmarCount === 1 ? 'boleto' : 'boletos'})
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPIs (clickeables: abren modal con desglose) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <KpiClickable onClick={() => setDetailKpi('venta')}>
          <KpiCard
            label="Venta"
            value={fmtMoney(kpis.venta)}
            subtitle="USD eq. · click para ver detalle"
            accent={C.venta}
          />
        </KpiClickable>
        <KpiClickable onClick={() => setDetailKpi('costo')}>
          <KpiCard
            label="Costo Caribe Cool"
            value={fmtMoney(kpis.totalCosto)}
            subtitle="USD · click para ver detalle"
            accent={C.costo}
          />
        </KpiClickable>
        <KpiClickable onClick={() => setDetailKpi('utilidad')}>
          <KpiCard
            label="Utilidad"
            value={
              (kpis.utilidad >= 0 ? '+' : '') + fmtMoney(kpis.utilidad).slice(1)
            }
            subtitle={`USD · ${kpis.margen.toFixed(1)}% margen`}
            accent={kpis.utilidad >= 0 ? C.utilidad : C.costo}
          />
        </KpiClickable>
        <KpiClickable onClick={() => setDetailKpi('cobrado')}>
          <KpiCard
            label="Cobrado"
            value={fmtMoney(kpis.cobrado + kpis.porConfirmar)}
            subtitle={
              kpis.porConfirmarCount > 0
                ? `USD · ${fmtMoney(kpis.cobrado)} confirmado + ${fmtMoney(
                    kpis.porConfirmar
                  )} 🟡 por confirmar`
                : 'USD · ya entró el dinero'
            }
          />
        </KpiClickable>
        <KpiClickable onClick={() => setDetailKpi('cxc')}>
          <KpiCard
            label="CxC"
            value={fmtMoney(kpis.pendiente)}
            subtitle="USD · por cobrar"
            accent={C.warn}
          />
        </KpiClickable>
      </div>

      {/* Modal de detalle de KPI */}
      {detailKpi && (
        <KpiDetailModal
          kpiType={detailKpi}
          boletos={filtered}
          onClose={() => setDetailKpi(null)}
        />
      )}

      {/* Modal de detalle de saldo de caja (al hacer click en una card) */}
      {saldoCajaDetail && (
        <SaldoCajaDetailModal
          cajaId={saldoCajaDetail}
          boletos={boletos}
          movimientos={movimientos}
          onClose={() => setSaldoCajaDetail(null)}
        />
      )}

      {/* Tarjetas de cajas/bancos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {CATEGORIAS.map((cat) => {
          const grupo = grouped[cat.id];
          if (!grupo || grupo.boletos.length === 0) return null;
          const totalGrupoUSD = grupo.boletos.reduce(
            (s, b) => s + (b.precio_venta || 0),
            0
          );
          const breakdownEntries = Object.entries(grupo.breakdown).sort(
            (a, b) => b[1].totalUSD - a[1].totalUSD
          );
          return (
            <div
              key={cat.id}
              style={{
                background: 'white',
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '12px 16px',
                  background: cat.bgSoft,
                  borderBottom: `1px solid ${C.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 20 }}>{cat.icon}</span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: cat.color,
                    }}
                  >
                    {cat.label}
                  </div>
                  {cat.note && (
                    <div
                      style={{
                        fontSize: 11,
                        color: C.muted,
                        marginTop: 2,
                      }}
                    >
                      {cat.note}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 16,
                    color: cat.color,
                  }}
                >
                  {fmtMoney(totalGrupoUSD)} USD
                </div>
              </div>
              <table
                style={{
                  width: '100%',
                  fontSize: 13,
                  borderCollapse: 'collapse',
                }}
              >
                <tbody>
                  {breakdownEntries.map(([fp, data], idx) => (
                    <tr
                      key={fp}
                      style={{
                        borderBottom:
                          idx < breakdownEntries.length - 1
                            ? `1px solid #F1F5F9`
                            : 'none',
                      }}
                    >
                      <td
                        style={{
                          padding: '10px 16px',
                          fontWeight: 500,
                          color: C.navy,
                        }}
                      >
                        {fp}
                        {data.porConfirmarCount > 0 && (
                          <span
                            style={{
                              marginLeft: 8,
                              padding: '2px 6px',
                              fontSize: 10,
                              fontWeight: 700,
                              color: '#92400E',
                              background: '#FEF3C7',
                              border: '1px solid #FCD34D',
                              borderRadius: 4,
                              letterSpacing: '0.04em',
                              verticalAlign: 'middle',
                            }}
                            title={`${data.porConfirmarCount} ${
                              data.porConfirmarCount === 1 ? 'boleto' : 'boletos'
                            } por confirmar con tu equipo (${fmtMoney(
                              data.porConfirmarUSD
                            )} USD). Cambia el estatus a COBRADO cuando te confirmen.`}
                          >
                            🟡 {data.porConfirmarCount} POR CONFIRMAR
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: '10px 16px',
                          textAlign: 'right',
                          color: C.muted,
                          fontSize: 12,
                        }}
                      >
                        {data.count} boleto{data.count !== 1 ? 's' : ''}
                      </td>
                      <td
                        style={{
                          padding: '10px 16px',
                          textAlign: 'right',
                          color: C.muted,
                          fontSize: 12,
                          fontFamily: 'ui-monospace, monospace',
                        }}
                      >
                        {data.totalMXN > 0 ? fmtMxn(data.totalMXN) : '—'}
                      </td>
                      <td
                        style={{
                          padding: '10px 16px',
                          textAlign: 'right',
                          fontWeight: 700,
                          fontFamily: 'ui-monospace, monospace',
                        }}
                      >
                        {fmtMoney(data.totalUSD)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: C.muted,
              background: 'white',
              border: `1px dashed ${C.border}`,
              borderRadius: 12,
            }}
          >
            No hay boletos en este periodo.
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 16,
          fontSize: 11,
          color: C.muted,
          lineHeight: 1.6,
        }}
      >
        💡 Esta vista agrupa los boletos por destino del dinero, según la Forma
        de Pago seleccionada en cada uno. Los montos en USD son convertidos
        automáticamente desde la moneda local (cuando aplica) usando el TC
        capturado en cada boleto.
      </div>
    </div>
  );
}

function EstadoCuentaCaribeCool({
  boletos,
  movimientos,
  presetRange,
  onOpenNewRecarga,
  onOpenSaldoInicial,
}) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [ccDetailKpi, setCcDetailKpi] = useState(null);
  // 'recargas' | 'consumos' | 'saldo' | null

  // ¿Existe ya un saldo inicial capturado?
  const tieneSaldoInicial = useMemo(
    () => movimientos.some((m) => esSaldoInicial(m)),
    [movimientos]
  );

  // Recargas: movimientos cuyo destino sea caribe_cool
  // Aportes que llegan directo a caribe_cool (aporte_socio → caribe_cool) también cuentan
  const recargas = useMemo(() => {
    return movimientos
      .filter((m) => m.caja_destino === 'caribe_cool')
      .map((m) => {
        const inicial = esSaldoInicial(m);
        return {
          id: m.id,
          tipo: inicial ? 'saldo_inicial' : 'recarga',
          fecha: m.fecha,
          descripcion: inicial
            ? 'Saldo inicial de la cuenta'
            : `Recarga desde ${
                getCaja(m.caja_origen)?.label || m.caja_origen
              }`,
          monto: m.monto_destino != null ? m.monto_destino : m.monto,
          moneda: m.moneda_destino || m.moneda || 'USD',
          nota: m.nota || '',
          origen: m.caja_origen,
        };
      })
      .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  }, [movimientos]);

  // Consumos: cada boleto consume su costo_usd
  // El "evento" de consumo lo asignamos a la fecha de venta del boleto
  const consumos = useMemo(() => {
    return boletos
      .filter((b) => b.costo_usd != null && b.costo_usd > 0)
      .map((b) => ({
        id: 'cons_' + b.id,
        tipo: 'consumo',
        fecha:
          b.fecha_venta && typeof b.fecha_venta === 'string'
            ? b.fecha_venta.slice(0, 10)
            : b.fecha_venta,
        descripcion: `${b.pnr} · ${b.cliente || '(sin cliente)'}`,
        subDesc: b.descripcion || '',
        monto: b.costo_usd,
        moneda: b.moneda_costo || 'USD',
        boleto_id: b.id,
      }))
      .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
  }, [boletos]);

  // Tabla unificada con saldo corriente
  // Orden: por fecha asc. Para misma fecha: saldo inicial primero (0),
  // luego recargas (1), luego consumos (2).
  const movimientosTabla = useMemo(() => {
    const all = [
      ...recargas.map((r) => ({
        ...r,
        sortKey: r.tipo === 'saldo_inicial' ? '0' : '1',
      })),
      ...consumos.map((c) => ({ ...c, sortKey: '2' })),
    ];
    all.sort((a, b) => {
      const fa = a.fecha || '';
      const fb = b.fecha || '';
      if (fa !== fb) return fa.localeCompare(fb);
      return a.sortKey.localeCompare(b.sortKey);
    });

    // Calcular saldo corriente
    let saldo = 0;
    return all.map((item) => {
      if (item.tipo === 'recarga' || item.tipo === 'saldo_inicial') {
        saldo += item.monto;
      } else {
        saldo -= item.monto;
      }
      return { ...item, saldoCorriente: saldo };
    });
  }, [recargas, consumos]);

  // Filtrar por periodo (si aplica)
  const movimientosFiltrados = useMemo(() => {
    return movimientosTabla.filter((m) => {
      const d = String(m.fecha || '').slice(0, 10);
      if (!d) return false;
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [movimientosTabla, dateFrom, dateTo]);

  // KPIs (sobre el periodo filtrado si hay; sino totales)
  const kpis = useMemo(() => {
    const listaPeriodo = movimientosFiltrados;
    const recargasPeriodo = listaPeriodo
      .filter(
        (m) => m.tipo === 'recarga' || m.tipo === 'saldo_inicial'
      )
      .reduce((s, m) => s + m.monto, 0);
    const consumosPeriodo = listaPeriodo
      .filter((m) => m.tipo === 'consumo')
      .reduce((s, m) => s + m.monto, 0);
    // Saldo final actual: el saldoCorriente del último item (de TODOS, no del filtro)
    const saldoFinal =
      movimientosTabla.length > 0
        ? movimientosTabla[movimientosTabla.length - 1].saldoCorriente
        : 0;
    return { recargasPeriodo, consumosPeriodo, saldoFinal };
  }, [movimientosFiltrados, movimientosTabla]);

  const fmtMoney = (n) =>
    n == null || isNaN(n)
      ? '$0.00'
      : '$' +
        n.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: C.navy,
            }}
          >
            🔻 Estado de cuenta · Caribe Cool
          </h3>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: 12,
              color: C.muted,
            }}
          >
            Recargas a la cuenta del proveedor − Consumos por boletos vendidos
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!tieneSaldoInicial && (
            <button
              onClick={onOpenSaldoInicial}
              style={{
                padding: '9px 16px',
                borderRadius: 8,
                border: '1px solid #FCD34D',
                background: '#FEF3C7',
                color: '#92400E',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              📍 Capturar saldo inicial
            </button>
          )}
          <button
            onClick={onOpenNewRecarga}
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              border: 'none',
              background: C.navy,
              color: 'white',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Plus size={15} /> Nueva recarga
          </button>
        </div>
      </div>

      {/* Banner: pedir saldo inicial si no existe */}
      {!tieneSaldoInicial && (
        <div
          style={{
            padding: '14px 16px',
            background: '#FEF3C7',
            border: '1px solid #FCD34D',
            borderRadius: 10,
            fontSize: 13,
            color: '#92400E',
            marginBottom: 14,
            lineHeight: 1.55,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 24, lineHeight: 1 }}>📍</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              Aún no has capturado el saldo inicial con Caribe Cool
            </div>
            <div>
              Si ya tenías un saldo con el proveedor antes de empezar a usar
              la app, captúralo ahora como punto de partida. El saldo se
              registra como un <b>movimiento de "Aportación de socios → Caribe
              Cool"</b> con la nota{' '}
              <code
                style={{
                  background: 'rgba(146,64,14,0.1)',
                  padding: '1px 5px',
                  borderRadius: 3,
                  fontSize: 12,
                }}
              >
                Saldo inicial
              </code>
              . Sin esto, el saldo arranca contando todo desde cero y aparecerá
              en rojo si has vendido boletos sin recargas previas.
            </div>
          </div>
        </div>
      )}

      {/* Selector de periodo */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 14,
          padding: '12px 16px',
          background: C.bgSoft,
          borderRadius: 10,
          border: `1px solid ${C.border}`,
        }}
      >
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>
          📅 PERIODO:
        </span>
        {[
          { id: 'today', label: 'Hoy' },
          { id: 'thisWeek', label: 'Esta semana' },
          { id: 'thisMonth', label: 'Este mes' },
          { id: 'lastMonth', label: 'Mes pasado' },
          { id: 'last30', label: 'Últimos 30 días' },
          { id: 'all', label: 'Todo' },
        ].map((p) => {
          const r = presetRange(p.id);
          const isActive =
            (r.from || '') === (dateFrom || '') &&
            (r.to || '') === (dateTo || '');
          return (
            <button
              key={p.id}
              onClick={() => {
                setDateFrom(r.from);
                setDateTo(r.to);
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: `1px solid ${isActive ? C.navy : '#CBD5E1'}`,
                background: isActive ? C.navy : 'white',
                color: isActive ? 'white' : C.slate,
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <KpiClickable onClick={() => setCcDetailKpi('recargas')}>
          <KpiCard
            label="Recargas en periodo"
            value={fmtMoney(kpis.recargasPeriodo)}
            subtitle="USD · click para ver desglose"
            accent={C.utilidad}
          />
        </KpiClickable>
        <KpiClickable onClick={() => setCcDetailKpi('consumos')}>
          <KpiCard
            label="Consumos en periodo"
            value={fmtMoney(kpis.consumosPeriodo)}
            subtitle="USD · click para ver desglose"
            accent={C.costo}
          />
        </KpiClickable>
        <KpiClickable onClick={() => setCcDetailKpi('saldo')}>
          <KpiCard
            label="Saldo actual con Caribe Cool"
            value={fmtMoney(kpis.saldoFinal)}
            subtitle={
              kpis.saldoFinal >= 0
                ? 'USD · click para movimientos'
                : 'USD · en rojo (click para detalle)'
            }
            accent={kpis.saldoFinal >= 0 ? C.utilidad : C.costo}
          />
        </KpiClickable>
      </div>

      {/* Modal de detalle de KPI Caribe Cool */}
      {ccDetailKpi && (
        <CaribeCoolKpiModal
          kpiType={ccDetailKpi}
          movimientosTabla={movimientosTabla}
          movimientosFiltrados={movimientosFiltrados}
          kpis={kpis}
          onClose={() => setCcDetailKpi(null)}
        />
      )}

      {/* Tabla cronológica */}
      <div
        style={{
          background: 'white',
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
          }}
        >
          <thead>
            <tr style={{ background: C.navy }}>
              <th
                style={{
                  ...th,
                  padding: '10px 12px',
                  textAlign: 'center',
                  width: 100,
                }}
              >
                Fecha
              </th>
              <th
                style={{
                  ...th,
                  padding: '10px 12px',
                  textAlign: 'center',
                  width: 100,
                }}
              >
                Tipo
              </th>
              <th style={{ ...th, padding: '10px 12px' }}>Descripción</th>
              <th
                style={{
                  ...th,
                  padding: '10px 12px',
                  textAlign: 'right',
                  width: 130,
                }}
              >
                Monto
              </th>
              <th
                style={{
                  ...th,
                  padding: '10px 12px',
                  textAlign: 'right',
                  width: 140,
                }}
              >
                Saldo
              </th>
            </tr>
          </thead>
          <tbody>
            {movimientosFiltrados.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: 40,
                    textAlign: 'center',
                    color: C.muted,
                  }}
                >
                  {movimientosTabla.length === 0
                    ? 'Aún no hay recargas ni consumos registrados.'
                    : 'No hay movimientos en este periodo.'}
                </td>
              </tr>
            ) : (
              movimientosFiltrados.map((m, idx) => {
                const isRecarga = m.tipo === 'recarga';
                const isSaldoInicial = m.tipo === 'saldo_inicial';
                const esEntrada = isRecarga || isSaldoInicial;
                return (
                  <tr
                    key={m.id}
                    style={{
                      background:
                        isSaldoInicial
                          ? '#FEFCE8'
                          : idx % 2 === 0
                          ? 'white'
                          : '#FAFBFF',
                      borderBottom: `1px solid #F1F5F9`,
                    }}
                  >
                    <td
                      style={{
                        ...td,
                        textAlign: 'center',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {formatDate(m.fecha)}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          background: isSaldoInicial
                            ? '#FEF3C7'
                            : isRecarga
                            ? '#DCFCE7'
                            : '#FEE2E2',
                          color: isSaldoInicial
                            ? '#92400E'
                            : isRecarga
                            ? '#166534'
                            : '#991B1B',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isSaldoInicial
                          ? '📍 Saldo inicial'
                          : isRecarga
                          ? '↑ Recarga'
                          : '↓ Consumo'}
                      </span>
                    </td>
                    <td style={{ ...td, fontSize: 12 }}>
                      <div style={{ fontWeight: 600, color: C.navy }}>
                        {m.descripcion}
                      </div>
                      {m.subDesc && (
                        <div
                          style={{
                            fontSize: 11,
                            color: C.muted,
                            marginTop: 2,
                            maxWidth: 380,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {m.subDesc}
                        </div>
                      )}
                      {m.nota && !isSaldoInicial && (
                        <div
                          style={{
                            fontSize: 11,
                            color: C.muted,
                            marginTop: 2,
                            fontStyle: 'italic',
                          }}
                        >
                          {m.nota}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        ...td,
                        textAlign: 'right',
                        fontFamily: 'ui-monospace, monospace',
                        fontWeight: 700,
                        fontSize: 12,
                        color: esEntrada ? '#16A34A' : '#DC2626',
                      }}
                    >
                      {esEntrada ? '+' : '−'}{fmtMoney(m.monto).slice(1)}
                    </td>
                    <td
                      style={{
                        ...td,
                        textAlign: 'right',
                        fontFamily: 'ui-monospace, monospace',
                        fontWeight: 800,
                        fontSize: 12,
                        color: m.saldoCorriente >= 0 ? C.navy : C.costo,
                      }}
                    >
                      {m.saldoCorriente < 0 ? '-' : ''}
                      {fmtMoney(Math.abs(m.saldoCorriente))}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: 14,
          fontSize: 11,
          color: C.muted,
          lineHeight: 1.6,
        }}
      >
        💡 Esta vista intercala cronológicamente <b>las recargas</b> que mandas
        a Caribe Cool (movimientos con destino = Caribe Cool) y{' '}
        <b>los consumos</b> (costo USD de cada boleto vendido). La columna{' '}
        <b>Saldo</b> es el balance corriente. Si nunca hubo saldo inicial,
        captúralo como un movimiento de "Aportación de socios → Caribe Cool"
        con fecha anterior.
      </div>
    </div>
  );
}

function ReporteDiario({ boletos, movimientos, onEditBoleto }) {
  // Por default, ayer
  const ayer = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);
  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const anteayer = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    return d.toISOString().slice(0, 10);
  }, []);
  const [fecha, setFecha] = useState(ayer);

  // Boletos del día seleccionado (por fecha_venta)
  // Usa dateOnly() para ser robusto ante Date objects o strings con timezone
  // Excluye boletos con costo $0 (transacciones negativas / ajustes) — no son
  // operaciones reales y no deben ensuciar el reporte
  const boletosDia = useMemo(() => {
    return boletos.filter((b) => {
      if (!b.fecha_venta) return false;
      if (noRequiereConciliacion(b)) return false; // costo $0 → fuera
      return dateOnly(b.fecha_venta) === fecha;
    });
  }, [boletos, fecha]);

  // Boletos del día INCOMPLETOS (les faltan datos para conciliar)
  // Excluye los de costo $0 (transacciones negativas que no requieren conciliación)
  const boletosIncompletos = useMemo(() => {
    return boletosDia.filter(
      (b) => !isConciliado(b) && !noRequiereConciliacion(b)
    );
  }, [boletosDia]);

  // Calcula qué campos le faltan a un boleto
  function faltaCapturar(b) {
    const faltan = [];
    if (!b.so_mexico && !b.so_cuba) faltan.push('SO');
    if (b.precio_venta == null) faltan.push('Precio Venta');
    if (!b.plaza) faltan.push('Plaza');
    if (!b.forma_pago) faltan.push('Forma de Pago');
    if (!b.estatus) faltan.push('Estatus');
    if (b.estatus === 'COBRADO' && !b.fecha_cobro)
      faltan.push('Fecha Cobro');
    return faltan;
  }

  const hayIncompletos = boletosIncompletos.length > 0;

  // Ref al preview para capturar como imagen
  const previewRef = useRef(null);

  // ─── Descargar como imagen PNG (para WhatsApp en alta definición) ───
  async function descargarImagen() {
    if (hayIncompletos) {
      alert(
        `⛔ Hay ${boletosIncompletos.length} boleto${
          boletosIncompletos.length !== 1 ? 's' : ''
        } sin terminar de capturar. Complétalos antes de generar el reporte.`
      );
      return;
    }
    if (!previewRef.current) return;

    try {
      const canvas = await html2canvas(previewRef.current, {
        scale: 2, // alta resolución (Retina)
        backgroundColor: '#FFFFFF',
        logging: false,
        useCORS: true,
      });

      // Descargar como PNG
      canvas.toBlob(
        (blob) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `Reporte_Diario_${fecha}.png`;
          link.href = url;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 100);
        },
        'image/png',
        1.0
      );
    } catch (err) {
      alert('⚠ Error generando la imagen: ' + (err.message || err));
    }
  }

  // ─── Versión vertical optimizada para WhatsApp ───
  // Renderiza el reporte en un wrapper off-screen de 720px de ancho
  // (resultado final ~1080px @ scale 1.5). Todo apilado verticalmente,
  // tipografía grande, ideal para mandar como imagen en WhatsApp.
  async function descargarImagenWhatsApp() {
    if (hayIncompletos) {
      alert(
        `⛔ Hay ${boletosIncompletos.length} boleto${
          boletosIncompletos.length !== 1 ? 's' : ''
        } sin terminar de capturar. Complétalos antes de generar el reporte.`
      );
      return;
    }

    // Construir HTML del reporte vertical
    const colors = {
      navy: '#0F172A',
      venta: '#0F8F70',
      costo: '#DC2626',
      utilidad: '#16A34A',
      muted: '#64748B',
      border: '#E2E8F0',
      bgSoft: '#F8FAFC',
    };

    const formatMoney = (n) => {
      if (n == null || isNaN(n)) return '$0.00';
      return (
        '$' +
        Number(n).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
    };

    // Lista de boletos por caja (mismo orden que el preview normal)
    const seccionesHtml = distribucion
      .map((g) => {
        const cat = g.categoria;
        const filasHtml = g.boletos
          .map((b, i) => {
            const bg = i % 2 === 0 ? 'white' : '#FAFBFF';
            const descLimpia = b.descripcion
              ? b.descripcion.replace(/Venta del billete /, '')
              : '';
            return `
              <tr style="background: ${bg};">
                <td style="padding: 12px 16px; font-family: ui-monospace, monospace; font-weight: 700; color: ${colors.navy}; font-size: 16px; vertical-align: top; white-space: nowrap;">${b.pnr || ''}</td>
                <td style="padding: 12px 16px; color: #334155; font-size: 16px; vertical-align: top;">
                  <div style="font-weight: 600;">${b.cliente || '(sin cliente)'}</div>
                  <div style="font-size: 13px; color: ${colors.muted}; margin-top: 3px;">${descLimpia}</div>
                </td>
                <td style="padding: 12px 16px; text-align: right; font-family: ui-monospace, monospace; font-weight: 700; color: ${colors.navy}; font-size: 16px; vertical-align: top; white-space: nowrap;">${b.precio_venta != null ? formatMoney(b.precio_venta) : '—'}</td>
              </tr>`;
          })
          .join('');

        return `
          <div style="border: 1px solid ${colors.border}; border-radius: 12px; overflow: hidden; margin-bottom: 16px;">
            <div style="padding: 16px 20px; background: ${cat.bgSoft || colors.bgSoft}; display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 26px;">${cat.icon}</span>
              <span style="font-weight: 700; font-size: 18px; color: ${cat.color || colors.navy}; flex: 1;">${cat.label}</span>
            </div>
            <div style="padding: 8px 20px; background: ${cat.bgSoft || colors.bgSoft}; border-top: 1px solid ${colors.border}; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 14px; color: ${colors.muted}; font-weight: 500;">${g.count} boleto${g.count !== 1 ? 's' : ''}</span>
              <span style="font-weight: 800; font-size: 22px; color: ${cat.color || colors.navy}; font-family: ui-monospace, monospace;">${formatMoney(g.total)}</span>
            </div>
            ${g.boletos.length > 0 ? `<table style="width: 100%; border-collapse: collapse; background: white;"><tbody>${filasHtml}</tbody></table>` : ''}
          </div>`;
      })
      .join('');

    const html = `
      <div style="width: 720px; background: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: ${colors.navy};">
        <!-- BANNER -->
        <div style="padding: 32px; background: linear-gradient(135deg, ${colors.navy} 0%, #1E3A5F 100%); color: white;">
          <div style="font-size: 13px; opacity: 0.75; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 600;">
            Reporte Venta Boletería · Caribe Cool
          </div>
          <div style="font-size: 38px; font-weight: 800; margin-top: 12px; letter-spacing: -0.02em;">
            ${formatDate(fecha)}
          </div>
          <div style="font-size: 15px; opacity: 0.7; margin-top: 8px;">
            Viajes Libero · Generado el ${formatDate(hoy)}
          </div>
        </div>

        <!-- SECCIÓN 1: RESUMEN -->
        <div style="padding: 28px 24px; background: white;">
          <div style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${colors.muted}; margin-bottom: 18px;">
            1 · Resumen del día
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            <div style="background: white; padding: 20px; border-radius: 12px; border: 1px solid ${colors.border}; border-top: 4px solid ${colors.navy};">
              <div style="font-size: 13px; color: ${colors.muted}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">Boletos</div>
              <div style="font-size: 36px; font-weight: 800; color: ${colors.navy}; margin-top: 6px; letter-spacing: -0.02em;">${resumen.count}</div>
            </div>
            <div style="background: white; padding: 20px; border-radius: 12px; border: 1px solid ${colors.border}; border-top: 4px solid ${colors.venta};">
              <div style="font-size: 13px; color: ${colors.muted}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">Venta</div>
              <div style="font-size: 30px; font-weight: 800; color: ${colors.venta}; margin-top: 6px; font-family: ui-monospace, monospace; letter-spacing: -0.02em;">${formatMoney(resumen.venta)}</div>
            </div>
            <div style="background: white; padding: 20px; border-radius: 12px; border: 1px solid ${colors.border}; border-top: 4px solid ${colors.costo};">
              <div style="font-size: 13px; color: ${colors.muted}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">Costo</div>
              <div style="font-size: 30px; font-weight: 800; color: ${colors.costo}; margin-top: 6px; font-family: ui-monospace, monospace; letter-spacing: -0.02em;">${formatMoney(resumen.costo)}</div>
            </div>
            <div style="background: white; padding: 20px; border-radius: 12px; border: 1px solid ${colors.border}; border-top: 4px solid ${resumen.utilidad >= 0 ? colors.utilidad : colors.costo};">
              <div style="font-size: 13px; color: ${colors.muted}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">Utilidad</div>
              <div style="font-size: 30px; font-weight: 800; color: ${resumen.utilidad >= 0 ? colors.utilidad : colors.costo}; margin-top: 6px; font-family: ui-monospace, monospace; letter-spacing: -0.02em;">${resumen.utilidad >= 0 ? '+' : '-'}${formatMoney(Math.abs(resumen.utilidad))}</div>
              <div style="font-size: 12px; color: ${colors.muted}; margin-top: 6px; font-weight: 500;">${resumen.margen.toFixed(1)}% margen</div>
            </div>
          </div>
        </div>

        <!-- SECCIÓN 2: ¿DÓNDE ESTÁ EL DINERO? -->
        <div style="padding: 28px 24px; background: white; border-top: 1px solid ${colors.border};">
          <div style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${colors.muted}; margin-bottom: 18px;">
            2 · ¿Dónde está el dinero?
          </div>
          ${
            distribucion.length === 0
              ? `<div style="color: ${colors.muted}; font-size: 15px;">Sin cobros registrados del día.</div>`
              : seccionesHtml
          }
        </div>

        <!-- SECCIÓN 3: SALDO CARIBE COOL -->
        <div style="padding: 28px 24px; background: white; border-top: 1px solid ${colors.border};">
          <div style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${colors.muted}; margin-bottom: 18px;">
            3 · Saldo Caribe Cool
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 16px;">
            <tbody>
              <tr style="border-bottom: 1px solid #F1F5F9;">
                <td style="padding: 14px 0; color: ${colors.muted};">Saldo al inicio del día</td>
                <td style="padding: 14px 0; text-align: right; font-family: ui-monospace, monospace; font-weight: 600;">${formatMoney(saldoCC.inicio)}</td>
              </tr>
              <tr style="border-bottom: 1px solid #F1F5F9;">
                <td style="padding: 14px 0;">Recargas del día (${saldoCC.recargasDiaCount})</td>
                <td style="padding: 14px 0; text-align: right; color: ${colors.utilidad}; font-weight: 700; font-family: ui-monospace, monospace;">${saldoCC.recargasDia > 0 ? '+' : ''}${formatMoney(saldoCC.recargasDia)}</td>
              </tr>
              <tr style="border-bottom: 1px solid #F1F5F9;">
                <td style="padding: 14px 0;">Consumos del día (${saldoCC.consumosDiaCount} boletos)</td>
                <td style="padding: 14px 0; text-align: right; color: ${colors.costo}; font-weight: 700; font-family: ui-monospace, monospace;">-${formatMoney(saldoCC.consumosDia)}</td>
              </tr>
              <tr style="background: ${colors.bgSoft};">
                <td style="padding: 18px 12px; font-weight: 700; font-size: 17px;">Saldo al cierre del día</td>
                <td style="padding: 18px 12px; text-align: right; font-weight: 800; font-size: 24px; font-family: ui-monospace, monospace; color: ${saldoCC.cierre >= 0 ? colors.navy : colors.costo};">${saldoCC.cierre < 0 ? '-' : ''}${formatMoney(Math.abs(saldoCC.cierre))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Footer -->
        <div style="padding: 16px 24px; background: ${colors.bgSoft}; text-align: center; font-size: 12px; color: ${colors.muted}; border-top: 1px solid ${colors.border};">
          Generado por CxP Manager · Viajes Libero
        </div>
      </div>`;

    // Crear wrapper off-screen, montar HTML, capturar con html2canvas, limpiar
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.top = '-99999px';
    wrapper.style.left = '0';
    wrapper.style.zIndex = '-1';
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);

    try {
      const target = wrapper.firstElementChild;
      const canvas = await html2canvas(target, {
        scale: 1.5, // 720 * 1.5 = 1080px (ancho recomendado para WhatsApp Status)
        backgroundColor: '#FFFFFF',
        logging: false,
        useCORS: true,
        width: 720,
      });
      canvas.toBlob(
        (blob) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `Reporte_WhatsApp_${fecha}.png`;
          link.href = url;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 100);
        },
        'image/png',
        1.0
      );
    } catch (err) {
      alert('⚠ Error generando la imagen: ' + (err.message || err));
    } finally {
      document.body.removeChild(wrapper);
    }
  }

  // 1. Resumen del día
  const resumen = useMemo(() => {
    const count = boletosDia.length;
    const venta = boletosDia.reduce(
      (s, b) => s + (b.precio_venta || 0),
      0
    );
    const costo = boletosDia.reduce((s, b) => s + (b.costo_usd || 0), 0);
    const utilidad = boletosDia
      .filter((b) => b.precio_venta != null)
      .reduce((s, b) => s + ((b.precio_venta || 0) - (b.costo_usd || 0)), 0);
    const margen = venta > 0 ? (utilidad / venta) * 100 : 0;
    return { count, venta, costo, utilidad, margen };
  }, [boletosDia]);

  // 2. Donde está el dinero (de las ventas del día, agrupado por categoría)
  const distribucion = useMemo(() => {
    const result = {};
    CATEGORIAS.forEach((c) => {
      result[c.id] = {
        categoria: c,
        total: 0,
        count: 0,
        boletos: [], // lista detallada para mostrar
      };
    });
    for (const b of boletosDia) {
      const catId = categoriaDelBoleto(b);
      if (result[catId]) {
        result[catId].total += b.precio_venta || 0;
        result[catId].count++;
        result[catId].boletos.push(b);
      }
    }
    return CATEGORIAS.map((c) => result[c.id]).filter(
      (g) => g.count > 0 && Math.abs(g.total) > 0.005
    );
  }, [boletosDia]);

  // 3. Saldo Caribe Cool inicio/cierre del día
  const saldoCC = useMemo(() => {
    // Recargas con destino caribe_cool
    const recargasAntes = movimientos
      .filter((m) => m.caja_destino === 'caribe_cool')
      .filter((m) => dateOnly(m.fecha || '') < fecha)
      .reduce(
        (s, m) => s + (m.monto_destino != null ? m.monto_destino : m.monto),
        0
      );
    const consumosAntes = boletos
      .filter((b) => {
        if (!b.fecha_venta) return false;
        return dateOnly(b.fecha_venta) < fecha;
      })
      .reduce((s, b) => s + (b.costo_usd || 0), 0);
    const inicio = recargasAntes - consumosAntes;

    const recargasDia = movimientos
      .filter((m) => m.caja_destino === 'caribe_cool')
      .filter((m) => dateOnly(m.fecha || '') === fecha)
      .reduce(
        (s, m) => s + (m.monto_destino != null ? m.monto_destino : m.monto),
        0
      );
    const recargasDiaCount = movimientos
      .filter((m) => m.caja_destino === 'caribe_cool')
      .filter((m) => dateOnly(m.fecha || '') === fecha).length;

    const consumosDia = boletosDia.reduce(
      (s, b) => s + (b.costo_usd || 0),
      0
    );
    const cierre = inicio + recargasDia - consumosDia;
    return {
      inicio,
      recargasDia,
      recargasDiaCount,
      consumosDia,
      consumosDiaCount: boletosDia.filter((b) => b.costo_usd > 0).length,
      cierre,
    };
  }, [movimientos, boletos, boletosDia, fecha]);

  // Lista de PNRs ordenada
  const listaPnrs = useMemo(() => {
    return [...boletosDia].sort((a, b) => {
      const fa = a.fecha_venta || '';
      const fb = b.fecha_venta || '';
      return fa.localeCompare(fb);
    });
  }, [boletosDia]);

  const fmt = (n) =>
    n == null || isNaN(n)
      ? '$0.00'
      : '$' +
        Math.abs(n).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  // ─── Generar HTML para PDF (abre ventana imprimible) ───
  function descargarPDF() {
    if (hayIncompletos) {
      alert(
        `⛔ Hay ${boletosIncompletos.length} boleto${
          boletosIncompletos.length !== 1 ? 's' : ''
        } sin terminar de capturar. Complétalos antes de generar el reporte.`
      );
      return;
    }
    const fechaFmt = formatDate(fecha);
    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>Reporte Diario - ${fechaFmt}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 32px; color: #0F172A; max-width: 800px; }
  .header { background: #0F172A; color: white; padding: 16px 20px; border-radius: 10px 10px 0 0; }
  .header-label { font-size: 11px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.08em; }
  .header-title { font-size: 20px; font-weight: 700; margin-top: 4px; }
  .header-sub { font-size: 12px; opacity: 0.7; margin-top: 6px; }
  .section { padding: 16px 20px; border: 1px solid #E2E8F0; border-top: none; }
  .section:last-child { border-radius: 0 0 10px 10px; }
  .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #64748B; margin-bottom: 14px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .kpi { padding: 12px; background: #F8FAFC; border-radius: 6px; }
  .kpi-label { font-size: 11px; color: #64748B; }
  .kpi-value { font-size: 18px; font-weight: 700; margin-top: 2px; }
  .kpi-sub { font-size: 10px; color: #94A3B8; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 8px 0; border-bottom: 1px solid #F1F5F9; }
  .tot { background: #F8FAFC; font-weight: 700; }
  .green { color: #16A34A; }
  .red { color: #DC2626; }
  .amber { color: #CA8A04; }
  .right { text-align: right; }
  .pnr-block { padding: 10px 12px; background: #F8FAFC; border-radius: 6px; margin-bottom: 8px; font-size: 12px; }
  .pnr-head { font-weight: 700; color: #0F172A; margin-bottom: 4px; }
  .pnr-meta { font-size: 11px; color: #64748B; }
  @media print {
    body { margin: 12px; }
    .section { page-break-inside: avoid; }
  }
</style>
</head><body>
  <div class="header">
    <div class="header-label">Reporte Venta Boletería · Caribe Cool · Viajes Libero</div>
    <div class="header-title">${fechaFmt}</div>
    <div class="header-sub">Generado el ${formatDate(hoy)}</div>
  </div>
  <div class="section">
    <div class="section-title">1 · Resumen del día</div>
    <div class="grid">
      <div class="kpi"><div class="kpi-label">Boletos</div><div class="kpi-value">${
        resumen.count
      }</div></div>
      <div class="kpi"><div class="kpi-label">Venta</div><div class="kpi-value">${fmt(
        resumen.venta
      )}</div></div>
      <div class="kpi"><div class="kpi-label">Costo</div><div class="kpi-value red">${fmt(
        resumen.costo
      )}</div></div>
      <div class="kpi"><div class="kpi-label">Utilidad</div><div class="kpi-value ${
        resumen.utilidad >= 0 ? 'green' : 'red'
      }">${resumen.utilidad >= 0 ? '+' : '-'}${fmt(
      resumen.utilidad
    )}</div><div class="kpi-sub">${resumen.margen.toFixed(1)}% margen</div></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">2 · ¿Dónde está el dinero?</div>
    <table>
      ${distribucion
        .map(
          (g) => `
        <tr>
          <td>${g.categoria.icon} ${g.categoria.label}</td>
          <td class="right" style="color:#64748B; font-size: 12px;">${
            g.count
          } boleto${g.count !== 1 ? 's' : ''}</td>
          <td class="right" style="font-weight:700;">${fmt(g.total)}</td>
        </tr>`
        )
        .join('')}
      ${
        distribucion.length === 0
          ? '<tr><td colspan="3" style="text-align:center; color:#94A3B8;">Sin cobros del día</td></tr>'
          : ''
      }
    </table>
  </div>
  <div class="section">
    <div class="section-title">3 · Saldo Caribe Cool</div>
    <table>
      <tr><td>Saldo al inicio del día</td><td class="right">${fmt(
        saldoCC.inicio
      )}</td></tr>
      <tr><td>Recargas del día (${saldoCC.recargasDiaCount})</td><td class="right green">${
      saldoCC.recargasDia > 0 ? '+' : ''
    }${fmt(saldoCC.recargasDia)}</td></tr>
      <tr><td>Consumos del día (${
        saldoCC.consumosDiaCount
      } boletos)</td><td class="right red">-${fmt(
      saldoCC.consumosDia
    )}</td></tr>
      <tr class="tot"><td style="font-size: 14px;">Saldo al cierre del día</td><td class="right" style="font-size:15px;">${
        saldoCC.cierre < 0 ? '-' : ''
      }${fmt(saldoCC.cierre)}</td></tr>
    </table>
  </div>
  <p style="text-align:center; color:#94A3B8; font-size: 11px; margin-top: 24px;">
    Generado por la app CxP Manager · Viajes Libero
  </p>
  <script>
    setTimeout(function() { window.print(); }, 200);
  </script>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) {
      alert(
        '⚠ No se pudo abrir la ventana del PDF. Verifica que tu navegador no esté bloqueando popups.'
      );
      return;
    }
    w.document.write(html);
    w.document.close();
  }

  // ─── Generar Excel ───
  function descargarExcel() {
    if (hayIncompletos) {
      alert(
        `⛔ Hay ${boletosIncompletos.length} boleto${
          boletosIncompletos.length !== 1 ? 's' : ''
        } sin terminar de capturar. Complétalos antes de generar el reporte.`
      );
      return;
    }
    const fechaFmt = formatDate(fecha);
    const wb = XLSX.utils.book_new();

    // Hoja 1: Resumen
    const resumenRows = [
      [`REPORTE VENTA BOLETERÍA · CARIBE COOL · VIAJES LIBERO`],
      [fechaFmt],
      [`Generado: ${formatDate(hoy)}`],
      [],
      ['1 · RESUMEN DEL DÍA'],
      ['Boletos', resumen.count],
      ['Venta (USD)', resumen.venta],
      ['Costo (USD)', resumen.costo],
      ['Utilidad (USD)', resumen.utilidad],
      ['% Margen', resumen.margen / 100],
      [],
      ['2 · ¿DÓNDE ESTÁ EL DINERO?'],
      ['Caja / Banco', 'Boletos', 'Total USD'],
      ...distribucion.map((g) => [g.categoria.label, g.count, g.total]),
      [],
      ['3 · SALDO CARIBE COOL'],
      ['Saldo al inicio del día', saldoCC.inicio],
      ['Recargas del día', saldoCC.recargasDia],
      ['Consumos del día', -saldoCC.consumosDia],
      ['Saldo al cierre del día', saldoCC.cierre],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(resumenRows);
    // Formato para columnas de moneda
    ws1['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');

    // Hoja 2: Boletos
    const headers = [
      'PNR',
      'Cliente',
      'Ruta',
      'Costo USD',
      'Precio Venta USD',
      'Utilidad USD',
      'Forma de Pago',
      'Plaza',
      'Estatus',
      'Vendedor',
    ];
    const boletosRows = listaPnrs.map((b) => [
      b.pnr || '',
      b.cliente || '',
      b.ruta || '',
      b.costo_usd != null ? b.costo_usd : '',
      b.precio_venta != null ? b.precio_venta : '',
      b.precio_venta != null && b.costo_usd != null
        ? b.precio_venta - b.costo_usd
        : '',
      b.forma_pago || '',
      b.plaza || '',
      b.estatus || '',
      b.vendedor || '',
    ]);
    const ws2 = XLSX.utils.aoa_to_sheet([headers, ...boletosRows]);
    ws2['!cols'] = [
      { wch: 10 },
      { wch: 28 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
      { wch: 22 },
      { wch: 8 },
      { wch: 11 },
      { wch: 24 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, 'Boletos');

    const filename = `Reporte_Diario_${fecha}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  return (
    <div>
      {/* Selector de fecha */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 14,
          padding: '12px 16px',
          background: C.bgSoft,
          borderRadius: 10,
          border: `1px solid ${C.border}`,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>
          📅 FECHA DEL REPORTE:
        </span>
        {[
          { d: ayer, label: 'Ayer' },
          { d: anteayer, label: 'Hace 2 días' },
        ].map((opt) => {
          const active = fecha === opt.d;
          return (
            <button
              key={opt.d}
              onClick={() => setFecha(opt.d)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: `1px solid ${active ? C.navy : '#CBD5E1'}`,
                background: active ? C.navy : 'white',
                color: active ? 'white' : C.slate,
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          );
        })}
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: `1px solid #CBD5E1`,
            fontSize: 12,
          }}
        />
        <span
          style={{
            marginLeft: 'auto',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <button
            onClick={descargarImagen}
            disabled={hayIncompletos}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: hayIncompletos
                ? '1px solid #CBD5E1'
                : '1px solid #2563EB',
              background: 'white',
              color: hayIncompletos ? '#94A3B8' : '#2563EB',
              fontWeight: 700,
              fontSize: 12,
              cursor: hayIncompletos ? 'not-allowed' : 'pointer',
              opacity: hayIncompletos ? 0.5 : 1,
            }}
          >
            📸 Imagen
          </button>
          <button
            onClick={descargarImagenWhatsApp}
            disabled={hayIncompletos}
            title="Imagen vertical optimizada para mandar por WhatsApp"
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: hayIncompletos
                ? '1px solid #CBD5E1'
                : '1px solid #25D366',
              background: 'white',
              color: hayIncompletos ? '#94A3B8' : '#0D8849',
              fontWeight: 700,
              fontSize: 12,
              cursor: hayIncompletos ? 'not-allowed' : 'pointer',
              opacity: hayIncompletos ? 0.5 : 1,
            }}
          >
            📱 WhatsApp
          </button>
          <button
            onClick={descargarPDF}
            disabled={hayIncompletos}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: hayIncompletos
                ? '1px solid #CBD5E1'
                : '1px solid #DC2626',
              background: 'white',
              color: hayIncompletos ? '#94A3B8' : '#DC2626',
              fontWeight: 700,
              fontSize: 12,
              cursor: hayIncompletos ? 'not-allowed' : 'pointer',
              opacity: hayIncompletos ? 0.5 : 1,
            }}
          >
            📄 PDF
          </button>
          <button
            onClick={descargarExcel}
            disabled={hayIncompletos}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: hayIncompletos ? '#CBD5E1' : '#16A34A',
              color: 'white',
              fontWeight: 700,
              fontSize: 12,
              cursor: hayIncompletos ? 'not-allowed' : 'pointer',
              opacity: hayIncompletos ? 0.7 : 1,
            }}
          >
            📊 Excel
          </button>
        </span>
      </div>

      {/* Banner BLOQUEANTE: boletos incompletos del día */}
      {hayIncompletos && (
        <div
          style={{
            background: '#FEE2E2',
            border: '2px solid #DC2626',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 22 }}>⛔</div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontWeight: 700,
                  color: '#991B1B',
                  fontSize: 14,
                  marginBottom: 4,
                }}
              >
                No se puede generar el reporte ·{' '}
                {boletosIncompletos.length} boleto
                {boletosIncompletos.length !== 1 ? 's' : ''} sin terminar de
                capturar
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: '#991B1B',
                  opacity: 0.8,
                  lineHeight: 1.5,
                }}
              >
                Para mantener la integridad del reporte que va al jefe, los
                botones de exportar quedan bloqueados hasta que completes la
                captura de cada boleto. Haz click en{' '}
                <b>✏ Editar</b> para terminar cada uno.
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              marginTop: 12,
            }}
          >
            {boletosIncompletos.map((b) => {
              const faltan = faltaCapturar(b);
              return (
                <div
                  key={b.id}
                  style={{
                    background: 'white',
                    border: '1px solid #FECACA',
                    borderRadius: 8,
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        color: C.navy,
                        marginBottom: 2,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'ui-monospace, monospace',
                          background: '#F1F5F9',
                          padding: '1px 6px',
                          borderRadius: 3,
                          marginRight: 6,
                        }}
                      >
                        {b.pnr}
                      </span>
                      {b.cliente || '(sin cliente)'}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: C.muted,
                        marginBottom: 4,
                      }}
                    >
                      Costo: {fmt(b.costo_usd)} ·{' '}
                      {b.descripcion || 'Sin descripción'}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: 4,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#991B1B',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          marginRight: 4,
                        }}
                      >
                        Falta:
                      </span>
                      {faltan.map((f) => (
                        <span
                          key={f}
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 3,
                            background: '#FEE2E2',
                            color: '#991B1B',
                            border: '1px solid #FECACA',
                          }}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => onEditBoleto && onEditBoleto(b.id)}
                    style={{
                      padding: '7px 14px',
                      borderRadius: 6,
                      border: 'none',
                      background: '#DC2626',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Edit2 size={12} /> Editar
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Preview del reporte */}
      <div
        ref={previewRef}
        style={{
          background: 'white',
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '24px 28px',
            background: `linear-gradient(135deg, ${C.navy} 0%, #1E3A5F 100%)`,
            color: 'white',
            position: 'relative',
          }}
        >
          <div
            style={{
              fontSize: 12,
              opacity: 0.75,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 600,
            }}
          >
            Reporte Venta Boletería · Caribe Cool · Viajes Libero
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8, letterSpacing: '-0.02em' }}>
            {formatDate(fecha)}
          </div>
          <div
            style={{
              fontSize: 13,
              opacity: 0.7,
              marginTop: 6,
            }}
          >
            Generado el {formatDate(hoy)}
          </div>
        </div>

        {/* 1. Resumen del día */}
        <div
          style={{
            padding: '24px 28px',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: C.muted,
              marginBottom: 16,
            }}
          >
            1 · Resumen del día
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 14,
            }}
          >
            <div
              style={{
                background: 'white',
                padding: 18,
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                borderTop: `3px solid ${C.navy}`,
                boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
              }}
            >
              <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Boletos</div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: C.navy,
                  marginTop: 6,
                  letterSpacing: '-0.02em',
                }}
              >
                {resumen.count}
              </div>
            </div>
            <div
              style={{
                background: 'white',
                padding: 18,
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                borderTop: `3px solid ${C.venta}`,
                boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
              }}
            >
              <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Venta</div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: C.venta,
                  marginTop: 6,
                  letterSpacing: '-0.02em',
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                {fmt(resumen.venta)}
              </div>
            </div>
            <div
              style={{
                background: 'white',
                padding: 18,
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                borderTop: `3px solid ${C.costo}`,
                boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
              }}
            >
              <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Costo</div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: C.costo,
                  marginTop: 6,
                  letterSpacing: '-0.02em',
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                {fmt(resumen.costo)}
              </div>
            </div>
            <div
              style={{
                background: 'white',
                padding: 18,
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                borderTop: `3px solid ${resumen.utilidad >= 0 ? C.utilidad : C.costo}`,
                boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
              }}
            >
              <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Utilidad</div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: resumen.utilidad >= 0 ? C.utilidad : C.costo,
                  marginTop: 6,
                  letterSpacing: '-0.02em',
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                {resumen.utilidad >= 0 ? '+' : '-'}
                {fmt(resumen.utilidad)}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: C.muted,
                  marginTop: 6,
                  fontWeight: 500,
                }}
              >
                {resumen.margen.toFixed(1)}% margen
              </div>
            </div>
          </div>
        </div>

        {/* 2. ¿Dónde está el dinero? */}
        <div
          style={{
            padding: '24px 28px',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: C.muted,
              marginBottom: 16,
            }}
          >
            2 · ¿Dónde está el dinero?
          </div>
          {distribucion.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13 }}>
              Sin cobros registrados del día.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {distribucion.map((g) => (
                <div
                  key={g.categoria.id}
                  style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  {/* Header de la caja */}
                  <div
                    style={{
                      padding: '14px 18px',
                      background: g.categoria.bgSoft || C.bgSoft,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      borderBottom:
                        g.boletos.length > 0
                          ? `1px solid ${C.border}`
                          : 'none',
                    }}
                  >
                    <span style={{ fontSize: 22 }}>{g.categoria.icon}</span>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 15,
                        color: g.categoria.color || C.navy,
                        flex: 1,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {g.categoria.label}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: C.muted,
                        marginRight: 14,
                        fontWeight: 500,
                      }}
                    >
                      {g.count} boleto{g.count !== 1 ? 's' : ''}
                    </span>
                    <span
                      style={{
                        fontWeight: 800,
                        fontSize: 18,
                        color: g.categoria.color || C.navy,
                        fontFamily: 'ui-monospace, monospace',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {fmt(g.total)}
                    </span>
                  </div>
                  {/* Lista de PNRs */}
                  {g.boletos.length > 0 && (
                    <table
                      style={{
                        width: '100%',
                        fontSize: 13,
                        borderCollapse: 'collapse',
                        tableLayout: 'fixed',
                      }}
                    >
                      <colgroup>
                        <col style={{ width: 80 }} />
                        <col style={{ width: 240 }} />
                        <col />
                        <col style={{ width: 110 }} />
                      </colgroup>
                      <tbody>
                        {g.boletos.map((b, i) => (
                          <tr
                            key={b.id}
                            style={{
                              background: i % 2 === 0 ? 'white' : '#FAFBFF',
                            }}
                          >
                            <td
                              style={{
                                padding: '10px 16px',
                                fontFamily: 'ui-monospace, monospace',
                                fontWeight: 700,
                                color: C.navy,
                                verticalAlign: 'middle',
                              }}
                            >
                              {b.pnr}
                            </td>
                            <td
                              style={{
                                padding: '10px 16px',
                                color: C.slate,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                verticalAlign: 'middle',
                              }}
                            >
                              {b.cliente || '(sin cliente)'}
                            </td>
                            <td
                              style={{
                                padding: '10px 16px',
                                color: C.muted,
                                fontSize: 11,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                verticalAlign: 'middle',
                              }}
                            >
                              {b.descripcion
                                ? b.descripcion.replace(
                                    /Venta del billete /,
                                    ''
                                  )
                                : ''}
                            </td>
                            <td
                              style={{
                                padding: '10px 16px',
                                textAlign: 'right',
                                fontFamily: 'ui-monospace, monospace',
                                fontWeight: 600,
                                color: C.navy,
                                verticalAlign: 'middle',
                              }}
                            >
                              {b.precio_venta != null
                                ? fmt(b.precio_venta)
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. Saldo Caribe Cool */}
        <div
          style={{
            padding: '24px 28px',
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: C.muted,
              marginBottom: 16,
            }}
          >
            3 · Saldo Caribe Cool
          </div>
          <table
            style={{
              width: '100%',
              fontSize: 14,
              borderCollapse: 'collapse',
            }}
          >
            <tbody>
              <tr style={{ borderBottom: `1px solid #F1F5F9` }}>
                <td style={{ padding: '12px 4px', color: C.muted }}>
                  Saldo al inicio del día
                </td>
                <td
                  style={{
                    padding: '8px 0',
                    textAlign: 'right',
                    fontFamily: 'ui-monospace, monospace',
                  }}
                >
                  {fmt(saldoCC.inicio)}
                </td>
              </tr>
              <tr style={{ borderBottom: `1px solid #F1F5F9` }}>
                <td style={{ padding: '12px 4px' }}>
                  Recargas del día ({saldoCC.recargasDiaCount})
                </td>
                <td
                  style={{
                    padding: '12px 4px',
                    textAlign: 'right',
                    color: C.utilidad,
                    fontWeight: 600,
                    fontFamily: 'ui-monospace, monospace',
                  }}
                >
                  {saldoCC.recargasDia > 0 ? '+' : ''}
                  {fmt(saldoCC.recargasDia)}
                </td>
              </tr>
              <tr style={{ borderBottom: `1px solid #F1F5F9` }}>
                <td style={{ padding: '12px 4px' }}>
                  Consumos del día ({saldoCC.consumosDiaCount} boletos)
                </td>
                <td
                  style={{
                    padding: '12px 4px',
                    textAlign: 'right',
                    color: C.costo,
                    fontWeight: 600,
                    fontFamily: 'ui-monospace, monospace',
                  }}
                >
                  -{fmt(saldoCC.consumosDia)}
                </td>
              </tr>
              <tr style={{ background: C.bgSoft }}>
                <td style={{ padding: '14px 8px', fontWeight: 700, fontSize: 15 }}>
                  Saldo al cierre del día
                </td>
                <td
                  style={{
                    padding: '14px 8px',
                    textAlign: 'right',
                    fontWeight: 800,
                    fontSize: 20,
                    fontFamily: 'ui-monospace, monospace',
                    color: saldoCC.cierre >= 0 ? C.navy : C.costo,
                  }}
                >
                  {saldoCC.cierre < 0 ? '-' : ''}
                  {fmt(saldoCC.cierre)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          fontSize: 11,
          color: C.muted,
          lineHeight: 1.6,
        }}
      >
        💡 El reporte refleja las operaciones del día seleccionado. El "Saldo
        Caribe Cool al inicio" calcula recargas y consumos acumulados <b>antes</b> de
        esa fecha. El cierre suma las operaciones del día.
      </div>
    </div>
  );
}

function MovimientosView({ movimientos, onOpenNew, onEdit, onDelete }) {
  const [filterCaja, setFilterCaja] = useState('all');
  const [filterTipo, setFilterTipo] = useState('all');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const filtered = useMemo(() => {
    return movimientos
      .filter((m) => {
        if (filterCaja !== 'all') {
          if (m.caja_origen !== filterCaja && m.caja_destino !== filterCaja)
            return false;
        }
        if (filterTipo === 'transferencia') {
          // movimiento entre cajas internas (no externas)
          const cO = getCaja(m.caja_origen);
          const cD = getCaja(m.caja_destino);
          if (!cO || !cD) return false;
          if (
            cO.tipo.startsWith('externa_') ||
            cD.tipo.startsWith('externa_')
          )
            return false;
        }
        if (filterTipo === 'externo') {
          const cO = getCaja(m.caja_origen);
          const cD = getCaja(m.caja_destino);
          const isExt =
            (cO && cO.tipo.startsWith('externa_')) ||
            (cD && cD.tipo.startsWith('externa_'));
          if (!isExt) return false;
        }
        return true;
      })
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [movimientos, filterCaja, filterTipo]);

  const fmtMoney = (n, moneda) => {
    if (n == null || isNaN(n)) return '—';
    const sym = moneda === 'MXN' ? '$' : '$';
    return (
      sym +
      n.toLocaleString(moneda === 'MXN' ? 'es-MX' : 'en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) +
      ' ' +
      moneda
    );
  };

  return (
    <div>
      {/* Header de la vista */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: C.navy,
            }}
          >
            📦 Movimientos de Tesorería
          </h3>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: 12,
              color: C.muted,
            }}
          >
            Transferencias entre cajas + pagos a externos + aportes
          </p>
        </div>
        <button
          onClick={onOpenNew}
          style={{
            padding: '9px 16px',
            borderRadius: 8,
            border: 'none',
            background: C.navy,
            color: 'white',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Plus size={15} /> Nuevo movimiento
        </button>
      </div>

      {/* Filtros */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          marginBottom: 14,
          padding: '12px 16px',
          background: C.bgSoft,
          borderRadius: 10,
          border: `1px solid ${C.border}`,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>
          🔍 Filtros:
        </span>
        <label
          style={{
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          Caja:
          <select
            value={filterCaja}
            onChange={(e) => setFilterCaja(e.target.value)}
            style={{
              padding: '4px 8px',
              borderRadius: 4,
              border: `1px solid #CBD5E1`,
              fontSize: 12,
            }}
          >
            <option value="all">Todas</option>
            {CAJAS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.label}
              </option>
            ))}
          </select>
        </label>
        <label
          style={{
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          Tipo:
          <select
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value)}
            style={{
              padding: '4px 8px',
              borderRadius: 4,
              border: `1px solid #CBD5E1`,
              fontSize: 12,
            }}
          >
            <option value="all">Todos</option>
            <option value="transferencia">Transferencias internas</option>
            <option value="externo">Pagos / Aportes externos</option>
          </select>
        </label>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            color: C.muted,
          }}
        >
          Mostrando <b style={{ color: C.navy }}>{filtered.length}</b> de{' '}
          {movimientos.length}
        </span>
      </div>

      {/* Tabla de movimientos */}
      {filtered.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: C.muted,
            background: 'white',
            border: `1px dashed ${C.border}`,
            borderRadius: 12,
          }}
        >
          {movimientos.length === 0 ? (
            <>
              <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
                Aún no hay movimientos registrados.
              </p>
              <p style={{ margin: 0, fontSize: 13 }}>
                Captura tu primer movimiento con el botón{' '}
                <b>Nuevo movimiento</b>.
              </p>
            </>
          ) : (
            <span>No hay movimientos con esos filtros.</span>
          )}
        </div>
      ) : (
        <div
          style={{
            background: 'white',
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
            }}
          >
            <thead>
              <tr style={{ background: C.navy }}>
                <th
                  style={{
                    ...th,
                    padding: '10px 12px',
                    textAlign: 'center',
                  }}
                >
                  Fecha
                </th>
                <th style={{ ...th, padding: '10px 12px' }}>Origen</th>
                <th
                  style={{
                    ...th,
                    padding: '10px 12px',
                    textAlign: 'center',
                  }}
                ></th>
                <th style={{ ...th, padding: '10px 12px' }}>Destino</th>
                <th
                  style={{
                    ...th,
                    padding: '10px 12px',
                    textAlign: 'right',
                  }}
                >
                  Monto
                </th>
                <th style={{ ...th, padding: '10px 12px' }}>Nota</th>
                <th
                  style={{
                    ...th,
                    padding: '10px 12px',
                    textAlign: 'center',
                    width: 80,
                  }}
                ></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, idx) => {
                const cO = getCaja(m.caja_origen);
                const cD = getCaja(m.caja_destino);
                const cambioMoneda =
                  m.monto_destino != null &&
                  m.moneda_destino &&
                  m.moneda !== m.moneda_destino;
                return (
                  <tr
                    key={m.id}
                    style={{
                      background: idx % 2 === 0 ? 'white' : '#FAFBFF',
                      borderBottom: `1px solid #F1F5F9`,
                    }}
                  >
                    <td
                      style={{
                        ...td,
                        textAlign: 'center',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {formatDate(m.fecha)}
                    </td>
                    <td style={{ ...td, fontSize: 12 }}>
                      <span style={{ marginRight: 4 }}>
                        {cO?.icon || '❓'}
                      </span>
                      {cO?.label || m.caja_origen}
                    </td>
                    <td
                      style={{
                        ...td,
                        textAlign: 'center',
                        color: C.muted,
                      }}
                    >
                      →
                    </td>
                    <td style={{ ...td, fontSize: 12 }}>
                      <span style={{ marginRight: 4 }}>
                        {cD?.icon || '❓'}
                      </span>
                      {cD?.label || m.caja_destino}
                    </td>
                    <td
                      style={{
                        ...td,
                        textAlign: 'right',
                        fontFamily: 'ui-monospace, monospace',
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      {fmtMoney(m.monto, m.moneda)}
                      {cambioMoneda && (
                        <div
                          style={{
                            fontSize: 10,
                            color: C.muted,
                            fontWeight: 400,
                            marginTop: 2,
                          }}
                        >
                          → {fmtMoney(m.monto_destino, m.moneda_destino)}
                          {m.tc ? ` · TC ${m.tc.toFixed(2)}` : ''}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontSize: 11,
                        color: C.muted,
                        maxWidth: 200,
                      }}
                    >
                      {m.nota || '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <button
                        onClick={() => onEdit(m.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 4,
                          marginRight: 4,
                        }}
                        title="Editar"
                      >
                        <Edit2 size={13} color="#94A3B8" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(m.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 4,
                        }}
                        title="Eliminar"
                      >
                        <X size={13} color="#DC2626" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmar borrado */}
      {confirmDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setConfirmDelete(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              padding: 24,
              borderRadius: 14,
              maxWidth: 380,
              textAlign: 'center',
            }}
          >
            <h3 style={{ margin: '0 0 8px', color: C.navy, fontSize: 16 }}>
              ¿Eliminar movimiento?
            </h3>
            <p
              style={{
                margin: '0 0 18px',
                color: C.muted,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              Esta acción no se puede deshacer.
            </p>
            <div
              style={{
                display: 'flex',
                gap: 8,
                justifyContent: 'center',
              }}
            >
              <button
                onClick={() => setConfirmDelete(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: `1px solid #CBD5E1`,
                  background: 'white',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  onDelete(confirmDelete);
                  setConfirmDelete(null);
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#DC2626',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 14,
          fontSize: 11,
          color: C.muted,
          lineHeight: 1.6,
        }}
      >
        💡 Los movimientos son <b>transferencias entre cajas</b> o pagos /
        aportes externos. Las ventas cobradas se contabilizan automáticamente
        en la caja correspondiente (no aparecen aquí).
      </div>
    </div>
  );
}

function MovimientoModal({ movimiento, prefill, onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10);
  const initial = movimiento || prefill || {
    fecha: today,
    caja_origen: '',
    caja_destino: '',
    monto: '',
    moneda: 'USD',
    tc: '',
    nota: '',
  };
  const [form, setForm] = useState({
    fecha: initial.fecha || today,
    caja_origen: initial.caja_origen || '',
    caja_destino: initial.caja_destino || '',
    monto:
      initial.monto != null && initial.monto !== ''
        ? String(initial.monto)
        : '',
    moneda: initial.moneda || 'USD',
    tc: initial.tc != null && initial.tc !== '' ? String(initial.tc) : '',
    nota: initial.nota || '',
  });

  const cO = getCaja(form.caja_origen);
  const cD = getCaja(form.caja_destino);

  // Opciones de origen: cajas internas + externas_in (alguien te paga)
  const opcionesOrigen = CAJAS.filter((c) => c.tipo !== 'externa_out');
  // Opciones de destino: cajas internas + externas_out (le pagas a alguien)
  const opcionesDestino = CAJAS.filter((c) => c.tipo !== 'externa_in');

  // Calcular moneda destino y monto destino auto si hay TC
  const monto = parseFloat(form.monto);
  const tc = parseFloat(form.tc);
  const monedaOrigen = form.moneda;
  // Moneda del destino: depende de la caja destino
  let monedaDestino = monedaOrigen;
  if (cD && cD.moneda !== 'MULTI' && cD.moneda !== monedaOrigen) {
    monedaDestino = cD.moneda;
  }
  const cambioMoneda = monedaOrigen !== monedaDestino;
  let montoDestino = null;
  if (!isNaN(monto)) {
    if (cambioMoneda && !isNaN(tc) && tc > 0) {
      // USD a MXN: monto * tc | MXN a USD: monto / tc
      montoDestino =
        monedaOrigen === 'USD' && monedaDestino === 'MXN'
          ? monto * tc
          : monedaOrigen === 'MXN' && monedaDestino === 'USD'
          ? monto / tc
          : monto;
    } else if (!cambioMoneda) {
      montoDestino = monto;
    }
  }

  // Validaciones
  const errors = [];
  if (!form.fecha) errors.push('Fecha es requerida');
  if (!form.caja_origen) errors.push('Selecciona caja de origen');
  if (!form.caja_destino) errors.push('Selecciona caja de destino');
  if (form.caja_origen === form.caja_destino && form.caja_origen)
    errors.push('Origen y destino no pueden ser la misma caja');
  if (!form.monto || isNaN(monto) || monto <= 0)
    errors.push('Monto debe ser un número mayor a 0');
  if (cambioMoneda && (!form.tc || isNaN(tc) || tc <= 0))
    errors.push(
      'Como hay cambio de moneda, el Tipo de Cambio es requerido (> 0)'
    );

  const canSave = errors.length === 0;

  function save() {
    onSave({
      id: movimiento?.id,
      fecha: form.fecha,
      caja_origen: form.caja_origen,
      caja_destino: form.caja_destino,
      monto,
      moneda: form.moneda,
      tc: cambioMoneda ? tc : null,
      monto_destino: montoDestino,
      moneda_destino: monedaDestino,
      nota: form.nota.trim(),
    });
  }

  const fmt = (n) =>
    n == null || isNaN(n)
      ? '—'
      : n.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 16,
          width: '100%',
          maxWidth: 640,
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 24px 64px rgba(15,23,42,0.4)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 700,
                color: C.navy,
              }}
            >
              {movimiento ? '📦 Editar movimiento' : '📦 Nuevo movimiento'}
            </h3>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: 12,
                color: C.muted,
              }}
            >
              Transferencia entre cajas, pago a externo o aporte recibido
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 22,
              color: C.muted,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: 24 }}>
          {/* Fecha */}
          <FormField label="Fecha del movimiento">
            <input
              type="date"
              value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              style={{
                ...input,
                width: 200,
              }}
            />
          </FormField>

          {/* Origen → Destino visual */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              gap: 10,
              alignItems: 'end',
              marginTop: 14,
            }}
          >
            <FormField label="Caja origen (de dónde sale)">
              <select
                value={form.caja_origen}
                onChange={(e) =>
                  setForm({ ...form, caja_origen: e.target.value })
                }
                style={input}
              >
                <option value="">— Seleccionar —</option>
                {opcionesOrigen.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.label}
                    {c.moneda !== 'MULTI' ? ` (${c.moneda})` : ''}
                  </option>
                ))}
              </select>
            </FormField>
            <div
              style={{
                fontSize: 22,
                color: C.muted,
                paddingBottom: 8,
                fontWeight: 700,
              }}
            >
              →
            </div>
            <FormField label="Caja destino (a dónde llega)">
              <select
                value={form.caja_destino}
                onChange={(e) =>
                  setForm({ ...form, caja_destino: e.target.value })
                }
                style={input}
              >
                <option value="">— Seleccionar —</option>
                {opcionesDestino.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.label}
                    {c.moneda !== 'MULTI' ? ` (${c.moneda})` : ''}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          {/* Monto + Moneda */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 14,
              marginTop: 14,
            }}
          >
            <FormField label="Monto que sale del origen">
              <input
                type="number"
                step="0.01"
                value={form.monto}
                onChange={(e) => setForm({ ...form, monto: e.target.value })}
                style={input}
                placeholder="0.00"
              />
            </FormField>
            <FormField label="Moneda del monto">
              <div style={{ display: 'flex', gap: 6 }}>
                {['USD', 'MXN'].map((m) => {
                  const active = form.moneda === m;
                  return (
                    <button
                      key={m}
                      onClick={() => setForm({ ...form, moneda: m })}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: `1px solid ${active ? C.navy : '#CBD5E1'}`,
                        background: active ? C.navy : 'white',
                        color: active ? 'white' : C.slate,
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </FormField>
          </div>

          {/* TC + cálculo automático del destino */}
          {cambioMoneda && (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                background: '#FEF3C7',
                border: '1px solid #FCD34D',
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#92400E',
                  marginBottom: 10,
                }}
              >
                💱 Hay cambio de moneda: {monedaOrigen} → {monedaDestino}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 14,
                }}
              >
                <FormField label="Tipo de Cambio aplicado">
                  <input
                    type="number"
                    step="0.01"
                    value={form.tc}
                    onChange={(e) =>
                      setForm({ ...form, tc: e.target.value })
                    }
                    style={input}
                    placeholder="17.00"
                  />
                </FormField>
                <FormField
                  label={`Monto que llega al destino (${monedaDestino})`}
                >
                  <input
                    type="text"
                    disabled
                    value={
                      montoDestino != null && !isNaN(montoDestino)
                        ? `$${fmt(montoDestino)} ${monedaDestino}`
                        : '—'
                    }
                    style={{
                      ...input,
                      background: '#F8FAFC',
                      color: C.slate,
                      fontWeight: 700,
                    }}
                  />
                </FormField>
              </div>
            </div>
          )}

          {/* Nota */}
          <div style={{ marginTop: 14 }}>
            <FormField label="Nota (opcional)">
              <textarea
                value={form.nota}
                onChange={(e) => setForm({ ...form, nota: e.target.value })}
                style={{ ...input, height: 60, resize: 'vertical' }}
                placeholder="Ej: Envío mensual a México, pago de comisión, aporte de socio..."
              />
            </FormField>
          </div>

          {/* Errores */}
          {errors.length > 0 && (
            <div
              style={{
                marginTop: 14,
                padding: '10px 14px',
                background: '#FEE2E2',
                border: '1px solid #FECACA',
                borderRadius: 8,
                fontSize: 12,
                color: '#991B1B',
              }}
            >
              {errors.map((e, i) => (
                <div key={i}>⚠ {e}</div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: `1px solid ${C.border}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            background: C.bgSoft,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              background: 'white',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              color: C.slate,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: canSave ? C.navy : '#CBD5E1',
              color: 'white',
              fontWeight: 700,
              fontSize: 13,
              cursor: canSave ? 'pointer' : 'not-allowed',
            }}
          >
            {movimiento ? 'Guardar cambios' : 'Crear movimiento'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportDiffModal({ diff, onClose, onConfirm }) {
  const { matches, orphans, missing, cobrosDesconocidos } = diff;

  // Por default, todos los matches con cambios se aplican; sin cambios se omiten
  const initialApplyMatches = useMemo(
    () => new Set(matches.filter((m) => m.changes.length > 0).map((m) => m.id)),
    [matches]
  );
  const [applyMatchIds, setApplyMatchIds] = useState(initialApplyMatches);

  // Por default, huérfanos NO se crean (esperan decisión)
  const [createOrphanIds, setCreateOrphanIds] = useState(new Set());

  const matchesWithChanges = matches.filter((m) => m.changes.length > 0);
  const matchesSinCambios = matches.filter((m) => m.changes.length === 0);

  const toggleMatch = (id) => {
    setApplyMatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleOrphan = (id) => {
    setCreateOrphanIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toApply = matches.filter((m) => applyMatchIds.has(m.id));
  const toCreate = orphans.filter((o) => createOrphanIds.has(o.id));

  function confirm() {
    onConfirm(toApply, toCreate);
  }

  const sectionStyle = {
    border: '1px solid #E2E8F0',
    borderRadius: 10,
    marginBottom: 14,
    background: '#FFFFFF',
    overflow: 'hidden',
  };
  const sectionHead = (bg, color) => ({
    padding: '10px 14px',
    background: bg,
    color,
    fontWeight: 700,
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  });

  // Helpers para mostrar nombres legibles de campos
  const FIELD_LABELS = {
    so_mexico: 'SO México',
    so_cuba: 'SO Cuba',
    forma_pago: 'Forma de Pago',
    precio_venta: 'Precio Venta',
    fecha_cobro: 'Fecha Cobro',
    cliente_pagador: 'Cliente Pagador',
    dias_credito: 'Días Crédito',
    estatus: 'Estatus',
    plaza: 'Plaza',
    notas: 'Notas',
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#F8FAFC',
          borderRadius: 16,
          padding: 24,
          maxWidth: 900,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: '#0F172A',
            }}
          >
            Importar Excel de Pamela — Vista previa
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 22,
              cursor: 'pointer',
              color: '#64748B',
            }}
          >
            ×
          </button>
        </div>

        <p
          style={{
            margin: '0 0 18px',
            fontSize: 13,
            color: '#475569',
            lineHeight: 1.5,
          }}
        >
          Revisa los cambios antes de aplicarlos. Por seguridad, solo se
          importan las columnas que Pamela llena manualmente (no se tocan los
          datos de Caribe Cool ya en la app).
        </p>

        {/* WARNINGS de cobros desconocidos */}
        {cobrosDesconocidos.length > 0 && (
          <div
            style={{
              background: '#FEF3C7',
              border: '1px solid #FCD34D',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 14,
              fontSize: 13,
              color: '#92400E',
            }}
          >
            ⚠️ Formas de pago no reconocidas en Pamela's Excel:{' '}
            <b>{cobrosDesconocidos.map((c) => `"${c}"`).join(', ')}</b>
            . Corrígelas en el Excel y re-importa para que se guarden bien.
          </div>
        )}

        {/* MATCHES CON CAMBIOS */}
        <div style={sectionStyle}>
          <div style={sectionHead('#DCFCE7', '#166534')}>
            <span>
              ✅ Coinciden con cambios ({matchesWithChanges.length}) — se
              actualizarán los seleccionados
            </span>
            {matchesWithChanges.length > 0 && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() =>
                    setApplyMatchIds(
                      new Set(matchesWithChanges.map((m) => m.id))
                    )
                  }
                  style={miniBtnStyle}
                >
                  Marcar todos
                </button>
                <button
                  onClick={() => setApplyMatchIds(new Set())}
                  style={miniBtnStyle}
                >
                  Desmarcar
                </button>
              </div>
            )}
          </div>
          {matchesWithChanges.length === 0 ? (
            <div style={{ padding: 14, color: '#64748B', fontSize: 13 }}>
              No hay cambios. Todos los boletos del Excel coinciden con lo que
              ya está en la app.
            </div>
          ) : (
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {matchesWithChanges.map((m) => {
                const checked = applyMatchIds.has(m.id);
                return (
                  <div
                    key={m.id}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid #F1F5F9',
                      background: checked ? '#F0FDF4' : '#FFFFFF',
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleMatch(m.id)}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        marginBottom: 6,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMatch(m.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ accentColor: '#16A34A' }}
                      />
                      <span
                        style={{
                          fontFamily: 'ui-monospace, monospace',
                          fontWeight: 700,
                          fontSize: 12,
                          color: '#0F172A',
                        }}
                      >
                        {m.pnr}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: '#64748B',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {m.existing.descripcion}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        marginLeft: 24,
                      }}
                    >
                      {m.changes.map((c, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: 11,
                            background: '#EFF6FF',
                            color: '#1E40AF',
                            padding: '2px 8px',
                            borderRadius: 4,
                            border: '1px solid #BFDBFE',
                          }}
                        >
                          <b>{FIELD_LABELS[c.field] || c.field}</b>:{' '}
                          {c.prev ? (
                            <>
                              <span
                                style={{
                                  textDecoration: 'line-through',
                                  color: '#94A3B8',
                                }}
                              >
                                {c.prev}
                              </span>{' '}
                              → {c.next}
                            </>
                          ) : (
                            <span style={{ color: '#0F766E' }}>{c.next}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SIN CAMBIOS (colapsado por default) */}
        {matchesSinCambios.length > 0 && (
          <div style={sectionStyle}>
            <div
              style={{
                ...sectionHead('#F1F5F9', '#475569'),
                fontSize: 12,
                padding: '8px 14px',
              }}
            >
              <span>
                ⚪ Sin cambios ({matchesSinCambios.length}) — se ignoran
              </span>
            </div>
          </div>
        )}

        {/* HUÉRFANOS */}
        {orphans.length > 0 && (
          <div style={sectionStyle}>
            <div style={sectionHead('#FEE2E2', '#991B1B')}>
              <span>
                ⚠️ Huérfanos en Excel ({orphans.length}) — están en Pamela's
                Excel pero NO en la app
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() =>
                    setCreateOrphanIds(new Set(orphans.map((o) => o.id)))
                  }
                  style={miniBtnStyle}
                >
                  Crear todos
                </button>
                <button
                  onClick={() => setCreateOrphanIds(new Set())}
                  style={miniBtnStyle}
                >
                  Ignorar todos
                </button>
              </div>
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {orphans.map((o) => {
                const checked = createOrphanIds.has(o.id);
                return (
                  <div
                    key={o.id}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid #F1F5F9',
                      background: checked ? '#FEF2F2' : '#FFFFFF',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                    onClick={() => toggleOrphan(o.id)}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOrphan(o.id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ accentColor: '#DC2626' }}
                    />
                    <span
                      style={{
                        fontFamily: 'ui-monospace, monospace',
                        fontWeight: 700,
                        fontSize: 12,
                        color: '#0F172A',
                      }}
                    >
                      {o.pnr}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: '#64748B',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {o.fullPatch.cliente} ·{' '}
                      {o.fullPatch.descripcion || '(sin descripción)'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* FALTANTES (solo informativo) */}
        {missing.length > 0 && (
          <div style={sectionStyle}>
            <div
              style={{
                ...sectionHead('#FEF3C7', '#92400E'),
                fontSize: 12,
                padding: '8px 14px',
              }}
            >
              <span>
                ℹ️ En la app pero no en Excel ({missing.length}) — Pamela aún no
                los procesó. Se mantienen como están.
              </span>
            </div>
          </div>
        )}

        {/* FOOTER con resumen + botones */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 16,
            borderTop: '1px solid #E2E8F0',
            marginTop: 8,
          }}
        >
          <div style={{ fontSize: 13, color: '#475569' }}>
            Se aplicarán: <b style={{ color: '#16A34A' }}>{toApply.length}</b>{' '}
            actualizaciones
            {toCreate.length > 0 && (
              <>
                {' '}
                + <b style={{ color: '#DC2626' }}>{toCreate.length}</b> nuevos
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                padding: '10px 18px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
                color: '#475569',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={confirm}
              disabled={toApply.length === 0 && toCreate.length === 0}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: 'none',
                background:
                  toApply.length === 0 && toCreate.length === 0
                    ? '#CBD5E1'
                    : '#0F172A',
                color: '#FFFFFF',
                cursor:
                  toApply.length === 0 && toCreate.length === 0
                    ? 'not-allowed'
                    : 'pointer',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              Confirmar import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const miniBtnStyle = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid rgba(0,0,0,0.15)',
  background: 'rgba(255,255,255,0.6)',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
};

function DeleteConfirmModal({ boletos, onClose, onConfirm }) {
  const count = boletos.length;
  const conciliados = boletos.filter((b) => isConciliado(b)).length;
  const totalCosto = boletos.reduce((s, b) => s + (b.costo_usd || 0), 0);
  const PREVIEW = 8;
  const preview = boletos.slice(0, PREVIEW);
  const extra = Math.max(0, count - PREVIEW);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 16,
          width: '100%',
          maxWidth: 560,
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: '#FEE2E2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={20} color={C.costo} />
          </div>
          <div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 800,
                color: C.navy,
                lineHeight: 1.2,
              }}
            >
              ¿Eliminar {count} boleto{count !== 1 ? 's' : ''}?
            </div>
            <div
              style={{
                fontSize: 12,
                color: C.muted,
                marginTop: 3,
              }}
            >
              Esta acción no se puede deshacer.
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 24px', overflow: 'auto', flex: 1 }}>
          {/* Warning si hay conciliados */}
          {conciliados > 0 && (
            <div
              style={{
                background: '#FEF3C7',
                border: '1px solid #FDE68A',
                borderRadius: 8,
                padding: '10px 12px',
                marginBottom: 14,
                fontSize: 12,
                color: '#92400E',
                fontWeight: 600,
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
              <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
              <span>
                <strong>{conciliados}</strong> de los boletos seleccionados ya
                está{conciliados !== 1 ? 'n' : ''} conciliado
                {conciliados !== 1 ? 's' : ''} (tienen SO, plaza y fecha de
                ingreso). Asegúrate de querer eliminar registros completos.
              </span>
            </div>
          )}

          {/* Resumen */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <SummaryStat
              label="Boletos"
              value={count}
              accent={C.navy}
            />
            <SummaryStat
              label="Conciliados"
              value={conciliados}
              accent={conciliados > 0 ? '#92400E' : C.muted}
            />
            <SummaryStat
              label="Costo total"
              value={`$${fmt(totalCosto)}`}
              accent={C.costo}
            />
          </div>

          {/* Preview de los PNRs */}
          <div
            style={{
              fontSize: 10,
              color: C.muted,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 6,
            }}
          >
            Se eliminarán:
          </div>
          <div
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              maxHeight: 240,
              overflowY: 'auto',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {preview.map((b, i) => (
                  <tr
                    key={b.id}
                    style={{
                      borderBottom:
                        i < preview.length - 1
                          ? '1px solid #F1F5F9'
                          : 'none',
                    }}
                  >
                    <td
                      style={{
                        padding: '8px 12px',
                        fontFamily: 'ui-monospace, monospace',
                        fontWeight: 700,
                        fontSize: 12,
                        color: C.navy,
                        width: 90,
                      }}
                    >
                      {b.pnr}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: 12 }}>
                      {b.cliente}
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        fontSize: 11,
                        color: C.muted,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {b.ruta || '—'}
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        textAlign: 'right',
                        fontSize: 12,
                        color: C.costo,
                        fontWeight: 600,
                      }}
                    >
                      ${fmt(b.costo_usd)}
                    </td>
                  </tr>
                ))}
                {extra > 0 && (
                  <tr style={{ background: C.bgSoft }}>
                    <td
                      colSpan={4}
                      style={{
                        padding: '8px 12px',
                        fontSize: 11,
                        color: C.muted,
                        textAlign: 'center',
                        fontStyle: 'italic',
                      }}
                    >
                      …y {extra} más
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: `1px solid ${C.border}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            background: C.bgSoft,
            flexShrink: 0,
          }}
        >
          <button onClick={onClose} style={btnSecondary}>
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            style={{
              ...btnPrimary,
              background: C.costo,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Trash2 size={14} /> Sí, eliminar {count} boleto
            {count !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, accent }) {
  return (
    <div
      style={{
        padding: 10,
        background: C.bgSoft,
        borderRadius: 8,
        border: `1px solid ${C.border}`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: C.muted,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 17,
          fontWeight: 800,
          color: accent,
          marginTop: 3,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SummaryChip({ count, label, bg, color }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: '5px 10px',
        borderRadius: 99,
        background: bg,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <span style={{ fontSize: 13 }}>{count}</span> {label}
    </div>
  );
}

function MiniBtn({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 10px',
        borderRadius: 6,
        border: `1px solid ${disabled ? '#E2E8F0' : '#CBD5E1'}`,
        background: 'white',
        color: disabled ? '#CBD5E1' : C.slate,
        fontSize: 11,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

function Badge({ children, bg, color }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '3px 7px',
        borderRadius: 4,
        background: bg,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function DiffPill({ diff }) {
  return (
    <div
      style={{
        fontSize: 10,
        padding: '3px 7px',
        borderRadius: 4,
        background: 'white',
        border: '1px solid #E2E8F0',
        display: 'inline-flex',
        gap: 4,
        alignItems: 'baseline',
      }}
    >
      <span
        style={{
          color: C.muted,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {diff.label}:
      </span>
      <span
        style={{
          color: '#991B1B',
          textDecoration: 'line-through',
          fontFamily: 'ui-monospace, monospace',
        }}
      >
        {String(diff.oldVal).length > 40
          ? String(diff.oldVal).slice(0, 40) + '…'
          : diff.oldVal}
      </span>
      <span style={{ color: C.muted }}>→</span>
      <span
        style={{
          color: '#166534',
          fontWeight: 600,
          fontFamily: 'ui-monospace, monospace',
        }}
      >
        {String(diff.newVal).length > 40
          ? String(diff.newVal).slice(0, 40) + '…'
          : diff.newVal}
      </span>
    </div>
  );
}

function Field({ label, children, highlight }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: '#94A3B8',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: highlight || C.navy,
          fontWeight: highlight ? 700 : 500,
          marginTop: 2,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <div
        style={{
          fontSize: 10,
          color: C.muted,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

// ─── Pantalla index del módulo Reportes ──────────────────────────
function ReportsIndex({ boletos, onSelectReport, loading }) {
  // Stats "este mes" para el snapshot del card de Caribe Cool
  const monthSnap = useMemo(() => {
    const { from, to } = presetRange('thisMonth');
    const monthBoletos = boletos.filter((b) => {
      const d = dateOnly(b.fecha_venta);
      return d && d >= from && d <= to;
    });
    const conVenta = monthBoletos.filter((b) => b.precio_venta != null);
    const totalUtil = conVenta.reduce(
      (s, b) => s + (b.precio_venta - b.costo_usd),
      0
    );
    const pendientes = monthBoletos.filter((b) => !isConciliado(b)).length;
    return {
      count: monthBoletos.length,
      utilidad: totalUtil,
      pendientes,
    };
  }, [boletos]);

  return (
    <div
      style={{
        fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
        background: C.bgSoft,
        minHeight: '100vh',
        padding: '24px 24px 40px',
      }}
    >
      {/* Header */}
      <div
        style={{
          color: C.muted,
          fontSize: 12,
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        Viajes Libero
      </div>
      <h1
        style={{
          margin: 0,
          fontSize: 28,
          fontWeight: 800,
          color: C.navy,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        📊 Reportes
      </h1>
      <div style={{ color: C.slate, fontSize: 14, marginTop: 6 }}>
        Selecciona un reporte para ver el detalle.
      </div>

      <div
        style={{
          height: 1,
          background: C.border,
          margin: '20px 0 24px',
        }}
      />

      <div
        style={{
          fontSize: 11,
          color: C.muted,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 12,
        }}
      >
        Disponibles
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 14,
          marginBottom: 28,
        }}
      >
        <ReportCard
          icon={MIVUELO_LOGO}
          title="Caribe Cool"
          subtitle="Boletería"
          description="Concentrador de boletos vendidos: cliente, ruta, costo, venta y utilidad por boleto."
          stats={
            loading
              ? null
              : [
                  {
                    label: 'Boletos este mes',
                    value: monthSnap.count,
                    accent: C.navy,
                  },
                  {
                    label: 'Utilidad este mes',
                    value: `$${fmt(monthSnap.utilidad)}`,
                    accent: C.utilidad,
                  },
                  {
                    label: 'Pendientes',
                    value: monthSnap.pendientes,
                    accent: '#EA580C',
                  },
                ]
          }
          onClick={() => onSelectReport('caribecool')}
        />
      </div>

      <div
        style={{
          fontSize: 11,
          color: C.muted,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 12,
        }}
      >
        Próximos
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 14,
        }}
      >
        <PlaceholderCard
          icon="✈️"
          title="Otra aerolínea"
          description="Mismo concentrador para otra línea aérea cuando lo necesites."
        />
        <PlaceholderCard
          icon="📈"
          title="Ventas por vendedor"
          description="Ranking de vendedores con utilidad generada en el periodo."
        />
        <PlaceholderCard
          icon="💡"
          title="Sugerir reporte"
          description="¿Qué te gustaría ver aquí? Dinos y lo armamos."
        />
      </div>
    </div>
  );
}

function ReportCard({ icon, title, subtitle, description, stats, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'white',
        border: `1px solid ${hover ? '#7C3AED' : C.border}`,
        borderRadius: 14,
        padding: 22,
        cursor: 'pointer',
        textAlign: 'left',
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hover
          ? '0 16px 28px -10px rgba(124, 58, 237, 0.25)'
          : '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'all 160ms ease',
        fontFamily: 'inherit',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 14,
        }}
      >
        {typeof icon === 'string' && icon.startsWith('data:') ? (
          <img
            src={icon}
            alt=""
            style={{ height: 38, width: 'auto', display: 'block' }}
          />
        ) : (
          <div style={{ fontSize: 36, lineHeight: 1 }}>{icon}</div>
        )}
        <div
          style={{
            fontSize: 11,
            color: hover ? '#7C3AED' : C.muted,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            transition: 'color 160ms ease',
          }}
        >
          Abrir →
        </div>
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: C.navy,
          letterSpacing: '-0.01em',
          lineHeight: 1.2,
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: 11,
            color: C.muted,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginTop: 3,
          }}
        >
          {subtitle}
        </div>
      )}
      <div
        style={{
          fontSize: 13,
          color: C.slate,
          lineHeight: 1.5,
          marginTop: 10,
          flex: 1,
        }}
      >
        {description}
      </div>
      {stats && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: `1px solid ${C.border}`,
            display: 'grid',
            gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
            gap: 10,
          }}
        >
          {stats.map((s, i) => (
            <div key={i}>
              <div
                style={{
                  fontSize: 9,
                  color: C.muted,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {s.label}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: s.accent,
                  marginTop: 3,
                  letterSpacing: '-0.01em',
                }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

function PlaceholderCard({ icon, title, description }) {
  return (
    <div
      style={{
        background: '#FAFAFA',
        border: `2px dashed ${C.border}`,
        borderRadius: 14,
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        minHeight: 180,
      }}
    >
      <div style={{ fontSize: 32, opacity: 0.45 }}>{icon}</div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: C.muted,
          marginTop: 10,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 12,
          color: '#94A3B8',
          marginTop: 6,
          maxWidth: 260,
          lineHeight: 1.5,
        }}
      >
        {description}
      </div>
      <div
        style={{
          marginTop: 12,
          fontSize: 10,
          fontWeight: 700,
          padding: '3px 10px',
          borderRadius: 99,
          background: '#E2E8F0',
          color: C.muted,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        Próximamente
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// ReporteSemanal · Vista de resumen ejecutivo descargable como imagen
// ════════════════════════════════════════════════════════════════════
function ReporteSemanal({ boletos }) {
  // Selector: 'esta_semana', 'semana_pasada', 'ultimos_7', 'personalizado'
  const [periodo, setPeriodo] = React.useState('semana_pasada');
  const [customFrom, setCustomFrom] = React.useState('');
  const [customTo, setCustomTo] = React.useState('');
  const [downloading, setDownloading] = React.useState(false);
  const reportRef = React.useRef(null);

  // Calcular rango de fechas según el período seleccionado
  const { fromDate, toDate, label } = React.useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const dow = hoy.getDay(); // 0=dom, 1=lun, ...

    const fmtIso = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;

    if (periodo === 'esta_semana') {
      // Lunes de esta semana a hoy
      const lunes = new Date(hoy);
      const diasDesdeLunes = dow === 0 ? 6 : dow - 1;
      lunes.setDate(hoy.getDate() - diasDesdeLunes);
      return {
        fromDate: fmtIso(lunes),
        toDate: fmtIso(hoy),
        label: 'Esta semana',
      };
    }
    if (periodo === 'semana_pasada') {
      // Lunes de la semana pasada a domingo de la semana pasada
      const lunesPrev = new Date(hoy);
      const diasDesdeLunes = dow === 0 ? 6 : dow - 1;
      lunesPrev.setDate(hoy.getDate() - diasDesdeLunes - 7);
      const domingoPrev = new Date(lunesPrev);
      domingoPrev.setDate(lunesPrev.getDate() + 6);
      return {
        fromDate: fmtIso(lunesPrev),
        toDate: fmtIso(domingoPrev),
        label: 'Semana pasada',
      };
    }
    if (periodo === 'ultimos_7') {
      const hace7 = new Date(hoy);
      hace7.setDate(hoy.getDate() - 6);
      return {
        fromDate: fmtIso(hace7),
        toDate: fmtIso(hoy),
        label: 'Últimos 7 días',
      };
    }
    // personalizado
    return {
      fromDate: customFrom,
      toDate: customTo,
      label: 'Personalizado',
    };
  }, [periodo, customFrom, customTo]);

  // Filtrar boletos del rango
  const boletosFiltrados = React.useMemo(() => {
    if (!fromDate || !toDate) return [];
    return (boletos || []).filter((b) => {
      if (!b.fecha_venta) return false;
      return b.fecha_venta >= fromDate && b.fecha_venta <= toDate;
    });
  }, [boletos, fromDate, toDate]);

  // Cálculos KPIs
  const stats = React.useMemo(() => {
    const list = boletosFiltrados;
    const sum = (key) =>
      list.reduce((acc, b) => acc + (Number(b[key]) || 0), 0);

    const costoTotal = sum('costo_usd');
    const ventaTotal = sum('precio_venta');
    const utilidad = ventaTotal - costoTotal;
    const margen = ventaTotal > 0 ? (utilidad / ventaTotal) * 100 : 0;

    // Cobranza
    let cobrado = 0,
      porCobrar = 0,
      vencido = 0;
    let cobradoBol = 0,
      porCobrarBol = 0,
      vencidoBol = 0;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    list.forEach((b) => {
      const pv = Number(b.precio_venta) || 0;
      if (pv <= 0) return;
      const estatus = String(b.estatus || '').toUpperCase();
      if (estatus === 'COBRADO') {
        cobrado += pv;
        cobradoBol++;
      } else {
        // Por cobrar o vencido
        const fc = b.fecha_cobro;
        if (fc) {
          const fcDate = new Date(fc);
          fcDate.setHours(0, 0, 0, 0);
          if (fcDate < hoy) {
            vencido += pv;
            vencidoBol++;
          } else {
            porCobrar += pv;
            porCobrarBol++;
          }
        } else {
          porCobrar += pv;
          porCobrarBol++;
        }
      }
    });

    // Por día
    const byDay = {};
    list.forEach((b) => {
      const d = b.fecha_venta;
      if (!d) return;
      if (!byDay[d]) byDay[d] = { count: 0, costo: 0, venta: 0 };
      byDay[d].count++;
      byDay[d].costo += Number(b.costo_usd) || 0;
      byDay[d].venta += Number(b.precio_venta) || 0;
    });
    const dias = Object.keys(byDay)
      .sort()
      .map((d) => ({
        fecha: d,
        ...byDay[d],
        utilidad: byDay[d].venta - byDay[d].costo,
      }));

    // Por plaza
    const byPlaza = { MEX: { count: 0, venta: 0 }, CUBA: { count: 0, venta: 0 }, '—': { count: 0, venta: 0 } };
    list.forEach((b) => {
      const p = String(b.plaza || '').toUpperCase();
      const key = p === 'MEX' ? 'MEX' : p === 'CUBA' ? 'CUBA' : '—';
      byPlaza[key].count++;
      byPlaza[key].venta += Number(b.precio_venta) || 0;
    });

    // Top cliente pagador
    const byPagador = {};
    list.forEach((b) => {
      const p = String(b.cliente_pagador || '').trim();
      if (!p) return;
      if (!byPagador[p]) byPagador[p] = 0;
      byPagador[p] += Number(b.precio_venta) || 0;
    });
    const topPagadores = Object.entries(byPagador)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      boletos: list.length,
      costoTotal,
      ventaTotal,
      utilidad,
      margen,
      cobrado,
      porCobrar,
      vencido,
      cobradoBol,
      porCobrarBol,
      vencidoBol,
      dias,
      byPlaza,
      topPagadores,
    };
  }, [boletosFiltrados]);

  const fmt = (n) =>
    n == null || isNaN(n)
      ? '$0'
      : '$' +
        Number(n).toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        });

  // Día abreviado en español
  const diaAbrev = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return `${dias[date.getDay()]} ${String(d).padStart(2, '0')}`;
  };

  const rangoFmt = React.useMemo(() => {
    if (!fromDate || !toDate) return '';
    const [y1, m1, d1] = fromDate.split('-').map(Number);
    const [y2, m2, d2] = toDate.split('-').map(Number);
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const sameYear = y1 === y2;
    const sameMonth = sameYear && m1 === m2;
    if (sameMonth) return `${d1} – ${d2} ${meses[m1 - 1]} ${y1}`;
    if (sameYear) return `${d1} ${meses[m1 - 1]} – ${d2} ${meses[m2 - 1]} ${y1}`;
    return `${d1} ${meses[m1 - 1]} ${y1} – ${d2} ${meses[m2 - 1]} ${y2}`;
  }, [fromDate, toDate]);

  async function handleDownload() {
    if (!reportRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2, // mayor resolución
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `reporte_semanal_${fromDate}_${toDate}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error('Error al generar imagen:', e);
      alert('Error al generar la imagen. Intenta de nuevo.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div style={{ padding: '24px 0' }}>
      {/* Controles */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 20,
          padding: 16,
          background: '#F8FAFC',
          borderRadius: 8,
          border: '0.5px solid #E2E8F0',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
          Período:
        </span>
        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #CBD5E1',
            borderRadius: 6,
            fontSize: 13,
            background: 'white',
            cursor: 'pointer',
          }}
        >
          <option value="esta_semana">Esta semana (lun – hoy)</option>
          <option value="semana_pasada">Semana pasada (lun – dom)</option>
          <option value="ultimos_7">Últimos 7 días</option>
          <option value="personalizado">Personalizado</option>
        </select>
        {periodo === 'personalizado' && (
          <>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #CBD5E1',
                borderRadius: 6,
                fontSize: 13,
              }}
            />
            <span style={{ color: '#94A3B8' }}>—</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #CBD5E1',
                borderRadius: 6,
                fontSize: 13,
              }}
            />
          </>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={handleDownload}
          disabled={downloading || stats.boletos === 0}
          style={{
            padding: '10px 18px',
            background: downloading || stats.boletos === 0 ? '#94A3B8' : '#16A34A',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: downloading || stats.boletos === 0 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {downloading ? '⏳ Generando...' : '📷 Descargar imagen'}
        </button>
      </div>

      {stats.boletos === 0 ? (
        <div
          style={{
            padding: 60,
            textAlign: 'center',
            color: '#94A3B8',
            background: '#F8FAFC',
            borderRadius: 8,
            border: '1px dashed #CBD5E1',
          }}
        >
          📭 No hay boletos en este período
        </div>
      ) : (
        <div
          ref={reportRef}
          style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
            maxWidth: 760,
            margin: '0 auto',
            background: 'white',
            padding: 32,
            borderRadius: 12,
            boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
            color: '#0F172A',
          }}
        >
          {/* HEADER */}
          <div style={{ borderBottom: '2px solid #042C53', paddingBottom: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 600 }}>
                  Caribe Cool · Viajes Libero
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#042C53', marginTop: 4 }}>
                  Resumen Semanal
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>{rangoFmt}</div>
                <div style={{ fontSize: 10, color: '#94A3B8' }}>{stats.dias.length} días operativos</div>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, borderLeft: '3px solid #042C53' }}>
              <div style={{ fontSize: 9, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Boletos</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#0F172A', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{stats.boletos}</div>
            </div>
            <div style={{ background: '#FEE2E2', padding: 14, borderRadius: 8, borderLeft: '3px solid #B91C1C' }}>
              <div style={{ fontSize: 9, color: '#991B1B', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Costo total</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#B91C1C', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{fmt(stats.costoTotal)}</div>
            </div>
            <div style={{ background: '#DCFCE7', padding: 14, borderRadius: 8, borderLeft: '3px solid #15803D' }}>
              <div style={{ fontSize: 9, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Venta total</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#15803D', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{fmt(stats.ventaTotal)}</div>
            </div>
            <div style={{ background: '#DBEAFE', padding: 14, borderRadius: 8, borderLeft: '3px solid #1D4ED8' }}>
              <div style={{ fontSize: 9, color: '#1E40AF', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>Utilidad</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1D4ED8', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{fmt(stats.utilidad)}</div>
              <div style={{ fontSize: 10, color: '#2563EB', marginTop: 2 }}>{stats.margen.toFixed(1)}% margen</div>
            </div>
          </div>

          {/* COBRANZA */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: '#475569', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.8, marginBottom: 10 }}>
              💰 Cobranza
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #BBF7D0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>✓ COBRADO</div>
                  <div style={{ fontSize: 9, color: '#16A34A', background: '#DCFCE7', padding: '2px 6px', borderRadius: 3 }}>{stats.cobradoBol} bol.</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#15803D', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{fmt(stats.cobrado)}</div>
              </div>
              <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #FDE68A' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 11, color: '#92400E', fontWeight: 600 }}>⏳ POR COBRAR</div>
                  <div style={{ fontSize: 9, color: '#B45309', background: '#FEF3C7', padding: '2px 6px', borderRadius: 3 }}>{stats.porCobrarBol} bol.</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#B45309', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{fmt(stats.porCobrar)}</div>
              </div>
              <div style={{ background: 'white', padding: 12, borderRadius: 8, border: '1px solid #FCA5A5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 11, color: '#991B1B', fontWeight: 600 }}>⚠ VENCIDAS</div>
                  <div style={{ fontSize: 9, color: '#DC2626', background: '#FEE2E2', padding: '2px 6px', borderRadius: 3 }}>{stats.vencidoBol} bol.</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#991B1B', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{fmt(stats.vencido)}</div>
              </div>
            </div>
          </div>

          {/* POR DÍA */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, color: '#475569', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.8, marginBottom: 10 }}>
              📅 Por Día
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#042C53', color: 'white' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600 }}>DÍA</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>BOL.</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>COSTO</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>VENTA</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>UTILIDAD</th>
                </tr>
              </thead>
              <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
                {stats.dias.map((d, idx) => (
                  <tr key={d.fecha} style={{ borderBottom: '0.5px solid #F1F5F9', background: idx % 2 === 1 ? '#F8FAFC' : 'white' }}>
                    <td style={{ padding: '6px 8px' }}>{diaAbrev(d.fecha)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{d.count}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt(d.costo)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#15803D' }}>{fmt(d.venta)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1D4ED8' }}>{fmt(d.utilidad)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#042C53', color: 'white', fontWeight: 700 }}>
                  <td style={{ padding: '7px 8px' }}>TOTAL</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>{stats.boletos}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>{fmt(stats.costoTotal)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>{fmt(stats.ventaTotal)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>{fmt(stats.utilidad)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* PLAZA + TOP PAGADORES */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: '#475569', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>
                📍 Por Plaza
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <tbody>
                  <tr style={{ background: '#DCFCE7' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600, color: '#166534' }}>MEX</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{stats.byPlaza.MEX.count} bol.</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#15803D', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(stats.byPlaza.MEX.venta)}</td>
                  </tr>
                  <tr style={{ background: '#FEE2E2' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 600, color: '#991B1B' }}>CUBA</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{stats.byPlaza.CUBA.count} bol.</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#B91C1C', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(stats.byPlaza.CUBA.venta)}</td>
                  </tr>
                  {stats.byPlaza['—'].count > 0 && (
                    <tr style={{ background: '#F1F5F9' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: '#475569' }}>Sin asignar</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{stats.byPlaza['—'].count} bol.</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>{fmt(stats.byPlaza['—'].venta)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#475569', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>
                🏢 Top Cliente Pagador
              </div>
              {stats.topPagadores.length === 0 ? (
                <div style={{ fontSize: 11, color: '#94A3B8', padding: '12px 8px' }}>Sin datos</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <tbody>
                    {stats.topPagadores.map(([name, monto], idx) => (
                      <tr key={name} style={{ borderBottom: '0.5px solid #F1F5F9', background: idx % 2 === 1 ? '#F8FAFC' : 'white' }}>
                        <td style={{ padding: '6px 8px' }}>{name}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* FOOTER */}
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 9, color: '#94A3B8' }}>
              Generado: {new Date().toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · Viajes Libero
            </div>
            <div style={{ fontSize: 9, color: '#94A3B8' }}>Caribe Cool</div>
          </div>
        </div>
      )}
    </div>
  );
}
