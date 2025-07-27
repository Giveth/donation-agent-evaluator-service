import { IsArray, IsOptional, IsInt } from 'class-validator';
import { Transform } from 'class-transformer';

export class EvaluationDetailedQueryDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Transform(({ value }): number[] | undefined => {
    console.log(
      `DTO Transform: Input value: ${JSON.stringify(value)}, type: ${typeof value}, isArray: ${Array.isArray(value)}, isNull: ${value === null}, isUndefined: ${value === undefined}`,
    );

    // Handle null and undefined explicitly
    if (value === null || value === undefined) {
      console.log(
        'DTO Transform: Null or undefined value, returning undefined',
      );
      return undefined;
    }

    // Handle empty string or whitespace
    if (typeof value === 'string' && value.trim() === '') {
      console.log('DTO Transform: Empty string, returning undefined');
      return undefined;
    }

    if (typeof value === 'string') {
      const result = value
        .split(',')
        .map(id => parseInt(id.trim(), 10))
        .filter(id => !isNaN(id));
      console.log(
        `DTO Transform: String input "${value}" transformed to: ${JSON.stringify(result)}`,
      );
      return result.length > 0 ? result : undefined;
    }

    if (typeof value === 'number') {
      // Handle NaN
      if (isNaN(value)) {
        console.log('DTO Transform: NaN number, returning undefined');
        return undefined;
      }
      const result = [value];
      console.log(
        `DTO Transform: Number input ${value} transformed to: ${JSON.stringify(result)}`,
      );
      return result;
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
      console.log(
        `DTO Transform: Array input ${JSON.stringify(value)} transformed to: ${JSON.stringify(result)}`,
      );
      return result.length > 0 ? result : undefined;
    }

    console.log(
      `DTO Transform: Unhandled value type ${typeof value}, returning undefined for value: ${JSON.stringify(value)}`,
    );
    return undefined;
  })
  causeIds?: number[];
}
