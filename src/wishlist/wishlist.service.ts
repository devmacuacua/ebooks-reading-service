import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async addBook(
    userId: string,
    bookId: string,
    bookTitle: string,
    bookSlug?: string,
    coverImage?: string,
    price?: number,
  ) {
    const existing = await this.prisma.wishlistItem.findUnique({
      where: { userId_bookId: { userId, bookId } },
    });
    if (existing) throw new ConflictException('Book already in wishlist');

    return this.prisma.wishlistItem.create({
      data: { userId, bookId, bookSlug, bookTitle, coverImage, price },
    });
  }

  async removeBook(userId: string, bookId: string) {
    const item = await this.prisma.wishlistItem.findUnique({
      where: { userId_bookId: { userId, bookId } },
    });
    if (!item) throw new NotFoundException('Book not in wishlist');
    return this.prisma.wishlistItem.delete({ where: { userId_bookId: { userId, bookId } } });
  }

  async getWishlist(userId: string) {
    return this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { addedAt: 'desc' },
    });
  }

  async isInWishlist(userId: string, bookId: string): Promise<boolean> {
    const item = await this.prisma.wishlistItem.findUnique({
      where: { userId_bookId: { userId, bookId } },
    });
    return item !== null;
  }

  async checkBatch(userId: string, bookIds: string[]): Promise<Record<string, boolean>> {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId, bookId: { in: bookIds } },
      select: { bookId: true },
    });
    const set = new Set(items.map((i) => i.bookId));
    return Object.fromEntries(bookIds.map((id) => [id, set.has(id)]));
  }
}
