

# Fix: FUNCTION_PAYLOAD_TOO_LARGE Error in Mirror Room

## Problem Diagnosis

The `FUNCTION_PAYLOAD_TOO_LARGE` error occurs when the request body sent to a Supabase Edge Function exceeds the ~6MB limit. Based on the architecture review, there are two likely causes:

### Most Likely Cause: Audio Data Being Sent in Request Body

If Mirror Room's upload page is sending the actual audio file data in the request body (instead of just storage paths), this would cause the payload error. The correct flow should be:

1. Client uploads file to Supabase Storage first
2. Client sends only the **storage path strings** to the edge function
3. Edge function downloads files from storage internally

### Alternative Cause: Transcript Too Large

For very long calls, the transcript returned from `transcribe-audio` could be enormous, and when sent to `analyze-call`, it exceeds the payload limit.

---

## Solution: Two Changes Required

### Change 1: Ensure Files Are Uploaded to Storage First (Not Sent Inline)

In your Mirror Room `upload/page.tsx`, verify this flow:

```tsx
// CORRECT: Upload to storage first, then send path
const filePath = `${user.id}/${Date.now()}.wav`;
await supabase.storage.from('call-recordings').upload(filePath, file);

// Then call edge function with just the path
await supabase.functions.invoke('transcribe-audio', {
  body: { callId, filePath }  // Only sending string path, not file data
});
```

If your code looks like this instead, it's wrong:

```tsx
// WRONG: Sending file data in the request body
const base64Audio = await fileToBase64(file);
await supabase.functions.invoke('transcribe-audio', {
  body: { callId, audioData: base64Audio }  // This causes PAYLOAD_TOO_LARGE
});
```

### Change 2: Handle Large Transcripts for Analysis

Add chunking for the transcript when calling the analyze function:

In `TranscriptionContext.tsx`, before calling `analyze-call`:

```tsx
// Truncate transcript if too large (prevent payload error on analyze)
const MAX_TRANSCRIPT_CHARS = 500000; // ~500KB of text
const truncatedTranscript = transcript.length > MAX_TRANSCRIPT_CHARS 
  ? transcript.substring(0, MAX_TRANSCRIPT_CHARS) + '\n\n[Transcript truncated for analysis]'
  : transcript;

const { data: analyzeData, error: analyzeError } = await supabase.functions.invoke(
  'analyze-call',
  { body: { callId, transcript: truncatedTranscript } }
);
```

---

## Files to Check/Modify in Mirror Room

### 1. `app/upload/page.tsx` (or wherever your upload logic is)

Verify the upload flow:
- Files should be uploaded to Supabase Storage BEFORE calling the edge function
- Only string paths should be sent to `transcribe-audio`

### 2. `contexts/TranscriptionContext.tsx`

Add transcript size protection before calling `analyze-call`

### 3. `lib/audioCompression.ts`

Verify this file exists and is being used. It handles:
- Files over 10MB get compressed to 16kHz mono WAV
- Files are split into ~4MB chunks
- Each chunk is uploaded separately

---

## Quick Verification Checklist

1. Is `prepareAudio()` from `audioCompression.ts` being called for files > 10MB?
2. Are chunks being uploaded to storage (check network tab for storage uploads)?
3. Is the edge function being called with `filePath` or `filePaths` (string paths)?
4. Add console logs to verify what's being sent:

```tsx
// In upload page, before calling edge function:
console.log('Calling transcribe-audio with:', { callId, filePath });
console.log('FilePath type:', typeof filePath);
```

---

## Additional Safeguards to Add

### In `transcribe-audio/index.ts`

Add request size logging at the start:

```typescript
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const bodyText = await req.clone().text();
    console.log('Request body size:', bodyText.length, 'chars');
    
    const body = JSON.parse(bodyText);
    const { callId, filePath, filePaths } = body;
    
    // Validate we're receiving paths, not data
    if (body.audioData || body.audio || body.file) {
      throw new Error('Audio data should not be sent in request. Upload to storage first.');
    }
    // ... rest of function
```

This will help identify exactly what's being sent if the error persists.

---

## Summary

The `FUNCTION_PAYLOAD_TOO_LARGE` error is caused by sending actual file content in the edge function request instead of storage paths. 

**What needs to happen:**
1. Upload audio files to Supabase Storage first
2. Send only the storage path strings to the edge function
3. Edge function downloads files from storage internally

Double-check your Mirror Room implementation matches the template files in `MIRROR_ROOM_FILES/` - specifically the upload flow in `app/upload/page.tsx`.

