import { IsArray, IsOptional, IsInt } from 'class-validator';
import { Transform } from 'class-transformer';

export class EvaluationDetailedQueryDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Transform(({ value }): number[] | undefined => {
    // Handle null and undefined explicitly
    if (value === null || value === undefined) {
      return undefined;
    }

    // Handle empty string or whitespace
    if (typeof value === 'string' && value.trim() === '') {
      return undefined;
    }

    if (typeof value === 'string') {
      const result = value
        .split(',')
        .map(id => parseInt(id.trim(), 10))
        .filter(id => !isNaN(id));
      return result.length > 0 ? result : undefined;
    }

    if (typeof value === 'number') {
      // Handle NaN
      if (isNaN(value)) {
        return undefined;
      }
      return [value];
    }

    if (Array.isArray(value)) {
      const result = value
        .map(id => {
          if (typeof id === 'string') {
            return parseInt(id.trim(), 10);
          }
          return typeof id === 'number' ? id : NaN;
        })
        .filter(id => !isNaN(id));
      return result.length > 0 ? result : undefined;
    }

    return undefined;
  })
  causeIds?: number[];
}
