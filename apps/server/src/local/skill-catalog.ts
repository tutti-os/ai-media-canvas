import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { SkillCategory } from "@aimc/shared";

export type BundledSkillDefinition = {
  id: string;
  name: string;
  slug: string;
  description: string;
  author: string;
  version: string;
  category: SkillCategory;
  iconName: string | null;
  source: "system";
  isFeatured: boolean;
  license: string | null;
  skillContent: string;
  createdBy: string | null;
  sourceUrl: string | null;
  packageName: string | null;
  metadata?: Record<string, unknown>;
  installedByDefault?: boolean;
};

const DEFAULT_LOCAL_SKILLS_ROOT = fileURLToPath(
  new URL("../../../../skills/", import.meta.url),
);
const DEFAULT_INSTALLED_LOCAL_SKILLS = new Set(["imagegen", "video-prompting"]);

let bundledSkillCache: BundledSkillDefinition[] | null = null;

type SkillFrontmatter = {
  name?: string;
  description?: string;
  license?: string;
  author?: string;
  version?: string;
  metadata: Record<string, string>;
} & Record<string, string | Record<string, string> | undefined>;

function skillTemplate(
  title: string,
  description: string,
  instructions: string[],
  examples: string[],
) {
  return [
    `# ${title}`,
    "",
    "## Description",
    description,
    "",
    "## Instructions",
    ...instructions.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## Examples",
    ...examples,
    "",
    "## Constraints",
    "- Stay grounded in the current canvas and project context.",
    "- Prefer local files, local brand assets, and installed skills over remote services.",
  ].join("\n");
}

const CURATED_BUNDLED_SKILLS: BundledSkillDefinition[] = [
  {
    id: "skill-system-canvas-director",
    name: "Canvas Director",
    slug: "canvas-director",
    description:
      "Helps the agent reason about canvas structure, shot order, and layout hierarchy before suggesting next actions.",
    author: "AI Canvas",
    version: "1.0.0",
    category: "design",
    iconName: null,
    source: "system",
    isFeatured: true,
    license: "MIT",
    installedByDefault: true,
    skillContent: skillTemplate(
      "Canvas Director",
      "Use this skill only when the user explicitly wants layout, composition, hierarchy, or layered editing directly on the canvas.",
      [
        "Summarize the current canvas goal before proposing changes.",
        "Do not use this skill as a reason to fake a final polished image by assembling many canvas elements when a single generate_image call would satisfy the request.",
        "If the user wants a final polished visual deliverable, prefer generating the full image first instead of building a faux image effect by composing many canvas elements.",
        "Treat manipulate_canvas as a direct canvas editing tool, mainly for positioning, alignment, and small local edits unless the user explicitly asks for layered canvas construction.",
        "Inspect the real element bounds before any layout pass; use actual element IDs, x/y coordinates, widths, heights, and bounding boxes instead of assumed grid positions.",
        "Do not add decorative labels, dividers, badges, buttons, or detail text around generated media unless the user explicitly asks for editable layered layout.",
        "For layout work, state the intended grid, spacing, and alignment before calling manipulate_canvas; prefer move, align, and distribute over adding new text or shapes.",
        "After adding three or more elements, use screenshot_canvas to verify the result and correct obvious overlap, drift, or orphaned labels before responding.",
        "Break recommendations into structure, emphasis, and finishing passes.",
        "When relevant, connect the suggestion back to Brand Kit assets already available locally.",
      ],
      [
        "User: Turn this canvas into a three-column information architecture.",
        "Agent: First outline the structure, then explain what content belongs in each column.",
      ],
    ),
    createdBy: "AI Canvas",
    sourceUrl: null,
    packageName: "@aimc/canvas-director",
    metadata: { scope: "bundled", tags: ["layout", "hierarchy"] },
  },
  {
    id: "skill-system-brand-keeper",
    name: "Brand Keeper",
    slug: "brand-keeper",
    description:
      "Guides the agent to reference local Brand Kit fonts, colors, and logo assets when making recommendations.",
    author: "AI Canvas",
    version: "1.0.0",
    category: "writing",
    iconName: null,
    source: "system",
    isFeatured: true,
    license: "MIT",
    skillContent: skillTemplate(
      "Brand Keeper",
      "Use this skill when the user asks for copy, art direction, or visual consistency across a project.",
      [
        "Check whether the project already has a brand kit bound to it.",
        "Prefer brand colors, brand typography, and named assets in the response.",
        "Call out missing brand inputs instead of inventing them.",
      ],
      [
        "User: Make the title voice consistent across this project.",
        "Agent: First describe the current brand tone, then suggest a title style.",
      ],
    ),
    createdBy: "AI Canvas",
    sourceUrl: null,
    packageName: "@aimc/brand-keeper",
    metadata: { scope: "bundled", tags: ["brand", "tone"] },
  },
  {
    id: "skill-system-prompt-polisher",
    name: "Prompt Polisher",
    slug: "prompt-polisher",
    description:
      "Turns vague requests into structured prompts suited for the local image generation panel.",
    author: "AI Canvas",
    version: "1.0.0",
    category: "generation",
    iconName: null,
    source: "system",
    isFeatured: false,
    license: "MIT",
    skillContent: skillTemplate(
      "Prompt Polisher",
      "Use this skill when a user has an idea for image generation but the prompt is vague or underspecified.",
      [
        "Extract subject, style, composition, color, and output intent.",
        "Return prompts that are concise but still production-ready.",
        "Point out where reference images or brand constraints would improve the result.",
      ],
      [
        "User: I want a more premium-looking poster image.",
        "Agent: First fill in style, scene, and title mood, then provide a prompt ready for generation.",
      ],
    ),
    createdBy: "AI Canvas",
    sourceUrl: null,
    packageName: "@aimc/prompt-polisher",
    metadata: { scope: "bundled", tags: ["prompt", "image"] },
  },
];

export function getBundledSkills() {
  if (bundledSkillCache) {
    return bundledSkillCache;
  }

  bundledSkillCache = mergeBundledSkills(
    CURATED_BUNDLED_SKILLS,
    loadDirectoryBundledSkills(),
  );
  return bundledSkillCache;
}

function mergeBundledSkills(...groups: BundledSkillDefinition[][]) {
  const merged = new Map<string, BundledSkillDefinition>();
  for (const group of groups) {
    for (const skill of group) {
      merged.set(skill.id, skill);
    }
  }
  return Array.from(merged.values());
}

function loadDirectoryBundledSkills(): BundledSkillDefinition[] {
  const localSkillsRoot = resolveLocalSkillsRoot();
  if (!existsSync(localSkillsRoot)) {
    return [];
  }

  const entries = readdirSync(localSkillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const slug = entry.name;
      const skillFile = join(localSkillsRoot, slug, "SKILL.md");
      if (!existsSync(skillFile)) {
        return [];
      }

      const fileManifest = collectLocalSkillFiles(join(localSkillsRoot, slug));
      const skillContent = readFileSync(skillFile, "utf8");
      const { frontmatter, body } = parseFrontmatter(skillContent);
      const name = resolveDisplayName(frontmatter.name, body, slug);
      const description =
        frontmatter.description ??
        extractSection(body, "Description") ??
        "Local bundled skill";
      const author =
        frontmatter.metadata.author ?? frontmatter.author ?? "AI Canvas";
      const version =
        frontmatter.metadata.version ?? frontmatter.version ?? "1.0.0";

      return [
        {
          id: `skill-local-${slug}`,
          name,
          slug,
          description,
          author,
          version,
          category: inferCategory(slug, description, body),
          iconName: null,
          source: "system" as const,
          isFeatured: true,
          license: frontmatter.license ?? null,
          skillContent,
          createdBy: author,
          sourceUrl: null,
          packageName: null,
          metadata: {
            scope: "local-directory",
            path: `skills/${slug}/SKILL.md`,
            files: fileManifest,
          },
          installedByDefault: DEFAULT_INSTALLED_LOCAL_SKILLS.has(slug),
        },
      ];
    });

  return entries;
}

function resolveLocalSkillsRoot() {
  return process.env.AIMC_SKILLS_ROOT?.trim() || DEFAULT_LOCAL_SKILLS_ROOT;
}

function parseFrontmatter(markdown: string) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { frontmatter: emptyFrontmatter(), body: markdown };
  }

  const frontmatter = emptyFrontmatter();
  let inMetadata = false;

  for (const rawLine of (match[1] ?? "").split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line.trim()) {
      continue;
    }

    if (/^\S/.test(line)) {
      inMetadata = false;
    }

    if (line.startsWith("metadata:")) {
      inMetadata = true;
      continue;
    }

    const metadataMatch = inMetadata
      ? line.match(/^\s+([A-Za-z0-9_-]+):\s*(.+)?$/)
      : null;
    if (metadataMatch) {
      const metadataKey = metadataMatch[1];
      if (metadataKey) {
        frontmatter.metadata[metadataKey] = stripYamlValue(metadataMatch[2]);
      }
      continue;
    }

    const keyValueMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.+)?$/);
    if (!keyValueMatch) {
      continue;
    }

    const [, key, rawValue] = keyValueMatch;
    if (!key) {
      continue;
    }
    const value = stripYamlValue(rawValue);
    if (key === "name" || key === "description" || key === "license") {
      frontmatter[key] = value;
      continue;
    }
    frontmatter[key] = value;
  }

  return {
    frontmatter,
    body: markdown.slice(match[0].length),
  };
}

function emptyFrontmatter() {
  return { metadata: {} } as SkillFrontmatter;
}

function stripYamlValue(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.replace(/^['"]|['"]$/g, "");
}

function resolveDisplayName(
  frontmatterName: string | undefined,
  body: string,
  slug: string,
) {
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) {
    return heading.replace(/\s+Skill$/i, "");
  }
  if (frontmatterName) {
    return toTitleCase(frontmatterName);
  }
  return toTitleCase(slug);
}

function extractSection(markdown: string, heading: string) {
  const regex = new RegExp(
    `##\\s+${heading}\\s+([\\s\\S]*?)(?:\\n##\\s+|$)`,
    "i",
  );
  const match = markdown.match(regex);
  return match?.[1]?.trim() ?? null;
}

function inferCategory(
  slug: string,
  description: string,
  body: string,
): SkillCategory {
  const haystack = `${slug} ${description} ${body}`.toLowerCase();
  if (
    haystack.includes("design") ||
    haystack.includes("canvas") ||
    haystack.includes("poster")
  ) {
    return "design";
  }
  if (
    haystack.includes("image") ||
    haystack.includes("generate") ||
    haystack.includes("prompt") ||
    haystack.includes("visual")
  ) {
    return "generation";
  }
  if (haystack.includes("code") || haystack.includes("python")) {
    return "code";
  }
  if (haystack.includes("data") || haystack.includes("json")) {
    return "data";
  }
  if (haystack.includes("write") || haystack.includes("copy")) {
    return "writing";
  }
  return "custom";
}

function collectLocalSkillFiles(root: string, prefix = ""): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(root, entry.name);
    if (entry.isDirectory()) {
      return collectLocalSkillFiles(absolutePath, relativePath);
    }
    return [relativePath];
  });
}

function toTitleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
