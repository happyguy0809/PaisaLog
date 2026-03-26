import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Colors } from '../design/tokens';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { TabNavigator } from './TabNavigator';
import { AddTransactionScreen } from '../screens/AddTransactionScreen';
import { TransactionDetailScreen } from '../screens/TransactionDetailScreen';
import { CategoryScreen } from '../screens/CategoryScreen';

const Stack = createStackNavigator();

export function AppNavigator({
  isOnboarded,
  setIsOnboarded,
}: {
  isOnboarded: boolean;
  setIsOnboarded: (val: boolean) => void;
}) {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={isOnboarded ? 'Main' : 'Onboarding'}
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: Colors.bg.page },
          gestureEnabled: true,
        }}
      >
        <Stack.Screen
          name="Onboarding"
          options={{ gestureEnabled: false }}
        >
          {(props) => (
            <OnboardingScreen {...props} setIsOnboarded={setIsOnboarded} />
          )}
        </Stack.Screen>
        <Stack.Screen
          name="Main"
          component={TabNavigator}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen
          name="AddTransaction"
          component={AddTransactionScreen}
          options={{
            presentation: 'modal',
            cardStyle: { backgroundColor: Colors.bg.page },
          }}
        />
        <Stack.Screen
          name="TransactionDetail"
          component={TransactionDetailScreen}
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen
          name="Category"
          component={CategoryScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
