
/* =============================================================================
 * PARACEL · Instrumento de Doble Materialidad (v1.0)
 * Encuesta Externa + Evaluación Interna + Tablero + Reporte
 * Almacenamiento local (localStorage). Preparado para GitHub Pages sin backend.
 * ============================================================================= */

(function () {
  "use strict";

  const APP_KEY = "materialidad_instrument_app_v1";
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

  function buildExternalTopics(container) {
    container.innerHTML = "";
    const scale = DATA.scale; // [{label,value}]
    for (const t of DATA.topics) {
      const card = document.createElement("div");
      card.className = "topic-card";
      card.dataset.tid = t.tema_id;

      const title = document.createElement("div");
      title.className = "topic-title";
      title.textContent = `${t.tema_id} · ${t.tema_nombre}`;
      card.appendChild(title);

      const likert = document.createElement("div");
      likert.className = "likert";

      for (const s of scale) {
        const id = `ext_${t.tema_id}_${s.value}`;
        const lab = document.createElement("label");
        lab.htmlFor = id;

        const inp = document.createElement("input");
        inp.type = "radio";
        inp.name = `ext_${t.tema_id}`;
        inp.id = id;
        inp.value = String(s.value);
        inp.addEventListener("change", updateExternalProgress);

        const span = document.createElement("span");
        span.textContent = s.label.replace("RELEVANTE", "REL.");

        lab.appendChild(inp);
        lab.appendChild(span);
        likert.appendChild(lab);
      }

      card.appendChild(likert);
      container.appendChild(card);
    }
  }

  function buildInternalTable(tbody) {
    tbody.innerHTML = "";
    const mkSel = (tid, key) => {
      const sel = document.createElement("select");
      sel.dataset.tid = tid;
      sel.dataset.key = key;

      const o0 = document.createElement("option");
      o0.value = "";
      o0.textContent = "";
      sel.appendChild(o0);

      for (let i = 1; i <= 5; i++) {
        const o = document.createElement("option");
        o.value = String(i);
        o.textContent = String(i);
        sel.appendChild(o);
      }
      sel.addEventListener("change", updateInternalProgress);
      return sel;
    };

    const mkHorizon = (tid) => {
      const sel = document.createElement("select");
      sel.dataset.tid = tid;
      sel.dataset.key = "horizonte";
      for (const h of HORIZONS) {
        const o = document.createElement("option");
        o.value = h.v;
        o.textContent = h.t;
        sel.appendChild(o);
      }
      sel.addEventListener("change", updateInternalProgress);
      return sel;
    };

    for (const t of DATA.topics) {
      const tr = document.createElement("tr");
      tr.dataset.tid = t.tema_id;

      const td0 = document.createElement("td");
      td0.textContent = `${t.tema_id} · ${t.tema_nombre}`;
      tr.appendChild(td0);

      const keys = ["severidad", "alcance", "irremediabilidad", "probabilidad", "impacto_financiero", "probabilidad_financiera"];
      for (const k of keys) {
        const td = document.createElement("td");
        td.className = "center";
        td.appendChild(mkSel(t.tema_id, k));
        tr.appendChild(td);
      }

      const tdH = document.createElement("td");
      tdH.appendChild(mkHorizon(t.tema_id));
      tr.appendChild(tdH);

      tbody.appendChild(tr);
    }
  }

  // ---------------------------------------------------------------------------
  // UI: Progreso y filtros
  // ---------------------------------------------------------------------------
  function updateExternalProgress() {
    const answered = DATA.topics.reduce((acc, t) => {
      const checked = document.querySelector(`input[name="ext_${t.tema_id}"]:checked`);
      return acc + (checked ? 1 : 0);
    }, 0);
    document.getElementById("extProgress").textContent = `${answered} / ${DATA.topics.length}`;
  }

  function updateInternalProgress() {
    const tbody = document.querySelector("#tableInternal tbody");
    let complete = 0;
    for (const t of DATA.topics) {
      const tr = tbody.querySelector(`tr[data-tid="${t.tema_id}"]`);
      if (!tr) continue;
      const sels = tr.querySelectorAll("select");
      let any = false;
      for (const s of sels) {
        if (s.value !== "") { any = true; break; }
      }
      if (any) complete += 1;
    }
    document.getElementById("intProgress").textContent = `${complete} / ${DATA.topics.length}`;
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
    const btnClear = document.getElementById("btnExtClear");

    btnClear.addEventListener("click", () => {
      form.reset();
      document.querySelectorAll('#extTopics input[type="radio"]').forEach((r) => (r.checked = false));
      updateExternalProgress();
    });

    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const db = ensureDB();

      const grupo = document.getElementById("extGrupo").value;
      const sector = document.getElementById("extSector").value.trim();
      const org = document.getElementById("extOrg").value.trim();
      const contacto = document.getElementById("extContacto").value.trim();
      const percepcion = document.getElementById("extPercepcion").value;
      const comentarios = document.getElementById("extComentarios").value.trim();

      if (!grupo) {
        alert("Debe seleccionar el grupo de interés.");
        return;
      }

      const ratings = {};
      let answered = 0;
      for (const t of DATA.topics) {
        const checked = document.querySelector(`input[name="ext_${t.tema_id}"]:checked`);
        if (checked) {
          ratings[t.tema_id] = Number(checked.value);
          answered += 1;
        }
      }

      if (answered < DATA.topics.length) {
        const ok = confirm(`La respuesta tiene ${answered} de ${DATA.topics.length} ítems completados. ¿Desea guardar igualmente?`);
        if (!ok) return;
      }

      const row = {
        id: uuidv4(),
        ts: nowISO(),
        editionId: db.currentEditionId,
        grupo,
        sector,
        organizacion: org,
        contacto,
        percepcion,
        comentarios,
        ratings,
      };

      db.externalResponses.push(row);
      saveDB(db);

      form.reset();
      document.querySelectorAll('#extTopics input[type="radio"]').forEach((r) => (r.checked = false));
      updateExternalProgress();

      renderAll(db);
      alert("Respuesta externa guardada.");
      setActiveView("home");
    });
  }

  function hookInternalForm() {
    const form = document.getElementById("formInternal");
    const btnClear = document.getElementById("btnIntClear");

    btnClear.addEventListener("click", () => {
      form.reset();
      document.querySelectorAll("#tableInternal select").forEach((s) => (s.value = ""));
      updateInternalProgress();
    });

    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const db = ensureDB();

      const area = document.getElementById("intArea").value.trim();
      const rol = document.getElementById("intRol").value.trim();
      const comentarios = document.getElementById("intComentarios").value.trim();

      if (!area) {
        alert("Debe completar el área evaluadora.");
        return;
      }

      const table = {};
      const tbody = document.querySelector("#tableInternal tbody");
      let complete = 0;

      for (const t of DATA.topics) {
        const tr = tbody.querySelector(`tr[data-tid="${t.tema_id}"]`);
        const row = {};
        tr.querySelectorAll("select").forEach((sel) => {
          const key = sel.dataset.key;
          row[key] = sel.value === "" ? null : sel.value;
        });

        const any = Object.values(row).some((v) => v !== null && v !== "");
        if (any) {
          complete += 1;
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

      if (complete === 0) {
        alert("No se registraron puntajes. Complete al menos un tema.");
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

      form.reset();
      document.querySelectorAll("#tableInternal select").forEach((s) => (s.value = ""));
      updateInternalProgress();

      renderAll(db);
      alert("Evaluación interna guardada.");
      setActiveView("home");
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
      if (!sessionStorage.getItem("adminLogged")) {
        document.getElementById("adminLoginSection").style.display = "block";
        document.getElementById("adminContentSection").style.display = "none";
        document.getElementById("btnAdminLogout").style.display = "none";
      } else {
        document.getElementById("adminLoginSection").style.display = "none";
        document.getElementById("adminContentSection").style.display = "block";
        document.getElementById("btnAdminLogout").style.display = "block";
        loadEmailList();
      }
      modal.showModal();
    });

    document.getElementById("btnLogin").addEventListener("click", () => {
      const u = document.getElementById("adminUser").value;
      const p = document.getElementById("adminPass").value;
      if (u === "user" && p === "123") {
        sessionStorage.setItem("adminLogged", "true");
        document.getElementById("loginError").style.display = "none";
        document.getElementById("adminLoginSection").style.display = "none";
        document.getElementById("adminContentSection").style.display = "block";
        document.getElementById("btnAdminLogout").style.display = "block";
        document.getElementById("adminPass").value = "";
        loadEmailList();
      } else {
        document.getElementById("loginError").style.display = "block";
      }
    });

    document.getElementById("btnAdminLogout").addEventListener("click", () => {
      sessionStorage.removeItem("adminLogged");
      document.getElementById("adminLoginSection").style.display = "block";
      document.getElementById("adminContentSection").style.display = "none";
      document.getElementById("btnAdminLogout").style.display = "none";
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
      const body = encodeURIComponent(`Hola,\n\nTe invitamos a participar en el ejercicio de materialidad de Paracel.\n\nPor favor ingresa aquí:\n[Reemplazar con el enlace a la encuesta]\n\nSaludos cordiales,\nEquipo Paracel.`);
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
  // Inicialización
  // ---------------------------------------------------------------------------
  async function init() {
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
    buildInternalTable(document.querySelector("#tableInternal tbody"));
    updateInternalProgress();
    applyTopicSearch("topicSearchInt", "#tableInternal tbody", "tr", "td:first-child");

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
