-- Distinguish legacy all-branch scope from an intentionally empty branch allow-list.
ALTER TABLE "memberships"
  ADD COLUMN "branch_scope_mode" TEXT NOT NULL DEFAULT 'all';
ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_branch_scope_mode_check"
  CHECK ("branch_scope_mode" IN ('all','restricted'));
CREATE INDEX "memberships_tenant_scope_mode_idx"
  ON "memberships" ("tenant_id", "branch_scope_mode");
