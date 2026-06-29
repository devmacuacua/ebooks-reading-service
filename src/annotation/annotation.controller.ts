import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { AnnotationService } from './annotation.service';

class UpsertAnnotationDto {
  bookId: string;
  pageNumber: number;
  content: string;
}

@Controller('reading/annotations')
export class AnnotationController {
  constructor(private readonly annotationService: AnnotationService) {}

  private getUserId(userId: string | undefined): string {
    if (!userId) throw new UnauthorizedException('X-User-Id header is required');
    return userId;
  }

  @Get()
  async getAnnotations(
    @Headers('x-user-id') userId: string | undefined,
    @Query('bookId') bookId: string,
  ) {
    const uid = this.getUserId(userId);
    return this.annotationService.getAnnotations(uid, bookId);
  }

  @Put()
  async upsertAnnotation(
    @Headers('x-user-id') userId: string | undefined,
    @Body() dto: UpsertAnnotationDto,
  ) {
    const uid = this.getUserId(userId);
    return this.annotationService.upsertAnnotation(uid, dto.bookId, dto.pageNumber, dto.content);
  }

  @Delete(':id')
  async deleteAnnotation(
    @Headers('x-user-id') userId: string | undefined,
    @Param('id') id: string,
  ) {
    const uid = this.getUserId(userId);
    return this.annotationService.deleteAnnotation(uid, id);
  }
}
