# Mirror Room Integration Guide

This guide contains everything you need to add the Sales Call Analysis feature to your Mirror Room project on Vercel.

---

## Quick Start Checklist

- [ ] Run the database migration in Mirror Room's Supabase
- [ ] Create `call-recordings` storage bucket (private)
- [ ] Add `GOOGLE_GEMINI_API_KEY` secret to Edge Functions
- [ ] Copy the edge functions to `supabase/functions/`
- [ ] Copy the React components (adapted for Clerk)
- [ ] Add routes to your router
- [ ] Add navigation links
- [ ] Install `react-dropzone` if not already installed

---

## Step 1: Database Migration

Run this SQL in Mirror Room's Supabase SQL Editor:

```sql
-- Table for storing uploaded call recordings
CREATE TABLE sales_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,  -- TEXT for Clerk user IDs
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  client_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  call_date TIMESTAMPTZ DEFAULT now(),
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table for storing AI analysis results
CREATE TABLE call_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES sales_calls(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,  -- TEXT for Clerk user IDs
  transcript TEXT,
  outcome TEXT NOT NULL,
  outcome_score INTEGER,
  executive_summary TEXT,
  key_strengths JSONB DEFAULT '[]',
  areas_for_improvement JSONB DEFAULT '[]',
  missed_opportunities JSONB DEFAULT '[]',
  cialdini_principles JSONB DEFAULT '[]',
  pitch_framework_analysis JSONB,
  persuasion_techniques JSONB DEFAULT '[]',
  revival_strategies JSONB DEFAULT '[]',
  follow_up_script TEXT,
  key_moments JSONB DEFAULT '[]',
  client_objections JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE sales_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_analyses ENABLE ROW LEVEL SECURITY;

-- Create update_updated_at function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger for sales_calls
CREATE TRIGGER update_sales_calls_updated_at
  BEFORE UPDATE ON sales_calls
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS policies (using Clerk user IDs from JWT 'sub' claim)
CREATE POLICY "Users can manage their own calls"
  ON sales_calls FOR ALL
  USING (user_id = auth.jwt()->>'sub')
  WITH CHECK (user_id = auth.jwt()->>'sub');

CREATE POLICY "Users can manage their own analyses"
  ON call_analyses FOR ALL
  USING (user_id = auth.jwt()->>'sub')
  WITH CHECK (user_id = auth.jwt()->>'sub');
```

---

## Step 2: Create Storage Bucket

In Mirror Room's Supabase Dashboard:
1. Go to Storage
2. Create a new bucket called `call-recordings`
3. Keep it **private** (not public)
4. Add this storage policy:

```sql
-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload their own recordings"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'call-recordings' AND
    auth.jwt()->>'sub' = (storage.foldername(name))[1]
  );

-- Allow users to read their own recordings
CREATE POLICY "Users can read their own recordings"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'call-recordings' AND
    auth.jwt()->>'sub' = (storage.foldername(name))[1]
  );

-- Allow users to delete their own recordings
CREATE POLICY "Users can delete their own recordings"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'call-recordings' AND
    auth.jwt()->>'sub' = (storage.foldername(name))[1]
  );
```

---

## Step 3: Add Edge Function Secret

In Mirror Room's Supabase Dashboard:
1. Go to Edge Functions → Settings
2. Add secret: `GOOGLE_GEMINI_API_KEY` with your Google Gemini API key

---

## Step 4: Copy Edge Functions

Create these two folders in your Mirror Room project:

### `supabase/functions/transcribe-audio/index.ts`

(See the file in this project at `supabase/functions/transcribe-audio/index.ts`)

### `supabase/functions/analyze-call/index.ts`

(See the file in this project at `supabase/functions/analyze-call/index.ts`)

---

## Step 5: Copy React Files

### Files to Create

You need to create these files in Mirror Room. The key change is replacing Supabase Auth with Clerk:

**Auth Import Change:**
```tsx
// BEFORE (this project):
import { useAuth } from '@/hooks/useAuth';
const { user } = useAuth();
// user.id

// AFTER (for Clerk):
import { useUser } from '@clerk/clerk-react';
const { user } = useUser();
// user.id
```

### Required Files:

1. **`src/lib/audioCompression.ts`** - Copy as-is (no auth needed)
2. **`src/contexts/TranscriptionContext.tsx`** - Copy as-is (uses Supabase client)
3. **`src/components/TranscriptionProgress.tsx`** - Copy as-is
4. **`src/pages/calls/UploadCall.tsx`** - Adapt auth
5. **`src/pages/calls/AnalysisView.tsx`** - Adapt auth
6. **`src/pages/calls/CallHistory.tsx`** - Adapt auth
7. **`src/pages/calls/Dashboard.tsx`** (optional) - Adapt auth

---

## Step 6: Supabase Client for Clerk

If you haven't already configured your Supabase client to use Clerk JWTs, create a hook:

### `src/hooks/useSupabaseClient.ts`

```tsx
import { useAuth } from '@clerk/clerk-react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { useMemo } from 'react';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function useSupabaseClient(): SupabaseClient {
  const { getToken } = useAuth();

  const supabase = useMemo(() => {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        fetch: async (url, options = {}) => {
          const clerkToken = await getToken({ template: 'supabase' });
          const headers = new Headers(options?.headers);
          if (clerkToken) {
            headers.set('Authorization', `Bearer ${clerkToken}`);
          }
          return fetch(url, { ...options, headers });
        },
      },
    });
  }, [getToken]);

  return supabase;
}
```

**Note:** You need to configure a JWT template called "supabase" in your Clerk dashboard.

---

## Step 7: Adapted Components for Clerk

Here are the key files adapted for Clerk. Replace `import { useAuth }` with `import { useUser }` and use `user.id` for user IDs.

### Example: UploadCall.tsx adapted for Clerk

Key changes:
```tsx
// Change this:
import { useAuth } from '@/hooks/useAuth';

// To this:
import { useUser } from '@clerk/clerk-react';
import { useSupabaseClient } from '@/hooks/useSupabaseClient';

// And in the component:
// Change:
const { user } = useAuth();

// To:
const { user } = useUser();
const supabase = useSupabaseClient();
```

---

## Step 8: Add Routes

In your Mirror Room router, add:

```tsx
import UploadCall from '@/pages/calls/UploadCall';
import CallHistory from '@/pages/calls/CallHistory';
import AnalysisView from '@/pages/calls/AnalysisView';

// Add these routes:
<Route path="/calls/upload" element={<UploadCall />} />
<Route path="/calls/history" element={<CallHistory />} />
<Route path="/calls/analysis/:callId" element={<AnalysisView />} />
```

---

## Step 9: Add Navigation

Add links to your Mirror Room navigation:

```tsx
{ href: '/calls/upload', icon: Upload, label: 'Upload Call' },
{ href: '/calls/history', icon: History, label: 'Call History' },
```

---

## Step 10: Install Dependencies

```bash
npm install react-dropzone
# or
yarn add react-dropzone
# or
bun add react-dropzone
```

---

## File Reference

### Files to copy from this project:

| Source | Destination | Notes |
|--------|-------------|-------|
| `src/lib/audioCompression.ts` | `src/lib/audioCompression.ts` | Copy as-is |
| `src/contexts/TranscriptionContext.tsx` | `src/contexts/TranscriptionContext.tsx` | Update Supabase client import |
| `src/components/TranscriptionProgress.tsx` | `src/components/TranscriptionProgress.tsx` | Copy as-is |
| `src/pages/UploadCall.tsx` | `src/pages/calls/UploadCall.tsx` | Adapt for Clerk + your layout |
| `src/pages/AnalysisView.tsx` | `src/pages/calls/AnalysisView.tsx` | Adapt for Clerk + your layout |
| `src/pages/CallHistory.tsx` | `src/pages/calls/CallHistory.tsx` | Adapt for Clerk + your layout |
| `src/pages/Dashboard.tsx` | Optional | Merge stats into existing dashboard |
| `supabase/functions/transcribe-audio/` | `supabase/functions/transcribe-audio/` | Copy entire folder |
| `supabase/functions/analyze-call/` | `supabase/functions/analyze-call/` | Copy entire folder |

---

## Clerk JWT Template Setup

In your Clerk Dashboard, create a JWT template named "supabase":

1. Go to JWT Templates
2. Create new template with name: `supabase`
3. Use this template:

```json
{
  "aud": "authenticated",
  "role": "authenticated",
  "email": "{{user.primary_email_address}}",
  "sub": "{{user.id}}"
}
```

4. Set the signing key to your Supabase JWT secret (found in Supabase Project Settings → API → JWT Secret)

---

## Testing

After integration:

1. Log in to Mirror Room
2. Navigate to `/calls/upload`
3. Upload a test audio file (MP3, WAV, etc.)
4. Check that it uploads to storage and creates a `sales_calls` record
5. Verify transcription and analysis complete
6. View the analysis at `/calls/analysis/{callId}`

---

## Troubleshooting

### "Unauthorized" errors
- Check that your Clerk JWT template is configured correctly
- Verify the Supabase JWT secret matches in Clerk

### Edge function errors
- Check that `GOOGLE_GEMINI_API_KEY` is set in Supabase Edge Function secrets
- Check edge function logs in Supabase Dashboard

### Storage upload fails
- Verify the `call-recordings` bucket exists
- Check storage policies allow uploads from authenticated users

---

## Support

The original source code is in this Lovable project. All files listed above are available for copying.
