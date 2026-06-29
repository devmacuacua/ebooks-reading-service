import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

class AddToWishlistDto {
  bookId: string;
  bookTitle: string;
  bookSlug?: string;
  coverImage?: string;
  price?: number;
}

@ApiTags('Wishlist')
@Controller('reading/wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiOperation({ summary: 'Get authenticated user wishlist' })
  getWishlist(@Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('Missing X-User-Id header');
    return this.wishlistService.getWishlist(userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a book to the wishlist' })
  addBook(@Headers('x-user-id') userId: string, @Body() dto: AddToWishlistDto) {
    if (!userId) throw new BadRequestException('Missing X-User-Id header');
    if (!dto.bookId || !dto.bookTitle) throw new BadRequestException('bookId and bookTitle are required');
    return this.wishlistService.addBook(userId, dto.bookId, dto.bookTitle, dto.bookSlug, dto.coverImage, dto.price);
  }

  @Delete(':bookId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a book from the wishlist' })
  removeBook(@Headers('x-user-id') userId: string, @Param('bookId') bookId: string) {
    if (!userId) throw new BadRequestException('Missing X-User-Id header');
    return this.wishlistService.removeBook(userId, bookId);
  }

  @Get(':bookId/check')
  @ApiOperation({ summary: 'Check if a book is in the wishlist' })
  checkBook(@Headers('x-user-id') userId: string, @Param('bookId') bookId: string) {
    if (!userId) throw new BadRequestException('Missing X-User-Id header');
    return this.wishlistService.isInWishlist(userId, bookId).then((inWishlist) => ({ inWishlist }));
  }

  @Post('batch-check')
  @ApiOperation({ summary: 'Batch check which books are in the wishlist' })
  batchCheck(@Headers('x-user-id') userId: string, @Body() body: { bookIds: string[] }) {
    if (!userId) throw new BadRequestException('Missing X-User-Id header');
    return this.wishlistService.checkBatch(userId, body.bookIds ?? []);
  }
}
