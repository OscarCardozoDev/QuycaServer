# Postman Test Progress

Progress by module. Source: `build-collection.js` → `collections/server-api/collection.json`.

Run tests: `bun run test:api` (requires server on port 3000).

---

## Auth ✅ Complete

| Endpoint | Test case | Status |
|---|---|---|
| POST /auth/register | happy path → 201, has message | ✅ |
| POST /auth/register | duplicate email → 409/500 | ✅ |
| POST /auth/login | professor → 201, hasProfile/hasGroup booleans | ✅ |
| POST /auth/login | wrong password → 401 | ✅ |
| POST /auth/login | unknown email → 401 (Passport swallows 404) | ✅ |
| POST /auth/logout | → 201, has message | ✅ |
| POST /auth/send-code | professor → 201 ⚠️ requires Resend env var | ✅ |
| POST /auth/verify-code | invalid format (non-numeric) → 400 | ✅ |
| POST /auth/verify-code | valid format, wrong code → 400 | ✅ |
| GET /auth/without-profile | admin → 200, array | ✅ |
| GET /auth/without-profile | professor → 403 | ✅ |

> ⚠️ `send-code` depends on `config.resendKey` env var. Without it the test returns 500.

---

## User ✅ Complete

| Endpoint | Test case | Status |
|---|---|---|
| POST /user/professor | admin → 201, captures newProfessorId + createdUserId | ✅ |
| POST /user/professor | duplicate uid → 409 | ✅ |
| POST /user/professor | professor → 403 | ✅ |
| POST /user/create | admin → 400/409 (already has profile — no @Roles guard on this endpoint) | ✅ |
| GET /user/allActive | admin → 200, array | ✅ |
| GET /user/allActive | professor → 200 (has access now) | ✅ |
| GET /user/me | admin → 200 | ✅ |
| GET /user/author/:uid | public → 200, has name | ✅ |
| GET /user/:uid | public → 200 | ✅ |
| GET /user/:uid | 404 for unknown uid | ✅ |
| PUT /user/:uid | admin → 200, has uid | ✅ |
| PUT /user/update | professor → 200, has uid | ✅ |
| PATCH /user/:uid/photo | admin → 200, has uid | ✅ |
| PATCH /user/photo | professor (self) → 200, has uid | ✅ |
| PATCH /user/:uid/deactivate | admin → 200 | ✅ |
| PATCH /user/:uid/reactivate | admin → 200 | ✅ |
| PATCH /user/deactivate | student (self) → 200 | ✅ |
| POST /user/create | happy path (student, no prior profile) | ⚠️ not tested — after register, JWT has no userTypeId so @Roles('student') fails |

> **Flow note:** `GET /auth/without-profile` now captures `newUserId` (the uid of `test_new@gmail.com` registered in Auth tests). The User module uses it to create a professor profile via `POST /user/professor`.
>
> **Paths fixed:** old `desactivate` → `deactivate` throughout.

---

## Groups ✅ Complete

> **Multitenant update:** `POST /groups/create` and `GET /groups/get` now require rector session + `X-Institution-Slug` header. Other endpoints unchanged.

| Endpoint | Test case | Status |
|---|---|---|
| POST /groups/create | rector + X-Institution-Slug → 201, has uid | ✅ |
| POST /groups/create | institutional role + X-Institution-Slug → 403 | ✅ |
| GET /groups/get | rector + X-Institution-Slug → 200, plain array | ✅ |
| GET /groups/get/:uid | → 200, uid matches | ✅ |
| GET /groups/get/:uid | unknown uid → 404 | ✅ |
| GET /groups/get/:uid | 404 after delete | ✅ |
| PUT /groups/update/:uid | admin → 200, has uid | ✅ |
| PATCH /groups/change-profesor/:uid | admin → 200, has groupId + profesor | ✅ |
| POST /groups/student/add | → 201, success true, created 1 | ✅ |
| GET /groups/student/get/:uid | → 200, array | ✅ |
| PUT /groups/student/update/:uid | → 200, has groupId | ✅ |
| DELETE /groups/student/delete/:uid | professor → 200, success true | ✅ |
| DELETE /groups/student/deleteAll/:uid | admin → 200, success true | ✅ |
| DELETE /groups/delete/:uid | admin → 200, success true | ✅ |

> **Multitenant breaking changes fixed:** `create` → rector session + `X-Institution-Slug` + `categoryId`/`institutionId` in body; `getAll` → rector session + header.
> `studentId` captured via `GET /user/me` during student session. Downstream create also uses rector + tenant headers.

---

## Photos ✅ Complete

| Endpoint | Test case | Status |
|---|---|---|
| POST /photos/create | → 201, has uid + name + url | ✅ |
| GET /photos/get/:uid | → 200, uid matches, has name + url | ✅ |
| GET /photos/get/:uid | unknown uid → 404 | ✅ |
| PUT /photos/edit/:uid | → 200, has uid + url | ✅ |
| PUT /photos/edit/:uid | unknown uid → 404 | ✅ |

> No auth guard on controller — all endpoints public, no login needed.
>
> **Bugs fixed:** `Get Photo` was asserting `json.base64` but service returns `{ uid, name, url }`. Fixed to assert `url`.
>
> **Real image:** `TEST_BASE64` loaded from `docs/testBase64.txt` (PNG, 19 KB) — replaces the 1×1 pixel JPEG stub.

---

## Products ✅ Complete

| Endpoint | Test case | Status |
|---|---|---|
| POST /products/create | professor → 201, has uid + photos array | ✅ |
| GET /products/getGalleryHome | public → 200, plain array | ✅ |
| GET /products/getAuthor/:uid | public → 200, plain array (uses {{newProfessorId}}) | ✅ |
| GET /products/get/:uid | public → 200, uid matches | ✅ |
| GET /products/get/:uid | 404 for unknown uid | ✅ |
| PATCH /products/status/:uid | REJECTED without feedback → 400 | ✅ |
| PATCH /products/status/:uid | APPROVED → 200, status APPROVED | ✅ |
| PUT /products/approveMany | → 200, has count (number) | ✅ |
| PUT /products/update/:uid | professor → 200, has uid | ✅ |
| GET /products/getGroup/:uid | professor → 200, plain array | ✅ |
| GET /products/getAll | admin → 200, plain array | ✅ |
| GET /products/getGroup/:uid | admin → 200, plain array | ✅ |

> **Bugs fixed:**
> - `Create Product`: fake author UID replaced with `{{newProfessorId}}`; broken base64 replaced with `TEST_BASE64`; `json.status` assertion removed (service returns `{ uid, photos }` not status).
> - `Get Gallery Home`, `Get Products by Author`, `Get All Products`, `Get Products by Group`: were asserting `json.data` — all return plain arrays from `findMany`.
> - `Approve Many`: `json.approved` → `json.count` (`updateMany` returns `{ count: N }`).
> - `Update Product`: `json.name` → `json.uid` (service returns `{ uid }` only).
> - **New:** 404 test for `GET /products/get/:uid`; professor access test for `GET /products/getGroup/:uid`.

---

## Institutions ✅ Complete

| Endpoint | Test case | Status |
|---|---|---|
| POST /institutions | happy path → 201, captures institutionId | ✅ |
| POST /institutions | duplicate slug → 409 | ✅ |
| GET /institutions/:slug | auth → 200, slug matches | ✅ |
| PATCH /institutions/:id | rector + X-Institution-Slug → 200, uid | ✅ |
| POST /institutions/:id/invitations | rector → 201, captures invitationToken | ✅ |
| GET /invitations/:token | auth → 200, has token | ✅ |
| POST /invitations/:token/respond | professor accept → 201, status ACCEPTED | ✅ |
| POST /invitations/:token/respond | double respond → 400 | ✅ |
| GET /institutions/:id/invitations | rector → 200, ≥1 item | ✅ |

> **Flow note:** rector credentials (`rectorMail`/`rectorPassword`) are static in env and must match the body of POST /institutions. Institution slug `test-inst-api` is hardcoded in the test.
> ⚠️ Super_admin endpoints (POST /categories, GET /content-requests, PATCH /content-requests/:id/review) not tested — no super_admin user with credentials seeded.

---

## Categories ✅ Partial

| Endpoint | Test case | Status |
|---|---|---|
| GET /categories | public → 200, array, captures categoryId | ✅ |
| POST /content-requests | rector + X-Institution-Slug → 201, captures contentRequestId | ✅ |
| GET /content-requests/mine | rector → 200, ≥1 item | ✅ |
| POST /content-requests | institutional role → 403 | ✅ |
| POST /categories | super_admin → ⚠️ not tested (no super_admin credentials) | ⚠️ |
| PATCH /categories/:id | super_admin → ⚠️ not tested | ⚠️ |
| GET /content-requests | super_admin → ⚠️ not tested | ⚠️ |
| PATCH /content-requests/:id/review | super_admin → ⚠️ not tested | ⚠️ |

---

## Styles ✅ Complete

| Endpoint | Test case | Status |
|---|---|---|
| GET /styles/all | public → 200, array | ✅ |
| GET /styles/all/:categoryId | public → 200, array (uses `{{categoryId}}` UUID) | ✅ |
| POST /styles/create | professor → 201, has uid (body uses `categoryId` UUID) | ✅ |
| GET /styles/get/:uid | public → 200, uid matches | ✅ |
| PUT /styles/update/:uid | professor → 200, has uid | ✅ |
| DELETE /styles/delete/:uid | professor → 403 | ✅ |
| DELETE /styles/delete/:uid | admin → 200 | ✅ |
| GET /styles/get/:uid | 404 after delete | ✅ |

> **Multitenant breaking change fixed:** `GET /styles/all/:category` — param changed from enum (ARTES) to UUID `{{categoryId}}`; `POST /styles/create` body field `category` → `categoryId` (UUID).

---

## Events ✅ Complete

| Endpoint | Test case | Status |
|---|---|---|
| GET /events/upcoming | public → 200, data array | ✅ |
| GET /events/past | public → 200, data array | ✅ |
| GET /events/home | public → 200, data array | ✅ |
| GET /events/getByGroup/:uid | public → 200, data array | ✅ |
| GET /events/available-products/:groupId | professor → 200, array | ✅ |
| POST /events/create | professor → 201, status PENDING | ✅ |
| GET /events/get/:uid | public → 200, uid matches | ✅ |
| PUT /events/update/:uid | professor → 200, back to PENDING | ✅ |
| PUT /events/:uid/products | professor → 200 | ✅ |
| GET /events/invitations/pending | professor → 200, array | ✅ |
| GET /events/getAll | admin → 200, data array | ✅ |
| PATCH /events/status/:uid | APPROVED → 200, status APPROVED | ✅ |
| PATCH /events/status/:uid | CANCELLED without feedback → 400 | ✅ |
| POST /events/:uid/invite | admin → 200/201 | ✅ |
| DELETE /events/:uid/invite/:groupId | admin → 200 | ✅ |
| PATCH /events/deactivate/:uid | admin → 200 | ✅ |

> **Bugs fixed:**
> - `Create Event`: `createdById` was hardcoded fake UID → replaced with `{{newProfessorId}}`.
> - `Get Pending Invitations`: `profesorId` query param was hardcoded fake UID → replaced with `{{newProfessorId}}`.

---

## Classes ✅ Complete

| Endpoint | Test case | Status |
|---|---|---|
| POST /classes/create | professor → 201, has uid | ✅ |
| GET /classes/group/:uid | professor → 200, array | ✅ |
| GET /classes/group/:uid | with date filter → 200, array | ✅ |
| GET /classes/current/:groupId | → 200, object with active boolean | ✅ |
| PATCH /classes/:uid/topic | professor → 200, topic updated | ✅ |
| GET /classes/:uid/attendance | professor → 200, array | ✅ |
| POST /classes/attend | student → 201 (active) / 403 (not active) / 409 (duplicate) | ✅ |
| POST /classes/create | student → 403 | ✅ |
| GET /classes/:uid/attendance | admin → 200, array | ✅ |

> **Bugs fixed:**
> - `Create Class`: asserted `json.date` but service uses `select: { uid: true }` → returns `{ uid }` only. Removed `date` assertion.
> - `Attend Class`: expected `[201, 400]` but `ForbiddenException` is 403 (not active) and `ConflictException` is 409 (duplicate). Fixed to `[201, 403, 409]`.

---

## Schedule ✅ Complete

| Endpoint | Test case | Status |
|---|---|---|
| POST /schedule/create | professor → 201, has uid | ✅ |
| GET /schedule/group/:uid | professor → 200, array, ≥1 item | ✅ |
| PUT /schedule/:uid | professor → 200, dayOfWeek + startTime updated | ✅ |
| DELETE /schedule/:uid | professor → 200 | ✅ |
| GET /schedule/group/:uid | after delete → 200, array | ✅ |
| POST /schedule/create | student → 403 | ✅ |
| GET /schedule/group/:uid | student → 403 | ✅ |

> **Bugs fixed:**
> - `Create Schedule`: asserted `json.dayOfWeek` and `json.startTime` but service uses `select: { uid: true }` → returns `{ uid }` only. Removed those assertions.

---

## Lessons + Chapters ✅ Complete

40 requests, **40/40 en verde** contra el stack aislado (2026-08-22). Los 20 endpoints de `LessonController` y los 7 de `ChapterController`.

El autor es el **rector**: `@RequireContextRole('rector','coordinator','institutional')` lo deja
crear, y además es quien revisa. Eso permite caminar el ciclo entero sin depender del flujo de
invitación de un docente a la institución que Institutions crea en cada corrida.

Depende de `groupId` e `institutionSlug`, así que el folder va **después de Groups**.

| Endpoint | Test case | Status |
|---|---|---|
| POST /lessons/create | rector → 201, nace en DRAFT, isPublic false | ✅ |
| POST /lessons/create | sin título → 400 | ✅ |
| POST /lessons/create | **sin `X-Institution-Slug` → 400** | ✅ |
| POST /lessons/create | estudiante → 403/400 | ✅ |
| GET /lessons/get/:uid | → 200, misma lección | ✅ |
| GET /lessons/get/:uid | uid inexistente → 404 | ✅ |
| GET /lessons/get | rector → 200, array | ✅ |
| GET /lessons/mine | → 200, incluye la creada | ✅ |
| POST /lessons/:id/chapters | ×3 → 201, sequence 1, 2, 3 | ✅ |
| GET /lessons/:id/chapters | → 200, secuencia contigua, trae `completed` | ✅ |
| GET /lessons/:id/chapters/:uid | → 200, `prevUid`/`nextUid` del backend | ✅ |
| GET /lessons/:otra/chapters/:uid | **→ 404, el capítulo tiene que ser de ESA lección** | ✅ |
| PATCH .../chapters/reorder | → 200, reescribe 1..N | ✅ |
| DELETE .../chapters/:uid | → 200 y **recompacta** a 1,2 | ✅ |
| POST /lessons/:id/submit | → PENDING | ✅ |
| PATCH /lessons/:id/review | rechazar → REJECTED + feedback | ✅ |
| POST /lessons/:id/submit | tras rechazo → PENDING | ✅ |
| PATCH /lessons/:id/review | aprobar → APPROVED | ✅ |
| PUT /lessons/update/:uid | **⚠ editar una APPROVED → PENDING, isPublic false, globalStatus null** | ✅ |
| PUT .../chapters/:uid | **⚠ editar un capítulo también la devuelve a la cola** | ✅ |
| POST /lessons/:id/submit-global | → globalStatus PENDING | ✅ |
| GET /lessons/admin | super_admin, **sin header de institución** → 200 | ✅ |
| GET /lessons/admin/:uid | **⚠ lee una lección que todavía NO es pública** | ✅ |
| GET /lessons/admin/:uid/chapters | → 200, array | ✅ |
| PATCH /lessons/admin/:uid/review | aprobar → globalStatus APPROVED **e isPublic true** | ✅ |
| GET /lessons/catalog | estudiante, sin tenant → 200, contiene la lección | ✅ |
| POST /lessons/:id/unpublish | → isPublic false | ✅ |
| DELETE /lessons/delete/:uid | → 200, y el GET siguiente da 404 | ✅ |

> **Los tres casos marcados ⚠ son la razón de que esta suite exista.** Jest ya los cubre con mocks
> (`Lesson.review-reset.spec.ts`, `Lesson.admin-read.spec.ts`), pero acá se ejercitan con el header
> `X-Institution-Slug` real, la cookie HttpOnly real y el orden real de los guards. Si el reseteo a
> revisión falla, hay contenido sin revisar visible en **todas** las instituciones, porque `isPublic`
> es la condición que autoriza la lectura cross-tenant del catálogo.

> El primer capítulo manda a propósito un `contentMd` con un separador `---` y un bloque de código
> con `/* */`: sin la exclusión de `contentmd` en `EXCLUDED_FIELDS` del `SqlInjectionGuard`, eso
> devuelve 403 sobre contenido legítimo.

---

## Deuda conocida de esta colección

- **`docker-compose.test.yml` no aísla nada.** Los comentarios dicen "puerto diferente" y "3001",
  pero mapea `3000:3000` y `5432:5432` — **los mismos puertos que dev**. Levantarlo choca con el
  stack de desarrollo. Hasta que se corrija, `bun run test:api` escribe en la base de desarrollo.
- **`POST /user/professor` ya no existe** y la colección le pegaba tres veces. Reemplazado por
  `POST /user/create`, que toma el uid del JWT: ahora el usuario nuevo se loguea y crea su propio
  perfil. Sigue publicando `createdUserId` y `newProfessorId`, de los que dependen Groups, Products
  y Events.
- El viejo caso *"403 for professor"* probaba un guard de admin que se eliminó. La regla que sí rige
  hoy es que el endpoint exige sesión, y eso es lo que se prueba ahora (`401 sin sesión`).

---

## Cómo correr la suite aislada (2026-08-22)

```bash
# 1. Stack de test, en su PROPIO proyecto de Compose
docker-compose -f docker-compose.test.yml up -d     # backend 3001, db 5433

# 2. Migrar y sembrar
docker exec backend_test sh -c "cd /app && bun run prisma:migrate:prod"
docker exec backend_test sh -c "cd /app && bun run prisma:seed:static"

# 3. Las dos cuentas que la semilla NO crea (ver abajo)
curl -X POST http://localhost:3001/auth/register -H "Content-Type: application/json" \
  -d '{"mail":"professor@gmail.com","password":"qweasdRF123"}'
curl -X POST http://localhost:3001/auth/register -H "Content-Type: application/json" \
  -d '{"mail":"student@gmail.com","password":"Student@1234!"}'

# 4. Correr
npx newman run ./postman/collections/server-api/collection.json \
  --environment ./postman/environments/testing.env.json \
  --env-var baseUrl=http://localhost:3001
```

> `bun run test:api` sigue apuntando a **3000**, o sea a la base de desarrollo. Para el stack
> aislado hay que pasar `--env-var baseUrl=http://localhost:3001`, como arriba.

---

## Estado real de la corrida — 2026-08-22, stack aislado, base limpia

**188 requests · 310 aserciones · 133 fallando.**

| Carpeta | Fallas | Primera falla (todo lo demás es cascada) |
|---|---|---|
| **Lessons** | **0** | — |
| Photos | 3 | |
| Auth | 3 | `Login (professor)` espera `hasProfile`/`hasGroup`; el usuario recién registrado no tiene perfil |
| Institutions | 8 | `Create Invitation` → 400 |
| User | 15 | `Get All Active Users (admin)` → 400: pide `X-Institution-Slug` y User corre **antes** que Institutions, así que `institutionSlug` está vacío |
| Products | 15 | `Create Product (professor)` → 400 |
| Classes | 15 | `Create Class (professor)` → 400 |
| Schedule | 13 | `Create Schedule (professor)` → 400 |
| Styles | 9 | `Create Style (professor)` → 400 |
| Events | 25 | `Get Upcoming Events (public)` → no devuelve array |
| Groups | 27 | `Create Group` → 403 |

**Ninguna de esas 133 es de Lessons.** Son deuda anterior: la colección se escribió contra una base
de desarrollo poblada a mano y nunca se volvió a correr desde cero. Los tres patrones son:

1. **Fixtures que la semilla no crea.** `professor@gmail.com` y `student@gmail.com` no salen de
   `seed.static.ts` — solo sale `admin@gmail.com`. Sin ellos, `Login (professor)` da 401 y se cae
   media colección. Lo correcto sería que la colección los registre en el folder de Auth.
2. **Orden de carpetas.** `User` usa `{{institutionSlug}}`, que recién lo publica `Institutions`.
   En una base limpia, User corre con el slug vacío y da 400.
3. **Contratos que cambiaron.** Ya corregidos: `POST /user/professor` (eliminado) y `planSlug` en
   `POST /institutions` (el plan pasó a ser un paso aparte del onboarding). Quedan más del mismo
   tipo en Groups, Products, Styles, Classes y Schedule.

---

## Hallazgo: la baja de una lección no la esconde de la lectura directa

`deactivateLesson` hace `isActive: false`, y todos los **listados** filtran `isActive: true`. Pero
`GET /lessons/get/:uid` pasa por `findInTenant`, que es un `findUnique({ where: { uid } })` **sin
filtrar `isActive`**: quien ya tenga el uid y esté en el mismo tenant sigue leyendo una lección dada
de baja.

No es fuga cross-tenant. Pero tampoco es lo que "eliminar" sugiere. El caso de la suite asserta la
garantía que **sí** rige —que sale de los listados— y deja el resto anotado acá en vez de fingir que
la lectura directa da 404.
