import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GroupService } from './Group.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('GroupService — desactivar en vez de borrar', () => {
  let service: GroupService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      groups: {
        findUnique: jest.fn().mockResolvedValue({ uid: 'g1' }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ uid: 'g1' }),
        delete: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        GroupService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get(GroupService);
  });

  // Un grupo con obras, estudiantes y horarios tiraba violacion de FK y salia
  // como 500. isActive existia desde siempre y no lo usaba nadie.
  it('desactiva el grupo en vez de borrar la fila', async () => {
    await service.deleteGroup('g1');

    expect(prisma.groups.update).toHaveBeenCalledWith({
      where: { uid: 'g1' },
      data: { isActive: false },
    });
    expect(prisma.groups.delete).not.toHaveBeenCalled();
  });

  it('tira 404 si el grupo no existe', async () => {
    prisma.groups.findUnique.mockResolvedValue(null);

    await expect(service.deleteGroup('fantasma')).rejects.toThrow(NotFoundException);
  });

  it('la lista deja fuera los desactivados', async () => {
    await service.getAll({});

    expect(prisma.groups.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });
});
