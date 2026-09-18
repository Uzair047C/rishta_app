-- Fixed tag lists. The spec requires a backend-provided closed set for both, so
-- that interest overlap is computable — no free-text entry anywhere.

-- Fixed tag lists. The spec requires a backend-provided closed set for both, so
-- that interest overlap is computable — no free-text entry anywhere.

INSERT INTO interests (label) VALUES
  ('Acting'), ('Anime'), ('Art gallery'), ('Board games'), ('Creative writing'),
  ('Design'), ('DIY'), ('Fashion'), ('Film & Cinema'), ('Fireworks'),
  ('Knitting'), ('Language learning'), ('Live music'), ('Painting'), ('Photography'),
  ('Reading'), ('Standup comedy'), ('Theatre'), ('Travel'), ('TV shows'),
  ('Activism'), ('Family time'), ('Politics'), ('Spending time with Friends'), ('Volunteering'),
  ('Baking'), ('Bubble tea'), ('Cake decorating'), ('Chocolate'), ('Coffee'),
  ('Cooking'), ('Meat lover'), ('Sushi'), ('Vegetarian'),
  ('Bird watching'), ('Camping'), ('Fishing'),
  ('American football'), ('Archery'), ('Badminton'), ('Baseball'), ('Basketball'),
  ('Bowling'), ('Boxing'), ('Cricket'), ('Cycling'), ('Dancing'),
  ('Fencing'), ('Football'), ('Golf'), ('Gym'), ('Hiking'),
  ('Horse Riding'), ('Martial arts'), ('Motorsports'), ('Pilates'), ('Rock climbing'),
  ('Rowing'), ('Rugby'), ('Skateboarding'), ('Skiing'), ('Skydiving'),
  ('Snowboarding'), ('Surfing'), ('Swimming'), ('Tennis'), ('Volleyball'),
  ('Blogging'), ('Coding'), ('Content creation'), ('Gaming'),
  ('Sports'), ('Music'), ('Movies'), ('Fitness'), ('Gardening'), ('Technology'), ('Writing'), ('Pets'), ('History')
ON CONFLICT (label) DO NOTHING;

INSERT INTO languages (label) VALUES
  ('English'), ('Urdu'), ('Hindi'), ('Punjabi'), ('Sindhi'),
  ('Pashto'), ('Balochi'), ('Arabic'), ('Saraiki'), ('Kashmiri')
ON CONFLICT (label) DO NOTHING;


INSERT INTO languages (label) VALUES
  ('English'), ('Urdu'), ('Hindi'), ('Punjabi'), ('Sindhi'),
  ('Pashto'), ('Balochi'), ('Arabic'), ('Saraiki'), ('Kashmiri')
ON CONFLICT (label) DO NOTHING;
