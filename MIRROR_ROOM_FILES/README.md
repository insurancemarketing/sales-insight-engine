# Mirror Room Migration Files

This folder contains all the files you need to copy to your Mirror Room Next.js project.

## File Structure

```
MIRROR_ROOM_FILES/
├── lib/
│   ├── audioCompression.ts     → lib/audioCompression.ts
│   └── supabase.ts             → lib/supabase.ts (Clerk-aware client)
├── contexts/
│   └── TranscriptionContext.tsx → contexts/TranscriptionContext.tsx
├── components/
│   └── TranscriptionProgress.tsx → components/TranscriptionProgress.tsx
├── app/ (or pages/)
│   ├── upload/page.tsx          → app/upload/page.tsx
│   ├── history/page.tsx         → app/history/page.tsx
│   ├── analysis/[callId]/page.tsx → app/analysis/[callId]/page.tsx
│   └── dashboard/page.tsx       → app/dashboard/page.tsx (or integrate)
└── supabase/functions/
    ├── transcribe-audio/index.ts
    └── analyze-call/index.ts
```

## Quick Setup Checklist

1. [ ] Run the SQL migration (see MIRROR_ROOM_INTEGRATION_GUIDE.md)
2. [ ] Add `GOOGLE_GEMINI_API_KEY` secret in Supabase
3. [ ] Set up Clerk JWT template named `supabase`
4. [ ] Install: `npm install react-dropzone`
5. [ ] Copy all files from this folder
6. [ ] Wrap your app with `TranscriptionProvider`
7. [ ] Add `TranscriptionProgress` to your layout
8. [ ] Deploy edge functions: `supabase functions deploy`
