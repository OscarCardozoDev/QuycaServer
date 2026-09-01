import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Cliente de la instancia `redis-auth` (refresh tokens, Fase 1 del plan en
 * obsidian/Raw/Planes/2026-08-31-refresh-tokens.md). Deliberadamente fino:
 * la lógica de rotación/reuso la agrega la tarea 3 (RefreshTokenService +
 * rotate.lua), esto solo deja el cliente conectado e inyectable.
 *
 * `REDIS_AUTH_URL` se lee directo del env, igual que `DATABASE_URL` en
 * src/prisma/prisma.service.ts — no pasa por el namespace `config.*` de
 * configuration-app.ts.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('REDIS_AUTH_URL');

    if (!url) {
      throw new Error('REDIS_AUTH_URL is not defined');
    }

    this.client = new Redis(url);
    this.client.on('error', (err) =>
      this.logger.error(`redis-auth connection error: ${err.message}`),
    );
  }

  async onModuleInit() {
    // ioredis se conecta solo al instanciarse (lazyConnect: false por
    // default); esto solo confirma que la conexión respondió antes de que
    // el resto de la app arranque a depender de ella.
    await this.ping();
  }

  async onModuleDestroy() {
    // quit() y no disconnect(): espera a que los comandos en vuelo terminen
    // antes de cerrar el socket.
    await this.client.quit();
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }
}
