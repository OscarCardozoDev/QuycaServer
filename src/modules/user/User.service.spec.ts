import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UserService } from './User.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { PhotosService } from 'src/modules/photos/Photos.service';
import { ConfigService } from '@nestjs/config';

const mockPrisma = {
  users: { findUnique: jest.fn(), update: jest.fn() },
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
