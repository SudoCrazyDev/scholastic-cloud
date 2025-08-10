import { Text, View } from "react-native";
import { Link } from "expo-router";
import "./global.css";
export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-xl font-bold text-blue-500">Welcome to Scholastic</Text>
      <Link href="/login" asChild>
        <Text className="mt-4 text-blue-600 underline">Go to Login</Text>
      </Link>
    </View>
  );
}
