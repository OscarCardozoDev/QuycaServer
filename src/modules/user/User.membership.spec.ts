import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UserService } from './User.service';
import { CreateStudentDto } from './User.dto';

describe('UserService.createStudentUseCase', () => {
  let service: UserService;
  let prismaMock: any;
  let txMock: any;

  beforeEach(() => {
    txMock = {
      users: { create: jest.fn().mockResolvedValue({ uid: 'u1' }) },
      userInstitution: { create: jest.fn().mockResolvedValue({ uid: 'ui1' }) },
    };
    prismaMock = {
      // The role is resolved server-side by slug now (fix round 5) — self-registration
      // can only ever produce 'self-taught'. See task-11-report.md.
      roles: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ uid: 'self-taught-uid', slug: 'self-taught' }),
      },
      institution: { findUnique: jest.fn().mockResolvedValue({ uid: 'quyca-uid' }) },
      $transaction: jest.fn(async (cb: any) => cb(txMock)),
    };

    const configMock = { get: jest.fn().mockReturnValue('user-type-uid') };
    const photosMock = { createPhotoUseCase: jest.fn() };

    service = new UserService(prismaMock as any, photosMock as any, configMock as any);
  });

  it('crea la membresía self-taught en quyca-platform', async () => {
    await service.createStudentUseCase({
      uid: 'u1',
      user: {
        name: 'Juan', lastName: 'Pérez', username: 'juanp',
        gender: 'M', telNumber: '3001234567',
        roleData: {},
      },
    } as any);

    expect(prismaMock.roles.findUnique).toHaveBeenCalledWith({
      where: { slug: 'self-taught' },
      select: { uid: true, slug: true },
    });
    expect(prismaMock.institution.findUnique).toHaveBeenCalledWith({
      where: { slug: 'quyca-platform' },
      select: { uid: true },
    });
    expect(txMock.userInstitution.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        institutionId: 'quyca-uid',
        contextRole: 'self-taught',
      },
    });
  });

  it('produces a self-taught membership regardless of anything the caller sends — roleId has no effect', async () => {
    // roleId isn't on CreateStudentUseCase anymore; this cast simulates a caller that
    // bypasses the type system (or a DTO that somehow still let it through) trying to
    // influence the role the old way. The service never reads it, so the outcome must
    // be identical to the happy-path test above regardless of what "attacker-uid" is.
    await service.createStudentUseCase({
      uid: 'u1',
      user: {
        name: 'Juan', lastName: 'Pérez', username: 'juanp',
        gender: 'M', telNumber: '3001234567',
        roleData: {},
        roleId: 'attacker-supplied-rector-uid',
      },
    } as any);

    expect(prismaMock.roles.findUnique).toHaveBeenCalledWith({
      where: { slug: 'self-taught' },
      select: { uid: true, slug: true },
    });
    expect(txMock.users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: { connect: { uid: 'self-taught-uid' } },
        }),
      }),
    );
    expect(txMock.userInstitution.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        institutionId: 'quyca-uid',
        contextRole: 'self-taught',
      },
    });
  });
});

// A request that includes roleId must be rejected outright, the same way the real app
// rejects it: the global ValidationPipe (src/main.ts) runs with whitelist: true,
// forbidNonWhitelisted: true, so any property not decorated on the DTO fails validation
// before the controller method — let alone the service — ever runs.
describe('CreateStudentDto — roleId is no longer accepted', () => {
  it('rejects a payload that includes roleId', async () => {
    const instance = plainToInstance(CreateStudentDto, {
      name: 'Juan',
      lastName: 'Pérez',
      username: 'juanp',
      gender: 'M',
      telNumber: '3001234567',
      roleData: {},
      roleId: 'role-uid',
    });

    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.some((e) => e.property === 'roleId')).toBe(true);
  });

  it('accepts the same payload once roleId is removed', async () => {
    const instance = plainToInstance(CreateStudentDto, {
      name: 'Juan',
      lastName: 'Pérez',
      username: 'juanp',
      gender: 'M',
      telNumber: '3001234567',
      roleData: {},
    });

    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(0);
  });
});

/**
 * Prueba estructural: asserta la FORMA de la query a Prisma, no solo que el
 * resultado se vea bien. Es lo único que puede fijar el `where` anidado, que
 * no cambia ningún valor de retorno en un mock — y es justo el que evita
 * filtrar las membresías del usuario en OTRAS instituciones.
 */
describe('UserService.getActiveUsers — el rol viaja acotado a la institución', () => {
  let service: UserService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = { users: { findMany: jest.fn().mockResolvedValue([]) } };
    service = new UserService(prismaMock as any, {} as any, { get: jest.fn() } as any);
  });

  it('pide el contextRole de la institución consultada', async () => {
    await service.getActiveUsers('inst-a');

    const args = prismaMock.users.findMany.mock.calls[0][0];
    expect(args.select.userInstitutions.select).toEqual({
      contextRole: true,
      joinedAt: true,
    });
  });

  it('acota la membresía incluida a esa institución y solo a las activas', async () => {
    await service.getActiveUsers('inst-a');

    const args = prismaMock.users.findMany.mock.calls[0][0];
    expect(args.select.userInstitutions.where).toEqual({
      institutionId: 'inst-a',
      isActive: true,
    });
  });

  it('sigue filtrando los usuarios por membresía activa en esa institución', async () => {
    await service.getActiveUsers('inst-a');

    const args = prismaMock.users.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      isActive: true,
      userInstitutions: { some: { institutionId: 'inst-a', isActive: true } },
    });
  });
});
