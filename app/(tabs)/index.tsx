import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { calculateTDEE, calculateMacros } from '@/lib/tdee';

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

const ACTIVITIES = [
  'Walking', 'Running', 'Cycling', 'Swimming', 'Yoga', 'Gym', 'Hiking',
  'Dancing', 'Pilates', 'Rowing', 'Jump Rope', 'Basketball', 'Football',
  'Tennis', 'Badminton', 'Rock Climbing', 'Stretching', 'HIIT', 'CrossFit',
  'Zumba', 'Boxing', 'Martial Arts', 'Skiing', 'Surfing',
];

type Macros = { calories: number; protein: number; carbs: number; fat: number };
type Meal = { id: string; meal_type: string; food_name: string; multiplier: number; calories: number; protein: number; carbs: number; fat: number; fiber: number };
type Activity = { id: string; activity: string; duration_minutes: number; calories_burned: number };
type FavouriteFood = { id: string; name: string; calories: number; protein: number; carbs: number; fat: number; fiber: number };

function MacroBar({ label, consumed, needed, color }: { label: string; consumed: number; needed: number; color: string }) {
  const pct = needed > 0 ? Math.min(consumed / needed, 1) : 0;
  return (
    <View style={barStyles.container}>
      <Text style={barStyles.label}>{label}</Text>
      <View style={barStyles.track}>
        <View style={[barStyles.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={barStyles.values}>{consumed}g / {needed}g</Text>
    </View>
  );
}

const barStyles = StyleSheet.create({
  container: { marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 3 },
  track: { height: 10, backgroundColor: '#E5E7EB', borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  values: { fontSize: 11, color: '#6B7280', marginTop: 2 },
});

export default function MealEntryScreen() {
  const [userName, setUserName] = useState('');
  const [targets, setTargets] = useState<Macros>({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [meals, setMeals] = useState<Meal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [favouriteFoods, setFavouriteFoods] = useState<FavouriteFood[]>([]);
  const [loading, setLoading] = useState(true);

  // New meal row state
  const [newMealType, setNewMealType] = useState('');
  const [newMealFood, setNewMealFood] = useState<FavouriteFood | null>(null);
  const [newMealMultiplier, setNewMealMultiplier] = useState('1');
  const [savingMeal, setSavingMeal] = useState(false);
  const [foodQuery, setFoodQuery] = useState('');
  const [foodSuggestions, setFoodSuggestions] = useState<{ name: string; source: 'favourite' | 'usda'; food?: FavouriteFood; fdcId?: number }[]>([]);
  const [showFoodSuggestions, setShowFoodSuggestions] = useState(false);
  const [searchingFood, setSearchingFood] = useState(false);

  // New activity row state
  const [newActivity, setNewActivity] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [newCaloriesBurned, setNewCaloriesBurned] = useState('');
  const [savingActivity, setSavingActivity] = useState(false);
  const [activitySuggestions, setActivitySuggestions] = useState<string[]>([]);
  const [showActivitySuggestions, setShowActivitySuggestions] = useState(false);

  const [showAddMealRow, setShowAddMealRow] = useState(false);
  const [showAddActivityRow, setShowAddActivityRow] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (showAddMealRow || showAddActivityRow) {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 350);
    }
  }, [showAddMealRow, showAddActivityRow]);

  const today = new Date().toISOString().split('T')[0];

  const USDA_API_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY!;

  async function searchFoods(query: string) {
    if (query.length < 2) { setFoodSuggestions([]); return; }
    setSearchingFood(true);

    // Favourite foods matching query
    const favMatches = favouriteFoods
      .filter(f => f.name.toLowerCase().includes(query.toLowerCase()))
      .map(f => ({ name: f.name, source: 'favourite' as const, food: f }));

    // USDA search
    try {
      const res = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=5&api_key=${USDA_API_KEY}`
      );
      const data = await res.json();
      const usdaMatches = (data.foods || []).map((f: any) => ({
        name: [f.description, f.brandOwner].filter(Boolean).join(' — '),
        source: 'usda' as const,
        fdcId: f.fdcId,
      }));
      setFoodSuggestions([...favMatches, ...usdaMatches]);
    } catch {
      setFoodSuggestions(favMatches);
    }
    setSearchingFood(false);
  }

  async function selectUSDAFood(name: string, fdcId?: number): Promise<FavouriteFood | null> {
    try {
      const res = await fetch(
        `https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${USDA_API_KEY}`
      );
      const food = await res.json();
      const get = (id: number) => {
        const n = food.foodNutrients?.find((fn: any) => fn.nutrient?.id === id || fn.nutrientId === id);
        return Math.round((n?.amount || n?.value || 0) * 10) / 10;
      };
      return {
        id: `usda-${fdcId}`,
        name,
        calories: get(1008),
        protein: get(1003),
        carbs: get(1005),
        fat: get(1004),
        fiber: get(1079),
      };
    } catch {
      return null;
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [])
  );

  async function loadAll() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [profileRes, mealsRes, activitiesRes, foodsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('meals').select('*').eq('user_id', user.id).eq('date', today),
      supabase.from('activities').select('*').eq('user_id', user.id).eq('date', today),
      supabase.from('favourite_foods').select('*').eq('user_id', user.id),
    ]);

    if (profileRes.data) {
      setUserName(profileRes.data.name || '');
      const tdee = calculateTDEE(profileRes.data);
      const macros = calculateMacros(tdee, profileRes.data.health_goal, profileRes.data.weight_kg);
      setTargets(macros);
    }

    setMeals(mealsRes.data || []);
    setActivities(activitiesRes.data || []);
    setFavouriteFoods(foodsRes.data || []);
    setLoading(false);
  }

  // Totals
  const consumed: Macros = meals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const consumedFiber = meals.reduce((acc, m) => acc + (m.fiber || 0), 0);

  const caloriesBurned = activities.reduce((acc, a) => acc + a.calories_burned, 0);
  const netCalories = Math.round(consumed.calories - caloriesBurned);

  async function estimateCaloriesBurned(activity: string, minutes: number): Promise<number> {
    // Simple MET-based estimation
    const METs: Record<string, number> = {
      walking: 3.5, running: 8, cycling: 7, swimming: 6,
      yoga: 2.5, gym: 5, hiking: 5.5, dancing: 4.5,
    };
    const key = Object.keys(METs).find(k => activity.toLowerCase().includes(k));
    const met = key ? METs[key] : 4;
    const { data } = await supabase.from('profiles').select('weight_kg').single();
    const weight = data?.weight_kg || 70;
    return Math.round((met * weight * minutes) / 60);
  }

  async function handleAddMeal() {
    if (!newMealType || !newMealFood) {
      Alert.alert('Required', 'Please select a meal type and a food.');
      return;
    }
    const multiplier = parseFloat(newMealMultiplier.replace(',', '.')) || 1;
    setSavingMeal(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase.from('meals').insert({
      user_id: user.id,
      date: today,
      meal_type: newMealType,
      food_id: newMealFood.id.startsWith('usda-') ? null : newMealFood.id,
      food_name: newMealFood.name,
      multiplier,
      calories: Math.round(newMealFood.calories * multiplier),
      protein: Math.round(newMealFood.protein * multiplier * 10) / 10,
      carbs: Math.round(newMealFood.carbs * multiplier * 10) / 10,
      fat: Math.round(newMealFood.fat * multiplier * 10) / 10,
      fiber: Math.round(newMealFood.fiber * multiplier * 10) / 10,
    }).select().single();

    setSavingMeal(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setMeals(prev => [...prev, data]);
    setNewMealType('');
    setNewMealFood(null);
    setNewMealMultiplier('1');
  }

  async function handleDeleteMeal(id: string) {
    await supabase.from('meals').delete().eq('id', id);
    setMeals(prev => prev.filter(m => m.id !== id));
  }

  async function handleAddActivity() {
    if (!newActivity || !newDuration) {
      Alert.alert('Required', 'Please enter an activity and duration.');
      return;
    }
    setSavingActivity(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const burned = newCaloriesBurned
      ? parseFloat(newCaloriesBurned)
      : await estimateCaloriesBurned(newActivity, parseFloat(newDuration));

    const { data, error } = await supabase.from('activities').insert({
      user_id: user.id,
      date: today,
      activity: newActivity,
      duration_minutes: parseFloat(newDuration),
      calories_burned: burned,
    }).select().single();

    setSavingActivity(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setActivities(prev => [...prev, data]);
    setNewActivity('');
    setNewDuration('');
    setNewCaloriesBurned('');
  }

  async function handleDeleteActivity(id: string) {
    await supabase.from('activities').delete().eq('id', id);
    setActivities(prev => prev.filter(a => a.id !== id));
  }


  const dateStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}>
    <ScrollView
      ref={scrollViewRef}
      style={styles.container}
      contentContainerStyle={showAddMealRow || showAddActivityRow ? styles.contentWithRow : styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag">
      {/* Header */}
      <Text style={styles.greeting}>Hello, {userName}!</Text>
      <Text style={styles.date}>{dateStr}</Text>

      {/* Summary */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Daily Macro Needs</Text>
        <Text style={styles.macroSummary}>
          <Text style={{ fontWeight: '700' }}>{targets.calories} cal</Text>
          {'  ·  P: '}{targets.protein}g{'  ·  C: '}{targets.carbs}g{'  ·  F: '}{targets.fat}g
        </Text>

        <View style={styles.separator} />

        <Text style={styles.cardTitle}>Consumed Today</Text>
        <Text style={styles.macroSummary}>
          <Text style={{ fontWeight: '700' }}>{Math.round(consumed.calories)} cal</Text>
          {'  ·  P: '}{Math.round(consumed.protein)}g{'  ·  C: '}{Math.round(consumed.carbs)}g{'  ·  F: '}{Math.round(consumed.fat)}g
        </Text>

        <View style={styles.separator} />

        <View style={styles.netRow}>
          <Text style={styles.netLabel}>Calories Burned</Text>
          <Text style={styles.netValue}>-{Math.round(caloriesBurned)} cal</Text>
        </View>
        <View style={styles.netRow}>
          <Text style={[styles.netLabel, { fontWeight: '700', color: '#111827' }]}>Net Calories</Text>
          <Text style={[styles.netValue, { fontWeight: '700', fontSize: 15 }]}>{netCalories} cal</Text>
        </View>

        <View style={styles.separator} />

        <Text style={styles.cardTitle}>Macros: Needs vs Consumed</Text>
        <View style={{ marginTop: 8 }}>
          <MacroBar label="Protein" consumed={Math.round(consumed.protein)} needed={targets.protein} color="#3B82F6" />
          <MacroBar label="Carbs" consumed={Math.round(consumed.carbs)} needed={targets.carbs} color="#10B981" />
          <MacroBar label="Fat" consumed={Math.round(consumed.fat)} needed={targets.fat} color="#F59E0B" />
          <MacroBar label="Fiber" consumed={Math.round(consumedFiber)} needed={25} color="#8B5CF6" />
        </View>
      </View>

      {/* Logged Meals */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Add Meal</Text>
          {!showAddMealRow && (
            <TouchableOpacity style={styles.addRowBtn} onPress={() => setShowAddMealRow(true)}>
              <Text style={styles.addRowBtnText}>+ Add Row</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Table headers */}
        {(meals.length > 0 || showAddMealRow) && (
          <View style={styles.tableHeader}>
            <Text style={[styles.colHeader, { flex: 1 }]}>Meal Type</Text>
            <Text style={[styles.colHeader, { flex: 2 }]}>Meal</Text>
            <Text style={[styles.colHeader, { width: 38 }]}>×</Text>
            <Text style={[styles.colHeader, { flex: 1 }]}>Nutrition</Text>
            <View style={{ width: 24 }} />
          </View>
        )}

        {meals.map(m => (
          <View key={m.id} style={styles.tableRow}>
            <Text style={[styles.tableCell, { flex: 1 }]} numberOfLines={1}>{m.meal_type}</Text>
            <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{m.food_name}</Text>
            <Text style={[styles.tableCell, { width: 38 }]}>×{m.multiplier}</Text>
            <Text style={[styles.tableCell, { flex: 1 }]} numberOfLines={1}>{m.calories} cal</Text>
            <TouchableOpacity onPress={() => handleDeleteMeal(m.id)} style={{ width: 24, alignItems: 'center' }}>
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
            </TouchableOpacity>
          </View>
        ))}

        {/* New meal row */}
        {showAddMealRow && (
          <View style={{ zIndex: 10 }}>
            <View style={styles.addRow}>
              <TouchableOpacity
                style={[styles.dropdownSmall, { flex: 1 }]}
                onPress={() => ActionSheetIOS.showActionSheetWithOptions(
                  { options: [...MEAL_TYPES, 'Cancel'], cancelButtonIndex: MEAL_TYPES.length },
                  idx => { if (idx < MEAL_TYPES.length) setNewMealType(MEAL_TYPES[idx]); }
                )}>
                <Text style={newMealType ? styles.dropdownValue : styles.dropdownPlaceholder} numberOfLines={1}>
                  {newMealType || 'Type'}
                </Text>
                <Ionicons name="chevron-down" size={12} color="#6B7280" />
              </TouchableOpacity>

              <View style={[{ flex: 2 }, styles.suggestionWrapper]}>
                <View style={styles.foodInputRow}>
                  <TextInput
                    style={[styles.dropdownMeal, { flex: 1, borderWidth: 0 }]}
                    placeholder="Search food"
                    placeholderTextColor="#9CA3AF"
                    value={newMealFood ? newMealFood.name : foodQuery}
                    onChangeText={async v => {
                      setFoodQuery(v);
                      setNewMealFood(null);
                      setShowFoodSuggestions(true);
                      await searchFoods(v);
                    }}
                    onFocus={() => { if (foodQuery.length > 1) setShowFoodSuggestions(true); }}
                    onBlur={() => setTimeout(() => setShowFoodSuggestions(false), 200)}
                  />
                  {searchingFood && <ActivityIndicator size="small" color="#2563EB" style={{ marginRight: 6 }} />}
                  {newMealFood && (
                    <TouchableOpacity onPress={() => { setNewMealFood(null); setFoodQuery(''); }}>
                      <Ionicons name="close-circle" size={18} color="#9CA3AF" style={{ marginRight: 6 }} />
                    </TouchableOpacity>
                  )}
                </View>
                {showFoodSuggestions && (
                  <View style={styles.suggestionsBox}>
                    {foodSuggestions.slice(0, 5).map((s, i) => (
                      <TouchableOpacity
                        key={i}
                        style={styles.suggestionItem}
                        onPress={async () => {
                          setShowFoodSuggestions(false);
                          if (s.source === 'favourite' && s.food) {
                            setNewMealFood(s.food);
                            setFoodQuery('');
                          } else {
                            setSearchingFood(true);
                            const food = await selectUSDAFood(s.name, s.fdcId);
                            setSearchingFood(false);
                            if (food) setNewMealFood(food);
                          }
                        }}>
                        <View style={styles.suggestionRow}>
                          <Text style={styles.suggestionText}>{s.name}</Text>
                          <Text style={s.source === 'favourite' ? styles.tagFav : styles.tagUsda}>
                            {s.source === 'favourite' ? '★ Fav' : 'USDA'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[styles.suggestionItem, { borderTopWidth: 1, borderTopColor: '#E5E7EB' }]}
                      onPress={() => { setShowFoodSuggestions(false); router.push('/food-form'); }}>
                      <View style={styles.suggestionRow}>
                        <Text style={[styles.suggestionText, { color: '#2563EB' }]}>+ Add New Food to Profile</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <TextInput
                style={styles.multiplierInput}
                value={newMealMultiplier}
                onChangeText={v => {
                  const normalized = v.replace(',', '.');
                  const match = normalized.match(/^\d*\.?\d{0,2}/);
                  setNewMealMultiplier(match ? match[0] : '');
                }}
                keyboardType="decimal-pad"
                placeholder="×"
              />

              <TouchableOpacity
                style={styles.addBtn}
                onPress={async () => { await handleAddMeal(); setShowAddMealRow(false); }}
                disabled={savingMeal}>
                {savingMeal
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="checkmark" size={20} color="#fff" />}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { setShowAddMealRow(false); setNewMealFood(null); setFoodQuery(''); setNewMealType(''); }} style={{ paddingLeft: 4 }}>
                <Ionicons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {newMealFood && (
              <Text style={styles.previewText}>
                {Math.round(newMealFood.calories * (parseFloat(newMealMultiplier.replace(',', '.')) || 1))} cal ·
                P:{Math.round(newMealFood.protein * (parseFloat(newMealMultiplier.replace(',', '.')) || 1))}g ·
                C:{Math.round(newMealFood.carbs * (parseFloat(newMealMultiplier.replace(',', '.')) || 1))}g ·
                F:{Math.round(newMealFood.fat * (parseFloat(newMealMultiplier.replace(',', '.')) || 1))}g
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Log Activity */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Log Activity</Text>
          {!showAddActivityRow && (
            <TouchableOpacity style={styles.addRowBtn} onPress={() => setShowAddActivityRow(true)}>
              <Text style={styles.addRowBtnText}>+ Add Row</Text>
            </TouchableOpacity>
          )}
        </View>

        {(activities.length > 0 || showAddActivityRow) && (
          <View style={styles.tableHeader}>
            <Text style={[styles.colHeader, { flex: 2 }]}>Activity</Text>
            <Text style={[styles.colHeader, { flex: 1 }]}>Duration (min)</Text>
            <Text style={[styles.colHeader, { flex: 1 }]}>Cal Burned</Text>
            <View style={{ width: 24 }} />
          </View>
        )}

        {activities.map(a => (
          <View key={a.id} style={styles.tableRow}>
            <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{a.activity}</Text>
            <Text style={[styles.tableCell, { flex: 1 }]}>{a.duration_minutes}</Text>
            <Text style={[styles.tableCell, { flex: 1 }]}>{a.calories_burned}</Text>
            <TouchableOpacity onPress={() => handleDeleteActivity(a.id)} style={{ width: 24, alignItems: 'center' }}>
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
            </TouchableOpacity>
          </View>
        ))}

        {showAddActivityRow && (
          <View style={{ zIndex: 10 }}>
            <View style={styles.activityRow}>
              <View style={[{ flex: 2 }, styles.suggestionWrapper]}>
                <TextInput
                  style={styles.input}
                  placeholder="Activity"
                  placeholderTextColor="#9CA3AF"
                  value={newActivity}
                  onChangeText={v => {
                    setNewActivity(v);
                    const filtered = ACTIVITIES.filter(a =>
                      a.toLowerCase().includes(v.toLowerCase())
                    );
                    setActivitySuggestions(filtered);
                    setShowActivitySuggestions(v.length > 0 && filtered.length > 0);
                  }}
                  onBlur={() => setTimeout(() => setShowActivitySuggestions(false), 200)}
                />
                {showActivitySuggestions && (
                  <View style={styles.suggestionsBox}>
                    {activitySuggestions.slice(0, 5).map((s, i) => (
                      <TouchableOpacity
                        key={i}
                        style={styles.suggestionItem}
                        onPress={() => {
                          setNewActivity(s);
                          setShowActivitySuggestions(false);
                        }}>
                        <Text style={styles.suggestionText}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Min"
                placeholderTextColor="#9CA3AF"
                value={newDuration}
                onChangeText={v => { setNewDuration(v); setNewCaloriesBurned(''); }}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Cal"
                placeholderTextColor="#9CA3AF"
                value={newCaloriesBurned}
                onChangeText={setNewCaloriesBurned}
                keyboardType="numeric"
              />
              <TouchableOpacity
                style={styles.addBtn}
                onPress={async () => { await handleAddActivity(); setShowAddActivityRow(false); }}
                disabled={savingActivity}>
                {savingActivity
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="checkmark" size={20} color="#fff" />}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowAddActivityRow(false); setNewActivity(''); setNewDuration(''); setNewCaloriesBurned(''); }} style={{ paddingLeft: 4 }}>
                <Ionicons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>Calories auto-calculated if left blank. Tap to override.</Text>
          </View>
        )}
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: 16, paddingTop: 60, paddingBottom: 40 },
  contentWithRow: { padding: 16, paddingTop: 60, paddingBottom: 360 },
  greeting: { fontSize: 24, fontWeight: 'bold', color: '#111827' },
  date: { fontSize: 13, color: '#6B7280', marginBottom: 16, marginTop: 2 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },
  separator: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6', marginVertical: 12 },
  macroSummary: { fontSize: 14, color: '#111827', marginBottom: 4 },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  netLabel: { fontSize: 13, color: '#6B7280' },
  netValue: { fontSize: 13, color: '#111827' },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  addRowBtn: {
    backgroundColor: '#111827',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  addRowBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    marginBottom: 2,
  },
  colHeader: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tableCell: { fontSize: 13, color: '#111827', paddingRight: 4 },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  logInfo: { flex: 1, marginRight: 8 },
  logType: { fontSize: 11, color: '#6B7280', textTransform: 'uppercase' },
  logName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  logNutrition: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  addRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 10 },
  activityRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 10 },
  dropdownSmall: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 9,
    backgroundColor: '#F9FAFB',
  },
  dropdownMeal: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 9,
    backgroundColor: '#F9FAFB',
  },
  dropdownValue: { fontSize: 13, color: '#111827', flex: 1 },
  dropdownPlaceholder: { fontSize: 13, color: '#9CA3AF', flex: 1 },
  multiplierInput: {
    width: 36,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 9,
    fontSize: 13,
    color: '#111827',
    backgroundColor: '#F9FAFB',
    textAlign: 'center',
  },
  addBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    padding: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: { fontSize: 12, color: '#6B7280', marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 9,
    fontSize: 13,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  hint: { fontSize: 11, color: '#9CA3AF', marginTop: 6 },
  suggestionWrapper: { position: 'relative', zIndex: 10 },
  suggestionsBox: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    zIndex: 999,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  suggestionItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  suggestionsBoxAbove: {
    position: 'absolute',
    bottom: 44,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    zIndex: 999,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  suggestionText: { fontSize: 12, color: '#111827', flex: 1, marginRight: 8 },
  tagFav: { fontSize: 11, color: '#2563EB', fontWeight: '600' },
  tagUsda: { fontSize: 11, color: '#6B7280' },
  foodInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
  },
});
