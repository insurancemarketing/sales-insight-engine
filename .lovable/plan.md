
## What’s happening (why you’re seeing “Transcription failed: 400”)

Your backend function `transcribe-audio` downloads the audio file (or WAV chunk), converts it to Base64, then sends it to Lovable AI as `input_audio`.

Right now the Base64 encoding logic is **incorrect**:

- It Base64-encodes the audio **in multiple independent pieces** using `btoa(...)`
- Then it **concatenates those Base64 strings**
- Concatenating separately-encoded Base64 segments does **not** produce valid Base64 for the full file

So the AI provider receives a Base64 string that looks “mostly right” but has invalid padding/structure in the middle → provider rejects it with HTTP 400 → your function returns 500 with `Transcription failed: 400`.

This matches the earlier log you had:
> “Base64 decoding failed … inline_data.data …”

## Goals

1. Fix the Base64 encoding so the audio payload is valid.
2. Prevent “too big once Base64’d” issues by keeping chunks safely below the AI request limit.
3. Improve error messaging so you get actionable details if the provider rejects input again.

---

## Implementation plan (code changes)

### 1) Fix Base64 encoding in `supabase/functions/transcribe-audio/index.ts`

**Change:** Replace the current chunked `btoa(String.fromCharCode(...chunk))` loop with a real Base64 encoder that works on bytes.

**Approach:**
- Import Deno’s standard base64 encoder:
  - `import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";`
- After `const arrayBuffer = await fileData.arrayBuffer()`:
  - `const base64Audio = base64Encode(new Uint8Array(arrayBuffer));`

**Why this fixes it:**
- The encoder produces a single valid Base64 string for the entire byte array (no broken padding, no concatenation artifacts).

### 2) Adjust the “max segment size” rule to account for Base64 expansion

Base64 makes payloads ~33% larger. A “9.5MB WAV chunk” becomes ~12.7MB Base64, which can cause provider or gateway request-size errors (often 400/413-like failures).

**Change in `transcribe-audio`:**
- Lower the segment size limit from `10MB` to something safer (example: `6–7MB`), and return a clear error message like:
  - “Segment too large after encoding. Please re-upload or let us re-chunk into smaller parts.”

This prevents silently sending oversized payloads that are likely to fail.

### 3) Update client-side chunk target sizing so the produced WAV chunks stay under the new safe threshold

In `src/pages/UploadCall.tsx`, you currently call:

```ts
targetBytes: MAX_SIZE_FOR_DIRECT_UPLOAD - 512 * 1024
```

That aims for just under 10MB, which is risky once Base64’d.

**Change:**
- Set `targetBytes` to a safer value (example: ~6MB) when preparing audio:
  - `targetBytes: 6 * 1024 * 1024` (or similar)

**Outcome:**
- Each WAV chunk stays small enough that Base64’d audio remains within request limits, dramatically reducing provider rejection.

### 4) Improve error visibility from the AI provider (still in `transcribe-audio`)

Right now when AI responds with non-OK, you log text and throw `Transcription failed: ${status}`.

**Change:**
- Include a short, non-sensitive snippet of the provider response in the thrown error (or map it to a user-friendly message).
- Specifically detect the “invalid base64” case and return a clearer message (helps confirm we truly fixed it if it ever resurfaces).

### 5) Verification steps (what you should do after we implement)

1. Upload a file that previously failed (same one).
2. Confirm the UI progresses past “Transcribing audio…”.
3. If it’s a long call, confirm chunked upload completes and transcription returns a full transcript (joined segments).
4. If there’s still an error, check the backend logs for:
   - response status
   - provider message snippet
   - segment size and encoded length (we’ll log these safely)

---

## Optional fallback (only if needed)

If the AI provider remains picky about WAV input:
- We can switch the prepared chunks to **compressed MP3** (still chunked) to cut payload size drastically.
- That requires client-side encoding changes (more complexity), so I’d only do this if the “safe WAV chunk size + correct Base64” still hits limits.

---

## Clarifying question (to ensure we test the right path)

- Is this failing for **all uploads**, or only when the app uses the **chunked manifest** flow (large files over 10MB)?
  - Either way, the Base64 fix is required, but it helps confirm whether request-size limits are also part of the problem.

