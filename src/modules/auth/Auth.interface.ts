export interface GetCredentialResult {
  uid: string;
  password: string;
  hasProfile?: boolean;
  hasGroup?: boolean;
  isEmailVerified?: boolean;
  userTypeId?: string | null;
}

export interface CredentialWithoutProfile {
  uid: string;
  mail: string;
  createdAt: Date;
}
