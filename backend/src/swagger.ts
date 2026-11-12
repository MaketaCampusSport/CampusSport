import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('CampusSport API')
    .setDescription(
      'Implementarea livrabilului 05 (livrabil05/openapi.yaml). Rutele marcate „501” sunt încă neimplementate.',
    )
    .setVersion('1.0.0')
    .addServer('/api/v1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearerAuth')
    .addCookieAuth('refresh_token', { type: 'apiKey', in: 'cookie' }, 'refreshCookie')
    .build();
  const document = SwaggerModule.createDocument(app, config, { ignoreGlobalPrefix: true });
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });
}
