import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "./supabase.js";

// ─── Iconos como componentes locales (reemplazan lucide-react) ──
// Mantiene la interfaz <Icon size={n} /> para no tocar los call sites.
function makeIcon(emoji) {
  return function Icon({ size = 16, color, style = {} }) {
    return (
      <span
        style={{
          display: "inline-block",
          fontSize: size,
          lineHeight: 1,
          color: color || "inherit",
          ...style,
        }}
      >
        {emoji}
      </span>
    );
  };
}
const Plus = makeIcon("➕");
const Minus = makeIcon("➖");
const Trash2 = makeIcon("🗑");
const ChevronLeft = makeIcon("‹");
const ChevronRight = makeIcon("›");
const Search = makeIcon("🔍");
const Sparkles = makeIcon("✨");
const Eraser = makeIcon("🧹");
const X = makeIcon("✕");
const Check = makeIcon("✓");
const Download = makeIcon("⬇");
const ZoomIn = makeIcon("🔍");
const ZoomOut = makeIcon("🔎");

// ───────────────────────────────────────────────────────────────
// Tipografía — Carlito es un clon métrico-compatible de Calibri
// ───────────────────────────────────────────────────────────────
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400&display=swap";

function useInjectFonts() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONTS_HREF}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTS_HREF;
    document.head.appendChild(link);
  }, []);
}

const FONT = "'Carlito', Calibri, 'Segoe UI', system-ui, sans-serif";

// ── Paleta Office auténtica del Excel
const C = {
  headerBlue: "#1F3864",       // Azul rey — encabezado
  headerBlueDark: "#14274A",   // Borde header (más oscuro)
  lightBlue: "#B4C7E7",         // Totales (Accent 1, Lighter 60%)
  paleBlue: "#D9E1F2",          // Proyección (Accent 1, Lighter 80%)
  green: "#E2EFDA",             // Celdas con dato (Accent 6, Lighter 80%)
  saldoGray: "#E7E6E6",         // Saldo inicial label
  rubroGray: "#D9D9D9",         // Columna Rubro
  gridLine: "#D4D4D4",          // Gridlines
  editing: "#FFF8E1",           // Celda en edición
  text: "#000000",
  textMuted: "#595959",
};

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────
const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

function getMonday(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
  date.setHours(0, 0, 0, 0);
  return date;
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function dayLabel(date) {
  return `${date.getDate()}-${MESES[date.getMonth()]}`;
}

// Formato contable: solo el número (el $ va aparte en la celda)
function fmtAccountingNumber(n) {
  if (!n || n === 0) return "-";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(n));
}
function parseMoney(s) {
  if (s === null || s === undefined) return 0;
  const cleaned = String(s).replace(/[^0-9.\-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ───────────────────────────────────────────────────────────────
// Datos semilla
// ───────────────────────────────────────────────────────────────
const SEED_CLIENTS = [
  ["Transporte", "AEROVIAS DE MEXICO"],
  ["Transporte", "AEROLINEAS ARGENTINAS"],
  ["Transporte", "AEROLITORAL"],
  ["TAS", "ALASKA AIRLINES, INC"],
  ["TAS", "ALAVE SOLUCIONES AEREAS"],
  ["Transporte", "ALLFUN EXCURSIONS"],
  ["TAS", "AMERICAN AIRLINES INC"],
  ["Transporte", "AMERICAN AIRLINES INC"],
  ["Transporte", "BAJA DESERT SERVICES"],
  ["Transporte", "CABOTRAVEL"],
  ["Transporte", "CABOSEASON"],
  ["TAS", "DELTA AIR LINES INC"],
  ["Transporte", "DELTA AIR LINES INC"],
  ["Transporte", "EPE AUTOTRANSPORTES DEL CARIBE"],
  ["Transporte", "FIDEICOMISO F/1596"],
  ["TAS", "SOCIETE AIR FRANCE"],
  ["Transporte", "SOCIETE AIR FRANCE"],
  ["Transporte", "XPLORA RIVIERA"],
  ["Transporte", "SKY AIRLINE PERU, SOCIEDAD ANONIMA"],
  ["TAS", "SKY AIRLINE PERU, SOCIEDAD ANONIMA"],
  ["TAS", "SOUTHWEST AIRLINES CO."],
  ["Transporte", "SOUTHWEST AIRLINES CO."],
  ["Transporte", "TAMARAN RESORTS"],
  ["Transporte", "NADRIA SERVICIOS"],
  ["Transporte", "THE ONE CANCUN AGENCIA DE VIAJES"],
  ["Transporte", "TRANSPORTES BAJA CABOS"],
  ["Transporte", "TRANSPORTE TURISTICO LA QUEBRADA"],
  ["Transporte", "TURISMO Y TRANSPORTACION DEL CARIBE"],
  ["TAS", "UNITED AIRLINES, INC"],
  ["Transporte", "UNITED AIRLINES, INC"],
  ["Transporte", "VIAJES LIBERO"],
  ["Transporte", "PUBLICO GENERAL"],
  ["TAS", "PRESTAMO A BROMELIA-CREDITO BNMX"],
  ["Transporte", "DEV. CIRCUITOS Y OTROS"],
  ["TAS", "OTROS INGRESOS"],
];
function emptyWeek() {
  return {
    saldoInicial: [0, 0, 0, 0, 0],
    rows: SEED_CLIENTS.map(([segmento, cliente], i) => ({
      id: `seed-${i}`, segmento, cliente,
      amounts: [0, 0, 0, 0, 0], concepto: "",
    })),
    planCobranza: [0, 0, 0, 0, 0],
    // Egresos — un objeto indexado por id de proveedor (rubro+índice)
    egresos: {},
    // Importados de CxP — array dinámico de filas, cada una es 1 factura/pago
    // Estructura de cada item: { id, rubro, proveedor, folio, concepto,
    //   amounts: [L,M,X,J,V], paymentId, invoiceId, tipo, importedAt }
    importados: [],
    // Compromisos por día — montos comprometidos a algo
    compromisos: [0, 0, 0, 0, 0],
  };
}
function demoWeek() {
  const w = emptyWeek();
  w.saldoInicial = [1930234.11, 1684806.92, 1601856.11, 1505813.03, 1105813.03];
  const iDev = w.rows.findIndex(r => r.cliente === "DEV. CIRCUITOS Y OTROS");
  if (iDev >= 0) { w.rows[iDev].amounts[0] = 400; w.rows[iDev].concepto = "DEV. OPERADOR VENCES"; }
  const iOtros = w.rows.findIndex(r => r.cliente === "OTROS INGRESOS");
  if (iOtros >= 0) {
    w.rows[iOtros].amounts[0] = 676.8;
    w.rows[iOtros].amounts[1] = 155.47;
    w.rows[iOtros].concepto = "RENDIMIENTOS";
  }
  w.planCobranza = [0, 0, 12200, 1532205.61, 25864];

  // Demo de egresos basado en el screenshot que mostraste
  // Helper para encontrar el id de un proveedor dentro de un rubro
  const findEgresoId = (rubro, proveedor, occurrence = 0) => {
    let count = 0;
    for (let i = 0; i < SEED_EGRESOS.length; i++) {
      const e = SEED_EGRESOS[i];
      if (e.rubro === rubro && e.proveedor.includes(proveedor)) {
        if (count === occurrence) return `eg-${i}`;
        count++;
      }
    }
    return null;
  };
  const setEgreso = (id, amounts, concepto) => {
    if (!id) return;
    w.egresos[id] = { amounts, concepto };
  };

  // Banco Nacional de México — $333,181.70 el viernes
  setEgreso(
    findEgresoId("FINANCIAMIENTOS", "BANCO NACIONAL"),
    [0, 0, 0, 0, 333181.70],
    "PAGO 08 DE 48 - CREDITO BNMX"
  );
  // SAT (TAS) — $200,000 viernes — Impuestos Federales RETENCIONES MES NOV
  setEgreso(
    findEgresoId("IMPUESTOS", "SAT", 0),
    [0, 0, 0, 0, 200000],
    "IMPUESTOS FEDERALES RETENCIONES MES NOV"
  );
  // SAT (Transporte) — $200,000 viernes — Impuestos Federales (IVA / ISR)
  setEgreso(
    findEgresoId("IMPUESTOS", "SAT", 1),
    [0, 0, 0, 0, 200000],
    "IMPUESTOS FEDERALES (IVA / ISR)"
  );

  return w;
}

// ───────────────────────────────────────────────────────────────
// EGRESOS — Lista oficial de rubros, segmentos y proveedores
// Orden = orden visual; cada entrada es { rubro, segmento, proveedor }
// ───────────────────────────────────────────────────────────────
const SEED_EGRESOS = [
  // ── FINANCIAMIENTOS ──
  { rubro: "FINANCIAMIENTOS", segmento: "TRANSPORTE", proveedor: "FINANCIERA TV, SA DE CV, SOFOM, ENR" },
  { rubro: "FINANCIAMIENTOS", segmento: "TRANSPORTE", proveedor: "TRANSPORTES TURÍSTICOS DEL CARIBE SA DE CV" },
  { rubro: "FINANCIAMIENTOS", segmento: "TRANSPORTE", proveedor: "AMSA IDEALASE SA DE CV" },
  { rubro: "FINANCIAMIENTOS", segmento: "TRANSPORTE", proveedor: "LINA PASOS MONGUEL" },
  { rubro: "FINANCIAMIENTOS", segmento: "TRANSPORTE", proveedor: "EMILIO BOLIO PASOS" },
  { rubro: "FINANCIAMIENTOS", segmento: "TRANSPORTE", proveedor: "BANCO NACIONAL DE MÉXICO SA" },
  { rubro: "FINANCIAMIENTOS", segmento: "TRANSPORTE", proveedor: "ANA LUISA BOLIO PASOS" },
  { rubro: "FINANCIAMIENTOS", segmento: "TRANSPORTE", proveedor: "ANA LUISA BOLIO PASOS" },
  { rubro: "FINANCIAMIENTOS", segmento: "TRANSPORTE", proveedor: "ANA LUISA BOLIO PASOS" },
  { rubro: "FINANCIAMIENTOS", segmento: "TRANSPORTE", proveedor: "ANA LUISA BOLIO PASOS" },
  { rubro: "FINANCIAMIENTOS", segmento: "TRANSPORTE", proveedor: "KONFIO BANCO" },
  { rubro: "FINANCIAMIENTOS", segmento: "TAS",        proveedor: "KONFIO BANCO" },
  { rubro: "FINANCIAMIENTOS", segmento: "TRANSPORTE", proveedor: "FORD CREDIT DE MÉXICO SA DE CV" },

  // ── IMPUESTOS ──
  { rubro: "IMPUESTOS", segmento: "TAS",        proveedor: "SAT" },
  { rubro: "IMPUESTOS", segmento: "TRANSPORTE", proveedor: "SAT" },
  { rubro: "IMPUESTOS", segmento: "TAS",        proveedor: "SEFIPLAN (4% ISN)" },
  { rubro: "IMPUESTOS", segmento: "TRANSPORTE", proveedor: "SEFIPLAN (4% ISN)" },
  { rubro: "IMPUESTOS", segmento: "TAS",        proveedor: "GOBIERNO DEL ESTADO DE BCS (2.5% ISN)" },
  { rubro: "IMPUESTOS", segmento: "TAS",        proveedor: "GOBIERNO DEL ESTADO DE VALLARTA (2.75% ISN)" },
  { rubro: "IMPUESTOS", segmento: "TRANSPORTE", proveedor: "FONACOT" },
  { rubro: "IMPUESTOS", segmento: "TAS",        proveedor: "FONACOT" },
  { rubro: "IMPUESTOS", segmento: "TRANSPORTE", proveedor: "SUA" },
  { rubro: "IMPUESTOS", segmento: "TAS",        proveedor: "SUA" },

  // ── NÓMINA ──
  { rubro: "NÓMINA", segmento: "TRANSPORTE",   proveedor: "SUELDOS Y SALARIOS OPERADORES" },
  { rubro: "NÓMINA", segmento: "TAS",          proveedor: "SUELDOS Y SALARIOS REPRESENTANTES" },
  { rubro: "NÓMINA", segmento: "TRANSPORTE",   proveedor: "SUELDOS Y SALARIOS OPERATIVOS" },
  { rubro: "NÓMINA", segmento: "TAS",          proveedor: "SUELDOS Y SALARIOS DIRECCIÓN" },
  { rubro: "NÓMINA", segmento: "TAS",          proveedor: "SUELDOS Y SALARIOS ADMINISTRATIVOS" },
  { rubro: "NÓMINA", segmento: "TAS",          proveedor: "ASIMILADOS DIRECCIÓN" },
  { rubro: "NÓMINA", segmento: "TAS",          proveedor: "ASIMILADOS ADMINISTRACIÓN" },
  { rubro: "NÓMINA", segmento: "TRANSPORTE",   proveedor: "ASIMILADOS AFE" },
  { rubro: "NÓMINA", segmento: "TRANSPORTE",   proveedor: "FINIQUITO" },
  { rubro: "NÓMINA", segmento: "TRANSPORTE",   proveedor: "FINIQUITO" },
  { rubro: "NÓMINA", segmento: "TRANS / TAS",  proveedor: "PTU" },
  { rubro: "NÓMINA", segmento: "TRANSPORTE",   proveedor: "BONOS OPERADORES" },
  { rubro: "NÓMINA", segmento: "TAS",          proveedor: "BONOS TAS" },
  { rubro: "NÓMINA", segmento: "TRANSPORTE",   proveedor: "BONOS OPERADORES" },
  { rubro: "NÓMINA", segmento: "TRANSPORTE",   proveedor: "PRÉSTAMOS" },
  { rubro: "NÓMINA", segmento: "TRANS / TAS",  proveedor: "INTERCAM BANCO SA (CAJA DE AHORRO)" },
  { rubro: "NÓMINA", segmento: "TRANSPORTE",   proveedor: "ENDERED" },
  { rubro: "NÓMINA", segmento: "TAS",          proveedor: "ENDERED" },
  { rubro: "NÓMINA", segmento: "TAS",          proveedor: "CONTROL INTEGRAL DE COMBUSTIBLE" },
  { rubro: "NÓMINA", segmento: "TAS",          proveedor: "CONTROL INTEGRAL DE COMBUSTIBLE" },

  // ── CAPITAL HUMANO ──
  { rubro: "CAPITAL HUMANO", segmento: "TRANSPORTE",  proveedor: "DESARROLLO DE CAPITAL HUMANO TALENT CH" },
  { rubro: "CAPITAL HUMANO", segmento: "TAS",         proveedor: "DESARROLLO DE CAPITAL HUMANO TALENT CH" },
  { rubro: "CAPITAL HUMANO", segmento: "TRANSPORTE",  proveedor: "DESARROLLO DE CAPITAL HUMANO TALENT CH" },
  { rubro: "CAPITAL HUMANO", segmento: "TAS",         proveedor: "DESARROLLO DE CAPITAL HUMANO TALENT CH" },
  { rubro: "CAPITAL HUMANO", segmento: "TAS",         proveedor: "ANGEL PUC TAH" },
  { rubro: "CAPITAL HUMANO", segmento: "TRANSPORTE",  proveedor: "UNIFORMES TAMPICO SA DE CV" },
  { rubro: "CAPITAL HUMANO", segmento: "TRANSPORTE",  proveedor: "VICTOR HUGO MARTÍNEZ BERNAL" },
  { rubro: "CAPITAL HUMANO", segmento: "TRANSPORTE",  proveedor: "OCC MUNDIAL" },
  { rubro: "CAPITAL HUMANO", segmento: "TRANS / TAS", proveedor: "3SIT INTEGRACIÓN Y SOLUCIONES" },
  { rubro: "CAPITAL HUMANO", segmento: "TAS",         proveedor: "AUTOS PULLMAN" },
  { rubro: "CAPITAL HUMANO", segmento: "TAS",         proveedor: "RADIOMOVIL DIPSA SA DE CV" },
  { rubro: "CAPITAL HUMANO", segmento: "TRANSPORTE",  proveedor: "RADIOMOVIL DIPSA SA DE CV" },
  { rubro: "CAPITAL HUMANO", segmento: "TAS",         proveedor: "RADIOMOVIL DIPSA SA DE CV" },
  { rubro: "CAPITAL HUMANO", segmento: "TAS",         proveedor: "EVENTOS INTERNOS" },
  { rubro: "CAPITAL HUMANO", segmento: "TAS",         proveedor: "EMILIO BOLIO PASOS" },
  { rubro: "CAPITAL HUMANO", segmento: "TAS",         proveedor: "AEROPUERTO DE CANCÚN" },

  // ── COMBUSTIBLE ──
  { rubro: "COMBUSTIBLE", segmento: "TRANSPORTE", proveedor: "CONTROL INTEGRAL DE COMBUSTIBLE SA DE CV" },
  { rubro: "COMBUSTIBLE", segmento: "TRANSPORTE", proveedor: "EFECTIVALE" },

  // ── MANTENIMIENTO DE UNIDADES ──
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "REFACCIONARIA AUTOMOTRIZ ANCONA" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "JUAN CARLOS HERMIDA RESENDEZ" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "PABLO JIMÉNEZ JIMÉNEZ" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "HERRAMIENTAS DE TRABAJO" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "ISAAC OMAR ALVARADO AGUILAR" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "JOSFED GARCÍA REYNOSOS" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "MAYA MOTRIZ SA DE CV" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "AKTIUM SA DE CV" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "B PARTES SA DE CV" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "PROVEEDORA DE RINES Y LLANTAS MONTERREY" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "LESLY ITZEL BURGOIN LUCERO" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "CHEVROLET DEL CARIBE" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "SERGIO ISRAEL ÁLVAREZ TORRES (GENKA)" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "GRUPO LLANTERO LASERMA" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "TYRE SERVICE SA DE CV" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "ENZO AUTOPARTES SA DE CV" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "IMPULSORA PENINSULAR AUTOMOTRIZ" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "LLANTAS DE SUDCALIFORNIA SA DE CV" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "EFRAÍN MALDONADO MARTÍN" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "AUTOS POPULARES DEL CARIBE (VOLKSWAGEN)" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "CARLOS ANTONIO GONZÁLEZ VARGAS" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "AUTOCLIMAS DE CANCÚN SA DE CV" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "AUTOZONE DE MÉXICO SA DE CV" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "AUTOMOTRIZ TRANSMAR SJD" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "MANUEL JAVIER ESCALANTE SÁNCHEZ" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "SILVIA HERNANDEZ PULIDO" },
  { rubro: "MANTENIMIENTO DE UNIDADES", segmento: "TRANSPORTE", proveedor: "JOSUÉ JONATHAN CRUZ RTITT" },

  // ── COSTO UNIDADES / ADAPTACIÓN ──
  { rubro: "COSTO UNIDADES / ADAPTACIÓN", segmento: "TRANSPORTE", proveedor: "PRODUCTOS Y SERVICIOS FRESH CLEAN SA" },
  { rubro: "COSTO UNIDADES / ADAPTACIÓN", segmento: "TRANSPORTE", proveedor: "CENTRO VEHICULAR DEL CARIBE" },
  { rubro: "COSTO UNIDADES / ADAPTACIÓN", segmento: "TRANSPORTE", proveedor: "ORIGEN CONTRA INCENDIO" },
  { rubro: "COSTO UNIDADES / ADAPTACIÓN", segmento: "TRANSPORTE", proveedor: "CONTROL INTEGRAL DE COMBUSTIBLE (TAG)" },
  { rubro: "COSTO UNIDADES / ADAPTACIÓN", segmento: "TRANSPORTE", proveedor: "GERARDO DEL JESÚS RODRÍGUEZ CHAN" },
  { rubro: "COSTO UNIDADES / ADAPTACIÓN", segmento: "TRANSPORTE", proveedor: "BOTIQUINES" },
  { rubro: "COSTO UNIDADES / ADAPTACIÓN", segmento: "TRANSPORTE", proveedor: "SAMSARA INC" },
  { rubro: "COSTO UNIDADES / ADAPTACIÓN", segmento: "TRANSPORTE", proveedor: "DAVID ENRIQUE FRANCO PATRON" },
  { rubro: "COSTO UNIDADES / ADAPTACIÓN", segmento: "TRANSPORTE", proveedor: "SCT" },
  { rubro: "COSTO UNIDADES / ADAPTACIÓN", segmento: "TAS",        proveedor: "GOBIERNO DEL ESTADO" },
  { rubro: "COSTO UNIDADES / ADAPTACIÓN", segmento: "TRANSPORTE", proveedor: "GOBIERNO DEL ESTADO" },
  { rubro: "COSTO UNIDADES / ADAPTACIÓN", segmento: "TAS",        proveedor: "GOBIERNO DEL ESTADO" },
  { rubro: "COSTO UNIDADES / ADAPTACIÓN", segmento: "TRANSPORTE", proveedor: "GRUAS" },
  { rubro: "COSTO UNIDADES / ADAPTACIÓN", segmento: "TRANSPORTE", proveedor: "ZACMA" },

  // ── PEAJES DE SERVICIOS ──
  { rubro: "PEAJES DE SERVICIOS", segmento: "TRANSPORTE", proveedor: "AEROPUERTO DE CANCÚN" },
  { rubro: "PEAJES DE SERVICIOS", segmento: "TRANSPORTE", proveedor: "FONDO NACIONAL DE INFRAESTRUCTURA" },
  { rubro: "PEAJES DE SERVICIOS", segmento: "TRANSPORTE", proveedor: "A.I. DE TULUM SVS AEROPORTUARIOS" },
  { rubro: "PEAJES DE SERVICIOS", segmento: "TRANSPORTE", proveedor: "SOLUCIONES ROOSVELT" },
  { rubro: "PEAJES DE SERVICIOS", segmento: "TRANSPORTE", proveedor: "AEROPUERTO DE SAN JOSÉ DE CABO" },

  // ── SEGUROS ──
  { rubro: "SEGUROS", segmento: "TRANSPORTE", proveedor: "SEGUROS VE POR MÁS" },
  { rubro: "SEGUROS", segmento: "TRANSPORTE", proveedor: "SEGUROS VE POR MÁS" },
  { rubro: "SEGUROS", segmento: "TAS",        proveedor: "SEGUROS VE POR MÁS" },
  { rubro: "SEGUROS", segmento: "TAS",        proveedor: "SEGUROS VE POR MÁS" },
  { rubro: "SEGUROS", segmento: "TAS",        proveedor: "GRUPO NACIONAL PROVINCIAL (GNP)" },
  { rubro: "SEGUROS", segmento: "TRANSPORTE", proveedor: "SEGUROS VE POR MÁS" },
  { rubro: "SEGUROS", segmento: "",           proveedor: "ZURICH (ALL FUN)" },

  // ── RENTAS ──
  { rubro: "RENTAS", segmento: "TRANSPORTE", proveedor: "EDUARDO ORDIERES-JOACHIM RUIZ" },
  { rubro: "RENTAS", segmento: "TAS",        proveedor: "PROYECTO COBA" },
  { rubro: "RENTAS", segmento: "TAS",        proveedor: "PROYECTO COBA" },
  { rubro: "RENTAS", segmento: "TAS",        proveedor: "VICENTE BRAULIO OSORIO Y SIERRA" },
  { rubro: "RENTAS", segmento: "TRANSPORTE", proveedor: "NICOLÁS VILLA ARREOLA" },
  { rubro: "RENTAS", segmento: "TRANSPORTE", proveedor: "ANA LUISA BOLIO PASOS" },
  { rubro: "RENTAS", segmento: "TRANSPORTE", proveedor: "ANA LUISA BOLIO PASOS" },
  { rubro: "RENTAS", segmento: "TRANSPORTE", proveedor: "ANA LUISA BOLIO PASOS" },
  { rubro: "RENTAS", segmento: "TAS",        proveedor: "ARTURO ROMERO SILLAS" },
  { rubro: "RENTAS", segmento: "TRANSPORTE", proveedor: "ANA LUISA BOLIO PASOS" },
  { rubro: "RENTAS", segmento: "TAS",        proveedor: "AEROPUERTO DE SAN JOSÉ DE CABO" },
  { rubro: "RENTAS", segmento: "TRANSPORTE", proveedor: "ALVARO BOLIO PASOS" },

  // ── SERVICIOS ──
  { rubro: "SERVICIOS", segmento: "TAS",        proveedor: "COMISIÓN FEDERAL DE ELECTRICIDAD" },
  { rubro: "SERVICIOS", segmento: "TRANSPORTE", proveedor: "COMISIÓN FEDERAL DE ELECTRICIDAD" },
  { rubro: "SERVICIOS", segmento: "TRANSPORTE", proveedor: "TOTAL PLAY TELECOMUNICACIONES SA DE CV" },
  { rubro: "SERVICIOS", segmento: "TAS",        proveedor: "TELÉFONOS DE MÉXICO SA DE CV" },
  { rubro: "SERVICIOS", segmento: "TRANSPORTE", proveedor: "TELÉFONOS DE MÉXICO SA DE CV" },
  { rubro: "SERVICIOS", segmento: "TRANSPORTE", proveedor: "EFRIGNA" },
  { rubro: "SERVICIOS", segmento: "TAS",        proveedor: "ALPHA DIGITAL SA DE CV" },
  { rubro: "SERVICIOS", segmento: "TRANSPORTE", proveedor: "ALPHA DIGITAL SA DE CV" },

  // ── SISTEMAS ──
  { rubro: "SISTEMAS", segmento: "TAS",         proveedor: "DEXABYTE, SA DE CV" },
  { rubro: "SISTEMAS", segmento: "TRANSPORTE",  proveedor: "DEXABYTE, SA DE CV" },
  { rubro: "SISTEMAS", segmento: "TRANSPORTE",  proveedor: "DEXABYTE, SA DE CV" },
  { rubro: "SISTEMAS", segmento: "TRANS / TAS", proveedor: "GOOGLE WORKSPACE" },
  { rubro: "SISTEMAS", segmento: "TRANS / TAS", proveedor: "ZOOM" },
  { rubro: "SISTEMAS", segmento: "TAS",         proveedor: "GO DADDY" },
  { rubro: "SISTEMAS", segmento: "TAS",         proveedor: "AZURE" },
  { rubro: "SISTEMAS", segmento: "TAS",         proveedor: "DIGITAL OCEAN" },
  { rubro: "SISTEMAS", segmento: "TAS",         proveedor: "IRVING BASTO GÓMEZ" },
  { rubro: "SISTEMAS", segmento: "TRANSPORTE",  proveedor: "IRVING BASTO GÓMEZ" },
  { rubro: "SISTEMAS", segmento: "TRANS / TAS", proveedor: "GIOVANNI" },
  { rubro: "SISTEMAS", segmento: "TAS",         proveedor: "DESARROLLO DE CAPITAL HUMANO TALENT CH" },

  // ── HONORARIOS ──
  { rubro: "HONORARIOS", segmento: "TRANSPORTE", proveedor: "EDUARDO VELAZQUEZ SC" },
  { rubro: "HONORARIOS", segmento: "TAS",        proveedor: "EDUARDO VELAZQUEZ SC" },
  { rubro: "HONORARIOS", segmento: "TRANSPORTE", proveedor: "CONSULTORES Y ASESORES" },
  { rubro: "HONORARIOS", segmento: "TAS",        proveedor: "CONSULTORES Y ASESORES" },
  { rubro: "HONORARIOS", segmento: "TRANSPORTE", proveedor: "JOSE ALONSO MONTERO HERNANDEZ" },
  { rubro: "HONORARIOS", segmento: "TAS",        proveedor: "JOSE ALONSO MONTERO HERNANDEZ" },

  // ── SUMINISTROS, PAPELERÍA E INSUMOS DE OFICINA ──
  { rubro: "SUMINISTROS, PAPELERÍA E INSUMOS DE OFICINA", segmento: "TAS",        proveedor: "OPERADORA DE TIENDAS VOLUNTARIAS" },
  { rubro: "SUMINISTROS, PAPELERÍA E INSUMOS DE OFICINA", segmento: "TRANSPORTE", proveedor: "OPERADORA DE TIENDAS VOLUNTARIAS" },
  { rubro: "SUMINISTROS, PAPELERÍA E INSUMOS DE OFICINA", segmento: "TAS",        proveedor: "MIGUEL ANGEL FLORES" },
  { rubro: "SUMINISTROS, PAPELERÍA E INSUMOS DE OFICINA", segmento: "TRANSPORTE", proveedor: "STEREN" },
  { rubro: "SUMINISTROS, PAPELERÍA E INSUMOS DE OFICINA", segmento: "TAS",        proveedor: "JOSE ANTONIO ROSAS OJEDA" },
  { rubro: "SUMINISTROS, PAPELERÍA E INSUMOS DE OFICINA", segmento: "TAS",        proveedor: "COSTCO DE MÉXICO SA DE CV" },
  { rubro: "SUMINISTROS, PAPELERÍA E INSUMOS DE OFICINA", segmento: "TAS",        proveedor: "GLOBAL WRISTBANDS SA DE CV" },
  { rubro: "SUMINISTROS, PAPELERÍA E INSUMOS DE OFICINA", segmento: "TAS",        proveedor: "SAMS DE MÉXICO SA DE CV" },
  { rubro: "SUMINISTROS, PAPELERÍA E INSUMOS DE OFICINA", segmento: "TRANSPORTE", proveedor: "SAMS DE MÉXICO SA DE CV" },
  { rubro: "SUMINISTROS, PAPELERÍA E INSUMOS DE OFICINA", segmento: "TRANSPORTE", proveedor: "BEPENSA" },
  { rubro: "SUMINISTROS, PAPELERÍA E INSUMOS DE OFICINA", segmento: "",           proveedor: "MANUEL DELGADO" },
  { rubro: "SUMINISTROS, PAPELERÍA E INSUMOS DE OFICINA", segmento: "",           proveedor: "OPERADORA OMX SA DE CV" },
  { rubro: "SUMINISTROS, PAPELERÍA E INSUMOS DE OFICINA", segmento: "",           proveedor: "HOME DEPOT MÉXICO SA DE CV" },
  { rubro: "SUMINISTROS, PAPELERÍA E INSUMOS DE OFICINA", segmento: "",           proveedor: "WALMART DE MÉXICO SA DE CV" },
  { rubro: "SUMINISTROS, PAPELERÍA E INSUMOS DE OFICINA", segmento: "",           proveedor: "OFFICE DEPOT MÉXICO SA DE CV" },

  // ── REPROTECCIONES ──
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "VIAJES LIBERO SA DE CV" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "VIAJES LIBERO SA DE CV" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "AGI TOURS SA DE CV" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "OMNIBUS CANCUN SA DE CV" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "TRANSPORTES TENAMAXTLENSES SA DE CV" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "TRANSPORTES TENAMAXTLENSES SA DE CV" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "TRANSPORTISTAS JOSEFINOS SA DE CV" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "TRANSPORTISTAS JOSEFINOS SA DE CV" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "TURISCABOS SA DE CV" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "TRANSPORTE TURISTICO LA QUEBRADA" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "SUNNY DAYS TRAVEL" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "LINEA TURISTICA PENINSULAR DARE" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "SUNNY DAYS TRAVEL" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "BEATRIZ RAZO YÁNEZ" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "LIIA TOURS" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "TULUM TRANSPORTATION ST" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "TULUM TRANSPORTATION ST" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "SERVICIOS DE LOGISTICA Y TRANSPORTACION TURISTICA DE QUINTANA ROO" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "TRANSPORTADORA TURÍSTICA CARRILLO SA DE CV" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "THE PASSION LINE LUXURY" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "KARLA YURITZI VÁZQUEZ CÁMARA" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "KARLA YURITZI VÁZQUEZ CÁMARA" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "BRIAN RODRIGO PECH KU" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "RENE CASTRUITA FLORES" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "BLONDE BRIDGE RENT A CAR / MIDAS TRAVEL" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "LOS CABOS TOURS" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "FASTER TRANSPORTADORA TURISTICA" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "TRANSPORTE BAJA CABOS" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "TRANSPORTES EJECUTIVOS SANTA LUCIA" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "LOS CABOS TOURS" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "ALMAR - JORGE ASTERIO" },
  { rubro: "REPROTECCIONES", segmento: "TAS", proveedor: "VARIOS ESTIMADOS" },

  // ── APOYOS DE TRANSPORTACIÓN ──
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "AGI TOURS SA DE CV" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "ECO BAJA TOURS" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "AUTOBUSES DE ORIENTE ADO SA DE CV" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "SERVICIOS TURISTICOS JAVI SRL DE CV" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "TRANSPORTISTAS JOSEFINOS SA DE CV" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "TURISCABOS SA DE CV" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "MARA ANDREA GARDUÑO GONZALEZ" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "AUTOBUSES RÁPIDOS DE ZACATLÁN" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "AIRPORT TRANSFERS STAR (SUNNY DAYS)" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "O.D.C TRANSFERS" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "SUNNY DAYS TRAVEL" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "OFIR TOUR-FLEX" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "TRANSPORTADORA TURQUESA MAYAN TRANSFERS" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "BEATRIZ RAZO YÁNEZ" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "TRANSPORTES EJECUTIVOS SANTA LUCIA" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "TULUM TRANSPORTATION ST" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "KARLA YURITZI VÁZQUEZ CÁMARA" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "KARLA YURITZI VÁZQUEZ CÁMARA" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "LINEA TURISTICA PENINSULAR DARE" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "TRANSPORTADORA MAYA FENIX" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "TRANSPORTADORA MAYA FENIX" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "LIIA TOURS" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "AUTOCARES" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "TRANSPORTES TENAMAXTLENSES SA DE CV" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "NADRIA SERVICIOS TURISTICOS" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "TRANSPORTES BAJA CABOS" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "MARIA DEL CARMEN POMPEYO SIERRA" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "LOS CABOS TOURS" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "TRANSPORTADORA TURISTICA LOS AMIGOS" },
  { rubro: "APOYOS DE TRANSPORTACIÓN", segmento: "TRANSPORTE", proveedor: "VARIOS ESTIMADOS" },

  // ── FONDO FIJO ──
  { rubro: "FONDO FIJO", segmento: "TRANS / TAS", proveedor: "SORAYDA VERÓNICA CAUICH CANCHÉ" },
  { rubro: "FONDO FIJO", segmento: "TAS",         proveedor: "SORAYDA VERÓNICA CAUICH CANCHÉ" },
  { rubro: "FONDO FIJO", segmento: "TAS",         proveedor: "SORAYDA VERÓNICA CAUICH CANCHÉ" },
  { rubro: "FONDO FIJO", segmento: "TRANSPORTE",  proveedor: "SORAYDA VERÓNICA CAUICH CANCHÉ" },
  { rubro: "FONDO FIJO", segmento: "TAS",         proveedor: "DAVID VIVAR" },
  { rubro: "FONDO FIJO", segmento: "TAS",         proveedor: "ARMANDO CAMPOS" },
  { rubro: "FONDO FIJO", segmento: "TAS",         proveedor: "KEILA GASTELUM" },

  // ── GASTOS COMERCIALES ──
  { rubro: "GASTOS COMERCIALES", segmento: "TAS",        proveedor: "DESARROLLO DE CAPITAL HUMANO TALENT CH" },
  { rubro: "GASTOS COMERCIALES", segmento: "TRANSPORTE", proveedor: "DESARROLLO DE CAPITAL HUMANO TALENT CH" },
  { rubro: "GASTOS COMERCIALES", segmento: "TAS",        proveedor: "GASTOS VARIOS" },
  { rubro: "GASTOS COMERCIALES", segmento: "TAS",        proveedor: "ARMANDO CAMPOS" },
  { rubro: "GASTOS COMERCIALES", segmento: "",           proveedor: "GLOBAL WRISTBANDS SA DE CV" },
  { rubro: "GASTOS COMERCIALES", segmento: "TAS",        proveedor: "GUSTAVO RUIZ" },

  // ── GASTOS VARIOS ──
  { rubro: "GASTOS VARIOS", segmento: "",    proveedor: "MULTAS Y RECARGOS" },
  { rubro: "GASTOS VARIOS", segmento: "TAS", proveedor: "VIATICOS MID" },
  { rubro: "GASTOS VARIOS", segmento: "TAS", proveedor: "VIATICOS" },
  { rubro: "GASTOS VARIOS", segmento: "TAS", proveedor: "COMISIONES BANCARIAS" },
  { rubro: "GASTOS VARIOS", segmento: "TAS", proveedor: "VARIOS" },
];

// Agrupa por rubro manteniendo el orden de aparición
// Cada item recibe un id estable basado en su posición global (eg-0, eg-1, ...)
const EGRESOS_POR_RUBRO = (() => {
  const map = new Map();
  SEED_EGRESOS.forEach((e, i) => {
    const item = { ...e, id: `eg-${i}` };
    if (!map.has(e.rubro)) map.set(e.rubro, []);
    map.get(e.rubro).push(item);
  });
  return Array.from(map.entries()).map(([label, items]) => ({
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
    label,
    items,
    rows: items.length,
  }));
})();

// ───────────────────────────────────────────────────────────────
// Celda con formato contable: $ a la izquierda, número a la derecha
// ───────────────────────────────────────────────────────────────
function AccountingCell({
  value, onChange, cellId, autoFocusId, onAutoFocused, onNavigate,
  bold = false, readOnly = false,
  selected = false, onSelect,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef(null);
  const divRef = useRef(null);

  const start = () => {
    if (readOnly) {
      // Aunque sea solo lectura, queremos poder seleccionarla con flechas
      if (onSelect && cellId) onSelect(cellId);
      return;
    }
    if (onSelect && cellId) onSelect(cellId);
    setDraft(value ? String(value) : "");
    setEditing(true);
    requestAnimationFrame(() => {
      ref.current?.select();
      ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  };
  const commit = (direction) => {
    onChange(parseMoney(draft));
    setEditing(false);
    if (direction && cellId && onNavigate) onNavigate(cellId, direction);
  };
  const cancel = () => setEditing(false);

  useEffect(() => {
    if (cellId && autoFocusId === cellId && !editing && !readOnly) {
      start();
      onAutoFocused?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocusId, cellId]);

  // Auto-scroll cuando esta celda es seleccionada
  useEffect(() => {
    if (selected && divRef.current && !editing) {
      divRef.current.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [selected, editing]);

  // ── Auto-cerrar edición si la celda pierde selección ──
  // Esto previene que celdas queden visualmente "en modo edición" (fondo mamey)
  // cuando el usuario navega con flechas a otra celda.
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => {
    if (!selected && editing) {
      onChange(parseMoney(draftRef.current));
      setEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(e.shiftKey ? "up" : "down"); }
          else if (e.key === "Tab") { e.preventDefault(); commit(e.shiftKey ? "prev" : "next"); }
          else if (e.key === "Escape") { e.preventDefault(); cancel(); }
          else if (e.key === "ArrowDown") { e.preventDefault(); commit("down"); }
          else if (e.key === "ArrowUp")   { e.preventDefault(); commit("up"); }
        }}
        inputMode="decimal"
        style={{
          width: "100%", height: "100%", padding: "0 4px",
          fontFamily: FONT, fontSize: "11px", color: C.text,
          backgroundColor: C.editing,
          border: `2px solid ${C.headerBlueDark}`,
          outline: "none", textAlign: "right",
          fontWeight: bold ? 700 : 400,
          boxSizing: "border-box",
        }}
      />
    );
  }

  const isEmpty = !value || value === 0;
  const selectedStyle = selected ? {
    outline: `2px solid ${C.headerBlueDark}`,
    outlineOffset: "-2px",
    position: "relative",
    zIndex: 1,
  } : {};

  // Celda vacía → completamente en blanco, sin $ ni guión. Sigue siendo clickeable.
  if (isEmpty) {
    return (
      <div
        ref={divRef}
        onClick={start}
        style={{
          height: "100%", width: "100%", minHeight: "20px",
          cursor: readOnly ? "default" : "text",
          userSelect: "none",
          ...selectedStyle,
        }}
      />
    );
  }

  return (
    <div
      ref={divRef}
      onClick={start}
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "2px 5px", height: "100%", cursor: readOnly ? "default" : "text",
        fontFamily: FONT, fontSize: "11px", color: C.text,
        fontWeight: bold ? 700 : 400,
        userSelect: "none",
        ...selectedStyle,
      }}
    >
      <span>$</span>
      <span>{fmtAccountingNumber(value)}</span>
    </div>
  );
}

// Celda de texto editable
function TextCell({
  value, onChange, uppercase = false, align = "left", bold = false,
  cellId, autoFocusId, onAutoFocused, onNavigate,
  selected = false, onSelect,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const ref = useRef(null);
  const divRef = useRef(null);
  useEffect(() => setDraft(value || ""), [value]);

  const start = () => {
    if (onSelect && cellId) onSelect(cellId);
    setDraft(value || "");
    setEditing(true);
    requestAnimationFrame(() => ref.current?.select());
  };
  const commit = (direction) => {
    onChange(draft.trim());
    setEditing(false);
    if (direction && cellId && onNavigate) onNavigate(cellId, direction);
  };
  const cancel = () => { setDraft(value || ""); setEditing(false); };

  useEffect(() => {
    if (cellId && autoFocusId === cellId && !editing) {
      start();
      onAutoFocused?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocusId, cellId]);

  useEffect(() => {
    if (selected && divRef.current && !editing) {
      divRef.current.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [selected, editing]);

  // Auto-cerrar edición si pierde selección (commit con valor actual)
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => {
    if (!selected && editing) {
      onChange((draftRef.current || "").trim());
      setEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const selectedStyle = selected ? {
    outline: `2px solid ${C.headerBlueDark}`,
    outlineOffset: "-2px",
    position: "relative",
    zIndex: 1,
  } : {};

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(uppercase ? e.target.value.toUpperCase() : e.target.value)}
        onBlur={() => commit(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(e.shiftKey ? "up" : "down"); }
          else if (e.key === "Tab") { e.preventDefault(); commit(e.shiftKey ? "prev" : "next"); }
          else if (e.key === "Escape") { e.preventDefault(); cancel(); }
          else if (e.key === "ArrowDown") { e.preventDefault(); commit("down"); }
          else if (e.key === "ArrowUp")   { e.preventDefault(); commit("up"); }
        }}
        style={{
          width: "100%", height: "100%", padding: "0 4px",
          fontFamily: FONT, fontSize: "11px", color: C.text,
          backgroundColor: C.editing,
          border: `2px solid ${C.headerBlueDark}`,
          outline: "none", textAlign: align,
          fontWeight: bold ? 700 : 400,
          boxSizing: "border-box",
        }}
      />
    );
  }
  return (
    <div
      ref={divRef}
      onClick={start}
      style={{
        padding: "2px 5px", height: "100%", cursor: "text",
        fontFamily: FONT, fontSize: "11px", color: C.text,
        textAlign: align, fontWeight: bold ? 700 : 400,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        userSelect: "none",
        ...selectedStyle,
      }}
    >
      {value || "\u00A0"}
    </div>
  );
}

// Dropdown para el segmento (se ve como texto plano, despliega al clickear)
function SegmentoCell({
  value, onChange,
  cellId, autoFocusId, onAutoFocused, onNavigate,
  selected = false, onSelect,
}) {
  const wrapRef = useRef(null);
  const selectRef = useRef(null);

  useEffect(() => {
    if (selected && wrapRef.current) {
      wrapRef.current.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [selected]);

  // Si recibe autoFocus, abre el dropdown
  useEffect(() => {
    if (cellId && autoFocusId === cellId && selectRef.current) {
      selectRef.current.focus();
      onAutoFocused?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocusId, cellId]);

  const selectedStyle = selected ? {
    outline: `2px solid ${C.headerBlueDark}`,
    outlineOffset: "-2px",
  } : {};

  return (
    <div
      ref={wrapRef}
      onClick={() => { if (onSelect && cellId) onSelect(cellId); }}
      style={{ width: "100%", height: "100%", ...selectedStyle }}
    >
      <select
        ref={selectRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { if (onSelect && cellId) onSelect(cellId); }}
        style={{
          width: "100%", height: "100%", padding: "1px 2px",
          fontFamily: FONT, fontSize: "11px", color: C.text,
          background: "transparent", border: "none", outline: "none",
          appearance: "none", WebkitAppearance: "none",
          cursor: "pointer",
        }}
      >
        <option value="Transporte">Transporte</option>
        <option value="TAS">TAS</option>
      </select>
    </div>
  );
}

// Celda de flujo — muestra monto con color verde si positivo, rojo si negativo
// Soporta tanto solo lectura como editable (para Compromisos)
function FlowCell({
  value, onChange, readOnly = true, bold = true,
  cellId, autoFocusId, onAutoFocused, onNavigate,
  selected = false, onSelect,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef(null);
  const divRef = useRef(null);

  const start = () => {
    if (readOnly) {
      // Permite seleccionar la celda aunque sea solo lectura
      if (onSelect && cellId) onSelect(cellId);
      return;
    }
    if (onSelect && cellId) onSelect(cellId);
    setDraft(value ? String(value) : "");
    setEditing(true);
    requestAnimationFrame(() => ref.current?.select());
  };
  const commit = (direction) => {
    onChange(parseMoney(draft));
    setEditing(false);
    if (direction && cellId && onNavigate) onNavigate(cellId, direction);
  };
  const cancel = () => setEditing(false);

  useEffect(() => {
    if (cellId && autoFocusId === cellId && !editing && !readOnly) {
      start();
      onAutoFocused?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocusId, cellId]);

  useEffect(() => {
    if (selected && divRef.current && !editing) {
      divRef.current.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [selected, editing]);

  // Auto-cerrar edición al perder selección
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => {
    if (!selected && editing) {
      onChange(parseMoney(draftRef.current));
      setEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const isZero = !value || value === 0;
  // Color: verde si positivo, rojo si negativo, gris si cero
  const color = isZero ? "#000000" : (value < 0 ? "#C00000" : "#107C41");
  const selectedStyle = selected ? {
    outline: `2px solid ${C.headerBlueDark}`,
    outlineOffset: "-2px",
    position: "relative",
    zIndex: 1,
  } : {};

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(e.shiftKey ? "up" : "down"); }
          else if (e.key === "Tab") { e.preventDefault(); commit(e.shiftKey ? "prev" : "next"); }
          else if (e.key === "Escape") { e.preventDefault(); cancel(); }
          else if (e.key === "ArrowDown") { e.preventDefault(); commit("down"); }
          else if (e.key === "ArrowUp")   { e.preventDefault(); commit("up"); }
        }}
        inputMode="decimal"
        style={{
          width: "100%", height: "100%", padding: "0 4px",
          fontFamily: FONT, fontSize: "11px", color,
          backgroundColor: C.editing,
          border: `2px solid ${C.headerBlueDark}`,
          outline: "none", textAlign: "right",
          fontWeight: bold ? 700 : 400,
          boxSizing: "border-box",
        }}
      />
    );
  }

  if (isZero) {
    // Vacío → guion centrado-derecha, también editable si no es readOnly
    return (
      <div
        ref={divRef}
        onClick={start}
        style={{
          display: "flex", justifyContent: "flex-end", alignItems: "center",
          padding: "2px 5px", height: "100%",
          fontFamily: FONT, fontSize: "11px", color: "#000000",
          fontWeight: bold ? 700 : 400,
          cursor: readOnly ? "default" : "text",
          userSelect: "none",
          ...selectedStyle,
        }}
      >
        -
      </div>
    );
  }

  return (
    <div
      ref={divRef}
      onClick={start}
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "2px 5px", height: "100%",
        fontFamily: FONT, fontSize: "11px", color,
        fontWeight: bold ? 700 : 400,
        cursor: readOnly ? "default" : "text",
        userSelect: "none",
        ...selectedStyle,
      }}
    >
      <span>$</span>
      <span>{fmtAccountingNumber(value)}</span>
    </div>
  );
}

// Kbd
function Kbd({ children }) {
  return (
    <kbd style={{
      fontFamily: FONT, fontSize: "10px",
      padding: "1px 5px",
      background: "#ffffff",
      border: `1px solid ${C.gridLine}`,
      borderRadius: "2px",
      color: C.text,
    }}>{children}</kbd>
  );
}

function toolbarBtn() {
  return {
    display: "inline-flex", alignItems: "center", gap: "4px",
    padding: "3px 8px",
    background: "#ffffff",
    border: `1px solid ${C.gridLine}`,
    fontFamily: FONT, fontSize: "11px",
    color: C.text,
    cursor: "pointer",
  };
}

// ───────────────────────────────────────────────────────────────
// Componente principal
// ───────────────────────────────────────────────────────────────
export default function FlujoIngresos({
  empresaId = "empresa_2",
  invoices = {},
  payments = [],
}) {
  useInjectFonts();

  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [data, setData] = useState(() => emptyWeek());
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle");
  const [segFilter, setSegFilter] = useState("todos");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [newSeg, setNewSeg] = useState("Transporte");
  const [newName, setNewName] = useState("");
  const [autoFocusId, setAutoFocusId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [hoverRow, setHoverRow] = useState(null);
  const [zoom, setZoom] = useState(1); // Zoom tipo Excel (Ctrl + rueda)
  const tableScrollRef = useRef(null);

  const weekKey = formatDateKey(weekStart);

  // Cargar semana desde Supabase
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    (async () => {
      try {
        const { data: row, error } = await supabase
          .from("flujo_efectivo_semanal")
          .select("data")
          .eq("empresa_id", empresaId)
          .eq("week_key", weekKey)
          .maybeSingle();
        if (cancel) return;
        if (error) throw error;
        if (row && row.data) {
          const parsed = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
          setData({
            saldoInicial: parsed.saldoInicial || [0, 0, 0, 0, 0],
            rows: parsed.rows || emptyWeek().rows,
            planCobranza: parsed.planCobranza || [0, 0, 0, 0, 0],
            egresos: parsed.egresos || {},
            importados: parsed.importados || [],
            compromisos: parsed.compromisos || [0, 0, 0, 0, 0],
          });
        } else {
          setData(emptyWeek());
        }
      } catch (e) {
        console.error("[FlujoIngresos] error cargando semana:", e);
        if (!cancel) setData(emptyWeek());
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [empresaId, weekKey]);

  // Autoguardar en Supabase (debounce 400ms)
  const saveTimer = useRef(null);
  useEffect(() => {
    if (loading) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from("flujo_efectivo_semanal")
          .upsert(
            {
              empresa_id: empresaId,
              week_key: weekKey,
              data,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "empresa_id,week_key" }
          );
        if (error) throw error;
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
      } catch (e) {
        console.error("[FlujoIngresos] error guardando:", e);
        setSaveState("idle");
      }
    }, 400);
    return () => saveTimer.current && clearTimeout(saveTimer.current);
  }, [data, empresaId, weekKey, loading]);

  // Zoom con Ctrl + rueda del mouse (estilo Excel)
  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? -1 : 1;
      setZoom(z => {
        const next = Math.round((z + dir * 0.1) * 10) / 10;
        return Math.max(0.5, Math.min(2, next));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomIn = () => setZoom(z => Math.min(2, Math.round((z + 0.1) * 10) / 10));
  const zoomOut = () => setZoom(z => Math.max(0.5, Math.round((z - 0.1) * 10) / 10));
  const zoomReset = () => setZoom(1);

  // Mutadores
  const updateAmount = (rowIdx, dayIdx, v) => setData(d => ({
    ...d,
    rows: d.rows.map((r, i) => i === rowIdx
      ? { ...r, amounts: r.amounts.map((a, j) => (j === dayIdx ? v : a)) }
      : r),
  }));
  const updateRow = (rowIdx, patch) => setData(d => ({
    ...d,
    rows: d.rows.map((r, i) => (i === rowIdx ? { ...r, ...patch } : r)),
  }));
  const deleteRow = (rowIdx) => setData(d => ({
    ...d, rows: d.rows.filter((_, i) => i !== rowIdx),
  }));
  const updateSaldoInicial = (idx, v) => setData(d => ({
    ...d, saldoInicial: d.saldoInicial.map((s, i) => (i === idx ? v : s)),
  }));
  const updatePlanCobranza = (idx, v) => setData(d => ({
    ...d, planCobranza: d.planCobranza.map((s, i) => (i === idx ? v : s)),
  }));
  // Egresos — actualiza un monto o un concepto por id de proveedor
  const updateEgresoAmount = (egId, dayIdx, v) => setData(d => {
    const current = d.egresos[egId] || { amounts: [0, 0, 0, 0, 0], concepto: "" };
    const newAmounts = current.amounts.map((a, i) => (i === dayIdx ? v : a));
    return { ...d, egresos: { ...d.egresos, [egId]: { ...current, amounts: newAmounts } } };
  });
  const updateEgresoConcepto = (egId, concepto) => setData(d => {
    const current = d.egresos[egId] || { amounts: [0, 0, 0, 0, 0], concepto: "" };
    return { ...d, egresos: { ...d.egresos, [egId]: { ...current, concepto } } };
  });
  // Compromisos por día (importe comprometido a algo)
  const updateCompromiso = (idx, v) => setData(d => ({
    ...d,
    compromisos: (d.compromisos || [0,0,0,0,0]).map((c, i) => (i === idx ? v : c)),
  }));
  const addClient = () => {
    if (!newName.trim()) return;
    setData(d => ({
      ...d,
      rows: [...d.rows, {
        id: `r-${Date.now()}`, segmento: newSeg,
        cliente: newName.trim().toUpperCase(),
        amounts: [0, 0, 0, 0, 0], concepto: "",
      }],
    }));
    setNewName(""); setAdding(false);
  };
  const loadDemo = () => setData(demoWeek());
  const clearWeek = () => {
    if (confirm("¿Borrar toda la información de esta semana?")) setData(emptyWeek());
  };

  // Cálculos en cascada — Saldo Inicial[0] es la única entrada;
  // los siguientes días se calculan como la Proyección del día anterior.
  // Totales incluye el Saldo Inicial del día (como en el Excel original).
  const calc = useMemo(() => {
    // ── 1. Sumar importes de clientes (Ingresos) por día ──
    const clientSums = [0, 0, 0, 0, 0];
    let clientGrand = 0;
    data.rows.forEach(r => {
      r.amounts.forEach((a, i) => {
        const v = a || 0;
        clientSums[i] += v;
        clientGrand += v;
      });
    });

    // ── 2. Sumar Egresos por día y por rubro (necesario ANTES de la cascada) ──
    const egresosPerDay = [0, 0, 0, 0, 0];
    const egresosPorRubro = {}; // { [rubroLabel]: { perDay:[], total:number } }
    EGRESOS_POR_RUBRO.forEach(rubro => {
      const rubroPerDay = [0, 0, 0, 0, 0];
      let rubroTotal = 0;
      rubro.items.forEach(item => {
        const e = data.egresos?.[item.id];
        if (!e) return;
        e.amounts?.forEach((a, i) => {
          const v = a || 0;
          rubroPerDay[i] += v;
          egresosPerDay[i] += v;
          rubroTotal += v;
        });
      });
      egresosPorRubro[rubro.label] = { perDay: rubroPerDay, total: rubroTotal };
    });
    // Sumar también los importados de CxP al total general
    let importadosPerDay = [0, 0, 0, 0, 0];
    let importadosTotal = 0;
    (data.importados || []).forEach(imp => {
      imp.amounts?.forEach((a, i) => {
        const v = a || 0;
        importadosPerDay[i] += v;
        egresosPerDay[i] += v;
        importadosTotal += v;
      });
    });
    const egresosGrand = egresosPerDay.reduce((a, b) => a + b, 0);

    // ── 3. Cascada del Saldo Inicial ──
    // El saldo inicial del día siguiente = saldo final del día anterior
    // Saldo Final[d] = Saldo Inicial[d] + Ingresos[d] + Plan Cobranza[d] - Egresos[d]
    //               = Proyección[d] - Egresos[d] = FLUJO PROYECTADO[d]
    // Sólo el saldo inicial del día 0 (Lunes) es editable; los demás se calculan.
    const saldoInicial = [data.saldoInicial[0] || 0, 0, 0, 0, 0];
    const totalsPerDay = [0, 0, 0, 0, 0];
    const proyeccionPerDay = [0, 0, 0, 0, 0];

    for (let i = 0; i < 5; i++) {
      totalsPerDay[i] = saldoInicial[i] + clientSums[i];
      proyeccionPerDay[i] = totalsPerDay[i] + (data.planCobranza[i] || 0);
      // Cascada al día siguiente: saldo final del día actual (descontando egresos)
      if (i < 4) saldoInicial[i + 1] = proyeccionPerDay[i] - egresosPerDay[i];
    }

    // Grand totals — suma simple de los 5 días (coherente con las filas de cliente)
    const planGrand = data.planCobranza.reduce((a, b) => a + (b || 0), 0);
    const totalsGrand = totalsPerDay.reduce((a, b) => a + b, 0);
    const proyeccionGrand = proyeccionPerDay.reduce((a, b) => a + b, 0);

    // ── 4. Flujo bancario, neto y proyectado por día ──
    // FLUJO BANCARIO   = Saldo Inicial[d] + Ingresos reales[d] - Egresos[d]
    // FLUJO NETO       = Flujo Bancario[d] - Compromisos[d]
    // FLUJO PROYECTADO = Proyección Ingresos[d] - Egresos[d]
    //   (clientSums[d] son los ingresos reales del día sin saldo inicial)
    const compromisos = data.compromisos || [0, 0, 0, 0, 0];
    const flujoBancarioPerDay = [0, 0, 0, 0, 0];
    const flujoNetoPerDay = [0, 0, 0, 0, 0];
    const flujoProyectadoPerDay = [0, 0, 0, 0, 0];
    for (let i = 0; i < 5; i++) {
      flujoBancarioPerDay[i]   = saldoInicial[i] + clientSums[i] - egresosPerDay[i];
      flujoNetoPerDay[i]       = flujoBancarioPerDay[i] - (compromisos[i] || 0);
      flujoProyectadoPerDay[i] = proyeccionPerDay[i] - egresosPerDay[i];
    }

    return {
      saldoInicial,
      totalsPerDay,
      proyeccionPerDay,
      planGrand,
      totalsGrand,
      proyeccionGrand,
      egresosPerDay,
      egresosPorRubro,
      egresosGrand,
      importadosPerDay,
      importadosTotal,
      compromisos,
      flujoBancarioPerDay,
      flujoNetoPerDay,
      flujoProyectadoPerDay,
    };
  }, [data.saldoInicial, data.rows, data.planCobranza, data.egresos, data.compromisos]);

  // Filas visibles
  const visibleRows = useMemo(() =>
    data.rows
      .map((r, originalIdx) => ({ r, originalIdx }))
      .filter(({ r }) => {
        if (segFilter !== "todos" && r.segmento !== segFilter) return false;
        if (search) {
          const s = search.toLowerCase();
          if (!r.cliente.toLowerCase().includes(s) &&
              !r.concepto.toLowerCase().includes(s)) return false;
        }
        return true;
      }), [data.rows, segFilter, search]);

  // ── Navegación con teclado (estilo Excel) ──
  // Grid 2D con 9 columnas: [Segmento, Cliente, L, M, M, J, V, Total, Concepto]
  // Las celdas no navegables se marcan como null.
  const cellGrid = useMemo(() => {
    const grid = [];
    // Fila Saldo inicial — solo col 2 (día 0) es editable
    grid.push([null, null, `saldo-0`, null, null, null, null, null, null]);
    // Filas de clientes — Segmento + Cliente + 5 días + Total (readonly) + Concepto
    visibleRows.forEach(({ r }) => {
      grid.push([
        `seg-${r.id}`,
        `cli-${r.id}`,
        `client-${r.id}-0`, `client-${r.id}-1`, `client-${r.id}-2`, `client-${r.id}-3`, `client-${r.id}-4`,
        `total-${r.id}`,
        `concepto-${r.id}`,
      ]);
    });
    // Fila Plan de Cobranza — sólo los 5 días son editables
    grid.push([null, null, `plan-0`, `plan-1`, `plan-2`, `plan-3`, `plan-4`, null, null]);
    // Filas de Egresos (un proveedor por fila) — incluyen total y concepto
    EGRESOS_POR_RUBRO.forEach(rubro => {
      rubro.items.forEach(item => {
        grid.push([
          null, // Segmento (readOnly fijo, no navegable)
          null, // Proveedor (readOnly fijo, no navegable)
          `egreso-${item.id}-0`, `egreso-${item.id}-1`, `egreso-${item.id}-2`, `egreso-${item.id}-3`, `egreso-${item.id}-4`,
          `egtotal-${item.id}`,
          `egconcepto-${item.id}`,
        ]);
      });
    });
    // Fila Compromisos
    grid.push([null, null, `compromiso-0`, `compromiso-1`, `compromiso-2`, `compromiso-3`, `compromiso-4`, null, null]);
    return grid;
  }, [visibleRows]);

  const findCell = useCallback((id) => {
    for (let r = 0; r < cellGrid.length; r++) {
      const c = cellGrid[r].indexOf(id);
      if (c >= 0) return [r, c];
    }
    return null;
  }, [cellGrid]);

  // Navega desde currentId en la dirección dada, saltando celdas null
  const navigate = useCallback((currentId, direction) => {
    const pos = findCell(currentId);
    if (!pos) return;
    let [r, c] = pos;
    // Direcciones legacy (next/prev/down/up) + nuevas (left/right) tipo Excel
    const dr = (direction === "down")  ? 1
             : (direction === "up")    ? -1 : 0;
    const dc = (direction === "next" || direction === "right") ? 1
             : (direction === "prev" || direction === "left")  ? -1 : 0;
    if (!dr && !dc) return;
    // Avanzar hasta encontrar celda no-null
    for (let step = 0; step < 1000; step++) {
      r += dr; c += dc;
      // Wrap horizontal: 9 columnas
      if (dc > 0 && c > 8) { r++; c = 0; }
      else if (dc < 0 && c < 0) { r--; c = 8; }
      // Fuera del grid
      if (r < 0 || r >= cellGrid.length) return;
      // Encontramos celda válida
      const next = cellGrid[r][c];
      if (next) {
        setSelectedId(next);
        setAutoFocusId(next); // mantiene compat con Enter/Tab que entra a edición
        return;
      }
    }
  }, [cellGrid, findCell]);

  // Navegación SIN entrar a edición (sólo mueve la selección visual con flechas)
  const navigateSelectOnly = useCallback((currentId, direction) => {
    const pos = findCell(currentId);
    if (!pos) return;
    let [r, c] = pos;
    const dr = (direction === "down")  ? 1 : (direction === "up") ? -1 : 0;
    const dc = (direction === "right") ? 1 : (direction === "left") ? -1 : 0;
    if (!dr && !dc) return;
    for (let step = 0; step < 1000; step++) {
      r += dr; c += dc;
      if (dc > 0 && c > 8) { r++; c = 0; }
      else if (dc < 0 && c < 0) { r--; c = 8; }
      if (r < 0 || r >= cellGrid.length) return;
      const next = cellGrid[r][c];
      if (next) { setSelectedId(next); return; }
    }
  }, [cellGrid, findCell]);

  // ── Helper: ¿la celda tiene valor (no vacía / no cero)? ──
  // Sirve para Ctrl+Flecha (saltar al borde del bloque)
  const cellHasValue = useCallback((cellId) => {
    if (!cellId) return false;
    // saldo-0
    if (cellId === "saldo-0") {
      return (data.saldoInicial[0] || 0) !== 0;
    }
    // client-{rowId}-{day}
    let m = cellId.match(/^client-(.+)-(\d)$/);
    if (m) {
      const row = data.rows.find(r => r.id === m[1]);
      return row ? (row.amounts[+m[2]] || 0) !== 0 : false;
    }
    // plan-{day}
    m = cellId.match(/^plan-(\d)$/);
    if (m) return (data.planCobranza[+m[1]] || 0) !== 0;
    // egreso-{id}-{day}
    m = cellId.match(/^egreso-(.+)-(\d)$/);
    if (m) {
      const e = data.egresos?.[`eg-${m[1].replace(/^eg-/, "")}`] || data.egresos?.[m[1]];
      // El id ya es "eg-N" tal cual viene de SEED_EGRESOS, así que reuso m[1]
      const eg = data.egresos?.[m[1]];
      return eg ? (eg.amounts[+m[2]] || 0) !== 0 : false;
    }
    // compromiso-{day}
    m = cellId.match(/^compromiso-(\d)$/);
    if (m) return (data.compromisos[+m[1]] || 0) !== 0;
    // seg-{rowId}, cli-{rowId} — siempre tienen valor (son metadatos)
    if (/^(seg|cli)-/.test(cellId)) return true;
    // total-{rowId} — suma de amounts
    m = cellId.match(/^total-(.+)$/);
    if (m) {
      const row = data.rows.find(r => r.id === m[1]);
      if (!row) return false;
      return row.amounts.some(a => (a || 0) !== 0);
    }
    // concepto-{rowId}
    m = cellId.match(/^concepto-(.+)$/);
    if (m) {
      const row = data.rows.find(r => r.id === m[1]);
      return row ? !!(row.concepto || "").trim() : false;
    }
    // egtotal-{id}
    m = cellId.match(/^egtotal-(.+)$/);
    if (m) {
      const eg = data.egresos?.[m[1]];
      if (!eg) return false;
      return eg.amounts.some(a => (a || 0) !== 0);
    }
    // egconcepto-{id}
    m = cellId.match(/^egconcepto-(.+)$/);
    if (m) {
      const eg = data.egresos?.[m[1]];
      return eg ? !!(eg.concepto || "").trim() : false;
    }
    return false;
  }, [data]);

  // ── Ctrl+Flecha: salto al borde del bloque de datos (estilo Excel) ──
  // Regla:
  //  - Si la celda actual tiene valor: salta a la ÚLTIMA celda con valor del bloque continuo
  //  - Si la celda actual está vacía: salta a la SIGUIENTE celda con valor
  //  - Si ya no hay celdas con valor: va al final del grid
  const navigateBlockEdge = useCallback((currentId, direction) => {
    const pos = findCell(currentId);
    if (!pos) return;
    let [r, c] = pos;
    const dr = (direction === "down")  ? 1 : (direction === "up") ? -1 : 0;
    const dc = (direction === "right") ? 1 : (direction === "left") ? -1 : 0;
    if (!dr && !dc) return;

    const startHasValue = cellHasValue(currentId);

    // Función que avanza una posición (saltando null cells) y retorna la siguiente celda
    // navegable, o null si llegamos al borde.
    const stepOnce = (rr, cc) => {
      for (let i = 0; i < 1000; i++) {
        rr += dr; cc += dc;
        if (dc > 0 && cc > 8) { rr++; cc = 0; }
        else if (dc < 0 && cc < 0) { rr--; cc = 8; }
        if (rr < 0 || rr >= cellGrid.length) return null;
        const id = cellGrid[rr][cc];
        if (id) return { r: rr, c: cc, id };
      }
      return null;
    };

    let last = null; // última celda con valor encontrada en el recorrido (modo 1)
    let cur = { r, c };

    if (startHasValue) {
      // Modo 1: estamos en celda con valor → buscar el ÚLTIMO con valor del bloque
      while (true) {
        const nxt = stepOnce(cur.r, cur.c);
        if (!nxt) break;
        if (cellHasValue(nxt.id)) {
          last = nxt; // sigue habiendo valor, continúa
          cur = { r: nxt.r, c: nxt.c };
        } else {
          break; // primera celda vacía → paramos
        }
      }
      if (last) { setSelectedId(last.id); return; }
      // Si no hay más celdas con valor en esa dirección, busca el SIGUIENTE bloque
      // (comportamiento de Excel cuando estás solo en una celda con valor)
      while (true) {
        const nxt = stepOnce(cur.r, cur.c);
        if (!nxt) break;
        cur = { r: nxt.r, c: nxt.c };
        if (cellHasValue(nxt.id)) { setSelectedId(nxt.id); return; }
      }
      // Nada con valor → al borde del grid
      // Saltar a la última celda navegable de la fila/columna
      goToEdge();
    } else {
      // Modo 2: estamos en celda vacía → buscar SIGUIENTE con valor
      while (true) {
        const nxt = stepOnce(cur.r, cur.c);
        if (!nxt) break;
        cur = { r: nxt.r, c: nxt.c };
        if (cellHasValue(nxt.id)) { setSelectedId(nxt.id); return; }
      }
      goToEdge();
    }

    // Función interna: saltar al borde del grid
    function goToEdge() {
      // Empezamos desde la posición original y vamos lo más lejos posible
      let rr = r, cc = c;
      let lastValid = null;
      while (true) {
        const nxt = stepOnce(rr, cc);
        if (!nxt) break;
        lastValid = nxt;
        rr = nxt.r; cc = nxt.c;
      }
      if (lastValid) setSelectedId(lastValid.id);
    }
  }, [cellGrid, findCell, cellHasValue]);

  const clearAutoFocus = useCallback(() => setAutoFocusId(null), []);

  // Listener global de teclado: flechas mueven selección sin entrar a edición.
  // Ctrl+Flecha salta al borde del bloque de datos (estilo Excel).
  // Enter/F2 entran a edición de la celda seleccionada.
  // Cualquier tecla imprimible también entra a edición.
  useEffect(() => {
    const onKey = (e) => {
      // Ignorar si el foco está dentro de un input/select/textarea (modo edición activa)
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!selectedId) return;

      // Ctrl/Cmd + flecha → salto al borde del bloque
      const isJump = e.ctrlKey || e.metaKey;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (isJump) navigateBlockEdge(selectedId, "down");
        else        navigateSelectOnly(selectedId, "down");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (isJump) navigateBlockEdge(selectedId, "up");
        else        navigateSelectOnly(selectedId, "up");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (isJump) navigateBlockEdge(selectedId, "right");
        else        navigateSelectOnly(selectedId, "right");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (isJump) navigateBlockEdge(selectedId, "left");
        else        navigateSelectOnly(selectedId, "left");
      } else if (e.key === "Enter" || e.key === "F2") {
        e.preventDefault(); setAutoFocusId(selectedId);
      } else if (e.key === "Tab") {
        e.preventDefault();
        navigateSelectOnly(selectedId, e.shiftKey ? "left" : "right");
      } else if (e.key === "Escape") {
        setSelectedId(null);
      } else if (
        e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
      ) {
        // Tecla imprimible: entra a edición
        setAutoFocusId(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, navigateSelectOnly, navigateBlockEdge]);

  // Helper para reducir verbosidad en las llamadas a AccountingCell/FlowCell
  const cellProps = useCallback((id) => ({
    cellId: id,
    autoFocusId,
    onAutoFocused: clearAutoFocus,
    onNavigate: navigate,
    selected: selectedId === id,
    onSelect: setSelectedId,
  }), [autoFocusId, clearAutoFocus, navigate, selectedId]);

  const weekDates = useMemo(
    () => [0, 1, 2, 3, 4].map(i => addDays(weekStart, i)),
    [weekStart]
  );
  const rangeLabel = `${dayLabel(weekDates[0])} – ${dayLabel(weekDates[4])} · ${weekStart.getFullYear()}`;
  const rowsCount = data.rows.length;
  const rowsWithData = data.rows.filter(r => r.amounts.some(a => a > 0)).length;
  // rowSpan de la columna Rubro fusionada — cubre sólo Saldo Inicial + filas de clientes visibles.
  // Totales, Plan y Proyección tienen sus propias celdas independientes.
  const ingresoRubroSpan = 1 + Math.max(visibleRows.length, 1);

  // ─── IMPORTAR DE CXP ──────────────────────────────────────────
  // Lista de rubros disponibles (los 19 estándar) — el usuario elige
  // a cuál asignar cada factura al importar.
  const RUBROS_DISPONIBLES = useMemo(
    () => EGRESOS_POR_RUBRO.map(r => r.label),
    []
  );

  // Pagos de CxP candidatos a importar: en el rango lunes-viernes de la
  // semana actual + invoice asociado disponible. Se enriquecen con datos
  // de la factura (proveedor, folio, concepto, clasificacion).
  const pagosImportables = useMemo(() => {
    if (!payments || !payments.length) return [];
    const isoStart = formatDateKey(weekDates[0]);
    const isoEnd = formatDateKey(weekDates[4]);
    // Index de invoices por id, en todas las monedas
    const invoicesById = new Map();
    Object.entries(invoices || {}).forEach(([moneda, list]) => {
      (list || []).forEach(inv => {
        invoicesById.set(inv.id, { ...inv, moneda });
      });
    });
    // Filtrar pagos en el rango Y de invoices de esta empresa
    return payments
      .filter(p => p.fechaPago >= isoStart && p.fechaPago <= isoEnd)
      .map(p => {
        const inv = invoicesById.get(p.invoiceId);
        if (!inv) return null;
        if (inv.empresaId && inv.empresaId !== empresaId) return null;
        const folio = [inv.serie, inv.folio].filter(Boolean).join("-") || "—";
        return {
          paymentId: p.id,
          invoiceId: p.invoiceId,
          proveedor: inv.proveedor || "(sin proveedor)",
          folio,
          concepto: inv.concepto || p.notas || "",
          monto: p.monto,
          moneda: inv.moneda || "MXN",
          fechaPago: p.fechaPago,
          tipo: p.tipo || "realizado",
          clasificacionSugerida: inv.clasificacion || "",
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.fechaPago !== b.fechaPago) return a.fechaPago.localeCompare(b.fechaPago);
        return (a.proveedor || "").localeCompare(b.proveedor || "");
      });
  }, [payments, invoices, weekDates, empresaId]);

  // Set de IDs ya importados (para mostrar duplicados)
  const importadosPaymentIds = useMemo(() => {
    return new Set((data.importados || []).map(i => i.paymentId));
  }, [data.importados]);

  // Aplica las filas seleccionadas al data.importados (con detección de duplicados)
  const applyImport = useCallback((rowsToImport) => {
    // rowsToImport: [{ paymentId, invoiceId, proveedor, folio, concepto, monto,
    //                  fechaPago, tipo, rubro, segmento }]
    if (!rowsToImport || !rowsToImport.length) return;

    const existing = data.importados || [];
    const existingByPayment = new Map(existing.map(r => [r.paymentId, r]));
    const newImportados = [...existing];

    rowsToImport.forEach(row => {
      // Calcular qué día (0-4) corresponde a la fecha
      const [y, m, d] = row.fechaPago.split("-").map(Number);
      const fechaDate = new Date(y, m - 1, d);
      const dayIdx = weekDates.findIndex(wd =>
        wd.getFullYear() === fechaDate.getFullYear() &&
        wd.getMonth() === fechaDate.getMonth() &&
        wd.getDate() === fechaDate.getDate()
      );
      if (dayIdx < 0) return; // fuera de la semana

      const amounts = [0, 0, 0, 0, 0];
      amounts[dayIdx] = +row.monto || 0;

      const newItem = {
        id: `imp-${row.paymentId}`,
        paymentId: row.paymentId,
        invoiceId: row.invoiceId,
        proveedor: row.proveedor,
        folio: row.folio,
        concepto: row.concepto,
        rubro: row.rubro,
        segmento: row.segmento,
        tipo: row.tipo,
        moneda: row.moneda || "MXN",
        amounts,
        importedAt: new Date().toISOString(),
      };

      if (existingByPayment.has(row.paymentId)) {
        // Actualizar el existente
        const idx = newImportados.findIndex(r => r.paymentId === row.paymentId);
        if (idx >= 0) newImportados[idx] = { ...newImportados[idx], ...newItem };
      } else {
        // Agregar nuevo
        newImportados.push(newItem);
      }
    });

    setData(d => ({ ...d, importados: newImportados }));
    setImportModalOpen(false);
  }, [data.importados, weekDates]);

  // Eliminar una fila importada
  const removeImported = useCallback((id) => {
    setData(d => ({ ...d, importados: (d.importados || []).filter(r => r.id !== id) }));
  }, []);

  // Exportar CSV
  const exportCSV = useCallback(() => {
    const dayHeaders = weekDates.map(d => dayLabel(d));
    const esc = v => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const num = n => (n ? Number(n).toFixed(2) : "");
    const rows = [];
    rows.push(["Rubro","Segmento","Ingresos",...dayHeaders,"Total","Concepto"]);
    rows.push(["","","Saldo inicial",...calc.saldoInicial.map(num),num(calc.saldoInicial[0]),""]);
    data.rows.forEach((r, i) => {
      const total = r.amounts.reduce((a, b) => a + (b || 0), 0);
      rows.push([i === 0 ? "Ingreso" : "", r.segmento, r.cliente,
        ...r.amounts.map(num), num(total), r.concepto || ""]);
    });
    rows.push(["","","Totales",...calc.totalsPerDay.map(num),"",""]);
    rows.push(["","","PLAN DE COBRANZA",...data.planCobranza.map(num),num(calc.planGrand),""]);
    rows.push(["","","PROYECCION INGRESOS",...calc.proyeccionPerDay.map(num),"",""]);
    const csv = rows.map(r => r.map(esc).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flujo-ingresos-${formatDateKey(weekStart)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data, calc, weekStart, weekDates]);

  // ── Estilos base ─────────────────────────────────────────
  // Sin cuadrícula — los bloques de columnas se delimitan con borderRight
  // en los índices 2 (fin de meta), 7 (fin de días) y 8 (fin de total)
  const baseCell = {
    fontFamily: FONT,
    fontSize: "11px",
    padding: 0,
    height: "20px",
    verticalAlign: "middle",
    color: C.text,
  };
  const blockEnd = { borderRight: `1px solid ${C.gridLine}` };
  const blockEndHeader = { borderRight: `1px solid ${C.headerBlueDark}` };
  // Celda con cuadrícula completa (todos los bordes) — usada en filas de Egresos
  const gridCell = {
    border: `1px solid ${C.gridLine}`,
  };
  const headerCell = {
    backgroundColor: C.headerBlue,
    color: "#ffffff",
    fontWeight: 700,
    fontSize: "14px",
    letterSpacing: "0.02em",
    padding: "8px 6px",
    textAlign: "center",
    height: "32px",
    fontFamily: FONT,
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh", width: "100%",
      backgroundColor: "#ffffff",
      fontFamily: FONT, color: C.text,
    }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "8px 12px",
        borderBottom: `1px solid ${C.gridLine}`,
        fontFamily: FONT, fontSize: "11px",
        background: "#F8F8F8",
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={toolbarBtn()} title="Semana anterior">
            <ChevronLeft size={13} />
          </button>
          <div style={{
            padding: "3px 10px", background: "#ffffff",
            border: `1px solid ${C.gridLine}`,
            fontSize: "11px", fontWeight: 700,
            minWidth: "170px", textAlign: "center",
          }}>{rangeLabel}</div>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={toolbarBtn()} title="Semana siguiente">
            <ChevronRight size={13} />
          </button>
          <button
            onClick={() => setWeekStart(getMonday(new Date()))}
            style={{ ...toolbarBtn(), padding: "3px 8px", fontSize: "10px" }}
            title="Semana actual"
          >Hoy</button>
        </div>

        <div style={{ display: "flex", borderLeft: `1px solid ${C.gridLine}`, paddingLeft: "10px", gap: "2px" }}>
          {["todos", "Transporte", "TAS"].map(s => (
            <button
              key={s}
              onClick={() => setSegFilter(s)}
              style={{
                ...toolbarBtn(),
                padding: "3px 8px", fontSize: "10px",
                background: segFilter === s ? C.headerBlue : "#ffffff",
                color: segFilter === s ? "#ffffff" : C.text,
                borderColor: segFilter === s ? C.headerBlueDark : C.gridLine,
                fontWeight: segFilter === s ? 700 : 400,
                textTransform: "capitalize",
              }}
            >{s}</button>
          ))}
        </div>

        <div style={{
          display: "flex", alignItems: "center",
          background: "#ffffff", border: `1px solid ${C.gridLine}`,
          paddingLeft: "6px",
        }}>
          <Search size={11} style={{ color: C.textMuted }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar…"
            style={{
              padding: "3px 6px", outline: "none", border: "none",
              width: "140px", fontFamily: FONT, fontSize: "11px",
              background: "transparent",
            }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ padding: "0 6px", border: "none", background: "transparent", cursor: "pointer" }}>
              <X size={11} />
            </button>
          )}
        </div>

        <div style={{ color: C.textMuted, fontSize: "10px" }}>
          {visibleRows.length}/{rowsCount} · {rowsWithData} con movimiento
        </div>

        <div style={{ flex: 1 }} />

        {/* Zoom — como Excel */}
        <div style={{
          display: "flex", alignItems: "center", gap: "2px",
          border: `1px solid ${C.gridLine}`, background: "#ffffff",
        }}>
          <button
            onClick={zoomOut}
            style={{ ...toolbarBtn(), border: "none", padding: "3px 6px" }}
            title="Alejar (Ctrl + rueda)"
            disabled={zoom <= 0.5}
          ><ZoomOut size={12} /></button>
          <button
            onClick={zoomReset}
            style={{
              ...toolbarBtn(), border: "none", padding: "3px 4px",
              minWidth: "42px", fontVariantNumeric: "tabular-nums",
              fontWeight: zoom === 1 ? 400 : 700,
            }}
            title="Restablecer a 100%"
          >{Math.round(zoom * 100)}%</button>
          <button
            onClick={zoomIn}
            style={{ ...toolbarBtn(), border: "none", padding: "3px 6px" }}
            title="Acercar (Ctrl + rueda)"
            disabled={zoom >= 2}
          ><ZoomIn size={12} /></button>
        </div>

        <div style={{ fontSize: "10px", color: C.textMuted, display: "flex", alignItems: "center", gap: "4px" }}>
          {saveState === "saving" && <span>Guardando…</span>}
          {saveState === "saved" && (<>
            <Check size={11} style={{ color: "#107C41" }} /><span>Guardado</span>
          </>)}
          {saveState === "idle" && !loading && <span style={{ opacity: 0.7 }}>Sincronizado</span>}
        </div>

        <button onClick={loadDemo} style={toolbarBtn()} title="Cargar datos del screenshot">
          <Sparkles size={11} /> Demo
        </button>
        <button
          onClick={() => setImportModalOpen(true)}
          style={{
            ...toolbarBtn(),
            background: "#0D9488", color: "#ffffff",
            borderColor: "#0F766E", fontWeight: 700,
          }}
          title="Traer pagos programados/realizados de Cartera (CxP) a la semana actual"
        >
          🔄 Importar CxP
        </button>
        <button onClick={exportCSV} style={toolbarBtn()} title="Descargar CSV">
          <Download size={11} /> Exportar
        </button>
        <button onClick={clearWeek} style={toolbarBtn()} title="Limpiar semana">
          <Eraser size={11} /> Limpiar
        </button>
        <button
          onClick={() => setAdding(x => !x)}
          style={{
            ...toolbarBtn(),
            background: C.headerBlue, color: "#ffffff",
            borderColor: C.headerBlueDark, fontWeight: 700,
          }}
        ><Plus size={11} /> Cliente</button>
      </div>

      {/* Formulario agregar cliente */}
      {adding && (
        <div style={{
          display: "flex", gap: "6px", padding: "8px 12px",
          background: "#FDFDFD",
          borderBottom: `1px solid ${C.gridLine}`,
          alignItems: "center",
        }}>
          <select
            value={newSeg}
            onChange={e => setNewSeg(e.target.value)}
            style={{
              padding: "4px 6px", fontFamily: FONT, fontSize: "11px",
              border: `1px solid ${C.gridLine}`, outline: "none",
            }}
          >
            <option>Transporte</option>
            <option>TAS</option>
          </select>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && addClient()}
            placeholder="NOMBRE DEL CLIENTE"
            autoFocus
            style={{
              flex: 1, padding: "4px 8px", fontFamily: FONT, fontSize: "11px",
              border: `1px solid ${C.gridLine}`, outline: "none",
            }}
          />
          <button onClick={addClient} style={{
            ...toolbarBtn(),
            background: C.headerBlue, color: "#ffffff",
            borderColor: C.headerBlueDark, fontWeight: 700,
          }}>Agregar</button>
          <button onClick={() => { setAdding(false); setNewName(""); }} style={toolbarBtn()}>
            Cancelar
          </button>
        </div>
      )}

      {/* TABLA — réplica Excel */}
      <div
        ref={tableScrollRef}
        style={{ padding: "16px", overflow: "auto" }}
      >
        <div style={{ zoom, display: "inline-block" }}>
          <table style={{
            borderCollapse: "collapse", background: "#ffffff",
            fontFamily: FONT, color: C.text,
          }}>
          <colgroup>
            <col style={{ width: "60px" }} />
            <col style={{ width: "90px" }} />
            <col style={{ width: "250px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "105px" }} />
            <col style={{ width: "320px" }} />
          </colgroup>

          <thead>
            <tr>
              <th style={headerCell}>Rubro</th>
              <th style={headerCell}>Segmento</th>
              <th style={{ ...headerCell, ...blockEndHeader }}>Ingresos</th>
              {weekDates.map((d, i) => (
                <th
                  key={i}
                  style={{ ...headerCell, ...(i === 4 ? blockEndHeader : {}) }}
                >{dayLabel(d)}</th>
              ))}
              <th style={{ ...headerCell, ...blockEndHeader }}>Total</th>
              <th style={headerCell}>Concepto</th>
            </tr>
          </thead>

          <tbody>
            {/* Saldo inicial — aquí se inicia el rowSpan de la columna Rubro */}
            <tr>
              <td
                rowSpan={ingresoRubroSpan}
                style={{
                  ...baseCell,
                  background: C.rubroGray,
                  verticalAlign: "middle",
                  textAlign: "center",
                  padding: 0,
                  height: "auto",
                }}
              >
                <div
                  style={{
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)",
                    fontSize: "18px",
                    fontWeight: 700,
                    letterSpacing: "0.15em",
                    color: C.text,
                    padding: "12px 0",
                    display: "inline-block",
                  }}
                >
                  INGRESOS
                </div>
              </td>
              <td style={baseCell}></td>
              <td style={{ ...baseCell, ...blockEnd, background: C.saldoGray, padding: "2px 5px" }}>
                Saldo inicial
              </td>
              {calc.saldoInicial.map((v, i) => (
                <td
                  key={i}
                  style={{
                    ...baseCell,
                    ...(i === 4 ? blockEnd : {}),
                    background: C.saldoGray,
                  }}
                >
                  <AccountingCell
                    value={v}
                    onChange={nv => updateSaldoInicial(0, nv)}
                    {...(i === 0 ? cellProps(`saldo-0`) : {})}
                    readOnly={i !== 0}
                  />
                </td>
              ))}
              <td style={{ ...baseCell, ...blockEnd, background: C.saldoGray }}>
                <AccountingCell value={calc.saldoInicial[0]} onChange={() => {}} readOnly />
              </td>
              <td style={baseCell}></td>
            </tr>

            {/* Clientes */}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={9} style={{
                  ...baseCell, padding: "24px", textAlign: "center",
                  color: C.textMuted, fontSize: "11px",
                }}>
                  Sin resultados con el filtro actual.
                </td>
              </tr>
            )}
            {visibleRows.map(({ r, originalIdx }) => {
              const rowTotal = r.amounts.reduce((a, b) => a + (b || 0), 0);
              const hasAnyData = r.amounts.some(a => a > 0) || r.concepto;
              const greenBg = hasAnyData ? C.green : "#ffffff";
              const isHover = hoverRow === r.id;
              return (
                <tr
                  key={r.id}
                  onMouseEnter={() => setHoverRow(r.id)}
                  onMouseLeave={() => setHoverRow(null)}
                >
                  <td style={{ ...baseCell, padding: "0 3px" }}>
                    <SegmentoCell
                      value={r.segmento}
                      onChange={v => updateRow(originalIdx, { segmento: v })}
                      {...cellProps(`seg-${r.id}`)}
                    />
                  </td>
                  <td style={{ ...baseCell, ...blockEnd, position: "relative" }}>
                    <TextCell
                      value={r.cliente}
                      onChange={v => updateRow(originalIdx, { cliente: v })}
                      uppercase bold
                      {...cellProps(`cli-${r.id}`)}
                    />
                    {isHover && (
                      <button
                        onClick={() => deleteRow(originalIdx)}
                        title="Eliminar fila"
                        style={{
                          position: "absolute", top: "50%", right: 2,
                          transform: "translateY(-50%)",
                          padding: "1px 3px", background: "#ffffff",
                          border: `1px solid ${C.gridLine}`,
                          cursor: "pointer",
                          display: "flex", alignItems: "center",
                          color: "#C00000", zIndex: 2,
                        }}
                      ><Trash2 size={10} /></button>
                    )}
                  </td>
                  {r.amounts.map((a, j) => (
                    <td
                      key={j}
                      style={{
                        ...baseCell,
                        ...(j === 4 ? blockEnd : {}),
                        background: greenBg,
                      }}
                    >
                      <AccountingCell
                        value={a}
                        onChange={v => updateAmount(originalIdx, j, v)}
                        {...cellProps(`client-${r.id}-${j}`)}
                      />
                    </td>
                  ))}
                  <td style={{ ...baseCell, ...blockEnd, background: greenBg }}>
                    <AccountingCell
                      value={rowTotal}
                      onChange={() => {}}
                      readOnly
                      {...cellProps(`total-${r.id}`)}
                    />
                  </td>
                  <td style={baseCell}>
                    <TextCell
                      value={r.concepto}
                      onChange={v => updateRow(originalIdx, { concepto: v })}
                      {...cellProps(`concepto-${r.id}`)}
                    />
                  </td>
                </tr>
              );
            })}

            {/* Totales */}
            <tr>
              <td style={{ ...baseCell, background: C.lightBlue }}></td>
              <td style={{ ...baseCell, background: C.lightBlue }}></td>
              <td style={{
                ...baseCell, ...blockEnd, background: C.lightBlue,
                textAlign: "right", padding: "2px 5px", fontWeight: 700,
              }}>Totales</td>
              {calc.totalsPerDay.map((t, i) => (
                <td
                  key={i}
                  style={{
                    ...baseCell,
                    ...(i === 4 ? blockEnd : {}),
                    background: C.lightBlue,
                  }}
                >
                  <AccountingCell value={t} onChange={() => {}} readOnly bold />
                </td>
              ))}
              <td style={{ ...baseCell, ...blockEnd, background: C.lightBlue }}></td>
              <td style={{ ...baseCell, background: C.lightBlue }}></td>
            </tr>

            {/* Separador — sin bordes verticales, espaciador limpio */}
            <tr>
              <td style={{ ...baseCell, height: "18px" }}></td>
              <td style={{ ...baseCell, height: "18px" }}></td>
              <td style={{ ...baseCell, height: "18px" }}></td>
              <td style={{ ...baseCell, height: "18px" }}></td>
              <td style={{ ...baseCell, height: "18px" }}></td>
              <td style={{ ...baseCell, height: "18px" }}></td>
              <td style={{ ...baseCell, height: "18px" }}></td>
              <td style={{ ...baseCell, height: "18px" }}></td>
              <td style={{ ...baseCell, height: "18px" }}></td>
              <td style={{ ...baseCell, height: "18px" }}></td>
            </tr>

            {/* PLAN DE COBRANZA — banda azul muy clara (entrada de datos) */}
            <tr>
              <td style={baseCell}></td>
              <td style={baseCell}></td>
              <td style={{
                ...baseCell, textAlign: "right",
                padding: "2px 5px", fontWeight: 700,
                background: "#F4F8FC",
                borderTop: `1px solid ${C.gridLine}`,
                borderBottom: `1px solid ${C.gridLine}`,
              }}>PLAN DE COBRANZA</td>
              {data.planCobranza.map((v, i) => (
                <td key={i} style={{
                  ...baseCell,
                  background: "#F4F8FC",
                  borderTop: `1px solid ${C.gridLine}`,
                  borderBottom: `1px solid ${C.gridLine}`,
                }}>
                  <AccountingCell
                    value={v}
                    onChange={nv => updatePlanCobranza(i, nv)}
                    {...cellProps(`plan-${i}`)}
                  />
                </td>
              ))}
              <td style={baseCell}>
                <AccountingCell value={calc.planGrand} onChange={() => {}} readOnly />
              </td>
              <td style={baseCell}></td>
            </tr>

            {/* PROYECCION INGRESOS — cajón ámbar (proyección, igual que FLUJO PROYECTADO) */}
            <tr>
              <td style={baseCell}></td>
              <td style={baseCell}></td>
              <td style={{
                ...baseCell, textAlign: "right",
                padding: "2px 5px", fontWeight: 700,
                background: "#FFF4E0",
                border: `1px solid #BFA060`,
              }}>PROYECCION INGRESOS</td>
              {calc.proyeccionPerDay.map((p, i) => (
                <td key={i} style={{
                  ...baseCell,
                  background: "#FFF4E0",
                  borderTop: `1px solid #BFA060`,
                  borderBottom: `1px solid #BFA060`,
                  borderRight: i === 4 ? `1px solid #BFA060` : "none",
                }}>
                  <AccountingCell value={p} onChange={() => {}} readOnly bold />
                </td>
              ))}
              <td style={baseCell}></td>
              <td style={baseCell}></td>
            </tr>

            {/* ═══════════════════════════════════════════════════ */}
            {/*   ESPACIO EN BLANCO ENTRE INGRESOS Y EGRESOS         */}
            {/* ═══════════════════════════════════════════════════ */}
            {[0, 1, 2].map(i => (
              <tr key={`gap-${i}`}>
                <td colSpan={10} style={{ ...baseCell, height: "20px" }}></td>
              </tr>
            ))}

            {/* ═══════════════════════════════════════════════════ */}
            {/*   HEADER DE EGRESOS — mismo azul rey                 */}
            {/* ═══════════════════════════════════════════════════ */}
            <tr>
              <th style={headerCell}>Rubro</th>
              <th style={headerCell}>Segmento</th>
              <th style={{ ...headerCell, ...blockEndHeader }}>Egresos</th>
              {weekDates.map((d, i) => (
                <th
                  key={`eg-h-${i}`}
                  style={{ ...headerCell, ...(i === 4 ? blockEndHeader : {}) }}
                >{dayLabel(d)}</th>
              ))}
              <th style={{ ...headerCell, ...blockEndHeader }}>Total</th>
              <th style={headerCell}>Concepto</th>
            </tr>

            {/* ═══════════════════════════════════════════════════ */}
            {/*   RUBROS DE EGRESOS — celdas editables               */}
            {/* ═══════════════════════════════════════════════════ */}
            {EGRESOS_POR_RUBRO.map((rubro) => {
              // Bordes externos del rubro: top en la 1ra fila, bottom en la última, izq/der siempre.
              const outer = (rIdx, edges = {}) => ({
                borderTop:    rIdx === 0              ? `1px solid ${C.gridLine}` : "none",
                borderBottom: rIdx === rubro.rows - 1 ? `1px solid ${C.gridLine}` : "none",
                borderLeft:   edges.left  ? `1px solid ${C.gridLine}` : "none",
                borderRight:  edges.right ? `1px solid ${C.gridLine}` : "none",
              });
              return (
                <React.Fragment key={rubro.id}>
                  {rubro.items.map((item, rIdx) => {
                    const eg = data.egresos?.[item.id] || { amounts: [0,0,0,0,0], concepto: "" };
                    const rowTotal = eg.amounts.reduce((a, b) => a + (b || 0), 0);
                    const hasData = rowTotal > 0 || (eg.concepto && eg.concepto.trim());
                    // Verde automático en celdas de día/total/concepto cuando hay movimiento (igual que Ingresos)
                    const dayBg = hasData ? C.green : "transparent";
                    return (
                      <tr key={`${rubro.id}-${rIdx}`}>
                        {/* Etiqueta vertical del rubro — fusionada en toda su altura */}
                        {rIdx === 0 && (
                          <td
                            rowSpan={rubro.rows}
                            style={{
                              ...baseCell,
                              background: C.rubroGray,
                              verticalAlign: "middle",
                              textAlign: "center",
                              padding: 0,
                              height: "auto",
                              border: `1px solid ${C.gridLine}`,
                            }}
                          >
                            <div
                              style={{
                                writingMode: "vertical-rl",
                                transform: "rotate(180deg)",
                                fontSize: rubro.rows >= 3 ? "14px" : "11px",
                                fontWeight: 700,
                                letterSpacing: "0.1em",
                                color: C.text,
                                padding: "8px 0",
                                display: "inline-block",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {rubro.label}
                            </div>
                          </td>
                        )}
                        {/* Segmento (solo lectura) */}
                        <td style={{
                          ...baseCell,
                          ...outer(rIdx, { left: false, right: true }),
                          padding: "2px 5px",
                          fontSize: "11px",
                        }}>{item.segmento || ""}</td>
                        {/* Proveedor (solo lectura) */}
                        <td style={{
                          ...baseCell,
                          ...outer(rIdx, { left: false, right: true }),
                          padding: "2px 5px",
                          fontSize: "11px",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }} title={item.proveedor}>{item.proveedor}</td>
                        {/* 5 días — editables */}
                        {[0,1,2,3,4].map(j => (
                          <td key={j} style={{
                            ...baseCell,
                            ...outer(rIdx, { left: false, right: j === 4 }),
                            background: dayBg,
                            padding: 0,
                          }}>
                            <AccountingCell
                              value={eg.amounts[j]}
                              onChange={v => updateEgresoAmount(item.id, j, v)}
                              {...cellProps(`egreso-${item.id}-${j}`)}
                            />
                          </td>
                        ))}
                        {/* Total auto-calculado (solo lectura) */}
                        <td style={{
                          ...baseCell,
                          ...outer(rIdx, { left: false, right: true }),
                          background: dayBg,
                          padding: 0,
                        }}>
                          <AccountingCell
                            value={rowTotal}
                            onChange={() => {}}
                            readOnly
                            bold
                            {...cellProps(`egtotal-${item.id}`)}
                          />
                        </td>
                        {/* Concepto — editable */}
                        <td style={{
                          ...baseCell,
                          ...outer(rIdx, { left: false, right: true }),
                          padding: 0,
                        }}>
                          <TextCell
                            value={eg.concepto}
                            onChange={v => updateEgresoConcepto(item.id, v)}
                            {...cellProps(`egconcepto-${item.id}`)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}

            {/* ═══════════════════════════════════════════════════ */}
            {/*   IMPORTADOS DE CXP — sección dinámica               */}
            {/* ═══════════════════════════════════════════════════ */}
            {(data.importados || []).length > 0 && (() => {
              const importedRows = data.importados || [];
              const totalRows = importedRows.length;
              return (
                <React.Fragment key="rubro-importados">
                  {importedRows.map((imp, rIdx) => {
                    const rowTotal = (imp.amounts || [0,0,0,0,0]).reduce((a, b) => a + (b || 0), 0);
                    const hasData = rowTotal > 0;
                    const dayBg = hasData ? C.green : "transparent";
                    return (
                      <tr key={imp.id}>
                        {/* Etiqueta vertical IMPORTADOS — solo en la primera fila */}
                        {rIdx === 0 && (
                          <td
                            rowSpan={totalRows}
                            style={{
                              ...baseCell,
                              background: "#FFE7B5",
                              verticalAlign: "middle",
                              textAlign: "center",
                              padding: 0,
                              height: "auto",
                              border: `1px solid ${C.gridLine}`,
                            }}
                          >
                            <div
                              style={{
                                writingMode: "vertical-rl",
                                transform: "rotate(180deg)",
                                fontSize: "10px",
                                fontWeight: 700,
                                letterSpacing: "0.5px",
                                color: "#7C2D12",
                                padding: "8px 2px",
                                whiteSpace: "nowrap",
                              }}
                            >
                              IMPORTADOS DE CXP
                            </div>
                          </td>
                        )}
                        {/* Segmento (rubro asignado al importar) */}
                        <td style={{
                          ...baseCell, ...gridCell,
                          background: "#FFF7E8",
                          fontSize: "10px",
                          textAlign: "left",
                          padding: "2px 5px",
                          fontWeight: 600,
                          color: "#7C2D12",
                        }}>
                          {imp.rubro || "—"}
                        </td>
                        {/* Nombre del proveedor + folio + botón eliminar */}
                        <td style={{
                          ...baseCell, ...gridCell,
                          textAlign: "left",
                          padding: "2px 5px",
                          background: hasData ? "#FFFBEB" : "transparent",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {imp.proveedor}
                              </div>
                              <div style={{ fontSize: "9px", color: C.textMuted }}>
                                {imp.tipo === "programado" ? "📅" : "💰"} {imp.folio} · desde CxP
                              </div>
                            </div>
                            <button
                              onClick={() => removeImported(imp.id)}
                              title="Quitar esta importación (no afecta CxP)"
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#B91C1C",
                                cursor: "pointer",
                                fontSize: 12,
                                padding: "0 4px",
                                lineHeight: 1,
                              }}
                            >✕</button>
                          </div>
                        </td>
                        {/* Días L-V (montos read-only desde CxP) */}
                        {[0,1,2,3,4].map(dIdx => (
                          <td key={dIdx} style={{ ...baseCell, ...gridCell, background: dayBg, padding: 0 }}>
                            <AccountingCell
                              value={imp.amounts[dIdx]}
                              onChange={() => {}}
                              readOnly
                            />
                          </td>
                        ))}
                        {/* Total fila */}
                        <td style={{
                          ...baseCell, ...gridCell,
                          background: C.lightBlue,
                          padding: 0,
                        }}>
                          <AccountingCell value={rowTotal} onChange={() => {}} readOnly bold />
                        </td>
                        {/* Concepto (read-only desde CxP) */}
                        <td style={{
                          ...baseCell, ...gridCell,
                          background: hasData ? "#FFFBEB" : "transparent",
                          textAlign: "left",
                          padding: "2px 5px",
                          fontSize: "10px",
                          color: C.textMuted,
                        }}>
                          {imp.concepto || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })()}

            {/* TOTALES EGRESOS — fila resumen con sumas reales */}
            <tr>
              <td style={{ ...baseCell, ...gridCell, background: C.lightBlue }}></td>
              <td style={{ ...baseCell, ...gridCell, background: C.lightBlue }}></td>
              <td style={{
                ...baseCell, ...gridCell, background: C.lightBlue,
                textAlign: "right", padding: "2px 5px", fontWeight: 700,
              }}>Totales Egresos</td>
              {calc.egresosPerDay.map((t, i) => (
                <td key={i} style={{
                  ...baseCell, ...gridCell, background: C.lightBlue, padding: 0,
                }}>
                  <AccountingCell value={t} onChange={() => {}} readOnly bold />
                </td>
              ))}
              <td style={{ ...baseCell, ...gridCell, background: C.lightBlue, padding: 0 }}>
                <AccountingCell value={calc.egresosGrand} onChange={() => {}} readOnly bold />
              </td>
              <td style={{ ...baseCell, ...gridCell, background: C.lightBlue }}></td>
            </tr>

            {/* ═══════════════════════════════════════════════════ */}
            {/*   APARTADO DE FLUJO — bancario, compromisos, neto    */}
            {/* ═══════════════════════════════════════════════════ */}
            {/* Espacio en blanco (1 renglón) */}
            <tr>
              <td colSpan={10} style={{ ...baseCell, height: "16px" }}></td>
            </tr>

            {/* FLUJO BANCARIO = Saldo Inicial + Ingresos - Egresos */}
            {/* Banda azul muy clara, sólo en label + 5 días */}
            <tr>
              <td style={baseCell}></td>
              <td style={baseCell}></td>
              <td style={{
                ...baseCell, textAlign: "right",
                padding: "2px 5px", fontWeight: 700, fontSize: "12px",
                background: "#F4F8FC",
                borderTop: `1px solid ${C.gridLine}`,
                borderBottom: `1px solid ${C.gridLine}`,
              }}>FLUJO BANCARIO</td>
              {calc.flujoBancarioPerDay.map((v, i) => (
                <td key={i} style={{
                  ...baseCell,
                  background: "#F4F8FC",
                  borderTop: `1px solid ${C.gridLine}`,
                  borderBottom: `1px solid ${C.gridLine}`,
                }}>
                  <FlowCell value={v} readOnly />
                </td>
              ))}
              <td style={baseCell}></td>
              <td style={baseCell}></td>
            </tr>

            {/* COMPROMISOS — editable, con línea negra abajo (sólo bajo label + días) */}
            <tr>
              <td style={baseCell}></td>
              <td style={baseCell}></td>
              <td style={{
                ...baseCell, textAlign: "right",
                padding: "2px 5px", fontWeight: 700, fontSize: "12px",
                // Línea inferior gruesa para separar de FLUJO NETO (como en la imagen)
                borderBottom: `2px solid #000000`,
              }}>COMPROMISOS</td>
              {calc.compromisos.map((v, i) => (
                <td key={i} style={{
                  ...baseCell, padding: 0,
                  borderBottom: `2px solid #000000`,
                }}>
                  <FlowCell
                    value={v}
                    onChange={nv => updateCompromiso(i, nv)}
                    readOnly={false}
                    {...cellProps(`compromiso-${i}`)}
                  />
                </td>
              ))}
              <td style={baseCell}></td>
              <td style={baseCell}></td>
            </tr>

            {/* FLUJO NETO = Flujo Bancario - Compromisos */}
            {/* Banda verde menta — totaliza, sólo label + 5 días */}
            <tr>
              <td style={baseCell}></td>
              <td style={baseCell}></td>
              <td style={{
                ...baseCell, textAlign: "right",
                padding: "2px 5px", fontWeight: 700, fontSize: "12px",
                background: C.green,
                borderBottom: `1px solid ${C.gridLine}`,
              }}>FLUJO NETO</td>
              {calc.flujoNetoPerDay.map((v, i) => (
                <td key={i} style={{
                  ...baseCell,
                  background: C.green,
                  borderBottom: `1px solid ${C.gridLine}`,
                }}>
                  <FlowCell value={v} readOnly />
                </td>
              ))}
              <td style={baseCell}></td>
              <td style={baseCell}></td>
            </tr>

            {/* Separador en blanco */}
            <tr>
              <td colSpan={10} style={{ ...baseCell, height: "12px" }}></td>
            </tr>

            {/* FLUJO PROYECTADO = Proyección Ingresos - Egresos */}
            {/* Cajón ámbar suave — sólo en label + 5 días */}
            <tr>
              <td style={baseCell}></td>
              <td style={baseCell}></td>
              <td style={{
                ...baseCell, textAlign: "right",
                padding: "2px 5px", fontWeight: 700, fontSize: "12px",
                background: "#FFF4E0",
                border: `1px solid #BFA060`,
              }}>FLUJO PROYECTADO</td>
              {calc.flujoProyectadoPerDay.map((v, i) => (
                <td key={i} style={{
                  ...baseCell,
                  background: "#FFF4E0",
                  borderTop: `1px solid #BFA060`,
                  borderBottom: `1px solid #BFA060`,
                  borderRight: i === 4 ? `1px solid #BFA060` : "none",
                }}>
                  <FlowCell value={v} readOnly />
                </td>
              ))}
              <td style={baseCell}></td>
              <td style={baseCell}></td>
            </tr>
          </tbody>
        </table>
        </div>

        {/* Pie — atajos */}
        <div style={{
          marginTop: "20px", paddingTop: "12px",
          borderTop: `1px solid ${C.gridLine}`,
          display: "flex", flexWrap: "wrap", gap: "14px",
          fontSize: "11px", color: C.textMuted,
          fontFamily: FONT,
        }}>
          <span style={{ fontWeight: 700, color: C.text }}>Atajos:</span>
          <span><Kbd>← ↑ → ↓</Kbd> moverse</span>
          <span><Kbd>Ctrl</Kbd> + <Kbd>← ↑ → ↓</Kbd> salto al borde</span>
          <span><Kbd>F2</Kbd> / <Kbd>Enter</Kbd> editar celda</span>
          <span><Kbd>Tab</Kbd> avanza</span>
          <span><Kbd>⇧ Enter</Kbd> / <Kbd>⇧ Tab</Kbd> retroceden</span>
          <span><Kbd>Esc</Kbd> cancela</span>
          <span><Kbd>Ctrl</Kbd> + rueda: zoom</span>
          <span style={{ marginLeft: "auto", opacity: 0.7 }}>
            Guardado local por semana · Migrable a Supabase
          </span>
        </div>
      </div>

      {/* MODAL DE IMPORTACIÓN DE CXP */}
      {importModalOpen && (
        <ImportCxpModal
          pagos={pagosImportables}
          rubros={RUBROS_DISPONIBLES}
          importadosPaymentIds={importadosPaymentIds}
          existingImportados={data.importados || []}
          rangeLabel={rangeLabel}
          onCancel={() => setImportModalOpen(false)}
          onConfirm={applyImport}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// ImportCxpModal · Modal para seleccionar facturas de CxP a importar
// ════════════════════════════════════════════════════════════════════
function ImportCxpModal({
  pagos,
  rubros,
  importadosPaymentIds,
  existingImportados,
  rangeLabel,
  onCancel,
  onConfirm,
}) {
  const [showProgramados, setShowProgramados] = React.useState(true);
  const [showRealizados, setShowRealizados] = React.useState(true);

  // Estado por fila: { paymentId: { selected, rubro, segmento } }
  const initState = React.useMemo(() => {
    const m = {};
    const existingById = new Map(
      (existingImportados || []).map((r) => [r.paymentId, r])
    );
    pagos.forEach((p) => {
      const existing = existingById.get(p.paymentId);
      // Sugerencia inicial de rubro: si ya estaba importado usa su rubro,
      // si no, intenta coincidir con clasificacionSugerida; si no, vacío
      let rubroInicial = "";
      if (existing) {
        rubroInicial = existing.rubro || "";
      } else if (p.clasificacionSugerida) {
        const sug = String(p.clasificacionSugerida).toUpperCase();
        const found = rubros.find((r) => r.toUpperCase().includes(sug) || sug.includes(r.toUpperCase()));
        if (found) rubroInicial = found;
      }
      m[p.paymentId] = {
        selected: !!existing, // Si ya estaba importado, pre-marcado
        rubro: rubroInicial,
        segmento: existing?.segmento || "TAS",
      };
    });
    return m;
  }, [pagos, rubros, existingImportados]);

  const [rowState, setRowState] = React.useState(initState);
  React.useEffect(() => { setRowState(initState); }, [initState]);

  const updateRow = (paymentId, patch) => {
    setRowState((s) => ({ ...s, [paymentId]: { ...s[paymentId], ...patch } }));
  };

  // Filtros visibles
  const visiblePagos = pagos.filter((p) => {
    if (p.tipo === "programado" && !showProgramados) return false;
    if (p.tipo === "realizado" && !showRealizados) return false;
    return true;
  });

  // Agrupar pagos visibles por fecha (YYYY-MM-DD)
  const pagosPorDia = React.useMemo(() => {
    const map = new Map();
    visiblePagos.forEach((p) => {
      if (!map.has(p.fechaPago)) map.set(p.fechaPago, []);
      map.get(p.fechaPago).push(p);
    });
    // Ordenar por fecha asc
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [visiblePagos]);

  // Estado de qué días están expandidos (todos contraídos por defecto)
  const [expandedDays, setExpandedDays] = React.useState({});
  const toggleDay = (dia) =>
    setExpandedDays((s) => ({ ...s, [dia]: !s[dia] }));
  const expandAll = () => {
    const all = {};
    pagosPorDia.forEach(([d]) => { all[d] = true; });
    setExpandedDays(all);
  };
  const collapseAll = () => setExpandedDays({});

  // Master checkbox
  const allVisibleSelected =
    visiblePagos.length > 0 &&
    visiblePagos.every((p) => rowState[p.paymentId]?.selected);
  const toggleAll = () => {
    const newSel = !allVisibleSelected;
    const next = { ...rowState };
    visiblePagos.forEach((p) => {
      next[p.paymentId] = { ...next[p.paymentId], selected: newSel };
    });
    setRowState(next);
  };

  // Toggle todos los pagos de un día específico
  const toggleDayPagos = (fechaIso) => {
    const pagosDia = visiblePagos.filter((p) => p.fechaPago === fechaIso);
    const allSel = pagosDia.every((p) => rowState[p.paymentId]?.selected);
    const newSel = !allSel;
    const next = { ...rowState };
    pagosDia.forEach((p) => {
      next[p.paymentId] = { ...next[p.paymentId], selected: newSel };
    });
    setRowState(next);
  };

  // Total seleccionados
  const selectedRows = visiblePagos.filter((p) => rowState[p.paymentId]?.selected);
  const selectedTotal = selectedRows.reduce((s, p) => s + (+p.monto || 0), 0);
  const selectedCount = selectedRows.length;

  // Validación: todos los seleccionados deben tener rubro
  const missingRubro = selectedRows.filter((p) => !rowState[p.paymentId]?.rubro).length;

  const handleConfirm = () => {
    if (missingRubro > 0) {
      alert(`Faltan ${missingRubro} fila${missingRubro !== 1 ? "s" : ""} sin rubro asignado.`);
      return;
    }
    const rowsToImport = selectedRows.map((p) => ({
      paymentId: p.paymentId,
      invoiceId: p.invoiceId,
      proveedor: p.proveedor,
      folio: p.folio,
      concepto: p.concepto,
      monto: p.monto,
      moneda: p.moneda,
      fechaPago: p.fechaPago,
      tipo: p.tipo,
      rubro: rowState[p.paymentId].rubro,
      segmento: rowState[p.paymentId].segmento,
    }));
    onConfirm(rowsToImport);
  };

  const fmt = (n) =>
    "$" + Number(n || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const diaCorto = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    return `${dias[date.getDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
  };

  const countProg = pagos.filter((p) => p.tipo === "programado").length;
  const countReal = pagos.filter((p) => p.tipo === "realizado").length;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.5)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          width: "100%",
          maxWidth: 1400,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid #E2E8F0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>
              🔄 Importar pagos de Cartera
            </div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
              Semana del {rangeLabel} · TravelAirSolutions
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              color: "#94A3B8",
              padding: 4,
            }}
          >✕</button>
        </div>

        {/* FILTROS */}
        <div
          style={{
            padding: "12px 24px",
            background: "#F8FAFC",
            borderBottom: "1px solid #E2E8F0",
            display: "flex",
            gap: 16,
            alignItems: "center",
            flexWrap: "wrap",
            fontSize: 12,
          }}
        >
          <span style={{ fontWeight: 600, color: "#475569" }}>Mostrar:</span>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showProgramados}
              onChange={(e) => setShowProgramados(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            <span>📅 Programados ({countProg})</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showRealizados}
              onChange={(e) => setShowRealizados(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            <span>💰 Realizados ({countReal})</span>
          </label>
          <div style={{ flex: 1 }}></div>
          <button
            onClick={expandAll}
            style={{
              padding: "4px 10px",
              background: "white",
              border: "1px solid #CBD5E1",
              borderRadius: 4,
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >▾ Expandir todo</button>
          <button
            onClick={collapseAll}
            style={{
              padding: "4px 10px",
              background: "white",
              border: "1px solid #CBD5E1",
              borderRadius: 4,
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >▸ Contraer todo</button>
          <span style={{ fontSize: 11, color: "#94A3B8" }}>
            {pagos.length} pago{pagos.length !== 1 ? "s" : ""} encontrado{pagos.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* ACORDEÓN POR DÍA */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {visiblePagos.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "#94A3B8" }}>
              📭 No hay pagos en este rango de fechas
            </div>
          ) : (
            pagosPorDia.map(([fechaIso, pagosDia]) => {
              const isExpanded = !!expandedDays[fechaIso];
              const [y, m, d] = fechaIso.split("-").map(Number);
              const dt = new Date(y, m - 1, d);
              const diasNombre = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
              const totalDia = pagosDia.reduce((s, p) => s + (+p.monto || 0), 0);
              const allDiaSelected = pagosDia.every((p) => rowState[p.paymentId]?.selected);
              const someDiaSelected = pagosDia.some((p) => rowState[p.paymentId]?.selected);

              return (
                <div key={fechaIso} style={{ borderBottom: "1px solid #E2E8F0" }}>
                  {/* Header del día (clickeable) */}
                  <div
                    onClick={() => toggleDay(fechaIso)}
                    style={{
                      padding: "12px 20px",
                      background: "linear-gradient(180deg, #F1F5F9 0%, #E2E8F0 100%)",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    <span style={{ fontSize: 14, color: "#475569", width: 12 }}>
                      {isExpanded ? "▾" : "▸"}
                    </span>
                    <input
                      type="checkbox"
                      checked={allDiaSelected}
                      ref={(el) => { if (el) el.indeterminate = !allDiaSelected && someDiaSelected; }}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleDayPagos(fechaIso)}
                      style={{ cursor: "pointer" }}
                    />
                    <div style={{ flex: 1 }}>
                      <span style={{ color: "#0F172A", fontSize: 14, fontWeight: 600 }}>
                        📆 {diasNombre[dt.getDay()]} {String(d).padStart(2, "0")}/{String(m).padStart(2, "0")}
                      </span>
                      <span style={{ fontSize: 11, color: "#64748B", marginLeft: 10, fontWeight: 400 }}>
                        {pagosDia.length} pago{pagosDia.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "#B91C1C", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {fmt(totalDia)}
                    </div>
                  </div>

                  {/* Contenido expandido */}
                  {isExpanded && (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#042C53", color: "white", fontSize: 10 }}>
                          <th style={{ padding: "6px 10px", textAlign: "center", width: 32, fontWeight: 600 }}></th>
                          <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600 }}>PROVEEDOR / FOLIO</th>
                          <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600 }}>CONCEPTO</th>
                          <th style={{ padding: "6px 10px", textAlign: "center", fontWeight: 600 }}>TIPO</th>
                          <th style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600 }}>MONTO</th>
                          <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600 }}>SEGMENTO</th>
                          <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600 }}>RUBRO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagosDia.map((p, idx) => {
                          const state = rowState[p.paymentId] || { selected: false, rubro: "", segmento: "TAS" };
                          const isDup = importadosPaymentIds.has(p.paymentId);
                          return (
                            <tr
                              key={p.paymentId}
                              style={{
                                borderBottom: "0.5px solid #F1F5F9",
                                background: state.selected ? "#FFFBEB" : (idx % 2 === 1 ? "#F8FAFC" : "white"),
                              }}
                            >
                              <td style={{ padding: "8px 10px", textAlign: "center" }}>
                                <input
                                  type="checkbox"
                                  checked={state.selected}
                                  onChange={(e) => updateRow(p.paymentId, { selected: e.target.checked })}
                                  style={{ cursor: "pointer" }}
                                />
                              </td>
                              <td style={{ padding: "8px 10px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, color: "#0F172A" }}>{p.proveedor}</div>
                                    <div style={{ fontSize: 10, color: "#94A3B8", fontFamily: "ui-monospace, monospace" }}>{p.folio}</div>
                                  </div>
                                  {isDup && (
                                    <span
                                      title="Ya importado previamente — se actualizará al confirmar"
                                      style={{
                                        background: "#DBEAFE",
                                        color: "#1E40AF",
                                        fontSize: 9,
                                        fontWeight: 700,
                                        padding: "2px 6px",
                                        borderRadius: 3,
                                        whiteSpace: "nowrap",
                                      }}
                                    >🔁 YA IMPORTADO</span>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: "8px 10px", color: "#475569", fontSize: 11 }}>
                                {p.concepto || "—"}
                              </td>
                              <td style={{ padding: "8px 10px", textAlign: "center" }}>
                                {p.tipo === "programado" ? (
                                  <span style={{ background: "#FFE0B2", color: "#E65100", padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600 }}>📅 PROG</span>
                                ) : (
                                  <span style={{ background: "#BBF7D0", color: "#166534", padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600 }}>💰 REAL</span>
                                )}
                              </td>
                              <td style={{ padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#B91C1C", fontWeight: 600 }}>
                                {fmt(p.monto)} <span style={{ fontSize: 9, color: "#94A3B8" }}>{p.moneda}</span>
                              </td>
                              <td style={{ padding: "8px 10px" }}>
                                <select
                                  value={state.segmento}
                                  onChange={(e) => updateRow(p.paymentId, { segmento: e.target.value })}
                                  style={{
                                    fontSize: 11,
                                    padding: "3px 6px",
                                    border: "1px solid #CBD5E1",
                                    borderRadius: 4,
                                    cursor: "pointer",
                                    width: "100%",
                                  }}
                                >
                                  <option value="TAS">TAS</option>
                                  <option value="Transporte">Transporte</option>
                                </select>
                              </td>
                              <td style={{ padding: "8px 10px" }}>
                                <select
                                  value={state.rubro}
                                  onChange={(e) => updateRow(p.paymentId, { rubro: e.target.value })}
                                  style={{
                                    fontSize: 11,
                                    padding: "3px 6px",
                                    border: `1px solid ${(state.selected && !state.rubro) ? "#DC2626" : "#CBD5E1"}`,
                                    borderRadius: 4,
                                    cursor: "pointer",
                                    width: "100%",
                                    background: (state.selected && !state.rubro) ? "#FEE2E2" : "white",
                                  }}
                                >
                                  <option value="">— elegir —</option>
                                  {rubros.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* FOOTER */}
        <div
          style={{
            padding: "14px 24px",
            background: "#F8FAFC",
            borderTop: "1px solid #E2E8F0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: 13, color: "#64748B" }}>
            <strong>{selectedCount}</strong> seleccionado{selectedCount !== 1 ? "s" : ""}
            {selectedCount > 0 && (
              <>
                {" · Total: "}
                <span style={{ color: "#B91C1C", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {fmt(selectedTotal)}
                </span>
                {missingRubro > 0 && (
                  <span style={{ color: "#DC2626", marginLeft: 12, fontSize: 11 }}>
                    ⚠ {missingRubro} sin rubro
                  </span>
                )}
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={onCancel}
              style={{
                padding: "8px 16px",
                background: "#F1F5F9",
                color: "#0F172A",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >Cancelar</button>
            <button
              onClick={handleConfirm}
              disabled={selectedCount === 0 || missingRubro > 0}
              style={{
                padding: "8px 18px",
                background: (selectedCount === 0 || missingRubro > 0) ? "#94A3B8" : "#16A34A",
                color: "white",
                border: "none",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: (selectedCount === 0 || missingRubro > 0) ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >💧 Importar {selectedCount > 0 ? selectedCount : ""} pago{selectedCount !== 1 ? "s" : ""}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
