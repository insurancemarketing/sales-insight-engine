// lib/supabase.ts
// Clerk-aware Supabase client for Mirror Room
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Basic client for public operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type for the getToken function from Clerk
type GetTokenFn = (options?: { template?: string }) => Promise<string | null>;

// Create an authenticated Supabase client with Clerk JWT
export async function createAuthenticatedClient(getToken: GetTokenFn): Promise<SupabaseClient> {
  const token = await getToken({ template: 'supabase' });
  
  if (!token) {
    throw new Error('No authentication token available');
  }
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

// Hook for use in React components
// Usage:
// import { useAuth } from '@clerk/nextjs';
// const { getToken } = useAuth();
// const supabase = await createAuthenticatedClient(getToken);
