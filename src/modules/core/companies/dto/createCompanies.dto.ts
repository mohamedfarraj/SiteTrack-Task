import { IsString, Validate } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MatchPassword } from '../../../../common/validators/match-password.validator';
import { NoSpace } from '../../../../common/validators/no-space.validator';

export class CreateCompanies {


  @IsString()
  @Validate(NoSpace)
  @ApiProperty({
    example: 'Companies_name',
  })
  name: string;
  
  @IsString()
  @ApiProperty({
    example: '0123456789',
  })
  phone: string;

  @IsString()
  @ApiProperty({
    example: 'username',
  })
  userName: string;

  @IsString()
  @ApiProperty({
    example: 'password',
  })
  password: string;


  @IsString()
  @Validate(MatchPassword, ['password'])
  @ApiProperty({
    example: 'password',
  })
  confirmPassword: string;

}
