import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../global.css';

import { useColorScheme } from '@/hooks/useColorScheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  if (!loaded) {
    // Async font loading only occurs in development.
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
        <Stack.Screen name="login" options={{ title: 'Login' }} />
        <Stack.Screen name="users" options={{ title: 'Users' }} />
        <Stack.Screen name="users-profile" options={{ title: 'User Profile' }} />
        <Stack.Screen name="institutions" options={{ title: 'Institutions' }} />
        <Stack.Screen name="class-sections" options={{ title: 'Class Sections' }} />
        <Stack.Screen name="my-class-sections" options={{ title: 'My Class Sections' }} />
        <Stack.Screen name="students" options={{ title: 'Students' }} />
        <Stack.Screen name="staffs" options={{ title: 'Staffs' }} />
        <Stack.Screen name="roles" options={{ title: 'Roles' }} />
        <Stack.Screen name="subscriptions" options={{ title: 'Subscriptions' }} />
        <Stack.Screen name="assigned-subjects" options={{ title: 'Assigned Subjects' }} />
        <Stack.Screen name="teacher-attendance" options={{ title: 'Teacher Attendance' }} />
        <Stack.Screen name="consolidated-grades" options={{ title: 'Consolidated Grades' }} />
        <Stack.Screen name="sf9" options={{ title: 'SF9' }} />
        <Stack.Screen name="certificate-builder" options={{ title: 'Certificate Builder' }} />
        <Stack.Screen name="set-new-password" options={{ title: 'Set New Password' }} />
        <Stack.Screen name="teacher-attendance-demo" options={{ title: 'Teacher Attendance Demo' }} />
        <Stack.Screen name="class-section-detail" options={{ title: 'Class Section Detail' }} />
        <Stack.Screen name="subject-detail" options={{ title: 'Subject Detail' }} />
        <Stack.Screen name="section-grades" options={{ title: 'Section Grades' }} />
        <Stack.Screen name="student-detail" options={{ title: 'Student Detail' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
