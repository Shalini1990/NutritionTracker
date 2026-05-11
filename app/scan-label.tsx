import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { scanStore } from '@/lib/scanStore';

const VISION_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_CLOUD_VISION_API_KEY!;

function limitDecimals(v: string): string {
  const normalized = v.replace(',', '.');
  const match = normalized.match(/^\d*\.?\d{0,2}/);
  return match ? match[0] : '';
}

type Nutrition = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

function parseNutritionFromText(text: string): Nutrition {
  // Normalise German decimal commas (e.g. "3,5 g" → "3.5 g") before parsing
  const t = text.toLowerCase().replace(/(\d),(\d)/g, '$1.$2');

  function extract(patterns: RegExp[]): number {
    for (const pattern of patterns) {
      const match = t.match(pattern);
      if (match) return parseFloat(match[1]);
    }
    return 0;
  }

  return {
    calories: extract([
      /\bcalories\b[\s:]+(\d+\.?\d*)/,
      /\benergy\b[\s\S]{0,20}?(\d+\.?\d*)\s*kcal/,
      /(\d+\.?\d*)\s*kcal/,
      /\bcalories\b[\s\S]{0,10}?(\d+\.?\d*)/,
      // German
      /\bbrennwert\b[\s\S]{0,20}?(\d+\.?\d*)\s*kcal/,
      /\benergie\b[\s\S]{0,20}?(\d+\.?\d*)\s*kcal/,
    ]),
    protein: extract([
      /protein[\s:]+(\d+\.?\d*)/,
      /proteins[\s:]+(\d+\.?\d*)/,
      // German
      /\beiweiß\b[\s:]+(\d+\.?\d*)/,
      /\bprotein\b[\s:]+(\d+\.?\d*)/,
    ]),
    carbs: extract([
      /total carbohydrate[s]?[\s:]+(\d+\.?\d*)/,
      /carbohydrate[s]?[\s:]+(\d+\.?\d*)/,
      /carbs[\s:]+(\d+\.?\d*)/,
      /of which sugars[\s:]+(\d+\.?\d*)/,
      // German
      /kohlenhydrate[\s:]+(\d+\.?\d*)/,
      /\bdavon zucker[\s:]+(\d+\.?\d*)/,
    ]),
    fat: extract([
      /total fat[\s:]+(\d+\.?\d*)/,
      /fat[\s:]+(\d+\.?\d*)/,
      /fats[\s:]+(\d+\.?\d*)/,
      // German
      /\bfett\b[\s:]+(\d+\.?\d*)/,
      /\bdavon gesättigte fettsäuren[\s:]+(\d+\.?\d*)/,
    ]),
    fiber: extract([
      /dietary fibre[\s:]+(\d+\.?\d*)/,
      /dietary fiber[\s:]+(\d+\.?\d*)/,
      /fibre[\s:]+(\d+\.?\d*)/,
      /fiber[\s:]+(\d+\.?\d*)/,
      // German
      /ballaststoffe[\s:]+(\d+\.?\d*)/,
    ]),
  };
}

async function runOCR(base64Image: string): Promise<string> {
  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: base64Image },
          features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
        }],
      }),
    }
  );
  const data = await res.json();
  return data.responses?.[0]?.fullTextAnnotation?.text || '';
}

export default function ScanLabelScreen() {
  const params = useLocalSearchParams<{ ingredientId: string }>();
  const [scanning, setScanning] = useState(false);
  const [nutrition, setNutrition] = useState<Nutrition | null>(null);
  const [rawText, setRawText] = useState('');
  const [displayValues, setDisplayValues] = useState<Record<string, string>>({});
  const [userEdited, setUserEdited] = useState(false);
  const [servingSize, setServingSize] = useState('100');
  const [portionEaten, setPortionEaten] = useState('100');

  async function handleScan() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Camera access is required to scan nutrition labels.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]?.base64) return;

    setScanning(true);
    try {
      const text = await runOCR(result.assets[0].base64);
      setRawText(text);
      const parsed = parseNutritionFromText(text);
      setNutrition(parsed);
      setDisplayValues({ calories: parsed.calories.toString(), protein: parsed.protein.toString(), carbs: parsed.carbs.toString(), fat: parsed.fat.toString(), fiber: parsed.fiber.toString() });
    } catch (e) {
      Alert.alert('Error', 'Failed to read the label. Please try again.');
    }
    setScanning(false);
  }

  async function handlePickFromGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Photo library access is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      base64: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]?.base64) return;

    setScanning(true);
    try {
      const text = await runOCR(result.assets[0].base64);
      setRawText(text);
      const parsed = parseNutritionFromText(text);
      setNutrition(parsed);
      setDisplayValues({ calories: parsed.calories.toString(), protein: parsed.protein.toString(), carbs: parsed.carbs.toString(), fat: parsed.fat.toString(), fiber: parsed.fiber.toString() });
    } catch (e) {
      Alert.alert('Error', 'Failed to read the label. Please try again.');
    }
    setScanning(false);
  }

  function handleConfirm() {
    if (!nutrition) return;
    const scale = parseFloat(portionEaten) / (parseFloat(servingSize) || 100);
    const s = isNaN(scale) || scale <= 0 ? 1 : scale;
    scanStore.setResult({
      ingredientId: params.ingredientId,
      calories: Math.round(nutrition.calories * s),
      protein: Math.round(nutrition.protein * s * 10) / 10,
      carbs: Math.round(nutrition.carbs * s * 10) / 10,
      fat: Math.round(nutrition.fat * s * 10) / 10,
      fiber: Math.round(nutrition.fiber * s * 10) / 10,
      userEdited,
      portionEaten,
    });
    router.back();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="close" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>Scan Nutrition Label</Text>
        <View style={{ width: 32 }} />
      </View>

      <Text style={styles.subtitle}>
        Take a clear photo of the nutrition facts panel on the packaging.
      </Text>

      {/* Scan buttons */}
      {!nutrition && (
        <View style={styles.buttonGroup}>
          <TouchableOpacity style={styles.scanButton} onPress={handleScan} disabled={scanning}>
            <Ionicons name="camera" size={28} color="#fff" />
            <Text style={styles.scanButtonText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.galleryButton} onPress={handlePickFromGallery} disabled={scanning}>
            <Ionicons name="image-outline" size={24} color="#2563EB" />
            <Text style={styles.galleryButtonText}>Pick from Gallery</Text>
          </TouchableOpacity>
        </View>
      )}

      {scanning && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Reading nutrition label...</Text>
        </View>
      )}

      {/* Parsed results */}
      {nutrition && !scanning && (
        <View style={styles.resultsCard}>
          <Text style={styles.resultsTitle}>Scanned Nutrition Values</Text>
          <Text style={styles.resultsHint}>Edit any values if the scan was inaccurate.</Text>

          <View style={styles.portionRow}>
            <View style={styles.portionField}>
              <Text style={styles.portionLabel}>Label serving (g)</Text>
              <TextInput
                style={styles.fieldInput}
                value={servingSize}
                onChangeText={v => setServingSize(limitDecimals(v))}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.portionField}>
              <Text style={styles.portionLabel}>Your portion (g)</Text>
              <TextInput
                style={styles.fieldInput}
                value={portionEaten}
                onChangeText={v => setPortionEaten(limitDecimals(v))}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          {[
            { label: 'Calories', key: 'calories', unit: 'kcal' },
            { label: 'Protein', key: 'protein', unit: 'g' },
            { label: 'Carbs', key: 'carbs', unit: 'g' },
            { label: 'Fat', key: 'fat', unit: 'g' },
            { label: 'Fiber', key: 'fiber', unit: 'g' },
          ].map(field => (
            <View key={field.key} style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>{field.label} ({field.unit})</Text>
              <TextInput
                style={styles.fieldInput}
                value={displayValues[field.key] ?? nutrition[field.key as keyof Nutrition].toString()}
                onChangeText={v => {
                  const limited = limitDecimals(v);
                  setUserEdited(true);
                  setDisplayValues(prev => ({ ...prev, [field.key]: limited }));
                  setNutrition(prev => prev ? { ...prev, [field.key]: parseFloat(limited) || 0 } : prev);
                }}
                keyboardType="decimal-pad"
              />
            </View>
          ))}

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.rescanButton}
              onPress={() => { setNutrition(null); setRawText(''); setDisplayValues({}); setUserEdited(false); setServingSize('100'); setPortionEaten('100'); }}>
              <Text style={styles.rescanText}>Rescan</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
              <Text style={styles.confirmText}>Use These Values</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: 16, paddingTop: 60, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: { padding: 4 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 32, lineHeight: 20 },
  buttonGroup: { gap: 12 },
  scanButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  scanButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  galleryButton: {
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
  },
  galleryButtonText: { color: '#2563EB', fontSize: 15, fontWeight: '600' },
  loadingBox: { alignItems: 'center', gap: 12, marginTop: 40 },
  loadingText: { color: '#6B7280', fontSize: 15 },
  resultsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  resultsTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 4 },
  resultsHint: { fontSize: 13, color: '#6B7280', marginBottom: 16 },
  portionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  portionField: { flex: 1, alignItems: 'flex-start', gap: 6 },
  portionLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  fieldLabel: { fontSize: 14, color: '#374151', flex: 1 },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 8,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#F9FAFB',
    width: 90,
    textAlign: 'right',
  },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  rescanButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  rescanText: { color: '#374151', fontSize: 14, fontWeight: '600' },
  confirmButton: {
    flex: 2,
    backgroundColor: '#2563EB',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
