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
