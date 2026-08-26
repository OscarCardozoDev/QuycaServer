import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SqlInjectionGuard } from './sql.guard';

function contextWithBody(body: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ body, query: {}, params: {}, url: '/lessons/x/chapters', ip: '::1' }),
    }),
  } as unknown as ExecutionContext;
}

describe('SqlInjectionGuard — el Markdown de un capítulo no es una inyección', () => {
  const guard = new SqlInjectionGuard();

  it('deja pasar un separador horizontal de Markdown', () => {
    const body = { title: 'Las cuerdas', contentMd: '# Las cuerdas\n\n---\n\nSon seis.' };

    expect(guard.canActivate(contextWithBody(body))).toBe(true);
  });

  it('deja pasar un bloque de código con comentarios /* */', () => {
    const body = {
      title: 'Afinación',
      contentMd: '```css\n/* color de la cuerda mi */\n.mi { color: red; }\n```',
    };

    expect(guard.canActivate(contextWithBody(body))).toBe(true);
  });

  it('deja pasar una lección que enseña SQL', () => {
    const body = { title: 'Consultas', contentMd: 'Ejemplo:\n\n```sql\nSELECT * FROM notas;\n```' };

    expect(guard.canActivate(contextWithBody(body))).toBe(true);
  });

  // El guard sigue sirviendo para todo lo demás: la exclusión es por campo,
  // no global.
  it('sigue rechazando una inyección en un campo normal', () => {
    const body = { title: "x'; DROP TABLE Lessons; --", contentMd: 'hola' };

    expect(() => guard.canActivate(contextWithBody(body))).toThrow(ForbiddenException);
  });
});
