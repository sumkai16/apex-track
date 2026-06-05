import { Stack, router } from 'expo-router'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { WeightUnitProvider } from '../lib/WeightUnitContext'

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (registeringFlag.value) return
      if (session) {
        router.replace('/(tabs)/home')
      } else {
        router.replace('/(auth)/login')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <WeightUnitProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </WeightUnitProvider>
  )
}