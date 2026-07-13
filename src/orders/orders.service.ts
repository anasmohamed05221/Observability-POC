import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SpanStatusCode } from '@opentelemetry/api';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { tracer } from '../otel/tracer';

type Tx = Prisma.TransactionClient;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrderDto) {
    return tracer.startActiveSpan('order.transaction', async (span) => {
      try {
        return await this.prisma.$transaction(async (tx) => {
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
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        span.end();
      }
    });
  }

  private async checkStock(tx: Tx, productId: number, quantity: number) {
    return tracer.startActiveSpan('inventory.check', async (span) => {
      try {
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
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        span.end();
      }
    });
  }

  private async reserveStock(tx: Tx, productId: number, quantity: number) {
    return tracer.startActiveSpan('inventory.reserve', async (span) => {
      try {
        await tx.product.update({
          where: { id: productId },
          data: { stock: { decrement: quantity } },
        });
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        span.end();
      }
    });
  }

  private async createOrder(tx: Tx, total: number) {
    return tracer.startActiveSpan('order.create', async (span) => {
      try {
        return await tx.order.create({ data: { status: 'pending', total } });
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        span.end();
      }
    });
  }

  private async createOrderItems(
    tx: Tx,
    orderId: number,
    items: { productId: number; quantity: number; unitPrice: Prisma.Decimal }[],
  ) {
    return tracer.startActiveSpan('order.items.create', async (span) => {
      try {
        await tx.orderItem.createMany({
          data: items.map((item) => ({ orderId, ...item })),
        });
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        span.end();
      }
    });
  }

  private async chargePayment(_orderId: number, _amount: number) {
    return tracer.startActiveSpan('payment.charge', async (span) => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 150));
      } finally {
        span.end();
      }
    });
  }

  private async confirmOrder(tx: Tx, orderId: number) {
    return tracer.startActiveSpan('order.confirm', async (span) => {
      try {
        return await tx.order.update({
          where: { id: orderId },
          data: { status: 'confirmed' },
          include: { items: true },
        });
      } finally {
        span.end();
      }
    });
  }

  async findOne(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
  }
}
