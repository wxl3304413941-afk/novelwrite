import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { NovelProject, WikiEntry, CharacterPersona } from '../types';
import { Maximize2, Minimize2, ZoomIn, ZoomOut, RefreshCw, Filter, Sparkles, BrainCircuit, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { suggestWikiLinks } from '../lib/gemini';

interface KnowledgeGraphProps {
  project: NovelProject;
  setProject: React.Dispatch<React.SetStateAction<NovelProject>>;
}

type NodeType = 'character' | 'lore' | 'setting' | 'hook' | 'state';

interface Node extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: NodeType;
  val: number;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string;
  target: string;
  type: 'relationship' | 'lore-link';
}

export const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ project, setProject }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeSelectionRef = useRef<d3.Selection<SVGGElement, Node, SVGGElement, unknown> | null>(null);
  const linkSelectionRef = useRef<d3.Selection<SVGLineElement, Link, SVGGElement, unknown> | null>(null);
  const linksRef = useRef<Link[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [filter, setFilter] = useState<NodeType | 'all'>('all');
  const [suggestions, setSuggestions] = useState<{ id: string; name: string; reason: string }[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isSuggestionsExpanded, setIsSuggestionsExpanded] = useState(true);

  const getIsLinked = (targetId: string) => {
    if (!selectedNode) return false;
    const isWikiNode = selectedNode.type !== 'character';
    if (isWikiNode) {
      const entry = project.wiki.find(w => w.id === selectedNode.id);
      return entry?.relatedIds.includes(targetId) || false;
    } else {
      const char = project.characters.find(c => c.id === selectedNode.id);
      return char?.relatedLoreIds.includes(targetId) || false;
    }
  };

  const handleSuggestLinks = React.useCallback(async () => {
    if (!selectedNode) return;
    
    setIsSuggesting(true);
    setSuggestions([]);
    
    try {
      let entry: WikiEntry;
      if (selectedNode.type === 'character') {
        const char = project.characters.find(c => c.id === selectedNode.id);
        if (!char) return;
        entry = {
          id: char.id,
          title: char.name,
          content: `${char.role}. ${char.personaAnchor}. Motives: ${char.coreMotives}`,
          type: 'lore',
          tags: [],
          relatedIds: char.relatedLoreIds || []
        };
      } else {
        const lore = project.wiki.find(w => w.id === selectedNode.id);
        if (!lore) return;
        entry = lore;
      }
      
      const results = await suggestWikiLinks(project, entry);
      setSuggestions(results.suggestions || []);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSuggesting(false);
    }
  }, [selectedNode, project]);

  const handleLinkOne = (s: { id: string; name: string }) => {
    if (!selectedNode || getIsLinked(s.id)) return;
    
    const isWikiNode = selectedNode.type !== 'character';
    if (isWikiNode) {
        setProject(p => ({
            ...p,
            wiki: p.wiki.map(w => w.id === selectedNode.id ? { ...w, relatedIds: [...(w.relatedIds || []), s.id] } : w)
        }));
    } else {
        setProject(p => ({
            ...p,
            characters: p.characters.map(c => c.id === selectedNode.id ? { ...c, relatedLoreIds: [...(c.relatedLoreIds || []), s.id] } : c)
        }));
    }
  };

  const handleLinkAll = () => {
    if (!selectedNode || suggestions.length === 0) return;
    
    const unlinkedSuggestions = suggestions.filter(s => !getIsLinked(s.id));
    if (unlinkedSuggestions.length === 0) return;
    const newIds = unlinkedSuggestions.map(s => s.id);

    const isWikiNode = selectedNode.type !== 'character';
    if (isWikiNode) {
        setProject(p => ({
            ...p,
            wiki: p.wiki.map(w => w.id === selectedNode.id ? { ...w, relatedIds: [...(w.relatedIds || []), ...newIds] } : w)
        }));
    } else {
        setProject(p => ({
            ...p,
            characters: p.characters.map(c => c.id === selectedNode.id ? { ...c, relatedLoreIds: [...(c.relatedLoreIds || []), ...newIds] } : c)
        }));
    }
  };

  useEffect(() => {
    if (selectedNode) {
      handleSuggestLinks();
    } else {
      setSuggestions([]);
    }
  }, [selectedNode, handleSuggestLinks]);

  useEffect(() => {
    if (!nodeSelectionRef.current || !linkSelectionRef.current) return;

    const node = nodeSelectionRef.current;
    const link = linkSelectionRef.current;
    const links = linksRef.current;
    const activeId = hoveredNodeId || selectedNode?.id;
    
    if (!activeId) {
      node.transition().duration(200).style("opacity", 1);
      link.transition().duration(200).style("opacity", 1).attr("stroke-width", 1);
      return;
    }

    const connectedNodeIds = new Set<string>([activeId]);
    links.forEach(l => {
      const sId = (l.source as any).id || l.source;
      const tId = (l.target as any).id || l.target;
      if (sId === activeId) connectedNodeIds.add(tId);
      if (tId === activeId) connectedNodeIds.add(sId);
    });

    node.transition().duration(200).style("opacity", d => connectedNodeIds.has(d.id) ? 1 : 0.15);
    
    // Add hover scale and border color logic
    node.select("circle").transition().duration(200)
      .attr("r", d => {
        const baseR = d.type === 'character' ? 8 : 5;
        return d.id === activeId ? baseR * 1.5 : baseR;
      })
      .attr("stroke", d => d.id === activeId ? "#00f0ff" : "none")
      .attr("stroke-width", d => d.id === activeId ? 2 : 0)
      .style("filter", d => d.id === activeId ? "drop-shadow(0 0 8px #00f0ff)" : "drop-shadow(0 0 5px currentColor)");

    link.transition().duration(200).style("opacity", l => {
      const sId = (l.source as any).id || l.source;
      const tId = (l.target as any).id || l.target;
      return (sId === activeId || tId === activeId) ? 1 : 0.05;
    }).attr("stroke-width", l => {
      const sId = (l.source as any).id || l.source;
      const tId = (l.target as any).id || l.target;
      return (sId === activeId || tId === activeId) ? 2 : 1;
    });
  }, [hoveredNodeId, selectedNode]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Prepare data
    const nodes: Node[] = [
      ...project.characters.map(c => ({ id: c.id, name: c.name, type: 'character' as NodeType, val: 5 })),
      ...project.wiki.map(w => ({ id: w.id, name: w.title, type: w.type as NodeType, val: 3 }))
    ].filter(n => filter === 'all' || n.type === filter);

    const nodeIds = new Set(nodes.map(n => n.id));

    const links: Link[] = [
      // Character relationships
      ...project.relationships
        .filter(r => nodeIds.has(r.sourceCharacterId) && nodeIds.has(r.targetCharacterId))
        .map(r => ({ source: r.sourceCharacterId, target: r.targetCharacterId, type: 'relationship' as const })),
      // Wiki links
      ...project.wiki.flatMap(w => 
        w.relatedIds
          .filter(rid => nodeIds.has(w.id) && nodeIds.has(rid))
          .map(rid => ({ source: w.id, target: rid, type: 'lore-link' as const }))
      )
    ];

    linksRef.current = links;

    const simulation = d3.forceSimulation<Node>(nodes)
      .force("link", d3.forceLink<Node, Link>(links).id(d => d.id).distance(180))
      .force("charge", d3.forceManyBody().strength(-1200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(80))
      .force("x", d3.forceX(width / 2).strength(0.1))
      .force("y", d3.forceY(height / 2).strength(0.1));

    const g = svg.append("g");

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => g.attr("transform", event.transform));
    svg.call(zoom);

    // Render links
    const link = g.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", d => d.type === 'relationship' ? "rgba(0, 240, 255, 0.2)" : "rgba(255, 255, 255, 0.1)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", d => d.type === 'lore-link' ? "4,4" : "0");

    linkSelectionRef.current = link as any;

    // Render nodes
    const node = g.append("g")
      .selectAll(".node")
      .data(nodes)
      .join("g")
      .attr("class", "node")
      .call(d3.drag<SVGGElement, Node>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended))
      .on("mouseenter", (event, d) => setHoveredNodeId(d.id))
      .on("mouseleave", () => setHoveredNodeId(null))
      .on("click", (event, d) => {
        setSelectedNode(d);
        event.stopPropagation();
      });

    nodeSelectionRef.current = node;

    svg.on("click", () => setSelectedNode(null));

    // Node circles with glow
    node.append("circle")
      .attr("r", d => d.type === 'character' ? 8 : 5)
      .attr("fill", d => {
        switch(d.type) {
          case 'character': return "#00f0ff";
          case 'hook': return "#ff00ff";
          case 'setting': return "#00ff00";
          case 'lore': return "#8800ff";
          case 'state': return "#aaaaaa";
          default: return "#ffffff";
        }
      })
      .attr("filter", "drop-shadow(0 0 5px currentColor)");

    // Node labels
    node.append("text")
      .text(d => d.name)
      .attr("x", 12)
      .attr("y", 4)
      .attr("fill", "rgba(255, 255, 255, 0.6)")
      .attr("font-family", "JetBrains Mono, monospace")
      .attr("font-size", d => d.type === 'character' ? "10px" : "8px")
      .attr("style", "pointer-events: none; text-transform: uppercase; letter-spacing: 0.1em;");

    simulation.on("tick", () => {
      link
        .attr("x1", d => (d.source as any).x)
        .attr("y1", d => (d.source as any).y)
        .attr("x2", d => (d.target as any).x)
        .attr("y2", d => (d.target as any).y);

      node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any, d: Node) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: Node) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: Node) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => simulation.stop();
  }, [project.characters, project.relationships, project.wiki, filter, isFullscreen]);

  const handleResetZoom = () => {
    const svg = d3.select(svgRef.current);
    svg.transition().duration(750).call(
      d3.zoom<SVGSVGElement, unknown>().transform as any,
      d3.zoomIdentity
    );
  };

  return (
    <div 
      className={`relative bg-black/60 border border-white/10 rounded-sm overflow-hidden transition-all duration-500 ${isFullscreen ? 'fixed inset-4 z-[100] m-0' : 'w-full h-[500px]'}`}
      ref={containerRef}
    >
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <div className="mono text-[10px] text-cyan font-bold uppercase tracking-widest bg-black/80 px-3 py-1 border border-cyan/40 backdrop-blur-md glow-cyan-subtle">
           知识图谱拓扑系统 (KNOWLEDGE_GRAPH_V1.1)
        </div>
        <div className="flex gap-2">
          <select 
            value={filter}
            onChange={e => setFilter(e.target.value as any)}
            className="bg-black/80 border border-white/10 text-[9px] mono text-cyan focus:outline-none p-1 px-2 backdrop-blur-md"
          >
            <option value="all">ALL_ENTITIES</option>
            <option value="character">CHARACTERS</option>
            <option value="hook">HOOKS</option>
            <option value="setting">SETTINGS</option>
            <option value="lore">LORE</option>
          </select>
          <button 
            onClick={handleResetZoom}
            className="p-1 bg-black/80 border border-white/10 text-cyan hover:bg-cyan/10 transition-colors"
            title="重置视图"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-10 flex gap-2">
         <button 
           onClick={() => setIsFullscreen(!isFullscreen)}
           className="p-2 bg-black/80 border border-white/10 text-cyan hover:bg-cyan/10 transition-colors glow-cyan-subtle"
         >
           {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
         </button>
      </div>

      <svg ref={svgRef} className="w-full h-full cursor-move" />

      {/* Info Panel for Selected Node */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div 
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className="absolute top-20 right-4 w-64 bg-black/90 border border-cyan/30 p-4 backdrop-blur-md z-20 shadow-2xl overflow-y-auto max-h-[80%]"
          >
            <div className="flex justify-between items-start mb-3 border-b border-white/10 pb-2">
              <div>
                <div className="mono text-[8px] text-cyan uppercase opacity-60">{selectedNode.type}</div>
                <div className="font-bold text-sm text-white uppercase tracking-tighter">{selectedNode.name}</div>
              </div>
              <button onClick={() => setSelectedNode(null)} className="text-white/20 hover:text-white">
                <Minimize2 size={14} />
              </button>
            </div>
            
            <div className="space-y-4">
               {/* Details based on type */}
               {selectedNode.type === 'character' ? (
                 <div className="space-y-2">
                   <p className="text-[10px] text-white/40 italic">
                     {project.characters.find(c => c.id === selectedNode.id)?.role}
                   </p>
                   <div className="mono text-[8px] space-y-1">
                      <div className="flex justify-between">
                        <span>连接密度</span>
                        <span className="text-cyan">
                          {project.relationships.filter(r => r.sourceCharacterId === selectedNode.id || r.targetCharacterId === selectedNode.id).length} links
                        </span>
                      </div>
                   </div>
                 </div>
               ) : (
                 <div className="space-y-2">
                   <p className="text-[10px] text-white/40 line-clamp-4 leading-relaxed">
                     {project.wiki.find(w => w.id === selectedNode.id)?.content}
                   </p>
                   <div className="flex flex-wrap gap-1">
                     {project.wiki.find(w => w.id === selectedNode.id)?.tags.map(t => (
                       <span key={t} className="px-1 py-0.5 bg-white/5 border border-white/5 rounded-sm mono text-[7px] opacity-40">#{t}</span>
                     ))}
                   </div>
                 </div>
               )}

               <div className="pt-4 border-t border-white/5 space-y-4">
                   <button 
                     onClick={handleSuggestLinks}
                     disabled={isSuggesting}
                     className="w-full flex items-center justify-center gap-2 py-1.5 bg-cyan/10 border border-cyan/40 text-[10px] mono text-cyan hover:bg-cyan/20 transition-all uppercase font-bold"
                   >
                     <Sparkles size={12} className={isSuggesting ? 'animate-pulse' : ''} />
                     {isSuggesting ? 'AI 分析中...' : '智能推荐关联'}
                   </button>
                   
                   <AnimatePresence>
                     {suggestions.length > 0 && (
                       <motion.div 
                         initial={{ opacity: 0, height: 0 }}
                         animate={{ opacity: 1, height: 'auto' }}
                         className="space-y-2 overflow-hidden border border-cyan/20 bg-cyan/5 rounded-sm"
                       >
                         <button 
                            onClick={() => setIsSuggestionsExpanded(!isSuggestionsExpanded)}
                            className="w-full flex justify-between items-center px-2 py-1.5 border-b border-cyan/10 hover:bg-cyan/10 transition-colors"
                          >
                           <div className="mono text-[8px] text-cyan opacity-60 uppercase flex items-center gap-1">
                             <BrainCircuit size={10} /> AI RECOMMENDATIONS
                           </div>
                           <div className="flex items-center gap-2">
                             {suggestions.some(s => !getIsLinked(s.id)) && isSuggestionsExpanded && (
                               <button 
                                 onClick={(e) => { e.stopPropagation(); handleLinkAll(); }}
                                 className="mono text-[7px] px-1.5 py-0.5 bg-cyan text-black hover:bg-white transition-colors uppercase font-bold"
                               >
                                 LINK ALL
                               </button>
                             )}
                             
                               <X size={10} className={`text-cyan/40 transition-transform ${isSuggestionsExpanded ? '' : 'rotate-180'}`} />
                            </div>
                          </button>
                         {isSuggestionsExpanded && (
                            <div className="p-2 pt-0 space-y-1.5 max-h-40 overflow-y-auto custom-mini-scrollbar pr-1">
                           {suggestions.map(s => {
                             const isAdded = getIsLinked(s.id);
                             return (
                               <div key={s.id} className={`p-2 bg-white/5 border border-white/5 rounded-sm space-y-1 group transition-all ${isAdded ? 'opacity-40 border-cyan/10' : 'hover:border-cyan/30'}`}>
                                 <div className="flex justify-between items-center text-[8px] mono">
                                   <span className="text-white font-bold">{s.name}</span>
                                   <button 
                                     onClick={() => handleLinkOne(s)}
                                     disabled={isAdded}
                                     className={`mono text-[8px] px-1.5 py-0.5 font-bold uppercase transition-colors ${isAdded ? 'bg-white/10 text-white/40' : 'bg-cyan text-black hover:bg-white'}`}
                                   >
                                     {isAdded ? 'LINKED' : 'LINK'}
                                   </button>
                                 </div>
                                 <p className="text-[7px] mono opacity-40 leading-tight">{s.reason}</p>
                               </div>
                             );
                           })}
                         </div>
                            </div>
                          )}
                        </motion.div>
                     )}
                   </AnimatePresence>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-4 left-4 z-10 flex gap-4 pointer-events-none">
        <div className="flex items-center gap-2 opacity-40">
           <div className="w-1.5 h-1.5 rounded-full bg-cyan"></div>
           <span className="mono text-[8px] uppercase">角色</span>
        </div>
        <div className="flex items-center gap-2 opacity-40">
           <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
           <span className="mono text-[8px] uppercase">传说</span>
        </div>
        <div className="flex items-center gap-2 opacity-40">
           <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
           <span className="mono text-[8px] uppercase">设定</span>
        </div>
      </div>
    </div>
  );
};
