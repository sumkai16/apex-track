import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://vaqivrymjwlnlrxsducb.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhcWl2cnltandsbmxyeHNkdWNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNDU1NjksImV4cCI6MjA5NTcyMTU2OX0.x-lu_ld60RpW-eyteyobizyhyFSDcREXp9s0Jm-u4UM'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
})