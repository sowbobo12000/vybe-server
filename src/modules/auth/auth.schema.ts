import { z } from 'zod';

export const sendCodeSchema = z.object({
  phone: z
    .string()
    .min(10)
    .max(15)
    .regex(/^\+[1-9]\d{9,14}$/, 'Phone number must be in E.164 format (e.g., +14155551234)'),
});

export const verifyCodeSchema = z.object({
  phone: z
    .string()
    .min(10)
    .max(15)
    .regex(/^\+[1-9]\d{9,14}$/, 'Phone number must be in E.164 format'),
  code: z.string().length(6).regex(/^\d{6}$/, 'Code must be a 6-digit number'),
  deviceType: z.string().optional(),
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'Google ID token is required'),
  deviceType: z.string().optional(),
});

export const appleAuthSchema = z.object({
  identityToken: z.string().min(1, 'Apple identity token is required'),
  authorizationCode: z.string().min(1, 'Apple authorization code is required'),
  fullName: z
    .object({
      givenName: z.string().optional(),
      familyName: z.string().optional(),
    })
    .optional(),
  deviceType: z.string().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type SendCodeInput = z.infer<typeof sendCodeSchema>;
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;
export type AppleAuthInput = z.infer<typeof appleAuthSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
