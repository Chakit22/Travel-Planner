/**
 * FULL RESET. Keeps ONLY the demo user row. Wipes everything else in every table.
 *
 * Usage:
 *   npx tsx scripts/wipe-demo.ts
 *
 * Re-seed afterward with:
 *   npx tsx scripts/seed-demo-user.ts
 */
import 'dotenv/config';
import { db, sql } from '../src/db/client';
import {
  users,
  trips,
  conversations,
  snapshots,
  preferences,
  userProfiles,
} from '../src/db/schema';
import { eq, ne } from 'drizzle-orm';

const DEMO_EMAIL = 'chakit-demo@atlas.dev';

async function main() {
  console.log('[wipe] starting full reset…');

  const [demo] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL));
  if (!demo) {
    console.warn(
      `[wipe] demo user (${DEMO_EMAIL}) not found — proceeding to wipe ALL users.`,
    );
  } else {
    console.log(`[wipe] keeping user ${demo.id} (${DEMO_EMAIL})`);
  }

  // Order matters: child tables first.
  const cv = await db.delete(conversations).returning({ id: conversations.id });
  console.log(`[wipe] deleted ${cv.length} conversations`);

  const sn = await db.delete(snapshots).returning({ id: snapshots.id });
  console.log(`[wipe] deleted ${sn.length} snapshots`);

  const prefs = await db.delete(preferences).returning({ id: preferences.id });
  console.log(`[wipe] deleted ${prefs.length} preferences`);

  const profiles = await db.delete(userProfiles).returning({ userId: userProfiles.userId });
  console.log(`[wipe] deleted ${profiles.length} user_profiles`);

  const tripsDel = await db.delete(trips).returning({ id: trips.id });
  console.log(`[wipe] deleted ${tripsDel.length} trips`);

  if (demo) {
    const otherUsers = await db
      .delete(users)
      .where(ne(users.id, demo.id))
      .returning({ id: users.id });
    console.log(`[wipe] deleted ${otherUsers.length} other users (kept demo)`);
  } else {
    const allUsers = await db.delete(users).returning({ id: users.id });
    console.log(`[wipe] deleted ${allUsers.length} users (no demo to preserve)`);
  }

  console.log('\n[wipe] done.');
  if (demo) {
    console.log(`  → demo user remains: ${DEMO_EMAIL} (id ${demo.id})`);
  } else {
    console.log('  → DB is fully empty.');
  }
  console.log('  → re-seed with: npx tsx scripts/seed-demo-user.ts');

  await sql.end();
}

main().catch(async (err) => {
  console.error('[wipe] failed:', err);
  await sql.end();
  process.exit(1);
});
