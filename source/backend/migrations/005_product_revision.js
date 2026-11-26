export async function up(knex) {
  await knex.schema.alterTable("products", (table) => {
    table.integer("revision").notNullable().defaultTo(0);
  });
}

export async function down(knex) {
  await knex.schema.alterTable("products", (table) => {
    table.dropColumn("revision");
  });
}
