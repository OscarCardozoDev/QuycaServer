import { resolveOnboardingSteps, OnboardingState } from './onboarding-steps';

const base: OnboardingState = {
  isEmailVerified: true,
  hasProfile: true,
  hasPendingInvitation: false,
  isRector: false,
  institutionNeedsPlan: false,
  hasPlatformGroup: true,
};

describe('resolveOnboardingSteps', () => {
  it('artista nuevo: verificar, perfil y grupo de plataforma', () => {
    expect(
      resolveOnboardingSteps({
        ...base,
        isEmailVerified: false,
        hasProfile: false,
        hasPlatformGroup: false,
      }),
    ).toEqual(['verify-email', 'create-profile', 'choose-platform-group']);
  });

  it('rector nuevo: verificar y elegir plan, sin crear perfil ni grupo', () => {
    expect(
      resolveOnboardingSteps({
        ...base,
        isEmailVerified: false,
        isRector: true,
        institutionNeedsPlan: true,
        hasPlatformGroup: false,
      }),
    ).toEqual(['verify-email', 'choose-plan']);
  });

  it('invitado nuevo: verificar, perfil y aceptar la invitación', () => {
    expect(
      resolveOnboardingSteps({
        ...base,
        isEmailVerified: false,
        hasProfile: false,
        hasPendingInvitation: true,
        hasPlatformGroup: false,
      }),
    ).toEqual(['verify-email', 'create-profile', 'accept-invitation']);
  });

  // El caso que más importa: POST /user/create le da membresía en
  // quyca-platform a TODO el que se registra, incluido el profesor invitado.
  // Por membresía sola no se distingue de un autodidacta.
  it('la invitación pendiente gana sobre el grupo de plataforma', () => {
    expect(
      resolveOnboardingSteps({
        ...base,
        hasPendingInvitation: true,
        hasPlatformGroup: false,
      }),
    ).toEqual(['accept-invitation']);
  });

  it('artista que ya eligió grupo: nada pendiente', () => {
    expect(resolveOnboardingSteps(base)).toEqual([]);
  });

  it('rector que ya eligió plan: nada pendiente', () => {
    expect(
      resolveOnboardingSteps({ ...base, isRector: true, institutionNeedsPlan: false }),
    ).toEqual([]);
  });

  it('rector no recibe el paso de grupo de plataforma aunque no tenga ninguno', () => {
    expect(
      resolveOnboardingSteps({ ...base, isRector: true, hasPlatformGroup: false }),
    ).toEqual([]);
  });

  it('correo sin verificar siempre va primero', () => {
    const steps = resolveOnboardingSteps({ ...base, isEmailVerified: false });
    expect(steps[0]).toBe('verify-email');
  });
});
