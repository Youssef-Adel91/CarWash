// Powered by OnSpace.AI
// Business (tenant) sign-up: same single-step account creation as customer
// registration (see the note in register.tsx / authService.ts about
// "Confirm email" being off), plus creating the tenant row that makes this
// user an 'owner' who lands in the admin dashboard afterwards.
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/contexts/TenantContext';
import { useAlert } from '@/template';
import { createTenant } from '@/services/tenantService';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { spacing, fontSize, fontWeight, type lightColors } from '@/constants/theme';
import { APP_CONFIG } from '@/constants/config';

export default function RegisterBusiness() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { completeRegistration } = useAuth();
  const { refresh: refreshTenantMode } = useTenant();
  const { showAlert } = useAlert();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [businessName, setBusinessName] = useState('');
  const [city, setCity] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const finishAsOwner = async (ownerId: string) => {
    try {
      await createTenant({ ownerId, name: businessName.trim(), city: city.trim() || undefined });
    } catch (e) {
      showAlert(t('auth.registerBusiness.businessCreateFailed'), (e as Error).message);
      router.replace('/onboarding');
      return;
    }
    await refreshTenantMode();
    showAlert(
      t('auth.registerBusiness.businessCreated'),
      t('auth.registerBusiness.businessCreatedMsg', { name: businessName.trim(), appName: APP_CONFIG.name }),
      [{ text: t('auth.registerBusiness.goToDashboard'), onPress: () => router.replace('/(admin)/dashboard') }],
    );
  };

  const onCreateAccount = async () => {
    if (!businessName || !fullName || !email || !phone || !password) {
      showAlert(t('auth.register.missingDetails'), t('auth.registerBusiness.missingDetailsMsg'));
      return;
    }
    if (password.length < 6) {
      showAlert(t('auth.register.weakPassword'), t('auth.register.weakPasswordMsg'));
      return;
    }
    if (password !== confirmPassword) {
      showAlert(t('auth.register.passwordMismatch'), t('auth.register.passwordMismatchMsg'));
      return;
    }
    setCreating(true);
    const result = await completeRegistration({
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      password,
    });
    if (!result.success) {
      setCreating(false);
      showAlert(t('auth.register.couldNotCreate'), result.error);
      return;
    }
    // No payment step and no email-verification step at signup — accounts
    // are created instantly. Any per-order platform fee/commission is
    // charged later, per package, once packages are defined.
    await finishAsOwner(result.user.id);
    setCreating(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </Pressable>

        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="store-plus-outline" size={34} color={colors.primary} />
        </View>
        <Text style={styles.title}>{t('auth.registerBusiness.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.registerBusiness.subtitle')}</Text>

        <View style={styles.form}>
          <Input label={t('auth.registerBusiness.businessName')} value={businessName} onChangeText={setBusinessName} placeholder={t('auth.registerBusiness.businessNamePlaceholder')} autoCapitalize="words" icon="store-outline" />
          <Input label={t('auth.registerBusiness.city')} value={city} onChangeText={setCity} placeholder={t('auth.registerBusiness.cityPlaceholder')} autoCapitalize="words" icon="map-marker-outline" autoComplete="off" />
          <Input label={t('auth.registerBusiness.yourFullName')} value={fullName} onChangeText={setFullName} placeholder={t('auth.registerBusiness.ownerNamePlaceholder')} autoCapitalize="words" icon="account-outline" />
          <Input label={t('auth.register.email')} value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" icon="email-outline" />
          <Input label={t('auth.register.phone')} value={phone} onChangeText={setPhone} placeholder="01xxxxxxxxx" keyboardType="phone-pad" icon="phone-outline" />
          <Input label={t('auth.register.password')} value={password} onChangeText={setPassword} placeholder={t('auth.register.passwordPlaceholder')} secureTextEntry icon="lock-outline" />
          <Input label={t('auth.register.confirmPassword')} value={confirmPassword} onChangeText={setConfirmPassword} placeholder={t('auth.register.confirmPasswordPlaceholder')} secureTextEntry icon="lock-check-outline" />
        </View>

        <Button title={t('auth.register.verifyAndCreate')} icon="check-decagram-outline" loading={creating} onPress={onCreateAccount} style={{ marginTop: spacing.sm }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: spacing.lg, gap: spacing.md },
    back: { alignSelf: 'flex-start' },
    iconWrap: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.sm,
    },
    title: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.text, marginTop: spacing.xs },
    subtitle: { fontSize: fontSize.body, color: colors.textSubtle, marginTop: -spacing.xs },
    form: { gap: spacing.md },
  });
