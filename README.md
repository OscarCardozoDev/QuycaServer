
# Quyca — Backend

Backend API para la plataforma de gestión de galería de arte de la Universidad Santo Tomás (Tunja).

**Stack:** NestJS · Bun · PostgreSQL · Prisma · Docker

---

## Tabla de Contenidos

1. [Requisitos Previos](#requisitos-previos)
2. [Instalación](#instalación)
3. [Configuración](#configuración)
4. [Base de Datos](#base-de-datos)
5. [Autenticación y Roles](#autenticación-y-roles)
6. [Endpoints](#endpoints)
7. [Swagger](#swagger)
8. [Docker](#docker)

---

## Requisitos Previos

- **Bun** v1.0+
- **PostgreSQL** v12+
- **Docker** (opcional)

---

## Instalación

```bash
git clone https://github.com/OscarCardozoDev/UstaGalleryServer.git
cd UstaGalleryServer/server
bun install
bun run start:dev        # dev con hot reload, puerto 3000
```

Para producción:

```bash
bun run build
bun run start:prod
```

---

## Configuración

Variables en `server/env/development.env` (desarrollo) o `server/env/production.env` (producción):

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión PostgreSQL |
| `JWT_SECRET` | Secreto para firmar JWT |
| `CORS_URL_FRONT` | Origen permitido por CORS |
| `ID_STUDENT` | UUID del UserType estudiante |
| `ID_PROFESSOR` | UUID del UserType profesor |
| `ID_ADMIN` | UUID del UserType admin |
| `SEMESTER_END_DATE` | Fecha fin de semestre (`YYYY-MM-DD`) — limita generación de clases |

---

## Base de Datos

```bash
# Crear y aplicar migración (dev)
bun run prisma:migrate:dev -- <nombre>

# Aplicar migraciones pendientes (prod)
bun run prisma:migrate:prod

# Seed inicial (UserTypes, usuarios por defecto, un grupo)
bun run prisma:seed:static
```

## Autenticación y Roles

- JWT almacenado en cookie `HttpOnly` (`access_token`). No se usa header Bearer.
- Flujo: `POST /auth/register` → `POST /auth/login` (fija la cookie) → peticiones autenticadas.
- `Credentials` y `Users` son tablas separadas con el mismo UUID de PK.

| Rol | Permisos |
|---|---|
| **admin** | Acceso completo |
| **professor** | Gestión de grupo, obras, eventos y horarios |
| **student** | Crear obras y registrar asistencia |
| *(sin auth)* | Lectura de galería, eventos públicos e info de autores |

---

## Endpoints

### Autenticación — `/auth`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/auth/login` | — | Iniciar sesión |
| `POST` | `/auth/register` | — | Registrar cuenta |
| `POST` | `/auth/logout` | — | Cerrar sesión |
| `POST` | `/auth/send-code` | ✓ | Enviar código de verificación por email |
| `POST` | `/auth/verify-code` | ✓ | Verificar código de email |
| `GET` | `/auth/without-profile` | admin | Credenciales sin perfil creado |

### Usuarios — `/user`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/user/create` | ✓ | Crear perfil de estudiante |
| `POST` | `/user/professor` | admin | Crear perfil de profesor |
| `GET` | `/user/me` | ✓ | Usuario actual |
| `GET` | `/user/allActive` | admin / professor | Todos los usuarios activos |
| `GET` | `/user/author/:uid` | — | Info pública del autor |
| `GET` | `/user/:uid` | — | Usuario por UID |
| `PUT` | `/user/update` | student / professor | Actualizar perfil propio |
| `PUT` | `/user/:uid` | admin | Actualizar usuario por UID |
| `PATCH` | `/user/photo` | student / professor | Cambiar foto propia |
| `PATCH` | `/user/:uid/photo` | admin | Cambiar foto por UID |
| `PATCH` | `/user/deactivate` | ✓ | Desactivar cuenta propia |
| `PATCH` | `/user/:uid/deactivate` | admin | Desactivar usuario por UID |
| `PATCH` | `/user/:uid/reactivate` | admin | Reactivar usuario |

### Estilos Artísticos — `/styles`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/styles/all` | — | Todos los estilos |
| `GET` | `/styles/all/:category` | — | Estilos por categoría (`ARTES`, `TEATRO`, `DANZAS`, `MUSICA`, `CANTO`) |
| `GET` | `/styles/get/:uid` | — | Estilo por UID |
| `POST` | `/styles/create` | admin / professor | Crear estilo |
| `PUT` | `/styles/update/:uid` | admin / professor | Actualizar estilo |
| `DELETE` | `/styles/delete/:uid` | admin | Eliminar estilo |

### Grupos — `/groups`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/groups/create` | admin | Crear grupo |
| `GET` | `/groups/get` | ✓ | Todos los grupos |
| `GET` | `/groups/get/:uid` | ✓ | Grupo por UID |
| `PUT` | `/groups/update/:uid` | admin | Actualizar grupo |
| `DELETE` | `/groups/delete/:uid` | admin | Eliminar grupo |
| `PATCH` | `/groups/change-profesor/:uid` | admin | Cambiar profesor asignado |
| `POST` | `/groups/student/add` | ✓ | Agregar estudiante a grupo(s) |
| `GET` | `/groups/student/get/:groupId` | ✓ | Estudiantes del grupo |
| `PUT` | `/groups/student/update/:groupId` | admin / professor | Reemplazar lista de estudiantes |
| `DELETE` | `/groups/student/delete/:groupId` | admin / professor | Quitar un estudiante |
| `DELETE` | `/groups/student/deleteAll/:groupId` | admin | Quitar todos los estudiantes |

### Fotos — `/photos`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/photos/get/:uid` | — | Obtener foto |
| `POST` | `/photos/create` | — | Crear foto |
| `PUT` | `/photos/edit/:uid` | — | Actualizar foto |

### Obras — `/products`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/products/create` | student / professor | Crear obra |
| `GET` | `/products/getAll` | admin | Todas las obras paginadas |
| `GET` | `/products/getGalleryHome` | — | Obras aprobadas para galería home |
| `GET` | `/products/getGroup/:uid` | admin / professor | Obras por grupo |
| `GET` | `/products/getAuthor/:uid` | — | Obras por autor |
| `GET` | `/products/get/:uid` | — | Obra por UID |
| `PUT` | `/products/approveMany` | professor | Aprobar varias obras a la vez |
| `PATCH` | `/products/status/:uid` | professor | Aprobar o rechazar una obra |
| `PUT` | `/products/update/:uid` | student / professor | Actualizar obra |

### Eventos — `/events`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/events/create` | professor / admin | Crear evento |
| `GET` | `/events/getAll` | admin | Todos los eventos paginados |
| `GET` | `/events/upcoming` | — | Eventos próximos aprobados |
| `GET` | `/events/past` | — | Eventos pasados completados |
| `GET` | `/events/home` | — | Eventos para página de inicio |
| `GET` | `/events/getByGroup/:uid` | — | Eventos de un grupo |
| `GET` | `/events/available-products/:groupId` | professor / admin | Obras disponibles para el evento |
| `GET` | `/events/invitations/pending` | professor / admin | Invitaciones pendientes |
| `GET` | `/events/get/:uid` | — | Detalle completo del evento |
| `PUT` | `/events/update/:uid` | professor / admin | Editar evento (vuelve a PENDING) |
| `PATCH` | `/events/status/:uid` | admin | Cambiar status del evento |
| `PATCH` | `/events/deactivate/:uid` | admin | Desactivar evento (soft delete) |
| `PUT` | `/events/:uid/products` | professor / admin | Actualizar obras del evento |
| `POST` | `/events/:uid/photos` | professor / admin | Agregar foto al evento |
| `DELETE` | `/events/:uid/photos/:photoId` | professor / admin | Eliminar foto del evento |
| `POST` | `/events/:uid/invite` | professor / admin | Invitar grupo al evento |
| `PATCH` | `/events/invitations/:uid/respond` | professor | Aceptar o rechazar invitación |
| `DELETE` | `/events/:uid/invite/:groupId` | professor / admin | Revocar invitación |
| `DELETE` | `/events/:uid/groups/:groupId` | professor / admin | Quitar grupo del evento |

### Horarios — `/schedule`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/schedule/create` | professor / admin | Crear horario (genera clases hasta fin de semestre) |
| `GET` | `/schedule/group/:groupId` | ✓ | Horarios activos del grupo |
| `PUT` | `/schedule/:uid` | professor / admin | Actualizar horario y regenerar clases futuras |
| `DELETE` | `/schedule/:uid` | professor / admin | Desactivar horario y eliminar clases futuras sin asistencia |

### Clases — `/classes`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/classes/create` | professor / admin | Crear clase manual |
| `POST` | `/classes/attend` | student | Registrar asistencia |
| `GET` | `/classes/group/:groupId` | ✓ | Sesiones del grupo (con filtros `from`/`to`) |
| `GET` | `/classes/current/:groupId` | ✓ | Clase activa en este momento |
| `GET` | `/classes/:uid/attendance` | professor / admin | Lista de asistencia de una clase |
| `PATCH` | `/classes/:uid/topic` | professor / admin | Actualizar temática o reseña |

---

## Swagger

Documentación interactiva disponible en:

```
http://localhost:3000/api-docs
```

JSON para generación de tipos:

```
http://localhost:3000/api-docs-json
```

---

## Docker

```bash
# Desarrollo (db + backend + frontend, puerto 3000)
docker-compose -f docker-compose.dev.yml up -d

# Entorno de pruebas aislado (db en 5433, backend en 3001)
docker-compose -f docker-compose.test.yml up -d

# Producción
docker-compose -f docker-compose.prod.yml up -d
```

---

**Versión:** 1.0.0 · **Runtime:** Bun v1.0+ · **Última actualización:** 2026-05-05