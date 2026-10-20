// Powered by OnSpace.AI
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { useTenant } from '@/contexts/TenantContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getOrdersForTenant } from '@/services/orderService';
import { getPaymentsByTenant } from '@/services/paymentService';
import { spacing, radius, fontSize, fontWeight, type lightColors } from '@/constants/theme';
import { APP_CONFIG } from '@/constants/config';
import type { Order } from '@/services/types';

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const { activeMembership } = useTenant();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [revenueTotal, setRevenueTotal] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!activeMembership) return;
      getOrdersForTenant(activeMembership.tenantId).then(setOrders);
      getPaymentsByTenant(activeMembership.tenantId).then((payments) => {
        setRevenueTotal(payments.filter((p) => p.status === 'succeeded').reduce((sum, p) => sum + p.amountEgp, 0));
      });
    }, [activeMembership]),
  );

  const todayOrders = orders.filter((o) => isToday(o.createdAt));
  const pending = orders.filter((o) => o.status === 'pending').length;
  const active = orders.filter((o) => ['accepted', 'on_the_way', 'washing'].includes(o.status)).length;
  const completed = orders.filter((o) => o.status === 'completed').length;

  const stats = [
    { label: t('admin.dashboard.ordersToday'), value: todayOrders.length, icon: 'calendar-today' as const },
    { label: t('admin.dashboard.awaitingWorker'), value: pending, icon: 'clock-alert-outline' as const },
    { label: t('admin.dashboard.inProgress'), value: active, icon: 'car-wash' as const },
    { label: t('admin.dashboard.completed'), value: completed, icon: 'check-circle-outline' as const },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.md, paddingTop: insets.top + spacing.md, gap: spacing.md }}
    >
      <Text style={styles.title}>{activeMembership?.tenantName}</Text>
      <Text style={styles.subtitle}>{t('admin.dashboard.subtitle')}</Text>

      <Card style={styles.revenueCard}>
        <MaterialCommunityIcons name="cash-multiple" size={30} color="#fff" />
        <View>
          <Text style={styles.revenueLabel}>{t('admin.dashboard.totalRevenue')}</Text>
          <Text style={styles.revenueValue}>
            {revenueTotal} {APP_CONFIG.currency}
          </Text>
        </View>
      </Card>

      <View style={styles.grid}>
        {stats.map((s) => (
          <Card key={s.label} style={styles.statCard}>
            <MaterialCommunityIcons name={s.icon} size={22} color={colors.primary} />
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </Card>
        ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    title: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.text },
    subtitle: { fontSize: fontSize.caption, color: colors.textSubtle, marginTop: -4 },
    revenueCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.primaryDark,
    },
    revenueLabel: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.caption },
    revenueValue: { color: '#fff', fontSize: fontSize.title, fontWeight: fontWeight.bold },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    statCard: { width: '47%', gap: 4 },
    statValue: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.text },
    statLabel: { fontSize: fontSize.caption, color: colors.textSubtle },
  });
