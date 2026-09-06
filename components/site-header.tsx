"use client";

import { Show, SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import posthog from "posthog-js";

import { CategoryChip } from "@/components/category-chip";
import { Icon } from "@/components/icon";
import { Wordmark } from "@/components/wordmark";
import { CATEGORIES, NAV_LINKS, todayLabel } from "@/lib/site-nav";
import { cn } from "@/lib/utils";

/** Top utility strip — presentational only (theme and edition are not wired up). */
function UtilityBar() {
  return (
    <div className="bg-text-primary text-caption text-white/60">
      <div className="container-page flex h-9 items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <span className="whitespace-nowrap">Browser Extension</span>
          <span className="hidden items-center gap-2 sm:flex">
            Theme:
            <span className="font-semibold text-white">Light</span>
            <span>Dark</span>
            <span>Auto</span>
          </span>
        </div>

        <div className="flex items-center gap-6">
          <span className="hidden whitespace-nowrap md:inline">{todayLabel()}</span>
          <span className="hidden whitespace-nowrap sm:inline">Set Location</span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <Icon name="globe" size={13} />
            International Edition
            <Icon name="chevron-down" size={13} />
          </span>
        </div>
      </div>
    </div>
  );
}

function MainNav() {
  return (
    <nav aria-label="Primary" className="hidden self-stretch lg:flex">
      <ul className="flex items-stretch gap-8">
        {NAV_LINKS.map((link, index) => {
          const active = index === 0;
          return (
            <li key={link.label} className="flex items-stretch">
              <a
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center border-b-2 text-body-md font-medium transition-colors",
                  active
                    ? "border-text-primary text-text-primary"
                    : "border-transparent text-text-secondary hover:text-text-primary",
                )}
              >
                {link.label}
                {link.hasUpdate ? (
                  <span
                    aria-hidden
                    className="mb-2 ml-1 size-1.5 rounded-full bg-bias-left"
                  />
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function CategoryRail() {
  return (
    <div className="border-b border-border bg-surface">
      <div className="container-page relative flex h-12 items-center">
        <nav
          aria-label="Topics"
          className="flex flex-1 items-center gap-2 overflow-x-auto pr-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {CATEGORIES.map((category) => (
            <CategoryChip
              key={category}
              label={category}
              addable
              className="shrink-0"
            />
          ))}
        </nav>
        <span
          aria-hidden
          className="pointer-events-none absolute right-6 flex h-full items-center bg-linear-to-l from-surface via-surface pl-6 text-text-secondary"
        >
          <Icon name="chevron-right" size={16} />
        </span>
      </div>
    </div>
  );
}

export function PostHogIdentity() {
  const { isLoaded, user } = useUser();
  const identifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (user) {
      if (identifiedUserId.current === user.id) return;

      if (identifiedUserId.current) posthog.reset();

      const email = user.primaryEmailAddress?.emailAddress;
      const name = user.fullName;
      posthog.identify(user.id, {
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
      });
      identifiedUserId.current = user.id;
      return;
    }

    if (identifiedUserId.current) {
      posthog.reset();
      identifiedUserId.current = null;
    }
  }, [isLoaded, user]);

  return null;
}

type SiteHeaderProps = {
  /** The topic chip rail is shown on the home page but not on article pages. */
  showCategories?: boolean;
};

export function SiteHeader({ showCategories = true }: SiteHeaderProps) {
  return (
    <header>
      <UtilityBar />

      <div className="border-b border-border bg-bg-primary">
        <div className="container-page flex h-18 items-center gap-8">
          <button
            type="button"
            aria-label="Open menu"
            className="shrink-0 text-text-primary"
          >
            <Icon name="menu" size={24} />
          </button>

          <Wordmark />
          <MainNav />

          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              className="hidden rounded-md bg-text-primary px-5 py-2.5 text-body-md font-medium text-white transition-opacity hover:opacity-90 sm:inline-flex"
            >
              Subscribe
            </button>
            <Show when="signed-out">
              <SignInButton>
                <button
                  type="button"
                  onClick={() =>
                    posthog.capture("sign_in_started", {
                      entry_point: "site_header",
                    })
                  }
                  className="rounded-md border border-border bg-bg-primary px-5 py-2.5 text-body-md font-medium text-text-primary transition-colors hover:bg-surface"
                >
                  Login
                </button>
              </SignInButton>
            </Show>

            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>
        </div>
      </div>

      {showCategories ? <CategoryRail /> : null}
    </header>
  );
}
