import 'reflect-metadata';
import { CONTEXT_ROLE_KEY } from 'src/decorators/context-role.decorator';
import { ProductController } from 'src/modules/products/Product.controller';
import { ClassesController } from 'src/modules/classes/Classes.controller';
import { EventController } from 'src/modules/events/Event.controller';

/**
 * El contrato de roles que el sidebar da por cierto.
 *
 * `UstaGallery/src/lib/menu.ts` decide qué entrada ve cada rol a partir de esta
 * lista. Si alguien afloja o aprieta un @RequireContextRole sin pasar por la
 * matriz, el menú queda ofreciendo pantallas que devuelven 403 --que es
 * exactamente el bug que la matriz vino a cerrar.
 *
 * Ver obsidian/Raw/Specs/2026-08-23-matriz-de-permisos-design.md §6.
 */
const rolesOf = (handler: unknown) =>
  (Reflect.getMetadata(CONTEXT_ROLE_KEY, handler as object) as string[]) ?? [];

describe('contrato de roles del menú', () => {
  describe('obras: quien aprende produce', () => {
    it.each([
      ['create', ProductController.prototype.create],
      ['update', ProductController.prototype.update],
    ])('%s admite a los cuatro roles que producen', (_name, handler) => {
      expect(rolesOf(handler).sort()).toEqual(
        ['independent', 'institutional', 'self-taught', 'student'].sort(),
      );
    });

    it.each([
      ['approveManyProducts', ProductController.prototype.approveManyProducts],
      ['updateProductStatus', ProductController.prototype.updateProductStatus],
    ])('%s deja auditar a la institución, no al alumno', (_name, handler) => {
      const roles = rolesOf(handler);
      expect(roles.sort()).toEqual(['coordinator', 'institutional', 'rector'].sort());
      expect(roles).not.toContain('student');
      expect(roles).not.toContain('self-taught');
    });
  });

  describe('clases', () => {
    it('marca asistencia quien aprende, no quien la toma', () => {
      const roles = rolesOf(ClassesController.prototype.attend);
      expect(roles.sort()).toEqual(['independent', 'self-taught', 'student'].sort());
      expect(roles).not.toContain('institutional');
      expect(roles).not.toContain('rector');
    });
  });

  describe('eventos', () => {
    it('la cola de revisión es de la institución: el docente crea, no audita', () => {
      expect(rolesOf(EventController.prototype.getAll).sort()).toEqual(
        ['coordinator', 'rector'].sort(),
      );
    });

    it('crear evento lo pueden los tres roles con institución', () => {
      expect(rolesOf(EventController.prototype.create).sort()).toEqual(
        ['coordinator', 'institutional', 'rector'].sort(),
      );
    });
  });
});
