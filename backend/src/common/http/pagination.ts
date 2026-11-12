import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** `Page` and `PageSize` parameters from the spec. */
export class PageQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size: number = 20;
}

export interface Page<T> {
  page: number;
  page_size: number;
  total: number;
  items: T[];
}

export function pageOf<T>(query: PageQueryDto, items: T[], total: number): Page<T> {
  return { page: query.page, page_size: query.page_size, total, items };
}

export function pageOffset(query: PageQueryDto): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.page_size, take: query.page_size };
}
