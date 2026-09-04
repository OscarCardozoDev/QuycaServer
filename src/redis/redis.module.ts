import { Global, Module } from '@nestjs/common';
import { RedisService } from 'src/redis/redis.service';

/**
 * Cliente de `redis-auth` (refresh tokens). Global como PrismaModule: un solo
 * cliente para toda la app, inyectado donde haga falta sin repetir el import.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
