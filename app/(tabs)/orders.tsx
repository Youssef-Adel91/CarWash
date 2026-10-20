// Powered by OnSpace.AI
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { OrderCard } from '@/components/feature/OrderCard';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useOrders } from '@/hooks/useOrders';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getMyOrderHistory } from '@/services/orderService';
import { getWorkerDisplayInfo } from '@/services/workerService';
import { spacing, radius, fontSize, fontWeight, shadow, type lightColors } from '@/constants/theme';
import { APP_CONFIG } from '@/constants/config';
import type { Order, Worker } from '@/services/types';

export default function Orders() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { orders } = useOrders();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [history, setHistory] = useState<Order[]>([]);
  const [workers, setWorkers] = useState<Record<string, Worker | null>>({});

  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }
    let active = true;
    getMyOrderHistory(user.id, 10)
      .then((list) => {
        if (active) setHistory(list);
      })
      .catch(() => {
        if (active) setHistory([]);
      });
    return () => {
      active = false;
    };
  }, [user]);

  // Resolve worker display info per past order after the list loads, so
  // fetching them doesn't block the initial render (N+1 avoided from the
  // service layer — this is purely a UI-side lazy batch).
  useEffect(() => {
    const withWorker = history.filter((o) => o.workerUserId);
    if (withWorker.length === 0) return;
    let active = true;
    Promise.all(
      withWorker.map((o) =>
        getWorkerDisplayInfo(o.tenantId, o.workerUserId as string)
          .then((worker) => [o.id, worker] as const)
          .catch(() => [o.id, null] as const),
      ),
    ).then((pairs) => {
      if (!active) return;
      setWorkers((prev) => {
        const next = { ...prev };
        for (const [id, worker] of pairs) next[id] = worker;
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [history]);

  const onReorder = (order: Order) => {
    router.push({ pathname: '/(tabs)', params: { tenantId: order.tenantId, washTypeId: order.washTypeId } });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.title}>{t('orders.title')}</Text>

      {orders.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <MaterialCommunityIcons name="car-wash" size={56} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>{t('orders.emptyTitle')}</Text>
          <Text style={styles.emptyText}>{t('orders.emptyText')}</Text>
          <View style={styles.emptyBtn}>
            <Button title={t('orders.requestWash')} icon="plus" onPress={() => router.push('/(tabs)')} />
          </View>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <OrderCard order={item} onPress={() => router.push(`/order/${item.id}`)} />
          )}
          ListHeaderComponent={
            history.length > 0 ? (
              <View style={styles.pastSection}>
                <Text style={styles.pastTitle}>{t('orders.pastOrders')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pastList}>
                  {history.map((item) => {
                    const worker = item.workerUserId ? workers[item.id] : undefined;
                    return (
                      <Card key={item.id} style={styles.pastCard}>
                        <Text style={styles.pastWash} numberOfLines={1}>
                          {item.washTypeName}
                        </Text>
                        <Text style={styles.pastDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                        <Text style={styles.pastPrice}>
                          {item.priceEgp} {APP_CONFIG.currency}
                        </Text>
                        <View style={styles.pastWorkerRow}>
                          <MaterialCommunityIcons name="account-outline" size={13} color={colors.textMuted} />
                          <Text style={styles.pastWorkerText} numberOfLines={1}>
                            {item.workerUserId ? (worker ? worker.name : t('common.loading')) : t('common.dash')}
                          </Text>
                          {worker ? (
                            <View style={styles.pastRatingRow}>
                              <MaterialCommunityIcons name="star" size={11} color={colors.warning} />
                              <Text style={styles.pastRatingText}>{worker.rating.toFixed(1)}</Text>
                            </View>
                          ) : null}
                        </View>
                        <Pressable onPress={() => onReorder(item)} style={styles.orderAgainBtn} hitSlop={6}>
                          <MaterialCommunityIcons name="refresh" size={14} color={colors.textOnPrimary} />
                          <Text style={styles.orderAgainText}>{t('common.orderAgain')}</Text>
                        </Pressable>
                      </Card>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
    title: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.md },
    list: { gap: spacing.sm },
    pastSection: { marginBottom: spacing.md, gap: spacing.sm },
    pastTitle: { fontSize: fontSize.section, fontWeight: fontWeight.semibold, color: colors.text },
    pastList: { gap: spacing.sm, paddingRight: spacing.md },
    pastCard: { width: 180, gap: 4, ...shadow.soft },
    pastWash: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: colors.text },
    pastDate: { fontSize: 11, color: colors.textMuted },
    pastPrice: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: colors.primaryDark, marginTop: 2 },
    pastWorkerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    pastWorkerText: { fontSize: 11, color: colors.textSubtle, flex: 1 },
    pastRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    pastRatingText: { fontSize: 11, color: colors.warning, fontWeight: fontWeight.semibold },
    orderAgainBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: colors.primary,
      borderRadius: radius.sm,
      paddingVertical: 8,
      marginTop: spacing.xs,
    },
    orderAgainText: { color: colors.textOnPrimary, fontSize: fontSize.caption, fontWeight: fontWeight.semibold },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingBottom: 80 },
    emptyIcon: {
      width: 110,
      height: 110,
      borderRadius: 55,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    emptyTitle: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.semibold, color: colors.text },
    emptyText: { fontSize: fontSize.body, color: colors.textSubtle, textAlign: 'center' },
    emptyBtn: { marginTop: spacing.md, alignSelf: 'stretch', paddingHorizontal: spacing.xl },
  });
