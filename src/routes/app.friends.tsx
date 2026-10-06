import { createFileRoute } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ErrorInfo,
  type FormEvent,
  type RefObject,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Ban,
  Check,
  Copy,
  CopyCheck,
  LogOut,
  Plus,
  Reply,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
  Image,
} from "lucide-react";
import { toast } from "sonner";
import { formatTime, useApp, type Friend, type Group, type Message } from "@/lib/app-store";
import { useHideChrome } from "@/components/chrome";
import { PlayerProfileSheet } from "@/components/PlayerProfileSheet";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"] || "";
const supabaseKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || "";
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

type DatabaseFriendRequest = { requestId: string; friend: Friend; status: string };
const EMPTY_CHAT_MESSAGES: Message[] = [];
type MessagePopupPosition = {
  reactionTop: number;
  reactionLeft: number;
  actionTop: number;
  actionLeft: number;
  reactionWidth: number;
  actionHeight: number;
};

export const Route = createFileRoute("/app/friends")({
  head: () => ({
    meta: [
      { title: "هاوڕێکان — مار و پەیژە" },
      { name: "description", content: "چاتی تایبەت و گروپی لەگەڵ هاوڕێکانت." },
      { property: "og:title", content: "هاوڕێکان — مار و پەیژە" },
      { property: "og:description", content: "چات و گروپەکانت لە یاری مار و پەیژە." },
    ],
  }),
  component: FriendsRoute,
});

type View = "friends" | "groups";

const DEFAULT_PROFILE_IMAGE = "/default-avatar.svg";

const handleProfileImageError = (event: React.SyntheticEvent<HTMLImageElement>) => {
  event.currentTarget.onerror = null;
  event.currentTarget.src = DEFAULT_PROFILE_IMAGE;
};

function renderProfilePic(
  profile:
    { avatar?: unknown; avatar_url?: unknown; id?: unknown; name?: unknown } | null | undefined,
): string {
  const value = profile?.avatar_url ?? profile?.avatar;
  if (typeof value !== "string" || !value.trim()) return DEFAULT_PROFILE_IMAGE;
  const image = value.trim();
  if (/^(https?:\/\/|data:image\/)/i.test(image)) return image;
  if (image.startsWith("/")) return image;
  return `/avatars/${encodeURIComponent(image)}.png`;
}

type FriendsBoundaryState = { error: Error | null; retryKey: number };

class FriendsErrorBoundary extends Component<{ children: ReactNode }, FriendsBoundaryState> {
  override state: FriendsBoundaryState = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error): FriendsBoundaryState {
    return { error, retryKey: 0 };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Friends route crashed", error, info.componentStack);
  }

  retry = () => {
    this.setState((previous) => ({ error: null, retryKey: previous.retryKey + 1 }));
  };

  override render() {
    if (this.state.error) {
      return (
        <section className="flex min-h-screen items-center justify-center px-6 pb-32 text-center">
          <div className="glass-strong w-full max-w-sm rounded-3xl p-6">
            <h1 className="text-lg font-extrabold">نەتوانرا هاوڕێیان لۆد بکرێت</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              داتاکانی هاوڕێکان بە شێوەیەکی چاوەڕواننەکراو هاتن.
            </p>
            <button
              onClick={this.retry}
              className="press mt-5 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
            >
              دووبارە هەوڵدانەوە
            </button>
            <details className="mt-5 text-left">
              <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                وردەکاریی تەکنیکی
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/10 p-3 text-[10px] text-destructive">
                {this.state.error.message}
                {this.state.error.stack ? `\n\n${this.state.error.stack}` : ""}
              </pre>
            </details>
          </div>
        </section>
      );
    }
    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}

function FriendsRoute() {
  return (
    <FriendsErrorBoundary>
      <FriendsTab />
    </FriendsErrorBoundary>
  );
}

function FriendsTab() {
  const {
    addFriend,
    visibleFriends,
    directMessages,
    unreadFor,
    user,
  } = useApp();
  const acceptedFriends = Array.isArray(visibleFriends)
    ? visibleFriends.filter((friend) => Boolean(friend?.id))
    : [];
  const safeFriends = acceptedFriends;
  const [databaseRequests, setDatabaseRequests] = useState<DatabaseFriendRequest[]>([]);
  const [view, setView] = useState<View>("friends");
  const [openFriend, setOpenFriend] = useState<Friend | null>(null);
  const [openGroup, setOpenGroup] = useState<Group | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Friend | null>(null);
  const [creating, setCreating] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [popup, setPopup] = useState<{ type: "friend" | "group"; id: string } | null>(null);

  useEffect(() => {
    if (!supabase || !user?.id) {
      setDatabaseRequests([]);
      return;
    }
    let cancelled = false;
    let refreshSequence = 0;
    const loadRequests = async () => {
      const sequence = ++refreshSequence;
      try {
        const { data, error } = await supabase
          .from("friend_requests")
          .select(
            "id, sender_id, receiver_id, status, created_at, profiles:sender_id(id, username, display_name, avatar_url, bio)",
          )
          .eq("receiver_id", user.id)
          .eq("status", "pending");
        if (cancelled || sequence !== refreshSequence) return;
        if (error) {
          console.error("Friend request fetch error:", error);
          setDatabaseRequests([]);
          return;
        }
        const requests = (data ?? []).flatMap((row) => {
          const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
          if (!profile) return [];
          const friend: Friend = {
            id: String(profile.id ?? row.sender_id),
            name: String(profile.display_name ?? profile.username ?? "یاریزان"),
            ...(profile.bio ? { bio: profile.bio } : {}),
            avatar: String(profile.avatar_url ?? ""),
            points: 0,
            gold: 0,
            games_played: 0,
            wins: 0,
          };
          return [{ requestId: String(row.id), friend, status: String(row.status) }];
        });
        setDatabaseRequests(requests);
      } catch (error) {
        if (!cancelled && sequence === refreshSequence) {
          console.error("Friend request fetch error:", error);
          setDatabaseRequests([]);
        }
      }
    };
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`friend-requests:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "friend_requests",
            filter: `receiver_id=eq.${user.id}`,
          },
          () => void loadRequests(),
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") void loadRequests();
        });
    } catch (error) {
      console.warn("Friend-request realtime updates unavailable:", error);
    }
    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel).catch((error: unknown) => {
          console.warn("Friend-request realtime cleanup failed:", error);
        });
      }
    };
  }, [user?.id]);

  const safeRequests = databaseRequests;

  return (
    <section className="min-h-screen px-4 pt-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] pb-32">
      <button
        onClick={() => setCreating(true)}
        aria-label="دروستکردنی گروپ"
        className="glass press absolute top-[max(1rem,env(safe-area-inset-top))] right-4 flex size-11 items-center justify-center rounded-full"
      >
        <Plus className="size-5 text-primary" />
      </button>

      <button
        onClick={() => setRequestsOpen(true)}
        aria-label="هاوڕێی نوێ"
        className="glass press absolute top-[max(1rem,env(safe-area-inset-top))] left-4 flex size-11 items-center justify-center rounded-full"
      >
        <UserPlus className="size-5 text-primary" />
        {safeRequests.length > 0 && (
          <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {safeRequests.length}
          </span>
        )}
      </button>

      <div className="glass relative mb-5 flex rounded-2xl p-1">
        <span
          className="absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-xl bg-primary shadow-[var(--shadow-glow)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: view === "friends" ? "translateX(0)" : "translateX(-100%)" }}
        />
        {(["friends", "groups"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`relative z-10 flex-1 rounded-xl py-2.5 text-sm font-bold transition-colors ${
              view === v ? "text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {v === "friends" ? "هاوڕێکان" : "گروپەکان"}
          </button>
        ))}
      </div>

      {view === "friends" ? (
        <div className="space-y-3">
          {safeFriends.map((f) => {
            if (!f?.id) return null;
            const unread = unreadFor?.(f.id) ?? 0;
            const latestMessage = directMessages?.[f.id]?.at(-1);
            return (
              <div
                key={f.id}
                className="glass animate-rise-in flex items-center gap-3 rounded-2xl p-3"
              >
                <button
                  onClick={() => f?.id && setOpenFriend(f)}
                  className="press relative"
                  aria-label={`چاتی ${f.name}`}
                >
                  <img
                    src={renderProfilePic(f)}
                    onError={handleProfileImageError}
                    alt={f.name ?? "هاوڕێ"}
                    className={`size-12 rounded-full bg-secondary ring-2 ${f.online === false || f.hideOnlineStatus ? "ring-slate-400/60" : "ring-emerald-400/80 shadow-[0_0_12px_rgba(52,211,153,0.3)]"}`}
                  />
                  {f.online !== false && !f.hideOnlineStatus && (
                    <span
                      aria-label="سەرهێڵ"
                      className="absolute bottom-0 right-0 size-3 rounded-full bg-green-500 ring-2 ring-background"
                    />
                  )}
                </button>
                <button
                  onClick={() => f?.id && setOpenFriend(f)}
                  className="press min-w-0 flex-1 text-right"
                >
                  <p className="font-bold">{f.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {latestMessage?.text?.trim() ||
                      (latestMessage?.imageUrl ? "وێنە" : "هیچ نامەیەک نییە")}
                  </p>
                </button>
                <div className="flex w-8 shrink-0 items-center justify-center" aria-label="نامەی نوێ">
                  {unread > 0 && (
                    <span className="flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {safeFriends.length === 0 && (
            <p className="pt-10 text-center text-sm text-muted-foreground">هیچ هاوڕێیەک نییە</p>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center h-64">
          <p className="text-xl font-bold text-gray-400">کاری لەسەر دەکرێت</p>
        </div>
      )}

      {popup && <ActionPopup popup={popup} onClose={() => setPopup(null)} />}
      {requestsOpen && (
        <FriendRequests
          requests={databaseRequests}
          currentUserId={user?.id}
          onClose={() => setRequestsOpen(false)}
          onStatusChange={(requestId, friend) => {
            addFriend(friend);
            setDatabaseRequests((requests) =>
              requests.filter((request) => request.requestId !== requestId),
            );
          }}
        />
      )}
      {creating && <ConstructionNotice onClose={() => setCreating(false)} />}
      {openFriend?.id && <DirectChat friend={openFriend} onClose={() => setOpenFriend(null)} />}
      {openGroup?.id && <GroupChat group={openGroup} onClose={() => setOpenGroup(null)} />}
      {selectedProfile?.id && (
        <PlayerProfileSheet
          player={selectedProfile}
          followersCount={acceptedFriends.length}
          followingCount={acceptedFriends.length}
          allowFriendRequest
          showActions
          onRemoved={() => {
            setSelectedProfile(null);
            setOpenFriend(null);
          }}
          onMessage={() => {
            setSelectedProfile(null);
            setOpenFriend(selectedProfile);
          }}
          onClose={() => setSelectedProfile(null)}
        />
      )}
    </section>
  );
}

function ActionPopup({
  popup,
  onClose,
}: {
  popup: { type: "friend" | "group"; id: string };
  onClose: () => void;
}) {
  const { blockUser, leaveGroup } = useApp();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 px-10"
      onClick={onClose}
    >
      <div
        className="glass-strong animate-soft-in w-full max-w-xs rounded-3xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {popup.type === "friend" ? (
          <button
            onClick={() => {
              blockUser(popup.id);
              toast.success("بلۆک کرا");
              onClose();
            }}
            className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-destructive/20 py-3 font-bold text-destructive"
          >
            <Ban className="size-5" />
            بلۆککردن
          </button>
        ) : (
          <button
            onClick={() => {
              leaveGroup(popup.id);
              toast.success("گروپەکە جێهێشترا");
              onClose();
            }}
            className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-destructive/20 py-3 font-bold text-destructive"
          >
            <LogOut className="size-5" />
            جێهێشتنی گروپ
          </button>
        )}
      </div>
    </div>
  );
}

function ConstructionNotice({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 px-4"
      onClick={onClose}
    >
      <div
        className="glass-strong animate-soft-in rounded-3xl px-8 py-6"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xl font-bold">کاری لەسەر دەکرێت</p>
      </div>
    </div>
  );
}

function ChatBubble({
  mine,
  text,
  at,
  author,
  accent,
  imageUrl,
  reaction,
  messageId,
  onReaction,
  replyText,
  replyAuthor,
  onReply,
  onDelete,
  scrollContainerRef,
}: {
  mine: boolean;
  text?: string;
  at?: number;
  author?: string | undefined;
  accent?: boolean;
  imageUrl?: string | undefined;
  reaction?: string | undefined;
  messageId?: string;
  onReaction?: (messageId: string, reaction: string | null) => void | Promise<void>;
  replyText?: string | undefined;
  replyAuthor?: string | undefined;
  onReply?: () => void;
  onDelete?: (() => void) | undefined;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}) {
  const safeText = typeof text === "string" ? text : "";
  const codeMatch = /^\d{6}$/.test(safeText.trim());
  const { joinGroupByCode } = useApp();
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [popupPosition, setPopupPosition] = useState<MessagePopupPosition | null>(null);
  const [pressed, setPressed] = useState(false);
  const [reactionBurst, setReactionBurst] = useState<{ id: number; emoji: string } | null>(null);
  const pressTimer = useRef<number | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const originalScrollTop = useRef<number | null>(null);
  const originalPaddingBottom = useRef<string | null>(null);
  const paddingRestoreTimer = useRef<number | null>(null);
  const reactionBurstTimer = useRef<number | null>(null);
  const previousReaction = useRef(reaction);
  const reactionBurstId = useRef(0);
  const reactionPickerRef = useRef<HTMLDivElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const reactions = ["🤣", "❤️", "🥰", "😁", "💓", "👍", "🫂", "🔥"];
  const clearPressTimer = () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  const positionMessagePopups = (rect: DOMRect) => {
    const margin = 12;
    const gap = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const reactionWidth = Math.min(300, viewportWidth - margin * 2);
    const reactionHeight = 56;
    const actionWidth = Math.min(160, viewportWidth - margin * 2);
    const actionHeight = mine ? 124 : 88;
    const clamp = (value: number, min: number, max: number) =>
      Math.min(Math.max(value, min), Math.max(min, max));
    const reactionLeft = clamp(
      mine ? rect.right - reactionWidth : rect.left,
      margin,
      viewportWidth - reactionWidth - margin,
    );
    const reactionAbove = rect.top - reactionHeight - gap >= margin;
    const reactionTop = clamp(
      reactionAbove ? rect.top - reactionHeight - gap : rect.bottom + gap,
      margin,
      viewportHeight - reactionHeight - margin,
    );

    const actionFitsBelow = rect.bottom + gap + actionHeight <= viewportHeight - margin;
    let actionLeft: number;
    let actionTop: number;
    if (actionFitsBelow) {
      actionLeft = clamp(
        mine ? rect.right - actionWidth : rect.left,
        margin,
        viewportWidth - actionWidth - margin,
      );
      actionTop = rect.bottom + gap;
    } else {
      const rightSpace = viewportWidth - rect.right;
      const leftSpace = rect.left;
      const placeRight = rightSpace >= actionWidth + gap || rightSpace >= leftSpace;
      actionLeft = clamp(
        placeRight ? rect.right + gap : rect.left - actionWidth - gap,
        margin,
        viewportWidth - actionWidth - margin,
      );
      actionTop = clamp(
        rect.top + (rect.height - actionHeight) / 2,
        margin,
        viewportHeight - actionHeight - margin,
      );
    }

    setPopupPosition({
      reactionTop,
      reactionLeft,
      actionTop,
      actionLeft,
      reactionWidth,
      actionHeight,
    });
    setPressed(true);
    setReactionMenuOpen(true);
    setActionMenuOpen(Boolean(onReply));
  };
  const openMessagePopups = () => {
    const bubble = bubbleRef.current;
    if (!bubble) return;
    const rect = bubble.getBoundingClientRect();
    const scrollContainer = scrollContainerRef?.current;
    const gap = 8;
    const margin = 12;
    const menuHeight = mine ? 124 : 88;
    const neededShift = onReply
      ? rect.bottom + gap + menuHeight + margin - window.innerHeight
      : 0;

    if (neededShift > 0 && scrollContainer) {
      originalScrollTop.current = scrollContainer.scrollTop;
      originalPaddingBottom.current = scrollContainer.style.paddingBottom;
      const currentPadding = Number.parseFloat(
        window.getComputedStyle(scrollContainer).paddingBottom,
      ) || 0;
      scrollContainer.style.paddingBottom = `${currentPadding + neededShift}px`;
      if (neededShift > 0) {
        if (paddingRestoreTimer.current !== null) {
          window.clearTimeout(paddingRestoreTimer.current);
          paddingRestoreTimer.current = null;
        }
        scrollContainer.scrollTop += neededShift;
        window.requestAnimationFrame(() => {
          const shiftedRect = bubble.getBoundingClientRect();
          positionMessagePopups(shiftedRect);
        });
        return;
      }
    }

    positionMessagePopups(rect);
  };
  const startLongPress = () => {
    clearPressTimer();
    pressTimer.current = window.setTimeout(openMessagePopups, 400);
  };
  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(safeText);
      toast.success("کۆپی کرا", {
        icon: <CopyCheck className="size-4" />,
        duration: 600,
      });
    } catch {
      toast.error("نەتوانرا کۆپی بکرێت");
    }
  };
  const chooseReaction = (nextReaction: string) => {
    if (messageId) {
      void Promise.resolve(
        onReaction?.(messageId, reaction === nextReaction ? null : nextReaction),
      ).catch((error: unknown) => {
        console.error("Supabase direct-message reaction update error:", error);
        toast.error("نەتوانرا ڕیاکتەکە نوێ بکرێتەوە");
      });
    }
    closeMessagePopups();
  };
  const restoreScrollPosition = useCallback(
    (smooth = true) => {
      const scrollContainer = scrollContainerRef?.current;
      if (scrollContainer && originalScrollTop.current !== null) {
        scrollContainer.scrollTo({
          top: originalScrollTop.current,
          behavior: smooth ? "smooth" : "auto",
        });
        const originalPadding = originalPaddingBottom.current ?? "";
        if (paddingRestoreTimer.current !== null) {
          window.clearTimeout(paddingRestoreTimer.current);
        }
        if (smooth) {
          paddingRestoreTimer.current = window.setTimeout(() => {
            if (scrollContainerRef?.current) {
              scrollContainerRef.current.style.paddingBottom = originalPadding;
            }
            paddingRestoreTimer.current = null;
          }, 250);
        } else {
          scrollContainer.style.paddingBottom = originalPadding;
        }
      }
      originalScrollTop.current = null;
      originalPaddingBottom.current = null;
    },
    [scrollContainerRef],
  );
  const closeMessagePopups = useCallback(() => {
    setReactionMenuOpen(false);
    setActionMenuOpen(false);
    setPressed(false);
    setPopupPosition(null);
    restoreScrollPosition();
  }, [restoreScrollPosition]);
  useEffect(() => {
    if (reaction !== previousReaction.current && reaction) {
      reactionBurstId.current += 1;
      setReactionBurst({ id: reactionBurstId.current, emoji: reaction });
      if (reactionBurstTimer.current !== null) {
        window.clearTimeout(reactionBurstTimer.current);
      }
      reactionBurstTimer.current = window.setTimeout(() => {
        setReactionBurst(null);
        reactionBurstTimer.current = null;
      }, 700);
    }
    previousReaction.current = reaction;
  }, [reaction]);
  useEffect(() => {
    if (!reactionMenuOpen && !actionMenuOpen) return;
    const dismissOutside = (event: PointerEvent) => {
      if (
        !reactionPickerRef.current?.contains(event.target as Node) &&
        !actionMenuRef.current?.contains(event.target as Node) &&
        !bubbleRef.current?.contains(event.target as Node)
      ) {
        closeMessagePopups();
        clearPressTimer();
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [actionMenuOpen, closeMessagePopups, reactionMenuOpen]);
  useEffect(
    () => () => {
      clearPressTimer();
      restoreScrollPosition(false);
      if (paddingRestoreTimer.current !== null) {
        window.clearTimeout(paddingRestoreTimer.current);
      }
      if (reactionBurstTimer.current !== null) {
        window.clearTimeout(reactionBurstTimer.current);
      }
    },
    [restoreScrollPosition],
  );

  return (
    <div className={`flex flex-col ${mine ? "items-start" : "items-end"}`}>
      {author && <span className="mb-0.5 text-[10px] text-panel-muted">{author}</span>}
      <div className="relative max-w-[75%]">
        <div
          ref={bubbleRef}
          onPointerDown={startLongPress}
          onPointerUp={clearPressTimer}
          onPointerCancel={clearPressTimer}
          onPointerLeave={clearPressTimer}
          onContextMenu={(event) => event.preventDefault()}
          onDoubleClick={() => chooseReaction("❤️")}
          className={`rounded-2xl px-4 py-3 text-base transition-transform duration-200 ${pressed ? "scale-[1.04]" : ""} ${
          mine
            ? "bg-primary text-primary-foreground"
            : accent
              ? "bg-accent/25 text-panel-foreground"
              : "bg-panel-foreground/5 text-panel-foreground"
          }`}
        >
        {replyText && (
          <div className="mb-1.5 max-w-full rounded-t-lg border-b border-white/10 bg-muted/40 p-1.5 text-xs text-panel-foreground/80">
            {replyAuthor && <p className="mb-0.5 font-bold">{replyAuthor}</p>}
            <p className="truncate">{replyText}</p>
          </div>
        )}
        {imageUrl && (
          <img
            src={imageUrl}
            alt="attachment"
            className="mb-2 max-h-48 w-full rounded-xl object-cover"
          />
        )}
        {codeMatch ? (
          <button
            onClick={() => {
              const g = joinGroupByCode?.(safeText.trim());
              toast.success(g ? `چوویتە ناو ${g.name}` : "کۆدەکە دروست نییە");
            }}
            className="font-bold text-emerald-glow underline"
          >
            {safeText}
          </button>
        ) : (
          safeText
        )}
          {reaction && (
            <span className="absolute -bottom-3 right-2 z-10 flex size-7 items-center justify-center">
              <span className="relative flex size-7 items-center justify-center">
                {reactionBurst && (
                  <span key={reactionBurst.id} className="absolute inset-0" aria-hidden="true">
                    {[0, 1, 2, 3, 4].map((particle) => (
                      <span
                        key={particle}
                        className={`reaction-particle reaction-particle-${particle + 1}`}
                      >
                        {reactionBurst.emoji}
                      </span>
                    ))}
                  </span>
                )}
                <span className="relative z-10 text-lg leading-none">
                  {reaction}
                </span>
              </span>
            </span>
          )}
        </div>
      </div>
      {popupPosition && typeof document !== "undefined" &&
        createPortal(
          <>
            {reactionMenuOpen && (
              <div
                ref={reactionPickerRef}
                className="animate-in zoom-in-95 fixed z-[100] flex items-center gap-1 overflow-x-auto rounded-full border border-white/15 bg-background/90 px-2 py-1.5 shadow-xl backdrop-blur-md duration-150"
                style={{
                  top: popupPosition.reactionTop,
                  left: popupPosition.reactionLeft,
                  width: popupPosition.reactionWidth,
                  maxWidth: "calc(100vw - 24px)",
                }}
              >
                {reactions.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => chooseReaction(emoji)}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-lg transition-transform hover:scale-125"
                    aria-label={`react ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            {actionMenuOpen && onReply && (
              <div
                ref={actionMenuRef}
                className="animate-in zoom-in-95 fixed z-[100] flex min-w-36 flex-col overflow-hidden rounded-xl border border-panel-border bg-panel/95 p-1 shadow-xl backdrop-blur-md duration-150"
                style={{
                  top: popupPosition.actionTop,
                  left: popupPosition.actionLeft,
                  width: 160,
                  maxHeight: "calc(100vh - 24px)",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onReply();
                    closeMessagePopups();
                  }}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-panel-foreground hover:bg-panel-foreground/10"
                >
                  <Reply className="size-4" />
                  ڕیپلەی
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void copyMessage();
                    closeMessagePopups();
                  }}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-panel-foreground hover:bg-panel-foreground/10"
                >
                  <Copy className="size-4" />
                  کۆپی
                </button>
                {mine && onDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      onDelete();
                      closeMessagePopups();
                    }}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 className="size-4" />
                    ڕەشکردنەوە
                  </button>
                )}
              </div>
            )}
          </>,
          document.body,
        )}
      <span className="mt-1 text-[10px] text-panel-muted">
        {formatTime(typeof at === "number" ? at : Date.now())}
      </span>
    </div>
  );
}

function Composer({
  onSend,
  allowImages = false,
  replyingTo,
  onCancelReply,
}: {
  onSend: (text: string, imageUrl?: string) => void;
  allowImages?: boolean;
  replyingTo?: { author: string; text: string } | null;
  onCancelReply?: () => void;
}) {
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  const canSend = text.trim() || imageUrl;
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) return;
    try {
      onSend(text.trim(), imageUrl);
      setText("");
      setImageUrl(undefined);
    } catch (error) {
      console.error("Unable to send chat message", error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 pt-3">
      {replyingTo && (
        <div className="flex items-center gap-2 rounded-xl border-r-2 border-primary bg-panel-foreground/5 px-3 py-2">
          <div className="min-w-0 flex-1 text-right">
            <p className="text-xs font-bold text-primary">{replyingTo.author}</p>
            <p className="truncate text-xs text-panel-muted">{replyingTo.text}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="هەڵوەشاندنەوەی ڕیپلەی"
            className="press flex size-8 shrink-0 items-center justify-center rounded-full text-panel-muted hover:bg-panel-foreground/10"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      <div className="flex items-center gap-2">
        {allowImages && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setImageUrl(String(reader.result));
                reader.readAsDataURL(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="ناردنی وێنە"
              className="press flex size-11 items-center justify-center rounded-full border border-yellow-400/50 text-yellow-500"
            >
              <Image className="size-5" />
            </button>
          </>
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="نامەیەک بنووسە..."
          className="flex-1 rounded-2xl border border-panel-border bg-panel-foreground/5 px-4 py-3 text-sm text-panel-foreground outline-none placeholder:text-panel-muted focus:border-primary"
        />
        {canSend && (
          <button
            type="submit"
            aria-label="ناردن"
            className="press animate-soft-in flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <Send className="size-5 -scale-x-100" />
          </button>
        )}
      </div>
    </form>
  );
}

function useAutoScrollToLatest(messages: Message[], roomId: string) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousRoomId = useRef(roomId);

  useLayoutEffect(() => {
    const roomChanged = previousRoomId.current !== roomId;
    messagesEndRef.current?.scrollIntoView({
      behavior: roomChanged ? "auto" : "smooth",
      block: "end",
    });
    previousRoomId.current = roomId;
  }, [messages, roomId]);

  return messagesEndRef;
}

function DirectChat({ friend, onClose }: { friend: Friend; onClose: () => void }) {
  const {
    directMessages,
    sendDirect,
    deleteDirectMessage,
    markRead,
    reactToMessage,
    isProMember,
    user,
    visibleFriends,
  } = useApp();
  const [profileOpen, setProfileOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    text: string;
    author: string;
    senderId: string;
  } | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  useHideChrome();
  const friendId = friend?.id;
  const messages =
    friendId && directMessages && typeof directMessages === "object"
      ? Array.isArray(directMessages[friendId])
        ? directMessages[friendId]
        : EMPTY_CHAT_MESSAGES
      : EMPTY_CHAT_MESSAGES;
  const messagesEndRef = useAutoScrollToLatest(messages, friendId ?? "");
  const latestIncomingMessageId = [...messages]
    .reverse()
    .find((message) => message.senderId !== user?.id && message.senderId !== "me")?.id;
  useEffect(() => {
    if (!friendId || !user?.id) return;
    try {
      markRead?.(friendId);
    } catch {
      // Keep an invalid persisted chat from taking down the route.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendId, latestIncomingMessageId]);

  useEffect(() => {
    if (friendId && !visibleFriends.some((item) => item.id === friendId)) onClose();
  }, [friendId, onClose, visibleFriends]);

  if (!friendId) {
    return <EmptyChat onClose={onClose} label="هاوڕێیەک هەڵبژێرە" />;
  }

  return (
    <div className="panel animate-soft-in fixed inset-0 z-50 flex w-screen flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between pb-3">
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="press flex min-w-0 items-center gap-3 text-right"
          aria-label={`پرۆفایلی ${friend.name}`}
        >
          <img
            src={renderProfilePic(friend)}
            onError={handleProfileImageError}
            alt={friend?.name ?? "هاوڕێ"}
            className="size-10 rounded-full bg-secondary"
          />
          <span className="truncate font-bold text-panel-foreground">{friend?.name ?? "هاوڕێ"}</span>
        </button>
        <button
          onClick={onClose}
          aria-label="گەڕانەوە"
          className="press flex size-11 items-center justify-center rounded-full border border-panel-border bg-panel-foreground/5 text-panel-foreground"
        >
          <ArrowRight className="size-5" />
        </button>
      </div>

      <div
        ref={chatScrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto no-scrollbar py-2"
      >
        {messages.length > 0 ? (
          messages.map((m) =>
            m?.id ? (
              <ChatBubble
                key={m.id}
                mine={m?.senderId === user?.id || m?.senderId === "me"}
                text={m?.text ?? ""}
                imageUrl={m?.imageUrl ?? undefined}
                at={m?.at}
                reaction={m?.reaction}
                messageId={m?.id}
                onReaction={reactToMessage}
                replyText={m?.replyToText}
                replyAuthor={
                  m?.replyToSenderId
                    ? m.replyToSenderId === user?.id
                      ? "تۆ"
                      : friend.name
                    : undefined
                }
                onReply={() =>
                  setReplyingTo({
                    id: m.id,
                    text: m.text || (m.imageUrl ? "وێنە" : ""),
                    author: m.senderId === user?.id || m.senderId === "me" ? "تۆ" : friend.name,
                    senderId: m.senderId,
                  })
                }
                onDelete={
                  m.senderId === user?.id || m.senderId === "me"
                    ? () => {
                        void deleteDirectMessage(friend.id, m.id).catch((error: unknown) => {
                          console.error("Supabase direct-message deletion error:", error);
                          toast.error("نەتوانرا نامەکە بسڕدرێتەوە");
                        });
                      }
                    : undefined
                }
                scrollContainerRef={chatScrollRef}
              />
            ) : null,
          )
        ) : (
          <p className="pt-10 text-center text-sm text-panel-muted">هیچ نامەیەک نییە</p>
        )}
        <div ref={messagesEndRef} className="h-px" aria-hidden="true" />
      </div>

      <Composer
        allowImages={isProMember}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSend={(t, imageUrl) => {
          const reply = replyingTo
            ? {
                id: replyingTo.id,
                text: replyingTo.text,
                senderId: replyingTo.senderId,
              }
            : undefined;
          setReplyingTo(null);
          void sendDirect(friend.id, t, imageUrl, reply);
        }}
      />
      {profileOpen && (
        <PlayerProfileSheet
          player={friend}
          followersCount={0}
          followingCount={0}
          allowFriendRequest={false}
          showActions
          onRemoved={() => {
            setProfileOpen(false);
            onClose();
          }}
          onBlocked={onClose}
          onClose={() => {
            setProfileOpen(false);
            if (!visibleFriends.some((item) => item.id === friend.id)) onClose();
          }}
        />
      )}
    </div>
  );
}

function EmptyChat({ onClose, label }: { onClose: () => void; label: string }) {
  useHideChrome();
  return (
    <div className="panel animate-soft-in fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center">
      <p className="text-sm text-panel-muted">{label}</p>
      <button
        onClick={onClose}
        className="press mt-5 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
      >
        گەڕانەوە
      </button>
    </div>
  );
}

function GroupChat({ group, onClose }: { group: Group; onClose: () => void }) {
  const { groupMessages, sendGroup, friends } = useApp();
  useHideChrome();
  const groupId = group?.id;
  const messages =
    groupId &&
    groupMessages &&
    typeof groupMessages === "object" &&
    Array.isArray(groupMessages[groupId])
      ? groupMessages[groupId]
      : EMPTY_CHAT_MESSAGES;
    const messagesEndRef = useAutoScrollToLatest(messages, groupId ?? "");
  const safeFriends = Array.isArray(friends) ? friends : [];
  const nameOf = (id: string) => safeFriends.find((f) => f?.id === id)?.name ?? "ئەندام";

  if (!groupId) return <EmptyChat onClose={onClose} label="گروپێک هەڵبژێرە" />;

  return (
    <div className="panel animate-soft-in fixed inset-0 z-50 flex w-screen flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-accent/30">
            <Users className="size-5 text-accent" />
          </span>
          <div>
            <p className="font-bold text-panel-foreground">{group?.name ?? "گروپ"}</p>
            <button
              onClick={() => {
                if (group?.code) navigator.clipboard?.writeText(group.code).catch(() => {});
                toast.success("کۆدەکە کۆپی کرا");
              }}
              className="text-xs font-bold text-emerald-700"
            >
              {group?.code ?? ""}
            </button>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="گەڕانەوە"
          className="press flex size-11 items-center justify-center rounded-full border border-panel-border bg-panel-foreground/5 text-panel-foreground"
        >
          <ArrowRight className="size-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto no-scrollbar py-2">
        {messages.length > 0 ? (
          messages.map((m) =>
            m?.id ? (
              <ChatBubble
                key={m.id}
                mine={m.senderId === "me"}
                text={m.text}
                at={m.at}
                accent
                author={m.senderId === "me" ? undefined : nameOf(m.senderId)}
              />
            ) : null,
          )
        ) : (
          <p className="pt-10 text-center text-sm text-panel-muted">هیچ نامەیەک نییە</p>
        )}
        <div ref={messagesEndRef} className="h-px" aria-hidden="true" />
      </div>

      <Composer onSend={(t) => sendGroup(group.id, t)} />
    </div>
  );
}

function FriendRequests({
  requests,
  currentUserId,
  onClose,
  onStatusChange,
}: {
  requests: DatabaseFriendRequest[];
  currentUserId?: string | undefined;
  onClose: () => void;
  onStatusChange: (requestId: string, friend: Friend) => void;
}) {
  useHideChrome();

  return (
    <div className="panel animate-soft-in fixed inset-0 z-50 flex w-screen flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between pb-4">
        <span className="w-11" />
        <h2 className="text-lg font-bold text-panel-foreground">هاوڕێی نوێ</h2>
        <button
          onClick={onClose}
          aria-label="گەڕانەوە"
          className="press flex size-11 items-center justify-center rounded-full border border-panel-border bg-panel-foreground/5 text-panel-foreground"
        >
          <ArrowRight className="size-5" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto no-scrollbar">
        {requests.map(({ requestId, friend: r }, i) => (
          <div
            key={r.id}
            style={{ animationDelay: `${i * 50}ms` }}
            className="animate-rise-in flex items-center gap-3 rounded-2xl border border-panel-border bg-panel-foreground/5 p-3"
          >
            <img
              src={renderProfilePic(r)}
              onError={handleProfileImageError}
              alt={r.name ?? "هاوڕێ"}
              className={`size-12 rounded-full bg-secondary ring-2 ${r.online === false ? "ring-slate-400/60" : "ring-emerald-400/80 shadow-[0_0_12px_rgba(52,211,153,0.3)]"}`}
            />
            <div className="flex-1 text-right">
              <p className="font-bold text-panel-foreground">{r.name}</p>
              <p className="text-xs text-panel-muted">{r.points} خاڵ</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (!supabase) return;
                  void (async () => {
                    try {
                      const { error } = await supabase.rpc("accept_friend_request", {
                        request_id: requestId,
                        sender_user_id: r.id,
                        receiver_user_id: currentUserId,
                      });
                      if (error) {
                        toast.error("نەتوانرا زیاد بکرێت");
                        return;
                      }
                      onStatusChange(requestId, r);
                      toast.success("زیادکرا");
                    } catch (error) {
                      console.error("Friend request accept failed:", error);
                      toast.error("نەتوانرا زیاد بکرێت");
                    }
                  })();
                }}
                aria-label="قەبوڵکردن"
                className="press flex items-center gap-1 rounded-2xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-sm font-bold text-emerald-300 backdrop-blur-md"
              >
                <Check className="size-4" />
                قەبوڵکردن
              </button>
            </div>
          </div>
        ))}
        {requests.length === 0 && (
          <p className="pt-10 text-center text-sm text-panel-muted">هیچ داواکارییەک نییە</p>
        )}
      </div>
    </div>
  );
}
