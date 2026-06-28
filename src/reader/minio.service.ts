import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class MinioService implements OnModuleInit {
  private minioClient: Minio.Client;
  private bucket: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const endpoint = this.configService.get<string>('MINIO_ENDPOINT', 'http://localhost:9000');
    const accessKey = this.configService.get<string>('MINIO_ACCESS_KEY', 'minioadmin');
    const secretKey = this.configService.get<string>('MINIO_SECRET_KEY', 'minioadmin');
    this.bucket = this.configService.get<string>('MINIO_BUCKET', 'ebooks');

    // Parse host from endpoint URL
    let endpointHost = endpoint;
    let port = 9000;
    let useSSL = false;

    try {
      const url = new URL(endpoint);
      endpointHost = url.hostname;
      port = url.port ? parseInt(url.port, 10) : (url.protocol === 'https:' ? 443 : 9000);
      useSSL = url.protocol === 'https:';
    } catch {
      // If not a valid URL, use as-is
      endpointHost = endpoint;
    }

    this.minioClient = new Minio.Client({
      endPoint: endpointHost,
      port,
      useSSL,
      accessKey,
      secretKey,
    });
  }

  async getObjectStream(fileKey: string): Promise<NodeJS.ReadableStream> {
    return this.minioClient.getObject(this.bucket, fileKey);
  }

  async getObjectBuffer(fileKey: string): Promise<Buffer> {
    const stream = await this.getObjectStream(fileKey);
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
