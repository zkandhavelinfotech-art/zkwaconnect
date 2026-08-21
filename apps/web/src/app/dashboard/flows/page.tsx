"use client"
import { useState, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { templateApi } from '@/lib/api'
import api from '@/lib/api'
import { toast } from 'sonner'

// ── Flow node types ────────────────────────────────────────
const NODE_TYPES = {
  trigger:   { label:'Trigger',   color:'#8b5cf6', bg:'#f5f3ff', border:'#c4b5fd', icon:'⚡' },
  condition: { label:'Condition', color:'#d97706', bg:'#fffbeb', border:'#fcd34d', icon:'❓' },
  action:    { label:'Action',    color:'#059669', bg:'#f0fdf4', border:'#6ee7b7', icon:'▶️' },
  delay:     { label:'Delay',     color:'#2563eb', bg:'#eff6ff', border:'#93c5fd', icon:'⏳' },
  end:       { label:'End',       color:'#dc2626', bg:'#fef2f2', border:'#fca5a5', icon:'⏹' },
}

const TRIGGERS = [
  { id:'inbound_message',  label:'Inbound Message',   desc:'When a contact sends a WhatsApp message' },
  { id:'new_lead',         label:'New Lead Created',  desc:'When a new lead is classified' },
  { id:'keyword_match',    label:'Keyword Match',     desc:'Message contains specific keywords' },
  { id:'contact_label',    label:'Label Added',       desc:'When a label is added to a contact' },
  { id:'scheduled',        label:'Scheduled Time',    desc:'Run at a specific time/interval' },
]
const CONDITIONS = [
  { id:'lead_category',    label:'Lead Category',     desc:'Check the lead classification' },
  { id:'contact_label',    label:'Has Label',         desc:'Contact has a specific label' },
  { id:'message_contains', label:'Message Contains',  desc:'Message body contains text' },
  { id:'business_hours',   label:'Business Hours',    desc:'Current time is within business hours' },
  { id:'opted_in',         label:'Opted In',          desc:'Contact has opted in to messages' },
]
const ACTIONS = [
  { id:'send_template',    label:'Send Template',     desc:'Send an approved WhatsApp template' },
  { id:'send_text',        label:'Send Text',         desc:'Send a custom text message' },
  { id:'assign_agent',     label:'Assign Agent',      desc:'Assign conversation to an agent' },
  { id:'add_label',        label:'Add Label',         desc:'Add a label to the contact' },
  { id:'create_lead',      label:'Create Lead',       desc:'Manually create a lead record' },
  { id:'update_stage',     label:'Update Lead Stage', desc:'Move lead to a different pipeline stage' },
  { id:'send_twilio_sms',  label:'Send SMS Alert',    desc:'Send Twilio SMS to agent/owner' },
  { id:'wait_delay',       label:'Wait / Delay',      desc:'Wait before the next action' },
]

type NodeType = 'trigger'|'condition'|'action'|'delay'|'end'
interface FlowNode {
  id: string; type: NodeType; x: number; y: number
  config: { kind?: string; label?: string; value?: string; templateId?: string }
  connections: string[]
}
interface Flow {
  id?: string; name: string; description: string; isActive: boolean; nodes: FlowNode[]
}

let nodeCounter = 1
function newId() { return `node_${nodeCounter++}` }

const DEMO_FLOW: FlowNode[] = [
  { id:'node_1', type:'trigger',   x:60,  y:80,  config:{ kind:'inbound_message', label:'Inbound Message' }, connections:['node_2'] },
  { id:'node_2', type:'condition', x:60,  y:220, config:{ kind:'lead_category',   label:'Is Service Request?' }, connections:['node_3','node_4'] },
  { id:'node_3', type:'action',    x:220, y:360, config:{ kind:'send_template',   label:'Send Confirmation' }, connections:['node_5'] },
  { id:'node_4', type:'action',    x:400, y:360, config:{ kind:'assign_agent',    label:'Assign to Agent' }, connections:['node_5'] },
  { id:'node_5', type:'end',       x:300, y:500, config:{ label:'End' }, connections:[] },
]

export default function FlowsPage() {
  const qc  = useQueryClient()
  const svgRef = useRef<SVGSVGElement>(null)

  const [flows, setFlows] = useState<Flow[]>([
    { name:'Lead Auto-Reply', description:'Auto-classify and reply to inbound leads', isActive: true, nodes: DEMO_FLOW },
  ])
  const [activeFlow, setActiveFlow]   = useState<Flow | null>(null)
  const [nodes, setNodes]             = useState<FlowNode[]>([])
  const [selected, setSelected]       = useState<string | null>(null)
  const [showPalette, setShowPalette] = useState(true)
  const [showFlowList, setShowFlowList] = useState(true)
  const [connecting, setConnecting]   = useState<string | null>(null)
  const [dragging, setDragging]       = useState<{ id: string; ox: number; oy: number } | null>(null)
  const [showSave, setShowSave]       = useState(false)
  const [newName, setNewName]         = useState('')

  const { data: tplData } = useQuery({ queryKey:['templates'], queryFn:()=>templateApi.list({status:'APPROVED'}).then(r=>r.data.data) })
  const templates = Array.isArray(tplData) ? tplData : []

  function openFlow(flow: Flow) {
    setActiveFlow(flow)
    setNodes([...flow.nodes])
    setSelected(null)
    setShowFlowList(false)
  }

  function newFlow() {
    const f: Flow = { name: `Flow ${flows.length + 1}`, description: '', isActive: false, nodes: [] }
    setActiveFlow(f)
    setNodes([])
    setShowFlowList(false)
  }

  function addNode(type: NodeType, kind: string, label: string) {
    const n: FlowNode = {
      id:    newId(),
      type,
      x:     120 + Math.random() * 200,
      y:     120 + Math.random() * 200,
      config:{ kind, label },
      connections: [],
    }
    setNodes(ns => [...ns, n])
    setSelected(n.id)
  }

  function removeNode(id: string) {
    setNodes(ns => ns.filter(n => n.id !== id).map(n => ({ ...n, connections: n.connections.filter(c => c !== id) })))
    if (selected === id) setSelected(null)
  }

  function handleNodeMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (connecting) {
      if (connecting !== id) {
        setNodes(ns => ns.map(n => n.id === connecting ? { ...n, connections: [...new Set([...n.connections, id])] } : n))
      }
      setConnecting(null)
      return
    }
    setSelected(id)
    const svg  = svgRef.current!.getBoundingClientRect()
    const node = nodes.find(n => n.id === id)!
    setDragging({ id, ox: e.clientX - svg.left - node.x, oy: e.clientY - svg.top - node.y })
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging) return
    const svg = svgRef.current!.getBoundingClientRect()
    setNodes(ns => ns.map(n => n.id === dragging.id ? { ...n, x: Math.max(0, e.clientX - svg.left - dragging.ox), y: Math.max(0, e.clientY - svg.top - dragging.oy) } : n))
  }

  function handleMouseUp() { setDragging(null) }

  function saveFlow() {
    if (!activeFlow) return
    const updated = { ...activeFlow, nodes }
    if (newName) updated.name = newName
    setFlows(fs => {
      const idx = fs.findIndex(f => f.name === activeFlow.name)
      if (idx >= 0) { const copy = [...fs]; copy[idx] = updated; return copy }
      return [...fs, updated]
    })
    setActiveFlow(updated)
    setShowSave(false)
    toast.success('Flow saved')
  }

  const selNode  = nodes.find(n => n.id === selected)
  const NT       = NODE_TYPES

  // Arrow path between two nodes
  function arrowPath(from: FlowNode, toId: string) {
    const to = nodes.find(n => n.id === toId)
    if (!to) return null
    const x1 = from.x + 110; const y1 = from.y + 36
    const x2 = to.x + 110;   const y2 = to.y
    const cy = (y1 + y2) / 2
    return `M${x1},${y1} C${x1},${cy} ${x2},${cy} ${x2},${y2}`
  }

  if (showFlowList) return (
    <div className="page-inner">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Flow Builder</h1>
          <p className="text-sm text-slate-500">Visual WhatsApp automation — triggers, conditions, actions</p>
        </div>
        <button onClick={newFlow} className="btn-brand">+ New Flow</button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card card-body col-span-2 bg-gradient-to-r from-purple-50 to-green-50 border-purple-200">
          <div className="flex items-start gap-4">
            <span className="text-4xl">⚡</span>
            <div>
              <div className="font-semibold text-slate-900 mb-1">Visual automation for WhatsApp</div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Build automated flows with drag-and-drop. Trigger on inbound messages, classify leads, send templates, assign agents — all without code.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {['Auto-reply to leads','Label-based routing','Business hours check','Template sequences','Agent assignment'].map(f => (
                  <span key={f} className="text-xs bg-white border border-slate-200 rounded-full px-2.5 py-1 text-slate-600">{f}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {flows.map((f, i) => (
          <div key={i} className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => openFlow(f)}>
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600 text-xl">⚡</div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">{f.name}</span>
                <span className={`badge ${f.isActive ? 'badge-green' : 'badge-slate'}`}>{f.isActive ? 'Active' : 'Draft'}</span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{f.description || 'No description'} · {f.nodes.length} nodes</div>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-outline text-xs py-1.5" onClick={e => { e.stopPropagation(); openFlow(f) }}>Edit →</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // ── Canvas editor ─────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden" style={{marginLeft:0}}>

      {/* Left palette */}
      {showPalette && (
        <div className="w-56 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Flow Nodes</span>
              <button onClick={() => setShowFlowList(true)} className="text-xs text-slate-400 hover:text-slate-600">← Flows</button>
            </div>
            <div className="text-xs text-slate-500 font-medium mt-2 truncate">{activeFlow?.name}</div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            {/* Triggers */}
            <div>
              <div className="text-[10px] font-semibold text-purple-600 uppercase tracking-widest mb-1.5 px-1">⚡ Triggers</div>
              {TRIGGERS.map(t => (
                <div key={t.id} draggable onDragEnd={() => addNode('trigger', t.id, t.label)}
                  className="flex items-start gap-2 p-2 rounded-lg hover:bg-purple-50 cursor-grab active:cursor-grabbing mb-1 border border-transparent hover:border-purple-100 transition-all"
                  onClick={() => addNode('trigger', t.id, t.label)}>
                  <span className="text-xs mt-0.5">⚡</span>
                  <div><div className="text-xs font-medium text-slate-800">{t.label}</div><div className="text-[10px] text-slate-400">{t.desc}</div></div>
                </div>
              ))}
            </div>
            {/* Conditions */}
            <div>
              <div className="text-[10px] font-semibold text-yellow-600 uppercase tracking-widest mb-1.5 px-1">❓ Conditions</div>
              {CONDITIONS.map(c => (
                <div key={c.id} onClick={() => addNode('condition', c.id, c.label)}
                  className="flex items-start gap-2 p-2 rounded-lg hover:bg-yellow-50 cursor-pointer mb-1 border border-transparent hover:border-yellow-100 transition-all">
                  <span className="text-xs mt-0.5">❓</span>
                  <div><div className="text-xs font-medium text-slate-800">{c.label}</div><div className="text-[10px] text-slate-400">{c.desc}</div></div>
                </div>
              ))}
            </div>
            {/* Actions */}
            <div>
              <div className="text-[10px] font-semibold text-green-600 uppercase tracking-widest mb-1.5 px-1">▶️ Actions</div>
              {ACTIONS.map(a => (
                <div key={a.id} onClick={() => addNode('action', a.id, a.label)}
                  className="flex items-start gap-2 p-2 rounded-lg hover:bg-green-50 cursor-pointer mb-1 border border-transparent hover:border-green-100 transition-all">
                  <span className="text-xs mt-0.5">▶️</span>
                  <div><div className="text-xs font-medium text-slate-800">{a.label}</div><div className="text-[10px] text-slate-400">{a.desc}</div></div>
                </div>
              ))}
            </div>
            {/* End */}
            <div>
              <div className="text-[10px] font-semibold text-red-500 uppercase tracking-widest mb-1.5 px-1">⏹ End</div>
              <div onClick={() => addNode('end', 'end', 'End')}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-red-50 cursor-pointer border border-transparent hover:border-red-100 transition-all">
                <span className="text-xs">⏹</span>
                <div className="text-xs font-medium text-slate-800">End Flow</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
        {/* Toolbar */}
        <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-3 flex-shrink-0">
          <button onClick={() => setShowPalette(p => !p)} className="btn-outline text-xs py-1.5">{showPalette ? '← Hide' : '→ Nodes'}</button>
          <span className="text-sm font-medium text-slate-700">{activeFlow?.name}</span>
          <div className="flex items-center gap-1 ml-2">
            <div className="w-2 h-2 rounded-full bg-purple-400"/>
            <span className="text-xs text-slate-400">Trigger</span>
            <div className="w-2 h-2 rounded-full bg-yellow-400 ml-2"/>
            <span className="text-xs text-slate-400">Condition</span>
            <div className="w-2 h-2 rounded-full bg-green-400 ml-2"/>
            <span className="text-xs text-slate-400">Action</span>
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={() => setNodes([])} className="btn-outline text-xs py-1.5 text-red-500">Clear</button>
            <button onClick={() => { setNewName(activeFlow?.name || ''); setShowSave(true) }} className="btn-brand text-xs py-1.5">💾 Save Flow</button>
          </div>
        </div>

        {/* SVG canvas */}
        <div className="flex-1 overflow-auto relative">
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none">
              <div className="text-5xl mb-3">⚡</div>
              <div className="text-base font-medium">Click nodes in the left panel to add them</div>
              <div className="text-sm mt-1">Then drag to position and click → Connect to link nodes</div>
            </div>
          )}

          <svg ref={svgRef} className="w-full" style={{minHeight:600, minWidth:700}}
            onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
            onClick={() => { if (!dragging) setSelected(null) }}>

            {/* Grid dots */}
            <defs>
              <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="#e2e8f0"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)"/>

            {/* Connection arrows */}
            {nodes.map(from => from.connections.map(toId => {
              const path = arrowPath(from, toId)
              return path ? (
                <g key={`${from.id}-${toId}`}>
                  <path d={path} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5,3" markerEnd="url(#arrow)"/>
                </g>
              ) : null
            }))}

            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8"/>
              </marker>
            </defs>

            {/* Nodes */}
            {nodes.map(node => {
              const nt      = NT[node.type]
              const isSel   = selected === node.id
              const isConn  = connecting === node.id
              return (
                <g key={node.id} transform={`translate(${node.x},${node.y})`}
                  onMouseDown={e => handleNodeMouseDown(e, node.id)}
                  style={{cursor: dragging?.id === node.id ? 'grabbing' : connecting ? 'crosshair' : 'grab'}}>

                  {/* Shadow */}
                  <rect x={2} y={2} rx={8} width={220} height={72} fill="rgba(0,0,0,0.06)"/>

                  {/* Card */}
                  <rect rx={8} width={220} height={72}
                    fill={nt.bg}
                    stroke={isSel ? nt.color : isConn ? '#6366f1' : nt.border}
                    strokeWidth={isSel || isConn ? 2 : 1}/>

                  {/* Left accent bar */}
                  <rect rx={4} width={4} height={72} fill={nt.color}/>

                  {/* Icon */}
                  <text x={18} y={44} fontSize={18}>{nt.icon}</text>

                  {/* Type label */}
                  <text x={44} y={26} fontSize={9} fontWeight={600} fill={nt.color}
                    fontFamily="var(--font-sans)" textAnchor="start" letterSpacing={1}
                    style={{textTransform:'uppercase'}}>
                    {nt.label}
                  </text>

                  {/* Node label */}
                  <text x={44} y={44} fontSize={12} fontWeight={600} fill="#1e293b" fontFamily="var(--font-sans)">
                    {(node.config.label || '').length > 18 ? node.config.label!.slice(0,18)+'…' : node.config.label}
                  </text>

                  {/* Config hint */}
                  {node.config.kind && (
                    <text x={44} y={60} fontSize={9} fill="#94a3b8" fontFamily="var(--font-mono)">
                      {node.config.kind.replace(/_/g,' ')}
                    </text>
                  )}

                  {/* Connect handle */}
                  <circle cx={220} cy={36} r={6} fill={connecting === node.id ? '#6366f1' : '#cbd5e1'}
                    stroke="white" strokeWidth={1.5}
                    style={{cursor:'crosshair'}}
                    onClick={e => { e.stopPropagation(); setConnecting(connecting === node.id ? null : node.id) }}/>

                  {/* Delete button */}
                  {isSel && (
                    <g onClick={e => { e.stopPropagation(); removeNode(node.id) }} style={{cursor:'pointer'}}>
                      <circle cx={210} cy={8} r={8} fill="#ef4444"/>
                      <text x={210} y={12} fontSize={10} fill="white" textAnchor="middle">×</text>
                    </g>
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        {/* Selected node config panel */}
        {selNode && (
          <div className="bg-white border-t border-slate-200 p-4 flex-shrink-0">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-lg">{NT[selNode.type].icon}</span>
              <span className="font-semibold text-slate-900 text-sm">{selNode.config.label}</span>
              <span className={`badge text-[10px]`} style={{background:NT[selNode.type].bg, color:NT[selNode.type].color}}>
                {NT[selNode.type].label}
              </span>
              <button onClick={() => removeNode(selNode.id)} className="ml-auto text-xs text-red-500 hover:underline">Delete node</button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="form-label">Label</label>
                <input className="form-input text-xs" value={selNode.config.label || ''} onChange={e => setNodes(ns => ns.map(n => n.id === selNode.id ? {...n, config:{...n.config, label:e.target.value}} : n))} />
              </div>
              {selNode.type === 'action' && selNode.config.kind === 'send_template' && (
                <div>
                  <label className="form-label">Template</label>
                  <select className="form-select text-xs" value={selNode.config.templateId||''} onChange={e => setNodes(ns => ns.map(n => n.id === selNode.id ? {...n, config:{...n.config, templateId:e.target.value}} : n))}>
                    <option value="">Select…</option>
                    {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              {selNode.type === 'condition' && (
                <div>
                  <label className="form-label">Value</label>
                  <input className="form-input text-xs" placeholder="e.g. SERVICE_REQUEST" value={selNode.config.value||''} onChange={e => setNodes(ns => ns.map(n => n.id === selNode.id ? {...n, config:{...n.config, value:e.target.value}} : n))} />
                </div>
              )}
              <div>
                <label className="form-label">Connections</label>
                <div className="text-xs text-slate-500 mt-2">
                  {selNode.connections.length > 0 ? selNode.connections.map(id => <span key={id} className="badge badge-blue mr-1">{id}</span>) : 'Click → on node to connect'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save modal */}
      {showSave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowSave(false)}>
          <div className="bg-white rounded-xl w-80 p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-4">Save Flow</h3>
            <div className="space-y-3">
              <div><label className="form-label">Flow Name</label>
                <input className="form-input" value={newName} onChange={e => setNewName(e.target.value)}/></div>
              <div className="flex gap-3">
                <button onClick={() => setShowSave(false)} className="flex-1 btn-outline">Cancel</button>
                <button onClick={saveFlow} className="flex-1 btn-brand justify-center">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
