import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, AppConfig } from '../../config/configuration';
import { AUTH_USER_LOADER } from './auth.types';
import { DbAuthUserLoader } from './db-auth-user.loader';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenService } from './token.service';

export function jwtModule() {
  return JwtModule.registerAsync({
    inject: [APP_CONFIG],
    useFactory: (config: AppConfig) => ({
      secret: config.jwt.accessSecret,
      signOptions: { algorithm: 'HS256' },
      verifyOptions: { algorithms: ['HS256'] },
    }),
  });
}

/** JWT signing/verification and the global auth guard, for the HTTP app. */
@Global()
@Module({
  imports: [jwtModule()],
  providers: [
    TokenService,
    { provide: AUTH_USER_LOADER, useClass: DbAuthUserLoader },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [TokenService, jwtModule()],
})
export class AuthCoreModule {}
