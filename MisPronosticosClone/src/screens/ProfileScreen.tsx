import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, List, Surface, Text } from 'react-native-paper';
import { palette, radius, spacing } from '../theme';
import type { AppConfig } from '../config';
import { DEFAULTS } from '../config';

interface Props {
  config?: AppConfig;
}

export default function ProfileScreen({ config = DEFAULTS }: Props) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Surface elevation={1} style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.plan}>Plan</Text>
          <Text style={styles.planValue}>Free</Text>
        </View>
        <Button mode="contained" style={styles.cta} textColor={palette.bg}>
          Probar Premium
        </Button>
        <Text style={styles.muted}>Incluye trial de 2 dias</Text>
      </Surface>

      <Surface elevation={1} style={styles.card}>
        <List.Item
          title="Restaurar compras"
          titleStyle={styles.item}
          left={props => <List.Icon {...props} icon="restore" color={palette.accent} />}
          onPress={() => {}}
        />
        <List.Item
          title="Tus pronosticos guardados"
          titleStyle={styles.item}
          left={props => <List.Icon {...props} icon="bookmark" color={palette.accent} />}
          onPress={() => {}}
        />
        <List.Item
          title="Terminos y condiciones"
          titleStyle={styles.item}
          left={props => <List.Icon {...props} icon="file-document" color={palette.textMuted} />}
          onPress={() => {}}
        />
      </Surface>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: { padding: spacing.md, gap: spacing.md },
  title: { color: palette.text, fontWeight: '700' },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  plan: { color: palette.textMuted },
  planValue: { color: palette.text, fontWeight: '700' },
  cta: { backgroundColor: palette.accent, borderRadius: radius.md },
  muted: { color: palette.textMuted, textAlign: 'center' },
  item: { color: palette.text },
});