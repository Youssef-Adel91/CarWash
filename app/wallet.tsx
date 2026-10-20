// Powered by OnSpace.AI
// Wallet screen — shows the user's current in-app balance, a top-up flow
// (instant in mock mode; Paymob checkout in production), and an immutable
// transaction history. Accessible from the Profile tab (not a bottom-tab
// itself) to avoid crowding the tab bar.
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useAlert } from '@/template';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getWallet, getWalletTransactions, topUpWallet } from '@/services/walletService';
import type { Wallet, WalletTransaction } from '@/services/types';
import { gradients, spacing, radius, fontSize, fontWeight, shadow, type lightColors } from '@/constants/theme';
import { APP_CONFIG } from '@/constants/config';

const TOP_UP_AMOUNTS = [50, 100, 200, 500];

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { colors, scheme } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [toppingUp, setToppingUp] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [w, txs] = await Promise.all([
      getWallet(user.id),
      getWalletTransactions(user.id, 30),
    ]);
    setWallet(w);
    setTransactions(txs);
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const handleTopUp = async () => {
    if (!user) return;
    const amount = selectedAmount ?? Number(customAmount);
    if (!amount || amount <= 0) {
      showAlert(t('wallet.topUpError'), 'Please enter a valid amount.');
      return;
    }
    setToppingUp(true);
    const result = await topUpWallet({
      userId: user.id,
      amountEgp: amount,
      customer: { fullName: user.fullName, email: user.email, phone: user.phone },
    });
    setToppingUp(false);
    if (!result.success) {
      showAlert(t('wallet.topUpError'), result.error);
      return;
    }
    if (result.mode === 'instant') {
      showAlert(
        t('wallet.topUpSuccess'),
        t('wallet.topUpSuccessMsg', { amount, currency: APP_CONFIG.currency }),
      );
      setSelectedAmount(null);
      setCustomAmount('');
      load();
    }
    // In Paymob mode: result.checkoutUrl would be opened in a WebView here.
  };

  const txTypeIcon = (type: WalletTransaction['type']): React.ComponentProps<typeof MaterialCommunityIcons>['name'] => {
    switch (type) {
      case 'topup': return 'plus-circle-outline';
      case 'order_debit': return 'car-wash';
      case 'refund': return 'arrow-u-left-top';
      case 'commission_debit': return 'percent';
      default: return 'swap-horizontal';
    }
  };

  const txTypeColor = (type: WalletTransaction['type']): string => {
    switch (type) {
      case 'topup': return colors.success;
      case 'refund': return colors.success;
      case 'order_debit': return colors.danger;
      case 'commission_debit': return colors.warning;
      default: return colors.textSubtle;
    }
  };

  const txSign = (type: WalletTransaction['type']): string =>
    type === 'topup' || type === 'refund' ? '+' : '-';

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero balance card */}
        <LinearGradient
          colors={scheme === 'dark' ? gradients.heroDark : gradients.hero}
          style={[styles.hero, { paddingTop: insets.top + spacing.lg }]}
        >
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
            <MaterialCommunityIcons name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.heroLabel}>{t('wallet.balance')}</Text>
          {loading ? (
            <ActivityIndicator color="#fff" size="large" style={{ marginVertical: spacing.sm }} />
          ) : (
            <Text style={styles.heroBalance}>
              {(wallet?.balanceEgp ?? 0).toFixed(2)} {APP_CONFIG.currency}
            </Text>
          )}
        </LinearGradient>

        <View style={styles.body}>
          {/* Top-up section */}
          <Card style={{ gap: spacing.sm }}>
            <Text style={styles.sectionTitle}>{t('wallet.topUpTitle')}</Text>
            <View style={styles.amountRow}>
              {TOP_UP_AMOUNTS.map((amt) => (
                <Pressable
                  key={amt}
                  onPress={() => { setSelectedAmount(amt); setCustomAmount(''); }}
                  style={[styles.amountChip, selectedAmount === amt && styles.amountChipActive]}
                >
                  <Text style={[styles.amountChipText, selectedAmount === amt && styles.amountChipTextActive]}>
                    {amt}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={customAmount}
              onChangeText={(v) => { setCustomAmount(v); setSelectedAmount(null); }}
              placeholder={t('wallet.topUpAmount', { currency: APP_CONFIG.currency })}
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={styles.customInput}
            />
            <Button
              title={t('wallet.topUpBtn')}
              icon="wallet-plus"
              loading={toppingUp}
              onPress={handleTopUp}
            />
          </Card>

          {/* Transaction history */}
          <Text style={styles.sectionTitle}>{t('wallet.transactions')}</Text>
          <Card style={{ gap: 0 }}>
            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ padding: spacing.md }} />
            ) : transactions.length === 0 ? (
              <Text style={styles.emptyText}>{t('wallet.noTransactions')}</Text>
            ) : (
              transactions.map((tx, i) => (
                <View
                  key={tx.id}
                  style={[styles.txRow, i < transactions.length - 1 && styles.txDivider]}
                >
                  <View style={[styles.txIcon, { backgroundColor: txTypeColor(tx.type) + '22' }]}>
                    <MaterialCommunityIcons
                      name={txTypeIcon(tx.type)}
                      size={20}
                      color={txTypeColor(tx.type)}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.txLabel}>
                      {t(`wallet.txTypes.${tx.type}` as any)}
                    </Text>
                    <Text style={styles.txDate}>
                      {new Date(tx.createdAt).toLocaleDateString()}
                      {tx.note ? ` · ${tx.note}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.txAmount, { color: txTypeColor(tx.type) }]}>
                    {txSign(tx.type)}{tx.amountEgp.toFixed(2)} {APP_CONFIG.currency}
                  </Text>
                </View>
              ))
            )}
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    hero: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
      borderBottomLeftRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
      gap: spacing.xs,
    },
    backBtn: { marginBottom: spacing.sm },
    heroLabel: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.body },
    heroBalance: { color: '#fff', fontSize: fontSize.display, fontWeight: fontWeight.bold },
    body: { padding: spacing.md, gap: spacing.md },
    sectionTitle: { fontSize: fontSize.section, fontWeight: fontWeight.semibold, color: colors.text },
    amountRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    amountChip: {
      flex: 1,
      minWidth: 70,
      alignItems: 'center',
      justifyContent: 'center',
      height: 44,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    amountChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    amountChipText: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: colors.textSubtle },
    amountChipTextActive: { color: colors.primary },
    customInput: {
      height: 48,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      fontSize: fontSize.body,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    txRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    txDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
    txIcon: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    txLabel: { fontSize: fontSize.body, fontWeight: fontWeight.medium, color: colors.text },
    txDate: { fontSize: fontSize.caption, color: colors.textSubtle, marginTop: 2 },
    txAmount: { fontSize: fontSize.body, fontWeight: fontWeight.bold },
    emptyText: { color: colors.textSubtle, fontSize: fontSize.body, padding: spacing.sm },
  });
