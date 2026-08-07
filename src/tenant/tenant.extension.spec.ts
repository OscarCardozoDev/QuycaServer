import { ForbiddenException } from '@nestjs/common';
import { tenantStorage } from './tenant-context';
import { SCOPED_MODELS, resolveTenantAction } from './tenant.extension';

describe('SCOPED_MODELS', () => {
  it('incluye los 8 modelos scoped', () => {
    expect([...SCOPED_MODELS].sort()).toEqual([
      'Attendance', 'Classes', 'ContentRequest', 'Events',
      'Groups', 'Products', 'Schedule', 'Styles',
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
