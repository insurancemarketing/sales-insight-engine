# Clerk JWT Template for Supabase

Create this JWT template in your Clerk Dashboard:

## Steps:
1. Go to Clerk Dashboard → JWT Templates
2. Click "New template"
3. Name it: `supabase`
4. Add the following claims:

```json
{
  "aud": "authenticated",
  "role": "authenticated",
  "sub": "{{user.id}}",
  "email": "{{user.primary_email_address}}",
  "exp": "{{jwt.exp}}",
  "iat": "{{jwt.iat}}"
}
```

## Important: Add Signing Key
1. Go to your Supabase project → Settings → API
2. Copy the "JWT Secret" 
3. In Clerk JWT Template, set the "Signing key" to this JWT Secret

This allows Supabase to verify JWTs issued by Clerk.

## Environment Variables
Add these to your Next.js `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Supabase Secrets
Add this secret in your Supabase project dashboard (Settings → Secrets):

```
GOOGLE_GEMINI_API_KEY=your-google-gemini-api-key
```

Get a Google Gemini API key from: https://aistudio.google.com/app/apikey
