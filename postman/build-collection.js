// server/postman/build-collection.js
// Run: node postman/build-collection.js
// Outputs: postman/collections/server-api/collection.json

const fs = require('fs');
const path = require('path');

const TEST_BASE64 = fs.readFileSync(
  path.join(__dirname, '..', '..', 'docs', 'testBase64.txt'),
  'utf-8',
).trim();

// ─── Helpers ────────────────────────────────────────────────────────────────

function jsonHeader() {
  return [{ key: 'Content-Type', value: 'application/json' }];
}

function tenantHeaders() {
  return [
    { key: 'Content-Type', value: 'application/json' },
    { key: 'X-Institution-Slug', value: '{{institutionSlug}}' },
  ];
}

function tenantHeader() {
  return [{ key: 'X-Institution-Slug', value: '{{institutionSlug}}' }];
}

function makeUrl(raw) {
  return raw; // Newman requires plain string URL, not { raw } object
}

function makeBody(obj) {
  return {
    mode: 'raw',
    raw: JSON.stringify(obj, null, 2),
    options: { raw: { language: 'json' } },
  };
}

function makeItem({ name, method, url, headers = [], body = null, tests = [], preRequest = [] }) {
  const item = {
    name,
    request: {
      method,
      header: headers,
      url: makeUrl(url),
    },
    event: [],
  };
  if (body !== null) item.request.body = makeBody(body);
  if (preRequest.length) {
    item.event.push({ listen: 'prerequest', script: { exec: preRequest, type: 'text/javascript' } });
  }
  if (tests.length) {
    item.event.push({ listen: 'test', script: { exec: tests, type: 'text/javascript' } });
  }
  return item;
}

function loginRequest(role) {
  const label = role.charAt(0).toUpperCase() + role.slice(1);
  return makeItem({
    name: `🔐 Login as ${label}`,
    method: 'POST',
    url: '{{baseUrl}}/auth/login',
    headers: jsonHeader(),
    body: { mail: `{{${role}Mail}}`, password: `{{${role}Password}}` },
    tests: [
      "pm.test('Login OK', () => pm.response.to.have.status(201));",
    ],
  });
}

const TINY_BASE64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUEB//EAB8QAAIBBAMBAAAAAAAAAAAAAAECAwQFERIhMf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCw1mozLsuoKMKOp06UrqWt5G7SMi6oifdKj9IqpuAAAAAAAAAAAAB//9k=';

// ─── AUTH MODULE ─────────────────────────────────────────────────────────────

const authFolder = {
  name: 'Auth',
  item: [
    makeItem({
      name: 'Register',
      method: 'POST',
      url: '{{baseUrl}}/auth/register',
      headers: jsonHeader(),
      body: { mail: '{{newUserMail}}', password: '{{newUserPassword}}' },
      preRequest: [
        "pm.environment.set('newUserMail', 'test_' + Date.now() + '@usantoto.edu.co');",
      ],
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "const json = pm.response.json();",
        "pm.test('Has message', () => pm.expect(json.message).to.be.a('string'));",
      ],
    }),
    makeItem({
      name: 'Register - duplicate email returns 409',
      method: 'POST',
      url: '{{baseUrl}}/auth/register',
      headers: jsonHeader(),
      body: { mail: '{{newUserMail}}', password: '{{newUserPassword}}' },
      tests: [
        "pm.test('Status 409/500 on duplicate', () => pm.expect(pm.response.code).to.be.oneOf([409, 500]));",
      ],
    }),
    makeItem({
      name: 'Login (professor)',
      method: 'POST',
      url: '{{baseUrl}}/auth/login',
      headers: jsonHeader(),
      body: { mail: '{{professorMail}}', password: '{{professorPassword}}' },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "const json = pm.response.json();",
        "pm.test('Has message', () => pm.expect(json.message).to.equal('Login successful'));",
        "pm.test('hasProfile is boolean', () => pm.expect(json.hasProfile).to.be.a('boolean'));",
        "pm.test('hasGroup is boolean', () => pm.expect(json.hasGroup).to.be.a('boolean'));",
      ],
    }),
    makeItem({
      name: 'Login - wrong password returns 401',
      method: 'POST',
      url: '{{baseUrl}}/auth/login',
      headers: jsonHeader(),
      body: { mail: '{{professorMail}}', password: 'WrongPassword1!' },
      tests: [
        "pm.test('Status 401 on bad password', () => pm.response.to.have.status(401));",
      ],
    }),
    makeItem({
      name: 'Login - unknown email returns 401',
      method: 'POST',
      url: '{{baseUrl}}/auth/login',
      headers: jsonHeader(),
      body: { mail: 'nobody@nowhere.com', password: 'Test@1234!' },
      tests: [
        "pm.test('Status 401 on unknown email', () => pm.response.to.have.status(401));",
      ],
    }),
    makeItem({
      name: 'Logout',
      method: 'POST',
      url: '{{baseUrl}}/auth/logout',
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "const json = pm.response.json();",
        "pm.test('Has logout message', () => pm.expect(json.message).to.be.a('string'));",
      ],
    }),
    loginRequest('professor'),
    makeItem({
      name: 'Send Verification Code (professor)',
      method: 'POST',
      url: '{{baseUrl}}/auth/send-code',
      tests: [
        // Requires Resend email service configured in env — will return 500 if not set
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "pm.test('Has message', () => pm.expect(pm.response.json().message).to.be.a('string'));",
      ],
    }),
    makeItem({
      name: 'Verify Code - invalid format returns 400',
      method: 'POST',
      url: '{{baseUrl}}/auth/verify-code',
      headers: jsonHeader(),
      body: { code: 'abc' },
      tests: [
        "pm.test('Status 400 on invalid format', () => pm.response.to.have.status(400));",
      ],
    }),
    makeItem({
      name: 'Verify Code - wrong code returns 400',
      method: 'POST',
      url: '{{baseUrl}}/auth/verify-code',
      headers: jsonHeader(),
      body: { code: '000000' },
      tests: [
        "pm.test('Status 400 on wrong code', () => pm.response.to.have.status(400));",
      ],
    }),
    loginRequest('admin'),
    makeItem({
      name: 'Get Without Profile (admin)',
      method: 'GET',
      url: '{{baseUrl}}/auth/without-profile',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "const arr = pm.response.json();",
        "pm.test('Returns array', () => pm.expect(arr).to.be.an('array'));",
        "const newUser = arr.find(u => u.mail === pm.environment.get('newUserMail'));",
        "if (newUser) pm.environment.set('newUserId', newUser.uid);",
      ],
    }),
    loginRequest('professor'),
    makeItem({
      name: 'Get Without Profile - 403 for professor',
      method: 'GET',
      url: '{{baseUrl}}/auth/without-profile',
      tests: [
        "pm.test('Status 403', () => pm.response.to.have.status(403));",
      ],
    }),
  ],
};

// ─── USER MODULE ─────────────────────────────────────────────────────────────

const userFolder = {
  name: 'User',
  item: [
    // ── El perfil lo crea su dueño, no el admin ────────────────────────────────
    //
    // `POST /user/professor` ya NO existe: se eliminó cuando los profesores
    // pasaron a invitación (`POST /institutions/...`). El reemplazo es
    // `POST /user/create`, que toma el uid del JWT (@CurrentUser) y no del
    // body — o sea que el usuario tiene que estar logueado como sí mismo.
    //
    // Sigue publicando `createdUserId` y `newProfessorId`, que son de los que
    // dependen Groups, Products y Events más abajo.
    makeItem({
      name: '🔐 Login as New User',
      method: 'POST', url: '{{baseUrl}}/auth/login',
      headers: jsonHeader(),
      body: { mail: '{{newUserMail}}', password: '{{newUserPassword}}' },
      tests: ["pm.test('Login OK', () => pm.response.to.have.status(201));"],
    }),
    makeItem({
      name: 'Create Own Profile (new user)',
      method: 'POST',
      url: '{{baseUrl}}/user/create',
      headers: jsonHeader(),
      preRequest: [
        "pm.environment.set('professorUsername', 'prof_api_' + Date.now());",
      ],
      body: {
        name: 'Nuevo',
        lastName: 'Profesor',
        username: '{{professorUsername}}',
        description: 'Profesor de prueba',
        gender: 'M',
        telNumber: '3001234567',
        roleData: { career: 'Artes', semester: '1' },
      },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "const json = pm.response.json();",
        "pm.test('Has uid', () => pm.expect(json.uid).to.be.a('string'));",
        "pm.environment.set('createdUserId', json.uid);",
        "pm.environment.set('newProfessorId', json.uid);",
      ],
    }),
    makeItem({
      name: 'Create Own Profile - segunda vez devuelve 400/409',
      method: 'POST', url: '{{baseUrl}}/user/create',
      headers: jsonHeader(),
      body: {
        name: 'Nuevo', lastName: 'Profesor', username: 'dupe_prof_api_001',
        gender: 'M', telNumber: '3000000001',
        roleData: { career: 'Artes', semester: '1' },
      },
      tests: [
        "pm.test('Ya tiene perfil', () => pm.expect(pm.response.code).to.be.oneOf([400, 409]));",
      ],
    }),
    // ── Admin ──────────────────────────────────────────────────────────────────
    loginRequest('admin'),
    makeItem({
      name: 'Get All Active Users (admin)',
      method: 'GET', url: '{{baseUrl}}/user/allActive',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
    makeItem({
      name: 'Get Me (admin)',
      method: 'GET', url: '{{baseUrl}}/user/me',
      tests: ["pm.test('Status 200', () => pm.response.to.have.status(200));"],
    }),
    makeItem({
      name: 'Get Author Info (public)',
      method: 'GET', url: '{{baseUrl}}/user/author/{{createdUserId}}',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has name', () => pm.expect(pm.response.json().name).to.be.a('string'));",
      ],
    }),
    makeItem({
      name: 'Get User by UID (public)',
      method: 'GET', url: '{{baseUrl}}/user/{{createdUserId}}',
      tests: ["pm.test('Status 200', () => pm.response.to.have.status(200));"],
    }),
    makeItem({
      name: 'Get User by UID - 404',
      method: 'GET', url: '{{baseUrl}}/user/00000000-0000-0000-0000-000000000000',
      tests: ["pm.test('Status 404', () => pm.response.to.have.status(404));"],
    }),
    makeItem({
      name: 'Update User by UID (admin)',
      method: 'PUT', url: '{{baseUrl}}/user/{{createdUserId}}',
      headers: jsonHeader(), body: { name: 'ProfesorActualizado', lastName: 'Test' },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has uid', () => pm.expect(pm.response.json().uid).to.be.a('string'));",
      ],
    }),
    makeItem({
      name: 'Update User Photo by UID (admin)',
      method: 'PATCH', url: '{{baseUrl}}/user/{{createdUserId}}/photo',
      headers: jsonHeader(),
      body: { base64: TINY_BASE64, name: 'foto-profesor.jpg', folder: 'users' },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has uid', () => pm.expect(pm.response.json().uid).to.be.a('string'));",
      ],
    }),
    makeItem({
      name: 'Deactivate User by UID (admin)',
      method: 'PATCH', url: '{{baseUrl}}/user/{{createdUserId}}/deactivate',
      tests: ["pm.test('Status 200', () => pm.response.to.have.status(200));"],
    }),
    makeItem({
      name: 'Reactivate User by UID (admin)',
      method: 'PATCH', url: '{{baseUrl}}/user/{{createdUserId}}/reactivate',
      tests: ["pm.test('Status 200', () => pm.response.to.have.status(200));"],
    }),
    makeItem({
      name: 'Create Student Profile - 400 for admin (already has profile)',
      method: 'POST', url: '{{baseUrl}}/user/create',
      headers: jsonHeader(),
      body: { name: 'X', lastName: 'Y', username: 'xy_001', gender: 'M', telNumber: '3000000002', roleId: '00000000-0000-0000-0000-000000000010', roleData: {} },
      tests: [
        "pm.test('Status 400 — admin already has profile', () => pm.expect(pm.response.code).to.be.oneOf([400, 409]));",
      ],
    }),
    // El viejo caso "403 para el profesor" probaba un guard de admin que ya no
    // existe: `POST /user/create` lleva solo `AuthGuard`. La regla que SÍ rige
    // hoy es que exige sesión, así que eso es lo que se prueba.
    makeItem({
      name: 'Logout antes del caso sin sesión',
      method: 'POST', url: '{{baseUrl}}/auth/logout',
      tests: ["pm.test('Status 201', () => pm.response.to.have.status(201));"],
    }),
    makeItem({
      name: 'Create Profile - 401 sin sesión',
      method: 'POST', url: '{{baseUrl}}/user/create',
      headers: jsonHeader(),
      body: {
        name: 'X', lastName: 'Y', username: 'xy_002', gender: 'M',
        telNumber: '3000000003', roleData: { career: 'Artes', semester: '1' },
      },
      tests: ["pm.test('Status 401', () => pm.response.to.have.status(401));"],
    }),
    // ── Professor ──────────────────────────────────────────────────────────────
    loginRequest('professor'),
    makeItem({
      name: 'Update Current User (professor)',
      method: 'PUT', url: '{{baseUrl}}/user/update',
      headers: jsonHeader(), body: { name: 'Profesor', lastName: 'Actualizado' },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has uid', () => pm.expect(pm.response.json().uid).to.be.a('string'));",
      ],
    }),
    makeItem({
      name: 'Get All Active Users (professor)',
      method: 'GET', url: '{{baseUrl}}/user/allActive',
      tests: [
        "pm.test('Status 200 — professor has access', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
    makeItem({
      name: 'Update Current User Photo (professor)',
      method: 'PATCH', url: '{{baseUrl}}/user/photo',
      headers: jsonHeader(),
      body: { base64: TINY_BASE64, name: 'foto-self.jpg', folder: 'users' },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has uid', () => pm.expect(pm.response.json().uid).to.be.a('string'));",
      ],
    }),
    // ── Student ────────────────────────────────────────────────────────────────
    loginRequest('student'),
    makeItem({
      name: 'Deactivate Current User (student)',
      method: 'PATCH', url: '{{baseUrl}}/user/deactivate',
      tests: ["pm.test('Status 200', () => pm.response.to.have.status(200));"],
    }),
    loginRequest('admin'),
  ],
};

// ─── INSTITUTIONS MODULE ─────────────────────────────────────────────────────

const institutionsFolder = {
  name: 'Institutions',
  item: [
    makeItem({
      name: 'Create Institution (public)',
      method: 'POST', url: '{{baseUrl}}/institutions',
      headers: jsonHeader(),
      preRequest: [
        "var ts = Date.now();",
        "pm.environment.set('institutionSlug', 'test-inst-' + ts);",
        "pm.environment.set('rectorMail', 'rector_' + ts + '@quyca.com');",
        "pm.environment.set('rectorPassword', 'RectorTest@123!');",
      ],
      body: {
        name: 'Institución Test API',
        slug: '{{institutionSlug}}',
        type: 'EDUCATIONAL',
        representativeName: 'Rector',
        representativeLastName: 'Test',
        email: '{{rectorMail}}',
        password: '{{rectorPassword}}',
      },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "const json = pm.response.json();",
        "pm.test('Has uid', () => pm.expect(json.uid).to.be.a('string'));",
        "pm.environment.set('institutionId', json.uid);",
      ],
    }),
    makeItem({
      name: 'Create Institution - duplicate slug returns 409',
      method: 'POST', url: '{{baseUrl}}/institutions',
      headers: jsonHeader(),
      body: {
        name: 'Dup', slug: '{{institutionSlug}}', type: 'EDUCATIONAL',
        representativeName: 'X', representativeLastName: 'Y', email: 'dup@test.com', password: 'Test@1234!',
      },
      tests: [
        "pm.test('Status 409 on duplicate slug', () => pm.response.to.have.status(409));",
      ],
    }),
    makeItem({
      name: '🔐 Login as Rector',
      method: 'POST', url: '{{baseUrl}}/auth/login',
      headers: jsonHeader(),
      body: { mail: '{{rectorMail}}', password: '{{rectorPassword}}' },
      tests: [
        "pm.test('Rector login 201', () => pm.response.to.have.status(201));",
      ],
    }),
    makeItem({
      name: 'Get Institution by Slug (auth)',
      method: 'GET', url: '{{baseUrl}}/institutions/{{institutionSlug}}',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('slug matches', () => pm.expect(pm.response.json().slug).to.equal(pm.environment.get('institutionSlug')));",
      ],
    }),
    makeItem({
      name: 'Update Institution (rector)',
      method: 'PATCH', url: '{{baseUrl}}/institutions/{{institutionId}}',
      headers: tenantHeaders(),
      body: { name: 'Institución Test Actualizada' },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has uid', () => pm.expect(pm.response.json().uid).to.be.a('string'));",
      ],
    }),
    makeItem({
      name: 'Create Invitation (rector → professor)',
      method: 'POST', url: '{{baseUrl}}/institutions/{{institutionId}}/invitations',
      headers: tenantHeaders(),
      // Sin `expiresInDays`: la vigencia la fija el backend
      // (INVITATION_EXPIRY_DAYS) y el DTO corre con forbidNonWhitelisted,
      // así que mandarlo devuelve 400 y este request fallaba siempre.
      body: { toEmail: '{{professorMail}}', targetRole: 'institutional' },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "const json = pm.response.json();",
        "pm.test('Has token', () => pm.expect(json.token).to.be.a('string'));",
        "pm.environment.set('invitationToken', json.token);",
      ],
    }),
    makeItem({
      name: 'Get Invitation by Token (rector)',
      method: 'GET', url: '{{baseUrl}}/invitations/{{invitationToken}}',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has token', () => pm.expect(pm.response.json().token).to.be.a('string'));",
      ],
    }),
    loginRequest('professor'),
    makeItem({
      name: 'Respond to Invitation - Accept (professor)',
      method: 'POST', url: '{{baseUrl}}/invitations/{{invitationToken}}/respond',
      headers: jsonHeader(),
      body: { accept: true },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "const json = pm.response.json();",
        "pm.test('Status ACCEPTED', () => pm.expect(json.status).to.equal('ACCEPTED'));",
      ],
    }),
    makeItem({
      name: 'Respond to Invitation - already responded returns 400',
      method: 'POST', url: '{{baseUrl}}/invitations/{{invitationToken}}/respond',
      headers: jsonHeader(),
      body: { accept: true },
      tests: [
        "pm.test('Status 400 on double respond', () => pm.response.to.have.status(400));",
      ],
    }),
    makeItem({
      name: '🔐 Login as Rector (again)',
      method: 'POST', url: '{{baseUrl}}/auth/login',
      headers: jsonHeader(),
      body: { mail: '{{rectorMail}}', password: '{{rectorPassword}}' },
      tests: [
        "pm.test('Rector login 201', () => pm.response.to.have.status(201));",
      ],
    }),
    makeItem({
      name: 'Get Institution Invitations (rector)',
      method: 'GET', url: '{{baseUrl}}/institutions/{{institutionId}}/invitations',
      headers: tenantHeader(),
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
        "pm.test('Has ≥1 invitation', () => pm.expect(pm.response.json().length).to.be.at.least(1));",
      ],
    }),
  ],
};

// ─── CATEGORIES MODULE ────────────────────────────────────────────────────────

const categoriesFolder = {
  name: 'Categories',
  item: [
    makeItem({
      name: 'Get Active Categories (public)',
      method: 'GET', url: '{{baseUrl}}/categories',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "const arr = pm.response.json();",
        "pm.test('Returns array', () => pm.expect(arr).to.be.an('array'));",
        "pm.test('Has seeded categories', () => pm.expect(arr.length).to.be.at.least(1));",
        "if (arr.length > 0) pm.environment.set('categoryId', arr[0].uid);",
      ],
    }),
    // Rector creates a content request (tenant-scoped)
    makeItem({
      name: '🔐 Login as Rector (categories)',
      method: 'POST', url: '{{baseUrl}}/auth/login',
      headers: jsonHeader(),
      body: { mail: '{{rectorMail}}', password: '{{rectorPassword}}' },
      tests: [
        "pm.test('Rector login 201', () => pm.response.to.have.status(201));",
      ],
    }),
    makeItem({
      name: 'Create Content Request - CATEGORY (rector)',
      method: 'POST', url: '{{baseUrl}}/content-requests',
      headers: tenantHeaders(),
      body: {
        type: 'CATEGORY',
        requestedName: 'Fotografía',
        justification: 'Queremos agregar fotografía como nueva categoría',
      },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "const json = pm.response.json();",
        "pm.test('Has uid', () => pm.expect(json.uid).to.be.a('string'));",
        "pm.environment.set('contentRequestId', json.uid);",
      ],
    }),
    makeItem({
      name: 'Get My Content Requests (rector)',
      method: 'GET', url: '{{baseUrl}}/content-requests/mine',
      headers: tenantHeader(),
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
        "pm.test('Has ≥1 request', () => pm.expect(pm.response.json().length).to.be.at.least(1));",
      ],
    }),
    // Professor (institutional role) cannot create content requests (needs rector/coordinator)
    loginRequest('professor'),
    makeItem({
      name: 'Create Content Request - 403 for institutional role',
      method: 'POST', url: '{{baseUrl}}/content-requests',
      headers: tenantHeaders(),
      body: { type: 'CATEGORY', requestedName: 'No Permitido', justification: 'Test' },
      tests: [
        "pm.test('Status 403 for institutional role', () => pm.response.to.have.status(403));",
      ],
    }),
    // Restore rector session for Groups folder
    makeItem({
      name: '🔐 Login as Rector (restore)',
      method: 'POST', url: '{{baseUrl}}/auth/login',
      headers: jsonHeader(),
      body: { mail: '{{rectorMail}}', password: '{{rectorPassword}}' },
      tests: [
        "pm.test('Rector login 201', () => pm.response.to.have.status(201));",
      ],
    }),
  ],
};

// ─── GROUPS MODULE ────────────────────────────────────────────────────────────

const groupsFolder = {
  name: 'Groups',
  item: [
    // ── Rector: tenant-scoped create + list ───────────────────────────────────
    loginRequest('rector'),
    makeItem({
      name: 'Create Group',
      method: 'POST', url: '{{baseUrl}}/groups/create',
      headers: tenantHeaders(),
      body: {
        name: 'Grupo Test 2026',
        profesorId: '{{newProfessorId}}',
        institutionId: '{{institutionId}}',
        categoryId: '{{categoryId}}',
        users: [],
      },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "const json = pm.response.json();",
        "pm.test('Has uid', () => pm.expect(json.uid).to.be.a('string'));",
        "pm.environment.set('groupId', json.uid);",
      ],
    }),
    makeItem({
      name: 'Get All Groups',
      method: 'GET', url: '{{baseUrl}}/groups/get?page=1&limit=10',
      headers: tenantHeader(),
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
    // ── Admin: CRUD ────────────────────────────────────────────────────────────
    loginRequest('admin'),
    makeItem({
      name: 'Get Group by UID',
      method: 'GET', url: '{{baseUrl}}/groups/get/{{groupId}}',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('UID matches', () => pm.expect(pm.response.json().uid).to.equal(pm.environment.get('groupId')));",
      ],
    }),
    makeItem({
      name: 'Get Group by UID - 404',
      method: 'GET', url: '{{baseUrl}}/groups/get/00000000-0000-0000-0000-000000000000',
      tests: [
        "pm.test('Status 404', () => pm.response.to.have.status(404));",
      ],
    }),
    makeItem({
      name: 'Update Group',
      method: 'PUT', url: '{{baseUrl}}/groups/update/{{groupId}}',
      headers: jsonHeader(), body: { name: 'Grupo Test Actualizado 2026' },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has uid', () => pm.expect(pm.response.json().uid).to.be.a('string'));",
      ],
    }),
    makeItem({
      name: 'Change Group Profesor',
      method: 'PATCH', url: '{{baseUrl}}/groups/change-profesor/{{groupId}}',
      headers: jsonHeader(), body: { newProfesorId: '{{newProfessorId}}' },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has groupId', () => pm.expect(pm.response.json().groupId).to.be.a('string'));",
        "pm.test('Has profesor', () => pm.expect(pm.response.json().profesor).to.be.an('object'));",
      ],
    }),
    // ── Capture studentId ──────────────────────────────────────────────────────
    loginRequest('student'),
    makeItem({
      name: 'Get Me (student) — capture studentId',
      method: 'GET', url: '{{baseUrl}}/user/me',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.environment.set('studentId', pm.response.json().uid);",
      ],
    }),
    // ── Admin: student management ──────────────────────────────────────────────
    loginRequest('admin'),
    makeItem({
      name: 'Add Student to Group',
      method: 'POST', url: '{{baseUrl}}/groups/student/add',
      headers: jsonHeader(),
      body: { userId: '{{studentId}}', groupIds: ['{{groupId}}'] },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "pm.test('success true', () => pm.expect(pm.response.json().success).to.be.true);",
        "pm.test('created 1', () => pm.expect(pm.response.json().created).to.equal(1));",
      ],
    }),
    makeItem({
      name: 'Get Students by Group',
      method: 'GET', url: '{{baseUrl}}/groups/student/get/{{groupId}}',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
    makeItem({
      name: 'Update Students in Group',
      method: 'PUT', url: '{{baseUrl}}/groups/student/update/{{groupId}}',
      headers: jsonHeader(), body: { users: ['{{studentId}}'] },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has groupId', () => pm.expect(pm.response.json().groupId).to.be.a('string'));",
      ],
    }),
    // ── Professor: can delete student ──────────────────────────────────────────
    loginRequest('professor'),
    makeItem({
      name: 'Delete Student from Group (professor)',
      method: 'DELETE', url: '{{baseUrl}}/groups/student/delete/{{groupId}}',
      headers: jsonHeader(), body: { userId: '{{studentId}}' },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('success true', () => pm.expect(pm.response.json().success).to.be.true);",
      ],
    }),
    makeItem({
      name: 'Create Group - 403 for professor (institutional role, not rector)',
      method: 'POST', url: '{{baseUrl}}/groups/create',
      headers: tenantHeaders(),
      body: {
        name: 'No Permitido',
        profesorId: '{{newProfessorId}}',
        institutionId: '{{institutionId}}',
        categoryId: '{{categoryId}}',
        users: [],
      },
      tests: [
        "pm.test('Status 403 — institutional role cannot create groups', () => pm.response.to.have.status(403));",
      ],
    }),
    // ── Admin: bulk delete + delete group ─────────────────────────────────────
    loginRequest('admin'),
    makeItem({
      name: 'Re-add Student for deleteAll test',
      method: 'POST', url: '{{baseUrl}}/groups/student/add',
      headers: jsonHeader(),
      body: { userId: '{{studentId}}', groupIds: ['{{groupId}}'] },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
      ],
    }),
    makeItem({
      name: 'Delete All Students from Group',
      method: 'DELETE', url: '{{baseUrl}}/groups/student/deleteAll/{{groupId}}',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('success true', () => pm.expect(pm.response.json().success).to.be.true);",
      ],
    }),
    makeItem({
      name: 'Delete Group',
      method: 'DELETE', url: '{{baseUrl}}/groups/delete/{{groupId}}',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('success true', () => pm.expect(pm.response.json().success).to.be.true);",
      ],
    }),
    makeItem({
      name: 'Get Group - 404 after delete',
      method: 'GET', url: '{{baseUrl}}/groups/get/{{groupId}}',
      tests: [
        "pm.test('Status 404 after delete', () => pm.response.to.have.status(404));",
      ],
    }),
    // ── Downstream: recreate group with professor + student ───────────────────
    loginRequest('rector'),
    makeItem({
      name: 'Create Group (downstream)',
      method: 'POST', url: '{{baseUrl}}/groups/create',
      headers: tenantHeaders(),
      body: {
        name: 'Grupo Downstream 2026',
        profesorId: '{{newProfessorId}}',
        institutionId: '{{institutionId}}',
        categoryId: '{{categoryId}}',
        users: ['{{studentId}}'],
      },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "pm.environment.set('groupId', pm.response.json().uid);",
      ],
    }),
  ],
};

// ─── PHOTOS MODULE ────────────────────────────────────────────────────────────
// No auth guard on this controller — all endpoints are public.

const photosFolder = {
  name: 'Photos',
  item: [
    makeItem({
      name: 'Create Photo',
      method: 'POST', url: '{{baseUrl}}/photos/create',
      headers: jsonHeader(),
      body: { base64: TEST_BASE64, name: 'test-photo.png', folder: 'products' },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "const json = pm.response.json();",
        "pm.test('Has uid', () => pm.expect(json.uid).to.be.a('string'));",
        "pm.test('Has name', () => pm.expect(json.name).to.be.a('string'));",
        "pm.test('Has url', () => pm.expect(json.url).to.be.a('string'));",
        "pm.environment.set('photoId', json.uid);",
      ],
    }),
    makeItem({
      name: 'Get Photo by UID',
      method: 'GET', url: '{{baseUrl}}/photos/get/{{photoId}}',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "const json = pm.response.json();",
        "pm.test('UID matches', () => pm.expect(json.uid).to.equal(pm.environment.get('photoId')));",
        "pm.test('Has name', () => pm.expect(json.name).to.be.a('string'));",
        "pm.test('Has url', () => pm.expect(json.url).to.be.a('string'));",
      ],
    }),
    makeItem({
      name: 'Edit Photo',
      method: 'PUT', url: '{{baseUrl}}/photos/edit/{{photoId}}',
      headers: jsonHeader(), body: { base64: TEST_BASE64 },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "const json = pm.response.json();",
        "pm.test('Has uid', () => pm.expect(json.uid).to.be.a('string'));",
        "pm.test('Has url', () => pm.expect(json.url).to.be.a('string'));",
      ],
    }),
    makeItem({
      name: 'Get Photo - 404',
      method: 'GET', url: '{{baseUrl}}/photos/get/00000000-0000-0000-0000-000000000000',
      tests: ["pm.test('Status 404', () => pm.response.to.have.status(404));"],
    }),
    makeItem({
      name: 'Edit Photo - 404',
      method: 'PUT', url: '{{baseUrl}}/photos/edit/00000000-0000-0000-0000-000000000000',
      headers: jsonHeader(), body: { base64: TEST_BASE64 },
      tests: ["pm.test('Status 404', () => pm.response.to.have.status(404));"],
    }),
  ],
};

// ─── PRODUCTS MODULE ──────────────────────────────────────────────────────────

const productsFolder = {
  name: 'Products',
  item: [
    loginRequest('professor'),
    makeItem({
      name: 'Create Product (professor)',
      method: 'POST', url: '{{baseUrl}}/products/create',
      headers: jsonHeader(),
      body: {
        name: 'Obra de Prueba', description: 'Descripción de prueba', price: 50000,
        madeAt: '2026-01-15', groupId: '{{groupId}}', isSold: false,
        authors: [{ userId: '{{newProfessorId}}', isAuthor: true }],
        styles: [],
        images: [{ base64: TEST_BASE64, name: 'obra.jpg', folder: 'products', isMain: true }],
      },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "const json = pm.response.json();",
        "pm.test('Has uid', () => pm.expect(json.uid).to.be.a('string'));",
        "pm.test('Has photos array', () => pm.expect(json.photos).to.be.an('array'));",
        "pm.environment.set('productId', json.uid);",
      ],
    }),
    makeItem({
      name: 'Get Gallery Home (public)',
      method: 'GET', url: '{{baseUrl}}/products/getGalleryHome?page=1&limit=10',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
    makeItem({
      name: 'Get Products by Author (public)',
      method: 'GET', url: '{{baseUrl}}/products/getAuthor/{{newProfessorId}}?page=1&limit=10',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
    makeItem({
      name: 'Get Product by UID (public)',
      method: 'GET', url: '{{baseUrl}}/products/get/{{productId}}',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "const json = pm.response.json();",
        "pm.test('UID matches', () => pm.expect(json.uid).to.equal(pm.environment.get('productId')));",
      ],
    }),
    makeItem({
      name: 'Get Product by UID - 404',
      method: 'GET', url: '{{baseUrl}}/products/get/00000000-0000-0000-0000-000000000000',
      tests: ["pm.test('Status 404', () => pm.response.to.have.status(404));"],
    }),
    makeItem({
      name: 'Update Product Status - REJECTED without feedback returns 400 (professor)',
      method: 'PATCH', url: '{{baseUrl}}/products/status/{{productId}}',
      headers: jsonHeader(), body: { status: 'REJECTED' },
      tests: ["pm.test('Status 400', () => pm.response.to.have.status(400));"],
    }),
    makeItem({
      name: 'Update Product Status - APPROVED (professor)',
      method: 'PATCH', url: '{{baseUrl}}/products/status/{{productId}}',
      headers: jsonHeader(), body: { status: 'APPROVED' },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Status APPROVED', () => pm.expect(pm.response.json().status).to.equal('APPROVED'));",
      ],
    }),
    makeItem({
      name: 'Approve Many Products (professor)',
      method: 'PUT', url: '{{baseUrl}}/products/approveMany',
      headers: jsonHeader(), body: { productIds: ['{{productId}}'] },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has count', () => pm.expect(pm.response.json().count).to.be.a('number'));",
      ],
    }),
    makeItem({
      name: 'Update Product (professor)',
      method: 'PUT', url: '{{baseUrl}}/products/update/{{productId}}',
      headers: jsonHeader(),
      body: { name: 'Obra Actualizada', description: 'Descripción actualizada', images: [] },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has uid', () => pm.expect(pm.response.json().uid).to.be.a('string'));",
      ],
    }),
    makeItem({
      name: 'Get Products by Group (professor)',
      method: 'GET', url: '{{baseUrl}}/products/getGroup/{{groupId}}?page=1&limit=10',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
    loginRequest('admin'),
    makeItem({
      name: 'Get All Products (admin)',
      method: 'GET', url: '{{baseUrl}}/products/getAll?page=1&limit=10',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
    makeItem({
      name: 'Get Products by Group (admin)',
      method: 'GET', url: '{{baseUrl}}/products/getGroup/{{groupId}}?page=1&limit=10',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
  ],
};

// ─── STYLES MODULE ────────────────────────────────────────────────────────────

const stylesFolder = {
  name: 'Styles',
  item: [
    makeItem({
      name: 'Get All Styles (public)',
      method: 'GET', url: '{{baseUrl}}/styles/all',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
    makeItem({
      name: 'Get Styles by Category (public)',
      method: 'GET', url: '{{baseUrl}}/styles/all/{{categoryId}}',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
    loginRequest('professor'),
    makeItem({
      name: 'Create Style (professor)',
      method: 'POST', url: '{{baseUrl}}/styles/create',
      headers: jsonHeader(),
      body: { name: 'Impresionismo Test', description: 'Estilo de prueba', groupId: '{{groupId}}', categoryId: '{{categoryId}}' },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "const json = pm.response.json();",
        "pm.test('Has uid', () => pm.expect(json.uid).to.be.a('string'));",
        "pm.environment.set('styleId', json.uid);",
      ],
    }),
    makeItem({
      name: 'Get Style by UID (public)',
      method: 'GET', url: '{{baseUrl}}/styles/get/{{styleId}}',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('UID matches', () => pm.expect(pm.response.json().uid).to.equal(pm.environment.get('styleId')));",
      ],
    }),
    makeItem({
      name: 'Update Style (professor)',
      method: 'PUT', url: '{{baseUrl}}/styles/update/{{styleId}}',
      headers: jsonHeader(), body: { name: 'Impresionismo Actualizado', description: 'Actualizado' },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has uid', () => pm.expect(pm.response.json().uid).to.be.a('string'));",
      ],
    }),
    makeItem({
      name: 'Delete Style - 403 for professor',
      method: 'DELETE', url: '{{baseUrl}}/styles/delete/{{styleId}}',
      tests: ["pm.test('Status 403', () => pm.response.to.have.status(403));"],
    }),
    loginRequest('admin'),
    makeItem({
      name: 'Delete Style (admin)',
      method: 'DELETE', url: '{{baseUrl}}/styles/delete/{{styleId}}',
      tests: ["pm.test('Status 200', () => pm.response.to.have.status(200));"],
    }),
    makeItem({
      name: 'Get Style - 404 after delete',
      method: 'GET', url: '{{baseUrl}}/styles/get/{{styleId}}',
      tests: ["pm.test('Status 404', () => pm.response.to.have.status(404));"],
    }),
  ],
};

// ─── EVENTS MODULE ────────────────────────────────────────────────────────────

const eventsFolder = {
  name: 'Events',
  item: [
    makeItem({
      name: 'Get Upcoming Events (public)',
      method: 'GET', url: '{{baseUrl}}/events/upcoming?page=1&limit=10',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has data', () => pm.expect(pm.response.json().data).to.be.an('array'));",
      ],
    }),
    makeItem({
      name: 'Get Past Events (public)',
      method: 'GET', url: '{{baseUrl}}/events/past?page=1&limit=10',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has data', () => pm.expect(pm.response.json().data).to.be.an('array'));",
      ],
    }),
    makeItem({
      name: 'Get Events Home (public)',
      method: 'GET', url: '{{baseUrl}}/events/home?page=1&limit=5',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has data', () => pm.expect(pm.response.json().data).to.be.an('array'));",
      ],
    }),
    makeItem({
      name: 'Get Events by Group (public)',
      method: 'GET', url: '{{baseUrl}}/events/getByGroup/{{groupId}}?page=1&limit=10',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has data', () => pm.expect(pm.response.json().data).to.be.an('array'));",
      ],
    }),
    loginRequest('professor'),
    makeItem({
      name: 'Get Available Products for Group (professor)',
      method: 'GET', url: '{{baseUrl}}/events/available-products/{{groupId}}',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
    makeItem({
      name: 'Create Event (professor)',
      method: 'POST', url: '{{baseUrl}}/events/create',
      headers: jsonHeader(),
      body: {
        name: 'Exposición de Arte Test',
        description: 'Evento de prueba para test suite',
        eventType: 'EXHIBITION',
        startDate: '2026-06-15T10:00:00.000Z',
        endDate: '2026-06-15T18:00:00.000Z',
        locationUrl: 'https://maps.example.com/usta',
        isVirtual: false,
        createdById: '{{newProfessorId}}',
        groupIds: ['{{groupId}}'],
        productIds: [],
        coverPhoto: null,
      },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "const json = pm.response.json();",
        "pm.test('Has uid', () => pm.expect(json.uid).to.be.a('string'));",
        "pm.test('Status PENDING', () => pm.expect(json.status).to.equal('PENDING'));",
        "pm.environment.set('eventId', json.uid);",
      ],
    }),
    makeItem({
      name: 'Get Event by UID (public)',
      method: 'GET', url: '{{baseUrl}}/events/get/{{eventId}}',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "const json = pm.response.json();",
        "pm.test('Has uid', () => pm.expect(json.uid).to.equal(pm.environment.get('eventId')));",
      ],
    }),
    makeItem({
      name: 'Update Event (professor)',
      method: 'PUT', url: '{{baseUrl}}/events/update/{{eventId}}',
      headers: jsonHeader(),
      body: { name: 'Exposición Actualizada', description: 'Descripción actualizada' },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "const json = pm.response.json();",
        "pm.test('Name updated', () => pm.expect(json.name).to.equal('Exposición Actualizada'));",
        "pm.test('Back to PENDING', () => pm.expect(json.status).to.equal('PENDING'));",
      ],
    }),
    makeItem({
      name: 'Update Event Products (professor)',
      method: 'PUT', url: '{{baseUrl}}/events/{{eventId}}/products',
      headers: jsonHeader(),
      body: { productIds: [], groupId: '{{groupId}}' },
      tests: ["pm.test('Status 200', () => pm.response.to.have.status(200));"],
    }),
    makeItem({
      name: 'Get Pending Invitations (professor)',
      method: 'GET', url: '{{baseUrl}}/events/invitations/pending?profesorId={{newProfessorId}}',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
    loginRequest('admin'),
    makeItem({
      name: 'Get All Events (admin)',
      method: 'GET', url: '{{baseUrl}}/events/getAll?page=1&limit=10',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Has data', () => pm.expect(pm.response.json().data).to.be.an('array'));",
      ],
    }),
    makeItem({
      name: 'Update Event Status - APPROVED (admin)',
      method: 'PATCH', url: '{{baseUrl}}/events/status/{{eventId}}',
      headers: jsonHeader(), body: { status: 'APPROVED' },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Status APPROVED', () => pm.expect(pm.response.json().status).to.equal('APPROVED'));",
      ],
    }),
    makeItem({
      name: 'Update Event Status - CANCELLED without feedback returns 400 (admin)',
      method: 'PATCH', url: '{{baseUrl}}/events/status/{{eventId}}',
      headers: jsonHeader(), body: { status: 'CANCELLED' },
      tests: ["pm.test('Status 400 - feedback required', () => pm.response.to.have.status(400));"],
    }),
    makeItem({
      name: 'Send Invitation to Group (admin)',
      method: 'POST', url: '{{baseUrl}}/events/{{eventId}}/invite',
      headers: jsonHeader(), body: { groupId: '{{groupId}}' },
      tests: [
        "pm.test('Status 200 or 201', () => pm.expect(pm.response.code).to.be.oneOf([200, 201]));",
        "const json = pm.response.json();",
        "if (json && json.uid) pm.environment.set('invitationId', json.uid);",
      ],
    }),
    makeItem({
      name: 'Revoke Invitation (admin)',
      method: 'DELETE', url: '{{baseUrl}}/events/{{eventId}}/invite/{{groupId}}',
      tests: ["pm.test('Status 200', () => pm.response.to.have.status(200));"],
    }),
    makeItem({
      name: 'Deactivate Event (admin)',
      method: 'PATCH', url: '{{baseUrl}}/events/deactivate/{{eventId}}',
      tests: ["pm.test('Status 200', () => pm.response.to.have.status(200));"],
    }),
  ],
};

// ─── CLASSES MODULE ───────────────────────────────────────────────────────────

const classesFolder = {
  name: 'Classes',
  item: [
    loginRequest('professor'),
    makeItem({
      name: 'Create Class (professor)',
      method: 'POST', url: '{{baseUrl}}/classes/create',
      headers: jsonHeader(),
      body: {
        groupId: '{{groupId}}',
        date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        startTime: '08:00',
        endTime: '10:00',
        topic: 'Introducción al color',
      },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "const json = pm.response.json();",
        "pm.test('Has uid', () => pm.expect(json.uid).to.be.a('string'));",
        "pm.environment.set('classId', json.uid);",
      ],
    }),
    makeItem({
      name: 'Get Classes by Group (professor)',
      method: 'GET', url: '{{baseUrl}}/classes/group/{{groupId}}',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
    makeItem({
      name: 'Get Classes by Group with date filter',
      method: 'GET', url: '{{baseUrl}}/classes/group/{{groupId}}?from=2026-01-01&to=2026-12-31',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
    makeItem({
      name: 'Get Current Class for Group',
      method: 'GET', url: '{{baseUrl}}/classes/current/{{groupId}}',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "const json = pm.response.json();",
        "pm.test('Returns null or object', () => pm.expect(json === null || typeof json === 'object').to.be.true);",
      ],
    }),
    makeItem({
      name: 'Update Class Topic (professor)',
      method: 'PATCH', url: '{{baseUrl}}/classes/{{classId}}/topic',
      headers: jsonHeader(),
      body: { topic: 'Teoría del color avanzada', review: 'Clase productiva' },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Topic updated', () => pm.expect(pm.response.json().topic).to.equal('Teoría del color avanzada'));",
      ],
    }),
    makeItem({
      name: 'Get Class Attendance (professor)',
      method: 'GET', url: '{{baseUrl}}/classes/{{classId}}/attendance',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
    loginRequest('student'),
    makeItem({
      name: 'Attend Class (student)',
      method: 'POST', url: '{{baseUrl}}/classes/attend',
      headers: jsonHeader(), body: { classId: '{{classId}}' },
      tests: [
        // 201 = attended; 403 = class not active right now; 409 = already attended
        "pm.test('Status 201, 403 or 409', () => pm.expect(pm.response.code).to.be.oneOf([201, 403, 409]));",
      ],
    }),
    makeItem({
      name: 'Create Class - 403 for student',
      method: 'POST', url: '{{baseUrl}}/classes/create',
      headers: jsonHeader(),
      body: { groupId: '{{groupId}}', date: '2026-06-01', startTime: '08:00', endTime: '10:00' },
      tests: ["pm.test('Status 403', () => pm.response.to.have.status(403));"],
    }),
    loginRequest('admin'),
    makeItem({
      name: 'Get Class Attendance (admin)',
      method: 'GET', url: '{{baseUrl}}/classes/{{classId}}/attendance',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
  ],
};

// ─── SCHEDULE MODULE ──────────────────────────────────────────────────────────

const scheduleFolder = {
  name: 'Schedule',
  item: [
    loginRequest('professor'),
    makeItem({
      name: 'Create Schedule (professor)',
      method: 'POST', url: '{{baseUrl}}/schedule/create',
      headers: jsonHeader(),
      body: { groupId: '{{groupId}}', dayOfWeek: 1, startTime: '14:00', endTime: '16:00' },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "const json = pm.response.json();",
        "pm.test('Has uid', () => pm.expect(json.uid).to.be.a('string'));",
        "pm.environment.set('scheduleId', json.uid);",
      ],
    }),
    makeItem({
      name: 'Get Schedules by Group (professor)',
      method: 'GET', url: '{{baseUrl}}/schedule/group/{{groupId}}',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "const json = pm.response.json();",
        "pm.test('Returns array', () => pm.expect(json).to.be.an('array'));",
        "pm.test('Has at least 1 schedule', () => pm.expect(json.length).to.be.at.least(1));",
      ],
    }),
    makeItem({
      name: 'Update Schedule (professor)',
      method: 'PUT', url: '{{baseUrl}}/schedule/{{scheduleId}}',
      headers: jsonHeader(),
      body: { dayOfWeek: 3, startTime: '09:00', endTime: '11:00' },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "const json = pm.response.json();",
        "pm.test('dayOfWeek updated', () => pm.expect(json.dayOfWeek).to.equal(3));",
        "pm.test('startTime updated', () => pm.expect(json.startTime).to.equal('09:00'));",
      ],
    }),
    makeItem({
      name: 'Delete Schedule (professor)',
      method: 'DELETE', url: '{{baseUrl}}/schedule/{{scheduleId}}',
      tests: ["pm.test('Status 200', () => pm.response.to.have.status(200));"],
    }),
    makeItem({
      name: 'Get Schedules - after delete',
      method: 'GET', url: '{{baseUrl}}/schedule/group/{{groupId}}',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Returns array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
    loginRequest('student'),
    makeItem({
      name: 'Create Schedule - 403 for student',
      method: 'POST', url: '{{baseUrl}}/schedule/create',
      headers: jsonHeader(),
      body: { groupId: '{{groupId}}', dayOfWeek: 2, startTime: '10:00', endTime: '12:00' },
      tests: ["pm.test('Status 403', () => pm.response.to.have.status(403));"],
    }),
    makeItem({
      name: 'Get Schedules - 403 for student',
      method: 'GET', url: '{{baseUrl}}/schedule/group/{{groupId}}',
      tests: ["pm.test('Status 403', () => pm.response.to.have.status(403));"],
    }),
  ],
};

// ─── LESSONS + CHAPTERS MODULE ───────────────────────────────────────────────
//
// Depende de `institutionSlug` (Institutions) y `categoryId` (Categories),
// nada más.
//
// Manda `categoryId` y NO `groupId` a propósito: `CreateLessonDto` acepta los
// dos —con `groupId` la categoría se hereda del grupo— pero atarse al grupo
// encadenaba este folder a que Groups pasara. Cuando `Create Group` falla,
// `{{groupId}}` queda vacío y `POST /lessons/create` revienta con un 500 de
// Postgres (`invalid input syntax for type uuid: "null"`) que no dice nada de
// Lessons. `categoryId` sale de `GET /categories`, que es público y sembrado.
//
// El autor es el RECTOR. `@RequireContextRole('rector','coordinator',
// 'institutional')` lo deja crear, y además es quien revisa — que permite
// caminar el ciclo entero sin depender del flujo de invitación de un docente
// a la institución recién creada.
//
// Lo que esta suite aporta sobre los 71 casos de jest: el header
// `X-Institution-Slug` de verdad, la cookie HttpOnly de verdad, y el orden
// real de los guards. Jest mockea el Prisma; acá se resuelve el tenant.

const lessonsFolder = {
  name: 'Lessons',
  item: [
    // ── Alta ────────────────────────────────────────────────────────────────
    loginRequest('rector'),
    makeItem({
      name: 'Create Lesson (rector)',
      method: 'POST', url: '{{baseUrl}}/lessons/create',
      headers: tenantHeaders(),
      body: {
        title: 'Básico Guitarra API',
        summary: 'Lección creada por la suite de Newman.',
        categoryId: '{{categoryId}}',
      },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "const json = pm.response.json();",
        "pm.test('Nace en DRAFT', () => pm.expect(json.institutionStatus).to.eql('DRAFT'));",
        "pm.test('No es pública', () => pm.expect(json.isPublic).to.eql(false));",
        "pm.environment.set('lessonId', json.uid);",
      ],
    }),
    makeItem({
      name: 'Create Lesson - sin título devuelve 400',
      method: 'POST', url: '{{baseUrl}}/lessons/create',
      headers: tenantHeaders(),
      body: { summary: 'Sin título', categoryId: '{{categoryId}}' },
      tests: ["pm.test('Status 400', () => pm.response.to.have.status(400));"],
    }),
    makeItem({
      name: 'Create Lesson - sin header de institución devuelve 400',
      method: 'POST', url: '{{baseUrl}}/lessons/create',
      headers: jsonHeader(),
      body: { title: 'Sin tenant', categoryId: '{{categoryId}}' },
      tests: [
        "pm.test('Status 400 sin X-Institution-Slug', () => pm.response.to.have.status(400));",
      ],
    }),
    makeItem({
      name: 'Get Lesson by uid',
      method: 'GET', url: '{{baseUrl}}/lessons/get/{{lessonId}}',
      headers: tenantHeader(),
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Es la misma lección', () => pm.expect(pm.response.json().uid).to.eql(pm.environment.get('lessonId')));",
      ],
    }),
    makeItem({
      name: 'Get Lesson - uid inexistente devuelve 404',
      method: 'GET', url: '{{baseUrl}}/lessons/get/00000000-0000-4000-8000-000000000000',
      headers: tenantHeader(),
      tests: ["pm.test('Status 404', () => pm.response.to.have.status(404));"],
    }),
    makeItem({
      name: 'Get Institution Queue (rector)',
      method: 'GET', url: '{{baseUrl}}/lessons/get',
      headers: tenantHeader(),
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Devuelve array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
    makeItem({
      name: 'Get My Lessons',
      method: 'GET', url: '{{baseUrl}}/lessons/mine',
      headers: tenantHeader(),
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Incluye la recién creada', () => {",
        "  const ids = pm.response.json().map(l => l.uid);",
        "  pm.expect(ids).to.include(pm.environment.get('lessonId'));",
        "});",
      ],
    }),

    // ── Capítulos ───────────────────────────────────────────────────────────
    makeItem({
      name: 'Create Chapter 1',
      method: 'POST', url: '{{baseUrl}}/lessons/{{lessonId}}/chapters',
      headers: tenantHeaders(),
      // El `---` y el bloque de código van a propósito: el SqlInjectionGuard
      // excluye `contentmd` de su escaneo y sin esa exclusión esto da 403.
      body: {
        title: 'Partes de la guitarra',
        contentMd: '# Partes\n\n---\n\nLa caja, el mástil y el clavijero.\n\n```js\n/* comentario */\n```',
      },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "const json = pm.response.json();",
        "pm.test('Secuencia 1', () => pm.expect(json.sequence).to.eql(1));",
        "pm.environment.set('chapterId', json.uid);",
      ],
    }),
    makeItem({
      name: 'Create Chapter 2',
      method: 'POST', url: '{{baseUrl}}/lessons/{{lessonId}}/chapters',
      headers: tenantHeaders(),
      body: { title: 'Las cuerdas', contentMd: 'Seis cuerdas, de la sexta a la primera.' },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "const json = pm.response.json();",
        "pm.test('Secuencia 2', () => pm.expect(json.sequence).to.eql(2));",
        "pm.environment.set('chapter2Id', json.uid);",
      ],
    }),
    makeItem({
      name: 'Create Chapter 3',
      method: 'POST', url: '{{baseUrl}}/lessons/{{lessonId}}/chapters',
      headers: tenantHeaders(),
      body: { title: 'Los acordes', contentMd: 'Un acorde son tres notas o más.' },
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "const json = pm.response.json();",
        "pm.test('Secuencia 3', () => pm.expect(json.sequence).to.eql(3));",
        "pm.environment.set('chapter3Id', json.uid);",
      ],
    }),
    makeItem({
      name: 'List Chapters - secuencia 1..N contigua',
      method: 'GET', url: '{{baseUrl}}/lessons/{{lessonId}}/chapters',
      headers: tenantHeader(),
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "const arr = pm.response.json();",
        "pm.test('Son 3', () => pm.expect(arr).to.have.lengthOf(3));",
        "pm.test('Secuencia 1,2,3 sin huecos', () => {",
        "  pm.expect(arr.map(c => c.sequence)).to.eql([1, 2, 3]);",
        "});",
        "pm.test('Trae el progreso en el índice', () => {",
        "  pm.expect(arr[0]).to.have.property('completed');",
        "});",
      ],
    }),
    makeItem({
      name: 'Get Chapter - trae prevUid/nextUid del backend',
      method: 'GET', url: '{{baseUrl}}/lessons/{{lessonId}}/chapters/{{chapter2Id}}',
      headers: tenantHeader(),
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "const json = pm.response.json();",
        "pm.test('El del medio tiene anterior y siguiente', () => {",
        "  pm.expect(json.prevUid).to.be.a('string');",
        "  pm.expect(json.nextUid).to.be.a('string');",
        "});",
      ],
    }),
    makeItem({
      name: 'Get Chapter - de otra lección devuelve 404',
      method: 'GET',
      url: '{{baseUrl}}/lessons/00000000-0000-4000-8000-000000000000/chapters/{{chapterId}}',
      headers: tenantHeader(),
      tests: [
        "pm.test('Status 404 — el capítulo tiene que ser de ESA lección', () => pm.response.to.have.status(404));",
      ],
    }),
    makeItem({
      name: 'Reorder Chapters',
      method: 'PATCH', url: '{{baseUrl}}/lessons/{{lessonId}}/chapters/reorder',
      headers: tenantHeaders(),
      body: { uids: ['{{chapter3Id}}', '{{chapterId}}', '{{chapter2Id}}'] },
      // `reorder` NO devuelve la lista: el service es `void`, hace el
      // $transaction y llama a markForReview. El orden se comprueba con el GET
      // de abajo, que además es la lectura que ve el usuario.
      tests: ["pm.test('Status 200', () => pm.response.to.have.status(200));"],
    }),
    makeItem({
      name: 'List Chapters - el reorder quedó aplicado',
      method: 'GET', url: '{{baseUrl}}/lessons/{{lessonId}}/chapters',
      headers: tenantHeader(),
      tests: [
        "const arr = pm.response.json();",
        "pm.test('Reescribe 1..N en transacción', () => {",
        "  pm.expect(arr.map(c => c.sequence)).to.eql([1, 2, 3]);",
        "});",
        "pm.test('El que se mandó primero quedó primero', () => {",
        "  pm.expect(arr[0].uid).to.eql(pm.environment.get('chapter3Id'));",
        "});",
      ],
    }),
    makeItem({
      name: 'Delete Chapter 3 - recompacta',
      method: 'DELETE', url: '{{baseUrl}}/lessons/{{lessonId}}/chapters/{{chapter3Id}}',
      headers: tenantHeader(),
      tests: ["pm.test('Status 200', () => pm.response.to.have.status(200));"],
    }),
    makeItem({
      name: 'List Chapters - quedan 2, sin huecos',
      method: 'GET', url: '{{baseUrl}}/lessons/{{lessonId}}/chapters',
      headers: tenantHeader(),
      tests: [
        "const arr = pm.response.json();",
        "pm.test('Quedan 2', () => pm.expect(arr).to.have.lengthOf(2));",
        "pm.test('Renumerados a 1,2', () => pm.expect(arr.map(c => c.sequence)).to.eql([1, 2]));",
      ],
    }),

    // ── Revisión de la institución ──────────────────────────────────────────
    makeItem({
      name: 'Submit for Review',
      method: 'POST', url: '{{baseUrl}}/lessons/{{lessonId}}/submit',
      headers: tenantHeader(),
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "pm.test('Pasa a PENDING', () => pm.expect(pm.response.json().institutionStatus).to.eql('PENDING'));",
      ],
    }),
    makeItem({
      name: 'Review - rechazar con motivo',
      method: 'PATCH', url: '{{baseUrl}}/lessons/{{lessonId}}/review',
      headers: tenantHeaders(),
      body: { approve: false, feedback: 'Faltan ejemplos en el capítulo 2.' },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "const json = pm.response.json();",
        "pm.test('Queda REJECTED', () => pm.expect(json.institutionStatus).to.eql('REJECTED'));",
        "pm.test('Guarda el motivo', () => pm.expect(json.institutionFeedback).to.be.a('string'));",
      ],
    }),
    makeItem({
      name: 'Submit again after rejection',
      method: 'POST', url: '{{baseUrl}}/lessons/{{lessonId}}/submit',
      headers: tenantHeader(),
      tests: [
        "pm.test('Vuelve a PENDING', () => pm.expect(pm.response.json().institutionStatus).to.eql('PENDING'));",
      ],
    }),
    makeItem({
      name: 'Review - aprobar',
      method: 'PATCH', url: '{{baseUrl}}/lessons/{{lessonId}}/review',
      headers: tenantHeaders(),
      body: { approve: true },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Queda APPROVED', () => pm.expect(pm.response.json().institutionStatus).to.eql('APPROVED'));",
      ],
    }),

    // ── El reseteo a revisión ───────────────────────────────────────────────
    //
    // El bloque que más importa de la suite. Si esto falla hay contenido sin
    // revisar visible en TODAS las instituciones, porque `isPublic` es la
    // condición que autoriza la lectura cross-tenant del catálogo.
    makeItem({
      name: '⚠ Editar la lección aprobada la devuelve a la cola',
      method: 'PUT', url: '{{baseUrl}}/lessons/update/{{lessonId}}',
      headers: tenantHeaders(),
      body: { title: 'Básico Guitarra API (corregido)' },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "const json = pm.response.json();",
        "pm.test('APPROVED -> PENDING', () => pm.expect(json.institutionStatus).to.eql('PENDING'));",
        "pm.test('Sale del catálogo', () => pm.expect(json.isPublic).to.eql(false));",
        "pm.test('Se limpia el veredicto global', () => pm.expect(json.globalStatus).to.eql(null));",
      ],
    }),
    makeItem({
      name: 'Re-aprobar tras la edición',
      method: 'PATCH', url: '{{baseUrl}}/lessons/{{lessonId}}/review',
      headers: tenantHeaders(),
      body: { approve: true },
      tests: [
        "pm.test('Vuelve a APPROVED', () => pm.expect(pm.response.json().institutionStatus).to.eql('APPROVED'));",
      ],
    }),
    makeItem({
      name: '⚠ Editar un capítulo también la devuelve a la cola',
      method: 'PUT', url: '{{baseUrl}}/lessons/{{lessonId}}/chapters/{{chapterId}}',
      headers: tenantHeaders(),
      body: { title: 'Partes de la guitarra (corregido)', contentMd: 'Texto corregido.' },
      tests: ["pm.test('Status 200', () => pm.response.to.have.status(200));"],
    }),
    makeItem({
      name: '⚠ ...comprobado en la lección',
      method: 'GET', url: '{{baseUrl}}/lessons/get/{{lessonId}}',
      headers: tenantHeader(),
      tests: [
        "const json = pm.response.json();",
        "pm.test('Tocar un capítulo invalida la aprobación', () => pm.expect(json.institutionStatus).to.eql('PENDING'));",
        "pm.test('Y la saca del catálogo', () => pm.expect(json.isPublic).to.eql(false));",
      ],
    }),
    makeItem({
      name: 'Re-aprobar tras editar el capítulo',
      method: 'PATCH', url: '{{baseUrl}}/lessons/{{lessonId}}/review',
      headers: tenantHeaders(),
      body: { approve: true },
      tests: [
        "pm.test('Vuelve a APPROVED', () => pm.expect(pm.response.json().institutionStatus).to.eql('APPROVED'));",
      ],
    }),

    // ── Catálogo global ─────────────────────────────────────────────────────
    makeItem({
      name: 'Submit Global (rector)',
      method: 'POST', url: '{{baseUrl}}/lessons/{{lessonId}}/submit-global',
      headers: tenantHeader(),
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "pm.test('globalStatus PENDING', () => pm.expect(pm.response.json().globalStatus).to.eql('PENDING'));",
      ],
    }),
    loginRequest('admin'),
    makeItem({
      name: 'Admin Queue - cross-tenant, sin header de institución',
      method: 'GET', url: '{{baseUrl}}/lessons/admin',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Devuelve array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
    makeItem({
      name: '⚠ El revisor lee una lección que todavía NO es pública',
      method: 'GET', url: '{{baseUrl}}/lessons/admin/{{lessonId}}',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "const json = pm.response.json();",
        "pm.test('Todavía no es pública', () => pm.expect(json.isPublic).to.eql(false));",
      ],
    }),
    makeItem({
      name: 'Admin lee los capítulos de esa lección',
      method: 'GET', url: '{{baseUrl}}/lessons/admin/{{lessonId}}/chapters',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Devuelve array', () => pm.expect(pm.response.json()).to.be.an('array'));",
      ],
    }),
    makeItem({
      name: 'Admin Review - aprobar al catálogo',
      method: 'PATCH', url: '{{baseUrl}}/lessons/admin/{{lessonId}}/review',
      headers: jsonHeader(),
      body: { approve: true },
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "const json = pm.response.json();",
        "pm.test('globalStatus APPROVED', () => pm.expect(json.globalStatus).to.eql('APPROVED'));",
        "pm.test('Aprobar global enciende isPublic', () => pm.expect(json.isPublic).to.eql(true));",
      ],
    }),

    // ── Lectura desde otro usuario ──────────────────────────────────────────
    loginRequest('student'),
    makeItem({
      name: 'Catálogo Quyca - visible para el estudiante, sin tenant',
      method: 'GET', url: '{{baseUrl}}/lessons/catalog',
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "const ids = pm.response.json().map(l => l.uid);",
        "pm.test('Contiene la lección publicada', () => pm.expect(ids).to.include(pm.environment.get('lessonId')));",
      ],
    }),
    makeItem({
      name: 'Create Lesson - 403 para el estudiante',
      method: 'POST', url: '{{baseUrl}}/lessons/create',
      headers: tenantHeaders(),
      body: { title: 'No debería poder', categoryId: '{{categoryId}}' },
      tests: [
        "pm.test('Status 403 o 400 (no es miembro de esa institución)', () => {",
        "  pm.expect(pm.response.code).to.be.oneOf([400, 403]);",
        "});",
      ],
    }),

    // ── Retiro y baja ───────────────────────────────────────────────────────
    loginRequest('rector'),
    makeItem({
      name: 'Unpublish - la retira del catálogo',
      method: 'POST', url: '{{baseUrl}}/lessons/{{lessonId}}/unpublish',
      headers: tenantHeader(),
      tests: [
        "pm.test('Status 201', () => pm.response.to.have.status(201));",
        "pm.test('Deja de ser pública', () => pm.expect(pm.response.json().isPublic).to.eql(false));",
      ],
    }),
    makeItem({
      name: 'Delete Lesson',
      method: 'DELETE', url: '{{baseUrl}}/lessons/delete/{{lessonId}}',
      headers: tenantHeader(),
      tests: ["pm.test('Status 200', () => pm.response.to.have.status(200));"],
    }),
    makeItem({
      name: 'Tras la baja, desaparece de los listados',
      method: 'GET', url: '{{baseUrl}}/lessons/mine',
      headers: tenantHeader(),
      // La baja es SOFT (`isActive: false`). La garantía que rige es que sale
      // de los listados — todos filtran `isActive: true`.
      //
      // Lo que NO rige: `GET /lessons/get/:uid` la sigue devolviendo. La
      // lectura pasa por `findInTenant`, que hace `findUnique({ where: { uid } })`
      // SIN filtrar `isActive`. Quien ya tenga el uid y esté en el mismo tenant
      // sigue leyendo una lección dada de baja. No es fuga cross-tenant, pero
      // tampoco es lo que "eliminar" sugiere. Documentado, no asumido.
      tests: [
        "pm.test('Status 200', () => pm.response.to.have.status(200));",
        "pm.test('Ya no aparece en /lessons/mine', () => {",
        "  const ids = pm.response.json().map(l => l.uid);",
        "  pm.expect(ids).to.not.include(pm.environment.get('lessonId'));",
        "});",
      ],
    }),
  ],
};

// ─── COLLECTION ASSEMBLY ─────────────────────────────────────────────────────

const collection = {
  info: {
    _postman_id: 'usta-gallery-api-tests',
    name: 'Quyca API Tests',
    description: 'Full Newman test suite — Auth, User, Institutions, Categories, Groups, Photos, Products, Styles, Events, Classes, Schedule, Lessons',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [authFolder, userFolder, institutionsFolder, categoriesFolder, groupsFolder, photosFolder, productsFolder, stylesFolder, eventsFolder, classesFolder, scheduleFolder, lessonsFolder],
};

const outPath = path.join(__dirname, 'collections', 'server-api', 'collection.json');
fs.writeFileSync(outPath, JSON.stringify(collection, null, 2));
console.log(`Collection written to ${outPath}`);
console.log(`Folders: ${collection.item.map(f => f.name).join(', ')}`);
