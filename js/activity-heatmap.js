(() => {
  /* ============================================================
     Contribution Skyline — vanilla JS
     Mapa de calor 2D ↔ skyline isométrico 3D con morfismo.
     Datos: RPC actividad_por_dia de Supabase.
     ============================================================ */

  const OWNER_EMAIL = "comunicaciones@nazarenocali.org";
  const DAY_MS = 86400000;

  // ---------- Helpers matemáticos ----------
  const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutCubic = (x) => 1 - Math.pow(1 - clamp01(x), 3);
  const easeInOutCubic = (x) => {
    const t = clamp01(x);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
  const smoothstep = (a, b, x) => {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const toKey = (ms) => new Date(ms).toISOString().slice(0, 10);
  const dayMs = (v) => {
    if (typeof v === "number") return Math.floor(v / DAY_MS) * DAY_MS;
    if (typeof v === "string") {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
      if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
      v = new Date(v);
    }
    return Date.UTC(v.getFullYear(), v.getMonth(), v.getDate());
  };
  const pad = (n) => String(n).padStart(2, "0");
  const toIsoDay = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

  const levelOf = (count, busy) =>
    count <= 0 ? 0 : busy <= 0 ? 4 : 1 + Math.min(3, Math.floor((count / busy) * 4));

  const barHeight = (count, max, scale = 1) =>
    count > 0 && max > 0 ? 0.4 + Math.pow(count / max, 0.85) * 7.2 * scale : 0.2;

  const WAVE = 0.42;
  const riseAt = (t, week, weeks, day) => {
    const d = (weeks > 1 ? week / (weeks - 1) : 0) * 0.36 + (day / 6) * 0.06;
    return easeOutCubic((t - d) / (1 - WAVE));
  };

  const YAW_3D = Math.PI / 4;
  const ELEV_3D = (34 * Math.PI) / 180;
  const YAW_RANGE = [(8 * Math.PI) / 180, (82 * Math.PI) / 180];
  const ELEV_RANGE = [(18 * Math.PI) / 180, (62 * Math.PI) / 180];

  const camera = (e, dYaw = 0, dElev = 0) => {
    const yaw = Math.min(YAW_RANGE[1], Math.max(0, lerp(0, YAW_3D + dYaw, e)));
    const elev = lerp(Math.PI / 2, Math.min(ELEV_RANGE[1], Math.max(ELEV_RANGE[0], ELEV_3D + dElev)), e);
    return { cs: Math.cos(yaw), sn: Math.sin(yaw), se: Math.sin(elev), ce: Math.cos(elev) };
  };

  const project = (c, x, y, z) => [
    x * c.cs - y * c.sn,
    (x * c.sn + y * c.cs) * c.se - z * c.ce,
  ];

  const mixRGB = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  const luminance = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  const rgbString = (r, g, b) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;

  // Paleta de marca: más claro = menos actividad, más oscuro = más calor.
  const BRAND = [82, 48, 218]; // #5230da
  const PALETTE_LIGHT = ["#c9b8f6", "#8a6ee6", "#5230da", "#34199a"];
  const PALETTE_DARK = ["#3d2a7a", "#5c3ec4", "#8a6ee6", "#c9b8f6"];

  // ---------- Construcción de datos ----------
  const buildGrid = (data, endMs, weekStart = 1) => {
    const counts = new Map();
    for (const d of data) {
      if (!d || typeof d.date !== "string") continue;
      const ms = dayMs(d.date);
      const c = Number(d.count);
      if (!Number.isFinite(ms) || !(c > 0) || !Number.isFinite(c)) continue;
      const k = toKey(ms);
      counts.set(k, (counts.get(k) ?? 0) + c);
    }
    let start = endMs - 364 * DAY_MS;
    start -= ((new Date(start).getUTCDay() - weekStart + 7) % 7) * DAY_MS;
    const cells = [];
    for (let ms = start, i = 0; ms <= endMs; ms += DAY_MS, i++) {
      const date = toKey(ms);
      cells.push({
        date,
        count: counts.get(date) ?? 0,
        level: 0,
        week: Math.floor(i / 7),
        day: i % 7,
      });
    }
    const nz = cells.map((c) => c.count).filter((c) => c > 0).sort((a, b) => a - b);
    const busy = nz.length ? nz[Math.floor(0.95 * (nz.length - 1))] : 0;
    for (const c of cells) c.level = levelOf(c.count, busy);
    return {
      cells,
      weeks: cells.length ? cells[cells.length - 1].week + 1 : 0,
      max: nz.length ? nz[nz.length - 1] : 0,
    };
  };

  const computeStats = (cells) => {
    let total = 0;
    let best = 0;
    let bestDate = null;
    let run = 0;
    let runStart = null;
    let longest = { days: 0, start: null, end: null };
    for (const c of cells) {
      total += c.count;
      if (c.count > best) {
        best = c.count;
        bestDate = c.date;
      }
      if (c.count > 0) {
        if (run === 0) runStart = c.date;
        run++;
        if (run > longest.days) longest = { days: run, start: runStart, end: c.date };
      } else run = 0;
    }
    let j = cells.length - 1;
    if (j >= 0 && cells[j].count === 0) j--;
    const endAt = j;
    while (j >= 0 && cells[j].count > 0) j--;
    const days = endAt - j;
    const current =
      days > 0
        ? { days, start: cells[j + 1].date, end: cells[endAt].date }
        : { days: 0, start: null, end: null };
    return {
      total,
      first: cells.length ? cells[0].date : null,
      last: cells.length ? cells[cells.length - 1].date : null,
      busiest: { count: best, date: bestDate },
      longest,
      current,
    };
  };

  const monthLabels = (cells, weeks, locale = "es-CO") => {
    const fmt = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
    const out = [];
    let prev = -1;
    for (let w = 0; w < weeks; w++) {
      const c = cells[w * 7];
      if (!c) break;
      const m = +c.date.slice(5, 7);
      if (m !== prev) {
        let label = fmt.format(dayMs(c.date)).replace(".", "");
        label = label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
        out.push({ week: w, label });
      }
      prev = m;
    }
    if (out.length > 1 && out[1].week - out[0].week < 3) out.shift();
    return out;
  };

  // ---------- Utilidades de color ----------
  let probe = null;
  const toRGB = (color, fallback) => {
    if (!probe) {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      probe = c.getContext("2d", { willReadFrequently: true });
    }
    if (!probe) return fallback;
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = "rgba(0,0,0,0)";
    probe.fillStyle = color;
    probe.fillRect(0, 0, 1, 1);
    const d = probe.getImageData(0, 0, 1, 1).data;
    if (d[3] < 8) return fallback;
    return [d[0], d[1], d[2]];
  };

  const pointInQuad = (p, o, x, y) => {
    let sign = 0;
    for (let k = 0; k < 4; k++) {
      const ax = p[o + k * 2];
      const ay = p[o + k * 2 + 1];
      const bx = p[o + ((k + 1) % 4) * 2];
      const by = p[o + ((k + 1) % 4) * 2 + 1];
      const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      if (Math.abs(cross) < 1e-9) continue;
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
    return sign !== 0;
  };

  const quadPath = (ctx, p, o, r) => {
    if (r < 0.3) {
      ctx.moveTo(p[o], p[o + 1]);
      ctx.lineTo(p[o + 2], p[o + 3]);
      ctx.lineTo(p[o + 4], p[o + 5]);
      ctx.lineTo(p[o + 6], p[o + 7]);
      ctx.closePath();
      return;
    }
    ctx.moveTo((p[o + 6] + p[o]) / 2, (p[o + 7] + p[o + 1]) / 2);
    for (let k = 0; k < 4; k++) {
      const b = (k + 1) % 4;
      ctx.arcTo(p[o + k * 2], p[o + k * 2 + 1], p[o + b * 2], p[o + b * 2 + 1], r);
    }
    ctx.closePath();
  };

  // ---------- Clase principal ----------
  class ContributionSkyline {
    constructor(options) {
      this.container = options.container;
      this.data = options.data || [];
      this.endDate = options.endDate || null;
      this.unit = options.unit || "acción";
      this.unitPlural = options.unitPlural || "acciones";
      this.defaultView = options.defaultView || "2d";
      this.duration = options.duration || 1300;
      this.heightScale = options.heightScale || 1;
      this.orbit = options.orbit !== false;
      this.weekStart = options.weekStart ?? 1; // lunes
      this.locale = options.locale || "es-CO";
      this.onCellClick = options.onCellClick || null;

      this.view = this.defaultView;
      this.active = -1;
      this.legendLevel = -1;
      this.width = 0;

      this._buildModel();
      this._buildDOM();
      this._bindEngine();
    }

    _buildModel() {
      const dates = this.data.map((d) => dayMs(d.date)).filter(Number.isFinite);
      const end =
        this.endDate != null
          ? dayMs(this.endDate)
          : dates.length
            ? Math.max(...dates)
            : dayMs(new Date());
      const grid = buildGrid(this.data, end, this.weekStart);
      this.model = {
        ...grid,
        stats: computeStats(grid.cells),
        months: monthLabels(grid.cells, grid.weeks, this.locale),
      };
    }

    _buildDOM() {
      const { stats } = this.model;
      const nf = new Intl.NumberFormat(this.locale);
      const totalText = `${nf.format(stats.total)} ${stats.total === 1 ? this.unit : this.unitPlural} en el último año`;

      this.container.innerHTML = `
        <header class="skyline-heading">
          <div>
            <p class="admin-eyebrow">Movimiento del panel</p>
            <h2 class="skyline-title">${totalText}</h2>
          </div>
          <div class="skyline-controls">
            <span class="heatmap-period">Últimos 12 meses</span>
            <div class="skyline-toggle" role="group" aria-label="Vista del gráfico">
              <button type="button" class="skyline-toggle-btn is-active" data-view="2d" aria-pressed="true" title="Mapa plano">
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" fill="currentColor"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1" fill="currentColor"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1" fill="currentColor"/><rect x="9" y="9" width="5.5" height="5.5" rx="1" fill="currentColor"/></svg>
              </button>
              <button type="button" class="skyline-toggle-btn" data-view="3d" aria-pressed="false" title="Skyline 3D">
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 1.2 14.2 4.6v6.8L8 14.8 1.8 11.4V4.6Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M1.8 4.6 8 8l6.2-3.4M8 8v6.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
              </button>
            </div>
          </div>
        </header>

        <div class="skyline-stage-wrap">
          <div class="skyline-stage" data-skyline-stage>
            <canvas data-skyline-canvas tabindex="0" role="img" aria-label="${totalText}"></canvas>
            <div class="skyline-tooltip" data-skyline-tip role="tooltip" aria-hidden="true"></div>
          </div>
        </div>

        <div class="skyline-stats" data-skyline-stats>
          <div class="skyline-stat">
            <span class="skyline-stat-label">Total del año</span>
            <strong class="skyline-stat-value" data-stat-total>${nf.format(stats.total)}</strong>
            <span class="skyline-stat-unit">${stats.total === 1 ? this.unit : this.unitPlural}</span>
          </div>
          <div class="skyline-stat">
            <span class="skyline-stat-label">Día más activo</span>
            <strong class="skyline-stat-value" data-stat-busiest>${nf.format(stats.busiest.count)}</strong>
            <span class="skyline-stat-unit">${stats.busiest.count === 1 ? this.unit : this.unitPlural}</span>
          </div>
          <div class="skyline-stat">
            <span class="skyline-stat-label">Racha más larga</span>
            <strong class="skyline-stat-value" data-stat-longest>${nf.format(stats.longest.days)}</strong>
            <span class="skyline-stat-unit">${stats.longest.days === 1 ? "día" : "días"}</span>
          </div>
          <div class="skyline-stat">
            <span class="skyline-stat-label">Racha actual</span>
            <strong class="skyline-stat-value" data-stat-current>${nf.format(stats.current.days)}</strong>
            <span class="skyline-stat-unit">${stats.current.days === 1 ? "día" : "días"}</span>
          </div>
        </div>

        <footer class="skyline-footer">
          <p class="skyline-hint" data-skyline-hint>Pasa el cursor por un día · flechas para explorar</p>
          <div class="skyline-legend" data-skyline-legend aria-label="Menos actividad a más actividad">
            <span>Menos</span>
            <button type="button" data-level="0" aria-label="Sin actividad"></button>
            <button type="button" data-level="1" aria-label="Actividad ligera"></button>
            <button type="button" data-level="2" aria-label="Actividad moderada"></button>
            <button type="button" data-level="3" aria-label="Actividad alta"></button>
            <button type="button" data-level="4" aria-label="Actividad máxima"></button>
            <span>Más</span>
          </div>
        </footer>
        <p class="sr-only" data-skyline-announce aria-live="polite"></p>
      `;

      this.stage = this.container.querySelector("[data-skyline-stage]");
      this.canvas = this.container.querySelector("[data-skyline-canvas]");
      this.tip = this.container.querySelector("[data-skyline-tip]");
      this.hint = this.container.querySelector("[data-skyline-hint]");
      this.announceEl = this.container.querySelector("[data-skyline-announce]");

      // Toggle
      this.container.querySelectorAll("[data-view]").forEach((btn) => {
        btn.addEventListener("click", () => this.setView(btn.dataset.view));
      });

      // Legend
      this.container.querySelectorAll("[data-skyline-legend] button").forEach((btn) => {
        const lvl = +btn.dataset.level;
        btn.addEventListener("mouseenter", () => {
          this.legendLevel = lvl;
          this.engine?.kick();
        });
        btn.addEventListener("mouseleave", () => {
          this.legendLevel = -1;
          this.engine?.kick();
        });
        btn.addEventListener("click", () => {
          this.legendLevel = this.legendLevel === lvl ? -1 : lvl;
          this.engine?.kick();
        });
      });
    }

    setView(v) {
      if (v !== "2d" && v !== "3d") return;
      this.view = v;
      this.container.querySelectorAll("[data-view]").forEach((btn) => {
        const active = btn.dataset.view === v;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
      this.hint.textContent =
        v === "3d" && this.orbit
          ? "Arrastra para orbitar · doble clic para resetear"
          : "Pasa el cursor por un día · flechas para explorar";
      this.engine?.kick();
    }

    _bindEngine() {
      const root = this.container;
      const stage = this.stage;
      const canvas = this.canvas;
      const tip = this.tip;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const self = this;
      const reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
      let reduced = reduceMq.matches;

      let t = 0;
      let target = this.view === "3d" ? 1 : 0;
      let entered = false;
      let yaw = 0;
      let elev = 0;
      let yawGoal = 0;
      let elevGoal = 0;
      let W = 0;
      let Hmax = 0;
      let dpr = 1;
      let gutter = 28;
      let labelW = 28;
      let font = "10px Sora, sans-serif";

      const col = new Float32Array(15);
      const colGoal = new Float32Array(15);
      let colReady = false;
      let fg = [20, 20, 20];
      let bg = [255, 255, 255];
      let isDark = false;

      let n = 0;
      let weeks = 0;
      let wk = new Float32Array(0);
      let dy = new Float32Array(0);
      let lv = new Uint8Array(0);
      let hgt = new Float32Array(0);
      let zs = new Float32Array(0);
      let hover = new Float32Array(0);
      let dim = new Float32Array(0);
      let polys = new Float32Array(0);
      let faces = new Uint8Array(0);
      let order = [];
      let months = [];
      let weekdayRows = [];

      let hovered = -1;
      let pinned = -1;
      let activeIdx = -1;
      let tipW = 0;
      let raf = 0;
      let last = 0;

      const load = () => {
        const m = self.model;
        n = m.cells.length;
        weeks = m.weeks;
        if (wk.length !== n) {
          wk = new Float32Array(n);
          dy = new Float32Array(n);
          lv = new Uint8Array(n);
          hgt = new Float32Array(n);
          zs = new Float32Array(n);
          hover = new Float32Array(n);
          dim = new Float32Array(n);
          polys = new Float32Array(n * 24);
          faces = new Uint8Array(n);
          order = Array.from({ length: n }, (_, i) => i);
        }
        for (let i = 0; i < n; i++) {
          const c = m.cells[i];
          wk[i] = c.week;
          dy[i] = c.day;
          lv[i] = c.level;
          hgt[i] = barHeight(c.count, m.max, self.heightScale);
        }
        months = m.months;
        const wf = new Intl.DateTimeFormat(self.locale, { weekday: "short", timeZone: "UTC" });
        weekdayRows = [];
        for (let d = 0; d < 7 && d < n; d++) {
          const dow = new Date(dayMs(m.cells[d].date)).getUTCDay();
          if (dow === 1 || dow === 3 || dow === 5) {
            weekdayRows.push({ day: d, label: wf.format(dayMs(m.cells[d].date)).replace(".", "") });
          }
        }
        if (hovered >= n) hovered = -1;
        if (pinned >= n) pinned = -1;
      };

      const retheme = () => {
        const cs = getComputedStyle(root);
        fg = toRGB(cs.color || "#141414", [20, 20, 20]) || [20, 20, 20];
        const b = toRGB(cs.backgroundColor, null);
        bg = b || (luminance(fg) > 0.5 ? [10, 10, 10] : [255, 255, 255]);
        isDark = luminance(bg) < 0.45;
        font = `400 10px ${cs.fontFamily || "Sora, sans-serif"}`;
        const pal = isDark ? PALETTE_DARK : PALETTE_LIGHT;
        const empty = mixRGB(bg, BRAND, isDark ? 0.22 : 0.08);
        const all = [empty, ...pal.map((c) => toRGB(c, BRAND) || BRAND)];
        for (let k = 0; k < 5; k++) for (let ch = 0; ch < 3; ch++) colGoal[k * 3 + ch] = all[k][ch];
        if (!colReady || reduced) {
          col.set(colGoal);
          colReady = true;
        }
        ctx.font = font;
        labelW = Math.ceil(Math.max(20, ...weekdayRows.map((r) => ctx.measureText(r.label).width))) + 8;

        // Actualizar colores de la leyenda
        root.querySelectorAll("[data-skyline-legend] button").forEach((btn, i) => {
          btn.style.background = rgbString(all[i][0], all[i][1], all[i][2]);
        });
        kick();
      };

      const extent = (cam, e, full) => {
        const w = lerp(0.78, 0.9, e);
        const off = (1 - w) / 2;
        let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
        const add = (x, y, z) => {
          const p = project(cam, x, y, z);
          if (p[0] < minx) minx = p[0];
          if (p[0] > maxx) maxx = p[0];
          if (p[1] < miny) miny = p[1];
          if (p[1] > maxy) maxy = p[1];
        };
        for (let i = 0; i < n; i++) {
          const x0 = wk[i] + off;
          const y0 = dy[i] + off;
          const z = full ? hgt[i] * e : zs[i];
          add(x0, y0, z);
          add(x0 + w, y0, z);
          add(x0, y0 + w, z);
          add(x0 + w, y0 + w, 0);
          add(x0, y0 + w, 0);
          add(x0 + w, y0, 0);
        }
        add(0, 7 + 1.5 * e, 0);
        add(weeks, 7 + 1.5 * e, 0);
        return { minx, maxx, miny, maxy };
      };

      const relayout = () => {
        const w = Math.round(stage.clientWidth);
        if (!w || !n) return;
        W = w;
        gutter = W < 480 ? 0 : labelW;
        dpr = Math.min(2, window.devicePixelRatio || 1);
        const b2 = extent(camera(0), 0, true);
        const H2 = 20 + 4 + ((b2.maxy - b2.miny) / (b2.maxx - b2.minx)) * (W - gutter - 4);
        const b3 = extent(camera(1), 1, true);
        const natural = ((b3.maxy - b3.miny) / (b3.maxx - b3.minx)) * (W - 40) + 40;
        const H3 = Math.max(Math.min(natural, W * 0.72, 520), Math.min(natural, 220));
        Hmax = Math.ceil(Math.max(H2, H3));
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(Hmax * dpr);
        canvas.style.width = W + "px";
        canvas.style.height = Hmax + "px";
        stage.style.height = Hmax + "px";
        self.width = W;
        kick();
      };

      const draw = () => {
        if (!n || !W) return;
        const e = easeInOutCubic(t);
        const cam = camera(e, yaw, elev);
        for (let i = 0; i < n; i++) {
          zs[i] = hgt[i] * riseAt(t, wk[i], weeks, dy[i]);
        }

        const b = extent(cam, e, false);
        const padX = 8;
        const padY = 12;
        const availW = W - gutter - padX * 2;
        const availH = Hmax - padY * 2;
        const sx = availW / (b.maxx - b.minx || 1);
        const sy = availH / (b.maxy - b.miny || 1);
        const s = Math.min(sx, sy);
        const ox = gutter + padX - b.minx * s + (availW - (b.maxx - b.minx) * s) / 2;
        const oy = padY - b.miny * s + (availH - (b.maxy - b.miny) * s) / 2;

        const { cs, sn, se, ce } = cam;
        const px = (x, y) => ox + (x * cs - y * sn) * s;
        const py = (x, y, z) => oy + ((x * sn + y * cs) * se - z * ce) * s;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, Hmax);

        order.sort(
          (a, c) =>
            (wk[a] + 0.5) * sn + (dy[a] + 0.5) * cs - ((wk[c] + 0.5) * sn + (dy[c] + 0.5) * cs)
        );

        const w = lerp(0.78, 0.9, e);
        const off = (1 - w) / 2;
        const radius = lerp(0.17, 0.03, e) * s;
        const outline = (1 - e) * 0.07;
        const lift = 0.7 * e;
        const ex = col[0], ey = col[1], ez = col[2];

        for (let k = 0; k < n; k++) {
          const i = order[k];
          const x0 = wk[i] + off;
          const y0 = dy[i] + off;
          const x1 = x0 + w;
          const y1 = y0 + w;
          const z = zs[i] + hover[i] * lift;
          const o = i * 24;

          polys[o] = px(x0, y0); polys[o + 1] = py(x0, y0, z);
          polys[o + 2] = px(x1, y0); polys[o + 3] = py(x1, y0, z);
          polys[o + 4] = px(x1, y1); polys[o + 5] = py(x1, y1, z);
          polys[o + 6] = px(x0, y1); polys[o + 7] = py(x0, y1, z);
          polys[o + 8] = px(x0, y1); polys[o + 9] = py(x0, y1, 0);
          polys[o + 10] = px(x1, y1); polys[o + 11] = py(x1, y1, 0);
          polys[o + 12] = polys[o + 4]; polys[o + 13] = polys[o + 5];
          polys[o + 14] = polys[o + 6]; polys[o + 15] = polys[o + 7];
          polys[o + 16] = px(x1, y0); polys[o + 17] = py(x1, y0, 0);
          polys[o + 18] = polys[o + 10]; polys[o + 19] = polys[o + 11];
          polys[o + 20] = polys[o + 4]; polys[o + 21] = polys[o + 5];
          polys[o + 22] = polys[o + 2]; polys[o + 23] = polys[o + 3];

          const tall = z * ce * s;
          let f = 0;
          if (tall > 0.35 && w * cs * s > 0.35) f |= 1;
          if (tall > 0.35 && w * sn * s > 0.35) f |= 2;
          faces[i] = f;

          const L = lv[i] * 3;
          let r = col[L], g = col[L + 1], bl = col[L + 2];
          const d = dim[i];
          if (d > 0.002) {
            r += (ex - r) * 0.72 * d;
            g += (ey - g) * 0.72 * d;
            bl += (ez - bl) * 0.72 * d;
          }
          const hv = hover[i];
          if (hv > 0.002) {
            const m = 0.16 * hv;
            r += (fg[0] - r) * m;
            g += (fg[1] - g) * m;
            bl += (fg[2] - bl) * m;
          }
          if (f & 1) {
            ctx.beginPath();
            quadPath(ctx, polys, o + 8, 0);
            ctx.fillStyle = rgbString(r * 0.84, g * 0.84, bl * 0.84);
            ctx.fill();
          }
          if (f & 2) {
            ctx.beginPath();
            quadPath(ctx, polys, o + 16, 0);
            ctx.fillStyle = rgbString(r * 0.68, g * 0.68, bl * 0.68);
            ctx.fill();
          }
          ctx.beginPath();
          quadPath(ctx, polys, o, radius);
          ctx.fillStyle = rgbString(r, g, bl);
          ctx.fill();
          if (outline > 0.004) {
            ctx.strokeStyle = `rgba(${fg[0]},${fg[1]},${fg[2]},${outline.toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          if (hv > 0.02) {
            ctx.strokeStyle = `rgba(${fg[0]},${fg[1]},${fg[2]},${(0.85 * hv).toFixed(3)})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }

        // Labels
        const muted = mixRGB(bg, fg, 0.55);
        ctx.font = font;
        const a2 = 1 - smoothstep(0, 0.4, e);
        const a3 = smoothstep(0.62, 1, e);
        if (a2 > 0.004) {
          ctx.fillStyle = `rgba(${Math.round(muted[0])},${Math.round(muted[1])},${Math.round(muted[2])},${a2.toFixed(3)})`;
          ctx.textAlign = "left";
          ctx.textBaseline = "bottom";
          let edge = -Infinity;
          for (const m of months) {
            const x = px(m.week + off, -0.3);
            const tw = ctx.measureText(m.label).width;
            if (x < edge || x + tw > W) continue;
            ctx.fillText(m.label, x, py(m.week + off, -0.3, 0) - 3);
            edge = x + tw + 6;
          }
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";
          if (gutter > 0) {
            for (const r of weekdayRows) {
              ctx.fillText(r.label, px(0, r.day + 0.5) - 6, py(0, r.day + 0.5, 0));
            }
          }
        }
        if (a3 > 0.004) {
          ctx.fillStyle = `rgba(${Math.round(muted[0])},${Math.round(muted[1])},${Math.round(muted[2])},${a3.toFixed(3)})`;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          let edge = -Infinity;
          for (const m of months) {
            const x = px(m.week + 0.5, 7.3);
            if (x < edge || x + ctx.measureText(m.label).width > W) continue;
            ctx.fillText(m.label, x, py(m.week + 0.5, 7.3, 0) + 2);
            edge = x + ctx.measureText(m.label).width + 10;
          }
        }

        // Tooltip position
        if (activeIdx >= 0 && activeIdx < n) {
          const i = activeIdx;
          const z = zs[i] + hover[i] * lift;
          const tx = px(wk[i] + 0.5, dy[i] + 0.5);
          const ty = Math.min(
            py(wk[i] + off, dy[i] + off, z),
            py(wk[i] + off + w, dy[i] + off, z),
            py(wk[i] + off, dy[i] + off + w, z)
          );
          const half = tipW / 2 || 60;
          const cx = Math.min(W - half - 2, Math.max(half + 2, tx));
          tip.style.transform = `translate(${(cx - half).toFixed(1)}px,${(ty - 8).toFixed(1)}px) translateY(-100%)`;
          tip.style.setProperty("--arrow", `${(tx - cx + half).toFixed(1)}px`);
        }
      };

      const tick = (now) => {
        raf = 0;
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        let moving = false;

        target = self.view === "3d" ? 1 : 0;
        if (t !== target) {
          const step = reduced ? 1 : (dt * 1000) / Math.max(1, self.duration);
          t = target > t ? Math.min(target, t + step) : Math.max(target, t - step);
          moving = true;
        }

        const ko = reduced ? 1 : 1 - Math.exp(-dt * 12);
        yaw += (yawGoal - yaw) * ko;
        elev += (elevGoal - elev) * ko;
        if (Math.abs(yawGoal - yaw) > 1e-4 || Math.abs(elevGoal - elev) > 1e-4) moving = true;
        else {
          yaw = yawGoal;
          elev = elevGoal;
        }

        const kc = reduced ? 1 : 1 - Math.exp(-dt * 7);
        for (let k = 0; k < 15; k++) {
          const d = colGoal[k] - col[k];
          if (Math.abs(d) > 0.4) {
            col[k] += d * kc;
            moving = true;
          } else col[k] = colGoal[k];
        }

        const kh = reduced ? 1 : 1 - Math.exp(-dt * 16);
        const kd = reduced ? 1 : 1 - Math.exp(-dt * 10);
        const leg = self.legendLevel;
        for (let i = 0; i < n; i++) {
          const hg = i === activeIdx ? 1 : 0;
          const dg = leg >= 0 && lv[i] !== leg ? 1 : 0;
          if (hover[i] !== hg) {
            hover[i] = Math.abs(hg - hover[i]) < 0.003 ? hg : hover[i] + (hg - hover[i]) * kh;
            moving = true;
          }
          if (dim[i] !== dg) {
            dim[i] = Math.abs(dg - dim[i]) < 0.003 ? dg : dim[i] + (dg - dim[i]) * kd;
            moving = true;
          }
        }

        draw();
        if (moving) raf = requestAnimationFrame(tick);
      };

      const kick = () => {
        if (raf) return;
        last = performance.now();
        raf = requestAnimationFrame(tick);
      };

      const refreshActive = () => {
        const next = hovered >= 0 ? hovered : pinned;
        if (next === activeIdx) return;
        activeIdx = next;
        self.active = next;
        updateTip();
        kick();
      };

      const updateTip = () => {
        if (activeIdx < 0 || activeIdx >= n) {
          tip.setAttribute("aria-hidden", "true");
          tip.style.opacity = "0";
          return;
        }
        const c = self.model.cells[activeIdx];
        const nf = new Intl.NumberFormat(self.locale);
        const df = new Intl.DateTimeFormat(self.locale, {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        });
        const noun = c.count === 1 ? self.unit : self.unitPlural;
        tip.innerHTML =
          c.count > 0
            ? `<strong>${nf.format(c.count)} ${noun}</strong> <span>el ${df.format(dayMs(c.date))}</span>`
            : `<strong>Sin ${self.unitPlural}</strong> <span>el ${df.format(dayMs(c.date))}</span>`;
        tip.setAttribute("aria-hidden", "false");
        tip.style.opacity = "1";
        tipW = tip.offsetWidth;
      };

      const hit = (x, y) => {
        for (let k = n - 1; k >= 0; k--) {
          const i = order[k];
          const o = i * 24;
          if (pointInQuad(polys, o, x, y)) return i;
          if (faces[i] & 1 && pointInQuad(polys, o + 8, x, y)) return i;
          if (faces[i] & 2 && pointInQuad(polys, o + 16, x, y)) return i;
        }
        return -1;
      };

      const local = (ev) => {
        const r = canvas.getBoundingClientRect();
        return [ev.clientX - r.left, ev.clientY - r.top];
      };

      let drag = null;

      const onDown = (ev) => {
        if (ev.button !== 0) return;
        const can = self.orbit && target === 1;
        drag = {
          id: ev.pointerId,
          x: ev.clientX,
          y: ev.clientY,
          yaw: yawGoal,
          elev: elevGoal,
          moved: false,
          orbit: can,
          mouse: ev.pointerType === "mouse",
        };
        if (can) {
          try {
            canvas.setPointerCapture(ev.pointerId);
          } catch (_) {}
        }
      };

      const onMove = (ev) => {
        if (drag && drag.orbit && ev.pointerId === drag.id) {
          const dx = ev.clientX - drag.x;
          const dyy = ev.clientY - drag.y;
          if (drag.moved || Math.hypot(dx, dyy) > 4) {
            drag.moved = true;
            yawGoal = Math.min(
              YAW_RANGE[1] - YAW_3D,
              Math.max(YAW_RANGE[0] - YAW_3D, drag.yaw + dx * 0.006)
            );
            if (drag.mouse) {
              elevGoal = Math.min(
                ELEV_RANGE[1] - ELEV_3D,
                Math.max(ELEV_RANGE[0] - ELEV_3D, drag.elev + dyy * 0.004)
              );
            }
            canvas.style.cursor = "grabbing";
            hovered = -1;
            refreshActive();
            kick();
            return;
          }
        }
        if (ev.pointerType !== "mouse") return;
        const [x, y] = local(ev);
        const i = hit(x, y);
        if (i !== hovered) {
          hovered = i;
          refreshActive();
        }
        canvas.style.cursor =
          self.orbit && target === 1 ? "grab" : i >= 0 ? "pointer" : "default";
      };

      const onUp = (ev) => {
        if (!drag || ev.pointerId !== drag.id) return;
        const wasMoved = drag.moved;
        drag = null;
        if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
        canvas.style.cursor = self.orbit && target === 1 ? "grab" : "default";
        if (wasMoved) return;
        const [x, y] = local(ev);
        const i = hit(x, y);
        pinned = i === pinned ? -1 : i;
        if (ev.pointerType !== "mouse") hovered = -1;
        refreshActive();
        if (i >= 0) {
          const c = self.model.cells[i];
          self.onCellClick?.({ date: c.date, count: c.count });
        }
      };

      const onLeave = () => {
        if (drag) return;
        hovered = -1;
        refreshActive();
      };

      const onDbl = () => {
        yawGoal = 0;
        elevGoal = 0;
        kick();
      };

      const onKey = (ev) => {
        const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Escape", "Enter", " "];
        if (!keys.includes(ev.key) || !n) return;
        ev.preventDefault();
        if (ev.key === "Escape") {
          pinned = -1;
          hovered = -1;
          refreshActive();
          return;
        }
        let i = pinned >= 0 ? pinned : activeIdx >= 0 ? activeIdx : n - 1;
        if (ev.key === "Enter" || ev.key === " ") {
          const c = self.model.cells[i];
          self.onCellClick?.({ date: c.date, count: c.count });
          return;
        }
        if (pinned >= 0 || activeIdx >= 0) {
          if (ev.key === "ArrowLeft") i -= 7;
          if (ev.key === "ArrowRight") i += 7;
          if (ev.key === "ArrowUp") i -= 1;
          if (ev.key === "ArrowDown") i += 1;
          if (ev.key === "Home") i = 0;
          if (ev.key === "End") i = n - 1;
        }
        i = Math.max(0, Math.min(n - 1, i));
        pinned = i;
        hovered = -1;
        refreshActive();
        const c = self.model.cells[i];
        const nf = new Intl.NumberFormat(self.locale);
        const df = new Intl.DateTimeFormat(self.locale, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        });
        const noun = c.count === 1 ? self.unit : self.unitPlural;
        self.announceEl.textContent =
          c.count > 0
            ? `${nf.format(c.count)} ${noun} el ${df.format(dayMs(c.date))}`
            : `Sin ${self.unitPlural} el ${df.format(dayMs(c.date))}`;
      };

      load();
      retheme();
      relayout();

      const enter = () => {
        if (entered) return;
        entered = true;
        if (reduced) t = target;
        kick();
      };

      let io = null;
      if ("IntersectionObserver" in window) {
        io = new IntersectionObserver(
          (entries) => {
            if (entries.some((en) => en.isIntersecting)) {
              enter();
              io?.disconnect();
            }
          },
          { threshold: 0.3 }
        );
        io.observe(stage);
      } else enter();

      const ro = new ResizeObserver(() => {
        if (Math.round(stage.clientWidth) !== W) relayout();
      });
      ro.observe(stage);

      const mo = new MutationObserver(retheme);
      mo.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme"],
      });

      reduceMq.addEventListener("change", () => {
        reduced = reduceMq.matches;
        kick();
      });

      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", () => { drag = null; });
      canvas.addEventListener("pointerleave", onLeave);
      canvas.addEventListener("dblclick", onDbl);
      canvas.addEventListener("keydown", onKey);
      canvas.addEventListener("blur", () => {
        pinned = -1;
        refreshActive();
      });

      this.engine = {
        kick,
        load: () => {
          load();
          retheme();
          relayout();
        },
        retheme,
      };

      // Cleanup reference
      this._cleanup = () => {
        if (raf) cancelAnimationFrame(raf);
        io?.disconnect();
        ro.disconnect();
        mo.disconnect();
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointerleave", onLeave);
        canvas.removeEventListener("dblclick", onDbl);
        canvas.removeEventListener("keydown", onKey);
      };
    }
  }

  // ---------- Inicialización con datos reales ----------
  const initializeHeatmap = async () => {
    const section = document.querySelector("[data-activity-heatmap]");
    if (!section) return;

    section.hidden = true;
    const client = window.supabaseAdmin?.client;
    if (!client) return;

    try {
      const {
        data: { session },
        error: sessionError,
      } = await client.auth.getSession();
      if (
        sessionError ||
        session?.user?.email?.trim().toLowerCase() !== OWNER_EMAIL
      )
        return;

      section.hidden = false;

      const { data, error } = await client.rpc("actividad_por_dia");
      if (error) throw error;

      const rows = data || [];
      const mapped = rows.map((row) => ({
        date: row.dia,
        count: Number(row.total) || 0,
      }));

      // Limpiar estructura antigua del DOM y montar el skyline
      new ContributionSkyline({
        container: section,
        data: mapped,
        unit: "acción",
        unitPlural: "acciones",
        defaultView: "2d",
        locale: "es-CO",
        weekStart: 1,
      });
    } catch (error) {
      console.error("No se pudo cargar el mapa de actividad:", error);
      section.hidden = false;
      section.innerHTML = `
        <header class="heatmap-heading">
          <div>
            <p class="admin-eyebrow">Movimiento del panel</p>
            <h2>Actividad no disponible</h2>
          </div>
        </header>
        <p class="heatmap-status" style="padding:12px 0;color:var(--admin-muted);font-size:12px">
          No fue posible cargar la actividad: ${error?.message || error?.code || error}
        </p>`;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeHeatmap, { once: true });
  } else {
    initializeHeatmap();
  }
})();