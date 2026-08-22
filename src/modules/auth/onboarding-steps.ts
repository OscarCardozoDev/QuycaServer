/**
 * Pasos pendientes del alta, en el orden en que hay que resolverlos.
 *
 * Son NOMBRES DE ESTADO PENDIENTE, no pantallas ni rutas: el backend no
 * conoce la forma del wizard. El frontend mapea cada uno a un componente.
 *
 * Reemplazan a los booleanos hasProfile/hasGroup/isEmailVerified, que ya eran
 * una lista de pasos disfrazada y encima incompleta — por eso el rector caía
 * en "crear perfil" teniendo perfil. Ver
 * obsidian/Decisiones/Pasos-de-Onboarding-desde-el-Backend.md
 */
export const ONBOARDING_STEPS = [
  'verify-email',
  'create-profile',
  'choose-platform-group',
  'choose-plan',
  'accept-invitation',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingState {
  isEmailVerified: boolean;
  hasProfile: boolean;
  hasPendingInvitation: boolean;
  /** Tiene alguna membresía activa con contextRole 'rector'. */
  isRector: boolean;
  /** Rector cuya institución todavía no decidió plan (planChosenAt null). */
  institutionNeedsPlan: boolean;
  /** Ya pertenece a algún grupo de quyca-platform. */
  hasPlatformGroup: boolean;
}

export function resolveOnboardingSteps(
  state: OnboardingState,
): OnboardingStep[] {
  const steps: OnboardingStep[] = [];

  if (!state.isEmailVerified) steps.push('verify-email');
  if (!state.hasProfile) steps.push('create-profile');

  // La invitación gana: un profesor invitado no debe ser empujado a elegir
  // una disciplina artística de plataforma para poder llegar a su invitación.
  if (state.hasPendingInvitation) {
    steps.push('accept-invitation');
    return steps;
  }

  if (state.isRector) {
    if (state.institutionNeedsPlan) steps.push('choose-plan');
    return steps;
  }

  if (!state.hasPlatformGroup) steps.push('choose-platform-group');

  return steps;
}
