import { DataSource, DataSourceOptions } from 'typeorm';
import { AppConfig } from '../config/configuration';
import { ENTITIES } from './entities';
import { MIGRATIONS } from './migrations';

export function dataSourceOptions(config: Pick<AppConfig, 'databaseUrl'>): DataSourceOptions {
  return {
    type: 'postgres',
    url: config.databaseUrl,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'typeorm_migrations',
    synchronize: false,
    migrationsRun: false,
    extra: { max: 20 },
  };
}

export function createDataSource(config: Pick<AppConfig, 'databaseUrl'>): DataSource {
  return new DataSource(dataSourceOptions(config));
}
