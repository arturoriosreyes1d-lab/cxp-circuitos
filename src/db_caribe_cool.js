// ═══════════════════════════════════════════════════════════════════
// Capa de datos para el módulo Caribe Cool (Boletería)
// ═══════════════════════════════════════════════════════════════════
//
// Tablas Supabase:
//   • boletos_caribe_cool       → boletos importados + datos manuales
//   • movimientos_tesoreria_cc  → transferencias entre cajas, recargas, saldos iniciales
//
// Convenciones:
//   - snake_case en DB ↔ camelCase en app (helpers toApp/toDB)
//   - Filtros por empresa_id (Viajes Libero = "empresa_1")
//   - RLS permisivo (allow_all) consistente con el resto del proyecto
//   - Auditoría con logAudit (importado desde db.js)
// ═══════════════════════════════════════════════════════════════════

import { supabase } from './supabase.js';
import { logAudit } from './db.js';

// ═══════════════════════════════════════════════════════════════════
// BOLETOS
// ═══════════════════════════════════════════════════════════════════

/**
 * Genera un business_id estable para detectar duplicados al re-importar.
 * Convención: pnr + descripción normalizada (sin espacios, lowercase).
 * Dos boletos del mismo PNR con descripciones distintas (ej. grupos con
 * múltiples pasajeros) son tratados como boletos diferentes.
 */
export function makeBusinessId(pnr, descripcion) {
  const desc = (descripcion || '').toLowerCase().replace(/\s+/g, '');
  return `${pnr || 'nopnr'}::${desc}`;
}

/**
 * Versión LAXA del business_id: ignora el último corchete `[...]` que
 * suele contener el nombre del pasajero. Útil para hacer matching cuando
 * el Excel de Pamela trae el nombre del pasajero pero el de Caribe Cool no
 * (o viceversa).
 *
 * Ejemplos:
 *   "Venta del billete [RT] HAV>CUN"                  → "ventadelbillete[rt]hav>cun"
 *   "Venta del billete [RT] HAV>CUN [MIRYAM MARTIN]"   → "ventadelbillete[rt]hav>cun"
 */
export function makeLooseBusinessId(pnr, descripcion) {
  const desc = (descripcion || '')
    .replace(/\s*\[[^\]]*\]\s*$/, '') // quita ÚLTIMO corchete al final
    .toLowerCase()
    .replace(/\s+/g, '');
  return `${pnr || 'nopnr'}::${desc}`;
}

/**
 * Busca un boleto existente en el array dado, intentando 3 estrategias en
 * cascada (de más estricta a más permisiva):
 *   1. Match exacto por business_id (pnr + descripción completa)
 *   2. Match laxo ignorando nombre del pasajero entre [...]
 *      Si hay varios candidatos, desempata por cliente exacto
 *   3. Match por PNR único cuando solo hay 1 boleto con ese PNR
 *
 * Si `options.strict === true`, SOLO usa la estrategia 1 (match exacto).
 * Esto es útil para flujos donde NO queremos fusionar accidentalmente:
 * por ejemplo, pegado de texto de Caribe Cool donde un mismo PNR puede
 * tener varios cargos distintos (billete, equipaje, asiento, reproteccion).
 *
 * Modo no-strict (default): Excel de Pamela, donde puede venir el nombre
 * del pasajero entre corchetes adicional.
 *
 * Retorna el boleto existente o null si no hay match seguro.
 * Si hay ambigüedad (múltiples candidatos sin desempate), retorna null
 * para evitar mergear boletos diferentes accidentalmente.
 */
export function findExistingBoleto(patch, existingBoletos, options = {}) {
  if (!patch || !patch.pnr || !existingBoletos || existingBoletos.length === 0) {
    return null;
  }

  // Estrategia 1: match exacto por business_id (siempre se intenta)
  // CON desempate por fecha_venta: un mismo PNR + descripción puede repetirse
  // en fechas distintas (ej. el mismo pasajero pide "ASIENTO PRIORITY 2B"
  // varios días distintos). Si ambos lados tienen fecha, debe coincidir.
  const exactBid = makeBusinessId(patch.pnr, patch.descripcion);
  const exactMatches = existingBoletos.filter(
    (b) => makeBusinessId(b.pnr, b.descripcion) === exactBid
  );

  if (exactMatches.length > 0) {
    // Si el patch tiene fecha, EXIGIR que coincida con la del boleto
    if (patch.fecha_venta) {
      const byDate = exactMatches.find(
        (b) => b.fecha_venta === patch.fecha_venta
      );
      if (byDate) return byDate;
      // Hay boletos con mismo business_id pero ninguno del día correcto
      // → esta fila del Excel es huérfana (no debe matchear con otra fecha)
      return null;
    }
    // El patch NO tiene fecha: tomar el primero (comportamiento legacy)
    return exactMatches[0];
  }

  // Modo strict: NO usar estrategias laxas (2 y 3).
  // Útil para pegado de texto Caribe Cool: un mismo PNR puede tener
  // varios cargos distintos (billete, equipaje, asiento, etc).
  if (options.strict) return null;

  // Estrategia 2: match laxo (ignorando último corchete = nombre pasajero)
  const looseBid = makeLooseBusinessId(patch.pnr, patch.descripcion);
  const looseCandidates = existingBoletos.filter(
    (b) => makeLooseBusinessId(b.pnr, b.descripcion) === looseBid
  );
  if (looseCandidates.length === 1) return looseCandidates[0];
  if (looseCandidates.length > 1) {
    // Múltiples candidatos: desempatar por cliente exacto
    const byClient = looseCandidates.find(
      (b) =>
        String(b.cliente || '').trim().toLowerCase() ===
        String(patch.cliente || '').trim().toLowerCase()
    );
    if (byClient) return byClient;
    return null; // Ambigüedad: mejor no mergear que crear merge incorrecto
  }

  // Estrategia 3: PNR único en la app
  const samePnr = existingBoletos.filter(
    (b) =>
      String(b.pnr || '').toUpperCase() ===
      String(patch.pnr || '').toUpperCase()
  );
  if (samePnr.length === 1) return samePnr[0];

  return null;
}

// Helper: extrae monto numérico de trans_negativa.
// Acepta: number (40.0), string ("40 USD", "40", "$40"), null, ""
// Retorna: number > 0, o null si vacío/cero/inválido
function parseTransNegativa(v) {
  if (v == null || v === '' || v === false || v === 'false') return null;
  if (typeof v === 'number') return v > 0 ? v : null;
  const s = String(v).trim();
  if (!s || s === '-' || s === 'false') return null;
  // Quitar todo lo que no sea dígito, punto, coma o guión
  const cleaned = s.replace(/[^\d.,-]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  if (isNaN(num) || num === 0) return null;
  return num;
}

// ─── Conversión: row DB → objeto app ──────────────────────────────
const boletoToApp = (row) => ({
  id: row.id,
  empresaId: row.empresa_id,
  businessId: row.business_id,

  // Datos del proveedor Caribe Cool
  pnr: row.pnr || '',
  cliente: row.cliente || '',
  fecha_venta: row.fecha_venta || '',
  descripcion: row.descripcion || '',
  tipo_viaje: row.tipo_viaje || '',
  ruta: row.ruta || '',
  costo_usd: row.costo_usd != null ? +row.costo_usd : null,
  moneda_costo: row.moneda_costo || 'USD',
  estado_caribe: row.estado_caribe || '',
  tipo_pago_caribe: row.tipo_pago_caribe || '',
  vendedor: row.vendedor || '',
  trans_negativa: parseTransNegativa(row.trans_negativa),

  // Datos manuales (Pamela)
  so_mexico: row.so_mexico || '',
  so_cuba: row.so_cuba || '',
  forma_pago: row.forma_pago || '',
  precio_venta: row.precio_venta != null ? +row.precio_venta : null,
  fecha_cobro: row.fecha_cobro || '',
  cliente_pagador: row.cliente_pagador || '',
  dias_credito: row.dias_credito != null ? +row.dias_credito : null,
  estatus: row.estatus || '',
  plaza: row.plaza || '',
  notas: row.notas || '',

  // Moneda local del cobro
  moneda_cobro: row.moneda_cobro || 'USD',
  precio_venta_local:
    row.precio_venta_local != null ? +row.precio_venta_local : null,
  tipo_cambio: row.tipo_cambio != null ? +row.tipo_cambio : null,

  // Timestamps (informativos)
  created_at: row.created_at || null,
  updated_at: row.updated_at || null,
});

// ─── Conversión: objeto app → row DB ──────────────────────────────
const boletoToDB = (b, empresaId) => {
  // Calcula business_id consistentemente
  const businessId = b.businessId || makeBusinessId(b.pnr, b.descripcion);
  return {
    empresa_id: empresaId || b.empresaId,
    business_id: businessId,

    pnr: b.pnr || null,
    cliente: b.cliente || null,
    fecha_venta: b.fecha_venta || null,
    descripcion: b.descripcion || null,
    tipo_viaje: b.tipo_viaje || null,
    ruta: b.ruta || null,
    costo_usd: b.costo_usd != null ? b.costo_usd : null,
    moneda_costo: b.moneda_costo || 'USD',
    estado_caribe: b.estado_caribe || null,
    tipo_pago_caribe: b.tipo_pago_caribe || null,
    vendedor: b.vendedor || null,
    trans_negativa: parseTransNegativa(b.trans_negativa),

    so_mexico: b.so_mexico || null,
    so_cuba: b.so_cuba || null,
    forma_pago: b.forma_pago || null,
    precio_venta: b.precio_venta != null ? b.precio_venta : null,
    fecha_cobro: b.fecha_cobro || null,
    cliente_pagador: b.cliente_pagador || null,
    dias_credito: b.dias_credito != null ? b.dias_credito : null,
    estatus: b.estatus || null,
    plaza: b.plaza || null,
    notas: b.notas || null,

    moneda_cobro: b.moneda_cobro || 'USD',
    precio_venta_local:
      b.precio_venta_local != null ? b.precio_venta_local : null,
    tipo_cambio: b.tipo_cambio != null ? b.tipo_cambio : null,
  };
};

// Helper: detecta si un id es UUID válido (los nuevos lo son, los del
// prototipo NO — se calculaban como pnr::descripcion).
function esUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id || '');
}

// ─── READ ─────────────────────────────────────────────────────────
/**
 * Carga todos los boletos de una empresa. Ordenados por fecha_venta desc.
 * @param {string} empresaId
 * @returns {Promise<Array>} boletos en formato app
 */
export async function fetchBoletosCC(empresaId) {
  let q = supabase
    .from('boletos_caribe_cool')
    .select('*')
    .order('fecha_venta', { ascending: false });
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q;
  if (error) {
    console.error('fetchBoletosCC:', error);
    return [];
  }
  return (data || []).map(boletoToApp);
}

// ─── UPSERT (uno) ─────────────────────────────────────────────────
/**
 * Inserta o actualiza un boleto. Si tiene id UUID → UPDATE; si no → INSERT.
 * En INSERT usa el constraint UNIQUE(empresa_id, business_id) para evitar
 * duplicados — si ya existe, hace UPDATE de los campos.
 */
export async function upsertBoletoCC(boleto, empresaId) {
  const row = boletoToDB(boleto, empresaId);

  // Si trae id UUID → UPDATE explícito
  if (boleto.id && esUuid(boleto.id)) {
    const { data, error } = await supabase
      .from('boletos_caribe_cool')
      .update(row)
      .eq('id', boleto.id)
      .select()
      .single();
    if (error) {
      console.error('upsertBoletoCC (update):', error);
      return boleto;
    }
    await logAudit({
      accion: 'editar',
      entidad: 'boleto_cc',
      entidadId: data.id,
      empresaId: row.empresa_id,
    });
    return boletoToApp(data);
  }

  // INSERT con upsert por (empresa_id, business_id)
  const { data, error } = await supabase
    .from('boletos_caribe_cool')
    .upsert(row, { onConflict: 'empresa_id,business_id' })
    .select()
    .single();
  if (error) {
    console.error('upsertBoletoCC (insert):', error);
    return boleto;
  }
  await logAudit({
    accion: 'crear',
    entidad: 'boleto_cc',
    entidadId: data.id,
    empresaId: row.empresa_id,
    contexto: { pnr: row.pnr },
  });
  return boletoToApp(data);
}

// ─── UPSERT MASIVO (al importar Excel) ─────────────────────────────
/**
 * Inserta o actualiza múltiples boletos en una sola operación.
 * Usa el constraint UNIQUE para deduplicar.
 * Retorna los boletos guardados (con sus UUIDs reales).
 */
export async function upsertManyBoletosCC(boletos, empresaId) {
  if (!boletos || boletos.length === 0) return [];
  const rows = boletos.map((b) => boletoToDB(b, empresaId));

  // Deduplicar por business_id: Postgres rechaza ON CONFLICT con duplicados
  // dentro del mismo batch. Si llega el mismo business_id 2 veces, mantenemos
  // solo la ÚLTIMA (que tiene los datos más actualizados).
  const dedup = new Map();
  for (const r of rows) {
    if (r.business_id) dedup.set(r.business_id, r);
  }
  const uniqueRows = Array.from(dedup.values());
  if (uniqueRows.length < rows.length) {
    console.warn(
      `[upsertManyBoletosCC] deduplicadas ${rows.length - uniqueRows.length} filas duplicadas por business_id`
    );
  }

  const { data, error } = await supabase
    .from('boletos_caribe_cool')
    .upsert(uniqueRows, { onConflict: 'empresa_id,business_id' })
    .select();

  if (error) {
    console.error('upsertManyBoletosCC:', error);
    return boletos;
  }
  await logAudit({
    accion: 'importar',
    entidad: 'boletos_cc',
    empresaId,
    contexto: { cantidad: rows.length },
  });
  return (data || []).map(boletoToApp);
}

// ─── DELETE (uno) ─────────────────────────────────────────────────
export async function deleteBoletoCC(id) {
  await logAudit({
    accion: 'eliminar',
    entidad: 'boleto_cc',
    entidadId: id,
  });
  const { error } = await supabase
    .from('boletos_caribe_cool')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('deleteBoletoCC:', error);
    return false;
  }
  return true;
}

// ─── DELETE MASIVO ────────────────────────────────────────────────
export async function deleteManyBoletosCC(ids) {
  if (!ids || ids.length === 0) return true;
  await logAudit({
    accion: 'eliminar_masivo',
    entidad: 'boletos_cc',
    contexto: { cantidad: ids.length },
  });
  const { error } = await supabase
    .from('boletos_caribe_cool')
    .delete()
    .in('id', ids);
  if (error) {
    console.error('deleteManyBoletosCC:', error);
    return false;
  }
  return true;
}

// ─── UPDATE PARCIAL ───────────────────────────────────────────────
/**
 * Actualiza solo campos específicos de un boleto (sin tocar el resto).
 * Útil para ediciones in-line sin re-enviar el objeto completo.
 */
export async function updateBoletoCCFields(id, fields) {
  // Convertir camelCase → snake_case para los campos enviados
  const fieldsDB = {};
  const mapping = {
    pnr: 'pnr',
    cliente: 'cliente',
    fecha_venta: 'fecha_venta',
    descripcion: 'descripcion',
    tipo_viaje: 'tipo_viaje',
    ruta: 'ruta',
    costo_usd: 'costo_usd',
    moneda_costo: 'moneda_costo',
    estado_caribe: 'estado_caribe',
    tipo_pago_caribe: 'tipo_pago_caribe',
    vendedor: 'vendedor',
    trans_negativa: 'trans_negativa',
    so_mexico: 'so_mexico',
    so_cuba: 'so_cuba',
    forma_pago: 'forma_pago',
    precio_venta: 'precio_venta',
    fecha_cobro: 'fecha_cobro',
    cliente_pagador: 'cliente_pagador',
    dias_credito: 'dias_credito',
    estatus: 'estatus',
    plaza: 'plaza',
    notas: 'notas',
    moneda_cobro: 'moneda_cobro',
    precio_venta_local: 'precio_venta_local',
    tipo_cambio: 'tipo_cambio',
  };
  for (const k of Object.keys(fields)) {
    if (mapping[k]) fieldsDB[mapping[k]] = fields[k];
  }

  const { data, error } = await supabase
    .from('boletos_caribe_cool')
    .update(fieldsDB)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('updateBoletoCCFields:', error);
    return null;
  }
  await logAudit({
    accion: 'editar',
    entidad: 'boleto_cc',
    entidadId: id,
    contexto: { campos: Object.keys(fields) },
  });
  return boletoToApp(data);
}

// ═══════════════════════════════════════════════════════════════════
// MOVIMIENTOS DE TESORERÍA
// ═══════════════════════════════════════════════════════════════════

const movToApp = (row) => ({
  id: row.id,
  empresaId: row.empresa_id,
  fecha: row.fecha || '',
  caja_origen: row.caja_origen || '',
  caja_destino: row.caja_destino || '',
  monto: row.monto != null ? +row.monto : 0,
  moneda: row.moneda || 'USD',
  monto_destino: row.monto_destino != null ? +row.monto_destino : null,
  moneda_destino: row.moneda_destino || null,
  tc: row.tc != null ? +row.tc : null,
  nota: row.nota || '',
  created_at: row.created_at || null,
  updated_at: row.updated_at || null,
});

const movToDB = (m, empresaId) => ({
  empresa_id: empresaId || m.empresaId,
  fecha: m.fecha || null,
  caja_origen: m.caja_origen || null,
  caja_destino: m.caja_destino || null,
  monto: m.monto != null ? m.monto : 0,
  moneda: m.moneda || 'USD',
  monto_destino: m.monto_destino != null ? m.monto_destino : null,
  moneda_destino: m.moneda_destino || null,
  tc: m.tc != null ? m.tc : null,
  nota: m.nota || null,
});

// ─── READ ─────────────────────────────────────────────────────────
export async function fetchMovimientosCC(empresaId) {
  let q = supabase
    .from('movimientos_tesoreria_cc')
    .select('*')
    .order('fecha', { ascending: false });
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q;
  if (error) {
    console.error('fetchMovimientosCC:', error);
    return [];
  }
  return (data || []).map(movToApp);
}

// ─── UPSERT ───────────────────────────────────────────────────────
export async function upsertMovimientoCC(mov, empresaId) {
  const row = movToDB(mov, empresaId);
  const isUUID = mov.id && esUuid(mov.id);

  if (isUUID) {
    const { data, error } = await supabase
      .from('movimientos_tesoreria_cc')
      .update(row)
      .eq('id', mov.id)
      .select()
      .single();
    if (error) {
      console.error('upsertMovimientoCC (update):', error);
      return mov;
    }
    await logAudit({
      accion: 'editar',
      entidad: 'movimiento_cc',
      entidadId: data.id,
      empresaId: row.empresa_id,
    });
    return movToApp(data);
  }

  const { data, error } = await supabase
    .from('movimientos_tesoreria_cc')
    .insert(row)
    .select()
    .single();
  if (error) {
    console.error('upsertMovimientoCC (insert):', error);
    return mov;
  }
  await logAudit({
    accion: 'crear',
    entidad: 'movimiento_cc',
    entidadId: data.id,
    empresaId: row.empresa_id,
    contexto: {
      origen: row.caja_origen,
      destino: row.caja_destino,
      monto: row.monto,
    },
  });
  return movToApp(data);
}

// ─── DELETE ───────────────────────────────────────────────────────
export async function deleteMovimientoCC(id) {
  await logAudit({
    accion: 'eliminar',
    entidad: 'movimiento_cc',
    entidadId: id,
  });
  const { error } = await supabase
    .from('movimientos_tesoreria_cc')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('deleteMovimientoCC:', error);
    return false;
  }
  return true;
}
