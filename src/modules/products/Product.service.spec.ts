import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProductService } from './Product.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { PhotosService } from 'src/modules/photos/Photos.service';

/**
 * `groupId` is a direct FK on `Products` supplied by the client. The tenant
 * extension only rewrites the top-level `where`/`data` of the call it
 * intercepts — it does NOT scope nested `include`/`select` relations
 * resolved by FK. An unchecked foreign groupId would let a `Products` row
 * (correctly stamped with the caller's own institutionId by the extension)
 * point at another tenant's group, and any read that nests `group: {...}`
 * off of it would leak that foreign group's data. `groups.findUnique` is
 * itself scoped, so a foreign id simply comes back null — see
 * `Product.service.ts`'s `assertGroupInTenant`.
 */
describe('ProductService — groupId tenant guard', () => {
  let service: ProductService;
  let prisma: any;
  let photosService: any;

  beforeEach(async () => {
    prisma = {
      groups: { findUnique: jest.fn() },
      userInstitution: { findMany: jest.fn() },
      styles: { findMany: jest.fn() },
      products: { create: jest.fn() },
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    photosService = { createPhotoUseCase: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: PrismaService, useValue: prisma },
        { provide: PhotosService, useValue: photosService },
      ],
    }).compile();

    service = module.get(ProductService);
  });

  const baseData = {
    product: {
      name: 'Obra',
      description: 'Descripción',
      madeAt: new Date('2026-01-01'),
      groupId: 'foreign-group',
    },
    authors: [],
    institutionId: 'inst-1',
  };

  it('throws NotFoundException for a groupId outside the active tenant and writes nothing', async () => {
    prisma.groups.findUnique.mockResolvedValue(null); // extension scoped it out

    await expect(service.createProductUseCase(baseData)).rejects.toThrow(
      NotFoundException,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.products.create).not.toHaveBeenCalled();
    expect(photosService.createPhotoUseCase).not.toHaveBeenCalled();
  });

  it('proceeds past the guard when the group belongs to the active tenant', async () => {
    prisma.groups.findUnique.mockResolvedValue({ uid: 'group-1' });
    prisma.products.create.mockResolvedValue({ uid: 'product-1' });

    const result = await service.createProductUseCase({
      ...baseData,
      product: { ...baseData.product, groupId: 'group-1' },
    });

    expect(result).toEqual({ uid: 'product-1', photos: [] });
    expect(prisma.products.create).toHaveBeenCalled();
  });
});
