export async function up(knex) {
  await knex.schema.alterTable("order_items", (table) => {
    // Historical rows recorded only the name. A current product assignment
    // cannot establish which category owned a prior sale.
    table.uuid("category_id_snapshot");
  });
}

export async function down(knex) {
  await knex.schema.alterTable("order_items", (table) => {
    table.dropColumn("category_id_snapshot");
  });
}
