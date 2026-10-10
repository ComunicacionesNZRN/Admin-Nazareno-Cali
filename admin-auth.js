(() => {
  const SUPERADMIN_EMAIL = "comunicaciones@nazarenocali.org";
  const ADMIN_NAVIGATION = [
    { href: "index.html", label: "Dashboard", icon: "fa-solid fa-gauge" },
    { href: "equipo.html", label: "Equipo & Líderes", icon: "fa-solid fa-user-group", permission: "equipo" },
    { href: "encuentros.html", label: "Encuentros H/M", icon: "fa-solid fa-users-between-lines", permission: "encuentros" },
    { href: "eventos.html", label: "Eventos", icon: "fa-solid fa-calendar-days", permission: "eventos" },
    { href: "sermones.html", label: "Prédicas y Podcasts", icon: "fa-brands fa-youtube", permission: "sermones" },
    { href: "plan-maestro.html", label: "Plan del Maestro (DPM)", icon: "fa-solid fa-book-open", permission: "plan_maestro" },
    { href: "grupos.html", label: "Grupos", icon: "fa-solid fa-people-group", permission: "grupos" },
    { href: "carrusel.html", label: "Carrusel", icon: "fa-regular fa-images", permission: "carrusel" },
    { href: "devocionales.html", label: "Devocionales", icon: "fa-solid fa-book-bible", permission: "devocionales" },
    { href: "configuracion.html", label: "Configuración", icon: "fa-solid fa-gear", permission: "configuracion" },
    { href: "perfil.html", label: "Mi perfil", icon: "fa-solid fa-user-shield" }
  ];

  const initializeAdminNavigation = () => {
    const nav = document.querySelector(".admin-nav");
    if (!nav) return;

    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    nav.replaceChildren(...ADMIN_NAVIGATION.map((item) => {
      const link = document.createElement("a");
      link.href = item.href;
      link.classList.toggle("is-active", currentPage === item.href);
      if (currentPage === item.href) link.setAttribute("aria-current", "page");
      if (item.permission) link.dataset.permissionLink = item.permission;

      const icon = document.createElement("i");
      icon.className = item.icon || "fa-solid fa-circle";
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = item.label;
      link.append(icon, label);
      return link;
    }));
  };

  const initializeMobileAdminMenu = () => {
    const sidebar = document.querySelector(".admin-sidebar");
    const brand = sidebar?.querySelector(".admin-brand");
    const nav = sidebar?.querySelector(".admin-nav");
    if (!sidebar || !brand || !nav || sidebar.querySelector(".admin-mobile-menu")) return;

    const button = document.createElement("button");
    button.className = "admin-mobile-menu";
    button.type = "button";
    button.setAttribute("aria-controls", nav.id || "admin-navigation");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Abrir menú de módulos");
    button.innerHTML = '<span>Módulos</span><i class="fa-solid fa-bars" aria-hidden="true"></i>';

    nav.id = nav.id || "admin-navigation";
    nav.classList.add("is-collapsible");
    sidebar.insertBefore(button, nav);

    const icon = button.querySelector("i");
    const closeMenu = (restoreFocus = false) => {
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "Abrir menú de módulos");
      nav.classList.remove("is-open");
      icon.classList.replace("fa-xmark", "fa-bars");
      if (restoreFocus) button.focus();
    };

    button.addEventListener("click", () => {
      const isOpen = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(isOpen));
      button.setAttribute("aria-label", isOpen ? "Cerrar menú de módulos" : "Abrir menú de módulos");
      nav.classList.toggle("is-open", isOpen);
      icon.classList.toggle("fa-bars", !isOpen);
      icon.classList.toggle("fa-xmark", isOpen);
    });

    nav.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a")) closeMenu();
    });

    document.addEventListener("click", (event) => {
      if (!sidebar.contains(event.target)) closeMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav.classList.contains("is-open")) closeMenu(true);
    });

    window.matchMedia?.("(min-width: 768px)").addEventListener?.("change", (event) => {
      if (event.matches) closeMenu();
    });
  };

  initializeAdminNavigation();
  initializeMobileAdminMenu();

  const getSupabaseClient = () => window.supabaseAdmin?.client || window._supabase || window.supabaseClient;

  const normalizeRole = (role) => String(role || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const isSuperAdmin = (user, profile) => {
    const role = normalizeRole(profile?.rol);
    const emails = [user?.email, profile?.correo].map((email) => String(email || "").trim().toLowerCase());
    return ["principal", "admin", "superadmin", "super admin", "administrador principal"].includes(role) ||
      emails.includes(SUPERADMIN_EMAIL);
  };

  const normalizePermission = (permission) => String(permission || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  const hasPermission = (permission, user, profile) => {
    if (isSuperAdmin(user, profile)) return true;

    const key = normalizePermission(permission);
    const role = normalizeRole(profile?.rol);
    const rolePermissions = {
      "director creativo": ["carrusel", "eventos", "devocionales"],
      "director plan del maestro": ["grupos", "devocionales", "plan_maestro", "encuentros", "equipo", "bautismos"]
    };

    return Boolean(profile?.permisos?.[key]) || (rolePermissions[role] || []).includes(key);
  };

  const rolesMap = {
    principal: "Administrador Principal",
    admin: "Administrador Principal",
    superadmin: "Superadmin",
    "super admin": "Superadmin",
    "director plan del maestro": "Director Plan del Maestro",
    "director creativo": "Director Creativo",
    "director de producción": "Director de Producción",
    maestro: "Maestro",
    colaborador: "Colaborador / Líder"
  };

  const formatRole = (rol) => rolesMap[String(rol).toLowerCase()] || rol || "Colaborador";

  const getCurrentUser = async () => {
    const client = getSupabaseClient();
    if (!client) throw new Error("Cliente de Supabase no disponible.");
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    return data.user;
  };

  const getAdminProfile = async (user = null) => {
    const client = getSupabaseClient();
    const currentUser = user || (await getCurrentUser().catch(() => null));
    if (!currentUser) return null;

    const { data, error } = await client
      .from("admin_perfiles")
      .select("usuario_id, correo, nombre, rol, permisos, activo")
      .eq("usuario_id", currentUser.id)
      .maybeSingle();

    // Cuenta Maestra
    if (currentUser.email?.trim().toLowerCase() === SUPERADMIN_EMAIL) {
      return {
        usuario_id: currentUser.id,
        correo: currentUser.email,
        nombre: data?.nombre || "Administrador General",
        rol: "principal",
        permisos: {
          eventos: true,
          grupos: true,
          plan_maestro: true,
          encuentros: true,
          bautismos: true,
          carrusel: true,
          devocionales: true,
          configuracion: true,
          equipo: true,
          sermones: true
        },
        activo: true
      };
    }

    if (error || !data) {
      return {
        usuario_id: currentUser.id,
        correo: currentUser.email,
        rol: "colaborador",
        permisos: {},
        activo: true,
        nombre: ""
      };
    }
    return data;
  };

  const requireAdminSession = async () => {
    const client = getSupabaseClient();
    if (!client) throw new Error("Cliente de Supabase no inicializado.");

    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) {
      window.location.replace("login.html");
      return null;
    }

    const user = session.user;
    const profile = await getAdminProfile(user);
    if (!profile || profile.activo === false) {
      await client.auth.signOut();
      alert("Tu cuenta no está activa o no tiene permisos de acceso.");
      window.location.replace("login.html");
      return null;
    }

    applyPermissionsUI(user, profile);
    return user;
  };

  const requireAdminPermission = async (permission) => {
    const client = getSupabaseClient();
    if (!client) throw new Error("Cliente no disponible.");

    const { data: { session } } = await client.auth.getSession();
    if (!session) {
      window.location.replace("login.html");
      return null;
    }

    const user = session.user;
    const profile = await getAdminProfile(user);
    if (!profile || profile.activo === false) {
      window.location.replace("login.html");
      return null;
    }

    // Aplicar UI inmediatamente en la página activa
    applyPermissionsUI(user, profile);

    if (hasPermission(permission, user, profile)) return { user, profile };

    throw new Error("Tu cuenta no tiene permisos para acceder a este módulo.");
  };

  // Aplica la visibilidad en toda la interfaz
  const applyPermissionsUI = (user, profile) => {
    if (!user || !profile) return;
    const superAdmin = isSuperAdmin(user, profile);

    // 1. Mostrar correo en la barra superior
    document.querySelectorAll("[data-admin-email]").forEach((el) => {
      el.textContent = user.email || "Usuario activo";
    });

    // 2. Saludo personalizado
    const greetingEl = document.querySelector("[data-admin-greeting]");
    if (greetingEl) {
      const displayName = profile.nombre?.trim() || user.email?.split("@")[0] || "Administrador";
      greetingEl.innerHTML = `Hola, ${escapeHtml(displayName)}.`;
    }

    // 3. Texto del rol en el sidebar
    const brandEl = document.querySelector(".admin-brand span, [data-admin-brand-text]");
    if (brandEl) {
      const displayRole = formatRole(profile.rol);
      brandEl.textContent = superAdmin ? "Nazareno Admin" : `Nazareno · ${displayRole}`;
    }

    // 4. Filtrar enlaces de navegación
    const navLinks = document.querySelectorAll(".admin-nav a");
    navLinks.forEach((link) => {
      const permission = link.dataset.permissionLink;
      link.style.display = !permission || hasPermission(permission, user, profile) ? "" : "none";
    });

    // 5. Filtrar tarjetas del Dashboard
    const dashboardCards = document.querySelectorAll(".admin-card[data-permission]");
    dashboardCards.forEach((card) => {
      const perm = card.dataset.permission;
      card.style.display = hasPermission(perm, user, profile) ? "" : "none";
    });
  };

  const escapeHtml = (val = "") =>
    String(val).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);

  const signOutAdmin = async () => {
    const client = getSupabaseClient();
    if (client) await client.auth.signOut();
    window.location.replace("login.html");
  };

  const showAuthError = (element, error) => {
    if (element) element.textContent = error?.message || "Ocurrió un error.";
  };

  window.supabaseAdmin = {
    client: getSupabaseClient(),
    getCurrentUser,
    getAdminProfile,
    isSuperAdmin,
    requireAdminSession,
    requireAdminPermission,
    formatRole,
    signOutAdmin,
    showAuthError
  };
})();