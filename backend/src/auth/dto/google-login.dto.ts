import { Type } from 'class-transformer';
import { IsJWT, IsNotEmpty, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { ConsentDto } from './auth.dto';

export class GoogleLoginDto {
  @IsJWT({ message: 'idToken must be a Google ID token' })
  @IsNotEmpty()
  idToken!: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ConsentDto)
  consent?: ConsentDto[];
}
