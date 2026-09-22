import { IsArray, IsString } from 'class-validator';

export class SetUserPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  modules: string[];
}
