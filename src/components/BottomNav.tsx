import { Link, useLocation } from "@tanstack/react-router";
import { Dices, ShoppingBag, Trophy, UserRound, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useApp } from "@/lib/app-store";
import { useChrome } from "@/components/chrome";

const items = [
  { to: "/app/profile", label: "پرۆفایل", Icon: UserRound },
  { to: "/app/friends", label: "هاوڕێکان", Icon: Users },
  { to: "/app/play", label: "یاری", Icon: Dices },
  { to: "/app/store", label: "فرۆشگا", Icon: ShoppingBag },
  { to: "/app/leaderboards", label: "ڕیزبەندی", Icon: Trophy },
] as const;

export function BottomNav() {
  const { totalUnread } = useApp();
  const { hidden } = useChrome();
  const { pathname } = useLocation();

  if (hidden) return null;

  return (
    <nav className="fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 mx-auto w-[calc(100%-2rem)] max-w-md">
      <div className="relative overflow-hidden rounded-full border border-emerald-400/30 bg-emerald-950/60 p-1.5 shadow-[0_0_25px_rgba(16,185,129,0.25),inset_0_1px_1px_rgba(255,255,255,0.25)] backdrop-blur-xl">
        <span className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
        <div className="relative grid grid-cols-5 items-stretch">
          {items.map(({ to, label, Icon }) => {
            const isActive = pathname === to || pathname.startsWith(`${to}/`);
            return (
              <Link
                key={to}
                to={to}
                className={`press relative z-10 flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-2 text-gray-300/80 transition-colors hover:text-white ${isActive ? "text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.9)]" : ""}`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabGlow"
                    aria-hidden="true"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    className="pointer-events-none absolute inset-0 rounded-2xl border border-emerald-400/60 bg-gradient-to-b from-emerald-400/30 to-emerald-600/20 shadow-[0_0_20px_rgba(16,185,129,0.6),inset_0_1px_2px_rgba(255,255,255,0.4)] backdrop-blur-md"
                  />
                )}
                <span className="relative z-10 flex size-6 items-center justify-center">
                  <Icon className="size-5" strokeWidth={1.9} />
                  {to === "/app/friends" && totalUnread > 0 && (
                    <span className="absolute -right-2 -top-1 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground shadow-sm">
                      {totalUnread}
                    </span>
                  )}
                </span>
                <span className="relative z-10 max-w-full truncate text-[9px] font-semibold leading-tight sm:text-[10px]">
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
