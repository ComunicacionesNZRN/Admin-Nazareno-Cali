// admin-auth.js
(() => {
  const rolesMap = {
    principal: "Administrador Principal",
    colaborador: "Colaborador",
    "director plan del maestro": "Director Plan del Maestro",
    "director creativo": "Director Creativo",
    "director de producción": "Director de Producción",
    maestro: "Maestro"
  };

  const formatRole = (rol) => rolesMap[rol?.toLowerCase()] || rol || "Colaborador";

  // Obtener sesión activa requerida
  const requireAdminSession = async () => {
    const client = window.supabaseAdmin?.client;
    if (!client) throw new Error("Cliente de Supabase no disponible.");

    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) {
      window.location.href = "login.html";
      return null;
    }
    return session.user;
  };

  // Obtener perfil y permisos de la base de datos
  const getAdminProfile = async (user) => {
    const client = window.supabaseAdmin?.client;
    if (!client || !user) return { rol: "colaborador", permisos: {} };

    const { data, error } = await client
      .from("admin_perfiles")
      .select("rol, permisos, nombre, activo")
      .eq("usuario_id", user.id)
      .maybeSingle();

    if (error || !data) {
      return { rol: "colaborador", permisos: {}, nombre: "" };
    }
    return data;
  };

  // Aplicar permisos visuales al sidebar y la interfaz
  const applyUserPermissions = (user, profile) => {
    // 1. Mostrar correo en la barra superior
    const emailEls = document.querySelectorAll("[data-admin-email]");
    emailEls.forEach((el) => {
      el.textContent = user?.email || "Usuario";
    });

    // 2. Mostrar el rol junto al logo en el sidebar
    const brandText = document.querySelector("[data-admin-brand-text]");
    const brandEl = document.querySelector(".admin-brand");
    const formattedRole = formatRole(profile.rol);

    if (brandText) {
      brandText.textContent = profile.rol === "principal" ? "Nazareno Admin" : `Nazareno · ${formattedRole}`;
    } else if (brandEl) {
      const img = brandEl.querySelector("img");
      const imgSrc = img ? img.getAttribute("src") : "Media/logoBlanco.png";
      const title = profile.rol === "principal" ? "Nazareno Admin" : `Nazareno · ${formattedRole}`;
      brandEl.innerHTML = `<img src="${imgSrc}" alt="" /> <span data-admin-brand-text>${title}</span>`;
    }

    // 3. Si es Administrador Principal, ve todo
    if (profile.rol === "principal") return;

    // 4. Filtrar links del sidebar según permisos
    const modules = ["eventos", "grupos", "carrusel", "devocionales", "configuracion"];
    const navLinks = document.querySelectorAll(".admin-nav a");

    navLinks.forEach((link) => {
      const href = link.getAttribute("href") || "";
      modules.forEach((mod) => {
        if (href.includes(mod)) {
          const hasAccess = Boolean(profile.permisos?.[mod]);
          if (!hasAccess) {
            link.style.display = "none";
          }
        }
      });
    });

    // 5. Ocultar cards en el Dashboard (index.html) si no tiene permiso
    const cards = document.querySelectorAll(".admin-card, .admin-stat");
    cards.forEach((card) => {
      const href = card.getAttribute("href") || "";
      modules.forEach((mod) => {
        if (href.includes(mod) && !profile.permisos?.[mod]) {
          card.style.display = "none";
        }
      });
    });
  };

  const signOutAdmin = async () => {
    const client = window.supabaseAdmin?.client;
    if (client) await client.auth.signOut();
    window.location.href = "login.html";
  };

  // Inicialización automática al cargar el DOM
  document.addEventListener("DOMContentLoaded", async () => {
    if (document.body.dataset.adminProtected === "true") {
      try {
        const user = await requireAdminSession();
        if (user) {
          const profile = await getAdminProfile(user);
          applyUserPermissions(user, profile);
        }
      } catch (err) {
        console.error("Error al verificar sesión:", err);
      }
    }

    const signOutBtn = document.querySelector("[data-sign-out]");
    if (signOutBtn) {
      signOutBtn.addEventListener("click", signOutAdmin);
    }
  });

  window.supabaseAdmin = {
    ...window.supabaseAdmin,
    requireAdminSession,
    getAdminProfile,
    formatRole,
    signOutAdmin
  };
})();