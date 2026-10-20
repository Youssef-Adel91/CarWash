// Powered by OnSpace.AI
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/contexts/TenantContext';
import { useAlert } from '@/template';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { updateWorkerProfile } from '@/services/membershipService';
import { spacing, radius, fontSize, fontWeight, type lightColors } from '@/constants/theme';

export default function WorkerProfile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { activeMembership, refresh } = useTenant();
  const { showAlert } = useAlert();
  const { colors, mode, setMode } = useTheme();
  const { language, t, setLanguage } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [vehicle, setVehicle] = useState(activeMembership?.vehicle ?? '');
  const [saving, setSaving] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    Notifications.getPermissionsAsync()
      .then((res) => {
        if (active) setNotificationsEnabled(res.status === 'granted');
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const onSaveVehicle = async () => {
    if (!activeMembership) return;
    setSaving(true);
    await updateWorkerProfile(activeMembership.id, { vehicle });
    await refresh();
    setSaving(false);
  };

  const onLogout = () => {
    showAlert(t('profile.logoutConfirmTitle'), t('profile.logoutConfirmMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.logout'),
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/onboarding');
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: spacing.md, paddingTop: insets.top + spacing.md, gap: spacing.md }}
    >
      <Text style={styles.title}>{t('worker.profile.title')}</Text>

      <Card style={styles.row}>
        <MaterialCommunityIcons name="account" size={28} color={colors.primaryDark} />
        <View style={styles.flex}>
          <Text style={styles.name}>{user?.fullName}</Text>
          <Text style={styles.detail}>{activeMembership?.tenantName}</Text>
        </View>
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <Text style={styles.sectionTitle}>{t('worker.profile.vehicle')}</Text>
        <Input label={t('worker.profile.vehicle')} value={vehicle} onChangeText={setVehicle} placeholder={t('worker.profile.vehiclePlaceholder')} icon="car" />
        <Button title={t('common.save')} onPress={onSaveVehicle} loading={saving} variant="secondary" />
      </Card>

      <Card style={styles.row}>
        <MaterialCommunityIcons name="star" size={22} color={colors.warning} />
        <Text style={styles.detail}>{t('worker.profile.rating', { rating: (activeMembership?.rating ?? 5).toFixed(1) })}</Text>
      </Card>

      <Card style={styles.rowBetween}>
        <View style={styles.row}>
          <MaterialCommunityIcons name="bell-outline" size={20} color={colors.primary} />
          <Text style={styles.detail}>{t('common.notifications')}</Text>
        </View>
        <Text style={styles.detail}>
          {notificationsEnabled ? t('common.enabled') : t('common.disabledEnableInSettings')}
        </Text>
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <Text style={styles.sectionTitle}>{t('appearance.title')}</Text>
        <View style={styles.segment}>
          {(['light', 'dark', 'system'] as const).map((m) => {
            const active = mode === m;
            return (
              <Pressable key={m} onPress={() => setMode(m)} style={[styles.segmentItem, active && styles.segmentItemActive]}>
                <MaterialCommunityIcons
                  name={m === 'light' ? 'white-balance-sunny' : m === 'dark' ? 'weather-night' : 'theme-light-dark'}
                  size={16}
                  color={active ? colors.textOnPrimary : colors.textSubtle}
                />
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{t(`appearance.${m}`)}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <Text style={styles.sectionTitle}>{t('language.title')}</Text>
        <View style={styles.segment}>
          {(['en', 'ar'] as const).map((lng) => {
            const active = language === lng;
            return (
              <Pressable key={lng} onPress={() => setLanguage(lng)} style={[styles.segmentItem, active && styles.segmentItemActive]}>
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {lng === 'en' ? t('language.english') : t('language.arabic')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Button title={t('common.logout')} variant="secondary" icon="logout" onPress={onLogout} />
    </ScrollView>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    title: { fontSize: fontSize.title, fontWeight: fontWeight.bold, color: colors.text },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    flex: { flex: 1 },
    name: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.semibold, color: colors.text },
    detail: { fontSize: fontSize.caption, color: colors.textSubtle, marginTop: 2 },
    sectionTitle: { fontSize: fontSize.section, fontWeight: fontWeight.semibold, color: colors.text },
    segment: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4, gap: 4 },
    segmentItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 40,
      borderRadius: radius.sm,
    },
    segmentItemActive: { backgroundColor: colors.primary },
    segmentText: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold, color: colors.textSubtle },
    segmentTextActive: { color: colors.textOnPrimary },
  });
