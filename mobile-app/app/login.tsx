import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, TextInput, Pressable, ActivityIndicator, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = (): boolean => {
    const nextErrors: { email?: string; password?: string } = {};
    if (!email) {
      nextErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = 'Invalid email address';
    }
    if (!password) {
      nextErrors.password = 'Password is required';
    } else if (password.length < 6) {
      nextErrors.password = 'Password must be at least 6 characters';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const canSubmit = useMemo(() => email.length > 0 && password.length > 0 && !isSubmitting, [email, password, isSubmitting]);

  const handleSubmit = () => {
    if (!validate()) return;
    setIsSubmitting(true);
    // Placeholder submit; wire to real auth later
    setTimeout(() => setIsSubmitting(false), 1200);
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-indigo-50">
      <View className="flex-1 px-5 py-10 items-center justify-center">
        <View className="w-full max-w-md">
          {/* Header */}
          <View className="items-center">
            <View className="w-16 h-16 bg-indigo-600 rounded-2xl items-center justify-center shadow-lg">
              <Ionicons name="lock-closed" size={28} color="#fff" />
            </View>
            <Text className="mt-6 text-3xl font-extrabold text-gray-900">Welcome to Scholastic</Text>
            <Text className="mt-2 text-sm text-gray-600">Sign in to your account to continue</Text>
          </View>

          {/* Form */}
          <View className="mt-8 space-y-6">
            {/* Email */}
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-2">Email address</Text>
              <View className={`rounded-lg border ${errors.email ? 'border-red-300' : 'border-gray-300'} bg-white`}>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder="Enter your email"
                  className="px-4 py-3 text-gray-900"
                />
              </View>
              {errors.email ? <Text className="mt-2 text-sm text-red-600">{errors.email}</Text> : null}
            </View>

            {/* Password */}
            <View>
              <Text className="text-sm font-medium text-gray-700 mb-2">Password</Text>
              <View className={`rounded-lg border ${errors.password ? 'border-red-300' : 'border-gray-300'} bg-white`}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  autoComplete="password"
                  secureTextEntry
                  placeholder="Enter your password"
                  className="px-4 py-3 text-gray-900"
                />
              </View>
              {errors.password ? <Text className="mt-2 text-sm text-red-600">{errors.password}</Text> : null}
            </View>

            {/* Remember + Forgot */}
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Switch value={rememberMe} onValueChange={setRememberMe} thumbColor={rememberMe ? '#fff' : undefined} trackColor={{ false: '#d1d5db', true: '#4f46e5' }} />
                <Text className="ml-2 text-sm text-gray-900">Remember me</Text>
              </View>
              <Pressable>
                <Text className="text-sm font-medium text-indigo-600">Forgot password?</Text>
              </Pressable>
            </View>

            {/* Submit */}
            <View>
              <Pressable
                disabled={!canSubmit}
                onPress={handleSubmit}
                className={`w-full flex-row items-center justify-center py-3 px-4 rounded-lg ${canSubmit ? 'bg-indigo-600' : 'bg-indigo-400'} shadow-lg`}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <View className="flex-row items-center">
                    <Ionicons name="log-in" size={18} color="#c7d2fe" />
                    <Text className="ml-2 text-white text-sm font-medium">Sign in</Text>
                  </View>
                )}
              </Pressable>
            </View>

            {/* Footer */}
            <View className="items-center">
              <Text className="text-sm text-gray-600">
                Don't have an account? <Text className="font-medium text-indigo-600">Contact your administrator</Text>
              </Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}


