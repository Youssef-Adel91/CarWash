// Powered by OnSpace.AI
// Full-screen WebView modal that hosts Paymob's Unified Checkout page.
// Used whenever APP_CONFIG.paymentProvider === 'paymob'. The actual
// success/failure is decided by the paymob-webhook edge function updating
// the `payments` row — this component just shows the checkout UI and lets
// the caller know when the sheet is dismissed.
import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type lightColors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

type Props = {
  visible: boolean;
  checkoutUrl: string | null;
  onClose: () => void;
};

export function PaymobCheckoutSheet({ visible, checkoutUrl, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close checkout">
          <MaterialCommunityIcons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>
      {checkoutUrl ? (
        <WebView source={{ uri: checkoutUrl }} style={styles.flex} startInLoadingState />
      ) : null}
    </Modal>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    header: {
      paddingHorizontal: 16,
      paddingBottom: 8,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    closeBtn: { alignSelf: 'flex-end' },
  });
