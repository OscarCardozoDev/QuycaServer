import { UserService } from './User.service';

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
      roles: { findUnique: jest.fn().mockResolvedValue({ slug: 'student' }) },
      institution: { findUnique: jest.fn().mockResolvedValue({ uid: 'quyca-uid' }) },
      $transaction: jest.fn(async (cb: any) => cb(txMock)),
    };

    const configMock = { get: jest.fn().mockReturnValue('user-type-uid') };
    const photosMock = { createPhotoUseCase: jest.fn() };

    service = new UserService(prismaMock as any, photosMock as any, configMock as any);
  });

  it('crea la membresía en quyca-platform', async () => {
    await service.createStudentUseCase({
      uid: 'u1',
      user: {
        name: 'Juan', lastName: 'Pérez', username: 'juanp',
        gender: 'M', telNumber: '3001234567',
        roleId: 'role-uid', roleData: {},
      },
    } as any);

    expect(prismaMock.institution.findUnique).toHaveBeenCalledWith({
      where: { slug: 'quyca-platform' },
      select: { uid: true },
    });
    expect(txMock.userInstitution.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        institutionId: 'quyca-uid',
        contextRole: 'student',
      },
    });
  });
});
