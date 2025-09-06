import {
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsNumber,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EvaluateProjectsRequestDto } from './evaluate-projects-request.dto';

export class EvaluateMultipleCausesRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EvaluateProjectsRequestDto)
  causes: EvaluateProjectsRequestDto[];

  @IsOptional()
  @IsNumber()
  highestPowerRank?: number;
}
