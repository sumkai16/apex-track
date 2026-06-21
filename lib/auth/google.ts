import { supabase } from '@/lib/supabase';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

function extractIdToken(userInfo: any): string | undefined {
  return userInfo?.data?.idToken ?? userInfo?.idToken;
}
function extractGoogleName(userInfo: any): string | undefined {
  return userInfo?.data?.user?.name ?? userInfo?.user?.name;
}
function extractGoogleAvatar(userInfo: any): string | undefined {
  return userInfo?.data?.user?.photo ?? userInfo?.user?.photo;
}

export type GoogleSignInResult = {
  success: boolean;
  isNewUser: boolean;
  suggestedName?: string;
  avatarUrl?: string;
};

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  try {
    await GoogleSignin.signOut().catch(() => {});

    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();

    if (userInfo?.type === 'cancelled') {
      return { success: false, isNewUser: false };
    }

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
    let isNewUser = false;

    if (user) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();
      isNewUser = !existingProfile;
    }

    return {
      success: true,
      isNewUser,
      suggestedName: extractGoogleName(userInfo) ?? user?.email?.split('@')[0] ?? 'User',
      avatarUrl: extractGoogleAvatar(userInfo),
    };
  } catch (err: any) {
    if (err.code === statusCodes.SIGN_IN_CANCELLED) {
      return { success: false, isNewUser: false };
    }
    console.error('Google sign-in failed:', err);
    throw err;
  }
}

export async function signOutGoogle(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch (err) {
    console.warn('GoogleSignin.signOut() failed (likely no active session):', err);
  }
}