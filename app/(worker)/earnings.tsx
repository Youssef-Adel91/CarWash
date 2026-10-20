// Powered by OnSpace.AI
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getMyCompletedOrders } from '@/services/workerService';
import { spacing, fontSize, fontWeight, type lightColors } from '@/constants/theme';
import { APP_CONFIG } from '@/constants/config';
import type { Order } from '@/services/types';

export default function WorkerEarnings() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [orders, setOrders] = useState<Order[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (user) getMyCompletedOrders(user.id).then(setOrders);
    }, [user]),
  );

  const total = orders.reduce((sum, o) => sum + o.priceEgp, 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.title}>{t('worker.earnings.title')}</Text>

      <Card style={styles.summaryCard}>
        <MaterialCommunityIcons name="cash-multiple" size={28} color={colors.primary} />
        <View>
          <Text style={styles.summaryValue}>
            {total} {APP_CONFIG.currency}
          </Text>
          <Text style={styles.summaryLabel}>{t('worker.earnings.completedWashes', { count: orders.length })}</Text>
        </View>
      </Card>

      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        renderItem={({ item }) => (
          <Card style={styles.rowCard}>
            <View style={styles.flex}>
              <Text style={styles.washName}>{item.washTypeName}</Text>
              <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
            </View>
            <Text style={styles.amount}>
              +{item.priceEgp} {APP_CONFIG.currency}
            </Text>
          </Card>
        )}
      />
    </View>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
    title: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.md },
    summaryCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
    summaryValue: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.primaryDark },
    summaryLabel: { fontSize: fontSize.caption, color: colors.textSubtle, marginTop: 2 },
    flex: { flex: 1 },
    list: { gap: spacing.sm },
    rowCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    washName: { fontSize: fontSize.body, fontWeight: fontWeight.medium, color: colors.text },
    date: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
    amount: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: colors.success },
  });
