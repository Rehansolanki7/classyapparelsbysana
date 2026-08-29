import { readFile } from "node:fs/promises";
import path from "node:path";
import { createConnection } from "mysql2/promise";

function required(name: "DB_HOST" | "DB_USER" | "DB_PASSWORD" | "DB_NAME") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function databaseHost() {
  const configured = required("DB_HOST");
  return configured === "localhost" || configured === "::1" ? "127.0.0.1" : configured;
}

async function seed(connection: Awaited<ReturnType<typeof createConnection>>) {
  const id = "sea-mist-set";
  await connection.execute(
    "INSERT IGNORE INTO products (id, slug, name, subtitle, description, price_paise, compare_at_paise, category_id, status, color, fabric, includes, care, primary_image, packed_weight_grams, featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, true)",
    [id, "sea-mist-3-piece-suit-set", "Sea Mist 3-Piece Suit Set", "The first Sana edit", "A soft aqua three-piece set with whimsical florals, appliqué details and a statement printed dupatta. Easy to dress up, effortless to live in.", 249900, 289900, "category-3-piece-sets", "Aqua", "Confirm in admin", "Kurta, trousers and printed dupatta", "Gentle hand wash separately in cold water. Dry in shade.", "/products/sea-mist-01.webp", 780],
  );
  // Repair the starter row on deployments that already ran the migration
  // before the packed weight was added to the seed insert.
  await connection.execute("UPDATE products SET packed_weight_grams = ? WHERE id = ? AND packed_weight_grams = 0", [780, id]);
  await connection.execute("UPDATE products SET category_id = ? WHERE id = ? AND category_id IS NULL", ["category-3-piece-sets", id]);
  const images = ["01", "02", "03", "04", "05", "06", "07"];
  for (const [position, suffix] of images.entries()) await connection.execute("INSERT IGNORE INTO product_images (product_id, url, alt, position) VALUES (?, ?, ?, ?)", [id, `/products/sea-mist-${suffix}.webp`, `Sea Mist 3-Piece Suit Set, view ${position + 1}`, position]);
  const sizes = ["S", "M", "L", "XL", "XXL", "XXXL", "4XL"];
  const stock = [3, 5, 5, 4, 3, 2, 1];
  for (const [position, size] of sizes.entries()) await connection.execute("INSERT IGNORE INTO product_variants (product_id, size, sku, stock, reserved_stock, active) VALUES (?, ?, ?, ?, 0, true)", [id, size, `CAS-SEA-${size}`, stock[position]]);
}

async function main() {
  const connection = await createConnection({ host: databaseHost(), port: Number(process.env.DB_PORT ?? 3306), user: required("DB_USER"), password: required("DB_PASSWORD"), database: required("DB_NAME"), charset: "utf8mb4" });
  try {
    await connection.query("CREATE TABLE IF NOT EXISTS _classy_migrations (version varchar(120) NOT NULL PRIMARY KEY, applied_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    const [lockRows] = await connection.query("SELECT GET_LOCK('_classy_apparels_migrations', 30) AS acquired");
    if ((lockRows as Array<{ acquired: number }>)[0]?.acquired !== 1) throw new Error("Could not acquire the database migration lock");
    const migrations = ["0000_public_photon", "0001_release_hardening", "0002_manual_delivery", "0003_customer_experience", "0004_truthful_shipping_privacy", "0005_shipping_seed_fix", "0006_refund_restock", "0007_homepage_editor", "0008_managed_categories", "0009_admin_mfa", "0010_homepage_categories_and_product_sizes"];
    for (const version of migrations) {
      const [queryRows] = await connection.query("SELECT version FROM _classy_migrations WHERE version = ?", [version]);
      const rows = queryRows as Array<{ version: string }>;
      if (rows.length) continue;
      const migration = await readFile(path.join(process.cwd(), "drizzle-hostinger", `${version}.sql`), "utf8");
      for (const statement of migration.split("--> statement-breakpoint").map((item) => item.trim()).filter(Boolean)) {
        try {
          await connection.query(statement);
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code !== "ER_DUP_KEYNAME" && code !== "ER_DUP_FIELDNAME") throw error;
        }
      }
      await connection.execute("INSERT INTO _classy_migrations (version) VALUES (?)", [version]);
      console.log(`Applied database migration ${version}.`);
    }
    await seed(connection);
    console.log("Starter catalogue is ready.");
  } finally {
    try { await connection.query("SELECT RELEASE_LOCK('_classy_apparels_migrations')"); } catch { /* Connection teardown releases the lock too. */ }
    await connection.end();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
