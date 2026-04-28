import { db, accountsTable, usersTable, suppliersTable, clientsTable, lotsTable, purchasesTable, salesTable, saleItemsTable } from "@workspace/db";
import { logger } from "./logger";

export async function seedDatabase() {
  // Check if already seeded
  const existingAccounts = await db.select().from(accountsTable).limit(1);
  if (existingAccounts.length > 0) {
    logger.info("Database already seeded, skipping");
    return;
  }

  logger.info("Seeding database...");

  // PCG 2005 chart of accounts
  const accounts = [
    { code: "31", name: "Stocks de matières premières", type: "actif" },
    { code: "401", name: "Fournisseurs", type: "passif" },
    { code: "411", name: "Clients", type: "actif" },
    { code: "512", name: "Banques", type: "actif" },
    { code: "701", name: "Ventes de produits finis", type: "produit" },
    { code: "602", name: "Achats stockés - Matières premières", type: "charge" },
    { code: "44571", name: "TVA collectée", type: "passif" },
    { code: "44566", name: "TVA déductible", type: "actif" },
  ];

  await db.insert(accountsTable).values(accounts);

  // Admin user (password is plain text for simplicity per spec)
  await db.insert(usersTable).values({
    email: "admin@vanillaMadagascar.mg",
    password: "admin123",
    role: "admin",
  });

  // Sample suppliers
  const [supplier1] = await db
    .insert(suppliersTable)
    .values([
      { name: "Collecteur SAVA", region: "SAVA", phone: "0340000001", score: 85 },
      { name: "Coopérative Andapa", region: "Andapa", phone: "0340000002", score: 92 },
      { name: "Producteurs Sambava", region: "Sambava", phone: "0340000003", score: 78 },
    ])
    .returning();

  // Sample clients
  const [client1] = await db
    .insert(clientsTable)
    .values([
      { name: "Vanilla Import France", country: "France", email: "contact@vanillaimport.fr", currency: "EUR" },
      { name: "Spice World USA", country: "United States", email: "orders@spiceworld.com", currency: "USD" },
    ])
    .returning();

  // Sample lots
  const [lot1] = await db
    .insert(lotsTable)
    .values([
      { code: "VAN-2026-001", supplierId: supplier1.id, weightInitial: 120, weightCurrent: 110, humidity: 32, grade: "gourmet", status: "curing" },
      { code: "VAN-2026-002", supplierId: supplier1.id, weightInitial: 80, weightCurrent: 75, humidity: 28, grade: "standard", status: "drying" },
    ])
    .returning();

  // Sample purchase
  await db.insert(purchasesTable).values({
    supplierId: supplier1.id,
    totalAmount: 500000,
    paymentMethod: "mobile_money",
  });

  logger.info("Database seeded successfully");
}
