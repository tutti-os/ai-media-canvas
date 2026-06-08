import brandKitEn from "./locales/en/brandKit.json";
import canvasEn from "./locales/en/canvas.json";
import chatEn from "./locales/en/chat.json";
import commonEn from "./locales/en/common.json";
import errorsEn from "./locales/en/errors.json";
import generationEn from "./locales/en/generation.json";
import homeEn from "./locales/en/home.json";
import navigationEn from "./locales/en/navigation.json";
import projectsEn from "./locales/en/projects.json";
import settingsEn from "./locales/en/settings.json";
import skillsEn from "./locales/en/skills.json";
import brandKitZhCN from "./locales/zh-CN/brandKit.json";
import canvasZhCN from "./locales/zh-CN/canvas.json";
import chatZhCN from "./locales/zh-CN/chat.json";
import commonZhCN from "./locales/zh-CN/common.json";
import errorsZhCN from "./locales/zh-CN/errors.json";
import generationZhCN from "./locales/zh-CN/generation.json";
import homeZhCN from "./locales/zh-CN/home.json";
import navigationZhCN from "./locales/zh-CN/navigation.json";
import projectsZhCN from "./locales/zh-CN/projects.json";
import settingsZhCN from "./locales/zh-CN/settings.json";
import skillsZhCN from "./locales/zh-CN/skills.json";

export const namespaces = [
  "common",
  "navigation",
  "home",
  "projects",
  "canvas",
  "chat",
  "generation",
  "settings",
  "skills",
  "brandKit",
  "errors",
] as const;

export const defaultNamespace = "common";

export const resources = {
  "zh-CN": {
    brandKit: brandKitZhCN,
    canvas: canvasZhCN,
    chat: chatZhCN,
    common: commonZhCN,
    errors: errorsZhCN,
    generation: generationZhCN,
    home: homeZhCN,
    navigation: navigationZhCN,
    projects: projectsZhCN,
    settings: settingsZhCN,
    skills: skillsZhCN,
  },
  en: {
    brandKit: brandKitEn,
    canvas: canvasEn,
    chat: chatEn,
    common: commonEn,
    errors: errorsEn,
    generation: generationEn,
    home: homeEn,
    navigation: navigationEn,
    projects: projectsEn,
    settings: settingsEn,
    skills: skillsEn,
  },
} as const;

export type AppNamespace = (typeof namespaces)[number];
