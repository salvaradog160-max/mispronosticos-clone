import React from 'react';
import { View, StyleSheet } from 'react-native';
import { palette, radius } from '../theme';

/**
 * Barra de confianza propia. El ProgressBar de react-native-paper no
 * pinta con progress=0 ni dentro de filas; esta siempre se ve.
 */
export const BarraConfianza = ({
  progress,
  color = palette.accent,
  height = 3,
}: {
  progress: number;
  color?: string;
  height?: number;
}) => {
  const ancho = Math.max(0, Math.min(1, progress));
  return (
    <View style={[styles.track, { height, borderRadius: height }]}>
      <View
        style={{
          width: `${ancho * 100}%`,
          height,
          borderRadius: height,
          backgroundColor: color,
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: palette.surfaceAlt,
    overflow: 'hidden',
    borderRadius: radius.sm,
  },
});
