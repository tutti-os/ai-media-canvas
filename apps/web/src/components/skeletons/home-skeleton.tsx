import { Skeleton } from "@/components/ui/skeleton";

export function HomeProjectsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="aspect-[286/208] rounded-xl bg-card p-2 shadow-card sm:rounded-2xl sm:p-3"
        >
          <Skeleton className="h-full w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}
