import { useState, useEffect, useRef } from 'react';
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
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { scanStore } from '@/lib/scanStore';

const USDA_API_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY!;

const UNITS = ['pcs', 'g', 'ml', 'cups', 'tsp', 'tbsp'];

type Nutrition = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

type Ingredient = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  nutrition: Nutrition;
  nutritionDisplay: Partial<Record<keyof Nutrition, string>>;
  scanned: boolean;
  userEdited: boolean;
  expanded: boolean;
  searching: boolean;
  suggestions: string[];
  showSuggestions: boolean;
  matchedFoodName?: string;
};

function emptyNutrition(): Nutrition {
  return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
}

function emptyIngredient(): Ingredient {
  return {
    id: Math.random().toString(),
    name: '',
    quantity: '',
    unit: 'pcs',
    nutrition: emptyNutrition(),
    nutritionDisplay: {},
    scanned: false,
    userEdited: false,
    expanded: false,
    searching: false,
    suggestions: [],
    showSuggestions: false,
  };
}

function sumNutrition(ingredients: Ingredient[]): Nutrition {
  return ingredients.reduce(
    (acc, ing) => ({
      calories: acc.calories + (ing.nutrition.calories || 0),
      protein: acc.protein + (ing.nutrition.protein || 0),
      carbs: acc.carbs + (ing.nutrition.carbs || 0),
      fat: acc.fat + (ing.nutrition.fat || 0),
      fiber: acc.fiber + (ing.nutrition.fiber || 0),
    }),
    emptyNutrition()
  );
}

// Convert quantity to grams for USDA lookup
function toGrams(quantity: string, unit: string): number {
  const q = parseFloat(quantity) || 1;
  switch (unit) {
    case 'g': return q;
    case 'ml': return q;
    case 'cups': return q * 236.6;
    case 'tsp': return q * 4.9;
    case 'tbsp': return q * 14.8;
    default: return q;
  }
}

async function searchUSDAsuggestions(query: string): Promise<string[]> {
  if (query.length < 2) return [];
  try {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=5&dataType=Foundation,SR%20Legacy,Branded&api_key=${USDA_API_KEY}`
    );
    const data = await res.json();
    return data.foods?.map((f: any) => f.description) || [];
  } catch {
    return [];
  }
}

async function lookupUSDA(name: string, quantity: string, unit: string): Promise<{ nutrition: Nutrition; matchedFoodName: string }> {
  try {
    const searchRes = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(name)}&pageSize=1&dataType=Foundation,SR%20Legacy,Branded&api_key=${USDA_API_KEY}`
    );
    const searchData = await searchRes.json();
    const foods = searchData.foods;

    if (!foods?.length) return { nutrition: emptyNutrition(), matchedFoodName: '' };

    const food = foods[0];
    let factor: number;
    if (unit === 'pcs') {
      const servingG = food.servingSize && food.servingSizeUnit?.toLowerCase() === 'g'
        ? food.servingSize
        : 100;
      factor = (parseFloat(quantity) || 1) * servingG / 100;
    } else {
      factor = toGrams(quantity, unit) / 100;
    }

    const get = (nutrientId: number) => {
      const n = food.foodNutrients?.find((fn: any) => fn.nutrientId === nutrientId);
      return Math.round((n?.value || 0) * factor * 10) / 10;
    };

    return {
      nutrition: {
        calories: get(1008),
        protein: get(1003),
        carbs: get(1005),
        fat: get(1004),
        fiber: get(1079),
      },
      matchedFoodName: food.description || '',
    };
  } catch {
    return { nutrition: emptyNutrition(), matchedFoodName: '' };
  }
}

export default function FoodFormScreen() {
  const params = useLocalSearchParams<{ foodId?: string; foodName?: string }>();
  const isEditing = !!params.foodId;

  const [foodName, setFoodName] = useState(params.foodName || '');
  const [ingredients, setIngredients] = useState<Ingredient[]>([emptyIngredient()]);
  const [saving, setSaving] = useState(false);
  const [loadingFood, setLoadingFood] = useState(isEditing);
  const justSelectedSuggestion = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!isEditing) return;
    loadExistingFood();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const result = scanStore.getResult();
      if (result) {
        updateIngredient(result.ingredientId, {
          nutrition: {
            calories: result.calories,
            protein: result.protein,
            carbs: result.carbs,
            fat: result.fat,
            fiber: result.fiber,
          },
          nutritionDisplay: {},
          quantity: result.portionEaten,
          unit: 'g',
          scanned: true,
          userEdited: result.userEdited,
          expanded: true,
        });
        scanStore.clearResult();
      }
    }, [])
  );

  async function loadExistingFood() {
    const { data } = await supabase
      .from('favourite_foods')
      .select('*, food_ingredients(*)')
      .eq('id', params.foodId)
      .single();

    if (data) {
      setFoodName(data.name);
      if (data.food_ingredients?.length) {
        setIngredients(
          data.food_ingredients.map((ing: any) => ({
            id: Math.random().toString(), // use local id for state management
            name: ing.name,
            quantity: ing.quantity?.toString() || '',
            unit: ing.unit || 'g',
            nutrition: {
              calories: ing.calories || 0,
              protein: ing.protein || 0,
              carbs: ing.carbs || 0,
              fat: ing.fat || 0,
              fiber: ing.fiber || 0,
            },
            scanned: ing.scanned || false,
            userEdited: false,
            nutritionDisplay: {},
            expanded: false,
            searching: false,
            suggestions: [],
            showSuggestions: false,
          }))
        );
      }
    }
    setLoadingFood(false);
  }

  function updateIngredient(id: string, updates: Partial<Ingredient>) {
    setIngredients(prev =>
      prev.map(ing => (ing.id === id ? { ...ing, ...updates } : ing))
    );
  }

  async function handleIngredientBlur(ing: Ingredient, setNameFromUSDA = false) {
    if (!ing.name || !ing.quantity || ing.userEdited || ing.scanned) return;
    updateIngredient(ing.id, { searching: true });
    const { nutrition, matchedFoodName } = await lookupUSDA(ing.name, ing.quantity, ing.unit);
    const updates: Partial<Ingredient> = { nutrition, matchedFoodName, searching: false };
    if (setNameFromUSDA && matchedFoodName) updates.name = matchedFoodName;
    updateIngredient(ing.id, updates);
  }

  async function handleUnitChange(id: string, unit: string) {
    const ing = ingredients.find(i => i.id === id);
    if (!ing) return;
    updateIngredient(id, { unit, searching: true });
    const result = (ing.userEdited || ing.scanned) ? { nutrition: ing.nutrition, matchedFoodName: ing.matchedFoodName } : await lookupUSDA(ing.name, ing.quantity, unit);
    updateIngredient(id, { unit, nutrition: result.nutrition, matchedFoodName: result.matchedFoodName, searching: false });
  }

  function handleAddIngredient() {
    setIngredients(prev => [...prev, emptyIngredient()]);
  }

  function handleRemoveIngredient(id: string) {
    if (ingredients.length === 1) {
      Alert.alert('Cannot remove', 'At least one ingredient is required.');
      return;
    }
    setIngredients(prev => prev.filter(ing => ing.id !== id));
  }

  async function handleSave() {
    if (!foodName.trim()) {
      Alert.alert('Required', 'Please enter a food name.');
      return;
    }
    if (ingredients.some(ing => !ing.name || !ing.quantity)) {
      Alert.alert('Required', 'Please fill in all ingredient names and quantities.');
      return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const total = sumNutrition(ingredients);

    if (isEditing) {
      await supabase.from('favourite_foods').update({
        name: foodName,
        calories: total.calories,
        protein: total.protein,
        carbs: total.carbs,
        fat: total.fat,
        fiber: total.fiber,
      }).eq('id', params.foodId);

      await supabase.from('food_ingredients').delete().eq('food_id', params.foodId);
    } else {
      const { data: newFood, error } = await supabase.from('favourite_foods').insert({
        user_id: user.id,
        name: foodName,
        calories: total.calories,
        protein: total.protein,
        carbs: total.carbs,
        fat: total.fat,
        fiber: total.fiber,
      }).select().single();

      if (error || !newFood) {
        Alert.alert('Error', error?.message || 'Failed to save food.');
        setSaving(false);
        return;
      }

      await supabase.from('food_ingredients').insert(
        ingredients.map(ing => ({
          food_id: newFood.id,
          name: ing.name,
          quantity: parseFloat(ing.quantity),
          unit: ing.unit,
          calories: ing.nutrition.calories,
          protein: ing.nutrition.protein,
          carbs: ing.nutrition.carbs,
          fat: ing.nutrition.fat,
          fiber: ing.nutrition.fiber,
          scanned: ing.scanned,
        }))
      );

      setSaving(false);
      router.back();
      return;
    }

    // Insert updated ingredients for edit flow
    await supabase.from('food_ingredients').insert(
      ingredients.map(ing => ({
        food_id: params.foodId,
        name: ing.name,
        quantity: parseFloat(ing.quantity),
        unit: ing.unit,
        calories: ing.nutrition.calories,
        protein: ing.nutrition.protein,
        carbs: ing.nutrition.carbs,
        fat: ing.nutrition.fat,
        fiber: ing.nutrition.fiber,
        scanned: ing.scanned,
      }))
    );

    setSaving(false);
    router.back();
  }

  const total = sumNutrition(ingredients);

  if (loadingFood) {
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="close" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>{isEditing ? 'Edit Food' : 'Add New Food'}</Text>
        <View style={{ width: 32 }} />
      </View>

      <Text style={styles.label}>Food Name *</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Protein Smoothie Bowl"
        placeholderTextColor="#9CA3AF"
        value={foodName}
        onChangeText={setFoodName}
      />

      <View style={styles.ingredientsHeader}>
        <Text style={styles.sectionTitle}>Ingredients</Text>
        <TouchableOpacity style={styles.addIngredientButton} onPress={handleAddIngredient}>
          <Ionicons name="add" size={16} color="#2563EB" />
          <Text style={styles.addIngredientText}>Add Ingredient</Text>
        </TouchableOpacity>
      </View>

      {ingredients.map((ing, index) => (
        <View key={ing.id} style={styles.ingredientCard}>
          <View style={styles.ingredientHeader}>
            <Text style={styles.ingredientIndex}>Ingredient {index + 1}</Text>
            <View style={styles.ingredientActions}>
              <TouchableOpacity
                onPress={() => handleRemoveIngredient(ing.id)}
                style={styles.iconButton}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Searchable ingredient name */}
          <View style={styles.suggestionWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Ingredient name"
              placeholderTextColor="#9CA3AF"
              value={ing.name}
              onChangeText={async v => {
                updateIngredient(ing.id, { name: v, scanned: false, showSuggestions: true });
                const suggestions = await searchUSDAsuggestions(v);
                updateIngredient(ing.id, { suggestions });
              }}
              onBlur={() => {
                setTimeout(() => updateIngredient(ing.id, { showSuggestions: false }), 200);
                if (!justSelectedSuggestion.current[ing.id]) {
                  handleIngredientBlur(ing);
                }
                justSelectedSuggestion.current[ing.id] = false;
              }}
            />
            {ing.showSuggestions && ing.suggestions.length > 0 && (
              <View style={styles.suggestionsBox}>
                {ing.suggestions.map((s, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.suggestionItem}
                    onPressIn={() => {
                      justSelectedSuggestion.current[ing.id] = true;
                      Keyboard.dismiss();
                      updateIngredient(ing.id, { name: s, showSuggestions: false, suggestions: [] });
                    }}
                    onPress={() => {
                      handleIngredientBlur({ ...ing, name: s }, true);
                    }}>
                    <Text style={styles.suggestionText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Quantity + Unit + Scan */}
          <View style={styles.quantityRow}>
            <TextInput
              style={[styles.input, styles.quantityInput]}
              placeholder="Qty"
              placeholderTextColor="#9CA3AF"
              value={ing.quantity}
              onChangeText={v => updateIngredient(ing.id, { quantity: v })}
              onBlur={() => handleIngredientBlur(ing)}
              keyboardType="numeric"
            />
            <TouchableOpacity
              style={styles.unitButton}
              onPress={() => {
                ActionSheetIOS.showActionSheetWithOptions(
                  { options: [...UNITS, 'Cancel'], cancelButtonIndex: UNITS.length },
                  idx => { if (idx < UNITS.length) handleUnitChange(ing.id, UNITS[idx]); }
                );
              }}>
              <Text style={styles.unitButtonText}>{ing.unit}</Text>
              <Ionicons name="chevron-down" size={14} color="#6B7280" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.scanButton}
              onPress={() => router.push({ pathname: '/scan-label', params: { ingredientId: ing.id } })}>
              <Ionicons name="camera-outline" size={22} color="#2563EB" />
            </TouchableOpacity>
          </View>

          {ing.searching && (
            <View style={styles.searchingRow}>
              <ActivityIndicator size="small" color="#2563EB" />
              <Text style={styles.searchingText}>Looking up nutrition...</Text>
            </View>
          )}

          {!ing.searching && (
            <View style={styles.nutritionBox}>
              <Text style={styles.nutritionTitle}>
                Nutrition {ing.userEdited ? '(edited)' : ing.scanned ? '(scanned)' : ing.nutrition.calories > 0 ? '(USDA)' : '(manual)'}
              </Text>
              {!ing.scanned && !ing.userEdited && ing.matchedFoodName ? (
                <Text style={styles.matchedFoodText}>Matched: {ing.matchedFoodName}</Text>
              ) : null}
              <View style={styles.nutritionGrid}>
                {([
                  { label: 'Cal', key: 'calories' as keyof Nutrition },
                  { label: 'Protein', key: 'protein' as keyof Nutrition },
                  { label: 'Carbs', key: 'carbs' as keyof Nutrition },
                  { label: 'Fat', key: 'fat' as keyof Nutrition },
                  { label: 'Fiber', key: 'fiber' as keyof Nutrition },
                ] as { label: string; key: keyof Nutrition }[]).map(n => (
                  <View key={n.label} style={styles.nutritionCell}>
                    <Text style={styles.nutritionLabel}>{n.label}</Text>
                    <TextInput
                      style={styles.nutritionValueInput}
                      value={ing.nutritionDisplay[n.key] ?? ing.nutrition[n.key].toString()}
                      onChangeText={v => {
                        const normalized = v.replace(',', '.');
                        const match = normalized.match(/^\d*\.?\d{0,2}/);
                        const limited = match ? match[0] : '';
                        updateIngredient(ing.id, {
                          nutritionDisplay: { ...ing.nutritionDisplay, [n.key]: limited },
                          nutrition: { ...ing.nutrition, [n.key]: parseFloat(limited) || 0 },
                          userEdited: true,
                        });
                      }}
                      keyboardType="decimal-pad"
                    />
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      ))}

      {/* Overall Nutrition */}
      <View style={styles.totalBox}>
        <Text style={styles.totalTitle}>Overall Nutrition Profile</Text>
        <View style={styles.nutritionGrid}>
          {[
            { label: 'Calories', value: total.calories, unit: '' },
            { label: 'Protein', value: total.protein, unit: 'g' },
            { label: 'Carbs', value: total.carbs, unit: 'g' },
            { label: 'Fat', value: total.fat, unit: 'g' },
            { label: 'Fiber', value: total.fiber, unit: 'g' },
          ].map(n => (
            <View key={n.label} style={styles.nutritionCell}>
              <Text style={styles.nutritionLabel}>{n.label}</Text>
              <Text style={styles.nutritionValue}>{n.value}{n.unit}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Food</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: 16, paddingTop: 60, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backButton: { padding: 4 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  ingredientsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  addIngredientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addIngredientText: { color: '#2563EB', fontSize: 14, fontWeight: '600' },
  ingredientCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  ingredientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ingredientIndex: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  ingredientActions: { flexDirection: 'row', gap: 8 },
  iconButton: { padding: 4 },
  quantityRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 4 },
  quantityInput: { flex: 1, marginBottom: 0 },
  unitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  unitButtonText: { fontSize: 15, color: '#111827', fontWeight: '500' },
  suggestionWrapper: { position: 'relative', zIndex: 10 },
  suggestionsBox: {
    position: 'absolute',
    top: 44,
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
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  suggestionText: { fontSize: 14, color: '#111827' },
  scanButton: {
    padding: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  searchingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  searchingText: { color: '#6B7280', fontSize: 13 },
  nutritionBox: {
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  totalBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  totalTitle: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 10 },
  nutritionTitle: { fontSize: 13, fontWeight: '600', color: '#0369A1', marginBottom: 2 },
  matchedFoodText: { fontSize: 11, color: '#6B7280', marginBottom: 8, fontStyle: 'italic' },
  nutritionGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  nutritionCell: { alignItems: 'center' },
  nutritionLabel: { fontSize: 11, color: '#6B7280', marginBottom: 2 },
  nutritionValue: { fontSize: 13, fontWeight: '600', color: '#111827' },
  nutritionValueInput: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#93C5FD',
    minWidth: 36,
    paddingVertical: 1,
  },
  tipText: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  buttonRow: { flexDirection: 'row', gap: 12 },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 13,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  cancelButtonText: { color: '#374151', fontSize: 15, fontWeight: '600' },
  saveButton: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 8,
    padding: 13,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
