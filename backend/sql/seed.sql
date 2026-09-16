-- Fixed tag lists. The spec requires a backend-provided closed set for both, so
-- that interest overlap is computable — no free-text entry anywhere.

INSERT INTO interests (label) VALUES
  ('Reading'), ('Travel'), ('Sports'), ('Cooking'), ('Music'),
  ('Movies'), ('Photography'), ('Hiking'), ('Gaming'), ('Art'),
  ('Fitness'), ('Gardening'), ('Technology'), ('Volunteering'), ('Writing'),
  ('Dancing'), ('Coffee'), ('Pets'), ('Fashion'), ('History')
ON CONFLICT (label) DO NOTHING;

INSERT INTO languages (label) VALUES
  ('English'), ('Urdu'), ('Hindi'), ('Punjabi'), ('Sindhi'),
  ('Pashto'), ('Balochi'), ('Arabic'), ('Saraiki'), ('Kashmiri')
ON CONFLICT (label) DO NOTHING;
