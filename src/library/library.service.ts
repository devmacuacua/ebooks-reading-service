import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface GrantAccessDto {
  userId: string;
  bookId: string;
  bookTitle: string;
  coverImage?: string;
  format?: string;
  fileKey?: string;
  totalPages?: number;
  accessType: string;
  expiresAt?: Date;
}

@Injectable()
export class LibraryService {
  constructor(private readonly prisma: PrismaService) {}

  async grantAccess(dto: GrantAccessDto) {
    const { userId, bookId, bookTitle, coverImage, format, fileKey, totalPages, accessType, expiresAt } = dto;

    return this.prisma.userLibrary.upsert({
      where: { userId_bookId: { userId, bookId } },
      update: {
        bookTitle,
        coverImage,
        format,
        fileKey,
        totalPages,
        accessType,
        expiresAt: expiresAt ?? null,
        grantedAt: new Date(),
      },
      create: {
        userId,
        bookId,
        bookTitle,
        coverImage,
        format,
        fileKey,
        totalPages,
        accessType,
        expiresAt: expiresAt ?? null,
      },
    });
  }

  async revokeAccess(userId: string, bookId: string) {
    try {
      return await this.prisma.userLibrary.delete({
        where: { userId_bookId: { userId, bookId } },
      });
    } catch {
      // If not found, ignore
      return null;
    }
  }

  async hasAccess(userId: string, bookId: string): Promise<boolean> {
    const entry = await this.prisma.userLibrary.findUnique({
      where: { userId_bookId: { userId, bookId } },
    });

    if (!entry) return false;
    if (entry.expiresAt && entry.expiresAt < new Date()) return false;

    return true;
  }

  async getUserLibrary(userId: string) {
    const entries = await this.prisma.userLibrary.findMany({
      where: { userId },
      include: {
        sessions: {
          orderBy: { lastReadAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { grantedAt: 'desc' },
    });

    return entries.map((entry) => ({
      id: entry.id,
      bookId: entry.bookId,
      bookTitle: entry.bookTitle,
      coverImage: entry.coverImage,
      format: entry.format,
      totalPages: entry.totalPages,
      accessType: entry.accessType,
      grantedAt: entry.grantedAt,
      expiresAt: entry.expiresAt,
      isExpired: entry.expiresAt ? entry.expiresAt < new Date() : false,
      lastSession: entry.sessions[0] ?? null,
    }));
  }

  async getEntry(userId: string, bookId: string) {
    const entry = await this.prisma.userLibrary.findUnique({
      where: { userId_bookId: { userId, bookId } },
      include: {
        sessions: {
          orderBy: { lastReadAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!entry) {
      throw new NotFoundException(`Library entry not found for bookId=${bookId}`);
    }

    return entry;
  }

  async markSubscriptionsExpired(userId: string) {
    await this.prisma.userLibrary.updateMany({
      where: {
        userId,
        accessType: 'SUBSCRIPTION',
      },
      data: {
        expiresAt: new Date(),
      },
    });
  }
}
