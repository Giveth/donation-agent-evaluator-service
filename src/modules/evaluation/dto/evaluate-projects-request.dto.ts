import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MainCategoryDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsOptional()
  @IsString()
  banner?: string;

  @IsString()
  @IsNotEmpty()
  description: string;
}

export class CategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @ValidateNested()
  @Type(() => MainCategoryDto)
  mainCategory: MainCategoryDto;
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
