// Powered by OnSpace.AI
import React, { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions, type TextInputProps } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { radius, spacing, fontSize, fontWeight, type lightColors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

type Props = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  error?: string | null;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
  /**
   * Pass 'off' for a free-text field whose label/placeholder looks like an
   * address (e.g. "City") — otherwise Android's Autofill service (and
   * Gboard) can offer to "fill from Maps" on that field, which looks like
   * the field is trying to open a map by itself and confuses people.
   * Defaults to letting the OS decide, since most fields (name/email/
   * phone) benefit from normal autofill.
   */
  autoComplete?: TextInputProps['autoComplete'];
};

export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  icon,
  error,
  autoCapitalize = 'none',
  maxLength,
  autoComplete,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, !!error && styles.fieldError]}>
        {icon ? <MaterialCommunityIcons name={icon} size={20} color={colors.textMuted} /> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
          autoComplete={autoComplete}
          textContentType={autoComplete === 'off' ? 'none' : undefined}
          accessibilityLabel={label}
          style={styles.input}
        />
      </View>
      {error ? (
        <View style={styles.errorRow}>
          <MaterialCommunityIcons name="alert-circle" size={14} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    wrapper: { gap: spacing.xs },
    label: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold, color: colors.textSubtle },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      height: 52,
    },
    fieldError: { borderColor: colors.danger },
    input: {
      flex: 1,
      fontSize: fontSize.body,
      color: colors.text,
      padding: 0,
    },
    errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    errorText: { fontSize: fontSize.caption, color: colors.danger },
  });
