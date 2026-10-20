// Powered by OnSpace.AI
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTenant } from '@/contexts/TenantContext';
import { useAlert } from '@/template';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { addMemberByEmail, listMembers, removeMember } from '@/services/membershipService';
import { spacing, radius, fontSize, fontWeight, type lightColors } from '@/constants/theme';
import { APP_CONFIG } from '@/constants/config';
import type { TenantMembership } from '@/services/types';

export default function AdminWorkers() {
  const insets = useSafeAreaInsets();
  const { activeMembership } = useTenant();
  const { showAlert } = useAlert();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [members, setMembers] = useState<TenantMembership[]>([]);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!activeMembership) return;
    setMembers(await listMembers(activeMembership.tenantId, 'worker'));
  }, [activeMembership]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onAdd = async () => {
    if (!activeMembership || !email.trim()) return;
    setAdding(true);
    const result = await addMemberByEmail({ tenantId: activeMembership.tenantId, email: email.trim(), role: 'worker' });
    setAdding(false);
    if (!result.success) {
      showAlert(t('admin.workers.couldNotAdd'), result.error);
      return;
    }
    setEmail('');
    load();
  };

  const onRemove = (member: TenantMembership) => {
    showAlert(t('admin.workers.removeWorker'), t('admin.workers.removeWorkerMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: async () => {
          await removeMember(member.id);
          load();
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.title}>{t('admin.workers.title')}</Text>

      <Card style={styles.addCard}>
        <Text style={styles.sectionTitle}>{t('admin.workers.addWorker')}</Text>
        <Text style={styles.hint}>{t('admin.workers.hint', { appName: APP_CONFIG.name })}</Text>
        <View style={styles.addRow}>
          <View style={styles.flex}>
            <Input label={t('admin.workers.email')} value={email} onChangeText={setEmail} placeholder="worker@example.com" keyboardType="email-address" />
          </View>
        </View>
        <Button title={t('admin.workers.addWorkerBtn')} icon="account-plus-outline" loading={adding} onPress={onAdd} />
      </Card>

      <FlatList
        data={members}
        keyExtractor={(m) => m.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        renderItem={({ item }) => (
          <Card style={styles.memberCard}>
            <View style={[styles.dot, { backgroundColor: item.isOnline ? colors.success : colors.textMuted }]} />
            <View style={styles.flex}>
              <Text style={styles.memberVehicle}>{item.vehicle || t('admin.workers.noVehicle')}</Text>
              <Text style={styles.memberMeta}>
                {t('admin.workers.ratingOnline', {
                  rating: item.rating.toFixed(1),
                  status: item.isOnline ? t('admin.workers.online') : t('admin.workers.offline'),
                })}
              </Text>
            </View>
            <Pressable onPress={() => onRemove(item)} hitSlop={8}>
              <MaterialCommunityIcons name="account-remove-outline" size={20} color={colors.danger} />
            </Pressable>
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
    addCard: { gap: spacing.sm, marginBottom: spacing.md },
    sectionTitle: { fontSize: fontSize.section, fontWeight: fontWeight.semibold, color: colors.text },
    hint: { fontSize: fontSize.caption, color: colors.textMuted },
    addRow: { flexDirection: 'row', gap: spacing.sm },
    flex: { flex: 1 },
    list: { gap: spacing.sm },
    memberCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    dot: { width: 10, height: 10, borderRadius: 5 },
    memberVehicle: { fontSize: fontSize.body, fontWeight: fontWeight.medium, color: colors.text },
    memberMeta: { fontSize: fontSize.caption, color: colors.textSubtle, marginTop: 2 },
  });
