"use client"

import { useState, useEffect } from "react"
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
  Activity
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
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
  }>
}

// ============ API HOOKS ============

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3334"

async function fetchData<T>(endpoint: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// ============ WIDGETS ============

/**
 * SONA Widget - Self-Optimizing Neural Architecture
 */
export function SONAWidget() {
  const [data, setData] = useState<SONAStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData<SONAStats>("/api/sona").then(d => {
      setData(d)
      setLoading(false)
    })
  }, [])

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
          {data.enabled && <Badge variant="success" className="ml-auto">Active</Badge>}
        </CardTitle>
        <CardDescription>Self-learning task routing</CardDescription>
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

        {data.topAgents.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Top Agents</div>
            {data.topAgents.slice(0, 3).map((agent, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="truncate">{agent.name}</span>
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
  const [data, setData] = useState<BoosterStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData<BoosterStats>("/api/booster").then(d => {
      setData(d)
      setLoading(false)
    })
  }, [])

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
          {data.enabled && <Badge variant="success" className="ml-auto">Active</Badge>}
        </CardTitle>
        <CardDescription>Fast local execution</CardDescription>
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

        <div className="flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span>{data.timeSavedMinutes} мин сэкономлено</span>
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
  const [data, setData] = useState<VectorStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData<VectorStats>("/api/vector").then(d => {
      setData(d)
      setLoading(false)
    })
  }, [])

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
          <Badge variant="outline" className="ml-auto">{data.distanceMetric}</Badge>
        </CardTitle>
        <CardDescription>Semantic memory search</CardDescription>
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

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Levels:</span>
            <span>{data.maxLevel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Avg Conn:</span>
            <span>{data.avgConnections}</span>
          </div>
          <div className="flex items-center justify-between col-span-2">
            <span className="text-muted-foreground">Memory:</span>
            <span>{data.memoryKB} KB</span>
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
  const [data, setData] = useState<DefenceStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData<DefenceStats>("/api/defence").then(d => {
      setData(d)
      setLoading(false)
    })
  }, [])

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
          <Badge variant={
            threatLevel === "high" ? "destructive" :
            threatLevel === "medium" ? "warning" :
            "success"
          } className="ml-auto">
            {data.sensitivity}
          </Badge>
        </CardTitle>
        <CardDescription>Security & threat detection</CardDescription>
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
          <div className="flex items-center gap-2 text-sm text-yellow-500">
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
  const [data, setData] = useState<ConsensusStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData<ConsensusStats>("/api/consensus").then(d => {
      setData(d)
      setLoading(false)
    })
  }, [])

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
          <Badge variant={data.hasQuorum ? "success" : "destructive"} className="ml-auto">
            {data.mode}
          </Badge>
        </CardTitle>
        <CardDescription>Distributed agreement</CardDescription>
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
          <div className="flex items-center gap-2 text-sm">
            <Activity className="w-4 h-4 text-primary" />
            <span>Leader: {data.leaderName}</span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <div className="font-bold text-yellow-500">{data.pendingProposals}</div>
            <div className="text-muted-foreground">Pending</div>
          </div>
          <div>
            <div className="font-bold text-green-500">{data.approvedProposals}</div>
            <div className="text-muted-foreground">Approved</div>
          </div>
          <div>
            <div className="font-bold text-red-500">{data.rejectedProposals}</div>
            <div className="text-muted-foreground">Rejected</div>
          </div>
        </div>

        {!data.hasQuorum && (
          <div className="flex items-center gap-2 text-sm text-red-500">
            <AlertTriangle className="w-4 h-4" />
            <span>Quorum not reached!</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * MoE Router Widget - Mixture of Experts
 */
export function MoEWidget() {
  const [data, setData] = useState<MoEStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData<MoEStats>("/api/moe").then(d => {
      setData(d)
      setLoading(false)
    })
  }, [])

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

  return (
    <Card className="border-pink-500/30 hover:border-pink-500/50 transition-all">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-pink-500" />
          MoE Router
          {data.enabled && <Badge variant="success" className="ml-auto">Active</Badge>}
        </CardTitle>
        <CardDescription>Intelligent model selection</CardDescription>
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
          <div>
            <div className="text-xl font-bold text-blue-500">{data.totalCost}</div>
            <div className="text-xs text-muted-foreground">Cost</div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <span>{data.avgLatencyMs}ms avg latency</span>
        </div>

        {data.topExperts.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Top Experts ({data.expertCount} total)</div>
            {data.topExperts.slice(0, 3).map((e, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="truncate">{e.name}</span>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-[10px] px-1">{e.provider}</Badge>
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
