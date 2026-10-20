// Powered by OnSpace.AI
// Stylised, dependency-free map surface used for pin selection and live tracking.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { radius, type lightColors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

type Pos = { x: number; y: number };

type Props = {
  height?: number;
  interactive?: boolean;
  pin?: Pos;
  onPinMove?: (pos: Pos) => void;
  worker?: Pos | null;
};

export function MapCanvas({
  height = 220,
  interactive = false,
  pin = { x: 0.5, y: 0.5 },
  onPinMove,
  worker = null,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const wx = useRef(new Animated.Value(0)).current;
  const wy = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!worker || size.w === 0) return;
    Animated.timing(wx, {
      toValue: worker.x * size.w,
      duration: 1200,
      useNativeDriver: false,
    }).start();
    Animated.timing(wy, {
      toValue: worker.y * size.h,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, [worker?.x, worker?.y, size.w, size.h, wx, wy, worker]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    setSize({ w: width, h });
  };

  const handlePress = (e: GestureResponderEvent) => {
    if (!interactive || size.w === 0) return;
    const { locationX, locationY } = e.nativeEvent;
    const x = Math.min(1, Math.max(0, locationX / size.w));
    const y = Math.min(1, Math.max(0, locationY / size.h));
    onPinMove?.({ x, y });
  };

  const lines = [0.25, 0.5, 0.75];

  return (
    <Pressable onPress={handlePress} onLayout={onLayout} style={[styles.container, { height }]}>
      <LinearGradient colors={['#DCEFFB', '#BFE4F7']} style={StyleSheet.absoluteFill} />
      {lines.map((g) => (
        <View key={`h${g}`} style={[styles.hLine, { top: `${g * 100}%` }]} />
      ))}
      {lines.map((g) => (
        <View key={`v${g}`} style={[styles.vLine, { left: `${g * 100}%` }]} />
      ))}
      <View style={styles.roadH} />
      <View style={styles.roadV} />

      {size.w > 0 ? (
        <View style={[styles.pinWrap, { left: pin.x * size.w - 18, top: pin.y * size.h - 40 }]}>
          <MaterialCommunityIcons name="map-marker" size={38} color={colors.primary} />
          <View style={styles.pinShadow} />
        </View>
      ) : null}

      {worker && size.w > 0 ? (
        <Animated.View
          style={[styles.worker, { transform: [{ translateX: wx }, { translateY: wy }] }]}
        >
          <View style={styles.workerDot}>
            <MaterialCommunityIcons name="car" size={16} color="#fff" />
          </View>
        </Animated.View>
      ) : null}

      {interactive ? (
        <View style={styles.hint}>
          <MaterialCommunityIcons name="gesture-tap" size={14} color={colors.primaryDark} />
        </View>
      ) : null}
    </Pressable>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#BFE4F7',
  },
  hLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  vLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  roadH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '58%',
    height: 14,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  roadV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '32%',
    width: 14,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  pinWrap: { position: 'absolute', alignItems: 'center' },
  pinShadow: {
    width: 10,
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(15,42,61,0.25)',
    marginTop: -2,
  },
  worker: { position: 'absolute', marginLeft: -14, marginTop: -14 },
  workerDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  hint: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 999,
    padding: 6,
  },
});
