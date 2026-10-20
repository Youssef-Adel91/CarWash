// Powered by OnSpace.AI
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
import { useAlert } from '@/template';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { spacing, fontSize, fontWeight, type lightColors } from '@/constants/theme';
import { APP_CONFIG } from '@/constants/config';

export default function Register() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { completeRegistration } = useAuth();
  const { showAlert } = useAlert();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const onCreateAccount = async () => {
    if (!fullName || !email || !phone || !password) {
      showAlert(t('auth.register.missingDetails'), t('auth.register.missingDetailsMsg'));
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
    setCreating(false);
    if (!result.success) {
      showAlert(t('auth.register.couldNotCreate'), result.error);
      return;
    }
    // No payment step and no email-verification step at signup — accounts
    // are created instantly. Any per-order platform fee/commission (see
    // APP_CONFIG comment) is charged later, per package, once packages
    // are defined.
    router.replace('/(tabs)');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </Pressable>

        <Text style={styles.title}>{t('auth.register.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.register.subtitle', { appName: APP_CONFIG.name })}</Text>

        <View style={styles.form}>
          <Input label={t('auth.register.fullName')} value={fullName} onChangeText={setFullName} placeholder={t('auth.register.fullNamePlaceholder')} autoCapitalize="words" icon="account-outline" />
          <Input label={t('auth.register.email')} value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" icon="email-outline" />
          <Input label={t('auth.register.phone')} value={phone} onChangeText={setPhone} placeholder="01xxxxxxxxx" keyboardType="phone-pad" icon="phone-outline" />
          <Input label={t('auth.register.password')} value={password} onChangeText={setPassword} placeholder={t('auth.register.passwordPlaceholder')} secureTextEntry icon="lock-outline" />
          <Input label={t('auth.register.confirmPassword')} value={confirmPassword} onChangeText={setConfirmPassword} placeholder={t('auth.register.confirmPasswordPlaceholder')} secureTextEntry icon="lock-check-outline" />
        </View>

        <Button
          title={t('auth.register.verifyAndCreate')}
          icon="check-decagram-outline"
          loading={creating}
          onPress={onCreateAccount}
          style={{ marginTop: spacing.sm }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: spacing.lg, gap: spacing.md },
    back: { alignSelf: 'flex-start' },
    title: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.text, marginTop: spacing.xs },
    subtitle: { fontSize: fontSize.body, color: colors.textSubtle, marginTop: -spacing.xs },
    form: { gap: spacing.md },
  });
