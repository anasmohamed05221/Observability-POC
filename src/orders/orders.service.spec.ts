import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: { $transaction: jest.Mock };

  beforeEach(async () => {
    prisma = { $transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OrdersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('rejects an order when requested quantity exceeds stock', async () => {
    const tx = {
      product: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, price: 10, stock: 2 }),
      },
    };
    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
      cb(tx),
    );

    await expect(
      service.create({ items: [{ productId: 1, quantity: 5 }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when the product does not exist', async () => {
    const tx = {
      product: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
      cb(tx),
    );

    await expect(
      service.create({ items: [{ productId: 999, quantity: 1 }] }),
    ).rejects.toThrow(NotFoundException);
  });
});
