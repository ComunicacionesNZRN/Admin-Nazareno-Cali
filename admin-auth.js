(() => {
  const SUPERADMIN_EMAIL = "comunicaciones@nazarenocali.org";
  const ADMIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
  const ADMIN_LAST_ACTIVITY_KEY = "nazareno-admin-last-activity";
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
    { href: "miembros.html", label: "Miembros", icon: "fa-solid fa-users", ownerOnly: true },
    { href: "perfil.html", label: "Mi perfil", icon: "fa-solid fa-user-shield" }
  ];

  const initializeAdminNavigation = () => {
    const nav = document.querySelector(".admin-nav");
    if (!nav) return;

    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    const createLink = (item) => {
      const link = document.createElement("a");
      link.href = item.href;
      link.classList.toggle("is-active", currentPage === item.href);
      if (currentPage === item.href) link.setAttribute("aria-current", "page");
      if (item.permission) link.dataset.permissionLink = item.permission;
      if (item.ownerOnly) {
        link.dataset.dashboardOwnerOnly = "";
        link.hidden = true;
      }

      const icon = document.createElement("i");
      icon.className = item.icon || "fa-solid fa-circle";
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = item.label;
      link.append(icon, label);
      return link;
    };

    nav.replaceChildren(...ADMIN_NAVIGATION.map(createLink));
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

  let presenceInterval = null;
  let presenceVisibilityListenerAdded = false;
  const sendPresence = async () => {
    if (document.visibilityState !== "visible") return;
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const { error } = await client.rpc("marcar_conexion");
      if (error) console.warn("No se pudo actualizar la última conexión:", error.message);
    } catch (error) {
      console.warn("No se pudo actualizar la última conexión:", error);
    }
  };

  const startPresenceHeartbeat = () => {
    if (!presenceInterval) {
      void sendPresence();
      presenceInterval = window.setInterval(sendPresence, 60_000);
    }
    if (!presenceVisibilityListenerAdded) {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void sendPresence();
      });
      presenceVisibilityListenerAdded = true;
    }
  };

  const getLastActivityTimestamp = () => {
    try {
      return Number(localStorage.getItem(ADMIN_LAST_ACTIVITY_KEY)) || 0;
    } catch {
      return 0;
    }
  };

  const saveLastActivityTimestamp = (timestamp = Date.now()) => {
    try {
      localStorage.setItem(ADMIN_LAST_ACTIVITY_KEY, String(timestamp));
    } catch {
      // La aplicación también mantiene el timeout de la pestaña actual.
    }
  };

  const isAdminSessionExpired = () => {
    const lastActivity = getLastActivityTimestamp();
    return lastActivity > 0 && Date.now() - lastActivity >= ADMIN_IDLE_TIMEOUT_MS;
  };

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

  const isDashboardOwner = (user) => String(user?.email || "").trim().toLowerCase() === SUPERADMIN_EMAIL;

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
    if (isAdminSessionExpired()) {
      await signOutAdmin();
      return null;
    }

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
    startPresenceHeartbeat();
    return user;
  };

  const requireAdminPermission = async (permission) => {
    const client = getSupabaseClient();
    if (!client) throw new Error("Cliente no disponible.");
    if (isAdminSessionExpired()) {
      await signOutAdmin();
      return null;
    }

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
    startPresenceHeartbeat();

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
      const displayName = profile.nombre?.trim() || user.email?.trim();
      greetingEl.textContent = displayName ? `Hola, ${displayName}.` : "Hola.";
    }

    const dashboardOwner = isDashboardOwner(user);
    document.querySelectorAll("[data-dashboard-owner-only]").forEach((section) => {
      section.hidden = !dashboardOwner;
    });
    const modulePrompt = document.querySelector("[data-dashboard-module-prompt]");
    if (modulePrompt) modulePrompt.hidden = dashboardOwner;

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
    document.querySelectorAll("[data-permission-action]").forEach((action) => {
      action.hidden = !hasPermission(action.dataset.permissionAction, user, profile);
    });
    document.querySelectorAll("[data-permission-section]").forEach((section) => {
      const permissions = section.dataset.permissionSection.split(",");
      section.hidden = permissions.every((permission) => {
        const actions = [...document.querySelectorAll(`[data-permission-action="${permission}"]`)];
        return !actions.length || actions.every((action) => action.hidden);
      });
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

  let signOutPromise;
  const signOutAdmin = async () => {
    if (signOutPromise) return signOutPromise;
    signOutPromise = (async () => {
      const client = getSupabaseClient();
      if (client) {
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) throw error;
      }
      try {
        localStorage.removeItem(ADMIN_LAST_ACTIVITY_KEY);
      } catch {
        // La sesión local de Supabase se cierra aunque el almacenamiento no esté disponible.
      }
      window.location.replace("login.html");
    })();
    try {
      await signOutPromise;
    } finally {
      signOutPromise = null;
    }
  };

  const initializeIdleSessionTimeout = () => {
    if (document.body.dataset.adminProtected !== "true") return;

    const now = Date.now();
    let lastActivityAt = getLastActivityTimestamp();
    if (!lastActivityAt) {
      lastActivityAt = now;
      saveLastActivityTimestamp(now);
    }
    if (now - lastActivityAt >= ADMIN_IDLE_TIMEOUT_MS) {
      signOutAdmin().catch((error) => console.error("No se pudo cerrar la sesión inactiva:", error));
      return;
    }

    let lastPersistedAt = lastActivityAt;
    let timeoutId;
    let isEndingSession = false;

    const endSession = () => {
      if (isEndingSession) return;
      isEndingSession = true;
      clearTimeout(timeoutId);
      signOutAdmin().catch((error) => console.error("No se pudo cerrar la sesión inactiva:", error));
    };

    const checkIdleTime = () => {
      lastActivityAt = Math.max(lastActivityAt, getLastActivityTimestamp());
      const remaining = ADMIN_IDLE_TIMEOUT_MS - (Date.now() - lastActivityAt);
      if (remaining <= 0) {
        endSession();
        return;
      }
      timeoutId = window.setTimeout(checkIdleTime, remaining);
    };

    const markActivity = () => {
      if (isEndingSession) return;
      const now = Date.now();
      lastActivityAt = Math.max(lastActivityAt, getLastActivityTimestamp());
      if (now - lastActivityAt >= ADMIN_IDLE_TIMEOUT_MS) {
        endSession();
        return;
      }
      lastActivityAt = now;
      if (lastActivityAt - lastPersistedAt >= 10000) {
        lastPersistedAt = lastActivityAt;
        saveLastActivityTimestamp(lastActivityAt);
      }
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(checkIdleTime, ADMIN_IDLE_TIMEOUT_MS);
    };

    ["pointerdown", "pointermove", "keydown", "scroll", "touchstart", "click"].forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { passive: true });
    });

    window.addEventListener("storage", (event) => {
      if (event.key !== ADMIN_LAST_ACTIVITY_KEY) return;
      if (event.newValue === null) {
        endSession();
        return;
      }
      const sharedActivity = Number(event.newValue) || 0;
      if (sharedActivity > lastActivityAt) {
        lastActivityAt = sharedActivity;
        clearTimeout(timeoutId);
        timeoutId = window.setTimeout(checkIdleTime, Math.max(0, ADMIN_IDLE_TIMEOUT_MS - (Date.now() - lastActivityAt)));
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkIdleTime();
    });

    checkIdleTime();
  };

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-sign-out]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    button.disabled = true;
    signOutAdmin().catch((error) => {
      button.disabled = false;
      showAuthError(document.querySelector("[data-auth-status]"), error);
    });
  }, true);

  const showAuthError = (element, error) => {
    if (element) element.textContent = error?.message || "Ocurrió un error.";
  };

  window.supabaseAdmin = {
    client: getSupabaseClient(),
    getCurrentUser,
    getAdminProfile,
    isSuperAdmin,
    isDashboardOwner,
    applyPermissionsUI,
    requireAdminSession,
    requireAdminPermission,
    startPresenceHeartbeat,
    isAdminSessionExpired,
    markAdminActivity: saveLastActivityTimestamp,
    formatRole,
    signOutAdmin,
    showAuthError
  };

  initializeIdleSessionTimeout();
})();