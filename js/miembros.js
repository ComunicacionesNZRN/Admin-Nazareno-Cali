(() => {
  const OWNER_EMAIL = "comunicaciones@nazarenocali.org";
  const PERMISSIONS = ["eventos", "grupos", "plan_maestro", "encuentros", "bautismos", "carrusel", "devocionales", "configuracion", "sermones"];
  const root = document.querySelector("[data-members-list]");
  if (!root) return;

  const form = document.querySelector("[data-collaborator-form]");
  const formTitle = document.querySelector("[data-member-form-title]");
  const submitButton = document.querySelector("[data-submit-member]");
  const cancelButton = document.querySelector("[data-cancel-member-edit]");
  const formStatus = document.querySelector("[data-member-form-status]");
  const listStatus = document.querySelector("[data-members-status]");
  const countLabel = document.querySelector("[data-members-count]");
  const escapeHtml = (value = "") => String(value).replace(/[&<>\'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  let members = [];
  let lastLoadAt = 0;
  let loading = false;

  const formatRole = (role) => window.supabaseAdmin.formatRole(role);
  const memberPermissions = (member) => {
    if (member.correo?.trim().toLowerCase() === OWNER_EMAIL) return "Todos los permisos";
    const labels = PERMISSIONS.filter((permission) => member.permisos?.[permission]);
    return labels.length ? labels.map(formatRolePermission).join(", ") : "Sin permisos";
  };
  const formatRolePermission = (permission) => ({
    eventos: "Eventos", grupos: "Grupos", plan_maestro: "Plan Maestro", encuentros: "Encuentros",
    bautismos: "Bautismos", carrusel: "Carrusel", devocionales: "Devocionales",
    configuracion: "Configuración", sermones: "Prédicas"
  })[permission] || permission;

  const relativeLastSeen = (member) => {
    const timestamp = member.last_seen_at || member.last_sign_in_at;
    if (!timestamp) return { label: "Nunca", online: false };
    const minutes = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000);
    if (minutes < 2) return { label: "En línea", online: true };
    if (minutes < 60) return { label: `hace ${minutes} min`, online: false };
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return { label: `hace ${hours} h`, online: false };
    return { label: `hace ${Math.floor(hours / 24)} d`, online: false };
  };

  const renderMembers = () => {
    countLabel.textContent = `${members.length} ${members.length === 1 ? "miembro" : "miembros"}`;
    if (!members.length) {
      root.innerHTML = '<tr><td colspan="5" class="admin-empty">No hay miembros registrados.</td></tr>';
      return;
    }

    root.innerHTML = members.map((member) => {
      const owner = member.correo?.trim().toLowerCase() === OWNER_EMAIL;
      const isActive = member.activo !== false;
      const status = !isActive ? "deactivated" : !member.email_confirmed_at ? "invited" : "active";
      const statusLabel = status === "deactivated" ? "Desactivado" : status === "invited" ? "Invitado" : "Activo";
      const displayName = member.nombre?.trim() || member.correo || "Miembro";
      const initials = displayName.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("es-CO");
      const lastSeen = relativeLastSeen(member);
      return `<tr>
        <td><div class="member-identity"><span class="member-avatar" aria-hidden="true">${escapeHtml(initials)}</span><span class="member-user-copy"><strong>${escapeHtml(displayName)}</strong><small>${escapeHtml(member.correo || "")}</small></span></div></td>
        <td><span class="member-role">${escapeHtml(formatRole(member.rol))}</span><small class="member-permissions">${escapeHtml(memberPermissions(member))}</small></td>
        <td><span class="member-status" data-status="${status}">${statusLabel}</span></td>
        <td><span class="member-last-seen ${lastSeen.online ? "is-online" : ""}">${lastSeen.online ? '<i aria-hidden="true"></i>' : ""}${lastSeen.label}</span></td>
        <td><div class="member-actions">${owner ? "" : `<button class="admin-button" type="button" data-edit-member="${escapeHtml(member.usuario_id)}">Editar</button><button class="admin-button ${isActive ? "admin-button-danger" : ""}" type="button" data-toggle-member="${escapeHtml(member.usuario_id)}">${isActive ? "Desactivar" : "Activar"}</button>`}</div></td>
      </tr>`;
    }).join("");

    root.querySelectorAll("[data-edit-member]").forEach((button) => button.addEventListener("click", () => {
      const member = members.find((item) => item.usuario_id === button.dataset.editMember);
      if (member) fillForm(member);
    }));
    root.querySelectorAll("[data-toggle-member]").forEach((button) => button.addEventListener("click", () => {
      void toggleMember(button.dataset.toggleMember);
    }));
  };

  const loadMembers = async ({ quiet = false } = {}) => {
    if (loading) return;
    loading = true;
    if (!quiet) listStatus.textContent = "Actualizando miembros...";
    try {
      const { data, error } = await window.supabaseAdmin.client.rpc("listar_miembros");
      if (error) throw error;
      members = data || [];
      lastLoadAt = Date.now();
      renderMembers();
      listStatus.textContent = "";
    } catch (error) {
      if (!quiet) listStatus.textContent = error.message || "No fue posible cargar los miembros.";
    } finally {
      loading = false;
    }
  };

  const fillForm = (member) => {
    form.elements.collab_id.value = member.usuario_id;
    form.elements.email.value = member.correo || "";
    form.elements.email.readOnly = true;
    form.elements.nombre.value = member.nombre || "";
    form.elements.rol.value = member.rol || "colaborador";
    form.elements.password.required = false;
    form.elements.password.value = "";
    form.elements.password.placeholder = "Dejar en blanco para no cambiarla";
    PERMISSIONS.forEach((permission) => { form.elements[permission].checked = Boolean(member.permisos?.[permission]); });
    formTitle.textContent = "Editar miembro";
    submitButton.textContent = "Actualizar miembro";
    cancelButton.hidden = false;
    formStatus.textContent = "";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const resetForm = () => {
    form.reset();
    form.elements.collab_id.value = "";
    form.elements.email.readOnly = false;
    form.elements.password.required = true;
    form.elements.password.placeholder = "Mínimo 8 caracteres";
    formTitle.textContent = "Agregar miembro";
    submitButton.textContent = "Guardar miembro";
    cancelButton.hidden = true;
    formStatus.textContent = "";
  };

  const toggleMember = async (userId) => {
    const member = members.find((item) => item.usuario_id === userId);
    if (!member) return;
    const active = member.activo === false;
    const { error } = await window.supabaseAdmin.client.from("admin_perfiles").update({ activo: active }).eq("usuario_id", userId);
    if (error) {
      listStatus.textContent = error.message || "No fue posible actualizar el estado.";
      return;
    }
    window.systemLogs.record({ accion: `Miembro ${active ? "activado" : "desactivado"}`, seccion: "miembros", estado: "exito" });
    await loadMembers({ quiet: true });
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    formStatus.textContent = "Guardando...";
    const data = new FormData(form);
    const editingUserId = data.get("collab_id");
    const permissions = Object.fromEntries(PERMISSIONS.map((permission) => [permission, data.get(permission) === "on"]));
    try {
      if (editingUserId) {
        const { error } = await window.supabaseAdmin.client.from("admin_perfiles").update({
          nombre: data.get("nombre"), rol: data.get("rol"), permisos: permissions
        }).eq("usuario_id", editingUserId);
        if (error) throw error;
        window.systemLogs.record({ accion: "Miembro actualizado", seccion: "miembros", estado: "exito" });

        const newPassword = String(data.get("password") || "");
        if (newPassword) {
          if (newPassword.length < 8) throw new Error("Perfil guardado, pero la contraseña debe tener al menos 8 caracteres.");
          formStatus.textContent = "Perfil guardado. Cambiando contraseña...";
          const { data: result, error: fnError } = await window.supabaseAdmin.client.functions.invoke("admin-set-password", {
            body: { user_id: editingUserId, password: newPassword }
          });
          if (fnError || result?.error) {
            let message = result?.error;
            try { message = message || (await fnError?.context?.json())?.error; } catch { /* sin cuerpo */ }
            throw new Error(`Perfil guardado, pero no se cambió la contraseña: ${message || fnError?.message || "error desconocido"}`);
          }
          formStatus.textContent = "Miembro y contraseña actualizados correctamente.";
        } else {
          formStatus.textContent = "Miembro actualizado correctamente.";
        }
      } else {
        const client = window.supabaseAdmin.client;
        const isolatedClient = window.supabase.createClient(client.supabaseUrl, client.supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false }
        });
        const { data: signUpData, error: signUpError } = await isolatedClient.auth.signUp({
          email: data.get("email"), password: data.get("password")
        });
        if (signUpError) throw signUpError;
        if (!signUpData.user) throw new Error("Supabase requiere confirmación de correo.");
        const { data: { user: currentUser } } = await client.auth.getUser();
        const { error } = await client.from("admin_perfiles").insert({
          usuario_id: signUpData.user.id,
          correo: data.get("email"),
          nombre: data.get("nombre"),
          rol: data.get("rol"),
          permisos,
          created_by: currentUser?.id || null
        });
        if (error) throw error;
        window.systemLogs.record({ accion: "Miembro creado", seccion: "miembros", estado: "exito" });
        formStatus.textContent = "Miembro creado correctamente.";
      }
      resetForm();
      await loadMembers({ quiet: true });
    } catch (error) {
      formStatus.textContent = error.message || "No fue posible guardar el miembro.";
    } finally {
      submitButton.disabled = false;
    }
  });

  cancelButton.addEventListener("click", resetForm);

  (async () => {
    try {
      const user = await window.supabaseAdmin.requireAdminSession();
      if (!user) return;
      if (!window.supabaseAdmin.isDashboardOwner(user)) {
        window.location.replace("index.html");
        return;
      }
      document.querySelector("[data-admin-email]").textContent = user.email || "Usuario activo";
      await loadMembers();
      window.setInterval(renderMembers, 30_000);
      window.setInterval(() => {
        if (document.visibilityState === "visible" && Date.now() - lastLoadAt >= 60_000) void loadMembers({ quiet: true });
      }, 60_000);
    } catch (error) {
      listStatus.textContent = error.message || "No fue posible verificar el acceso.";
    }
  })();
})();