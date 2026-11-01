-- Preserve the taxable base and the exact referenced document version per sale line.
ALTER TABLE sale_lines
  ADD COLUMN IF NOT EXISTS taxable_minor integer,
  ADD COLUMN IF NOT EXISTS tax_reference_document_version integer;
UPDATE sale_lines SET taxable_minor=GREATEST(0,line_total_minor-tax_minor) WHERE taxable_minor IS NULL;
ALTER TABLE sale_lines ALTER COLUMN taxable_minor SET NOT NULL;
ALTER TABLE sale_lines ADD CONSTRAINT sale_lines_taxable_minor_nonnegative CHECK(taxable_minor>=0);
