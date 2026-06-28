import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { LibraryModule } from './library/library.module';
import { ReaderModule } from './reader/reader.module';
import { RabbitMQConsumerModule } from './rabbitmq/rabbitmq-consumer.module';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute in ms
        limit: 10,
      },
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,
    LibraryModule,
    ReaderModule,
    RabbitMQConsumerModule,
  ],
})
export class AppModule {}
