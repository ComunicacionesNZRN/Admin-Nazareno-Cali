(() => {
if (window.supabaseAdmin?.client) return;

const supabaseUrl = 'https://fttaziyxpkqxnnsgmzqe.supabase.co';
// Anon/publishable key: es pública por diseño, segura para el navegador.
// NUNCA pongas aquí la service_role ni la sb_secret.
const supabaseKey = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0dGF6aXl4cGtxeG5uc2dtenFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MTg4OTQsImV4cCI6MjEwNDE5NDg5NH0.t-_tdYmNwCl962DKCkNRclvLR2mMLEfhDoVc3wlOH-M';

// Inicializamos el cliente una sola vez
const client = supabase.createClient(supabaseUrl, supabaseKey);

// Único punto de verdad: todas las páginas leen window.supabaseAdmin.client
window.supabaseAdmin = {
  client: client,
};
window._supabase = client;
})();