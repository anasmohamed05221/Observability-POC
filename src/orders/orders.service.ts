import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

type Tx = Prisma.TransactionClient;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      let total = 0;
      const itemsToCreate: { productId: number; quantity: number; unitPrice: Prisma.Decimal }[] = [];

      for (const item of dto.items) {
        const product = await this.checkStock(tx, item.productId, item.quantity);
        await this.reserveStock(tx, item.productId, item.quantity);
        total += Number(product.price) * item.quantity;
        itemsToCreate.push({ productId: item.productId, quantity: item.quantity, unitPrice: product.price });
      }

      const order = await this.createOrder(tx, total);
      await this.createOrderItems(tx, order.id, itemsToCreate);
      await this.chargePayment(order.id, total);
      return this.confirmOrder(tx, order.id);
    });
  }

  private async checkStock(tx: Tx, productId: number, quantity: number) {
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }
    if (product.stock < quantity) {
      throw new BadRequestException(
        `Insufficient stock for product ${productId}: requested ${quantity}, available ${product.stock}`,
      );
    }
    return product;
  }

  private async reserveStock(tx: Tx, productId: number, quantity: number) {
    await tx.product.update({
      where: { id: productId },
      data: { stock: { decrement: quantity } },
    });
  }

  private async createOrder(tx: Tx, total: number) {
    return tx.order.create({ data: { status: 'pending', total } });
  }

  private async createOrderItems(
    tx: Tx,
    orderId: number,
    items: { productId: number; quantity: number; unitPrice: Prisma.Decimal }[],
  ) {
    await tx.orderItem.createMany({
      data: items.map((item) => ({ orderId, ...item })),
    });
  }

  private async chargePayment(_orderId: number, _amount: number) {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  private async confirmOrder(tx: Tx, orderId: number) {
    return tx.order.update({
      where: { id: orderId },
      data: { status: 'confirmed' },
      include: { items: true },
    });
  }
}
