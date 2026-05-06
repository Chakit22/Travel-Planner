import {
  pgTable,
  uuid,
  text,
  date,
  integer,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';

// ─── USERS ──────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  password: text('password').notNull(),
});

// ─── TRIPS ──────────────────────────────────────────────────────────────────

export const trips = pgTable('trips', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  destination: text('destination'),
  budget: integer('budget'),
  origin: text('origin'),
  departureDate: date('departure_date'),
  returnDate: date('return_date'),
  travelers: integer('travelers'),
  status: text('status').default('draft'),
  itinerary: text('itinerary'),
  itineraryVersion: integer('itinerary_version').default(1),
  suggestions: jsonb('suggestions').default([]),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ─── CONVERSATIONS ──────────────────────────────────────────────────────────

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  tripId: uuid('trip_id')
    .references(() => trips.id, { onDelete: 'cascade' })
    .unique()
    .notNull(),
  messages: jsonb('messages').default([]).notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ─── SNAPSHOTS ──────────────────────────────────────────────────────────────

export const snapshots = pgTable('snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  tripId: uuid('trip_id')
    .references(() => trips.id, { onDelete: 'cascade' })
    .notNull(),
  type: text('type').notNull(),
  data: jsonb('data').notNull(),
  fetchedAt: timestamp('fetched_at').defaultNow(),
});

// ─── USER PROFILES ──────────────────────────────────────────────────────────
// Free-form taste graph + summary copy for the agent to recall.

export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  travelStyle: text('travel_style'),
  budgetTier: text('budget_tier'),
  homeCity: text('home_city'),
  summary: text('summary'),
  tags: jsonb('tags').default([]).notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ─── PREFERENCES ────────────────────────────────────────────────────────────
// One row per like/dislike. Captured implicitly (chat) or explicitly (button).

export const preferences = pgTable('preferences', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  category: text('category').notNull(),
  item: text('item').notNull(),
  sentiment: text('sentiment').notNull(),
  source: text('source').notNull(),
  context: text('context'),
  createdAt: timestamp('created_at').defaultNow(),
});
