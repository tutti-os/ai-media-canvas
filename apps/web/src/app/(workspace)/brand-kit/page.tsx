import { notFound } from "next/navigation";

import { BrandKitPage } from "../../../components/brand-kit/brand-kit-page";
import { SHOW_BRAND_KIT_ENTRY_POINTS } from "../../../lib/feature-flags";

export default function BrandKitRoute() {
  if (!SHOW_BRAND_KIT_ENTRY_POINTS) {
    notFound();
  }

  return <BrandKitPage />;
}
