// Powered by OnSpace.AI
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { radius, spacing, fontSize, fontWeight, shadow, type lightColors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { APP_CONFIG } from '@/constants/config';
import type { WashType } from '@/services/washService';

type Props = {
  wash: WashType;
  selected: boolean;
  onPress: () => void;
};

export function WashTypeCard({ wash, selected, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={wash.name}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.iconWrap, selected && styles.iconWrapSelected]}>
        <MaterialCommunityIcons
          name={wash.icon}
          size={26}
          color={selected ? colors.textOnPrimary : colors.primary}
        />
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{wash.name}</Text>
        <Text style={styles.desc} numberOfLines={2}>
          {wash.description}
        </Text>
        <View style={styles.metaRow}>
          <MaterialCommunityIcons name="clock-outline" size={13} color={colors.textMuted} />
          <Text style={styles.meta}>{wash.durationMin} min</Text>
        </View>
      </View>
      <View style={styles.priceCol}>
        <Text style={styles.price}>{wash.priceEgp}</Text>
        <Text style={styles.currency}>{APP_CONFIG.currency}</Text>
        {selected ? (
          <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} />
        ) : (
          <View style={styles.radio} />
        )}
      </View>
    </Pressable>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 2,
      borderColor: 'transparent',
      ...shadow.soft,
    },
    cardSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
    iconWrap: {
      width: 52,
      height: 52,
      borderRadius: radius.md,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconWrapSelected: { backgroundColor: colors.primary },
    info: { flex: 1, gap: 2 },
    name: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: colors.text },
    desc: { fontSize: fontSize.caption, color: colors.textSubtle, lineHeight: 18 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    meta: { fontSize: fontSize.caption, color: colors.textMuted },
    priceCol: { alignItems: 'center', gap: 2 },
    price: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.primaryDark },
    currency: { fontSize: 11, color: colors.textMuted, fontWeight: fontWeight.semibold },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.border,
    },
  });
