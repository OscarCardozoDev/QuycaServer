import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UserService } from './User.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { PhotosService } from 'src/modules/photos/Photos.service';
import { ConfigService } from '@nestjs/config';

const mockPrisma = {
  users: { findUnique: jest.fn(), update: jest.fn() },
  userInstitution: { findFirst: jest.fn() },
};

const mockPhotos = {
  createPhotoUseCase: jest.fn(),
  deletePhotoUseCase: jest.fn(),
};

describe('UserService.updateUserPhoto', () => {
  let service: UserService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PhotosService, useValue: mockPhotos },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = module.get(UserService);
    jest.clearAllMocks();
  });

  const NEW_PHOTO = { uid: 'photo-new', name: 'new.jpg', url: '/images/new.jpg' };

  it('throws NotFoundException when user does not exist', async () => {
    mockPrisma.users.findUnique.mockResolvedValue(null);
    await expect(
      service.updateUserPhoto('u1', { base64: 'b64', name: 'img.jpg', folder: 'users' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('deletes old photo when user has an existing photo', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({ uid: 'u1', photoId: 'photo-old' });
    mockPhotos.createPhotoUseCase.mockResolvedValue(NEW_PHOTO);
    mockPrisma.users.update.mockResolvedValue({ uid: 'u1' });
    mockPhotos.deletePhotoUseCase.mockResolvedValue(undefined);

    await service.updateUserPhoto('u1', { base64: 'b64', name: 'img.jpg', folder: 'users' });

    expect(mockPhotos.deletePhotoUseCase).toHaveBeenCalledWith('photo-old');
  });

  it('does NOT call deletePhotoUseCase when user has no existing photo', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({ uid: 'u1', photoId: null });
    mockPhotos.createPhotoUseCase.mockResolvedValue(NEW_PHOTO);
    mockPrisma.users.update.mockResolvedValue({ uid: 'u1' });

    await service.updateUserPhoto('u1', { base64: 'b64', name: 'img.jpg', folder: 'users' });

    expect(mockPhotos.deletePhotoUseCase).not.toHaveBeenCalled();
  });
});

// Task 11 fix round 2: PUT /user/:uid and PATCH /user/:uid/deactivate must not let a
// rector/coordinator of one institution act on a user who isn't an active member of
// their own institution. See task-11-report.md, Finding A, for the exploit chain this
// closes (self-register an institution → become its rector → reach any user platform-wide).
describe('UserService — institution-scoped admin actions', () => {
  let service: UserService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PhotosService, useValue: mockPhotos },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = module.get(UserService);
    jest.clearAllMocks();
  });

  describe('updateUser', () => {
    it('throws NotFoundException and issues no update when the target uid is not an active member of the active institution', async () => {
      mockPrisma.userInstitution.findFirst.mockResolvedValue(null);

      await expect(
        service.updateUser('other-uid', { name: 'Hacked' }, 'inst-active'),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.userInstitution.findFirst).toHaveBeenCalledWith({
        where: { userId: 'other-uid', institutionId: 'inst-active', isActive: true },
      });
      expect(mockPrisma.users.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.users.update).not.toHaveBeenCalled();
    });

    it('proceeds when the target uid IS an active member of the active institution', async () => {
      mockPrisma.userInstitution.findFirst.mockResolvedValue({ uid: 'ui1' });
      mockPrisma.users.findUnique.mockResolvedValue({ uid: 'u1' });
      mockPrisma.users.update.mockResolvedValue({ uid: 'u1' });

      const result = await service.updateUser('u1', { name: 'Juan' }, 'inst-active');

      expect(result).toEqual({ uid: 'u1' });
      expect(mockPrisma.users.update).toHaveBeenCalledWith({
        where: { uid: 'u1' },
        data: { name: 'Juan' },
        select: { uid: true },
      });
    });

    it('drops userTypeId even if present on the payload — cannot be used to change platform-level type', async () => {
      mockPrisma.users.findUnique.mockResolvedValue({ uid: 'u1' });
      mockPrisma.users.update.mockResolvedValue({ uid: 'u1' });

      // No institutionId here on purpose: this is the self-service path
      // (PUT /user/update), which never carries one. userTypeId isn't on
      // UpdateUserDto anymore, so this cast simulates a caller bypassing
      // the type system / DTO layer to smuggle it in anyway.
      await service.updateUser('u1', {
        name: 'Juan',
        userTypeId: '00000000-0000-4000-8000-000000000001',
      } as any);

      expect(mockPrisma.users.update).toHaveBeenCalledWith({
        where: { uid: 'u1' },
        data: { name: 'Juan' },
        select: { uid: true },
      });
    });
  });

  describe('deactivateUser', () => {
    it('throws NotFoundException and issues no update when the target uid is not an active member of the active institution', async () => {
      mockPrisma.userInstitution.findFirst.mockResolvedValue(null);

      await expect(
        service.deactivateUser('other-uid', 'inst-active'),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.userInstitution.findFirst).toHaveBeenCalledWith({
        where: { userId: 'other-uid', institutionId: 'inst-active', isActive: true },
      });
      expect(mockPrisma.users.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.users.update).not.toHaveBeenCalled();
    });

    it('proceeds when the target uid IS an active member of the active institution', async () => {
      mockPrisma.userInstitution.findFirst.mockResolvedValue({ uid: 'ui1' });
      mockPrisma.users.findUnique.mockResolvedValue({ uid: 'u1' });
      mockPrisma.users.update.mockResolvedValue({ uid: 'u1' });

      const result = await service.deactivateUser('u1', 'inst-active');

      expect(result).toEqual({ uid: 'u1' });
      expect(mockPrisma.users.update).toHaveBeenCalled();
    });
  });
});
