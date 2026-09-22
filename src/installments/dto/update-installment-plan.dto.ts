import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateInstallmentPlanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
