import { Injectable, UnauthorizedException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { LibraryService } from '../library/library.service';

@Injectable()
export class DrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly libraryService: LibraryService,
  ) {}

  async generateToken(
    userId: string,
    bookId: string,
    deviceId: string,
  ): Promise<{ token: string; bookId: string; totalPages: number; expiresAt: Date }> {
    const entry = await this.libraryService.getEntry(userId, bookId);

    if (entry.expiresAt && entry.expiresAt < new Date()) {
      throw new UnauthorizedException('Access to this book has expired');
    }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    await this.prisma.readingToken.create({
      data: {
        userId,
        bookId,
        token,
        deviceId,
        expiresAt,
      },
    });

    return { token, bookId, totalPages: entry.totalPages ?? 0, expiresAt };
  }

  async validateAndRotateToken(
    token: string,
    userId: string,
    bookId: string,
    deviceId: string,
  ): Promise<{ valid: boolean; newToken?: string; newExpiresAt?: Date }> {
    const readingToken = await this.prisma.readingToken.findUnique({
      where: { token },
    });

    if (!readingToken) {
      return { valid: false };
    }

    // Validate: not expired
    if (readingToken.expiresAt < new Date()) {
      await this.prisma.readingToken.delete({ where: { token } });
      return { valid: false };
    }

    // Validate: bound to correct userId + bookId + deviceId
    if (
      readingToken.userId !== userId ||
      readingToken.bookId !== bookId ||
      readingToken.deviceId !== deviceId
    ) {
      return { valid: false };
    }

    // Delete old token (single-use: immediate rotation)
    await this.prisma.readingToken.delete({ where: { token } });

    // Issue new token
    const newToken = uuidv4();
    const newExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.readingToken.create({
      data: {
        userId,
        bookId,
        token: newToken,
        deviceId,
        expiresAt: newExpiresAt,
      },
    });

    return { valid: true, newToken, newExpiresAt };
  }
}
