import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request & { institutionSlug?: string | null }, _res: Response, next: NextFunction): void {
    const slug = req.headers['x-institution-slug'];
    req.institutionSlug = typeof slug === 'string' ? slug : null;
    next();
  }
}
