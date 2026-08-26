import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import { applyTenantScope } from 'src/tenant/tenant.extension';

export function createPrismaClient(configService: ConfigService) {
  const url = configService.get<string>('DATABASE_URL');

  if (!url) {
    throw new Error('DATABASE_URL is not defined');
  }

  const pool = new Pool({ connectionString: url });
  const base = new PrismaClient({ adapter: new PrismaPg(pool) });

  return applyTenantScope(base);
}

/**
 * Tipo del cliente extendido. Se sigue inyectando con el token PrismaService,
 * así que ningún service cambia su firma.
 */
export type PrismaService = ReturnType<typeof createPrismaClient>;
export const PrismaService = Symbol('PrismaService');
