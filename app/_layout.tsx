import { Stack, router } from 'expo-router'
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

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
      if (session) {
        router.replace('/')
      } else {
        router.replace('/(auth)/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return <Stack screenOptions={{ headerShown: false }} />
}