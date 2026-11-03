-- A CEO may terminate sessions belonging to an employee they have just
-- suspended in the same business. This policy never lets one tenant revoke
-- sessions of a user unless that user has a SUSPENDED membership in that tenant.
-- It is intentionally additive to sessions_user_delete (self-service logout).
DROP POLICY IF EXISTS sessions_owner_revokes_suspended_employee_sessions ON public.sessions;
CREATE POLICY sessions_owner_revokes_suspended_employee_sessions ON public.sessions
  FOR DELETE TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.memberships actor
      JOIN public.memberships target
        ON target.tenant_id = actor.tenant_id
      WHERE actor.tenant_id::text = NULLIF(current_setting('app.tenant_id', true), '')
        AND actor.user_id::text = NULLIF(current_setting('app.user_id', true), '')
        AND actor.status = 'ACTIVE'
        AND actor.role IN ('owner', 'owner_administrator')
        AND target.user_id = sessions.user_id
        AND target.status = 'SUSPENDED'
    )
  );
