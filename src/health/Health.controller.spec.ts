import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './Health.controller';

/**
 * La sonda tiene una sola rama, pero es la que importa: si devolviera 200 con
 * la base caida, el deploy se pondria verde con la aplicacion rota. Esto es lo
 * que falla si alguien "simplifica" el try/catch.
 */
describe('HealthController', () => {
  it('devuelve ok cuando la base responde', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const controller = new HealthController(prisma as never);

    await expect(controller.check()).resolves.toEqual({ status: 'ok' });
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('lanza 503 cuando la base no responde', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const controller = new HealthController(prisma as never);

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
