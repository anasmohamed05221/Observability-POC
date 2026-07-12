import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();

  await prisma.product.createMany({
    data: [
      { name: 'Wireless Mouse', price: 19.99, stock: 50 },
      { name: 'Mechanical Keyboard', price: 89.99, stock: 25 },
      { name: 'USB-C Hub', price: 34.5, stock: 40 },
      { name: 'Limited Edition Headset', price: 129.0, stock: 2 },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
