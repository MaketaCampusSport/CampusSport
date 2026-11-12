import { LoggerModule } from 'nestjs-pino';
import { APP_CONFIG } from '../config/configuration';
import type { AppConfig } from '../config/configuration';

/**
 * Structured JSON logs (pino) for Loki (SYS-09); human-readable in development.
 * Tokens, cookies and OTP/TOTP codes never reach the logs.
 */
export function loggingModule(service: 'api' | 'worker') {
  return LoggerModule.forRootAsync({
    inject: [APP_CONFIG],
    useFactory: (config: AppConfig) => ({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (config.env === 'production' ? 'info' : 'debug'),
        base: { service: `campussport-${service}` },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            'req.body.code',
            'req.body.email_code',
            'req.body.phone_code',
            'req.body.qr_token',
          ],
          censor: '[redacted]',
        },
        autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/metrics' },
        transport:
          config.env === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' } }
            : undefined,
      },
    }),
  });
}
