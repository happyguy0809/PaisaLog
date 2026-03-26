// src/navigation/TabNavigator.tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { C, F } from '../design/tokens';
import { SelfScreen }   from '../screens/self/SelfScreen';
import { FamilyScreen } from '../screens/family/FamilyScreen';
import { ToolsScreen }  from '../screens/tools/ToolsScreen';
import { AccountScreen } from '../screens/account/AccountScreen';

const Tab = createBottomTabNavigator();

const ICONS: Record<string, string> = {
  Self: '◉', Family: '⊕', Tools: '⚒', Account: '◎',
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: focused ? 18 : 16, color: focused ? C.accent : C.textTertiary }}>
      {ICONS[name] ?? 'o'}
    </Text>
  );
}

export function TabNavigator({ setIsOnboarded }: { setIsOnboarded: (v: boolean) => void }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.cardBg,
          borderTopColor: C.borderFaint,
          borderTopWidth: 0.5,
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontFamily: F.medium, fontSize: 11 },
        tabBarActiveTintColor:   C.accent,
        tabBarInactiveTintColor: C.textTertiary,
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
      })}
    >
      <Tab.Screen name="Self"    component={SelfScreen} />
      <Tab.Screen name="Family"  component={FamilyScreen} />
      <Tab.Screen name="Tools"   component={ToolsScreen} />
      <Tab.Screen name="Account">{(props) => <AccountScreen {...props} setIsOnboarded={setIsOnboarded} />}</Tab.Screen>
    </Tab.Navigator>
  );
}
