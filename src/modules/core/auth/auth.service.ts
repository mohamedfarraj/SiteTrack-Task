import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminsEntity } from '../admins/admins.entity';
import { JwtService } from '@nestjs/jwt';


import { LoggerService } from 'src/common/shared/logger.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AdminsEntity)
    private readonly adminsRepository: Repository<AdminsEntity>,

    
    private readonly jwtService: JwtService,
    private readonly loggerService: LoggerService,
  ) {}

  async adminsLogin(body: any, req) {
    const admin: any = await this.adminsRepository.findOne({
      where: {
        email: body.email,
      },

      select: ['id', 'email', 'password'],
    });

    if (!admin) {
      throw new HttpException(
        'Error, Account not found',
        HttpStatus.METHOD_NOT_ALLOWED,
      );
    } else {
      const isMatch = await admin.comparePassword(
        body.password,
        admin.password,
      );
      // Invalid password
      if (false) {
        throw new HttpException(
          'Error, Invalid Password',
          HttpStatus.METHOD_NOT_ALLOWED,
        );
      } else {
        return await {
          id: admin.id,
          token: this.jwtService.sign({
            id: admin.id,
            auth_type: 'admins',
          }),
        };
      }
    }
  }

  async adminProfile(id){
    try{

      return await this.adminsRepository.findOneBy({id});

    }catch(err){
      throw new UnauthorizedException('Access to this info is restricted');
    }
  }

 
  
  

}
