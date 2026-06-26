import { createInputImage } from "./home-seed-media";

export type SeedInputItem = {
  type: "image" | "tool";
  name: string;
  imgSrc: string;
};

export type HomeExampleCard = {
  id: string;
  title: string;
  prompt: string;
  previewImages: string[];
  inputItems: SeedInputItem[];
};

export type HomeExampleCategory = {
  key: string;
  label: string;
  dataType: string;
  accent?: "special";
  examples: HomeExampleCard[];
};

export type HomeExampleSelection = {
  categoryKey: string;
  categoryLabel: string;
  exampleId: string;
  title: string;
  prompt: string;
  previewImages: string[];
  inputItems: SeedInputItem[];
};

function example(
  id: string,
  title: string,
  prompt: string,
  previewImages: string[],
  inputItems: SeedInputItem[],
): HomeExampleCard {
  return { id, title, prompt, previewImages, inputItems };
}

function generatedImage(name: string, file: string): SeedInputItem {
  return {
    type: "image",
    name,
    imgSrc: `/images/home-seeds/generated/${file}`,
  };
}

function tool(name: string, accent = "#1d4ed8"): SeedInputItem {
  return { type: "tool", name, imgSrc: createInputImage(name, accent) };
}

function previews(...files: [string, string, string]) {
  return files.map((file) => `/images/home-seeds/generated/${file}`);
}

export const homeExampleSeedCategories: HomeExampleCategory[] = [
  {
    key: "visual-concepts",
    label: "Visual Concepts",
    dataType: "Image",
    accent: "special",
    examples: [
      example(
        "visual-magazine-cover",
        "Turn a selfie into a magazine cover",
        "请把这张自拍扩展成时尚杂志封面方案，保留人物神态，补齐封面主标题、副标题、配色和版式层级，整体更高级、更 editorial。",
        previews(
          "nano-magazine-cover.webp",
          "nano-magazine-cover-2.webp",
          "nano-magazine-cover-3.webp",
        ),
        [
          tool("Prompt Polisher", "#ec4899"),
          generatedImage("Selfie", "input-selfie-source.webp"),
        ],
      ),
      example(
        "visual-superhero-comic",
        "Make a classic superhero comic strip",
        "请设计一页复古超级英雄漫画：原创城市英雄在夜晚街区救援，包含 4 到 6 格分镜、对白气泡、旁白框、动作线和统一人物动作，整体要有 70 年代漫画纸感。",
        previews(
          "nano-superhero-comic.webp",
          "nano-superhero-comic-2.webp",
          "nano-superhero-comic-3.webp",
        ),
        [tool("Canvas Director", "#2563eb")],
      ),
      example(
        "visual-engineering-drawings",
        "Generate professional engineering drawings",
        "请把这个产品概念变成一套专业工程蓝图视觉，输出主视图、等轴图、关键尺寸标注和注释层级，适合给研发或打样沟通。",
        previews(
          "nano-engineering-blueprint.webp",
          "nano-engineering-blueprint-2.webp",
          "nano-engineering-blueprint-3.webp",
        ),
        [
          tool("Canvas Design", "#0ea5e9"),
          generatedImage("Object", "input-object-source.webp"),
        ],
      ),
    ],
  },
  {
    key: "illustration",
    label: "Illustration",
    dataType: "Illustration",
    examples: [
      example(
        "illustration-cat-tarot",
        "Expand a cat tarot card series",
        "请围绕猫咪塔罗牌扩展一套插画系列，补齐角色设定、牌面视觉语言、边框系统和周边延展建议。",
        previews(
          "illustration-cat-tarot.webp",
          "illustration-cat-tarot-2.webp",
          "illustration-cat-tarot-3.webp",
        ),
        [tool("Prompt Polisher", "#8b5cf6")],
      ),
      example(
        "illustration-seaside-story",
        "Illustrate a dreamy seaside story",
        "请把一个海边奇遇故事画成梦幻插画，强调色彩氛围、光影层次和封面标题位置。",
        previews(
          "illustration-seaside-story.webp",
          "illustration-seaside-story-2.webp",
          "illustration-seaside-story-3.webp",
        ),
        [tool("Canvas Design", "#0ea5e9")],
      ),
      example(
        "illustration-character-poster",
        "Create a playful character poster",
        "请做一张角色海报，把人物设定、色彩性格和辅助道具统一起来，适合潮流玩具品牌介绍页。",
        previews(
          "illustration-playful-character.webp",
          "illustration-playful-character-2.webp",
          "illustration-playful-character-3.webp",
        ),
        [tool("Canvas Director", "#ec4899")],
      ),
    ],
  },
  {
    key: "design",
    label: "Design",
    dataType: "Poster",
    examples: [
      example(
        "design-bauhaus-poster",
        "Design a Bauhaus-inspired poster",
        "请为音乐节设计一张 Bauhaus 风格海报，使用几何形、强节奏排版和有限色板，并附带移动端竖版延展建议。",
        previews(
          "design-bauhaus-poster.webp",
          "design-bauhaus-poster-2.webp",
          "design-bauhaus-poster-3.webp",
        ),
        [tool("Canvas Design", "#f97316")],
      ),
      example(
        "design-ceramic-dinnerware",
        "Design a ceramic dinnerware set",
        "请围绕北欧极简与侘寂气质，做一组陶瓷器皿视觉提案，包含碗、盘、杯的统一造型语言和产品展示图方向。",
        previews(
          "design-ceramic-dinnerware.webp",
          "design-ceramic-dinnerware-2.webp",
          "design-ceramic-dinnerware-3.webp",
        ),
        [tool("Canvas Director", "#8b5cf6")],
      ),
      example(
        "design-furniture",
        "Experiment with furniture design",
        "请围绕一把雕塑感橙色天鹅绒单椅，输出家具概念海报、材质细节特写和电商主图方向。",
        previews(
          "design-velvet-chair.webp",
          "design-velvet-chair-2.webp",
          "design-velvet-chair-3.webp",
        ),
        [tool("Canvas Design", "#ea580c")],
      ),
    ],
  },
  {
    key: "branding",
    label: "Branding",
    dataType: "Identity",
    examples: [
      example(
        "branding-logo-options",
        "Generate logo options",
        "请为寿司品牌做一组极简 Logo 探索，输出 3 个方向、颜色建议、应用场景和品牌语气差异。",
        previews(
          "branding-sushi-logo-board.webp",
          "branding-sushi-logo-board-2.webp",
          "branding-sushi-logo-board-3.webp",
        ),
        [tool("Brand Keeper", "#14b8a6")],
      ),
      example(
        "branding-coffee-merch",
        "Design branded merch for your coffee shop",
        "请把这个咖啡品牌延展到杯子、纸袋和社媒头像，保持高端但亲和的品牌感，并给出 mockup 构图方向。",
        previews(
          "branding-coffee-merch.webp",
          "branding-coffee-merch-2.webp",
          "branding-coffee-merch-3.webp",
        ),
        [
          tool("Brand Keeper", "#a16207"),
          generatedImage("Logo", "input-logo-coffee.webp"),
        ],
      ),
      example(
        "branding-cap-logo",
        "Put your logo on a cap",
        "请做一张帽子品牌周边 mockup，重点表现 Logo 刺绣、材质触感和潮流感，适合官网商品页首图。",
        previews(
          "branding-cap-logo.webp",
          "branding-cap-logo-2.webp",
          "branding-cap-logo-3.webp",
        ),
        [
          tool("Brand Keeper", "#2563eb"),
          generatedImage("Logo", "input-logo-cap.webp"),
        ],
      ),
    ],
  },
  {
    key: "ui-design",
    label: "UI Design",
    dataType: "UI",
    examples: [
      example(
        "ui-fintech-dashboard",
        "Design a fintech dashboard hero",
        "请给我一个金融产品首页首屏方案，突出数据可信感、行动按钮层级和卡片式指标布局。",
        previews(
          "ui-fintech-dashboard.webp",
          "ui-fintech-dashboard-2.webp",
          "ui-fintech-dashboard-3.webp",
        ),
        [tool("Canvas Director", "#2563eb")],
      ),
      example(
        "ui-cake-shop",
        "Create a cake shop landing page",
        "请为末日废土风蛋糕店设计首页，输出首屏视觉、商品卡片和 CTA 样式，整体既怪诞又有趣。",
        previews(
          "ui-fallout-cake-shop.webp",
          "ui-fallout-cake-shop-2.webp",
          "ui-fallout-cake-shop-3.webp",
        ),
        [tool("Canvas Director", "#dc2626")],
      ),
      example(
        "ui-ai-waitlist",
        "Build an AI product waitlist page",
        "请设计一个 AI 产品 waitlist 页面，强调未来感、可信感和转化路径，适合 desktop 与移动端首屏适配。",
        previews(
          "ui-ai-waitlist.webp",
          "ui-ai-waitlist-2.webp",
          "ui-ai-waitlist-3.webp",
        ),
        [tool("Prompt Polisher", "#8b5cf6")],
      ),
    ],
  },
  {
    key: "storyboard-video",
    label: "Storyboard",
    dataType: "Video",
    examples: [
      example(
        "storyboard-product-teaser",
        "Plan a 6-frame product teaser",
        "请帮我拆一个 6 镜头产品 teaser 分镜，重点是节奏起伏、转场方式和最后的标题卡落点。",
        previews(
          "storyboard-product-teaser.webp",
          "storyboard-product-teaser-2.webp",
          "storyboard-product-teaser-3.webp",
        ),
        [
          tool("Storyboard Motion", "#14b8a6"),
          generatedImage("Reference", "storyboard-product-teaser.webp"),
        ],
      ),
      example(
        "storyboard-music-teaser",
        "Build a music teaser sequence",
        "请为 15 秒音乐 teaser 规划镜头顺序、情绪节奏、字幕节拍和结尾 logo 出现方式。",
        previews(
          "storyboard-music-teaser.webp",
          "storyboard-music-teaser-2.webp",
          "storyboard-music-teaser-3.webp",
        ),
        [tool("Shot Sequencer", "#8b5cf6")],
      ),
      example(
        "storyboard-comic-sequence",
        "Create a comic-style sequence",
        "请把原创角色在雨夜屋顶追逐并跃过霓虹招牌的动作场景拆成漫画式连续分镜，保持统一角色动作关系，并且适合后续转成短视频 animatic。",
        previews(
          "storyboard-comic-sequence.webp",
          "storyboard-comic-sequence-2.webp",
          "storyboard-comic-sequence-3.webp",
        ),
        [
          tool("Storyboard Motion", "#2563eb"),
          tool("Canvas Director", "#22c55e"),
        ],
      ),
    ],
  },
];
