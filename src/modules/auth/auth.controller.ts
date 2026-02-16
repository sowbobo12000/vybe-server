import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from './auth.service';
import {
  sendCodeSchema,
  verifyCodeSchema,
  googleAuthSchema,
  appleAuthSchema,
  refreshTokenSchema,
} from './auth.schema';
import { sendSuccess, sendNoContent, errors } from '../../shared/utils/response';

export class AuthController {
  private service: AuthService;

  constructor(private readonly app: import('fastify').FastifyInstance) {
    this.service = new AuthService(app);
  }

  /**
   * POST /auth/phone/send-code
   * Send a verification code to a phone number.
   */
  async sendCode(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = sendCodeSchema.parse(request.body);

    try {
      const result = await this.service.sendVerificationCode(body.phone);
      sendSuccess(reply, result);
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      if (error.statusCode === 429) {
        return errors.tooManyRequests(reply, error.message);
      }
      throw err;
    }
  }

  /**
   * POST /auth/phone/verify
   * Verify a phone number with a code.
   */
  async verifyCode(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = verifyCodeSchema.parse(request.body);

    try {
      const result = await this.service.verifyPhoneCode(body, request.ip);
      sendSuccess(reply, result);
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      if (error.statusCode === 400) {
        return errors.badRequest(reply, error.message);
      }
      throw err;
    }
  }

  /**
   * POST /auth/google
   * Authenticate with Google.
   */
  async googleAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = googleAuthSchema.parse(request.body);

    try {
      const result = await this.service.authenticateWithGoogle(body, request.ip);
      sendSuccess(reply, result);
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      if (error.statusCode === 400) {
        return errors.badRequest(reply, error.message);
      }
      throw err;
    }
  }

  /**
   * POST /auth/apple
   * Authenticate with Apple.
   */
  async appleAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = appleAuthSchema.parse(request.body);

    try {
      const result = await this.service.authenticateWithApple(body, request.ip);
      sendSuccess(reply, result);
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      if (error.statusCode === 400) {
        return errors.badRequest(reply, error.message);
      }
      throw err;
    }
  }

  /**
   * POST /auth/refresh
   * Refresh access token.
   */
  async refreshToken(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = refreshTokenSchema.parse(request.body);

    try {
      const result = await this.service.refreshTokens(body.refreshToken, request.ip);
      sendSuccess(reply, result);
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      if (error.statusCode === 401) {
        return errors.unauthorized(reply, error.message);
      }
      throw err;
    }
  }

  /**
   * POST /auth/logout
   * Logout and invalidate session.
   */
  async logout(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user) {
      return errors.unauthorized(reply);
    }

    await this.service.logout(request.user.sessionId);
    sendNoContent(reply);
  }
}
