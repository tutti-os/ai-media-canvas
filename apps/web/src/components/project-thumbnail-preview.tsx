"use client";

import { Maximize2 } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type ProjectThumbnailPreviewProps = {
  src: string | null | undefined;
  alt: string;
  previewLabel: string;
};

export function ProjectThumbnailPreview({
  src,
  alt,
  previewLabel,
}: ProjectThumbnailPreviewProps) {
  const previewAlt = alt ? `${alt} preview` : "";

  return (
    <div className="relative aspect-[395/227] w-full rounded-lg bg-muted">
      {src ? (
        <>
          <div className="h-full w-full overflow-hidden rounded-lg">
            <img
              src={src}
              alt={alt}
              className="h-full w-full object-contain"
              loading="lazy"
              onError={(event) => {
                (event.currentTarget as HTMLImageElement).style.display =
                  "none";
              }}
            />
          </div>
          <div className="absolute bottom-2 right-2 z-30">
            <Popover>
              <PopoverTrigger
                openOnHover
                delay={0}
                closeDelay={80}
                aria-label={previewLabel}
                title={previewLabel}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                className="flex size-8 items-center justify-center rounded-[4px] bg-foreground/70 text-background opacity-0 shadow-sm transition-all duration-200 hover:bg-foreground/80 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <Maximize2 size={14} />
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="end"
                sideOffset={8}
                className="w-[min(30rem,calc(100vw-2rem))] p-3"
              >
                <img
                  src={src}
                  alt={previewAlt}
                  className="max-h-[min(26rem,70vh)] w-full object-contain"
                />
              </PopoverContent>
            </Popover>
          </div>
        </>
      ) : null}
    </div>
  );
}
