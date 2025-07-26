import { IsArray, IsOptional, IsInt } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class EvaluationDetailedQueryDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  @Transform(({ value }): number[] | undefined => {
    if (!value) return undefined;

    if (typeof value === 'string') {
      return value
        .split(',')
        .map(id => parseInt(id, 10))
        .filter(id => !isNaN(id));
    }

    if (Array.isArray(value)) {
      return value
        .map(id => (typeof id === 'string' ? parseInt(id, 10) : id))
        .filter(id => !isNaN(id));
    }

    return undefined;
  })
  causeIds?: number[];
}
