// Powered by OnSpace.AI
// Open job queue for a worker's tenant. Accepting a job races against
// other workers via the `worker_user_id is null` guard in acceptOrder —
// only one of them wins.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/contexts/TenantContext';
import { useAlert } from '@/template';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { acceptOrder, listOpenOrders, subscribeToOpenOrders } from '@/services/workerService';
import { setOnlineStatus } from '@/services/membershipService';
import { spacing, radius, fontSize, fontWeight, shadow, type lightColors } from '@/constants/theme';
import { APP_CONFIG } from '@/constants/config';
import type { Order } from '@/services/types';

export default function WorkerJobs() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { activeMembership, refresh } = useTenant();
  const { showAlert } = useAlert();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [jobs, setJobs] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!activeMembership) return;
    setLoading(true);
    listOpenOrders(activeMembership.tenantId)
      .then(setJobs)
      .finally(() => setLoading(false));
  }, [activeMembership]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!activeMembership) return;
    return subscribeToOpenOrders(activeMembership.tenantId, load);
  }, [activeMembership, load]);

  const onToggleOnline = async (value: boolean) => {
    if (!activeMembership) return;
    await setOnlineStatus(activeMembership.id, value);
    await refresh();
  };

  const onAccept = async (order: Order) => {
    if (!user) return;
    setAccepting(order.id);
    const result = await acceptOrder(order.id, user.id);
    setAccepting(null);
    if (!result) {
      showAlert(t('worker.jobs.tooLate'), t('worker.jobs.tooLateMsg'));
      load();
      return;
    }
    router.push('/(worker)/active');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('worker.jobs.title')}</Text>
        <View style={styles.onlineRow}>
          <Text style={styles.onlineLabel}>{activeMembership?.isOnline ? t('worker.jobs.online') : t('worker.jobs.offline')}</Text>
          <Switch
            value={!!activeMembership?.isOnline}
            onValueChange={onToggleOnline}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
      </View>

      {!loading && jobs.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="car-wash" size={56} color={colors.primary} />
          <Text style={styles.emptyTitle}>{t('worker.jobs.emptyTitle')}</Text>
          <Text style={styles.emptyText}>{t('worker.jobs.emptyText')}</Text>
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(o) => o.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          renderItem={({ item }) => (
            <Card style={styles.jobCard}>
              <View style={styles.jobHeader}>
                <Text style={styles.jobWash}>{item.washTypeName}</Text>
                <Text style={styles.jobPrice}>
                  {item.priceEgp} {APP_CONFIG.currency}
                </Text>
              </View>
              <View style={styles.jobRow}>
                <MaterialCommunityIcons name="map-marker" size={16} color={colors.textMuted} />
                <Text style={styles.jobAddress} numberOfLines={1}>
                  {item.location.address}
                </Text>
              </View>
              <Button
                title={t('worker.jobs.accept')}
                icon="check"
                loading={accepting === item.id}
                onPress={() => onAccept(item)}
                style={{ marginTop: spacing.sm }}
              />
            </Card>
          )}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
    title: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.text },
    onlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    onlineLabel: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold, color: colors.textSubtle },
    list: { gap: spacing.sm },
    jobCard: { ...shadow.soft },
    jobHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    jobWash: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: colors.text },
    jobPrice: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: colors.primaryDark },
    jobRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    jobAddress: { fontSize: fontSize.caption, color: colors.textSubtle, flex: 1 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingBottom: 80 },
    emptyTitle: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.semibold, color: colors.text },
    emptyText: { fontSize: fontSize.body, color: colors.textSubtle, textAlign: 'center', paddingHorizontal: spacing.xl },
  });
