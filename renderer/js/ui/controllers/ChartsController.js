import { formatMoney } from "../../core/utils/projectBilling.js";

const NS = "http://www.w3.org/2000/svg";
const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const DAYS_HE = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
// Categorical slots (validated for color-blind separation), assigned by the employer's place
// in the employer list so a color always follows the same employer. Past 8: one gray "other".
const SERIES_VARS = ["--chart-s1", "--chart-s2", "--chart-s3", "--chart-s4", "--chart-s5", "--chart-s6", "--chart-s7", "--chart-s8"];
const OTHER_VAR = "--chart-other";
const HEAT_VARS = ["--heat-0", "--heat-1", "--heat-2", "--heat-3", "--heat-4", "--heat-5"];

const roundMoney = (n) => `₪${Math.round(n).toLocaleString("he-IL")}`;
const monthLabel = (key) => MONTHS_HE[Number(key.slice(5)) - 1];

function hm(hours) {
  let h = Math.floor(hours);
  let m = Math.round((hours - h) * 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  return `${h}:${String(m).padStart(2, "0")}`;
}

function svgEl(tag, attrs, parent) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, value));
  parent?.appendChild(node);
  return node;
}

function svgText(parent, x, y, text, anchor = "middle", className = "") {
  const node = svgEl("text", { x, y, "text-anchor": anchor }, parent);
  if (className) {
    node.setAttribute("class", className);
  }
  node.textContent = text;
  return node;
}

/** Axis top that splits into 4 round steps (1 / 2 / 2.5 / 5 x 10^k). */
function niceMax(value) {
  const raw = Math.max(value, 1) / 4;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw);
  return step * 4;
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export class ChartsController {
  constructor({ logRepo, employerRepo, projectRepo, chartDataService }) {
    this.logRepo = logRepo;
    this.employerRepo = employerRepo;
    this.projectRepo = projectRepo;
    this.data = chartDataService;
    this.panel = document.querySelector('[data-panel="charts"]');
    this.monthSelect = document.getElementById("chartsProgressMonth");
    this.selectedMonth = null;
    this.dirty = true;
    this.visible = false;
  }

  init() {
    this.monthSelect?.addEventListener("change", () => {
      this.selectedMonth = this.monthSelect.value;
      this.renderProgress();
    });

    this.panel?.querySelectorAll("[data-chart-table]").forEach((button) => {
      button.addEventListener("click", () => {
        const table = document.getElementById(button.dataset.chartTable);
        table.hidden = !table.hidden;
        button.textContent = table.hidden ? "טבלה" : "הסתר טבלה";
      });
    });

    // Redraw only while the tab is visible; otherwise remember to redraw when it opens.
    const invalidate = () => {
      this.dirty = true;
      if (this.visible) {
        this.render();
      }
    };
    ["logs:changed", "settings:changed", "projects:changed"].forEach((name) =>
      window.addEventListener(name, invalidate)
    );
  }

  onTabChange(tabId) {
    this.visible = tabId === "charts";
    if (this.visible && this.dirty) {
      this.render();
    }
  }

  render() {
    if (!this.panel) {
      return;
    }
    this.dirty = false;
    this.renderIncome();
    this.fillMonthSelect();
    this.renderProgress();
    this.renderHeatmap();
  }

  /* ---------- shared bits ---------- */

  employerColors() {
    const colors = new Map();
    this.employerRepo.getAll().forEach((employer, index) => {
      colors.set(employer.id, index < SERIES_VARS.length ? `var(${SERIES_VARS[index]})` : `var(${OTHER_VAR})`);
    });
    return colors;
  }

  host(id) {
    const box = document.getElementById(id);
    box.querySelector("svg")?.remove();
    box.querySelector(".chart-empty")?.remove();
    return box;
  }

  showEmpty(box, text) {
    const note = document.createElement("p");
    note.className = "chart-empty";
    note.textContent = text;
    box.prepend(note);
  }

  showTip(box, html, x, y) {
    const tip = box.querySelector(".chart-tip");
    tip.innerHTML = html;
    tip.classList.add("visible");
    const width = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(x - width / 2, 0), box.clientWidth - width)}px`;
    tip.style.top = `${y - tip.offsetHeight - 12}px`;
  }

  hideTip(box) {
    box.querySelector(".chart-tip").classList.remove("visible");
  }

  pointer(box, event) {
    const rect = box.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  fillTable(id, head, rows) {
    const cells = (row, tag) => row.map((value) => `<${tag}>${escapeHtml(value)}</${tag}>`).join("");
    document.getElementById(id).innerHTML =
      `<table class="chart-table"><thead><tr>${cells(head, "th")}</tr></thead>` +
      `<tbody>${rows.map((row) => `<tr>${cells(row, "td")}</tr>`).join("")}</tbody></table>`;
  }

  /* ---------- 1. monthly income, stacked by employer ---------- */

  renderIncome() {
    const box = this.host("chartIncome");
    const legend = document.getElementById("chartIncomeLegend");
    const { months, employers } = this.data.monthlyIncome(
      this.logRepo.getAll(),
      this.employerRepo.getAll(),
      this.projectRepo?.getAll() || []
    );
    const colors = this.employerColors();
    const allEmployers = this.employerRepo.getAll();
    const indexOf = new Map(allEmployers.map((employer, i) => [employer.id, i]));
    const totals = months.map((row) => row.byEmployer.reduce((sum, entry) => sum + entry.pay, 0));

    if (!employers.length || totals.every((total) => total === 0)) {
      legend.innerHTML = "";
      this.showEmpty(box, "אין עדיין הכנסות להצגה. הגדר תעריף למעסיקים בהגדרות.");
      this.fillTable("chartIncomeTable", [], []);
      return;
    }

    legend.innerHTML = employers
      .map((employer) => `<span><i class="chart-swatch" style="background:${colors.get(employer.id)}"></i>${escapeHtml(employer.name)}</span>`)
      .join("");

    const W = 800, H = 300, m = { t: 26, r: 60, b: 30, l: 8 };
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "הכנסה חודשית לפי מעסיק" });
    box.prepend(svg);
    const max = niceMax(Math.max(...totals) * 1.08);
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const band = iw / months.length, barW = Math.min(56, band * 0.55);
    const y = (v) => m.t + ih - (v / max) * ih;

    for (let i = 0; i <= 4; i += 1) {
      const v = (max / 4) * i;
      svgEl("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: i ? "chart-grid" : "chart-axis" }, svg);
      svgText(svg, W - m.r + 8, y(v) + 4, roundMoney(v), "start");
    }

    // RTL: the newest month is on the left, like reading order in the rest of the app.
    months.forEach((row, i) => {
      const cx = W - m.r - band * i - band / 2;
      const x = cx - barW / 2;
      const segments = row.byEmployer.filter((entry) => entry.pay > 0);
      let acc = 0;
      segments.forEach((entry, j) => {
        const y0 = y(acc);
        const y1 = y(acc + entry.pay);
        acc += entry.pay;
        const gap = j ? 2 : 0;
        const h = Math.max(0.5, y0 - gap - y1);
        const isTop = j === segments.length - 1;
        const r = isTop ? Math.min(4, h) : 0;
        const d = isTop
          ? `M${x},${y0 - gap} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barW - r} Q${x + barW},${y1} ${x + barW},${y1 + r} V${y0 - gap} Z`
          : `M${x},${y0 - gap} V${y1} H${x + barW} V${y0 - gap} Z`;
        const path = svgEl("path", { d, fill: colors.get(entry.employerId) }, svg);
        const hit = svgEl("rect", { x: x - 8, y: y1 - 2, width: barW + 16, height: Math.max(h + 4, 8), fill: "transparent" }, svg);
        const name = allEmployers[indexOf.get(entry.employerId)]?.name || "";
        hit.addEventListener("mousemove", (event) => {
          const [px, py] = this.pointer(box, event);
          this.showTip(box, `<b>${escapeHtml(name)}</b> · ${monthLabel(row.month)}<br>${formatMoney(entry.pay)} · ${hm(entry.hours)} שעות`, px, py);
          path.style.opacity = 0.8;
        });
        hit.addEventListener("mouseleave", () => {
          this.hideTip(box);
          path.style.opacity = 1;
        });
      });
      if (totals[i] > 0) {
        svgText(svg, cx, y(totals[i]) - 8, roundMoney(totals[i]), "middle", "chart-value");
      }
      svgText(svg, cx, H - 8, monthLabel(row.month));
    });

    const columns = employers.map((employer) => ({ employer, index: indexOf.get(employer.id) }));
    this.fillTable(
      "chartIncomeTable",
      ["חודש", ...employers.map((employer) => employer.name), "סה״כ"],
      months.map((row, i) => [
        `${monthLabel(row.month)} ${row.month.slice(0, 4)}`,
        ...columns.map(({ index }) => (row.byEmployer[index].pay ? formatMoney(row.byEmployer[index].pay) : "—")),
        formatMoney(totals[i])
      ])
    );
  }

  /* ---------- 2. cumulative hours vs target pace ---------- */

  fillMonthSelect() {
    if (!this.monthSelect) {
      return;
    }
    const now = new Date();
    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const keys = this.data.monthsWithLogs(this.logRepo.getAll());
    if (!keys.includes(current)) {
      keys.unshift(current);
    }
    if (!keys.includes(this.selectedMonth)) {
      this.selectedMonth = current;
    }
    this.monthSelect.innerHTML = keys
      .map((key) => `<option value="${key}">${monthLabel(key)} ${key.slice(0, 4)}${key === current ? " (החודש)" : ""}</option>`)
      .join("");
    this.monthSelect.value = this.selectedMonth;
  }

  renderProgress() {
    const box = this.host("chartProgress");
    const kpis = document.getElementById("chartProgressKpis");
    const hoursPerDay = this.employerRepo.settingsRepository.getSettings().monthlyTargetHoursPerDay ?? null;
    if (!hoursPerDay || hoursPerDay <= 0) {
      kpis.innerHTML = "";
      this.showEmpty(box, "כדי לראות התקדמות ליעד, הגדר יעד שעות יומי בהגדרות.");
      this.fillTable("chartProgressTable", [], []);
      return;
    }

    const p = this.data.monthProgress(this.logRepo.getAll(), this.selectedMonth, hoursPerDay);
    const shown = p.days.filter((day) => day.actual !== null);
    const last = shown[shown.length - 1];
    const diff = last.actual - last.target;
    const workDays = p.monthTarget / hoursPerDay;

    kpis.innerHTML = `
      <div class="chart-kpi"><div class="chart-kpi-value">${hm(last.actual)}</div><div class="chart-kpi-label">שעות ${p.isCurrent ? "עד היום" : "בחודש"}</div></div>
      <div class="chart-kpi"><div class="chart-kpi-value">${hm(last.target)}</div><div class="chart-kpi-label">יעד ${p.isCurrent ? "עד היום" : "החודש"}</div></div>
      <div class="chart-kpi"><div class="chart-kpi-value">${hm(Math.abs(diff))}</div><div class="chart-kpi-label">${diff >= 0 ? "מעל" : "מתחת"} לקצב</div></div>
      <div class="chart-kpi"><div class="chart-kpi-value">${hm(p.monthTarget)}</div><div class="chart-kpi-label">יעד החודש כולו (${workDays} ימי א׳–ה׳)</div></div>`;

    const W = 800, H = 280, m = { t: 20, r: 44, b: 30, l: 8 };
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "שעות מצטברות מול הקצב ליעד" });
    box.prepend(svg);
    const max = niceMax(Math.max(p.monthTarget, last.actual) * 1.05);
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const x = (day) => W - m.r - ((day - 1) / (p.daysInMonth - 1)) * iw;
    const y = (v) => m.t + ih - (v / max) * ih;

    for (let i = 0; i <= 4; i += 1) {
      const v = (max / 4) * i;
      svgEl("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: i ? "chart-grid" : "chart-axis" }, svg);
      svgText(svg, W - m.r + 8, y(v) + 4, Math.round(v), "start");
    }
    [1, 5, 10, 15, 20, 25, p.daysInMonth].forEach((day) => svgText(svg, x(day), H - 8, day));

    svgEl("polyline", { points: p.days.map((d) => `${x(d.day)},${y(d.target)}`).join(" "), class: "chart-target-line" }, svg);
    svgEl("polyline", { points: shown.map((d) => `${x(d.day)},${y(d.actual)}`).join(" "), class: "chart-actual-line" }, svg);
    svgEl("circle", { cx: x(last.day), cy: y(last.actual), r: 4.5, class: "chart-actual-dot" }, svg);
    svgText(svg, x(last.day) - 8, y(last.actual) - 8, hm(last.actual), last.day > p.daysInMonth - 4 ? "start" : "end", "chart-value");
    const end = p.days[p.days.length - 1];
    svgText(svg, x(end.day), y(end.target) - 8, `יעד ${hm(end.target)}`, "start");

    const cross = svgEl("line", { y1: m.t, y2: m.t + ih, class: "chart-axis", opacity: 0 }, svg);
    const dot = svgEl("circle", { r: 4, class: "chart-actual-dot", opacity: 0 }, svg);
    const hit = svgEl("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" }, svg);
    hit.addEventListener("mousemove", (event) => {
      const rect = svg.getBoundingClientRect();
      const sx = ((event.clientX - rect.left) / rect.width) * W;
      const day = Math.max(1, Math.min(p.lastDay, Math.round(((W - m.r - sx) / iw) * (p.daysInMonth - 1) + 1)));
      const d = p.days[day - 1];
      const dayDiff = d.actual - d.target;
      cross.setAttribute("x1", x(day));
      cross.setAttribute("x2", x(day));
      cross.setAttribute("opacity", 1);
      dot.setAttribute("cx", x(day));
      dot.setAttribute("cy", y(d.actual));
      dot.setAttribute("opacity", 1);
      this.showTip(
        box,
        `<b>${day}.${p.month}</b> · באותו יום: ${hm(d.hours)}<br>מצטבר ${hm(d.actual)} · יעד עד אז ${hm(d.target)}<br>${dayDiff >= 0 ? "מעל" : "מתחת"} לקצב ב-${hm(Math.abs(dayDiff))}`,
        (x(day) / W) * rect.width,
        (y(d.actual) / H) * rect.height
      );
    });
    hit.addEventListener("mouseleave", () => {
      this.hideTip(box);
      cross.setAttribute("opacity", 0);
      dot.setAttribute("opacity", 0);
    });

    this.fillTable(
      "chartProgressTable",
      ["יום", "שעות ביום", "מצטבר", "יעד מצטבר"],
      shown.map((d) => [`${d.day}.${p.month}`, d.hours ? hm(d.hours) : "—", hm(d.actual), hm(d.target)])
    );
  }

  /* ---------- 3. heatmap: weekday x hour ---------- */

  renderHeatmap() {
    const box = this.host("chartHeatmap");
    const legend = document.getElementById("chartHeatmapLegend");
    const grid = this.data.weeklyHeatmap(this.logRepo.getAll());
    const max = Math.max(...grid.flat());
    if (max <= 0) {
      legend.innerHTML = "";
      this.showEmpty(box, "אין עדיין דוחות להצגה.");
      this.fillTable("chartHeatmapTable", [], []);
      return;
    }

    let firstHour = 23;
    let lastHour = 0;
    grid.forEach((row) =>
      row.forEach((v, hour) => {
        if (v > 0.25) {
          firstHour = Math.min(firstHour, hour);
          lastHour = Math.max(lastHour, hour);
        }
      })
    );
    if (firstHour > lastHour) {
      firstHour = 8;
      lastHour = 18;
    }
    const hours = [];
    for (let h = firstHour; h <= lastHour; h += 1) {
      hours.push(h);
    }
    const bucket = (v) => (v <= 0 ? 0 : Math.min(5, 1 + Math.floor((v / max) * 5 * 0.999)));

    legend.innerHTML =
      "<span>פחות</span>" +
      HEAT_VARS.map((name) => `<i class="chart-swatch" style="background:var(${name})"></i>`).join("") +
      `<span>יותר (עד ${hm(max)} שעות במשבצת)</span>`;

    const W = 800, labelW = 30, cellH = 30;
    const cellW = (W - labelW) / hours.length;
    const H = 7 * cellH + 24;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "שעות עבודה לפי יום ושעה" });
    box.prepend(svg);
    const xOf = (i) => W - labelW - (i + 1) * cellW;

    grid.forEach((row, day) => {
      svgText(svg, W - 4, day * cellH + cellH / 2 + 4, DAYS_HE[day], "end");
      hours.forEach((hour, i) => {
        const v = row[hour];
        const rect = svgEl("rect", {
          x: xOf(i) + 1,
          y: day * cellH + 1,
          width: cellW - 2,
          height: cellH - 2,
          rx: 4,
          fill: `var(${HEAT_VARS[bucket(v)]})`
        }, svg);
        rect.addEventListener("mousemove", (event) => {
          const [px, py] = this.pointer(box, event);
          this.showTip(box, `<b>יום ${DAYS_HE[day]} · ${hour}:00–${hour + 1}:00</b><br>${hm(v)} שעות בסך הכול`, px, py);
          rect.classList.add("chart-cell-hover");
        });
        rect.addEventListener("mouseleave", () => {
          this.hideTip(box);
          rect.classList.remove("chart-cell-hover");
        });
      });
    });
    hours.forEach((hour, i) => {
      if (hour % 2 === 0) {
        svgText(svg, xOf(i) + cellW / 2, H - 6, hour);
      }
    });

    this.fillTable(
      "chartHeatmapTable",
      ["שעה", ...DAYS_HE],
      hours.map((hour) => [`${hour}:00`, ...grid.map((row) => (row[hour] ? hm(row[hour]) : "—"))])
    );
  }
}
