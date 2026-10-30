# NutritionTracker

A free iOS nutrition tracker I built for friends and family. Log meals, track macros against personal targets, scan German and English nutrition labels, and get AI meal ideas. No subscriptions, no ads.

**Built with:** Claude Code, React Native, Expo and Supabase. I defined the features, flows and nutrition rules, and iterated on the build with Claude Code.

---

## Features

- **Meal logging:** log meals with ingredients, quantities and units, in a table layout with inline editing
- **Macro tracking:** calories, protein, carbs, fat and fiber tracked against personalised targets
- **USDA food search:** search Foundation, SR Legacy and Branded foods from the USDA FoodData Central API
- **Label scanner:** scan nutrition labels with your camera (Google Cloud Vision OCR); supports English and German labels
- **AI meal suggestions:** Groq-powered suggestions filtered by cuisine and include/exclude preferences
- **Calendar view:** colour-coded daily history; tap any day for a breakdown
- **Personalised TDEE:** Mifflin-St Jeor BMR with per-goal macro splits (weight loss, muscle build, weight gain)
- **Onboarding:** height, weight, age, sex, activity level and goal collected on first launch
- **Auth:** email/password login, signup and password reset via Supabase

---

## Product decisions

- **User-edited values win:** nutrition values are prioritised as user-edited, then scanned, then USDA. [Why: e.g. people know what they actually ate better than a database does.]
- **Protein targets use g/kg of body weight per goal,** not a flat percentage of calories. [Why: e.g. a percentage gives very different protein for people of different sizes.]
- **Calendar colours show the worst-performing macro** across all 5 tracked nutrients. [Why: e.g. a day only looks "good" when every target is on track.]
- **German label support** (Brennwert, Eiweiß and so on) is built into the scanner. [Why: e.g. most of my users shop in Germany.]

---

## Screens

| Screen | Description |
|---|---|
| Login / Signup | Email + password auth via Supabase |
| Forgot password | Sends a reset link to the user's email |
| Onboarding | Collects body stats and goal; calculates TDEE |
| Home | Daily meal and activity log, macro progress bars |
| Suggestions | AI-generated meal ideas with cuisine and ingredient filters |
| Calendar | Monthly view with colour-coded macro compliance |
| Profile | Edit personal details, manage favourite foods, log out |
| Food form | Create or edit a food with a full ingredient list |
| Scan label | Camera OCR with editable fields and portion scaling |

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | React Native + Expo SDK 54 (managed workflow) |
| Routing | Expo Router (file-based) |
| Auth + DB | Supabase (free tier) |
| Food data | USDA FoodData Central API |
| Label scanning | Google Cloud Vision API (TEXT_DETECTION) |
| AI suggestions | Groq API (llama-3.3-70b-versatile) |
| Distribution | EAS Update, via Expo Go |

---

## Project structure

```
app/
  (auth)/         # login, signup, forgot-password
  (tabs)/         # index (meals), suggestions, calendar, profile
  food-form.tsx   # add / edit favourite foods with ingredients
  scan-label.tsx  # camera OCR screen
  onboarding.tsx  # first-launch setup
lib/
  supabase.ts     # Supabase client with SecureStore session adapter
  tdee.ts         # BMR + TDEE + macro splits by goal
  scanStore.ts    #
