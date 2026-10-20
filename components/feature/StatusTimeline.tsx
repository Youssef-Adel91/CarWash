// Powered by OnSpace.AI
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { spacing, fontSize, fontWeight, type lightColors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import type { TranslationKey } from '@/constants/translations';
import type { OrderStatus } from '@/services/types';

type Step = {
  key: OrderStatus;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
};

const STEPS: Step[] = [
  { key: 'pending', icon: 'clipboard-check-outline' },
  { key: 'accepted', icon: 'account-check-outline' },
  { key: 'on_the_way', icon: 'car' },
  { key: 'washing', icon: 'car-wash' },
  { key: 'completed', icon: 'check-circle-outline' },
];

const ORDER: OrderStatus[] = ['pending', 'accepted', 'on_the_way', 'washing', 'completed'];

export function StatusTimeline({ status }: { status: OrderStatus }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const currentIndex = ORDER.indexOf(status);

  return (
    <View style={styles.container}>
      {STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        const reached = done || active;
        return (
          <View key={step.key} style={styles.row}>
            <View style={styles.railCol}>
              <View
                style={[
                  styles.node,
                  done && styles.nodeDone,
                  active && styles.nodeActive,
                ]}
              >
                <MaterialCommunityIcons
                  name={done ? 'check' : step.icon}
                  size={16}
                  color={reached ? colors.textOnPrimary : colors.textMuted}
                />
              </View>
              {index < STEPS.length - 1 ? (
                <View style={[styles.line, done && styles.lineDone]} />
              ) : null}
            </View>
            <Text style={[styles.label, active && styles.labelActive, done && styles.labelDone]}>
              {t(`order.timeline.${step.key}` as TranslationKey)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    container: { gap: 0 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    railCol: { alignItems: 'center' },
    node: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nodeDone: { backgroundColor: colors.success },
    nodeActive: { backgroundColor: colors.primary },
    line: { width: 2, height: 26, backgroundColor: colors.border, marginVertical: 2 },
    lineDone: { backgroundColor: colors.success },
    label: {
      fontSize: fontSize.body,
      color: colors.textMuted,
      paddingTop: 6,
      flex: 1,
    },
    labelActive: { color: colors.text, fontWeight: fontWeight.semibold },
    labelDone: { color: colors.textSubtle },
  });
