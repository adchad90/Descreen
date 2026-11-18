import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { createClient } from '@supabase/supabase-js'

type ExpoExtras = { supabaseUrl?: string; supabaseAnonKey?: string }
const extras = Constants.expoConfig?.extra as ExpoExtras | undefined
const supabaseUrl = extras?.supabaseUrl
const supabaseAnonKey = extras?.supabaseAnonKey

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null
