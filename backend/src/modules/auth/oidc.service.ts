import { Inject, Injectable } from '@nestjs/common';
import type * as Oidc from 'openid-client';
import { AppException } from '../../common/errors/app.exception';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import type { Role } from '../../database/enums';

export interface OidcClaims {
  subject: string;
  email: string;
  fullName: string;
  /** Raw values of the configured role claim (e.g. Keycloak realm roles or eduPersonAffiliation). */
  roleValues: string[];
}

export interface AuthorizationRequest {
  url: string;
  state: string;
  codeVerifier: string;
}

const ROLE_RANK: Record<Exclude<Role, 'external'>, number> = { admin: 3, teacher: 2, student: 1 };

/** Maps IdP claim values to a CampusSport role; the highest mapped role wins, unmapped values are ignored. */
export function mapRole(
  values: string[],
  roleMap: Record<string, Exclude<Role, 'external'>>,
): Exclude<Role, 'external'> | null {
  let best: Exclude<Role, 'external'> | null = null;
  for (const v of values) {
    const role = roleMap[v.toLowerCase()] ?? roleMap[v];
    if (role && (!best || ROLE_RANK[role] > ROLE_RANK[best])) best = role;
  }
  return best;
}

function claimValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return typeof value === 'string' ? [value] : [];
}

/**
 * OpenID Connect, Authorization Code + PKCE (FR-01, SDD 6.3), provider-agnostic.
 * openid-client 6 is ESM-only, so it is loaded lazily with a dynamic import.
 */
@Injectable()
export class OidcService {
  private configPromise?: Promise<Oidc.Configuration>;
  private lib?: Promise<typeof Oidc>;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private client(): Promise<typeof Oidc> {
    this.lib ??= import('openid-client');
    return this.lib;
  }

  private async configuration(): Promise<Oidc.Configuration> {
    this.configPromise ??= (async () => {
      const oidc = await this.client();
      const { issuer, clientId, clientSecret, allowInsecure } = this.config.oidc;
      return oidc.discovery(new URL(issuer), clientId, clientSecret, undefined, {
        execute: allowInsecure ? [oidc.allowInsecureRequests] : [],
      });
    })().catch((err) => {
      this.configPromise = undefined;
      throw err;
    });
    return this.configPromise;
  }

  async authorizationRequest(): Promise<AuthorizationRequest> {
    const oidc = await this.client();
    const config = await this.configuration();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: this.config.oidc.redirectUri,
      scope: this.config.oidc.scope,
      code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
    });
    return { url: url.href, state, codeVerifier };
  }

  /** Exchanges the code and returns the identity; claims missing from the ID token are read from userinfo. */
  async exchange(callbackQuery: string, checks: { state: string; codeVerifier: string }): Promise<OidcClaims> {
    const oidc = await this.client();
    const config = await this.configuration();
    const currentUrl = new URL(this.config.oidc.redirectUri);
    currentUrl.search = callbackQuery;
    let tokens: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>;
    try {
      tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: checks.codeVerifier,
        expectedState: checks.state,
        idTokenExpected: true,
      });
    } catch {
      throw new AppException('BAD_REQUEST');
    }
    let claims: Record<string, unknown> = { ...(tokens.claims() ?? {}) };
    const roleClaim = this.config.oidc.roleClaim;
    if (claims[roleClaim] === undefined || !claims.email) {
      const info = await oidc.fetchUserInfo(config, tokens.access_token, String(claims.sub));
      claims = { ...info, ...claims, [roleClaim]: claims[roleClaim] ?? info[roleClaim] };
    }
    const fullName =
      (typeof claims.name === 'string' && claims.name.trim()) ||
      [claims.given_name, claims.family_name].filter(Boolean).join(' ').trim();
    if (typeof claims.sub !== 'string' || typeof claims.email !== 'string') throw new AppException('BAD_REQUEST');
    return {
      subject: claims.sub,
      email: claims.email,
      fullName: fullName || claims.email,
      roleValues: claimValues(claims[roleClaim]),
    };
  }
}
