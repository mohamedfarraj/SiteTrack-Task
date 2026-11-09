import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

export function registerMakeModuleCommand(program: Command) {
  program
    .command('make:module <name>')
    .description('Create a new module with all necessary files')
    .option('-p, --path <path>', 'Module path (e.g., system, users)', 'core')
    .action((name: string, options: { path: string }) => {
      const basePath = options.path ? 
        path.join(process.cwd(), 'src/modules', options.path, name.toLowerCase()) :
        path.join(process.cwd(), 'src/modules', name.toLowerCase());
        
      createModuleStructure(name, basePath, options.path);
    });
}

function createModuleStructure(name: string, modulePath: string, moduletype: string = 'core') {
  // Create module directory
  if (!fs.existsSync(modulePath)) {
    fs.mkdirSync(modulePath, { recursive: true });
  }

  // Create directories
  const directories = ['dto'];
  directories.forEach(dir => {
    const dirPath = path.join(modulePath, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath);
    }
  });

  // Create files
  createEntityFile(name, modulePath);
  createControllerFile(name, modulePath, moduletype);
  createServiceFile(name, modulePath);
  createDtoFiles(name, modulePath);
  createModuleFile(name, modulePath);

  // Add permissions with the correct path
  addPermissionsToJson(name, moduletype);

  console.log(`Module ${name} created successfully in ${modulePath}!`);
}

function createEntityFile(name: string, modulePath: string) {
  const entityContent = `import { CustomBaseEntity } from 'src/common/base/baseEntity.entity';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: '${name.toLowerCase()}' })
export class ${name}Entity extends CustomBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  name_en: string;
}
`;
  fs.writeFileSync(path.join(modulePath, `${name.toLowerCase()}.entity.ts`), entityContent);
}

function createControllerFile(name: string, modulePath: string, moduletype: string) {
  const controllerContent = `import { Controller, Param, Post, Put, UseGuards , Body} from '@nestjs/common';
import { ${name}Service } from './${name.toLowerCase()}.service';
import { BaseController } from 'src/common/base/baseController.controller';
import { Create${name} } from './dto/create${name}.dto';
import { Update${name} } from './dto/update${name}.dto';
import { ApiTags, ApiBody, ApiCreatedResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

@Controller('${moduletype}/${name.toLowerCase()}')
@ApiTags('${name}')
@UseGuards(AuthGuard('jwt'))
export class ${name}Controller extends BaseController<Create${name}> {
  constructor(private readonly ${name.toLowerCase()}Service: ${name}Service) {
    super(${name.toLowerCase()}Service);
  }

   @Post()
  @ApiCreatedResponse({
    description: 'The record has been successfully created.',
    type: Create${name},
  })
  @ApiBody({ type: Create${name} })
  async create(@Body() body: Create${name}): Promise<Create${name}> {
    return this.service.create(body);
  }

  @Put(':id')
  @ApiCreatedResponse({
    description: 'The record has been successfully created.',
    type: Update${name},
  })
  @ApiBody({ type: Update${name} })
  async update(
    @Param('id') id: string,
    @Body() body: Update${name},
  ): Promise<Update${name}> {
    return this.service.update(id, body);
  }
}
`;
  fs.writeFileSync(path.join(modulePath, `${name.toLowerCase()}.controller.ts`), controllerContent);
}

function createServiceFile(name: string, modulePath: string) {
  const serviceContent = `import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ${name}Entity } from './${name.toLowerCase()}.entity';
import { BaseService } from 'src/common/base/baseService.service';

@Injectable()
export class ${name}Service extends BaseService<${name}Entity> {
  constructor(
    @InjectRepository(${name}Entity)
    private readonly ${name.toLowerCase()}Repository: Repository<${name}Entity>,
  ) {
    super(${name.toLowerCase()}Repository);
  }
}
`;
  fs.writeFileSync(path.join(modulePath, `${name.toLowerCase()}.service.ts`), serviceContent);
}

function createDtoFiles(name: string, modulePath: string) {
  const createDtoContent = `import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Create${name} {
  @IsString()
  @ApiProperty({
    example: 'اسم ${name}',
  })
  name: string;

  @IsString()
  @ApiProperty({
    example: '${name} name',
  })
  name_en: string;
}
`;

  const updateDtoContent = `import { PartialType } from "@nestjs/swagger";
import { Create${name} } from "./create${name}.dto";

export class Update${name} extends PartialType(Create${name}) {}
`;

  fs.writeFileSync(path.join(modulePath, 'dto', `create${name}.dto.ts`), createDtoContent);
  fs.writeFileSync(path.join(modulePath, 'dto', `update${name}.dto.ts`), updateDtoContent);
}

function createModuleFile(name: string, modulePath: string) {
  const moduleContent = `import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ${name}Controller } from './${name.toLowerCase()}.controller';
import { ${name}Service } from './${name.toLowerCase()}.service';
import { ${name}Entity } from './${name.toLowerCase()}.entity';

@Module({
  imports: [TypeOrmModule.forFeature([${name}Entity])],
  controllers: [${name}Controller],
  providers: [${name}Service],
  exports: [${name}Service],
})
export class ${name}Module {}
`;
  fs.writeFileSync(path.join(modulePath, `${name.toLowerCase()}.module.ts`), moduleContent);
}

// Add new function to handle permissions
function addPermissionsToJson(name: string, moduletype: string) {
  const permissionsPath = path.join(__dirname, '../json/permissions-1.json');

  try {
    const permissions = JSON.parse(fs.readFileSync(permissionsPath, 'utf8'));
    
    const newPermissions = [
      {
        "name": "create",
        "url": `/api/${moduletype}/${name.toLowerCase()}`,
        "method": "POST",
        "model": moduletype,
        "screen": name.toLowerCase()
      },
      {
        "name": "update",
        "url": `/api/${moduletype}/${name.toLowerCase()}/:id`,
        "method": "PUT",
        "model": moduletype,
        "screen": name.toLowerCase()
      },
      {
        "name": "getAll",
        "url": `/api/${moduletype}/${name.toLowerCase()}`,
        "method": "GET",
        "model": moduletype,
        "screen": name.toLowerCase()
      },
      {
        "name": "getOne",
        "url": `/api/${moduletype}/${name.toLowerCase()}/:id/view`,
        "method": "GET",
        "model": moduletype,
        "screen": name.toLowerCase()
      },
      {
        "name": "delete",
        "url": `/api/${moduletype}/${name.toLowerCase()}/:id`,
        "method": "DELETE",
        "model": moduletype,
        "screen": name.toLowerCase()
      }
    ];

    permissions.push(...newPermissions);

    fs.writeFileSync(permissionsPath, JSON.stringify(permissions, null, 2));
    console.log(`Permissions for ${name} added successfully!`);
  } catch (error) {
    console.error('Error adding permissions:', error);
  }
} 