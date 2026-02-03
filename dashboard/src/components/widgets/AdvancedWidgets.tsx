"use client"

import { useState, useEffect, useCallback } from "react"
import { 
  Brain,
  Zap,
  Search,
  Shield,
  Users2,
  Sparkles,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Activity,
  RefreshCw,
  DollarSign,
  Cpu,
  BarChart3
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// ============ TYPES ============

interface SONAStats {
  enabled: boolean
  configured: boolean
  agents: number
  tasksRouted: number
  avgSuccessRate: number
  avgQuality: number
  explorationRate: number
  topCategories: Array<{ category: string; count: number }>
  topAgents: Array<{ name: string; score: number; tasks: number }>
}

interface BoosterStats {
  enabled: boolean
  configured: boolean
  totalTasks: number
  successRate: number
  totalChanges: number
  timeSavedMinutes: number
  costSaved: string
  typeDistribution: Record<string, number>
  recentHistory: Array<{ type: string; file: string; success: boolean }>
}

interface VectorStats {
  configured: boolean
  totalDocuments: number
  dimensions: number
  maxLevel: number
  avgConnections: number
  memoryKB: number
  distanceMetric: string
}

interface DefenceStats {
  enabled: boolean
  configured: boolean
  totalScans: number
  threatsDetected: number
  threatsBlocked: number
  detectionRate: number
  sensitivity: string
  quarantineActive: number
  recentEvents: Array<{ 
    category: string
    severity: string
    action: string 
  }>
}

interface ConsensusStats {
  configured: boolean
  mode: string
  totalNodes: number
  activeNodes: number
  hasQuorum: boolean
  leaderName: string | null
  term: number
  pendingProposals: number
  approvedProposals: number
  rejectedProposals: number
}

interface MoEStats {
  configured: boolean
  enabled: boolean
  totalRequests: number
  successRate: number
  avgLatencyMs: number
  totalCost: string
  expertCount: number
  topExperts: Array<{
    name: string
    provider: string
    calls: number
    successRate: number
    tier: string
    totalCost: number
  }>
  byProvider: Record<string, { calls: number; cost: number }>
}

// ============ CONFIG ============

const REFRESH_INTERVAL = 30000 // 30 seconds
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3334"

// ============ HOOKS ============

function useAutoRefresh<T>(endpoint: string, interval = REFRESH_INTERVAL) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`)
      if (!res.ok) throw new Error("Failed to fetch")
      const json = await res.json()
      setData(json)
      setError(null)
      setLastUpdate(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [endpoint])

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, interval)
    return () => clearInterval(timer)
  }, [fetchData, interval])

  return { data, loading, error, lastUpdate, refresh: fetchData }
}

// ============ MINI COMPONENTS ============

function LiveIndicator({ active = true }: { active?: boolean }) {
  if (!active) return null
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
    </span>
  )
}

function MiniSparkline({ values, color = "blue" }: { values: number[]; color?: string }) {
  if (values.length < 2) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  
  return (
    <div className="flex items-end gap-[1px] h-4">
      {values.slice(-10).map((v, i) => (
        <div 
          key={i}
          className={cn(
            "w-1 rounded-sm transition-all",
            color === "blue" && "bg-blue-500",
            color === "green" && "bg-green-500",
            color === "yellow" && "bg-yellow-500",
            color === "red" && "bg-red-500"
          )}
          style={{ height: `${((v - min) / range) * 100}%`, minHeight: "2px" }}
        />
      ))}
    </div>
  )
}

function RefreshButton({ onRefresh, loading }: { onRefresh: () => void; loading?: boolean }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Refresh</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function LastUpdate({ date }: { date: Date | null }) {
  if (!date) return null
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  const text = seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`
  return <span className="text-[10px] text-muted-foreground">{text}</span>
}

// ============ WIDGETS ============

/**
 * SONA Widget - Self-Optimizing Neural Architecture
 */
export function SONAWidget() {
  const { data, loading, refresh, lastUpdate } = useAutoRefresh<SONAStats>("/api/sona")

  if (loading) {
    return <WidgetSkeleton title="SONA Router" />
  }

  if (!data?.configured) {
    return (
      <WidgetNotConfigured 
        title="SONA Router" 
        icon={Brain}
        message="Self-learning router не инициализирован"
      />
    )
  }

  return (
    <Card className="border-purple-500/30 hover:border-purple-500/50 transition-all">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-500" />
          SONA Router
          <div className="flex items-center gap-1 ml-auto">
            {data.enabled && <LiveIndicator />}
            <RefreshButton onRefresh={refresh} />
          </div>
        </CardTitle>
        <CardDescription className="flex items-center justify-between">
          <span>Self-learning task routing</span>
          <LastUpdate date={lastUpdate} />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-500">{data.tasksRouted}</div>
            <div className="text-xs text-muted-foreground">Tasks Routed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-500">{Math.round(data.avgSuccessRate * 100)}%</div>
            <div className="text-xs text-muted-foreground">Success Rate</div>
          </div>
        </div>
        
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>Quality Score</span>
            <span>{(data.avgQuality * 100).toFixed(0)}%</span>
          </div>
          <Progress value={data.avgQuality * 100} className="h-2" />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Cpu className="w-3 h-3" />
          <span>{data.agents} agents • {(data.explorationRate * 100).toFixed(0)}% exploration</span>
        </div>

        {data.topAgents.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Top Agents</div>
            {data.topAgents.slice(0, 3).map((agent, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="truncate flex items-center gap-1">
                  {i === 0 && <span className="text-yellow-500">🥇</span>}
                  {i === 1 && <span className="text-gray-400">🥈</span>}
                  {i === 2 && <span className="text-amber-600">🥉</span>}
                  {agent.name}
                </span>
                <Badge variant="outline">{agent.tasks} tasks</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Agent Booster Widget - Fast Local Execution
 */
export function BoosterWidget() {
  const { data, loading, refresh, lastUpdate } = useAutoRefresh<BoosterStats>("/api/booster")

  if (loading) {
    return <WidgetSkeleton title="Agent Booster" />
  }

  if (!data?.configured) {
    return (
      <WidgetNotConfigured 
        title="Agent Booster" 
        icon={Zap}
        message="Fast execution не использовался"
      />
    )
  }

  return (
    <Card className="border-yellow-500/30 hover:border-yellow-500/50 transition-all">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-500" />
          Agent Booster
          <div className="flex items-center gap-1 ml-auto">
            {data.enabled && <LiveIndicator />}
            <RefreshButton onRefresh={refresh} />
          </div>
        </CardTitle>
        <CardDescription className="flex items-center justify-between">
          <span>Fast local execution</span>
          <LastUpdate date={lastUpdate} />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xl font-bold text-yellow-500">{data.totalTasks}</div>
            <div className="text-xs text-muted-foreground">Tasks</div>
          </div>
          <div>
            <div className="text-xl font-bold text-green-500">{data.successRate}%</div>
            <div className="text-xs text-muted-foreground">Success</div>
          </div>
          <div>
            <div className="text-xl font-bold text-blue-500">{data.costSaved}</div>
            <div className="text-xs text-muted-foreground">Saved</div>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span>{data.timeSavedMinutes} мин сэкономлено</span>
          </div>
          <Badge variant="secondary" className="text-xs">352x faster</Badge>
        </div>

        {data.recentHistory.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Recent</div>
            {data.recentHistory.slice(0, 3).map((h, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {h.success ? (
                  <CheckCircle className="w-3 h-3 text-green-500" />
                ) : (
                  <XCircle className="w-3 h-3 text-red-500" />
                )}
                <span className="truncate">{h.type}: {h.file}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * HNSW Vector Widget - Semantic Search
 */
export function VectorWidget() {
  const { data, loading, refresh, lastUpdate } = useAutoRefresh<VectorStats>("/api/vector")

  if (loading) {
    return <WidgetSkeleton title="Vector Search" />
  }

  if (!data?.configured) {
    return (
      <WidgetNotConfigured 
        title="Vector Search" 
        icon={Search}
        message="HNSW index не инициализирован"
      />
    )
  }

  return (
    <Card className="border-blue-500/30 hover:border-blue-500/50 transition-all">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Search className="w-4 h-4 text-blue-500" />
          HNSW Vector Search
          <div className="flex items-center gap-1 ml-auto">
            <Badge variant="outline">{data.distanceMetric}</Badge>
            <RefreshButton onRefresh={refresh} />
          </div>
        </CardTitle>
        <CardDescription className="flex items-center justify-between">
          <span>Semantic memory search</span>
          <LastUpdate date={lastUpdate} />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-blue-500">{data.totalDocuments}</div>
            <div className="text-xs text-muted-foreground">Documents</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{data.dimensions}D</div>
            <div className="text-xs text-muted-foreground">Dimensions</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex flex-col items-center p-2 bg-muted/30 rounded">
            <span className="font-bold">{data.maxLevel}</span>
            <span className="text-muted-foreground">Levels</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-muted/30 rounded">
            <span className="font-bold">{data.avgConnections}</span>
            <span className="text-muted-foreground">Avg Conn</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-muted/30 rounded">
            <span className="font-bold">{data.memoryKB} KB</span>
            <span className="text-muted-foreground">Memory</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * AIDefence Widget - Security & Threat Detection
 */
export function DefenceWidget() {
  const { data, loading, refresh, lastUpdate } = useAutoRefresh<DefenceStats>("/api/defence")

  if (loading) {
    return <WidgetSkeleton title="AIDefence" />
  }

  if (!data?.configured) {
    return (
      <WidgetNotConfigured 
        title="AIDefence" 
        icon={Shield}
        message="Security не инициализирован"
      />
    )
  }

  const threatLevel = data.threatsBlocked > 10 ? "high" : 
                      data.threatsBlocked > 0 ? "medium" : "low"

  return (
    <Card className={cn(
      "transition-all",
      threatLevel === "high" ? "border-red-500/50" :
      threatLevel === "medium" ? "border-yellow-500/30" :
      "border-green-500/30"
    )}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className={cn(
            "w-4 h-4",
            threatLevel === "high" ? "text-red-500" :
            threatLevel === "medium" ? "text-yellow-500" :
            "text-green-500"
          )} />
          AIDefence
          <div className="flex items-center gap-1 ml-auto">
            <Badge variant={
              threatLevel === "high" ? "destructive" :
              threatLevel === "medium" ? "warning" :
              "success"
            }>
              {data.sensitivity}
            </Badge>
            <RefreshButton onRefresh={refresh} />
          </div>
        </CardTitle>
        <CardDescription className="flex items-center justify-between">
          <span>Security & threat detection</span>
          <LastUpdate date={lastUpdate} />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xl font-bold">{data.totalScans}</div>
            <div className="text-xs text-muted-foreground">Scans</div>
          </div>
          <div>
            <div className="text-xl font-bold text-yellow-500">{data.threatsDetected}</div>
            <div className="text-xs text-muted-foreground">Detected</div>
          </div>
          <div>
            <div className="text-xl font-bold text-red-500">{data.threatsBlocked}</div>
            <div className="text-xs text-muted-foreground">Blocked</div>
          </div>
        </div>

        {data.quarantineActive > 0 && (
          <div className="flex items-center gap-2 text-sm text-yellow-500 bg-yellow-500/10 p-2 rounded">
            <AlertTriangle className="w-4 h-4" />
            <span>{data.quarantineActive} в карантине</span>
          </div>
        )}

        {data.recentEvents.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Recent Events</div>
            {data.recentEvents.slice(0, 3).map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <Badge variant={
                  e.severity === "critical" ? "destructive" :
                  e.severity === "high" ? "warning" :
                  "outline"
                } className="text-[10px] px-1">
                  {e.severity}
                </Badge>
                <span className="truncate">{e.category}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Consensus Widget - Distributed Agreement
 */
export function ConsensusWidget() {
  const { data, loading, refresh, lastUpdate } = useAutoRefresh<ConsensusStats>("/api/consensus")

  if (loading) {
    return <WidgetSkeleton title="Consensus" />
  }

  if (!data?.configured) {
    return (
      <WidgetNotConfigured 
        title="Consensus" 
        icon={Users2}
        message="Cluster не инициализирован"
      />
    )
  }

  return (
    <Card className={cn(
      "transition-all",
      data.hasQuorum ? "border-green-500/30" : "border-red-500/30"
    )}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users2 className="w-4 h-4 text-indigo-500" />
          Consensus
          <div className="flex items-center gap-1 ml-auto">
            {data.hasQuorum && <LiveIndicator />}
            <Badge variant={data.hasQuorum ? "success" : "destructive"}>
              {data.mode}
            </Badge>
            <RefreshButton onRefresh={refresh} />
          </div>
        </CardTitle>
        <CardDescription className="flex items-center justify-between">
          <span>Distributed agreement</span>
          <LastUpdate date={lastUpdate} />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold">{data.activeNodes}/{data.totalNodes}</div>
            <div className="text-xs text-muted-foreground">Active Nodes</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-indigo-500">T{data.term}</div>
            <div className="text-xs text-muted-foreground">Term</div>
          </div>
        </div>

        {data.leaderName && (
          <div className="flex items-center gap-2 text-sm bg-indigo-500/10 p-2 rounded">
            <Activity className="w-4 h-4 text-indigo-500" />
            <span>Leader: <strong>{data.leaderName}</strong></span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2 bg-yellow-500/10 rounded">
            <div className="font-bold text-yellow-500">{data.pendingProposals}</div>
            <div className="text-muted-foreground">Pending</div>
          </div>
          <div className="p-2 bg-green-500/10 rounded">
            <div className="font-bold text-green-500">{data.approvedProposals}</div>
            <div className="text-muted-foreground">Approved</div>
          </div>
          <div className="p-2 bg-red-500/10 rounded">
            <div className="font-bold text-red-500">{data.rejectedProposals}</div>
            <div className="text-muted-foreground">Rejected</div>
          </div>
        </div>

        {!data.hasQuorum && (
          <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 p-2 rounded">
            <AlertTriangle className="w-4 h-4" />
            <span>Quorum not reached!</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * MoE Router Widget - Mixture of Experts (Enhanced)
 */
export function MoEWidget() {
  const { data, loading, refresh, lastUpdate } = useAutoRefresh<MoEStats>("/api/moe")
  const [showCosts, setShowCosts] = useState(false)

  if (loading) {
    return <WidgetSkeleton title="MoE Router" />
  }

  if (!data?.configured) {
    return (
      <WidgetNotConfigured 
        title="MoE Router" 
        icon={Sparkles}
        message="Model router не инициализирован"
      />
    )
  }

  // Provider colors
  const providerColors: Record<string, string> = {
    anthropic: "text-purple-500",
    openai: "text-green-500",
    google: "text-blue-500"
  }

  return (
    <Card className="border-pink-500/30 hover:border-pink-500/50 transition-all">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-pink-500" />
          MoE Router
          <div className="flex items-center gap-1 ml-auto">
            {data.enabled && <LiveIndicator />}
            <RefreshButton onRefresh={refresh} />
          </div>
        </CardTitle>
        <CardDescription className="flex items-center justify-between">
          <span>Intelligent model selection</span>
          <LastUpdate date={lastUpdate} />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xl font-bold">{data.totalRequests}</div>
            <div className="text-xs text-muted-foreground">Requests</div>
          </div>
          <div>
            <div className="text-xl font-bold text-green-500">{data.successRate}%</div>
            <div className="text-xs text-muted-foreground">Success</div>
          </div>
          <div 
            className="cursor-pointer hover:bg-muted/30 rounded transition-colors"
            onClick={() => setShowCosts(!showCosts)}
          >
            <div className="text-xl font-bold text-blue-500">{data.totalCost}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <DollarSign className="w-3 h-3" />
              Cost
            </div>
          </div>
        </div>

        {/* Cost breakdown by provider (toggleable) */}
        {showCosts && data.byProvider && (
          <div className="space-y-1 p-2 bg-muted/20 rounded text-xs">
            <div className="font-medium mb-1">Cost by Provider</div>
            {Object.entries(data.byProvider).map(([provider, stats]) => (
              <div key={provider} className="flex items-center justify-between">
                <span className={cn("capitalize", providerColors[provider])}>
                  {provider}
                </span>
                <span>${stats.cost.toFixed(4)} ({stats.calls} calls)</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <span>{data.avgLatencyMs}ms avg latency</span>
          <Badge variant="secondary" className="ml-auto text-xs">
            {data.expertCount} experts
          </Badge>
        </div>

        {data.topExperts.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <BarChart3 className="w-3 h-3" />
              Top Experts
            </div>
            {data.topExperts.slice(0, 4).map((e, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="truncate flex items-center gap-1">
                  <span className={cn("w-2 h-2 rounded-full", 
                    e.provider === "anthropic" ? "bg-purple-500" :
                    e.provider === "openai" ? "bg-green-500" :
                    "bg-blue-500"
                  )} />
                  {e.name}
                </span>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-[10px] px-1">
                    {e.tier}
                  </Badge>
                  <span className="text-muted-foreground">{e.calls}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============ HELPER COMPONENTS ============

function WidgetSkeleton({ title }: { title: string }) {
  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="w-4 h-4 bg-muted rounded" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-12 bg-muted rounded" />
        <div className="h-4 bg-muted rounded w-3/4" />
      </CardContent>
    </Card>
  )
}

function WidgetNotConfigured({ 
  title, 
  icon: Icon, 
  message 
}: { 
  title: string
  icon: React.ElementType
  message: string 
}) {
  return (
    <Card className="border-dashed opacity-60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  )
}
