import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG, AppConfig } from '../config/configuration';
import { ENTITIES } from './entities';
import { dataSourceOptions } from './data-source';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => dataSourceOptions(config),
    }),
    TypeOrmModule.forFeature(ENTITIES),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
