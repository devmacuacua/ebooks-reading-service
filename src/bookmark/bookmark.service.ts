import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BookmarkService {
  constructor(private readonly prisma: PrismaService) {}

  async getBookmarks(userId: string, bookId: string) {
    return this.prisma.bookmark.findMany({
      where: { userId, bookId },
      orderBy: { pageNumber: 'asc' },
    });
  }

  async addBookmark(userId: string, bookId: string, pageNumber: number, label?: string) {
    return this.prisma.bookmark.upsert({
      where: { userId_bookId_pageNumber: { userId, bookId, pageNumber } },
      create: { userId, bookId, pageNumber, label: label ?? null },
      update: { label: label ?? null },
    });
  }

  async removeBookmark(userId: string, id: string) {
    const bookmark = await this.prisma.bookmark.findUnique({ where: { id } });
    if (!bookmark || bookmark.userId !== userId) {
      throw new NotFoundException('Bookmark not found');
    }
    return this.prisma.bookmark.delete({ where: { id } });
  }
}
