// Powered by OnSpace.AI
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '@/components/ui/Card';
import { OrderStatusBadge } from '@/components/feature/OrderStatusBadge';
import { useTenant } from '@/contexts/TenantContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getOrdersForTenant } from '@/services/orderService';
import { spacing, fontSize, fontWeight, type lightColors } from '@/constants/theme';
import { APP_CONFIG } from '@/constants/config';
import type { Order } from '@/services/types';

export default function AdminOrders() {
  const insets = useSafeAreaInsets();
  const { activeMembership } = useTenant();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [orders, setOrders] = useState<Order[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (activeMembership) getOrdersForTenant(activeMembership.tenantId).then(setOrders);
    }, [activeMembership]),
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.title}>{t('admin.orders.title')}</Text>
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.wash}>{item.washTypeName}</Text>
              <OrderStatusBadge status={item.status} />
            </View>
            <Text style={styles.address} numberOfLines={1}>
              {item.location.address}
            </Text>
            <View style={styles.rowBetween}>
              <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
              <Text style={styles.price}>
                {item.priceEgp} {APP_CONFIG.currency}
              </Text>
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
    title: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.md },
    list: { gap: spacing.sm },
    card: { gap: 4 },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    wash: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: colors.text },
    address: { fontSize: fontSize.caption, color: colors.textSubtle },
    date: { fontSize: fontSize.caption, color: colors.textMuted },
    price: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: colors.primaryDark },
  });
