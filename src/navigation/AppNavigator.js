import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HomeScreen from "../screens/HomeScreen";
import AnalyticsScreen from "../screens/AnalyticsScreen";
import InsightsScreen from "../screens/InsightsScreen";
import ProfileScreen from "../screens/ProfileScreen";
import JournalChatScreen from "../screens/JournalChatScreen";
import CircleScreen from "../screens/CircleScreen";
import { COLORS } from "../constants/colors";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  const insets = useSafeAreaInsets();

  const getTabIcon = (routeName, focused, color, size) => {
    if (routeName === "Home") {
      return (
        <Ionicons
          name={focused ? "home" : "home-outline"}
          size={size}
          color={color}
        />
      );
    }
    if (routeName === "Analytics") {
      return (
        <Ionicons
          name={focused ? "stats-chart" : "stats-chart-outline"}
          size={size}
          color={color}
        />
      );
    }
    if (routeName === "Journal") {
      return (
        <Ionicons
          name={focused ? "chatbubbles" : "chatbubbles-outline"}
          size={size}
          color={color}
        />
      );
    }
    if (routeName === "Circle") {
      return (
        <Ionicons
          name={focused ? "people" : "people-outline"}
          size={size}
          color={color}
        />
      );
    }
    return (
      <Ionicons
        name={focused ? "bulb" : "bulb-outline"}
        size={size}
        color={color}
      />
    );
  };

  return (
    <Tab.Navigator
      screenOptions={({ route, navigation }) => ({
        headerTitleAlign: "left",
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { color: "#FFFFFF", fontWeight: "700", fontSize: 22 },
        headerLeftContainerStyle: { paddingLeft: 20 },
        headerRightContainerStyle: { paddingRight: 30 },
        headerShadowVisible: false,
        headerRight: () => {
          const parent = navigation.getParent();
          return (
            <Pressable onPress={() => parent?.navigate("Profile")}>
              <Ionicons
                name="person-circle-outline"
                size={38}
                color="#FFFFFF"
              />
            </Pressable>
          );
        },
        tabBarStyle: {
          backgroundColor: COLORS.primary,
          borderTopColor: COLORS.primary,
          height: 62 + insets.bottom,
          paddingBottom: Math.max(8, insets.bottom),
          paddingTop: 8,
        },
        tabBarHideOnKeyboard: true,
        tabBarItemStyle: { paddingVertical: 2 },
        tabBarShowLabel: false,
        tabBarIconStyle: { marginTop: 2 },
        tabBarIcon: ({ focused, color, size }) =>
          getTabIcon(route.name, focused, color, size),
        tabBarActiveTintColor: "#FFFFFF",
        tabBarInactiveTintColor: "rgba(255,255,255,0.72)",
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Journal" component={JournalChatScreen} />
      <Tab.Screen name="Circle" component={CircleScreen} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
      <Tab.Screen name="Insights" component={InsightsScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator({ needsProfileSetup = false }) {
  return (
    <Stack.Navigator
      initialRouteName={needsProfileSetup ? "ProfileSetup" : "MainTabs"}
      screenOptions={{
        headerTitleAlign: "left",
        headerStyle: { backgroundColor: COLORS.primary },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { color: "#FFFFFF", fontWeight: "700", fontSize: 22 },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ProfileSetup"
        component={ProfileScreen}
        initialParams={{ forceOnboarding: true }}
        options={{
          title: "Complete Profile",
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}
