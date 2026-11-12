import { Injectable, PipeTransform } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { AppException } from '../errors/app.exception';

/** Path `{id}` parameters: a malformed id cannot exist, so it is a 404 like any unknown id (spec: NotFound). */
@Injectable()
export class UuidParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isUUID(value)) throw new AppException('NOT_FOUND');
    return value;
  }
}
