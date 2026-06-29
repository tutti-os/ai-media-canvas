"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { AimcLogo } from "@/components/icons/aimc-logo";
import { SidebarSettingsMenu } from "@/components/sidebar-settings-menu";
import { useAppTranslation } from "@/i18n";
import { SHOW_BRAND_KIT_ENTRY_POINTS } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Nav item definitions
// ---------------------------------------------------------------------------

interface NavItem {
  href: string;
  labelKey: string;
  /** SVG path `d` attribute */
  icon: string;
  /** viewBox dimensions (square), e.g. 20 -> "0 0 20 20" */
  viewBox: number;
}

const TOP_NAV_ITEMS: NavItem[] = [
  {
    href: "/home",
    labelKey: "home",
    viewBox: 20,
    icon: "M10.707 2.293a1 1 0 0 0-1.414 0l-6 6A1 1 0 0 0 3 9v7a2 2 0 0 0 2 2h3.5a.5.5 0 0 0 .5-.5V13a1 1 0 0 1 1-1h0a1 1 0 0 1 1 1v4.5a.5.5 0 0 0 .5.5H15a2 2 0 0 0 2-2V9a1 1 0 0 0-.293-.707z",
  },
  {
    href: "/projects",
    labelKey: "projects",
    viewBox: 20,
    icon: "M8.968 2.004c.69.038 1.337.361 1.782.895l1 1.201c.138.166.335.27.548.294l.092.006h3.087A2.523 2.523 0 0 1 18 6.923v8.554l-.013.258a2.524 2.524 0 0 1-2.252 2.252l-.258.013H4.522a2.524 2.524 0 0 1-2.51-2.265L2 15.477V4.522A2.523 2.523 0 0 1 4.522 2H8.83zM3.3 15.477c0 .675.547 1.223 1.222 1.223h10.955c.675 0 1.223-.548 1.223-1.223V9.4H3.3zM4.522 3.3c-.674 0-1.222.547-1.222 1.222V8.1h13.4V6.923c0-.675-.547-1.223-1.223-1.223H12.39a2.14 2.14 0 0 1-1.64-.768l-1-1.2A1.2 1.2 0 0 0 8.83 3.3z",
  },
  {
    href: "/brand-kit",
    labelKey: "brandKit",
    viewBox: 18,
    icon: "M6.938 1.5c.545 0 1.056.156 1.488.426a2.8 2.8 0 0 1 1.5.375l2.273 1.312c.473.273.837.663 1.076 1.113.45.239.84.603 1.112 1.075L15.7 8.074a2.81 2.81 0 0 1-1.03 3.842l-6.966 4.021A4.125 4.125 0 0 1 1.5 12.376V4.313A2.813 2.813 0 0 1 4.313 1.5zm-.563 10.875a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0m7.175-5.774a2.8 2.8 0 0 1-.321.854l-3.46 5.99 4.339-2.503a1.69 1.69 0 0 0 .617-2.305zM7.5 12.375a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0m-4.875 0a3 3 0 1 0 6 0V4.313a1.684 1.684 0 0 0-1.687-1.688H4.313c-.932 0-1.688.756-1.688 1.688zm7.125-1.144 2.505-4.338a1.685 1.685 0 0 0-.618-2.306L9.6 3.412c.096.283.149.585.149.9z",
  },
  {
    href: "/skills",
    labelKey: "skills",
    viewBox: 20,
    icon: "M10 2a1 1 0 0 1 .894.553l1.18 2.39 2.638.384a1 1 0 0 1 .554 1.706l-1.91 1.86.451 2.628a1 1 0 0 1-1.451 1.054L10 11.336l-2.356 1.239a1 1 0 0 1-1.45-1.054l.45-2.628-1.91-1.86a1 1 0 0 1 .555-1.706l2.638-.384 1.18-2.39A1 1 0 0 1 10 2z",
  },
];

const VISIBLE_TOP_NAV_ITEMS = TOP_NAV_ITEMS.filter(
  (item) => SHOW_BRAND_KIT_ENTRY_POINTS || item.href !== "/brand-kit",
);

// ---------------------------------------------------------------------------
// Reusable nav-button with active indicator
// Touch target: min 44px on mobile, 36px on desktop (md+)
// ---------------------------------------------------------------------------

function NavButton({
  item,
  active,
  label,
}: {
  item: NavItem;
  active: boolean;
  label: string;
}) {
  const vb = `0 0 ${item.viewBox} ${item.viewBox}`;
  const tooltipId = `sidebar-tooltip-${item.href.replace("/", "") || "home"}`;
  const [tooltipVisible, setTooltipVisible] = useState(false);

  return (
    <Link
      href={item.href}
      aria-label={label}
      aria-describedby={tooltipId}
      onBlur={() => setTooltipVisible(false)}
      onFocus={() => setTooltipVisible(true)}
      onMouseEnter={() => setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
      className="group relative flex h-11 w-11 items-center justify-center rounded-full md:h-9 md:w-9"
    >
      {/* Animated active background */}
      {active && (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-full bg-accent/10 border-l-2 border-accent"
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}
      <motion.svg
        viewBox={vb}
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        className={cn(
          "relative h-5 w-5",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
      >
        <path d={item.icon} />
      </motion.svg>
      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100",
          tooltipVisible ? "opacity-100" : "opacity-0",
        )}
      >
        {label}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Mobile bottom bar (visible below md breakpoint)
// Each item has min 48px touch target for comfortable tapping.
// ---------------------------------------------------------------------------

function MobileBottomBar() {
  const pathname = usePathname();
  const { t } = useAppTranslation("navigation");

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border bg-card/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)] md:hidden"
      role="navigation"
      aria-label={t("mainNavigation")}
    >
      {VISIBLE_TOP_NAV_ITEMS.map((item) => {
        const active = isActive(item.href);
        const vb = `0 0 ${item.viewBox} ${item.viewBox}`;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={t(item.labelKey)}
            className={cn(
              "flex min-h-[48px] min-w-[48px] flex-col items-center justify-center gap-0.5 px-2 py-1.5 transition-colors",
              active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <svg
              viewBox={vb}
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
            >
              <path d={item.icon} />
            </svg>
            <span className="text-[10px] font-medium leading-none">
              {t(item.labelKey)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// AppSidebar (desktop: icon rail, mobile: bottom nav bar)
// ---------------------------------------------------------------------------

export function AppSidebar() {
  const pathname = usePathname();
  const { t } = useAppTranslation("navigation");

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Desktop sidebar rail -- hidden below md */}
      <aside className="hidden md:flex h-screen w-[60px] flex-col items-center border-r border-border bg-card py-3 gap-1">
        {/* Logo */}
        <Link
          href="/home"
          title="AI Canvas"
          className="mb-1 flex h-9 w-9 items-center justify-center"
        >
          <motion.div
            whileHover={{ scale: 1.1, rotate: 8 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <AimcLogo className="size-7 text-foreground" />
          </motion.div>
        </Link>

        {/* Top nav items */}
        {VISIBLE_TOP_NAV_ITEMS.map((item) => (
          <NavButton
            key={item.href}
            item={item}
            active={isActive(item.href)}
            label={t(item.labelKey)}
          />
        ))}

        {/* Spacer pushes bottom section down */}
        <div className="flex-1" />

        <SidebarSettingsMenu />
      </aside>

      {/* Mobile bottom navigation bar */}
      <MobileBottomBar />
    </>
  );
}
