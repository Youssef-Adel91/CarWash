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

export default function Login() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const { showAlert } = useAlert();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!email || !password) {
      showAlert(t('auth.login.missingDetails'), t('auth.login.missingDetailsMsg'));
      return;
    }
    setLoading(true);
    const result = await login(email.trim(), password);
    setLoading(false);
    if (!result.success) {
      showAlert(t('auth.login.failedTitle'), result.error);
      return;
    }
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
          { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </Pressable>

        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="car-wash" size={34} color={colors.primary} />
        </View>
        <Text style={styles.title}>{t('auth.login.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.login.subtitle')}</Text>

        <View style={styles.demoBanner}>
          <MaterialCommunityIcons name="information-outline" size={16} color={colors.primaryDark} />
          <Text style={styles.demoText}>{t('auth.login.demoBanner')}</Text>
        </View>

        <View style={styles.form}>
          <Input
            label={t('auth.login.email')}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            icon="email-outline"
          />
          <Input
            label={t('auth.login.password')}
            value={password}
            onChangeText={setPassword}
            placeholder={t('auth.login.password')}
            secureTextEntry
            icon="lock-outline"
          />
          <Button title={t('auth.login.submit')} loading={loading} onPress={onSubmit} />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('auth.login.newHere')}</Text>
          <Pressable onPress={() => router.replace('/(auth)/register')} hitSlop={8}>
            <Text style={styles.link}>{t('auth.login.createAccount')}</Text>
          </Pressable>
        </View>
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
    title: { fontSize: fontSize.hero, fontWeight: fontWeight.bold, color: colors.text },
    subtitle: { fontSize: fontSize.body, color: colors.textSubtle, marginTop: -spacing.xs },
    demoBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.primaryLight,
      padding: spacing.sm,
      borderRadius: 12,
    },
    demoText: { fontSize: fontSize.caption, color: colors.primaryDark, flex: 1 },
    form: { gap: spacing.md, marginTop: spacing.sm },
    footer: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.md },
    footerText: { color: colors.textSubtle, fontSize: fontSize.body },
    link: { color: colors.primary, fontWeight: fontWeight.semibold, fontSize: fontSize.body },
  });
