import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnnotationService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnnotations(userId: string, bookId: string) {
    return this.prisma.annotation.findMany({
      where: { userId, bookId },
      orderBy: { pageNumber: 'asc' },
    });
  }

  async upsertAnnotation(userId: string, bookId: string, pageNumber: number, content: string) {
    return this.prisma.annotation.upsert({
      where: { userId_bookId_pageNumber: { userId, bookId, pageNumber } },
      create: { userId, bookId, pageNumber, content },
      update: { content },
    });
  }

  async deleteAnnotation(userId: string, id: string) {
    const annotation = await this.prisma.annotation.findUnique({ where: { id } });
    if (!annotation || annotation.userId !== userId) {
      throw new NotFoundException('Annotation not found');
    }
    return this.prisma.annotation.delete({ where: { id } });
  }
}
