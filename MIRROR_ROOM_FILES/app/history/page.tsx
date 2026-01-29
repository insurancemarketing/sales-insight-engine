'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser, useAuth } from '@clerk/nextjs';
import { createAuthenticatedClient } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Search,
  Phone,
  Award,
  AlertCircle,
  Clock,
  Loader2,
  ChevronRight,
  Trash2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SalesCall {
  id: string;
  file_name: string;
  client_name: string | null;
  status: string;
  created_at: string;
  call_analyses?: Array<{
    outcome: string;
    outcome_score: number;
  }>;
}

export default function CallHistory() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [calls, setCalls] = useState<SalesCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'won' | 'lost'>('all');

  useEffect(() => {
    if (user) {
      fetchCalls();
    }
  }, [user]);

  const fetchCalls = async () => {
    try {
      const supabase = await createAuthenticatedClient(getToken);
      const { data, error } = await supabase
        .from('sales_calls')
        .select(`
          *,
          call_analyses (
            outcome,
            outcome_score
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCalls(data || []);
    } catch (error) {
      console.error('Error fetching calls:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteCall = async (callId: string) => {
    try {
      const supabase = await createAuthenticatedClient(getToken);
      const { error } = await supabase
        .from('sales_calls')
        .delete()
        .eq('id', callId);

      if (error) throw error;

      setCalls(calls.filter(c => c.id !== callId));
      toast({
        title: 'Call deleted',
        description: 'The call recording has been removed.',
      });
    } catch (error) {
      console.error('Error deleting call:', error);
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: 'Could not delete the call recording.',
      });
    }
  };

  const filteredCalls = calls.filter(call => {
    const matchesSearch = 
      call.file_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (call.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    
    if (filter === 'all') return matchesSearch;
    
    const analysis = call.call_analyses?.[0];
    if (!analysis) return false;
    
    return matchesSearch && analysis.outcome === filter;
  });

  const getStatusBadge = (status: string, outcome?: string) => {
    if (status === 'completed' && outcome) {
      if (outcome === 'won') {
        return <Badge className="bg-green-500/10 text-green-500 border-0">Won</Badge>;
      }
      return <Badge className="bg-red-500/10 text-red-500 border-0">Lost</Badge>;
    }
    if (status === 'processing') {
      return <Badge className="bg-yellow-500/10 text-yellow-500 border-0">Processing</Badge>;
    }
    if (status === 'failed') {
      return <Badge variant="destructive">Failed</Badge>;
    }
    return <Badge variant="secondary">Pending</Badge>;
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
      <div>
        <h1 className="text-3xl font-bold">Call History</h1>
        <p className="text-muted-foreground mt-1">
          View and manage all your analyzed calls
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by client name or file..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All
          </Button>
          <Button
            variant={filter === 'won' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('won')}
            className={filter === 'won' ? 'bg-green-500 hover:bg-green-600' : ''}
          >
            Won
          </Button>
          <Button
            variant={filter === 'lost' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('lost')}
            className={filter === 'lost' ? 'bg-red-500 hover:bg-red-600' : ''}
          >
            Lost
          </Button>
        </div>
      </div>

      {/* Calls List */}
      <Card>
        <CardContent className="p-0">
          {filteredCalls.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Phone className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-2">No calls found</h3>
              <p className="text-muted-foreground">
                {searchTerm || filter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Upload your first call to get started'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredCalls.map((call) => {
                const analysis = call.call_analyses?.[0];
                return (
                  <div
                    key={call.id}
                    className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                  >
                    <Link
                      href={call.status === 'completed' ? `/analysis/${call.id}` : '#'}
                      className="flex items-center gap-4 flex-1"
                    >
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
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {call.client_name || call.file_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(call.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        {analysis && (
                          <span className="text-sm font-medium hidden sm:block">
                            Score: {analysis.outcome_score}%
                          </span>
                        )}
                        {getStatusBadge(call.status, analysis?.outcome)}
                        {call.status === 'completed' && (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteCall(call.id)}
                      className="ml-2 text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
