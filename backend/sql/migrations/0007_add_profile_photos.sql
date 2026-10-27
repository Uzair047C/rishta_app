-- Migration 0007: Add profile_photos table and backfill from profiles.photos array

-- Create profile_photos table
CREATE TABLE profile_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  position int NOT NULL,
  url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, position)
);

-- Index for ordering
CREATE INDEX profile_photos_profile_id_idx ON profile_photos (profile_id, position);

-- Backfill from profiles.photos array
INSERT INTO profile_photos (profile_id, position, url, status)
SELECT
  p.user_id,
  pos - 1 AS position,
  photos[pos - 1] AS url,
  CASE WHEN pos = 1 THEN 'verified' ELSE 'pending' END AS status
FROM profiles p
CROSS JOIN LATERAL generate_subscripts(p.photos, 1) AS pos
WHERE p.photos IS NOT NULL AND array_length(p.photos, 1) > 0;

-- Create trigger function for primary photo change
CREATE OR REPLACE FUNCTION reset_verification_on_primary_photo_change() RETURNS trigger AS $$
BEGIN
  -- Check if the primary photo (position 0) changed
  IF (OLD.url IS DISTINCT FROM NEW.url) AND OLD.position = 0 THEN
    UPDATE profiles SET verification_status = 'pending' WHERE user_id = NEW.profile_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on profile_photos table for primary photo changes
CREATE TRIGGER profile_photos_reverify_on_primary_change
  BEFORE UPDATE ON profile_photos
  FOR EACH ROW EXECUTE FUNCTION reset_verification_on_primary_photo_change();

-- Drop the old trigger on profiles table since we're moving to profile_photos
DROP TRIGGER IF EXISTS profiles_reverify_on_photo_change ON profiles;
DROP FUNCTION IF EXISTS reset_verification_on_photo_change();