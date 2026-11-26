import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/auth/decorators';
import { UuidParamPipe } from '../../common/http/uuid.pipe';
import { AvatarsService } from './avatars.service';

/**
 * Public, because `<img>` cannot send the bearer token (it lives in memory). The id is a random UUID
 * that only appears in `avatar_url`, and the URL carries the version, so the image can be cached for good.
 */
@ApiTags('Auth')
@Public()
@Controller('users')
export class UserAvatarController {
  constructor(private readonly avatars: AvatarsService) {}

  @Get(':id/avatar')
  @ApiOperation({ operationId: 'getUserAvatar', summary: 'Fotografia de profil a unui utilizator' })
  @ApiQuery({ name: 'v', required: false, description: 'Versiunea fotografiei, doar pentru cache.' })
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  @ApiOkResponse({ description: 'Imaginea.' })
  async avatar(@Param('id', UuidParamPipe) id: string, @Res() res: Response): Promise<void> {
    const image = await this.avatars.get(id);
    res.setHeader('Content-Type', image.contentType);
    res.setHeader('Content-Length', String(image.data.length));
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('Last-Modified', image.updatedAt.toUTCString());
    // The bytes were checked to be an image on upload; never let a browser treat them as anything else.
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
    res.end(image.data);
  }
}
