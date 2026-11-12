import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser, Public, Roles } from '../../common/auth/decorators';
import { UuidParamPipe } from '../../common/http/uuid.pipe';
import { CatalogService } from './catalog.service';
import {
  ListResourcesQueryDto,
  ResourceCreateDto,
  ResourcePatchDto,
  ResourceResponse,
  SportInputDto,
  SportResponse,
  toResourceResponse,
} from './dto/catalog.dto';

@ApiTags('Catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get('sports')
  @ApiOperation({ operationId: 'listSports', summary: 'Lista sporturilor cu pictograme' })
  @ApiOkResponse({ type: [SportResponse] })
  listSports(): Promise<SportResponse[]> {
    return this.catalog.listSports();
  }

  @Public()
  @Get('resources')
  @ApiOperation({ operationId: 'listResources', summary: 'Resursele cu dotările necesare sportului' })
  @ApiOkResponse({ type: [ResourceResponse] })
  listResources(@Query() query: ListResourcesQueryDto, @CurrentUser() caller?: AuthUser): Promise<ResourceResponse[]> {
    return this.catalog.listResources(caller, query.sport, query.include_inactive);
  }

  @Public()
  @Get('resources/:id')
  @ApiOperation({ operationId: 'getResource', summary: 'Fișa unei resurse' })
  @ApiOkResponse({ type: ResourceResponse })
  async getResource(@Param('id', UuidParamPipe) id: string, @CurrentUser() caller?: AuthUser): Promise<ResourceResponse> {
    return toResourceResponse(await this.catalog.getResource(id, caller));
  }
}

@ApiTags('Catalog')
@ApiBearerAuth('bearerAuth')
@Roles('admin')
@Controller('admin')
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Post('sports')
  @ApiOperation({ operationId: 'createSport', summary: 'Adaugă un sport' })
  @ApiCreatedResponse({ type: SportResponse })
  createSport(@CurrentUser() actor: AuthUser, @Body() dto: SportInputDto): Promise<SportResponse> {
    return this.catalog.createSport(actor, dto);
  }

  @Put('sports/:id')
  @ApiOperation({ operationId: 'updateSport', summary: 'Modifică un sport' })
  @ApiOkResponse({ type: SportResponse })
  updateSport(
    @CurrentUser() actor: AuthUser,
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: SportInputDto,
  ): Promise<SportResponse> {
    return this.catalog.updateSport(actor, id, dto);
  }

  @Post('resources')
  @ApiOperation({ operationId: 'createResource', summary: 'Adaugă o resursă' })
  @ApiCreatedResponse({ type: ResourceResponse })
  createResource(@CurrentUser() actor: AuthUser, @Body() dto: ResourceCreateDto): Promise<ResourceResponse> {
    return this.catalog.createResource(actor, dto);
  }

  @Patch('resources/:id')
  @HttpCode(200)
  @ApiOperation({ operationId: 'updateResource', summary: 'Modifică sau dezactivează o resursă' })
  @ApiOkResponse({ type: ResourceResponse })
  updateResource(
    @CurrentUser() actor: AuthUser,
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: ResourcePatchDto,
  ): Promise<ResourceResponse> {
    return this.catalog.updateResource(actor, id, dto);
  }
}
