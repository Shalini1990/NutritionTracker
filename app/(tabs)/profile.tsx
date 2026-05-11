import { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, router } from 'expo-router';
import { supabase } from '@/lib/supabase';

type Profile = {
  name: string;
  height_cm: string;
  weight_kg: string;
  age: string;
  biological_sex: string;
  health_goal: string;
  physical_activity_level: string;
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

const SEX_OPTIONS = ['Male', 'Female'];
const GOAL_OPTIONS = ['Weight Loss', 'Gut Health', 'Weight Gain', 'Muscle Build', 'Reduce Fat'];
const GOAL_VALUES = ['weight_loss', 'gut_health', 'weight_gain', 'muscle_build', 'reduce_fat'];
const ACTIVITY_OPTIONS = ['Not So Active', 'Fairly Active', 'Active'];
const ACTIVITY_VALUES = ['not_so_active', 'fairly_active', 'active'];

function showPicker(options: string[], onSelect: (value: string) => void) {
  ActionSheetIOS.showActionSheetWithOptions(
    { options: [...options, 'Cancel'], cancelButtonIndex: options.length },
    idx => { if (idx < options.length) onSelect(options[idx]); }
  );
}

function DropdownButton({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={dropdownStyles.button} onPress={onPress}>
      <Text style={value ? dropdownStyles.value : dropdownStyles.placeholder}>
        {value || label}
      </Text>
      <Ionicons name="chevron-down" size={16} color="#6B7280" />
    </TouchableOpacity>
  );
}

const dropdownStyles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#F9FAFB',
    marginBottom: 12,
  },
  value: { fontSize: 15, color: '#111827' },
  placeholder: { fontSize: 15, color: '#9CA3AF' },
});

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile>({
    name: '',
    height_cm: '',
    weight_kg: '',
    age: '',
    biological_sex: '',
    health_goal: '',
    physical_activity_level: '',
  });
  const [savedProfile, setSavedProfile] = useState<Profile | null>(null);
  const [favouriteFoods, setFavouriteFoods] = useState<FavouriteFood[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  const isDirty = savedProfile !== null && JSON.stringify(profile) !== JSON.stringify(savedProfile);

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (data) {
      const loaded: Profile = {
        name: data.name || '',
        height_cm: data.height_cm?.toString() || '',
        weight_kg: data.weight_kg?.toString() || '',
        age: data.age?.toString() || '',
        biological_sex: data.biological_sex || '',
        health_goal: data.health_goal || '',
        physical_activity_level: data.physical_activity_level || '',
      };
      setProfile(loaded);
      setSavedProfile(loaded);
    }
    setLoadingProfile(false);
  }

  async function fetchFavouriteFoods() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('favourite_foods')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (data) setFavouriteFoods(data);
  }

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
      fetchFavouriteFoods();
    }, [])
  );

  async function handleSaveProfile() {
    if (!profile.name || !profile.height_cm || !profile.weight_kg || !profile.age ||
        !profile.biological_sex || !profile.health_goal || !profile.physical_activity_level) {
      Alert.alert('Required', 'Please fill in all fields.');
      return;
    }

    const ageNum = parseInt(profile.age);
    if (isNaN(ageNum) || ageNum < 0 || ageNum > 110) {
      Alert.alert('Invalid Age', 'Please enter a valid age between 0 and 110.');
      return;
    }

    setSavingProfile(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update({
        name: profile.name,
        height_cm: parseFloat(profile.height_cm),
        weight_kg: parseFloat(profile.weight_kg),
        age: ageNum,
        biological_sex: profile.biological_sex,
        health_goal: profile.health_goal,
        physical_activity_level: profile.physical_activity_level,
      })
      .eq('id', user.id);

    setSavingProfile(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setSavedProfile({ ...profile });
      Alert.alert('Saved', 'Profile updated successfully.');
    }
  }

  async function handleDeleteFood(foodId: string) {
    Alert.alert('Delete Food', 'Are you sure you want to delete this food?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('favourite_foods')
            .delete()
            .eq('id', foodId);
          if (error) {
            Alert.alert('Error', error.message);
          } else {
            setFavouriteFoods(prev => prev.filter(f => f.id !== foodId));
          }
        },
      },
    ]);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (loadingProfile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>User Profile</Text>
      <Text style={styles.pageSubtitle}>Manage your profile and preferences</Text>

      {/* Personal Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Personal Details</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={profile.name}
          onChangeText={v => setProfile(p => ({ ...p, name: v }))}
          placeholder="Your name"
          placeholderTextColor="#9CA3AF"
        />

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>Height (cm)</Text>
            <TextInput
              style={styles.input}
              value={profile.height_cm}
              onChangeText={v => setProfile(p => ({ ...p, height_cm: v }))}
              placeholder="e.g. 170"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>Weight (kg)</Text>
            <TextInput
              style={styles.input}
              value={profile.weight_kg}
              onChangeText={v => setProfile(p => ({ ...p, weight_kg: v }))}
              placeholder="e.g. 70"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>Age</Text>
            <TextInput
              style={styles.input}
              value={profile.age}
              onChangeText={v => setProfile(p => ({ ...p, age: v }))}
              placeholder="e.g. 30"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>Biological Sex</Text>
            <DropdownButton
              label="Select..."
              value={profile.biological_sex ? SEX_OPTIONS[['male', 'female'].indexOf(profile.biological_sex)] : ''}
              onPress={() => showPicker(SEX_OPTIONS, v =>
                setProfile(p => ({ ...p, biological_sex: v.toLowerCase() }))
              )}
            />
          </View>
        </View>

        <Text style={styles.label}>Health Goal</Text>
        <DropdownButton
          label="Select..."
          value={profile.health_goal ? GOAL_OPTIONS[GOAL_VALUES.indexOf(profile.health_goal)] : ''}
          onPress={() => showPicker(GOAL_OPTIONS, v =>
            setProfile(p => ({ ...p, health_goal: GOAL_VALUES[GOAL_OPTIONS.indexOf(v)] }))
          )}
        />

        <Text style={styles.label}>Physical Activity Level</Text>
        <DropdownButton
          label="Select..."
          value={profile.physical_activity_level ? ACTIVITY_OPTIONS[ACTIVITY_VALUES.indexOf(profile.physical_activity_level)] : ''}
          onPress={() => showPicker(ACTIVITY_OPTIONS, v =>
            setProfile(p => ({ ...p, physical_activity_level: ACTIVITY_VALUES[ACTIVITY_OPTIONS.indexOf(v)] }))
          )}
        />

        <Text style={styles.hint}>
          These details are used for TDEE calculation and personalised nutrition recommendations.
        </Text>

        {isDirty && (
          <TouchableOpacity
            style={[styles.button, savingProfile && styles.buttonDisabled]}
            onPress={handleSaveProfile}
            disabled={savingProfile}>
            {savingProfile ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Favourite Foods */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Favourite Foods</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/food-form')}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.addButtonText}>Add New</Text>
          </TouchableOpacity>
        </View>

        {favouriteFoods.length === 0 ? (
          <Text style={styles.emptyText}>No favourite foods yet. Add one to get started.</Text>
        ) : (
          favouriteFoods.map(food => (
            <View key={food.id} style={styles.foodCard}>
              <View style={styles.foodHeader}>
                <Text style={styles.foodName}>{food.name}</Text>
                <View style={styles.foodActions}>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/food-form', params: { foodId: food.id, foodName: food.name } })}
                    style={styles.iconButton}>
                    <Ionicons name="pencil-outline" size={18} color="#6B7280" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteFood(food.id)}
                    style={styles.iconButton}>
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.nutritionRow}>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionLabel}>Calories</Text>
                  <Text style={styles.nutritionValue}>{food.calories}</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionLabel}>Protein</Text>
                  <Text style={styles.nutritionValue}>{food.protein}g</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionLabel}>Carbs</Text>
                  <Text style={styles.nutritionValue}>{food.carbs}g</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionLabel}>Fat</Text>
                  <Text style={styles.nutritionValue}>{food.fat}g</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionLabel}>Fiber</Text>
                  <Text style={styles.nutritionValue}>{food.fiber}g</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={18} color="#EF4444" />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  content: {
    padding: 16,
    paddingTop: 60,
    paddingBottom: 40,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 24,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#F9FAFB',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  hint: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 18,
  },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },
  foodCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  foodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  foodName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  foodActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    padding: 4,
  },
  nutritionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  nutritionItem: {
    alignItems: 'center',
  },
  nutritionLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 2,
  },
  nutritionValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    marginBottom: 16,
  },
  logoutText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '600',
  },
});
