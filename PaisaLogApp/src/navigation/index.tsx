import React from 'react';
import { AccountSettingsScreen } from '../screens/account/AccountSettingsScreen';
import { RefundTrackerScreen } from '../screens/account/RefundTrackerScreen';
import { DeletedTransactionsScreen } from '../screens/account/DeletedTransactionsScreen';
import { TargetsScreen } from '../screens/account/TargetsScreen';
import { HiddenVaultScreen } from '../screens/account/HiddenVaultScreen';
import { LinkedAccountsScreen } from '../screens/account/LinkedAccountsScreen';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { C } from '../design/tokens';
import { OnboardingScreen } from '../screens/onboarding';
import { TabNavigator } from './TabNavigator';
import { AddScreen } from '../screens/add/AddScreen';
import { TxnDetailScreen } from '../screens/home/TxnDetailScreen';
import { CategoryScreen } from '../screens/spend/CategoryScreen';

const Stack = createStackNavigator();
export const navigationRef = createNavigationContainerRef<any>();

export function AppNavigator({
  isOnboarded,
  setIsOnboarded,
}: {
  isOnboarded: boolean;
  setIsOnboarded: (val: boolean) => void;
}) {
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false, cardStyle: { backgroundColor: C.pageBg }, gestureEnabled: true }}>
        {isOnboarded ? (
          <>
            <Stack.Screen name="Main" options={{ gestureEnabled: false }}>{(props) => <TabNavigator {...props} setIsOnboarded={setIsOnboarded} />}</Stack.Screen>
            <Stack.Screen name="AddTransaction" component={AddScreen} options={{ presentation: 'modal', cardStyle: { backgroundColor: C.pageBg } }} />
                      <Stack.Screen name="DeletedTransactions" component={DeletedTransactionsScreen} options={{ headerShown: false }} />
          <Stack.Screen name="RefundTracker" component={RefundTrackerScreen} options={{ headerShown: false }} />
          <Stack.Screen name="AccountSettings" component={AccountSettingsScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Targets" component={TargetsScreen} options={{ headerShown: false }} />
          <Stack.Screen name="HiddenVault" component={HiddenVaultScreen} options={{ headerShown: false }} />
          <Stack.Screen name="TransactionDetail" component={TxnDetailScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Category" component={CategoryScreen} />
          <Stack.Screen name="LinkedAccounts" component={LinkedAccountsScreen} options={{ headerShown: false }} />
          </>
        ) : (
          <Stack.Screen name="Onboarding" options={{ gestureEnabled: false }}>
            {(props) => <OnboardingScreen {...props} setIsOnboarded={setIsOnboarded} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
