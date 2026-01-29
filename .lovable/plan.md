

# Migration Guide: Sales Call Analysis Feature to Mirror Room

This guide covers everything you need to copy from this Lovable project to your existing Mirror Room Next.js project.

---

## Overview

You'll be migrating a complete sales call analysis feature that:
- Uploads audio files (with automatic compression for large files)
- Transcribes audio using Google Gemini AI
- Analyzes calls using sales psychology frameworks (Cialdini, Pitch Anything, etc.)
- Shows detailed analysis with actionable insights

---

## Files to Copy

### 1. React Components & Pages (7 files)

| Source File | Where to Put in Next.js |
|-------------|-------------------------|
| `src/pages/UploadCall.tsx` | `app/upload/page.tsx` or `pages/upload.tsx` |
| `src/pages/CallHistory.tsx` | `app/history/page.tsx` or `pages/history.tsx` |
| `src/pages/AnalysisView.tsx` | `app/analysis/[callId]/page.tsx` or `pages/analysis/[callId].tsx` |
| `src/pages/Dashboard.tsx` | `app/dashboard/page.tsx` or integrate into existing |
| `src/components/TranscriptionProgress.tsx` | `components/TranscriptionProgress.tsx` |
| `src/contexts/TranscriptionContext.tsx` | `contexts/TranscriptionContext.tsx` |
| `src/components/layout/DashboardLayout.tsx` | `components/layout/DashboardLayout.tsx` (or adapt to your existing layout) |

### 2. Utility Files (1 file)

| Source File | Where to Put |
|-------------|--------------|
| `src/lib/audioCompression.ts` | `lib/audioCompression.ts` |

### 3. Supabase Edge Functions (2 folders)

| Source Folder | Deploy to Mirror Room's Supabase |
|---------------|----------------------------------|
| `supabase/functions/transcribe-audio/` | Same path in your Supabase project |
| `supabase/functions/analyze-call/` | Same path in your Supabase project |

---

## Changes Required for Next.js + Clerk

Since Mirror Room uses Next.js and Clerk instead of Supabase Auth, you'll need to make these modifications:

### Authentication Changes

**Replace Supabase Auth imports with Clerk:**

```tsx
// BEFORE (Lovable/Supabase Auth)
import { useAuth } from '@/hooks/useAuth';
const { user } = useAuth();

// AFTER (Clerk)
import { useUser } from '@clerk/nextjs';
const { user, isLoaded } = useUser();
```

**User ID mapping:**
- Supabase uses UUID: `user.id`
- Clerk uses string: `user.id`

The database tables use `user_id TEXT` to work with Clerk.

### Supabase Client Changes

**Create a Clerk-aware Supabase client:**

```tsx
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '@clerk/nextjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Hook for authenticated requests
export function useSupabaseClient() {
  const { getToken } = useAuth();
  
  const getAuthenticatedClient = async () => {
    const token = await getToken({ template: 'supabase' });
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
  };
  
  return { supabase, getAuthenticatedClient };
}
```

### Router Changes

**Replace react-router-dom with Next.js router:**

```tsx
// BEFORE (React Router)
import { useNavigate, useParams, Link } from 'react-router-dom';
const navigate = useNavigate();
navigate('/analysis/' + id);

// AFTER (Next.js)
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
const router = useRouter();
router.push('/analysis/' + id);
```

---

## Database Setup

### SQL Migration (run in Supabase SQL Editor)

```sql
-- Create sales_calls table
CREATE TABLE IF NOT EXISTS public.sales_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  client_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  call_date TIMESTAMPTZ DEFAULT now(),
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create call_analyses table  
CREATE TABLE IF NOT EXISTS public.call_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.sales_calls(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
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
ALTER TABLE public.sales_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_analyses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Clerk JWT (using sub claim)
CREATE POLICY "Users can view own calls" ON public.sales_calls
  FOR SELECT USING (user_id = auth.jwt()->>'sub');

CREATE POLICY "Users can insert own calls" ON public.sales_calls
  FOR INSERT WITH CHECK (user_id = auth.jwt()->>'sub');

CREATE POLICY "Users can update own calls" ON public.sales_calls
  FOR UPDATE USING (user_id = auth.jwt()->>'sub');

CREATE POLICY "Users can delete own calls" ON public.sales_calls
  FOR DELETE USING (user_id = auth.jwt()->>'sub');

CREATE POLICY "Users can view own analyses" ON public.call_analyses
  FOR SELECT USING (user_id = auth.jwt()->>'sub');

CREATE POLICY "Users can insert own analyses" ON public.call_analyses
  FOR INSERT WITH CHECK (user_id = auth.jwt()->>'sub');

-- Create storage bucket for recordings
INSERT INTO storage.buckets (id, name, public)
VALUES ('call-recordings', 'call-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "Users can upload own recordings" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'call-recordings' 
    AND (storage.foldername(name))[1] = auth.jwt()->>'sub'
  );

CREATE POLICY "Users can read own recordings" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'call-recordings'
    AND (storage.foldername(name))[1] = auth.jwt()->>'sub'
  );
```

---

## Secrets to Add in Supabase

Add this secret in your Supabase project dashboard under Settings > Secrets:

| Secret Name | Value |
|-------------|-------|
| `GOOGLE_GEMINI_API_KEY` | Your Google AI API key |

---

## Clerk JWT Template Setup

In Clerk Dashboard, create a JWT template named `supabase`:

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

**Important:** Add your Supabase JWT secret as the signing key in Clerk.

---

## NPM Dependency to Install

```bash
npm install react-dropzone
```

---

## Step-by-Step Checklist

1. [ ] Run the SQL migration in your Supabase project
2. [ ] Add `GOOGLE_GEMINI_API_KEY` secret in Supabase
3. [ ] Create storage bucket `call-recordings` if not exists
4. [ ] Set up Clerk JWT template for Supabase
5. [ ] Install `react-dropzone`: `npm install react-dropzone`
6. [ ] Copy `audioCompression.ts` to `lib/`
7. [ ] Copy `TranscriptionContext.tsx` to `contexts/` (update imports)
8. [ ] Copy `TranscriptionProgress.tsx` to `components/` (update imports)
9. [ ] Copy edge functions to `supabase/functions/`
10. [ ] Deploy edge functions: `supabase functions deploy`
11. [ ] Create/adapt pages for Upload, History, Analysis
12. [ ] Update all `useAuth` to `useUser` from Clerk
13. [ ] Update all router imports to Next.js
14. [ ] Wrap your app with `TranscriptionProvider`
15. [ ] Add `TranscriptionProgress` component to your layout
16. [ ] Test the full upload and analysis flow

---

## Technical Details

### Audio Processing Flow

1. User drops audio file (up to 100MB)
2. Files >10MB are compressed client-side to 16kHz mono WAV
3. Large files are chunked into ~4MB segments
4. Each chunk is uploaded to Supabase Storage
5. `transcribe-audio` edge function processes chunks sequentially
6. Full transcript is sent to `analyze-call` for AI analysis
7. Results stored in `call_analyses` table

### Edge Function Memory Limits

The edge functions are designed to handle files within Supabase's memory constraints:
- Maximum segment size: 5MB
- Chunks are processed one at a time to avoid memory issues
- Base64 encoding adds ~33% overhead (4MB file becomes ~5.3MB encoded)

