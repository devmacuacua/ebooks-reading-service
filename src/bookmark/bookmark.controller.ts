import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { BookmarkService } from './bookmark.service';

class CreateBookmarkDto {
  bookId: string;
  pageNumber: number;
  label?: string;
}

@Controller('reading/bookmarks')
export class BookmarkController {
  constructor(private readonly bookmarkService: BookmarkService) {}

  private getUserId(userId: string | undefined): string {
    if (!userId) throw new UnauthorizedException('X-User-Id header is required');
    return userId;
  }

  @Get()
  async getBookmarks(
    @Headers('x-user-id') userId: string | undefined,
    @Query('bookId') bookId: string,
  ) {
    const uid = this.getUserId(userId);
    return this.bookmarkService.getBookmarks(uid, bookId);
  }

  @Post()
  async addBookmark(
    @Headers('x-user-id') userId: string | undefined,
    @Body() dto: CreateBookmarkDto,
  ) {
    const uid = this.getUserId(userId);
    return this.bookmarkService.addBookmark(uid, dto.bookId, dto.pageNumber, dto.label);
  }

  @Delete(':id')
  async removeBookmark(
    @Headers('x-user-id') userId: string | undefined,
    @Param('id') id: string,
  ) {
    const uid = this.getUserId(userId);
    return this.bookmarkService.removeBookmark(uid, id);
  }
}
