// Powered by OnSpace.AI
import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { spacing, fontSize, fontWeight, type lightColors } from '@/constants/theme';
import { APP_CONFIG } from '@/constants/config';

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = Dimensions.get('window');
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Image
        source={require('@/assets/images/onboarding.png')}
        style={[styles.hero, { height: Math.max(320, height * 0.62) }]}
        contentFit="cover"
        transition={250}
      />
      <LinearGradient
        colors={['transparent', 'rgba(240,247,251,0.7)', colors.background]}
        style={[styles.fade, { height: Math.max(320, height * 0.62) }]}
      />

      <View style={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.brandRow}>
          <MaterialCommunityIcons name="car-wash" size={26} color={colors.primary} />
          <Text style={styles.brand}>{APP_CONFIG.name}</Text>
        </View>
        <Text style={styles.title}>{t('onboarding.title')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.subtitle')}</Text>

        <View style={styles.actions}>
          <Button title={t('onboarding.createAccount')} icon="account-plus" onPress={() => router.push('/(auth)/choose-role')} />
          <Button title={t('onboarding.haveAccount')} variant="ghost" onPress={() => router.push('/(auth)/login')} />
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    hero: { width: '100%' },
    fade: { position: 'absolute', top: 0, left: 0, right: 0 },
    content: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: spacing.lg, gap: spacing.sm },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    brand: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.bold, color: colors.primaryDark },
    title: { fontSize: fontSize.hero, fontWeight: fontWeight.bold, color: colors.text, lineHeight: 38 },
    subtitle: { fontSize: fontSize.body, color: colors.textSubtle, lineHeight: 24, marginTop: spacing.xs },
    actions: { gap: spacing.sm, marginTop: spacing.lg },
  });
