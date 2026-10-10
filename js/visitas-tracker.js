/**
 * Contador de visitas — Iglesia del Nazareno Cali
 * Registra una visita por sesión de navegador (no por cada página vista),
 * así una persona que navega entre Inicio → Grupos → Eventos cuenta como
 * UNA visita, no tres. La sesión se reinicia cuando cierra la pestaña/navegador.
 *
 * Requiere que supabase-client.js ya se haya cargado antes que este script
 * (define window._supabase).
 */
(() => {
  const supabaseClient = window._supabase || window.supabaseAdmin?.client;
  if (!supabaseClient) return;

  const SESSION_KEY = "nzrn_visita_registrada";
  if (sessionStorage.getItem(SESSION_KEY)) return; // ya se contó esta sesión

  supabaseClient
    .from("site_visits")
    .insert({ path: window.location.pathname, referrer: document.referrer || null })
    .then(({ error }) => {
      if (!error) sessionStorage.setItem(SESSION_KEY, "1");
    })
    .catch(() => {
      /* si falla, no pasa nada: simplemente no se contó esta visita */
    });
})();
