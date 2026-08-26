import { Reflector } from '@nestjs/core';
import { HttpStatus } from '@nestjs/common';
import { FeatureGuard } from './feature.guard';

/**
 * El caso que originó estos tests: una institución recién creada nace en el
 * plan Empírico, que no tiene `groups_create`. El guard cortaba con 403 y el
 * dashboard lo mostraba como "solo el rector puede crear grupos" — al rector.
 */
describe('FeatureGuard', () => {
  const ctx = (institution: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ institution }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as any;

  const guardFor = (feature: string | undefined) => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(feature) } as unknown as Reflector;
    return new FeatureGuard(reflector);
  };

  const DAY = 24 * 60 * 60 * 1000;

  /** Institución fuera del período de prueba: manda el plan. */
  const plan = (name: string, features: string[]) => ({
    status: 'ACTIVE',
    trialEndsAt: null,
    subscriptionPlan: { name, features },
  });

  /** Institución en prueba. `endsInDays` negativo = prueba vencida. */
  const trial = (name: string, features: string[], endsInDays: number) => ({
    status: 'TRIAL',
    trialEndsAt: new Date(Date.now() + endsInDays * DAY),
    subscriptionPlan: { name, features },
  });

  it('deja pasar cuando el plan incluye la feature', () => {
    const guard = guardFor('groups_create');
    expect(guard.canActivate(ctx(plan('Academia', ['groups_create'])))).toBe(true);
  });

  it('deja pasar cuando el endpoint no pide ninguna feature', () => {
    const guard = guardFor(undefined);
    expect(guard.canActivate(ctx(plan('Empírico', [])))).toBe(true);
  });

  it('corta con 402, no con 403: el rol está bien, lo que falta es plan', () => {
    const guard = guardFor('groups_create');

    expect(() => guard.canActivate(ctx(plan('Empírico', ['profile'])))).toThrow(
      expect.objectContaining({ status: HttpStatus.PAYMENT_REQUIRED }),
    );
  });

  it('nombra el plan y la etiqueta legible, nunca el slug de autorización', () => {
    const guard = guardFor('groups_create');

    try {
      guard.canActivate(ctx(plan('Empírico', ['profile'])));
      throw new Error('debía cortar');
    } catch (err: any) {
      expect(err.message).toContain('Empírico');
      expect(err.message).toContain('Crear grupos');
      expect(err.message).not.toContain('groups_create');
    }
  });

  it('en período de prueba pasa aunque el plan no tenga la feature', () => {
    const guard = guardFor('groups_create');

    // El caso real: institución recién creada, plan Empírico, 30 días de TRIAL.
    expect(guard.canActivate(ctx(trial('Empírico', ['profile'], 30)))).toBe(true);
  });

  it('con la prueba vencida vuelve a mandar el plan', () => {
    const guard = guardFor('groups_create');

    expect(() => guard.canActivate(ctx(trial('Empírico', ['profile'], -1)))).toThrow(
      expect.objectContaining({ status: HttpStatus.PAYMENT_REQUIRED }),
    );
  });

  it('TRIAL sin fecha de fin no habilita nada', () => {
    const guard = guardFor('groups_create');
    const sinFecha = { status: 'TRIAL', trialEndsAt: null, subscriptionPlan: { name: 'Empírico', features: ['profile'] } };

    expect(() => guard.canActivate(ctx(sinFecha))).toThrow(
      expect.objectContaining({ status: HttpStatus.PAYMENT_REQUIRED }),
    );
  });

  it('sin plan en la request tampoco deja pasar', () => {
    const guard = guardFor('groups_create');

    expect(() => guard.canActivate(ctx(undefined))).toThrow(
      expect.objectContaining({ status: HttpStatus.PAYMENT_REQUIRED }),
    );
  });
});
