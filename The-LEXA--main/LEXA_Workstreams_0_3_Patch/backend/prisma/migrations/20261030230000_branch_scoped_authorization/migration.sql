-- Explicit per-member branch grants. An empty grant set retains legacy
-- workspace-wide scope; once any grant exists, lower-privilege access is
-- limited to the assigned branches. Owners/admins retain tenant-wide access.
CREATE UNIQUE INDEX IF NOT EXISTS "branches_tenant_id_id_key"
  ON "branches" ("tenant_id", "id");

CREATE TABLE IF NOT EXISTS "branch_memberships" (
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_user_id" UUID,
  CONSTRAINT "branch_memberships_pkey" PRIMARY KEY ("tenant_id", "branch_id", "user_id"),
  CONSTRAINT "branch_memberships_tenant_user_fkey"
    FOREIGN KEY ("tenant_id", "user_id") REFERENCES "memberships" ("tenant_id", "user_id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "branch_memberships_tenant_branch_fkey"
    FOREIGN KEY ("tenant_id", "branch_id") REFERENCES "branches" ("tenant_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "branch_memberships_created_by_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "branch_memberships_tenant_user_idx"
  ON "branch_memberships" ("tenant_id", "user_id");
CREATE INDEX IF NOT EXISTS "branch_memberships_tenant_branch_idx"
  ON "branch_memberships" ("tenant_id", "branch_id");
