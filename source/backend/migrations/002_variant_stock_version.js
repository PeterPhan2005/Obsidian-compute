export async function up(knex) {
  await knex.schema.alterTable("product_variants", (table) => {
    table.bigInteger("stock_version").notNullable().defaultTo(0);
  });
}

export async function down(knex) {
  await knex.schema.alterTable("product_variants", (table) => {
    table.dropColumn("stock_version");
  });
}
