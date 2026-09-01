import { Test } from '@nestjs/testing';
import { NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './Auth.service';
import { PrismaService } from 'src/prisma/prisma.service';
import * as cryptoModule from 'crypto';

const mockPrisma = {
  credentials: { findUnique: jest.fn() },
  verificationCodes: {
    updateMany: jest.fn(),
    create: jest.fn(),
  },
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'config.resendKey') return 're_test_key';
    if (key === 'config.emailFrom') return 'noreply@test.com';
    return undefined;
  }),
};

// Mock resend so no real emails are sent
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({ error: null }) },
  })),
}));

describe('AuthService — code generation', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService,  useValue: mockPrisma },
        { provide: ConfigService,  useValue: mockConfigService },
      ],
    }).compile();

    service = module.get(AuthService);
    jest.clearAllMocks();

    mockPrisma.credentials.findUnique.mockResolvedValue({ uid: 'u1', mail: 'a@b.com' });
    mockPrisma.verificationCodes.updateMany.mockResolvedValue({});
    mockPrisma.verificationCodes.create.mockResolvedValue({});
  });

  it('sendVerificationCode uses crypto.randomInt, not Math.random', async () => {
    const randomIntSpy = jest.spyOn(cryptoModule, 'randomInt');
    const randomSpy    = jest.spyOn(Math, 'random');

    await service.sendVerificationCode('u1');

    expect(randomIntSpy).toHaveBeenCalledWith(100000, 1000000);
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it('sendPasswordResetCode uses crypto.randomInt, not Math.random', async () => {
    mockPrisma.credentials.findUnique.mockResolvedValue({ uid: 'u1' });
    const randomIntSpy = jest.spyOn(cryptoModule, 'randomInt');
    const randomSpy    = jest.spyOn(Math, 'random');

    await service.sendPasswordResetCode('a@b.com');

    expect(randomIntSpy).toHaveBeenCalledWith(100000, 1000000);
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it('generated code is always a 6-digit string', async () => {
    const codes: string[] = [];
    mockPrisma.verificationCodes.create.mockImplementation(({ data }) => {
      codes.push(data.code);
      return {};
    });

    for (let i = 0; i < 10; i++) {
      await service.sendVerificationCode('u1');
    }

    for (const code of codes) {
      expect(code).toMatch(/^\d{6}$/);
      expect(Number(code)).toBeGreaterThanOrEqual(100000);
      expect(Number(code)).toBeLessThanOrEqual(999999);
    }
  });

  it('sendPasswordResetCode resolves without throwing when email not found', async () => {
    mockPrisma.credentials.findUnique.mockResolvedValue(null);

    await expect(service.sendPasswordResetCode('unknown@test.com')).resolves.toBeUndefined();
  });
});

describe('AuthService — resetPassword', () => {
  let service: AuthService;

  const resetMockPrisma = {
    credentials: { findUnique: jest.fn(), update: jest.fn() },
    verificationCodes: { findFirst: jest.fn(), update: jest.fn() },
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: resetMockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get(AuthService);
    jest.clearAllMocks();

    resetMockPrisma.credentials.findUnique.mockResolvedValue({
      uid: 'u1',
      mail: 'a@b.com',
    });
    resetMockPrisma.verificationCodes.findFirst.mockResolvedValue({
      uid: 'code1',
    });
    resetMockPrisma.verificationCodes.update.mockResolvedValue({});
    resetMockPrisma.credentials.update.mockResolvedValue({});
  });

  it('writes password and passwordChangedAt in the same update call', async () => {
    await service.resetPassword('a@b.com', '123456', 'newSecret123');

    expect(resetMockPrisma.credentials.update).toHaveBeenCalledTimes(1);
    const call = resetMockPrisma.credentials.update.mock.calls[0][0] as {
      where: { mail: string };
      data: { password: string; passwordChangedAt: Date };
    };

    expect(call.where).toEqual({ mail: 'a@b.com' });
    expect(call.data).toHaveProperty('password');
    expect(call.data.passwordChangedAt).toBeInstanceOf(Date);
  });
});
