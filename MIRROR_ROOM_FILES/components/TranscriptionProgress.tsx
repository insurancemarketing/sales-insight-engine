'use client';

import { useTranscription, TranscriptionJob } from '@/contexts/TranscriptionContext';
import { useRouter } from 'next/navigation';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

function JobCard({ job }: { job: TranscriptionJob }) {
  const { dismissJob } = useTranscription();
  const router = useRouter();

  const statusText = () => {
    switch (job.status) {
      case 'transcribing':
        return `Transcribing chunk ${job.currentChunk}/${job.totalChunks}...`;
      case 'analyzing':
        return 'Running AI analysis...';
      case 'complete':
        return 'Analysis complete!';
      case 'error':
        return job.error || 'An error occurred';
      default:
        return 'Processing...';
    }
  };

  const icon = () => {
    if (job.status === 'complete') {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    if (job.status === 'error') {
      return <AlertCircle className="w-5 h-5 text-red-500" />;
    }
    return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
  };

  return (
    <div className="bg-card border rounded-lg shadow-lg p-4 w-80 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 shrink-0">{icon()}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-sm truncate">{job.fileName}</p>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => dismissJob(job.id)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{statusText()}</p>
          {job.status !== 'complete' && job.status !== 'error' && (
            <Progress value={job.progress} className="h-1.5 mt-2" />
          )}
          {job.status === 'complete' && (
            <Button
              size="sm"
              variant="link"
              className="px-0 h-auto mt-1 text-xs"
              onClick={() => {
                router.push(`/analysis/${job.callId}`);
                dismissJob(job.id);
              }}
            >
              View Analysis →
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function TranscriptionProgress() {
  const { jobs } = useTranscription();

  if (jobs.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  );
}
