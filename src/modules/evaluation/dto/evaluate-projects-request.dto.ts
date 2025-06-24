import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CauseDto {
  @IsNumber()
  @IsNotEmpty()
  id: number;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;
}

export class EvaluateProjectsRequestDto {
  @ValidateNested()
  @Type(() => CauseDto)
  @IsNotEmpty()
  cause: CauseDto;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsNotEmpty()
  projectIds: number[];
}
