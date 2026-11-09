import { Module } from '@nestjs/common';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { CompanyStoreController } from './company-store.controller';
import { ProjectStoreController } from './project-store.controller';
import { StoresService } from './stores.service';

@Module({
  controllers: [CompanyStoreController, ProjectStoreController],
  providers: [StoresService, DeliveriesService],
})
export class StoresModule {}
