import { Controller, Param, Post, Put, UseGuards , Body} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { BaseController } from 'src/common/base/baseController.controller';
import { CreateCompanies } from './dto/createCompanies.dto';
import { ApiBody, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UpdateCompanies } from './dto/updateCompanies.dto';

@Controller('core/companies')
@ApiTags('Companies')
@UseGuards(AuthGuard('jwt'))
export class CompaniesController extends BaseController<CreateCompanies> {
  constructor(private readonly companiesService: CompaniesService) {
    super(companiesService);
  }

  @Post()
  @ApiCreatedResponse({
    description: 'The record has been successfully created.',
    type: CreateCompanies,
  })
  @ApiBody({ type: CreateCompanies })
  async create(@Body() body: CreateCompanies): Promise<CreateCompanies> {
    return this.service.create(body);
  }

  @Put(':id')
  @ApiCreatedResponse({
    description: 'The record has been successfully created.',
    type: UpdateCompanies,
  })
  @ApiBody({ type: UpdateCompanies })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateCompanies,
  ): Promise<UpdateCompanies> {
    return this.service.update(id, body);
  }
      
}
