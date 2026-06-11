import { supabase } from './supabase.js';

/* ── Helpers: convert between DB snake_case and App camelCase ─── */
const toApp = (row) => ({
  id: row.id,
  tipo: row.tipo || 'Factura',  // 'Factura' | 'EgresoNF'
  fecha: row.fecha || '',
  serie: row.serie || '',
  folio: row.folio || '',
  uuid: row.uuid || '',
  proveedor: row.proveedor || '',
  clasificacion: row.clasificacion || '',
  subtotal: +row.subtotal || 0,
  iva: +row.iva || 0,
  retIsr: +row.ret_isr || 0,
  retIva: +row.ret_iva || 0,
  total: +row.total || 0,
  montoPagado: +row.monto_pagado || 0,
  concepto: row.concepto || '',
  diasCredito: row.dias_credito || 30,
  vencimiento: row.vencimiento || '',
  estatus: row.estatus || 'Pendiente',
  fechaProgramacion: row.fecha_programacion || '',
  diasFicticios: row.dias_ficticios || 0,
  referencia: row.referencia || '',
  notas: row.notas || '',
  moneda: row.moneda || 'MXN',
  voBo: row.vo_bo || false,
  autorizadoDireccion: row.autorizado_direccion || false,
  empresaId: row.empresa_id || null,
  // Campos específicos de Egresos No Facturados
  categoriaEgreso: row.categoria_egreso || '',
  segmentoEgreso: row.segmento_egreso || '',
});

const toDB = (inv) => ({
  id: inv.id,
  tipo: inv.tipo,
  fecha: inv.fecha || null,
  serie: inv.serie,
  folio: inv.folio,
  uuid: inv.uuid,
  proveedor: inv.proveedor,
  clasificacion: inv.clasificacion,
  subtotal: inv.subtotal,
  iva: inv.iva,
  ret_isr: inv.retIsr || 0,
  ret_iva: inv.retIva || 0,
  total: inv.total,
  monto_pagado: inv.montoPagado || 0,
  concepto: inv.concepto || '',
  dias_credito: inv.diasCredito,
  vencimiento: inv.vencimiento || null,
  estatus: inv.estatus,
  fecha_programacion: inv.fechaProgramacion || null,
  dias_ficticios: inv.diasFicticios || 0,
  referencia: inv.referencia || '',
  notas: inv.notas || '',
  moneda: inv.moneda || 'MXN',
  vo_bo: inv.voBo || false,
  autorizado_direccion: inv.autorizadoDireccion || false,
  empresa_id: inv.empresaId || null,
  categoria_egreso: inv.categoriaEgreso || null,
  segmento_egreso: inv.segmentoEgreso || null,
});

const supToApp = (row) => ({
  id: row.id,
  nombre: row.nombre,
  rfc: row.rfc || '',
  moneda: row.moneda || 'MXN',
  diasCredito: row.dias_credito || 30,
  contacto: row.contacto || '',
  telefono: row.telefono || '',
  email: row.email || '',
  banco: row.banco || '',
  clabe: row.clabe || '',
  clasificacion: row.clasificacion || 'Otros',
  activo: row.activo !== false,
  empresaId: row.empresa_id || null,
  grupo: row.grupo || '',
});

const supToDB = (sup) => ({
  id: sup.id,
  nombre: sup.nombre,
  rfc: sup.rfc || '',
  moneda: sup.moneda || 'MXN',
  dias_credito: sup.diasCredito || 30,
  contacto: sup.contacto || '',
  telefono: sup.telefono || '',
  email: sup.email || '',
  banco: sup.banco || '',
  clabe: sup.clabe || '',
  clasificacion: sup.clasificacion || 'Otros',
  activo: sup.activo !== false,
  empresa_id: sup.empresaId || null,
  grupo: sup.grupo || null,
});

/* ── Invoices ────────────────────────────────────────────────── */
export async function fetchInvoices(empresaId) {
  const res = await fetchAllPaginated(() => {
    let q = supabase.from('invoices').select('*').order('fecha', { ascending: false });
    if (empresaId) q = q.eq('empresa_id', empresaId);
    return q;
  });
  if (res.error) { console.error('fetchInvoices:', res.error); return { MXN: [], USD: [], EUR: [] }; }
  const grouped = { MXN: [], USD: [], EUR: [] };
  (res.data || []).forEach(row => {
    const inv = toApp(row);
    if (grouped[inv.moneda]) grouped[inv.moneda].push(inv);
    else grouped.MXN.push(inv);
  });
  return grouped;
}

export async function upsertInvoice(inv) {
  const row = toDB(inv);
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(row.id);
  if (!isUUID) {
    delete row.id;
    const { data, error } = await supabase.from('invoices').insert(row).select().single();
    if (error) { console.error('insertInvoice:', error); return inv; }
    return toApp(data);
  } else {
    const { data, error } = await supabase.from('invoices').update(row).eq('id', row.id).select().single();
    if (error) { console.error('updateInvoice:', error); return inv; }
    return toApp(data);
  }
}

export async function upsertManyInvoices(invArr) {
  const rows = invArr.map(inv => {
    const row = toDB(inv);
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(row.id);
    if (!isUUID) delete row.id;
    return row;
  });
  const { data, error } = await supabase.from('invoices').insert(rows).select();
  if (error) { console.error('upsertManyInvoices:', error); return invArr; }
  return (data || []).map(toApp);
}

export async function deleteInvoiceDB(id) {
  await logAudit({ accion:'eliminar', entidad:'factura_cxp', entidadId:id });

  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) console.error('deleteInvoice:', error);
}

export async function updateInvoiceField(id, fields) {
  await logAudit({ accion:'editar', entidad:'factura_cxp', entidadId:id, contexto:{ campos: Object.keys(fields||{}) } });

  // fields: { clasificacion: 'x' } or { fecha_programacion: 'y' } etc
  const dbFields = {};
  if ('clasificacion' in fields) dbFields.clasificacion = fields.clasificacion;
  if ('fechaProgramacion' in fields) dbFields.fecha_programacion = fields.fechaProgramacion;
  if ('estatus' in fields) dbFields.estatus = fields.estatus;
  if ('montoPagado' in fields) dbFields.monto_pagado = fields.montoPagado;
  if ('concepto' in fields) dbFields.concepto = fields.concepto;
  if ('voBo' in fields) dbFields.vo_bo = fields.voBo;
  if ('autorizadoDireccion' in fields) dbFields.autorizado_direccion = fields.autorizadoDireccion;
  const { error } = await supabase.from('invoices').update(dbFields).eq('id', id);
  if (error) console.error('updateInvoiceField:', error);
}

export async function bulkUpdateInvoices(ids, fields) {
  const dbFields = {};
  if (fields.clasificacion) dbFields.clasificacion = fields.clasificacion;
  if (fields.fechaProgramacion) dbFields.fecha_programacion = fields.fechaProgramacion;
  if (fields.estatus) dbFields.estatus = fields.estatus;
  if (fields.montoPagado !== undefined) dbFields.monto_pagado = fields.montoPagado;
  if ('autorizadoDireccion' in fields) dbFields.autorizado_direccion = fields.autorizadoDireccion;
  const { error } = await supabase.from('invoices').update(dbFields).in('id', ids);
  if (error) console.error('bulkUpdateInvoices:', error);
}

/* ── Suppliers ───────────────────────────────────────────────── */
export async function fetchSuppliers(empresaId) {
  let q = supabase.from('suppliers').select('*').order('nombre');
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q;
  if (error) { console.error('fetchSuppliers:', error); return []; }
  return (data || []).map(supToApp);
}

export async function upsertSupplier(sup) {
  const row = supToDB(sup);
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(row.id);
  if (!isUUID) {
    // New record: insert without id, let Supabase generate it
    delete row.id;
    const { data, error } = await supabase.from('suppliers').insert(row).select().single();
    if (error) { console.error('insertSupplier:', error); return sup; }
    return supToApp(data);
  } else {
    // Existing record: update by id
    const { data, error } = await supabase.from('suppliers').update(row).eq('id', row.id).select().single();
    if (error) { console.error('updateSupplier:', error); return sup; }
    return supToApp(data);
  }
}

export async function upsertManySuppliers(sups) {
  const rows = sups.map(s => {
    const row = supToDB(s);
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(row.id);
    if (!isUUID) delete row.id;
    return row;
  });
  const { data, error } = await supabase.from('suppliers').insert(rows).select();
  if (error) { console.error('upsertManySuppliers:', error); return sups; }
  return (data || []).map(supToApp);
}

/* ── Clasificaciones ─────────────────────────────────────────── */
export async function fetchClasificaciones(empresaId) {
  let q = supabase.from('clasificaciones').select('nombre').order('nombre');
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q;
  if (error) { console.error('fetchClasificaciones:', error); return []; }
  return (data || []).map(r => r.nombre);
}

export async function saveClasificaciones(list, empresaId) {
  // Delete all for this empresa, re-insert
  let q = supabase.from('clasificaciones').delete();
  if (empresaId) q = q.eq('empresa_id', empresaId);
  else q = q.neq('id', '00000000-0000-0000-0000-000000000000');
  await q;
  const rows = list.map(nombre => ({ nombre, empresa_id: empresaId || null }));
  const { error } = await supabase.from('clasificaciones').upsert(rows, { onConflict: 'nombre' });
  if (error) console.error('saveClasificaciones:', error);
}

/* ── Payments (pagos programados y realizados) ───────────────── */
// Helper: pagina resultados de Supabase en chunks de 1000 para evitar el
// límite por defecto. Devuelve TODOS los registros que coincidan, no solo
// los primeros 1000.
async function fetchAllPaginated(builderFactory) {
  const PAGE = 1000;
  let allRows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await builderFactory().range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return { data: allRows, error: null };
}

export async function fetchPayments(empresaId) {
  // Payments linked to invoices of this empresa
  if (empresaId) {
    // 1. Traer IDs de invoices con paginación (en VL pueden ser 645+)
    const invRes = await fetchAllPaginated(() =>
      supabase.from('invoices').select('id').eq('empresa_id', empresaId)
    );
    if (invRes.error) { console.error('fetchPayments(invoices):', invRes.error); return []; }
    const ids = (invRes.data || []).map(r => r.id);
    if (ids.length === 0) return [];

    // 2. Traer payments en CHUNKS de IDs para no exceder límite de URL.
    //    Supabase rechaza URLs > ~16KB; 200 UUIDs ≈ 8KB (seguro con margen).
    const CHUNK = 200;
    let allPayments = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const res = await fetchAllPaginated(() =>
        supabase.from('payments').select('*').in('invoice_id', slice).order('fecha_pago', { ascending: false })
      );
      if (res.error) { console.error('fetchPayments(chunk):', res.error); continue; }
      allPayments = allPayments.concat(res.data || []);
    }
    return allPayments.map(r => ({
      id: r.id, invoiceId: r.invoice_id, monto: +r.monto || 0,
      fechaPago: r.fecha_pago || '', notas: r.notas || '', tipo: r.tipo || 'realizado',
      metodoPago: r.metodo_pago || 'banco',
    }));
  }
  // Sin filtro de empresa: paginado simple
  const res = await fetchAllPaginated(() =>
    supabase.from('payments').select('*').order('fecha_pago', { ascending: false })
  );
  if (res.error) { console.error('fetchPayments:', res.error); return []; }
  return (res.data || []).map(r => ({
    id: r.id, invoiceId: r.invoice_id, monto: +r.monto || 0,
    fechaPago: r.fecha_pago || '', notas: r.notas || '', tipo: r.tipo || 'realizado',
    metodoPago: r.metodo_pago || 'banco',
  }));
}

export async function insertPayment(p) {
  const _auditFolio = p?.invoiceId;

  const row = {
    invoice_id: p.invoiceId, monto: p.monto, fecha_pago: p.fechaPago,
    notas: p.notas || '', tipo: p.tipo || 'realizado',
    metodo_pago: p.metodoPago || 'banco',
  };
  const { data, error } = await supabase.from('payments').insert(row).select().single();
  if (error) { console.error('insertPayment:', error); return p; }
  await logAudit({ accion:'crear', entidad:'pago_cxp', entidadId:data.id, contexto:{ invoiceId:_auditFolio } });
  return {
    id: data.id, invoiceId: data.invoice_id, monto: +data.monto,
    fechaPago: data.fecha_pago, notas: data.notas || '', tipo: data.tipo || 'realizado',
    metodoPago: data.metodo_pago || 'banco',
  };
}

export async function deletePayment(id) {
  await logAudit({ accion:'eliminar', entidad:'pago_cxp', entidadId:id });

  const { error } = await supabase.from('payments').delete().eq('id', id);
  if (error) console.error('deletePayment:', error);
}

export async function updatePayment(id, fields) {
  await logAudit({ accion:'editar', entidad:'pago_cxp', entidadId:id, contexto:{ campos: Object.keys(fields||{}) } });

  const dbFields = {};
  if ('monto' in fields) dbFields.monto = fields.monto;
  if ('fechaPago' in fields) dbFields.fecha_pago = fields.fechaPago;
  if ('notas' in fields) dbFields.notas = fields.notas;
  if ('tipo' in fields) dbFields.tipo = fields.tipo;
  if ('metodoPago' in fields) dbFields.metodo_pago = fields.metodoPago;
  const { error } = await supabase.from('payments').update(dbFields).eq('id', id);
  if (error) console.error('updatePayment:', error);
}

/* ═══════════════════════════════════════════════════════════════
   CxC — CUENTAS POR COBRAR
   ═══════════════════════════════════════════════════════════════ */

/* ── Helpers ─────────────────────────────────────────────────── */
const ingresoToApp = (r) => ({
  id: r.id,
  cliente: r.cliente || '',
  concepto: r.concepto || '',
  categoria: r.categoria || '',
  monto: +r.monto || 0,
  moneda: r.moneda || 'MXN',
  tipoCambio: +r.tipo_cambio || 1,
  fecha: r.fecha || '',
  notas: r.notas || '',
  empresaId: r.empresa_id || null,
  diasCredito: +r.dias_credito || 30,
  fechaVencimiento: r.fecha_vencimiento || '',
  fechaFicticia: r.fecha_ficticia || '',
  segmento: r.segmento || '',
  fechaContable: r.fecha_contable || '',
  folio: r.folio || '',
  oculta: r.oculta || false,
});

const ingresoToDB = (i) => ({
  id: i.id,
  cliente: i.cliente,
  concepto: i.concepto || '',
  categoria: i.categoria || '',
  monto: i.monto,
  moneda: i.moneda || 'MXN',
  tipo_cambio: i.tipoCambio || 1,
  fecha: i.fecha || null,
  notas: i.notas || '',
  empresa_id: i.empresaId || null,
  dias_credito: i.diasCredito || 30,
  fecha_vencimiento: i.fechaVencimiento || null,
  fecha_ficticia: i.fechaFicticia || null,
  segmento: i.segmento || null,
  fecha_contable: i.fechaContable || null,
  folio: i.folio || null,
});

/* ── Ingresos ────────────────────────────────────────────────── */
export async function fetchIngresos(empresaId) {
  let q = supabase.from('ingresos').select('*').order('fecha', { ascending: false });
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q;
  if (error) { console.error('fetchIngresos:', error); return []; }
  return (data || []).map(ingresoToApp);
}

export async function upsertIngreso(ing) {
  const row = ingresoToDB(ing);
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(row.id);
  if (!isUUID) {
    delete row.id;
    const { data, error } = await supabase.from('ingresos').insert(row).select().single();
    if (error) { console.error('insertIngreso:', error); return ing; }
    await logAudit({ accion:'crear', entidad:'ingreso', entidadId:data.id, empresaId:data.empresa_id });
    return ingresoToApp(data);
  } else {
    const { data, error } = await supabase.from('ingresos').update(row).eq('id', row.id).select().single();
    if (error) { console.error('updateIngreso:', error); return ing; }
    await logAudit({ accion:'editar', entidad:'ingreso', entidadId:data.id, empresaId:data.empresa_id });
    return ingresoToApp(data);
  }
}

export async function deleteIngreso(id) {
  const { error } = await supabase.from('ingresos').delete().eq('id', id);
  if (error) { console.error('deleteIngreso:', error); return; }
  await logAudit({ accion:'eliminar', entidad:'ingreso', entidadId:id });
}

/* ── Bulk delete ingresos TAS ─────────────────────────────── */
// Delete ingresos with no cobros and no fecha_ficticia
export async function deleteTASsinActividad(empresaId) {
  // Get all ingreso ids for this empresa
  const { data: todos } = await supabase.from('ingresos').select('id, fecha_ficticia').eq('empresa_id', empresaId);
  if (!todos?.length) return { deleted: 0 };
  // Get ingreso ids that have cobros
  const ids = todos.map(r => r.id);
  const { data: cobrosData } = await supabase.from('cobros').select('ingreso_id').in('ingreso_id', ids);
  const conCobros = new Set((cobrosData || []).map(c => c.ingreso_id));
  // Filter: no cobros AND no fecha_ficticia
  const toDelete = todos.filter(r => !conCobros.has(r.id) && !r.fecha_ficticia).map(r => r.id);
  if (!toDelete.length) return { deleted: 0 };
  const { error } = await supabase.from('ingresos').delete().in('id', toDelete);
  if (error) { console.error('deleteTASsinActividad:', error); return { deleted: 0 }; }
  return { deleted: toDelete.length };
}

// Delete ALL ingresos + cobros + invoice_ingresos for this empresa
export async function deleteTASTodo(empresaId) {
  // 1. Get all ingreso ids
  const { data: todos } = await supabase.from('ingresos').select('id').eq('empresa_id', empresaId);
  if (!todos?.length) return { deleted: 0 };
  const ids = todos.map(r => r.id);
  // 2. Delete cobros
  await supabase.from('cobros').delete().in('ingreso_id', ids);
  // 3. Delete invoice_ingresos
  await supabase.from('invoice_ingresos').delete().in('ingreso_id', ids);
  // 4. Delete ingresos
  const { error } = await supabase.from('ingresos').delete().in('id', ids);
  if (error) { console.error('deleteTASTodo:', error); return { deleted: 0 }; }
  return { deleted: ids.length };
}

export async function updateIngresoField(id, fields) {
  // Audit wrap (light): registra edición a nivel campo
  await logAudit({ accion:'editar', entidad:'ingreso', entidadId:id, contexto:{ campos: Object.keys(fields||{}) } });

  const dbFields = {};
  if ('fechaFicticia' in fields) dbFields.fecha_ficticia = fields.fechaFicticia || null;
  if ('diasCredito' in fields) dbFields.dias_credito = fields.diasCredito;
  if ('fechaVencimiento' in fields) dbFields.fecha_vencimiento = fields.fechaVencimiento || null;
  if ('concepto' in fields) dbFields.concepto = fields.concepto;
  if ('categoria' in fields) dbFields.categoria = fields.categoria;
  if ('segmento' in fields) dbFields.segmento = fields.segmento || null;
  if ('fechaContable' in fields) dbFields.fecha_contable = fields.fechaContable || null;
  if ('folio' in fields) dbFields.folio = fields.folio || null;
  if ('oculta' in fields) dbFields.oculta = fields.oculta;
  const { error } = await supabase.from('ingresos').update(dbFields).eq('id', id);
  if (error) console.error('updateIngresoField:', error);
}

/* ── Cobros ──────────────────────────────────────────────────── */
export async function fetchCobros(empresaId) {
  if (empresaId) {
    // Traer IDs de ingresos paginados (puede haber >1000)
    const ingRes = await fetchAllPaginated(() =>
      supabase.from('ingresos').select('id').eq('empresa_id', empresaId)
    );
    if (ingRes.error) { console.error('fetchCobros(ingresos):', ingRes.error); return []; }
    const ids = (ingRes.data || []).map(r => r.id);
    if (ids.length === 0) return [];

    // Traer cobros en chunks de 200 IDs para no exceder límite de URL
    const CHUNK = 200;
    let allCobros = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const res = await fetchAllPaginated(() =>
        supabase.from('cobros').select('*').in('ingreso_id', slice).order('fecha_cobro', { ascending: false })
      );
      if (res.error) { console.error('fetchCobros(chunk):', res.error); continue; }
      allCobros = allCobros.concat(res.data || []);
    }
    return allCobros.map(r => ({ id: r.id, ingresoId: r.ingreso_id, monto: +r.monto || 0, fechaCobro: r.fecha_cobro || '', notas: r.notas || '', tipo: r.tipo || 'realizado', banco: r.banco || '' }));
  }
  // Sin filtro de empresa: paginado simple
  const res = await fetchAllPaginated(() =>
    supabase.from('cobros').select('*').order('fecha_cobro', { ascending: false })
  );
  if (res.error) { console.error('fetchCobros:', res.error); return []; }
  return (res.data || []).map(r => ({ id: r.id, ingresoId: r.ingreso_id, monto: +r.monto || 0, fechaCobro: r.fecha_cobro || '', notas: r.notas || '', tipo: r.tipo || 'realizado', banco: r.banco || '' }));
}

export async function insertCobro(c) {
  const _auditEmp = c?.empresaId;

  const row = {
    ingreso_id: c.ingresoId,
    monto: c.monto,
    fecha_cobro: c.fechaCobro || null,
    notas: c.notas || '',
    tipo: c.tipo || 'realizado',
    banco: c.banco || null,
  };
  const { data, error } = await supabase.from('cobros').insert(row).select().single();
  if (error) { console.error('insertCobro:', error); return c; }
  return {
    id: data.id,
    ingresoId: data.ingreso_id,
    monto: +data.monto,
    fechaCobro: data.fecha_cobro || '',
    notas: data.notas || '',
    tipo: data.tipo || 'realizado',
    banco: data.banco || '',
  };
}

export async function deleteCobro(id) {
  const { error } = await supabase.from('cobros').delete().eq('id', id);
  if (error) { console.error('deleteCobro:', error); return; }
  await logAudit({ accion:'eliminar', entidad:'cobro', entidadId:id });
}

export async function updateCobro(id, fields) {
  await logAudit({ accion:'editar', entidad:'cobro', entidadId:id, contexto:{ campos: Object.keys(fields||{}) } });

  const row = {};
  if ('monto'      in fields) row.monto       = +fields.monto;
  if ('fechaCobro' in fields) row.fecha_cobro  = fields.fechaCobro;
  if ('banco'      in fields) row.banco        = fields.banco;
  if ('notas'      in fields) row.notas        = fields.notas;
  const { error } = await supabase.from('cobros').update(row).eq('id', id);
  if (error) console.error('updateCobro:', error);
}

/* ── Invoice-Ingresos ────────────────────────────────────────── */
export async function fetchInvoiceIngresos(empresaId) {
  if (empresaId) {
    // Traer IDs de invoices paginados
    const invRes = await fetchAllPaginated(() =>
      supabase.from('invoices').select('id').eq('empresa_id', empresaId)
    );
    if (invRes.error) { console.error('fetchInvoiceIngresos(invoices):', invRes.error); return []; }
    const ids = (invRes.data || []).map(r => r.id);
    if (ids.length === 0) return [];

    // Traer invoice_ingresos en chunks de 200 IDs
    const CHUNK = 200;
    let all = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const res = await fetchAllPaginated(() =>
        supabase.from('invoice_ingresos').select('*').in('invoice_id', slice)
      );
      if (res.error) { console.error('fetchInvoiceIngresos(chunk):', res.error); continue; }
      all = all.concat(res.data || []);
    }
    return all.map(r => ({ id: r.id, invoiceId: r.invoice_id, ingresoId: r.ingreso_id, montoAsignado: +r.monto_asignado || 0 }));
  }
  // Sin filtro: paginado simple
  const res = await fetchAllPaginated(() =>
    supabase.from('invoice_ingresos').select('*')
  );
  if (res.error) { console.error('fetchInvoiceIngresos:', res.error); return []; }
  return (res.data || []).map(r => ({
    id: r.id,
    invoiceId: r.invoice_id,
    ingresoId: r.ingreso_id,
    montoAsignado: +r.monto_asignado || 0,
  }));
}

export async function upsertInvoiceIngreso(item) {
  const row = { invoice_id: item.invoiceId, ingreso_id: item.ingresoId, monto_asignado: item.montoAsignado };
  if (item.id && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(item.id)) {
    const { data, error } = await supabase.from('invoice_ingresos').update(row).eq('id', item.id).select().single();
    if (error) { console.error('updateInvoiceIngreso:', error); return item; }
    return { id: data.id, invoiceId: data.invoice_id, ingresoId: data.ingreso_id, montoAsignado: +data.monto_asignado };
  } else {
    const { data, error } = await supabase.from('invoice_ingresos').insert(row).select().single();
    if (error) { console.error('insertInvoiceIngreso:', error); return item; }
    return { id: data.id, invoiceId: data.invoice_id, ingresoId: data.ingreso_id, montoAsignado: +data.monto_asignado };
  }
}

export async function deleteInvoiceIngreso(id) {
  const { error } = await supabase.from('invoice_ingresos').delete().eq('id', id);
  if (error) console.error('deleteInvoiceIngreso:', error);
}

/* ── Categorías Ingreso ──────────────────────────────────────── */
export async function fetchCategoriasIngreso(empresaId) {
  let q = supabase.from('categorias_ingreso').select('*').order('nombre');
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q;
  if (error) { console.error('fetchCategoriasIngreso:', error); return []; }
  return (data || []).map(r => ({ id: r.id, nombre: r.nombre }));
}

export async function upsertCategoriaIngreso(nombre) {
  const { data, error } = await supabase.from('categorias_ingreso').upsert({ nombre }, { onConflict: 'nombre' }).select().single();
  if (error) { console.error('upsertCategoriaIngreso:', error); return null; }
  return { id: data.id, nombre: data.nombre };
}

export async function deleteCategoriaIngreso(id) {
  const { error } = await supabase.from('categorias_ingreso').delete().eq('id', id);
  if (error) console.error('deleteCategoriaIngreso:', error);
}

/* ── Clientes ────────────────────────────────────────────────── */
const clienteToApp = (r) => ({
  id: r.id,
  nombre: r.nombre || '',
  rfc: r.rfc || '',
  moneda: r.moneda || 'MXN',
  diasCredito: +r.dias_credito || 30,
  contacto: r.contacto || '',
  telefono: r.telefono || '',
  email: r.email || '',
  notas: r.notas || '',
  activo: r.activo !== false,
  empresaId: r.empresa_id || null,
});

const clienteToDB = (c) => ({
  id: c.id,
  nombre: c.nombre,
  rfc: c.rfc || '',
  moneda: c.moneda || 'MXN',
  dias_credito: c.diasCredito || 30,
  contacto: c.contacto || '',
  telefono: c.telefono || '',
  email: c.email || '',
  notas: c.notas || '',
  activo: c.activo !== false,
  empresa_id: c.empresaId || null,
});

export async function fetchClientes(empresaId) {
  let q = supabase.from('clientes').select('*').order('nombre');
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q;
  if (error) { console.error('fetchClientes:', error); return []; }
  return (data || []).map(clienteToApp);
}

export async function upsertCliente(cliente) {
  const row = clienteToDB(cliente);
  if (row.id && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(row.id)) {
    const { id, ...rest } = row;
    const { data, error } = await supabase.from('clientes').update(rest).eq('id', id).select().single();
    if (error) { console.error('upsertCliente:', error); return cliente; }
    return clienteToApp(data);
  } else {
    const { id, ...rest } = row;
    const { data, error } = await supabase.from('clientes').insert(rest).select().single();
    if (error) { console.error('insertCliente:', error); return cliente; }
    return clienteToApp(data);
  }
}

export async function deleteCliente(id) {
  const { error } = await supabase.from('clientes').delete().eq('id', id);
  if (error) console.error('deleteCliente:', error);
}

/* ── Por Facturar ────────────────────────────────────────────────────── */
export async function fetchPorFacturar(empresaId) {
  const { data, error } = await supabase.from('por_facturar')
    .select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
  if (error) { console.error('fetchPorFacturar:', error); return []; }
  return (data || []).map(r => ({
    id: r.id,
    empresaId: r.empresa_id,
    cliente: r.cliente || '',
    concepto: r.concepto || '',
    importe: +r.importe || 0,
    moneda: r.moneda || 'MXN',
    notas: r.notas || '',
    numOs: r.num_os || '',
    fechaVenta: r.fecha_venta || '',
    destino: r.destino || '',
    createdAt: r.created_at || '',
  }));
}

export async function insertPorFacturar(r) {
  const row = {
    empresa_id: r.empresaId,
    cliente: r.cliente,
    concepto: r.concepto || '',
    importe: +r.importe || 0,
    moneda: r.moneda || 'MXN',
    notas: r.notas || '',
    num_os: r.numOs || null,
    fecha_venta: r.fechaVenta || null,
    destino: r.destino || null,
  };
  const { data, error } = await supabase.from('por_facturar').insert(row).select().single();
  if (error) { console.error('insertPorFacturar:', error); return null; }
  await logAudit({ accion:'crear', entidad:'por_facturar', entidadId:data.id, empresaId:r?.empresaId });
  return { id: data.id, ...r };
}

export async function updatePorFacturar(id, fields) {
  await logAudit({ accion:'editar', entidad:'por_facturar', entidadId:id, contexto:{ campos: Object.keys(fields||{}) } });

  const row = {};
  if ('cliente'    in fields) row.cliente     = fields.cliente;
  if ('concepto'   in fields) row.concepto    = fields.concepto;
  if ('importe'    in fields) row.importe     = +fields.importe;
  if ('moneda'     in fields) row.moneda      = fields.moneda;
  if ('notas'      in fields) row.notas       = fields.notas;
  if ('numOs'      in fields) row.num_os      = fields.numOs || null;
  if ('fechaVenta' in fields) row.fecha_venta = fields.fechaVenta || null;
  if ('destino'    in fields) row.destino     = fields.destino || null;
  const { error } = await supabase.from('por_facturar').update(row).eq('id', id);
  if (error) console.error('updatePorFacturar:', error);
}

export async function deletePorFacturar(id) {
  const { error } = await supabase.from('por_facturar').delete().eq('id', id);
  if (error) { console.error('deletePorFacturar:', error); return; }
  await logAudit({ accion:'eliminar', entidad:'por_facturar', entidadId:id });
}

export async function bulkInsertPorFacturar(rows) {
  const dbRows = rows.map(r => ({
    empresa_id: r.empresaId,
    cliente: r.cliente,
    concepto: r.concepto || '',
    importe: +r.importe || 0,
    moneda: r.moneda || 'MXN',
    notas: r.notas || '',
    num_os: r.numOs || null,
    fecha_venta: r.fechaVenta || null,
    destino: r.destino || null,
  }));
  // Use upsert with merge so existing records get destino updated
  const { data, error } = await supabase.from('por_facturar')
    .upsert(dbRows, { onConflict: 'empresa_id,num_os,cliente,fecha_venta', ignoreDuplicates: false })
    .select();
  if (error) { console.error('bulkInsertPorFacturar:', error); return { inserted: 0, error }; }
  await logAudit({ accion:'importar', entidad:'por_facturar', entidadId:null, contexto:{ count: (data||[]).length, modo:'upsert' } });
  return { inserted: (data || []).length };
}

// Insert plano (sin upsert) — usado por el flujo de Conciliación donde el matching
// ya se hace en el cliente con llave (num_os, cliente) y NO queremos que el onConflict
// del upsert (que incluye fecha_venta) decida por nosotros.
export async function bulkInsertPorFacturarPlain(rows) {
  const dbRows = rows.map(r => ({
    empresa_id: r.empresaId,
    cliente: r.cliente,
    concepto: r.concepto || '',
    importe: +r.importe || 0,
    moneda: r.moneda || 'MXN',
    notas: r.notas || '',
    num_os: r.numOs || null,
    fecha_venta: r.fechaVenta || null,
    destino: r.destino || null,
  }));
  const { data, error } = await supabase.from('por_facturar').insert(dbRows).select();
  if (error) { console.error('bulkInsertPorFacturarPlain:', error); return { inserted: 0, data: [], error }; }
  await logAudit({ accion:'conciliar_insert', entidad:'por_facturar', entidadId:null, contexto:{ count: (data||[]).length } });
  return { inserted: (data || []).length, data: data || [] };
}

/* ── Financiamientos ─────────────────────────────────────────────── */
export async function fetchFinanciamientos(empresaId) {
  let q = supabase.from('financiamientos').select('*').order('fecha_inicio');
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q;
  if (error) { console.error('fetchFinanciamientos:', error); return []; }
  return (data||[]).map(r => ({
    id: r.id,
    empresaId: r.empresa_id,
    nombre: r.nombre || '',
    concepto: r.concepto || '',
    moneda: r.moneda || 'MXN',
    montoMensual: +r.monto_mensual || 0,
    fechaInicio: r.fecha_inicio || '',
    fechaFin: r.fecha_fin || '',
    diaPago: r.dia_pago || 15,
    activo: r.activo !== false,
    notas: r.notas || '',
  }));
}

export async function insertFinanciamiento(f) {
  const _auditEmp = f?.empresaId;

  const row = {
    empresa_id: f.empresaId,
    nombre: f.nombre || '',
    concepto: f.concepto || '',
    moneda: f.moneda || 'MXN',
    monto_mensual: +f.montoMensual || 0,
    fecha_inicio: f.fechaInicio || null,
    fecha_fin: f.fechaFin || null,
    dia_pago: +f.diaPago || 15,
    activo: f.activo !== false,
    notas: f.notas || '',
  };
  const { data, error } = await supabase.from('financiamientos').insert(row).select().single();
  if (error) { console.error('insertFinanciamiento:', error); return null; }
  await logAudit({ accion:'crear', entidad:'financiamiento', entidadId:data.id, empresaId:_auditEmp });
  return { id: data.id, ...f };
}

export async function updateFinanciamiento(id, fields) {
  await logAudit({ accion:'editar', entidad:'financiamiento', entidadId:id, contexto:{ campos: Object.keys(fields||{}) } });

  const map = { nombre:'nombre', concepto:'concepto', moneda:'moneda', montoMensual:'monto_mensual',
    fechaInicio:'fecha_inicio', fechaFin:'fecha_fin', diaPago:'dia_pago', activo:'activo', notas:'notas' };
  const row = {};
  Object.entries(fields).forEach(([k,v]) => { if (map[k]) row[map[k]] = v; });
  const { error } = await supabase.from('financiamientos').update(row).eq('id', id);
  if (error) console.error('updateFinanciamiento:', error);
}

export async function deleteFinanciamiento(id) {
  await logAudit({ accion:'eliminar', entidad:'financiamiento', entidadId:id });

  const { error } = await supabase.from('financiamientos').delete().eq('id', id);
  if (error) console.error('deleteFinanciamiento:', error);
}

export async function fetchFinanciamientoPagos(empresaId) {
  // Fetch all pagos for this empresa's financiamientos
  const fins = await fetchFinanciamientos(empresaId);
  if (!fins.length) return [];
  const ids = fins.map(f => f.id);
  // Paginar en chunks por si llegan a ser muchos
  const CHUNK = 200;
  let all = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const res = await fetchAllPaginated(() =>
      supabase.from('financiamiento_pagos').select('*').in('financiamiento_id', slice).order('fecha_pago')
    );
    if (res.error) { console.error('fetchFinanciamientoPagos(chunk):', res.error); continue; }
    all = all.concat(res.data || []);
  }
  return all.map(r => ({
    id: r.id,
    financiamientoId: r.financiamiento_id,
    fechaPago: r.fecha_pago || '',
    monto: +r.monto || 0,
    notas: r.notas || '',
  }));
}

export async function insertFinanciamientoPago(p) {
  const row = {
    financiamiento_id: p.financiamientoId,
    fecha_pago: p.fechaPago || null,
    monto: +p.monto || 0,
    notas: p.notas || '',
  };
  const { data, error } = await supabase.from('financiamiento_pagos').insert(row).select().single();
  if (error) { console.error('insertFinanciamientoPago:', error); return null; }
  return { id: data.id, ...p };
}

export async function deleteFinanciamientoPago(id) {
  const { error } = await supabase.from('financiamiento_pagos').delete().eq('id', id);
  if (error) console.error('deleteFinanciamientoPago:', error);
}

/* ── Tarjetas de Crédito ─────────────────────────────────────────── */
export async function fetchTarjetas(empresaId) {
  let q = supabase.from('tarjetas_credito').select('*').order('banco');
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q;
  if (error) { console.error('fetchTarjetas:', error); return []; }
  return (data||[]).map(r => ({
    id: r.id, empresaId: r.empresa_id, banco: r.banco||'',
    titular: r.titular||'', contrato: r.contrato||'',
    limite: +r.limite||0, saldoActual: +r.saldo_actual||0,
    fechaCorte: r.fecha_corte||'', activo: r.activo!==false, notas: r.notas||'',
  }));
}

export async function updateTarjetaSaldo(id, saldoActual) {
  const { error } = await supabase.from('tarjetas_credito').update({ saldo_actual: saldoActual }).eq('id', id);
  if (error) console.error('updateTarjetaSaldo:', error);
}

export async function fetchTarjetaMovimientos(empresaId) {
  let q = supabase.from('tarjeta_movimientos').select('*').order('fecha', { ascending: false });
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q;
  if (error) { console.error('fetchTarjetaMovimientos:', error); return []; }
  return (data||[]).map(r => ({
    id: r.id, empresaId: r.empresa_id, tarjetaId: r.tarjeta_id,
    fecha: r.fecha||'', descripcion: r.descripcion||'', monto: +r.monto||0,
    tipo: r.tipo||'', integrante: r.integrante||'', noAutorizacion: r.no_autorizacion||'',
    tarjetaNum: r.tarjeta_num||'', estatus: r.estatus||'', rfc: r.rfc||'',
  }));
}

export async function bulkInsertMovimientos(rows) {
  if (!rows.length) return { inserted: 0, dupes: 0 };
  let inserted = 0, dupes = 0;
  for (const r of rows) {
    const { error } = await supabase.from('tarjeta_movimientos').insert(r);
    if (!error) {
      inserted++;
    } else if (error.code === '23505') {
      dupes++; // unique constraint violation = duplicate
    } else {
      console.error('bulkInsert row error:', error, r);
    }
  }
  return { inserted, dupes };
}

/* ── Pagos Programados ────────────────────────────────────────────── */
export async function fetchProgramados(empresaId) {
  let q = supabase.from('tarjeta_pagos_programados').select('*').order('fecha');
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q;
  if (error) { console.error('fetchProgramados:', error); return []; }
  return (data||[]).map(r => ({
    id: r.id, empresaId: r.empresa_id, tarjetaId: r.tarjeta_id,
    descripcion: r.descripcion||'', monto: r.monto||0,
    fecha: r.fecha||'', categoria: r.categoria||'',
    notas: r.notas||'', estatus: r.estatus||'pendiente',
    serieId: r.serie_id||null,
  }));
}

export async function upsertProgramado(row) {
  const r = {
    empresa_id: row.empresaId, tarjeta_id: row.tarjetaId,
    descripcion: row.descripcion, monto: row.monto,
    fecha: row.fecha, categoria: row.categoria||'',
    notas: row.notas||'', estatus: row.estatus||'pendiente',
    serie_id: row.serieId||null,
  };
  if (row.id) {
    const { error } = await supabase.from('tarjeta_pagos_programados').update(r).eq('id', row.id);
    if (error) console.error('upsertProgramado update:', error);
    return row.id;
  } else {
    const { data, error } = await supabase.from('tarjeta_pagos_programados').insert(r).select().single();
    if (error) console.error('upsertProgramado insert:', error);
    return data?.id;
  }
}

export async function deleteProgramado(id) {
  const { error } = await supabase.from('tarjeta_pagos_programados').delete().eq('id', id);
  if (error) console.error('deleteProgramado:', error);
}

/* ── Reporte Diario: Saldos compartidos por empresa ─────────────── */
export async function fetchReporteSaldos(empresaId) {
  const { data, error } = await supabase
    .from('reporte_saldos')
    .select('*')
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (error) { console.error('fetchReporteSaldos:', error); return null; }
  if (!data) return null;
  return {
    mxn: String(+data.mxn || 0),
    usd: String(+data.usd || 0),
    eur: String(+data.eur || 0),
    updatedAt: data.updated_at || null,
    updatedBy: data.updated_by || null,
  };
}

export async function upsertReporteSaldos(empresaId, saldos, usuario) {
  const row = {
    empresa_id: empresaId,
    mxn: parseFloat(String(saldos.mxn || '0').replace(/[,$]/g, '')) || 0,
    usd: parseFloat(String(saldos.usd || '0').replace(/[,$]/g, '')) || 0,
    eur: parseFloat(String(saldos.eur || '0').replace(/[,$]/g, '')) || 0,
    updated_at: new Date().toISOString(),
    updated_by: usuario || 'desconocido',
  };
  const { error } = await supabase
    .from('reporte_saldos')
    .upsert(row, { onConflict: 'empresa_id' });
  if (error) { console.error('upsertReporteSaldos:', error); return false; }
  return true;
}

/* ── Saldos Bancarios: cuentas, saldos diarios, pendientes ─────── */

// CUENTAS BANCARIAS
export async function fetchCuentasBancarias(empresaId) {
  const { data, error } = await supabase
    .from('cuentas_bancarias')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('activa', true)
    .order('orden', { ascending: true });
  if (error) { console.error('fetchCuentasBancarias:', error); return []; }
  return (data || []).map(r => ({
    id: r.id,
    empresaId: r.empresa_id,
    banco: r.banco || '',
    numeroCuenta: r.numero_cuenta || '',
    tipo: r.tipo || 'corriente',  // 'corriente' | 'inversion'
    moneda: r.moneda || 'MXN',
    reservaMinima: +r.reserva_minima || 0,
    orden: +r.orden || 0,
    activa: r.activa !== false,
  }));
}

export async function upsertCuentaBancaria(cuenta) {
  const row = {
    empresa_id: cuenta.empresaId,
    banco: cuenta.banco,
    numero_cuenta: cuenta.numeroCuenta || null,
    tipo: cuenta.tipo,
    moneda: cuenta.moneda,
    reserva_minima: +cuenta.reservaMinima || 0,
    orden: +cuenta.orden || 0,
    activa: cuenta.activa !== false,
  };
  const isUUID = cuenta.id && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(cuenta.id);
  if (isUUID) {
    const { data, error } = await supabase.from('cuentas_bancarias').update(row).eq('id', cuenta.id).select().single();
    if (error) { console.error('upsertCuentaBancaria update:', error); return null; }
    return data?.id;
  } else {
    const { data, error } = await supabase.from('cuentas_bancarias').insert(row).select().single();
    if (error) { console.error('upsertCuentaBancaria insert:', error); return null; }
    return data?.id;
  }
}

export async function deleteCuentaBancaria(id) {
  // Soft delete: marcamos activa=false para no perder histórico
  const { error } = await supabase.from('cuentas_bancarias').update({ activa: false }).eq('id', id);
  if (error) console.error('deleteCuentaBancaria:', error);
}

// SALDOS DIARIOS (un registro por cuenta+fecha+momento)
export async function fetchSaldosDiarios(empresaId, fecha, momento) {
  let q = supabase.from('saldos_diarios').select('*').eq('empresa_id', empresaId);
  if (fecha) q = q.eq('fecha', fecha);
  if (momento) q = q.eq('momento', momento);
  const { data, error } = await q;
  if (error) { console.error('fetchSaldosDiarios:', error); return []; }
  return (data || []).map(r => ({
    id: r.id,
    cuentaId: r.cuenta_id,
    empresaId: r.empresa_id,
    fecha: r.fecha,
    momento: r.momento || 'inicio',
    saldoReal: +r.saldo_real || 0,
    movsPendientes: +r.movs_pendientes || 0,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  }));
}

export async function upsertSaldoDiario(saldo, usuario) {
  const row = {
    cuenta_id: saldo.cuentaId,
    empresa_id: saldo.empresaId,
    fecha: saldo.fecha,
    momento: saldo.momento || 'inicio',
    saldo_real: +saldo.saldoReal || 0,
    movs_pendientes: +saldo.movsPendientes || 0,
    updated_at: new Date().toISOString(),
    updated_by: usuario || 'desconocido',
  };
  const { error } = await supabase
    .from('saldos_diarios')
    .upsert(row, { onConflict: 'cuenta_id,fecha,momento' });
  if (error) { console.error('upsertSaldoDiario:', error); return false; }
  return true;
}

// HISTÓRICO: lista de fechas+momento con saldos para una empresa
export async function fetchFechasHistoricoSaldos(empresaId, desde, hasta) {
  let q = supabase
    .from('saldos_diarios')
    .select('fecha, momento, updated_at, updated_by')
    .eq('empresa_id', empresaId)
    .order('fecha', { ascending: false });
  if (desde) q = q.gte('fecha', desde);
  if (hasta) q = q.lte('fecha', hasta);
  const { data, error } = await q;
  if (error) { console.error('fetchFechasHistoricoSaldos:', error); return []; }
  // Agrupar por fecha+momento
  const map = new Map();
  (data || []).forEach(r => {
    const key = `${r.fecha}__${r.momento || 'inicio'}`;
    if (!map.has(key)) {
      map.set(key, {
        fecha: r.fecha,
        momento: r.momento || 'inicio',
        updatedAt: r.updated_at,
        updatedBy: r.updated_by,
      });
    }
  });
  return Array.from(map.values());
}

/* ── Ingresos del Día (tabla editable del Reporte Diario) ─────────── */

export async function fetchIngresosDia(empresaId, fecha) {
  const { data, error } = await supabase
    .from('ingresos_diarios')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('fecha', fecha)
    .order('orden', { ascending: true });
  if (error) { console.error('fetchIngresosDia:', error); return []; }
  return (data || []).map(r => ({
    id: r.id,
    empresaId: r.empresa_id,
    fecha: r.fecha,
    rubro: r.rubro || '',
    cliente: r.cliente || '',
    concepto: r.concepto || '',
    montoMXN: +r.monto_mxn || 0,
    montoUSD: +r.monto_usd || 0,
    montoEUR: +r.monto_eur || 0,
    orden: +r.orden || 0,
    confirmado: r.confirmado !== false,  // default true si null (retro-compat)
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  }));
}

export async function upsertIngresoDia(ingreso, usuario) {
  const row = {
    empresa_id: ingreso.empresaId,
    fecha: ingreso.fecha,
    rubro: ingreso.rubro || '',
    cliente: ingreso.cliente || '',
    concepto: ingreso.concepto || '',
    monto_mxn: +ingreso.montoMXN || 0,
    monto_usd: +ingreso.montoUSD || 0,
    monto_eur: +ingreso.montoEUR || 0,
    orden: +ingreso.orden || 0,
    confirmado: ingreso.confirmado !== false,  // default true
    updated_at: new Date().toISOString(),
    updated_by: usuario || 'desconocido',
  };
  const isUUID = ingreso.id && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(ingreso.id);
  if (isUUID) {
    const { data, error } = await supabase.from('ingresos_diarios').update(row).eq('id', ingreso.id).select().single();
    if (error) { console.error('upsertIngresoDia update:', error); return null; }
    return data?.id;
  } else {
    const { data, error } = await supabase.from('ingresos_diarios').insert(row).select().single();
    if (error) { console.error('upsertIngresoDia insert:', error); return null; }
    return data?.id;
  }
}

export async function deleteIngresoDia(id) {
  const { error } = await supabase.from('ingresos_diarios').delete().eq('id', id);
  if (error) console.error('deleteIngresoDia:', error);
}

/* ── Cambio de Divisas (4 direcciones fijas por empresa+fecha) ───── */
/* Direcciones: 'USD_MXN', 'MXN_USD', 'EUR_MXN', 'MXN_EUR' */

export async function fetchCambiosDia(empresaId, fecha) {
  const { data, error } = await supabase
    .from('cambios_divisa_diarios')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('fecha', fecha);
  if (error) { console.error('fetchCambiosDia:', error); return []; }
  return (data || []).map(r => ({
    id: r.id,
    empresaId: r.empresa_id,
    fecha: r.fecha,
    direccion: r.direccion,          // 'USD_MXN', 'MXN_USD', 'EUR_MXN', 'MXN_EUR'
    montoVendido: +r.monto_vendido || 0,
    montoComprado: +r.monto_comprado || 0,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  }));
}

export async function upsertCambioDia({ empresaId, fecha, direccion, montoVendido, montoComprado }, usuario) {
  // upsert por (empresa_id, fecha, direccion)
  const row = {
    empresa_id: empresaId,
    fecha,
    direccion,
    monto_vendido: +montoVendido || 0,
    monto_comprado: +montoComprado || 0,
    updated_at: new Date().toISOString(),
    updated_by: usuario || 'desconocido',
  };
  const { data, error } = await supabase
    .from('cambios_divisa_diarios')
    .upsert(row, { onConflict: 'empresa_id,fecha,direccion' })
    .select()
    .single();
  if (error) { console.error('upsertCambioDia:', error); return null; }
  return data?.id;
}

export async function deleteCambioDia(empresaId, fecha, direccion) {
  const { error } = await supabase
    .from('cambios_divisa_diarios')
    .delete()
    .eq('empresa_id', empresaId)
    .eq('fecha', fecha)
    .eq('direccion', direccion);
  if (error) console.error('deleteCambioDia:', error);
}

/* ── Reconstrucción de saldos por fecha histórica ────────────────────
   Suma los saldos del momento "inicio" de cada cuenta activa, agrupados
   por moneda. Útil para reconstruir el estado de un día pasado. */
export async function fetchSaldosTotalesPorFecha(empresaId, fecha) {
  // 1. Obtener cuentas activas
  const cuentas = await fetchCuentasBancarias(empresaId);
  if (cuentas.length === 0) return { mxn: 0, usd: 0, eur: 0, hayDatos: false };
  // 2. Saldos del día (momento 'inicio')
  const saldosDia = await fetchSaldosDiarios(empresaId, fecha, 'inicio');
  if (saldosDia.length === 0) return { mxn: 0, usd: 0, eur: 0, hayDatos: false };
  // 3. Agrupar por moneda
  const totales = { mxn: 0, usd: 0, eur: 0 };
  saldosDia.forEach(saldo => {
    const cuenta = cuentas.find(c => c.id === saldo.cuentaId);
    if (!cuenta) return;
    const monedaKey = (cuenta.moneda || 'MXN').toLowerCase();
    if (totales[monedaKey] !== undefined) {
      totales[monedaKey] += (+saldo.saldoReal || 0);
    }
  });
  return { ...totales, hayDatos: true };
}

/* ── Snapshots de Saldos del Reporte Diario por Fecha ───────────────
   Guarda el saldo MXN/USD/EUR usado como saldo inicial en cada día del
   Reporte Diario. Permite herencia día-a-día y edición histórica. */

export async function fetchSaldoReporteDia(empresaId, fecha) {
  const { data, error } = await supabase
    .from('saldos_reporte_dia')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('fecha', fecha)
    .maybeSingle();
  if (error) { console.error('fetchSaldoReporteDia:', error); return null; }
  if (!data) return null;
  return {
    mxn: String(+data.mxn || 0),
    usd: String(+data.usd || 0),
    eur: String(+data.eur || 0),
    updatedAt: data.updated_at || null,
    updatedBy: data.updated_by || null,
  };
}

export async function upsertSaldoReporteDia(empresaId, fecha, saldos, usuario) {
  const row = {
    empresa_id: empresaId,
    fecha,
    mxn: parseFloat(String(saldos.mxn || '0').replace(/[,$]/g, '')) || 0,
    usd: parseFloat(String(saldos.usd || '0').replace(/[,$]/g, '')) || 0,
    eur: parseFloat(String(saldos.eur || '0').replace(/[,$]/g, '')) || 0,
    updated_at: new Date().toISOString(),
    updated_by: usuario || 'desconocido',
  };
  const { error } = await supabase
    .from('saldos_reporte_dia')
    .upsert(row, { onConflict: 'empresa_id,fecha' });
  if (error) { console.error('upsertSaldoReporteDia:', error); return false; }
  return true;
}

// Encuentra el saldo más reciente anterior a una fecha (para herencia)
export async function fetchUltimoSaldoReporteAntes(empresaId, fecha) {
  const { data, error } = await supabase
    .from('saldos_reporte_dia')
    .select('*')
    .eq('empresa_id', empresaId)
    .lt('fecha', fecha)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.error('fetchUltimoSaldoReporteAntes:', error); return null; }
  if (!data) return null;
  return {
    fecha: data.fecha,
    mxn: +data.mxn || 0,
    usd: +data.usd || 0,
    eur: +data.eur || 0,
  };
}

// Para calcular el "saldo final" de un día anterior necesitamos sumarle/restarle 
// los ingresos, cambios y pagos de ese día. Esta función obtiene los ingresos y cambios.
export async function fetchMovimientosDia(empresaId, fecha) {
  const [ingresos, cambios] = await Promise.all([
    fetchIngresosDia(empresaId, fecha),
    fetchCambiosDia(empresaId, fecha),
  ]);
  return { ingresos, cambios };
}

/* ── Sugerencias para autocompletado de Ingresos del Día ──────────
   Trae todos los valores únicos de rubro/cliente/concepto del histórico
   de ingresos de la empresa, para autocompletar al capturar nuevos. */
export async function fetchSugerenciasIngresos(empresaId) {
  const { data, error } = await supabase
    .from('ingresos_diarios')
    .select('rubro,cliente,concepto')
    .eq('empresa_id', empresaId);
  if (error) { console.error('fetchSugerenciasIngresos:', error); return { rubros: [], clientes: [], conceptos: [] }; }
  const rubros = new Set();
  const clientes = new Set();
  const conceptos = new Set();
  (data || []).forEach(r => {
    if (r.rubro && String(r.rubro).trim()) rubros.add(String(r.rubro).trim());
    if (r.cliente && String(r.cliente).trim()) clientes.add(String(r.cliente).trim());
    if (r.concepto && String(r.concepto).trim()) conceptos.add(String(r.concepto).trim());
  });
  // Ordenar alfabéticamente
  return {
    rubros: [...rubros].sort((a, b) => a.localeCompare(b, 'es')),
    clientes: [...clientes].sort((a, b) => a.localeCompare(b, 'es')),
    conceptos: [...conceptos].sort((a, b) => a.localeCompare(b, 'es')),
  };
}

/* ── Audit log (light) ──────────────────────────────────────────────
   Registra acciones del usuario contra entidades de dinero. Versión
   light: quién, cuándo, qué tipo de acción, sobre qué entidad/id. NO
   guarda diff antes/después (eso es la versión completa, postergada).

   Uso: await logAudit({ user, accion: 'crear'|'editar'|'eliminar',
                         entidad: 'ingreso'|'cobro'|..., entidadId, contexto? })

   Fail-silent: si el insert al log falla, NO interrumpe la operación
   principal. Mejor perder un log que romper una transacción de negocio. */
let _auditUser = null;
export function setAuditUser(user) { _auditUser = user || null; }

export async function logAudit({ user, accion, entidad, entidadId, empresaId, contexto }) {
  try {
    const u = user || _auditUser;
    if (!u) return;
    const row = {
      user_id:    u.id || null,
      username:   u.username || null,
      empresa_id: empresaId || null,
      accion:     String(accion || ''),
      entidad:    String(entidad || ''),
      entidad_id: entidadId != null ? String(entidadId) : null,
      contexto:   contexto || null,
    };
    const { error } = await supabase.from('audit_log').insert(row);
    if (error) console.warn('logAudit:', error.message || error);
  } catch (e) {
    console.warn('logAudit exception:', e);
  }
}

export async function fetchAuditLog({ limit = 200, username, entidad, accion, desde, hasta } = {}) {
  let q = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (username) q = q.eq('username', username);
  if (entidad)  q = q.eq('entidad', entidad);
  if (accion)   q = q.eq('accion', accion);
  if (desde)    q = q.gte('created_at', desde);
  if (hasta)    q = q.lte('created_at', hasta);
  const { data, error } = await q;
  if (error) { console.error('fetchAuditLog:', error); return []; }
  return (data || []).map(r => ({
    id: r.id,
    createdAt: r.created_at,
    userId: r.user_id,
    username: r.username,
    empresaId: r.empresa_id,
    accion: r.accion,
    entidad: r.entidad,
    entidadId: r.entidad_id,
    contexto: r.contexto,
  }));
}


// ═══════════════════════════════════════════════════════════════════
// PRÉSTAMOS BANCARIOS
// Un préstamo por empresa (por ahora). Movimientos registran
// disposiciones (uso del dinero) y pagos (devolución).
// ═══════════════════════════════════════════════════════════════════

export async function fetchPrestamos(empresaId) {
  const { data, error } = await supabase
    .from('prestamos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('activo', true)
    .order('created_at', { ascending: true });
  if (error) { console.error('fetchPrestamos:', error); return []; }
  return (data || []).map(r => ({
    id: r.id,
    empresaId: r.empresa_id,
    banco: r.banco || '',
    cuentaId: r.cuenta_id || null,
    numeroCuenta: r.numero_cuenta || '',
    montoAutorizado: +r.monto_autorizado || 0,
    moneda: r.moneda || 'MXN',
    fechaRecepcion: r.fecha_recepcion,
    concepto: r.concepto || '',
    activo: r.activo !== false,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function upsertPrestamo(p, usuario) {
  const row = {
    empresa_id: p.empresaId,
    banco: p.banco,
    cuenta_id: p.cuentaId || null,
    numero_cuenta: p.numeroCuenta || null,
    monto_autorizado: +p.montoAutorizado || 0,
    moneda: p.moneda || 'MXN',
    fecha_recepcion: p.fechaRecepcion || null,
    concepto: p.concepto || null,
    activo: p.activo !== false,
    updated_by: usuario || 'desconocido',
  };
  const isUUID = p.id && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(p.id);
  if (isUUID) {
    const { data, error } = await supabase.from('prestamos').update(row).eq('id', p.id).select().single();
    if (error) { console.error('upsertPrestamo update:', error); return null; }
    return data?.id;
  } else {
    row.created_by = usuario || 'desconocido';
    const { data, error } = await supabase.from('prestamos').insert(row).select().single();
    if (error) { console.error('upsertPrestamo insert:', error); return null; }
    return data?.id;
  }
}

export async function deletePrestamo(id) {
  // Soft delete
  const { error } = await supabase.from('prestamos').update({ activo: false }).eq('id', id);
  if (error) console.error('deletePrestamo:', error);
}

// MOVIMIENTOS DEL PRÉSTAMO
export async function fetchPrestamoMovimientos(prestamoId) {
  const { data, error } = await supabase
    .from('prestamo_movimientos')
    .select('*')
    .eq('prestamo_id', prestamoId)
    .order('fecha', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) { console.error('fetchPrestamoMovimientos:', error); return []; }
  return (data || []).map(r => ({
    id: r.id,
    prestamoId: r.prestamo_id,
    empresaId: r.empresa_id,
    fecha: r.fecha,
    tipo: r.tipo,            // 'disposicion' | 'pago' | 'inicial'
    monto: +r.monto || 0,    // siempre positivo
    concepto: r.concepto || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function upsertPrestamoMovimiento(m, usuario) {
  const row = {
    prestamo_id: m.prestamoId,
    empresa_id: m.empresaId,
    fecha: m.fecha,
    tipo: m.tipo,
    monto: +m.monto || 0,
    concepto: m.concepto || null,
    updated_by: usuario || 'desconocido',
  };
  const isUUID = m.id && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(m.id);
  if (isUUID) {
    const { data, error } = await supabase.from('prestamo_movimientos').update(row).eq('id', m.id).select().single();
    if (error) { console.error('upsertPrestamoMovimiento update:', error); return null; }
    return data?.id;
  } else {
    row.created_by = usuario || 'desconocido';
    const { data, error } = await supabase.from('prestamo_movimientos').insert(row).select().single();
    if (error) { console.error('upsertPrestamoMovimiento insert:', error); return null; }
    return data?.id;
  }
}

export async function deletePrestamoMovimiento(id) {
  const { error } = await supabase.from('prestamo_movimientos').delete().eq('id', id);
  if (error) console.error('deletePrestamoMovimiento:', error);
}

// Cálculo: monto utilizado = sum(disposiciones) - sum(pagos)
// 'inicial' no afecta porque representa la recepción y el dinero
// está físicamente en la cuenta bancaria.
export function calcularUtilizadoPrestamo(movimientos) {
  let utilizado = 0;
  (movimientos || []).forEach(m => {
    if (m.tipo === 'disposicion') utilizado += +m.monto || 0;
    else if (m.tipo === 'pago')   utilizado -= +m.monto || 0;
  });
  return Math.max(0, utilizado); // no permitir negativos
}


// ═══════════════════════════════════════════════════════════════════
// PLANES DE PAGO A PROVEEDORES
// 3 tablas: planes_pago (cabecera) + plan_facturas (qué cubre) +
//           plan_abonos (cada cuota).
// Todas filtradas por empresa_id (separación TAS / Viajes Libero).
// ═══════════════════════════════════════════════════════════════════

// ─── PLANES (cabecera) ─────────────────────────────────────────────
export async function fetchPlanesPago(empresaId, opciones = {}) {
  const { estado } = opciones;
  let q = supabase.from('planes_pago').select('*').eq('empresa_id', empresaId);
  if (estado) q = q.eq('estado', estado);
  q = q.order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) { console.error('fetchPlanesPago:', error); return []; }
  return (data || []).map(rowToPlan);
}

export async function fetchPlanPagoById(planId) {
  const { data, error } = await supabase
    .from('planes_pago').select('*').eq('id', planId).single();
  if (error) { console.error('fetchPlanPagoById:', error); return null; }
  return data ? rowToPlan(data) : null;
}

export async function upsertPlanPago(plan, usuario) {
  const row = {
    empresa_id: plan.empresaId,
    proveedor: plan.proveedor,
    moneda: plan.moneda || 'MXN',
    monto_total: +plan.montoTotal || 0,
    frecuencia: plan.frecuencia,
    dia_semana: plan.diaSemana ?? null,
    dia_mes: plan.diaMes ?? null,
    monto_abono: +plan.montoAbono || 0,
    num_abonos: +plan.numAbonos || 0,
    fecha_inicio: plan.fechaInicio,
    fecha_liquidacion_estimada: plan.fechaLiquidacionEstimada || null,
    estado: plan.estado || 'activo',
    notas: plan.notas || null,
    updated_by: usuario || 'desconocido',
  };
  const isUUID = plan.id && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(plan.id);
  if (isUUID) {
    const { data, error } = await supabase.from('planes_pago').update(row).eq('id', plan.id).select().single();
    if (error) { console.error('upsertPlanPago update:', error); return null; }
    return data?.id;
  } else {
    row.created_by = usuario || 'desconocido';
    const { data, error } = await supabase.from('planes_pago').insert(row).select().single();
    if (error) { console.error('upsertPlanPago insert:', error); return null; }
    return data?.id;
  }
}

export async function deletePlanPago(id) {
  // Cascada: borra facturas y abonos por FK ON DELETE CASCADE
  const { error } = await supabase.from('planes_pago').delete().eq('id', id);
  if (error) console.error('deletePlanPago:', error);
}

export async function cancelarPlanPago(id, usuario) {
  // Soft cancel: marca como 'cancelado' pero conserva los datos
  const { error } = await supabase.from('planes_pago')
    .update({ estado: 'cancelado', updated_by: usuario || 'desconocido' })
    .eq('id', id);
  if (error) console.error('cancelarPlanPago:', error);
}

// ─── FACTURAS del plan ─────────────────────────────────────────────
export async function fetchFacturasDePlan(planId) {
  const { data, error } = await supabase
    .from('plan_facturas').select('*').eq('plan_id', planId)
    .order('created_at', { ascending: true });
  if (error) { console.error('fetchFacturasDePlan:', error); return []; }
  return (data || []).map(r => ({
    id: r.id,
    planId: r.plan_id,
    empresaId: r.empresa_id,
    invoiceId: r.invoice_id,
    montoInicial: +r.monto_inicial || 0,
    montoAplicado: +r.monto_aplicado || 0,
  }));
}

export async function insertPlanFactura(pf, usuario) {
  const row = {
    plan_id: pf.planId,
    empresa_id: pf.empresaId,
    invoice_id: pf.invoiceId,
    monto_inicial: +pf.montoInicial || 0,
    monto_aplicado: +pf.montoAplicado || 0,
    created_by: usuario || 'desconocido',
    updated_by: usuario || 'desconocido',
  };
  const { data, error } = await supabase.from('plan_facturas').insert(row).select().single();
  if (error) { console.error('insertPlanFactura:', error); return null; }
  return data?.id;
}

export async function deletePlanFactura(id) {
  const { error } = await supabase.from('plan_facturas').delete().eq('id', id);
  if (error) console.error('deletePlanFactura:', error);
}

// ─── ABONOS (cuotas) ───────────────────────────────────────────────
export async function fetchAbonosPorPlan(planId) {
  const { data, error } = await supabase
    .from('plan_abonos').select('*').eq('plan_id', planId)
    .order('numero', { ascending: true });
  if (error) { console.error('fetchAbonosPorPlan:', error); return []; }
  return (data || []).map(rowToAbono);
}

export async function fetchAbonosPorEmpresa(empresaId, opciones = {}) {
  // Para KPIs/popups: trae todos los abonos de planes activos de una empresa
  const { desde, hasta, estados } = opciones;
  let q = supabase.from('plan_abonos').select('*').eq('empresa_id', empresaId);
  if (desde) q = q.gte('fecha_programada', desde);
  if (hasta) q = q.lte('fecha_programada', hasta);
  if (estados && estados.length) q = q.in('estado', estados);
  q = q.order('fecha_programada', { ascending: true });
  const { data, error } = await q;
  if (error) { console.error('fetchAbonosPorEmpresa:', error); return []; }
  return (data || []).map(rowToAbono);
}

export async function upsertAbono(abono, usuario) {
  const row = {
    plan_id: abono.planId,
    empresa_id: abono.empresaId,
    numero: abono.numero,
    fecha_programada: abono.fechaProgramada,
    monto_programado: +abono.montoProgramado || 0,
    estado: abono.estado || 'pendiente',
    pago_id: abono.pagoId || null,
    factura_id_aplicada: abono.facturaIdAplicada || null,
    fecha_pagado: abono.fechaPagado || null,
    monto_pagado: abono.montoPagado != null ? +abono.montoPagado : null,
    notas: abono.notas || null,
    updated_by: usuario || 'desconocido',
  };
  const isUUID = abono.id && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(abono.id);
  if (isUUID) {
    const { data, error } = await supabase.from('plan_abonos').update(row).eq('id', abono.id).select().single();
    if (error) { console.error('upsertAbono update:', error); return null; }
    return data?.id;
  } else {
    row.created_by = usuario || 'desconocido';
    const { data, error } = await supabase.from('plan_abonos').insert(row).select().single();
    if (error) { console.error('upsertAbono insert:', error); return null; }
    return data?.id;
  }
}

export async function deleteAbono(id) {
  const { error } = await supabase.from('plan_abonos').delete().eq('id', id);
  if (error) console.error('deleteAbono:', error);
}

export async function bulkInsertAbonos(abonos, usuario) {
  // Insert masivo cuando se crea el plan (14 abonos de golpe)
  const rows = abonos.map(a => ({
    plan_id: a.planId,
    empresa_id: a.empresaId,
    numero: a.numero,
    fecha_programada: a.fechaProgramada,
    monto_programado: +a.montoProgramado || 0,
    estado: a.estado || 'pendiente',
    notas: a.notas || null,
    created_by: usuario || 'desconocido',
    updated_by: usuario || 'desconocido',
  }));
  const { error } = await supabase.from('plan_abonos').insert(rows);
  if (error) { console.error('bulkInsertAbonos:', error); return false; }
  return true;
}

// ─── Helpers de mapeo ──────────────────────────────────────────────
function rowToPlan(r) {
  return {
    id: r.id,
    empresaId: r.empresa_id,
    proveedor: r.proveedor || '',
    moneda: r.moneda || 'MXN',
    montoTotal: +r.monto_total || 0,
    frecuencia: r.frecuencia,
    diaSemana: r.dia_semana,
    diaMes: r.dia_mes,
    montoAbono: +r.monto_abono || 0,
    numAbonos: +r.num_abonos || 0,
    fechaInicio: r.fecha_inicio,
    fechaLiquidacionEstimada: r.fecha_liquidacion_estimada,
    estado: r.estado || 'activo',
    notas: r.notas || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToAbono(r) {
  return {
    id: r.id,
    planId: r.plan_id,
    empresaId: r.empresa_id,
    numero: r.numero,
    fechaProgramada: r.fecha_programada,
    montoProgramado: +r.monto_programado || 0,
    estado: r.estado,
    pagoId: r.pago_id,
    facturaIdAplicada: r.factura_id_aplicada,
    fechaPagado: r.fecha_pagado,
    montoPagado: r.monto_pagado != null ? +r.monto_pagado : null,
    notas: r.notas || '',
  };
}

// ─── Cálculo: ritmo semanal normalizado por moneda ─────────────────
// Convierte la frecuencia a aporte semanal estándar:
//   semanal    → monto_abono
//   quincenal  → monto_abono / 2
//   mensual    → monto_abono / 4.33
//   personal.  → monto_total restante / semanas hasta liquidación
// Devuelve un objeto {USD: total, MXN: total, EUR: total, detalle: [...]}
export function calcularRitmoSemanal(planesActivos) {
  const SEMANAS_POR_MES = 4.33;
  const totales = { USD: 0, MXN: 0, EUR: 0 };
  const detalle = [];

  (planesActivos || []).forEach(plan => {
    if (plan.estado !== 'activo') return;
    let aporteSemanal = 0;
    if (plan.frecuencia === 'semanal')         aporteSemanal = +plan.montoAbono || 0;
    else if (plan.frecuencia === 'quincenal')  aporteSemanal = (+plan.montoAbono || 0) / 2;
    else if (plan.frecuencia === 'mensual')    aporteSemanal = (+plan.montoAbono || 0) / SEMANAS_POR_MES;
    else if (plan.frecuencia === 'personalizado') {
      // Aproximación: monto restante dividido entre semanas hasta liquidación
      if (plan.fechaLiquidacionEstimada) {
        const hoy = new Date();
        const liq = new Date(plan.fechaLiquidacionEstimada);
        const dias = Math.max(7, Math.round((liq - hoy) / (1000 * 60 * 60 * 24)));
        const semanas = Math.max(1, Math.round(dias / 7));
        aporteSemanal = (+plan.montoTotal || 0) / semanas;
      }
    }
    const moneda = plan.moneda || 'MXN';
    if (totales[moneda] != null) totales[moneda] += aporteSemanal;
    detalle.push({
      planId: plan.id,
      proveedor: plan.proveedor,
      frecuencia: plan.frecuencia,
      montoAbono: +plan.montoAbono || 0,
      moneda,
      aporteSemanal,
    });
  });

  return { totales, detalle };
}


// ─── Marcar abono como pagado (con ajuste de factura aplicada) ──────
// datosPago: { fechaPagado, montoPagado, facturaIdAplicada, notas, estado }
// estado puede ser 'pagado' (monto completo) o 'parcial' (monto menor)
// La factura aplicada del plan se suma el monto pagado a su monto_aplicado
export async function marcarAbonoPagado(abonoId, datosPago, usuario) {
  // 1. Obtener el abono actual para conocer su plan_id y empresa_id
  const { data: abonoActual, error: errFetch } = await supabase
    .from('plan_abonos').select('*').eq('id', abonoId).single();
  if (errFetch || !abonoActual) {
    console.error('marcarAbonoPagado: no se encontró el abono', errFetch);
    return false;
  }

  // 2. Actualizar el abono
  const updates = {
    estado: datosPago.estado || 'pagado',
    fecha_pagado: datosPago.fechaPagado || new Date().toISOString().split('T')[0],
    monto_pagado: +datosPago.montoPagado || 0,
    factura_id_aplicada: datosPago.facturaIdAplicada || null,
    notas: datosPago.notas || abonoActual.notas || null,
    updated_by: usuario || 'desconocido',
  };
  const { error: errUpd } = await supabase
    .from('plan_abonos').update(updates).eq('id', abonoId);
  if (errUpd) {
    console.error('marcarAbonoPagado: error actualizando abono', errUpd);
    return false;
  }

  // 3. Si hay factura aplicada, sumar el monto al monto_aplicado de plan_facturas
  if (datosPago.facturaIdAplicada) {
    const { data: pf, error: errPf } = await supabase
      .from('plan_facturas')
      .select('*')
      .eq('plan_id', abonoActual.plan_id)
      .eq('invoice_id', datosPago.facturaIdAplicada)
      .single();
    if (pf && !errPf) {
      const nuevoAplicado = (+pf.monto_aplicado || 0) + (+datosPago.montoPagado || 0);
      await supabase.from('plan_facturas')
        .update({ monto_aplicado: nuevoAplicado, updated_by: usuario || 'desconocido' })
        .eq('id', pf.id);
    }
  }

  // 4. Si TODOS los abonos del plan ya están pagados, marcar el plan como liquidado
  const { data: todosAbonos } = await supabase
    .from('plan_abonos').select('estado').eq('plan_id', abonoActual.plan_id);
  if (todosAbonos && todosAbonos.length > 0) {
    const pendientes = todosAbonos.filter(a => a.estado !== 'pagado' && a.estado !== 'parcial').length;
    if (pendientes === 0) {
      await supabase.from('planes_pago')
        .update({ estado: 'liquidado', updated_by: usuario || 'desconocido' })
        .eq('id', abonoActual.plan_id);
    }
  }

  return true;
}

// ─── Desmarcar pago (revertir abono a pendiente) ────────────────────
export async function desmarcarAbonoPagado(abonoId, usuario) {
  // 1. Obtener el abono actual para saber cuánto descontar de la factura
  const { data: abonoActual, error: errFetch } = await supabase
    .from('plan_abonos').select('*').eq('id', abonoId).single();
  if (errFetch || !abonoActual) {
    console.error('desmarcarAbonoPagado: no se encontró el abono', errFetch);
    return false;
  }

  // 2. Si había factura aplicada, restar el monto del monto_aplicado
  if (abonoActual.factura_id_aplicada && abonoActual.monto_pagado) {
    const { data: pf } = await supabase
      .from('plan_facturas')
      .select('*')
      .eq('plan_id', abonoActual.plan_id)
      .eq('invoice_id', abonoActual.factura_id_aplicada)
      .single();
    if (pf) {
      const nuevoAplicado = Math.max(0, (+pf.monto_aplicado || 0) - (+abonoActual.monto_pagado || 0));
      await supabase.from('plan_facturas')
        .update({ monto_aplicado: nuevoAplicado, updated_by: usuario || 'desconocido' })
        .eq('id', pf.id);
    }
  }

  // 3. Resetear el abono a pendiente
  const updates = {
    estado: 'pendiente',
    fecha_pagado: null,
    monto_pagado: null,
    factura_id_aplicada: null,
    pago_id: null,
    updated_by: usuario || 'desconocido',
  };
  const { error } = await supabase.from('plan_abonos').update(updates).eq('id', abonoId);
  if (error) {
    console.error('desmarcarAbonoPagado: error', error);
    return false;
  }

  // 4. Si el plan estaba liquidado, volverlo a activo
  await supabase.from('planes_pago')
    .update({ estado: 'activo', updated_by: usuario || 'desconocido' })
    .eq('id', abonoActual.plan_id)
    .eq('estado', 'liquidado');

  return true;
}

// ─── Reagendar abonos siguientes (cuando editas fecha de uno) ───────
// abonosOrdenados: array de abonos del plan (debe estar ordenado por numero asc)
// idDesde: id del abono que cambió - se mueven todos los SIGUIENTES
// deltaDias: cuántos días mover (positivo = adelante, negativo = atrás)
export async function reagendarAbonosSiguientes(abonosOrdenados, idDesde, deltaDias, usuario) {
  const idx = abonosOrdenados.findIndex(a => a.id === idDesde);
  if (idx < 0) return false;
  const siguientes = abonosOrdenados.slice(idx + 1).filter(a => a.estado === 'pendiente' || a.estado === 'atrasado');
  for (const a of siguientes) {
    const d = new Date(a.fechaProgramada + 'T12:00:00');
    d.setDate(d.getDate() + deltaDias);
    const nueva = d.toISOString().split('T')[0];
    await supabase.from('plan_abonos')
      .update({ fecha_programada: nueva, updated_by: usuario || 'desconocido' })
      .eq('id', a.id);
  }
  return true;
}


// ─── Buscar planes activos que contengan una factura específica ─────
// Devuelve array de { plan, planFactura, proximoAbono } con todos los planes
// activos que tengan la factura. Normalmente debe ser 0 o 1, pero
// si por alguna razón hay varios planes activos con la misma factura, los devuelve todos.
export async function buscarPlanesActivosDeFactura(invoiceId, empresaId) {
  // 1. Encontrar plan_facturas que tengan este invoice_id
  const { data: pfs, error: errPf } = await supabase
    .from('plan_facturas').select('*')
    .eq('invoice_id', String(invoiceId))
    .eq('empresa_id', empresaId);
  if (errPf || !pfs || pfs.length === 0) return [];

  // 2. Filtrar por planes activos
  const planIds = [...new Set(pfs.map(pf => pf.plan_id))];
  const { data: planes, error: errPl } = await supabase
    .from('planes_pago').select('*').in('id', planIds).eq('estado', 'activo');
  if (errPl || !planes || planes.length === 0) return [];

  // 3. Para cada plan, traer su próximo abono pendiente
  const resultado = [];
  for (const planRow of planes) {
    const plan = {
      id: planRow.id,
      empresaId: planRow.empresa_id,
      proveedor: planRow.proveedor,
      moneda: planRow.moneda,
      montoTotal: +planRow.monto_total,
      frecuencia: planRow.frecuencia,
      diaSemana: planRow.dia_semana,
      diaMes: planRow.dia_mes,
      montoAbono: +planRow.monto_abono,
      numAbonos: planRow.num_abonos,
      fechaInicio: planRow.fecha_inicio,
      fechaLiquidacionEstimada: planRow.fecha_liquidacion_estimada,
      estado: planRow.estado,
    };
    const { data: abonos } = await supabase
      .from('plan_abonos').select('*')
      .eq('plan_id', planRow.id)
      .in('estado', ['pendiente', 'atrasado'])
      .order('numero', { ascending: true });
    const proximoAbono = (abonos && abonos.length > 0) ? {
      id: abonos[0].id,
      planId: abonos[0].plan_id,
      numero: abonos[0].numero,
      fechaProgramada: abonos[0].fecha_programada,
      montoProgramado: +abonos[0].monto_programado,
      estado: abonos[0].estado,
    } : null;
    const pfDeEstePlan = pfs.find(p => p.plan_id === planRow.id);
    resultado.push({ plan, planFactura: pfDeEstePlan, proximoAbono });
  }
  return resultado;
}
