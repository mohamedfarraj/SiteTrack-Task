import { IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SYSTEM_USERS_TYPES } from 'src/common/shared/constants';

export class CreateRoles {
  @IsString()
  @ApiProperty()
  name: string;


}
