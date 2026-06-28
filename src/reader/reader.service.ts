import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { PrismaService } from '../prisma/prisma.service';
import { LibraryService } from '../library/library.service';
import { DrmService } from './drm.service';
import { MinioService } from './minio.service';
import { RabbitMQConsumerService } from '../rabbitmq/rabbitmq-consumer.service';

@Injectable()
export class ReaderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly libraryService: LibraryService,
    private readonly drmService: DrmService,
    private readonly minioService: MinioService,
    private readonly rabbitMQ: RabbitMQConsumerService,
  ) {}

  async getBookMetadata(userId: string, bookId: string) {
    const entry = await this.libraryService.getEntry(userId, bookId);
    const session = entry.sessions[0] ?? null;

    this.rabbitMQ.publishEvent('reading.session.started', {
      bookId: entry.bookId,
      bookTitle: entry.bookTitle,
      userId,
    }).catch(() => { /* non-blocking */ });

    return {
      bookId: entry.bookId,
      bookTitle: entry.bookTitle,
      format: entry.format,
      totalPages: entry.totalPages,
      currentPage: session?.currentPage ?? 0,
      progressPct: session?.progressPct ?? 0,
      accessType: entry.accessType,
      expiresAt: entry.expiresAt,
    };
  }

  async getPage(
    userId: string,
    bookId: string,
    pageNumber: number,
    deviceId: string,
    token: string,
  ): Promise<{
    pageData: Buffer;
    totalPages: number;
    newToken: string;
    newExpiresAt: Date;
  }> {
    // 1. Validate and rotate DRM token
    const tokenResult = await this.drmService.validateAndRotateToken(
      token,
      userId,
      bookId,
      deviceId,
    );

    if (!tokenResult.valid || !tokenResult.newToken || !tokenResult.newExpiresAt) {
      throw new UnauthorizedException('Invalid, expired, or mismatched DRM token');
    }

    // 2. Get library entry (has fileKey)
    const entry = await this.libraryService.getEntry(userId, bookId);

    if (!entry.fileKey) {
      throw new NotFoundException('No file associated with this book entry');
    }

    // 3. Get file buffer from MinIO
    const fileBuffer = await this.minioService.getObjectBuffer(entry.fileKey);

    // 4. Extract and watermark page using pdf-lib
    const sourcePdf = await PDFDocument.load(fileBuffer);
    const totalPages = sourcePdf.getPageCount();

    const pageIndex = pageNumber - 1; // Convert 1-based to 0-based
    if (pageIndex < 0 || pageIndex >= totalPages) {
      throw new NotFoundException(`Page ${pageNumber} does not exist in this document`);
    }

    // Create a new PDF with just this one page
    const singlePagePdf = await PDFDocument.create();
    const [copiedPage] = await singlePagePdf.copyPages(sourcePdf, [pageIndex]);
    singlePagePdf.addPage(copiedPage);

    // Add watermark: userId drawn diagonally at 45° with low opacity
    const page = singlePagePdf.getPages()[0];
    const { width, height } = page.getSize();
    const font = await singlePagePdf.embedFont(StandardFonts.Helvetica);
    const watermarkText = `User: ${userId}`;
    const fontSize = 28;

    // Draw watermark multiple times across the page
    const positions = [
      { x: width * 0.15, y: height * 0.35 },
      { x: width * 0.35, y: height * 0.65 },
      { x: width * 0.55, y: height * 0.25 },
      { x: width * 0.25, y: height * 0.75 },
    ];

    for (const pos of positions) {
      page.drawText(watermarkText, {
        x: pos.x,
        y: pos.y,
        size: fontSize,
        font,
        color: rgb(0.7, 0.7, 0.7),
        opacity: 0.15,
        rotate: degrees(45),
      });
    }

    const pageBytes = await singlePagePdf.save();
    const pageData = Buffer.from(pageBytes);

    // 5. Update ReadingSession
    const effectiveTotalPages = entry.totalPages ?? totalPages;
    const progressPct = effectiveTotalPages > 0
      ? (pageNumber / effectiveTotalPages) * 100
      : 0;

    await this.prisma.readingSession.upsert({
      where: {
        userId_bookId_deviceId: { userId, bookId, deviceId },
      },
      update: {
        currentPage: pageNumber,
        progressPct,
        totalPages: effectiveTotalPages,
        lastReadAt: new Date(),
      },
      create: {
        userId,
        libraryId: entry.id,
        bookId,
        currentPage: pageNumber,
        totalPages: effectiveTotalPages,
        progressPct,
        deviceId,
        lastReadAt: new Date(),
      },
    });

    return {
      pageData,
      totalPages: effectiveTotalPages,
      newToken: tokenResult.newToken,
      newExpiresAt: tokenResult.newExpiresAt,
    };
  }

  async updateProgress(
    userId: string,
    bookId: string,
    deviceId: string,
    currentPage: number,
  ) {
    const entry = await this.libraryService.getEntry(userId, bookId);
    const effectiveTotalPages = entry.totalPages ?? 0;
    const progressPct = effectiveTotalPages > 0
      ? (currentPage / effectiveTotalPages) * 100
      : 0;

    return this.prisma.readingSession.upsert({
      where: {
        userId_bookId_deviceId: { userId, bookId, deviceId },
      },
      update: {
        currentPage,
        progressPct,
        lastReadAt: new Date(),
      },
      create: {
        userId,
        libraryId: entry.id,
        bookId,
        currentPage,
        totalPages: effectiveTotalPages,
        progressPct,
        deviceId,
        lastReadAt: new Date(),
      },
    });
  }

  async getReadingSessions(userId: string) {
    return this.prisma.readingSession.findMany({
      where: { userId },
      include: {
        library: {
          select: {
            bookTitle: true,
            format: true,
            accessType: true,
            expiresAt: true,
          },
        },
      },
      orderBy: { lastReadAt: 'desc' },
    });
  }
}
