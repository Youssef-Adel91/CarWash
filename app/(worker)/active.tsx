// Powered by OnSpace.AI
// The worker's current job: advance its status and broadcast live GPS so
// the customer's tracking screen updates in real time.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { OrderStatusBadge } from '@/components/feature/OrderStatusBadge';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/contexts/TenantContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getMyActiveOrder, pushLocation, setOrderStatus } from '@/services/workerService';
import { spacing, fontSize, fontWeight, type lightColors } from '@/constants/theme';
import { APP_CONFIG } from '@/constants/config';
import type { Order, OrderStatus } from '@/services/types';

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  accepted: 'on_the_way',
  on_the_way: 'washing',
  washing: 'completed',
};

const NEXT_LABEL_KEY: Partial<Record<OrderStatus, 'onTheWay' | 'startWashing' | 'markCompleted'>> = {
  accepted: 'onTheWay',
  on_the_way: 'startWashing',
  washing: 'markCompleted',
};

export default function WorkerActive() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { activeMembership } = useTenant();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [order, setOrder] = useState<Order | null>(null);
  const [updating, setUpdating] = useState(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setOrder(await getMyActiveOrder(user.id));
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Broadcast GPS every ~5s while a job is in progress (not just 'accepted',
  // so the customer sees the worker moving on the map).
  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!order || !activeMembership || !user) return;
      if (!['accepted', 'on_the_way', 'washing'].includes(order.status)) return;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;

      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 15 },
        (pos) => {
          pushLocation({
            orderId: order.id,
            tenantId: activeMembership.tenantId,
            workerUserId: user.id,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
      );
    }
    start();

    return () => {
      cancelled = true;
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, [order?.id, order?.status, activeMembership, user]);

  const onAdvance = async () => {
    if (!order) return;
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    setUpdating(true);
    const updated = await setOrderStatus(order.id, next);
    setUpdating(false);
    if (updated) setOrder(updated);
    if (next === 'completed') setTimeout(load, 500);
  };

  if (!order) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <MaterialCommunityIcons name="car-wash" size={56} color={colors.textMuted} />
        <Text style={styles.emptyText}>{t('worker.active.empty')}</Text>
      </View>
    );
  }

  const nextLabelKey = NEXT_LABEL_KEY[order.status];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.md, paddingTop: insets.top + spacing.md, gap: spacing.md }}
    >
      <Text style={styles.title}>{t('worker.active.title')}</Text>

      <Card style={{ gap: spacing.sm }}>
        <View style={styles.rowBetween}>
          <Text style={styles.wash}>{order.washTypeName}</Text>
          <OrderStatusBadge status={order.status} />
        </View>
        <View style={styles.row}>
          <MaterialCommunityIcons name="map-marker" size={18} color={colors.primary} />
          <Text style={styles.address}>{order.location.address}</Text>
        </View>
        <View style={styles.row}>
          <MaterialCommunityIcons name="cash" size={18} color={colors.primaryDark} />
          <Text style={styles.price}>
            {order.priceEgp} {APP_CONFIG.currency}
          </Text>
        </View>
      </Card>

      {nextLabelKey ? (
        <Button title={t(`worker.active.${nextLabelKey}`)} icon="arrow-right-circle" loading={updating} onPress={onAdvance} />
      ) : (
        <Card style={styles.doneCard}>
          <MaterialCommunityIcons name="check-circle" size={22} color={colors.success} />
          <Text style={styles.doneText}>{t('worker.active.done')}</Text>
        </Card>
      )}
    </ScrollView>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl },
    title: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.text },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    wash: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.semibold, color: colors.text },
    address: { fontSize: fontSize.body, color: colors.textSubtle, flex: 1 },
    price: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: colors.primaryDark },
    emptyText: { fontSize: fontSize.body, color: colors.textSubtle, textAlign: 'center' },
    doneCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    doneText: { fontSize: fontSize.body, color: colors.text, fontWeight: fontWeight.medium },
  });
