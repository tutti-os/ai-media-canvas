import { Skeleton } from "@/components/ui/skeleton";

export function SkillsSkeleton() {
  return (
    <div className="px-4 py-6 sm:px-6 md:p-8">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="mt-3 h-4 w-72" />
      <div className="mt-6 flex gap-2">
        <Skeleton className="h-9 w-20 rounded-full" />
        <Skeleton className="h-9 w-20 rounded-full" />
        <Skeleton className="h-9 w-20 rounded-full" />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-4/5" />
            <Skeleton className="mt-5 h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
