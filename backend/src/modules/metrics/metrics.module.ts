import {
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Header,
  Injectable,
  Module,
  NestInterceptor,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { finalize, Observable } from 'rxjs';
import { Public } from '../../common/auth/decorators';
import { collectDefaults, httpDuration, register } from './metrics';

/** Records the duration of every HTTP request by route template (not raw URL, to keep cardinality low). */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const end = httpDuration.startTimer();
    return next.handle().pipe(
      finalize(() => {
        const route = (req.route?.path as string | undefined) ?? 'unmatched';
        if (route !== '/metrics' && route !== '/health')
          end({ method: req.method, route, status: String(res.statusCode) });
      }),
    );
  }
}

@ApiExcludeController()
@Public()
@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', register.contentType)
  metrics(): Promise<string> {
    return register.metrics();
  }
}

@Module({
  controllers: [MetricsController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor }],
})
export class MetricsModule {
  constructor() {
    collectDefaults('campussport_api_');
  }
}
