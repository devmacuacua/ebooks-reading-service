import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import { LibraryService } from '../library/library.service';

interface SubscriptionActivatedMessage {
  userId: string;
  subscriptionId: string;
  planId: string;
  planName: string;
  expiresAt: string;
}

interface OrderPaidMessage {
  userId: string;
  orderId: string;
  items: Array<{
    bookId: string;
    bookTitle: string;
    bookType: 'EBOOK' | 'PHYSICAL' | 'BOTH';
    bookCover?: string;
    format?: string;
    fileKey?: string;
    totalPages?: number;
  }>;
}

interface SubscriptionExpiredMessage {
  userId: string;
}

interface OrderRefundedMessage {
  userId: string;
  bookId: string;
}

interface BookInternal {
  fileKey?: string;
  format?: string;
  totalPages?: number;
}

@Injectable()
export class RabbitMQConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQConsumerService.name);
  private connection: amqplib.ChannelModel | null = null;
  private channel: amqplib.Channel | null = null;
  private isDestroyed = false;
  private readonly catalogUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly libraryService: LibraryService,
  ) {
    this.catalogUrl = this.configService.get<string>(
      'CATALOG_SERVICE_URL',
      'http://localhost:8082',
    );
  }

  private async fetchBookInternal(bookId: string): Promise<BookInternal | null> {
    try {
      const res = await fetch(`${this.catalogUrl}/books/${bookId}/internal`);
      if (!res.ok) return null;
      return (await res.json()) as BookInternal;
    } catch {
      this.logger.warn(`Could not fetch catalog internal for bookId=${bookId}`);
      return null;
    }
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    this.isDestroyed = true;
    await this.close();
  }

  private async connect() {
    const url = this.configService.get<string>('RABBITMQ_URL', 'amqp://localhost:5672');

    try {
      this.connection = await amqplib.connect(url);
      this.channel = await this.connection.createChannel();

      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ connection error', err.message);
        this.scheduleReconnect();
      });

      this.connection.on('close', () => {
        if (!this.isDestroyed) {
          this.logger.warn('RabbitMQ connection closed, reconnecting...');
          this.scheduleReconnect();
        }
      });

      await this.setupQueues();
      this.logger.log('RabbitMQ connected and consumers registered');
    } catch (err) {
      this.logger.error('Failed to connect to RabbitMQ', (err as Error).message);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (!this.isDestroyed) {
      setTimeout(() => this.connect(), 5000);
    }
  }

  async publishEvent(routingKey: string, payload: Record<string, unknown>) {
    if (!this.channel) return;
    const EXCHANGE = 'ebooks.events';
    await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    this.channel.publish(
      EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true },
    );
  }

  private async setupQueues() {
    if (!this.channel) return;

    const EXCHANGE = 'ebooks.events';
    await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true });

    const queues: Array<{ queue: string; routingKey: string }> = [
      { queue: 'reading.order.paid',              routingKey: 'commerce.order.paid' },
      { queue: 'reading.subscription.expired',    routingKey: 'subscription.expired' },
      { queue: 'reading.order.refunded',          routingKey: 'payment.refunded' },
      { queue: 'reading.subscription.activated',  routingKey: 'subscription.activated' },
    ];

    for (const { queue, routingKey } of queues) {
      await this.channel.assertQueue(queue, { durable: true });
      await this.channel.bindQueue(queue, EXCHANGE, routingKey);
    }

    // Queue: reading.order.paid
    await this.channel.consume('reading.order.paid', async (msg) => {
      if (!msg) return;
      try {
        const content: OrderPaidMessage = JSON.parse(msg.content.toString());
        await this.handleOrderPaid(content);
        this.channel?.ack(msg);
      } catch (err) {
        this.logger.error('Error processing reading.order.paid', (err as Error).message);
        this.channel?.nack(msg, false, false);
      }
    });

    // Queue: reading.subscription.expired
    await this.channel.consume('reading.subscription.expired', async (msg) => {
      if (!msg) return;
      try {
        const content: SubscriptionExpiredMessage = JSON.parse(msg.content.toString());
        await this.handleSubscriptionExpired(content);
        this.channel?.ack(msg);
      } catch (err) {
        this.logger.error('Error processing reading.subscription.expired', (err as Error).message);
        this.channel?.nack(msg, false, false);
      }
    });

    // Queue: reading.order.refunded
    await this.channel.consume('reading.order.refunded', async (msg) => {
      if (!msg) return;
      try {
        const content: OrderRefundedMessage = JSON.parse(msg.content.toString());
        await this.handleOrderRefunded(content);
        this.channel?.ack(msg);
      } catch (err) {
        this.logger.error('Error processing reading.order.refunded', (err as Error).message);
        this.channel?.nack(msg, false, false);
      }
    });

    // Queue: reading.subscription.activated
    await this.channel.consume('reading.subscription.activated', async (msg) => {
      if (!msg) return;
      try {
        const content: SubscriptionActivatedMessage = JSON.parse(msg.content.toString());
        await this.handleSubscriptionActivated(content);
        this.channel?.ack(msg);
      } catch (err) {
        this.logger.error('Error processing reading.subscription.activated', (err as Error).message);
        this.channel?.nack(msg, false, false);
      }
    });
  }

  private async handleOrderPaid(message: OrderPaidMessage) {
    const { userId, items } = message;

    for (const item of items) {
      if (item.bookType === 'EBOOK' || item.bookType === 'BOTH') {
        try {
          // Enrich with fileKey/format/totalPages from catalog if not in event
          let fileKey = item.fileKey;
          let format = item.format;
          let totalPages = item.totalPages;

          if (!fileKey) {
            const internal = await this.fetchBookInternal(item.bookId);
            if (internal) {
              fileKey = internal.fileKey;
              format = format ?? internal.format;
              totalPages = totalPages ?? internal.totalPages;
            }
          }

          await this.libraryService.grantAccess({
            userId,
            bookId: item.bookId,
            bookSlug: item.bookSlug,
            bookTitle: item.bookTitle,
            coverImage: item.bookCover,
            format,
            fileKey,
            totalPages,
            accessType: 'PURCHASED',
          });
          this.logger.log(`Granted access: user=${userId} book=${item.bookId}`);
        } catch (err) {
          this.logger.error(
            `Failed to grant access for user=${userId} book=${item.bookId}`,
            (err as Error).message,
          );
        }
      }
    }
  }

  private async handleSubscriptionExpired(message: SubscriptionExpiredMessage) {
    const { userId } = message;
    try {
      await this.libraryService.markSubscriptionsExpired(userId);
      this.logger.log(`Marked subscription entries as expired for user=${userId}`);
    } catch (err) {
      this.logger.error(
        `Failed to mark subscriptions expired for user=${userId}`,
        (err as Error).message,
      );
    }
  }

  private async handleOrderRefunded(message: OrderRefundedMessage) {
    const { userId, bookId } = message;
    try {
      await this.libraryService.revokeAccess(userId, bookId);
      this.logger.log(`Revoked access: user=${userId} book=${bookId}`);
    } catch (err) {
      this.logger.error(
        `Failed to revoke access for user=${userId} book=${bookId}`,
        (err as Error).message,
      );
    }
  }

  private async handleSubscriptionActivated(message: SubscriptionActivatedMessage) {
    const { userId, expiresAt } = message;
    const expiryDate = new Date(expiresAt);
    try {
      const res = await fetch(
        `${this.catalogUrl}/books?subscriptionOnly=true&size=500&page=0`,
      );
      if (!res.ok) {
        throw new Error(`Catalog returned ${res.status} when fetching subscription books for user=${userId}`);
      }
      const page = await res.json() as {
        content: Array<{
          id: string;
          slug: string;
          title: string;
          coverImageUrl?: string;
          format?: string;
          fileKey?: string;
          totalPages?: number;
          type: string;
        }>;
      };
      for (const book of page.content) {
        if (book.type === 'EBOOK' || book.type === 'BOTH') {
          let { fileKey, format, totalPages } = book;
          if (!fileKey) {
            const internal = await this.fetchBookInternal(book.id);
            if (internal) {
              fileKey = internal.fileKey;
              format = format ?? internal.format;
              totalPages = totalPages ?? internal.totalPages;
            }
          }
          await this.libraryService.grantAccess({
            userId,
            bookId: book.id,
            bookSlug: book.slug,
            bookTitle: book.title,
            coverImage: book.coverImageUrl,
            format,
            fileKey,
            totalPages,
            accessType: 'SUBSCRIPTION',
            expiresAt: expiryDate,
          });
        }
      }
      this.logger.log(`Granted subscription access to user=${userId}, expires=${expiresAt}`);
    } catch (err) {
      this.logger.error(
        `Failed to grant subscription access for user=${userId}`,
        (err as Error).message,
      );
    }
  }

  private async close() {
    try {
      await this.channel?.close();
    } catch {
      // ignore
    }
    try {
      await this.connection?.close();
    } catch {
      // ignore
    }
  }
}
