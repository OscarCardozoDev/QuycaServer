import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY } from 'src/decorators/feature.decorator';
import { FEATURE_LABELS } from 'src/modules/institutions/plan-features';
import type { AuthenticatedRequest } from 'src/interface/jwtPayload';

/**
 * Corta cuando el plan de la institución no incluye la feature del endpoint.
 *
 * **Responde 402, no 403.** La diferencia no es cosmética: un 403 significa
 * "vos no podés", y el cliente lo traduce a un problema de rol. Acá el rol
 * está bien —de hecho `ContextRoleGuard` ya pasó— y lo que falta es plan. Con
 * 403 un rector de una institución en plan Empírico veía "solo el rector puede
 * crear grupos" mientras era el rector: el mensaje mandaba a revisar los
 * permisos, que estaban perfectos. 402 es además lo que ya devuelven los topes
 * de plan en `Group.service` (`maxGroups`, grupos gratuitos de plataforma), así
 * que todo lo que es "tu plan no da" habla con un solo código.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const feature = this.reflector.getAllAndOverride<string>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!feature) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const institution = req.institution;
    const plan = institution?.subscriptionPlan;

    // Período de prueba: mientras dure, la institución tiene TODAS las
    // features, sin importar el plan que tenga guardado.
    //
    // `POST /institutions` crea toda institución en `empirico` —el plan del
    // artista suelto, "solo vitrina: ni crea ni gestiona"— y con 30 días de
    // TRIAL. Sin esta rama, esos 30 días son una prueba de nada: el rector no
    // puede crear ni un grupo, que es lo primero que hace una institución.
    // Ver obsidian/errors/multitenant/2026-08-24-el-trial-que-no-probaba-nada.md
    //
    // Se compara `trialEndsAt` a propósito: un TRIAL vencido que nadie pasó a
    // ACTIVE no puede seguir dando acceso gratis para siempre.
    const trialEndsAt = institution?.trialEndsAt;
    if (
      institution?.status === 'TRIAL' &&
      trialEndsAt &&
      new Date(trialEndsAt).getTime() > Date.now()
    ) {
      return true;
    }

    const features = plan?.features as string[] | undefined;

    if (!features?.includes(feature)) {
      // El mensaje viaja al usuario tal cual, así que nombra el plan y la
      // feature con la etiqueta legible del catálogo, no con el slug —que es
      // contrato de autorización y no texto de UI.
      const label = FEATURE_LABELS[feature] ?? feature;
      const planName = plan?.name ?? 'tu plan actual';

      throw new HttpException(
        `El plan ${planName} no incluye "${label}". Cambiá de plan para habilitarlo.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return true;
  }
}
