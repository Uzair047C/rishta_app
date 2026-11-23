import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsJWT, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ConsentDto {
  @IsIn(['terms', 'privacy'])
  document!: 'terms' | 'privacy';

  /** ISO 8601 timestamp of when the user accepted, captured client-side. */
  @IsDateString()
  acceptedAt!: string;
}

export class FirebaseLoginDto {
  @IsJWT({ message: 'idToken must be a Firebase ID token' })
  @IsNotEmpty()
  idToken!: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ConsentDto)
  consent?: ConsentDto[];
}
