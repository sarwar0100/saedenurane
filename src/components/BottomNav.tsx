import { Link, useLocation } from "@tanstack/react-router";
import { useApp, userStorageKey } from "@/lib/app-store";
import { useChrome } from "@/components/chrome";

const items = [
  { to: "/app/leaderboards", label: "ڕێزبەندی" },
  { to: "/app/store", label: "فڕۆشگا" },
  { to: "/app/play", label: "یاری" },
  { to: "/app/friends", label: "هاوڕێکانت" },
  { to: "/app/profile", label: "پڕۆفایل" },
] as const;

export function BottomNav() {
  const { totalUnread, user } = useApp();
  const { hidden } = useChrome();
  const { pathname } = useLocation();

  if (hidden) return null;

  const handleHotspotClick = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(12);
    if (typeof window === "undefined" || !user?.id) return;
    const soundUrl = localStorage.getItem(userStorageKey(user.id, "active_sound"));
    if (!soundUrl) return;
    const audio = new Audio(soundUrl);
    audio.volume = 0.22;
    void audio.play().catch(() => {});
  };

  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-[calc(0.25rem+env(safe-area-inset-bottom))] z-40 mx-auto w-[calc(100%-1.5rem)] max-w-md"
    >
      <div
        dir="ltr"
        className="relative isolate aspect-[864/289] w-full bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/saedd11.png')" }}
      >
        <div dir="ltr" className="absolute inset-x-[3%] inset-y-[20%] grid grid-cols-5">
          {items.map(({ to, label }) => {
            const isActive = pathname === to || pathname.startsWith(`${to}/`);
            return (
              <Link
                key={to}
                to={to}
                aria-label={label}
                aria-current={isActive ? "page" : undefined}
                onClick={handleHotspotClick}
                className={`relative z-10 block rounded-full outline-none transition-transform duration-75 ease-out active:scale-95 active:brightness-125 focus-visible:ring-2 focus-visible:ring-white/80 ${isActive ? "bg-white/[0.04]" : ""}`}
              >
                {to === "/app/friends" && totalUnread > 0 && (
                  <span
                    aria-label={`${totalUnread} unread messages`}
                    className="absolute right-[18%] top-[5%] min-w-5 rounded-full bg-destructive px-1 text-center text-[10px] font-bold text-destructive-foreground"
                  >
                    {totalUnread}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
