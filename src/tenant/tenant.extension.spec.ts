import { ForbiddenException } from '@nestjs/common';
import { tenantStorage } from './tenant-context';
import {
  SCOPED_MODELS,
  resolveTenantAction,
  buildScopedArgs,
  resolveScopedArgs,
} from './tenant.extension';

describe('SCOPED_MODELS', () => {
  // `Styles` salió el 2026-08-24: perdió `institutionId` y pasó a ser catálogo
  // de plataforma por categoría, como GroupCategory.
  it('incluye los 9 modelos scoped', () => {
    expect([...SCOPED_MODELS].sort()).toEqual([
      'Attendance', 'Chapters', 'Classes', 'ContentRequest', 'Events',
      'Groups', 'Lessons', 'Products', 'Schedule',
    ]);
  });

  it('excluye los modelos de bootstrap', () => {
    expect(SCOPED_MODELS.has('Institution')).toBe(false);
    expect(SCOPED_MODELS.has('UserInstitution')).toBe(false);
    expect(SCOPED_MODELS.has('InstitutionInvitation')).toBe(false);
  });
});

describe('resolveTenantAction', () => {
  it('no filtra modelos fuera de la lista', () => {
    const store = { institutionId: 'inst-a', bypass: false };
    tenantStorage.run(store, () => {
      expect(resolveTenantAction('Users')).toEqual({ skip: true });
    });
  });

  it('no filtra cuando no hay store — seed o script CLI', () => {
    expect(resolveTenantAction('Groups')).toEqual({ skip: true });
  });

  it('no filtra cuando bypass está activo', () => {
    const store = { institutionId: 'inst-a', bypass: true };
    tenantStorage.run(store, () => {
      expect(resolveTenantAction('Groups')).toEqual({ skip: true });
    });
  });

  it('devuelve el institutionId cuando hay tenant resuelto', () => {
    const store = { institutionId: 'inst-a', bypass: false };
    tenantStorage.run(store, () => {
      expect(resolveTenantAction('Groups')).toEqual({
        skip: false,
        institutionId: 'inst-a',
      });
    });
  });

  it('falla cerrado: store sin institución y sin bypass', () => {
    const store = { institutionId: null, bypass: false };
    tenantStorage.run(store, () => {
      expect(() => resolveTenantAction('Groups')).toThrow(ForbiddenException);
    });
  });
});

describe('buildScopedArgs', () => {
  const inst = 'inst-a';

  it('inyecta el where en findMany', () => {
    const args = buildScopedArgs('findMany', { where: { isActive: true } }, inst);
    expect(args.where).toEqual({
      AND: [{ isActive: true }, { institutionId: inst }],
    });
  });

  it('inyecta el where en findMany sin where previo', () => {
    const args = buildScopedArgs('findMany', {}, inst);
    expect(args.where).toEqual({ AND: [{}, { institutionId: inst }] });
  });

  // Las operaciones que toman WhereUniqueInput reciben el filtro PLANO, no
  // envuelto en AND: Prisma exige que el campo único sea propiedad directa del
  // objeto. Ver UNIQUE_WHERE_OPERATIONS en tenant.extension.ts.
  it.each(['findUnique', 'findUniqueOrThrow', 'update', 'delete', 'upsert'])(
    'inyecta el where PLANO en %s',
    (operation) => {
      const args = buildScopedArgs(operation, { where: { uid: 'g1' } }, inst);
      expect(args.where).toEqual({ uid: 'g1', institutionId: inst });
    },
  );

  it('el where plano SOBRESCRIBE un institutionId de otro tenant', () => {
    const args = buildScopedArgs(
      'findUnique',
      { where: { uid: 'g1', institutionId: 'inst-INTRUSA' } },
      inst,
    );
    expect(args.where).toEqual({ uid: 'g1', institutionId: inst });
  });

  it('conserva una clave única compuesta al inyectar plano', () => {
    const args = buildScopedArgs(
      'findUnique',
      { where: { classId_userId: { classId: 'c1', userId: 'u1' } } },
      inst,
    );
    expect(args.where).toEqual({
      classId_userId: { classId: 'c1', userId: 'u1' },
      institutionId: inst,
    });
  });

  it('inyecta institutionId en create', () => {
    const args = buildScopedArgs('create', { data: { name: 'Grupo A' } }, inst);
    expect(args.data).toEqual({ name: 'Grupo A', institutionId: inst });
  });

  it('SOBRESCRIBE un institutionId de otro tenant en create', () => {
    const args = buildScopedArgs(
      'create',
      { data: { name: 'Grupo A', institutionId: 'inst-INTRUSA' } },
      inst,
    );
    expect(args.data).toEqual({ name: 'Grupo A', institutionId: inst });
  });

  it('SOBRESCRIBE institutionId en cada fila de createMany', () => {
    const args = buildScopedArgs(
      'createMany',
      { data: [{ name: 'A', institutionId: 'inst-INTRUSA' }, { name: 'B' }] },
      inst,
    );
    expect(args.data).toEqual([
      { name: 'A', institutionId: inst },
      { name: 'B', institutionId: inst },
    ]);
  });

  it('inyecta institutionId en cada fila de createMany', () => {
    const args = buildScopedArgs('createMany', { data: [{ name: 'A' }, { name: 'B' }] }, inst);
    expect(args.data).toEqual([
      { name: 'A', institutionId: inst },
      { name: 'B', institutionId: inst },
    ]);
  });

  it('inyecta where y create en upsert', () => {
    const args = buildScopedArgs(
      'upsert',
      { where: { uid: 'g1' }, create: { name: 'A' }, update: { name: 'B' } },
      inst,
    );
    expect(args.where).toEqual({ uid: 'g1', institutionId: inst });
    expect(args.create).toEqual({ name: 'A', institutionId: inst });
    expect(args.update).toEqual({ name: 'B' });
  });

  it('inyecta el where en updateMany', () => {
    const args = buildScopedArgs('updateMany', { where: {}, data: { isActive: false } }, inst);
    expect(args.where).toEqual({ AND: [{}, { institutionId: inst }] });
    expect(args.data).toEqual({ isActive: false });
  });

  it('no muta el objeto original', () => {
    const original = { where: { uid: 'g1' } };
    buildScopedArgs('findUnique', original, inst);
    expect(original.where).toEqual({ uid: 'g1' });
  });

  it('inyecta institutionId en cada fila de createManyAndReturn', () => {
    const args = buildScopedArgs(
      'createManyAndReturn',
      { data: [{ name: 'A' }, { name: 'B' }] },
      inst,
    );
    expect(args.data).toEqual([
      { name: 'A', institutionId: inst },
      { name: 'B', institutionId: inst },
    ]);
  });

  it('SOBRESCRIBE institutionId en cada fila de createManyAndReturn', () => {
    const args = buildScopedArgs(
      'createManyAndReturn',
      { data: [{ name: 'A', institutionId: 'inst-INTRUSA' }, { name: 'B' }] },
      inst,
    );
    expect(args.data).toEqual([
      { name: 'A', institutionId: inst },
      { name: 'B', institutionId: inst },
    ]);
  });

  it('inyecta el where en updateManyAndReturn', () => {
    const args = buildScopedArgs(
      'updateManyAndReturn',
      { where: {}, data: { isActive: false } },
      inst,
    );
    expect(args.where).toEqual({ AND: [{}, { institutionId: inst }] });
    expect(args.data).toEqual({ isActive: false });
  });

  it('lanza para una operación desconocida', () => {
    expect(() => buildScopedArgs('someFutureOp', {}, inst, 'Groups')).toThrow(
      /someFutureOp.*Groups/,
    );
  });
});

describe('resolveScopedArgs', () => {
  it('lanza cuando la operación es desconocida en un modelo scoped con tenant resuelto', () => {
    const store = { institutionId: 'inst-a', bypass: false };
    tenantStorage.run(store, () => {
      expect(() => resolveScopedArgs('Groups', 'someFutureOp', {})).toThrow(
        /someFutureOp.*Groups/,
      );
    });
  });

  it('no lanza y deja los args intactos para una operación desconocida en un modelo no scoped', () => {
    const args = { foo: 'bar' };
    expect(resolveScopedArgs('Users', 'someFutureOp', args)).toBe(args);
  });

  it('no lanza y deja los args intactos cuando no hay store (seed/script CLI)', () => {
    const args = { foo: 'bar' };
    expect(resolveScopedArgs('Groups', 'someFutureOp', args)).toBe(args);
  });

  it('no lanza y deja los args intactos bajo bypass', () => {
    const store = { institutionId: 'inst-a', bypass: true };
    const args = { foo: 'bar' };
    tenantStorage.run(store, () => {
      expect(resolveScopedArgs('Groups', 'someFutureOp', args)).toBe(args);
    });
  });

  it('reescribe los args para una operación conocida en un modelo scoped', () => {
    const store = { institutionId: 'inst-a', bypass: false };
    tenantStorage.run(store, () => {
      const args = resolveScopedArgs('Groups', 'findMany', { where: { isActive: true } });
      expect(args.where).toEqual({
        AND: [{ isActive: true }, { institutionId: 'inst-a' }],
      });
    });
  });
});
