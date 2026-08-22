import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InstitutionService } from './Institution.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { FEATURE_LABELS } from './plan-features';

describe('InstitutionService.listPlans', () => {
  let service: InstitutionService;
  let prisma: any;

  beforeEach(async () => {
    prisma = { subscriptionPlan: { findMany: jest.fn().mockResolvedValue([]) } };

    const module = await Test.createTestingModule({
      providers: [
        InstitutionService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get(InstitutionService);
  });

  it('devuelve solo los planes activos', async () => {
    await service.listPlans();

    expect(prisma.subscriptionPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it('no expone el stripePriceId', async () => {
    prisma.subscriptionPlan.findMany.mockResolvedValue([
      { uid: 'p1', slug: 'empirico', name: 'Empírico', features: [], priceUsd: 0 },
    ]);

    const [plan] = await service.listPlans();

    // Ni en el select que se le pide a Prisma, ni en lo que sale por la API.
    const args = prisma.subscriptionPlan.findMany.mock.calls[0][0];
    expect(args.select.stripePriceId).toBeUndefined();
    expect(plan).not.toHaveProperty('stripePriceId');
  });

  it('agrega las etiquetas legibles sin tocar los slugs', async () => {
    prisma.subscriptionPlan.findMany.mockResolvedValue([
      { uid: 'p1', slug: 'academia', name: 'Academia', features: ['groups_create', 'analytics'] },
    ]);

    const [plan] = await service.listPlans();

    // Los slugs siguen crudos: son el contrato de FeatureGuard.
    expect(plan.features).toEqual(['groups_create', 'analytics']);
    expect(plan.featureLabels).toEqual([
      { slug: 'groups_create', label: FEATURE_LABELS.groups_create },
      { slug: 'analytics', label: FEATURE_LABELS.analytics },
    ]);
    expect(plan.featureLabels.every((f) => f.label !== f.slug)).toBe(true);
  });

  it('un feature sin etiqueta cae de vuelta al slug en vez de desaparecer', async () => {
    prisma.subscriptionPlan.findMany.mockResolvedValue([
      { uid: 'p1', slug: 'raro', name: 'Raro', features: ['profile', 'feature_inventado'] },
    ]);

    const [plan] = await service.listPlans();

    expect(plan.featureLabels).toHaveLength(2);
    expect(plan.featureLabels[1]).toEqual({
      slug: 'feature_inventado', label: 'feature_inventado',
    });
  });

  it('tolera un features que no sea array (columna Json)', async () => {
    prisma.subscriptionPlan.findMany.mockResolvedValue([
      { uid: 'p1', slug: 'roto', name: 'Roto', features: null },
    ]);

    const [plan] = await service.listPlans();

    expect(plan.featureLabels).toEqual([]);
  });
});
