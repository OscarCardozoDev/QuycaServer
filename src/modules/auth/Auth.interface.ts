import { OnboardingStep } from './onboarding-steps';

export interface GetCredentialResult {
  uid: string;
  password: string;
  userTypeId?: string | null;
  /** Pasos pendientes del alta, en orden. Vacío = va directo al dashboard. */
  nextSteps: OnboardingStep[];
}

export interface CredentialWithoutProfile {
  uid: string;
  mail: string;
  createdAt: Date;
}
