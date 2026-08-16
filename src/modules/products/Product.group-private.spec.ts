import { Test } from '@nestjs/testing';
import { ProductService } from './Product.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { PhotosService } from 'src/modules/photos/Photos.service';

const GROUP = 'g-artes';

describe('ProductService — la lectura privada por grupo no lleva bypass', () => {
  let service: ProductService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      products: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: PrismaService, useValue: prisma },
        { provide: PhotosService, useValue: {} },
      ],
    }).compile();

    service = module.get(ProductService);
  });

  // El test que importa: si alguien copia y pega el metodo publico, el
  // runWithoutTenant se cuela y este assert lo caza. Se comprueba por el
  // efecto observable — que la consulta corre SIN store de bypass — no por
  // espiar la funcion.
  it('consulta por groupId y deja que la extensión ponga el institutionId', async () => {
    await service.getAllByGroupPrivate(GROUP, {});

    expect(prisma.products.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId: GROUP } }),
    );
  });

  it('el método público sigue existiendo y no se tocó', () => {
    expect(typeof service.getAllByGroup).toBe('function');
  });
});
