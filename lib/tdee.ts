type Profile = {
  weight_kg: number;
  height_cm: number;
  age: number;
  biological_sex: string;
  physical_activity_level: string;
  health_goal: string;
};

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  not_so_active: 1.2,
  fairly_active: 1.55,
  active: 1.725,
};

// Mifflin-St Jeor BMR + activity multiplier
export function calculateTDEE(profile: Profile): number {
  const { weight_kg, height_cm, age, biological_sex, physical_activity_level } = profile;
  const bmr =
    biological_sex === 'male'
      ? 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
      : 10 * weight_kg + 6.25 * height_cm - 5 * age - 161;

  const multiplier = ACTIVITY_MULTIPLIERS[physical_activity_level] ?? 1.2;
  return Math.round(bmr * multiplier);
}

// Macro split based on health goal — protein from body weight (g/kg), fat % of calories, carbs fill remainder
export function calculateMacros(tdee: number, healthGoal: string, weightKg: number) {
  let calTarget = tdee;
  let proteinPerKg: number;
  let fatPct: number;

  switch (healthGoal) {
    case 'weight_loss':
    case 'reduce_fat':
      calTarget = tdee - 500;
      proteinPerKg = 2.2; fatPct = 0.30; break;
    case 'weight_gain':
      calTarget = tdee + 400;
      proteinPerKg = 1.8; fatPct = 0.25; break;
    case 'muscle_build':
      calTarget = tdee + 200;
      proteinPerKg = 2.0; fatPct = 0.25; break;
    default: // gut_health, maintenance
      proteinPerKg = 1.6; fatPct = 0.30;
  }

  const protein = Math.round(proteinPerKg * weightKg);
  const fat = Math.round((calTarget * fatPct) / 9);
  const carbCals = calTarget - protein * 4 - fat * 9;
  const carbs = Math.round(Math.max(carbCals, 0) / 4);

  return { calories: calTarget, protein, carbs, fat };
}
