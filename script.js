/* =========================================================
   GLP · Panel de Reparación — lógica del dashboard
   Todas las rutas son relativas (./data/*.json) para que el
   proyecto funcione igual en local, GitHub Pages o cualquier
   hosting estático, sin depender de la computadora de origen.

   Los datos se cargan una sola vez desde data/detalle.json
   (un registro por reparación) y TODO lo demás — KPIs, tendencia,
   defectos, localidades, retrabajo, técnicos — se recalcula en
   el navegador cada vez que cambia el filtro de fecha o de línea.
   ========================================================= */

const DATA_PATH = "./data/";
const LINEAS = ["T1", "T2", "T3"];

const COLORS = {
  trace: "#2DD4BF",
  solder: "#FF8A3D",
  alert: "#FF5470",
  ink: "#E9EDF4",
  inkDim: "#8892A6",
  grid: "#232E42",
};

let CHART_OK = false;

/* Espera hasta ~3s a que Chart.js esté disponible (da tiempo al CDN
   de respaldo si el primero falla). */
function waitForChart(retries = 30, delayMs = 100) {
  return new Promise((resolve) => {
    (function poll(i) {
      if (typeof Chart !== "undefined") return resolve(true);
      if (i >= retries) return resolve(false);
      setTimeout(() => poll(i + 1), delayMs);
    })(0);
  });
}

/* ---------- estado global ---------- */
let ALL_ROWS = []; // [fecha, linea, tecnico, defecto, localidad, serial]
let DATA_MIN = null;
let DATA_MAX = null;

let filtro = {
  inicio: null, // "YYYY-MM-DD"
  fin: null,
  linea: "ALL",
};

let charts = {};
let tecnicosSort = { key: "total", dir: "desc" };

/* ---------- utilidades ---------- */
function fmtNum(n) {
  return new Intl.NumberFormat("es-MX").format(n);
}

async function fetchJSON(name) {
  const res = await fetch(DATA_PATH + name);
  if (!res.ok) throw new Error(`No se pudo cargar ${name} (${res.status})`);
  return res.json();
}

function fmtFechaCorta(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "2-digit" });
}

/* ---------- filtrar + agregar todo en un solo paso ---------- */
function filtrarYAgregar() {
  const { inicio, fin, linea } = filtro;
  const serialCounts = new Map();
  const porLinea = { T1: { rep: 0, serials: new Set(), tecnicos: new Set() },
                      T2: { rep: 0, serials: new Set(), tecnicos: new Set() },
                      T3: { rep: 0, serials: new Set(), tecnicos: new Set() } };
  const defectoCounts = new Map();
  const localidadCounts = new Map();
  const tecnicoCounts = new Map();
  const mensual = new Map(); // mes -> {total,T1,T2,T3}

  let total = 0;

  for (let i = 0; i < ALL_ROWS.length; i++) {
    const [fecha, ln, tecnico, defecto, localidad, serial] = ALL_ROWS[i];
    if (fecha < inicio || fecha > fin) continue;
    if (linea !== "ALL" && ln !== linea) continue;

    total++;
    serialCounts.set(serial, (serialCounts.get(serial) || 0) + 1);

    if (porLinea[ln]) {
      porLinea[ln].rep++;
      porLinea[ln].serials.add(serial);
      porLinea[ln].tecnicos.add(tecnico);
    }

    defectoCounts.set(defecto, (defectoCounts.get(defecto) || 0) + 1);
    localidadCounts.set(localidad, (localidadCounts.get(localidad) || 0) + 1);

    if (!tecnicoCounts.has(tecnico)) tecnicoCounts.set(tecnico, { tecnico, T1: 0, T2: 0, T3: 0, total: 0 });
    const t = tecnicoCounts.get(tecnico);
    t[ln] = (t[ln] || 0) + 1;
    t.total++;

    const mes = fecha.slice(0, 7);
    if (!mensual.has(mes)) mensual.set(mes, { mes, total: 0, T1: 0, T2: 0, T3: 0 });
    const m = mensual.get(mes);
    m.total++;
    m[ln] = (m[ln] || 0) + 1;
  }

  const tarjetasUnicas = serialCounts.size;
  let retrabajo = 0, maxRep = 0;
  serialCounts.forEach((v) => {
    if (v > 1) retrabajo++;
    if (v > maxRep) maxRep = v;
  });

  const kpis = {
    total_reparaciones: total,
    total_tarjetas_unicas: tarjetasUnicas,
    tarjetas_retrabajo: retrabajo,
    pct_retrabajo: tarjetasUnicas ? Math.round((retrabajo / tarjetasUnicas) * 1000) / 10 : 0,
    promedio_reparaciones_por_tarjeta: tarjetasUnicas ? Math.round((total / tarjetasUnicas) * 100) / 100 : 0,
    max_reparaciones_una_tarjeta: maxRep,
  };

  const resumenLineas = LINEAS.map((ln) => ({
    linea: ln,
    reparaciones: porLinea[ln].rep,
    tarjetas_unicas: porLinea[ln].serials.size,
    tecnicos: porLinea[ln].tecnicos.size,
  }));

  const topDefectos = [...defectoCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([defecto, total]) => ({ defecto, total }));

  const topLocalidades = [...localidadCounts.entries()]
    .filter(([k]) => k !== "Sin dato")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([localidad, total]) => ({ localidad, total }));

  const bins = [
    { label: "1 vez", test: (v) => v === 1 },
    { label: "2 veces", test: (v) => v === 2 },
    { label: "3 veces", test: (v) => v === 3 },
    { label: "4-5 veces", test: (v) => v >= 4 && v <= 5 },
    { label: "6-10 veces", test: (v) => v >= 6 && v <= 10 },
    { label: "11-20 veces", test: (v) => v >= 11 && v <= 20 },
    { label: "21+ veces", test: (v) => v >= 21 },
  ].map((b) => ({ categoria: b.label, tarjetas: 0, test: b.test }));
  serialCounts.forEach((v) => {
    const b = bins.find((b) => b.test(v));
    if (b) b.tarjetas++;
  });
  const distribucionRetrabajo = bins.map(({ categoria, tarjetas }) => ({ categoria, tarjetas }));

  const topRetrabajo = [...serialCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([serial, reparaciones]) => ({ serial, reparaciones }));

  const topTecnicos = [...tecnicoCounts.values()].sort((a, b) => b.total - a.total).slice(0, 25);

  const tendenciaMensual = [...mensual.values()].sort((a, b) => a.mes.localeCompare(b.mes));

  return { kpis, resumenLineas, topDefectos, topLocalidades, distribucionRetrabajo, topRetrabajo, topTecnicos, tendenciaMensual };
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
    `Periodo filtrado: ${fmtFechaCorta(filtro.inicio)} — ${fmtFechaCorta(filtro.fin)}`;
}

/* ---------- Tendencia mensual ---------- */
function renderTendencia(tendenciaMensual) {
  if (!CHART_OK) return;
  const ctx = document.getElementById("chart-tendencia");
  const labels = tendenciaMensual.map((r) => r.mes);
  const valores = tendenciaMensual.map((r) => r.total);

  if (charts.tendencia) charts.tendencia.destroy();
  charts.tendencia = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Reparaciones",
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
function renderResumenLineas(resumenLineas) {
  const cont = document.getElementById("resumen-lineas");
  cont.innerHTML = "";
  const max = Math.max(1, ...resumenLineas.map((r) => r.reparaciones));
  resumenLineas.forEach((r) => {
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
  if (!CHART_OK) return;
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
function renderRetrabajoChart(items) {
  if (!CHART_OK) return;
  const ctx = document.getElementById("chart-retrabajo");
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
          borderColor: "#121826",
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
function renderTablaRetrabajo(topRetrabajo) {
  const tbody = document.querySelector("#tabla-retrabajo tbody");
  tbody.innerHTML = "";
  if (topRetrabajo.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="color:var(--ink-dim);">Sin reparaciones en este periodo</td></tr>`;
    return;
  }
  topRetrabajo.forEach((r, idx) => {
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
let ultimoTopTecnicos = [];

function renderTablaTecnicos(topTecnicos) {
  if (topTecnicos) ultimoTopTecnicos = topTecnicos;
  const tbody = document.querySelector("#tabla-tecnicos tbody");
  const filtroTexto = document.getElementById("buscador-tecnico").value.trim().toLowerCase();

  let rows = ultimoTopTecnicos.filter((r) => r.tecnico.toLowerCase().includes(filtroTexto));

  rows.sort((a, b) => {
    const { key, dir } = tecnicosSort;
    const va = a[key], vb = b[key];
    const cmp = typeof va === "string" ? va.localeCompare(vb) : va - vb;
    return dir === "asc" ? cmp : -cmp;
  });

  tbody.innerHTML = "";
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--ink-dim);">Sin resultados</td></tr>`;
  }
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
  document.getElementById("buscador-tecnico").addEventListener("input", () => renderTablaTecnicos());
}

/* ---------- Repintar todo con el filtro actual ---------- */
function repintar() {
  const agregados = filtrarYAgregar();
  renderKPIs(agregados.kpis);
  renderResumenLineas(agregados.resumenLineas);
  renderTablaRetrabajo(agregados.topRetrabajo);
  renderTablaTecnicos(agregados.topTecnicos);
  if (CHART_OK) {
    renderTendencia(agregados.tendenciaMensual);
    renderBarChart("chart-defectos", "defectos", agregados.topDefectos, "defecto", "total", COLORS.solder);
    renderBarChart("chart-localidades", "localidades", agregados.topLocalidades, "localidad", "total", COLORS.alert);
    renderRetrabajoChart(agregados.distribucionRetrabajo);
  }
}

/* ---------- Filtro de línea (DIP switches) ---------- */
function setupLineFilter() {
  const buttons = document.querySelectorAll("#line-filter .dip");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.setAttribute("aria-pressed", "false"));
      btn.setAttribute("aria-pressed", "true");
      filtro.linea = btn.dataset.line;
      repintar();
    });
  });
}

/* ---------- Filtro de fecha ---------- */
function setupDateFilter() {
  const inputInicio = document.getElementById("fecha-inicio");
  const inputFin = document.getElementById("fecha-fin");
  const btnReset = document.getElementById("fecha-reset");

  inputInicio.min = DATA_MIN;
  inputInicio.max = DATA_MAX;
  inputFin.min = DATA_MIN;
  inputFin.max = DATA_MAX;
  inputInicio.value = DATA_MIN;
  inputFin.value = DATA_MAX;
  filtro.inicio = DATA_MIN;
  filtro.fin = DATA_MAX;

  function aplicar() {
    let inicio = inputInicio.value || DATA_MIN;
    let fin = inputFin.value || DATA_MAX;
    if (inicio > fin) [inicio, fin] = [fin, inicio]; // por si el usuario invierte las fechas
    inputInicio.value = inicio;
    inputFin.value = fin;
    filtro.inicio = inicio;
    filtro.fin = fin;
    repintar();
  }

  inputInicio.addEventListener("change", aplicar);
  inputFin.addEventListener("change", aplicar);
  btnReset.addEventListener("click", () => {
    inputInicio.value = DATA_MIN;
    inputFin.value = DATA_MAX;
    filtro.inicio = DATA_MIN;
    filtro.fin = DATA_MAX;
    repintar();
  });
}

/* ---------- Carga inicial ---------- */
async function init() {
  try {
    const chartReadyPromise = waitForChart();

    ALL_ROWS = await fetchJSON("detalle.json");
    if (!Array.isArray(ALL_ROWS) || ALL_ROWS.length === 0) {
      throw new Error("data/detalle.json está vacío o con formato inesperado");
    }

    let min = ALL_ROWS[0][0], max = ALL_ROWS[0][0];
    for (let i = 1; i < ALL_ROWS.length; i++) {
      const f = ALL_ROWS[i][0];
      if (f < min) min = f;
      if (f > max) max = f;
    }
    DATA_MIN = min;
    DATA_MAX = max;

    filtro.inicio = DATA_MIN;
    filtro.fin = DATA_MAX;

    setupLineFilter();
    setupDateFilter();
    setupTablaTecnicosEvents();
    repintar();

    CHART_OK = await chartReadyPromise;
    if (CHART_OK) {
      Chart.defaults.color = COLORS.inkDim;
      Chart.defaults.font.family = "'IBM Plex Mono', monospace";
      Chart.defaults.font.size = 11;
      repintar();
    } else {
      document.querySelector(".layout").insertAdjacentHTML(
        "afterbegin",
        `<div style="background:#3a1420;border:1px solid #FF5470;color:#ffd7de;padding:1rem;border-radius:8px;">
           Los KPIs y las tablas cargaron correctamente, pero <strong>Chart.js no se pudo cargar desde el CDN</strong>
           (por eso no ves los gráficos). Esto suele deberse a un firewall, antivirus o red corporativa que bloquea
           <code>cdn.jsdelivr.net</code> y <code>unpkg.com</code>. Prueba abrir el sitio desde otra red (datos móviles,
           otra WiFi) o pide a tu equipo de IT que permita esos dominios.
         </div>`
      );
    }
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
