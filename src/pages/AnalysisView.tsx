import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowLeft,
  Award,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Target,
  Quote,
  Lightbulb,
  RefreshCw,
  Copy,
  Check,
  BookOpen,
  MessageSquare,
  Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Analysis {
  id: string;
  outcome: string;
  outcome_score: number;
  executive_summary: string | null;
  transcript: string | null;
  key_strengths: Array<{ technique: string; description: string; quote?: string }>;
  areas_for_improvement: Array<{ technique: string; description: string; suggestion: string }>;
  missed_opportunities: Array<{ moment: string; opportunity: string; framework: string }>;
  cialdini_principles: Array<{ principle: string; used: boolean; effectiveness: number; notes: string }>;
  pitch_framework_analysis: {
    frame_control: { score: number; notes: string };
    status_management: { score: number; notes: string };
    neediness_level: { score: number; notes: string };
    croc_brain_appeal: { score: number; notes: string };
  } | null;
  persuasion_techniques: Array<{ technique: string; used: boolean; effectiveness: number; example: string }>;
  revival_strategies: Array<{ strategy: string; script: string; timing: string; rationale: string }>;
  follow_up_script: string | null;
  key_moments: Array<{ timestamp?: string; description: string; impact: string; quote?: string }>;
  client_objections: Array<{ objection: string; handled: boolean; response_given: string; better_response: string }>;
}

interface SalesCall {
  id: string;
  file_name: string;
  client_name: string | null;
  created_at: string;
}

export default function AnalysisView() {
  const { callId } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [call, setCall] = useState<SalesCall | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedScript, setCopiedScript] = useState(false);

  useEffect(() => {
    if (user && callId) {
      fetchAnalysis();
    }
  }, [user, callId]);

  const fetchAnalysis = async () => {
    try {
      const { data: callData, error: callError } = await supabase
        .from('sales_calls')
        .select('*')
        .eq('id', callId)
        .single();

      if (callError) throw callError;
      setCall(callData);

      const { data: analysisData, error: analysisError } = await supabase
        .from('call_analyses')
        .select('*')
        .eq('call_id', callId)
        .single();

      if (analysisError) throw analysisError;
      
      // Parse JSON fields - cast to appropriate types
      const parsed: Analysis = {
        id: analysisData.id,
        outcome: analysisData.outcome,
        outcome_score: analysisData.outcome_score ?? 0,
        executive_summary: analysisData.executive_summary,
        transcript: analysisData.transcript,
        key_strengths: (analysisData.key_strengths as Analysis['key_strengths']) || [],
        areas_for_improvement: (analysisData.areas_for_improvement as Analysis['areas_for_improvement']) || [],
        missed_opportunities: (analysisData.missed_opportunities as Analysis['missed_opportunities']) || [],
        cialdini_principles: (analysisData.cialdini_principles as Analysis['cialdini_principles']) || [],
        pitch_framework_analysis: (analysisData.pitch_framework_analysis as Analysis['pitch_framework_analysis']) || null,
        persuasion_techniques: (analysisData.persuasion_techniques as Analysis['persuasion_techniques']) || [],
        revival_strategies: (analysisData.revival_strategies as Analysis['revival_strategies']) || [],
        follow_up_script: analysisData.follow_up_script,
        key_moments: (analysisData.key_moments as Analysis['key_moments']) || [],
        client_objections: (analysisData.client_objections as Analysis['client_objections']) || [],
      };
      
      setAnalysis(parsed);
    } catch (error) {
      console.error('Error fetching analysis:', error);
      toast({
        variant: 'destructive',
        title: 'Error loading analysis',
        description: 'Could not load the analysis data.',
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
    toast({
      title: 'Copied!',
      description: 'Script copied to clipboard.',
    });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!analysis || !call) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Analysis not found</h2>
          <Button asChild>
            <Link to="/history">Back to History</Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/history">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-display font-bold">
              {call.client_name || call.file_name}
            </h1>
            <p className="text-muted-foreground">
              {new Date(call.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className={`px-4 py-2 rounded-lg ${
              analysis.outcome === 'won' 
                ? 'bg-success/10 text-success' 
                : 'bg-destructive/10 text-destructive'
            }`}>
              {analysis.outcome === 'won' ? (
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5" />
                  <span className="font-semibold">Sale Won</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-semibold">Sale Lost</span>
                </div>
              )}
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold">{analysis.outcome_score}%</p>
              <p className="text-xs text-muted-foreground">Score</p>
            </div>
          </div>
        </div>

        {/* Executive Summary */}
        <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-0">
          <CardContent className="pt-6">
            <h3 className="font-display font-semibold mb-2 flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Executive Summary
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              {analysis.executive_summary}
            </p>
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="techniques">Techniques</TabsTrigger>
            <TabsTrigger value="objections">Objections</TabsTrigger>
            {analysis.outcome === 'lost' && (
              <TabsTrigger value="revival">Revival</TabsTrigger>
            )}
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Strengths */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-display flex items-center gap-2 text-lg">
                    <TrendingUp className="w-5 h-5 text-success" />
                    Key Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {analysis.key_strengths.map((strength, i) => (
                    <div key={i} className="p-4 rounded-lg bg-success/5 border border-success/10">
                      <p className="font-medium text-sm text-success mb-1">{strength.technique}</p>
                      <p className="text-sm text-foreground">{strength.description}</p>
                      {strength.quote && (
                        <div className="flex items-start gap-2 mt-2 text-sm text-muted-foreground italic">
                          <Quote className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          "{strength.quote}"
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Areas for Improvement */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-display flex items-center gap-2 text-lg">
                    <TrendingDown className="w-5 h-5 text-warning" />
                    Areas for Improvement
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {analysis.areas_for_improvement.map((area, i) => (
                    <div key={i} className="p-4 rounded-lg bg-warning/5 border border-warning/10">
                      <p className="font-medium text-sm text-warning mb-1">{area.technique}</p>
                      <p className="text-sm text-foreground mb-2">{area.description}</p>
                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0 text-warning" />
                        <span>{area.suggestion}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Missed Opportunities */}
            {analysis.missed_opportunities.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-display flex items-center gap-2 text-lg">
                    <AlertCircle className="w-5 h-5 text-destructive" />
                    Missed Opportunities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {analysis.missed_opportunities.map((opp, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                        <Badge variant="outline" className="mt-0.5">{opp.framework}</Badge>
                        <div>
                          <p className="font-medium text-sm">{opp.moment}</p>
                          <p className="text-sm text-muted-foreground">{opp.opportunity}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Techniques Tab */}
          <TabsContent value="techniques" className="space-y-6">
            {/* Cialdini Principles */}
            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2 text-lg">
                  <BookOpen className="w-5 h-5 text-primary" />
                  Cialdini's Principles Analysis
                </CardTitle>
                <CardDescription>
                  How well you applied the 6 principles of influence
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {analysis.cialdini_principles.map((principle, i) => (
                    <div key={i} className="p-4 rounded-lg border bg-card">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{principle.principle}</span>
                        {principle.used ? (
                          <Badge className="bg-success/10 text-success border-0">Used</Badge>
                        ) : (
                          <Badge variant="secondary">Not Used</Badge>
                        )}
                      </div>
                      <div className="mb-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>Effectiveness</span>
                          <span>{principle.effectiveness}/10</span>
                        </div>
                        <Progress value={principle.effectiveness * 10} className="h-1.5" />
                      </div>
                      <p className="text-xs text-muted-foreground">{principle.notes}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Pitch Framework Analysis */}
            {analysis.pitch_framework_analysis && (
              <Card>
                <CardHeader>
                  <CardTitle className="font-display flex items-center gap-2 text-lg">
                    <Target className="w-5 h-5 text-accent" />
                    Pitch Framework Analysis
                  </CardTitle>
                  <CardDescription>
                    Based on Oren Klaff's "Pitch Anything" methodology
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {Object.entries(analysis.pitch_framework_analysis).map(([key, value]) => (
                      <div key={key} className="p-4 rounded-lg border bg-card">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm capitalize">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="text-lg font-bold">{value.score}/10</span>
                        </div>
                        <Progress value={value.score * 10} className="h-2 mb-2" />
                        <p className="text-xs text-muted-foreground">{value.notes}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Objections Tab */}
          <TabsContent value="objections" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-display flex items-center gap-2 text-lg">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  Client Objections Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analysis.client_objections.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No significant objections identified
                  </p>
                ) : (
                  <div className="space-y-4">
                    {analysis.client_objections.map((obj, i) => (
                      <div key={i} className="p-4 rounded-lg border">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Quote className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">"{obj.objection}"</span>
                          </div>
                          {obj.handled ? (
                            <Badge className="bg-success/10 text-success border-0">Handled</Badge>
                          ) : (
                            <Badge variant="destructive">Not Handled</Badge>
                          )}
                        </div>
                        <Separator className="my-3" />
                        <div className="grid sm:grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground mb-1">Your Response:</p>
                            <p>{obj.response_given || 'No response given'}</p>
                          </div>
                          <div className="bg-success/5 p-3 rounded-lg">
                            <p className="text-success mb-1 font-medium">Better Response:</p>
                            <p>{obj.better_response}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Revival Tab (only for lost sales) */}
          {analysis.outcome === 'lost' && (
            <TabsContent value="revival" className="space-y-6">
              <Card className="border-accent/20 bg-gradient-to-br from-accent/5 to-transparent">
                <CardHeader>
                  <CardTitle className="font-display flex items-center gap-2 text-lg">
                    <RefreshCw className="w-5 h-5 text-accent" />
                    Revival Strategies
                  </CardTitle>
                  <CardDescription>
                    AI-generated strategies to bring this opportunity back
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {analysis.revival_strategies.map((strategy, i) => (
                    <div key={i} className="p-4 rounded-lg border bg-card">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold">{strategy.strategy}</span>
                        <Badge variant="outline">{strategy.timing}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{strategy.rationale}</p>
                      <div className="bg-muted/50 p-3 rounded-lg">
                        <p className="text-sm font-medium mb-1">Script:</p>
                        <p className="text-sm italic">"{strategy.script}"</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {analysis.follow_up_script && (
                <Card>
                  <CardHeader>
                    <CardTitle className="font-display flex items-center gap-2 text-lg">
                      <MessageSquare className="w-5 h-5 text-primary" />
                      Complete Follow-Up Script
                    </CardTitle>
                    <CardDescription>
                      Ready-to-use script for your next contact
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="relative">
                      <ScrollArea className="h-64 rounded-lg border p-4">
                        <pre className="whitespace-pre-wrap text-sm font-sans">
                          {analysis.follow_up_script}
                        </pre>
                      </ScrollArea>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="absolute top-2 right-2"
                        onClick={() => copyToClipboard(analysis.follow_up_script!)}
                      >
                        {copiedScript ? (
                          <Check className="w-4 h-4 mr-1" />
                        ) : (
                          <Copy className="w-4 h-4 mr-1" />
                        )}
                        {copiedScript ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
