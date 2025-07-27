import { IsArray, IsOptional, IsInt } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class EvaluationDetailedQueryDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  @Transform(({ value }): number[] | undefined => {
    console.log(
      `DTO Transform: Input value: ${JSON.stringify(value)}, type: ${typeof value}, isArray: ${Array.isArray(value)}`,
    );

    if (!value) {
      console.log('DTO Transform: No value provided, returning undefined');
      return undefined;
    }

    if (typeof value === 'string') {
      const result = value
        .split(',')
        .map(id => parseInt(id, 10))
        .filter(id => !isNaN(id));
      console.log(
        `DTO Transform: String input "${value}" transformed to: ${JSON.stringify(result)}`,
      );
      return result;
    }

    if (typeof value === 'number') {
      const result = [value];
      console.log(
        `DTO Transform: Number input ${value} transformed to: ${JSON.stringify(result)}`,
      );
      return result;
    }

    if (Array.isArray(value)) {
      const result = value
        .map(id => (typeof id === 'string' ? parseInt(id, 10) : id))
        .filter(id => !isNaN(id));
      console.log(
        `DTO Transform: Array input ${JSON.stringify(value)} transformed to: ${JSON.stringify(result)}`,
      );
      return result;
    }

    console.log(
      `DTO Transform: Unhandled value type, returning undefined for value: ${JSON.stringify(value)}`,
    );
    return undefined;
  })
  causeIds?: number[];
}
