import { FastifyInstance } from 'fastify';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, parseDuration } from '../../shared/utils/jwt';
import { hashToken, generateVerificationCode } from '../../shared/utils/hash';
import { config } from '../../config';
import { AuthResponse, AuthTokens } from './auth.types';
import { VerifyCodeInput, GoogleAuthInput, AppleAuthInput } from './auth.schema';

export class AuthService {
  constructor(private readonly app: FastifyInstance) {}

  /**
   * Send a verification code to a phone number.
   * In production, this would use Twilio Verify.
   * In development, the code is stored in Redis.
   */
  async sendVerificationCode(phone: string): Promise<{ success: boolean }> {
    const code = generateVerificationCode();
    const key = `verification:${phone}`;

    // Store the code in Redis with a 5-minute expiration
    await this.app.redis.set(key, code, 'EX', 300);

    // Track send attempts to prevent abuse
    const attemptsKey = `verification:attempts:${phone}`;
    const attempts = await this.app.redis.incr(attemptsKey);
    if (attempts === 1) {
      await this.app.redis.expire(attemptsKey, 3600); // Reset after 1 hour
    }

    if (attempts > 5) {
      throw Object.assign(new Error('Too many verification attempts. Try again later.'), {
        statusCode: 429,
      });
    }

    // In production, send via Twilio:
    // await twilioClient.verify.v2.services(config.TWILIO_SERVICE_SID)
    //   .verifications.create({ to: phone, channel: 'sms' });

    this.app.log.info({ phone, code: config.NODE_ENV === 'development' ? code : '[redacted]' },
      'Verification code sent');

    return { success: true };
  }

  /**
   * Verify a phone number with a code and return auth tokens.
   */
  async verifyPhoneCode(input: VerifyCodeInput, ipAddress: string): Promise<AuthResponse> {
    const key = `verification:${input.phone}`;
    const storedCode = await this.app.redis.get(key);

    if (!storedCode) {
      throw Object.assign(new Error('Verification code expired or not found'), {
        statusCode: 400,
      });
    }

    if (storedCode !== input.code) {
      throw Object.assign(new Error('Invalid verification code'), { statusCode: 400 });
    }

    // Remove the used code
    await this.app.redis.del(key);

    // Find or create user
    let user = await this.app.prisma.user.findUnique({
      where: { phone: input.phone },
    });

    const isNewUser = !user;

    if (!user) {
      user = await this.app.prisma.user.create({
        data: {
          phone: input.phone,
          verifiedBadges: ['PHONE'],
        },
      });
    } else if (!user.verifiedBadges.includes('PHONE')) {
      user = await this.app.prisma.user.update({
        where: { id: user.id },
        data: {
          verifiedBadges: { push: 'PHONE' },
        },
      });
    }

    const tokens = await this.createSession(user.id, input.deviceType, ipAddress);

    return {
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        isNewUser,
      },
      tokens,
    };
  }

  /**
   * Authenticate with Google ID token.
   */
  async authenticateWithGoogle(input: GoogleAuthInput, ipAddress: string): Promise<AuthResponse> {
    // In production, verify the Google ID token:
    // const ticket = await googleClient.verifyIdToken({
    //   idToken: input.idToken,
    //   audience: config.GOOGLE_CLIENT_ID,
    // });
    // const payload = ticket.getPayload();

    // For now, decode the token (in production use proper verification)
    const tokenParts = input.idToken.split('.');
    if (tokenParts.length !== 3) {
      throw Object.assign(new Error('Invalid Google ID token'), { statusCode: 400 });
    }

    let googlePayload: { sub: string; email?: string; name?: string; picture?: string };
    try {
      googlePayload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
    } catch {
      throw Object.assign(new Error('Invalid Google ID token'), { statusCode: 400 });
    }

    let user = await this.app.prisma.user.findUnique({
      where: { googleId: googlePayload.sub },
    });

    const isNewUser = !user;

    if (!user) {
      // Check if user with same email exists
      if (googlePayload.email) {
        const existingUser = await this.app.prisma.user.findUnique({
          where: { email: googlePayload.email },
        });

        if (existingUser) {
          // Link Google account to existing user
          user = await this.app.prisma.user.update({
            where: { id: existingUser.id },
            data: {
              googleId: googlePayload.sub,
              verifiedBadges: existingUser.verifiedBadges.includes('GOOGLE')
                ? existingUser.verifiedBadges
                : [...existingUser.verifiedBadges, 'GOOGLE'],
            },
          });
        }
      }

      if (!user) {
        user = await this.app.prisma.user.create({
          data: {
            googleId: googlePayload.sub,
            email: googlePayload.email,
            displayName: googlePayload.name,
            avatarUrl: googlePayload.picture,
            verifiedBadges: ['GOOGLE'],
          },
        });
      }
    }

    const tokens = await this.createSession(user.id, input.deviceType, ipAddress);

    return {
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        isNewUser,
      },
      tokens,
    };
  }

  /**
   * Authenticate with Apple identity token.
   */
  async authenticateWithApple(input: AppleAuthInput, ipAddress: string): Promise<AuthResponse> {
    // In production, verify the Apple identity token using apple-signin-auth library
    const tokenParts = input.identityToken.split('.');
    if (tokenParts.length !== 3) {
      throw Object.assign(new Error('Invalid Apple identity token'), { statusCode: 400 });
    }

    let applePayload: { sub: string; email?: string };
    try {
      applePayload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
    } catch {
      throw Object.assign(new Error('Invalid Apple identity token'), { statusCode: 400 });
    }

    let user = await this.app.prisma.user.findUnique({
      where: { appleId: applePayload.sub },
    });

    const isNewUser = !user;

    if (!user) {
      const displayName = input.fullName
        ? [input.fullName.givenName, input.fullName.familyName].filter(Boolean).join(' ') || null
        : null;

      user = await this.app.prisma.user.create({
        data: {
          appleId: applePayload.sub,
          email: applePayload.email,
          displayName,
          verifiedBadges: ['APPLE'],
        },
      });
    }

    const tokens = await this.createSession(user.id, input.deviceType, ipAddress);

    return {
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        isNewUser,
      },
      tokens,
    };
  }

  /**
   * Refresh access token using a valid refresh token.
   */
  async refreshTokens(refreshToken: string, ipAddress: string): Promise<AuthTokens> {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401 });
    }

    const tokenHash = hashToken(refreshToken);

    // Find the session with this refresh token
    const session = await this.app.prisma.userSession.findFirst({
      where: {
        id: payload.sessionId,
        refreshTokenHash: tokenHash,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) {
      // Possible token reuse - invalidate all sessions for this user
      this.app.log.warn({ userId: payload.userId }, 'Possible refresh token reuse detected');
      await this.app.prisma.userSession.deleteMany({
        where: { userId: payload.userId },
      });
      await this.invalidateUserSessions(payload.userId);
      throw Object.assign(new Error('Invalid refresh token - all sessions invalidated'), {
        statusCode: 401,
      });
    }

    // Generate new tokens (refresh token rotation)
    const newAccessToken = generateAccessToken({
      userId: session.userId,
      sessionId: session.id,
    });

    const newRefreshToken = generateRefreshToken({
      userId: session.userId,
      sessionId: session.id,
    });

    const newTokenHash = hashToken(newRefreshToken);
    const refreshExpMs = parseDuration(config.JWT_REFRESH_EXPIRATION);

    // Update session with new refresh token
    await this.app.prisma.userSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newTokenHash,
        ipAddress,
        expiresAt: new Date(Date.now() + refreshExpMs),
      },
    });

    // Update Redis session cache
    const ttl = Math.floor(refreshExpMs / 1000);
    await this.app.redis.set(`session:${session.id}`, session.userId, 'EX', ttl);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  /**
   * Logout - invalidate the current session.
   */
  async logout(sessionId: string): Promise<void> {
    await this.app.prisma.userSession.delete({
      where: { id: sessionId },
    }).catch(() => {
      // Session may already be deleted
    });

    await this.app.redis.del(`session:${sessionId}`);
  }

  /**
   * Create a new session and generate tokens.
   */
  private async createSession(
    userId: string,
    deviceType: string | undefined,
    ipAddress: string,
  ): Promise<AuthTokens> {
    const refreshExpMs = parseDuration(config.JWT_REFRESH_EXPIRATION);

    // Create a temporary session to get the ID
    const session = await this.app.prisma.userSession.create({
      data: {
        userId,
        refreshTokenHash: '', // Will be updated
        deviceType: deviceType || null,
        ipAddress,
        expiresAt: new Date(Date.now() + refreshExpMs),
      },
    });

    const accessToken = generateAccessToken({ userId, sessionId: session.id });
    const refreshToken = generateRefreshToken({ userId, sessionId: session.id });
    const tokenHash = hashToken(refreshToken);

    // Update session with the actual refresh token hash
    await this.app.prisma.userSession.update({
      where: { id: session.id },
      data: { refreshTokenHash: tokenHash },
    });

    // Cache session in Redis
    const ttl = Math.floor(refreshExpMs / 1000);
    await this.app.redis.set(`session:${session.id}`, userId, 'EX', ttl);

    // Update user's last active time
    await this.app.prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() },
    });

    // Clean up expired sessions for this user (keep max 5 active)
    const activeSessions = await this.app.prisma.userSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (activeSessions.length > 5) {
      const sessionsToDelete = activeSessions.slice(5);
      await this.app.prisma.userSession.deleteMany({
        where: { id: { in: sessionsToDelete.map((s) => s.id) } },
      });
      for (const s of sessionsToDelete) {
        await this.app.redis.del(`session:${s.id}`);
      }
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  /**
   * Invalidate all Redis-cached sessions for a user.
   */
  private async invalidateUserSessions(userId: string): Promise<void> {
    const sessions = await this.app.prisma.userSession.findMany({
      where: { userId },
      select: { id: true },
    });

    const pipeline = this.app.redis.pipeline();
    for (const session of sessions) {
      pipeline.del(`session:${session.id}`);
    }
    await pipeline.exec();
  }
}
