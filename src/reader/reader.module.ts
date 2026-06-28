import { Module } from '@nestjs/common';
import { ReaderService } from './reader.service';
import { ReaderController } from './reader.controller';
import { DrmService } from './drm.service';
import { MinioService } from './minio.service';
import { LibraryModule } from '../library/library.module';
import { RabbitMQConsumerModule } from '../rabbitmq/rabbitmq-consumer.module';

@Module({
  imports: [LibraryModule, RabbitMQConsumerModule],
  controllers: [ReaderController],
  providers: [ReaderService, DrmService, MinioService],
  exports: [DrmService],
})
export class ReaderModule {}
