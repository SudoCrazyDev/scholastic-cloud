import { ScrollView, View, Text } from 'react-native';

export default function LoginScreen() {
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-white dark:bg-black">
      <View className="flex-1 p-4">
        <Text className="text-2xl font-bold text-black dark:text-white">Login</Text>
        <Text className="mt-2 text-gray-600 dark:text-gray-300">Mobile placeholder for Login.</Text>
      </View>
    </ScrollView>
  );
}