import { Global, Module } from '@nestjs/common';
import { ProjectAccessService } from './project-access.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

/** Global so tasks/members/stores/deliveries can reuse the access gate. */
@Global()
@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectAccessService],
  exports: [ProjectsService, ProjectAccessService],
})
export class ProjectsModule {}
