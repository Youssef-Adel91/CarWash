// Powered by OnSpace.AI
// Real map (react-native-maps) for pin selection + live worker tracking.
// react-native-maps has no web renderer, so on web we fall back to the
// stylised MapCanvas — everything still works there, just without real
// tiles. On Android a Google Maps API key is required for release builds:
// add it to app.json → android.config.googleMaps.apiKey (see README).
import React, { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { radius, type lightColors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { MapCanvas } from './MapCanvas';
import type { GeoLocation } from '@/services/types';

type Props = {
  height?: number;
  center: GeoLocation;
  interactive?: boolean;
  onPinMove?: (loc: { latitude: number; longitude: number }) => void;
  workerLocation?: { latitude: number; longitude: number } | null;
};

let MapView: any = null;
let Marker: any = null;
if (Platform.OS !== 'web') {
  // Lazy require so the web bundle never even tries to resolve the native module.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
}

export function LiveMap({ height = 220, center, interactive = false, onPinMove, workerLocation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (Platform.OS === 'web' || !MapView) {
    // Fallback pseudo-map for web / environments without native maps.
    return (
      <MapCanvas
        height={height}
        interactive={interactive}
        onPinMove={
          onPinMove
            ? (pos) =>
                onPinMove({
                  latitude: center.latitude + (0.5 - pos.y) * 0.01,
                  longitude: center.longitude + (pos.x - 0.5) * 0.01,
                })
            : undefined
        }
        worker={
          workerLocation
            ? {
                x: 0.5 + (workerLocation.longitude - center.longitude) / 0.01,
                y: 0.5 - (workerLocation.latitude - center.latitude) / 0.01,
              }
            : null
        }
      />
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: center.latitude,
          longitude: center.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        onPress={
          interactive
            ? (e: any) => onPinMove?.(e.nativeEvent.coordinate)
            : undefined
        }
      >
        <Marker coordinate={{ latitude: center.latitude, longitude: center.longitude }}>
          <MaterialCommunityIcons name="map-marker" size={36} color={colors.primary} />
        </Marker>
        {workerLocation ? (
          <Marker coordinate={workerLocation}>
            <View style={styles.workerDot}>
              <MaterialCommunityIcons name="car" size={16} color="#fff" />
            </View>
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}

const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    container: { borderRadius: radius.lg, overflow: 'hidden' },
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
  });
