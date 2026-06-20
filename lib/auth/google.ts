import { supabase } from '@/lib/supabase';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

// Library version ambiguity (flagged in Step 7) — consolidated here so it's
// only handled in one place instead of duplicated per call site.
function extractIdToken(userInfo: any): string | undefined {
  return userInfo?.data?.idToken ?? userInfo?.idToken;
}
function extractGoogleName(userInfo: any): string | undefined {
  return userInfo?.data?.user?.name ?? userInfo?.user?.name;
}

// Returns true on successful sign-in, false on user cancellation,
// throws on real errors. Callers must check the return value before
// navigating — cancellation and success both resolve without throwing.
export async function signInWithGoogle(): Promise<boolean> {
  try {
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();

    const idToken = extractIdToken(userInfo);
    if (!idToken) {
      throw new Error('No ID token returned from Google Sign-In');
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) throw error;

    const user = data.user;
    if (user) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (!existingProfile) {
        await supabase.from('profiles').insert({
          id: user.id,
          display_name:
            extractGoogleName(userInfo) ?? user.email?.split('@')[0] ?? 'User',
        });
      }
    }

    return true;
  } catch (err: any) {
    if (err.code === statusCodes.SIGN_IN_CANCELLED) {
      return false;
    }
    console.error('Google sign-in failed:', err);
    throw err;
  }
}