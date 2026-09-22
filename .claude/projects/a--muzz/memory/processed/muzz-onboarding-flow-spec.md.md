# Muzz "Build Your Profile" Onboarding Flow — Detailed Spec

Transcribed frame-by-frame from the uploaded screen recording (122s, 21 screens). This is the **post-signup profile questionnaire** — it starts right after basic account creation (email/Google sign-in, name, DOB, gender, location), which isn't shown in the clip but which UZI already has planned. Everything below is what actually appears on screen, in the order it appears, so it can be handed to a developer or an AI coding tool as a build spec.

---

## 0. Global flow mechanics (apply to every screen below)

These patterns repeat across all 14 questions and should be built once as a reusable shell, not per-screen:

- **Top progress bar**: a thin horizontal bar under the app bar that fills left-to-right, one segment per question. It's the primary "how far am I" indicator — there's no step counter text (no "3 of 14").
- **Back arrow** (top-left) on every screen except the very first.
- **"?" help icon** (top-right) on every screen — opens a tooltip/sheet explaining why the question is asked (Muzz uses this to justify sensitive questions like sect/ethnicity).
- **Two answer patterns**:
  - **Single-select, auto-advance**: tapping an option selects it (red checkmark) and the app auto-navigates to the next screen after a short delay. No confirm button. Used for: sect, marital status, alcohol, move-abroad.
  - **Multi-select / searchable-list, explicit confirm**: a red **"Confirm/Select (n)"** button at the bottom, disabled or hidden until at least one item is picked, showing the live count. Used for: profession, nationality, ethnicity, interests, personality traits.
- **Skip** link (plain text, under the CTA button, no border) appears on the *optional* screens — interests and personality traits are skippable; the identity/demographic questions (sect, nationality, ethnicity, marital status) are not.
- **Selected-state styling**: selected option text turns red/highlighted with a red circular checkmark on the right (list style) or the chip turns solid black with white text (tag/pill style, used for interests & personality traits).
- **Searchable lists** (profession, nationality, ethnicity) share one component: a search input at the top with a magnifying-glass icon, a "Suggested" section pinned first (e.g., suggests the user's own country/region first), then an alphabetical scrollable list. Typing filters the list live.

---

## 1. What sect do you belong to?
- Type: single-select list, auto-advance
- Options: **Sunni, Shia, Other, Prefer not to say**
- No search, no images — plain list.

## 2. What's your profession?
- Type: searchable single-select list with a confirm button
- Search field with keyboard auto-focused
- List example entries seen: Civil Engineer, Data Scientist, Defense Employee, Dentist, Dentistry Employee
- Selecting an item highlights it red with a checkmark; user still taps **Confirm**.

## 3. What's your nationality?
- Type: searchable single-select list, "Suggested" section first
- Each row has a small flag icon + country name
- "Suggested" shows one pre-guessed country (e.g. Pakistan, flagged and pre-checked) based on signup data (likely phone country code or location permission)
- Full alphabetical list below (Aburundi, Afghan, Albanian, Algerian, American, American Samoan, ...)
- Red **Confirm** button at bottom, count badge e.g. "Confirm (1)"

## 4. What's your ethnicity?
- Same searchable-list component as nationality, but **no flags** — plain text rows
- "Suggested" section: Baloch, Bangladeshi, Gujarati, Hazara, Pakistani, Pashtun
- Single-select in this recording (only one ethnicity checked), confirm button shows count

## 5. What's your marital status?
- Type: single-select, auto-advance
- Options: **Never married, Divorced, Separated, Annulled, Widowed, Married**

## 6. What are your intentions for marriage?
- Type: two grouped single-select rows on one screen, each its own question
- Group A — *"I'd like to know someone on Muzz for"*: 1-2 months, 3-4 months, 4-12 months, 1-2 years (icon: speech-bubble/chat)
- Group B — *"I'd like to be married within"*: 1-2 months, 3-4 months, 4-12 months, 1-2 years, 3-4 years, 4+ years, "Ages together" (icon: person/ring)
- Single continue button at the bottom (not auto-advance, since two answers are needed)

## 7. How do you practise your religion?
- Type: single-select **cards** (not plain list rows) — each option has a bold title + one-line description, auto-advance on tap
- **Strictly practising** — "I pray all the time, fast, and adhere strictly to Islamic tenets"
- **Actively practising** — "I try and make religious practice part of my daily life where I can"
- **Occasionally practising** — "…Ramadan/Eid and other special occasions" (truncated in recording)
- **Not practising at all** — "…culturally a Muslim but do not actively practise" (truncated)

## 8. Do you drink alcohol?
- Type: single-select, auto-advance
- Options: **Yes, No**

## 9. Would you move abroad for marriage?
- Type: single-select, auto-advance
- Options: **Yes, No**

## 10. Interests / hobbies
- Type: multi-select **pill/chip grid**, grouped under category headers, one scrollable screen, **Skip** available
- Chips are small icon + label pairs; tapping toggles solid-black selected state
- Categories seen (partial, screen is long and scrolls through several sub-sections):
  - **Hobbies-ish top group**: Acting, Anime, Art gallery, Board games, Creative writing, Design, DIY, Fashion, Film & Cinema, Fireworks, Knitting, Language learning, Live music, Painting, Photography, Reading, Standup comedy, Theatre, Travel, TV shows
  - **Community**: Activism, Family time, Politics, Spending time with Friends, Volunteering
  - **Food & Drink**: Baking, Bubble tea, Cake decorating, Chocolate, Coffee, Cooking, Meat lover, Sushi, Vegetarian
  - **Outdoors**: Bird watching, Camping, Fishing
  - **Sport**: American football, Archery, Badminton, Baseball, Basketball, Bowling, Boxing, Cricket, Cycling, Dancing, Fencing, Football, Golf, Gym, Hiking, Horse Riding, Martial arts, Motorsports, Pilates, Rock climbing, Rowing, Rugby, Skateboarding, Skiing, Skydiving, Snowboarding, Surfing, Swimming, Tennis, Volleyball
  - **Technology**: Blogging, Coding, Content creation, Gaming
- Bottom bar: red **"Select (n)"** button (count updates live) + plain-text **Skip** below it

## 11. How would you describe your personality?
- Type: multi-select chip grid (same component as interests), capped at a max — UI hint says **"Select up to 5 traits to show off your personality"**
- Mixes conventional adjectives with **MBTI type chips** (ENFJ, ENFP, INTJ, ISFJ, ESFP, ESTJ, ENTJ, ENTP, ISFP, ISTP, INTP, ISTJ) inline in the same grid
- Trait examples seen: Active Listener, Adventurous, Affectionate, Ambitious, Animal Lover, Bookworm, Brunch Lover, Calm, Career-driven, Carefree, Charismatic, Cheerful, Competitive, Confident, Conservative, Creative, Cultural, Empathetic, Entrepreneurial, Extrovert, Family-oriented, Generous, Genuine, Good with Kids, Intelligent, Introverted, Liberal, Nerdy, Open-minded, Outgoing, Patient, Playful, Positive, Religious, Respectful, Romantic, Self-aware, Shy, Spontaneous, Thoughtful
- Same **Select (n)** + **Skip** footer as interests

## 12. Bio
- Type: free-text multi-line field, no character counter visible in recording
- Placeholder: **"Tell us about yourself, your hobbies & future plans"**
- CTA: red **"Add bio"** button (implies bio can be left blank and added later, unlike the earlier identity questions)

## 13. Photo guidelines (education screen, no input)
- Pure instructional screen before the upload grid — two labeled groups of example photos:
  - **"Use high-quality photos"** (green checkmarks): "Only show yourself", "Clear face"
  - **"Avoid these mistakes"** (red X marks): "Not a person", "Face covered", "Far away", "AI images & filters"
- CTA: red **"Add photo"** button

## 14. Add your profile photos
- Type: photo-upload grid, 6 slots (2 rows × 3), each an empty dashed-border "+" tile until filled
- Header copy: **"Add your profile photos"** / subtext: **"You need to upload at least 3 photos to continue completing your profile. You can change them later"**
- First filled slot gets a small **"Male"** tag chip overlay (this is their gender badge shown on the primary photo — confirms gender is already known from earlier basic signup)
- A **"Photo guidelines"** info link sits beside the grid for a re-check
- **Error handling observed**: uploading a small/low-res image triggers a blocking modal — *"Something went wrong… Please provide a larger photo"* with a single **OK** button. This is a client-side minimum-resolution check, not a generic upload failure.
- CTA: red **"Add photos"**, presumably disabled until 3 photos are present (matches the subtext requirement)

---

## Data model additions this implies

Your current spec already has "detailed profiles with fixed interest tags, hobbies, languages, and personal details" — this flow shows exactly which fields to add to that Postgres schema:

| Field | Type | Notes |
|---|---|---|
| `sect` | enum | Sunni / Shia / Other / Prefer not to say |
| `profession` | FK to a professions lookup table | needs seed data + search index |
| `nationality` | FK to countries lookup table | needs flags/ISO codes, "suggested" logic (phone country code or IP geolocation) |
| `ethnicity` | FK to ethnicities lookup table | region-specific seed list (Pakistani sub-ethnicities shown) |
| `marital_status` | enum | Never married / Divorced / Separated / Annulled / Widowed / Married |
| `relationship_timeline_intent` | enum | how long they want to "know someone" first |
| `marriage_timeline_intent` | enum | how soon they want to be married |
| `religious_practice_level` | enum | Strictly / Actively / Occasionally / Not practising |
| `drinks_alcohol` | boolean |  |
| `would_move_abroad` | boolean |  |
| `interests` | many-to-many to a tags table, tag has `category` | needed for your "similar-interest-based suggestions" feature |
| `personality_traits` | many-to-many to a traits table | separate table from interests since it mixes adjectives + MBTI, max 5 |
| `bio` | text, nullable |  |
| `photos` | 1-to-many, min 3 required to mark profile "complete" | needs a resolution-floor validation before upload (client-side, mirrors the "photo too small" error) |

## UX rules worth carrying over as-is

1. **Two selection UX patterns, not one** — auto-advance for true single-answer questions keeps the flow fast; explicit confirm buttons for searchable/multi-select questions prevent mis-taps from silently advancing.
2. **Only interests and personality are skippable.** Everything else in this flow is a forced answer — treat identity/compatibility fields as required, treat "flavor" fields as optional.
3. **Bio and photos are the last two steps**, after all structured questions — this maximizes questionnaire completion before the more effortful free-text/upload steps.
4. **Minimum photo count (3) is enforced before profile completion**, not just encouraged.
5. **A pre-upload education screen** (do's/don'ts with example images) measurably reduces bad photo uploads and should be built as a static screen rather than skipped in favor of just validating after the fact.

## Flutter build notes (matches your existing stack)

- Build one `OnboardingQuestionScaffold` widget (progress bar + back + help icon + CTA slot) and drive all 9 "simple" screens (1,2,3,4,5,7,8,9 + first half of 6) off a config-driven list/enum rather than 9 separate screen classes.
- The searchable-list screens (profession, nationality, ethnicity) can share one `SearchableSingleSelectScreen` fed by different Postgres-backed lookup endpoints (NestJS) — don't hardcode the lists in the Flutter app, since profession/ethnicity lists will need moderation/updates over time.
- The chip-grid screens (interests, personality) can share one `TagGridScreen` that takes a category-grouped tag list and a `maxSelectable` (null for interests, 5 for personality).
- Photo grid: use a standard `GridView` with a custom "+" tile widget; run client-side resolution/face-detection checks before hitting the backend — you already have AWS Rekognition in the stack for selfie verification, so it's a natural place to also gate "not a person" / "face covered" uploads at onboarding, not just at verification time.