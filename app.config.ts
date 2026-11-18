import type { ExpoConfig } from 'expo/config'

const config: ExpoConfig = {
  name: 'Descreen',
  slug: 'descreen',
  scheme: 'descreen',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  platforms: ['android', 'web'],
  web: {
    bundler: 'metro',
    name: 'Descreen',
    shortName: 'Descreen',
    description: 'A calmer way to spend less time on your phone.',
    themeColor: '#080a08',
  },
  plugins: ['expo-router'],
  android: {
    package: 'com.descreen.app',
    permissions: ['PACKAGE_USAGE_STATS', 'FOREGROUND_SERVICE', 'POST_NOTIFICATIONS'],
  },
  experiments: { typedRoutes: true },
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  },
}

export default config
