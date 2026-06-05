import { Stack, router } from 'expo-router'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
export const registeringFlag = { value: false }
export default function RootLayout() {
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/(tabs)/home')
      } else {
        router.replace('/(auth)/login')
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (registeringFlag.value) return
      if (session) {
        router.replace('/(tabs)/home')
      } else {
        router.replace('/(auth)/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return <Stack screenOptions={{ headerShown: false }} />
}