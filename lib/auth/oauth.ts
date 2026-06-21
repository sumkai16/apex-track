import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "../supabase";

// Tell WebBrowser to complete the auth session if redirecting back to the app on web/some platforms
WebBrowser.maybeCompleteAuthSession();

// Helper to extract access_token and refresh_token from url
function extractParamsFromUrl(url: string): { access_token?: string; refresh_token?: string } {
  const params: { access_token?: string; refresh_token?: string } = {};

  // Try parsing hash parameters (Supabase default)
  const hashIndex = url.indexOf("#");
  if (hashIndex !== -1) {
    const hash = url.substring(hashIndex + 1);
    const pairs = hash.split("&");
    for (const pair of pairs) {
      const [key, value] = pair.split("=");
      if (key === "access_token") params.access_token = decodeURIComponent(value);
      if (key === "refresh_token") params.refresh_token = decodeURIComponent(value);
    }
  }

  // Try query parameters just in case
  const queryIndex = url.indexOf("?");
  if (queryIndex !== -1) {
    const query = url.substring(queryIndex + 1);
    const pairs = query.split("&");
    for (const pair of pairs) {
      const [key, value] = pair.split("=");
      if (key === "access_token") params.access_token = decodeURIComponent(value);
      if (key === "refresh_token") params.refresh_token = decodeURIComponent(value);
    }
  }

  return params;
}

export async function signInWithGoogle(): Promise<boolean> {
  // Linking.createURL will automatically determine the scheme depending on the environment:
  // - In Expo Go: exp://192.168.x.x:8081
  // - In Standalone build: apextrack://
  const redirectTo = Linking.createURL("home");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    throw error;
  }

  if (!data?.url) {
    throw new Error("No URL returned from Supabase OAuth sign-in");
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === "success") {
    const { url } = result;
    const { access_token, refresh_token } = extractParamsFromUrl(url);

    if (access_token && refresh_token) {
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      if (setSessionError) {
        throw setSessionError;
      }
      return true;
    } else {
      throw new Error("Could not parse access token and refresh token from redirect URL");
    }
  }

  return false;
}
