import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { fetchJobs } from "@/lib/api/jobs";
import type { JobWithMatch } from "@/types/job";
import { subDays } from "date-fns";

interface ScoreBucket {
  label: string;
  range: [number, number];
  count: number;
  color: string;
}

interface AgentVersionStats {
  version: string;
  count: number;
  avgScore: number;
  falsePositives: number;
  falseNegatives: number;
}

const AILab = () => {
  const [jobs, setJobs] = useState<JobWithMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<"7" | "30" | "90" | "all">("30");
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    async function loadData() {
      try {
        const jobsData = await fetchJobs();
        setJobs(jobsData);
      } catch (error) {
        console.error("Error loading jobs:", error);
        toast({
          title: "Error loading data",
          description: "Failed to load job data for analysis.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [toast]);

  // Filter jobs by date range and search query
  const filteredJobs = useMemo(() => {
    let filtered = jobs;

    // Date filter
    if (dateRange !== "all") {
      const cutoffDate = subDays(new Date(), parseInt(dateRange));
      filtered = filtered.filter((job) => {
        const scoredAt = job.match?.scored_at;
        if (!scoredAt) return false;
        return new Date(scoredAt) >= cutoffDate;
      });
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (job) =>
          job.title.toLowerCase().includes(query) ||
          job.company.toLowerCase().includes(query) ||
          job.location.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [jobs, dateRange, searchQuery]);

  // Only scored jobs for analysis
  const scoredJobs = useMemo(() => filteredJobs.filter((j) => j.match), [filteredJobs]);

  // Score distribution buckets
  const scoreBuckets: ScoreBucket[] = useMemo(() => {
    const buckets: ScoreBucket[] = [
      { label: "0-49 (Weak)", range: [0, 49], count: 0, color: "bg-gray-500" },
      { label: "50-69 (Moderate)", range: [50, 69], count: 0, color: "bg-yellow-500" },
      { label: "70-84 (Good)", range: [70, 84], count: 0, color: "bg-blue-500" },
      { label: "85-100 (Strong)", range: [85, 100], count: 0, color: "bg-green-500" },
    ];

    scoredJobs.forEach((job) => {
      const score = job.match!.match_score;
      for (const bucket of buckets) {
        if (score >= bucket.range[0] && score <= bucket.range[1]) {
          bucket.count++;
          break;
        }
      }
    });

    return buckets;
  }, [scoredJobs]);

  // False positives: high score (>=70) but ended as not_fit or rejected
  const falsePositives = useMemo(() => {
    return scoredJobs.filter((job) => {
      const score = job.match!.match_score;
      const status = job.pipeline_status;
      return score >= 70 && (status === "not_fit" || status === "rejected");
    });
  }, [scoredJobs]);

  // False negatives: low score (<50) but ended in interview/offer
  const falseNegatives = useMemo(() => {
    return scoredJobs.filter((job) => {
      const score = job.match!.match_score;
      const status = job.pipeline_status;
      return score < 50 && (status === "interview" || status === "final_interview" || status === "offer");
    });
  }, [scoredJobs]);

  // Agent version statistics
  const agentVersionStats = useMemo(() => {
    const versionMap = new Map<string, { jobs: JobWithMatch[]; totalScore: number }>();
    
    scoredJobs.forEach((job) => {
      const version = job.match?.agent_version || "1.0";
      const existing = versionMap.get(version) || { jobs: [], totalScore: 0 };
      existing.jobs.push(job);
      existing.totalScore += job.match!.match_score;
      versionMap.set(version, existing);
    });

    const stats: AgentVersionStats[] = [];
    versionMap.forEach((data, version) => {
      const fps = data.jobs.filter(j => {
        const score = j.match!.match_score;
        const status = j.pipeline_status;
        return score >= 70 && (status === "not_fit" || status === "rejected");
      }).length;
      
      const fns = data.jobs.filter(j => {
        const score = j.match!.match_score;
        const status = j.pipeline_status;
        return score < 50 && (status === "interview" || status === "final_interview" || status === "offer");
      }).length;

      stats.push({
        version,
        count: data.jobs.length,
        avgScore: Math.round(data.totalScore / data.jobs.length),
        falsePositives: fps,
        falseNegatives: fns,
      });
    });

    return stats.sort((a, b) => b.count - a.count);
  }, [scoredJobs]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">AI Lab</h1>
        <p className="text-muted-foreground">
          Evaluate AI scoring effectiveness and identify patterns.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Date range:</span>
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input
          placeholder="Filter by title, company, location..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Scored</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{scoredJobs.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg. Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {scoredJobs.length > 0
                ? Math.round(scoredJobs.reduce((sum, j) => sum + j.match!.match_score, 0) / scoredJobs.length)
                : 0}
              %
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">False Positives</CardTitle>
            <CardDescription className="text-xs">High score → Not a Fit</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{falsePositives.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">False Negatives</CardTitle>
            <CardDescription className="text-xs">Low score → Interview+</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{falseNegatives.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Score Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Score Distribution</CardTitle>
          <CardDescription>How AI scores are distributed across jobs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {scoreBuckets.map((bucket) => (
              <div key={bucket.label} className="flex items-center gap-3">
                <div className="w-32 text-sm">{bucket.label}</div>
                <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${bucket.color} transition-all`}
                    style={{
                      width: scoredJobs.length > 0 ? `${(bucket.count / scoredJobs.length) * 100}%` : "0%",
                    }}
                  />
                </div>
                <div className="w-12 text-right text-sm font-medium">{bucket.count}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* False Positives Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            False Positives
            <Badge variant="destructive">{falsePositives.length}</Badge>
          </CardTitle>
          <CardDescription>
            Jobs scored ≥70% but marked as Not a Fit or Rejected. These may indicate over-scoring.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {falsePositives.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No false positives found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {falsePositives.slice(0, 10).map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">{job.title}</TableCell>
                    <TableCell>{job.company}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{job.match!.match_score}%</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{job.pipeline_status.replace("_", " ")}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* False Negatives Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            False Negatives
            <Badge variant="outline" className="border-yellow-500 text-yellow-600">
              {falseNegatives.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            Jobs scored &lt;50% but progressed to Interview or Offer. These may indicate under-scoring.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {falseNegatives.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No false negatives found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {falseNegatives.slice(0, 10).map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">{job.title}</TableCell>
                    <TableCell>{job.company}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{job.match!.match_score}%</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{job.pipeline_status.replace("_", " ")}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Agent Version Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Version Performance</CardTitle>
          <CardDescription>
            Scoring accuracy by agent version. Track improvements over time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agentVersionStats.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No version data available</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Jobs Scored</TableHead>
                  <TableHead>Avg. Score</TableHead>
                  <TableHead>False Positives</TableHead>
                  <TableHead>False Negatives</TableHead>
                  <TableHead>Accuracy Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentVersionStats.map((stat) => {
                  const totalMispredictions = stat.falsePositives + stat.falseNegatives;
                  const accuracyRate = stat.count > 0 
                    ? Math.round(((stat.count - totalMispredictions) / stat.count) * 100) 
                    : 0;
                  
                  return (
                    <TableRow key={stat.version}>
                      <TableCell>
                        <Badge variant="outline">v{stat.version}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{stat.count}</TableCell>
                      <TableCell>{stat.avgScore}%</TableCell>
                      <TableCell>
                        <span className={stat.falsePositives > 0 ? "text-destructive" : ""}>
                          {stat.falsePositives}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={stat.falseNegatives > 0 ? "text-yellow-600" : ""}>
                          {stat.falseNegatives}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={accuracyRate >= 90 ? "default" : accuracyRate >= 70 ? "secondary" : "outline"}
                        >
                          {accuracyRate}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AILab;
