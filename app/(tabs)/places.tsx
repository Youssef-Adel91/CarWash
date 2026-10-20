// Powered by OnSpace.AI
// "Places" tab — browse/search the independent car-wash companies (tenants)
// available on the marketplace and pick which one to order from. This used
// to be a standalone screen forced on every customer before they could see
// anything else; it's now just one tab among Home/Places/Orders/Profile so
// the app opens on a general Home first (see index.tsx) and picking a
// company is something the customer does when they're ready, not a gate.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { listActiveTenants } from '@/services/tenantService';
import { gradients, spacing, radius, fontSize, fontWeight, shadow, type lightColors } from '@/constants/theme';
import { APP_CONFIG } from '@/constants/config';
import type { Tenant } from '@/services/types';

export default function Places() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectedTenant, selectTenant } = useTenant();
  const { user } = useAuth();
  const { colors, scheme } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      setTenants(await listActiveTenants(q));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const firstName = user?.fullName?.split(' ')[0]?.trim();

  const onPick = async (tenantId: string) => {
    await selectTenant(tenantId);
    router.push('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={scheme === 'dark' ? gradients.heroDark : gradients.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + spacing.md }]}
      >
        {firstName ? <Text style={styles.greeting}>{t('tenantSelect.greeting', { name: firstName })}</Text> : null}
        <Text style={[styles.title, !firstName && styles.titleNoGreeting]}>{t('tenantSelect.title')}</Text>
        <Text style={styles.subtitle}>{t('tenantSelect.subtitle', { appName: APP_CONFIG.name })}</Text>

        <View style={styles.searchField}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              load(v);
            }}
            placeholder={t('tenantSelect.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
        </View>
      </LinearGradient>

      {!loading && tenants.length > 0 ? (
        <Text style={styles.countLine}>{t('tenantSelect.companyCount', { count: tenants.length })}</Text>
      ) : null}

      {!loading && tenants.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="store-search-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>{t('tenantSelect.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={tenants}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
          renderItem={({ item }) => {
            const active = selectedTenant?.id === item.id;
            return (
              <Pressable onPress={() => onPick(item.id)}>
                <Card style={[styles.tenantCard, active && styles.tenantCardActive]}>
                  <View style={[styles.tenantIcon, active && styles.tenantIconActive]}>
                    <MaterialCommunityIcons name="car-wash" size={24} color={active ? colors.textOnPrimary : colors.primary} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.tenantName}>{item.name}</Text>
                    {item.city ? <Text style={styles.tenantCity}>{item.city}</Text> : null}
                  </View>
                  {active ? (
                    <MaterialCommunityIcons name="check-circle" size={22} color={colors.primary} />
                  ) : (
                    <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
                  )}
                </Card>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    hero: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.lg,
      borderBottomLeftRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
    },
    greeting: {
      fontSize: fontSize.caption,
      fontWeight: fontWeight.medium,
      color: colors.textOnPrimary,
      opacity: 0.85,
    },
    title: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.textOnPrimary, marginTop: 2 },
    titleNoGreeting: { marginTop: 0 },
    subtitle: { fontSize: fontSize.caption, color: colors.textOnPrimary, opacity: 0.85, marginTop: 2 },
    searchField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      height: 48,
      marginTop: spacing.md,
      ...shadow.soft,
    },
    searchInput: { flex: 1, fontSize: fontSize.body, color: colors.text },
    countLine: {
      fontSize: fontSize.caption,
      color: colors.textSubtle,
      fontWeight: fontWeight.medium,
      marginTop: spacing.md,
      marginHorizontal: spacing.md,
    },
    list: { gap: spacing.sm, marginTop: spacing.sm, paddingHorizontal: spacing.md },
    tenantCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...shadow.soft },
    tenantCardActive: { borderWidth: 1.5, borderColor: colors.primary },
    tenantIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tenantIconActive: { backgroundColor: colors.primary },
    tenantName: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: colors.text },
    tenantCity: { fontSize: fontSize.caption, color: colors.textSubtle, marginTop: 2 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    emptyText: { color: colors.textSubtle, fontSize: fontSize.body },
  });
