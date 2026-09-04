import { createHash, randomUUID } from 'crypto';
import Redis from 'ioredis';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokenService } from './refresh-token.service';
import { RedisService } from 'src/redis/redis.service';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Contra Redis REAL, no mocks: los mocks no ejecutan Lua, y el script
 * (ROTATE_LUA, inline en refresh-token.service.ts) es la lógica que hay que
 * probar. Usa `REDIS_AUTH_URL` (la misma instancia `redis-auth` del
 * contenedor) pero contra la db 1, aislada de la db 0 real. Nunca FLUSHALL —
 * hay una sola instancia, `flushdb` solo toca la 1.
 */
describe('RefreshTokenService (Redis real, db 1)', () => {
  let redis: Redis;
  let service: RefreshTokenService;
  let prismaMock: { credentials: { findUnique: jest.Mock } };

  beforeAll(() => {
    const baseUrl = process.env.REDIS_AUTH_URL;
    if (!baseUrl) {
      throw new Error('REDIS_AUTH_URL no está definido en el entorno de test');
    }
    redis = new Redis(`${baseUrl}/1`);

    prismaMock = { credentials: { findUnique: jest.fn() } };
    service = new RefreshTokenService(
      prismaMock as unknown as PrismaService,
      { client: redis } as unknown as RedisService,
      new JwtService({ secret: 'test-secret' }),
    );
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.flushdb(); // db 1 solamente
    prismaMock.credentials.findUnique.mockReset();
    // Por defecto, muy anterior a cualquier `iat` de este test: no invalida nada.
    prismaMock.credentials.findUnique.mockResolvedValue({
      passwordChangedAt: new Date(0),
    });
  });

  it('rota: emite un par nuevo y el token viejo deja de servir', async () => {
    const { refreshToken } = await service.issuePair('uid-1', 'type-1');

    const rotated = await service.rotate(refreshToken);
    expect(rotated.refreshToken).not.toBe(refreshToken);
    expect(typeof rotated.accessToken).toBe('string');
    expect(rotated.accessToken.length).toBeGreaterThan(0);

    // El token viejo ya fue consumido: la siguiente vez es reuso, no éxito.
    await expect(service.rotate(refreshToken)).rejects.toThrow('reutilizado');
  });

  it('reuso: presentar un token ya rotado revoca la familia, y el token nuevo también deja de funcionar', async () => {
    const { refreshToken } = await service.issuePair('uid-2', 'type-2');
    const { refreshToken: rotatedOnce } = await service.rotate(refreshToken);

    // Reuso del token viejo (ya consumido) -> revoca la familia entera.
    await expect(service.rotate(refreshToken)).rejects.toThrow('reutilizado');

    // La familia quedó revocada: el token flamante que salió de la rotación
    // legítima también tiene que morir. Sin esta aserción el test pasaría
    // aunque la revocación de familia estuviera rota.
    await expect(service.rotate(rotatedOnce)).rejects.toThrow('revocada');
  });

  it('token vencido y token desconocido se rechazan sin efectos secundarios', async () => {
    await expect(service.rotate('token-que-nunca-existio')).rejects.toThrow(
      'desconocido',
    );
    // Sin efectos secundarios: no debería haber quedado ninguna tumba ni
    // interruptor de familia por un token que nunca existió.
    expect(await redis.keys('*')).toHaveLength(0);

    const { refreshToken } = await service.issuePair('uid-3', 'type-3');
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    // Simula el vencimiento del TTL: mismo efecto que dejarlo expirar solo.
    await redis.del(`rt:${hash}`);

    await expect(service.rotate(refreshToken)).rejects.toThrow('desconocido');
  });

  it('passwordChangedAt posterior al iat rechaza el token', async () => {
    const { refreshToken } = await service.issuePair('uid-4', 'type-4');

    prismaMock.credentials.findUnique.mockResolvedValue({
      passwordChangedAt: new Date(Date.now() + 60_000), // posterior al iat
    });

    await expect(service.rotate(refreshToken)).rejects.toThrow(
      'cambio de contraseña',
    );
  });

  it('reuso: el log de seguridad lleva el uid real, no "desconocido"', async () => {
    const { refreshToken } = await service.issuePair('uid-6', 'type-6');
    await service.rotate(refreshToken); // rota una vez: el token viejo queda tumba

    const warnSpy = jest
      .spyOn(
        (service as unknown as { logger: { warn: (msg: string) => void } })
          .logger,
        'warn',
      )
      .mockImplementation(() => undefined);

    // Reuso del token ya consumido: dispara el log de seguridad.
    await expect(service.rotate(refreshToken)).rejects.toThrow('reutilizado');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('uid=uid-6');
    expect(warnSpy.mock.calls[0][0]).not.toContain('desconocido');

    warnSpy.mockRestore();
  });

  it('revokeFamily deja inservibles los tokens de esa familia', async () => {
    const familyId = randomUUID();
    const { refreshToken } = await service.issuePair(
      'uid-5',
      'type-5',
      familyId,
    );

    await service.revokeFamily(familyId);

    await expect(service.rotate(refreshToken)).rejects.toThrow('revocada');
  });

  it('revokeByToken: mata la familia del token sin rotarlo, usa logout', async () => {
    const { refreshToken } = await service.issuePair('uid-7', 'type-7');

    await service.revokeByToken(refreshToken);

    await expect(service.rotate(refreshToken)).rejects.toThrow('revocada');
  });

  it('revokeByToken: un token inventado no lanza', async () => {
    await expect(
      service.revokeByToken('token-que-nunca-existio'),
    ).resolves.toBeUndefined();
  });
});
