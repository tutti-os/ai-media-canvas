import type { HomeDiscoveryCategory } from "./home-discovery-seeds";
import { homeDiscoverySeedCategories } from "./home-discovery-seeds";

export async function loadHomeDiscoveryCategories(): Promise<HomeDiscoveryCategory[]> {
  return homeDiscoverySeedCategories;
}
