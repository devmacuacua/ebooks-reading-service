import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LibraryService } from './library.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  userLibrary: {
    upsert: jest.fn(),
    delete: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
};

const PAST = new Date(Date.now() - 10_000);
const FUTURE = new Date(Date.now() + 86_400_000);

const baseEntry = {
  id: 'lib-1',
  userId: 'user-1',
  bookId: 'book-1',
  bookTitle: 'Clean Code',
  coverImage: 'cover.jpg',
  format: 'PDF',
  fileKey: 'files/book-1.pdf',
  totalPages: 200,
  accessType: 'PURCHASE',
  grantedAt: new Date('2024-01-01'),
  expiresAt: null,
  sessions: [],
};

describe('LibraryService', () => {
  let service: LibraryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibraryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<LibraryService>(LibraryService);
    jest.clearAllMocks();
  });

  // ── grantAccess ─────────────────────────────────────────────────────────────

  describe('grantAccess', () => {
    it('should upsert a library entry', async () => {
      mockPrisma.userLibrary.upsert.mockResolvedValue(baseEntry);

      const result = await service.grantAccess({
        userId: 'user-1',
        bookId: 'book-1',
        bookTitle: 'Clean Code',
        format: 'PDF',
        fileKey: 'files/book-1.pdf',
        totalPages: 200,
        accessType: 'PURCHASE',
      });

      expect(mockPrisma.userLibrary.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_bookId: { userId: 'user-1', bookId: 'book-1' } },
        }),
      );
      expect(result.bookTitle).toBe('Clean Code');
    });

    it('should set expiresAt to null when not provided', async () => {
      mockPrisma.userLibrary.upsert.mockResolvedValue(baseEntry);

      await service.grantAccess({
        userId: 'user-1',
        bookId: 'book-1',
        bookTitle: 'Book',
        accessType: 'SUBSCRIPTION',
      });

      const call = mockPrisma.userLibrary.upsert.mock.calls[0][0];
      expect(call.create.expiresAt).toBeNull();
      expect(call.update.expiresAt).toBeNull();
    });

    it('should pass expiresAt when provided', async () => {
      mockPrisma.userLibrary.upsert.mockResolvedValue(baseEntry);

      await service.grantAccess({
        userId: 'user-1',
        bookId: 'book-1',
        bookTitle: 'Book',
        accessType: 'SUBSCRIPTION',
        expiresAt: FUTURE,
      });

      const call = mockPrisma.userLibrary.upsert.mock.calls[0][0];
      expect(call.create.expiresAt).toEqual(FUTURE);
    });
  });

  // ── revokeAccess ────────────────────────────────────────────────────────────

  describe('revokeAccess', () => {
    it('should delete the library entry', async () => {
      mockPrisma.userLibrary.delete.mockResolvedValue(baseEntry);

      const result = await service.revokeAccess('user-1', 'book-1');

      expect(mockPrisma.userLibrary.delete).toHaveBeenCalledWith({
        where: { userId_bookId: { userId: 'user-1', bookId: 'book-1' } },
      });
      expect(result).toEqual(baseEntry);
    });

    it('should return null when entry does not exist (ignores error)', async () => {
      mockPrisma.userLibrary.delete.mockRejectedValue(new Error('Record not found'));

      const result = await service.revokeAccess('user-1', 'nonexistent');

      expect(result).toBeNull();
    });
  });

  // ── hasAccess ───────────────────────────────────────────────────────────────

  describe('hasAccess', () => {
    it('should return true for a valid non-expiring entry', async () => {
      mockPrisma.userLibrary.findUnique.mockResolvedValue({ ...baseEntry, expiresAt: null });

      const result = await service.hasAccess('user-1', 'book-1');

      expect(result).toBe(true);
    });

    it('should return true for an entry that has not yet expired', async () => {
      mockPrisma.userLibrary.findUnique.mockResolvedValue({ ...baseEntry, expiresAt: FUTURE });

      const result = await service.hasAccess('user-1', 'book-1');

      expect(result).toBe(true);
    });

    it('should return false when entry has expired', async () => {
      mockPrisma.userLibrary.findUnique.mockResolvedValue({ ...baseEntry, expiresAt: PAST });

      const result = await service.hasAccess('user-1', 'book-1');

      expect(result).toBe(false);
    });

    it('should return false when entry does not exist', async () => {
      mockPrisma.userLibrary.findUnique.mockResolvedValue(null);

      const result = await service.hasAccess('user-1', 'missing-book');

      expect(result).toBe(false);
    });
  });

  // ── getUserLibrary ──────────────────────────────────────────────────────────

  describe('getUserLibrary', () => {
    it('should return formatted library entries', async () => {
      const session = { currentPage: 42, progressPct: 21, lastReadAt: new Date() };
      mockPrisma.userLibrary.findMany.mockResolvedValue([
        { ...baseEntry, sessions: [session] },
      ]);

      const result = await service.getUserLibrary('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].bookId).toBe('book-1');
      expect(result[0].bookTitle).toBe('Clean Code');
      expect(result[0].lastSession).toEqual(session);
      expect(result[0].isExpired).toBe(false);
    });

    it('should mark entry as expired when expiresAt is in the past', async () => {
      mockPrisma.userLibrary.findMany.mockResolvedValue([
        { ...baseEntry, expiresAt: PAST, sessions: [] },
      ]);

      const result = await service.getUserLibrary('user-1');

      expect(result[0].isExpired).toBe(true);
    });

    it('should return null lastSession when no sessions exist', async () => {
      mockPrisma.userLibrary.findMany.mockResolvedValue([
        { ...baseEntry, sessions: [] },
      ]);

      const result = await service.getUserLibrary('user-1');

      expect(result[0].lastSession).toBeNull();
    });

    it('should return entries ordered by grantedAt desc (delegates to Prisma)', async () => {
      mockPrisma.userLibrary.findMany.mockResolvedValue([]);

      await service.getUserLibrary('user-1');

      expect(mockPrisma.userLibrary.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { grantedAt: 'desc' },
        }),
      );
    });
  });

  // ── getEntry ────────────────────────────────────────────────────────────────

  describe('getEntry', () => {
    it('should return entry when found', async () => {
      mockPrisma.userLibrary.findUnique.mockResolvedValue(baseEntry);

      const result = await service.getEntry('user-1', 'book-1');

      expect(result.bookId).toBe('book-1');
    });

    it('should throw NotFoundException when entry not found', async () => {
      mockPrisma.userLibrary.findUnique.mockResolvedValue(null);

      await expect(service.getEntry('user-1', 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── markSubscriptionsExpired ────────────────────────────────────────────────

  describe('markSubscriptionsExpired', () => {
    it('should set expiresAt to now for all SUBSCRIPTION entries', async () => {
      mockPrisma.userLibrary.updateMany.mockResolvedValue({ count: 3 });

      await service.markSubscriptionsExpired('user-1');

      expect(mockPrisma.userLibrary.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', accessType: 'SUBSCRIPTION' },
          data: expect.objectContaining({ expiresAt: expect.any(Date) }),
        }),
      );
    });
  });
});
