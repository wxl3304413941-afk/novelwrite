import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { NovelProject, Relationship, CharacterPersona } from '../types';

interface RelationshipGraphProps {
  project: NovelProject;
  onUpdateRelationships: (rels: Relationship[]) => void;
}

interface Node extends d3.SimulationNodeDatum {
  id: string;
  name: string;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  id: string;
  source: string | Node;
  target: string | Node;
  type: string;
  score: number;
}

export const RelationshipGraph: React.FC<RelationshipGraphProps> = ({ project, onUpdateRelationships }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selectedRelIds, setSelectedRelIds] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [minScore, setMinScore] = useState<number>(-100);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Apply filters
  const filteredRelationships = project.relationships.filter(r => {
    const s = project.characters.find(c => c.id === r.sourceCharacterId);
    const t = project.characters.find(c => c.id === r.targetCharacterId);
    const matchesFilterType = filterType === 'all' || r.type === filterType;
    const matchesScore = r.score >= minScore;
    const matchesSearch = !searchQuery || 
      s?.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      t?.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilterType && matchesScore && matchesSearch;
  });

  const selectedRels = project.relationships.filter(r => selectedRelIds.includes(r.id));
  const isBulkEdit = selectedRelIds.length > 1;
  const singleSelectedRel = selectedRelIds.length === 1 ? selectedRels[0] : null;
  const sourceChar = project.characters.find(c => c.id === singleSelectedRel?.sourceCharacterId);
  const targetChar = project.characters.find(c => c.id === singleSelectedRel?.targetCharacterId);

  // Bulk update temporary state
  const [bulkType, setBulkType] = useState<string>('');
  const [bulkScoreChange, setBulkScoreChange] = useState<number>(0);

  const handleBulkUpdate = (onUpdate: (rels: Relationship[]) => void) => {
    if (selectedRelIds.length === 0) return;
    
    const updatedRels = project.relationships.map(rel => {
      if (selectedRelIds.includes(rel.id)) {
        let newRel = { ...rel };
        if (bulkType) newRel.type = bulkType as any;
        if (bulkScoreChange !== 0) {
          const oldScore = rel.score;
          newRel.score = Math.max(-100, Math.min(100, rel.score + bulkScoreChange));
          
          if (newRel.score !== oldScore) {
            const historyEntry = {
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              oldScore: oldScore,
              newScore: newRel.score,
              reason: '批量数值调整',
            };
            newRel.history = [...(rel.history || []), historyEntry];
          }
        }
        return newRel;
      }
      return rel;
    });

    onUpdate(updatedRels);
    setBulkType('');
    setBulkScoreChange(0);
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.on('click', () => setSelectedRelIds([]));

    const nodes: Node[] = project.characters.map(c => ({ id: c.id, name: c.name }));
    const links: Link[] = filteredRelationships.map(r => ({
      id: r.id,
      source: r.sourceCharacterId,
      target: r.targetCharacterId,
      type: r.type,
      score: r.score
    }));

    const simulation = d3.forceSimulation<Node>(nodes)
      .force('link', d3.forceLink<Node, Link>(links).id(d => d.id).distance(240))
      .force('charge', d3.forceManyBody().strength(-1200))
      .force('center', d3.forceCenter(dimensions.width / 2, dimensions.height / 2))
      .force('collision', d3.forceCollide().radius(70))
      .force('x', d3.forceX(dimensions.width / 2).strength(0.12))
      .force('y', d3.forceY(dimensions.height / 2).strength(0.12));

    const g = svg.append('g');

    // Colored markers
    const colors = {
      hostile: '#ef4444',
      romantic: '#ec4899',
      friendship: '#22c55e',
      rivalry: '#f97316',
      neutral: '#64748b'
    };

    const defs = svg.append('defs');
    Object.entries(colors).forEach(([type, color]) => {
      defs.append('marker')
        .attr('id', `arrowhead-${type}`)
        .attr('viewBox', '-0 -5 10 10')
        .attr('refX', 25)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('xoverflow', 'visible')
        .append('svg:path')
        .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
        .attr('fill', color)
        .style('stroke', 'none');
    });

    /**
     * Relationship Visual Mapping:
     * 1. Color: Coded by relationship type (Hostile, Romantic, Friendship, Rivalry, Neutral).
     * 2. Thickness (Stroke Width): Corresponds to the strength of the bond.
     *    We use the absolute value of the score (0 to 100) to determine thickness.
     *    - Neutral/Weak bonds: Thinner edges (min 1px)
     *    - Intense/Strong bonds: Thicker edges (max 11px)
     *    This helps identify key character dynamics at a glance.
     */
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', d => colors[d.type as keyof typeof colors] || colors.neutral)
      .attr('stroke-opacity', 0.6)
      // Dynamic thickness calculation: Base 1px + (Absolute Score / 10)
      // Example: Score 0 -> width 1px; Score 100 -> width 11px
      .attr('stroke-width', d => 1 + (Math.abs(d.score) / 10))
      .attr('marker-end', d => `url(#arrowhead-${d.type})`)
      .style('cursor', 'pointer')
      .on('mouseover', function() { d3.select(this).attr('stroke-opacity', 1); })
      .on('mouseout', function() { d3.select(this).attr('stroke-opacity', 0.6); })
      .on('click', (event, d) => {
        event.stopPropagation();
        if (event.shiftKey) {
          setSelectedRelIds(prev => 
            prev.includes(d.id) ? prev.filter(id => id !== d.id) : [...prev, d.id]
          );
        } else {
          setSelectedRelIds([d.id]);
        }
      });

    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .enter().append('g')
      .call(d3.drag<SVGGElement, Node>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }) as any);

    node.append('circle')
      .attr('r', 20)
      .attr('fill', '#0a0a0a')
      .attr('stroke', '#00f2ff')
      .attr('stroke-width', 2);

    node.append('text')
      .text(d => d.name)
      .attr('x', 0)
      .attr('y', 35)
      .attr('text-anchor', 'middle')
      .attr('fill', '#00f2ff')
      .attr('font-size', '10px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('class', 'uppercase tracking-tighter');

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as Node).x!)
        .attr('y1', d => (d.source as Node).y!)
        .attr('x2', d => (d.target as Node).x!)
        .attr('y2', d => (d.target as Node).y!);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

  }, [dimensions, project.characters, filteredRelationships]);

  return (
    <div ref={containerRef} className="w-full h-[500px] bg-black/40 border border-white/10 relative overflow-hidden rounded-sm">
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-2">
        <div className="mono text-[9px] text-cyan uppercase tracking-widest bg-black/80 px-2 py-1 border border-cyan/20">
          关系网络拓扑图 (Relational_Matrix_Visualizer)
        </div>
        <div className="flex gap-2 bg-black/80 p-1 border border-white/10 backdrop-blur-md">
           <input 
             value={searchQuery}
             onChange={e => setSearchQuery(e.target.value)}
             placeholder="搜索角色..."
             className="bg-transparent text-[9px] mono text-white focus:outline-none border-r border-white/10 px-2 w-24"
           />
           <select 
             value={filterType}
             onChange={e => setFilterType(e.target.value)}
             className="bg-transparent text-[9px] mono text-cyan focus:outline-none px-1"
           >
             <option value="all" className="bg-ink">ALL_TYPES</option>
             <option value="romantic" className="bg-ink text-pink-400">ROMANTIC</option>
             <option value="friendship" className="bg-ink text-green-400">FRIENDSHIP</option>
             <option value="hostile" className="bg-ink text-red-400">HOSTILE</option>
             <option value="rivalry" className="bg-ink text-orange-400">RIVALRY</option>
             <option value="neutral" className="bg-ink opacity-40">NEUTRAL</option>
           </select>
           <div className="flex items-center gap-1 px-2 border-l border-white/10">
             <span className="mono text-[8px] opacity-40">MIN_SCORE:</span>
             <input 
               type="range" min="-100" max="100" 
               value={minScore} 
               onChange={e => setMinScore(parseInt(e.target.value))}
               className="w-12 h-1 accent-cyan cursor-pointer"
             />
             <span className="mono text-[8px] text-cyan w-6">{minScore}</span>
           </div>
        </div>
      </div>
      
      {/* Side Panel (Single History or Bulk Edit) */}
      {(singleSelectedRel || isBulkEdit) && (
        <div className="absolute top-0 right-0 h-full w-64 bg-black/90 border-l border-white/10 z-20 p-4 overflow-y-auto animate-in slide-in-from-right duration-300">
          <div className="flex justify-between items-start mb-4 border-b border-white/10 pb-2">
            <div>
              <div className="text-[10px] font-mono font-bold text-cyan uppercase">
                {isBulkEdit ? `批量编辑 (${selectedRelIds.length})` : '羁绊详情'}
              </div>
              {!isBulkEdit && (
                <div className="text-[8px] text-white/40 mono mt-1">
                  {sourceChar?.name} → {targetChar?.name}
                </div>
              )}
            </div>
            <button onClick={() => setSelectedRelIds([])} className="text-white/40 hover:text-white text-[10px] mono">关闭</button>
          </div>
          
          {isBulkEdit ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-widest opacity-40 mono">修改类型</label>
                  <select 
                   value={bulkType}
                   onChange={e => setBulkType(e.target.value)}
                   className="w-full bg-white/5 border border-white/10 p-2 text-[10px] mono text-white focus:outline-none"
                  >
                    <option value="" className="bg-ink">保持原样</option>
                    <option value="neutral" className="bg-ink">中立</option>
                    <option value="friendship" className="bg-ink">友好</option>
                    <option value="rivalry" className="bg-ink">竞争</option>
                    <option value="romantic" className="bg-ink">情爱</option>
                    <option value="hostile" className="bg-ink">敌对</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] uppercase tracking-widest opacity-40 mono">调整分值 (增量式)</label>
                  <div className="flex items-center gap-2">
                    <input 
                     type="number"
                     value={bulkScoreChange}
                     onChange={e => setBulkScoreChange(parseInt(e.target.value) || 0)}
                     className="w-full bg-white/5 border border-white/10 p-2 text-[10px] mono text-white focus:outline-none"
                    />
                    <div className="flex flex-col gap-1">
                      <button onClick={() => setBulkScoreChange(v => v + 5)} className="px-2 py-0.5 bg-white/10 text-[8px] hover:bg-white/20">+</button>
                      <button onClick={() => setBulkScoreChange(v => v - 5)} className="px-2 py-0.5 bg-white/10 text-[8px] hover:bg-white/20">-</button>
                    </div>
                  </div>
                </div>
              </div>
              
              <button 
                onClick={() => handleBulkUpdate(onUpdateRelationships)}
                className="w-full py-2 bg-cyan/20 border border-cyan/40 text-cyan text-[10px] mono uppercase hover:bg-cyan/30 transition-all font-bold"
              >
                应用更改 (APPLY_CHANGES)
              </button>

              <div className="pt-4 border-t border-white/5">
                <div className="text-[8px] text-white/40 mono mb-2 uppercase">选中的羁绊列表:</div>
                <div className="space-y-2">
                  {selectedRels.map(rel => {
                    const s = project.characters.find(c => c.id === rel.sourceCharacterId);
                    const t = project.characters.find(c => c.id === rel.targetCharacterId);
                    return (
                      <div key={rel.id} className="text-[9px] mono p-2 bg-white/5 border border-white/5 rounded-sm">
                        <div className="flex justify-between">
                          <span className="text-cyan">{s?.name} ↔ {t?.name}</span>
                          <span className="opacity-40">{rel.score}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-white/5 border border-white/10 rounded-sm space-y-2">
                <div className="flex justify-between text-[10px] mono uppercase">
                  <span className="opacity-40">当前类型:</span>
                  <span className="text-cyan">{singleSelectedRel?.type}</span>
                </div>
                <div className="flex justify-between text-[10px] mono uppercase">
                  <span className="opacity-40">当前分值:</span>
                  <span className={singleSelectedRel!.score >= 0 ? 'text-green-400' : 'text-red-400'}>{singleSelectedRel?.score}</span>
                </div>
              </div>

              <div className="text-[10px] font-mono font-bold text-white/60 uppercase mt-6 mb-2">演变历史</div>
              <div className="space-y-4">
                {!singleSelectedRel?.history || singleSelectedRel.history.length === 0 ? (
                  <div className="text-[9px] mono text-white/20 italic">暂无历史记录。</div>
                ) : (
                  singleSelectedRel.history.slice().reverse().map((h) => (
                    <div key={h.id} className="relative pl-3 border-l border-white/10 space-y-1">
                      <div className="absolute left-[-3px] top-1 w-1.5 h-1.5 rounded-full bg-cyan"></div>
                      <div className="flex justify-between items-center text-[8px] mono">
                        <span className="text-white/40">{new Date(h.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        <span className={h.newScore > h.oldScore ? 'text-green-400' : 'text-red-400'}>
                          {h.oldScore} → {h.newScore}
                        </span>
                      </div>
                      <div className="text-[9px] text-white/80 leading-relaxed italic">{h.reason || '无明确原因'}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="absolute bottom-2 left-2 z-10 bg-black/80 p-2 border border-white/10 rounded-sm flex flex-col gap-1">
        <div className="flex items-center gap-2 text-[8px] mono text-white">
          <div className="w-2 h-2 rounded-full bg-[#22c55e]"></div> 友好
        </div>
        <div className="flex items-center gap-2 text-[8px] mono text-white">
          <div className="w-2 h-2 rounded-full bg-[#ec4899]"></div> 情爱
        </div>
        <div className="flex items-center gap-2 text-[8px] mono text-white">
          <div className="w-2 h-2 rounded-full bg-[#f97316]"></div> 竞争
        </div>
        <div className="flex items-center gap-2 text-[8px] mono text-white">
          <div className="w-2 h-2 rounded-full bg-[#ef4444]"></div> 敌对
        </div>
        <div className="flex items-center gap-2 text-[8px] mono text-white">
          <div className="w-2 h-2 rounded-full bg-[#64748b]"></div> 中立
        </div>
        <div className="mt-1 pt-1 border-t border-white/5 text-[7px] mono text-cyan/60 uppercase italic">
          线条粗细代表羁绊强度 (Edge logic: Thickness = Strength)
        </div>
      </div>
      <svg ref={svgRef} className="w-full h-full cursor-move" />
    </div>
  );
};
