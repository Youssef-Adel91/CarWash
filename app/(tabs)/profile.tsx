// Powered by OnSpace.AI
// Full settings screen for the customer. Sections:
//  1. Profile card + inline edit (name, phone)
//  2. Security (change password, change email)
//  3. Wallet row → navigates to app/wallet.tsx
//  4. Payment methods (tokenized cards only — no raw PANs stored)
//  5. Notifications master switch
//  6. Saved addresses
//  7. Appearance + Language (existing)
//  8. Payment history (existing)
//  9. Danger zone: delete account
// 10. Logout
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useAlert } from '@/template';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  updateProfile,
  updatePassword,
  updateEmail,
  requestAccountDeletion,
} from '@/services/authService';
import {
  getSavedPaymentMethods,
  addPaymentMethod,
  removePaymentMethod,
} from '@/services/paymentMethodService';
import { getSavedAddresses, addAddress, removeAddress } from '@/services/addressService';
import { getWalletBalance } from '@/services/walletService';
import { getPaymentsByUser } from '@/services/paymentService';
import type { Payment, PaymentMethod, SavedAddress } from '@/services/types';
import {
  gradients,
  spacing,
  radius,
  fontSize,
  fontWeight,
  shadow,
  type lightColors,
} from '@/constants/theme';
import { APP_CONFIG } from '@/constants/config';

// ---------- small reusable sub-components ----------

function SectionRow({
  icon,
  label,
  value,
  onPress,
  colors,
  styles,
  danger,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value?: string;
  onPress: () => void;
  colors: typeof lightColors;
  styles: ReturnType<typeof makeStyles>;
  danger?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.menuRow}>
      <View style={[styles.menuIcon, danger && { backgroundColor: colors.dangerLight }]}>
        <MaterialCommunityIcons name={icon} size={20} color={danger ? colors.danger : colors.primary} />
      </View>
      <Text style={[styles.menuLabel, danger && { color: colors.danger }]}>{label}</Text>
      {value ? <Text style={styles.menuValue}>{value}</Text> : null}
      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

// ---------- main component ----------

export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout, setUser } = useAuth();
  const { showAlert } = useAlert();
  const { colors, scheme, mode, setMode } = useTheme();
  const { language, t, setLanguage } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Data state
  const [payments, setPayments] = useState<Payment[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // Edit profile form
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Change password form
  const [showPassword, setShowPassword] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  // Change email form
  const [showEmail, setShowEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  // Add card form
  const [showAddCard, setShowAddCard] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardName, setCardName] = useState('');
  const [savingCard, setSavingCard] = useState(false);

  // Add address form
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addrLabel, setAddrLabel] = useState('');
  const [addrLine, setAddrLine] = useState('');
  const [savingAddr, setSavingAddr] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!user) return;
      Promise.all([
        getPaymentsByUser(user.id),
        getSavedPaymentMethods(user.id),
        getSavedAddresses(user.id),
        getWalletBalance(user.id),
        Notifications.getPermissionsAsync(),
      ]).then(([pmts, mths, addrs, balance, notifPerms]) => {
        if (!active) return;
        setPayments(pmts);
        setMethods(mths);
        setAddresses(addrs);
        setWalletBalance(balance);
        setNotificationsEnabled(notifPerms.status === 'granted');
      }).catch(() => {});
      return () => { active = false; };
    }, [user]),
  );

  const initials = user?.fullName
    ?.split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // --- handlers ---

  const onLogout = () => {
    showAlert(t('profile.logoutConfirmTitle'), t('profile.logoutConfirmMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.logout'),
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/onboarding');
        },
      },
    ]);
  };

  const onSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const res = await updateProfile(user.id, { fullName: editName, phone: editPhone });
    setSavingProfile(false);
    if (!res.success) {
      showAlert(t('profile.edit.errorTitle'), res.error);
      return;
    }
    setUser?.(res.user);
    setEditingProfile(false);
    showAlert(t('profile.edit.saved'), t('profile.edit.savedMsg'));
  };

  const onSavePassword = async () => {
    if (newPw !== confirmPw) {
      showAlert(t('profile.password.mismatch'), t('profile.password.mismatchMsg'));
      return;
    }
    setSavingPw(true);
    const res = await updatePassword(newPw);
    setSavingPw(false);
    if (!res.success) {
      showAlert(t('profile.password.errorTitle'), res.error);
      return;
    }
    setNewPw(''); setConfirmPw(''); setShowPassword(false);
    showAlert(t('profile.password.saved'), t('profile.password.savedMsg'));
  };

  const onSaveEmail = async () => {
    setSavingEmail(true);
    const res = await updateEmail(newEmail);
    setSavingEmail(false);
    if (!res.success) {
      showAlert(t('profile.email.errorTitle'), res.error);
      return;
    }
    setNewEmail(''); setShowEmail(false);
    if (res.mode === 'immediate') {
      showAlert(t('profile.email.savedImmediate'), t('profile.email.savedImmediateMsg'));
    } else {
      showAlert(t('profile.email.savedConfirm'), t('profile.email.savedConfirmMsg'));
    }
  };

  const onAddCard = async () => {
    if (!user) return;
    const digits = cardNumber.replace(/\s+/g, '');
    if (digits.length < 15 || cardExpiry.length < 4 || cardCvc.length < 3 || cardName.trim().length < 2) {
      showAlert(t('profile.paymentMethods.errorTitle'), t('auth.register.missingDetailsMsg'));
      return;
    }
    setSavingCard(true);
    const last4 = digits.slice(-4);
    // Detect brand from first digit (simplified; Paymob returns this in production)
    const brand = digits[0] === '4' ? 'visa' : digits[0] === '5' ? 'mastercard' : 'card';
    const token = `mock_token_${last4}_${Date.now()}`;
    const result = await addPaymentMethod({ userId: user.id, token, last4, brand, expiresAt: cardExpiry });
    setSavingCard(false);
    if (!result) {
      showAlert(t('profile.paymentMethods.errorTitle'), '');
      return;
    }
    setMethods((prev) => [result, ...prev]);
    setCardNumber(''); setCardExpiry(''); setCardCvc(''); setCardName('');
    setShowAddCard(false);
    showAlert(t('profile.paymentMethods.addedTitle'), t('profile.paymentMethods.addedMsg'));
  };

  const onRemoveCard = (m: PaymentMethod) => {
    showAlert(
      t('profile.paymentMethods.removeTitle'),
      t('profile.paymentMethods.removeMsg', { last4: m.last4 }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.remove'),
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            await removePaymentMethod(m.id, user.id);
            setMethods((prev) => prev.filter((x) => x.id !== m.id));
          },
        },
      ],
    );
  };

  const onAddAddress = async () => {
    if (!user || !addrLabel.trim() || !addrLine.trim()) {
      showAlert(t('auth.register.missingDetails'), t('auth.register.missingDetailsMsg'));
      return;
    }
    setSavingAddr(true);
    // We don't have real geocoding here — store placeholder coords (0,0) that the
    // user can improve later when the address picker UI is expanded.
    const result = await addAddress({ userId: user.id, label: addrLabel, lat: 0, lng: 0, address: addrLine });
    setSavingAddr(false);
    if (!result) return;
    setAddresses((prev) => [result, ...prev]);
    setAddrLabel(''); setAddrLine('');
    setShowAddAddress(false);
    showAlert(t('profile.addresses.addedTitle'), '');
  };

  const onRemoveAddress = (a: SavedAddress) => {
    showAlert(
      t('profile.addresses.removeTitle'),
      t('profile.addresses.removeMsg', { label: a.label }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.remove'),
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            await removeAddress(a.id, user.id);
            setAddresses((prev) => prev.filter((x) => x.id !== a.id));
          },
        },
      ],
    );
  };

  const onDeleteAccount = () => {
    showAlert(
      t('profile.deleteAccount.confirmTitle'),
      t('profile.deleteAccount.confirmMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.deleteAccount.confirm'),
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            const res = await requestAccountDeletion(user.id);
            if (!res.success) {
              showAlert(t('profile.deleteAccount.errorTitle'), res.error);
              return;
            }
            showAlert(t('profile.deleteAccount.requested'), t('profile.deleteAccount.requestedMsg'));
            router.replace('/onboarding');
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero gradient */}
      <LinearGradient
        colors={scheme === 'dark' ? gradients.heroDark : gradients.hero}
        style={[styles.hero, { paddingTop: insets.top + spacing.md }]}
      >
        <View style={styles.avatarRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials || '👤'}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.heroName}>{user?.fullName}</Text>
            <Text style={styles.heroEmail}>{user?.email}</Text>
          </View>
          <Pressable
            onPress={() => {
              setEditName(user?.fullName ?? '');
              setEditPhone(user?.phone ?? '');
              setEditingProfile(!editingProfile);
            }}
            style={styles.editBtn}
            hitSlop={8}
          >
            <MaterialCommunityIcons
              name={editingProfile ? 'close' : 'pencil-outline'}
              size={20}
              color="#fff"
            />
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.body}>

        {/* Inline edit profile form */}
        {editingProfile && (
          <Card style={{ gap: spacing.sm }}>
            <Text style={styles.sectionTitle}>{t('profile.edit.title')}</Text>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              placeholder={t('profile.edit.fullName')}
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <TextInput
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder={t('profile.edit.phone')}
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              style={styles.input}
            />
            <Button
              title={t('profile.edit.save')}
              loading={savingProfile}
              onPress={onSaveProfile}
            />
          </Card>
        )}

        {/* Security */}
        <Card style={{ gap: 0 }}>
          <Text style={[styles.sectionTitle, { marginBottom: spacing.sm }]}>
            {t('profile.password.title').replace('Change ', '')}
          </Text>
          <SectionRow
            icon="lock-outline"
            label={t('profile.password.title')}
            onPress={() => setShowPassword(!showPassword)}
            colors={colors}
            styles={styles}
          />
          {showPassword && (
            <View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
              <TextInput
                value={newPw}
                onChangeText={setNewPw}
                placeholder={t('profile.password.new')}
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                style={styles.input}
              />
              <TextInput
                value={confirmPw}
                onChangeText={setConfirmPw}
                placeholder={t('profile.password.confirm')}
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                style={styles.input}
              />
              <Button title={t('profile.password.save')} loading={savingPw} onPress={onSavePassword} />
            </View>
          )}
          <View style={styles.divider} />
          <SectionRow
            icon="email-edit-outline"
            label={t('profile.email.title')}
            onPress={() => setShowEmail(!showEmail)}
            colors={colors}
            styles={styles}
          />
          {showEmail && (
            <View style={{ gap: spacing.sm, paddingTop: spacing.sm }}>
              <TextInput
                value={newEmail}
                onChangeText={setNewEmail}
                placeholder={t('profile.email.newEmail')}
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
              />
              <Button title={t('profile.email.save')} loading={savingEmail} onPress={onSaveEmail} />
            </View>
          )}
        </Card>

        {/* Wallet row */}
        <Card>
          <SectionRow
            icon="wallet-outline"
            label={t('profile.walletRow')}
            value={t('profile.walletRowBalance', {
              balance: walletBalance.toFixed(2),
              currency: APP_CONFIG.currency,
            })}
            onPress={() => router.push('/wallet')}
            colors={colors}
            styles={styles}
          />
        </Card>

        {/* Payment methods */}
        <Card style={{ gap: spacing.sm }}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>{t('profile.paymentMethods.title')}</Text>
            <Pressable onPress={() => setShowAddCard(!showAddCard)} hitSlop={8}>
              <MaterialCommunityIcons
                name={showAddCard ? 'close' : 'plus'}
                size={22}
                color={colors.primary}
              />
            </Pressable>
          </View>
          <Text style={styles.subtleNote}>{t('profile.paymentMethods.subtitle')}</Text>
          {methods.length === 0 && !showAddCard && (
            <Text style={styles.emptyText}>{t('profile.paymentMethods.noCards')}</Text>
          )}
          {methods.map((m) => (
            <View key={m.id} style={styles.methodRow}>
              <MaterialCommunityIcons
                name={m.brand === 'visa' ? 'credit-card' : m.brand === 'mastercard' ? 'credit-card-multiple' : 'credit-card-outline'}
                size={22}
                color={colors.primary}
              />
              <Text style={styles.methodText}>•••• {m.last4}</Text>
              {m.isDefault && (
                <View style={styles.defaultBadge}>
                  <Text style={styles.defaultBadgeText}>{t('profile.paymentMethods.default')}</Text>
                </View>
              )}
              {m.expiresAt && <Text style={styles.methodSub}>{m.expiresAt}</Text>}
              <View style={styles.flex} />
              <Pressable onPress={() => onRemoveCard(m)} hitSlop={8}>
                <MaterialCommunityIcons name="delete-outline" size={20} color={colors.danger} />
              </Pressable>
            </View>
          ))}
          {showAddCard && (
            <View style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
              <Text style={styles.formLabel}>{t('profile.paymentMethods.addCardTitle')}</Text>
              <TextInput value={cardNumber} onChangeText={setCardNumber}
                placeholder={t('profile.paymentMethods.cardNumber')} placeholderTextColor={colors.textMuted}
                keyboardType="number-pad" maxLength={19} style={styles.input} />
              <View style={styles.row}>
                <TextInput value={cardExpiry} onChangeText={setCardExpiry}
                  placeholder={t('profile.paymentMethods.cardExpiry')} placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad" maxLength={5} style={[styles.input, styles.flex]} />
                <TextInput value={cardCvc} onChangeText={setCardCvc}
                  placeholder={t('profile.paymentMethods.cardCvc')} placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad" maxLength={4} secureTextEntry style={[styles.input, styles.flex]} />
              </View>
              <TextInput value={cardName} onChangeText={setCardName}
                placeholder={t('profile.paymentMethods.cardName')} placeholderTextColor={colors.textMuted}
                autoCapitalize="words" style={styles.input} />
              <Button title={t('profile.paymentMethods.addCardBtn')} loading={savingCard} onPress={onAddCard} />
            </View>
          )}
        </Card>

        {/* Notifications */}
        <Card>
          <View style={styles.rowBetween}>
            <View style={styles.row}>
              <MaterialCommunityIcons name="bell-outline" size={20} color={colors.primary} />
              <Text style={styles.menuLabel}>{t('profile.notifications.masterSwitch')}</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={async () => {
                if (notificationsEnabled) {
                  Linking.openSettings();
                } else {
                  const { status } = await Notifications.requestPermissionsAsync();
                  setNotificationsEnabled(status === 'granted');
                }
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.textOnPrimary}
            />
          </View>
          <Text style={styles.subtleNote}>
            {notificationsEnabled
              ? t('profile.notifications.enabledHint')
              : t('profile.notifications.disabledHint')}
          </Text>
        </Card>

        {/* Saved addresses */}
        <Card style={{ gap: spacing.sm }}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>{t('profile.addresses.title')}</Text>
            <Pressable onPress={() => setShowAddAddress(!showAddAddress)} hitSlop={8}>
              <MaterialCommunityIcons
                name={showAddAddress ? 'close' : 'plus'}
                size={22}
                color={colors.primary}
              />
            </Pressable>
          </View>
          {addresses.length === 0 && !showAddAddress && (
            <Text style={styles.emptyText}>{t('profile.addresses.noAddresses')}</Text>
          )}
          {addresses.map((a) => (
            <View key={a.id} style={styles.methodRow}>
              <MaterialCommunityIcons name="map-marker-outline" size={20} color={colors.primary} />
              <View style={styles.flex}>
                <Text style={styles.methodText}>{a.label}</Text>
                <Text style={styles.methodSub} numberOfLines={1}>{a.address}</Text>
              </View>
              {a.isDefault && (
                <View style={styles.defaultBadge}>
                  <Text style={styles.defaultBadgeText}>{t('profile.addresses.default')}</Text>
                </View>
              )}
              <Pressable onPress={() => onRemoveAddress(a)} hitSlop={8}>
                <MaterialCommunityIcons name="delete-outline" size={20} color={colors.danger} />
              </Pressable>
            </View>
          ))}
          {showAddAddress && (
            <View style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm }}>
              <TextInput value={addrLabel} onChangeText={setAddrLabel}
                placeholder={t('profile.addresses.labelPlaceholder')} placeholderTextColor={colors.textMuted}
                style={styles.input} />
              <TextInput value={addrLine} onChangeText={setAddrLine}
                placeholder={t('profile.addresses.addressLine')} placeholderTextColor={colors.textMuted}
                style={styles.input} />
              <Button title={t('profile.addresses.addBtn')} loading={savingAddr} onPress={onAddAddress} />
            </View>
          )}
        </Card>

        {/* Appearance */}
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.sectionTitle}>{t('appearance.title')}</Text>
          <View style={styles.segment}>
            {(['light', 'dark', 'system'] as const).map((m) => {
              const active = mode === m;
              return (
                <Pressable key={m} onPress={() => setMode(m)} style={[styles.segmentItem, active && styles.segmentItemActive]}>
                  <MaterialCommunityIcons
                    name={m === 'light' ? 'white-balance-sunny' : m === 'dark' ? 'weather-night' : 'theme-light-dark'}
                    size={16}
                    color={active ? colors.textOnPrimary : colors.textSubtle}
                  />
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{t(`appearance.${m}`)}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* Language */}
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.sectionTitle}>{t('language.title')}</Text>
          <View style={styles.segment}>
            {(['en', 'ar'] as const).map((lng) => {
              const active = language === lng;
              return (
                <Pressable key={lng} onPress={() => setLanguage(lng)} style={[styles.segmentItem, active && styles.segmentItemActive]}>
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {lng === 'en' ? t('language.english') : t('language.arabic')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* Payment history */}
        <Text style={styles.sectionTitle}>{t('profile.paymentHistory')}</Text>
        <Card style={{ gap: 0 }}>
          {payments.length === 0 ? (
            <Text style={styles.emptyText}>{t('profile.noPayments')}</Text>
          ) : (
            payments.map((p, index) => (
              <View
                key={p.id}
                style={[styles.payRow, index < payments.length - 1 && styles.payDivider]}
              >
                <View style={[styles.payIcon, { backgroundColor: p.kind === 'registration_fee' ? colors.warningLight : colors.primaryLight }]}>
                  <MaterialCommunityIcons
                    name={p.kind === 'registration_fee' ? 'shield-check' : 'car-wash'}
                    size={18}
                    color={p.kind === 'registration_fee' ? colors.warning : colors.primary}
                  />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.payTitle}>
                    {p.kind === 'registration_fee' ? t('profile.onboardingFee') : t('profile.carWash')}
                  </Text>
                  <Text style={styles.emptyText}>
                    {new Date(p.createdAt).toLocaleDateString()} · •••• {p.cardLast4}
                  </Text>
                </View>
                <Text style={styles.payAmount}>{p.amountEgp} {APP_CONFIG.currency}</Text>
              </View>
            ))
          )}
        </Card>

        {/* Danger zone */}
        <Card style={{ gap: spacing.sm }}>
          <Text style={[styles.sectionTitle, { color: colors.danger }]}>
            {t('profile.deleteAccount.title')}
          </Text>
          <Text style={styles.subtleNote}>{t('profile.deleteAccount.subtitle')}</Text>
          <Button
            title={t('profile.deleteAccount.button')}
            variant="secondary"
            icon="delete-outline"
            onPress={onDeleteAccount}
          />
        </Card>

        {/* Logout */}
        <Button title={t('common.logout')} variant="secondary" icon="logout" onPress={onLogout} />
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    hero: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.lg,
      borderBottomLeftRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
    },
    avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: 'rgba(255,255,255,0.25)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: '#fff', fontSize: fontSize.bodyLg, fontWeight: fontWeight.bold },
    heroName: { color: '#fff', fontSize: fontSize.bodyLg, fontWeight: fontWeight.bold },
    heroEmail: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.caption, marginTop: 2 },
    editBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    flex: { flex: 1 },
    body: { padding: spacing.md, gap: spacing.md },
    sectionTitle: { fontSize: fontSize.section, fontWeight: fontWeight.semibold, color: colors.text },
    input: {
      height: 48,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      fontSize: fontSize.body,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
    menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
    menuIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuLabel: { flex: 1, fontSize: fontSize.body, color: colors.text, fontWeight: fontWeight.medium },
    menuValue: { fontSize: fontSize.caption, color: colors.textSubtle, maxWidth: 140, textAlign: 'right' },
    subtleNote: { fontSize: fontSize.caption, color: colors.textSubtle, lineHeight: 18 },
    emptyText: { fontSize: fontSize.caption, color: colors.textSubtle, marginTop: 2 },
    formLabel: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: colors.text },
    methodRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
    methodText: { fontSize: fontSize.body, fontWeight: fontWeight.medium, color: colors.text },
    methodSub: { fontSize: fontSize.caption, color: colors.textSubtle },
    defaultBadge: {
      backgroundColor: colors.primaryLight,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    defaultBadgeText: { fontSize: 11, color: colors.primary, fontWeight: fontWeight.semibold },
    segment: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4, gap: 4 },
    segmentItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 40,
      borderRadius: radius.sm,
    },
    segmentItemActive: { backgroundColor: colors.primary },
    segmentText: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold, color: colors.textSubtle },
    segmentTextActive: { color: colors.textOnPrimary },
    payRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
    payDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
    payIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    payTitle: { fontSize: fontSize.body, fontWeight: fontWeight.medium, color: colors.text },
    payAmount: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: colors.primaryDark },
  });
