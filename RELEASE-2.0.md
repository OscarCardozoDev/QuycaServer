# Quyca Server 2.0

**Merge:** `develop` → `master` · 98 commits · 213 archivos · +43.341 / −3.069

UstaGallery deja de ser la galería de una universidad y pasa a ser **Quyca**, un SaaS
multi-tenant para instituciones educativas colombianas. La 1.x asumía una sola institución
en cada consulta; la 2.0 no puede asumir ninguna, y ese cambio toca el 80% del backend.

> ⚠️ **Esta versión NO se despliega con un `migrate deploy` sobre la base de la 1.x.**
> El historial de migraciones fue reemplazado. Ver [Despliegue](#despliegue).

---

## 1. Lo que entra

### Multi-tenancy (el cambio de fondo)

Aislamiento por fila con `institutionId` denormalizado. **El filtro no lo escribe ningún
servicio**: lo inyecta una extensión del cliente de Prisma en cada consulta.

| Pieza | Archivo | Qué hace |
|---|---|---|
| Contexto | `src/tenant/tenant-context.ts` | `AsyncLocalStorage` con la institución del request |
| Middleware | `src/tenant/tenant.middleware.ts` | Abre el store, una vez por request |
| Guard | `src/tenant/tenant.guard.ts` | Resuelve slug → institución y **exige membresía activa** |
| Extensión | `src/tenant/tenant.extension.ts` | Inyecta el `where` en los 9 modelos scoped |
| Cross-tenant | `src/tenant/cross-tenant.guard.ts` | `@AllowCrossTenant()` para endpoints de `super_admin` |

- La institución activa viaja en el header **`X-Institution-Slug`**, nunca en el JWT.
- **Falla cerrado:** un modelo scoped consultado sin tenant resuelto tira 403. Lo público
  se declara con `runWithoutTenant()`, explícito y auditable.
- Modelos scoped: `Groups`, `Events`, `Products`, `Classes`, `Schedule`, `Attendance`,
  `ContentRequest`, `Lessons`, `Chapters`.
- Catálogos de plataforma (sin tenant): `GroupCategory`, `SubscriptionPlan`, `UserTypes`,
  `Roles`, `Styles`.
- Modelos de bootstrap (**filtro explícito obligatorio**): `Institution`, `UserInstitution`,
  `InstitutionInvitation` — son los que resuelven el tenant, no pueden depender de él.

Reglas completas en `obsidian/Arquitectura/Multitenancy.md`; los internos, en `obsidian/learn/`.

### Módulos nuevos

| Módulo | Endpoints | Para qué |
|---|---|---|
| `institutions` | `/institutions`, invitaciones, membresías | Alta atómica de institución + rector, invitar, aceptar/rechazar, salir |
| `categories` | `/categories`, `ContentRequest` | Catálogo global de categorías y solicitudes de contenido |
| `lessons` + `chapters` | `/lessons`, `/lessons/:id/chapters` | Lecciones, capítulos, progreso y cola de revisión |
| `plans` | `/subscription-plans` | Planes, features y límites por plan |
| `roles` | `/roles` | Los seis `contextRole` de la plataforma |

La superficie HTTP pasa de **61 a 96 rutas**.

### Autorización

- Se autoriza por **`@RequireContextRole(...)`** — el rol **en la institución activa**
  (`UserInstitution.contextRole`), no por `userType`. Los seis roles: `rector`,
  `coordinator`, `institutional`, `independent`, `student`, `self-taught`.
- `userType` queda como identidad global (`super_admin`, `institution`, `professor`, `user`)
  con UUIDs fijos. Usarlo para autorizar abría una escalada a SUPER_ADMIN — por eso se movió.
- `FeatureGuard` + `@RequireFeature(...)`: la feature sale del plan de la institución.
- `SqlInjectionGuard` global, antes de cualquier controlador.

### Seguridad (25 fixes)

Los de mayor impacto, todos con su plan en `docs/superpowers/plans/`:

- Registro sin autenticar que permitía autoasignarse `super_admin`.
- Alta directa de profesores (`POST /user/professor`) — **eliminada**, ahora se invita.
- Fugas cross-tenant en grupos, eventos, productos, invitaciones y capítulos.
- Portafolio público que exponía obras `PENDING` y `REJECTED` con el feedback del docente.
- Enumeración de correos en el login (mensajes de error unificados).
- `Math.random()` → `crypto.randomInt()` en los códigos de verificación.
- Cookie de sesión: `sameSite` correcto para cross-origin en producción.

### Contenido y obras

- **Audio en las obras** (`Products.audioUrl`): una pista por obra para la categoría música,
  validada por firma de archivo y servida desde `/audio`.
- Grupos con descripción, reglas, portada, baja lógica y límite por plan (`maxGroups`).
- `Styles` pasa a catálogo de plataforma por categoría (sin `groupId` ni `institutionId`).
- Rutas privadas por grupo para obras y eventos, acotadas al tenant.

### Infraestructura

- Prisma 7 con `@prisma/adapter-pg`; `PrismaService` es un **Symbol** que devuelve el cliente
  ya extendido — ningún servicio puede obtener uno sin filtrar.
- Correo transaccional con Resend (invitaciones con link y vencimiento a 3 días).
- CI en GitHub Actions: Postgres de servicio, `migrate deploy`, seed y **402 tests en 56 suites**.
- Colección de Postman/Newman al día, incluida la suite de Lessons y Chapters.

---

## 2. Breaking changes

| # | Qué cambió | Qué se rompe | Qué hacer |
|---|---|---|---|
| 1 | Header `X-Institution-Slug` obligatorio | Toda consulta a un modelo scoped sin header → **403** | El cliente manda el slug en cada request |
| 2 | `POST /user/professor` eliminado | Alta directa de profesores | Invitar: `POST /institutions/:id/invitations` |
| 3 | `GET /products/getGroup/:uid` eliminado (era público y sin filtro de estado) | Lecturas anónimas de obras de un grupo | `GET /products/group/:uid` con sesión y membresía |
| 4 | `GET /styles/mine` eliminado | "Estilos de mi institución" ya no existe | `GET /styles/all/:categoryId` |
| 5 | Vocabulario de roles: `admin/user/...` → `super_admin/institution/professor/user` + los seis `contextRole` | Cualquier check por `userType` | Autorizar por `contextRole` |
| 6 | `Category` (enum) → tabla `GroupCategory` | FKs y filtros por categoría | Correr `prisma:migrate:data` |
| 7 | `Users` **no tiene** `institutionId` | Suponer una institución por usuario | El rol vive en `UserInstitution` |
| 8 | El login devuelve `nextSteps` en vez de tres booleanos | Clientes que leían los flags | Leer `nextSteps` |
| 9 | Historial de migraciones squasheado en `20260807190410_init` | `migrate deploy` sobre una base 1.x | Ver Despliegue |

---

## 3. Despliegue

### Variables de entorno nuevas (`env/production.env`)

| Variable | Obligatoria | Para qué |
|---|---|---|
| `ID_SUPER_ADMIN`, `ID_INSTITUTION`, `ID_PROFESSOR`, `ID_USER` | sí | UUIDs fijos que deben coincidir con las filas de `UserTypes` |
| `RESEND_API_KEY`, `RESEND_EMAIL_FROM` | sí | Invitaciones y códigos por correo |
| `FRONTEND_URL` | recomendada | Links absolutos del correo. Sin ella cae a `CORS_URL_FRONT` |
| `SEMESTER_END_DATE` | sí | Fin del período académico |

`DATABASE_URL`, `JWT_SECRET` y `CORS_URL_FRONT` siguen igual.

### Base de datos limpia

```bash
bun install
bun run prisma:migrate:prod      # migrate deploy
bun run prisma:seed:static       # UserTypes, Roles, planes, 5 categorías, quyca-platform
```

El seed es idempotente y **es obligatorio**: sin `UserTypes` con los UUIDs de las env vars,
la app arranca pero ningún alta funciona.

### Base existente de la 1.x

El historial de migraciones fue reemplazado por un `init` squasheado, así que Prisma no
reconoce la base vieja. En orden:

```bash
# 1. Backup. No es opcional.
pg_dump "$DATABASE_URL" > backup-pre-2.0.sql

# 2. Marcar el init como aplicado (la base YA tiene esas tablas)
npx prisma migrate resolve --applied 20260807190410_init

# 3. Aplicar el resto
bun run prisma:migrate:prod

# 4. Sembrar catálogos
bun run prisma:seed:static

# 5. Migrar los datos: Category (enum) → GroupCategory, y poblar institutionId
bun run prisma:migrate:data
```

Después del paso 5, verificar que no quedó ninguna fila scoped sin institución:

```sql
SELECT 'groups' t, count(*) FROM "Groups" WHERE "institutionId" IS NULL
UNION ALL SELECT 'products', count(*) FROM "Products" WHERE "institutionId" IS NULL
UNION ALL SELECT 'events',   count(*) FROM "Events"   WHERE "institutionId" IS NULL;
```

Cualquier resultado distinto de 0 **bloquea el despliegue**: esas filas son invisibles para
la extensión de tenant y no las va a ver nadie.

### Docker

```bash
docker-compose -f docker-compose.prod.yml up -d
```

`env_file` se lee al **crear** el contenedor, no al arrancarlo: si cambian las variables,
`--force-recreate`, no `restart`.

---

## 4. Verificación

| Qué | Comando | Estado |
|---|---|---|
| Unit + integración | `docker exec Quyca-Backend node node_modules/jest/bin/jest.js` | 56 suites / 402 tests ✅ |
| CI | GitHub Actions, job `jest` | verde con Postgres de servicio ✅ |
| API end-to-end | `bun run test:api` (Newman, servidor arriba) | reporte en `reports/` |
| Aislamiento | `src/tenant/tenant-isolation.spec.ts` | 10 modelos scoped, dos instituciones reales ✅ |

> **Nunca correr `bun run lint`**: el script es `eslint "{src,apps,libs,test}/**/*.ts" --fix`,
> sin scope y con `--fix`. Reescribió ~70 archivos de una vez, incluido el cliente generado.

---

## 5. Lo que queda pendiente

- **Postgres RLS.** La extensión no cubre `include` anidados, `$queryRaw`, consultas directas
  a tablas puente ni seeds. RLS es el cierre real de ese hueco.
- **`AuthContext.isAuthenticated()`** del frontend compara contra una clave literal en vez de
  la de sesión: siempre devuelve `false`.
- Álbumes con varias pistas (hoy: una canción por obra) — `obsidian/Tareas/Musica-Lo-que-falta.md`.
