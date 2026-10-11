import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { PaperProvider } from 'react-native-paper';
import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons';
import PartidosScreen from '../screens/PartidosScreen';
import TopAiScreen from '../screens/TopAiScreen';
import LiveScreen from '../screens/LiveScreen';
import SpecialsScreen from '../screens/SpecialsScreen';
import RendimientoScreen from '../screens/RendimientoScreen';
import { palette } from '../theme';
import type { AppConfig } from '../config';
import { DEFAULTS } from '../config';

const Tab = createBottomTabNavigator();

/**
 * Pestañas. "Top Ai"/"Especiales"/"En vivo" venian del original con
 * nombres de marketing; aqui se quedan solo los que tienen contenido
 * real. "Top AI" se llama "Analisis" porque no hay IA haciendo nada:
 * es estadistica medida, contada con honestidad.
 */

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: palette.accent,
    background: palette.bg,
    card: palette.surface,
    text: palette.text,
    border: palette.surfaceAlt,
    notification: palette.accent,
  },
};

export default function RootNavigator({ config = DEFAULTS }: { config?: AppConfig }) {
  return (
    <PaperProvider
      theme={{
        dark: true,
        colors: {
          primary: palette.accent,
          background: palette.bg,
          surface: palette.surface,
          surfaceVariant: palette.surfaceAlt,
          onSurface: palette.text,
          onSurfaceVariant: palette.textMuted,
          error: palette.danger,
        },
      }}
    >
      <NavigationContainer theme={navTheme}>
        <Tab.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: palette.surface },
            headerTitleStyle: { color: palette.text },
            tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.surfaceAlt },
            tabBarActiveTintColor: palette.accent,
            tabBarInactiveTintColor: palette.textMuted,
          }}
        >
          <Tab.Screen
            name="Partidos"
            component={PartidosScreen}
            options={{
              title: 'Partidos',
              tabBarIcon: ({ color, size }) => (
                <MaterialDesignIcons name="soccer" color={color} size={size} />
              ),
            }}
          />
          <Tab.Screen
            name="TopAi"
            component={TopAiScreen}
            options={{
              title: 'Análisis',
              tabBarIcon: ({ color, size }) => (
                <MaterialDesignIcons name="chart-bar" color={color} size={size} />
              ),
            }}
          />
          <Tab.Screen
            name="Live"
            component={LiveScreen}
            options={{
              title: 'En vivo',
              tabBarIcon: ({ color, size }) => (
                <MaterialDesignIcons name="radio" color={color} size={size} />
              ),
            }}
          />
          <Tab.Screen
            name="Specials"
            component={SpecialsScreen}
            options={{
              title: 'Especiales',
              tabBarIcon: ({ color, size }) => (
                <MaterialDesignIcons name="shield-check" color={color} size={size} />
              ),
            }}
          />
          <Tab.Screen
            name="Rendimiento"
            component={RendimientoScreen}
            options={{
              title: 'Rendimiento',
              tabBarIcon: ({ color, size }) => (
                <MaterialDesignIcons name="chart-line" color={color} size={size} />
              ),
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}