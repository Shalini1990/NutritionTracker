import { useState } from 'react';
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
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

const SEX_OPTIONS = ['Male', 'Female'];
const SEX_VALUES = ['male', 'female'];

const GOAL_OPTIONS = ['Weight Loss', 'Gut Health', 'Weight Gain', 'Muscle Build', 'Reduce Fat'];
const GOAL_VALUES = ['weight_loss', 'gut_health', 'weight_gain', 'muscle_build', 'reduce_fat'];

const ACTIVITY_OPTIONS = ['Not So Active', 'Fairly Active', 'Active'];
const ACTIVITY_VALUES = ['not_so_active', 'fairly_active', 'active'];

function DropdownButton({ label, placeholder, onPress }: { label: string; placeholder: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.dropdown} onPress={onPress}>
      <Text style={label ? styles.dropdownValue : styles.dropdownPlaceholder}>
        {label || placeholder}
      </Text>
      <Ionicons name="chevron-down" size={16} color="#6B7280" />
    </TouchableOpacity>
  );
}

export default function OnboardingScreen() {
  const [name, setName] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [age, setAge] = useState('');
  const [biologicalSex, setBiologicalSex] = useState('');
  const [healthGoal, setHealthGoal] = useState('');
  const [activityLevel, setActivityLevel] = useState('');
  const [loading, setLoading] = useState(false);

  function showPicker(options: string[], values: string[], onSelect: (v: string) => void) {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [...options, 'Cancel'], cancelButtonIndex: options.length },
      idx => { if (idx < options.length) onSelect(values[idx]); }
    );
  }

  async function handleComplete() {
    if (!name || !heightCm || !weightKg || !age || !biologicalSex || !healthGoal || !activityLevel) {
      Alert.alert('Required', 'Please fill in all fields before continuing.');
      return;
    }

    const ageNum = parseInt(age);
    if (isNaN(ageNum) || ageNum < 0 || ageNum > 110) {
      Alert.alert('Invalid Age', 'Please enter a valid age between 0 and 110.');
      return;
    }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      Alert.alert('Error', 'Session expired. Please log in again.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.from('profiles').insert({
      id: user.id,
      name,
      height_cm: parseFloat(heightCm),
      weight_kg: parseFloat(weightKg),
      age: ageNum,
      biological_sex: biologicalSex,
      health_goal: healthGoal,
      physical_activity_level: activityLevel,
    });

    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    router.replace('/(tabs)');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Welcome! Let's Set Up Your Profile</Text>
      <Text style={styles.subtitle}>
        Complete your profile to get personalised nutrition recommendations
      </Text>

      <Text style={styles.label}>Name *</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter your name"
        placeholderTextColor="#9CA3AF"
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>Height (cm) *</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 170"
        placeholderTextColor="#9CA3AF"
        value={heightCm}
        onChangeText={setHeightCm}
        keyboardType="numeric"
      />

      <Text style={styles.label}>Weight (kg) *</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 70"
        placeholderTextColor="#9CA3AF"
        value={weightKg}
        onChangeText={setWeightKg}
        keyboardType="numeric"
      />

      <Text style={styles.label}>Age *</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 30"
        placeholderTextColor="#9CA3AF"
        value={age}
        onChangeText={setAge}
        keyboardType="numeric"
      />

      <Text style={styles.label}>Biological Sex *</Text>
      <DropdownButton
        label={biologicalSex ? SEX_OPTIONS[SEX_VALUES.indexOf(biologicalSex)] : ''}
        placeholder="Select..."
        onPress={() => showPicker(SEX_OPTIONS, SEX_VALUES, setBiologicalSex)}
      />
      <Text style={styles.hint}>Used for TDEE calculation</Text>

      <Text style={styles.label}>Health Goal *</Text>
      <DropdownButton
        label={healthGoal ? GOAL_OPTIONS[GOAL_VALUES.indexOf(healthGoal)] : ''}
        placeholder="Select..."
        onPress={() => showPicker(GOAL_OPTIONS, GOAL_VALUES, setHealthGoal)}
      />

      <Text style={styles.label} style={{ marginTop: 16 }}>Physical Activity Level *</Text>
      <DropdownButton
        label={activityLevel ? ACTIVITY_OPTIONS[ACTIVITY_VALUES.indexOf(activityLevel)] : ''}
        placeholder="Select..."
        onPress={() => showPicker(ACTIVITY_OPTIONS, ACTIVITY_VALUES, setActivityLevel)}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleComplete}
        disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Complete Profile Setup</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 32, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    marginBottom: 16,
  },
  dropdownValue: { fontSize: 16, color: '#111827' },
  dropdownPlaceholder: { fontSize: 16, color: '#9CA3AF' },
  hint: { fontSize: 12, color: '#6B7280', marginBottom: 16, marginTop: -12 },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
