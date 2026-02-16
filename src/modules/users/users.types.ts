import { VerifiedBadge } from '../../generated/prisma';

export interface UserProfile {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  mannerTemp: number;
  verifiedBadges: VerifiedBadge[];
  createdAt: Date;
  listingCount?: number;
  reviewCount?: number;
  averageRating?: number;
}

export interface UserProfileUpdate {
  displayName?: string;
  username?: string;
  bio?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  avatarUrl?: string;
}
