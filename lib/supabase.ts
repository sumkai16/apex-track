import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const supabaseUrl = "https://vaqivrymjwlnlrxsducb.supabase.co";

// KEPT STRONGLY ON A SINGLE LINE - NO SPACES OR NEWLINES
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhcWl2cnltandsbmxyeHNkdWNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNDU1NjksImV4cCI6MjA5NTcyMTU2OX0.x-lu_ld60RpW-eyteyobizyhyFSDcREXp9s0Jm-u4UM";

const authOptions: any = {
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: false,
};

// Safely assign AsyncStorage for native platforms
if (Platform.OS !== "web") {
  authOptions.storage = AsyncStorage;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: authOptions,
});
