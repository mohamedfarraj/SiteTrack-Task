import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { AppRole } from '../../common/enums';

const trimLower = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class RegisterDto {
  @ApiProperty({ example: 'Amina Hassan' })
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'amina@example.com' })
  @trimLower()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'Sup3r-secret!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt only uses the first 72 bytes
  password: string;

  @ApiProperty({ enum: AppRole, example: AppRole.USER })
  @IsEnum(AppRole)
  role: AppRole;
}

export class LoginDto {
  @ApiProperty({ example: 'user@sitetrack.dev' })
  @trimLower()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'The refresh token returned by login/register/refresh' })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
