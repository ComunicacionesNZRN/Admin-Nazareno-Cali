# A2 · Permisos reales (RLS)

Antes, varias políticas `true` para cualquier usuario autenticado anulaban las de módulo (en Postgres las políticas permisivas se suman con OR). Ahora cada tabla se rige por el módulo que la edita en el panel.

| Tabla | Antes | Después | Quién puede |
|---|---|---|---|
| devocionales | Cualquier autenticado escribe; el público ve también los no publicados | Público: solo publicados con fecha ≤ hoy. Escritura: módulo `devocionales` | Leer: público (publicados) y todo admin. Escribir: `devocionales` |
| guias_biblicas | Cualquier autenticado escribe | Público lee la guía activa; escritura: `devocionales` | Escribir: `devocionales` |
| encuentros_config | Cualquier autenticado escribe | Público lee; escritura: `encuentros` | Escribir: `encuentros` |
| encuentros_inscripciones | Cualquier autenticado gestiona; **anon lee todas (datos personales)** | Inscripción pública (INSERT) igual; leer/editar solo `encuentros`; ticket público vía función `ver_ticket_encuentro(codigo)` | Inscribirse: público. Ver/gestionar: `encuentros` |
| grupos_conexion | Cualquier autenticado escribe | Escritura: `grupos`; lectura pública se mantiene | Escribir: `grupos` |
| grupos_integrantes | Cualquier autenticado todo | Líder del grupo, `grupos` o `plan_maestro` | Líder de ese grupo y admins |
| grupos_reportes | Cualquier autenticado todo | Líder del grupo, `grupos` o `plan_maestro` (+ restrictiva de A1) | Líder de ese grupo y admins |
| nosotros_equipo | Cualquier autenticado todo | Público lee; escritura: `equipo` | Escribir: `equipo` (Director Plan del Maestro o principal) |
| plan_maestro_manuales | Cualquier autenticado todo | Todo admin lee; escritura: `plan_maestro` | Escribir: `plan_maestro` |
| redes_12 | Cualquier autenticado todo | Solo `plan_maestro` | `plan_maestro` |

La cuenta comunicaciones@ y los roles principal/admin pueden todo. Las reglas de módulo replican `hasPermission()` de `admin-auth.js` (permiso marcado en Miembros o rol Director Creativo / Director Plan del Maestro).
