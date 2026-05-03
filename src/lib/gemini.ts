/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";
import { NovelProject, OutlineBeat, CharacterPersona, WikiEntry } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function suggestWikiLinks(project: NovelProject, entry: WikiEntry) {
  const allEntities = [
    ...project.characters.map(c => ({ id: c.id, name: c.name, type: 'character' })),
    ...project.wiki.filter(w => w.id !== entry.id).map(w => ({ id: w.id, name: w.title, type: w.type }))
  ];

  const prompt = `身份：创意知识管理专家。
任务：分析当前的百科词条，并从现有的角色和百科库中推荐相关的关联项。
必须使用中文。

当前词条：
标题：${entry.title}
类型：${entry.type}
内容：${entry.content}
现有标签：${entry.tags.join(", ")}

可选实体库：
${allEntities.map(e => `[ID: ${e.id}] ${e.name} (${e.type})`).join("\n")}

请基于语义关联和世界观逻辑，推荐 3-5 个最相关的实体 ID。
推荐理由应简洁有力。

返回格式必须是 JSON：
{
  "suggestions": [
    { "id": "实体ID", "name": "实体名称", "reason": "推荐理由" }
  ]
}
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Link Suggestion Error:", error);
    return { suggestions: [] };
  }
}

export async function generateChapterContent(
  project: NovelProject,
  beat: OutlineBeat,
  additionalContext: string = ""
) {
  const charactersContext = project.characters
    .map(c => `[${c.name}]: ${c.personaAnchor}. Motives: ${c.coreMotives}. Style: ${c.dialogueStyle}`)
    .join("\n");

  const wikiContext = project.wiki
    .map(w => `[${w.title} (${w.type})]: ${w.content}`)
    .join("\n");

  const systemPrompt = `你是一位遵循 'AI 小说工业化生产管理系统 (V9.0)' 的专业文学创作引擎。
你的输出必须严格遵守以下蓝图法则：
1. 世界观设定：${project.world.physicalLaws}。因果债务：${project.world.causalDebt}。
2. 题材逻辑：${project.world.genre}。冲突模型：${project.world.conflictModel}。
3. 创作音色 (AI Editing Tone): ${project.config?.aiEditingTone || 'commercial'} (风格偏向)。

核心执行细则：
- 视角锁定：严格的第三人称限制视角。
- 感官阶梯：听觉 -> 视觉轮廓 -> 嗅觉 -> 触觉。
- 创作倾向：${project.config?.aiEditingTone === 'literary' ? '增强修辞深度与心理描写。' : project.config?.aiEditingTone === 'commercial' ? '加强节奏感，快速建立悬念。' : project.config?.aiEditingTone === 'sharp' ? '用词简练、冷峻，强调逻辑动作。' : '温和、充实的叙事。'}
- 对话强化：用 [核心台词] + [逻辑/辅助说明] + [神态/肢体细节] 替换简单的对白。
- 潜台词：字面意思与真实意图之间保持 30% 的偏差。
- 动作渲染：第1层（肢体）、第2层（物理/环境）、第3层（内在感受）。
- 反 AI 滤镜：避免使用“不仅仅是”、“史无前例”、“说到底”等陈词滥调。保持叙事熵值（高词汇多样性）。
- 叙事边界：不要推进到下一个情节块。不要写模板式的总结。
- 语言要求：必须使用中文进行创作。

场景中的角色：
${charactersContext}

百科/世界知识：
${wikiContext}

当前情节概要 (Beat Specifics):
标题：${beat.title}
描述：${beat.description}
压力指数：${beat.pressureIndex}/10 (高压值 >8 会触发不可预测的变数)。

当前状态：${additionalContext}
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: "请根据上述情节和背景开始撰写章节内容。",
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.8,
      },
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    throw error;
  }
}

export async function qualityAudit(text: string) {
  const prompt = `身份：红队质量审计员。
任务：检查以下文本是否存在“AI 味”或“翻译腔”。
操作要求：
1. 识别并替换虚弱的连词。
2. 检查对话中是否存在潜台词。
3. 标记视角切换或逻辑断层。
4. 重写过于僵化的段落。
5. 必须返回中文。

待审计文本：
${text}

返回一个经过修饰的版本，使其更具文学性并消除 AI 感。`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Audit Error:", error);
    throw error;
  }
}

export async function enhanceDialogue(text: string, persona: CharacterPersona) {
  const prompt = `任务：根据以下人设强化这段对白。
人设：${persona.name}
核心特质 (Anchor)：${persona.personaAnchor}
对话风格：${persona.dialogueStyle}
强化公式：[核心台词] + [逻辑/辅助说明] + [神态/肢体细节]
必须使用中文。

源码对白：
${text}

强化后的输出：`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Enhance Error:", error);
    throw error;
  }
}

export async function continueWriting(project: NovelProject, currentText: string, context: string = "继续下文") {
  const prompt = `你是一位顶尖小说编辑。请根据以下已知内容，续写接下来的情节。
已知内容：
${currentText}

续写要求：${context}
必须保持原有的叙事风格、POV、以及角色的性格一致性。
必须使用中文。
续写长度建议在 200-500 字之间。`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        temperature: 0.9,
      }
    });
    return response.text;
  } catch (error) {
    console.error("Continue Writing Error:", error);
    throw error;
  }
}

export async function enhanceAtmosphere(text: string, mood: string) {
  const prompt = `任务：将以下文本的氛围调整为“${mood}”。
要求：
1. 通过环境描写、辞藻选择、节奏控制来强化目标氛围。
2. 保持原有情节和核心信息不变。
3. 使用“感官阶梯”描写法则。
必须使用中文。

待处理文本：
${text}

处理后的文本：`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Atmosphere Error:", error);
    throw error;
  }
}

export async function brainstormLogic(project: NovelProject, currentSceneId: string) {
  const chapter = project.chapters.find(c => c.id === currentSceneId);
  const beat = project.beats.find(b => b.id === chapter?.beatId);
  
  const prompt = `身份：创意策划咨询专家。
当前情节：${beat?.title || '未命名'} - ${beat?.description || '无描述'}
当前内容摘要：${chapter?.content.substring(0, 500) || '暂无内容'}...

请基于当前剧情，提供 3 个不同的逻辑后续建议，要求包含：
1. 冲突爆发点
2. 角色动机转变
3. 对世界观法则的运用

必须使用中文。返回一个简洁的建议列表。`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Brainstorm Error:", error);
    throw error;
  }
}

export async function brainstormCharacterArc(project: NovelProject, characterId: string) {
  const char = project.characters.find(c => c.id === characterId);
  const prompt = `身份：角色设计与编剧专家。
任务：为以下角色设计三条潜在的成长曲线或剧情弧。

角色名：${char?.name}
核心特质：${char?.personaAnchor}
核心动机：${char?.coreMotives}
对话风格：${char?.dialogueStyle}

请提供：
1. 【内部转变】：信念或缺陷的克服过程。
2. 【外部命运】：在世界观下的重大考验。
3. 【高光时刻】：展示其核心性格与世界法则互动的场景建议。

必须使用中文。`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Char Arc Brainstorm Error:", error);
    throw error;
  }
}

export async function summarizeProject(project: NovelProject) {
  const prompt = `你是一位金牌小说主编。请对以下小说项目进行全方位的工艺总结。

标题：${project.title}
世界观法则：${project.world.physicalLaws}
冲突模型：${project.world.conflictModel}
角色阵列：${project.characters.map(c => c.name).join(", ")}
主要关系网：${project.relationships.length} 条活跃链接
当前章节数：${project.chapters.length}

请提供：
1. 【创作内核】：项目的独特性与核心竞争力。
2. 【逻辑风险】：可能存在的设定冲突或剧情漏洞。
3. 【商业/艺术建议】：如何进一步强化其市场表现或文学深度。

必须使用中文。`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Project Summary Error:", error);
    throw error;
  }
}

export async function checkRelationshipInconsistencies(project: NovelProject, chapterContent: string) {
  const relationshipsContext = project.relationships
    .map(rel => {
      const source = project.characters.find(c => c.id === rel.sourceCharacterId)?.name;
      const target = project.characters.find(c => c.id === rel.targetCharacterId)?.name;
      return `[Rel ID: ${rel.id}] ${source} 和 ${target} 的关系是 ${rel.type} (分值: ${rel.score})。 背景: ${rel.description}`;
    })
    .join("\n");

  const prompt = `身份：关系逻辑审计员。
任务：审计以下章节内容，检查其是否与既定的角色关系存在冲突。
必须使用中文。

既定关系：
${relationshipsContext}

章节内容：
${chapterContent}

输出：一个包含两个键的 JSON 对象：
- inconsistencies: 一个冲突数组，每个冲突包含：
  - description: 为什么存在冲突
  - severity: 'low', 'medium', 或 'high'
  - suggestedFix: 如何调整互动。
- scoreUpdates: 一个建议的分值变动数组，每个变动包含：
  - relationshipId: 关系的 ID。
  - change: 数字 (例如 +5, -10)
  - reason: 为何产生好感或恶感。

如果没有冲突或更新，返回空数组。
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Relationship Audit Error:", error);
    return [];
  }
}

export async function executeOmniCommand(project: NovelProject, command: string) {
  const prompt = `身份：高级辅助创作引擎。
任务：根据用户的指令，对整个小说项目进行综合评估并一键执行调整。
必须使用中文进行处理。

当前项目概况：
- 世界观：${project.world.physicalLaws}
- 冲突模型：${project.world.conflictModel}
- 角色数量：${project.characters.length}
- 现有角色：${project.characters.map(c => c.name).join(", ")}
- 关系数量：${project.relationships.length}
- 章节大纲数：${project.beats.length}

用户指令：
"${command}"

请分析该指令，并生成需要执行的所有变更。
你必须返回一个符合以下格式的 JSON 对象：
{
  "reasoning": "解释你执行这些操作的创作逻辑",
  "worldUpdates": { "physicalLaws": "...", "causalDebt": "...", "genre": "...", "conflictModel": "..." }, // 仅包含变化的字段
  "newCharacters": [ { "name": "...", "personaAnchor": "...", "coreMotives": "...", "dialogueStyle": "..." } ],
  "newWikiEntries": [ { "title": "...", "type": "lore", "content": "..." } ],
  "newRelationships": [ { "sourceCharacterName": "...", "targetCharacterName": "...", "type": "...", "score": 0, "description": "..." } ],
  "newBeats": [ { "title": "...", "description": "...", "pressureIndex": 5 } ]
}

注意：
1. newRelationships 中的角色名必须与现有角色或 newCharacters 中的角色名匹配。
2. 如果某个类别没有变更，返回空数组或不包含该字段。
3. 务必保持角色和背景的逻辑一致性。
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Omni Command Error:", error);
    throw error;
  }
}
