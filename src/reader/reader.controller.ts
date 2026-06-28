import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  Headers,
  Res,
  ParseIntPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { IsString, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import { ReaderService } from './reader.service';
import { DrmService } from './drm.service';

class GenerateTokenDto {
  @IsString()
  @IsNotEmpty()
  bookId: string;

  @IsString()
  @IsNotEmpty()
  deviceId: string;
}

class UpdateProgressDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  currentPage: number;

  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @IsOptional()
  @IsString()
  deviceName?: string;
}

@Controller('reading/reader')
export class ReaderController {
  constructor(
    private readonly readerService: ReaderService,
    private readonly drmService: DrmService,
  ) {}

  private getUserId(userId: string | undefined): string {
    if (!userId) {
      throw new UnauthorizedException('X-User-Id header is required');
    }
    return userId;
  }

  @Post('token')
  async generateToken(
    @Headers('x-user-id') userId: string | undefined,
    @Body() dto: GenerateTokenDto,
  ) {
    const uid = this.getUserId(userId);
    return this.drmService.generateToken(uid, dto.bookId, dto.deviceId);
  }

  @Get('sessions')
  async getMySessions(@Headers('x-user-id') userId: string | undefined) {
    const uid = this.getUserId(userId);
    return this.readerService.getReadingSessions(uid);
  }

  @Get(':bookId/metadata')
  async getBookMetadata(
    @Headers('x-user-id') userId: string | undefined,
    @Param('bookId') bookId: string,
  ) {
    const uid = this.getUserId(userId);
    return this.readerService.getBookMetadata(uid, bookId);
  }

  @Get(':bookId/page/:pageNumber')
  async getPage(
    @Headers('x-user-id') userId: string | undefined,
    @Param('bookId') bookId: string,
    @Param('pageNumber', ParseIntPipe) pageNumber: number,
    @Query('token') token: string,
    @Query('deviceId') deviceId: string,
    @Res() res: Response,
  ) {
    const uid = this.getUserId(userId);

    if (!token || !deviceId) {
      throw new UnauthorizedException('token and deviceId query parameters are required');
    }

    const result = await this.readerService.getPage(uid, bookId, pageNumber, deviceId, token);

    res.set({
      'Content-Type': 'application/pdf',
      'Cache-Control': 'no-store, no-cache, no-transform, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'X-New-DRM-Token': result.newToken,
      'X-New-DRM-Expires': result.newExpiresAt.toISOString(),
    });

    res.send(result.pageData);
  }

  @Post(':bookId/progress')
  async updateProgress(
    @Headers('x-user-id') userId: string | undefined,
    @Param('bookId') bookId: string,
    @Body() dto: UpdateProgressDto,
  ) {
    const uid = this.getUserId(userId);
    return this.readerService.updateProgress(uid, bookId, dto.deviceId, dto.currentPage);
  }
}
