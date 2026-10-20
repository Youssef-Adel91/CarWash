// Powered by OnSpace.AI
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LiveMap } from '@/components/feature/LiveMap';
import { StatusTimeline } from '@/components/feature/StatusTimeline';
import { OrderStatusBadge } from '@/components/feature/OrderStatusBadge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useOrders } from '@/hooks/useOrders';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { distanceKm, getLatestLocation, getWorkerDisplayInfo, subscribeToLocation } from '@/services/workerService';
import { spacing, radius, fontSize, fontWeight, type lightColors } from '@/constants/theme';
import { APP_CONFIG } from '@/constants/config';
import type { TranslationKey } from '@/constants/translations';
import type { OrderStatus, Worker } from '@/services/types';

export default function OrderTracking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getById } = useOrders();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const order = getById(String(id));
  const [workerPos, setWorkerPos] = useState<{ latitude: number; longitude: number } | null>(null);
  const [worker, setWorker] = useState<Worker | null>(null);

  useEffect(() => {
    if (!order || order.status === 'pending' || order.status === 'cancelled') return;
    getLatestLocation(order.id).then((ping) => {
      if (ping) setWorkerPos({ latitude: ping.lat, longitude: ping.lng });
    });
    const unsubscribe = subscribeToLocation(order.id, (ping) => {
      setWorkerPos({ latitude: ping.lat, longitude: ping.lng });
    });
    return unsubscribe;
  }, [order?.id, order?.status]);

  useEffect(() => {
    if (!order?.workerUserId) {
      setWorker(null);
      return;
    }
    getWorkerDisplayInfo(order.tenantId, order.workerUserId).then(setWorker);
  }, [order?.workerUserId, order?.tenantId]);

  if (!order) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isCompleted = order.status === 'completed';
  const distance = workerPos ? distanceKm(order.location, workerPos) : null;
  const etaKey = order.status as OrderStatus;

  const onCall = () => {
    if (worker?.phone) Linking.openURL(`tel:${worker.phone}`);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('order.trackTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        <LiveMap height={240} center={order.location} workerLocation={workerPos} />

        <Card style={styles.etaCard}>
          <View style={styles.etaRow}>
            <View style={styles.pulse}>
              <MaterialCommunityIcons
                name={isCompleted ? 'check-circle' : 'car-wash'}
                size={22}
                color={isCompleted ? colors.success : colors.primary}
              />
            </View>
            <View style={styles.flex}>
              <Text style={styles.etaText}>{t(`order.eta.${etaKey}` as TranslationKey)}</Text>
              <Text style={styles.orderId}>
                {t('order.orderNumber', { id: order.id.slice(-6).toUpperCase() })}
                {distance !== null
                  ? ` • ${distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`} ${t('order.away')}`
                  : ''}
              </Text>
            </View>
            <OrderStatusBadge status={order.status} />
          </View>
        </Card>

        {worker ? (
          <Card style={styles.workerCard}>
            <View style={styles.workerAvatar}>
              <MaterialCommunityIcons name="account" size={26} color={colors.primaryDark} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.workerName}>{worker.name}</Text>
              <Text style={styles.workerVehicle}>{worker.vehicle}</Text>
            </View>
            <View style={styles.row}>
              <View style={styles.ratingBox}>
                <MaterialCommunityIcons name="star" size={14} color={colors.warning} />
                <Text style={styles.rating}>{worker.rating.toFixed(1)}</Text>
              </View>
              {worker.phone ? (
                <Pressable onPress={onCall} style={styles.callBtn} hitSlop={8} accessibilityLabel="Call worker">
                  <MaterialCommunityIcons name="phone" size={18} color="#fff" />
                </Pressable>
              ) : null}
            </View>
          </Card>
        ) : null}

        <Card>
          <Text style={styles.sectionTitle}>{t('order.progress')}</Text>
          <View style={{ height: spacing.sm }} />
          <StatusTimeline status={order.status} />
        </Card>

        <Card style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('order.company')}</Text>
            <Text style={styles.detailValue}>{order.tenantName ?? t('common.dash')}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('order.service')}</Text>
            <Text style={styles.detailValue}>{order.washTypeName}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('order.location')}</Text>
            <Text style={[styles.detailValue, styles.flexEnd]} numberOfLines={1}>
              {order.location.address}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('order.schedule')}</Text>
            <Text style={styles.detailValue}>
              {order.scheduledFor
                ? new Date(order.scheduledFor).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : t('order.now')}
            </Text>
          </View>
          <View style={[styles.detailRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>{t('order.totalPaid')}</Text>
            <Text style={styles.totalValue}>
              {order.priceEgp} {APP_CONFIG.currency}
            </Text>
          </View>
        </Card>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        {isCompleted ? (
          <Button title={t('order.backToHome')} icon="home" onPress={() => router.replace('/(tabs)')} />
        ) : (
          <Button
            title={t('order.viewAllOrders')}
            variant="secondary"
            icon="clipboard-list-outline"
            onPress={() => router.replace('/(tabs)/orders')}
          />
        )}
      </View>
    </View>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: { width: 24 },
    headerTitle: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.semibold, color: colors.text },
    content: { padding: spacing.md, gap: spacing.md },
    flex: { flex: 1 },
    flexEnd: { flex: 1, textAlign: 'right' },
    etaCard: {},
    etaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    pulse: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    etaText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: colors.text },
    orderId: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
    workerCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    workerAvatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    workerName: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: colors.text },
    workerVehicle: { fontSize: fontSize.caption, color: colors.textSubtle, marginTop: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    callBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ratingBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: colors.warningLight,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.pill,
    },
    rating: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold, color: colors.warning },
    sectionTitle: { fontSize: fontSize.section, fontWeight: fontWeight.semibold, color: colors.text },
    detailsCard: { gap: spacing.sm },
    detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
    detailLabel: { fontSize: fontSize.body, color: colors.textSubtle },
    detailValue: { fontSize: fontSize.body, color: colors.text, fontWeight: fontWeight.medium },
    totalRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs },
    totalLabel: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: colors.text },
    totalValue: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.bold, color: colors.primaryDark },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
  });
