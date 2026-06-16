import { supabase } from './supabase.js';

/* ── Helpers: convert between DB snake_case and App camelCase ─── */
const toApp = (row) => ({
  id: row.id,
  tipo: row.tipo || 'Factura',
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
  let q = supabase.from('invoices').select('*').order('fecha', { ascending: false });
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q;
  if (error) { console.error('fetchInvoices:', error); return { MXN: [], USD: [], EUR: [] }; }
  const grouped = { MXN: [], USD: [], EUR: [] };
  (data || []).forEach(row => {
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
  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) console.error('deleteInvoice:', error);
}

export async function updateInvoiceField(id, fields) {
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
export async function fetchPayments(empresaId) {
  // Payments linked to invoices of this empresa
  if (empresaId) {
    const { data: invData } = await supabase.from('invoices').select('id').eq('empresa_id', empresaId);
    const ids = (invData || []).map(r => r.id);
    if (ids.length === 0) return [];
    const { data, error } = await supabase.from('payments').select('*').in('invoice_id', ids).order('fecha_pago', { ascending: false });
    if (error) { console.error('fetchPayments:', error); return []; }
    return (data || []).map(r => ({
      id: r.id, invoiceId: r.invoice_id, monto: +r.monto || 0,
      fechaPago: r.fecha_pago || '', notas: r.notas || '', tipo: r.tipo || 'realizado',
      metodoPago: r.metodo_pago || 'banco',  // 'banco' | 'tdc' | 'otro'
    }));
  }
  const { data, error } = await supabase.from('payments').select('*').order('fecha_pago', { ascending: false });
  if (error) { console.error('fetchPayments:', error); return []; }
  return (data || []).map(r => ({
    id: r.id, invoiceId: r.invoice_id, monto: +r.monto || 0,
    fechaPago: r.fecha_pago || '', notas: r.notas || '', tipo: r.tipo || 'realizado',
    metodoPago: r.metodo_pago || 'banco',
  }));
}

export async function insertPayment(p) {
  const row = {
    invoice_id: p.invoiceId, monto: p.monto, fecha_pago: p.fechaPago,
    notas: p.notas || '', tipo: p.tipo || 'realizado',
    metodo_pago: p.metodoPago || 'banco',
  };
  const { data, error } = await supabase.from('payments').insert(row).select().single();
  if (error) { console.error('insertPayment:', error); return p; }
  return {
    id: data.id, invoiceId: data.invoice_id, monto: +data.monto,
    fechaPago: data.fecha_pago, notas: data.notas || '', tipo: data.tipo || 'realizado',
    metodoPago: data.metodo_pago || 'banco',
  };
}

export async function deletePayment(id) {
  const { error } = await supabase.from('payments').delete().eq('id', id);
  if (error) console.error('deletePayment:', error);
}

export async function updatePayment(id, fields) {
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
    return ingresoToApp(data);
  } else {
    const { data, error } = await supabase.from('ingresos').update(row).eq('id', row.id).select().single();
    if (error) { console.error('updateIngreso:', error); return ing; }
    return ingresoToApp(data);
  }
}

export async function deleteIngreso(id) {
  const { error } = await supabase.from('ingresos').delete().eq('id', id);
  if (error) console.error('deleteIngreso:', error);
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
    const { data: ingData } = await supabase.from('ingresos').select('id').eq('empresa_id', empresaId);
    const ids = (ingData || []).map(r => r.id);
    if (ids.length === 0) return [];
    const { data, error } = await supabase.from('cobros').select('*').in('ingreso_id', ids).order('fecha_cobro', { ascending: false });
    if (error) { console.error('fetchCobros:', error); return []; }
    return (data || []).map(r => ({ id: r.id, ingresoId: r.ingreso_id, monto: +r.monto || 0, fechaCobro: r.fecha_cobro || '', notas: r.notas || '', tipo: r.tipo || 'realizado', banco: r.banco || '' }));
  }
  const { data, error } = await supabase.from('cobros').select('*').order('fecha_cobro', { ascending: false });
  if (error) { console.error('fetchCobros:', error); return []; }
  return (data || []).map(r => ({ id: r.id, ingresoId: r.ingreso_id, monto: +r.monto || 0, fechaCobro: r.fecha_cobro || '', notas: r.notas || '', tipo: r.tipo || 'realizado', banco: r.banco || '' }));
}

export async function insertCobro(c) {
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
  if (error) console.error('deleteCobro:', error);
}

export async function updateCobro(id, fields) {
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
    const { data: invData } = await supabase.from('invoices').select('id').eq('empresa_id', empresaId);
    const ids = (invData || []).map(r => r.id);
    if (ids.length === 0) return [];
    const { data, error } = await supabase.from('invoice_ingresos').select('*').in('invoice_id', ids);
    if (error) { console.error('fetchInvoiceIngresos:', error); return []; }
    return (data || []).map(r => ({ id: r.id, invoiceId: r.invoice_id, ingresoId: r.ingreso_id, montoAsignado: +r.monto_asignado || 0 }));
  }
  const { data, error } = await supabase.from('invoice_ingresos').select('*');
  if (error) { console.error('fetchInvoiceIngresos:', error); return []; }
  return (data || []).map(r => ({
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
  return { id: data.id, ...r };
}

export async function updatePorFacturar(id, fields) {
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
  if (error) console.error('deletePorFacturar:', error);
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
  return { inserted: (data || []).length };
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
  return { id: data.id, ...f };
}

export async function updateFinanciamiento(id, fields) {
  const map = { nombre:'nombre', concepto:'concepto', moneda:'moneda', montoMensual:'monto_mensual',
    fechaInicio:'fecha_inicio', fechaFin:'fecha_fin', diaPago:'dia_pago', activo:'activo', notas:'notas' };
  const row = {};
  Object.entries(fields).forEach(([k,v]) => { if (map[k]) row[map[k]] = v; });
  const { error } = await supabase.from('financiamientos').update(row).eq('id', id);
  if (error) console.error('updateFinanciamiento:', error);
}

export async function deleteFinanciamiento(id) {
  const { error } = await supabase.from('financiamientos').delete().eq('id', id);
  if (error) console.error('deleteFinanciamiento:', error);
}

export async function fetchFinanciamientoPagos(empresaId) {
  // Fetch all pagos for this empresa's financiamientos
  const fins = await fetchFinanciamientos(empresaId);
  if (!fins.length) return [];
  const ids = fins.map(f => f.id);
  const { data, error } = await supabase.from('financiamiento_pagos')
    .select('*').in('financiamiento_id', ids).order('fecha_pago');
  if (error) { console.error('fetchFinanciamientoPagos:', error); return []; }
  return (data||[]).map(r => ({
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
