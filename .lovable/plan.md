
# Merge Sales Call Analysis into Mirror Room

This plan will add the sales call analysis feature as a new module within your existing Mirror Room project on Vercel.

---

## Overview

We'll export the core components, utilities, and edge functions from this project so you can integrate them into Mirror Room. The main consideration is that Mirror Room uses Clerk for authentication while this project uses Supabase Auth - we'll need to adapt the code to work with Clerk.

---

## What You'll Get

A new section in Mirror Room with:
- Upload interface for sales call recordings
- Background transcription with progress tracking
- AI-powered analysis using your Google Gemini API key
- Dashboard showing call history and analytics
- Detailed analysis view with sales psychology frameworks

---

## Integration Strategy

### Option A: Single Database (Recommended)
Use Mirror Room's existing Supabase database and add the new tables there. This keeps everything in one place.

### Option B: Separate Database
Keep this Lovable Cloud database and connect Mirror Room to it. This means maintaining two databases.

**Recommendation**: Option A is simpler for long-term maintenance.

---

## Step-by-Step Process

### Step 1: Export Database Schema

Run these SQL migrations in Mirror Room's Supabase database to add the required tables:

```text
-- Table for storing uploaded call recordings
CREATE TABLE sales_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,  -- Changed from UUID to TEXT for Clerk user IDs
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
  user_id TEXT NOT NULL,  -- Changed from UUID to TEXT for Clerk user IDs
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

-- RLS policies (using Clerk user IDs from JWT)
CREATE POLICY "Users can manage their own calls"
  ON sales_calls FOR ALL
  USING (user_id = auth.jwt()->>'sub')
  WITH CHECK (user_id = auth.jwt()->>'sub');

CREATE POLICY "Users can manage their own analyses"
  ON call_analyses FOR ALL
  USING (user_id = auth.jwt()->>'sub')
  WITH CHECK (user_id = auth.jwt()->>'sub');
```

### Step 2: Create Storage Bucket

In Mirror Room's Supabase dashboard, create a storage bucket called `call-recordings` (private).

### Step 3: Add Google API Key Secret

Add `GOOGLE_GEMINI_API_KEY` as a secret in Mirror Room's Supabase Edge Functions settings.

### Step 4: Copy Edge Functions

Copy these folders to Mirror Room's `supabase/functions/` directory:
- `transcribe-audio/`
- `analyze-call/`

### Step 5: Copy React Components

Copy these files to Mirror Room's source:

**Pages:**
- `src/pages/UploadCall.tsx` (rename as needed, e.g., `CallUpload.tsx`)
- `src/pages/AnalysisView.tsx`
- `src/pages/CallHistory.tsx`
- `src/pages/Dashboard.tsx` (or merge with existing dashboard)

**Components:**
- `src/components/TranscriptionProgress.tsx`

**Contexts:**
- `src/contexts/TranscriptionContext.tsx`

**Utilities:**
- `src/lib/audioCompression.ts`

### Step 6: Adapt Auth for Clerk

Replace Supabase Auth with Clerk in the copied components:

```text
Before (Supabase Auth):
import { useAuth } from '@/hooks/useAuth';
const { user } = useAuth();
// user.id

After (Clerk):
import { useUser } from '@clerk/clerk-react';
const { user } = useUser();
// user.id
```

### Step 7: Configure Supabase Client for Clerk

If not already done, configure Mirror Room's Supabase client to use Clerk JWT tokens. This typically involves:

```text
// In your Supabase client configuration
import { useAuth } from '@clerk/clerk-react';

// Get Clerk's Supabase token
const { getToken } = useAuth();
const token = await getToken({ template: 'supabase' });

// Use token with Supabase client
const supabase = createClient(url, anonKey, {
  global: {
    headers: { Authorization: `Bearer ${token}` }
  }
});
```

### Step 8: Add Routes

Add new routes to Mirror Room's router:

```text
/calls/upload → UploadCall component
/calls/history → CallHistory component
/calls/analysis/:callId → AnalysisView component
```

### Step 9: Add Navigation

Add links to the new Call Analysis section in Mirror Room's navigation menu.

---

## Files to Copy

| Source File | Purpose |
|-------------|---------|
| `src/pages/UploadCall.tsx` | Upload interface with drag-drop |
| `src/pages/AnalysisView.tsx` | Detailed analysis results |
| `src/pages/CallHistory.tsx` | List of past calls |
| `src/pages/Dashboard.tsx` | Overview stats (optional) |
| `src/components/TranscriptionProgress.tsx` | Floating progress indicator |
| `src/contexts/TranscriptionContext.tsx` | Background job management |
| `src/lib/audioCompression.ts` | Audio chunking utility |
| `supabase/functions/transcribe-audio/` | Transcription edge function |
| `supabase/functions/analyze-call/` | Analysis edge function |

---

## Dependencies to Add

Mirror Room may need these additional packages:

```text
react-dropzone (for file uploads)
```

Most other dependencies (like Radix UI) are likely already present if using shadcn/ui.

---

## Important Considerations

### Authentication Mapping
- This project uses Supabase Auth UUIDs for `user_id`
- Mirror Room uses Clerk string IDs
- The schema above uses `TEXT` for user_id to accommodate Clerk IDs

### Edge Function Authentication
- Edge functions use `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS
- They verify the call belongs to the user before processing
- No changes needed for Clerk compatibility in edge functions

### Storage Access
- Storage policies should allow authenticated users to upload to their own folder
- Pattern: `{userId}/{filename}`

---

## Alternative: Embed as Iframe

If deep integration is too complex, you could:
1. Deploy this app separately on Lovable
2. Embed it as an iframe within Mirror Room
3. Pass authentication tokens between apps

This is faster but provides a less seamless experience.

---

## Next Steps

1. **Choose integration approach** (full merge vs iframe)
2. If full merge:
   - Run the database migrations in Mirror Room's Supabase
   - Copy the files listed above
   - Adapt auth calls from Supabase to Clerk
   - Add routes and navigation
3. Deploy edge functions to Mirror Room's Supabase project
4. Test the full flow

Would you like me to prepare a downloadable package of all the files you need to copy, or help with any specific step of this integration?
