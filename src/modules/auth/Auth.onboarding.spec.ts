import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './Auth.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('AuthService.getCredentialByEmail — estado de onboarding', () => {
  let service: AuthService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      credentials: {
        findUnique: jest.fn().mockResolvedValue({
          uid: 'u1', password: 'hash', mail: 'a@b.com', isEmailVerified: true,
        }),
      },
      users: { findUnique: jest.fn().mockResolvedValue({ userTypeId: 'ut1' }) },
      usersGroups: { findFirst: jest.fn().mockResolvedValue(null) },
      userInstitution: { findMany: jest.fn().mockResolvedValue([]) },
      institutionInvitation: { findFirst: jest.fn().mockResolvedValue(null) },
      institution: { findUnique: jest.fn().mockResolvedValue({ uid: 'platform-uid' }) },
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('un artista sin grupo recibe choose-platform-group', async () => {
    const result = await service.getCredentialByEmail('a@b.com');
    expect(result?.nextSteps).toEqual(['choose-platform-group']);
  });

  it('un rector con plan sin decidir recibe choose-plan', async () => {
    prisma.userInstitution.findMany.mockResolvedValue([
      { contextRole: 'rector', institution: { planChosenAt: null } },
    ]);

    const result = await service.getCredentialByEmail('a@b.com');
    expect(result?.nextSteps).toEqual(['choose-plan']);
  });

  it('una invitación pendiente gana', async () => {
    prisma.institutionInvitation.findFirst.mockResolvedValue({ uid: 'inv1' });

    const result = await service.getCredentialByEmail('a@b.com');
    expect(result?.nextSteps).toEqual(['accept-invitation']);
  });

  it('busca la invitación por el correo de la credencial y solo las PENDING vigentes', async () => {
    await service.getCredentialByEmail('a@b.com');

    expect(prisma.institutionInvitation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          toEmail: 'a@b.com',
          status: 'PENDING',
          expiresAt: { gt: expect.any(Date) },
        }),
      }),
    );
  });

  // Pruebas estructurales: assertan la FORMA del `where`, no un valor de
  // retorno — el mock de Jest devuelve lo configurado sin mirar el filtro
  // que recibe, así que solo esto puede fijarlo. Sin esto, alguien podría
  // borrar `isActive: true` o cambiar el filtro de UsersGroups a `{ userId }`
  // suelto y la suite entera seguiría en verde. Mismo patrón que
  // User.membership.spec.ts y Group.platform-limit.spec.ts.

  it('busca las membresías del usuario acotadas a las activas', async () => {
    await service.getCredentialByEmail('a@b.com');

    expect(prisma.userInstitution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', isActive: true },
      }),
    );
  });

  it('el grupo de plataforma se busca atravesando la relación al grupo, no por userId suelto', async () => {
    // UsersGroups es tabla puente sin institutionId propio: filtrar solo por
    // userId devolvería grupos de CUALQUIER institución, no solo la de
    // plataforma. Esto fija que el filtro atraviesa group.institutionId.
    await service.getCredentialByEmail('a@b.com');

    expect(prisma.usersGroups.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', group: { institutionId: 'platform-uid' } },
      }),
    );
  });
});
