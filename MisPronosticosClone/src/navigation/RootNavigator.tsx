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
import ProfileScreen from '../screens/ProfileScreen';
import HerramientaScreen from '../screens/HerramientaScreen';
import { palette } from '../theme';
import type { AppConfig } from '../config';
import { DEFAULTS, SOLO_HERRAMIENTA } from '../config';

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

const paperTheme = {
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
};

export default function RootNavigator({ config = DEFAULTS }: { config?: AppConfig }) {
  void config;
  if (SOLO_HERRAMIENTA) {
    return (
      <PaperProvider theme={paperTheme}>
        <HerramientaScreen pantallaCompleta />
      </PaperProvider>
    );
  }
  return (
    <PaperProvider theme={paperTheme}>
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
          <Tab.Screen
            name="Herramienta"
            component={HerramientaScreen}
            options={{
              title: 'Herramienta',
              tabBarIcon: ({ color, size }) => (
                <MaterialDesignIcons name="calculator-variant" color={color} size={size} />
              ),
            }}
          />
          <Tab.Screen
            name="Perfil"
            component={ProfileScreen}
            options={{
              title: 'Perfil',
              tabBarIcon: ({ color, size }) => (
                <MaterialDesignIcons name="account" color={color} size={size} />
              ),
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}