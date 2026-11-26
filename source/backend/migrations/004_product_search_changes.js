export async function up(knex) {
  await knex.raw(`
    CREATE SEQUENCE product_search_revision;
    CREATE TABLE product_search_changes (
      product_id uuid PRIMARY KEY,
      revision bigint NOT NULL DEFAULT nextval('product_search_revision')
    );
    ALTER SEQUENCE product_search_revision OWNED BY product_search_changes.revision;

    CREATE FUNCTION enqueue_product_search_change() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'UPDATE' AND
        (NEW.name, NEW.brand, NEW.short_description, NEW.tags) IS NOT DISTINCT FROM
        (OLD.name, OLD.brand, OLD.short_description, OLD.tags) THEN
        RETURN NULL;
      END IF;

      INSERT INTO product_search_changes (product_id)
      VALUES (CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END)
      ON CONFLICT (product_id) DO UPDATE SET revision = nextval('product_search_revision');
      RETURN NULL;
    END;
    $$;

    CREATE TRIGGER product_search_change
    AFTER INSERT OR UPDATE OF name, brand, short_description, tags OR DELETE ON products
    FOR EACH ROW EXECUTE FUNCTION enqueue_product_search_change();

    INSERT INTO product_search_changes (product_id) SELECT id FROM products;
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP TRIGGER product_search_change ON products;
    DROP FUNCTION enqueue_product_search_change();
    DROP TABLE product_search_changes;
  `);
}
