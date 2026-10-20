// Powered by OnSpace.AI
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { createWashType, deleteWashType, fetchWashTypes } from '@/services/washService';
import { spacing, radius, fontSize, fontWeight, type lightColors } from '@/constants/theme';
import { APP_CONFIG } from '@/constants/config';
import type { WashType } from '@/services/washService';

export default function AdminWashTypes() {
  const insets = useSafeAreaInsets();
  const { activeMembership } = useTenant();
  const { showAlert } = useAlert();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [items, setItems] = useState<WashType[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeMembership) return;
    setItems(await fetchWashTypes(activeMembership.tenantId));
  }, [activeMembership]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onCreate = async () => {
    if (!activeMembership || !name.trim() || !price.trim()) {
      showAlert(t('admin.washTypes.missingDetails'), t('admin.washTypes.missingDetailsMsg'));
      return;
    }
    setSaving(true);
    try {
      await createWashType({
        tenantId: activeMembership.tenantId,
        name: name.trim(),
        description: '',
        priceEgp: Number(price),
        durationMin: Number(duration) || 30,
      });
      setName('');
      setPrice('');
      setDuration('');
      load();
    } catch (e) {
      showAlert(t('admin.washTypes.couldNotSave'), (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (item: WashType) => {
    showAlert(t('admin.washTypes.removeService'), t('admin.washTypes.removeServiceMsg', { name: item.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.remove'),
        style: 'destructive',
        onPress: async () => {
          await deleteWashType(item.id);
          load();
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.title}>{t('admin.washTypes.title')}</Text>

      <Card style={styles.addCard}>
        <Text style={styles.sectionTitle}>{t('admin.washTypes.addService')}</Text>
        <Input label={t('admin.washTypes.name')} value={name} onChangeText={setName} placeholder={t('admin.washTypes.namePlaceholder')} />
        <View style={styles.row}>
          <View style={styles.flex}>
            <Input label={t('admin.washTypes.price', { currency: APP_CONFIG.currency })} value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="80" />
          </View>
          <View style={styles.flex}>
            <Input label={t('admin.washTypes.minutes')} value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholder="20" />
          </View>
        </View>
        <Button title={t('admin.washTypes.addServiceBtn')} icon="plus" loading={saving} onPress={onCreate} />
      </Card>

      <FlatList
        data={items}
        keyExtractor={(w) => w.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        renderItem={({ item }) => (
          <Card style={styles.itemCard}>
            <View style={styles.flex}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemMeta}>{item.durationMin} min</Text>
            </View>
            <Text style={styles.itemPrice}>
              {item.priceEgp} {APP_CONFIG.currency}
            </Text>
            {item.tenantId ? (
              <Pressable onPress={() => onDelete(item)} hitSlop={8} style={{ marginLeft: spacing.sm }}>
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.danger} />
              </Pressable>
            ) : null}
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
    row: { flexDirection: 'row', gap: spacing.md },
    flex: { flex: 1 },
    list: { gap: spacing.sm },
    itemCard: { flexDirection: 'row', alignItems: 'center' },
    itemName: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: colors.text },
    itemMeta: { fontSize: fontSize.caption, color: colors.textSubtle, marginTop: 2 },
    itemPrice: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: colors.primaryDark },
  });
