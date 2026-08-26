import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './Categories.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      groupCategory: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      contentRequest: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(CategoriesService);
  });

  it('getActiveCategories returns only isActive: true rows', async () => {
    prisma.groupCategory.findMany.mockResolvedValue([{ uid: '1', slug: 'artes', isActive: true }]);
    const result = await service.getActiveCategories();
    expect(prisma.groupCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } })
    );
    expect(result).toHaveLength(1);
  });

  it('createCategory throws ConflictException on duplicate slug', async () => {
    prisma.groupCategory.findUnique.mockResolvedValue({ uid: 'existing' });
    await expect(service.createCategory({ name: 'Artes', slug: 'artes', iconSlug: 'palette' }))
      .rejects.toThrow(ConflictException);
  });

  it('createCategory creates row when slug is unique', async () => {
    prisma.groupCategory.findUnique.mockResolvedValue(null);
    prisma.groupCategory.create.mockResolvedValue({ uid: 'new-uid' });
    const result = await service.createCategory({ name: 'Literatura', slug: 'literatura', iconSlug: 'book' });
    expect(result).toEqual({ uid: 'new-uid' });
  });

  it('createContentRequest creates with PENDING status', async () => {
    prisma.contentRequest.create.mockResolvedValue({ uid: 'req-uid' });
    const result = await service.createContentRequest({
      institutionId: 'inst-uid',
      type: 'CATEGORY',
      requestedName: 'Fotografía',
    });
    expect(prisma.contentRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) })
    );
    expect(result).toEqual({ uid: 'req-uid' });
  });

  it('reviewContentRequest APPROVED creates GroupCategory for CATEGORY type', async () => {
    prisma.contentRequest.findUnique.mockResolvedValue({
      uid: 'req-uid', type: 'CATEGORY', requestedName: 'Fotografía', status: 'PENDING',
    });
    prisma.groupCategory.findUnique.mockResolvedValue(null);
    prisma.groupCategory.create.mockResolvedValue({ uid: 'new-cat-uid' });
    prisma.contentRequest.update.mockResolvedValue({});

    await service.reviewContentRequest({
      requestId: 'req-uid', reviewedBy: 'admin-uid', approved: true,
    });

    expect(prisma.groupCategory.create).toHaveBeenCalled();
    expect(prisma.contentRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED' }) })
    );
  });
});
