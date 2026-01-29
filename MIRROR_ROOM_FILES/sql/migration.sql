-- SQL Migration for Mirror Room
-- Run this in your Supabase SQL Editor

-- IMPORTANT: This uses TEXT for user_id to work with Clerk IDs
-- The RLS policies use auth.jwt()->>'sub' which extracts the Clerk user ID from the JWT

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
-- The 'sub' claim in the Clerk JWT contains the Clerk user ID

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

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_sales_calls_updated_at
BEFORE UPDATE ON public.sales_calls
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
