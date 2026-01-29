'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser, useAuth } from '@clerk/nextjs';
import { createAuthenticatedClient } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, 
  TrendingUp, 
  TrendingDown, 
  Clock,
  Phone,
  Target,
  Award,
  AlertCircle,
  ChevronRight,
  Loader2
} from 'lucide-react';

interface SalesCall {
  id: string;
  file_name: string;
  client_name: string | null;
  status: string;
  created_at: string;
}

interface CallAnalysis {
  id: string;
  call_id: string;
  outcome: string;
  outcome_score: number;
  executive_summary: string | null;
}

export default function Dashboard() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [recentCalls, setRecentCalls] = useState<SalesCall[]>([]);
  const [analyses, setAnalyses] = useState<CallAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalCalls: 0,
    wonCalls: 0,
    lostCalls: 0,
    avgScore: 0,
  });

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const supabase = await createAuthenticatedClient(getToken);
      
      // Fetch recent calls
      const { data: callsData } = await supabase
        .from('sales_calls')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (callsData) {
        setRecentCalls(callsData);
      }

      // Fetch analyses
      const { data: analysesData } = await supabase
        .from('call_analyses')
        .select('*');

      if (analysesData) {
        setAnalyses(analysesData);
        
        // Calculate stats
        const wonCalls = analysesData.filter(a => a.outcome === 'won').length;
        const lostCalls = analysesData.filter(a => a.outcome === 'lost').length;
        const avgScore = analysesData.length > 0
          ? Math.round(analysesData.reduce((sum, a) => sum + (a.outcome_score || 0), 0) / analysesData.length)
          : 0;

        setStats({
          totalCalls: callsData?.length || 0,
          wonCalls,
          lostCalls,
          avgScore,
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500/10 text-green-500 border-0">Analyzed</Badge>;
      case 'processing':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-0">Processing</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const getAnalysisForCall = (callId: string) => {
    return analyses.find(a => a.call_id === callId);
  };

  if (loading || !isLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back! Here's your sales performance overview.
          </p>
        </div>
        <Button asChild size="lg" className="gap-2">
          <Link href="/upload">
            <Upload className="w-4 h-4" />
            Upload Call
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Calls</p>
                <p className="text-3xl font-bold mt-1">{stats.totalCalls}</p>
              </div>
              <div className="p-3 rounded-xl bg-primary/10">
                <Phone className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Calls Won</p>
                <p className="text-3xl font-bold mt-1 text-green-500">{stats.wonCalls}</p>
              </div>
              <div className="p-3 rounded-xl bg-green-500/10">
                <TrendingUp className="w-6 h-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Calls Lost</p>
                <p className="text-3xl font-bold mt-1 text-red-500">{stats.lostCalls}</p>
              </div>
              <div className="p-3 rounded-xl bg-red-500/10">
                <TrendingDown className="w-6 h-6 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg. Score</p>
                <p className="text-3xl font-bold mt-1">{stats.avgScore}%</p>
              </div>
              <div className="p-3 rounded-xl bg-purple-500/10">
                <Target className="w-6 h-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Calls */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Calls</CardTitle>
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
            <Link href="/history">
              View all
              <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentCalls.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-2">No calls yet</h3>
              <p className="text-muted-foreground mb-4">
                Upload your first call recording to get started
              </p>
              <Button asChild>
                <Link href="/upload">Upload Call</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {recentCalls.map((call) => {
                const analysis = getAnalysisForCall(call.id);
                return (
                  <Link
                    key={call.id}
                    href={call.status === 'completed' ? `/analysis/${call.id}` : '#'}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        analysis?.outcome === 'won' 
                          ? 'bg-green-500/10' 
                          : analysis?.outcome === 'lost'
                          ? 'bg-red-500/10'
                          : 'bg-muted'
                      }`}>
                        {analysis?.outcome === 'won' ? (
                          <Award className="w-5 h-5 text-green-500" />
                        ) : analysis?.outcome === 'lost' ? (
                          <AlertCircle className="w-5 h-5 text-red-500" />
                        ) : call.status === 'processing' ? (
                          <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                        ) : (
                          <Clock className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{call.client_name || call.file_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(call.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {analysis && (
                        <span className="text-sm font-medium">
                          Score: {analysis.outcome_score}%
                        </span>
                      )}
                      {getStatusBadge(call.status)}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Tips */}
      <Card className="bg-gradient-to-br from-primary/5 to-purple-500/5 border-0">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-purple-500/10">
              <Target className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <h3 className="font-semibold mb-2">Pro Tip: Cialdini's Reciprocity</h3>
              <p className="text-muted-foreground">
                Give something valuable before asking for the sale. Offer a free consultation, 
                share relevant insights, or provide a helpful resource. People naturally want 
                to reciprocate when they receive value first.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
