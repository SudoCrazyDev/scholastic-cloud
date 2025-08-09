import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View className="flex-1 items-center justify-center bg-white dark:bg-black">
        <Text className="text-lg text-black dark:text-white">This screen doesn&apos;t exist.</Text>
        <Link href="/" className="mt-4 text-blue-600">
          Go to home screen!
        </Link>
      </View>
    </>
  );
}
