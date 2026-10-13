(() => {
  let lastToastAt = 0;
  const showToast = (message) => {
    if (Date.now() - lastToastAt < 8000) return;
    lastToastAt = Date.now();
    const toast = document.createElement("div");
    toast.setAttribute("role", "status");
    toast.textContent = message;
    toast.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:9999;max-width:340px;padding:10px 14px;" +
      "border-radius:10px;background:#a32222;color:#fff;font:600 12px/1.4 sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.2)";
    document.body.append(toast);
    setTimeout(() => toast.remove(), 6000);
  };

  const reportFailure = (error) => {
    const detail = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(" · ") || String(error);
    console.warn("No se pudo guardar el registro de auditoría:", detail, error);
    showToast(`No se guardó el registro de actividad: ${error?.message || "error desconocido"}`);
    window.dispatchEvent(new CustomEvent("system-log-error", { detail: error }));
  };

  const record = async ({ accion, seccion, estado }) => {
    const client = window.supabaseAdmin?.client;
    if (!client) {
      const error = new Error("Cliente de Supabase no disponible.");
      reportFailure(error);
      return { error };
    }

    const payload = {
      accion: String(accion || "Actividad sin descripción").slice(0, 500),
      seccion: String(seccion || "sistema").slice(0, 100),
      estado: String(estado || "error").slice(0, 30),
    };

    try {
      const result = await client.from("system_logs").insert(payload);
      if (!result.error) return result;

      // Respaldo: función del servidor (sql/fix-system-logs.sql)
      const fallback = await client.rpc("registrar_log", {
        p_accion: payload.accion, p_seccion: payload.seccion, p_estado: payload.estado,
      });
      if (fallback.error) {
        reportFailure(result.error);
        console.warn("Respaldo registrar_log también falló:", fallback.error);
        return result;
      }
      console.warn("Insert directo en system_logs falló; se registró vía registrar_log:", result.error);
      return fallback;
    } catch (error) {
      reportFailure(error);
      return { error };
    }
  };

  window.systemLogs = { record };
})();
