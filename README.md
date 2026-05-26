# NutritionTracker

A personal nutrition tracking mobile app for iOS, built with React Native and Expo. Designed for a small group of friends and family — no subscriptions, no ads, all free.

---

## Features

- **Meal logging** — log meals with ingredients, quantities, and units; table-style layout with inline editing
- **Macro tracking** — calories, protein, carbs, fat, and fiber tracked against personalised targets
- **USDA food search** — search Foundation, SR Legacy, and Branded foods from the USDA FoodData Central API
- **Label scanner** — scan nutrition labels with your camera (Google Cloud Vision OCR); supports English and German labels
- **AI meal suggestions** — Groq-powered suggestions filtered by cuisine, include/exclude preferences
- **Calendar view** — colour-coded daily history; tap any day to see a breakdown
- **Personalised TDEE** — Mifflin-St Jeor BMR with per-goal macro splits (weight loss, muscle build, weight gain)
- **Onboarding** — height, weight, age, sex, activity level, and goal collected on first launch
- **Auth** — email/password login, signup, and password reset via Supabase

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | React Native + Expo SDK 54 (managed workflow) |
| Routing | Expo Router (file-based) |
| Auth + DB | Supabase (free tier) |
| Food data | USDA FoodData Central API |
| Label scanning | Google Cloud Vision API (TEXT_DETECTION) |
| AI suggestions | Groq API — llama-3.3-70b-versatile |
| Distribution | EAS Update → Expo Go |

---

## Getting started

```bash
npm install
npx expo start
```

Open in Expo Go by scanning the QR code, or press `i` for the iOS simulator.

### Push an update to testers

```bash
eas update --branch main --message "your message" --platform ios
```

Updates apply on the second cold start after publishing (open → force close → reopen). After a fresh install the latest bundle loads immediately.

> Share the `exp://` link directly — do not share a QR code, as QR codes can encode a stale URL.

---

## Environment variables

Copy `.env.example` to `.env` and fill in your keys. All variables are also required in the EAS dashboard for cloud builds.

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_SUPABASE_PROJECT_REF
EXPO_PUBLIC_SUPABASE_ACCESS_TOKEN
EXPO_PUBLIC_USDA_API_KEY
EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY
EXPO_PUBLIC_GROQ_API_KEY
```

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
  scanStore.ts    # global store for passing scan results to food-form
```

---

## Screens

| Screen | Description |
|---|---|
| Login / Signup | Email + password auth via Supabase |
| Forgot password | Sends a reset link to the user's email |
| Onboarding | Collects body stats and goal; calculates TDEE |
| Home (tabs/index) | Daily meal and activity log, macro progress bars |
| Suggestions | AI-generated meal ideas with cuisine and ingredient filters |
| Calendar | Monthly view with colour-coded macro compliance |
| Profile | Edit personal details, manage favourite foods, logout |
| Food form | Create or edit a food with a full ingredient list |
| Scan label | Camera OCR with editable fields and portion scaling |

---

## Notes

- All nutrition priority: user-edited values > scanned values > USDA values
- Protein targets use g/kg body weight per goal, not a flat % of calories
- Calendar day colour reflects the worst-performing macro across all 5 tracked nutrients
- German nutrition label fields (Brennwert, Eiweiß, etc.) are supported in the scanner
