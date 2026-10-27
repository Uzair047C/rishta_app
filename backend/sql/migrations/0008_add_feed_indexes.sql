-- Migration 0008: Add indexes for feed query performance

-- Indexes for NOT EXISTS subqueries in feed query
CREATE INDEX IF NOT EXISTS passes_user_id_idx ON passes (user_id);
CREATE INDEX IF NOT EXISTS blocks_blocker_id_idx ON blocks (blocker_id);
CREATE INDEX IF NOT EXISTS blocks_blocked_id_idx ON blocks (blocked_id);
CREATE INDEX IF NOT EXISTS likes_from_user_id_idx ON likes (from_user_id);
CREATE INDEX IF NOT EXISTS matches_user_a_id_idx ON matches (user_a_id);
CREATE INDEX IF NOT EXISTS matches_user_b_id_idx ON matches (user_b_id);
CREATE INDEX IF NOT EXISTS moderation_flags_user_source_status_idx ON moderation_flags (user_id, source, status);

-- Composite index for user_interests join in feed
CREATE INDEX IF NOT EXISTS user_interests_user_id_idx ON user_interests (user_id);

-- Index for users table for feed query (gender + lat/lng + status)
CREATE INDEX IF NOT EXISTS users_feed_query_idx ON users (gender, lat, lng) WHERE status = 'active' AND gender IS NOT NULL;

-- Index for profiles table for feed query (verification_status + bio_flagged)
CREATE INDEX IF NOT EXISTS profiles_feed_query_idx ON profiles (verification_status, bio_flagged) WHERE verification_status = 'verified' AND bio_flagged = false;