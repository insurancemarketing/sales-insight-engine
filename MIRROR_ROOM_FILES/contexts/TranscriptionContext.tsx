'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { createAuthenticatedClient } from '@/lib/supabase';

export type TranscriptionJob = {
  id: string;
  callId: string;
  fileName: string;
  status: 'compressing' | 'uploading' | 'transcribing' | 'analyzing' | 'complete' | 'error';
  progress: number;
  currentChunk: number;
  totalChunks: number;
  error?: string;
};

type TranscriptionContextType = {
  jobs: TranscriptionJob[];
  startJob: (params: StartJobParams) => void;
  dismissJob: (jobId: string) => void;
};

type StartJobParams = {
  callId: string;
  fileName: string;
  chunkPaths: string[];
  onComplete?: (transcript: string) => void;
  onError?: (error: string) => void;
};

const TranscriptionContext = createContext<TranscriptionContextType | null>(null);

export function useTranscription() {
  const ctx = useContext(TranscriptionContext);
  if (!ctx) throw new Error('useTranscription must be used within TranscriptionProvider');
  return ctx;
}

export function TranscriptionProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<TranscriptionJob[]>([]);
  const jobsRef = useRef<TranscriptionJob[]>([]);
  const { getToken } = useAuth();
  
  // Keep ref in sync for async callbacks
  jobsRef.current = jobs;

  const updateJob = useCallback((jobId: string, updates: Partial<TranscriptionJob>) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, ...updates } : j))
    );
  }, []);

  const dismissJob = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  const invokeTranscribe = async (body: any) => {
    const supabase = await createAuthenticatedClient(getToken);
    const { data, error } = await supabase.functions.invoke('transcribe-audio', { body });
    if (error || data?.error) {
      throw new Error(data?.error || error?.message || 'Transcription failed');
    }
    return data as { transcript: string };
  };

  const invokeTranscribeWithRetry = async (body: any, attempts = 2) => {
    let lastErr: unknown;
    for (let i = 0; i <= attempts; i++) {
      try {
        return await invokeTranscribe(body);
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 700 * (i + 1)));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Transcription failed');
  };

  const startJob = useCallback(
    ({ callId, fileName, chunkPaths, onComplete, onError }: StartJobParams) => {
      const jobId = `job-${Date.now()}`;
      const total = chunkPaths.length;

      const newJob: TranscriptionJob = {
        id: jobId,
        callId,
        fileName,
        status: 'transcribing',
        progress: 0,
        currentChunk: 0,
        totalChunks: total,
      };

      setJobs((prev) => [...prev, newJob]);

      // Run the transcription loop asynchronously
      (async () => {
        const parts: string[] = [];
        try {
          for (let i = 0; i < total; i++) {
            updateJob(jobId, {
              currentChunk: i + 1,
              progress: Math.round(((i + 0.5) / total) * 80),
            });

            const segmentData = await invokeTranscribeWithRetry({
              callId,
              filePaths: [chunkPaths[i]],
              segmentIndex: i,
              segmentsTotal: total,
            });

            parts.push(String(segmentData.transcript || '').trim());
          }

          const transcript = parts.filter(Boolean).join('\n\n');

          updateJob(jobId, { status: 'analyzing', progress: 85 });

          // Run analysis
          const supabase = await createAuthenticatedClient(getToken);
          const { data: analyzeData, error: analyzeError } = await supabase.functions.invoke(
            'analyze-call',
            { body: { callId, transcript } }
          );

          if (analyzeError || analyzeData?.error) {
            throw new Error(analyzeData?.error || 'Analysis failed');
          }

          updateJob(jobId, { status: 'complete', progress: 100 });
          onComplete?.(transcript);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          updateJob(jobId, { status: 'error', error: msg });
          onError?.(msg);
        }
      })();
    },
    [updateJob, getToken]
  );

  return (
    <TranscriptionContext.Provider value={{ jobs, startJob, dismissJob }}>
      {children}
    </TranscriptionContext.Provider>
  );
}
