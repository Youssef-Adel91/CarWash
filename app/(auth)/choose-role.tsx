// Powered by OnSpace.AI
// First step after "Create account": the user picks who they are before
// any form appears — a customer looking for a wash, or a mobile car-wash
// business signing up to take orders. Each card routes straight into the
// matching registration flow (register.tsx / register-business.tsx).
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { spacing, fontSize, fontWeight, radius, shadow, type lightColors } from '@/constants/theme';
import { APP_CONFIG } from '@/constants/config';

export default function ChooseRole() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
      <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
        <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
      </Pressable>

      <Text style={styles.title}>{t('chooseRole.title')}</Text>
      <Text style={styles.subtitle}>{t('chooseRole.subtitle', { appName: APP_CONFIG.name })}</Text>

      <View style={styles.cards}>
        <Pressable
          onPress={() => router.push('/(auth)/register')}
          style={({ pressed }) => [styles.card, shadow.card, pressed && styles.cardPressed]}
          accessibilityRole="button"
          accessibilityLabel={t('chooseRole.customerTitle')}
        >
          <View style={styles.cardIconWrap}>
            <MaterialCommunityIcons name="account-search-outline" size={30} color={colors.primary} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{t('chooseRole.customerTitle')}</Text>
            <Text style={styles.cardDesc}>{t('chooseRole.customerDesc')}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/(auth)/register-business')}
          style={({ pressed }) => [styles.card, shadow.card, pressed && styles.cardPressed]}
          accessibilityRole="button"
          accessibilityLabel={t('chooseRole.businessTitle')}
        >
          <View style={styles.cardIconWrap}>
            <MaterialCommunityIcons name="store-plus-outline" size={30} color={colors.primary} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>{t('chooseRole.businessTitle')}</Text>
            <Text style={styles.cardDesc}>{t('chooseRole.businessDesc')}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      <Pressable onPress={() => router.push('/(auth)/login')} style={styles.loginLink} hitSlop={8}>
        <Text style={styles.loginText}>{t('chooseRole.haveAccount')}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
    back: { alignSelf: 'flex-start' },
    title: { fontSize: fontSize.hero, fontWeight: fontWeight.bold, color: colors.text, marginTop: spacing.lg },
    subtitle: { fontSize: fontSize.body, color: colors.textSubtle, marginTop: spacing.xs, lineHeight: 22 },
    cards: { gap: spacing.md, marginTop: spacing.xl },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
    },
    cardPressed: { opacity: 0.85 },
    cardIconWrap: {
      width: 56,
      height: 56,
      borderRadius: radius.lg,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardText: { flex: 1, gap: 2 },
    cardTitle: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.bold, color: colors.text },
    cardDesc: { fontSize: fontSize.caption, color: colors.textSubtle, lineHeight: 18 },
    loginLink: { alignSelf: 'center', marginTop: spacing.xl, paddingVertical: spacing.sm },
    loginText: { fontSize: fontSize.caption, color: colors.primaryDark, fontWeight: fontWeight.semibold },
  });
