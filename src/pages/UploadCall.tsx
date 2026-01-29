import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { 
  Upload, 
  Mic, 
  FileAudio,
  X,
  Loader2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

type UploadStep = 'upload' | 'details' | 'processing' | 'complete' | 'error';

export default function UploadCall() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [step, setStep] = useState<UploadStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [clientName, setClientName] = useState('');
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState(0);
  const [callId, setCallId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0];
      if (rejection.errors?.some((e: any) => e.code === 'file-too-large')) {
        toast({
          variant: 'destructive',
          title: 'File too large',
          description: 'Please upload audio files under 10MB. Try compressing or trimming your recording.',
        });
      }
      return;
    }
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setStep('details');
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a', '.ogg', '.webm', '.mp4'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB limit due to edge function constraints
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user) return;

    setStep('processing');
    setProgress(0);

    try {
      // Step 1: Upload file to storage
      setProgress(10);
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('call-recordings')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      setProgress(30);

      // Step 2: Create call record
      const { data: callData, error: callError } = await supabase
        .from('sales_calls')
        .insert({
          user_id: user.id,
          file_path: filePath,
          file_name: file.name,
          client_name: clientName || null,
          status: 'pending',
        })
        .select()
        .single();

      if (callError) throw callError;
      setCallId(callData.id);

      setProgress(50);

      // Step 3: Transcribe the audio
      const { data: transcribeData, error: transcribeError } = await supabase.functions.invoke('transcribe-audio', {
        body: { callId: callData.id, filePath },
      });

      if (transcribeError || transcribeData?.error) {
        throw new Error(transcribeData?.error || 'Transcription failed');
      }

      setProgress(75);

      // Step 4: Analyze the transcript
      const { data: analyzeData, error: analyzeError } = await supabase.functions.invoke('analyze-call', {
        body: { callId: callData.id, transcript: transcribeData.transcript },
      });

      if (analyzeError || analyzeData?.error) {
        throw new Error(analyzeData?.error || 'Analysis failed');
      }

      setProgress(100);
      setStep('complete');

      toast({
        title: 'Analysis complete!',
        description: 'Your call has been analyzed successfully.',
      });

    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStep('error');
      
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'An error occurred',
      });
    }
  };

  const resetUpload = () => {
    setFile(null);
    setClientName('');
    setNotes('');
    setStep('upload');
    setProgress(0);
    setError(null);
    setCallId(null);
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
        <div>
          <h1 className="text-3xl font-display font-bold">Upload Call Recording</h1>
          <p className="text-muted-foreground mt-1">
            Upload a sales call recording for AI-powered analysis
          </p>
        </div>

        {step === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Select Recording</CardTitle>
              <CardDescription>
                Supported formats: MP3, WAV, M4A, OGG, WebM (max 10MB)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                {...getRootProps()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all',
                  isDragActive
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                )}
              >
                <input {...getInputProps()} />
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  {isDragActive ? (
                    <Upload className="w-8 h-8 text-primary" />
                  ) : (
                    <Mic className="w-8 h-8 text-primary" />
                  )}
                </div>
                {isDragActive ? (
                  <p className="text-lg font-medium">Drop the file here</p>
                ) : (
                  <>
                    <p className="text-lg font-medium mb-2">
                      Drag & drop your recording here
                    </p>
                    <p className="text-muted-foreground">
                      or click to browse files
                    </p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'details' && file && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Call Details</CardTitle>
              <CardDescription>
                Add some context about this call (optional)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Selected file */}
                <div className="flex items-center gap-4 p-4 rounded-lg bg-muted">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <FileAudio className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={resetUpload}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="clientName">Client/Prospect Name</Label>
                  <Input
                    id="clientName"
                    placeholder="John Smith"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any context about this call..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="flex gap-4">
                  <Button type="button" variant="outline" onClick={resetUpload}>
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload & Analyze
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {step === 'processing' && (
          <Card>
            <CardContent className="pt-8 pb-8">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <h3 className="text-xl font-display font-semibold mb-2">
                  Analyzing your call...
                </h3>
                <p className="text-muted-foreground mb-6">
                  {progress < 30 && 'Uploading recording...'}
                  {progress >= 30 && progress < 50 && 'Creating call record...'}
                  {progress >= 50 && progress < 75 && 'Transcribing audio...'}
                  {progress >= 75 && 'Running AI analysis...'}
                </p>
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-muted-foreground mt-2">{progress}%</p>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'complete' && (
          <Card>
            <CardContent className="pt-8 pb-8">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-8 h-8 text-success" />
                </div>
                <h3 className="text-xl font-display font-semibold mb-2">
                  Analysis Complete!
                </h3>
                <p className="text-muted-foreground mb-6">
                  Your call has been analyzed. View the detailed insights now.
                </p>
                <div className="flex gap-4 justify-center">
                  <Button variant="outline" onClick={resetUpload}>
                    Upload Another
                  </Button>
                  <Button onClick={() => navigate(`/analysis/${callId}`)}>
                    View Analysis
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'error' && (
          <Card>
            <CardContent className="pt-8 pb-8">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
                  <AlertCircle className="w-8 h-8 text-destructive" />
                </div>
                <h3 className="text-xl font-display font-semibold mb-2">
                  Something went wrong
                </h3>
                <p className="text-muted-foreground mb-6">
                  {error || 'An error occurred while processing your call.'}
                </p>
                <Button onClick={resetUpload}>
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
