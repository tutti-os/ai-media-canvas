export type HomeDiscoveryCase = {
  id: string;
  title: string;
  coverImageUrl: string;
  authorName: string;
  authorAvatarUrl: string;
  viewCount: number;
  likeCount: number;
  prompt: string;
  sourceUrl?: string;
};

export type HomeDiscoveryCategory = {
  key: string;
  label: string;
  cases: HomeDiscoveryCase[];
};

export type HomeDiscoverySelection = HomeDiscoveryCase & {
  categoryKey: string;
  categoryLabel: string;
};

function discoveryCase(
  id: string,
  title: string,
  coverImageUrl: string,
  authorName: string,
  authorAvatarUrl: string,
  viewCount: number,
  likeCount: number,
  prompt: string,
): HomeDiscoveryCase {
  return {
    id,
    title,
    coverImageUrl,
    authorName,
    authorAvatarUrl,
    viewCount,
    likeCount,
    prompt,
  };
}

export const homeDiscoverySeedCategories: HomeDiscoveryCategory[] = [
  {
    key: "branding-design",
    label: "品牌设计",
    cases: [
      discoveryCase(
        "disc-brand-01",
        "The ART & Cultural Arts Center",
        "/images/home-seeds/cultural-arts-center.png",
        "Studio Arken",
        "/images/home-seeds/authors/studio-arken.png",
        549,
        7,
        "请基于文化艺术中心这个灵感方向，为我做一套品牌探索，输出品牌关键词、主视觉方向、海报延展和社交媒体视觉提案。",
      ),
    ],
  },
  {
    key: "poster-and-ads",
    label: "海报与广告",
    cases: [
      discoveryCase(
        "disc-poster-01",
        "Vintage Car Poster",
        "/images/home-seeds/vintage-car-poster.png",
        "Retro Workshop",
        "/images/home-seeds/authors/retro-workshop.png",
        359919,
        286,
        "请围绕复古汽车海报方向设计一组主海报、社媒方图版本和标题排版方案，整体偏胶片感和复古色调。",
      ),
    ],
  },
  {
    key: "illustration",
    label: "插画",
    cases: [
      discoveryCase(
        "disc-illustration-01",
        "Cat Tarot Cards",
        "/images/home-seeds/cat-tarot-cards.png",
        "Mochi Art",
        "/images/home-seeds/authors/mochi-art.png",
        2054,
        116,
        "参考猫咪塔罗牌这个主题，帮我扩展一套插画系列，给出角色设定、牌面视觉语言、配色建议和延展方向。",
      ),
    ],
  },
  {
    key: "ui-design",
    label: "UI设计",
    cases: [
      discoveryCase(
        "disc-ui-01",
        "Fallout-themed cake shop website",
        "/images/home-seeds/fallout-cake-shop.png",
        "Pixel Forge",
        "/images/home-seeds/authors/pixel-forge.png",
        4338,
        192,
        "请以末日废土风蛋糕店官网为灵感，帮我设计首页信息架构、首屏视觉、商品卡片样式和核心配色建议。",
      ),
    ],
  },
  {
    key: "character-design",
    label: "角色设计",
    cases: [
      discoveryCase(
        "disc-character-01",
        "My Creepy Clown Avatar",
        "/images/home-seeds/creepy-clown-avatar.png",
        "Dark Carnival",
        "/images/home-seeds/authors/dark-carnival.png",
        749,
        12,
        "请围绕诡异马戏团角色做一套角色设计，包含角色设定、表情变化、服装元素和场景氛围建议。",
      ),
    ],
  },
  {
    key: "storyboard-video",
    label: "影片与分镜",
    cases: [
      discoveryCase(
        "disc-story-01",
        "Mixtapes Emotions!",
        "/images/home-seeds/mixtapes-emotions.png",
        "Frame Studio",
        "/images/home-seeds/authors/frame-studio.png",
        3057,
        49,
        "基于音乐情绪短片这个方向，帮我做一组 15 到 30 秒分镜，拆出镜头节奏、情绪转场、标题卡和视觉风格建议。",
      ),
    ],
  },
  {
    key: "product-design",
    label: "产品设计",
    cases: [
      discoveryCase(
        "disc-product-01",
        "Product Visualization - Robot Hand",
        "/images/home-seeds/robot-hand-product-visualization.png",
        "Future Lab",
        "/images/home-seeds/authors/future-lab.png",
        769,
        27,
        "围绕机器人机械手产品视觉，帮我设计主视觉构图、材质方向、电商展示图和卖点表达方式。",
      ),
    ],
  },
  {
    key: "architecture-design",
    label: "建筑设计",
    cases: [
      discoveryCase(
        "disc-architecture-01",
        "Building a new website and learning AI",
        "/images/home-seeds/architecture-studio-website.png",
        "Arc Design",
        "/images/home-seeds/authors/arc-design.png",
        1453,
        24,
        "请以建筑工作室网站概念为起点，设计网站结构、首页视觉、项目展示模块和整体建筑感风格建议。",
      ),
    ],
  },
];
