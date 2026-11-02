CREATE TABLE "auth_rate_limits" (
  "key" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "window_started_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "auth_rate_limits_updated_at_idx" ON "auth_rate_limits"("updated_at");
