import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Modal,
  Keyboard,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { calculateTDEE, calculateMacros } from '@/lib/tdee';

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY!;

const CUISINES = ['Indian', 'Italian', 'Mexican', 'Chinese', 'Japanese', 'Mediterranean', 'American', 'Thai', 'Middle Eastern', 'French', 'Greek', 'Korean', 'Spanish', 'Turkish', 'Vietnamese'];

const FOOD_OPTIONS = [
  // Fruits
  'Apple', 'Banana', 'Mango', 'Berries', 'Orange', 'Grapes', 'Pineapple', 'Watermelon', 'Strawberry', 'Avocado',
  // Vegetables
  'Spinach', 'Broccoli', 'Carrot', 'Tomato', 'Cucumber', 'Beetroot', 'Kale', 'Zucchini', 'Capsicum', 'Sweet Potato', 'Mushroom', 'Onion', 'Garlic',
  // Meat
  'Chicken', 'Beef', 'Lamb', 'Pork', 'Turkey', 'Duck',
  // Seafood
  'Salmon', 'Tuna', 'Shrimp', 'Cod', 'Sardines', 'Mackerel',
  // Dairy
  'Milk', 'Cheese', 'Yogurt', 'Butter', 'Cream', 'Eggs',
  // Grains
  'Rice', 'Oats', 'Quinoa', 'Bread', 'Pasta', 'Barley', 'Wheat',
  // Legumes
  'Lentils', 'Chickpeas', 'Black Beans', 'Kidney Beans', 'Tofu', 'Edamame',
  // Nuts & Seeds
  'Almonds', 'Walnuts', 'Cashews', 'Peanuts', 'Chia Seeds', 'Flaxseeds',
];

type Suggestion = {
  name: string;
  ingredients: string;
  recipe: string;
  servings: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  expanded: boolean;
};

type FavouriteFood = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

type RemainingMacros = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

// Reusable chip component
function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
      <TouchableOpacity onPress={onRemove}>
        <Ionicons name="close" size={14} color="#2563EB" />
      </TouchableOpacity>
    </View>
  );
}

// Multi-select cuisine modal
function CuisineModal({ visible, selected, onToggle, onClose }: {
  visible: boolean;
  selected: string[];
  onToggle: (v: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = CUISINES.filter(c => c.toLowerCase().includes(query.toLowerCase()));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Cuisines</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.modalSearch}
            placeholder="Search cuisines..."
            placeholderTextColor="#9CA3AF"
            value={query}
            onChangeText={setQuery}
          />
          <ScrollView style={{ maxHeight: 300 }}>
            {filtered.map(c => (
              <TouchableOpacity
                key={c}
                style={styles.modalOption}
                onPress={() => onToggle(c)}>
                <Text style={styles.modalOptionText}>{c}</Text>
                {selected.includes(c) && <Ionicons name="checkmark" size={18} color="#2563EB" />}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.modalDone} onPress={onClose}>
            <Text style={styles.modalDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// Searchable multi-select for food items
function FoodMultiSelect({ label, selected, onAdd, onRemove }: {
  label: string;
  selected: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filtered = query.length > 0
    ? FOOD_OPTIONS.filter(f =>
        f.toLowerCase().includes(query.toLowerCase()) && !selected.includes(f)
      )
    : [];

  return (
    <View style={styles.foodMultiSelect}>
      <Text style={styles.filterLabel}>{label}</Text>
      <View style={styles.chipsRow}>
        {selected.map(s => (
          <Chip key={s} label={s} onRemove={() => onRemove(s)} />
        ))}
      </View>
      <View style={styles.suggestionWrapper}>
        <TextInput
          style={styles.searchInput}
          placeholder={`Search ${label.toLowerCase()}...`}
          placeholderTextColor="#9CA3AF"
          value={query}
          onChangeText={v => { setQuery(v); setShowSuggestions(true); }}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        />
        {showSuggestions && filtered.length > 0 && (
          <View style={styles.suggestionsBox}>
            {filtered.slice(0, 6).map(f => (
              <TouchableOpacity
                key={f}
                style={styles.suggestionItem}
                onPress={() => { onAdd(f); setQuery(''); setShowSuggestions(false); }}>
                <Text style={styles.suggestionText}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export default function SuggestionsScreen() {
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const [limitedTo, setLimitedTo] = useState<string[]>([]);
  const [excluding, setExcluding] = useState<string[]>([]);
  const [showCuisineModal, setShowCuisineModal] = useState(false);
  const [favouriteFoods, setFavouriteFoods] = useState<FavouriteFood[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [remaining, setRemaining] = useState<RemainingMacros>({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];

    const [profileRes, mealsRes, activitiesRes, foodsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('meals').select('calories, protein, carbs, fat').eq('user_id', user.id).eq('date', today),
      supabase.from('activities').select('calories_burned').eq('user_id', user.id).eq('date', today),
      supabase.from('favourite_foods').select('*').eq('user_id', user.id),
    ]);

    if (profileRes.data) {
      const tdee = calculateTDEE(profileRes.data);
      const targets = calculateMacros(tdee, profileRes.data.health_goal, profileRes.data.weight_kg);

      const consumed = (mealsRes.data || []).reduce(
        (acc, m) => ({
          calories: acc.calories + m.calories,
          protein: acc.protein + m.protein,
          carbs: acc.carbs + m.carbs,
          fat: acc.fat + m.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );

      const burned = (activitiesRes.data || []).reduce((acc, a) => acc + a.calories_burned, 0);

      const rem = {
        calories: Math.max(0, Math.round(targets.calories - consumed.calories + burned)),
        protein: Math.max(0, Math.round(targets.protein - consumed.protein)),
        carbs: Math.max(0, Math.round(targets.carbs - consumed.carbs)),
        fat: Math.max(0, Math.round(targets.fat - consumed.fat)),
      };
      setRemaining(rem);
      setFavouriteFoods(foodsRes.data || []);
      setLoading(false);
      fetchSuggestions(rem);
      return;
    }

    setFavouriteFoods(foodsRes.data || []);
    setLoading(false);
  }

  async function fetchSuggestions(rem: RemainingMacros) {
    setLoadingSuggestions(true);
    try {
      const cuisineStr = selectedCuisines.length > 0 ? selectedCuisines.join(', ') : 'Any';
      const limitedStr = limitedTo.length > 0 ? limitedTo.join(', ') : 'Any';
      const excludingStr = excluding.length > 0 ? excluding.join(', ') : 'None';

      const prompt = `You are a nutrition expert. Suggest 4 meals to help meet these remaining daily nutrition needs:
- Calories: ${rem.calories} kcal
- Protein: ${rem.protein}g
- Carbs: ${rem.carbs}g
- Fat: ${rem.fat}g

Filters:
- Cuisine: ${cuisineStr}
- Limited to ingredients: ${limitedStr}
- Excluding ingredients: ${excludingStr}

Return a JSON array of exactly 4 meals with this structure:
[{
  "name": "Meal name",
  "ingredients": "ingredient1, ingredient2, ingredient3",
  "recipe": "Step 1: ... Step 2: ... Step 3: ...",
  "servings": 2,
  "calories": 400,
  "protein": 30,
  "carbs": 45,
  "fat": 12
}]

Only return the JSON array, no other text.`;

      const res = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 2048,
          }),
        }
      );

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '[]';
      const cleaned = text.replace(/```json|```/g, '').trim();
      const parsed: Omit<Suggestion, 'expanded'>[] = JSON.parse(cleaned);
      setSuggestions(parsed.map(s => ({ ...s, expanded: false })));
    } catch (e) {
      console.error('Suggestions error:', e);
      setSuggestions([]);
    }
    setLoadingSuggestions(false);
  }

  function toggleExpand(index: number) {
    setSuggestions(prev =>
      prev.map((s, i) => (i === index ? { ...s, expanded: !s.expanded } : s))
    );
  }

  function toggleCuisine(c: string) {
    setSelectedCuisines(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Meal Suggestions</Text>

      {/* Remaining macros */}
      <View style={styles.remainingCard}>
        <Text style={styles.remainingTitle}>Remaining Today</Text>
        <View style={styles.remainingRow}>
          {[
            { label: 'Calories', value: `${remaining.calories} kcal` },
            { label: 'Protein', value: `${remaining.protein}g` },
            { label: 'Carbs', value: `${remaining.carbs}g` },
            { label: 'Fat', value: `${remaining.fat}g` },
          ].map(m => (
            <View key={m.label} style={styles.remainingItem}>
              <Text style={styles.remainingValue}>{m.value}</Text>
              <Text style={styles.remainingLabel}>{m.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filtersCard}>
        {/* Cuisine multi-select */}
        <View>
          <Text style={styles.filterLabel}>Cuisine</Text>
          <View style={styles.chipsRow}>
            {selectedCuisines.map(c => (
              <Chip key={c} label={c} onRemove={() => toggleCuisine(c)} />
            ))}
            <TouchableOpacity
              style={styles.addChipButton}
              onPress={() => setShowCuisineModal(true)}>
              <Ionicons name="add" size={14} color="#2563EB" />
              <Text style={styles.addChipText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Limited to */}
        <FoodMultiSelect
          label="Limited to"
          selected={limitedTo}
          onAdd={v => setLimitedTo(prev => [...prev, v])}
          onRemove={v => setLimitedTo(prev => prev.filter(x => x !== v))}
        />

        {/* Excluding */}
        <FoodMultiSelect
          label="Excluding"
          selected={excluding}
          onAdd={v => setExcluding(prev => [...prev, v])}
          onRemove={v => setExcluding(prev => prev.filter(x => x !== v))}
        />

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => { Keyboard.dismiss(); fetchSuggestions(remaining); }}
          disabled={loadingSuggestions}>
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={styles.refreshText}>Get Suggestions</Text>
        </TouchableOpacity>
      </View>

      {/* Favourite Foods section */}
      {favouriteFoods.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Favourite Foods</Text>
          {favouriteFoods.map(food => (
            <View key={food.id} style={styles.foodCard}>
              <Text style={styles.foodName}>{food.name}</Text>
              <Text style={styles.foodMacros}>
                {food.calories} cal · P:{food.protein}g · C:{food.carbs}g · F:{food.fat}g
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* More Suggestions section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>More Suggestions</Text>

        {loadingSuggestions ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#2563EB" />
            <Text style={styles.loadingText}>Generating suggestions...</Text>
          </View>
        ) : suggestions.length === 0 ? (
          <Text style={styles.emptyText}>Tap "Get Suggestions" to load meal ideas.</Text>
        ) : (
          suggestions.map((s, i) => (
            <TouchableOpacity
              key={i}
              style={styles.suggestionCard}
              onPress={() => toggleExpand(i)}
              activeOpacity={0.8}>
              <View style={styles.suggestionTitleRow}>
                <Text style={styles.suggestionName}>{s.name}</Text>
                <Ionicons name={s.expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#6B7280" />
              </View>
              <Text style={styles.suggestionIngredients} numberOfLines={s.expanded ? undefined : 1}>
                {s.ingredients}
              </Text>

              {s.expanded && (
                <View style={styles.suggestionDetails}>
                  <View style={styles.nutritionRow}>
                    {[
                      { label: 'Calories', value: `${s.calories}` },
                      { label: 'Protein', value: `${s.protein}g` },
                      { label: 'Carbs', value: `${s.carbs}g` },
                      { label: 'Fat', value: `${s.fat}g` },
                      { label: 'Fiber', value: `${s.fiber}g` },
                    ].map(n => (
                      <View key={n.label} style={styles.nutritionItem}>
                        <Text style={styles.nutritionValue}>{n.value}</Text>
                        <Text style={styles.nutritionLabel}>{n.label}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.recipeTitle}>Recipe</Text>
                  <Text style={styles.recipeText}>{s.recipe}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </View>

      <CuisineModal
        visible={showCuisineModal}
        selected={selectedCuisines}
        onToggle={toggleCuisine}
        onClose={() => setShowCuisineModal(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: 16, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 16 },
  remainingCard: { backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, marginBottom: 16 },
  remainingTitle: { fontSize: 13, fontWeight: '600', color: '#1D4ED8', marginBottom: 10 },
  remainingRow: { flexDirection: 'row', justifyContent: 'space-between' },
  remainingItem: { alignItems: 'center' },
  remainingValue: { fontSize: 15, fontWeight: '700', color: '#1D4ED8' },
  remainingLabel: { fontSize: 11, color: '#3B82F6', marginTop: 2 },
  filtersCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 16, gap: 14 },
  filterLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 6 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  chipText: { fontSize: 13, color: '#2563EB' },
  addChipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 2,
  },
  addChipText: { fontSize: 13, color: '#2563EB' },
  foodMultiSelect: {},
  suggestionWrapper: { position: 'relative', zIndex: 10 },
  searchInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 9,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  suggestionsBox: {
    position: 'absolute',
    top: 42,
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
  suggestionItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  suggestionText: { fontSize: 14, color: '#111827' },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 8,
    padding: 12,
    gap: 6,
  },
  refreshText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 12 },
  foodCard: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 12, marginBottom: 8 },
  foodName: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 4 },
  foodMacros: { fontSize: 12, color: '#6B7280' },
  loadingBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  loadingText: { color: '#6B7280', fontSize: 14 },
  emptyText: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', paddingVertical: 12 },
  suggestionCard: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 14, marginBottom: 10 },
  suggestionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  suggestionName: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1, marginRight: 8 },
  suggestionIngredients: { fontSize: 13, color: '#6B7280' },
  suggestionDetails: { marginTop: 14 },
  nutritionRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F9FAFB', borderRadius: 8, padding: 12, marginBottom: 14 },
  nutritionItem: { alignItems: 'center' },
  nutritionValue: { fontSize: 14, fontWeight: '700', color: '#111827' },
  nutritionLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  recipeTitle: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 8 },
  recipeText: { fontSize: 13, color: '#374151', lineHeight: 22 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#111827' },
  modalSearch: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 10, fontSize: 14, color: '#111827', marginBottom: 8 },
  modalOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalOptionText: { fontSize: 15, color: '#111827' },
  modalDone: { backgroundColor: '#2563EB', borderRadius: 8, padding: 13, alignItems: 'center', marginTop: 12 },
  modalDoneText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
