
# Switch to Your Own Google Gemini API Key

This plan will change the transcription and analysis functions to use your own Google Gemini API key directly, giving you full control over billing and removing dependency on Lovable credits.

---

## Overview

Currently, both `transcribe-audio` and `analyze-call` functions route through the Lovable AI Gateway using `LOVABLE_API_KEY`. We'll switch them to call Google's Gemini API directly using your personal API key.

### Benefits
- **Direct billing control** - Pay Google directly, no middleman
- **Free tier access** - Google offers ~1,500 requests/day free for Gemini Flash
- **Higher rate limits** - No shared workspace limits
- **Cost savings** - Using Gemini 2.5 Flash instead of Pro reduces costs by 60-70%

---

## Step 1: Get Your Google Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key (starts with `AIza...`)

### Free Tier Limits (Gemini 2.5 Flash)
- **15 requests per minute** (RPM)
- **1 million tokens per minute** (TPM)
- **1,500 requests per day** (RPD)

For most use cases, the free tier should cover your needs. Beyond that, pricing is very affordable.

---

## Step 2: Add the Secret

I'll prompt you to add a secret called `GOOGLE_GEMINI_API_KEY` where you'll paste your API key.

---

## Step 3: Update transcribe-audio Function

### Changes
1. Replace `LOVABLE_API_KEY` with `GOOGLE_GEMINI_API_KEY`
2. Change endpoint from `https://ai.gateway.lovable.dev/v1/chat/completions` to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
3. Switch model from `gemini-2.5-pro` to `gemini-2.5-flash` (faster & cheaper)
4. Adapt the request format to Google's native API structure
5. Update error handling for Google API responses

### API Format Difference
```text
Current (OpenAI-compatible):
POST /v1/chat/completions
Authorization: Bearer {key}
{ "model": "...", "messages": [...] }

Google Native:
POST /v1beta/models/{model}:generateContent?key={key}
{ "contents": [...], "generationConfig": {...} }
```

---

## Step 4: Update analyze-call Function

### Changes
1. Same endpoint and authentication updates as transcribe-audio
2. Switch to `gemini-2.5-flash` model
3. Adapt request/response format for Google's native API
4. Update error handling

---

## Step 5: Keep Fallback (Optional)

We can optionally keep `LOVABLE_API_KEY` as a fallback if `GOOGLE_GEMINI_API_KEY` isn't configured, but the primary path will use your key.

---

## Technical Details

### New API Call Structure (transcribe-audio)

```text
Endpoint: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent

Request body:
{
  "contents": [{
    "parts": [
      { "text": "Transcribe this audio..." },
      { "inlineData": { "mimeType": "audio/wav", "data": "<base64>" } }
    ]
  }],
  "generationConfig": {
    "temperature": 0.1
  }
}

Response:
{
  "candidates": [{
    "content": {
      "parts": [{ "text": "transcription here" }]
    }
  }]
}
```

### Error Codes to Handle
- `400` - Invalid request (bad audio format, too large)
- `403` - Invalid API key
- `429` - Rate limit exceeded
- `500` - Google server error

---

## Cost Comparison

| Model | Input Cost | Output Cost | 10-min call | 1-hour call |
|-------|------------|-------------|-------------|-------------|
| Gemini 2.5 Pro (current) | $1.25/1M tokens | $10.00/1M tokens | ~$0.04 | ~$0.25 |
| Gemini 2.5 Flash (new) | $0.075/1M tokens | $0.30/1M tokens | ~$0.01 | ~$0.06 |

**Savings: ~75% per call**

---

## Files to Modify

1. **supabase/functions/transcribe-audio/index.ts** - Update API endpoint, auth, and request format
2. **supabase/functions/analyze-call/index.ts** - Update API endpoint, auth, and request format

---

## After Implementation

Once approved, I'll:
1. Ask you to add your `GOOGLE_GEMINI_API_KEY` secret
2. Update both edge functions
3. Deploy the changes
4. You can test by uploading a call recording

The app will then use your Google API key directly with no Lovable credit consumption.
