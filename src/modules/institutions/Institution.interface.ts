export interface CreateInstitutionUseCase {
  name: string;
  slug: string;
  type: 'EDUCATIONAL' | 'INDEPENDENT';
  planSlug: string;
  representativeName: string;
  representativeLastName: string;
  email: string;
  password: string;
}

export interface CreateInvitationUseCase {
  institutionId: string;
  toEmail: string;
  targetRole: 'institutional' | 'student';
  expiresInDays?: number;
}

export interface RespondInvitationUseCase {
  token: string;
  userId: string;
  accept: boolean;
}
