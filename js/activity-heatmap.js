(() => {
  const OWNER_EMAIL = "comunicaciones@nazarenocali.org";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const pad = (value) => String(value).padStart(2, "0");
  const toIsoDay = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const fromIsoDay = (day) => new Date(`${day}T12:00:00Z`);

  const initializeHeatmap = async () => {
    const section = document.querySelector("[data-activity-heatmap]");
    if (!section) return;

    section.hidden = true;
    const status = section.querySelector("[data-heatmap-status]");
    const client = window.supabaseAdmin?.client;
    if (!client) return;

    try {
      const { data: { session }, error: sessionError } = await client.auth.getSession();
      if (sessionError || session?.user?.email?.trim().toLowerCase() !== OWNER_EMAIL) return;

      section.hidden = false;
      const { data, error } = await client.rpc("actividad_por_dia");
      if (error) throw error;
      renderHeatmap(section, data || []);
      status.textContent = "";
      const scroller = section.querySelector("[data-heatmap-scroll]");
      const scrollToRecent = () => { scroller.scrollLeft = scroller.scrollWidth; };
      scrollToRecent();
      window.addEventListener("resize", scrollToRecent);
    } catch (error) {
      console.error("No se pudo cargar el mapa de actividad:", error);
      const totalElement = section.querySelector("[data-heatmap-total]");
      if (totalElement) totalElement.textContent = "Actividad no disponible";
      status.textContent = `No fue posible cargar la actividad: ${error?.message || error?.code || error}`;
    }
  };

  const renderHeatmap = (section, rows) => {
    const totalElement = section.querySelector("[data-heatmap-total]");
    const body = section.querySelector("[data-heatmap-body]");
    const weekdays = section.querySelector("[data-heatmap-weekdays]");
    const counts = new Map(rows.map((row) => [row.dia, Number(row.total) || 0]));
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const max = Math.max(0, ...counts.values());
    const today = rows.at(-1)?.dia || toIsoDay(new Date());
    const todayDate = fromIsoDay(today);
    const mondayOffset = (todayDate.getUTCDay() + 6) % 7;
    const startDate = new Date(todayDate.getTime() - (52 * 7 + mondayOffset) * DAY_MS);
    const monthFormatter = new Intl.DateTimeFormat("es-CO", { month: "short", timeZone: "UTC" });
    const longDateFormatter = new Intl.DateTimeFormat("es-CO", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    });
    const seenMonths = new Set();

    totalElement.textContent = `${total.toLocaleString("es-CO")} ${total === 1 ? "acción" : "acciones"} en el último año`;
    weekdays.replaceChildren();
    body.replaceChildren();
    weekdays.append(document.createElement("span"));
    ["Lun", "", "Mié", "", "Vie", "", ""].forEach((label) => {
      const dayLabel = document.createElement("span");
      dayLabel.textContent = label;
      weekdays.append(dayLabel);
    });

    for (let week = 0; week < 53; week += 1) {
      const weekStart = new Date(startDate.getTime() + week * 7 * DAY_MS);
      let monthLabel = "";
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const date = new Date(weekStart.getTime() + dayIndex * DAY_MS);
        if (toIsoDay(date) > today) continue;
        const monthKey = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
        if (!seenMonths.has(monthKey)) {
          seenMonths.add(monthKey);
          monthLabel = monthFormatter.format(date).replace(".", "");
          monthLabel = monthLabel.charAt(0).toLocaleUpperCase("es-CO") + monthLabel.slice(1);
        }
      }

      const monthCell = document.createElement("span");
      monthCell.className = "heatmap-month";
      monthCell.textContent = monthLabel;
      body.append(monthCell);

      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const date = new Date(weekStart.getTime() + dayIndex * DAY_MS);
        const isoDay = toIsoDay(date);
        const cell = document.createElement("span");
        cell.className = "heatmap-day";

        if (isoDay > today) {
          cell.dataset.future = "true";
          cell.setAttribute("aria-hidden", "true");
        } else {
          const count = counts.get(isoDay) || 0;
          const level = count === 0 || max === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
          const tooltip = `${count} acciones el ${longDateFormatter.format(date)}`;
          cell.dataset.level = String(level);
          cell.title = tooltip;
          cell.setAttribute("aria-label", tooltip);
          cell.setAttribute("role", "gridcell");
        }
        body.append(cell);
      }
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeHeatmap, { once: true });
  } else {
    initializeHeatmap();
  }
})();