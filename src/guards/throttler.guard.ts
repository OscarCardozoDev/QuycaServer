import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Se cuenta por email (`body.mail` o `body.email`) y no por IP.
//
// El producto se despliega en laboratorios de universidad: treinta
// estudiantes detrás de un NAT salen a internet con una sola IP pública. Un
// límite "5 intentos de login por IP cada 5 minutos" bloquearía a la clase
// entera en el primer minuto de la práctica. La fuerza bruta ataca UNA
// cuenta, así que contar por `body.mail` limita exactamente eso y deja pasar
// a los treinta estudiantes, cada uno con su propio contador. El hueco que
// deja esto — un atacante rociando 1000 emails distintos desde una sola IP —
// lo tapa la zona `auth` de nginx (Fase 2), que sí cuenta por IP. Ver
// obsidian/Raw/Planes/2026-09-01-rate-limiting.md, sección 2.2.
//
// ponytail: el contador vive en memoria (storage default del módulo) y hoy
// hay un solo contenedor backend, así que es exacto. El día que haya N
// réplicas el límite efectivo se multiplica por N y hay que mover el storage
// a un `redis-cache` SEPARADO de `redis-auth` (ver 2.3 del plan y
// obsidian/Decisiones/Almacenamiento-de-Refresh-Tokens.md).
@Injectable()
export class AccountThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const body = req.body as Record<string, unknown> | undefined;
    const raw = body?.mail ?? body?.email;

    // Solo se toma el valor si es un string: un atacante puede mandar
    // `{"mail": {"$ne": null}}` o `{"mail": ["a","b"]}`, y si eso llega crudo
    // a la clave del contador se rompe o se convierte en clave arbitraria.
    if (typeof raw === 'string' && raw.trim() !== '') {
      // Sin normalizar, `Pepe@X.com` y `pepe@x.com` son dos contadores
      // distintos y el límite se saltea escribiendo el mail con otra
      // capitalización — es un bypass trivial, no un detalle cosmético.
      return Promise.resolve(`mail:${raw.trim().toLowerCase()}`);
    }

    // Este guard es APP_GUARD: corre en TODAS las requests, muchas sin body
    // (GET) o con el body todavía sin parsear. Prefijado para que una IP y
    // un email nunca puedan colisionar en la misma clave.
    return Promise.resolve(`ip:${req.ip}`);
  }
}
