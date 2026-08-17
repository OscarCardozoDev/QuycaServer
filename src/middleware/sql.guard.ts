import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class SqlInjectionGuard implements CanActivate {
  private readonly logger = new Logger(SqlInjectionGuard.name);

  // Patrones SQL comunes usados en inyecciones
  private readonly SQL_PATTERNS: RegExp[] = [
    /(\s|;|'|")(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC|EXECUTE)\s/i,
    /(\bUNION\b.*\bSELECT\b)/i,
    /--\s*$/m,
    /\/\*[\s\S]*?\*\//,
    /;\s*(DROP|DELETE|UPDATE|INSERT)/i,
    /\bOR\b\s+[\w\d'"]+=\s*[\w\d'"]+/i,
    /\bAND\b\s+[\w\d'"]+=\s*[\w\d'"]+/i,
    /xp_\w+/i,
    /LOAD_FILE\s*\(/i,
    /INTO\s+(OUTFILE|DUMPFILE)/i,
    /BENCHMARK\s*\(/i,
    /SLEEP\s*\(\d+\)/i,
    /WAITFOR\s+DELAY/i,
    /char\s*\(\s*\d+/i,
    /(\s|'|=|\()0x[0-9a-fA-F]{4,}/i,
  ];

  // Campos que pueden contener base64 u otros datos binarios
  private readonly EXCLUDED_FIELDS = new Set([
    'image',
    'photo',
    'avatar',
    'file',
    'thumbnail',
    'cover',
    'banner',
    'picture',
    'attachment',
    // Markdown de un capítulo de lección. Un separador `---` dispara
    // /--\s*$/m y un bloque de código con /* */ dispara el patrón de
    // comentarios: los dos son contenido legítimo. No debilita nada real —
    // Prisma parametriza toda consulta y este campo va a una columna Text
    // que nunca se concatena a SQL.
    'contentmd',
  ]);

  // Detecta si un string parece ser base64 (data URL o base64 puro)
  private isBase64Like(value: string): boolean {
    if (value.startsWith('data:') && value.includes(';base64,')) return true;
    if (value.length > 200 && /^[A-Za-z0-9+/]+=*$/.test(value)) return true;
    return false;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const valuesToCheck = this.extractValues(request);

    for (const value of valuesToCheck) {
      if (this.containsSqlInjection(value)) {
        this.logger.warn(
          `Posible SQL injection detectado. IP: ${request.ip} | URL: ${request.url} | Valor: "${value}"`,
        );
        throw new ForbiddenException(
          'La solicitud contiene caracteres no permitidos.',
        );
      }
    }

    return true;
  }

  private extractValues(request: Request): string[] {
    const values: string[] = [];

    this.collectStrings(request.query, values);

    this.collectStrings(request.body, values);

    this.collectStrings(request.params, values);

    return values;
  }

  private collectStrings(obj: unknown, result: string[], key?: string): void {
    if (obj === null || obj === undefined) return;

    // Saltar campos excluidos por nombre
    if (key && this.EXCLUDED_FIELDS.has(key.toLowerCase())) return;

    if (typeof obj === 'string') {
      // Saltar strings que parecen base64
      if (this.isBase64Like(obj)) return;
      result.push(obj);
      return;
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      result.push(String(obj));
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach((item) => this.collectStrings(item, result, key));
      return;
    }

    if (typeof obj === 'object') {
      Object.entries(obj).forEach(([k, value]) =>
        this.collectStrings(value, result, k),
      );
    }
  }

  private containsSqlInjection(value: string): boolean {
    return this.SQL_PATTERNS.some((pattern) => pattern.test(value));
  }
}
