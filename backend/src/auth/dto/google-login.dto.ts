import { IsJWT, IsNotEmpty } from 'class-validator';

export class GoogleLoginDto {
  @IsJWT({ message: 'idToken must be a Google ID token' })
  @IsNotEmpty()
  idToken!: string;
}
