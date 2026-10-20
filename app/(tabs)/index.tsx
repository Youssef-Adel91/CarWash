// Powered by OnSpace.AI
// Home tab. Two modes depending on whether the customer has picked a car
// wash company yet (selectedTenant in TenantContext):
//  - No tenant selected: a general landing — greeting, last order (if any),
//    a "browse car washes" prompt into the Places tab, and a short "how it
//    works" explainer. This is what a customer sees the first time they
//    open the app after signing up, instead of being forced into a picker
//    before they've even seen the app.
//  - Tenant selected: the actual booking flow (map, wash types, schedule,
//    request button) — unchanged from before.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LiveMap } from '@/components/feature/LiveMap';
import { WashTypeCard } from '@/components/feature/WashTypeCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/hooks/useAuth';
import { useOrders } from '@/hooks/useOrders';
import { useLocation } from '@/hooks/useLocation';
import { useWashTypes } from '@/hooks/useWashTypes';
import { useTenant } from '@/contexts/TenantContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAlert } from '@/template';
import { getMyOrderHistory } from '@/services/orderService';
import { getWalletBalance } from '@/services/walletService';
import { getWorkerDisplayInfo } from '@/services/workerService';
import { gradients, spacing, radius, fontSize, fontWeight, shadow, type lightColors } from '@/constants/theme';
import { APP_CONFIG } from '@/constants/config';
import type { Order, Worker } from '@/services/types';

type ScheduleMode = 'now' | 'later';

function formatRelative(iso: string, t: (key: any, vars?: any) => string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t('common.justNow');
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const HOW_IT_WORKS_STEPS = [
  { icon: 'store-search-outline' as const, titleKey: 'home.howItWorksStep1Title', descKey: 'home.howItWorksStep1Desc' },
  { icon: 'map-marker-check-outline' as const, titleKey: 'home.howItWorksStep2Title', descKey: 'home.howItWorksStep2Desc' },
  { icon: 'map-marker-path' as const, titleKey: 'home.howItWorksStep3Title', descKey: 'home.howItWorksStep3Desc' },
];

export default function Home() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tenantId?: string; washTypeId?: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { placeOrder } = useOrders();
  const { selectedTenant, clearSelectedTenant, selectTenant } = useTenant();
  const { washTypes } = useWashTypes();
  const { location, detecting, detect, setLocation } = useLocation();
  const { showAlert } = useAlert();
  const { colors, scheme } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleMode>('now');
  const [placing, setPlacing] = useState(false);
  const [lastOrders, setLastOrders] = useState<Order[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [stats, setStats] = useState({ count: 0, amount: 0 });
  const [prefillHandled, setPrefillHandled] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'wallet'>('card');

  const selectedWash = useMemo(
    () => washTypes.find((w) => w.id === selectedId) ?? null,
    [selectedId, washTypes],
  );

  const firstName = user?.fullName?.split(' ')[0] ?? '';

  // "Order again" — prefill the wash type from ?washTypeId once the catalog
  // for the (possibly just-switched) tenant has loaded.
  useEffect(() => {
    if (prefillHandled) return;
    if (!params.washTypeId) return;
    if (params.tenantId && selectedTenant && params.tenantId !== selectedTenant.id) {
      selectTenant(params.tenantId);
      return;
    }
    const match = washTypes.find((w) => w.id === params.washTypeId);
    if (match) {
      setSelectedId(match.id);
      setPrefillHandled(true);
    }
  }, [params.washTypeId, params.tenantId, selectedTenant, washTypes, selectTenant, prefillHandled]);

  // Load the customer's order history, stats, and wallet balance.
  useEffect(() => {
    if (!user) return;
    let active = true;
    Promise.all([
      getMyOrderHistory(user.id, 50),
      getWalletBalance(user.id),
    ])
      .then(([history, balance]) => {
        if (!active) return;
        setLastOrders(history.slice(0, 3));
        setWalletBalance(balance);
        const totalSpent = history.reduce((acc, curr) => acc + curr.priceEgp, 0);
        setStats({ count: history.length, amount: totalSpent });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);

  const onSwitchCompany = () => {
    showAlert(t('tenantSelect.switchTitle'), t('tenantSelect.switchMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('tenantSelect.switch'),
        onPress: async () => {
          await clearSelectedTenant();
          router.push('/(tabs)/places');
        },
      },
    ]);
  };

  const onReorder = (order: Order) => {
    if (order.tenantId !== selectedTenant?.id) {
      setPrefillHandled(false);
      selectTenant(order.tenantId);
    }
    router.setParams({ tenantId: order.tenantId, washTypeId: order.washTypeId });
    setPrefillHandled(false);
    setSelectedId(order.washTypeId);
  };

  const onRequest = async () => {
    if (!selectedWash) {
      showAlert(t('home.chooseWashAlert'), t('home.chooseWashAlertMsg'));
      return;
    }
    if (paymentMethod === 'wallet' && walletBalance < selectedWash.priceEgp) {
      showAlert(t('home.payWithWalletInsufficient'), '');
      return;
    }
    setPlacing(true);
    const scheduledFor =
      schedule === 'later' ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() : null;
    const order = await placeOrder({
      washType: { id: selectedWash.id, name: selectedWash.name, priceEgp: selectedWash.priceEgp },
      location,
      scheduledFor,
      paymentMethod,
    });
    setPlacing(false);
    if (order) router.push(`/order/${order.id}`);
  };

  const dashboardWidgets = (
    <View style={styles.widgetsContainer}>
      <View style={styles.statsRow}>
        <Card style={[styles.statsCard, styles.flex]}>
          <MaterialCommunityIcons name="wallet-outline" size={24} color={colors.primary} />
          <Text style={styles.statsLabel}>{t('home.wallet.cardTitle')}</Text>
          <Text style={styles.statsValue}>
            {t('home.wallet.balance', { amount: walletBalance.toFixed(2), currency: APP_CONFIG.currency })}
          </Text>
          <Pressable onPress={() => router.push('/wallet')} style={styles.topUpBtn}>
            <Text style={styles.topUpBtnText}>{t('home.wallet.topUp')}</Text>
          </Pressable>
        </Card>
        <Card style={[styles.statsCard, styles.flex]}>
          <MaterialCommunityIcons name="chart-box-outline" size={24} color={colors.primary} />
          <Text style={styles.statsLabel}>{t('home.analytics.title')}</Text>
          <Text style={styles.statsSub}>
            {t('home.analytics.totalWashes', { count: stats.count })}
          </Text>
          <Text style={styles.statsValue}>{stats.amount.toFixed(2)} {APP_CONFIG.currency}</Text>
        </Card>
      </View>

      {lastOrders.length > 0 && (
        <Card style={styles.recentOrdersCard}>
          <Text style={styles.sectionTitle}>{t('home.recentOrders.title')}</Text>
          {lastOrders.map((order, i) => (
            <View
              key={order.id}
              style={[styles.lastOrderRow, i < lastOrders.length - 1 && styles.borderBottom]}
            >
              <View style={styles.lastOrderIcon}>
                <MaterialCommunityIcons name="history" size={20} color={colors.primary} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.lastOrderWash} numberOfLines={1}>
                  {order.washTypeName}
                </Text>
                <Text style={styles.lastOrderNote} numberOfLines={1}>
                  {formatRelative(order.createdAt, t)} · {order.priceEgp} {APP_CONFIG.currency}
                </Text>
              </View>
              <Pressable onPress={() => onReorder(order)} style={styles.reorderBtn} hitSlop={8}>
                <MaterialCommunityIcons name="refresh" size={16} color={colors.textOnPrimary} />
                <Text style={styles.reorderBtnText}>{t('home.recentOrders.orderAgain')}</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      )}
    </View>
  );

  // No car wash picked yet — general landing instead of a forced picker.
  if (!selectedTenant) {
    return (
      <View style={styles.container}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={scheme === 'dark' ? gradients.heroDark : gradients.hero}
            style={[styles.hero, { paddingTop: insets.top + spacing.lg }]}
          >
            {firstName ? <Text style={styles.heroHello}>{t('home.hello', { name: firstName })}</Text> : null}
            <Text style={styles.heroTitle}>{t('home.exploreTitle')}</Text>
            <Text style={styles.heroExploreSubtitle}>{t('home.exploreSubtitle', { appName: APP_CONFIG.name })}</Text>
          </LinearGradient>

          <View style={styles.body}>
            {dashboardWidgets}

            <Pressable onPress={() => router.push('/(tabs)/places')}>
              <Card style={styles.browseCard}>
                <View style={styles.browseIcon}>
                  <MaterialCommunityIcons name="store-search-outline" size={26} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.browseTitle}>{t('home.browseCta')}</Text>
                  <Text style={styles.browseDesc}>{t('home.browseCtaDesc')}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
              </Card>
            </Pressable>

            <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>{t('home.howItWorksTitle')}</Text>
            <View style={styles.stepsList}>
              {HOW_IT_WORKS_STEPS.map((step, i) => (
                <View key={step.titleKey} style={styles.stepRow}>
                  <View style={styles.stepIcon}>
                    <MaterialCommunityIcons name={step.icon} size={20} color={colors.primary} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.stepTitle}>{t(step.titleKey as any)}</Text>
                    <Text style={styles.stepDesc}>{t(step.descKey as any)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={scheme === 'dark' ? gradients.heroDark : gradients.hero}
          style={[styles.hero, { paddingTop: insets.top + spacing.lg }]}
        >
          {firstName ? <Text style={styles.heroHello}>{t('home.hello', { name: firstName })}</Text> : null}
          <Text style={styles.heroTitle}>{t('home.title')}</Text>
          <Pressable onPress={onSwitchCompany} style={styles.tenantBadge} hitSlop={6}>
            <MaterialCommunityIcons name="store-outline" size={14} color="#fff" />
            <Text style={styles.tenantBadgeText} numberOfLines={1}>
              {selectedTenant?.name ?? APP_CONFIG.name}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={14} color="#fff" />
          </Pressable>
          <View style={styles.heroBadge}>
            <MaterialCommunityIcons name="map-marker-radius" size={16} color="#fff" />
            <Text style={styles.heroBadgeText} numberOfLines={1}>
              {location.address}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {dashboardWidgets}

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{t('home.confirmLocation')}</Text>
            <Pressable onPress={detect} style={styles.detectBtn} hitSlop={8}>
              <MaterialCommunityIcons
                name={detecting ? 'loading' : 'crosshairs-gps'}
                size={16}
                color={colors.primary}
              />
              <Text style={styles.detectText}>{detecting ? t('home.locating') : t('home.useGps')}</Text>
            </Pressable>
          </View>

          <LiveMap
            height={200}
            interactive
            center={location}
            onPinMove={(coord) => setLocation({ ...coord, address: 'Pinned location' })}
          />
          <View style={styles.addressRow}>
            <MaterialCommunityIcons name="map-marker" size={18} color={colors.primary} />
            <Text style={styles.address}>{location.address}</Text>
            <Text style={styles.tapHint}>{t('home.tapHint')}</Text>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>{t('home.chooseWash')}</Text>
          <View style={styles.washList}>
            {washTypes.map((wash) => (
              <WashTypeCard
                key={wash.id}
                wash={wash}
                selected={selectedId === wash.id}
                onPress={() => setSelectedId(wash.id)}
              />
            ))}
          </View>

          <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>{t('home.when')}</Text>
          <View style={styles.segment}>
            {(['now', 'later'] as ScheduleMode[]).map((mode) => {
              const active = schedule === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => setSchedule(mode)}
                  style={[styles.segmentItem, active && styles.segmentItemActive]}
                >
                  <MaterialCommunityIcons
                    name={mode === 'now' ? 'flash' : 'clock-outline'}
                    size={18}
                    color={active ? colors.textOnPrimary : colors.textSubtle}
                  />
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {mode === 'now' ? t('home.washNow') : t('home.scheduleLater')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <View style={styles.paymentMethodRow}>
          <Pressable
            style={[styles.pmBtn, paymentMethod === 'card' && styles.pmBtnActive]}
            onPress={() => setPaymentMethod('card')}
          >
            <MaterialCommunityIcons name="credit-card-outline" size={20} color={paymentMethod === 'card' ? colors.primary : colors.textSubtle} />
            <Text style={[styles.pmText, paymentMethod === 'card' && styles.pmTextActive]}>{t('home.payWithCard')}</Text>
          </Pressable>
          <Pressable
            style={[styles.pmBtn, paymentMethod === 'wallet' && styles.pmBtnActive]}
            onPress={() => setPaymentMethod('wallet')}
          >
            <MaterialCommunityIcons name="wallet-outline" size={20} color={paymentMethod === 'wallet' ? colors.primary : colors.textSubtle} />
            <Text style={[styles.pmText, paymentMethod === 'wallet' && styles.pmTextActive]}>
              {t('home.payWithWallet', { balance: walletBalance.toFixed(2), currency: APP_CONFIG.currency })}
            </Text>
          </Pressable>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>{selectedWash ? selectedWash.name : t('home.total')}</Text>
            <Text style={styles.summaryPrice}>
              {selectedWash ? selectedWash.priceEgp : 0} {APP_CONFIG.currency}
            </Text>
          </View>
          <View style={styles.flex}>
            <Button
              title={schedule === 'now' ? t('home.requestWash') : t('home.scheduleWash')}
              icon="car-wash"
              loading={placing}
              onPress={onRequest}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    content: { gap: 0 },
    hero: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
      borderBottomLeftRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
      gap: 4,
    },
    heroHello: { color: 'rgba(255,255,255,0.85)', fontSize: fontSize.body, fontWeight: fontWeight.medium },
    heroTitle: { color: '#fff', fontSize: fontSize.title, fontWeight: fontWeight.bold, marginBottom: spacing.sm },
    heroExploreSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: fontSize.caption, marginTop: -spacing.xs, lineHeight: 18 },
    tenantBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      marginBottom: 6,
    },
    tenantBadgeText: { color: '#fff', fontSize: fontSize.caption, fontWeight: fontWeight.bold, maxWidth: 200 },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: radius.pill,
      maxWidth: '100%',
    },
    heroBadgeText: { color: '#fff', fontSize: fontSize.caption, fontWeight: fontWeight.medium, flexShrink: 1 },
    body: { padding: spacing.md, gap: spacing.md },
    widgetsContainer: { gap: spacing.sm, marginBottom: spacing.sm },
    statsRow: { flexDirection: 'row', gap: spacing.sm },
    statsCard: { gap: 6, alignItems: 'center', paddingVertical: spacing.md },
    statsLabel: { fontSize: 13, color: colors.textMuted, marginTop: 4, fontWeight: fontWeight.medium },
    statsValue: { fontSize: 18, fontWeight: fontWeight.bold, color: colors.primaryDark },
    statsSub: { fontSize: 12, color: colors.textSubtle },
    topUpBtn: { marginTop: 6, paddingHorizontal: 16, paddingVertical: 6, backgroundColor: colors.primaryLight, borderRadius: radius.pill },
    topUpBtnText: { color: colors.primary, fontSize: 13, fontWeight: fontWeight.bold },
    recentOrdersCard: { gap: spacing.sm },
    lastOrderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
    borderBottom: { borderBottomWidth: 1, borderBottomColor: colors.border },
    lastOrderIcon: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lastOrderWash: { fontSize: fontSize.body, color: colors.text, fontWeight: fontWeight.semibold, marginBottom: 2 },
    lastOrderNote: { fontSize: 12, color: colors.textMuted },
    reorderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.sm,
      paddingVertical: 8,
      borderRadius: radius.pill,
    },
    reorderBtnText: { color: colors.textOnPrimary, fontSize: 12, fontWeight: fontWeight.semibold },
    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { fontSize: fontSize.section, fontWeight: fontWeight.semibold, color: colors.text },
    detectBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    detectText: { color: colors.primary, fontWeight: fontWeight.semibold, fontSize: fontSize.caption },
    addressRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
    address: { color: colors.text, fontSize: fontSize.caption, fontWeight: fontWeight.medium, flex: 1 },
    tapHint: { color: colors.textMuted, fontSize: 11 },
    washList: { gap: spacing.sm },
    segment: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.md,
      padding: 4,
      gap: 4,
    },
    segmentItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 44,
      borderRadius: radius.sm,
    },
    segmentItemActive: { backgroundColor: colors.primary },
    segmentText: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold, color: colors.textSubtle },
    segmentTextActive: { color: colors.textOnPrimary },
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
      gap: spacing.sm,
      ...shadow.floating,
    },
    summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    paymentMethodRow: { flexDirection: 'row', gap: spacing.sm },
    pmBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 44,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    pmBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    pmText: { fontSize: 13, fontWeight: fontWeight.semibold, color: colors.textSubtle },
    pmTextActive: { color: colors.primary },
    summary: { minWidth: 90 },
    summaryLabel: { fontSize: 11, color: colors.textMuted },
    summaryPrice: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.bold, color: colors.primaryDark },
    browseCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...shadow.soft, marginTop: spacing.xs },
    browseIcon: {
      width: 48,
      height: 48,
      borderRadius: radius.md,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    browseTitle: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.bold, color: colors.text },
    browseDesc: { fontSize: fontSize.caption, color: colors.textSubtle, marginTop: 2 },
    stepsList: { gap: spacing.md, marginTop: spacing.sm },
    stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    stepIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepTitle: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: colors.text },
    stepDesc: { fontSize: fontSize.caption, color: colors.textSubtle, marginTop: 1 },
  });
