import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CategoryDto {
  @IsString()
  @IsNotEmpty()
  category_name: string;

  @IsString()
  @IsNotEmpty()
  category_description: string;

  @IsString()
  @IsNotEmpty()
  maincategory_title: string;

  @IsString()
  @IsNotEmpty()
  maincategory_description: string;
}

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryDto)
  categories?: CategoryDto[];
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
