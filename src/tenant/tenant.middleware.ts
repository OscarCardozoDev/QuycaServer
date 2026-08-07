import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { tenantStorage } from './tenant-context';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request & { institutionSlug?: string | null }, _res: Response, next: NextFunction): void {
    const slug = req.headers['x-institution-slug'];
    req.institutionSlug = typeof slug === 'string' ? slug : null;

    tenantStorage.run({ institutionId: null, bypass: false }, () => next());
  }
}
