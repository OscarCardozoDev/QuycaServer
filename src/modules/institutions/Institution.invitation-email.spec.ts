import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InstitutionService, INVITATION_EXPIRY_DAYS } from './Institution.service';
import { PrismaService } from 'src/prisma/prisma.service';

// Resend queda mockeado a nivel de módulo: ningún test manda un correo real.
const send = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
}));

const CONFIG: Record<string, string> = {
  'config.emailFrom': 'Quyca <no-reply@quyca.app>',
  'config.resendKey': 're_test_key',
  'config.frontendUrl': 'https://app.quyca.co',
};

describe('InstitutionService — correo de invitación', () => {
  let service: InstitutionService;
  let prisma: any;
  let config: Record<string, string>;
  let errorSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    config = { ...CONFIG };
    send.mockResolvedValue({ error: null });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    prisma = {
      institutionInvitation: {
        create: jest.fn().mockResolvedValue({ uid: 'inv-1', token: 'tok-abc' }),
      },
      institution: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Universidad Santo Tomás' }),
      },
      roles: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Docente institucional' }),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        InstitutionService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (key: string) => config[key] } },
      ],
    }).compile();

    service = module.get(InstitutionService);
  });

  afterEach(() => errorSpy.mockRestore());

  const invitar = () =>
    service.createInvitation({
      institutionId: 'inst-1',
      toEmail: 'profe@correo.com',
      targetRole: 'institutional',
    });

  it('manda el correo al invitado con el link absoluto al token', async () => {
    await invitar();

    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0][0];
    expect(payload.to).toBe('profe@correo.com');
    expect(payload.from).toBe(CONFIG['config.emailFrom']);
    expect(payload.text).toContain('https://app.quyca.co/invitation/');
  });

  // El token del correo tiene que ser el mismo que quedó guardado: si el link
  // lleva otro, el invitado abre una invitación que no existe.
  it('el link lleva el token que se guardó en la invitación', async () => {
    await invitar();

    const { token } = prisma.institutionInvitation.create.mock.calls[0][0].data;
    expect(send.mock.calls[0][0].text).toContain(`https://app.quyca.co/invitation/${token}`);
  });

  it('no duplica la barra si frontendUrl termina en /', async () => {
    config['config.frontendUrl'] = 'https://app.quyca.co/';

    await invitar();

    expect(send.mock.calls[0][0].text).toContain('https://app.quyca.co/invitation/');
    expect(send.mock.calls[0][0].text).not.toContain('quyca.co//invitation');
  });

  it('dice qué institución invita, con qué rol y cuándo vence', async () => {
    await invitar();

    const { subject, text } = send.mock.calls[0][0];
    expect(subject).toContain('Universidad Santo Tomás');
    expect(text).toContain('Universidad Santo Tomás');
    expect(text).toContain('Docente institucional');
    expect(text).toContain(`${INVITATION_EXPIRY_DAYS} días`);

    const { expiresAt } = prisma.institutionInvitation.create.mock.calls[0][0].data;
    const vence = expiresAt.toLocaleDateString('es-CO', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
    expect(text).toContain(vence);
  });

  it('usa el slug del rol si Roles no lo tiene sembrado, en vez de no enviar', async () => {
    prisma.roles.findUnique.mockResolvedValue(null);

    await invitar();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].text).toContain('institutional');
  });

  // La invitación ya está creada cuando se intenta el envío. Fallar el
  // endpoint no la borraría: solo empujaría al rector a reintentar y a crear
  // otra fila PENDING. Ver el comentario de createInvitation.
  describe('cuando Resend falla', () => {
    it('devuelve la invitación igual, con emailSent false', async () => {
      send.mockResolvedValue({ error: { message: 'rate limited' } });

      await expect(invitar()).resolves.toEqual({
        uid: 'inv-1', token: 'tok-abc', emailSent: false,
      });
    });

    it('tampoco lanza si el SDK explota', async () => {
      send.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(invitar()).resolves.toMatchObject({ emailSent: false });
    });

    it('la invitación queda guardada aunque el correo falle', async () => {
      send.mockResolvedValue({ error: { message: 'boom' } });

      await invitar();

      expect(prisma.institutionInvitation.create).toHaveBeenCalledTimes(1);
    });
  });

  it('no intenta enviar si falta la URL del frontend', async () => {
    delete config['config.frontendUrl'];

    await expect(invitar()).resolves.toMatchObject({ emailSent: false });
    expect(send).not.toHaveBeenCalled();
  });

  it('devuelve emailSent true cuando el envío sale bien', async () => {
    await expect(invitar()).resolves.toEqual({
      uid: 'inv-1', token: 'tok-abc', emailSent: true,
    });
  });
});
