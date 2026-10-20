// Powered by OnSpace.AI
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { radius, spacing, fontSize, fontWeight, shadow, type lightColors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { APP_CONFIG } from '@/constants/config';
import { OrderStatusBadge } from './OrderStatusBadge';
import type { Order } from '@/services/types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function OrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.washTypeName}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.top}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="car-wash" size={22} color={colors.primary} />
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{order.washTypeName}</Text>
          <Text style={styles.date}>{formatDate(order.createdAt)}</Text>
        </View>
        <View style={styles.priceCol}>
          <Text style={styles.price}>
            {order.priceEgp} <Text style={styles.currency}>{APP_CONFIG.currency}</Text>
          </Text>
        </View>
      </View>
      <View style={styles.divider} />
      <View style={styles.bottom}>
        <View style={styles.locationRow}>
          <MaterialCommunityIcons name="map-marker" size={14} color={colors.textMuted} />
          <Text style={styles.location} numberOfLines={1}>
            {order.location.address}
          </Text>
        </View>
        <OrderStatusBadge status={order.status} />
      </View>
    </Pressable>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.soft },
    pressed: { opacity: 0.9 },
    top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    info: { flex: 1 },
    name: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: colors.text },
    date: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
    priceCol: { alignItems: 'flex-end' },
    price: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.bold, color: colors.primaryDark },
    currency: { fontSize: 11, color: colors.textMuted },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
    bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
    location: { fontSize: fontSize.caption, color: colors.textSubtle, flex: 1 },
  });
