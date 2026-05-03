/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Book, 
  Users, 
  Map, 
  Edit3, 
  Settings, 
  Plus, 
  Trash2, 
  Save, 
  Zap,
  Search,
  BookOpen,
  ChevronRight,
  ShieldCheck,
  History,
  Terminal,
  Send,
  HelpCircle,
  X,
  Heart, 
  ShieldAlert, 
  RefreshCw, 
  Sparkles, 
  Wind, 
  Flame, 
  Coffee, 
  BrainCircuit,
  Maximize2,
  Minimize2,
  Lock,
  Unlock,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';
import { 
  Relationship,
  RelationshipInconsistency,
  NovelProject, 
  WorldBuilding, 
  CharacterPersona, 
  OutlineBeat, 
  Chapter, 
  WikiEntry,
  ChapterSnapshot
} from './types';
import { 
  generateChapterContent, 
  qualityAudit, 
  enhanceDialogue, 
  checkRelationshipInconsistencies,
  continueWriting,
  enhanceAtmosphere,
  brainstormLogic,
  brainstormCharacterArc,
  summarizeProject,
  suggestWikiLinks
} from './lib/gemini';
import { RelationshipGraph } from './components/RelationshipGraph';
import { StatsDashboard } from './components/StatsDashboard';

import { KnowledgeGraph } from './components/KnowledgeGraph';

const INITIAL_WORLD: WorldBuilding = {
  physicalLaws: '灵气消耗神魂精华；玄铁干扰灵流。',
  causalDebt: '每份强大的力量都伴随着等价的不幸。',
  genre: '修仙 / 强逻辑 / 资源匮乏',
  conflictModel: '信息不对称与资源争夺。',
};

const DEFAULT_PROJECT: NovelProject = {
  id: 'pro-1',
  title: '未命名史诗',
  world: INITIAL_WORLD,
  beats: [],
  characters: [],
  relationships: [],
  chapters: [],
  wiki: [],
  inconsistencies: [],
  snapshots: [],
  config: {
    aiEditingTone: 'commercial',
    targetTotalWords: 200000
  }
};

export default function App() {
  const [project, setProject] = useState<NovelProject>(() => {
    const saved = localStorage.getItem('nexus-project');
    if (!saved) return DEFAULT_PROJECT;
    const parsed = JSON.parse(saved);
    // Data normalization/migration
    return {
      ...DEFAULT_PROJECT,
      ...parsed,
      config: parsed.config || DEFAULT_PROJECT.config,
      snapshots: parsed.snapshots || [],
      characters: (parsed.characters || []).map((c: any) => ({
        ...c,
        relatedLoreIds: c.relatedLoreIds || []
      })),
      chapters: (parsed.chapters || []).map((c: any) => ({
        ...c,
        status: c.status || 'draft',
        wordCountTarget: c.wordCountTarget || 2000,
        tags: c.tags || []
      })),
      wiki: (parsed.wiki || []).map((w: any) => ({
        ...w,
        tags: w.tags || [],
        relatedIds: w.relatedIds || []
      }))
    };
  });

  const createSnapshot = (chapterId: string, reason: string) => {
    const chapter = project.chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    
    const snapshot: ChapterSnapshot = {
      id: crypto.randomUUID(),
      chapterId,
      timestamp: Date.now(),
      content: chapter.content,
      reason
    };
    
    setProject(prev => ({
      ...prev,
      snapshots: [snapshot, ...(prev.snapshots || [])].slice(0, 50) // Keep last 50
    }));
  };

  const handleSuggestWikiLinks = async (entry: WikiEntry) => {
    setIsSuggestingLinks(true);
    try {
      const results = await suggestWikiLinks(project, entry);
      setWikiSuggestions(prev => ({ ...prev, [entry.id]: (results.suggestions || []) as { id: string; name: string; reason: string }[] }));
    } catch (error) {
      console.error(error);
    } finally {
      setIsSuggestingLinks(false);
    }
  };

  const handleSuggestCharLinks = async (char: CharacterPersona) => {
    setIsSuggestingLinks(true);
    try {
      // Mocking a WikiEntry-like object for characters to reuse suggestWikiLinks
      const dummyEntry: WikiEntry = {
        id: char.id,
        title: char.name,
        content: `${char.role}. ${char.personaAnchor}. Motives: ${char.coreMotives}`,
        type: 'lore',
        tags: [],
        relatedIds: char.relatedLoreIds || []
      };
      const results = await suggestWikiLinks(project, dummyEntry);
      setCharSuggestions(prev => ({ ...prev, [char.id]: (results.suggestions || []) as { id: string; name: string; reason: string }[] }));
    } catch (error) {
      console.error(error);
    } finally {
      setIsSuggestingLinks(false);
    }
  };
  const [activeTab, setActiveTab] = useState<'blueprint' | 'persona' | 'beats' | 'studio' | 'wiki' | 'relationships'>('blueprint');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [omniCommand, setOmniCommand] = useState('');
  const [lastReasoning, setLastReasoning] = useState('');
  const [brainstormResults, setBrainstormResults] = useState<string | null>(null);
  const [wikiSuggestions, setWikiSuggestions] = useState<Record<string, { id: string; name: string; reason: string }[]>>({});
  const [charSuggestions, setCharSuggestions] = useState<Record<string, { id: string; name: string; reason: string }[]>>({});
  const [isSuggestingLinks, setIsSuggestingLinks] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  // Relationship Filters
  const [relFilterType, setRelFilterType] = useState<string>('all');
  const [relFilterCharId, setRelFilterCharId] = useState<string>('all');
  const [relScoreRange, setRelScoreRange] = useState<[number, number]>([-100, 100]);
  const [relSortBy, setRelSortBy] = useState<'score' | 'type' | 'character'>('score');
  const [relSortOrder, setRelSortOrder] = useState<'asc' | 'desc'>('desc');
  const [relSearchQuery, setRelSearchQuery] = useState('');

  useEffect(() => {
    localStorage.setItem('nexus-project', JSON.stringify(project));
  }, [project]);

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('nexus-tutorial-seen');
    if (!hasSeenTutorial) {
      setShowTutorial(true);
      localStorage.setItem('nexus-tutorial-seen', 'true');
    }
  }, []);

  const handleOmniExecute = async () => {
    if (!omniCommand.trim()) return;
    setIsGenerating(true);
    setLastReasoning('');
    try {
      const { executeOmniCommand } = await import('./lib/gemini');
      const result = await executeOmniCommand(project, omniCommand);
      
      setLastReasoning(result.reasoning || '');

      setProject(prev => {
        const newProject = { ...prev };
        
        // 1. World Updates
        if (result.worldUpdates) {
          newProject.world = { ...newProject.world, ...result.worldUpdates };
        }

        // 2. New Characters
        const newChars: CharacterPersona[] = (result.newCharacters || []).map((c: any) => ({
          ...c,
          id: crypto.randomUUID(),
          role: c.role || '配角',
          subtextRatio: 0.3
        }));
        newProject.characters = [...newProject.characters, ...newChars];

        // Character mapping helper (Name -> ID)
        const nameToId: Record<string, string> = {};
        newProject.characters.forEach(c => { nameToId[c.name] = c.id; });

        // 3. New Wiki
        const newWiki: WikiEntry[] = (result.newWikiEntries || []).map((w: any) => ({
          ...w,
          id: crypto.randomUUID(),
        }));
        newProject.wiki = [...newProject.wiki, ...newWiki];

        // 4. New Beats
        const newBeats: OutlineBeat[] = (result.newBeats || []).map((b: any) => ({
          ...b,
          id: crypto.randomUUID(),
          status: 'pending'
        }));
        newProject.beats = [...newProject.beats, ...newBeats];

        // 5. New Relationships
        const newRels: Relationship[] = (result.newRelationships || []).map((r: any) => {
          const sId = nameToId[r.sourceCharacterName];
          const tId = nameToId[r.targetCharacterName];
          if (!sId || !tId) return null;
          return {
            id: crypto.randomUUID(),
            sourceCharacterId: sId,
            targetCharacterId: tId,
            type: r.type || 'neutral',
            score: r.score || 0,
            description: r.description || '',
            history: []
          };
        }).filter(Boolean) as Relationship[];
        newProject.relationships = [...newProject.relationships, ...newRels];

        return newProject;
      });

      setOmniCommand('');
    } catch (e) {
      alert('执行失败。请尝试更具体的指令。');
    } finally {
      setIsGenerating(false);
    }
  };

  const updateWorld = (key: keyof WorldBuilding, value: string) => {
    setProject(prev => ({
      ...prev,
      world: { ...prev.world, [key]: value }
    }));
  };

  const addCharacter = () => {
    const newChar: CharacterPersona = {
      id: crypto.randomUUID(),
      name: '新角色',
      role: '主角',
      personaAnchor: '冷静且理性',
      coreMotives: '登顶以救其妹',
      dialogueStyle: '简洁、逻辑性强、略带讽刺',
      subtextRatio: 0.3,
      relatedLoreIds: []
    };
    setProject(prev => ({ ...prev, characters: [...prev.characters, newChar] }));
  };

  const addBeat = () => {
    const newBeat: OutlineBeat = {
      id: crypto.randomUUID(),
      title: '新情节',
      description: '描述发生了什么...',
      pressureIndex: 5,
      status: 'pending',
    };
    setProject(prev => ({ ...prev, beats: [...prev.beats, newBeat] }));
  };

  const createChapterFromBeat = async (beat: OutlineBeat) => {
    setIsGenerating(true);
    try {
      const content = await generateChapterContent(project, beat);
      const newChapter: Chapter = {
        id: crypto.randomUUID(),
        number: project.chapters.length + 1,
        title: `第 ${project.chapters.length + 1} 章: ${beat.title}`,
        content: content || 'AI 生成内容失败。',
        beatId: beat.id,
        status: 'draft',
        wordCountTarget: 2000,
        tags: []
      };
      setProject(prev => ({
        ...prev,
        chapters: [...prev.chapters, newChapter],
        beats: prev.beats.map(b => b.id === beat.id ? { ...b, status: 'completed' } : b)
      }));
      setSelectedChapterId(newChapter.id);
      setActiveTab('studio');
    } catch (e) {
      alert('生成失败。请检查 API 密钥。');
    } finally {
      setIsGenerating(false);
    }
  };

  const runAudit = async (chapterId: string) => {
    const chapter = project.chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    
    createSnapshot(chapterId, "AI 质量审计与重写");
    setIsGenerating(true);
    try {
      const audited = await qualityAudit(chapter.content);
      setProject(prev => ({
        ...prev,
        chapters: prev.chapters.map(c => c.id === chapterId ? { ...c, content: audited || c.content } : c)
      }));
    } finally {
      setIsGenerating(false);
    }
  };

  const addRelationship = () => {
    if (project.characters.length < 2) {
      alert("创建关系至少需要 2 个角色。");
      return;
    }
    const newRel: Relationship = {
      id: crypto.randomUUID(),
      sourceCharacterId: project.characters[0].id,
      targetCharacterId: project.characters[1].id,
      type: 'neutral',
      score: 0,
      description: '初次见面...',
      history: [],
    };
    setProject(prev => ({ ...prev, relationships: [...prev.relationships, newRel] }));
  };

  const auditRelationships = async (chapterId: string) => {
    const chapter = project.chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    setIsGenerating(true);
    try {
      const result = await checkRelationshipInconsistencies(project, chapter.content);
      const incs = result.inconsistencies || [];
      const scoreUpdates = result.scoreUpdates || [];

      const taggedInconsistencies = incs.map((inc: any) => ({
        ...inc,
        id: crypto.randomUUID(),
        chapterId: chapter.id
      }));

      setProject(prev => {
        let updatedRelationships = [...prev.relationships];
        scoreUpdates.forEach((upd: any) => {
          updatedRelationships = updatedRelationships.map(rel => {
            if (rel.id === upd.relationshipId) {
              const newScore = Math.max(-100, Math.min(100, rel.score + upd.change));
              if (newScore !== rel.score) {
                const historyEntry = {
                  id: crypto.randomUUID(),
                  timestamp: Date.now(),
                  oldScore: rel.score,
                  newScore: newScore,
                  reason: `剧情推进: ${chapter.title}`,
                  chapterId: chapter.id
                };
                return { 
                  ...rel, 
                  score: newScore, 
                  history: [...(rel.history || []), historyEntry] 
                };
              }
            }
            return rel;
          });
        });

        return {
          ...prev,
          relationships: updatedRelationships,
          inconsistencies: [...prev.inconsistencies.filter(i => i.chapterId !== chapterId), ...taggedInconsistencies]
        };
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleContinueWriting = async (chapterId: string) => {
    const chapter = project.chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    setIsGenerating(true);
    try {
      const continuation = await continueWriting(project, chapter.content);
      setProject(prev => ({
        ...prev,
        chapters: prev.chapters.map(c => c.id === chapterId ? { ...c, content: c.content + "\n\n" + (continuation || '') } : c)
      }));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEnhanceAtmosphere = async (chapterId: string, mood: string) => {
    const chapter = project.chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    setIsGenerating(true);
    try {
      const enhanced = await enhanceAtmosphere(chapter.content, mood);
      setProject(prev => ({
        ...prev,
        chapters: prev.chapters.map(c => c.id === chapterId ? { ...c, content: enhanced || c.content } : c)
      }));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBrainstorm = async (chapterId: string) => {
    setIsGenerating(true);
    try {
      const results = await brainstormLogic(project, chapterId);
      setBrainstormResults(results);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCharArcBrainstorm = async (charId: string) => {
    setIsGenerating(true);
    try {
      const results = await brainstormCharacterArc(project, charId);
      setBrainstormResults(results);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleProjectSummary = async () => {
    setIsGenerating(true);
    try {
      const results = await summarizeProject(project);
      setBrainstormResults(results);
    } finally {
      setIsGenerating(false);
    }
  };

  const activeChapter = project.chapters.find(c => c.id === selectedChapterId);

  return (
    <div className="technical-grid font-sans overflow-hidden">
      <div className="noise-bg" />
      <div className="scanner-line" />
      
      {/* Sidebar Navigation */}
      <AnimatePresence>
        {!focusMode && (
          <motion.aside 
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="sidebar"
          >
            <div className="flex flex-col mb-8 px-2">
              <div className="mono text-[10px] text-cyan tracking-widest uppercase mb-1">叙事工程 OS // NARRATIVE.SYS</div>
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-cyan fill-current" />
                <h1 className="font-mono font-black text-xl tracking-tighter uppercase italic leading-none">NEXUS <span className="text-white/20">v9.1</span></h1>
              </div>
            </div>

            <nav className="flex flex-col gap-1">
              <NavButton icon={<Zap size={18} />} label="系统概览" active={activeTab === 'blueprint'} onClick={() => setActiveTab('blueprint')} />
              <NavButton icon={<Users size={18} />} label="角色矩阵" active={activeTab === 'persona'} onClick={() => setActiveTab('persona')} />
              <NavButton icon={<Book size={18} />} label="节拍大纲" active={activeTab === 'beats'} onClick={() => setActiveTab('beats')} />
              <NavButton icon={<Edit3 size={18} />} label="写作终端" active={activeTab === 'studio'} onClick={() => setActiveTab('studio')} />
              <NavButton icon={<Heart size={18} />} label="因果网络" active={activeTab === 'relationships'} onClick={() => setActiveTab('relationships')} />
              <NavButton icon={<BookOpen size={18} />} label="知识图谱" active={activeTab === 'wiki'} onClick={() => setActiveTab('wiki')} />
              <NavButton icon={<HelpCircle size={18} className="text-cyan" />} label="操作指南" active={showTutorial} onClick={() => setShowTutorial(true)} />
            </nav>

            <div className="mt-auto pt-6 border-t border-white/5 space-y-6">
              <div className="flex flex-col gap-2">
                <div className="header-serif opacity-40">活跃项目序列</div>
                <input 
                  value={project.title}
                  onChange={(e) => setProject(p => ({ ...p, title: e.target.value }))}
                  className="w-full bg-transparent border-b border-white/10 font-mono text-sm focus:outline-none focus:border-cyan/50 p-1 text-white transition-colors"
                />
              </div>
              
              <div className="flex justify-between items-center opacity-40 grayscale hover:grayscale-0 transition-all duration-700">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse"></div>
                  <span className="mono text-[8px] uppercase tracking-widest">System Integrated</span>
                </div>
                <span className="mono text-[8px] uppercase tracking-tighter text-right leading-none">Industrial Logic<br/>Deploy: 2026.05</span>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>


      {/* Main Content Area */}
      <main className={`content-area custom-scrollbar overflow-x-hidden ${focusMode ? 'p-0' : ''}`}>
        <AnimatePresence mode="wait">
          {focusMode ? (
            <motion.div 
              key="focus-editor"
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="min-h-full bg-bg z-50 flex flex-col items-center pt-24 pb-48 px-6"
            >
              <div className="fixed top-10 right-10 flex gap-4 z-[60]">
                <button 
                  onClick={() => setFocusMode(false)}
                  className="p-3 bg-bg border border-cyan/40 text-cyan hover:bg-cyan/10 transition-all glow-cyan"
                  title="退出专注模式"
                >
                  <Minimize2 size={24} />
                </button>
              </div>
              
              <div className="max-w-3xl w-full">
                <header className="mb-16 border-b border-white/5 pb-8">
                   <h2 className="header-serif text-5xl italic text-white/40 mb-3 select-none">
                    {activeChapter?.title || 'FRAGMENT'}
                  </h2>
                  <div className="flex gap-6 mono text-[10px] opacity-30 uppercase tracking-[0.3em]">
                    <span>W_COUNT: {activeChapter?.content.length || 0}</span>
                    <span>PROTO_FOCUSED</span>
                  </div>
                </header>
                
                {activeChapter ? (
                  <textarea 
                    value={activeChapter.content}
                    onChange={(e) => {
                      const newContent = e.target.value;
                      setProject(prev => ({
                        ...prev,
                        chapters: prev.chapters.map(c => c.id === activeChapter.id ? { ...c, content: newContent } : c)
                      }));
                    }}
                    autoFocus
                    placeholder="INITIATE_NARRATIVE_STREAM..."
                    className="w-full min-h-[60vh] bg-transparent border-none text-2xl leading-relaxed font-serif text-white/90 focus:outline-none resize-none selection:bg-cyan/20"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center opacity-10 py-40">
                    <Edit3 size={120} strokeWidth={0.3} />
                    <p className="mono font-bold mt-6 uppercase tracking-[0.8em]">NULL_STREAM</p>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="main-wrapper"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full"
            >
              {/* Omni Command Bar */}
              <section className="sticky top-0 z-30 mb-8 bg-black/80 backdrop-blur-md border border-cyan/30 rounded-sm p-4 glow-cyan-subtle">
                 <div className="flex items-center gap-3 mb-2">
                    <Terminal size={14} className="text-cyan animate-pulse" />
                    <span className="mono text-[10px] text-cyan font-bold tracking-widest uppercase">Nexus Omni-Orchestrator (全任务执行引擎)</span>
                 </div>
                 <div className="flex gap-4">
                    <div className="flex-1 relative">
                      <input 
                        value={omniCommand}
                        onChange={e => setOmniCommand(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleOmniExecute()}
                        placeholder="输入任何创作任务..."
                        className="w-full bg-white/5 border border-white/10 p-3 pr-12 text-sm mono text-white placeholder:opacity-30 focus:outline-none focus:border-cyan/50 focus:bg-white/10 transition-all rounded-sm"
                        disabled={isGenerating}
                      />
                      <button 
                        onClick={handleOmniExecute}
                        disabled={isGenerating || !omniCommand.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-cyan opacity-40 hover:opacity-100 disabled:opacity-10 transition-all"
                      >
                        {isGenerating ? <div className="w-4 h-4 border-2 border-cyan/40 border-t-cyan rounded-full animate-spin"></div> : <Send size={18} />}
                      </button>
                    </div>
                 </div>
                 {lastReasoning && (
                   <motion.div 
                     initial={{ opacity: 0, height: 0 }}
                     animate={{ opacity: 1, height: 'auto' }}
                     className="mt-3 bg-black/60 p-3 border-l-2 border-cyan/60 text-[11px] mono text-cyan/80 leading-relaxed italic"
                   >
                      <div className="flex items-center gap-2 mb-1 opacity-40">
                        <span className="uppercase tracking-widest">AI 逻辑推演:</span>
                      </div>
                      {lastReasoning}
                   </motion.div>
                 )}
              </section>

              <AnimatePresence mode="wait">
          {activeTab === 'blueprint' && (
            <motion.div 
              key="blueprint"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-4xl space-y-8"
            >
              <StatsDashboard project={project} />
              
              <div className="flex justify-between items-end border-b border-cyan/30 pb-4 mb-4">
                <div>
                  <div className="header-serif">I. 顶层架构</div>
                  <h2 className="text-3xl font-black tracking-tighter uppercase italic leading-none">世界法则与 <span className="text-cyan">因果逻辑</span></h2>
                </div>
                <div className="flex gap-8 mono text-[10px] text-right opacity-60">
                  <div className="flex flex-col">
                    <span>题材算法</span>
                    <span className="text-cyan uppercase">{project.world.genre}</span>
                  </div>
                  <button 
                    onClick={handleProjectSummary}
                    className="flex flex-col items-end hover:text-cyan transition-colors"
                  >
                    <span>项目状态评估</span>
                    <span className="text-cyan uppercase flex items-center gap-1">
                      <ShieldCheck size={10} /> 执行诊断 (DIAGNOSE)
                    </span>
                  </button>
                </div>
              </div>
              
              <div className="grid gap-6">
                {/* System Parameters Configuration */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-white/5 border border-white/10 rounded-sm mb-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <Settings size={16} className="text-cyan" />
                      <span className="mono text-[10px] font-bold uppercase tracking-widest text-cyan">系统参数配置 (SYSTEM_KERNEL_PARAMS)</span>
                    </div>
                    <div className="space-y-4">
                      <div className="flex flex-col gap-2">
                         <label className="mono text-[9px] opacity-40 uppercase">AI 写作音色 (AI ENGINE TONE)</label>
                         <div className="flex gap-2">
                           {(['commercial', 'literary', 'sharp', 'gentle'] as const).map(tone => (
                             <button
                               key={tone}
                               onClick={() => setProject(p => ({ ...p, config: { ...p.config, aiEditingTone: tone } }))}
                               className={`flex-1 py-1 px-1 text-[9px] mono border transition-all ${project.config.aiEditingTone === tone ? 'bg-cyan text-black border-cyan' : 'bg-black/40 border-white/10 text-white/40'}`}
                             >
                               {tone === 'commercial' ? '商业' : tone === 'literary' ? '文学' : tone === 'sharp' ? '硬刻' : '温和'}
                             </button>
                           ))}
                         </div>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                         <label className="mono text-[9px] opacity-40 uppercase">项目总字数目标</label>
                         <div className="flex items-center gap-4">
                           <input 
                             type="range" min="10000" max="1000000" step="10000"
                             value={project.config.targetTotalWords}
                             onChange={e => setProject(p => ({ ...p, config: { ...p.config, targetTotalWords: parseInt(e.target.value) } }))}
                             className="flex-1 accent-cyan h-1"
                           />
                           <span className="mono text-xs text-white w-20 text-right">{(project.config.targetTotalWords / 10000).toFixed(0)}w 字</span>
                         </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-4 border-l border-white/5 pl-6">
                     <div className="flex items-center gap-2">
                       <ShieldCheck size={16} className="text-green-500" />
                       <span className="mono text-[10px] font-bold uppercase tracking-widest text-green-500">内核完整性报告</span>
                     </div>
                     <div className="flex-1 mono text-[9px] text-white/40 space-y-2">
                        <p>● 系统当前版本: NEXUS OS v9.1_PROFESSIONAL</p>
                        <p>● 创作语境一致性: 优 (98.4%)</p>
                        <p>● 因果链条溯源步长: 50 Chapters</p>
                        <p className="text-cyan">● 推理引擎: GEMINI_3.1_PRO_CORE 就绪</p>
                     </div>
                  </div>
                </div>

                <Field title="世界观设定 (宪法)" description="物理法则与基础真理。">
                  <textarea 
                    value={project.world.physicalLaws} 
                    onChange={e => updateWorld('physicalLaws', e.target.value)}
                    className="w-full h-32 p-4 bg-dark-card border border-white/10 font-mono text-sm focus:border-cyan/50 focus:outline-none transition-all rounded-sm"
                  />
                </Field>
                <Field title="因果债务 (因果债)" description="力量的代价与叙事平衡。">
                  <textarea 
                    value={project.world.causalDebt} 
                    onChange={e => updateWorld('causalDebt', e.target.value)}
                    className="w-full h-32 p-4 bg-dark-card border border-white/10 font-mono text-sm focus:border-cyan/50 focus:outline-none transition-all rounded-sm"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field title="题材算法" description="核心驱动力。">
                    <input 
                      value={project.world.genre} 
                      onChange={e => updateWorld('genre', e.target.value)}
                      className="w-full p-2 px-4 bg-dark-card border border-white/10 font-mono text-sm focus:border-cyan/50 focus:outline-none transition-all rounded-sm"
                    />
                  </Field>
                  <Field title="冲突模型" description="战略驱动。">
                    <input 
                      value={project.world.conflictModel} 
                      onChange={e => updateWorld('conflictModel', e.target.value)}
                      className="w-full p-2 px-4 bg-dark-card border border-white/10 font-mono text-sm focus:border-cyan/50 focus:outline-none transition-all rounded-sm"
                    />
                  </Field>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'persona' && (
            <motion.div 
              key="persona"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-end">
                <div>
                  <div className="header-serif">II. 人设中心</div>
                  <h2 className="text-3xl font-bold tracking-tight">角色之魂</h2>
                </div>
                <button 
                  onClick={addCharacter}
                  className="flex items-center gap-2 bg-cyan text-black px-4 py-2 text-xs font-mono font-bold hover:bg-cyan/80 transition-all glow-cyan uppercase italic"
                >
                  <Plus size={16} /> 添加人设
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {project.characters.map(char => (
                  <div key={char.id} className="card-technical space-y-4">
                    <div className="flex justify-between items-start border-b border-white/10 pb-2">
                       <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-cyan/20 border border-cyan/40 flex items-center justify-center font-bold text-cyan text-xs">
                            {char.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <input 
                              value={char.name}
                              onChange={e => {
                                const val = e.target.value;
                                setProject(p => ({
                                  ...p,
                                  characters: p.characters.map(c => c.id === char.id ? { ...c, name: val } : c)
                                }));
                              }}
                              className="bg-transparent font-bold text-sm focus:outline-none focus:text-cyan border-none transition-colors"
                            />
                            <div className="text-[9px] mono opacity-40 uppercase tracking-tighter">{char.role}</div>
                          </div>
                       </div>
                      <button 
                        onClick={() => setProject(p => ({ ...p, characters: p.characters.filter(c => c.id !== char.id) }))}
                        className="p-1 opacity-20 hover:opacity-100 hover:text-red-500 transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="space-y-3">
                       <div className="space-y-1">
                          <label className="text-[9px] uppercase tracking-widest opacity-40 mono">人设之锚 (Persona Anchor)</label>
                          <textarea 
                            value={char.personaAnchor}
                            onChange={e => {
                              const val = e.target.value;
                              setProject(p => ({
                                ...p,
                                characters: p.characters.map(c => c.id === char.id ? { ...c, personaAnchor: val } : c)
                              }));
                            }}
                            className="w-full text-xs bg-white/5 border border-white/10 p-2 focus:outline-none focus:border-cyan/30 min-h-[60px] rounded-sm"
                          />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[9px] uppercase tracking-widest opacity-40 mono">对话逻辑 (Dialogue Logic)</label>
                          <input 
                            value={char.dialogueStyle}
                            onChange={e => {
                              const val = e.target.value;
                              setProject(p => ({
                                ...p,
                                characters: p.characters.map(c => c.id === char.id ? { ...c, dialogueStyle: val } : c)
                              }));
                            }}
                            className="w-full text-xs bg-white/5 border border-white/10 p-2 focus:outline-none focus:border-cyan/30 rounded-sm"
                          />
                       </div>
                       <div className="flex gap-2">
                         <button 
                          onClick={() => handleCharArcBrainstorm(char.id)}
                          className="flex-1 py-1 border border-cyan/30 text-[9px] mono text-cyan hover:bg-cyan/10 transition-all uppercase flex items-center justify-center gap-2"
                         >
                            <BrainCircuit size={10} /> 脑暴 (ARC)
                         </button>
                         <button 
                          onClick={() => handleSuggestCharLinks(char)}
                          disabled={isSuggestingLinks}
                          className="flex-1 py-1 border border-cyan/30 text-[9px] mono text-cyan hover:bg-cyan/10 transition-all uppercase flex items-center justify-center gap-2"
                         >
                            <Sparkles size={10} className={isSuggestingLinks ? 'animate-pulse' : ''} /> 关联建议
                         </button>
                       </div>

                       {/* Character AI Suggestions */}
                       <AnimatePresence>
                         {charSuggestions[char.id]?.length > 0 && (
                           <motion.div 
                             initial={{ height: 0, opacity: 0 }}
                             animate={{ height: 'auto', opacity: 1 }}
                             exit={{ height: 0, opacity: 0 }}
                             className="overflow-hidden"
                           >
                             <div className="p-3 bg-cyan/5 border border-cyan/20 rounded-sm space-y-2">
                               <div className="flex justify-between items-center">
                                 <div className="mono text-[8.5px] text-cyan font-bold uppercase tracking-widest flex items-center gap-1">
                                   AI SUGGESTIONS
                                 </div>
                                 <div className="flex items-center gap-2">
                                   {charSuggestions[char.id].some(s => !char.relatedLoreIds.includes(s.id)) && (
                                     <button 
                                       onClick={() => {
                                         const unlinkedIds = charSuggestions[char.id]
                                           .filter(s => !char.relatedLoreIds.includes(s.id))
                                           .map(s => s.id);
                                         
                                         if (unlinkedIds.length > 0) {
                                           setProject(p => ({
                                             ...p,
                                             characters: p.characters.map(c => c.id === char.id ? { ...c, relatedLoreIds: [...(c.relatedLoreIds || []), ...unlinkedIds] } : c)
                                           }));
                                         }
                                       }}
                                       className="mono text-[7px] px-1.5 py-0.5 bg-white/10 text-white hover:bg-white/20 transition-colors uppercase font-bold"
                                     >
                                       LINK ALL
                                     </button>
                                   )}
                                   <button onClick={() => setCharSuggestions(p => ({ ...p, [char.id]: [] }))} className="text-white/20 hover:text-white">
                                     <X size={10} />
                                   </button>
                                 </div>
                               </div>
                               <div className="space-y-2">
                                 {charSuggestions[char.id].map(suggestion => {
                                   const isAdded = char.relatedLoreIds.includes(suggestion.id);
                                   return (
                                     <div key={suggestion.id} className={`flex flex-col gap-1 border-b border-white/5 pb-2 last:border-0 last:pb-0 ${isAdded ? 'opacity-40' : ''}`}>
                                       <div className="flex justify-between items-center">
                                         <span className="mono text-[9px] text-white font-bold">{suggestion.name}</span>
                                         <button 
                                           onClick={() => {
                                             if (!isAdded) {
                                                setProject(p => ({
                                                  ...p,
                                                  characters: p.characters.map(c => c.id === char.id ? { ...c, relatedLoreIds: [...(c.relatedLoreIds || []), suggestion.id] } : c)
                                                }));
                                             }
                                           }}
                                           disabled={isAdded}
                                           className={`mono text-[8px] px-2 py-0.5 font-bold transition-colors ${isAdded ? 'bg-white/10 text-white/40' : 'bg-cyan text-black hover:bg-white'}`}
                                         >
                                           {isAdded ? 'LINKED' : 'LINK'}
                                         </button>
                                       </div>
                                       <p className="text-[8px] mono opacity-40 leading-tight">{suggestion.reason}</p>
                                     </div>
                                   );
                                 })}
                               </div>
                             </div>
                           </motion.div>
                         )}
                       </AnimatePresence>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'beats' && (
            <motion.div 
              key="beats"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-end">
                <div>
                  <div className="header-serif">III. 战术拆解</div>
                  <h2 className="text-3xl font-bold tracking-tight">场景推进</h2>
                </div>
                <button 
                  onClick={addBeat}
                  className="flex items-center gap-2 bg-cyan text-black px-4 py-2 text-xs font-mono font-bold hover:bg-cyan/80 transition-all glow-cyan uppercase italic"
                >
                  <Plus size={16} /> 新增战术核心 (Beat)
                </button>
              </div>

              <div className="space-y-3">
                {project.beats.map((beat, idx) => (
                  <div key={beat.id} className="border border-white/10 bg-dark-card p-4 flex gap-4 items-center group relative overflow-hidden transition-all hover:border-cyan/30">
                    <div className="font-mono text-xl text-cyan opacity-20">{String(idx + 1).padStart(2, '0')}</div>
                    <div className="flex-1">
                      <input 
                        value={beat.title}
                        onChange={e => {
                          const val = e.target.value;
                          setProject(p => ({
                            ...p,
                            beats: p.beats.map(b => b.id === beat.id ? { ...b, title: val } : b)
                          }));
                        }}
                        className="bg-transparent font-bold w-full focus:outline-none focus:text-cyan border-none transition-colors"
                        placeholder="场景标题"
                      />
                      <input 
                        value={beat.description}
                        onChange={e => {
                          const val = e.target.value;
                          setProject(p => ({
                            ...p,
                            beats: p.beats.map(b => b.id === beat.id ? { ...b, description: val } : b)
                          }));
                        }}
                        className="bg-transparent text-xs w-full focus:outline-none opacity-40 italic focus:opacity-100"
                        placeholder="场景详情..."
                      />
                    </div>
                    <div className="flex flex-col items-center gap-1 bg-black/40 p-2 rounded-sm border border-white/5">
                      <div className="text-[8px] opacity-40 uppercase font-mono">张力指数</div>
                      <input 
                        type="number" 
                        min="1" max="10" 
                        value={beat.pressureIndex}
                        onChange={e => {
                          const val = parseInt(e.target.value);
                          setProject(p => ({
                            ...p,
                            beats: p.beats.map(b => b.id === beat.id ? { ...b, pressureIndex: val } : b)
                          }));
                        }}
                        className="bg-transparent text-center font-mono focus:outline-none text-orange-500 w-8 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      {beat.status === 'completed' ? (
                        <div className="flex items-center gap-1 text-green-400 text-[10px] font-mono border border-green-400/30 px-2 py-1 bg-green-400/5 uppercase">
                          <ShieldCheck size={12} /> 已固化 (SECURED)
                        </div>
                      ) : (
                        <button 
                          disabled={isGenerating}
                          onClick={() => createChapterFromBeat(beat)}
                          className="bg-black border border-cyan/40 text-cyan px-3 py-1 text-[10px] font-mono font-bold hover:bg-cyan hover:text-black transition-all disabled:opacity-50 uppercase"
                        >
                          {isGenerating ? '处理中...' : '初始化生成'}
                        </button>
                      )}
                      <button 
                        onClick={() => setProject(p => ({ ...p, beats: p.beats.filter(b => b.id !== beat.id) }))}
                        className="p-1 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'studio' && (
            <motion.div 
              key="studio"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="h-full flex flex-col gap-6"
            >
              <div className="flex justify-between items-center bg-cyan text-black px-4 py-1">
                <div className="mono text-[10px] font-bold tracking-tighter uppercase italic">工艺工作坊 / 实时渲染</div>
                <div className="flex gap-4 mono text-[10px]">
                  <span className="opacity-60 italic">OS_v9.0_内核已激活</span>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <h2 className="text-3xl font-black tracking-tighter uppercase italic leading-none">工坊 <span className="text-cyan">雕琢</span></h2>
                  <select 
                    className="bg-black border border-cyan/30 p-1 px-3 text-[10px] font-mono focus:outline-none text-cyan uppercase"
                    value={selectedChapterId || ''}
                    onChange={(e) => setSelectedChapterId(e.target.value)}
                  >
                    <option value="">载入文件柜...</option>
                    {project.chapters.map(c => (
                      <option key={c.id} value={c.id} className="bg-ink text-bg">第 {c.number} 卷: {c.title.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
              </div>

              {activeChapter ? (
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 overflow-hidden">
                  <div className="flex flex-col gap-4 relative overflow-hidden bg-dark-card border border-cyan/40 glow-cyan p-1">
                    <div className="scanner-line opacity-10"></div>
                    <div className="flex justify-between items-center bg-black/60 p-2 border-b border-white/5">
                       <h3 className="font-mono text-xs text-cyan font-bold tracking-widest uppercase italic">{activeChapter.title}</h3>
                       <div className="flex gap-2">
                          <button 
                            onClick={() => setFocusMode(true)}
                            className="flex items-center gap-2 border border-white/20 bg-white/5 px-3 py-1 text-[10px] font-mono text-white/60 hover:bg-white/10 hover:text-white transition-all uppercase font-bold"
                            title="进入专注模式"
                          >
                            <Maximize2 size={12} /> 专注模式
                          </button>
                          <button 
                            disabled={isGenerating}
                            onClick={() => runAudit(activeChapter.id)}
                            className="flex items-center gap-2 border border-cyan/40 bg-cyan/5 px-3 py-1 text-[10px] font-mono text-cyan hover:bg-cyan hover:text-black transition-all disabled:opacity-20 uppercase font-bold"
                          >
                            <ShieldCheck size={12} /> 执行质量审计
                          </button>
                          <button 
                            disabled={isGenerating}
                            onClick={() => auditRelationships(activeChapter.id)}
                            className="flex items-center gap-2 border border-cyan/40 bg-cyan/5 px-3 py-1 text-[10px] font-mono text-cyan hover:bg-cyan hover:text-black transition-all disabled:opacity-20 uppercase font-bold"
                          >
                            <ShieldAlert size={12} /> 审计人际逻辑
                          </button>
                       </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 relative">
                      <textarea 
                        value={activeChapter.content}
                        onChange={e => {
                          const val = e.target.value;
                          setProject(p => ({
                            ...p,
                            chapters: p.chapters.map(c => c.id === activeChapter.id ? { ...c, content: val } : c)
                          }));
                        }}
                        className="w-full h-full bg-transparent font-serif text-lg leading-relaxed focus:outline-none text-gray-200 resize-none selection:bg-cyan selection:text-black"
                      />
                    </div>
                  </div>
                  
                  <aside className="space-y-6 overflow-y-auto pr-2">
                    <div className="bg-dark-card border border-white/10 p-4 space-y-4 rounded-sm">
                      <div className="text-[10px] font-mono font-bold text-cyan border-b border-white/5 pb-2 uppercase tracking-widest">CHAPTER_METRICS (章节属性)</div>
                      
                      {/* Chapter Status & Progress */}
                      <div className="space-y-4">
                         <div className="flex flex-col gap-2">
                            <span className="mono text-[9px] opacity-40 uppercase">当前状态</span>
                            <div className="flex gap-1">
                              {(['draft', 'review', 'final'] as const).map(s => (
                                <button
                                  key={s}
                                  onClick={() => setProject(p => ({
                                    ...p,
                                    chapters: p.chapters.map(c => c.id === activeChapter.id ? { ...c, status: s } : c)
                                  }))}
                                  className={`flex-1 py-1 text-[8px] mono border transition-all ${activeChapter.status === s ? 'bg-cyan/20 border-cyan text-cyan' : 'bg-white/5 border-white/10 text-white/40'}`}
                                >
                                  {s.toUpperCase()}
                                </button>
                              ))}
                            </div>
                         </div>

                         <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center text-[9px] mono">
                               <span className="opacity-40 uppercase">字数进度</span>
                               <span className="text-cyan">{activeChapter.content.length} / {activeChapter.wordCountTarget}</span>
                            </div>
                            <div className="bg-white/5 h-1 w-full rounded-full overflow-hidden">
                               <motion.div 
                                 initial={{ width: 0 }}
                                 animate={{ width: `${Math.min(100, (activeChapter.content.length / activeChapter.wordCountTarget) * 100)}%` }}
                                 className="bg-cyan h-full"
                               />
                            </div>
                            <input 
                              type="number"
                              value={activeChapter.wordCountTarget}
                              onChange={e => {
                                const val = parseInt(e.target.value) || 0;
                                setProject(p => ({
                                  ...p,
                                  chapters: p.chapters.map(c => c.id === activeChapter.id ? { ...c, wordCountTarget: val } : c)
                                }));
                              }}
                              className="bg-transparent border-b border-white/10 text-[9px] mono focus:outline-none focus:border-cyan/50 text-white/60"
                              placeholder="设置目标字数..."
                            />
                         </div>
                      </div>

                      {/* Snapshots Logic */}
                      <div className="pt-4 border-t border-white/5">
                        <div className="flex justify-between items-center mb-2">
                          <span className="mono text-[9px] text-cyan uppercase font-bold">快照回溯 (SNAPSHOTS)</span>
                          <span className="mono text-[8px] opacity-30 italic">{project.snapshots.filter(s => s.chapterId === activeChapter.id).length} 个可用</span>
                        </div>
                        <div className="flex flex-col gap-1 max-h-[150px] overflow-y-auto custom-mini-scrollbar">
                           {project.snapshots.filter(s => s.chapterId === activeChapter.id).length === 0 && (
                             <div className="text-[8px] mono opacity-20 text-center py-2 italic">暂无备份镜像</div>
                           )}
                           {project.snapshots
                             .filter(s => s.chapterId === activeChapter.id)
                             .map((snap) => (
                               <button 
                                 key={snap.id}
                                 onClick={() => {
                                   if (confirm("确定回溯到此版本？当前内容将建立新的快照。")) {
                                     createSnapshot(activeChapter.id, "手动回溯版本");
                                     setProject(p => ({
                                       ...p,
                                       chapters: p.chapters.map(c => c.id === activeChapter.id ? { ...c, content: snap.content } : c)
                                     }));
                                   }
                                 }}
                                 className="flex flex-col gap-1 w-full text-left p-2 bg-white/5 border border-white/5 hover:border-cyan/40 transition-all group"
                               >
                                 <div className="flex justify-between text-[8px] mono">
                                   <span className="text-cyan/60 group-hover:text-cyan">{new Date(snap.timestamp).toLocaleTimeString()}</span>
                                   <History size={10} className="opacity-20 group-hover:opacity-100" />
                                 </div>
                                 <div className="text-[8px] mono opacity-40 line-clamp-1">{snap.reason}</div>
                               </button>
                             ))}
                        </div>
                        <button 
                          onClick={() => createSnapshot(activeChapter.id, "手动保存点")}
                          className="w-full mt-2 py-1 border border-white/20 text-[8px] mono hover:bg-white/10 transition-all text-white/40 uppercase"
                        >
                          创建即时快照
                        </button>
                      </div>

                      <div className="text-[10px] font-mono font-bold text-cyan border-b border-white/5 pb-2 uppercase tracking-widest pt-4">逻辑内核 OS</div>
                      <div className="space-y-4">
                         <div className="flex flex-col gap-1">
                            <div className="flex justify-between items-end text-[10px] mono">
                               <span className="opacity-40">POV视角锁定状态</span>
                               <span className="text-green-400">活跃</span>
                            </div>
                            <div className="bg-white/5 h-1 w-full rounded-full overflow-hidden">
                               <div className="bg-green-400 w-full h-full"></div>
                            </div>
                         </div>
                         <div className="flex flex-col gap-2">
                            <div className="text-[10px] text-cyan font-mono border-b border-white/5 pb-1 uppercase tracking-widest">创作工具</div>
                            <div className="space-y-3">
                               <div className="space-y-1">
                                 <div className="flex justify-between items-center p-1 px-2 border border-white/10 text-xs">
                                   <span className="text-[9px] mono opacity-60">对白雕琢 (DIALOGUE MEAT)</span>
                                   <Zap size={10} className="text-cyan animate-pulse" />
                                 </div>
                                 <select 
                                  className="w-full bg-black/40 text-[9px] p-2 border border-cyan/20 focus:outline-none mono text-cyan uppercase"
                                  onChange={async (e) => {
                                    const charId = e.target.value;
                                    if (!charId) return;
                                    const char = project.characters.find(c => c.id === charId);
                                    if (!char || !activeChapter) return;
                                    
                                    setIsGenerating(true);
                                    try {
                                      const enhanced = await enhanceDialogue(activeChapter.content, char);
                                      setProject(p => ({
                                        ...p,
                                        chapters: p.chapters.map(c => c.id === activeChapter.id ? { ...c, content: enhanced || c.content } : c)
                                      }));
                                    } finally {
                                      setIsGenerating(false);
                                      e.target.value = "";
                                    }
                                  }}
                                 >
                                   <option value="" className="bg-black">选择强化视角</option>
                                   {project.characters.map(c => <option key={c.id} value={c.id} className="bg-black">{c.name.toUpperCase()}</option>)}
                                 </select>
                               </div>

                               <button 
                                onClick={async () => {
                                  if (!activeChapter) return;
                                  setIsGenerating(true);
                                  try {
                                    const rendered = await qualityAudit(`用三层深度（肢体、物理、内在感受）渲染此文本中的动作场面： \n\n${activeChapter.content}`);
                                    setProject(p => ({
                                      ...p,
                                      chapters: p.chapters.map(c => c.id === activeChapter.id ? { ...c, content: rendered || c.content } : c)
                                    }));
                                  } finally {
                                    setIsGenerating(false);
                                  }
                                }}
                                className="w-full flex justify-between items-center border border-white/10 p-2 px-3 text-[9px] mono hover:border-cyan/50 hover:bg-white/5 transition-all uppercase text-left group"
                               >
                                 <span>深度动作渲染</span>
                                 <ChevronRight size={10} className="text-cyan group-hover:translate-x-1 transition-transform" />
                               </button>

                               {/* New Strengthened AI Writing Tools */}
                               <button 
                                onClick={() => handleContinueWriting(activeChapter.id)}
                                disabled={isGenerating}
                                className="w-full flex justify-between items-center border border-cyan/20 p-2 px-3 text-[9px] mono hover:border-cyan/50 hover:bg-cyan/5 transition-all uppercase text-left group"
                               >
                                 <div className="flex items-center gap-2">
                                   <Sparkles size={10} className="text-cyan" />
                                   <span>智能续写 (CONT_WRITING)</span>
                                 </div>
                                 <ChevronRight size={10} className="text-cyan group-hover:translate-x-1 transition-transform" />
                               </button>

                               <div className="space-y-1">
                                 <div className="flex justify-between items-center p-1 px-2 border border-white/10 text-xs">
                                   <span className="text-[9px] mono opacity-60">氛围强化 (ATMOSPHERE)</span>
                                   <Wind size={10} className="text-cyan" />
                                 </div>
                                 <div className="grid grid-cols-2 gap-1">
                                    <AtmosphereBtn label="苍凉" onClick={() => handleEnhanceAtmosphere(activeChapter.id, "苍凉、宿命感")} icon={<Wind size={8}/>} />
                                    <AtmosphereBtn label="热血" onClick={() => handleEnhanceAtmosphere(activeChapter.id, "热血、激昂")} icon={<Flame size={8}/>} />
                                    <AtmosphereBtn label="诡谲" onClick={() => handleEnhanceAtmosphere(activeChapter.id, "阴森、诡谲、不可名状")} icon={<ShieldAlert size={8}/>} />
                                    <AtmosphereBtn label="恬适" onClick={() => handleEnhanceAtmosphere(activeChapter.id, "宁静、恬适、日常感")} icon={<Coffee size={8}/>} />
                                 </div>
                               </div>

                               <button 
                                onClick={() => handleBrainstorm(activeChapter.id)}
                                disabled={isGenerating}
                                className="w-full flex justify-between items-center border border-white/10 p-2 px-3 text-[9px] mono hover:border-cyan/50 hover:bg-white/5 transition-all uppercase text-left group"
                               >
                                 <div className="flex items-center gap-2">
                                   <BrainCircuit size={10} className="text-cyan" />
                                   <span>逻辑推演建议</span>
                                 </div>
                                 <ChevronRight size={10} className="text-cyan group-hover:translate-x-1 transition-transform" />
                               </button>
                            </div>
                         </div>
                         {project.inconsistencies.filter(i => i.chapterId === activeChapter.id).length > 0 && (
                            <div className="flex flex-col gap-2">
                               <div className="text-[10px] text-orange-400 font-mono border-b border-white/5 pb-1 uppercase tracking-widest flex items-center gap-1">
                                 <ShieldAlert size={10} /> 逻辑预警
                               </div>
                               <div className="space-y-2">
                                  {project.inconsistencies.filter(i => i.chapterId === activeChapter.id).map(inc => (
                                    <div key={inc.id} className="text-[9px] bg-red-900/10 border border-red-900/30 p-2 text-red-300 mono leading-tight relative group">
                                      <div className="font-bold opacity-60 mb-1">严重程度: {inc.severity.toUpperCase()}</div>
                                      {inc.description}
                                      <button 
                                        onClick={() => setProject(p => ({ ...p, inconsistencies: p.inconsistencies.filter(i => i.id !== inc.id) }))}
                                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 hover:text-white"
                                      >
                                        <Trash2 size={8} />
                                      </button>
                                    </div>
                                  ))}
                               </div>
                            </div>
                         )}
                      </div>
                    </div>

                    <div className="bg-dark-card border border-white/10 p-4 space-y-4 rounded-sm min-h-[200px]">
                       <div className="text-[10px] font-mono font-bold text-cyan border-b border-white/5 pb-2 uppercase tracking-widest">记忆矩阵 (Memory Matrix)</div>
                       <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scroll">
                          {project.wiki.length === 0 && <div className="text-[10px] mono opacity-20 italic">未发现历史痕迹。</div>}
                          {project.wiki.map(w => (
                            <div key={w.id} className="text-[10px] mono border-b border-white/5 pb-2 group">
                              <div className="flex justify-between items-center mb-1">
                                <span className={w.type === 'hook' ? 'text-cyan' : 'text-gray-400'}>[{w.type === 'hook' ? '伏笔' : w.type === 'setting' ? '设定' : w.type === 'lore' ? '传说' : '状态'}]</span>
                                <span className="font-bold text-white uppercase tracking-tighter truncate max-w-[150px]">{w.title}</span>
                              </div>
                              <div className="opacity-40 line-clamp-3 group-hover:opacity-100 transition-opacity leading-tight">{w.content}</div>
                            </div>
                          ))}
                       </div>
                    </div>
                  </aside>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center border border-white/10 bg-dark-card rounded-sm relative overflow-hidden">
                  <div className="scanner-line opacity-5"></div>
                  <div className="text-center space-y-4 relative z-10">
                    <BookOpen size={64} className="mx-auto text-cyan opacity-10 animate-pulse" />
                    <p className="font-mono text-[10px] tracking-widest opacity-30 italic">初始化章节或选择现有核心记录</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'relationships' && (
            <motion.div 
               key="relationships"
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -10 }}
               className="space-y-6"
            >
               <div className="flex justify-between items-end">
                <div>
                  <div className="header-serif">VI. 动态羁绊</div>
                  <h2 className="text-3xl font-black tracking-tighter uppercase italic leading-none">关系 <span className="text-cyan">中心</span></h2>
                </div>
                <button 
                  onClick={addRelationship}
                  className="flex items-center gap-2 bg-cyan text-black px-4 py-2 text-xs font-mono font-bold hover:bg-cyan/80 transition-all glow-cyan uppercase italic"
                >
                  <Heart size={16} /> 建立羁绊
                </button>
              </div>

              {/* Filters & Sorting */}
              <div className="bg-black/40 border border-white/10 p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest opacity-40 mono">关系类型</label>
                    <select 
                      value={relFilterType}
                      onChange={e => setRelFilterType(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 p-2 text-[10px] mono text-white focus:outline-none"
                    >
                      <option value="all">全部类型</option>
                      <option value="friendship">友好</option>
                      <option value="romantic">情爱</option>
                      <option value="rivalry">竞争</option>
                      <option value="hostile">敌对</option>
                      <option value="neutral">中立</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest opacity-40 mono">涉及角色</label>
                    <select 
                      value={relFilterCharId}
                      onChange={e => setRelFilterCharId(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 p-2 text-[10px] mono text-white focus:outline-none"
                    >
                      <option value="all">所有角色</option>
                      {project.characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest opacity-40 mono">数值区间 ({relScoreRange[0]} 至 {relScoreRange[1]})</label>
                    <div className="flex gap-2">
                      <input 
                        type="number"
                        value={relScoreRange[0]}
                        onChange={e => {
                          const val = parseInt(e.target.value);
                          setRelScoreRange([isNaN(val) ? -100 : val, relScoreRange[1]]);
                        }}
                        className="w-1/2 bg-white/5 border border-white/10 p-2 text-[10px] mono text-white focus:outline-none"
                      />
                      <input 
                        type="number"
                        value={relScoreRange[1]}
                        onChange={e => {
                          const val = parseInt(e.target.value);
                          setRelScoreRange([relScoreRange[0], isNaN(val) ? 100 : val]);
                        }}
                        className="w-1/2 bg-white/5 border border-white/10 p-2 text-[10px] mono text-white focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest opacity-40 mono">排序规则</label>
                    <select 
                      value={relSortBy}
                      onChange={e => setRelSortBy(e.target.value as any)}
                      className="w-full bg-white/5 border border-white/10 p-2 text-[10px] mono text-white focus:outline-none"
                    >
                      <option value="score">分值 (降序)</option>
                      <option value="type">类型</option>
                      <option value="character">角色名</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest opacity-40 mono">排序方向</label>
                    <button 
                      onClick={() => setRelSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                      className="w-full bg-white/5 border border-white/10 p-2 text-[10px] mono text-white focus:outline-none hover:bg-white/10 transition-all uppercase"
                    >
                      {relSortOrder === 'asc' ? '升序 (ASC)' : '降序 (DESC)'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-center">
                  <div className="flex-1 w-full relative">
                    <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" />
                    <input 
                      value={relSearchQuery}
                      onChange={e => setRelSearchQuery(e.target.value)}
                      placeholder="搜索关系描述或角色姓名..."
                      className="w-full bg-white/5 border border-white/10 p-2 pl-9 text-[10px] mono text-white focus:outline-none focus:border-cyan/30 rounded-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => setRelScoreRange([-100, 100])}
                    className={`text-[8px] mono px-2 py-1 transition-all rounded-sm uppercase border ${relScoreRange[0] === -100 && relScoreRange[1] === 100 ? 'bg-cyan/20 border-cyan/40 text-cyan' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                  >
                    全部 (ALL)
                  </button>
                  <button 
                    onClick={() => setRelScoreRange([1, 100])}
                    className={`text-[8px] mono px-2 py-1 transition-all rounded-sm uppercase border ${relScoreRange[0] === 1 && relScoreRange[1] === 100 ? 'bg-green-500/20 border-green-500/40 text-green-400' : 'bg-white/5 border-white/10 hover:bg-green-500/10'}`}
                  >
                    友善 (POS)
                  </button>
                  <button 
                    onClick={() => setRelScoreRange([-100, -1])}
                    className={`text-[8px] mono px-2 py-1 transition-all rounded-sm uppercase border ${relScoreRange[0] === -100 && relScoreRange[1] === -1 ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-white/5 border-white/10 hover:bg-red-500/10'}`}
                  >
                    敌视 (NEG)
                  </button>
                  <button 
                    onClick={() => setRelScoreRange([0, 0])}
                    className={`text-[8px] mono px-2 py-1 transition-all rounded-sm uppercase border ${relScoreRange[0] === 0 && relScoreRange[1] === 0 ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : 'bg-white/5 border-white/10 hover:bg-blue-500/10'}`}
                  >
                    中性 (NEUTRAL)
                  </button>
                  <button 
                    onClick={() => {
                      setRelFilterType('all');
                      setRelFilterCharId('all');
                      setRelScoreRange([-100, 100]);
                      setRelSortBy('score');
                      setRelSortOrder('desc');
                      setRelSearchQuery('');
                    }}
                    className="ml-auto text-[8px] mono px-2 py-1 bg-white/5 hover:bg-white/10 transition-all rounded-sm opacity-50 hover:opacity-100 flex items-center gap-1 uppercase border border-white/10"
                  >
                    <RefreshCw size={8} /> 重置所有过滤 (RESET)
                  </button>
                </div>
              </div>
            </div>

              {(() => {
                const filtered = project.relationships
                  .filter(rel => {
                    const charA = project.characters.find(c => c.id === rel.sourceCharacterId);
                    const charB = project.characters.find(c => c.id === rel.targetCharacterId);
                    
                    const matchesType = relFilterType === 'all' || rel.type === relFilterType;
                    const matchesChar = relFilterCharId === 'all' || rel.sourceCharacterId === relFilterCharId || rel.targetCharacterId === relFilterCharId;
                    const matchesScore = rel.score >= relScoreRange[0] && rel.score <= relScoreRange[1];
                    
                    const query = relSearchQuery.toLowerCase();
                    const matchesSearch = !query || 
                      rel.description.toLowerCase().includes(query) ||
                      (charA?.name.toLowerCase().includes(query)) ||
                      (charB?.name.toLowerCase().includes(query)) ||
                      (rel.type.toLowerCase().includes(query));

                    return matchesType && matchesChar && matchesScore && matchesSearch;
                  })
                  .sort((a, b) => {
                    let result = 0;
                    if (relSortBy === 'score') result = b.score - a.score;
                    else if (relSortBy === 'type') result = a.type.localeCompare(b.type);
                    else if (relSortBy === 'character') {
                      const charA = project.characters.find(c => c.id === a.sourceCharacterId)?.name || '';
                      const charB = project.characters.find(c => c.id === b.sourceCharacterId)?.name || '';
                      result = charA.localeCompare(charB);
                    }
                    return relSortOrder === 'desc' ? result : -result;
                  });

                return (
                  <>
                    <RelationshipGraph 
                      project={{ ...project, relationships: filtered }} 
                      onUpdateRelationships={(updatedRels) => {
                        setProject(p => ({ ...p, relationships: updatedRels }));
                      }}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {filtered.map(rel => (
                        <div key={rel.id} className="card-technical space-y-4">
                          <div className="flex justify-between items-center border-b border-white/10 pb-2">
                             <div className="flex flex-col">
                                <select 
                                 value={rel.sourceCharacterId}
                                 onChange={e => setProject(p => ({ ...p, relationships: p.relationships.map(r => r.id === rel.id ? { ...r, sourceCharacterId: e.target.value } : r) }))}
                                 className="bg-transparent text-[10px] font-bold text-cyan focus:outline-none border-none mono uppercase"
                                >
                                  <option value="" className="bg-ink">选择角色 A</option>
                                  {project.characters.map(c => <option key={c.id} value={c.id} className="bg-ink">{c.name}</option>)}
                                </select>
                                <span className="text-[8px] opacity-40 italic ml-1">源角色</span>
                             </div>
                             <ChevronRight size={12} className="opacity-20" />
                             <div className="flex flex-col text-right">
                                <select 
                                 value={rel.targetCharacterId}
                                 onChange={e => setProject(p => ({ ...p, relationships: p.relationships.map(r => r.id === rel.id ? { ...r, targetCharacterId: e.target.value } : r) }))}
                                 className="bg-transparent text-[10px] font-bold text-cyan focus:outline-none border-none mono uppercase text-right"
                                >
                                  <option value="" className="bg-ink">选择角色 B</option>
                                  {project.characters.map(c => <option key={c.id} value={c.id} className="bg-ink">{c.name}</option>)}
                                </select>
                                <span className="text-[8px] opacity-40 italic mr-1">目标角色</span>
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-1">
                                <label className="text-[9px] uppercase tracking-widest opacity-40 mono">羁绊类型</label>
                                <select 
                                 value={rel.type}
                                 onChange={e => setProject(p => ({ ...p, relationships: p.relationships.map(r => r.id === rel.id ? { ...r, type: e.target.value as any } : r) }))}
                                 className="w-full bg-white/5 border border-white/10 p-1 text-[10px] mono text-white focus:outline-none"
                                >
                                  <option value="neutral" className="bg-ink">中立</option>
                                  <option value="friendship" className="bg-ink">友好</option>
                                  <option value="rivalry" className="bg-ink">竞争</option>
                                  <option value="romantic" className="bg-ink">情爱</option>
                                  <option value="hostile" className="bg-ink">敌对</option>
                                </select>
                             </div>
                             <div className="space-y-1">
                                <label className="text-[9px] uppercase tracking-widest opacity-40 mono">数值 (-100 到 100)</label>
                                <input 
                                 type="number"
                                 value={rel.score}
                                 onChange={e => {
                                   const val = parseInt(e.target.value);
                                   if (isNaN(val)) return;
                                   setProject(p => ({ 
                                     ...p, 
                                     relationships: p.relationships.map(r => {
                                       if (r.id === rel.id && r.score !== val) {
                                         const historyEntry = {
                                           id: crypto.randomUUID(),
                                           timestamp: Date.now(),
                                           oldScore: r.score,
                                           newScore: val,
                                           reason: '手动调整',
                                         };
                                         return { ...r, score: val, history: [...(r.history || []), historyEntry] };
                                       }
                                       return r;
                                     }) 
                                   }));
                                 }}
                                 className="w-full bg-white/5 border border-white/10 p-1 text-[10px] mono text-white text-center focus:outline-none"
                                />
                             </div>
                          </div>
                          <div className="space-y-1">
                             <label className="text-[9px] uppercase tracking-widest opacity-40 mono">羁绊背景</label>
                             <textarea 
                               value={rel.description}
                               onChange={e => setProject(p => ({ ...p, relationships: p.relationships.map(r => r.id === rel.id ? { ...r, description: e.target.value } : r) }))}
                               className="w-full text-xs bg-white/5 border border-white/10 p-2 focus:outline-none min-h-[60px] rounded-sm text-gray-400 focus:text-white"
                             />
                          </div>
                          <button 
                             onClick={() => setProject(p => ({ ...p, relationships: p.relationships.filter(r => r.id !== rel.id) }))}
                             className="text-[9px] flex items-center gap-1 opacity-20 hover:opacity-100 hover:text-red-500 transition-all font-mono uppercase"
                           >
                             <Trash2 size={12} /> 断开羁绊 (SEVER_BOND)
                           </button>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </motion.div>
          )}

          {activeTab === 'wiki' && (
            <motion.div 
               key="wiki"
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -10 }}
               className="space-y-6"
            >
               <KnowledgeGraph project={project} setProject={setProject} />

               <div className="flex justify-between items-end">
                <div>
                  <div className="header-serif">V. 知识图谱</div>
                  <h2 className="text-3xl font-bold tracking-tight">百科与伏笔</h2>
                </div>
                <button 
                  onClick={() => {
                    const newEntry: WikiEntry = {
                      id: crypto.randomUUID(),
                      title: '新词条',
                      content: '在此输入详情...',
                      type: 'lore',
                      tags: [],
                      relatedIds: [],
                    };
                    setProject(p => ({ ...p, wiki: [...p.wiki, newEntry] }));
                  }}
                  className="flex items-center gap-2 bg-cyan text-black px-4 py-2 text-xs font-mono font-bold hover:bg-cyan/80 transition-all glow-cyan uppercase italic"
                >
                  <Plus size={16} /> 录入新卷宗
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {project.wiki.map(entry => (
                   <div key={entry.id} className="card-technical space-y-4">
                     <div className="flex justify-between items-start border-b border-white/10 pb-2">
                        <input 
                          value={entry.title}
                          onChange={e => {
                            const val = e.target.value;
                            setProject(p => ({
                              ...p,
                              wiki: p.wiki.map(w => w.id === entry.id ? { ...w, title: val } : w)
                            }));
                          }}
                          className="bg-transparent font-bold focus:outline-none focus:text-cyan border-none transition-colors text-sm"
                        />
                        <select 
                           value={entry.type}
                           onChange={e => {
                              const val = e.target.value as WikiEntry['type'];
                              setProject(p => ({
                                ...p,
                                wiki: p.wiki.map(w => w.id === entry.id ? { ...w, type: val } : w)
                              }));
                            }}
                            className="bg-black/40 text-[9px] uppercase font-mono border border-cyan/20 focus:outline-none text-cyan p-1"
                        >
                          <option value="hook" className="bg-black">伏笔 (Hook)</option>
                          <option value="setting" className="bg-black">设定 (Setting)</option>
                          <option value="lore" className="bg-black">传说 (Lore)</option>
                          <option value="state" className="bg-black">状态 (State)</option>
                        </select>
                     </div>
                     <textarea 
                        value={entry.content}
                        onChange={e => {
                          const val = e.target.value;
                          setProject(p => ({
                            ...p,
                            wiki: p.wiki.map(w => w.id === entry.id ? { ...w, content: val } : w)
                          }));
                        }}
                        className="w-full text-xs bg-white/5 border border-white/10 p-3 focus:outline-none focus:border-cyan/30 min-h-[120px] rounded-sm text-gray-400 focus:text-white"
                     />
                     <div className="space-y-4">
                        <div className="flex flex-wrap gap-1">
                          {entry.tags.map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 bg-cyan/10 border border-cyan/30 rounded-sm mono text-[8px] text-cyan flex items-center gap-1">
                              {tag}
                              <X 
                                size={8} 
                                className="cursor-pointer hover:text-white" 
                                onClick={() => setProject(p => ({
                                  ...p,
                                  wiki: p.wiki.map(w => w.id === entry.id ? { ...w, tags: w.tags.filter(t => t !== tag) } : w)
                                }))} 
                              />
                            </span>
                          ))}
                          <input 
                            placeholder="+ 标签"
                            className="bg-transparent border-none text-[8px] mono text-cyan focus:outline-none w-12"
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                const val = (e.target as HTMLInputElement).value.trim();
                                if (val && !entry.tags.includes(val)) {
                                  setProject(p => ({
                                    ...p,
                                    wiki: p.wiki.map(w => w.id === entry.id ? { ...w, tags: [...w.tags, val] } : w)
                                  }));
                                  (e.target as HTMLInputElement).value = '';
                                }
                              }
                            }}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[8px] mono opacity-30 uppercase tracking-widest">关联要素 (CONTEXT_LINKS)</label>
                          <div className="flex flex-wrap gap-1">
                            {entry.relatedIds.map(rid => {
                              const related = project.wiki.find(w => w.id === rid) || project.characters.find(c => c.id === rid);
                              return (
                                <span key={rid} className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded-sm mono text-[8px] opacity-60 flex items-center gap-1">
                                  {related?.title || (related as any)?.name || 'UNKNOWN'}
                                  <X 
                                    size={8} 
                                    className="cursor-pointer hover:text-red-400" 
                                    onClick={() => setProject(p => ({
                                      ...p,
                                      wiki: p.wiki.map(w => w.id === entry.id ? { ...w, relatedIds: w.relatedIds.filter(id => id !== rid) } : w)
                                    }))} 
                                  />
                                </span>
                              );
                            })}
                            <select 
                              className="bg-transparent border-none text-[8px] mono text-cyan focus:outline-none w-16"
                              onChange={e => {
                                const val = e.target.value;
                                if (val && !entry.relatedIds.includes(val)) {
                                  setProject(p => ({
                                    ...p,
                                    wiki: p.wiki.map(w => w.id === entry.id ? { ...w, relatedIds: [...w.relatedIds, val] } : w)
                                  }));
                                }
                                e.target.value = '';
                              }}
                            >
                              <option value="">+ 关联</option>
                              <optgroup label="卷宗" className="bg-black">
                                {project.wiki.filter(w => w.id !== entry.id).map(w => <option key={w.id} value={w.id}>{w.title}</option>)}
                              </optgroup>
                              <optgroup label="角色" className="bg-black">
                                {project.characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </optgroup>
                            </select>
                          </div>
                        </div>
                     </div>
                     <div className="flex justify-between items-center pt-2 border-t border-white/5">
                        <div className="flex gap-3">
                          <button 
                            onClick={() => setProject(p => ({ ...p, wiki: p.wiki.filter(w => w.id !== entry.id) }))}
                            className="text-[9px] flex items-center gap-1 opacity-20 hover:opacity-100 hover:text-red-500 transition-all font-mono uppercase"
                          >
                            <Trash2 size={12} /> 销毁记录
                          </button>
                          <button 
                            onClick={() => handleSuggestWikiLinks(entry)}
                            disabled={isSuggestingLinks}
                            className="text-[9px] flex items-center gap-1 text-cyan/40 hover:text-cyan transition-all font-mono uppercase"
                          >
                            <Sparkles size={12} className={isSuggestingLinks ? 'animate-pulse' : ''} /> 
                            {isSuggestingLinks ? '分析中...' : '建议关联'}
                          </button>
                        </div>
                      </div>

                      {/* AI Suggestions Panel */}
                      <AnimatePresence>
                        {wikiSuggestions[entry.id]?.length > 0 && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-4 p-3 bg-cyan/5 border border-cyan/20 rounded-sm space-y-2">
                              <div className="flex justify-between items-center mb-1">
                                <div className="mono text-[8px] text-cyan font-bold uppercase tracking-widest flex items-center gap-1">
                                  <BrainCircuit size={10} /> AI 关联建议 (SUGGESTIONS)
                                </div>
                                <div className="flex items-center gap-2">
                                  {wikiSuggestions[entry.id].some(s => !entry.relatedIds.includes(s.id)) && (
                                    <button 
                                      onClick={() => {
                                        const unlinkedIds = wikiSuggestions[entry.id]
                                          .filter(s => !entry.relatedIds.includes(s.id))
                                          .map(s => s.id);
                                        
                                        if (unlinkedIds.length > 0) {
                                          setProject(p => ({
                                            ...p,
                                            wiki: p.wiki.map(w => w.id === entry.id ? { ...w, relatedIds: [...w.relatedIds, ...unlinkedIds] } : w)
                                          }));
                                        }
                                      }}
                                      className="mono text-[7px] px-1.5 py-0.5 bg-white/10 text-white hover:bg-white/20 transition-colors uppercase font-bold"
                                    >
                                      LINK ALL
                                    </button>
                                  )}
                                  <button 
                                    onClick={() => setWikiSuggestions(p => ({ ...p, [entry.id]: [] }))}
                                    className="text-white/20 hover:text-white"
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-2">
                                {wikiSuggestions[entry.id].map(suggestion => {
                                  const isAdded = entry.relatedIds.includes(suggestion.id);
                                  return (
                                    <div key={suggestion.id} className={`flex flex-col gap-1 border-b border-white/5 pb-2 last:border-0 last:pb-0 ${isAdded ? 'opacity-40' : ''}`}>
                                      <div className="flex justify-between items-center">
                                        <span className="mono text-[9px] text-white font-bold">{suggestion.name}</span>
                                        <button 
                                          onClick={() => {
                                            if (!isAdded) {
                                               setProject(p => ({
                                                 ...p,
                                                 wiki: p.wiki.map(w => w.id === entry.id ? { ...w, relatedIds: [...w.relatedIds, suggestion.id] } : w)
                                               }));
                                            }
                                          }}
                                          disabled={isAdded}
                                          className={`mono text-[8px] px-2 py-0.5 font-bold transition-colors ${isAdded ? 'bg-white/10 text-white/40' : 'bg-cyan text-black hover:bg-white'}`}
                                        >
                                          {isAdded ? 'LINKED' : 'LINK'}
                                        </button>
                                      </div>
                                      <p className="text-[8px] mono opacity-40 leading-tight">{suggestion.reason}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                   </div>
                 ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    )}
  </AnimatePresence>
</main>

      {/* Global Brainstorm Panel */}
      <AnimatePresence>
        {brainstormResults && (
          <motion.div 
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className="fixed top-20 right-6 w-80 bg-black/90 border border-cyan/40 backdrop-blur-md p-6 z-40 shadow-2xl glow-cyan-subtle max-h-[70vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <BrainCircuit size={14} className="text-cyan" />
                <span className="mono text-[10px] text-cyan font-bold uppercase tracking-widest">AI 智库推演结果</span>
              </div>
              <button 
                onClick={() => setBrainstormResults(null)}
                className="p-1 text-white/40 hover:text-white transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="text-[11px] mono text-white/80 leading-relaxed whitespace-pre-wrap">
              {brainstormResults}
            </div>
            <button 
              onClick={() => setBrainstormResults(null)}
              className="w-full mt-6 py-2 border border-white/10 text-[9px] mono uppercase hover:bg-white/5 transition-colors"
            >
              关闭报告 (CLOSE_REPORT)
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* System Tutorial Overlay */}
      <AnimatePresence>
        {showTutorial && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 md:p-8 backdrop-blur-sm"
          >
            <div className="max-w-4xl w-full border border-cyan/40 bg-black p-6 md:p-10 relative overflow-hidden flex flex-col max-h-full">
              <div className="scanner-line opacity-10"></div>
              <div className="flex justify-between items-start mb-8 relative z-10">
                <div>
                   <h2 className="header-serif italic text-3xl text-cyan mb-2">NARRATIVE OS 操作手册</h2>
                   <p className="mono text-[10px] uppercase tracking-[0.4em] opacity-40">System Manual // Phase: Production Deployment</p>
                </div>
                <button 
                  onClick={() => setShowTutorial(false)}
                  className="p-2 border border-cyan/20 hover:border-cyan hover:bg-cyan/10 transition-all group"
                >
                  <X size={20} className="text-cyan group-hover:scale-110 transition-transform" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pr-4 custom-scrollbar relative z-10">
                 <TutorialStep 
                    icon={<Map size={24} />}
                    title="世界蓝图 (Blueprint)"
                    desc="核心物理法则与题材算法。这是叙事逻辑的核心源头，所有后续创作将遵循此协议。"
                 />
                 <TutorialStep 
                    icon={<Users size={24} />}
                    title="人设中心 (Persona)"
                    desc="锚定角色的核心动机与对话风格。支持AI智库进行“剧情弧线”推演。"
                 />
                 <TutorialStep 
                    icon={<Book size={24} />}
                    title="情节大纲 (Beats)"
                    desc="通过压力感调节叙事节奏。每一个节拍都决定了剧情的张力分布。"
                 />
                 <TutorialStep 
                    icon={<Edit3 size={24} />}
                    title="创作空间 (Studio)"
                    desc="AI强化写作环境。提供智能续写、氛围渲染（苍凉/热血/诡谲）及逻辑回路诊断。"
                 />
                 <TutorialStep 
                    icon={<Terminal size={24} />}
                    title="全任务引擎 (Omni)"
                    desc="顶部命令行。直接输入中文任务：如“添加一个新反派”或“总结当前项目风险”。"
                 />
                 <TutorialStep 
                    icon={<Heart size={24} />}
                    title="关系网络 (Graph)"
                    desc="实时可视化角色间的因果链接。根据创作内容自动更新好感度与阶层差异。"
                 />
              </div>

              <div className="mt-8 pt-6 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 relative z-10">
                 <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan animate-pulse"></span>
                    <span className="mono text-[10px] text-cyan uppercase tracking-widest text-center">系统校验通过 // 核心协议已激活</span>
                 </div>
                 <button 
                   onClick={() => setShowTutorial(false)}
                   className="w-full md:w-auto bg-cyan px-8 py-2 text-black font-mono font-bold text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
                 >
                   进入系统 (ENTER_ACCESS)
                 </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading Overlay */}
      {isGenerating && (
        <div className="fixed inset-0 bg-bg/80 backdrop-blur-md z-50 flex items-center justify-center border-4 border-cyan/20 m-4">
           <div className="scanner-line opacity-30"></div>
           <div className="text-center space-y-6 relative z-10">
              <motion.div 
                animate={{ rotate: 360, scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="relative"
              >
                <div className="absolute inset-0 bg-cyan blur-xl opacity-20"></div>
                <Zap size={64} className="text-cyan fill-current relative" />
              </motion.div>
              <div className="space-y-2">
                <div className="font-mono text-xl font-black tracking-widest text-cyan italic animate-pulse">INDUSTRIALIZING NARRATIVE</div>
                <div className="font-mono text-[10px] opacity-40 tracking-[0.5em] uppercase">Status: Running Logic Loops // Integrated v9.0</div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`
        flex items-center gap-3 px-3 py-2 text-[10px] font-mono transition-all relative group uppercase tracking-widest
        ${active ? 'text-black bg-cyan font-bold italic' : 'text-cyan/40 hover:text-cyan hover:bg-cyan/5'}
      `}
    >
      {active && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-black"></div>}
      {icon}
      <span>{label}</span>
      {active && <ChevronRight size={12} className="ml-auto" />}
    </button>
  );
}

function Field({ title, description, children }: { title: string, description: string, children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-col">
        <label className="font-mono text-[10px] font-bold uppercase text-cyan tracking-widest">{title}</label>
        <span className="text-[9px] opacity-40 mono uppercase tracking-tighter">{description}</span>
      </div>
      {children}
    </div>
  );
}

function AtmosphereBtn({ label, onClick, icon }: { label: string, onClick: () => void, icon?: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-1 bg-white/5 border border-white/10 p-1 px-2 text-[8px] mono text-white/60 hover:text-cyan hover:border-cyan/40 hover:bg-cyan/5 transition-all uppercase rounded-sm"
    >
      {icon}
      {label}
    </button>
  );
}

function TutorialStep({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="border border-white/10 p-4 hover:border-cyan/30 transition-all bg-white/5 group">
       <div className="text-cyan mb-4 group-hover:scale-110 transition-transform origin-left">{icon}</div>
       <h3 className="mono text-[11px] font-bold text-white uppercase mb-2 tracking-widest">{title}</h3>
       <p className="text-[10px] text-white/40 leading-relaxed mono uppercase">{desc}</p>
    </div>
  );
}
