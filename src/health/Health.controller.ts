import {
  Controller,
  Get,
  Inject,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { PrismaService } from 'src/prisma/prisma.service';
import { RedisService } from 'src/redis/redis.service';

// Corto a proposito: si Redis acepta la conexion pero no responde, el
// `curl --retry` del deploy no se puede quedar colgado esperando. 1.5s alcanza
// de sobra para un PING local a un contenedor de la misma red.
const REDIS_PING_TIMEOUT_MS = 1500;

/**
 * Sonda de liveness. Publica y sin guards a proposito: la consulta el job de
 * deploy desde el runner de GitHub Actions y el healthcheck del compose, y
 * ninguno de los dos tiene sesion ni cabecera de institucion.
 *
 * `SELECT 1` y no un `findFirst`: la extension de tenant no cubre `$queryRaw`,
 * asi que la sonda no depende de que haya un tenant resuelto. Un `findFirst`
 * sobre un modelo scoped devolveria 403 aca, que es justo lo contrario de lo
 * que la sonda tiene que reportar.
 *
 * Toca la base a proposito. Un endpoint que solo devuelve `{ ok: true }`
 * responde igual de bien con Postgres caido, y entonces el deploy se pone
 * verde con la aplicacion rota: el proceso vive, la aplicacion no.
 *
 * Tambien hace PING a `redis-auth`. Sin Redis no se puede refrescar la sesion
 * ni iniciar una nueva (obsidian/Raw/Planes/2026-08-31-refresh-tokens.md):
 * un deploy que se pone verde mientras nadie puede loguearse es la misma
 * falla que el comentario de arriba describe para Postgres.
 *
 * `evicted_keys` de Redis (la senal de que `noeviction` dejo de aplicarse y
 * la deteccion de reuso de refresh tokens se esta degradando en silencio) NO
 * va aca: es estado operativo, y este endpoint es publico. Vive en
 * infra/quyca-redis-check.sh, que corre en la VM y alerta por correo.
 *
 * No expone version, uptime ni nombre de la base: es publico.
 */
@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // 503 y no 500: le dice al que consulta que reintente, que es
      // exactamente lo que hace el `curl --retry` del deploy mientras el
      // backend gana la carrera contra Postgres al arrancar.
      throw new ServiceUnavailableException('database unreachable');
    }

    try {
      await this.pingRedisWithTimeout(REDIS_PING_TIMEOUT_MS);
    } catch {
      throw new ServiceUnavailableException('redis-auth unreachable');
    }

    return { status: 'ok' };
  }

  private async pingRedisWithTimeout(ms: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('redis-auth ping timeout')),
        ms,
      );
    });

    try {
      await Promise.race([this.redisService.ping(), timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }
}
