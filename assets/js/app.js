
/* =============================================================================
 * PARACEL · Instrumento de Doble Materialidad (v1.0)
 * Encuesta Externa + Evaluación Interna + Tablero + Reporte
 * Almacenamiento local (localStorage). Preparado para GitHub Pages sin backend.
 * ============================================================================= */

(function () {
  "use strict";

  const APP_KEY = "materialidad_instrument_app_v2";
  const LEGACY_APP_KEY = "materialidad_instrument_app_v1";
  const SYNC_QUEUE_KEY = "materialidad_instrument_sync_queue_v1";
  const CURRENT_SCHEMA_VERSION = 3;
  const DATA = {
    topics: [],
    scale: [],
    scenarios: [],
  };

  const GROUPS = [
    "Colaboradores",
    "Componente Forestal",
    "Componente Industrial",
    "Comunidades Indígenas",
    "Comisión de Seguimiento",
    "Grupo de interés en general",
  ];

  const HORIZONS = [
    { v: "", t: "Seleccione" },
    { v: "CORTO", t: "Corto" },
    { v: "MEDIO", t: "Medio" },
    { v: "LARGO", t: "Largo" },
  ];

  const DEFAULT_PARAMS = {
    tauImpact: 3.5,
    tauFin: 3.5,
    tauMaterial: 3.5,
    ruleDouble: "AND",
    wImpact: { severidad: 0.30, alcance: 0.25, irremediabilidad: 0.25, probabilidad: 0.20 },
    wFin: { impacto_financiero: 0.60, probabilidad_financiera: 0.40 },
    stakeWeightByN: true,
    groupFilter: "TODOS",
    legacyExpectationFactor: 25 / 12,
    legacyTopN: 27,
    legacyPWeights: { probabilidad: 0.65, probabilidad_financiera: 0.35 },
    legacySWeights: { severidad: 0.40, alcance: 0.30, irremediabilidad: 0.30 },
    legacyBWeights: { financiero: 0.70, relevancia_externa: 0.30 },
  };
  const COMPILED_MEASURE_ORDER = {
    relevancia: 1,
    impacto: 2,
    financiero: 3,
    promedio_internal: 4,
  };

  const GAS_URL = "https://script.google.com/macros/s/AKfycbx4I7BLRHUkwPKhzR-mHdveboNEUNn0XeYNP8hX99GF_FoCFwOla94cM2HW73A_cZ_hRA/exec";
  const OFFICIAL_APP_URL = "https://monitorimpactosocial.github.io/materialidadV2/";
  const PRIMARY_LOGIN_USER = "user";
  const PRIMARY_LOGIN_PASSWORD = "123";
  const OBSOLETE_INTERNAL_SEED_IDS = new Set([
    "ace41635-d886-45c0-92fc-31ec0bdee7a5",
    "f1cc6953-8b58-4bd8-ad97-e92b1398e096",
    "54823a13-24a0-4ade-87a7-5a7c4ff30f71",
    "c630d1ff-af1d-45f0-abe7-f81bf4668d57",
  ]);
  let COMPILED_FILTER_STATE = null;


// ---------------------------------------------------------------------------
// Sincronización Cloud (Google Sheets)
// ---------------------------------------------------------------------------
let isSyncing = false;
let configSyncTimer = null;

function showSyncPill(msg) {
  let p = document.getElementById("sync-pill");
  if (!p) {
    p = document.createElement("div");
    p.id = "sync-pill";
    p.style.position = "fixed";
    p.style.bottom = "20px";
    p.style.right = "20px";
    p.style.background = "var(--primary)";
    p.style.color = "white";
    p.style.padding = "8px 16px";
    p.style.borderRadius = "20px";
    p.style.fontSize = "13px";
    p.style.fontWeight = "bold";
    p.style.zIndex = "9999";
    p.style.boxShadow = "0 4px 6px -1px rgba(0,0,0,0.1)";
    p.style.transition = "opacity 0.3s";
    document.body.appendChild(p);
  }
  p.textContent = msg;
  p.style.opacity = "1";
}

function hideSyncPill() {
  const p = document.getElementById("sync-pill");
  if (p) p.style.opacity = "0";
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function loadSyncQueue() {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("No se pudo leer la cola de sincronización.", err);
    return [];
  }
}

function saveSyncQueue(queue) {
  try {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue || []));
  } catch (err) {
    console.warn("No se pudo guardar la cola de sincronización.", err);
  }
}

function enqueueSync(payload) {
  const queue = loadSyncQueue();
  queue.push({ ...payload, queuedAt: nowISO() });
  saveSyncQueue(queue);
}

async function postCloudPayload(payload) {
  const res = await fetchWithTimeout(GAS_URL, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "text/plain;charset=utf-8" }
  }, 15000);
  if (!res.ok) throw new Error(`Fallo al guardar (${res.status})`);
  return res;
}

async function fetchCloudDB() {
  showSyncPill("Conectando con la nube...");
  try {
    const r = await fetchWithTimeout(GAS_URL + "?t=" + Date.now(), {}, 12000);
    if (!r.ok) throw new Error("Network response was not ok");
    const data = await r.json();
    console.log("[fetchCloudDB] Datos recibidos del GAS:");
    console.log("[fetchCloudDB]   - internalAssessments:", data.internalAssessments ? data.internalAssessments.length : 0);
    console.log("[fetchCloudDB]   - externalResponses:", data.externalResponses ? data.externalResponses.length : 0);
    console.log("[fetchCloudDB]   - Primer internalAssessment:", data.internalAssessments && data.internalAssessments[0] ? { id: data.internalAssessments[0].id, area: data.internalAssessments[0].area } : "N/A");
    hideSyncPill();
    return data;
  } catch (err) {
    console.warn("Fallo al leer la nube:", err);
    showSyncPill("Modo offline");
    setTimeout(() => hideSyncPill(), 3000);
    return null;
  }
}

async function flushSyncQueue() {
  const queue = loadSyncQueue();
  if (!queue.length || isSyncing) return;

  isSyncing = true;
  showSyncPill(`Sincronizando pendientes (${queue.length})...`);
  const pending = [];

  for (const payload of queue) {
    try {
      await postCloudPayload(payload);
    } catch (err) {
      pending.push(payload);
    }
  }

  saveSyncQueue(pending);
  if (pending.length === 0) showSyncPill("Sincronización completa ✔");
  else showSyncPill(`Pendientes por sincronizar: ${pending.length}`);

  setTimeout(() => hideSyncPill(), 3500);
  isSyncing = false;
}

async function syncToCloudRecord(type, data) {
  const payload = { type, data };
  const payloadBytes = estimatePayloadBytes(payload);
  if (payloadBytes && payloadBytes > 200000) {
    console.warn(`Payload ${type} demasiado grande: ${payloadBytes} bytes.`);
  }

  if (isSyncing) {
    enqueueSync(payload);
    return;
  }

  isSyncing = true;
  showSyncPill("Guardando en la nube...");
  try {
    await postCloudPayload(payload);
    showSyncPill("Nube actualizada ✔");
  } catch (err) {
    console.error(`Fallo al sincronizar ${type}. Bytes aproximados: ${payloadBytes || 'NA'}`, err);
    enqueueSync(payload);
    showSyncPill("Guardado local, nube pendiente");
  } finally {
    setTimeout(() => hideSyncPill(), 3000);
    isSyncing = false;
  }
}

function scheduleConfigSync(db) {
  clearTimeout(configSyncTimer);
  configSyncTimer = setTimeout(() => {
    syncToCloudRecord("config", {
      params: db.params,
      editions: db.editions,
      currentEditionId: db.currentEditionId,
      updatedAt: db.updatedAt,
      version: db.version
    });
  }, 500);
}

// ---------------------------------------------------------------------------
// Utilidades
  // ---------------------------------------------------------------------------
  function uuidv4() {
    // RFC4122 v4 (simplificado)
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function nowISO() {
    const d = new Date();
    return d.toISOString();
  }

  function toDateStr(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  }

  function addYears(dateISO, years) {
    const d = new Date(dateISO);
    d.setFullYear(d.getFullYear() + years);
    return d.toISOString();
  }

  function clamp01(x) {
    const v = Number(x);
    if (!isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
  }

  function normalizeWeights(w) {
    const keys = Object.keys(w);
    const s = keys.reduce((a, k) => a + Number(w[k] || 0), 0);
    if (s <= 0) return w;
    const out = {};
    for (const k of keys) out[k] = Number(w[k] || 0) / s;
    return out;
  }

  function fmt(x, d = 2) {
    if (x === null || x === undefined || !isFinite(x)) return "";
    return Number(x).toFixed(d);
  }

  function downloadText(filename, content, mime = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadCSV(filename, rows) {
    if (!rows || rows.length === 0) {
      downloadText(filename, "");
      return;
    }
    const cols = Object.keys(rows[0]);
    const esc = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [];
    lines.push(cols.map(esc).join(","));
    for (const r of rows) {
      lines.push(cols.map((c) => esc(r[c])).join(","));
    }
    downloadText(filename, lines.join("\n"), "text/csv;charset=utf-8");
  }

  async function loadJSON(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
    return await res.json();
  }


async function loadOptionalJSON(path) {
  try {
    return await loadJSON(path);
  } catch {
    return null;
  }
}

function safeParseJSON(text, fallback = null) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

function cloneDeep(obj) {
  return obj === undefined ? undefined : JSON.parse(JSON.stringify(obj));
}

function sanitizeText(value, maxLen = 4000) {
  return String(value || "").trim().slice(0, maxLen);
}

function sanitizeRating(value) {
  const n = Number(value);
  if (!isFinite(n)) return null;
  if (n < 1 || n > 5) return null;
  return n;
}

function getOfficialAppUrl() {
  try {
    const currentUrl = new URL("./", window.location.href).href;
    if (/^https:\/\/monitorimpactosocial\.github\.io\//i.test(currentUrl)) return currentUrl;
  } catch (err) {
    console.warn("No se pudo inferir la URL publica actual.", err);
  }
  return OFFICIAL_APP_URL;
}

function sanitizeScaleValue(value, min, max) {
  const n = Number(value);
  if (!isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

function sanitizeBoundedNumber(value, min, max) {
  const n = Number(value);
  if (!isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function weightedAverage(items) {
  let num = 0;
  let den = 0;
  for (const item of items || []) {
    const value = Number(item && item.value);
    const weight = Number(item && item.weight);
    if (!isFinite(value) || !isFinite(weight) || weight <= 0) continue;
    num += value * weight;
    den += weight;
  }
  return den > 0 ? num / den : null;
}

function scaleRating5ToLegacy4(value) {
  const n = sanitizeBoundedNumber(value, 1, 5);
  if (n === null) return null;
  return 1 + ((n - 1) / 4) * 3;
}

function scaleShareToLegacy4(value) {
  const n = Number(value);
  if (!isFinite(n)) return null;
  const bounded = Math.max(0, Math.min(1, n));
  return 1 + bounded * 3;
}

function sanitizeLegacyYesNo(value) {
  return String(value || "").trim().toUpperCase() === "SI" ? "SI" : "NO";
}

function normalizeLegacyMatrixRow(row) {
  return {
    p: sanitizeBoundedNumber(row && row.p, 1, 5),
    s: sanitizeBoundedNumber(row && row.s, 1, 5),
    b: sanitizeBoundedNumber(row && row.b, 1, 5),
    legislacion: sanitizeLegacyYesNo(row && row.legislacion),
    grupos_relacionados: sanitizeText(row && row.grupos_relacionados, 800),
    e: sanitizeBoundedNumber(row && row.e, 1, 4),
    c: sanitizeBoundedNumber(row && row.c, 1, 4),
    f: sanitizeBoundedNumber(row && row.f, 1, 4),
  };
}

function isLegacyMatrixRowEmpty(row) {
  if (!row) return true;
  return row.p === null &&
    row.s === null &&
    row.b === null &&
    !row.grupos_relacionados &&
    row.e === null &&
    row.c === null &&
    row.f === null &&
    sanitizeLegacyYesNo(row.legislacion) === "NO";
}

function normalizeLegacyMatrix(raw) {
  const sourceRows = raw && typeof raw === "object" ? (raw.rowsByTheme || raw) : {};
  const rowsByTheme = {};
  Object.entries(sourceRows || {}).forEach(([temaId, row]) => {
    const clean = normalizeLegacyMatrixRow(row);
    if (!isLegacyMatrixRowEmpty(clean)) rowsByTheme[temaId] = clean;
  });
  return { rowsByTheme };
}

function mergeLegacyMatrix(baseMatrix, srcMatrix) {
  const out = normalizeLegacyMatrix(baseMatrix);
  const src = normalizeLegacyMatrix(srcMatrix);
  Object.entries(src.rowsByTheme || {}).forEach(([temaId, row]) => {
    out.rowsByTheme[temaId] = normalizeLegacyMatrixRow(row);
  });
  return out;
}

function getLegacyMatrixRow(db, temaId) {
  return normalizeLegacyMatrixRow(db && db.legacyMatrix && db.legacyMatrix.rowsByTheme ? db.legacyMatrix.rowsByTheme[temaId] : {});
}

function setLegacyMatrixRow(db, temaId, row) {
  if (!db.legacyMatrix) db.legacyMatrix = { rowsByTheme: {} };
  const clean = normalizeLegacyMatrixRow(row);
  if (isLegacyMatrixRowEmpty(clean)) delete db.legacyMatrix.rowsByTheme[temaId];
  else db.legacyMatrix.rowsByTheme[temaId] = clean;
  return clean;
}

function computeLegacyMatrixRow(row, factor) {
  const p = sanitizeBoundedNumber(row && row.p, 1, 5);
  const s = sanitizeBoundedNumber(row && row.s, 1, 5);
  const b = sanitizeBoundedNumber(row && row.b, 1, 5);
  const e = sanitizeBoundedNumber(row && row.e, 1, 4);
  const c = sanitizeBoundedNumber(row && row.c, 1, 4);
  const f = sanitizeBoundedNumber(row && row.f, 1, 4);
  const expectationFactor = Number(factor);

  const riesgo = p !== null && s !== null ? p * s : null;
  const oportunidad = p !== null && b !== null ? p * b : null;
  const significancia = riesgo !== null && oportunidad !== null ? riesgo + oportunidad : null;
  const madurez = e !== null && c !== null && f !== null ? e + c + f : null;
  const expectativas_total = madurez !== null && isFinite(expectationFactor) && expectationFactor > 0 ? madurez * expectationFactor : null;

  return {
    riesgo,
    oportunidad,
    significancia,
    madurez,
    expectativas_total,
    completa: significancia !== null && expectativas_total !== null,
    tiene_alguna_carga: [p, s, b, e, c, f].some((v) => v !== null) || !!sanitizeText(row && row.grupos_relacionados, 800),
  };
}

function estimatePayloadBytes(value) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return null;
  }
}

function persistLocalDB(db) {
  try {
    localStorage.setItem(APP_KEY, JSON.stringify(db));
    localStorage.removeItem(LEGACY_APP_KEY);
  } catch (err) {
    console.warn("No se pudo persistir la base local.", err);
    showSyncPill("Aviso, navegador sin espacio para guardar");
    setTimeout(() => hideSyncPill(), 3500);
  }
}

function normalizeEditionRow(row) {
  let id = sanitizeText(row && row.id ? row.id : String(new Date().getFullYear()), 120);
  // Si el ID generado es solamente el año actual (sin datos legítimos), usar "edicion-historica"
  const currentYear = String(new Date().getFullYear());
  if (id === currentYear && !(row && row.id)) {
    id = "edicion-historica";
  }
  return {
    id,
    name: sanitizeText(row && row.name ? row.name : `Edición ${new Date().getFullYear()}`, 120),
    startDate: row && row.startDate ? row.startDate : nowISO(),
    endDate: row && row.endDate ? row.endDate : null,
    status: row && row.status === "closed" ? "closed" : "open",
    nextDueDate: row && row.nextDueDate ? row.nextDueDate : addYears(row && row.startDate ? row.startDate : nowISO(), 2),
  };
}

function weightedMeanFromRow(row, weights, keys) {
  let num = 0;
  let den = 0;
  for (const key of keys) {
    const w = Number(weights[key] || 0);
    const v = sanitizeRating(row[key]);
    if (w > 0 && v !== null) {
      num += w * v;
      den += w;
    }
  }
  return den > 0 ? num / den : null;
}

function normalizeInternalTable(table, params) {
  const out = {};
  const topicIds = DATA.topics.length ? new Set(DATA.topics.map((t) => t.tema_id)) : null;
  const wImpact = normalizeWeights((params && params.wImpact) || DEFAULT_PARAMS.wImpact);
  const wFin = normalizeWeights((params && params.wFin) || DEFAULT_PARAMS.wFin);
  const validImpactKeys = ["severidad", "alcance", "irremediabilidad", "probabilidad"];
  const validFinKeys = ["impacto_financiero", "probabilidad_financiera"];

  Object.entries(table || {}).forEach(([tid, row]) => {
    if (topicIds && !topicIds.has(tid)) return;
    const safe = {
      impacto: sanitizeRating(row && row.impacto),
      financiero: sanitizeRating(row && row.financiero),
    };
    for (const key of validImpactKeys.concat(validFinKeys)) {
      const v = sanitizeRating(row && row[key]);
      if (v !== null) safe[key] = v;
    }
    if (row && row.horizonte) safe.horizonte = sanitizeText(row.horizonte, 20);
    if (safe.impacto === null) safe.impacto = weightedMeanFromRow(safe, wImpact, validImpactKeys);
    if (safe.financiero === null) safe.financiero = weightedMeanFromRow(safe, wFin, validFinKeys);
    if (safe.impacto !== null || safe.financiero !== null || validImpactKeys.some((k) => safe[k] !== undefined) || validFinKeys.some((k) => safe[k] !== undefined)) {
      out[tid] = safe;
    }
  });
  return out;
}

function normalizeExternalRow(row) {
  const topicIds = DATA.topics.length ? new Set(DATA.topics.map((t) => t.tema_id)) : null;
  const ratings = {};
  Object.entries((row && row.ratings) || {}).forEach(([k, v]) => {
    if (topicIds && !topicIds.has(k)) return;
    const sv = sanitizeRating(v);
    if (sv !== null) ratings[k] = sv;
  });
  return {
    id: sanitizeText(row && row.id ? row.id : uuidv4(), 120),
    ts: row && row.ts ? row.ts : nowISO(),
    editionId: sanitizeText(row && row.editionId ? row.editionId : "", 120),
    grupo: sanitizeText(row && row.grupo, 200),
    sector: sanitizeText(row && row.sector, 300),
    organizacion: sanitizeText(row && row.organizacion, 300),
    contacto: sanitizeText(row && row.contacto, 300),
    percepcion: sanitizeText(row && row.percepcion, 200),
    comentarios: sanitizeText(row && row.comentarios, 4000),
    ratings,
  };
}

function normalizeInternalRow(row, params) {
  return {
    id: sanitizeText(row && row.id ? row.id : uuidv4(), 120),
    ts: row && row.ts ? row.ts : nowISO(),
    editionId: sanitizeText(row && row.editionId ? row.editionId : "", 120),
    area: sanitizeText(row && row.area, 300),
    rol: sanitizeText(row && row.rol, 300),
    comentarios: sanitizeText(row && row.comentarios, 4000),
    table: normalizeInternalTable((row && row.table) || {}, params),
  };
}

function dedupeRows(rows, stampKey = "ts") {
  const map = new Map();
  (rows || []).forEach((row) => {
    if (!row || !row.id) return;
    const prev = map.get(row.id);
    if (!prev) {
      map.set(row.id, row);
      return;
    }
    const prevStamp = String(prev[stampKey] || "");
    const currStamp = String(row[stampKey] || "");
    if (currStamp >= prevStamp) map.set(row.id, row);
  });
  return Array.from(map.values()).sort((a, b) => String(a[stampKey] || "").localeCompare(String(b[stampKey] || "")));
}

function pruneObsoleteSeedData(db) {
  if (!db) return db;
  db.internalAssessments = (db.internalAssessments || []).filter((row) => !OBSOLETE_INTERNAL_SEED_IDS.has(String(row && row.id || "")));
  return db;
}

function migrateDB(raw) {
  if (!raw || typeof raw !== "object") return null;
  console.log("[migrateDB] ====== INICIANDO MIGRACIÓN ======");
  console.log("[migrateDB] raw.internalAssessments:", raw.internalAssessments ? raw.internalAssessments.length : 0);
  console.log("[migrateDB] raw.externalResponses:", raw.externalResponses ? raw.externalResponses.length : 0);
  
  const params = {
    ...cloneDeep(DEFAULT_PARAMS),
    ...(raw.params || {})
  };
  params.wImpact = normalizeWeights({ ...(DEFAULT_PARAMS.wImpact || {}), ...((raw.params && raw.params.wImpact) || {}) });
  params.wFin = normalizeWeights({ ...(DEFAULT_PARAMS.wFin || {}), ...((raw.params && raw.params.wFin) || {}) });
  params.legacyPWeights = normalizeWeights({ ...(DEFAULT_PARAMS.legacyPWeights || {}), ...((raw.params && raw.params.legacyPWeights) || {}) });
  params.legacySWeights = normalizeWeights({ ...(DEFAULT_PARAMS.legacySWeights || {}), ...((raw.params && raw.params.legacySWeights) || {}) });
  params.legacyBWeights = normalizeWeights({ ...(DEFAULT_PARAMS.legacyBWeights || {}), ...((raw.params && raw.params.legacyBWeights) || {}) });
  params.tauImpact = Number(raw.params && raw.params.tauImpact !== undefined ? raw.params.tauImpact : DEFAULT_PARAMS.tauImpact);
  params.tauFin = Number(raw.params && raw.params.tauFin !== undefined ? raw.params.tauFin : DEFAULT_PARAMS.tauFin);
  params.tauMaterial = Number(raw.params && raw.params.tauMaterial !== undefined ? raw.params.tauMaterial : DEFAULT_PARAMS.tauMaterial);
  params.ruleDouble = (raw.params && raw.params.ruleDouble === "OR") ? "OR" : "AND";
  params.groupFilter = sanitizeText(raw.params && raw.params.groupFilter ? raw.params.groupFilter : DEFAULT_PARAMS.groupFilter, 120) || "TODOS";
  params.stakeWeightByN = raw.params && raw.params.stakeWeightByN !== undefined ? !!raw.params.stakeWeightByN : DEFAULT_PARAMS.stakeWeightByN;
  params.legacyTopN = Number(raw.params && raw.params.legacyTopN !== undefined ? raw.params.legacyTopN : DEFAULT_PARAMS.legacyTopN);
  params.legacyExpectationFactor = Number(raw.params && raw.params.legacyExpectationFactor !== undefined ? raw.params.legacyExpectationFactor : DEFAULT_PARAMS.legacyExpectationFactor);
  if (!isFinite(params.legacyTopN) || params.legacyTopN <= 0) {
    params.legacyTopN = DEFAULT_PARAMS.legacyTopN;
  }
  if (!isFinite(params.legacyExpectationFactor) || params.legacyExpectationFactor <= 0) {
    params.legacyExpectationFactor = DEFAULT_PARAMS.legacyExpectationFactor;
  }

  let editions = Array.isArray(raw.editions) ? raw.editions.map(normalizeEditionRow) : [];
  if (editions.length === 0) {
    // Si no hay ediciones, crear la edición histórica default
    editions = [{
      id: "edicion-historica",
      name: "Edición Histórica (2025)",
      startDate: nowISO(),
      endDate: null,
      status: "open",
      nextDueDate: addYears(nowISO(), 2)
    }];
  } else {
    // Si hay ediciones pero ninguna es "edicion-historica", agregarlo como fallback
    if (!editions.some(e => e.id === "edicion-historica")) {
      console.warn("[migrateDB] No se encontró 'edicion-historica' en las ediciones del GAS. Agregando como fallback.");
      editions.unshift({
        id: "edicion-historica",
        name: "Edición Histórica (2025)",
        startDate: nowISO(),
        endDate: null,
        status: "open",
        nextDueDate: addYears(nowISO(), 2)
      });
    }
  }

  let currentEditionId = sanitizeText(raw.currentEditionId || "", 120);
  if (!currentEditionId || !editions.some((e) => e.id === currentEditionId)) {
    // Si currentEditionId no es válido, usar "edicion-historica" (la más confiable)
    currentEditionId = "edicion-historica";
  }

  const validEditionIds = new Set(editions.map((e) => e.id));

  const externalResponses = dedupeRows((raw.externalResponses || []).map((row) => {
    const normalized = normalizeExternalRow(row);
    if (!normalized.editionId || !validEditionIds.has(normalized.editionId)) {
      normalized.editionId = currentEditionId;
    }
    return normalized;
  }));

  const internalAssessments = dedupeRows((raw.internalAssessments || []).map((row) => {
    const normalized = normalizeInternalRow(row, params);
    if (!normalized.editionId || !validEditionIds.has(normalized.editionId)) {
      normalized.editionId = currentEditionId;
    }
    return normalized;
  }));

  const emails = typeof raw.emails === "object" && raw.emails ? {
    externa: sanitizeText(raw.emails.externa, 4000),
    interna: sanitizeText(raw.emails.interna, 4000),
  } : { externa: "", interna: "" };

  const legacyMatrix = normalizeLegacyMatrix(raw.legacyMatrix || {});

  console.log("[migrateDB] ANTES de pruneObsoleteSeedData:");
  console.log("[migrateDB]   - internalAssessments:", internalAssessments ? internalAssessments.length : 0);
  console.log("[migrateDB]   - externalResponses:", externalResponses ? externalResponses.length : 0);
  console.log("[migrateDB]   - currentEditionId:", currentEditionId);
  console.log("[migrateDB]   - OBSOLETE_INTERNAL_SEED_IDS count:", OBSOLETE_INTERNAL_SEED_IDS.size);
  
  const finalDB = pruneObsoleteSeedData({
    version: CURRENT_SCHEMA_VERSION,
    updatedAt: raw.updatedAt || nowISO(),
    editions,
    currentEditionId,
    externalResponses,
    internalAssessments,
    params,
    lastScenarioId: sanitizeText(raw.lastScenarioId || "base_moderado", 120) || "base_moderado",
    emails,
    legacyMatrix,
  });
  
  console.log("[migrateDB] DESPUÉS de pruneObsoleteSeedData:");
  console.log("[migrateDB]   - internalAssessments:", finalDB.internalAssessments ? finalDB.internalAssessments.length : 0);
  console.log("[migrateDB]   - externalResponses:", finalDB.externalResponses ? finalDB.externalResponses.length : 0);
  console.log("[migrateDB] ====== FIN MIGRACIÓN ======");
  
  return finalDB;
}

function mergeDBs(...sources) {
  const valid = sources.map(migrateDB).filter(Boolean);
  if (!valid.length) return null;

  const base = cloneDeep(valid[0]);
  for (let i = 1; i < valid.length; i++) {
    const src = valid[i];
    const editionMap = new Map(base.editions.map((e) => [e.id, e]));
    src.editions.forEach((e) => {
      const prev = editionMap.get(e.id);
      if (!prev || String(e.startDate || "") >= String(prev.startDate || "")) editionMap.set(e.id, e);
    });
    base.editions = Array.from(editionMap.values()).sort((a, b) => String(a.startDate || "").localeCompare(String(b.startDate || "")));
    base.externalResponses = dedupeRows([...(base.externalResponses || []), ...(src.externalResponses || [])]);
    base.internalAssessments = dedupeRows([...(base.internalAssessments || []), ...(src.internalAssessments || [])]);
    base.legacyMatrix = mergeLegacyMatrix(base.legacyMatrix, src.legacyMatrix);
    if (String(src.updatedAt || "") >= String(base.updatedAt || "")) {
      base.params = src.params;
      base.lastScenarioId = src.lastScenarioId;
      base.currentEditionId = src.currentEditionId || base.currentEditionId;
      base.emails = src.emails || base.emails;
      base.updatedAt = src.updatedAt;
    }
  }

  if (!base.editions.some((e) => e.id === base.currentEditionId)) {
    base.currentEditionId = base.editions[0].id;
  }
  base.version = CURRENT_SCHEMA_VERSION;
  return base;
}

function loadLocalDB() {
  const primary = safeParseJSON(localStorage.getItem(APP_KEY), null);
  const legacy = safeParseJSON(localStorage.getItem(LEGACY_APP_KEY), null);
  return mergeDBs(primary, legacy);
}

function getCurrentEdition(db) {
  return (db && db.editions || []).find((e) => e.id === db.currentEditionId) || null;
}

function isEditionOpen(db, editionId = null) {
  const id = editionId || (db ? db.currentEditionId : null);
  const edition = (db && db.editions || []).find((e) => e.id === id);
  return !!(edition && edition.status === "open");
}


// ---------------------------------------------------------------------------
// Base en Memoria (offline-first con sincronización diferida)
// ---------------------------------------------------------------------------
let ACTIVE_DB = null;

function saveDB(db, options = {}) {
  const safeDb = migrateDB(db) || migrateDB({});
  safeDb.updatedAt = new Date().toISOString();
  ACTIVE_DB = safeDb;
  persistLocalDB(safeDb);
  if (!options.skipConfigSync) scheduleConfigSync(safeDb);
  return safeDb;
}

function ensureDB() {
  let db = ACTIVE_DB || loadLocalDB();
  if (!db) {
    db = migrateDB({
      version: CURRENT_SCHEMA_VERSION,
      editions: [],
      currentEditionId: null,
      externalResponses: [],
      internalAssessments: [],
      params: cloneDeep(DEFAULT_PARAMS),
      lastScenarioId: "base_moderado",
      emails: { externa: "", interna: "" },
      legacyMatrix: { rowsByTheme: {} }
    });
  }

  if (!db.currentEditionId || !db.editions.some((e) => e.id === db.currentEditionId)) {
    db.currentEditionId = db.editions[0].id;
  }

  saveDB(db, { skipConfigSync: true });
  return ACTIVE_DB;
}


  // ---------------------------------------------------------------------------
  // Cálculo de indicadores
  // ---------------------------------------------------------------------------
  function computeStakeholderByTheme(db, editionId) {
    // Devuelve: map tema_id -> { n, mean_pool, mean_equal_groups, p_ge4, p_eq5, by_group }
    const topics = DATA.topics.map((t) => t.tema_id);
    const out = {};
    for (const tid of topics) {
      out[tid] = {
        tema_id: tid,
        n: 0,
        sum: 0,
        n_ge4: 0,
        n_eq5: 0,
        by_group: {}, // group -> {n,sum,mean}
      };
      for (const g of GROUPS) out[tid].by_group[g] = { n: 0, sum: 0, mean: null };
    }

    const rows = db.externalResponses.filter((r) => r.editionId === editionId);
    for (const r of rows) {
      const g = r.grupo || "";
      const ratings = r.ratings || {};
      for (const tid of topics) {
        const v = Number(ratings[tid]);
        if (!isFinite(v)) continue;
        out[tid].n += 1;
        out[tid].sum += v;
        if (v >= 4) out[tid].n_ge4 += 1;
        if (v === 5) out[tid].n_eq5 += 1;

        if (out[tid].by_group[g]) {
          out[tid].by_group[g].n += 1;
          out[tid].by_group[g].sum += v;
        }
      }
    }

    for (const tid of topics) {
      const o = out[tid];
      const mean_pool = o.n > 0 ? o.sum / o.n : null;
      let means = [];
      for (const g of GROUPS) {
        const bg = o.by_group[g];
        bg.mean = bg.n > 0 ? bg.sum / bg.n : null;
        if (bg.mean !== null) means.push(bg.mean);
      }
      const mean_equal_groups = means.length > 0 ? means.reduce((a, b) => a + b, 0) / means.length : null;
      o.mean_pool = mean_pool;
      o.mean_equal_groups = mean_equal_groups;
      o.p_ge4 = o.n > 0 ? o.n_ge4 / o.n : null;
      o.p_eq5 = o.n > 0 ? o.n_eq5 / o.n : null;
    }
    return out;
  }


function computeInternalByTheme(db, editionId, params) {
  // Devuelve: tema_id -> promedios de dims y scores
  const topics = DATA.topics.map((t) => t.tema_id);
  const out = {};
  const wImpact = normalizeWeights((params && params.wImpact) || DEFAULT_PARAMS.wImpact);
  const wFin = normalizeWeights((params && params.wFin) || DEFAULT_PARAMS.wFin);
  const subdimensionKeys = ["severidad", "alcance", "irremediabilidad", "probabilidad", "impacto_financiero", "probabilidad_financiera"];

  for (const tid of topics) {
    out[tid] = {
      tema_id: tid,
      n: 0,
      dims: {
        impacto: { n: 0, sum: 0, mean: null },
        financiero: { n: 0, sum: 0, mean: null }
      },
      subdims: Object.fromEntries(subdimensionKeys.map((key) => [key, { n: 0, sum: 0, mean: null }])),
    };
  }

  const rows = db.internalAssessments.filter((r) => r.editionId === editionId);
  for (const r of rows) {
    const table = r.table || {};
    for (const tid of topics) {
      const row = table[tid];
      if (!row) continue;

      let imp = sanitizeRating(row.impacto);
      let fin = sanitizeRating(row.financiero);
      let any = false;

      if (imp === null) {
        imp = weightedMeanFromRow(row, wImpact, ["severidad", "alcance", "irremediabilidad", "probabilidad"]);
      }
      if (fin === null) {
        fin = weightedMeanFromRow(row, wFin, ["impacto_financiero", "probabilidad_financiera"]);
      }

      for (const key of subdimensionKeys) {
        const value = sanitizeRating(row[key]);
        if (value === null) continue;
        out[tid].subdims[key].n += 1;
        out[tid].subdims[key].sum += Number(value);
      }

      if (imp !== null) {
        out[tid].dims.impacto.n += 1;
        out[tid].dims.impacto.sum += Number(imp);
        any = true;
      }
      if (fin !== null) {
        out[tid].dims.financiero.n += 1;
        out[tid].dims.financiero.sum += Number(fin);
        any = true;
      }
      if (any) out[tid].n += 1;
    }
  }

  for (const tid of topics) {
    for (const k of Object.keys(out[tid].dims)) {
      const d = out[tid].dims[k];
      d.mean = d.n > 0 ? d.sum / d.n : null;
    }
    for (const key of Object.keys(out[tid].subdims)) {
      const d = out[tid].subdims[key];
      d.mean = d.n > 0 ? d.sum / d.n : null;
    }
  }
  return out;
}

function computeScores(db) {

    const editionId = db.currentEditionId;
    const params = getParams(db);

    const stake = computeStakeholderByTheme(db, editionId);
    const internal = computeInternalByTheme(db, editionId, params);

    const rows = [];
    for (const t of DATA.topics) {
      const tid = t.tema_id;

      const stakeMean = params.stakeWeightByN ? stake[tid].mean_pool : stake[tid].mean_equal_groups;

      const di = internal[tid].dims;

      const impactScore = di.impacto.mean !== null ? di.impacto.mean : null;
      const finScore = di.financiero.mean !== null ? di.financiero.mean : null;

      const isImpactMat = impactScore !== null ? impactScore >= params.tauImpact : false;
      const isFinMat = finScore !== null ? finScore >= params.tauFin : false;
      const isDouble = params.ruleDouble === "AND" ? isImpactMat && isFinMat : isImpactMat || isFinMat;
      const tau = params.tauMaterial !== undefined ? params.tauMaterial : DEFAULT_PARAMS.tauMaterial;
      const isMaterial = stakeMean !== null && impactScore !== null
        ? (stakeMean >= tau && impactScore >= tau)
        : false;

      rows.push({
        tema_id: tid,
        tema_nombre: t.tema_nombre,
        stakeholder_mean: stakeMean,
        stakeholder_n: stake[tid].n,
        p_ge4: stake[tid].p_ge4,
        p_eq5: stake[tid].p_eq5,
        impact_score: impactScore,
        fin_score: finScore,
        impact_mat: isImpactMat,
        fin_mat: isFinMat,
        double_mat: isDouble,
        is_material: isMaterial,
      });
    }

    // Filtro por grupo para visualizaciones (solo afecta stakeholder_mean si se elige un grupo)
    const gf = params.groupFilter;
    if (gf && gf !== "TODOS") {
      for (const r of rows) {
        const bg = stake[r.tema_id].by_group[gf];
        r.stakeholder_mean = bg && bg.mean !== null ? bg.mean : null;
        r.stakeholder_n = bg ? bg.n : 0;
        r.p_ge4 = null;
        r.p_eq5 = null;
      }
    }

    // Orden para tablas
    rows.sort((a, b) => {
      const am = a.stakeholder_mean ?? -1;
      const bm = b.stakeholder_mean ?? -1;
      if (bm !== am) return bm - am;
      const ai = a.impact_score ?? -1;
      const bi = b.impact_score ?? -1;
      if (bi !== ai) return bi - ai;
      const af = a.fin_score ?? -1;
      const bf = b.fin_score ?? -1;
      return bf - af;
    });

    return { rows, stake, internal };
  }

  function computeLegacyMatrix(db) {
    const params = getParams(db);
    const factor = Number(params.legacyExpectationFactor || DEFAULT_PARAMS.legacyExpectationFactor);
    const safeFactor = isFinite(factor) && factor > 0 ? factor : DEFAULT_PARAMS.legacyExpectationFactor;
    const editionId = db.currentEditionId;
    const stake = computeStakeholderByTheme(db, editionId);
    const internal = computeInternalByTheme(db, editionId, params);
    const legacyPWeights = normalizeWeights((params && params.legacyPWeights) || DEFAULT_PARAMS.legacyPWeights);
    const legacySWeights = normalizeWeights((params && params.legacySWeights) || DEFAULT_PARAMS.legacySWeights);
    const legacyBWeights = normalizeWeights((params && params.legacyBWeights) || DEFAULT_PARAMS.legacyBWeights);

    const rows = DATA.topics.map((topic) => {
      const tid = topic.tema_id;
      const manual = getLegacyMatrixRow(db, tid);
      const ext = stake[tid] || { by_group: {} };
      const int = internal[tid] || { dims: {}, subdims: {} };
      const stakeholderMean = params.stakeWeightByN ? ext.mean_pool : ext.mean_equal_groups;
      const top2Box = ext.p_ge4;
      const activeGroups = GROUPS.filter((group) => ext.by_group && ext.by_group[group] && ext.by_group[group].n > 0);
      const groupCoverage = GROUPS.length ? activeGroups.length / GROUPS.length : null;
      const impactMean = int.dims && int.dims.impacto ? int.dims.impacto.mean : null;
      const finMean = int.dims && int.dims.financiero ? int.dims.financiero.mean : null;
      const probSocial = int.subdims && int.subdims.probabilidad && int.subdims.probabilidad.mean !== null ? int.subdims.probabilidad.mean : impactMean;
      const probFinanciera = int.subdims && int.subdims.probabilidad_financiera && int.subdims.probabilidad_financiera.mean !== null ? int.subdims.probabilidad_financiera.mean : finMean;
      const severidad = int.subdims && int.subdims.severidad && int.subdims.severidad.mean !== null ? int.subdims.severidad.mean : impactMean;
      const alcance = int.subdims && int.subdims.alcance && int.subdims.alcance.mean !== null ? int.subdims.alcance.mean : impactMean;
      const irremediabilidad = int.subdims && int.subdims.irremediabilidad && int.subdims.irremediabilidad.mean !== null ? int.subdims.irremediabilidad.mean : impactMean;
      const impactoFinanciero = int.subdims && int.subdims.impacto_financiero && int.subdims.impacto_financiero.mean !== null ? int.subdims.impacto_financiero.mean : finMean;

      const pSuggested = weightedAverage([
        { value: probSocial, weight: legacyPWeights.probabilidad },
        { value: probFinanciera, weight: legacyPWeights.probabilidad_financiera },
      ]);

      const sSuggested = weightedAverage([
        { value: severidad, weight: legacySWeights.severidad },
        { value: alcance, weight: legacySWeights.alcance },
        { value: irremediabilidad, weight: legacySWeights.irremediabilidad },
      ]);

      const bSuggested = weightedAverage([
        { value: impactoFinanciero, weight: legacyBWeights.financiero },
        { value: stakeholderMean, weight: legacyBWeights.relevancia_externa },
      ]);

      const p = manual.p !== null ? manual.p : pSuggested;
      const s = manual.s !== null ? manual.s : sSuggested;
      const b = manual.b !== null ? manual.b : bSuggested;

      const e = scaleRating5ToLegacy4(stakeholderMean);
      const c = scaleShareToLegacy4(top2Box);
      const f = scaleShareToLegacy4(groupCoverage);

      const calc = computeLegacyMatrixRow({ p, s, b, e, c, f, grupos_relacionados: activeGroups.join(", ") }, safeFactor);

      return {
        tema_id: topic.tema_id,
        tema_nombre: topic.tema_nombre,
        stakeholder_mean: stakeholderMean,
        top2box: top2Box,
        active_groups_count: activeGroups.length,
        active_groups_share: groupCoverage,
        grupos_relacionados: activeGroups.join(", "),
        grupos_resumen: activeGroups.length ? `${activeGroups.length}/${GROUPS.length}` : "",
        prob_social: probSocial,
        prob_financiera: probFinanciera,
        severidad,
        alcance,
        irremediabilidad,
        impacto_financiero: impactoFinanciero,
        score_impacto: impactMean,
        score_financiero: finMean,
        p_sugerido: pSuggested,
        s_sugerido: sSuggested,
        b_sugerido: bSuggested,
        p_manual: manual.p,
        s_manual: manual.s,
        b_manual: manual.b,
        p_origen: manual.p !== null ? "manual" : "sugerido",
        s_origen: manual.s !== null ? "manual" : "sugerido",
        b_origen: manual.b !== null ? "manual" : "sugerido",
        ajustes_manuales: [manual.p, manual.s, manual.b].filter((value) => value !== null).length,
        p,
        s,
        b,
        legislacion: "",
        e,
        c,
        f,
        factor: safeFactor,
        ...calc,
        prioridad_total: calc.significancia !== null && calc.expectativas_total !== null ? calc.significancia + calc.expectativas_total : null,
      };
    });

    const valid = rows.filter((row) => row.completa);
    const sortedValidRows = [...valid].sort((a, b) => {
      const ap = a.prioridad_total ?? -1;
      const bp = b.prioridad_total ?? -1;
      if (bp !== ap) return bp - ap;
      return (b.significancia ?? -1) - (a.significancia ?? -1);
    });
    const requestedTopN = Math.max(1, Math.round(Number(params.legacyTopN || DEFAULT_PARAMS.legacyTopN)));
    const topN = Math.min(DATA.topics.length || requestedTopN, requestedTopN);
    const displayRows = sortedValidRows.slice(0, topN);
    const axisMaxImpact = 52;
    const axisMaxExpect = 30;
    const impactBands = [axisMaxImpact / 3, (axisMaxImpact / 3) * 2];
    const expectBands = [axisMaxExpect / 3, (axisMaxExpect / 3) * 2];
    const refImpact = impactBands[1];
    const refExpect = expectBands[1];

    rows.forEach((row) => {
      if (row.significancia === null || row.expectativas_total === null) {
        row.cuadrante = "";
        return;
      }
      const impactLevel = row.significancia >= impactBands[1] ? "ALTO" : row.significancia >= impactBands[0] ? "MEDIO" : "BAJO";
      const expectLevel = row.expectativas_total >= expectBands[1] ? "ALTO" : row.expectativas_total >= expectBands[0] ? "MEDIO" : "BAJO";
      row.cuadrante = `${impactLevel}-${expectLevel}`;
    });

    return {
      rows,
      validRows: valid,
      sortedValidRows,
      displayRows,
      topN,
      factor: safeFactor,
      axisMaxImpact,
      axisMaxExpect,
      impactBands,
      expectBands,
      refImpact,
      refExpect,
      configuredThemes: rows.filter((row) => row.tiene_alguna_carga).length,
      completeThemes: valid.length,
      highHighCount: rows.filter((row) => row.cuadrante === "ALTO-ALTO").length,
    };
  }

  function renderLegacyDriversTable(db) {
    const tbody = document.querySelector("#tableLegacyDrivers tbody");
    if (!tbody) return;

    const legacy = computeLegacyMatrix(db);
    const sorted = legacy.displayRows;

    tbody.innerHTML = sorted.map((row) => `
      <tr class="topic-block" data-tid="${escapeHTML(row.tema_id)}">
        <td class="legacy-topic-cell"><strong>${escapeHTML(row.tema_id)}</strong> · ${escapeHTML(row.tema_nombre)}</td>
        <td class="right legacy-computed">${row.stakeholder_mean === null ? "" : fmt(row.stakeholder_mean, 2)}</td>
        <td class="right legacy-computed">${row.top2box === null ? "" : `${fmt(row.top2box * 100, 1)}%`}</td>
        <td class="right legacy-computed">${row.active_groups_share === null ? "" : `${fmt(row.active_groups_share * 100, 1)}%`}</td>
        <td class="legacy-input-cell">
          <input class="legacy-number ${row.p_manual !== null ? "is-manual" : ""}" data-field="p" type="number" min="1" max="5" step="0.01" value="${row.p === null ? "" : fmt(row.p, 2)}" data-suggested="${row.p_sugerido === null ? "" : fmt(row.p_sugerido, 2)}" />
          <div class="legacy-suggestion">Sug. ${row.p_sugerido === null ? "N/D" : fmt(row.p_sugerido, 2)}</div>
        </td>
        <td class="legacy-input-cell">
          <input class="legacy-number ${row.s_manual !== null ? "is-manual" : ""}" data-field="s" type="number" min="1" max="5" step="0.01" value="${row.s === null ? "" : fmt(row.s, 2)}" data-suggested="${row.s_sugerido === null ? "" : fmt(row.s_sugerido, 2)}" />
          <div class="legacy-suggestion">Sug. ${row.s_sugerido === null ? "N/D" : fmt(row.s_sugerido, 2)}</div>
        </td>
        <td class="legacy-input-cell">
          <input class="legacy-number ${row.b_manual !== null ? "is-manual" : ""}" data-field="b" type="number" min="1" max="5" step="0.01" value="${row.b === null ? "" : fmt(row.b, 2)}" data-suggested="${row.b_sugerido === null ? "" : fmt(row.b_sugerido, 2)}" />
          <div class="legacy-suggestion">Sug. ${row.b_sugerido === null ? "N/D" : fmt(row.b_sugerido, 2)}</div>
        </td>
        <td class="right legacy-computed">${row.e === null ? "" : fmt(row.e, 2)}</td>
        <td class="right legacy-computed">${row.c === null ? "" : fmt(row.c, 2)}</td>
        <td class="right legacy-computed">${row.f === null ? "" : fmt(row.f, 2)}</td>
        <td class="right legacy-computed"><strong>${row.significancia === null ? "" : fmt(row.significancia, 2)}</strong></td>
        <td class="right legacy-computed">${row.expectativas_total === null ? "" : fmt(row.expectativas_total, 2)}</td>
        <td class="legacy-row-actions">
          <button class="btn btn-ghost btn-small" type="button" data-reset-legacy-topic="${escapeHTML(row.tema_id)}">Auto</button>
        </td>
      </tr>
    `).join("");

    const progress = document.getElementById("legacyProgress");
    const progressBar = document.getElementById("legacyProgressBar");
    if (progress) progress.textContent = `${legacy.completeThemes} / ${DATA.topics.length}`;
    if (progressBar) progressBar.value = legacy.completeThemes;
  }

  function renderLegacyResultsTable(tableId, rows) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    if (!tbody) return;

    tbody.innerHTML = "";
    for (const row of rows) {
      const tr = document.createElement("tr");
      tr.className = "topic-block";
      tr.setAttribute("data-tid", row.tema_id);
      tr.innerHTML = `
        <td class="legacy-topic-cell">${escapeHTML(row.tema_id)} · ${escapeHTML(row.tema_nombre)}</td>
        <td class="right">${row.significancia === null ? "" : fmt(row.significancia, 2)}</td>
        <td class="right">${row.expectativas_total === null ? "" : fmt(row.expectativas_total, 2)}</td>
        <td class="right">${row.riesgo === null ? "" : fmt(row.riesgo, 2)}</td>
        <td class="right">${row.oportunidad === null ? "" : fmt(row.oportunidad, 2)}</td>
        <td>${escapeHTML(row.cuadrante || "")}</td>
        <td title="${escapeHTML(row.grupos_relacionados || "")}">${escapeHTML(row.grupos_resumen || "")}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderLegacySummary(db) {
    const legacy = computeLegacyMatrix(db);
    const avgImpact = averageOf(legacy.validRows.map((row) => row.significancia));
    const avgExpect = averageOf(legacy.validRows.map((row) => row.expectativas_total));

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    setText("legacyConfiguredThemes", String(legacy.configuredThemes));
    setText("legacyCompleteThemes", String(legacy.completeThemes));
    setText("legacyAvgImpact", avgImpact === null ? "N/D" : fmt(avgImpact, 2));
    setText("legacyAvgExpect", avgExpect === null ? "N/D" : fmt(avgExpect, 2));
    setText("legacyHighHigh", String(legacy.highHighCount));
    setText("legacyRefImpact", legacy.impactBands ? legacy.impactBands.map((value) => fmt(value, 1)).join(" | ") : "N/D");
    setText("legacyRefExpect", legacy.expectBands ? legacy.expectBands.map((value) => fmt(value, 1)).join(" | ") : "N/D");

    renderLegacyResultsTable("tableLegacyResults", legacy.displayRows);
  }

  function renderLegacyMatrixPlot(db, targetId) {
    const target = document.getElementById(targetId);
    if (!target) return;

    const legacy = computeLegacyMatrix(db);
    if (!legacy.displayRows.length) {
      try { Plotly.purge(target); } catch {}
      target.innerHTML = `<div class="muted">Se requieren respuestas externas e internas suficientes para reconstruir la matriz clásica.</div>`;
      return;
    }

    const x = legacy.displayRows.map((row) => row.significancia);
    const y = legacy.displayRows.map((row) => row.expectativas_total);
    const text = legacy.displayRows.map((row) => `${row.tema_id} · ${row.tema_nombre}`);
    const palette = ["#9cc34d", "#f89a46", "#43aac8", "#ffb81c", "#7b61a6", "#ff4f12", "#38a038", "#e25be8", "#63dfe5", "#4f81bd"];
    const color = legacy.displayRows.map((_, index) => palette[index % palette.length]);
    const xLower = legacy.impactBands[0];
    const xUpper = legacy.impactBands[1];
    const yLower = legacy.expectBands[0];
    const yUpper = legacy.expectBands[1];
    const maxX = legacy.axisMaxImpact;
    const maxY = legacy.axisMaxExpect;
    const isPrint = target.classList.contains("plot-print");

    // Calcular rango dinámico basado en datos reales + padding
    const xMin = Math.min(...x);
    const xMax = Math.max(...x);
    const yMin = Math.min(...y);
    const yMax = Math.max(...y);
    const xSpread = Math.max(xMax - xMin, 2);
    const ySpread = Math.max(yMax - yMin, 2);
    const xPad = xSpread * 0.25;
    const yPad = ySpread * 0.25;
    const axisX0 = Math.max(0, xMin - xPad);
    const axisX1 = Math.min(maxX, xMax + xPad);
    const axisY0 = Math.max(0, yMin - yPad);
    const axisY1 = Math.min(maxY, yMax + yPad);

    const data = [{
      x,
      y,
      text,
      mode: "markers",
      type: "scatter",
      marker: { size: isPrint ? 22 : 24, color, opacity: 0.96, line: { width: 2, color: "#ffffff" } },
      hovertemplate: "<b>%{text}</b><br>Impacto en la estrategia: %{x:.2f}<br>Expectativas grupos de interés: %{y:.2f}<br>Clasificación: %{customdata}<extra></extra>",
      customdata: legacy.displayRows.map((row) => row.cuadrante || "")
    }];

    // Líneas de banda (solo las visibles dentro del rango dinámico)
    const shapes = [];
    if (xLower >= axisX0 && xLower <= axisX1)
      shapes.push({ type: "line", x0: xLower, x1: xLower, y0: axisY0, y1: axisY1, line: { color: "#111111", width: 2, dash: "dash" } });
    if (xUpper >= axisX0 && xUpper <= axisX1)
      shapes.push({ type: "line", x0: xUpper, x1: xUpper, y0: axisY0, y1: axisY1, line: { color: "#111111", width: 2, dash: "dash" } });
    if (yLower >= axisY0 && yLower <= axisY1)
      shapes.push({ type: "line", x0: axisX0, x1: axisX1, y0: yLower, y1: yLower, line: { color: "#111111", width: 2, dash: "dash" } });
    if (yUpper >= axisY0 && yUpper <= axisY1)
      shapes.push({ type: "line", x0: axisX0, x1: axisX1, y0: yUpper, y1: yUpper, line: { color: "#111111", width: 2, dash: "dash" } });

    // Anotaciones de cuadrante basadas en el rango visible
    const xMid = (axisX0 + axisX1) / 2;
    const yMid = (axisY0 + axisY1) / 2;
    const annotations = [
      { x: xMid, y: axisY0 + 0.1, text: `<b>Ref. Impacto: ${xLower.toFixed(1)} | ${xUpper.toFixed(1)}</b>`, xanchor: "center", yanchor: "bottom", showarrow: false, font: { size: 11, color: "#0070c9" } },
      { x: axisX0 + 0.1, y: yMid, text: `<b>Ref. Expect: ${yLower.toFixed(1)} | ${yUpper.toFixed(1)}</b>`, textangle: -90, xanchor: "left", yanchor: "middle", showarrow: false, font: { size: 11, color: "#0070c9" } },
    ];

    const layout = {
      title: { text: "<b>GRÁFICO DE MATERIALIDAD</b>", x: 0.5, xanchor: "center", font: { size: isPrint ? 20 : 24, color: "#111111" } },
      height: isPrint ? 520 : 620,
      margin: { l: 88, r: 24, t: 66, b: 82 },
      xaxis: {
        title: { text: "<b>IMPACTO EN LA ESTRATEGIA</b>", standoff: 18, font: { size: 14, color: "#111111" } },
        range: [axisX0, axisX1],
        tickfont: { size: 11, color: "#111111" },
        gridcolor: "#c9cdd3",
        gridwidth: 1,
        linecolor: "#9ca3af",
        linewidth: 1,
        mirror: true,
        zeroline: false,
      },
      yaxis: {
        title: { text: "<b>EXPECTATIVAS GRUPOS DE INTERÉS</b>", standoff: 12, font: { size: 14, color: "#111111" } },
        range: [axisY0, axisY1],
        tickfont: { size: 11, color: "#111111" },
        gridcolor: "#c9cdd3",
        gridwidth: 1,
        linecolor: "#9ca3af",
        linewidth: 1,
        mirror: true,
        zeroline: false,
      },
      shapes,
      annotations,
      paper_bgcolor: "#ffffff",
      plot_bgcolor: "#ffffff",
      showlegend: false
    };

    Plotly.newPlot(targetId, data, layout, { displayModeBar: false, responsive: true });
  }

  function renderLegacyRankingPlot(db, targetId) {
    const target = document.getElementById(targetId);
    if (!target) return;

    const legacy = computeLegacyMatrix(db);
    const rows = legacy.displayRows;

    if (!rows.length) {
      try { Plotly.purge(target); } catch {}
      target.innerHTML = `<div class="muted">No hay suficientes temas completos para construir el ranking clásico.</div>`;
      return;
    }

    const labels = rows.map((row) => `${row.tema_id} · ${row.tema_nombre}`);
    const impactos = rows.map((row) => row.significancia);
    const expectativas = rows.map((row) => row.expectativas_total);
    const height = Math.max(460, rows.length * 28);

    const data = [
      {
        x: impactos,
        y: labels,
        type: "bar",
        orientation: "h",
        name: "Impactos",
        marker: { color: "#14532d" },
        hovertemplate: "<b>%{y}</b><br>Impactos: %{x:.2f}<extra></extra>",
      },
      {
        x: expectativas,
        y: labels,
        type: "bar",
        orientation: "h",
        name: "Expectativas",
        marker: { color: "#0f766e" },
        hovertemplate: "<b>%{y}</b><br>Expectativas: %{x:.2f}<extra></extra>",
      },
    ];

    const layout = {
      margin: { l: 210, r: 20, t: 10, b: 50 },
      height,
      barmode: "group",
      xaxis: { title: "Puntaje", gridcolor: "rgba(2,44,34,0.10)", zeroline: false },
      yaxis: { automargin: true, autorange: "reversed" },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(255,255,255,0.75)",
      legend: { orientation: "h", y: 1.08, x: 0 },
    };

    Plotly.newPlot(targetId, data, layout, { displayModeBar: false, responsive: true });
  }

  function renderLegacyView(db) {
    renderLegacyDriversTable(db);
    renderLegacySummary(db);
    renderLegacyMatrixPlot(db, "plotLegacyMatrix");
    renderLegacyRankingPlot(db, "plotLegacyRanking");
  }

  function getDimensionMetaForTopic(temaId) {
    const dim = DIMENSIONS.find((item) => item.range.includes(temaId));
    return {
      dimension_id: dim ? dim.id : "",
      dimension_nombre: dim ? String(dim.title || "").replace(/^\d+\.\s*/, "") : "",
    };
  }

  function getEditionNameById(db, editionId) {
    const edition = (db && db.editions || []).find((item) => item.id === editionId);
    return edition ? edition.name : (editionId || "");
  }

  function buildCompiledAnalyticRows(db) {
    const rows = [];
    const params = getParams(db);
    const wImpact = normalizeWeights((params && params.wImpact) || DEFAULT_PARAMS.wImpact);
    const wFin = normalizeWeights((params && params.wFin) || DEFAULT_PARAMS.wFin);
    const topicsById = new Map((DATA.topics || []).map((topic) => [topic.tema_id, topic]));

    (db.externalResponses || []).forEach((record) => {
      const editionId = record.editionId || "";
      const editionName = getEditionNameById(db, editionId);
      const ratings = record.ratings || {};
      Object.entries(ratings).forEach(([temaId, rawValue]) => {
        const value = sanitizeRating(rawValue);
        if (value === null) return;
        const topic = topicsById.get(temaId);
        const dim = getDimensionMetaForTopic(temaId);
        rows.push({
          edicion_id: editionId,
          edicion: editionName,
          fecha_iso: record.ts || "",
          fecha: toDateStr(record.ts),
          fuente: "externa",
          instrumento: "encuesta_externa",
          segmento: record.grupo || "",
          detalle_segmento: record.organizacion || "",
          grupo_interes: record.grupo || "",
          sector: record.sector || "",
          organizacion: record.organizacion || "",
          area: "",
          rol: "",
          tema_id: temaId,
          tema_nombre: topic ? topic.tema_nombre : temaId,
          dimension_id: dim.dimension_id,
          dimension_nombre: dim.dimension_nombre,
          medida: "relevancia",
          valor: value,
          valor_100: value * 20,
          percepcion: record.percepcion || "",
          comentarios: record.comentarios || "",
          id_registro: record.id || "",
          _measure_order: COMPILED_MEASURE_ORDER.relevancia,
        });
      });
    });

    (db.internalAssessments || []).forEach((record) => {
      const editionId = record.editionId || "";
      const editionName = getEditionNameById(db, editionId);
      const table = record.table || {};
      Object.entries(table).forEach(([temaId, row]) => {
        const topic = topicsById.get(temaId);
        const dim = getDimensionMetaForTopic(temaId);
        const impacto = sanitizeRating(row && row.impacto) ?? weightedMeanFromRow(row || {}, wImpact, ["severidad", "alcance", "irremediabilidad", "probabilidad"]);
        const financiero = sanitizeRating(row && row.financiero) ?? weightedMeanFromRow(row || {}, wFin, ["impacto_financiero", "probabilidad_financiera"]);
        const promedio = averageOf([impacto, financiero]);
        const base = {
          edicion_id: editionId,
          edicion: editionName,
          fecha_iso: record.ts || "",
          fecha: toDateStr(record.ts),
          fuente: "interna",
          instrumento: "evaluacion_interna",
          segmento: record.area || "",
          detalle_segmento: record.rol || "",
          grupo_interes: "",
          sector: "",
          organizacion: "",
          area: record.area || "",
          rol: record.rol || "",
          tema_id: temaId,
          tema_nombre: topic ? topic.tema_nombre : temaId,
          dimension_id: dim.dimension_id,
          dimension_nombre: dim.dimension_nombre,
          percepcion: "",
          comentarios: record.comentarios || "",
          id_registro: record.id || "",
        };

        if (impacto !== null) {
          rows.push({
            ...base,
            medida: "impacto",
            valor: impacto,
            valor_100: impacto * 20,
            _measure_order: COMPILED_MEASURE_ORDER.impacto,
          });
        }
        if (financiero !== null) {
          rows.push({
            ...base,
            medida: "financiero",
            valor: financiero,
            valor_100: financiero * 20,
            _measure_order: COMPILED_MEASURE_ORDER.financiero,
          });
        }
        if (promedio !== null) {
          rows.push({
            ...base,
            medida: "promedio_internal",
            valor: promedio,
            valor_100: promedio * 20,
            _measure_order: COMPILED_MEASURE_ORDER.promedio_internal,
          });
        }
      });
    });

    rows.sort((a, b) => {
      const editionCmp = String(a.edicion || "").localeCompare(String(b.edicion || ""));
      if (editionCmp !== 0) return editionCmp;
      const dateCmp = String(a.fecha_iso || "").localeCompare(String(b.fecha_iso || ""));
      if (dateCmp !== 0) return dateCmp;
      const sourceCmp = String(a.fuente || "").localeCompare(String(b.fuente || ""));
      if (sourceCmp !== 0) return sourceCmp;
      const topicCmp = String(a.tema_id || "").localeCompare(String(b.tema_id || ""));
      if (topicCmp !== 0) return topicCmp;
      const measureCmp = Number(a._measure_order || 99) - Number(b._measure_order || 99);
      if (measureCmp !== 0) return measureCmp;
      return String(a.id_registro || "").localeCompare(String(b.id_registro || ""));
    });

    return rows;
  }

  function getSelectedValues(selectId) {
    const el = document.getElementById(selectId);
    if (!el) return [];
    return Array.from(el.selectedOptions || []).map((opt) => opt.value).filter(Boolean);
  }

  function syncMultiSelectOptions(selectId, options, selectedValues) {
    const el = document.getElementById(selectId);
    if (!el) return;
    const selected = new Set(selectedValues || []);
    el.innerHTML = "";
    for (const option of options) {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.label;
      opt.selected = selected.has(option.value);
      el.appendChild(opt);
    }
  }

  function buildDistinctOptions(rows, valueSelector, labelSelector) {
    const map = new Map();
    rows.forEach((row) => {
      const value = String(valueSelector(row) || "").trim();
      if (!value) return;
      const label = String((labelSelector ? labelSelector(row) : value) || "").trim() || value;
      if (!map.has(value)) map.set(value, label);
    });
    return Array.from(map.entries())
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
      .map(([value, label]) => ({ value, label }));
  }

  function readCompiledFiltersFromUI(db) {
    const editionFilter = document.getElementById("compiledEditionFilter");
    return {
      editionId: editionFilter ? (editionFilter.value || db.currentEditionId || "TODAS") : (db.currentEditionId || "TODAS"),
      fuentes: getSelectedValues("compiledSourceFilter"),
      medidas: getSelectedValues("compiledMeasureFilter"),
      dimensiones: getSelectedValues("compiledDimensionFilter"),
      temas: getSelectedValues("compiledTopicFilter"),
      segmentos: getSelectedValues("compiledSegmentFilter"),
      q: sanitizeText(document.getElementById("compiledSearch") ? document.getElementById("compiledSearch").value : "", 300),
    };
  }

  function filterCompiledRows(rows, filters) {
    const query = String(filters && filters.q || "").trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.editionId && filters.editionId !== "TODAS" && row.edicion_id !== filters.editionId) return false;
      if (filters.fuentes && filters.fuentes.length && !filters.fuentes.includes(row.fuente)) return false;
      if (filters.medidas && filters.medidas.length && !filters.medidas.includes(row.medida)) return false;
      if (filters.dimensiones && filters.dimensiones.length && !filters.dimensiones.includes(row.dimension_nombre)) return false;
      if (filters.temas && filters.temas.length && !filters.temas.includes(row.tema_id)) return false;
      if (filters.segmentos && filters.segmentos.length && !filters.segmentos.includes(row.segmento)) return false;
      if (!query) return true;

      const haystack = [
        row.edicion,
        row.fecha,
        row.fuente,
        row.segmento,
        row.detalle_segmento,
        row.grupo_interes,
        row.sector,
        row.organizacion,
        row.area,
        row.rol,
        row.tema_id,
        row.tema_nombre,
        row.dimension_nombre,
        row.medida,
        row.percepcion,
        row.comentarios,
        row.id_registro,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }

  function buildCompiledExportRows(rows) {
    return rows.map((row) => ({
      edicion_id: row.edicion_id,
      edicion: row.edicion,
      fecha_iso: row.fecha_iso,
      fecha: row.fecha,
      fuente: row.fuente,
      instrumento: row.instrumento,
      segmento: row.segmento,
      detalle_segmento: row.detalle_segmento,
      grupo_interes: row.grupo_interes,
      sector: row.sector,
      organizacion: row.organizacion,
      area: row.area,
      rol: row.rol,
      tema_id: row.tema_id,
      tema_nombre: row.tema_nombre,
      dimension_id: row.dimension_id,
      dimension_nombre: row.dimension_nombre,
      medida: row.medida,
      valor: row.valor,
      valor_100: row.valor_100,
      percepcion: row.percepcion,
      comentarios: row.comentarios,
      id_registro: row.id_registro,
    }));
  }

  function escapeXml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function downloadExcelXml(filename, rows, sheetName = "BaseAnalitica") {
    const safeSheetName = String(sheetName || "BaseAnalitica").replace(/[\\/:*?\[\]]/g, "").slice(0, 31) || "BaseAnalitica";
    const cols = rows && rows.length ? Object.keys(rows[0]) : [];
    const headerRow = `<Row>${cols.map((col) => `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeXml(col)}</Data></Cell>`).join("")}</Row>`;
    const bodyRows = (rows || []).map((row) => {
      const cells = cols.map((col) => {
        const value = row[col];
        if (typeof value === "number" && isFinite(value)) {
          return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
        }
        return `<Cell><Data ss:Type="String">${escapeXml(value === null || value === undefined ? "" : String(value))}</Data></Cell>`;
      }).join("");
      return `<Row>${cells}</Row>`;
    }).join("");

    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="header">
   <Font ss:Bold="1"/>
   <Interior ss:Color="#EAFBF7" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${escapeXml(safeSheetName)}">
  <Table>
   ${headerRow}
   ${bodyRows}
  </Table>
 </Worksheet>
</Workbook>`;

    downloadText(filename, xml, "application/vnd.ms-excel;charset=utf-8");
  }

  function getCompiledRowsForCurrentFilters(db) {
    const rows = buildCompiledAnalyticRows(db);
    const filters = readCompiledFiltersFromUI(db);
    return filterCompiledRows(rows, filters);
  }

  function renderCompiledDataView(db) {
    const rows = buildCompiledAnalyticRows(db);
    if (!COMPILED_FILTER_STATE) {
      COMPILED_FILTER_STATE = {
        editionId: db.currentEditionId || "TODAS",
        fuentes: [],
        medidas: [],
        dimensiones: [],
        temas: [],
        segmentos: [],
        q: "",
      };
    }

    const editionSelect = document.getElementById("compiledEditionFilter");
    if (editionSelect) {
      const currentEditionId = COMPILED_FILTER_STATE.editionId || db.currentEditionId || "TODAS";
      editionSelect.innerHTML = "";
      const allOpt = document.createElement("option");
      allOpt.value = "TODAS";
      allOpt.textContent = "Todas las ediciones";
      editionSelect.appendChild(allOpt);
      for (const edition of (db.editions || [])) {
        const opt = document.createElement("option");
        opt.value = edition.id;
        opt.textContent = edition.name;
        editionSelect.appendChild(opt);
      }
      editionSelect.value = Array.from(editionSelect.options).some((opt) => opt.value === currentEditionId) ? currentEditionId : "TODAS";
    }

    syncMultiSelectOptions("compiledSourceFilter", buildDistinctOptions(rows, (row) => row.fuente), COMPILED_FILTER_STATE.fuentes);
    syncMultiSelectOptions("compiledMeasureFilter", buildDistinctOptions(rows, (row) => row.medida), COMPILED_FILTER_STATE.medidas);
    syncMultiSelectOptions("compiledDimensionFilter", buildDistinctOptions(rows, (row) => row.dimension_nombre), COMPILED_FILTER_STATE.dimensiones);
    syncMultiSelectOptions("compiledTopicFilter", buildDistinctOptions(rows, (row) => row.tema_id, (row) => `${row.tema_id} · ${row.tema_nombre}`), COMPILED_FILTER_STATE.temas);
    syncMultiSelectOptions("compiledSegmentFilter", buildDistinctOptions(rows, (row) => row.segmento), COMPILED_FILTER_STATE.segmentos);

    const search = document.getElementById("compiledSearch");
    if (search && search.value !== COMPILED_FILTER_STATE.q) search.value = COMPILED_FILTER_STATE.q || "";

    const filters = readCompiledFiltersFromUI(db);
    COMPILED_FILTER_STATE = { ...filters };
    const filteredRows = filterCompiledRows(rows, filters);

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    setText("compiledTotalRows", String(rows.length));
    setText("compiledFilteredRows", String(filteredRows.length));
    setText("compiledUniqueRecords", String(new Set(filteredRows.map((row) => row.id_registro)).size));
    setText("compiledVisibleTopics", String(new Set(filteredRows.map((row) => row.tema_id)).size));

    const tbody = document.querySelector("#tableCompiledData tbody");
    if (!tbody) return;
    if (!filteredRows.length) {
      tbody.innerHTML = `<tr><td colspan="13" class="muted center">No hay filas que coincidan con los filtros seleccionados.</td></tr>`;
      return;
    }

    tbody.innerHTML = filteredRows.map((row) => `
      <tr>
        <td>${escapeHTML(row.edicion)}</td>
        <td>${escapeHTML(row.fecha)}</td>
        <td>${escapeHTML(row.fuente)}</td>
        <td>${escapeHTML(row.segmento)}</td>
        <td><strong>${escapeHTML(row.tema_id)}</strong> · ${escapeHTML(row.tema_nombre)}</td>
        <td>${escapeHTML(row.dimension_nombre)}</td>
        <td>${escapeHTML(row.medida)}</td>
        <td class="right">${fmt(row.valor, 2)}</td>
        <td class="right">${fmt(row.valor_100, 1)}</td>
        <td>${escapeHTML(row.detalle_segmento)}</td>
        <td>${escapeHTML(row.percepcion)}</td>
        <td>${escapeHTML(row.comentarios)}</td>
        <td>${escapeHTML(row.id_registro)}</td>
      </tr>
    `).join("");
  }

  function hookCompiledDataView() {
    ["compiledEditionFilter", "compiledSourceFilter", "compiledMeasureFilter", "compiledDimensionFilter", "compiledTopicFilter", "compiledSegmentFilter"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", () => {
        const db = ensureDB();
        COMPILED_FILTER_STATE = readCompiledFiltersFromUI(db);
        renderCompiledDataView(db);
      });
    });

    const search = document.getElementById("compiledSearch");
    if (search) {
      search.addEventListener("input", () => {
        const db = ensureDB();
        COMPILED_FILTER_STATE = readCompiledFiltersFromUI(db);
        renderCompiledDataView(db);
      });
    }

    const clearBtn = document.getElementById("btnCompiledClearFilters");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        const db = ensureDB();
        COMPILED_FILTER_STATE = {
          editionId: db.currentEditionId || "TODAS",
          fuentes: [],
          medidas: [],
          dimensiones: [],
          temas: [],
          segmentos: [],
          q: "",
        };
        renderCompiledDataView(db);
      });
    }

    const exportCsvBtn = document.getElementById("btnCompiledExportCSV");
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener("click", () => {
        const db = ensureDB();
        const rows = buildCompiledExportRows(getCompiledRowsForCurrentFilters(db));
        if (!rows.length) {
          alert("No hay filas filtradas para exportar.");
          return;
        }
        downloadCSV(`base_analitica_filtrada_${new Date().toISOString().slice(0, 10)}.csv`, rows);
      });
    }

    const exportExcelBtn = document.getElementById("btnCompiledExportExcel");
    if (exportExcelBtn) {
      exportExcelBtn.addEventListener("click", () => {
        const db = ensureDB();
        const rows = buildCompiledExportRows(getCompiledRowsForCurrentFilters(db));
        if (!rows.length) {
          alert("No hay filas filtradas para exportar.");
          return;
        }
        downloadExcelXml(`base_analitica_filtrada_${new Date().toISOString().slice(0, 10)}.xml`, rows, "BaseAnalitica");
      });
    }
  }

  // ---------------------------------------------------------------------------
  // UI: Navegación
  // ---------------------------------------------------------------------------
  function setActiveView(viewName) {
    document.querySelectorAll(".nav-item").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === viewName);
    });
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add("active");

    // report requiere render específico
    const db = ensureDB();
    if (viewName === "dashboard") renderDashboard(db);
    if (viewName === "legacy") renderLegacyView(db);
    if (viewName === "compiled") renderCompiledDataView(db);
    if (viewName === "report") renderReport(db);
  }

  // ---------------------------------------------------------------------------
  // UI: Construcción de formularios
  // ---------------------------------------------------------------------------
  function buildGroupOptions(selectEl, includeTodos) {
    selectEl.innerHTML = "";
    if (includeTodos) {
      const o = document.createElement("option");
      o.value = "TODOS";
      o.textContent = "TODOS";
      selectEl.appendChild(o);
    }
    for (const g of GROUPS) {
      const o = document.createElement("option");
      o.value = g;
      o.textContent = g;
      selectEl.appendChild(o);
    }
  }

  function buildScenarioOptions(selectEl) {
    selectEl.innerHTML = "";
    for (const s of DATA.scenarios) {
      const o = document.createElement("option");
      o.value = s.id;
      o.textContent = s.nombre;
      selectEl.appendChild(o);
    }
  }

  function mkPillsCompactExternal(tid, options) {
    let html = `<div class="rating-group-matrix" style="justify-content: center;">`;
    for (const opt of options) {
      const val = opt.value || opt.v;
      const id = `ex_${tid}_${val}`.replace(/\s+/g, "");
      html += `<input type="radio" name="ext_${tid}" id="${id}" value="${val}">`;
      html += `<label for="${id}" title="${val}" style="width:32px; height:32px; font-size:14px;">${val}</label>`;
    }
    html += `</div>`;
    return html;
  }

  function buildExternalTopics(container) {
    container.innerHTML = "";
    const scale5 = [{ v: "1" }, { v: "2" }, { v: "3" }, { v: "4" }, { v: "5" }];

    if (DATA.topics.length === 0) return;

    for (const dim of DIMENSIONS) {
      const dimTopics = DATA.topics.filter((t) => dim.range.includes(t.tema_id));
      if (dimTopics.length === 0) continue;

      const card = document.createElement("div");
      card.className = `dim-card ${dim.class}`;

      let html = `
        <div class="dim-header">${dim.title}</div>
        <div class="dim-bulk-row" style="background:rgba(0,0,0,0.02); padding:8px 16px; border-bottom:1px solid rgba(0,0,0,0.05); display:flex; gap:8px; align-items:center;">
          <span style="font-size:12px; font-weight:700; color:var(--muted);">Rellenar bloque con:</span>
          ${[1, 2, 3, 4, 5].map(v => `<button type="button" class="btn btn-small btn-ghost btn-mark-ext" data-val="${v}">Todos en ${v}</button>`).join("")}
        </div>
        <div class="table-matrix-wrap">
          <table class="table-matrix">
            <thead>
              <tr>
                <th>Tema a Evaluar</th>
                <th style="width: 250px; text-align: center;">Puntaje</th>
              </tr>
            </thead>
            <tbody>
      `;

      for (const t of dimTopics) {
        html += `<tr class="topic-block" data-tid="${t.tema_id}">
          <td class="topic-title-block" style="vertical-align: middle;">${t.tema_id} · ${t.tema_nombre}</td>
          <td style="text-align: center; vertical-align: middle; padding: 12px;">${mkPillsCompactExternal(t.tema_id, scale5)}</td>
        </tr>`;
      }
      html += `</tbody></table></div>`;
      card.innerHTML = html;
      container.appendChild(card);
    }

    container.querySelectorAll('.btn-mark-ext').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.val;
        const cardNode = btn.closest('.dim-card');
        cardNode.querySelectorAll(`input[type="radio"][value="${val}"]`).forEach((r) => r.checked = true);
        updateExternalProgress();
      });
    });

    container.querySelectorAll('input[type="radio"]').forEach((r) => {
      r.addEventListener('change', updateExternalProgress);
    });
  }

  const DIMENSIONS = [
    { id: "gobernanza", title: "1. Gobernanza de la organización", class: "dim-gobernanza", range: ["P01", "P02", "P03", "P04", "P05"] },
    { id: "derechos", title: "2. Derechos humanos", class: "dim-derechos", range: ["P06", "P07"] },
    { id: "laborales", title: "3. Prácticas laborales", class: "dim-laborales", range: ["P08", "P09", "P10", "P11"] },
    { id: "medioambiente", title: "4. Medioambiente", class: "dim-medioambiente", range: ["P12", "P13", "P14", "P15"] },
    { id: "operacion", title: "5. Prácticas justas de operación", class: "dim-operacion", range: ["P16", "P17", "P18"] },
    { id: "comunidad", title: "6. Participación activa y desarrollo de la comunidad", class: "dim-comunidad", range: ["P19", "P20", "P21", "P22", "P23", "P24", "P25", "P26", "P27"] }
  ];

  function buildInternalCards(container) {
    container.innerHTML = "";
    
    const scale5 = [1, 2, 3, 4, 5];
    const horizVals = HORIZONS.map((h) => h.v);

    const mkPillsCompact = (tid, key, options) => {
      let html = `<div class="rating-group-matrix">`;
      for (const val of options) {
        const id = `int_${tid}_${key}_${val}`;
        html += `<input type="radio" name="int_${tid}_${key}" id="${id}" value="${val}">`;
        html += `<label for="${id}" title="${val}">${val}</label>`;
      }
      html += `</div>`;
      return html;
    };

    for (const dim of DIMENSIONS) {
      const dimTopics = DATA.topics.filter((t) => dim.range.includes(t.tema_id));
      if (dimTopics.length === 0) continue;

      const card = document.createElement("div");
      card.className = `dim-card ${dim.class}`;
      
      let html = `
        <div class="dim-header">${dim.title}</div>
        <div class="dim-bulk-row" style="background:rgba(0,0,0,0.02); padding:8px 16px; border-bottom:1px solid rgba(0,0,0,0.05); display:flex; gap:8px; align-items:center;">
          <span style="font-size:12px; font-weight:700; color:var(--muted);">Rellenar este bloque con:</span>
          ${[1, 2, 3, 4, 5].map(v => `<button type="button" class="btn btn-small btn-ghost btn-mark-dim" data-val="${v}">Todos en ${v}</button>`).join("")}
        </div>
        <div class="table-matrix-wrap">
          <table class="table-matrix">
            <thead>
              <tr>
                <th>Tema a Evaluar</th>
                <th>Puntaje para Impacto</th>
                <th>Financiero</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      for (const t of dimTopics) {
        html += `<tr class="topic-block" data-tid="${t.tema_id}">
          <td class="topic-title-block">${t.tema_id} · ${t.tema_nombre}</td>
          <td>${mkPillsCompact(t.tema_id, "impacto", scale5)}</td>
          <td>${mkPillsCompact(t.tema_id, "financiero", scale5)}</td>
        </tr>`;
      }
      html += `</tbody></table></div>`;
      card.innerHTML = html;
      container.appendChild(card);
    }

    container.querySelectorAll('.btn-mark-dim').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.val;
        const cardNode = btn.closest('.dim-card');
        cardNode.querySelectorAll(`input[type="radio"][value="${val}"]`).forEach((r) => r.checked = true);
        updateInternalProgress();
      });
    });

    container.querySelectorAll('input[type="radio"]').forEach((r) => {
      r.addEventListener('change', updateInternalProgress);
    });
  }

  // ---------------------------------------------------------------------------
  // UI: Progreso y filtros
  // ---------------------------------------------------------------------------
  function updateExternalProgress() {
    const answered = DATA.topics.reduce((acc, t) => {
      const checked = document.querySelector(`input[name="ext_${t.tema_id}"]:checked`);
      return acc + (checked ? 1 : 0);
    }, 0);
    
    // Autosave external draft
    const draft = {};
    const checkedBoxes = document.querySelectorAll('#extTopics input[type="radio"]:checked');
    checkedBoxes.forEach(r => draft[r.name] = r.value);
    
    // Save text inputs
    const grp = document.getElementById("extGrupo");
    const org = document.getElementById("extOrg");
    const st = document.getElementById("extSector");
    const ce = document.getElementById("extContacto");
    if (grp) draft.extGrupo = grp.value;
    if (org) draft.extOrg = org.value;
    if (st) draft.extSector = st.value;
    if (ce) draft.extContacto = ce.value;
    
    localStorage.setItem("paracel_external_draft", JSON.stringify(draft));

    document.getElementById("extProgress").textContent = `${answered} / ${DATA.topics.length}`;
    document.getElementById("extProgressBar").value = answered;
  }


function updateInternalProgress() {
  let complete = 0;
  const draft = {};
  for (const t of DATA.topics) {
    const impactChecked = document.querySelector(`input[name="int_${t.tema_id}_impacto"]:checked`);
    const finChecked = document.querySelector(`input[name="int_${t.tema_id}_financiero"]:checked`);
    if (impactChecked && finChecked) complete += 1;
  }

  const checkedBoxes = document.querySelectorAll('#internalCardsContainer input[type="radio"]:checked');
  checkedBoxes.forEach(r => draft[r.name] = r.value);

  const area = document.getElementById("intArea");
  const rol = document.getElementById("intRol");
  const comentarios = document.getElementById("intComentarios");
  if (area) draft.intArea = area.value;
  if (rol) draft.intRol = rol.value;
  if (comentarios) draft.intComentarios = comentarios.value;

  localStorage.setItem("paracel_internal_draft", JSON.stringify(draft));

  document.getElementById("intProgress").textContent = `${complete} / ${DATA.topics.length}`;
  document.getElementById("intProgressBar").value = complete;
}

function applyTopicSearch(inputId, containerSelector, itemSelector, textSelector) {
    const inp = document.getElementById(inputId);
    inp.addEventListener("input", () => {
      const q = inp.value.trim().toLowerCase();
      const items = document.querySelectorAll(`${containerSelector} ${itemSelector}`);
      items.forEach((it) => {
        const tid = it.dataset.tid || "";
        let text = "";
        const el = it.querySelector(textSelector);
        if (el) text = el.textContent || "";
        const ok = q === "" || tid.toLowerCase().includes(q) || text.toLowerCase().includes(q);
        it.style.display = ok ? "" : "none";
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Parámetros
  // ---------------------------------------------------------------------------
  function getParams(db) {
    return db.params || { ...DEFAULT_PARAMS };
  }

  function mountLegacyParamBlock() {
    const block = document.getElementById("legacyParamBlock");
    const mount = document.getElementById("legacyParamsMount");
    if (block && mount && block.parentElement !== mount) {
      mount.appendChild(block);
    }
  }

  function syncParamsToUI(db) {
    const p = getParams(db);
    mountLegacyParamBlock();
    document.getElementById("tauImpact").value = fmt(p.tauImpact, 2);
    document.getElementById("tauFin").value = fmt(p.tauFin, 2);
    document.getElementById("tauMaterial").value = fmt(p.tauMaterial !== undefined ? p.tauMaterial : DEFAULT_PARAMS.tauMaterial, 2);
    document.getElementById("ruleSelect").value = p.ruleDouble;
    const legacyTopNInput = document.getElementById("legacyTopN");
    if (legacyTopNInput) {
      legacyTopNInput.max = String(DATA.topics.length || 27);
      legacyTopNInput.value = String(Math.min(DATA.topics.length || 27, Math.max(1, Math.round(Number(p.legacyTopN || DEFAULT_PARAMS.legacyTopN)))));
    }

    document.getElementById("wSev").value = String(p.wImpact.severidad);
    document.getElementById("wAlc").value = String(p.wImpact.alcance);
    document.getElementById("wIrr").value = String(p.wImpact.irremediabilidad);
    document.getElementById("wProb").value = String(p.wImpact.probabilidad);

    document.getElementById("wFinImp").value = String(p.wFin.impacto_financiero);
    document.getElementById("wFinProb").value = String(p.wFin.probabilidad_financiera);
    document.getElementById("legacyExpectationFactor").value = fmt(Number(p.legacyExpectationFactor || DEFAULT_PARAMS.legacyExpectationFactor), 2);

    document.getElementById("chkStakeWeightByN").checked = !!p.stakeWeightByN;

    // group filter
    const gf = document.getElementById("groupFilter");
    gf.value = p.groupFilter || "TODOS";
  }

  function readParamsFromUI(db) {
    const p = getParams(db);

    p.tauImpact = Number(document.getElementById("tauImpact").value);
    p.tauFin = Number(document.getElementById("tauFin").value);
    p.tauMaterial = Number(document.getElementById("tauMaterial").value);
    p.ruleDouble = document.getElementById("ruleSelect").value;

    p.wImpact = {
      severidad: Number(document.getElementById("wSev").value),
      alcance: Number(document.getElementById("wAlc").value),
      irremediabilidad: Number(document.getElementById("wIrr").value),
      probabilidad: Number(document.getElementById("wProb").value),
    };
    p.wFin = {
      impacto_financiero: Number(document.getElementById("wFinImp").value),
      probabilidad_financiera: Number(document.getElementById("wFinProb").value),
    };
    p.legacyTopN = Number(document.getElementById("legacyTopN").value);
    p.legacyExpectationFactor = Number(document.getElementById("legacyExpectationFactor").value);

    p.stakeWeightByN = document.getElementById("chkStakeWeightByN").checked;
    p.groupFilter = document.getElementById("groupFilter").value || "TODOS";

    // normalización de pesos
    p.wImpact = normalizeWeights({
      severidad: clamp01(p.wImpact.severidad),
      alcance: clamp01(p.wImpact.alcance),
      irremediabilidad: clamp01(p.wImpact.irremediabilidad),
      probabilidad: clamp01(p.wImpact.probabilidad),
    });
    p.wFin = normalizeWeights({
      impacto_financiero: clamp01(p.wFin.impacto_financiero),
      probabilidad_financiera: clamp01(p.wFin.probabilidad_financiera),
    });
    if (!isFinite(p.legacyTopN) || p.legacyTopN <= 0) {
      p.legacyTopN = DEFAULT_PARAMS.legacyTopN;
    }
    p.legacyTopN = Math.min(DATA.topics.length || p.legacyTopN, Math.max(1, Math.round(p.legacyTopN)));
    if (!isFinite(p.legacyExpectationFactor) || p.legacyExpectationFactor <= 0) {
      p.legacyExpectationFactor = DEFAULT_PARAMS.legacyExpectationFactor;
    }

    db.params = p;
    return db;
  }

  function hookParamsUI() {
    mountLegacyParamBlock();
    const syncAndRender = () => {
      const db = ensureDB();
      readParamsFromUI(db);
      saveDB(db);
      syncParamsToUI(db);
      renderAll(db);
    };

    ["tauImpact", "tauFin", "tauMaterial", "ruleSelect", "wSev", "wAlc", "wIrr", "wProb", "wFinImp", "wFinProb", "legacyTopN", "legacyExpectationFactor", "chkStakeWeightByN", "groupFilter"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", syncAndRender);
      if (el.tagName === "INPUT") el.addEventListener("input", syncAndRender);
    });

    document.getElementById("btnResetParams").addEventListener("click", () => {
      const db = ensureDB();
      db.params = JSON.parse(JSON.stringify(DEFAULT_PARAMS));
      saveDB(db);
      syncParamsToUI(db);
      renderAll(db);
    });

    document.getElementById("btnSaveParams").addEventListener("click", () => {
      const db = ensureDB();
      readParamsFromUI(db);
      saveDB(db);
      syncParamsToUI(db);
      renderAll(db);
      alert("Parámetros guardados.");
    });

    // escenarios
    document.getElementById("scenarioSelect").addEventListener("change", (e) => {
      const id = e.target.value;
      applyScenario(id);
    });
  }

  function applyScenario(scenarioId) {
    const s = DATA.scenarios.find((x) => x.id === scenarioId);
    if (!s) return;
    const db = ensureDB();
    db.lastScenarioId = s.id;
    db.params = {
      ...getParams(db),
      tauImpact: Number(s.tau_impact),
      tauFin: Number(s.tau_fin),
      ruleDouble: s.rule_double,
      wImpact: { ...s.weights_impact },
      wFin: { ...s.weights_fin },
    };
    saveDB(db);
    syncParamsToUI(db);
    renderAll(db);
  }

  // ---------------------------------------------------------------------------
  // Guardado de encuestas
  // ---------------------------------------------------------------------------
  function hookExternalForm() {
    const form = document.getElementById("formExternal");
    const grp = document.getElementById("extGrupo");
    const org = document.getElementById("extOrg");
    const st = document.getElementById("extSector");
    const ce = document.getElementById("extContacto");

    // Add draft trigger for text inputs
    [grp, org, st, ce].forEach(el => {
      if(el) el.addEventListener("input", updateExternalProgress);
    });

    // Cargar borrador guardado (si existe)
    try {
      const draftStr = localStorage.getItem("paracel_external_draft");
      if (draftStr) {
        const draft = JSON.parse(draftStr);
        if (draft.extGrupo && grp) grp.value = draft.extGrupo;
        if (draft.extOrg && org) org.value = draft.extOrg;
        if (draft.extSector && st) st.value = draft.extSector;
        if (draft.extContacto && ce) ce.value = draft.extContacto;
        
        Object.keys(draft).forEach(k => {
          if (["extGrupo", "extOrg", "extSector", "extContacto"].includes(k)) return;
          const r = document.querySelector(`input[name="${k}"][value="${draft[k]}"]`);
          if (r) r.checked = true;
        });
      }
    } catch (e) { console.warn("Could not load external draft", e); }

    const btnClearExt = document.getElementById("btnExtClear");
    if (btnClearExt) {
      btnClearExt.addEventListener("click", () => {
        const ok = confirm("¿Limpiar todo el formulario externo?");
        if (!ok) return;
        form.reset();
        document.querySelectorAll('#extTopics input[type="radio"]').forEach((r) => (r.checked = false));
        localStorage.removeItem("paracel_external_draft");
        updateExternalProgress();
      });
    }

    let isSubmittingExternal = false;

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (isSubmittingExternal) return;
      const db = ensureDB();
      if (!isEditionOpen(db)) {
        alert("La edición activa está cerrada. Abra o cree una nueva edición antes de registrar respuestas.");
        return;
      }

      const grupo = sanitizeText(grp.value, 200);
      const organizacion = sanitizeText(org.value, 300);
      const sector = sanitizeText(st.value, 300);
      const contacto = sanitizeText(ce.value, 300);
      // Wait, there's percepcion and comentarios normally, but if not in DOM, it's ok string:
      const rawPerc = document.getElementById("extPercepcion");
      const percepcion = rawPerc ? sanitizeText(rawPerc.value, 200) : "";
      const rawCom = document.getElementById("extComentarios");
      const comentarios = rawCom ? sanitizeText(rawCom.value, 4000) : "";

      if (!grupo) {
        alert("Seleccione su grupo de interés.");
        return;
      }

      const ratings = {};
      let answered = 0;
      for (const t of DATA.topics) {
        const checked = document.querySelector(`input[name="ext_${t.tema_id}"]:checked`);
        if (checked) {
          ratings[t.tema_id] = Number(checked.value);
          answered++;
        }
      }

      if (answered < DATA.topics.length) {
        alert(`Faltan respuestas. Por favor de puntuar los 27 temas antes de enviar.\nActualmente calificados: ${answered}`);
        return;
      }

      const row = normalizeExternalRow({
        id: uuidv4(),
        ts: nowISO(),
        editionId: db.currentEditionId,
        grupo,
        sector,
        organizacion,
        contacto,
        percepcion,
        comentarios,
        ratings,
      });

      db.externalResponses.push(row);
      saveDB(db);
      populateDatalists(db);

      const btn = form.querySelector('button[type="submit"]');
      isSubmittingExternal = true;
      if (btn) btn.disabled = true;
      try {
        await syncToCloudRecord("externa", row);
      } finally {
        if (btn) btn.disabled = false;
        isSubmittingExternal = false;
      }

      form.reset();
      document.querySelectorAll('#extTopics input[type="radio"]').forEach((r) => (r.checked = false));
      localStorage.removeItem("paracel_external_draft");
      updateExternalProgress();

      renderAll(db);
      alert("¡Gracias por su participación!\nSu respuesta ha sido enviada de forma exitosa.\n\nPuede cerrar esta pestaña o volver a llenar el formulario si necesita registrar otra respuesta.");
    });
  }

  function hookInternalForm() {
    const form = document.getElementById("formInternal");
    const btnClear = document.getElementById("btnIntClear");
    const intArea = document.getElementById("intArea");
    const intRol = document.getElementById("intRol");
    const intComentarios = document.getElementById("intComentarios");

    // Llenado rápido (Marcar todos con...)
    for (let i = 1; i <= 5; i++) {
      const btnMark = document.getElementById(`btnMarkAll${i}`);
      if (btnMark) {
        btnMark.addEventListener("click", () => {
          document.querySelectorAll(`#internalCardsContainer input[type="radio"][value="${i}"]`).forEach(r => {
            r.checked = true;
          });
          updateInternalProgress();
        });
      }
    }

    // Trigger draft on typing text inputs
    intArea.addEventListener("input", updateInternalProgress);
    intRol.addEventListener("input", updateInternalProgress);
    intComentarios.addEventListener("input", updateInternalProgress);

    // Cargar borrador guardado (si existe)
    try {
      const draftStr = localStorage.getItem("paracel_internal_draft");
      if (draftStr) {
        const draft = JSON.parse(draftStr);
        if (draft.intArea) intArea.value = draft.intArea;
        if (draft.intRol) intRol.value = draft.intRol;
        if (draft.intComentarios) intComentarios.value = draft.intComentarios;
        
        Object.keys(draft).forEach(k => {
          if (k === "intArea" || k === "intRol" || k === "intComentarios") return;
          const r = document.querySelector(`input[name="${k}"][value="${draft[k]}"]`);
          if (r) r.checked = true;
        });
      }
    } catch (e) { console.warn("Could not load internal draft", e); }

    btnClear.addEventListener("click", () => {
      const ok = confirm("¿Está seguro de querer limpiar todo el formulario y perder el progreso no enviado?");
      if (!ok) return;
      form.reset();
      document.querySelectorAll('#internalCardsContainer input[type="radio"]').forEach((r) => (r.checked = false));
      localStorage.removeItem("paracel_internal_draft");
      updateInternalProgress();
    });

    let isSubmittingInternal = false;

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (isSubmittingInternal) return;

      const btn = form.querySelector('button[type="submit"]');
      try {
        const db = ensureDB();
        if (!isEditionOpen(db)) {
          alert("La edición activa está cerrada. Abra o cree una nueva edición antes de registrar respuestas.");
          return;
        }

        const area = sanitizeText(intArea.value, 300);
        const rol = sanitizeText(intRol.value, 300);
        const comentarios = sanitizeText(intComentarios.value, 4000);

        if (!area) {
          alert("Debe completar el área evaluadora.");
          return;
        }

        const table = {};
        let complete = 0;

        for (const t of DATA.topics) {
          const row = {};
          const keys = ["impacto", "financiero"];
          let answeredKeys = 0;

          for (const k of keys) {
            const checked = document.querySelector(`input[name="int_${t.tema_id}_${k}"]:checked`);
            if (checked) {
              row[k] = checked.value;
              answeredKeys++;
            } else {
              row[k] = null;
            }
          }

          if (answeredKeys === keys.length) {
            complete += 1;
          }

          if (answeredKeys > 0) {
            table[t.tema_id] = {
              impacto: row.impacto ? Number(row.impacto) : null,
              financiero: row.financiero ? Number(row.financiero) : null
            };
          }
        }

        if (complete < DATA.topics.length) {
          alert(`Faltan respuestas. Debe calificar TODOS los cuadrantes de los 27 temas antes de enviar.\nTemas 100% completados actualmente: ${complete}`);
          return;
        }

        const row = normalizeInternalRow({
          id: uuidv4(),
          ts: nowISO(),
          editionId: db.currentEditionId,
          area,
          rol,
          comentarios,
          table,
        }, db.params);

        isSubmittingInternal = true;
        if (btn) btn.disabled = true;

        db.internalAssessments.push(row);
        saveDB(db);
        populateDatalists(db);

        await syncToCloudRecord("interna", row);

        form.reset();
        document.querySelectorAll('#internalCardsContainer input[type="radio"]').forEach((r) => (r.checked = false));
        localStorage.removeItem("paracel_internal_draft");
        updateInternalProgress();

        renderAll(db);
        alert("¡Gracias por su evaluación!\nLos puntajes internos han sido guardados de forma exitosa.\n\nPuede cerrar esta pestaña o registrar una nueva evaluación desde cero.");
      } catch (err) {
        console.error("Fallo en el envío interno:", err);
        alert("La evaluación interna se guardó localmente, pero ocurrió un error durante el envío o la confirmación. Revise la consola del navegador y vuelva a sincronizar.");
      } finally {
        if (btn) btn.disabled = false;
        isSubmittingInternal = false;
      }
    });
  }

  function hookLegacyView() {
    const driversBody = document.querySelector("#tableLegacyDrivers tbody");
    if (driversBody) {
      const saveLegacyOverrides = (tr) => {
        if (!tr) return;
        const temaId = tr.getAttribute("data-tid");
        if (!temaId) return;
        const db = ensureDB();
        const current = getLegacyMatrixRow(db, temaId);
        const next = { ...current };
        ["p", "s", "b"].forEach((field) => {
          const input = tr.querySelector(`[data-field="${field}"]`);
          if (!input) return;
          const value = sanitizeBoundedNumber(input.value, 1, 5);
          const suggested = sanitizeBoundedNumber(input.dataset.suggested, 1, 5);
          if (value === null || (suggested !== null && Math.abs(value - suggested) < 0.005)) next[field] = null;
          else next[field] = value;
        });
        setLegacyMatrixRow(db, temaId, next);
        saveDB(db);
        renderLegacyView(db);
        if (document.getElementById("view-report").classList.contains("active")) renderReport(db);
      };

      driversBody.addEventListener("change", (ev) => {
        const input = ev.target.closest("input[data-field]");
        if (!input) return;
        saveLegacyOverrides(input.closest("tr[data-tid]"));
      });

      driversBody.addEventListener("click", (ev) => {
        const btn = ev.target.closest("button[data-reset-legacy-topic]");
        if (!btn) return;
        const temaId = btn.getAttribute("data-reset-legacy-topic");
        const db = ensureDB();
        const current = getLegacyMatrixRow(db, temaId);
        setLegacyMatrixRow(db, temaId, { ...current, p: null, s: null, b: null });
        saveDB(db);
        renderLegacyView(db);
        if (document.getElementById("view-report").classList.contains("active")) renderReport(db);
      });
    }

    const clearBtn = document.getElementById("btnLegacyClear");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        const ok = confirm("¿Restablecer los parámetros sugeridos de la matriz clásica?");
        if (!ok) return;
        const db = ensureDB();
        db.params = {
          ...getParams(db),
          legacyTopN: DEFAULT_PARAMS.legacyTopN,
          legacyExpectationFactor: DEFAULT_PARAMS.legacyExpectationFactor,
          legacyPWeights: cloneDeep(DEFAULT_PARAMS.legacyPWeights),
          legacySWeights: cloneDeep(DEFAULT_PARAMS.legacySWeights),
          legacyBWeights: cloneDeep(DEFAULT_PARAMS.legacyBWeights),
        };
        db.legacyMatrix = { rowsByTheme: {} };
        saveDB(db);
        syncParamsToUI(db);
        renderAll(db);
      });
    }

    applyTopicSearch("topicSearchLegacy", "#view-legacy", ".topic-block", ".legacy-topic-cell");
  }

  // ---------------------------------------------------------------------------
  // Render logs (listados)
  // ---------------------------------------------------------------------------
  function renderExternalLog(db) {
    const tbody = document.querySelector("#tableExternalLog tbody");
    tbody.innerHTML = "";
    const rows = db.externalResponses
      .filter((r) => r.editionId === db.currentEditionId)
      .sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));

    for (const r of rows) {
      const tr = document.createElement("tr");
      const items = Object.keys(r.ratings || {}).length;

      tr.innerHTML = `
        <td>${toDateStr(r.ts)}</td>
        <td>${escapeHTML(r.grupo || "")}</td>
        <td>${escapeHTML(r.organizacion || "")}</td>
        <td class="right">${items}</td>
        <td class="right"><button class="btn btn-danger btn-small" data-del="${r.id}" type="button">Eliminar</button></td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll("button[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-del");
        const ok = confirm("¿Eliminar esta respuesta externa? Esta acción no se puede deshacer.");
        if (!ok) return;
        db.externalResponses = db.externalResponses.filter((x) => x.id !== id);
        saveDB(db);
        renderAll(db);
      });
    });
  }

  function renderInternalLog(db) {
    const tbody = document.querySelector("#tableInternalLog tbody");
    tbody.innerHTML = "";
    const rows = db.internalAssessments
      .filter((r) => r.editionId === db.currentEditionId)
      .sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));

    for (const r of rows) {
      const complete = Object.keys(r.table || {}).length;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${toDateStr(r.ts)}</td>
        <td>${escapeHTML(r.area || "")}</td>
        <td>${escapeHTML(r.rol || "")}</td>
        <td class="right">${complete}</td>
        <td class="right"><button class="btn btn-danger btn-small" data-del="${r.id}" type="button">Eliminar</button></td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll("button[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-del");
        const ok = confirm("¿Eliminar esta evaluación interna? Esta acción no se puede deshacer.");
        if (!ok) return;
        db.internalAssessments = db.internalAssessments.filter((x) => x.id !== id);
        saveDB(db);
        renderAll(db);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Render KPIs, tablas y gráficos
  // ---------------------------------------------------------------------------
  function renderKPIs(db) {
    const currentExt = db.externalResponses.filter((r) => r.editionId === db.currentEditionId);
    const currentInt = db.internalAssessments.filter((r) => r.editionId === db.currentEditionId);
    const extN = currentExt.length;
    const intN = currentInt.length;
    document.getElementById("kpiExternalN").textContent = String(extN);
    document.getElementById("kpiInternalN").textContent = String(intN);
    document.getElementById("kpiThemesN").textContent = String(DATA.topics.length);

    const edition = db.editions.find((e) => e.id === db.currentEditionId);
    if (edition) {
      document.getElementById("editionPill").textContent = `${edition.name} · ${edition.status.toUpperCase()}`;
      const due = edition.nextDueDate ? new Date(edition.nextDueDate) : null;
      const now = new Date();
      const pendingSync = loadSyncQueue().length;
      const extIncomplete = currentExt.filter((r) => Object.keys(r.ratings || {}).length < DATA.topics.length).length;
      const intIncomplete = currentInt.filter((r) => Object.keys(r.table || {}).length < DATA.topics.length).length;
      let msg = `Ciclo bianual: próxima edición sugerida ${edition.nextDueDate ? edition.nextDueDate.slice(0, 10) : "(no definida)"}.`;
      if (due && due <= now) msg = `Atención: la edición bianual está vencida. Se recomienda crear una nueva edición.`;
      msg += ` Pendientes de sincronización: ${pendingSync}. Registros con integridad parcial en esta edición, externos: ${extIncomplete}, internos: ${intIncomplete}.`;
      if (edition.status !== "open") msg += " La edición activa está cerrada para nuevas capturas.";
      document.getElementById("cycleBanner").textContent = msg;
    }
  }

  function renderQuickTable(db) {
    const { rows } = computeScores(db);

    const matImpact = rows.filter((r) => r.impact_mat).length;
    const matFin = rows.filter((r) => r.fin_mat).length;
    const matDouble = rows.filter((r) => r.double_mat).length;
    document.getElementById("kpiMatImpact").textContent = String(matImpact);
    document.getElementById("kpiMatFin").textContent = String(matFin);
    document.getElementById("kpiMatDouble").textContent = String(matDouble);

    const tbody = document.querySelector("#tableQuick tbody");
    tbody.innerHTML = "";

    const top = rows.slice(0, 12);
    for (const r of top) {
      const cls = r.double_mat ? "Doble" : (r.impact_mat ? "Impacto" : (r.fin_mat ? "Financiera" : "No"));
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHTML(r.tema_id)} · ${escapeHTML(r.tema_nombre)}</td>
        <td class="right">${r.stakeholder_mean === null ? "" : fmt(r.stakeholder_mean, 2)}</td>
        <td class="right">${r.impact_score === null ? "" : fmt(r.impact_score, 2)}</td>
        <td class="right">${r.fin_score === null ? "" : fmt(r.fin_score, 2)}</td>
        <td>${cls}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderMatrixPlot(db, targetId) {
    const params = getParams(db);
    const { rows } = computeScores(db);
    const tau = params.tauMaterial !== undefined ? params.tauMaterial : DEFAULT_PARAMS.tauMaterial;

    const materialRows = rows.filter((r) => r.is_material && r.stakeholder_mean !== null && r.impact_score !== null);

    const x = materialRows.map((r) => r.stakeholder_mean);
    const y = materialRows.map((r) => r.impact_score);
    const text = materialRows.map((r) => `${r.tema_id} · ${r.tema_nombre}`);

    const palette = ["#9cc34d", "#f89a46", "#43aac8", "#ffb81c", "#7b61a6", "#ff4f12", "#38a038", "#e25be8", "#63dfe5", "#4f81bd",
                     "#c0392b", "#16a085", "#8e44ad", "#2980b9", "#f39c12", "#27ae60", "#e74c3c", "#1abc9c", "#d35400", "#2c3e50"];
    const color = materialRows.map((_, i) => palette[i % palette.length]);

    const axisMin = 1;
    const axisMax = 5;
    const axisPad = 0.1;

    const data = [{
      x, y, text,
      mode: "markers+text",
      type: "scatter",
      textposition: "top center",
      textfont: { size: 10 },
      marker: { size: 16, color, opacity: 0.9, line: { width: 2, color: "#ffffff" } },
      hovertemplate: "<b>%{text}</b><br>Externos (relevancia): %{x:.2f}<br>Internos (impacto): %{y:.2f}<extra></extra>"
    }];

    const layout = {
      margin: { l: 60, r: 20, t: 30, b: 60 },
      xaxis: {
        title: { text: "Relevancia promedio (externos)", font: { size: 13 } },
        range: [axisMin - axisPad, axisMax + axisPad],
        gridcolor: "rgba(2,44,34,0.10)",
        zeroline: false,
        dtick: 0.5,
      },
      yaxis: {
        title: { text: "Impacto promedio (internos)", font: { size: 13 } },
        range: [axisMin - axisPad, axisMax + axisPad],
        gridcolor: "rgba(2,44,34,0.10)",
        zeroline: false,
        dtick: 0.5,
      },
      shapes: [
        { type: "line", x0: tau, x1: tau, y0: axisMin - axisPad, y1: axisMax + axisPad, line: { color: "rgba(185,28,28,0.6)", width: 2, dash: "dot" } },
        { type: "line", x0: axisMin - axisPad, x1: axisMax + axisPad, y0: tau, y1: tau, line: { color: "rgba(185,28,28,0.6)", width: 2, dash: "dot" } },
      ],
      annotations: [
        { x: (axisMax + axisPad + tau) / 2, y: axisMin - axisPad + 0.05, text: `<b>Umbral: ${fmt(tau,2)}</b>`, showarrow: false, font: { size: 11, color: "rgba(185,28,28,0.8)" }, xanchor: "center", yanchor: "bottom" },
      ],
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(255,255,255,0.75)",
      showlegend: false,
    };

    if (!materialRows.length) {
      const target = document.getElementById(targetId);
      if (target) {
        try { Plotly.purge(target); } catch {}
        target.innerHTML = `<div class="muted" style="padding:24px;">No hay temas materiales coincidentes con el umbral actual (${fmt(tau,2)}).</div>`;
      }
      return;
    }

    Plotly.newPlot(targetId, data, layout, { displayModeBar: false, responsive: true });
  }

  function renderRankingTable(db) {
    const { rows } = computeScores(db);
    const tbody = document.querySelector("#tableRanking tbody");
    tbody.innerHTML = "";

    const materialRows = rows.filter((r) => r.is_material);
    if (!materialRows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="5" class="muted center">No hay temas que superen el umbral de materialidad en ambas encuestas.</td>`;
      tbody.appendChild(tr);
      return;
    }

    for (const r of materialRows) {
      const tr = document.createElement("tr");
      tr.style.background = "#d1fae5";
      tr.style.borderLeft = "4px solid #059669";
      tr.innerHTML = `
        <td><strong>${escapeHTML(r.tema_id)}</strong> · ${escapeHTML(r.tema_nombre)}</td>
        <td class="right">${r.stakeholder_mean === null ? "" : fmt(r.stakeholder_mean, 2)}</td>
        <td class="right">${r.impact_score === null ? "" : fmt(r.impact_score, 2)}</td>
        <td class="right">${r.fin_score === null ? "" : fmt(r.fin_score, 2)}</td>
        <td style="color:#059669; font-weight:bold;">&#10003; Material</td>
      `;
      tbody.appendChild(tr);
    }
  }

  function renderDashboard(db) {
    renderMatrixPlot(db, "plotMatrix");
    renderRankingTable(db);
    renderRadarPlot(db, "plotRadar");
  }

  function renderRadarPlot(db, targetId) {
    const { rows } = computeScores(db);
    const valid = rows.filter(r => r.impact_score !== null && r.fin_score !== null).slice(0, 10);
    if (valid.length === 0) return;

    // Use full topic name for the polar chart but truncate to keep it from collapsing
    const theta = valid.map(r => r.tema_nombre.length > 30 ? r.tema_nombre.substring(0, 27) + '...' : r.tema_nombre);
    const rImpact = valid.map(r => r.impact_score);
    const rFin = valid.map(r => r.fin_score);

    theta.push(theta[0]);
    rImpact.push(rImpact[0]);
    rFin.push(rFin[0]);

    const data = [
      {
        type: 'scatterpolar',
        r: rImpact,
        theta,
        fill: 'toself',
        name: 'Impacto ASG',
        line: { color: "#059669" },
        fillcolor: "rgba(5,150,105,0.25)"
      },
      {
        type: 'scatterpolar',
        r: rFin,
        theta,
        fill: 'toself',
        name: 'Financiero',
        line: { color: "#2563eb" },
        fillcolor: "rgba(37,99,235,0.25)"
      }
    ];

    const layout = {
      polar: {
        radialaxis: { visible: true, range: [0, 5], gridcolor: "rgba(0,0,0,0.1)", dtick: 1 },
        angularaxis: { gridcolor: "rgba(0,0,0,0.1)", direction: "clockwise" }
      },
      showlegend: true,
      legend: { orientation: "h", x: 0.5, xanchor: "center", y: -0.1 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 40, r: 40, t: 30, b: 30 }
    };

    if (document.getElementById(targetId)) {
        Plotly.newPlot(targetId, data, layout, { displayModeBar: false, responsive: true });
    }
  }

  function renderDimensionPlot(db, targetId) {
    const { rows } = computeScores(db);
    const byDim = {};
    for (const d of DIMENSIONS) {
      const tIds = DATA.topics.filter(t => d.range.includes(t.tema_id)).map(t => t.tema_id);
      const dRows = rows.filter(r => tIds.includes(r.tema_id) && r.impact_score !== null && r.fin_score !== null);
      if (dRows.length === 0) continue;
      const sumIm = dRows.reduce((a, b) => a + b.impact_score, 0);
      const sumFi = dRows.reduce((a, b) => a + b.fin_score, 0);
      const avg = (sumIm + sumFi) / (dRows.length * 2);
      byDim[d.title] = avg;
    }
    
    const sorted = Object.entries(byDim).sort((a,b) => b[1] - a[1]);
    const x = sorted.map(k => k[0]);
    const y = sorted.map(k => k[1]);
    
    const data = [{
      x, y, type: 'bar', marker: { color: '#059669' },
      hovertemplate: "Promedio Doble Mat.: %{y:.2f}<extra></extra>"
    }];
    const layout = {
      margin: { l: 30, r: 20, t: 30, b: 120 },
      yaxis: { range: [1, 5], title: "Media Doble Mat.", gridcolor: "rgba(2,44,34,0.10)" },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(255,255,255,0.75)",
    };
    if (document.getElementById(targetId)) {
        Plotly.newPlot(targetId, data, layout, { displayModeBar: false, responsive: true });
    }
  }

  function renderTop5KPIs(db) {
    const { rows } = computeScores(db);
    const topIm = [...rows].filter(r => r.impact_score !== null).sort((a, b) => b.impact_score - a.impact_score).slice(0, 5);
    const topFi = [...rows].filter(r => r.fin_score !== null).sort((a, b) => b.fin_score - a.fin_score).slice(0, 5);
    
    const imC = document.getElementById("top5Impact");
    if (imC) {
      imC.innerHTML = topIm.map((r, i) => `
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding:6px 0;">
          <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:85%;"><b>${i+1}.</b> ${r.tema_nombre}</span>
          <span style="font-weight:bold; color:var(--primary);">${fmt(r.impact_score,2)}</span>
        </div>
      `).join("");
    }
    const fiC = document.getElementById("top5Fin");
    if (fiC) {
      fiC.innerHTML = topFi.map((r, i) => `
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding:6px 0;">
          <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:85%;"><b>${i+1}.</b> ${r.tema_nombre}</span>
          <span style="font-weight:bold; color:var(--primary);">${fmt(r.fin_score,2)}</span>
        </div>
      `).join("");
    }
  }

  function renderExternalTop10(db, targetId) {
    const { rows } = computeScores(db);
    const topExt = [...rows].filter(r => r.stakeholder_mean !== null)
                            .sort((a, b) => b.stakeholder_mean - a.stakeholder_mean)
                            .slice(0, 10);
    
    if (topExt.length === 0) return;
    topExt.reverse();

    const y = topExt.map(r => r.tema_nombre.length > 40 ? r.tema_nombre.substring(0, 37) + '...' : r.tema_nombre);
    const x = topExt.map(r => r.stakeholder_mean);

    const data = [{
      type: 'bar',
      x: x,
      y: y,
      orientation: 'h',
      marker: { color: '#16a34a' },
      hovertemplate: "Importancia: %{x:.2f}<extra></extra>"
    }];

    const layout = {
      margin: { l: 250, r: 20, t: 30, b: 40 },
      xaxis: { range: [1, 5], title: "Promedio Stakeholders", gridcolor: "rgba(22,163,74,0.10)" },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(255,255,255,0.75)"
    };

    if (document.getElementById(targetId)) {
        Plotly.newPlot(targetId, data, layout, { displayModeBar: false, responsive: true });
    }
  }

  function averageOf(values) {
    const valid = values.filter((v) => v !== null && v !== undefined && isFinite(v));
    return valid.length ? valid.reduce((a, b) => a + Number(b), 0) / valid.length : null;
  }

  function renderBulletList(targetId, items) {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.innerHTML = (items || []).map((item) => `<div class="report-bullet-item">${escapeHTML(item)}</div>`).join("");
  }

  function renderReport(db) {
    const params = getParams(db);
    const edition = db.editions.find((e) => e.id === db.currentEditionId);

    const { rows } = computeScores(db);
    const legacy = computeLegacyMatrix(db);
    const doubleRows = rows.filter((r) => r.double_mat);
    const impactOnlyRows = rows.filter((r) => r.impact_mat && !r.fin_mat);
    const finOnlyRows = rows.filter((r) => !r.impact_mat && r.fin_mat);
    const nonMaterialRows = rows.filter((r) => !r.double_mat && !r.impact_mat && !r.fin_mat);
    const externalRows = db.externalResponses.filter((r) => r.editionId === db.currentEditionId);
    const internalRows = db.internalAssessments.filter((r) => r.editionId === db.currentEditionId);
    const extN = externalRows.length;
    const intN = internalRows.length;
    const avgStake = averageOf(rows.map((r) => r.stakeholder_mean));
    const avgImpact = averageOf(rows.map((r) => r.impact_score));
    const avgFin = averageOf(rows.map((r) => r.fin_score));
    const coveredThemes = rows.filter((r) => r.stakeholder_mean !== null || r.impact_score !== null || r.fin_score !== null).length;
    const topExternal = [...rows].filter((r) => r.stakeholder_mean !== null).sort((a, b) => b.stakeholder_mean - a.stakeholder_mean)[0];
    const topImpact = [...rows].filter((r) => r.impact_score !== null).sort((a, b) => b.impact_score - a.impact_score)[0];
    const topFinancial = [...rows].filter((r) => r.fin_score !== null).sort((a, b) => b.fin_score - a.fin_score)[0];
    const priorityRows = [...rows]
      .map((r) => ({ ...r, integrated_priority: averageOf([r.stakeholder_mean, r.impact_score, r.fin_score]) }))
      .filter((r) => r.integrated_priority !== null)
      .sort((a, b) => b.integrated_priority - a.integrated_priority)
      .slice(0, 10);

    document.getElementById("repEdition").textContent = edition ? edition.name : "(sin edición)";
    document.getElementById("repDate").textContent = new Date().toISOString().slice(0, 10);
    document.getElementById("repRule").textContent = params.ruleDouble;
    document.getElementById("repTauImpact").textContent = fmt(params.tauImpact, 2);
    document.getElementById("repTauFin").textContent = fmt(params.tauFin, 2);
    document.getElementById("repNExternal").textContent = String(extN);
    document.getElementById("repNInternal").textContent = String(intN);
    document.getElementById("repNDouble").textContent = String(doubleRows.length);

    const gf = params.groupFilter && params.groupFilter !== "TODOS" ? params.groupFilter : "TODOS";
    const exec = [
      `Con base en la edición activa (${edition ? edition.name : "sin nombre"}), se registraron ${extN} respuestas externas y ${intN} evaluaciones internas.`,
      `Los scores internos se calcularon con el puntaje directo de impacto y financiero cuando la evaluación fue resumida, o por combinación ponderada de dimensiones cuando existió desglose detallado legado.`,
      `Parámetros vigentes: regla ${params.ruleDouble}, umbrales τ_impacto=${fmt(params.tauImpact,2)} y τ_financiero=${fmt(params.tauFin,2)}.`,
      `Filtro de stakeholders en tablero: ${gf}.`,
      `Resultado: ${doubleRows.length} temas califican como doble materialidad según la regla y umbrales definidos.`
    ].join(" ");
    document.getElementById("repExecutive").textContent = exec;
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    setText("repAvgStake", avgStake !== null ? fmt(avgStake, 2) : "N/D");
    setText("repAvgImpact", avgImpact !== null ? fmt(avgImpact, 2) : "N/D");
    setText("repAvgFin", avgFin !== null ? fmt(avgFin, 2) : "N/D");
    setText("repCoverage", `${coveredThemes}/${DATA.topics.length}`);
    setText("repPortfolioDouble", String(doubleRows.length));
    setText("repPortfolioImpact", String(impactOnlyRows.length));
    setText("repPortfolioFin", String(finOnlyRows.length));
    setText("repPortfolioNone", String(nonMaterialRows.length));
    setText("repExternalNarrative", topExternal ? `La voz externa se concentra en ${topExternal.tema_nombre}. La lectura por grupo permite ver dónde hay mayor sensibilidad y dónde conviene reforzar participación.` : "Aún no existe base suficiente para una lectura externa robusta.");
    setText("repInternalNarrative", topImpact && topFinancial ? `La evaluación interna combina una señal ASG liderada por ${topImpact.tema_nombre} y una señal financiera liderada por ${topFinancial.tema_nombre}.` : "La lectura interna aún requiere mayor cobertura para consolidar hallazgos.");
    setText("repClosing", doubleRows.length ? `El ejercicio sugiere concentrar la gestión en ${doubleRows.length} temas de doble materialidad y monitorear ${impactOnlyRows.length + finOnlyRows.length} temas con materialidad parcial que podrían escalar.` : "Todavía no se consolida un portafolio suficiente de temas de doble materialidad; conviene ampliar la base de evidencia.");
    setText("repAction1", doubleRows.length ? `Asignar dueños ejecutivos a los ${doubleRows.length} temas de doble materialidad, validar alcance y definir metas mínimas por tema.` : "Completar la base de respuestas y fijar un comité responsable de cerrar la priorización final.");
    setText("repAction2", `Traducir los temas priorizados a indicadores, tableros y rutinas mensuales de seguimiento, con foco especial en ${topImpact ? topImpact.tema_nombre : "los temas críticos"} y ${topFinancial ? topFinancial.tema_nombre : "la exposición financiera"}.`);
    setText("repAction3", "Integrar la cartera resultante al reporte corporativo, al plan ESG y al próximo ciclo bianual, dejando trazabilidad de decisiones, cambios de umbral y lecciones aprendidas.");
    renderBulletList("repHighlights", [
      topExternal ? `Mayor sensibilidad externa: ${topExternal.tema_nombre} (${fmt(topExternal.stakeholder_mean, 2)}).` : "No se observa todavía una señal externa dominante.",
      topImpact ? `Mayor impacto ASG: ${topImpact.tema_nombre} (${fmt(topImpact.impact_score, 2)}).` : "No se observa todavía una señal interna robusta de impacto.",
      topFinancial ? `Mayor exposición financiera: ${topFinancial.tema_nombre} (${fmt(topFinancial.fin_score, 2)}).` : "No se observa todavía una señal financiera dominante.",
      `${doubleRows.length} temas son de doble materialidad; ${impactOnlyRows.length} quedan sólo por impacto y ${finOnlyRows.length} sólo por criterio financiero.`
    ]);
    renderBulletList("repRecommendations", [
      doubleRows.length ? `Asignar responsables, metas y KPIs a los ${doubleRows.length} temas de doble materialidad.` : "Completar la captura de información antes de cerrar la priorización final.",
      extN < 10 ? "Ampliar la muestra externa para reforzar representatividad del diagnóstico." : "Mantener una muestra balanceada por grupo de interés en el siguiente ciclo.",
      intN < 5 ? "Incorporar más áreas evaluadoras para fortalecer el juicio interno." : "Consolidar criterios homogéneos del comité para mejorar comparabilidad.",
      "Usar la tabla de prioridades integradas como base del plan ESG y la narrativa del reporte corporativo."
    ]);

    // tabla doble
    const tbodyD = document.querySelector("#tableReportDouble tbody");
    tbodyD.innerHTML = "";
    for (const r of doubleRows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHTML(r.tema_id)} · ${escapeHTML(r.tema_nombre)}</td>
        <td class="right">${r.stakeholder_mean === null ? "" : fmt(r.stakeholder_mean, 2)}</td>
        <td class="right">${r.impact_score === null ? "" : fmt(r.impact_score, 2)}</td>
        <td class="right">${r.fin_score === null ? "" : fmt(r.fin_score, 2)}</td>
      `;
      tbodyD.appendChild(tr);
    }

    // tabla completa
    const tbodyA = document.querySelector("#tableReportAll tbody");
    tbodyA.innerHTML = "";
    for (const r of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHTML(r.tema_id)} · ${escapeHTML(r.tema_nombre)}</td>
        <td class="right">${r.stakeholder_mean === null ? "" : fmt(r.stakeholder_mean, 2)}</td>
        <td class="right">${r.impact_score === null ? "" : fmt(r.impact_score, 2)}</td>
        <td class="right">${r.fin_score === null ? "" : fmt(r.fin_score, 2)}</td>
        <td>${r.impact_mat ? "Sí" : "No"}</td>
        <td>${r.fin_mat ? "Sí" : "No"}</td>
        <td>${r.double_mat ? "Sí" : "No"}</td>
      `;
      tbodyA.appendChild(tr);
    }

    const groupsBody = document.querySelector("#tableReportGroups tbody");
    if (groupsBody) {
      groupsBody.innerHTML = "";
      for (const group of GROUPS) {
        const groupRows = externalRows.filter((r) => r.grupo === group);
        if (!groupRows.length) continue;
        const ratings = groupRows.flatMap((r) => Object.values(r.ratings || {})).filter((v) => isFinite(v));
        const groupAvg = averageOf(ratings);
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${escapeHTML(group)}</td><td class="right">${groupRows.length}</td><td class="right">${extN ? fmt((groupRows.length / extN) * 100, 1) : "0.0"}%</td><td class="right">${groupAvg !== null ? fmt(groupAvg, 2) : "N/D"}</td>`;
        groupsBody.appendChild(tr);
      }
    }

    const areasBody = document.querySelector("#tableReportAreas tbody");
    if (areasBody) {
      const areaMap = new Map();
      for (const row of internalRows) {
        const key = row.area || "Sin área";
        if (!areaMap.has(key)) areaMap.set(key, { area: key, n: 0, temas: 0 });
        const item = areaMap.get(key);
        item.n += 1;
        item.temas += Object.keys(row.table || {}).length;
      }
      areasBody.innerHTML = "";
      for (const row of Array.from(areaMap.values()).sort((a, b) => b.n - a.n)) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${escapeHTML(row.area)}</td><td class="right">${row.n}</td><td class="right">${row.temas}</td>`;
        areasBody.appendChild(tr);
      }
    }

    const priorityBody = document.querySelector("#tableReportPriority tbody");
    if (priorityBody) {
      priorityBody.innerHTML = "";
      for (const r of priorityRows) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHTML(r.tema_id)} Â· ${escapeHTML(r.tema_nombre)}</td>
          <td class="right">${r.stakeholder_mean === null ? "" : fmt(r.stakeholder_mean, 2)}</td>
          <td class="right">${r.impact_score === null ? "" : fmt(r.impact_score, 2)}</td>
          <td class="right">${r.fin_score === null ? "" : fmt(r.fin_score, 2)}</td>
          <td class="right">${fmt(r.integrated_priority, 2)}</td>
        `;
        priorityBody.appendChild(tr);
      }
    }

    renderLegacyResultsTable("tableLegacyReport", legacy.displayRows);

    // plot en reporte
    renderExternalTop10(db, "plotExternalTop10");
    renderMatrixPlot(db, "plotMatrixReport");
    renderRadarPlot(db, "plotRadarReport");
    renderDimensionPlot(db, "plotDimensionReport");
    renderLegacyMatrixPlot(db, "plotLegacyMatrixReport");
    renderLegacyRankingPlot(db, "plotLegacyRankingReport");
    renderTop5KPIs(db);
  }

  function renderAll(db) {
    renderKPIs(db);
    renderQuickTable(db);
    renderExternalLog(db);
    renderInternalLog(db);
    renderLegacyView(db);
    renderCompiledDataView(db);
    // si vista actual es dashboard/reporte, actualizar
    if (document.getElementById("view-dashboard").classList.contains("active")) renderDashboard(db);
    if (document.getElementById("view-legacy").classList.contains("active")) renderLegacyView(db);
    if (document.getElementById("view-compiled").classList.contains("active")) renderCompiledDataView(db);
    if (document.getElementById("view-report").classList.contains("active")) renderReport(db);
  }

  // ---------------------------------------------------------------------------
  // Exportaciones
  // ---------------------------------------------------------------------------
  function exportJSON(db) {
    const blob = JSON.stringify(db, null, 2);
    downloadText(`materialidad_datos_${new Date().toISOString().slice(0, 10)}.json`, blob, "application/json;charset=utf-8");
  }

  function exportCSVPack(db) {
    const { rows } = computeScores(db);
    const legacy = computeLegacyMatrix(db);
    const edition = db.editions.find((e) => e.id === db.currentEditionId);
    const prefix = edition ? edition.name.replace(/\s+/g, "_") : "edicion";

    downloadCSV(`${prefix}_matriz.csv`, rows.map((r) => ({
      tema_id: r.tema_id,
      tema_nombre: r.tema_nombre,
      stakeholder_mean: r.stakeholder_mean,
      stakeholder_n: r.stakeholder_n,
      impact_score: r.impact_score,
      fin_score: r.fin_score,
      impact_mat: r.impact_mat ? 1 : 0,
      fin_mat: r.fin_mat ? 1 : 0,
      double_mat: r.double_mat ? 1 : 0,
    })));

    const externalRows = db.externalResponses.filter((x) => x.editionId === db.currentEditionId);
    const internalRows = db.internalAssessments.filter((x) => x.editionId === db.currentEditionId);

    downloadCSV(`${prefix}_externos_raw.csv`, externalRows.map((x) => ({
      id: x.id,
      ts: x.ts,
      grupo: x.grupo,
      sector: x.sector,
      organizacion: x.organizacion,
      contacto: x.contacto,
      percepcion: x.percepcion,
      comentarios: x.comentarios,
      items: Object.keys(x.ratings || {}).length,
    })));

    downloadCSV(`${prefix}_externos_detalle.csv`, externalRows.flatMap((x) =>
      DATA.topics.map((t) => ({
        id: x.id,
        ts: x.ts,
        grupo: x.grupo,
        organizacion: x.organizacion,
        tema_id: t.tema_id,
        tema_nombre: t.tema_nombre,
        rating: x.ratings && x.ratings[t.tema_id] !== undefined ? x.ratings[t.tema_id] : "",
      }))
    ));

    downloadCSV(`${prefix}_internos_raw.csv`, internalRows.map((x) => ({
      id: x.id,
      ts: x.ts,
      area: x.area,
      rol: x.rol,
      comentarios: x.comentarios,
      temas: Object.keys(x.table || {}).length,
    })));

    downloadCSV(`${prefix}_internos_detalle.csv`, internalRows.flatMap((x) =>
      DATA.topics.map((t) => {
        const row = (x.table || {})[t.tema_id] || {};
        return {
          id: x.id,
          ts: x.ts,
          area: x.area,
          rol: x.rol,
          tema_id: t.tema_id,
          tema_nombre: t.tema_nombre,
          impacto: row.impacto ?? "",
          financiero: row.financiero ?? "",
          severidad: row.severidad ?? "",
          alcance: row.alcance ?? "",
          irremediabilidad: row.irremediabilidad ?? "",
          probabilidad: row.probabilidad ?? "",
          impacto_financiero: row.impacto_financiero ?? "",
          probabilidad_financiera: row.probabilidad_financiera ?? "",
          horizonte: row.horizonte ?? "",
        };
      })
    ));

    downloadCSV(`${prefix}_matriz_clasica.csv`, legacy.rows.map((row) => ({
      tema_id: row.tema_id,
      tema_nombre: row.tema_nombre,
      stakeholder_mean: row.stakeholder_mean ?? "",
      top2box: row.top2box ?? "",
      active_groups_count: row.active_groups_count ?? "",
      active_groups_share: row.active_groups_share ?? "",
      p: row.p ?? "",
      s: row.s ?? "",
      b: row.b ?? "",
      grupos_relacionados: row.grupos_relacionados ?? "",
      e: row.e ?? "",
      c: row.c ?? "",
      f: row.f ?? "",
      riesgo: row.riesgo ?? "",
      oportunidad: row.oportunidad ?? "",
      significancia: row.significancia ?? "",
      madurez: row.madurez ?? "",
      factor: row.factor ?? "",
      expectativas_total: row.expectativas_total ?? "",
      cuadrante: row.cuadrante ?? "",
      prioridad_total: row.prioridad_total ?? "",
    })));
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  async function ensureReportReadyForExport() {
    const db = ensureDB();
    setActiveView("report");
    renderReport(db);
    await nextFrame();
    await nextFrame();
    await delay(250);

    const reportPlots = document.querySelectorAll("#reportArea .plot");
    for (const plot of reportPlots) {
      try {
        await Plotly.Plots.resize(plot);
      } catch (e) {
        console.warn("No se pudo reajustar un gráfico antes de exportar:", e);
      }
    }

    await delay(250);
  }

  function wrapBase64(base64) {
    return (base64.match(/.{1,76}/g) || []).join("\r\n");
  }

  function dataUrlToMhtmlPart(dataUrl, location) {
    const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return {
      location,
      mime: match[1],
      base64: wrapBase64(match[2]),
    };
  }

  function tableOuterHtml(tableId) {
    const table = document.getElementById(tableId);
    return table ? table.outerHTML : `<p class="muted-lite">No disponible.</p>`;
  }

  function contentHtml(elementId) {
    const el = document.getElementById(elementId);
    return el ? el.innerHTML : "";
  }

  function textValue(elementId) {
    const el = document.getElementById(elementId);
    return el ? escapeHTML(el.textContent || "") : "";
  }

  function listItemsFromElement(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return [];
    const items = Array.from(el.children)
      .map((child) => (child.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (items.length) return items;
    return String(el.textContent || "")
      .split(/\n+/)
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function buildWordList(elementId, emptyText) {
    const items = listItemsFromElement(elementId);
    if (!items.length) return `<p class="muted-lite">${escapeHTML(emptyText || "No disponible.")}</p>`;
    return `<ul class="word-list">${items.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>`;
  }

  function buildWordMiniTable(elementId, emptyText) {
    const el = document.getElementById(elementId);
    if (!el) return `<p class="muted-lite">${escapeHTML(emptyText || "No disponible.")}</p>`;
    const rows = Array.from(el.children)
      .map((child) => {
        const spans = child.querySelectorAll("span");
        if (spans.length >= 2) {
          return {
            label: (spans[0].textContent || "").replace(/\s+/g, " ").trim(),
            value: (spans[spans.length - 1].textContent || "").replace(/\s+/g, " ").trim(),
          };
        }
        const text = (child.textContent || "").replace(/\s+/g, " ").trim();
        if (!text) return null;
        return { label: text, value: "" };
      })
      .filter(Boolean);
    if (!rows.length) return `<p class="muted-lite">${escapeHTML(emptyText || "No disponible.")}</p>`;
    return `<table class="mini-table"><tbody>${rows.map((row) => `<tr><td>${escapeHTML(row.label)}</td><td class="mini-value">${escapeHTML(row.value || "")}</td></tr>`).join("")}</tbody></table>`;
  }

  function tableWordHtml(tableId, options = {}) {
    const table = document.getElementById(tableId);
    if (!table) return `<p class="muted-lite">No disponible.</p>`;

    const clone = table.cloneNode(true);
    const rows = clone.querySelectorAll("tr");
    const firstRow = rows[0];
    const columnCount = firstRow ? firstRow.children.length : 1;
    const widths = Array.isArray(options.widths) && options.widths.length === columnCount
      ? options.widths
      : (() => {
          if (columnCount === 1) return [100];
          const first = options.firstColumnWidth || (columnCount >= 7 ? 38 : columnCount >= 5 ? 42 : 50);
          const remaining = Math.max(100 - first, 10);
          const other = remaining / Math.max(columnCount - 1, 1);
          return Array.from({ length: columnCount }, (_, idx) => (idx === 0 ? first : other));
        })();
    const fontSize = options.fontSize || (columnCount >= 7 ? "7.5pt" : columnCount >= 5 ? "8pt" : "8.5pt");

    clone.className = "word-table";
    clone.removeAttribute("style");
    clone.setAttribute("border", "1");
    clone.setAttribute("cellpadding", "0");
    clone.setAttribute("cellspacing", "0");
    clone.style.cssText = `width:100%; border-collapse:collapse; table-layout:fixed; margin:8pt 0 12pt 0; font-size:${fontSize};`;

    clone.querySelectorAll("thead, tbody, tfoot").forEach((section) => section.removeAttribute("style"));
    rows.forEach((row) => {
      row.removeAttribute("style");
      row.style.cssText = "page-break-inside:avoid;";
      Array.from(row.children).forEach((cell, idx) => {
        const align = cell.classList.contains("right") ? "right" : cell.classList.contains("center") ? "center" : "left";
        const isHeader = cell.tagName === "TH";
        cell.className = "";
        cell.removeAttribute("style");
        cell.removeAttribute("width");
        cell.style.cssText = [
          "border:1pt solid #cbd5e1",
          "padding:5pt",
          "vertical-align:top",
          "word-break:break-word",
          "overflow-wrap:anywhere",
          `text-align:${align}`,
          `width:${widths[idx] || widths[widths.length - 1] || 100}%`,
          isHeader ? "background:#edf7f1" : "background:#ffffff",
          isHeader ? "color:#064e3b" : "color:#243041",
          isHeader ? "font-weight:bold" : "font-weight:normal"
        ].join("; ");
      });
    });

    return clone.outerHTML;
  }

  async function capturePlotForWord(plot, width) {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await Plotly.Plots.resize(plot);
        await nextFrame();
        await delay(140);
        const baseWidth = Math.max(plot.clientWidth || 700, 1);
        const baseHeight = Math.max(plot.clientHeight || 500, 1);
        const height = Math.max(520, Math.round(baseHeight * (width / baseWidth)));
        const dataUrl = await Plotly.toImage(plot, {
          format: "png",
          width,
          height,
          scale: 2
        });
        if (/^data:image\/png;base64,/.test(dataUrl)) return { dataUrl, width, height };
        lastError = new Error("Plotly devolvió una imagen inválida.");
      } catch (err) {
        lastError = err;
      }
      await delay(220);
    }
    throw lastError || new Error("No se pudo capturar la figura.");
  }

  async function captureWordFigures() {
    const figureDefs = [
      { id: "plotExternalTop10", file: "image001.png" },
      { id: "plotDimensionReport", file: "image002.png" },
      { id: "plotRadarReport", file: "image003.png" },
      { id: "plotMatrixReport", file: "image004.png" },
      { id: "plotLegacyMatrixReport", file: "image005.png" },
      { id: "plotLegacyRankingReport", file: "image006.png" },
    ];
    const parts = [];
    const refs = {};

    for (const fig of figureDefs) {
      const plot = document.getElementById(fig.id);
      if (!plot) continue;
      try {
        const image = await capturePlotForWord(plot, 760);
        const location = fig.file;
        const part = dataUrlToMhtmlPart(image.dataUrl, location);
        if (part) {
          const maxDisplayWidthPx = 440;
          const displayWidthPx = Math.min(maxDisplayWidthPx, image.width);
          const displayHeightPx = Math.max(220, Math.round(displayWidthPx * (image.height / Math.max(image.width, 1))));
          parts.push(part);
          refs[fig.id] = {
            location,
            widthPx: displayWidthPx,
            heightPx: displayHeightPx,
            widthPt: Math.round(displayWidthPx * 0.75),
            heightPt: Math.round(displayHeightPx * 0.75),
          };
        }
      } catch (err) {
        console.error("No se pudo capturar figura para Word:", fig.id, err);
      }
    }

    return { parts, refs };
  }

  function buildWordFigure(title, src, caption) {
    if (!src) {
      return `<div class="figure-block"><h3>${escapeHTML(title)}</h3><div class="figure-fallback">Figura no disponible en esta exportación.</div></div>`;
    }
    const widthPx = src.widthPx || 440;
    const heightPx = src.heightPx || 280;
    const widthPt = src.widthPt || Math.round(widthPx * 0.75);
    const heightPt = src.heightPt || Math.round(heightPx * 0.75);
    return `<div class="figure-block"><h3>${escapeHTML(title)}</h3><div class="figure"><img src="${src.location}" alt="${escapeHTML(title)}" width="${widthPx}" height="${heightPx}" style="display:block; margin:0 auto; width:${widthPt}pt; height:${heightPt}pt; mso-width-source:userset; mso-height-source:userset; -ms-interpolation-mode:bicubic; border:1pt solid #d7e2dd;" /></div><div class="caption">${escapeHTML(caption || "")}</div></div>`;
  }

  function buildWordHtml(imageRefs) {
    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <title>Reporte Doble Materialidad</title>
  <style>
    @page { size: A4 portrait; margin: 1.2cm; }
    body { font-family: Arial, Tahoma, sans-serif; font-size: 10pt; color: #243041; line-height: 1.45; }
    h1, h2, h3 { margin: 0 0 8pt 0; page-break-after: avoid; }
    h1 { font-size: 24pt; color: #064e3b; letter-spacing: -0.03em; }
    h2 { font-size: 14pt; color: #064e3b; border-bottom: 1pt solid #cbd5e1; padding-bottom: 4pt; margin-top: 18pt; }
    h3 { font-size: 11pt; color: #0f172a; margin-top: 14pt; }
    p { margin: 0 0 8pt 0; }
    .cover { border: 1.5pt solid #065f46; background: #effcf5; padding: 18pt; margin-bottom: 12pt; }
    .cover-top { font-size: 9pt; letter-spacing: 0.16em; text-transform: uppercase; color: #065f46; font-weight: bold; margin-bottom: 8pt; }
    .cover-title { font-size: 22pt; font-weight: 800; color: #064e3b; margin-bottom: 8pt; }
    .cover-sub { font-size: 10pt; color: #334155; }
    .badge-row { margin-top: 10pt; }
    .badge { display: inline-block; padding: 4pt 8pt; margin-right: 6pt; margin-bottom: 6pt; border: 1pt solid #9bd5ba; background: #ffffff; color: #065f46; font-size: 8.5pt; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td, th { word-break: break-word; overflow-wrap: anywhere; }
    .meta-table, .kpi-table, .panel-table, .action-table { margin: 0 0 10pt 0; }
    .meta-cell, .kpi-cell, .panel-cell, .action-cell { border: 1pt solid #d7e2dd; background: #ffffff; padding: 8pt; vertical-align: top; }
    .meta-label, .kpi-label { font-size: 8.5pt; text-transform: uppercase; color: #64748b; font-weight: bold; letter-spacing: 0.06em; }
    .kpi-value { font-size: 18pt; font-weight: 800; color: #064e3b; margin-top: 4pt; }
    .mini-note { font-size: 8.5pt; color: #64748b; margin-top: 4pt; }
    .word-list { margin: 0 0 0 16pt; padding: 0; }
    .word-list li { margin: 0 0 5pt 0; }
    .mini-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; font-size: 8.5pt; }
    .mini-table td { border: 1pt solid #d7e2dd; padding: 5pt; vertical-align: top; }
    .mini-value { width: 22%; text-align: right; font-weight: bold; color: #064e3b; }
    .figure-block { margin: 12pt 0 16pt 0; page-break-inside: avoid; }
    .figure { text-align: center; margin: 8pt auto; }
    .figure img { display: block; margin: 0 auto; }
    .figure-fallback { padding: 10pt; border: 1pt dashed #94a3b8; color: #475569; background: #f8fafc; }
    .caption { font-size: 8.5pt; color: #64748b; text-align: center; }
    .section-intro { margin-bottom: 8pt; color: #334155; }
    .muted-lite { color: #64748b; }
    .page-break { page-break-before: always; }
  </style>
</head>
<body>
  <div class="cover">
    <div class="cover-top">PARACEL · Materialidad 360</div>
    <div class="cover-title">Diagnóstico de Doble Materialidad</div>
    <p class="cover-sub">Documento ejecutivo para revisión gerencial, impresión en PDF y uso en Word.</p>
    <div class="badge-row">
      <span class="badge">Edición ${textValue("repEdition")}</span>
      <span class="badge">Fecha ${textValue("repDate")}</span>
      <span class="badge">Regla ${textValue("repRule")}</span>
      <span class="badge">Doble materialidad ${textValue("repNDouble")}</span>
    </div>
  </div>

  <table class="meta-table">
    <tr>
      <td class="meta-cell">
        <div class="meta-label">Edición analizada</div>
        <div>${textValue("repEdition")}</div>
        <div class="meta-label" style="margin-top:8pt;">Fecha de generación</div>
        <div>${textValue("repDate")}</div>
        <div class="meta-label" style="margin-top:8pt;">Regla condicional</div>
        <div>${textValue("repRule")}</div>
      </td>
      <td class="meta-cell">
        <div class="meta-label">Encuestas externas</div>
        <div>${textValue("repNExternal")}</div>
        <div class="meta-label" style="margin-top:8pt;">Evaluaciones internas</div>
        <div>${textValue("repNInternal")}</div>
        <div class="meta-label" style="margin-top:8pt;">Temas con doble materialidad</div>
        <div>${textValue("repNDouble")}</div>
      </td>
    </tr>
  </table>

  <h2>1. Resumen Ejecutivo</h2>
  <p>${textValue("repExecutive")}</p>

  <table class="kpi-table">
    <tr>
      <td class="kpi-cell"><div class="kpi-label">Promedio externo</div><div class="kpi-value">${textValue("repAvgStake")}</div><div class="mini-note">Importancia media de stakeholders</div></td>
      <td class="kpi-cell"><div class="kpi-label">Promedio impacto</div><div class="kpi-value">${textValue("repAvgImpact")}</div><div class="mini-note">Evaluación ASG agregada</div></td>
      <td class="kpi-cell"><div class="kpi-label">Promedio financiero</div><div class="kpi-value">${textValue("repAvgFin")}</div><div class="mini-note">Evaluación financiera agregada</div></td>
      <td class="kpi-cell"><div class="kpi-label">Cobertura temática</div><div class="kpi-value">${textValue("repCoverage")}</div><div class="mini-note">Temas con evaluación disponible</div></td>
    </tr>
  </table>

  <table class="panel-table">
    <tr>
      <td class="panel-cell">
        <h3>Mensajes Clave</h3>
        ${buildWordList("repHighlights", "Sin mensajes clave disponibles.")}
      </td>
      <td class="panel-cell">
        <h3>Implicaciones Ejecutivas</h3>
        ${buildWordList("repRecommendations", "Sin implicaciones ejecutivas disponibles.")}
      </td>
    </tr>
  </table>

  <div class="page-break"></div>
  <h2>2. Evaluación Externa</h2>
  <p class="section-intro">Resultados de la encuesta a grupos de interés y lectura de relevancia externa.</p>
  ${buildWordFigure("2.1. Top 10 Temas Más Relevantes", imageRefs.plotExternalTop10, "Visión externa de stakeholders sobre temas prioritarios.")}
  <h3>2.2. Cobertura por Grupo de Interés</h3>
  ${tableWordHtml("tableReportGroups", { widths: [44, 14, 14, 28] })}
  <p>${textValue("repExternalNarrative")}</p>

  <div class="page-break"></div>
  <h2>3. Evaluación Interna</h2>
  <p class="section-intro">Síntesis del criterio del comité evaluador y de las áreas internas participantes.</p>
  ${buildWordFigure("3.1. Materialidad por Dimensión ISO 26000", imageRefs.plotDimensionReport, "Comparativo agregado por dimensión temática.")}
  ${buildWordFigure("3.2. Perfil en Radar", imageRefs.plotRadarReport, "Visualización de la señal interna sobre temas de mayor prioridad.")}
  <table class="panel-table">
    <tr>
      <td class="panel-cell">
        <h3>Top 5 Impacto ASG</h3>
        ${buildWordMiniTable("top5Impact", "Sin ranking de impacto disponible.")}
      </td>
      <td class="panel-cell">
        <h3>Top 5 Impacto Financiero</h3>
        ${buildWordMiniTable("top5Fin", "Sin ranking financiero disponible.")}
      </td>
    </tr>
  </table>
  <h3>3.3. Cobertura de Evaluación Interna</h3>
  ${tableWordHtml("tableReportAreas", { widths: [58, 16, 26] })}
  <p>${textValue("repInternalNarrative")}</p>

  <div class="page-break"></div>
  <h2>4. Consolidación y Doble Materialidad</h2>
  <p class="section-intro">Cruce entre visión externa e interna para definir el portafolio de temas materiales.</p>
  ${buildWordFigure("4.1. Matriz de Resultados", imageRefs.plotMatrixReport, "Cruce estratégico entre impacto, señal financiera y relevancia externa.")}
  <h3>4.2. Temas Priorizados</h3>
  ${tableWordHtml("tableReportDouble", { widths: [46, 18, 18, 18] })}
  <h3>4.3. Portafolio de Materialidad</h3>
  <table class="kpi-table">
    <tr>
      <td class="kpi-cell"><div class="kpi-label">Doble materialidad</div><div class="kpi-value">${textValue("repPortfolioDouble")}</div></td>
      <td class="kpi-cell"><div class="kpi-label">Sólo impacto</div><div class="kpi-value">${textValue("repPortfolioImpact")}</div></td>
      <td class="kpi-cell"><div class="kpi-label">Sólo financiero</div><div class="kpi-value">${textValue("repPortfolioFin")}</div></td>
      <td class="kpi-cell"><div class="kpi-label">No materiales</div><div class="kpi-value">${textValue("repPortfolioNone")}</div></td>
    </tr>
  </table>
  <h3>4.4. Prioridades Integradas</h3>
  ${tableWordHtml("tableReportPriority", { widths: [38, 14, 14, 14, 20], fontSize: "7.8pt" })}
  <h3>4.5. Matriz Clásica de Impacto y Expectativas</h3>
  ${buildWordFigure("4.5. Matriz Clásica", imageRefs.plotLegacyMatrixReport, "Cruce reconstruido entre impactos y expectativas a partir de ambas encuestas.")}
  ${buildWordFigure("4.6. Ranking Comparado", imageRefs.plotLegacyRankingReport, "Comparativo por tema entre significancia de impactos y puntaje de expectativas.")}
  ${tableWordHtml("tableLegacyReport", { widths: [36, 12, 14, 12, 12, 8, 6], fontSize: "7.4pt" })}

  <div class="page-break"></div>
  <h2>5. Anexo y Cierre</h2>
  <h3>5.1. Ranking Completo</h3>
  ${tableWordHtml("tableReportAll", { widths: [34, 11, 11, 11, 11, 11, 11], fontSize: "7.4pt" })}
  <h3>5.2. Conclusión Estratégica</h3>
  <p>${textValue("repClosing")}</p>
  <h3>5.3. Plan de Acción Sugerido 2026-2028</h3>
  <table class="action-table">
    <tr>
      <td class="action-cell"><h3>Fase 1 · Alinear y asignar dueños</h3><p>${textValue("repAction1")}</p></td>
      <td class="action-cell"><h3>Fase 2 · Desplegar indicadores y seguimiento</h3><p>${textValue("repAction2")}</p></td>
      <td class="action-cell"><h3>Fase 3 · Integrar reporte y mejora continua</h3><p>${textValue("repAction3")}</p></td>
    </tr>
  </table>
</body>
</html>`;
  }

  function buildMhtmlDocument(html, imageParts) {
    const boundary = `----=mhtml-boundary-${Date.now()}`;
    const lines = [
      "MIME-Version: 1.0",
      `Content-Type: multipart/related; boundary="${boundary}"; type="text/html"`,
      "",
      `--${boundary}`,
      'Content-Type: text/html; charset="utf-8"',
      "Content-Transfer-Encoding: 8bit",
      "Content-Location: report.html",
      "",
      html,
      "",
    ];

    for (const part of imageParts) {
      lines.push(
        `--${boundary}`,
        `Content-Location: ${part.location}`,
        `Content-Type: ${part.mime}`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: inline; filename="${part.location}"`,
        "",
        part.base64,
        ""
      );
    }

    lines.push(`--${boundary}--`, "");
    return lines.join("\r\n");
  }

  async function exportResultsToWord() {
    await ensureReportReadyForExport();
    const { parts, refs } = await captureWordFigures();
    const html = buildWordHtml(refs);
    const mhtml = buildMhtmlDocument(html, parts);
    const blob = new Blob([mhtml], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Reporte_Doble_Materialidad_PARACEL.doc";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // Admin modal
  // ---------------------------------------------------------------------------
  function hookAdmin() {
    const modal = document.getElementById("adminModal");
    
    function loadEmailList() {
      const db = ensureDB();
      if (!db.emails) db.emails = { externa: "", interna: "" };
      const type = document.getElementById("emailListType").value;
      document.getElementById("emailList").value = db.emails[type] || "";
    }

    document.getElementById("btnOpenAdmin").addEventListener("click", () => {
      document.getElementById("adminContentSection").style.display = "block";
      loadEmailList();
      modal.showModal();
    });

    document.getElementById("emailListType").addEventListener("change", loadEmailList);

    document.getElementById("btnSaveEmails").addEventListener("click", () => {
      const db = ensureDB();
      if (!db.emails) db.emails = { externa: "", interna: "" };
      const type = document.getElementById("emailListType").value;
      db.emails[type] = document.getElementById("emailList").value;
      saveDB(db);
      alert("Lista de correos guardada localmente.");
    });

    document.getElementById("btnSendEmails").addEventListener("click", () => {
      const type = document.getElementById("emailListType").value;
      const emailsText = document.getElementById("emailList").value;
      if (!emailsText.trim()) {
        alert("La lista está vacía.");
        return;
      }
      const bcc = emailsText.split(/[\n,;]+/).map(v => v.trim()).filter(v => v).join(",");
      const subject = encodeURIComponent(type === "externa" ? "Encuesta Externa de Materialidad - Paracel" : "Evaluación Interna de Materialidad - Paracel");
      const appUrl = getOfficialAppUrl();
      const bodyData = `Estimado/a,

Le extendemos una cordial invitación para participar en el ejercicio de Análisis de Doble Materialidad de PARACEL. Su perspectiva es fundamental para nuestra organización, ya que nos permitirá identificar y priorizar los temas ambientales, sociales y de gobernanza (ASG) más relevantes para nuestra gestión y relación con ustedes.

Para completar el cuestionario, por favor ingrese al siguiente enlace:
🔗 ${appUrl}

🔒 Datos de Acceso:
Usuario: ${PRIMARY_LOGIN_USER}
Contraseña: ${PRIMARY_LOGIN_PASSWORD}

💡 Nota técnica: El cuestionario se puede rellenar y guardar en su equipo incluso si experimenta intermitencia de internet (modo offline). La respuesta quedará registrada.

Le rogamos amablemente que nos haga llegar sus apreciaciones dentro de los próximos 7 días naturales, a fin de poder procesar la información a tiempo.

Agradecemos de antemano su valiosa colaboración.

Saludos cordiales,
Equipo PARACEL`;
      const body = encodeURIComponent(bodyData);
      window.location.href = `mailto:?bcc=${bcc}&subject=${subject}&body=${body}`;
    });

    const db = ensureDB();
    renderEditionSelects(db);

    document.getElementById("btnExportJSON").addEventListener("click", () => {
      exportJSON(ensureDB());
    });

    document.getElementById("btnExportCSVPack").addEventListener("click", () => {
      exportCSVPack(ensureDB());
    });

    document.getElementById("btnWipeAll").addEventListener("click", () => {
      const ok = confirm("¿Borrar todos los datos del navegador? Esta acción no se puede deshacer.");
      if (!ok) return;
      localStorage.removeItem(APP_KEY);
      localStorage.removeItem(LEGACY_APP_KEY);
      localStorage.removeItem(SYNC_QUEUE_KEY);
      localStorage.removeItem("paracel_external_draft");
      localStorage.removeItem("paracel_internal_draft");
      ACTIVE_DB = null;
      const fresh = ensureDB();
      syncParamsToUI(fresh);
      renderEditionSelects(fresh);
      renderAll(fresh);
      alert("Datos borrados. Se creó una edición inicial nueva.");
    });

    document.getElementById("btnNewEdition").addEventListener("click", () => {
      const name = document.getElementById("newEditionName").value.trim();
      const db2 = ensureDB();
      const y = new Date().getFullYear();
      let id = String(name.replace(/\D/g, '') || y);
      if (id.length > 4) id = id.substring(0, 4);
      const nm = name || `Edición ${y}`;
      
      if (db2.editions.find(e => e.id === id)) {
         alert("Ya existe una edición con ese identificador. Use un nombre distinto (Ej: '2026').");
         return;
      }
      
      const start = nowISO();
      db2.editions.push({ id, name: nm, startDate: start, endDate: null, status: "open", nextDueDate: addYears(start, 2) });
      db2.currentEditionId = id;
      saveDB(db2);
      renderEditionSelects(db2);
      renderAll(db2);
      alert("Nueva edición creada y activada.");
    });

    document.getElementById("btnCloseEdition").addEventListener("click", () => {
      const db2 = ensureDB();
      const e = db2.editions.find((x) => x.id === db2.currentEditionId);
      if (!e) return;
      const ok = confirm(`¿Cerrar la edición activa (${e.name})?`);
      if (!ok) return;
      e.status = "closed";
      e.endDate = nowISO();
      saveDB(db2);
      renderEditionSelects(db2);
      renderAll(db2);
      alert("Edición cerrada.");
    });

    document.getElementById("editionSelectAdmin").addEventListener("change", (ev) => {
      const id = ev.target.value;
      const db2 = ensureDB();
      db2.currentEditionId = id;
      saveDB(db2);
      renderAll(db2);
    });

    // import JSON
    document.getElementById("importJSON").addEventListener("change", async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      const text = await file.text();
      let obj = null;
      try {
        obj = JSON.parse(text);
      } catch {
        alert("Archivo JSON inválido.");
        return;
      }
      const ok = confirm("¿Restaurar la base desde este JSON? Reemplazará los datos actuales.");
      if (!ok) return;
      localStorage.setItem(APP_KEY, JSON.stringify(migrateDB(obj)));
      ACTIVE_DB = null;
      const db2 = ensureDB();
      syncParamsToUI(db2);
      renderEditionSelects(db2);
      renderAll(db2);
      alert("Base restaurada.");
      ev.target.value = "";
    });
  }

  function renderEditionSelects(db) {
    const sel = document.getElementById("editionSelectAdmin");
    sel.innerHTML = "";
    for (const e of db.editions) {
      const o = document.createElement("option");
      o.value = e.id;
      o.textContent = `${e.name} (${e.status})`;
      sel.appendChild(o);
    }
    sel.value = db.currentEditionId;

    // edition pill updated in renderKPIs
  }

  // ---------------------------------------------------------------------------
  // Botones atajos
  // ---------------------------------------------------------------------------
  function hookShortcuts() {
    document.getElementById("btnQuickExport").addEventListener("click", () => exportJSON(ensureDB()));
    document.getElementById("btnQuickPrint").addEventListener("click", () => {
      setActiveView("report");
      setTimeout(() => window.print(), 350);
    });

    document.getElementById("btnPrintReport").addEventListener("click", () => window.print());

    document.getElementById("btnExportWord").addEventListener("click", async function() {
      const btn = this;
      const prevText = btn.textContent;
      btn.textContent = "Generando Word...";
      btn.disabled = true;

      try {
        await exportResultsToWord();
      } catch (err) {
        console.error(err);
        alert("Ocurrió un error al exportar el documento.");
      } finally {
        btn.textContent = prevText;
        btn.disabled = false;
      }
    });

    document.getElementById("btnExportResultsWord").addEventListener("click", async function() {
      const btn = this;
      const prevText = btn.textContent;
      btn.textContent = "Generando Word...";
      btn.disabled = true;

      try {
        const db = ensureDB();
        if (!document.getElementById("view-report").classList.contains("active")) {
          renderReport(db);
        }
        await exportResultsToWord();
      } catch (err) {
        console.error(err);
        alert("Ocurrió un error al exportar los resultados a Word.");
      } finally {
        btn.textContent = prevText;
        btn.disabled = false;
      }
    });

    document.getElementById("btnExportReportCSV").addEventListener("click", () => exportCSVPack(ensureDB()));

    document.getElementById("btnDownloadMatrixCSV").addEventListener("click", () => {
      const db = ensureDB();
      const { rows } = computeScores(db);
      downloadCSV("matriz_doble_materialidad.csv", rows.map((r) => ({
        tema_id: r.tema_id,
        tema_nombre: r.tema_nombre,
        stakeholder_mean: r.stakeholder_mean,
        stakeholder_n: r.stakeholder_n,
        impact_score: r.impact_score,
        fin_score: r.fin_score,
        impact_mat: r.impact_mat ? 1 : 0,
        fin_mat: r.fin_mat ? 1 : 0,
        double_mat: r.double_mat ? 1 : 0,
      })));
    });

    document.getElementById("btnDownloadStakeCSV").addEventListener("click", () => {
      const db = ensureDB();
      const stake = computeStakeholderByTheme(db, db.currentEditionId);
      const rows = DATA.topics.map((t) => {
        const o = stake[t.tema_id];
        return {
          tema_id: t.tema_id,
          tema_nombre: t.tema_nombre,
          n: o.n,
          mean_pool: o.mean_pool,
          mean_equal_groups: o.mean_equal_groups,
          p_ge4: o.p_ge4,
          p_eq5: o.p_eq5,
        };
      });
      downloadCSV("resumen_stakeholders.csv", rows);
    });
  }

  // ---------------------------------------------------------------------------
  // Seguridad mínima de HTML
  // ---------------------------------------------------------------------------
  function escapeHTML(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ---------------------------------------------------------------------------
  // DataLists Poblator
  // ---------------------------------------------------------------------------
  function populateDatalists(db) {
    const sSect = new Map();
    const sOrg = new Map();
    db.externalResponses.forEach(r => {
      if (r.sector) {
        const val = r.sector.trim();
        if (val && !sSect.has(val.toLowerCase())) sSect.set(val.toLowerCase(), val);
      }
      if (r.organizacion) {
        const val = r.organizacion.trim();
        if (val && !sOrg.has(val.toLowerCase())) sOrg.set(val.toLowerCase(), val);
      }
    });

    const lsSect = document.getElementById("listSector");
    lsSect.innerHTML = "";
    Array.from(sSect.values()).sort((a,b) => a.localeCompare(b)).forEach(v => lsSect.appendChild(new Option(v)));

    const lsOrg = document.getElementById("listOrg");
    lsOrg.innerHTML = "";
    Array.from(sOrg.values()).sort((a,b) => a.localeCompare(b)).forEach(v => lsOrg.appendChild(new Option(v)));

    const sArea = new Map();
    const defaultAreas = [
      "Finanzas", "Asuntos Jurídicos & Regulatorios", "Comunicación y Sustentabilidad Social", 
      "Sustentabilidad Ambiental", "TI", "Talento Humano", "Compras", "Logística",
      "Forestal", "Ingeniería", "Seguridad Corporativa"
    ];
    defaultAreas.forEach(def => sArea.set(def.toLowerCase(), def));

    const sRol = new Map();
    const defaultRoles = [
      "Directores/as", "Gerentes", "Coordinadores/as", "Especialistas", 
      "Supervisores/as", "Analistas / Técnicos/as", "Asistentes", "Operadores/as"
    ];
    defaultRoles.forEach(def => sRol.set(def.toLowerCase(), def));

    db.internalAssessments.forEach(r => {
      if (r.area) {
        const val = r.area.trim();
        if (val && !sArea.has(val.toLowerCase())) sArea.set(val.toLowerCase(), val);
      }
      if (r.rol) {
        const val = r.rol.trim();
        if (val && !sRol.has(val.toLowerCase())) sRol.set(val.toLowerCase(), val);
      }
    });

    const lsArea = document.getElementById("listArea");
    lsArea.innerHTML = "";
    Array.from(sArea.values()).sort((a,b) => a.localeCompare(b)).forEach(v => lsArea.appendChild(new Option(v)));

    const lsRol = document.getElementById("listRol");
    lsRol.innerHTML = "";
    Array.from(sRol.values()).sort((a,b) => a.localeCompare(b)).forEach(v => lsRol.appendChild(new Option(v)));
  }

  // ---------------------------------------------------------------------------
  // Inicialización
  // ---------------------------------------------------------------------------
  async function init() {
    const role = sessionStorage.getItem("appRole");
    const globalLogin = document.getElementById("globalLogin");
    const appShell = document.getElementById("appShell");

    document.getElementById("btnSysLogin").addEventListener("click", async () => {
      const u = document.getElementById("sysUser").value;
      const p = document.getElementById("sysPass").value;
      let newRole = null;
      if (u === PRIMARY_LOGIN_USER && p === PRIMARY_LOGIN_PASSWORD) newRole = "admin";

      if (newRole) {
        sessionStorage.setItem("appRole", newRole);
        document.getElementById("sysLoginError").style.display = "none";
        globalLogin.style.display = "none";
        appShell.style.display = "";
        await startApp(newRole);
      } else {
        document.getElementById("sysLoginError").style.display = "block";
      }
    });

    document.getElementById("btnSysLogout").addEventListener("click", () => {
      sessionStorage.removeItem("appRole");
      location.reload();
    });

    // Soporte para presionar ENTER en el input de contraseña
    document.getElementById("sysPass").addEventListener("keyup", (ev) => {
      if (ev.key === "Enter") document.getElementById("btnSysLogin").click();
    });

    if (!role) {
      globalLogin.style.display = "flex";
      appShell.style.display = "none";
      return;
    } else {
      globalLogin.style.display = "none";
      appShell.style.display = "";
      await startApp(role);
    }
  }

  async function startApp(role) {
    // RBAC
    const roleBadge = document.getElementById("userRoleBadge");
    const logExtCard = document.getElementById("tableExternalLog").closest(".card");
    const logIntCard = document.getElementById("tableInternalLog").closest(".card");

    if (role === "admin") {
      roleBadge.textContent = "Administrador";
      roleBadge.style.display = "";
      if (logExtCard) logExtCard.style.display = "";
      if (logIntCard) logIntCard.style.display = "";
      setActiveView("home");
    } else if (role === "externa") {
      roleBadge.textContent = "Encuestado";
      roleBadge.style.display = "";
      document.querySelector("aside.app-nav").style.display = "none";
      document.getElementById("btnOpenAdmin").style.display = "none";
      if (logExtCard) logExtCard.style.display = "none";
      if (logIntCard) logIntCard.style.display = "none";
      setActiveView("external");
    } else if (role === "interna") {
      roleBadge.textContent = "Comité Evaluador";
      roleBadge.style.display = "";
      document.querySelector("aside.app-nav").style.display = "none";
      document.getElementById("btnOpenAdmin").style.display = "none";
      if (logExtCard) logExtCard.style.display = "none";
      if (logIntCard) logIntCard.style.display = "none";
      setActiveView("internal");
    }

    // cargar catálogos
    DATA.topics = await loadJSON("data/topics.json");
    DATA.scale = await loadJSON("data/scale.json");
    DATA.scenarios = await loadJSON("data/scenarios.json");

    // nav
    document.querySelectorAll(".nav-item").forEach((b) => {
      b.addEventListener("click", () => setActiveView(b.dataset.view));
    });

    // botones home
    document.getElementById("btnGoExternal").addEventListener("click", () => setActiveView("external"));
    document.getElementById("btnGoInternal").addEventListener("click", () => setActiveView("internal"));

    // selects grupos
    buildGroupOptions(document.getElementById("extGrupo"), false);
    buildGroupOptions(document.getElementById("groupFilter"), true);

    // escenarios
    buildScenarioOptions(document.getElementById("scenarioSelect"));

    // topics externos
    buildExternalTopics(document.getElementById("extTopics"));
    updateExternalProgress();
    applyTopicSearch("topicSearchExt", "#extTopics", ".topic-card", ".topic-title");

    // tabla interna
    buildInternalCards(document.getElementById("internalCardsContainer"));
    updateInternalProgress();
    applyTopicSearch("topicSearchInt", "#internalCardsContainer", ".topic-block", ".topic-title-block");


// ----------------------------------------------------
// Carga y conciliación de datos - GOOGLE SHEETS para externas + local initial_db.json para internas
// IMPORTANTE: GAS devuelve externalResponses, pero NO devuelve internalAssessments
// Usamos initial_db.json como fuente de evaluaciones internas registradas localmente
// Se limpia localStorage al iniciar para asegurar estado limpio
// ----------------------------------------------------

// Limpiar localStorage al iniciar - comienza con estado limpio
try {
  localStorage.removeItem(APP_KEY);
  console.log("[INIT] localStorage limpiado - comenzando desde cero");
} catch(err) {
  console.warn("[INIT] No se pudo limpiar localStorage:", err);
}

let mergedDB = null;

// Cargar inicial_db.json para evaluaciones internas
const initialDB = await loadOptionalJSON("data/initial_db.json");
console.log("[INIT] initial_db.json loaded:");
console.log("  - internalAssessments:", initialDB && initialDB.internalAssessments ? initialDB.internalAssessments.length : 0);

// Cargar desde Google Sheets (SOLO respuestas externas)
try {
  const cloudDB = await fetchCloudDB();
  if (cloudDB) {
    console.log("[INIT] Datos cargados desde Google Sheets (GAS):");
    console.log("  - Respuestas externas:", cloudDB.externalResponses ? cloudDB.externalResponses.length : 0);
    console.log("  - Evaluaciones internas:", cloudDB.internalAssessments ? cloudDB.internalAssessments.length : 0);
    
    // Combinar: GAS externalResponses + initial_db.json internalAssessments
    mergedDB = {
      ...cloudDB,
      internalAssessments: (initialDB && initialDB.internalAssessments) || []
    };
    console.log("[INIT] MERGED DB creado con:");
    console.log("  - externalResponses del GAS:", mergedDB.externalResponses.length);
    console.log("  - internalAssessments de initial_db.json:", mergedDB.internalAssessments.length);
  }
} catch(err) {
  console.error("[INIT] Fallo al leer Google Sheets:", err);
  alert("Atención: No se pudieron cargar los datos del Excel en línea. Verifique su conexión.");
}

if (!mergedDB) {
  // Si no hay datos en la nube, usar solo initial_db.json
  console.log("[INIT] GAS devolvió vacío - usando solo initial_db.json");
  if (initialDB) {
    mergedDB = initialDB;
  } else {
    // Si tampoco hay initial_db.json, crear estructura vacía
    console.log("[INIT] initial_db.json también vacío - creando estructura inicial");
    mergedDB = {
      version: CURRENT_SCHEMA_VERSION,
      editions: [{ id: "edicion-historica", name: "Edición Histórica (2025)", startDate: new Date().toISOString(), status: "open" }],
      currentEditionId: "edicion-historica",
      externalResponses: [],
      internalAssessments: [],
      params: {},
      lastScenarioId: "base_moderado"
    };
  }
}

if (mergedDB) {
  // Asegurar que todas las evaluaciones (externas e internas) tengan editionId válido
  const validEditionIds = new Set((mergedDB.editions || []).map(e => e.id));
  const defaultEdition = (mergedDB.editions && mergedDB.editions[0]) ? mergedDB.editions[0].id : "edicion-historica";
  
  console.log("[INIT] Pre-procesamiento de evaluaciones:");
  console.log("[INIT] Ediciones en mergedDB:", mergedDB.editions ? mergedDB.editions.map(e => e.id) : []);
  console.log("[INIT] validEditionIds:", Array.from(validEditionIds));
  console.log("[INIT] defaultEdition:", defaultEdition);
  console.log("[INIT] internalAssessments antes:", mergedDB.internalAssessments ? mergedDB.internalAssessments.length : 0);
  
  // Validar y asignar editionId a evaluaciones internas
  if (mergedDB.internalAssessments && mergedDB.internalAssessments.length > 0) {
    mergedDB.internalAssessments = mergedDB.internalAssessments.map(r => {
      if (!r.editionId || !validEditionIds.has(r.editionId)) {
        console.log(`[INIT] Corrigiendo internalAssessment ID ${r.id} - editionId cambió de "${r.editionId}" a "${defaultEdition}"`);
        return { ...r, editionId: defaultEdition };
      }
      return r;
    });
    console.log("[INIT] internalAssessments después de validación:", mergedDB.internalAssessments.length);
  }
  
  // Validar y asignar editionId a respuestas externas
  if (mergedDB.externalResponses && mergedDB.externalResponses.length > 0) {
    const beforeExt = mergedDB.externalResponses.length;
    mergedDB.externalResponses = mergedDB.externalResponses.map(r => {
      if (!r.editionId || !validEditionIds.has(r.editionId)) {
        return { ...r, editionId: defaultEdition };
      }
      return r;
    });
    console.log(`[INIT] externalResponses validadas: ${beforeExt} mantuvieron su editionId o fueron asignadas a ${defaultEdition}`);
  }
  
  ACTIVE_DB = saveDB(mergedDB, { skipConfigSync: true });
}

const db = ensureDB();
console.log("[INIT] DB después de normalización (migrateDB):");
console.log("  - currentEditionId:", db.currentEditionId);
console.log("  - Ediciones:", db.editions ? db.editions.map(e => `${e.id} (${e.status})`) : []);
console.log("  - Respuestas externas totales:", db.externalResponses ? db.externalResponses.length : 0);
console.log("  - Evaluaciones internas totales:", db.internalAssessments ? db.internalAssessments.length : 0);

if (db.externalResponses && db.externalResponses.length > 0) {
  console.log("[INIT] Desglose de respuestas externas por editionId:");
  const byExtEdition = {};
  db.externalResponses.forEach(r => {
    const eid = r.editionId || "sin-edition";
    byExtEdition[eid] = (byExtEdition[eid] || 0) + 1;
  });
  Object.entries(byExtEdition).forEach(([eid, count]) => console.log(`    - ${eid}: ${count}`));
}

if (db.internalAssessments && db.internalAssessments.length > 0) {
  console.log("[INIT] Desglose de evaluaciones internas por editionId:");
  const byIntEdition = {};
  db.internalAssessments.forEach(r => {
    const eid = r.editionId || "sin-edition";
    byIntEdition[eid] = (byIntEdition[eid] || 0) + 1;
  });
  Object.entries(byIntEdition).forEach(([eid, count]) => console.log(`    - ${eid}: ${count}`));
}
    populateDatalists(db);

    // asignar escenario al cargar
    const sc = db.lastScenarioId || "base_moderado";
    document.getElementById("scenarioSelect").value = sc;

    // aplicar parámetros guardados
    syncParamsToUI(db);

    // gfilter options
    document.getElementById("groupFilter").value = db.params.groupFilter || "TODOS";

    // hooks
    hookParamsUI();
    hookExternalForm();
    hookInternalForm();
    hookLegacyView();
    hookCompiledDataView();
    hookAdmin();
    hookShortcuts();

    // aplicar escenario si db no tiene params definidos de forma consistente
    // (si el usuario nunca guardó, se usa el escenario base)
    if (!db.params || !db.params.wImpact) applyScenario(sc);

    renderAll(db);
    flushSyncQueue();

    window.addEventListener("online", () => flushSyncQueue());

    // listeners para cambios de escenario en UI inicial (ya conectados)
    // update kpis on load
  }

  init().catch((err) => {
    console.error(err);
    alert("Error al inicializar la aplicación. Verifique la consola del navegador.");
  });

})();
