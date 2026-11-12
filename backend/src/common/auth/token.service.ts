import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import type { Role } from '../../database/enums';
import type { AccessTokenPayload } from './auth.types';

export interface AccessToken {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

/** Issues the 15-minute access JWT (NFR-08, SDD 8.1). */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async signAccess(user: { id: string; role: Role }): Promise<AccessToken> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role, typ: 'access' };
    const expiresIn = this.config.jwt.accessTtlSeconds;
    const access_token = await this.jwt.signAsync(payload, { expiresIn });
    return { access_token, token_type: 'Bearer', expires_in: expiresIn };
  }
}
