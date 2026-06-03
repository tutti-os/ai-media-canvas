import { createInputImage } from "./home-seed-media";

export type InputMention = {
  type: "image" | "tool";
  name: string;
  imgSrc: string;
};

export type HomeExampleCard = {
  title: string;
  prompt: string;
  previewImages: string[];
  inputMentions: InputMention[];
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
  title: string;
  prompt: string;
  previewImages: string[];
  inputMentions: InputMention[];
};

function example(
  title: string,
  prompt: string,
  previewImages: string[],
  inputMentions: InputMention[],
): HomeExampleCard {
  return { title, prompt, previewImages, inputMentions };
}

function generatedImage(name: string, file: string): InputMention {
  return {
    type: "image",
    name,
    imgSrc: `/images/home-seeds/generated/${file}`,
  };
}

function tool(name: string, accent = "#1d4ed8"): InputMention {
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
        "Turn a selfie into a magazine cover",
        "请把这张自拍扩展成时尚杂志封面方案，保留人物神态，补齐封面主标题、副标题、配色和版式层级，整体更高级、更 editorial。",
        previews(
          "nano-magazine-cover.png",
          "nano-magazine-cover-2.png",
          "nano-magazine-cover-3.png",
        ),
        [
          tool("Prompt Polisher", "#ec4899"),
          generatedImage("Selfie", "input-selfie-source.png"),
        ],
      ),
      example(
        "Make a classic superhero comic strip",
        "请把这个创意拆成复古超级英雄漫画页面，包含 4 到 6 格分镜、对白气泡、旁白框和统一人物动作，整体要有 70 年代漫画纸感。",
        previews(
          "nano-superhero-comic.png",
          "nano-superhero-comic-2.png",
          "nano-superhero-comic-3.png",
        ),
        [tool("Canvas Director", "#2563eb")],
      ),
      example(
        "Generate professional engineering drawings",
        "请把这个产品概念变成一套专业工程蓝图视觉，输出主视图、等轴图、关键尺寸标注和注释层级，适合给研发或打样沟通。",
        previews(
          "nano-engineering-blueprint.png",
          "nano-engineering-blueprint-2.png",
          "nano-engineering-blueprint-3.png",
        ),
        [
          tool("Canvas Design", "#0ea5e9"),
          generatedImage("Object", "input-object-source.png"),
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
        "Expand a cat tarot card series",
        "请围绕猫咪塔罗牌扩展一套插画系列，补齐角色设定、牌面视觉语言、边框系统和周边延展建议。",
        previews(
          "illustration-cat-tarot.png",
          "illustration-cat-tarot-2.png",
          "illustration-cat-tarot-3.png",
        ),
        [tool("Prompt Polisher", "#8b5cf6")],
      ),
      example(
        "Illustrate a dreamy seaside story",
        "请把一个海边奇遇故事画成梦幻插画，强调色彩氛围、光影层次和封面标题位置。",
        previews(
          "illustration-seaside-story.png",
          "illustration-seaside-story-2.png",
          "illustration-seaside-story-3.png",
        ),
        [tool("Canvas Design", "#0ea5e9")],
      ),
      example(
        "Create a playful character poster",
        "请做一张角色海报，把人物设定、色彩性格和辅助道具统一起来，适合潮流玩具品牌介绍页。",
        previews(
          "illustration-playful-character.png",
          "illustration-playful-character-2.png",
          "illustration-playful-character-3.png",
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
        "Design a Bauhaus-inspired poster",
        "请为音乐节设计一张 Bauhaus 风格海报，使用几何形、强节奏排版和有限色板，并附带移动端竖版延展建议。",
        previews(
          "design-bauhaus-poster.png",
          "design-bauhaus-poster-2.png",
          "design-bauhaus-poster-3.png",
        ),
        [tool("Canvas Design", "#f97316")],
      ),
      example(
        "Design a ceramic dinnerware set",
        "请围绕北欧极简与侘寂气质，做一组陶瓷器皿视觉提案，包含碗、盘、杯的统一造型语言和产品展示图方向。",
        previews(
          "design-ceramic-dinnerware.png",
          "design-ceramic-dinnerware-2.png",
          "design-ceramic-dinnerware-3.png",
        ),
        [tool("Canvas Director", "#8b5cf6")],
      ),
      example(
        "Experiment with furniture design",
        "请围绕一把雕塑感橙色天鹅绒单椅，输出家具概念海报、材质细节特写和电商主图方向。",
        previews(
          "design-velvet-chair.png",
          "design-velvet-chair-2.png",
          "design-velvet-chair-3.png",
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
        "Generate logo options",
        "请为寿司品牌做一组极简 Logo 探索，输出 3 个方向、颜色建议、应用场景和品牌语气差异。",
        previews(
          "branding-sushi-logo-board.png",
          "branding-sushi-logo-board-2.png",
          "branding-sushi-logo-board-3.png",
        ),
        [tool("Brand Keeper", "#14b8a6")],
      ),
      example(
        "Design branded merch for your coffee shop",
        "请把这个咖啡品牌延展到杯子、纸袋和社媒头像，保持高端但亲和的品牌感，并给出 mockup 构图方向。",
        previews(
          "branding-coffee-merch.png",
          "branding-coffee-merch-2.png",
          "branding-coffee-merch-3.png",
        ),
        [
          tool("Brand Keeper", "#a16207"),
          generatedImage("Logo", "input-logo-coffee.png"),
        ],
      ),
      example(
        "Put your logo on a cap",
        "请做一张帽子品牌周边 mockup，重点表现 Logo 刺绣、材质触感和潮流感，适合官网商品页首图。",
        previews(
          "branding-cap-logo.png",
          "branding-cap-logo-2.png",
          "branding-cap-logo-3.png",
        ),
        [
          tool("Brand Keeper", "#2563eb"),
          generatedImage("Logo", "input-logo-cap.png"),
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
        "Design a fintech dashboard hero",
        "请给我一个金融产品首页首屏方案，突出数据可信感、行动按钮层级和卡片式指标布局。",
        previews(
          "ui-fintech-dashboard.png",
          "ui-fintech-dashboard-2.png",
          "ui-fintech-dashboard-3.png",
        ),
        [tool("Canvas Director", "#2563eb")],
      ),
      example(
        "Create a cake shop landing page",
        "请为末日废土风蛋糕店设计首页，输出首屏视觉、商品卡片和 CTA 样式，整体既怪诞又有趣。",
        previews(
          "ui-fallout-cake-shop.png",
          "ui-fallout-cake-shop-2.png",
          "ui-fallout-cake-shop-3.png",
        ),
        [tool("Canvas Director", "#dc2626")],
      ),
      example(
        "Build an AI product waitlist page",
        "请设计一个 AI 产品 waitlist 页面，强调未来感、可信感和转化路径，适合 desktop 与移动端首屏适配。",
        previews(
          "ui-ai-waitlist.png",
          "ui-ai-waitlist-2.png",
          "ui-ai-waitlist-3.png",
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
        "Plan a 6-frame product teaser",
        "请帮我拆一个 6 镜头产品 teaser 分镜，重点是节奏起伏、转场方式和最后的标题卡落点。",
        previews(
          "storyboard-product-teaser.png",
          "storyboard-product-teaser-2.png",
          "storyboard-product-teaser-3.png",
        ),
        [
          tool("Storyboard Motion", "#14b8a6"),
          generatedImage("Reference", "storyboard-product-teaser.png"),
        ],
      ),
      example(
        "Build a music teaser sequence",
        "请为 15 秒音乐 teaser 规划镜头顺序、情绪节奏、字幕节拍和结尾 logo 出现方式。",
        previews(
          "storyboard-music-teaser.png",
          "storyboard-music-teaser-2.png",
          "storyboard-music-teaser-3.png",
        ),
        [tool("Shot Sequencer", "#8b5cf6")],
      ),
      example(
        "Create a comic-style sequence",
        "请把一个动作创意拆成漫画式连续分镜，保持统一角色动作关系，并且适合后续转成短视频 animatic。",
        previews(
          "storyboard-comic-sequence.png",
          "storyboard-comic-sequence-2.png",
          "storyboard-comic-sequence-3.png",
        ),
        [
          tool("Storyboard Motion", "#2563eb"),
          tool("Canvas Director", "#22c55e"),
        ],
      ),
    ],
  },
];
