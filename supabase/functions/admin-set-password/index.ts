import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OWNER_EMAIL = "comunicaciones@nazarenocali.org";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Método no permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "La función no está configurada." }, 500);
  }

  // 1) Verificar quién llama (JWT del navegador)
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Sesión requerida." }, 401);
  }
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser(authHeader.slice(7));
  if (callerError || !caller) {
    return json({ error: "Sesión inválida o vencida." }, 401);
  }
  const callerEmail = String(caller.email || "").trim().toLowerCase();
  if (callerEmail !== OWNER_EMAIL) {
    return json({ error: "Solo la cuenta administradora puede cambiar contraseñas." }, 403);
  }

  // 2) Validar datos
  let body: { user_id?: unknown; email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8 || password.length > 72) {
    return json({ error: "La contraseña debe tener entre 8 y 72 caracteres." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let targetId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  const targetEmailInput = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  // Debe existir en admin_perfiles (solo se cambian contraseñas de miembros del panel)
  const query = admin.from("admin_perfiles").select("usuario_id, correo").limit(1);
  const { data: profile, error: profileError } = targetId
    ? (UUID_RE.test(targetId) ? await query.eq("usuario_id", targetId).maybeSingle() : { data: null, error: null })
    : targetEmailInput
      ? await query.ilike("correo", targetEmailInput).maybeSingle()
      : { data: null, error: null };

  if (profileError) return json({ error: "No se pudo consultar el miembro." }, 500);
  if (!profile) return json({ error: "Miembro no encontrado." }, 404);
  targetId = profile.usuario_id;

  // 3) La cuenta madre cambia su propia contraseña desde "Mi perfil", no por aquí
  if (targetId === caller.id || String(profile.correo || "").trim().toLowerCase() === OWNER_EMAIL) {
    return json({ error: "La contraseña de la cuenta administradora se cambia desde Mi perfil." }, 400);
  }

  // 4) Cambiar contraseña (y confirmar el correo para que pueda entrar)
  const { error: updateError } = await admin.auth.admin.updateUserById(targetId, {
    password,
    email_confirm: true,
  });

  const ok = !updateError;
  await admin.from("system_logs").insert({
    accion: ok
      ? `Contraseña restablecida para ${profile.correo}`
      : `Error al restablecer contraseña de ${profile.correo}: ${updateError?.message || "desconocido"}`.slice(0, 500),
    seccion: "miembros",
    estado: ok ? "exito" : "error",
    usuario_id: caller.id,
    usuario_email: caller.email,
  });

  if (!ok) return json({ error: updateError?.message || "No se pudo cambiar la contraseña." }, 400);
  return json({ ok: true, user_id: targetId });
});
