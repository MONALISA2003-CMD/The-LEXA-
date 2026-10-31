-- Returned goods are not automatically made saleable stock. The disposition is
-- recorded on each return line and only 'restock' creates an available stock movement.
ALTER TABLE sale_return_lines
  ADD COLUMN disposition TEXT NOT NULL DEFAULT 'restock';

ALTER TABLE sale_return_lines
  ADD CONSTRAINT sale_return_lines_disposition_check
  CHECK (disposition IN ('restock', 'quarantine', 'scrap'));
