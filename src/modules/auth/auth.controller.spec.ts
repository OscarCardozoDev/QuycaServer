import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import * as cryptoUtil from 'src/utils/crypto.util';

const mockAuthService = {
  getCredentialByEmail: jest.fn(),
  setCredentialData: jest.fn(),
  sendVerificationCode: jest.fn(),
  verifyEmailCode: jest.fn(),
  getCredentialsWithoutProfile: jest.fn(),
  sendPasswordResetCode: jest.fn(),
  resetPassword: jest.fn(),
};

const mockJwtService = { signAsync: jest.fn().mockResolvedValue('token') };
const mockConfigService = { get: jest.fn().mockReturnValue(false) };
const mockRes = { cookie: jest.fn(), clearCookie: jest.fn() } as any;

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService,   useValue: mockAuthService },
        { provide: JwtService,    useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get(AuthController);
    jest.clearAllMocks();
  });

  describe('login — email enumeration prevention', () => {
    const body = { mail: 'x@test.com', password: 'pass123' };

    it('throws UnauthorizedException (not 404) when email does not exist', async () => {
      mockAuthService.getCredentialByEmail.mockResolvedValue(null);
      await expect(controller.login(body, mockRes)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException with same generic message when email missing', async () => {
      mockAuthService.getCredentialByEmail.mockResolvedValue(null);
      await expect(controller.login(body, mockRes)).rejects.toMatchObject({
        message: 'Credenciales inválidas',
      });
    });

    it('throws UnauthorizedException with same generic message when password wrong', async () => {
      mockAuthService.getCredentialByEmail.mockResolvedValue({
        uid: 'u1', password: 'hashed', isEmailVerified: true,
        hasProfile: true, hasGroup: false, userTypeId: 'type-1',
      });
      jest.spyOn(cryptoUtil, 'verifyText').mockResolvedValue(false);

      await expect(controller.login(body, mockRes)).rejects.toMatchObject({
        message: 'Credenciales inválidas',
      });
    });

    it('email-not-found and wrong-password throw the same HTTP status (401)', async () => {
      mockAuthService.getCredentialByEmail.mockResolvedValue(null);
      let statusEmailMissing: number | undefined;
      try { await controller.login(body, mockRes); } catch (e: any) { statusEmailMissing = e.status; }

      mockAuthService.getCredentialByEmail.mockResolvedValue({
        uid: 'u1', password: 'hashed', isEmailVerified: true,
        hasProfile: true, hasGroup: false, userTypeId: 'type-1',
      });
      jest.spyOn(cryptoUtil, 'verifyText').mockResolvedValue(false);
      let statusWrongPassword: number | undefined;
      try { await controller.login(body, mockRes); } catch (e: any) { statusWrongPassword = e.status; }

      expect(statusEmailMissing).toBe(401);
      expect(statusWrongPassword).toBe(401);
    });
  });
});
