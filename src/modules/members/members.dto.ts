import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail } from 'class-validator';

export class InviteDto {
  @ApiProperty({ example: 'colleague@example.com', description: 'Email of a registered user' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email: string;
}

export class UpdateMemberDto {
  @ApiProperty({ description: 'Make (true) or stop being (false) a project admin' })
  @IsBoolean()
  isAdmin: boolean;
}
