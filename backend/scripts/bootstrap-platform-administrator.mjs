/** LEGACY: Database-console bootstrap is deprecated for the new private-admin login.
 * Use /platform-admin/login and the email-confirmed founder setup instead.
 * This file is retained only for historical rollback compatibility.
 */
/**
 * Explicit manual, audited administrative enrollment. Never exposed by an HTTP route.
 * Usage (secure operations shell):
 *   DATABASE_URL_UNPOOLED=... LEXA_PLATFORM_INITIAL_ADMIN_EMAIL=... \
 *   node scripts/bootstrap-platform-administrator.mjs
 * Re-running is idempotent. Existing account and enabled MFA are required.
 */
import pg from 'pg';
const email=(process.env.LEXA_PLATFORM_INITIAL_ADMIN_EMAIL||'').trim().toLowerCase();
const url=process.env.DATABASE_URL_UNPOOLED;
if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !url){
  process.stderr.write('Missing LEXA_PLATFORM_INITIAL_ADMIN_EMAIL or DATABASE_URL_UNPOOLED. Nothing changed.\n');
  process.exit(2);
}
const client=new pg.Client({connectionString:url});
try{
  await client.connect();
  await client.query('BEGIN');
  const result=await client.query(`SELECT u.id FROM users u
    JOIN authenticator_credentials ac ON ac.user_id=u.id AND ac.enabled_at IS NOT NULL
    WHERE lower(u.email)=$1`,[email]);
  if(result.rowCount!==1)throw new Error('A single existing email-verified user with enabled authenticator MFA is required.');
  // The table's FORCE RLS policy permits only database-owner enrollment.
  // Do not silently re-enable or change an existing administrator's role.
  await client.query(`INSERT INTO platform_admin_members(user_id,role) VALUES ($1,'super_admin')
    ON CONFLICT (user_id) DO NOTHING`,[result.rows[0].id]);
  await client.query('COMMIT');
  process.stdout.write('Existing verified administrator enrolled in the LEXA Control Centre. No tenant records were changed.\n');
}catch(error){await client.query('ROLLBACK').catch(()=>{});process.stderr.write(`Enrollment failed: ${error.message}\n`);process.exitCode=1;}
finally{await client.end().catch(()=>{});}
