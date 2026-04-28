import {
  db,
  accountsTable,
  usersTable,
  suppliersTable,
  clientsTable,
  lotsTable,
  purchasesTable,
  stockMovementsTable,
  journalEntriesTable,
  journalLinesTable,
  employeesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export async function seedDatabase() {
  // Check if already seeded (check accounts first)
  const existingAccounts = await db.select().from(accountsTable).limit(1);
  if (existingAccounts.length === 0) {
    logger.info("Seeding PCG 2005 accounts...");

    await db.insert(accountsTable).values([
      { code: "31", name: "Stocks de matières premières", type: "actif" },
      { code: "401", name: "Fournisseurs", type: "passif" },
      { code: "411", name: "Clients", type: "actif" },
      { code: "512", name: "Banques", type: "actif" },
      { code: "701", name: "Ventes de produits finis", type: "produit" },
      { code: "602", name: "Achats stockés - Matières premières", type: "charge" },
      { code: "44571", name: "TVA collectée", type: "passif" },
      { code: "44566", name: "TVA déductible", type: "actif" },
    ]);
  }

  const existingUsers = await db.select().from(usersTable).limit(1);
  if (existingUsers.length === 0) {
    await db.insert(usersTable).values({
      email: "admin@vanillaMadagascar.mg",
      password: "admin123",
      role: "admin",
    });
  }

  // HR: seed sample employees (always checked, independent of suppliers)
  const existingEmployees = await db.select().from(employeesTable).limit(1);
  if (existingEmployees.length === 0) {
    logger.info("Seeding HR employees...");
    await db.insert(employeesTable).values([
      { name: "Rindra Rakotondrabe",  position: "Responsable Production", department: "Production",     salary: 1800000, phone: "+261 32 11 111 11" },
      { name: "Vola Andriamahefa",    position: "Contrôleuse Qualité",    department: "Qualité",       salary: 1400000, phone: "+261 33 22 222 22" },
      { name: "Heritiana Razafy",     position: "Opérateur Séchage",      department: "Séchage",       salary: 900000,  phone: "+261 34 33 333 33" },
      { name: "Fanja Randrianirina",  position: "Responsable Logistique", department: "Logistique",    salary: 1600000, phone: "+261 32 44 444 44" },
      { name: "Tojo Rabemananjara",   position: "Comptable",              department: "Finance",       salary: 1500000, phone: "+261 33 55 555 55" },
      { name: "Miora Rasolofomanana", position: "Assistante RH",          department: "Administration", salary: 1200000, phone: "+261 34 66 666 66" },
    ]);
  }

  const existingSuppliers = await db.select().from(suppliersTable).limit(1);
  if (existingSuppliers.length > 0) {
    logger.info("Suppliers already seeded, skipping operational data");
    return;
  }

  logger.info("Seeding suppliers, clients, lots and purchases...");

  // Sample suppliers
  const [supplier1, supplier2] = await db
    .insert(suppliersTable)
    .values([
      { name: "Collecteur SAVA", region: "SAVA", phone: "0340000001", score: 85 },
      { name: "Coopérative Andapa", region: "Andapa", phone: "0340000002", score: 92 },
      { name: "Producteurs Sambava", region: "Sambava", phone: "0340000003", score: 78 },
    ])
    .returning();

  // Sample clients
  await db
    .insert(clientsTable)
    .values([
      { name: "Vanilla Import France", country: "France", email: "contact@vanillaimport.fr", currency: "EUR" },
      { name: "Spice World USA", country: "United States", email: "orders@spiceworld.com", currency: "USD" },
    ]);

  // Look up accounting accounts
  const accounts = await db.select().from(accountsTable);
  const stockAcc = accounts.find((a) => a.code === "31");
  const supplierAcc = accounts.find((a) => a.code === "401");

  // --- Purchase 1 → Lot curing (raw → in processing) ---
  const [purchase1] = await db
    .insert(purchasesTable)
    .values({
      supplierId: supplier1.id,
      weight: 120,
      pricePerKg: 40000,
      totalAmount: 4800000,
      paymentMethod: "mobile_money",
      humidity: 38,
    })
    .returning();

  const [lot1] = await db
    .insert(lotsTable)
    .values({
      code: "VAN-2026-1001",
      supplierId: supplier1.id,
      purchaseId: purchase1.id,
      weightInitial: 120,
      weightCurrent: 112,
      humidity: 38,
      grade: null,
      status: "curing",
    })
    .returning();

  await db.update(purchasesTable).set({ lotId: lot1.id }).where(eq(purchasesTable.id, purchase1.id));
  await db.insert(stockMovementsTable).values({
    lotId: lot1.id,
    type: "IN",
    quantity: 120,
    note: `Achat initial — fournisseur ${supplier1.name}`,
  });
  await db.insert(stockMovementsTable).values({
    lotId: lot1.id,
    type: "LOSS",
    quantity: 8,
    note: "Perte séchage initial VAN-2026-1001",
  });

  // --- Purchase 2 → Lot drying ---
  const [purchase2] = await db
    .insert(purchasesTable)
    .values({
      supplierId: supplier2.id,
      weight: 80,
      pricePerKg: 42000,
      totalAmount: 3360000,
      paymentMethod: "bank_transfer",
      humidity: 35,
    })
    .returning();

  const [lot2] = await db
    .insert(lotsTable)
    .values({
      code: "VAN-2026-1002",
      supplierId: supplier2.id,
      purchaseId: purchase2.id,
      weightInitial: 80,
      weightCurrent: 76,
      humidity: 30,
      grade: "standard",
      status: "drying",
    })
    .returning();

  await db.insert(stockMovementsTable).values({
    lotId: lot2.id,
    type: "IN",
    quantity: 80,
    note: `Achat initial — fournisseur ${supplier2.name}`,
  });
  await db.insert(stockMovementsTable).values({
    lotId: lot2.id,
    type: "LOSS",
    quantity: 4,
    note: "Perte séchage VAN-2026-1002",
  });

  // --- Purchase 3 → Lot READY for demo sales ---
  const [purchase3] = await db
    .insert(purchasesTable)
    .values({
      supplierId: supplier1.id,
      weight: 150,
      pricePerKg: 38000,
      totalAmount: 5700000,
      paymentMethod: "cash",
      humidity: 40,
    })
    .returning();

  const [lot3] = await db
    .insert(lotsTable)
    .values({
      code: "VAN-2026-1003",
      supplierId: supplier1.id,
      purchaseId: purchase3.id,
      weightInitial: 150,
      weightCurrent: 130,
      humidity: 25,
      grade: "gourmet",
      status: "ready",
    })
    .returning();

  await db.insert(stockMovementsTable).values({
    lotId: lot3.id,
    type: "IN",
    quantity: 150,
    note: `Achat initial — fournisseur ${supplier1.name}`,
  });
  await db.insert(stockMovementsTable).values({
    lotId: lot3.id,
    type: "LOSS",
    quantity: 20,
    note: "Perte transformation complète VAN-2026-1003",
  });

  // Journal entries for the three purchases
  if (stockAcc && supplierAcc) {
    for (const [purchase, label] of [
      [purchase1, "ACHAT-001"],
      [purchase2, "ACHAT-002"],
      [purchase3, "ACHAT-003"],
    ] as const) {
      const [entry] = await db
        .insert(journalEntriesTable)
        .values({ date: new Date(), reference: label })
        .returning();

      await db.insert(journalLinesTable).values([
        { entryId: entry.id, accountId: stockAcc.id, debit: purchase.totalAmount, credit: 0 },
        { entryId: entry.id, accountId: supplierAcc.id, debit: 0, credit: purchase.totalAmount },
      ]);
    }
  }

  logger.info("Database seeded successfully");
}
