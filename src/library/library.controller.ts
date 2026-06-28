import {
  Controller,
  Get,
  Param,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { LibraryService } from './library.service';

@Controller('reading/library')
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  private getUserId(userId: string | undefined): string {
    if (!userId) {
      throw new UnauthorizedException('X-User-Id header is required');
    }
    return userId;
  }

  @Get()
  async getUserLibrary(@Headers('x-user-id') userId: string | undefined) {
    const uid = this.getUserId(userId);
    return this.libraryService.getUserLibrary(uid);
  }

  @Get('access')
  async checkAccess(
    @Headers('x-user-id') userId: string | undefined,
    @Query('bookId') bookId: string,
  ) {
    const uid = this.getUserId(userId);
    const hasAccess = await this.libraryService.hasAccess(uid, bookId);
    return { hasAccess };
  }

  @Get('book/:bookId')
  async getEntry(
    @Headers('x-user-id') userId: string | undefined,
    @Param('bookId') bookId: string,
  ) {
    const uid = this.getUserId(userId);
    const entry = await this.libraryService.getEntry(uid, bookId);
    const hasAccess = await this.libraryService.hasAccess(uid, bookId);

    return {
      ...entry,
      hasAccess,
    };
  }
}
