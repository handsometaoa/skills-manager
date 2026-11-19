import { stringify } from 'yaml'

/**
 * Renders the minimal SKILL.md scaffold for 新建 Skill. The frontmatter is
 * emitted through the YAML dumper so arbitrary user text stays parseable by
 * the strict frontmatter checks in inspectSkill.
 */
export function renderSkillTemplate(name: string, description: string): string {
  const metadata = stringify({ name, description }, { lineWidth: 0 })
  return `---\n${metadata}---\n\n# ${name}\n\n## 何时使用\n\n- 触发这个 Skill 的场景一\n- 触发这个 Skill 的场景二\n\n## 工作流程\n\n1. 第一步\n2. 第二步\n\n## 注意事项\n\n- 需要提醒的约束或边界\n`
}
