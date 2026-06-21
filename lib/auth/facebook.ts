import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../supabase';

interface FacebookSignInResult {
  success: boolean;
  isNewUser?: boolean;
  suggestedName?: string;
  avatarUrl?: string;
  cancelled?: boolean;
  error?: string;
}

export async function signInWithFacebook(): Promise<FacebookSignInResult> {
  try {
    const redirectTo = Linking.createURL('auth/callback');

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data?.url) {
      return { success: false, error: error?.message ?? 'Failed to start Facebook sign-in' };
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type !== 'success' || !result.url) {
      return { success: false, cancelled: true }; // user backed out — not an error
    }

    const { queryParams } = Linking.parse(result.url);

    if (queryParams?.error) {
      // e.g. user denied the "email"/"public_profile" permission
      return { success: false, cancelled: true };
    }

    const code = queryParams?.code as string | undefined;
    if (!code) {
      return { success: false, error: 'No authorization code returned from Facebook' };
    }

    const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError || !sessionData?.user) {
      return { success: false, error: exchangeError?.message ?? 'Failed to exchange code for session' };
    }

    const user = sessionData.user;

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    const isNewUser = !existingProfile;

    // TEMP — Facebook metadata key names unconfirmed. Check this log on first real
    // test, then delete it and the fallback chains below once you know what's real.
    console.log('Facebook user_metadata:', user.user_metadata);

    const metadata = user.user_metadata ?? {};
    const suggestedName = metadata.full_name ?? metadata.name ?? undefined;
    const avatarUrl = metadata.avatar_url ?? metadata.picture?.data?.url ?? metadata.picture ?? undefined;

    return { success: true, isNewUser, suggestedName, avatarUrl };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unexpected error during Facebook sign-in' };
  }
}