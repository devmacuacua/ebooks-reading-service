import { Module } from '@nestjs/common';
import { RabbitMQConsumerService } from './rabbitmq-consumer.service';
import { LibraryModule } from '../library/library.module';

@Module({
  imports: [LibraryModule],
  providers: [RabbitMQConsumerService],
  exports: [RabbitMQConsumerService],
})
export class RabbitMQConsumerModule {}
