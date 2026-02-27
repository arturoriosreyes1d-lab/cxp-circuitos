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
});

const toDB = (inv) => ({
  id: inv.id,
  tipo: inv.tipo,
  fecha: inv.fecha,
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
  vencimiento: inv.vencimiento,
  estatus: inv.estatus,
  fecha_programacion: inv.fechaProgramacion || '',
  dias_ficticios: inv.diasFicticios || 0,
  referencia: inv.referencia || '',
  notas: inv.notas || '',
  moneda: inv.moneda || 'MXN',
  vo_bo: inv.voBo || false,
  autorizado_direccion: inv.autorizadoDireccion || false,
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
});

/* ── Invoices ────────────────────────────────────────────────── */
export async function fetchInvoices() {
  const { data, error } = await supabase.from('invoices').select('*').order('fecha', { ascending: false });
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
    const isUUID = /^[0-9a-f]{8}-/.test(row.id);
    if (!isUUID) delete row.id;
    return row;
  });
  const { data, error } = await supabase.from('invoices').upsert(rows).select();
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
export async function fetchSuppliers() {
  const { data, error } = await supabase.from('suppliers').select('*').order('nombre');
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
    const isUUID = /^[0-9a-f]{8}-/.test(row.id);
    if (!isUUID) delete row.id;
    return row;
  });
  const { data, error } = await supabase.from('suppliers').upsert(rows).select();
  if (error) { console.error('upsertManySuppliers:', error); return sups; }
  return (data || []).map(supToApp);
}

/* ── Clasificaciones ─────────────────────────────────────────── */
export async function fetchClasificaciones() {
  const { data, error } = await supabase.from('clasificaciones').select('nombre').order('nombre');
  if (error) { console.error('fetchClasificaciones:', error); return []; }
  return (data || []).map(r => r.nombre);
}

export async function saveClasificaciones(list) {
  // Delete all, re-insert
  await supabase.from('clasificaciones').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const rows = list.map(nombre => ({ nombre }));
  const { error } = await supabase.from('clasificaciones').upsert(rows, { onConflict: 'nombre' });
  if (error) console.error('saveClasificaciones:', error);
}
