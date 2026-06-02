import type { HomeExampleCategory } from "./home-example-seeds";
import { homeExampleSeedCategories } from "./home-example-seeds";

export async function loadHomeExampleCategories(): Promise<HomeExampleCategory[]> {
  return homeExampleSeedCategories;
}
