/* =========================================================
   GLP · Panel de Reparación — lógica del dashboard
   Todas las rutas son relativas (./data/*.json) para que el
   proyecto funcione igual en local, GitHub Pages o cualquier
   hosting estático, sin depender de la computadora de origen.
   ========================================================= */

const DATA_PATH = "./data/";

const COLORS = {
  trace: "#2DD4BF",
  solder: "#FF8A3D",
  alert: "#FF5470",
  ink: "#E9EDF4",
  inkDim: "#8892A6",
  grid: "#232E42",
};

Chart.defaults.color = COLORS.inkDim;
Chart.defaults.font.family = "'IBM Plex Mono', monospace";
Chart.defaults.font.size = 11;

let state = {
  tendencia: [],
  resumenLineas: [],
  topDefectos: [],
  topLocalidades: [],
  distribucionRetrabajo: [],
  topRetrabajo: [],
  topTecnicos: [],
  lineaActual: "ALL",
};

let charts = {};

/* ---------- utilidades ---------- */
function fmtNum(n) {
  return new Intl.NumberFormat("es-MX").format(n);
}

async function fetchJSON(name) {
  const res = await fetch(DATA_PATH + name);
  if (!res.ok) throw new Error(`No se pudo cargar ${name} (${res.status})`);
  return res.json();
}

function fmtPeriodo(inicio, fin) {
  const opts = { year: "numeric", month: "short" };
  const i = new Date(inicio + "T00:00:00");
  const f = new Date(fin + "T00:00:00");
  const fmt = (d) => d.toLocaleDateString("es-MX", opts);
  return `${fmt(i)} — ${fmt(f)}`;
}

/* ---------- KPIs ---------- */
function renderKPIs(k) {
  document.getElementById("kpi-total").textContent = fmtNum(k.total_reparaciones);
  document.getElementById("kpi-tarjetas").textContent = fmtNum(k.total_tarjetas_unicas);
  document.getElementById("kpi-retrabajo").textContent = fmtNum(k.tarjetas_retrabajo);
  document.getElementById("kpi-retrabajo-note").textContent =
    `${k.pct_retrabajo}% de las tarjetas · reparadas más de una vez`;
  document.getElementById("kpi-promedio").textContent = k.promedio_reparaciones_por_tarjeta;
  document.getElementById("kpi-max").textContent = k.max_reparaciones_una_tarjeta;
  document.getElementById("periodo-label").textContent =
    `Periodo: ${fmtPeriodo(k.periodo_inicio, k.periodo_fin)}`;
}

/* ---------- Tendencia mensual ---------- */
function renderTendencia() {
  const ctx = document.getElementById("chart-tendencia");
  const linea = state.lineaActual;
  const labels = state.tendencia.map((r) => r.mes);
  const valores = state.tendencia.map((r) => (linea === "ALL" ? r.total : r[linea] || 0));

  if (charts.tendencia) charts.tendencia.destroy();
  charts.tendencia = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: linea === "ALL" ? "Todas las líneas" : `Línea ${linea}`,
          data: valores,
          borderColor: COLORS.trace,
          backgroundColor: "rgba(45,212,191,0.12)",
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: COLORS.solder,
          pointHoverRadius: 5,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: COLORS.grid } },
        y: { grid: { color: COLORS.grid }, beginAtZero: true },
      },
    },
  });
}

/* ---------- Resumen por línea ---------- */
function renderResumenLineas() {
  const cont = document.getElementById("resumen-lineas");
  cont.innerHTML = "";
  const max = Math.max(...state.resumenLineas.map((r) => r.reparaciones));
  state.resumenLineas.forEach((r) => {
    const row = document.createElement("div");
    row.className = "linea-row";
    row.innerHTML = `
      <span class="linea-row__tag">${r.linea}</span>
      <div class="linea-row__bar"><div class="linea-row__fill" data-width="${(r.reparaciones / max) * 100}"></div></div>
      <span class="linea-row__meta">${fmtNum(r.reparaciones)} rep · ${r.tecnicos} técnicos</span>
    `;
    cont.appendChild(row);
  });
  requestAnimationFrame(() => {
    document.querySelectorAll(".linea-row__fill").forEach((el) => {
      el.style.width = el.dataset.width + "%";
    });
  });
}

/* ---------- Barras horizontales genéricas ---------- */
function renderBarChart(canvasId, chartKey, items, labelKey, valueKey, color) {
  const ctx = document.getElementById(canvasId);
  if (charts[chartKey]) charts[chartKey].destroy();
  charts[chartKey] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: items.map((i) => i[labelKey]),
      datasets: [
        {
          data: items.map((i) => i[valueKey]),
          backgroundColor: color,
          borderRadius: 4,
          maxBarThickness: 18,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: COLORS.grid }, beginAtZero: true },
        y: { grid: { display: false } },
      },
    },
  });
}

/* ---------- Distribución de retrabajo (doughnut) ---------- */
function renderRetrabajoChart() {
  const ctx = document.getElementById("chart-retrabajo");
  const items = state.distribucionRetrabajo;
  const palette = [COLORS.trace, "#22b8a3", COLORS.solder, "#e07a35", COLORS.alert, "#c23b53", "#8a2f42"];
  if (charts.retrabajo) charts.retrabajo.destroy();
  charts.retrabajo = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: items.map((i) => i.categoria),
      datasets: [
        {
          data: items.map((i) => i.tarjetas),
          backgroundColor: palette,
          borderColor: COLORS.ink === "#0B0E14" ? "#0B0E14" : "#121826",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "right", labels: { boxWidth: 12, padding: 12 } },
      },
      cutout: "55%",
    },
  });
}

/* ---------- Tabla: top retrabajo ---------- */
function renderTablaRetrabajo() {
  const tbody = document.querySelector("#tabla-retrabajo tbody");
  tbody.innerHTML = "";
  state.topRetrabajo.forEach((r, idx) => {
    const tr = document.createElement("tr");
    const badgeClass = idx < 3 ? "rank-badge rank-badge--top" : "rank-badge";
    tr.innerHTML = `
      <td><span class="${badgeClass}">${idx + 1}</span></td>
      <td>${r.serial}</td>
      <td>${r.reparaciones}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ---------- Tabla: técnicos (ordenable + buscable) ---------- */
let tecnicosSort = { key: "total", dir: "desc" };

function renderTablaTecnicos() {
  const tbody = document.querySelector("#tabla-tecnicos tbody");
  const filtro = document.getElementById("buscador-tecnico").value.trim().toLowerCase();

  let rows = state.topTecnicos.filter((r) => r.tecnico.toLowerCase().includes(filtro));

  rows.sort((a, b) => {
    const { key, dir } = tecnicosSort;
    const va = a[key],
      vb = b[key];
    const cmp = typeof va === "string" ? va.localeCompare(vb) : va - vb;
    return dir === "asc" ? cmp : -cmp;
  });

  tbody.innerHTML = "";
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.tecnico}</td>
      <td>${fmtNum(r.T1)}</td>
      <td>${fmtNum(r.T2)}</td>
      <td>${fmtNum(r.T3)}</td>
      <td><strong>${fmtNum(r.total)}</strong></td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll("#tabla-tecnicos th").forEach((th) => {
    th.classList.remove("sorted-asc", "sorted-desc");
    if (th.dataset.key === tecnicosSort.key) {
      th.classList.add(tecnicosSort.dir === "asc" ? "sorted-asc" : "sorted-desc");
    }
  });
}

function setupTablaTecnicosEvents() {
  document.querySelectorAll("#tabla-tecnicos th").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (tecnicosSort.key === key) {
        tecnicosSort.dir = tecnicosSort.dir === "asc" ? "desc" : "asc";
      } else {
        tecnicosSort = { key, dir: key === "tecnico" ? "asc" : "desc" };
      }
      renderTablaTecnicos();
    });
  });
  document.getElementById("buscador-tecnico").addEventListener("input", renderTablaTecnicos);
}

/* ---------- Filtro de línea (DIP switches) ---------- */
function setupLineFilter() {
  const buttons = document.querySelectorAll("#line-filter .dip");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.setAttribute("aria-pressed", "false"));
      btn.setAttribute("aria-pressed", "true");
      state.lineaActual = btn.dataset.line;
      renderTendencia();
    });
  });
}

/* ---------- Carga inicial ---------- */
async function init() {
  try {
    const [kpis, tendencia, resumenLineas, topDefectos, topLocalidades, distRetrabajo, topRetrabajo, topTecnicos] =
      await Promise.all([
        fetchJSON("kpis.json"),
        fetchJSON("tendencia_mensual.json"),
        fetchJSON("resumen_lineas.json"),
        fetchJSON("top_defectos.json"),
        fetchJSON("top_localidades.json"),
        fetchJSON("distribucion_retrabajo.json"),
        fetchJSON("top_retrabajo.json"),
        fetchJSON("top_tecnicos.json"),
      ]);

    state.tendencia = tendencia;
    state.resumenLineas = resumenLineas;
    state.topDefectos = topDefectos;
    state.topLocalidades = topLocalidades;
    state.distribucionRetrabajo = distRetrabajo;
    state.topRetrabajo = topRetrabajo;
    state.topTecnicos = topTecnicos;

    renderKPIs(kpis);
    renderTendencia();
    renderResumenLineas();
    renderBarChart("chart-defectos", "defectos", topDefectos, "defecto", "total", COLORS.solder);
    renderBarChart("chart-localidades", "localidades", topLocalidades, "localidad", "total", COLORS.alert);
    renderRetrabajoChart();
    renderTablaRetrabajo();
    renderTablaTecnicos();

    setupLineFilter();
    setupTablaTecnicosEvents();
  } catch (err) {
    console.error(err);
    document.querySelector(".layout").insertAdjacentHTML(
      "afterbegin",
      `<div style="background:#3a1420;border:1px solid #FF5470;color:#ffd7de;padding:1rem;border-radius:8px;">
         No se pudieron cargar los datos del dashboard. Verifica que la carpeta <code>data/</code> esté junto a
         <code>index.html</code> y que estés sirviendo el sitio por HTTP (no abriendo el archivo directamente con
         <code>file://</code>). Detalle: ${err.message}
       </div>`
    );
  }
}

document.addEventListener("DOMContentLoaded", init);
