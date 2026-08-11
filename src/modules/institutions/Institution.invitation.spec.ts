import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { InstitutionService, INVITATION_EXPIRY_DAYS } from './Institution.service';
import { PrismaService } from 'src/prisma/prisma.service';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

describe('InstitutionService — invitaciones', () => {
  let service: InstitutionService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      credentials: { findUnique: jest.fn() },
      institutionInvitation: {
        create: jest.fn().mockResolvedValue({ uid: 'inv-1', token: 'tok' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        InstitutionService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get(InstitutionService);
  });

  describe('createInvitation', () => {
    it('expira a los 3 días', async () => {
      expect(INVITATION_EXPIRY_DAYS).toBe(3);

      const antes = Date.now();
      await service.createInvitation({
        institutionId: 'inst-1', toEmail: 'a@b.com', targetRole: 'student',
      });
      const despues = Date.now();

      const { expiresAt } = prisma.institutionInvitation.create.mock.calls[0][0].data;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(antes + 3 * DAY_IN_MS);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(despues + 3 * DAY_IN_MS);
    });

    // Regresión del bug reportado: antes el caller mandaba expiresInDays y
    // podía estirar la invitación hasta 30 días. Hoy el campo no existe en el
    // DTO, pero si alguien lo reintroduce en el use case tiene que seguir sin
    // efecto — la expiración la fija el service.
    it('ignora cualquier duración que venga del caller', async () => {
      const antes = Date.now();
      await service.createInvitation({
        institutionId: 'inst-1', toEmail: 'a@b.com', targetRole: 'student',
        expiresInDays: 30,
      } as any);

      const { expiresAt } = prisma.institutionInvitation.create.mock.calls[0][0].data;
      expect(expiresAt.getTime()).toBeLessThan(antes + 4 * DAY_IN_MS);
    });
  });

  describe('getMyInvitations', () => {
    const invitacion = {
      uid: 'inv-1',
      token: 'tok-abc',
      targetRole: 'institutional',
      expiresAt: new Date(Date.now() + DAY_IN_MS),
      createdAt: new Date(),
      institution: { uid: 'inst-1', name: 'Universidad Santo Tomás', slug: 'usta' },
    };

    it('devuelve las invitaciones con los datos para pintar la tarjeta', async () => {
      prisma.credentials.findUnique.mockResolvedValue({ mail: 'a@b.com' });
      prisma.institutionInvitation.findMany.mockResolvedValue([invitacion]);

      const result = await service.getMyInvitations('user-1');

      expect(result).toEqual([invitacion]);
      expect(result[0].institution).toEqual({
        uid: 'inst-1', name: 'Universidad Santo Tomás', slug: 'usta',
      });
      expect(result[0].token).toBe('tok-abc');
      expect(result[0].targetRole).toBe('institutional');
    });

    it('devuelve lista vacía cuando no hay invitaciones vigentes', async () => {
      prisma.credentials.findUnique.mockResolvedValue({ mail: 'a@b.com' });
      prisma.institutionInvitation.findMany.mockResolvedValue([]);

      await expect(service.getMyInvitations('user-1')).resolves.toEqual([]);
    });

    it('busca por el correo de Credentials en la base, no por el uid del JWT', async () => {
      prisma.credentials.findUnique.mockResolvedValue({ mail: 'correo@real.com' });

      await service.getMyInvitations('user-1');

      expect(prisma.credentials.findUnique).toHaveBeenCalledWith({
        where: { uid: 'user-1' },
        select: { mail: true },
      });
      const { where } = prisma.institutionInvitation.findMany.mock.calls[0][0];
      expect(where.toEmail).toBe('correo@real.com');
    });

    // InstitutionInvitation es bootstrap: no hay extensión que agregue nada.
    // Estas dos condiciones son la única defensa contra mostrar invitaciones
    // ya respondidas o vencidas.
    it('filtra por status PENDING y expiresAt > ahora', async () => {
      prisma.credentials.findUnique.mockResolvedValue({ mail: 'a@b.com' });

      const antes = Date.now();
      await service.getMyInvitations('user-1');
      const despues = Date.now();

      const { where } = prisma.institutionInvitation.findMany.mock.calls[0][0];
      expect(where.status).toBe('PENDING');
      expect(where.expiresAt.gt).toBeInstanceOf(Date);
      expect(where.expiresAt.gt.getTime()).toBeGreaterThanOrEqual(antes);
      expect(where.expiresAt.gt.getTime()).toBeLessThanOrEqual(despues);
      expect(Object.keys(where).sort()).toEqual(['expiresAt', 'status', 'toEmail']);
    });

    it('lanza 404 si el usuario no tiene credenciales', async () => {
      prisma.credentials.findUnique.mockResolvedValue(null);

      await expect(service.getMyInvitations('fantasma')).rejects.toThrow(NotFoundException);
      expect(prisma.institutionInvitation.findMany).not.toHaveBeenCalled();
    });
  });
});
