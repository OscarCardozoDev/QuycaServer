import {
  Controller,
  ExecutionContext,
  INestApplication,
  Module,
  Post,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  Throttle,
  ThrottlerModule,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import * as request from 'supertest';
import { AccountThrottlerGuard } from './throttler.guard';

function contextWithRequest(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

// getTracker es protected: se accede por índice en vez de exponerlo en
// producción solo para testear.
async function tracker(
  guard: AccountThrottlerGuard,
  req: Record<string, unknown>,
) {
  return guard['getTracker'](
    contextWithRequest(req).switchToHttp().getRequest(),
  );
}

describe('AccountThrottlerGuard.getTracker — cuenta por cuenta, no por IP', () => {
  const guard = new AccountThrottlerGuard(
    {} as ThrottlerModuleOptions,
    {} as ThrottlerStorage,
    {} as Reflector,
  );

  it('usa body.mail cuando está presente', async () => {
    await expect(
      tracker(guard, { body: { mail: 'pepe@x.com' }, ip: '1.1.1.1' }),
    ).resolves.toBe('mail:pepe@x.com');
  });

  it('usa body.email cuando no hay mail (CreateInstitutionDto usa email, no mail)', async () => {
    await expect(
      tracker(guard, { body: { email: 'rector@u.edu' }, ip: '1.1.1.1' }),
    ).resolves.toBe('mail:rector@u.edu');
  });

  it('si vienen los dos, gana mail sobre email', async () => {
    await expect(
      tracker(guard, {
        body: { mail: 'a@x.com', email: 'b@x.com' },
        ip: '1.1.1.1',
      }),
    ).resolves.toBe('mail:a@x.com');
  });

  it('normaliza mayúsculas y espacios: dos formas del mismo mail dan la misma clave', async () => {
    const k1 = await tracker(guard, {
      body: { mail: '  Pepe@X.com  ' },
      ip: '1.1.1.1',
    });
    const k2 = await tracker(guard, {
      body: { mail: 'pepe@x.com' },
      ip: '2.2.2.2',
    });

    expect(k1).toBe(k2);
  });

  it('sin body, cae a la IP sin tirar excepción', async () => {
    await expect(
      tracker(guard, { body: undefined, ip: '1.1.1.1' }),
    ).resolves.toBe('ip:1.1.1.1');
  });

  it('body sin mail ni email, cae a la IP', async () => {
    await expect(
      tracker(guard, { body: { otraCosa: 'x' }, ip: '1.1.1.1' }),
    ).resolves.toBe('ip:1.1.1.1');
  });

  it.each([
    ['un operador de Mongo', { $ne: null }],
    ['un array', ['a', 'b']],
    ['un número', 42],
    ['null', null],
  ])(
    'mail no-string (%s) cae a la IP en vez de romper o filtrar',
    async (_desc, raw) => {
      await expect(
        tracker(guard, { body: { mail: raw }, ip: '1.1.1.1' }),
      ).resolves.toBe('ip:1.1.1.1');
    },
  );

  it('mail vacío o solo espacios cae a la IP', async () => {
    await expect(
      tracker(guard, { body: { mail: '   ' }, ip: '1.1.1.1' }),
    ).resolves.toBe('ip:1.1.1.1');
    await expect(
      tracker(guard, { body: { mail: '' }, ip: '1.1.1.1' }),
    ).resolves.toBe('ip:1.1.1.1');
  });

  it('una clave de mail y una de IP nunca colisionan aunque el valor crudo coincida', async () => {
    const mailKey = await tracker(guard, {
      body: { mail: '1.1.1.1' },
      ip: 'no-usada',
    });
    const ipKey = await tracker(guard, { body: undefined, ip: '1.1.1.1' });

    expect(mailKey).toBe('mail:1.1.1.1');
    expect(ipKey).toBe('ip:1.1.1.1');
    expect(mailKey).not.toBe(ipKey);
  });
});

// --- Parte B: integración, el límite realmente corta ---------------------
//
// Módulo mínimo, sin AppModule real (nada de Prisma/Redis/tenant): un
// controller de prueba con las mismas reglas que login (5/5min) y el guard
// de producción como APP_GUARD.
@Controller('cuenta')
class CuentaTestController {
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @Post('login')
  login() {
    return { ok: true };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 300_000, limit: 1000 }])],
  controllers: [CuentaTestController],
  providers: [{ provide: APP_GUARD, useClass: AccountThrottlerGuard }],
})
class ThrottlerTestModule {}

describe('AccountThrottlerGuard — el límite corta por cuenta, el NAT no paga la fiesta', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerTestModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('a la sexta request con el mismo mail, corta con 429', async () => {
    const server = app.getHttpServer() as import('http').Server;
    const statuses: number[] = [];

    for (let i = 0; i < 6; i++) {
      const res = await request(server)
        .post('/cuenta/login')
        .send({ mail: 'pepe@x.com' });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses[5]).toBe(429);
  });

  it('6 mails distintos desde la misma conexión no disparan 429 (regresión del NAT)', async () => {
    const server = app.getHttpServer() as import('http').Server;
    const statuses: number[] = [];

    for (let i = 0; i < 6; i++) {
      const res = await request(server)
        .post('/cuenta/login')
        .send({ mail: `estudiante${i}@u.edu` });
      statuses.push(res.status);
    }

    expect(statuses).toEqual([201, 201, 201, 201, 201, 201]);
  });

  it('la capitalización no resetea el contador: alternar mayúsculas sigue sumando al mismo mail', async () => {
    const server = app.getHttpServer() as import('http').Server;
    const variantes = [
      'Pepe@X.com',
      'pepe@x.com',
      'PEPE@X.COM',
      'pEpE@x.com',
      'Pepe@x.Com',
      'pepe@X.com',
    ];
    const statuses: number[] = [];

    for (const mail of variantes) {
      const res = await request(server).post('/cuenta/login').send({ mail });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses[5]).toBe(429);
  });
});
