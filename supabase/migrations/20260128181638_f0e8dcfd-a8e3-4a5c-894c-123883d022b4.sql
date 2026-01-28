-- Create storage bucket for call recordings
INSERT INTO storage.buckets (id, name, public, file_size_limit) 
VALUES ('call-recordings', 'call-recordings', false, 104857600);

-- Create policies for call recordings bucket
CREATE POLICY "Users can upload their own recordings"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'call-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own recordings"
ON storage.objects FOR SELECT
USING (bucket_id = 'call-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own recordings"
ON storage.objects FOR DELETE
USING (bucket_id = 'call-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create table for sales calls
CREATE TABLE public.sales_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  client_name TEXT,
  call_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  duration_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sales_calls ENABLE ROW LEVEL SECURITY;

-- RLS policies for sales_calls
CREATE POLICY "Users can view their own calls"
ON public.sales_calls FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own calls"
ON public.sales_calls FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own calls"
ON public.sales_calls FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own calls"
ON public.sales_calls FOR DELETE
USING (auth.uid() = user_id);

-- Create table for call analysis results
CREATE TABLE public.call_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id UUID NOT NULL REFERENCES public.sales_calls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  transcript TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('won', 'lost', 'unclear')),
  outcome_score INTEGER CHECK (outcome_score >= 0 AND outcome_score <= 100),
  
  -- Analysis sections
  executive_summary TEXT,
  key_strengths JSONB DEFAULT '[]'::jsonb,
  areas_for_improvement JSONB DEFAULT '[]'::jsonb,
  missed_opportunities JSONB DEFAULT '[]'::jsonb,
  
  -- Book-based insights
  cialdini_principles JSONB DEFAULT '[]'::jsonb,
  pitch_framework_analysis JSONB,
  persuasion_techniques JSONB DEFAULT '[]'::jsonb,
  
  -- Revival strategies (for lost sales)
  revival_strategies JSONB DEFAULT '[]'::jsonb,
  follow_up_script TEXT,
  
  -- Timestamps and quotes
  key_moments JSONB DEFAULT '[]'::jsonb,
  client_objections JSONB DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.call_analyses ENABLE ROW LEVEL SECURITY;

-- RLS policies for call_analyses
CREATE POLICY "Users can view their own analyses"
ON public.call_analyses FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own analyses"
ON public.call_analyses FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_sales_calls_updated_at
BEFORE UPDATE ON public.sales_calls
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();