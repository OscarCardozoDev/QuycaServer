import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StylesService } from './Styles.service';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * `groupId` is a direct FK on `Styles` supplied by the client. The tenant
 * extension only rewrites the top-level `where`/`data` of the call it
 * intercepts — it does NOT scope nested `include`/`select` relations
 * resolved by FK. An unchecked foreign groupId would let a `Styles` row
 * (correctly stamped with the caller's own institutionId by the extension)
 * point at another tenant's group. `groups.findUnique` is itself scoped, so
 * a foreign id simply comes back null — see `Styles.service.ts`'s
 * `assertGroupInTenant`.
 *
 * `categoryId` is deliberately NOT guarded: `GroupCategory` is a global,
 * platform-level catalog (no `institutionId`, not in SCOPED_MODELS, managed
 * only by `super_admin`) shared by every institution.
 */
describe('StylesService — groupId tenant guard', () => {
  let service: StylesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      groups: { findUnique: jest.fn() },
      styles: { create: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [StylesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(StylesService);
  });

  const baseData = {
    name: 'Expresionismo',
    description: 'Estilo caracterizado por la distorsión emocional',
    groupId: 'foreign-group',
    categoryId: 'cat-1',
    institutionId: 'inst-1',
  };

  it('throws NotFoundException for a groupId outside the active tenant and writes nothing', async () => {
    prisma.groups.findUnique.mockResolvedValue(null); // extension scoped it out

    await expect(service.create(baseData)).rejects.toThrow(NotFoundException);
    expect(prisma.styles.create).not.toHaveBeenCalled();
  });

  it('creates the style when the group belongs to the active tenant', async () => {
    prisma.groups.findUnique.mockResolvedValue({ uid: 'group-1' });
    prisma.styles.create.mockResolvedValue({ uid: 'style-1' });

    const result = await service.create({ ...baseData, groupId: 'group-1' });

    expect(result).toEqual({ uid: 'style-1' });
    expect(prisma.styles.create).toHaveBeenCalledWith({
      data: {
        name: baseData.name,
        description: baseData.description,
        groupId: 'group-1',
        categoryId: baseData.categoryId,
        institutionId: baseData.institutionId,
      },
      select: { uid: true },
    });
  });
});
