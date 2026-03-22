-- =====================================================
-- MENU MANAGEMENT MODULE (FINAL PRODUCTION VERSION)
-- =====================================================
-- Adds menu_books and menu_book_items tables.
-- Does NOT modify any existing tables.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- MENU BOOKS
-- A curated collection of menu items for a branch.
-- Controls what POS displays.
-- =====================================================

CREATE TABLE IF NOT EXISTS menu_books (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    uuid NOT NULL REFERENCES companies(id),
  branch_id     uuid NOT NULL REFERENCES branches(id),
  name          text NOT NULL,
  description   text,
  is_active     boolean NOT NULL DEFAULT true,
  is_default    boolean NOT NULL DEFAULT false,
  valid_from    date,
  valid_to      date,
  sort_order    integer DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_books_company   ON menu_books(company_id);
CREATE INDEX IF NOT EXISTS idx_menu_books_branch    ON menu_books(branch_id);
CREATE INDEX IF NOT EXISTS idx_menu_books_active    ON menu_books(branch_id, is_active, is_default);

DROP TRIGGER IF EXISTS trg_menu_books_updated ON menu_books;
CREATE TRIGGER trg_menu_books_updated
BEFORE UPDATE ON menu_books
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- MENU BOOK ITEMS
-- Junction table linking menu books to menu items.
-- Supports optional price overrides per-book.
-- =====================================================

CREATE TABLE IF NOT EXISTS menu_book_items (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_book_id    uuid NOT NULL REFERENCES menu_books(id) ON DELETE CASCADE,
  menu_item_id    uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  override_price  numeric,
  is_available    boolean NOT NULL DEFAULT true,
  sort_order      integer DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(menu_book_id, menu_item_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_book_items_book ON menu_book_items(menu_book_id);
CREATE INDEX IF NOT EXISTS idx_menu_book_items_item ON menu_book_items(menu_item_id);

DROP TRIGGER IF EXISTS trg_menu_book_items_updated ON menu_book_items;
CREATE TRIGGER trg_menu_book_items_updated
BEFORE UPDATE ON menu_book_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE menu_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_book_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_books_all_authenticated" ON menu_books;
CREATE POLICY "menu_books_all_authenticated"
  ON menu_books FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "menu_book_items_all_authenticated" ON menu_book_items;
CREATE POLICY "menu_book_items_all_authenticated"
  ON menu_book_items FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow anon read access for customer-facing menus
DROP POLICY IF EXISTS "menu_books_anon_select" ON menu_books;
CREATE POLICY "menu_books_anon_select"
  ON menu_books FOR SELECT
  TO anon
  USING (is_active = true);

DROP POLICY IF EXISTS "menu_book_items_anon_select" ON menu_book_items;
CREATE POLICY "menu_book_items_anon_select"
  ON menu_book_items FOR SELECT
  TO anon
  USING (is_available = true);
