import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { EvaluateProjectsRequestDto } from './evaluate-projects-request.dto';

export class EvaluateMultipleCausesRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EvaluateProjectsRequestDto)
  causes: EvaluateProjectsRequestDto[];
}
