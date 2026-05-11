import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { calculateTDEE, calculateMacros } from '@/lib/tdee';

type DayStatus = 'green' | 'orange' | 'red' | 'grey';

type DayData = {
  status: DayStatus;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  target: number;
  reason: string;
};

const STATUS_COLORS: Record<DayStatus, string> = {
  green: '#16A34A',
  orange: '#F59E0B',
  red: '#EF4444',
  grey: '#9CA3AF',
};

const STATUS_LABELS: Record<DayStatus, string> = {
  green: 'Needs met',
  orange: 'Slightly off',
  red: 'Needs missed',
  grey: 'No data',
};

type MacroTotals = { calories: number; protein: number; carbs: number; fat: number; fiber: number };

const FIBER_TARGET_G = 25;

function getDayStatus(consumed: MacroTotals, target: MacroTotals): { status: DayStatus; reason: string } {
  if (target.calories === 0 || consumed.calories === 0) return { status: 'grey', reason: 'No data logged.' };

  const checks = [
    { label: 'Calories', ratio: consumed.calories / target.calories, consumed: Math.round(consumed.calories), target: Math.round(target.calories), unit: 'kcal' },
    { label: 'Protein',  ratio: target.protein  > 0 ? consumed.protein  / target.protein  : 1, consumed: Math.round(consumed.protein),  target: Math.round(target.protein),  unit: 'g' },
    { label: 'Carbs',    ratio: target.carbs    > 0 ? consumed.carbs    / target.carbs    : 1, consumed: Math.round(consumed.carbs),    target: Math.round(target.carbs),    unit: 'g' },
    { label: 'Fat',      ratio: target.fat      > 0 ? consumed.fat      / target.fat      : 1, consumed: Math.round(consumed.fat),      target: Math.round(target.fat),      unit: 'g' },
    { label: 'Fiber',    ratio: consumed.fiber / FIBER_TARGET_G, consumed: Math.round(consumed.fiber), target: FIBER_TARGET_G, unit: 'g' },
  ];

  const offTrack = checks.filter(c => c.ratio < 0.9);
  const minRatio = Math.min(...checks.map(c => c.ratio));

  let status: DayStatus;
  if (minRatio >= 0.9) status = 'green';
  else if (minRatio >= 0.7) status = 'orange';
  else status = 'red';

  const reason = offTrack.length === 0
    ? `All targets met. Calories: ${checks[0].consumed} / ${checks[0].target} kcal.`
    : offTrack.map(c => `${c.label}: ${c.consumed} / ${c.target}${c.unit}`).join(' · ');

  return { status, reason };
}

function getMotivation(pct: number, goal: string): string {
  if (pct >= 80) return `You're on track ${Math.round(pct)}% of the time. Keep it up!`;
  if (pct >= 50) return `You're on track ${Math.round(pct)}% of the time. Small improvements add up!`;
  return `You're on track ${Math.round(pct)}% of the time. Every day is a new opportunity!`;
}

export default function CalendarScreen() {
  const [markedDates, setMarkedDates] = useState<Record<string, any>>({});
  const [dayDataMap, setDayDataMap] = useState<Record<string, DayData>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [stats, setStats] = useState({ daysLogged: 0, daysOnTrack: 0, pct: 0 });
  const [motivationText, setMotivationText] = useState('');
  const [healthGoal, setHealthGoal] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadCalendarData();
    }, [])
  );

  async function loadCalendarData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile) { setLoading(false); return; }

    setHealthGoal(profile.health_goal || '');
    const tdee = calculateTDEE(profile);
    const macros = calculateMacros(tdee, profile.health_goal, profile.weight_kg);

    const { data: meals } = await supabase
      .from('meals')
      .select('date, calories, protein, carbs, fat, fiber')
      .eq('user_id', user.id);

    if (!meals?.length) { setLoading(false); return; }

    // Group meals by date
    const byDate: Record<string, { calories: number; protein: number; carbs: number; fat: number; fiber: number }> = {};
    meals.forEach(m => {
      if (!byDate[m.date]) byDate[m.date] = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
      byDate[m.date].calories += m.calories;
      byDate[m.date].protein += m.protein;
      byDate[m.date].carbs += m.carbs;
      byDate[m.date].fat += m.fat;
      byDate[m.date].fiber += m.fiber || 0;
    });

    const marked: Record<string, any> = {};
    const dayData: Record<string, DayData> = {};
    let daysLogged = 0;
    let daysOnTrack = 0;

    Object.entries(byDate).forEach(([date, data]) => {
      const { status, reason } = getDayStatus(data, { ...macros, fiber: FIBER_TARGET_G });
      const color = STATUS_COLORS[status];
      daysLogged++;
      if (status === 'green') daysOnTrack++;

      marked[date] = {
        customStyles: {
          container: { backgroundColor: color, borderRadius: 8 },
          text: { color: '#fff', fontWeight: '600' },
        },
      };

      dayData[date] = {
        status,
        calories: Math.round(data.calories),
        protein: Math.round(data.protein),
        carbs: Math.round(data.carbs),
        fat: Math.round(data.fat),
        fiber: Math.round(data.fiber),
        target: macros.calories,
        reason,
      };
    });

    const pct = daysLogged > 0 ? (daysOnTrack / daysLogged) * 100 : 0;
    setMarkedDates(marked);
    setDayDataMap(dayData);
    setStats({ daysLogged, daysOnTrack, pct });
    setMotivationText(getMotivation(pct, profile.health_goal));
    setLoading(false);
  }

  const selectedDayData = selectedDay ? dayDataMap[selectedDay] : null;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Nutrition Calendar</Text>
      <Text style={styles.subtitle}>Track your daily nutrition progress</Text>

      <Calendar
        markingType="custom"
        markedDates={markedDates}
        onDayPress={day => {
          if (dayDataMap[day.dateString]) setSelectedDay(day.dateString);
        }}
        theme={{
          backgroundColor: '#fff',
          calendarBackground: '#fff',
          textSectionTitleColor: '#6B7280',
          selectedDayBackgroundColor: '#2563EB',
          todayTextColor: '#2563EB',
          dayTextColor: '#111827',
          arrowColor: '#2563EB',
          monthTextColor: '#111827',
          textDayFontWeight: '500',
          textMonthFontWeight: 'bold',
          textDayHeaderFontWeight: '600',
        }}
        style={styles.calendar}
      />

      {/* Colour key */}
      <View style={styles.keyCard}>
        {(Object.entries(STATUS_LABELS) as [DayStatus, string][]).map(([status, label]) => (
          <View key={status} style={styles.keyRow}>
            <View style={[styles.keyDot, { backgroundColor: STATUS_COLORS[status] }]} />
            <Text style={styles.keyLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Stats */}
      <View style={styles.statsCard}>
        <View style={styles.statsRow}>
          <Ionicons name="bar-chart-outline" size={32} color="#2563EB" />
          <View style={styles.statsText}>
            <Text style={styles.statsHeadline}>{motivationText}</Text>
          </View>
        </View>
        <View style={styles.statsFigures}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.daysLogged}</Text>
            <Text style={styles.statLabel}>Days logged</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.daysOnTrack}</Text>
            <Text style={styles.statLabel}>Days on track</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{Math.round(stats.pct)}%</Text>
            <Text style={styles.statLabel}>On track rate</Text>
          </View>
        </View>
      </View>

      {/* Day detail modal */}
      <Modal
        visible={!!selectedDay}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedDay(null)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedDay(null)}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalDate}>{selectedDay}</Text>
              <TouchableOpacity onPress={() => setSelectedDay(null)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            {selectedDayData && (
              <>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[selectedDayData.status] }]}>
                  <Text style={styles.statusBadgeText}>{STATUS_LABELS[selectedDayData.status]}</Text>
                </View>
                <Text style={styles.modalReason}>{selectedDayData.reason}</Text>
                <View style={styles.modalMacros}>
                  {[
                    { label: 'Calories', value: `${selectedDayData.calories} kcal` },
                    { label: 'Protein', value: `${selectedDayData.protein}g` },
                    { label: 'Carbs', value: `${selectedDayData.carbs}g` },
                    { label: 'Fat', value: `${selectedDayData.fat}g` },
                  ].map(m => (
                    <View key={m.label} style={styles.modalMacroItem}>
                      <Text style={styles.modalMacroLabel}>{m.label}</Text>
                      <Text style={styles.modalMacroValue}>{m.value}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: 16, paddingTop: 60, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6B7280', marginBottom: 16, marginTop: 2 },
  calendar: {
    borderRadius: 12,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  keyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keyDot: { width: 12, height: 12, borderRadius: 6 },
  keyLabel: { fontSize: 13, color: '#374151' },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  statsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  statsText: { flex: 1 },
  statsHeadline: { fontSize: 14, color: '#111827', lineHeight: 20 },
  statsFigures: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: 'bold', color: '#2563EB' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalDate: { fontSize: 16, fontWeight: '600', color: '#111827' },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  statusBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  modalReason: { fontSize: 14, color: '#374151', marginBottom: 16, lineHeight: 20 },
  modalMacros: { flexDirection: 'row', justifyContent: 'space-between' },
  modalMacroItem: { alignItems: 'center' },
  modalMacroLabel: { fontSize: 11, color: '#6B7280', marginBottom: 2 },
  modalMacroValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
});
