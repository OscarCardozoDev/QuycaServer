import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './Health.controller';

/**
 * La sonda tiene dos ramas (Postgres y redis-auth), y las dos importan: si
 * cualquiera devolviera 200 con su dependencia caida, el deploy se pondria
 * verde con la aplicacion rota. Esto es lo que falla si alguien "simplifica"
 * los try/catch o saca el timeout del PING.
 */
describe('HealthController', () => {
  const okPrisma = () => ({
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  });
  const okRedis = () => ({ ping: jest.fn().mockResolvedValue('PONG') });

  it('devuelve ok cuando la base y redis-auth responden', async () => {
    const prisma = okPrisma();
    const redisService = okRedis();
    const controller = new HealthController(
      prisma as never,
      redisService as never,
    );

    await expect(controller.check()).resolves.toEqual({ status: 'ok' });
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(redisService.ping).toHaveBeenCalled();
  });

  it('lanza 503 cuando la base no responde', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const controller = new HealthController(
      prisma as never,
      okRedis() as never,
    );

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('lanza 503 cuando redis-auth no responde', async () => {
    const prisma = okPrisma();
    const redisService = {
      ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const controller = new HealthController(
      prisma as never,
      redisService as never,
    );

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('lanza 503 sin colgarse cuando redis-auth acepta la conexion pero no responde', async () => {
    const prisma = okPrisma();
    // never-resolving ping: simula un socket abierto que no contesta. El
    // timeout interno tiene que ganar la carrera, no la promesa colgada.
    const redisService = { ping: jest.fn(() => new Promise(() => {})) };
    const controller = new HealthController(
      prisma as never,
      redisService as never,
    );

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  }, 3000);
});
