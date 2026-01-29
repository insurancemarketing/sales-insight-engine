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
  AlertCircle,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { prepareAudio, formatFileSize } from '@/lib/audioCompression';

type UploadStep = 'upload' | 'details' | 'compressing' | 'processing' | 'complete' | 'error';

const MAX_SIZE_FOR_DIRECT_UPLOAD = 10 * 1024 * 1024; // 10MB
const MAX_SIZE_FOR_COMPRESSION = 100 * 1024 * 1024; // 100MB

export default function UploadCall() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [step, setStep] = useState<UploadStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [clientName, setClientName] = useState('');
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState(0);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [callId, setCallId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsCompression, setNeedsCompression] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0];
      if (rejection.errors?.some((e: any) => e.code === 'file-too-large')) {
        toast({
          variant: 'destructive',
          title: 'File too large',
          description: 'Maximum file size is 100MB.',
        });
      }
      return;
    }
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      setOriginalFile(selectedFile);
      
      // Check if compression is needed
      if (selectedFile.size > MAX_SIZE_FOR_DIRECT_UPLOAD) {
        setNeedsCompression(true);
        setFile(selectedFile);
      } else {
        setNeedsCompression(false);
        setFile(selectedFile);
      }
      setStep('details');
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a', '.ogg', '.webm', '.mp4'],
    },
    maxFiles: 1,
    maxSize: MAX_SIZE_FOR_COMPRESSION,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user) return;

    let filePath: string;
    const baseId = Date.now();

    try {
      // Step 0: Compress if needed
      if (needsCompression) {
        setStep('compressing');
        setCompressionProgress(0);
        
        toast({
          title: 'Compressing audio...',
          description: 'This may take a moment for large files.',
        });

        const prepared = await prepareAudio(
          file,
          (prog) => setCompressionProgress(prog),
          {
            // keep comfortably under backend processing limits
            targetBytes: MAX_SIZE_FOR_DIRECT_UPLOAD - 512 * 1024,
            sampleRate: 16000,
          }
        );

        // Step 1: Upload prepared audio (either single WAV or chunked WAV + manifest)
        if (prepared.kind === 'single') {
          setCompressionProgress(85);

          filePath = `${user.id}/${baseId}.wav`;
          const { error: uploadError } = await supabase.storage
            .from('call-recordings')
            .upload(filePath, prepared.file);
          if (uploadError) throw uploadError;

          setCompressionProgress(100);
          toast({
            title: 'Audio prepared!',
            description: `Prepared as ${formatFileSize(prepared.file.size)} WAV for processing.`,
          });
        } else {
          const chunkPaths: string[] = [];
          for (let i = 0; i < prepared.chunks.length; i++) {
            const chunk = prepared.chunks[i];
            const chunkPath = `${user.id}/${baseId}/${chunk.name}`;
            const { error: uploadError } = await supabase.storage
              .from('call-recordings')
              .upload(chunkPath, chunk);
            if (uploadError) throw uploadError;
            chunkPaths.push(chunkPath);

            // 70..95 while uploading chunks
            const pct = 70 + Math.round(((i + 1) / prepared.chunks.length) * 25);
            setCompressionProgress(pct);
          }

          const manifest = {
            version: 1,
            createdAt: new Date().toISOString(),
            originalFileName: originalFile?.name || file.name,
            sampleRate: prepared.sampleRate,
            chunkSeconds: prepared.chunkSeconds,
            chunks: chunkPaths,
          };

          filePath = `${user.id}/${baseId}/manifest.json`;
          const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
          const { error: manifestError } = await supabase.storage
            .from('call-recordings')
            .upload(filePath, manifestBlob);
          if (manifestError) throw manifestError;

          setCompressionProgress(100);
          toast({
            title: 'Audio chunked & uploaded!',
            description: `Split into ${prepared.chunks.length} parts for processing.`,
          });
        }
      }

      setStep('processing');
      setProgress(0);

      // Step 1: Upload file to storage (direct path)
      if (!needsCompression) {
        setProgress(10);
        const fileExt = file.name.split('.').pop() || 'mp3';
        filePath = `${user.id}/${baseId}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('call-recordings')
          .upload(filePath, file);

        if (uploadError) throw uploadError;
      }

      setProgress(30);

      // Step 2: Create call record
      const { data: callData, error: callError } = await supabase
        .from('sales_calls')
        .insert({
          user_id: user.id,
          file_path: filePath,
          file_name: originalFile?.name || file.name,
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
    setOriginalFile(null);
    setClientName('');
    setNotes('');
    setStep('upload');
    setProgress(0);
    setCompressionProgress(0);
    setError(null);
    setCallId(null);
    setNeedsCompression(false);
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
                Supported formats: MP3, WAV, M4A, OGG, WebM (up to 100MB with auto-compression)
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
                      {formatFileSize(file.size)}
                      {needsCompression && (
                        <span className="ml-2 text-primary">
                          <Zap className="w-3 h-3 inline mr-1" />
                          Will be compressed
                        </span>
                      )}
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

                {needsCompression && (
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-2 text-sm">
                      <Zap className="w-4 h-4 text-primary" />
                      <span className="font-medium text-primary">Auto-compression enabled</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Your file exceeds 10MB and will be compressed before upload. This preserves audio quality while reducing size.
                    </p>
                  </div>
                )}

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
                    {needsCompression ? 'Compress & Analyze' : 'Upload & Analyze'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {step === 'compressing' && (
          <Card>
            <CardContent className="pt-8 pb-8">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                  <Zap className="w-8 h-8 text-primary animate-pulse" />
                </div>
                <h3 className="text-xl font-display font-semibold mb-2">
                  Compressing audio...
                </h3>
                <p className="text-muted-foreground mb-6">
                  Optimizing your recording for analysis
                </p>
                <Progress value={compressionProgress} className="h-2" />
                <p className="text-sm text-muted-foreground mt-2">{compressionProgress}%</p>
              </div>
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
