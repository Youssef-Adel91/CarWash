// Powered by OnSpace.AI
// Maps an OrderStatus to a coloured badge.
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing, fontSize, fontWeight, type lightColors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import type { TranslationKey } from '@/constants/translations';
import type { OrderStatus } from '@/services/types';

function getStatusMeta(colors: typeof lightColors): Record<OrderStatus, { color: string; bg: string }> {
  return {
    pending: { color: colors.warning, bg: colors.warningLight },
    accepted: { color: colors.primaryDark, bg: colors.primaryLight },
    on_the_way: { color: colors.primaryDark, bg: colors.primaryLight },
    washing: { color: colors.accent, bg: colors.primaryLight },
    completed: { color: colors.success, bg: colors.successLight },
    cancelled: { color: colors.danger, bg: colors.dangerLight },
  };
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const meta = getStatusMeta(colors)[status];
  return (
    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
      <View style={[styles.dot, { backgroundColor: meta.color }]} />
      <Text style={[styles.text, { color: meta.color }]}>{t(`order.statuses.${status}` as TranslationKey)}</Text>
    </View>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.pill,
      alignSelf: 'flex-start',
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
    text: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold },
  });
