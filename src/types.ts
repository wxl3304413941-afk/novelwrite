/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface WorldBuilding {
  physicalLaws: string;
  causalDebt: string;
  genre: string;
  conflictModel: string;
}

export interface OutlineBeat {
  id: string;
  title: string;
  description: string;
  pressureIndex: number; // 1-10
  status: 'pending' | 'in-progress' | 'completed';
}

export interface CharacterPersona {
  id: string;
  name: string;
  role: string;
  personaAnchor: string;
  coreMotives: string;
  dialogueStyle: string;
  subtextRatio: number; // e.g., 0.3
  relatedLoreIds: string[];
}

export interface Chapter {
  id: string;
  number: number;
  title: string;
  content: string;
  beatId: string;
  status: 'draft' | 'review' | 'final';
  wordCountTarget: number;
  tags: string[];
}

export interface WikiEntry {
  id: string;
  title: string;
  content: string;
  type: 'hook' | 'setting' | 'lore' | 'state';
  tags: string[];
  relatedIds: string[];
}

export interface RelationshipHistory {
  id: string;
  timestamp: number;
  oldScore: number;
  newScore: number;
  reason?: string;
  chapterId?: string;
}

export interface Relationship {
  id: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  type: 'friendship' | 'rivalry' | 'romantic' | 'neutral' | 'hostile';
  score: number; // -100 to 100
  description: string;
  history?: RelationshipHistory[];
}

export interface RelationshipInconsistency {
  id: string;
  chapterId: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ProjectConfig {
  aiEditingTone: 'sharp' | 'gentle' | 'commercial' | 'literary';
  targetTotalWords: number;
}

export interface ChapterSnapshot {
  id: string;
  chapterId: string;
  timestamp: number;
  content: string;
  reason: string;
}

export interface NovelProject {
  id: string;
  title: string;
  world: WorldBuilding;
  beats: OutlineBeat[];
  characters: CharacterPersona[];
  relationships: Relationship[];
  chapters: Chapter[];
  wiki: WikiEntry[];
  inconsistencies: RelationshipInconsistency[];
  snapshots: ChapterSnapshot[];
  config: ProjectConfig;
}
