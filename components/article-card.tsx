import Image from "next/image";

import { cn } from "@/lib/utils";
import { BiasMeter } from "@/components/bias-meter";
import { Icon } from "@/components/icon";

type ArticleCardProps = {
  imageUrl: string;
  imageAlt: string;
  category: string;
  location: string;
  title: string;
  summary: string;
  bias: { left: number; center: number; right: number };
  publishedLabel: string;
  readTimeLabel: string;
  className?: string;
};

export function ArticleCard({
  imageUrl,
  imageAlt,
  category,
  location,
  title,
  summary,
  bias,
  publishedLabel,
  readTimeLabel,
  className,
}: ArticleCardProps) {
  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-border bg-bg-primary p-4 shadow-sm sm:flex-row",
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-md sm:aspect-square sm:w-40">
        <Image
          src={imageUrl}
          alt={imageAlt}
          fill
          sizes="(min-width: 640px) 160px, 100vw"
          className="object-cover"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-caption text-text-secondary">
            {category} &middot; {location}
          </p>
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-text-secondary">
            <Icon name="info" size={12} />
          </span>
        </div>

        <h3 className="line-clamp-2 text-h3">{title}</h3>
        <p className="line-clamp-2 text-body-md text-text-secondary">{summary}</p>

        <BiasMeter
          size="sm"
          left={bias.left}
          center={bias.center}
          right={bias.right}
          className="mt-1"
        />

        <div className="mt-1 flex items-center gap-4 text-body-sm text-text-secondary">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="clock" size={14} />
            {publishedLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="bookmark" size={14} />
            {readTimeLabel}
          </span>
        </div>
      </div>
    </article>
  );
}
