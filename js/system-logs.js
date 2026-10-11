(() => {
  const record = async ({ accion, seccion, estado }) => {
    const client = window.supabaseAdmin?.client;
    if (!client) return { error: new Error("Cliente de Supabase no disponible.") };

    try {
      const result = await client.from("system_logs").insert({
        accion: String(accion || "Actividad sin descripción").slice(0, 500),
        seccion: String(seccion || "sistema").slice(0, 100),
        estado: String(estado || "error").slice(0, 30),
      });
      if (result.error) console.error("No se pudo guardar el registro de auditoría:", result.error);
      return result;
    } catch (error) {
      console.error("No se pudo guardar el registro de auditoría:", error);
      return { error };
    }
  };

  window.systemLogs = { record };
})();
