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
 * No expone version, uptime ni nombre de la base: es publico.
 */
@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
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

    return { status: 'ok' };
  }
}
