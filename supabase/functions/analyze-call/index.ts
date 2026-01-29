import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Knowledge base from the sales books
const SALES_KNOWLEDGE_BASE = `
# SALES ANALYSIS KNOWLEDGE BASE

## Cialdini's 6 Principles of Influence (from "Influence: The Psychology of Persuasion")

1. **RECIPROCITY**: People feel obligated to give back when they receive. In sales: offer value first (free consultations, insights, resources) before asking for the sale.
   - Signs of use: Agent offered something valuable upfront
   - Signs of missed opportunity: Agent only focused on taking, never giving

2. **COMMITMENT & CONSISTENCY**: Once people commit to something, they'll act consistently with that commitment. In sales: get small "yes" agreements before the big ask.
   - Signs of use: Agent used "foot in the door" technique, asked confirming questions
   - Signs of missed opportunity: Agent went straight to big ask without building commitment

3. **SOCIAL PROOF**: People look to others' actions to guide their own. In sales: share testimonials, case studies, "other clients like you" stories.
   - Signs of use: Agent referenced other satisfied customers, success stories
   - Signs of missed opportunity: Agent didn't validate with social evidence

4. **AUTHORITY**: People defer to credible experts. In sales: establish expertise, share credentials, demonstrate deep knowledge.
   - Signs of use: Agent demonstrated expertise, shared relevant experience
   - Signs of missed opportunity: Agent failed to establish credibility

5. **LIKING**: People prefer to say yes to those they like. In sales: find common ground, give genuine compliments, mirror the prospect.
   - Signs of use: Agent built rapport, found common ground, was personable
   - Signs of missed opportunity: Agent was cold, transactional, no rapport building

6. **SCARCITY**: Things are more valuable when rare or limited. In sales: emphasize limited availability, exclusive access, deadline urgency.
   - Signs of use: Agent created authentic urgency, highlighted limited offers
   - Signs of missed opportunity: No urgency created, prospect felt no pressure to decide

## Oren Klaff's STRONG Method (from "Pitch Anything")

1. **FRAME CONTROL**: The person who controls the frame controls the conversation. Types:
   - Power Frame: Assert status, don't be reactive
   - Time Frame: Own the timeline, don't be desperate
   - Intrigue Frame: Keep them wanting more
   - Prize Frame: Position yourself as the prize, not the supplicant

2. **CROCODILE BRAIN**: First impressions go to the primitive "croc brain" which filters:
   - Is this dangerous? (avoid threats)
   - Is this boring? (ignore if not novel)
   - Is this complex? (reject if too hard)
   
   To pass: Make it simple, novel, and non-threatening.

3. **STATUS DYNAMICS**: Higher status wins. Signs of low status:
   - Being overly agreeable
   - Accepting all objections meekly
   - Letting prospect control the meeting

4. **HOT COGNITIONS**: Decisions are made emotionally first, rationalized later. Appeal to:
   - Desire (what they want)
   - Fear of loss (what they might miss)
   - Social status (how they'll look)

5. **NEEDINESS IS REPULSIVE**: The more you need the deal, the less likely you'll get it. Signs of neediness:
   - Chasing too hard
   - Accepting bad terms
   - Over-explaining, over-justifying

## Blair Warren's Forbidden Keys to Persuasion

**The One Sentence Persuasion Course**: "People will do anything for those who encourage their dreams, justify their failures, allay their fears, confirm their suspicions, and help them throw rocks at their enemies."

1. **ENCOURAGE THEIR DREAMS**: Validate what they want to achieve
2. **JUSTIFY THEIR FAILURES**: Don't blame them for past mistakes
3. **ALLAY THEIR FEARS**: Address concerns head-on
4. **CONFIRM THEIR SUSPICIONS**: Validate what they already believe
5. **HELP THROW ROCKS AT ENEMIES**: Unite against common adversaries

## Cialdini's Pre-Suasion Concepts

1. **PRIVILEGED MOMENTS**: Create the right context before making requests
2. **ATTENTION IS IMPORTANCE**: What you focus on becomes important
3. **UNITY**: Create a sense of "we" - shared identity drives action
4. **ASSOCIATION**: Link your offering to positive concepts/emotions

## Insurance-Specific Application

For insurance sales specifically:
- **Fear-based selling works BUT**: Must be balanced with hope and solution
- **Common objections**: "I'll think about it" (no urgency), "Too expensive" (value not demonstrated), "I have coverage" (didn't differentiate)
- **Winning approach**: Build genuine relationship, understand their specific fears, paint picture of protected future

## Revival Strategies for Lost Sales

1. **The Takeaway**: "I understand if this isn't right for you. Let me know if things change."
2. **New Information Approach**: Share relevant news/change that affects their situation
3. **Time-Limited Offer**: Create authentic urgency with real deadline
4. **Social Proof Follow-Up**: Share new success story relevant to their situation
5. **Authority Boost**: Share new credential, recognition, or expertise
6. **The Direct Ask**: Simply ask why they didn't proceed and if anything has changed
`;

const ANALYSIS_PROMPT = `You are an expert sales coach specializing in insurance sales. You have deep knowledge of persuasion psychology from Robert Cialdini's "Influence" and "Pre-Suasion", Oren Klaff's "Pitch Anything", and Blair Warren's "Forbidden Keys to Persuasion".

Your task is to analyze a sales call transcript and provide actionable insights based on these frameworks.

${SALES_KNOWLEDGE_BASE}

Analyze the transcript and return a JSON object with this exact structure:
{
  "outcome": "won" | "lost" | "unclear",
  "outcome_score": <number 0-100 representing confidence in the call's success>,
  "executive_summary": "<2-3 sentence overview of the call>",
  "key_strengths": [
    {"technique": "<name>", "description": "<what the agent did well>", "quote": "<relevant quote from transcript>"}
  ],
  "areas_for_improvement": [
    {"technique": "<name>", "description": "<what could be improved>", "suggestion": "<specific actionable advice>"}
  ],
  "missed_opportunities": [
    {"moment": "<when it happened>", "opportunity": "<what could have been done>", "framework": "<which principle/technique>"}
  ],
  "cialdini_principles": [
    {"principle": "<name>", "used": true|false, "effectiveness": <1-10>, "notes": "<specific observations>"}
  ],
  "pitch_framework_analysis": {
    "frame_control": {"score": <1-10>, "notes": "<observations>"},
    "status_management": {"score": <1-10>, "notes": "<observations>"},
    "neediness_level": {"score": <1-10 where 1 is desperate and 10 is confident>, "notes": "<observations>"},
    "croc_brain_appeal": {"score": <1-10>, "notes": "<observations>"}
  },
  "persuasion_techniques": [
    {"technique": "<name from any framework>", "used": true|false, "effectiveness": <1-10>, "example": "<quote or description>"}
  ],
  "revival_strategies": [
    {"strategy": "<name>", "script": "<exact words to use>", "timing": "<when to use this>", "rationale": "<why this will work>"}
  ],
  "follow_up_script": "<if lost, provide a complete follow-up script using revival strategies>",
  "key_moments": [
    {"timestamp": "<if available>", "description": "<what happened>", "impact": "positive" | "negative" | "neutral", "quote": "<relevant quote>"}
  ],
  "client_objections": [
    {"objection": "<what they said>", "handled": true|false, "response_given": "<how agent responded>", "better_response": "<improved response>"}
  ]
}

Be specific and actionable. Reference exact quotes from the transcript when possible. For revival strategies, provide word-for-word scripts they can use.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { callId, transcript } = await req.json();

    if (!callId || !transcript) {
      return new Response(
        JSON.stringify({ error: 'Missing callId or transcript' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GOOGLE_GEMINI_API_KEY = Deno.env.get('GOOGLE_GEMINI_API_KEY');
    if (!GOOGLE_GEMINI_API_KEY) {
      throw new Error('GOOGLE_GEMINI_API_KEY is not configured. Please add your Google Gemini API key in settings.');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Update call status to processing
    await supabase
      .from('sales_calls')
      .update({ status: 'processing' })
      .eq('id', callId);

    console.log('Starting AI analysis for call:', callId);

    // Call Google Gemini API directly for analysis
    const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: ANALYSIS_PROMPT }] },
          { role: 'model', parts: [{ text: 'Understood. I will analyze the sales call transcript and return a detailed JSON analysis based on the frameworks you provided.' }] },
          { role: 'user', parts: [{ text: `Analyze this sales call transcript:\n\n${transcript}` }] }
        ],
        generationConfig: {
          temperature: 0.3
        }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Google Gemini API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later or check your Google API quota.');
      }
      if (aiResponse.status === 403) {
        throw new Error('Invalid API key. Please check your GOOGLE_GEMINI_API_KEY.');
      }
      throw new Error(`AI analysis failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    // Google's native API response structure
    const analysisText = aiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!analysisText) {
      throw new Error('No analysis received from AI');
    }

    console.log('AI response received, parsing...');

    // Parse the JSON from the AI response
    let analysis;
    try {
      // Extract JSON from the response (it might be wrapped in markdown code blocks)
      const jsonMatch = analysisText.match(/```json\n?([\s\S]*?)\n?```/) || 
                        analysisText.match(/```\n?([\s\S]*?)\n?```/) ||
                        [null, analysisText];
      const jsonStr = jsonMatch[1] || analysisText;
      analysis = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.error('Raw response:', analysisText);
      throw new Error('Failed to parse analysis results');
    }

    // Get the call's user_id
    const { data: callData, error: callError } = await supabase
      .from('sales_calls')
      .select('user_id')
      .eq('id', callId)
      .single();

    if (callError || !callData) {
      throw new Error('Failed to fetch call data');
    }

    // Store the analysis
    const { error: insertError } = await supabase
      .from('call_analyses')
      .insert({
        call_id: callId,
        user_id: callData.user_id,
        transcript: transcript,
        outcome: analysis.outcome || 'unclear',
        outcome_score: analysis.outcome_score || 50,
        executive_summary: analysis.executive_summary,
        key_strengths: analysis.key_strengths || [],
        areas_for_improvement: analysis.areas_for_improvement || [],
        missed_opportunities: analysis.missed_opportunities || [],
        cialdini_principles: analysis.cialdini_principles || [],
        pitch_framework_analysis: analysis.pitch_framework_analysis || null,
        persuasion_techniques: analysis.persuasion_techniques || [],
        revival_strategies: analysis.revival_strategies || [],
        follow_up_script: analysis.follow_up_script || null,
        key_moments: analysis.key_moments || [],
        client_objections: analysis.client_objections || [],
      });

    if (insertError) {
      console.error('Failed to insert analysis:', insertError);
      throw new Error('Failed to save analysis');
    }

    // Update call status to completed
    await supabase
      .from('sales_calls')
      .update({ status: 'completed' })
      .eq('id', callId);

    console.log('Analysis completed and saved for call:', callId);

    return new Response(
      JSON.stringify({ success: true, analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-call:', error);
    
    // Try to update call status to failed
    try {
      const { callId } = await req.json().catch(() => ({}));
      if (callId) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        await supabase.from('sales_calls').update({ status: 'failed' }).eq('id', callId);
      }
    } catch {}

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
