export interface SendCodeRequest {
  phone: string;
}

export interface VerifyCodeRequest {
  phone: string;
  code: string;
  deviceType?: string;
}

export interface GoogleAuthRequest {
  idToken: string;
  deviceType?: string;
}

export interface AppleAuthRequest {
  identityToken: string;
  authorizationCode: string;
  fullName?: {
    givenName?: string;
    familyName?: string;
  };
  deviceType?: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: {
    id: string;
    phone: string | null;
    email: string | null;
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
    isNewUser: boolean;
  };
  tokens: AuthTokens;
}
