import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './Auth.controller';
import { AuthService } from './Auth.service';
import { RefreshTokenService } from './refresh-token.service';
import * as cryptoUtil from 'src/utils/crypto.util';

const mockAuthService = {
  getCredentialByEmail: jest.fn(),
  setCredentialData: jest.fn(),
  getOnboardingSteps: jest.fn(),
  sendVerificationCode: jest.fn(),
  verifyEmailCode: jest.fn(),
  getCredentialsWithoutProfile: jest.fn(),
  sendPasswordResetCode: jest.fn(),
  resetPassword: jest.fn(),
};

const mockJwtService = { signAsync: jest.fn().mockResolvedValue('token') };
const mockRefreshTokenService = {
  issuePair: jest.fn().mockResolvedValue({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
  }),
  rotate: jest.fn(),
  revokeFamily: jest.fn(),
  revokeByToken: jest.fn().mockResolvedValue(undefined),
};
const mockConfigService = { get: jest.fn().mockReturnValue(false) };
const mockRes = { cookie: jest.fn(), clearCookie: jest.fn() } as any;
const mockReqNoCookies = { cookies: {} } as any;

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService,   useValue: mockAuthService },
        { provide: JwtService,    useValue: mockJwtService },
        { provide: RefreshTokenService, useValue: mockRefreshTokenService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get(AuthController);
    jest.clearAllMocks();
    mockRefreshTokenService.issuePair.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
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

  describe('cookie options', () => {
    it('login sets access_token (path=/) and refresh_token (path=/auth in dev)', async () => {
      mockConfigService.get.mockReturnValue('development');
      mockAuthService.getCredentialByEmail.mockResolvedValue({
        uid: 'u1', password: 'hashed', isEmailVerified: true,
        hasProfile: true, hasGroup: false, userTypeId: 'type-1',
      });
      jest.spyOn(cryptoUtil, 'verifyText').mockResolvedValue(true);
      await controller.login({ mail: 'a@b.com', password: 'pass' }, mockRes);

      expect(mockRefreshTokenService.issuePair).toHaveBeenCalledWith('u1', 'type-1');

      const [accessName, , accessOpts] = mockRes.cookie.mock.calls[0];
      const [refreshName, , refreshOpts] = mockRes.cookie.mock.calls[1];

      expect(accessName).toBe('access_token');
      expect(accessOpts.path).toBe('/');
      expect(accessOpts.maxAge).toBe(1000 * 60 * 15);

      expect(refreshName).toBe('refresh_token');
      expect(refreshOpts.path).toBe('/auth');
      expect(refreshOpts.maxAge).toBe(1000 * 60 * 60 * 24 * 7);
    });

    it('login sets refresh_token path=/api/auth in production', async () => {
      mockConfigService.get.mockReturnValue('production');
      mockAuthService.getCredentialByEmail.mockResolvedValue({
        uid: 'u1', password: 'hashed', isEmailVerified: true,
        hasProfile: true, hasGroup: false, userTypeId: 'type-1',
      });
      jest.spyOn(cryptoUtil, 'verifyText').mockResolvedValue(true);
      await controller.login({ mail: 'a@b.com', password: 'pass' }, mockRes);

      const [, , refreshOpts] = mockRes.cookie.mock.calls[1];
      expect(refreshOpts.path).toBe('/api/auth');
    });

    it('logout clears both cookies with the exact options used to set them', async () => {
      mockConfigService.get.mockReturnValue('production');
      mockAuthService.getCredentialByEmail.mockResolvedValue({
        uid: 'u1', password: 'hashed', isEmailVerified: true,
        hasProfile: true, hasGroup: false, userTypeId: 'type-1',
      });
      jest.spyOn(cryptoUtil, 'verifyText').mockResolvedValue(true);
      await controller.login({ mail: 'a@b.com', password: 'pass' }, mockRes);

      const setAccessOptions = mockRes.cookie.mock.calls[0][2];
      const setRefreshOptions = mockRes.cookie.mock.calls[1][2];

      mockRes.clearCookie.mockClear();
      await controller.logout(mockReqNoCookies, mockRes);

      const [clearAccessName, clearAccessOptions] = mockRes.clearCookie.mock.calls[0];
      const [clearRefreshName, clearRefreshOptions] = mockRes.clearCookie.mock.calls[1];

      expect(clearAccessName).toBe('access_token');
      expect(clearAccessOptions).toEqual(setAccessOptions);
      expect(clearRefreshName).toBe('refresh_token');
      expect(clearRefreshOptions).toEqual(setRefreshOptions);
    });

    it('logout revokes the family via revokeByToken when the refresh cookie is present', async () => {
      mockConfigService.get.mockReturnValue('development');

      await controller.logout(
        { cookies: { refresh_token: 'some-refresh-token' } } as any,
        mockRes,
      );

      expect(mockRefreshTokenService.revokeByToken).toHaveBeenCalledWith('some-refresh-token');
    });

    it('logout does not call revokeByToken when there is no refresh cookie', async () => {
      mockConfigService.get.mockReturnValue('development');

      await controller.logout(mockReqNoCookies, mockRes);

      expect(mockRefreshTokenService.revokeByToken).not.toHaveBeenCalled();
    });

    it('logout returns 200-shaped response and clears cookies even if revokeByToken fails to find anything (never throws)', async () => {
      mockConfigService.get.mockReturnValue('development');
      mockRefreshTokenService.revokeByToken.mockResolvedValueOnce(undefined);

      const result = await controller.logout(
        { cookies: { refresh_token: 'unknown-token' } } as any,
        mockRes,
      );

      expect(result).toEqual({ message: 'Logged out' });
    });

    it('in development: sameSite is lax and secure is false', async () => {
      mockConfigService.get.mockReturnValue('development');
      mockAuthService.getCredentialByEmail.mockResolvedValue({
        uid: 'u1', password: 'hashed', isEmailVerified: true,
        hasProfile: true, hasGroup: false, userTypeId: 'type-1',
      });
      jest.spyOn(cryptoUtil, 'verifyText').mockResolvedValue(true);
      await controller.login({ mail: 'a@b.com', password: 'pass' }, mockRes);

      const opts = mockRes.cookie.mock.calls[0][2];
      expect(opts.sameSite).toBe('lax');
      expect(opts.secure).toBe(false);
    });

    it('in production: sameSite is none and secure is true', async () => {
      mockConfigService.get.mockReturnValue('production');
      mockAuthService.getCredentialByEmail.mockResolvedValue({
        uid: 'u1', password: 'hashed', isEmailVerified: true,
        hasProfile: true, hasGroup: false, userTypeId: 'type-1',
      });
      jest.spyOn(cryptoUtil, 'verifyText').mockResolvedValue(true);
      await controller.login({ mail: 'a@b.com', password: 'pass' }, mockRes);

      const opts = mockRes.cookie.mock.calls[0][2];
      expect(opts.sameSite).toBe('none');
      expect(opts.secure).toBe(true);
    });
  });

  describe('register', () => {
    it('issues a token pair with userTypeId null (no profile yet)', async () => {
      mockConfigService.get.mockReturnValue('development');
      mockAuthService.setCredentialData.mockResolvedValue({ uid: 'new-uid' });
      mockAuthService.getOnboardingSteps.mockResolvedValue(['verify-email']);

      await controller.register(
        { mail: 'new@test.com', password: 'pass123' },
        mockRes,
      );

      expect(mockRefreshTokenService.issuePair).toHaveBeenCalledWith('new-uid', null);
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'access_token', 'access-token', expect.any(Object),
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refresh_token', 'refresh-token', expect.any(Object),
      );
    });
  });

  describe('refresh', () => {
    it('401s when there is no refresh_token cookie', async () => {
      mockConfigService.get.mockReturnValue('development');
      await expect(
        controller.refresh({ cookies: {} } as any, mockRes),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rotates and sets fresh cookies on success', async () => {
      mockConfigService.get.mockReturnValue('development');
      mockRefreshTokenService.rotate.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });

      const result = await controller.refresh(
        { cookies: { refresh_token: 'old-refresh' } } as any,
        mockRes,
      );

      expect(mockRefreshTokenService.rotate).toHaveBeenCalledWith('old-refresh');
      expect(mockRes.cookie).toHaveBeenCalledWith('access_token', 'new-access', expect.any(Object));
      expect(mockRes.cookie).toHaveBeenCalledWith('refresh_token', 'new-refresh', expect.any(Object));
      expect(result).toEqual({ message: 'Token refrescado' });
    });

    it('clears both cookies and rethrows 401 when rotate() fails', async () => {
      mockConfigService.get.mockReturnValue('development');
      mockRefreshTokenService.rotate.mockRejectedValue(
        new UnauthorizedException('Refresh token reutilizado'),
      );

      await expect(
        controller.refresh(
          { cookies: { refresh_token: 'stolen' } } as any,
          mockRes,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(mockRes.clearCookie).toHaveBeenCalledWith('access_token', expect.any(Object));
      expect(mockRes.clearCookie).toHaveBeenCalledWith('refresh_token', expect.any(Object));
    });
  });
});
