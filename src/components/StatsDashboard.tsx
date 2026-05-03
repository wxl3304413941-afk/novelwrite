import React from 'react';
import { NovelProject } from '../types';
import { Activity, Type, Target, Clock, BarChart3, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';

interface StatsDashboardProps {
  project: NovelProject;
}

export const StatsDashboard: React.FC<StatsDashboardProps> = ({ project }) => {
  const totalWords = project.chapters.reduce((acc, c) => acc + c.content.length, 0);
  const targetWords = project.config.targetTotalWords || 200000;
  const progressPercent = Math.min(100, Math.floor((totalWords / targetWords) * 100));
  
  const chaptersCount = project.chapters.length;
  const charsCount = project.characters.length;
  const relsCount = project.relationships.length;
  
  const avgChapterLength = chaptersCount > 0 ? Math.floor(totalWords / chaptersCount) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* Word Count Progress */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-technical p-4 col-span-1 md:col-span-2"
      >
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Target size={16} className="text-cyan" />
            <span className="mono text-[10px] uppercase font-bold tracking-widest">总体进度 (GLOBAL_PROGRESS)</span>
          </div>
          <span className="mono text-xs text-cyan">{progressPercent}%</span>
        </div>
        
        <div className="flex flex-col gap-1">
          <div className="flex justify-between mono text-[10px] opacity-40">
            <span>{totalWords.toLocaleString()} / {targetWords.toLocaleString()} 字</span>
            <span>距目标: {(targetWords - totalWords).toLocaleString()}</span>
          </div>
          <div className="h-2 bg-white/5 w-full relative overflow-hidden rounded-full border border-white/5">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-cyan/40 to-cyan shadow-[0_0_10px_rgba(0,240,255,0.5)]"
            />
          </div>
        </div>
      </motion.div>

      {/* Chapter Stats */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card-technical p-4"
      >
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={16} className="text-cyan" />
          <span className="mono text-[10px] uppercase font-bold tracking-widest">章节统计 (CHAPTER_METRICS)</span>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="mono text-[9px] opacity-40 uppercase">已完成章节</span>
            <span className="mono text-lg font-bold text-white">{chaptersCount}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="mono text-[9px] opacity-40 uppercase">平均章节字数</span>
            <span className="mono text-xs text-cyan">{avgChapterLength}</span>
          </div>
        </div>
      </motion.div>

      {/* World Density */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card-technical p-4"
      >
        <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={16} className="text-cyan" />
            <span className="mono text-[10px] uppercase font-bold tracking-widest">模型密度 (DENSITY)</span>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="mono text-[9px] opacity-40 uppercase">角色矩阵深度</span>
            <span className="mono text-lg font-bold text-white">{charsCount}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="mono text-[9px] opacity-40 uppercase">因果冲突浓度</span>
            <span className="mono text-xs text-cyan">{(relsCount / (charsCount || 1)).toFixed(2)} rel/char</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
