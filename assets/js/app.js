
/* =============================================================================
 * PARACEL · Instrumento de Doble Materialidad (v1.0)
 * Encuesta Externa + Evaluación Interna + Tablero + Reporte
 * Almacenamiento local (localStorage). Preparado para GitHub Pages sin backend.
 * ============================================================================= */

(function () {
  "use strict";

  const APP_KEY = "materialidad_instrument_app_v1";
  const REMOTE_SYNC = {
    enabled: true,
    appsScriptUrl: "https://script.google.com/macros/s/AKfycbygA3Rb1RRwMXWosnHIMDOvebYyxzQn3hJBuFzu5gZdCV9523Do93MlyIaz-y74NT2dLg/exec",
  };
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
    ruleDouble: "AND",
    wImpact: { severidad: 0.30, alcance: 0.25, irremediabilidad: 0.25, probabilidad: 0.20 },
    wFin: { impacto_financiero: 0.60, probabilidad_financiera: 0.40 },
    stakeWeightByN: true,
    groupFilter: "TODOS",
  };

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

  function simpleHash(input) {
    let hash = 0;
    const str = String(input || "");
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return `h${Math.abs(hash)}`;
  }

  function topicKeyToSortableValue(topicKey) {
    const m = String(topicKey || "").match(/\d+/);
    return m ? Number(m[0]) : 0;
  }

  function buildInternalAssessmentSemanticKey(row) {
    const table = row && row.table ? row.table : {};
    const serializedTable = Object.keys(table)
      .sort((a, b) => topicKeyToSortableValue(a) - topicKeyToSortableValue(b))
      .map((topicKey) => {
        const item = table[topicKey] || {};
        return [
          topicKey,
          item.severidad ?? "",
          item.alcance ?? "",
          item.irremediabilidad ?? "",
          item.probabilidad ?? "",
          item.impacto_financiero ?? "",
          item.probabilidad_financiera ?? "",
          item.horizonte ?? "",
        ].join(":");
      })
      .join("|");

    return [
      String(row.area || "").trim().toUpperCase(),
      String(row.rol || "").trim().toUpperCase(),
      String(row.comentarios || "").trim().toUpperCase(),
      serializedTable,
    ].join("||");
  }

  function loadJSONP(url) {
    return new Promise((resolve, reject) => {
      const callbackName = `__materialidadJSONP_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const script = document.createElement("script");
      const cleanup = () => {
        if (script.parentNode) script.parentNode.removeChild(script);
        delete window[callbackName];
      };

      window[callbackName] = (payload) => {
        cleanup();
        resolve(payload);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("No se pudo leer la base remota de Apps Script."));
      };

      script.src = `${url}${url.includes("?") ? "&" : "?"}callback=${callbackName}&_ts=${Date.now()}`;
      document.body.appendChild(script);
    });
  }

  function normalizeRemoteInternalAssessment(remoteRow, editionId) {
    if (!remoteRow || !remoteRow.table) return null;

    const table = {};
    for (const topic of DATA.topics) {
      const source = remoteRow.table[topic.tema_id] || remoteRow.table[String(topic.tema_id)] || null;
      if (!source) continue;

      table[topic.tema_id] = {
        severidad: source.severidad === null || source.severidad === undefined ? null : Number(source.severidad),
        alcance: source.alcance === null || source.alcance === undefined ? null : Number(source.alcance),
        irremediabilidad: source.irremediabilidad === null || source.irremediabilidad === undefined ? null : Number(source.irremediabilidad),
        probabilidad: source.probabilidad === null || source.probabilidad === undefined ? null : Number(source.probabilidad),
        impacto_financiero: source.impacto_financiero === null || source.impacto_financiero === undefined ? null : Number(source.impacto_financiero),
        probabilidad_financiera: source.probabilidad_financiera === null || source.probabilidad_financiera === undefined ? null : Number(source.probabilidad_financiera),
        horizonte: source.horizonte || "MEDIO",
      };
    }

    const normalized = {
      id: `remote_${simpleHash(JSON.stringify(remoteRow))}`,
      ts: remoteRow.timestamp ? new Date(remoteRow.timestamp).toISOString() : nowISO(),
      editionId,
      area: remoteRow.area || "",
      rol: remoteRow.cargo || remoteRow.rol || "",
      comentarios: remoteRow.comentarios || "",
      table,
      source: "apps_script_internal",
      sourceKey: `apps_script_internal_${simpleHash(JSON.stringify(remoteRow))}`,
    };

    return Object.keys(normalized.table).length > 0 ? normalized : null;
  }

  async function syncRemoteInternalAssessments(db) {
    if (!REMOTE_SYNC.enabled || !REMOTE_SYNC.appsScriptUrl) return false;
    if (!DATA.topics || DATA.topics.length === 0) return false;

    const payload = await loadJSONP(`${REMOTE_SYNC.appsScriptUrl}?type=internal`);
    if (!payload || payload.status !== "success" || !Array.isArray(payload.rows)) {
      throw new Error("La respuesta remota de evaluaciones internas no fue válida.");
    }

    const existingSourceKeys = new Set(db.internalAssessments.map((row) => row.sourceKey).filter(Boolean));
    const existingSemanticKeys = new Set(db.internalAssessments.map((row) => buildInternalAssessmentSemanticKey(row)));
    let added = 0;

    for (const remoteRow of payload.rows) {
      const normalized = normalizeRemoteInternalAssessment(remoteRow, db.currentEditionId);
      if (!normalized) continue;

      const semanticKey = buildInternalAssessmentSemanticKey(normalized);
      if (existingSourceKeys.has(normalized.sourceKey) || existingSemanticKeys.has(semanticKey)) continue;

      db.internalAssessments.push(normalized);
      existingSourceKeys.add(normalized.sourceKey);
      existingSemanticKeys.add(semanticKey);
      added += 1;
    }

    db.remoteSync = {
      ...(db.remoteSync || {}),
      lastInternalSyncAt: nowISO(),
      lastInternalRemoteCount: payload.rows.length,
    };

    if (added > 0) saveDB(db);
    else saveDB(db);
    return added > 0;
  }

  function syncRemoteInternalInBackground() {
    const db = ensureDB();
    syncRemoteInternalAssessments(db)
      .then((changed) => {
        if (changed) {
          populateDatalists(db);
          renderAll(db);
        }
      })
      .catch((err) => console.warn("No se pudo sincronizar evaluaciones internas remotas:", err));
  }

  // ---------------------------------------------------------------------------
  // Base local
  // ---------------------------------------------------------------------------
  function loadDB() {
    const raw = localStorage.getItem(APP_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveDB(db) {
    localStorage.setItem(APP_KEY, JSON.stringify(db));
  }

  function ensureDB() {
    let db = loadDB();
    if (!db) {
      db = {
        version: 1,
        editions: [],
        currentEditionId: null,
        externalResponses: [],
        internalAssessments: [],
        params: { ...DEFAULT_PARAMS },
        lastScenarioId: "base_moderado",
        remoteSync: {
          lastInternalSyncAt: null,
          lastInternalRemoteCount: 0,
        },
      };
    }

    if (!db.editions || db.editions.length === 0) {
      const y = new Date().getFullYear();
      const id = uuidv4();
      const start = nowISO();
      db.editions = [
        {
          id,
          name: `Edición ${y}`,
          startDate: start,
          endDate: null,
          status: "open",
          nextDueDate: addYears(start, 2),
        },
      ];
      db.currentEditionId = id;
    }

    if (!db.currentEditionId) db.currentEditionId = db.editions[0].id;
    if (!db.params) db.params = { ...DEFAULT_PARAMS };
    if (!db.remoteSync) db.remoteSync = { lastInternalSyncAt: null, lastInternalRemoteCount: 0 };

    saveDB(db);
    return db;
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

  function computeInternalByTheme(db, editionId) {
    // Devuelve: tema_id -> promedios de dims y scores
    const topics = DATA.topics.map((t) => t.tema_id);
    const out = {};
    for (const tid of topics) {
      out[tid] = {
        tema_id: tid,
        n: 0,
        dims: {
          severidad: { n: 0, sum: 0, mean: null },
          alcance: { n: 0, sum: 0, mean: null },
          irremediabilidad: { n: 0, sum: 0, mean: null },
          probabilidad: { n: 0, sum: 0, mean: null },
          impacto_financiero: { n: 0, sum: 0, mean: null },
          probabilidad_financiera: { n: 0, sum: 0, mean: null },
        },
        horizon_mode: null,
      };
    }

    const rows = db.internalAssessments.filter((r) => r.editionId === editionId);
    for (const r of rows) {
      const table = r.table || {};
      for (const tid of topics) {
        const row = table[tid];
        if (!row) continue;

        let any = false;
        for (const k of ["severidad", "alcance", "irremediabilidad", "probabilidad", "impacto_financiero", "probabilidad_financiera"]) {
          const v = Number(row[k]);
          if (!isFinite(v)) continue;
          out[tid].dims[k].n += 1;
          out[tid].dims[k].sum += v;
          any = true;
        }
        if (any) out[tid].n += 1;
      }
    }

    // horizon: moda simple
    for (const tid of topics) {
      const counts = { CORTO: 0, MEDIO: 0, LARGO: 0 };
      for (const r of rows) {
        const row = (r.table || {})[tid];
        if (!row || !row.horizonte) continue;
        if (counts[row.horizonte] !== undefined) counts[row.horizonte] += 1;
      }
      const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      out[tid].horizon_mode = best && best[1] > 0 ? best[0] : null;

      for (const k of Object.keys(out[tid].dims)) {
        const d = out[tid].dims[k];
        d.mean = d.n > 0 ? d.sum / d.n : null;
      }
    }
    return out;
  }

  function computeScores(db) {
    const editionId = db.currentEditionId;
    const params = getParams(db);
    const wI = normalizeWeights({
      severidad: clamp01(params.wImpact.severidad),
      alcance: clamp01(params.wImpact.alcance),
      irremediabilidad: clamp01(params.wImpact.irremediabilidad),
      probabilidad: clamp01(params.wImpact.probabilidad),
    });
    const wF = normalizeWeights({
      impacto_financiero: clamp01(params.wFin.impacto_financiero),
      probabilidad_financiera: clamp01(params.wFin.probabilidad_financiera),
    });

    const stake = computeStakeholderByTheme(db, editionId);
    const internal = computeInternalByTheme(db, editionId);

    const rows = [];
    for (const t of DATA.topics) {
      const tid = t.tema_id;

      const stakeMean = params.stakeWeightByN ? stake[tid].mean_pool : stake[tid].mean_equal_groups;

      const di = internal[tid].dims;
      const sev = di.severidad.mean;
      const alc = di.alcance.mean;
      const irr = di.irremediabilidad.mean;
      const prb = di.probabilidad.mean;

      const finI = di.impacto_financiero.mean;
      const finP = di.probabilidad_financiera.mean;

      const impactScore =
        [sev, alc, irr, prb].every((v) => isFinite(v))
          ? wI.severidad * sev + wI.alcance * alc + wI.irremediabilidad * irr + wI.probabilidad * prb
          : null;

      const finScore =
        [finI, finP].every((v) => isFinite(v))
          ? wF.impacto_financiero * finI + wF.probabilidad_financiera * finP
          : null;

      const isImpactMat = impactScore !== null ? impactScore >= params.tauImpact : false;
      const isFinMat = finScore !== null ? finScore >= params.tauFin : false;
      const isDouble = params.ruleDouble === "AND" ? isImpactMat && isFinMat : isImpactMat || isFinMat;

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

    return { rows, stake, internal, wI, wF };
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
    if (viewName === "report") renderReport(db);
    if (viewName === "home" || viewName === "dashboard" || viewName === "report" || viewName === "internal") {
      syncRemoteInternalInBackground();
    }
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
                <th style="width: 250px; text-align: center;">Nivel de Importancia</th>
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
        const card = btn.closest('.dim-card');
        card.querySelectorAll(`input[type="radio"][value="${val}"]`).forEach((r) => r.checked = true);
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
                <th>Severidad</th>
                <th>Alcance</th>
                <th>Irremediabilidad</th>
                <th>Probabilidad</th>
                <th>Impacto Fin.</th>
                <th>Probabilidad Fin.</th>
                <th>Horizonte</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      for (const t of dimTopics) {
        html += `<tr class="topic-block" data-tid="${t.tema_id}">
          <td class="topic-title-block">${t.tema_id} · ${t.tema_nombre}</td>
          <td>${mkPillsCompact(t.tema_id, "severidad", scale5)}</td>
          <td>${mkPillsCompact(t.tema_id, "alcance", scale5)}</td>
          <td>${mkPillsCompact(t.tema_id, "irremediabilidad", scale5)}</td>
          <td>${mkPillsCompact(t.tema_id, "probabilidad", scale5)}</td>
          <td>${mkPillsCompact(t.tema_id, "impacto_financiero", scale5)}</td>
          <td>${mkPillsCompact(t.tema_id, "probabilidad_financiera", scale5)}</td>
          <td>${mkPillsCompact(t.tema_id, "horizonte", horizVals)}</td>
        </tr>`;
      }
      html += `</tbody></table></div>`;
      card.innerHTML = html;
      container.appendChild(card);
    }

    container.querySelectorAll('.btn-mark-dim').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.val;
        const card = btn.closest('.dim-card');
        card.querySelectorAll(`input[type="radio"][value="${val}"]`).forEach((r) => r.checked = true);
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
      const inputs = document.querySelectorAll(`input[name^="int_${t.tema_id}_"]:checked`);
      if (inputs.length > 0) complete += 1;
    }
    
    // Autosave draft
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

  function syncParamsToUI(db) {
    const p = getParams(db);
    document.getElementById("tauImpact").value = String(p.tauImpact);
    document.getElementById("tauFin").value = String(p.tauFin);
    document.getElementById("tauImpactVal").textContent = fmt(p.tauImpact, 1);
    document.getElementById("tauFinVal").textContent = fmt(p.tauFin, 1);
    document.getElementById("ruleSelect").value = p.ruleDouble;

    document.getElementById("wSev").value = String(p.wImpact.severidad);
    document.getElementById("wAlc").value = String(p.wImpact.alcance);
    document.getElementById("wIrr").value = String(p.wImpact.irremediabilidad);
    document.getElementById("wProb").value = String(p.wImpact.probabilidad);

    document.getElementById("wFinImp").value = String(p.wFin.impacto_financiero);
    document.getElementById("wFinProb").value = String(p.wFin.probabilidad_financiera);

    document.getElementById("chkStakeWeightByN").checked = !!p.stakeWeightByN;

    // group filter
    const gf = document.getElementById("groupFilter");
    gf.value = p.groupFilter || "TODOS";
  }

  function readParamsFromUI(db) {
    const p = getParams(db);

    p.tauImpact = Number(document.getElementById("tauImpact").value);
    p.tauFin = Number(document.getElementById("tauFin").value);
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

    db.params = p;
    return db;
  }

  function hookParamsUI() {
    const tauImpact = document.getElementById("tauImpact");
    const tauFin = document.getElementById("tauFin");

    const onSlide = () => {
      document.getElementById("tauImpactVal").textContent = fmt(Number(tauImpact.value), 1);
      document.getElementById("tauFinVal").textContent = fmt(Number(tauFin.value), 1);
      const db = ensureDB();
      readParamsFromUI(db);
      saveDB(db);
      renderAll(db);
    };

    tauImpact.addEventListener("input", onSlide);
    tauFin.addEventListener("input", onSlide);

    ["ruleSelect", "wSev", "wAlc", "wIrr", "wProb", "wFinImp", "wFinProb", "chkStakeWeightByN", "groupFilter"].forEach((id) => {
      document.getElementById(id).addEventListener("change", () => {
        const db = ensureDB();
        readParamsFromUI(db);
        saveDB(db);
        syncParamsToUI(db);
        renderAll(db);
      });
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

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const db = ensureDB();

      const grupo = grp.value;
      const organizacion = org.value.trim();
      const sector = st.value.trim();
      const contacto = ce.value.trim();
      // Wait, there's percepcion and comentarios normally, but if not in DOM, it's ok string:
      const rawPerc = document.getElementById("extPercepcion");
      const percepcion = rawPerc ? rawPerc.value.trim() : "";
      const rawCom = document.getElementById("extComentarios");
      const comentarios = rawCom ? rawCom.value.trim() : "";

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

      const row = {
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
      };

      db.externalResponses.push(row);
      saveDB(db);
      populateDatalists(db);

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

    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const db = ensureDB();

      const area = intArea.value.trim();
      const rol = intRol.value.trim();
      const comentarios = intComentarios.value.trim();

      if (!area) {
        alert("Debe completar el área evaluadora.");
        return;
      }

      const table = {};
      let complete = 0;

      for (const t of DATA.topics) {
        const row = {};
        const keys = ["severidad", "alcance", "irremediabilidad", "probabilidad", "impacto_financiero", "probabilidad_financiera", "horizonte"];
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

        // Aunque esté incompleto se arma el objeto, luego se intercepta la suma
        if (answeredKeys > 0) {
          table[t.tema_id] = {
            severidad: row.severidad ? Number(row.severidad) : null,
            alcance: row.alcance ? Number(row.alcance) : null,
            irremediabilidad: row.irremediabilidad ? Number(row.irremediabilidad) : null,
            probabilidad: row.probabilidad ? Number(row.probabilidad) : null,
            impacto_financiero: row.impacto_financiero ? Number(row.impacto_financiero) : null,
            probabilidad_financiera: row.probabilidad_financiera ? Number(row.probabilidad_financiera) : null,
            horizonte: row.horizonte || null,
          };
        }
      }

      if (complete < DATA.topics.length) {
        alert(`Faltan respuestas. Debe calificar TODOS los cuadrantes de los 27 temas antes de enviar.\nTemas 100% completados actualmente: ${complete}`);
        return;
      }

      const row = {
        id: uuidv4(),
        ts: nowISO(),
        editionId: db.currentEditionId,
        area,
        rol,
        comentarios,
        table,
      };

      db.internalAssessments.push(row);
      saveDB(db);
      populateDatalists(db);

      if (REMOTE_SYNC.enabled && REMOTE_SYNC.appsScriptUrl) {
        const orderedTopics = [...DATA.topics].sort((a, b) => topicKeyToSortableValue(a.tema_id) - topicKeyToSortableValue(b.tema_id));
        const respuestasImpacto = orderedTopics.map((topic) => {
          const item = table[topic.tema_id] || {};
          return item.severidad ?? "";
        });
        const respuestasFinanciero = orderedTopics.map((topic) => {
          const item = table[topic.tema_id] || {};
          return item.impacto_financiero ?? "";
        });

        fetch(REMOTE_SYNC.appsScriptUrl, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            type: "internal",
            payload: {
              nombreApellidos: "",
              area,
              cargo: rol,
              respuestasImpacto,
              respuestasFinanciero,
              comentarios,
            },
          }),
        }).catch((err) => console.warn("No se pudo replicar la evaluación interna en Apps Script:", err));
      }

      form.reset();
      document.querySelectorAll('#internalCardsContainer input[type="radio"]').forEach((r) => (r.checked = false));
      localStorage.removeItem("paracel_internal_draft");
      updateInternalProgress();

      renderAll(db);
      alert("¡Gracias por su evaluación!\nLos puntajes internos han sido guardados de forma exitosa.\n\nPuede cerrar esta pestaña o registrar una nueva evaluación desde cero.");
    });
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
    const extN = db.externalResponses.filter((r) => r.editionId === db.currentEditionId).length;
    const intN = db.internalAssessments.filter((r) => r.editionId === db.currentEditionId).length;
    document.getElementById("kpiExternalN").textContent = String(extN);
    document.getElementById("kpiInternalN").textContent = String(intN);
    document.getElementById("kpiThemesN").textContent = String(DATA.topics.length);

    const edition = db.editions.find((e) => e.id === db.currentEditionId);
    if (edition) {
      document.getElementById("editionPill").textContent = `${edition.name} · ${edition.status.toUpperCase()}`;
      const due = edition.nextDueDate ? new Date(edition.nextDueDate) : null;
      const now = new Date();
      let msg = `Ciclo bianual: próxima edición sugerida ${edition.nextDueDate ? edition.nextDueDate.slice(0, 10) : "(no definida)"}.`;
      if (due && due <= now) msg = `Atención: la edición bianual está vencida. Se recomienda crear una nueva edición.`;
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

    const x = [];
    const y = [];
    const text = [];
    const size = [];
    const color = [];

    for (const r of rows) {
      if (r.impact_score === null || r.fin_score === null) continue;
      x.push(r.fin_score);
      y.push(r.impact_score);
      text.push(`${r.tema_id} · ${r.tema_nombre}`);
      const sm = r.stakeholder_mean;
      const s = sm === null ? 10 : 10 + ((sm - 1) / 4) * 18;
      size.push(s);
      color.push(r.double_mat ? "#064e3b" : (r.impact_mat ? "#059669" : (r.fin_mat ? "#16a34a" : "#94a3b8")));
    }

    const data = [{
      x, y, text,
      mode: "markers",
      type: "scatter",
      marker: { size, color, opacity: 0.85, line: { width: 1, color: "rgba(2,44,34,0.25)" } },
      hovertemplate: "<b>%{text}</b><br>Financiero: %{x:.2f}<br>Impacto: %{y:.2f}<extra></extra>"
    }];

    const layout = {
      margin: { l: 55, r: 20, t: 10, b: 50 },
      xaxis: { title: "Score financiero", range: [1, 5], gridcolor: "rgba(2,44,34,0.10)", zeroline: false },
      yaxis: { title: "Score impacto", range: [1, 5], gridcolor: "rgba(2,44,34,0.10)", zeroline: false },
      shapes: [
        { type: "line", x0: params.tauFin, x1: params.tauFin, y0: 1, y1: 5, line: { color: "rgba(185,28,28,0.55)", width: 2, dash: "dot" } },
        { type: "line", x0: 1, x1: 5, y0: params.tauImpact, y1: params.tauImpact, line: { color: "rgba(185,28,28,0.55)", width: 2, dash: "dot" } },
      ],
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(255,255,255,0.75)",
      showlegend: false
    };

    Plotly.newPlot(targetId, data, layout, { displayModeBar: false, responsive: true });
  }

  function renderRankingTable(db) {
    const { rows } = computeScores(db);
    const tbody = document.querySelector("#tableRanking tbody");
    tbody.innerHTML = "";

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
      tbody.appendChild(tr);
    }
  }

  function renderDashboard(db) {
    renderMatrixPlot(db, "plotMatrix");
    renderRankingTable(db);
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

  function renderReport(db) {
    const params = getParams(db);
    const edition = db.editions.find((e) => e.id === db.currentEditionId);

    const { rows } = computeScores(db);
    const doubleRows = rows.filter((r) => r.double_mat);

    const extN = db.externalResponses.filter((r) => r.editionId === db.currentEditionId).length;
    const intN = db.internalAssessments.filter((r) => r.editionId === db.currentEditionId).length;

    document.getElementById("repEdition").textContent = edition ? edition.name : "(sin edición)";
    document.getElementById("repDate").textContent = new Date().toISOString().slice(0, 10);
    document.getElementById("repRule").textContent = params.ruleDouble;
    document.getElementById("repTauImpact").textContent = fmt(params.tauImpact, 1);
    document.getElementById("repTauFin").textContent = fmt(params.tauFin, 1);
    document.getElementById("repNExternal").textContent = String(extN);
    document.getElementById("repNInternal").textContent = String(intN);
    document.getElementById("repNDouble").textContent = String(doubleRows.length);

    const gf = params.groupFilter && params.groupFilter !== "TODOS" ? params.groupFilter : "TODOS";
    const exec = [
      `Con base en la edición activa (${edition ? edition.name : "sin nombre"}), se registraron ${extN} respuestas externas y ${intN} evaluaciones internas.`,
      `Los scores internos se calcularon por combinación ponderada de severidad, alcance, irremediabilidad y probabilidad (impacto), y de impacto financiero y probabilidad financiera (financiero).`,
      `Parámetros vigentes: regla ${params.ruleDouble}, umbrales τ_impacto=${fmt(params.tauImpact,1)} y τ_financiero=${fmt(params.tauFin,1)}.`,
      `Filtro de stakeholders en tablero: ${gf}.`,
      `Resultado: ${doubleRows.length} temas califican como doble materialidad según la regla y umbrales definidos.`
    ].join(" ");
    document.getElementById("repExecutive").textContent = exec;

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

    // plot en reporte
    renderMatrixPlot(db, "plotMatrixReport");
    renderDimensionPlot(db, "plotDimensionReport");
    renderTop5KPIs(db);
  }

  function renderAll(db) {
    renderKPIs(db);
    renderQuickTable(db);
    renderExternalLog(db);
    renderInternalLog(db);
    // si vista actual es dashboard/reporte, actualizar
    if (document.getElementById("view-dashboard").classList.contains("active")) renderDashboard(db);
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
    const edition = db.editions.find((e) => e.id === db.currentEditionId);
    const prefix = edition ? edition.name.replace(/\s+/g, "_") : "edicion";

    // matriz (ranking)
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

    // externos raw
    downloadCSV(`${prefix}_externos_raw.csv`, db.externalResponses
      .filter((x) => x.editionId === db.currentEditionId)
      .map((x) => ({
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

    // internos raw
    downloadCSV(`${prefix}_internos_raw.csv`, db.internalAssessments
      .filter((x) => x.editionId === db.currentEditionId)
      .map((x) => ({
        id: x.id,
        ts: x.ts,
        area: x.area,
        rol: x.rol,
        comentarios: x.comentarios,
        temas: Object.keys(x.table || {}).length,
      })));
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
      const credUser = type === "externa" ? "encuesta" : "comite";
      const bodyData = `Estimado/a,

Le extendemos una cordial invitación para participar en el ejercicio de Análisis de Doble Materialidad de PARACEL. Su perspectiva es fundamental para nuestra organización, ya que nos permitirá identificar y priorizar los temas ambientales, sociales y de gobernanza (ASG) más relevantes para nuestra gestión y relación con ustedes.

Para completar el cuestionario, por favor ingrese al siguiente enlace:
🔗 https://monitorimpactosocial.github.io/materialidad

🔒 Datos de Acceso:
Usuario: ${credUser}
Contraseña: paracel

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
      const nm = name || `Edición ${y}`;
      const id = uuidv4();
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
      localStorage.setItem(APP_KEY, JSON.stringify(obj));
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
        const reportDiv = document.getElementById("reportArea");
        const clone = reportDiv.cloneNode(true);
        
        const plots = reportDiv.querySelectorAll(".plot");
        const clonePlots = clone.querySelectorAll(".plot");
        
        // Snapshot every plotly instance
        for(let i = 0; i < plots.length; i++) {
          try {
            const dataUrl = await Plotly.toImage(plots[i], {format: 'png', height: 400, width: 700});
            const img = document.createElement("img");
            img.src = dataUrl;
            img.style.width = "100%";
            img.style.maxWidth = "700px";
            clonePlots[i].parentNode.replaceChild(img, clonePlots[i]);
          } catch(e) { console.error("Plotly toImage Error:", e); }
        }
        
        // Inline styles for Word compatibility
        clone.querySelectorAll("table").forEach(t => {
          t.style.borderCollapse = "collapse";
          t.style.width = "100%";
          t.style.marginTop = "10px";
          t.style.marginBottom = "20px";
        });
        clone.querySelectorAll("th").forEach(th => {
          th.style.border = "1px solid #ccc";
          th.style.padding = "8px";
          th.style.backgroundColor = "#f2fbf7";
          th.style.color = "#064e3b";
          th.style.fontWeight = "bold";
        });
        clone.querySelectorAll("td").forEach(td => {
          td.style.border = "1px solid #ccc";
          td.style.padding = "8px";
        });
        clone.querySelectorAll(".no-print").forEach(e => e.remove());

        const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
          <head>
            <meta charset='utf-8'>
            <title>Export HTML To Doc</title>
          </head>
          <body style="font-family: Arial, Tahoma, sans-serif; font-size: 11pt; color: #333;">${clone.innerHTML}</body>
        </html>`;
        
        const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Reporte_Doble_Materialidad_PARACEL.doc';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.error(err);
        alert("Ocurrió un error al exportar el documento.");
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
    const sRol = new Map();
    
    const defaultAreas = ["Forestal", "Ingeniería", "Seguridad Corporativa"];
    defaultAreas.forEach(def => sArea.set(def.toLowerCase(), def));

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
      if (u === "user" && p === "123") newRole = "admin";
      else if (u === "encuesta" && p === "paracel") newRole = "externa";
      else if (u === "comite" && p === "paracel") newRole = "interna";

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

    // Pre-carga de datos históricos si la base estad vacía
    if (!loadDB()) {
      try {
        const initialDB = await loadJSON("data/initial_db.json");
        if (initialDB) saveDB(initialDB);
      } catch (e) {
        console.warn("No se encontró initial_db.json");
      }
    }

    // DB
    const db = ensureDB();
    try {
      await syncRemoteInternalAssessments(db);
    } catch (err) {
      console.warn("No se pudo sincronizar la base remota al iniciar:", err);
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
    hookAdmin();
    hookShortcuts();

    // aplicar escenario si db no tiene params definidos de forma consistente
    // (si el usuario nunca guardó, se usa el escenario base)
    if (!db.params || !db.params.wImpact) applyScenario(sc);

    renderAll(db);

    // listeners para cambios de escenario en UI inicial (ya conectados)
    // update kpis on load
  }

  init().catch((err) => {
    console.error(err);
    alert("Error al inicializar la aplicación. Verifique la consola del navegador.");
  });

})();
