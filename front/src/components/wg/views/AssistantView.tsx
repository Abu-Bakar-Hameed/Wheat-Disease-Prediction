"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/lib/appState";
import {
  predictImage,
  sendChat,
  type ChatMessage,
  type PredictionResponse,
} from "@/lib/api";

/* =========================================================
   SETTINGS
========================================================= */

const OPEN_LAST_CHAT_ON_START = false;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const IMAGE_ACCEPT = ALLOWED_IMAGE_TYPES.join(",");

const THUMBNAIL_MAX_SIDE = 360;

/* =========================================================
   STORAGE KEYS
========================================================= */

const CHAT_HISTORY_KEY = "wheatguard_chat_history_v3";
const PREDICTION_HISTORY_KEY = "wheatguard_prediction_history_v1";
const PENDING_CHAT_KEY = "wheatguard_pending_chat";

/* =========================================================
   SPECIALISTS
========================================================= */

type Specialist = {
  id: string;
  name: string;
  description: string;
  icon: string;
};

const SPECIALISTS: Specialist[] = [
  {
    id: "general",
    name: "General Chat",
    description: "Ask anything about wheat and agriculture",
    icon: "agriculture",
  },
  {
    id: "healthy",
    name: "Healthy Wheat",
    description: "Healthy crop care and prevention",
    icon: "eco",
  },
  {
    id: "yellow-rust",
    name: "Yellow Rust",
    description: "Symptoms, treatment and prevention",
    icon: "coronavirus",
  },
  {
    id: "brown-rust",
    name: "Brown Rust",
    description: "Identification and disease management",
    icon: "coronavirus",
  },
  {
    id: "stem-rust",
    name: "Stem Rust",
    description: "Stem rust diagnosis and treatment",
    icon: "coronavirus",
  },
  {
    id: "septoria",
    name: "Septoria",
    description: "Septoria symptoms and management",
    icon: "bug_report",
  },
  {
    id: "powdery-mildew",
    name: "Powdery Mildew",
    description: "Detection, prevention and treatment",
    icon: "blur_on",
  },
  {
    id: "fusarium",
    name: "Fusarium",
    description: "Fusarium disease and crop protection",
    icon: "pest_control",
  },
];

/* =========================================================
   MESSAGE TYPES
========================================================= */

type ScanSummary = {
  displayName: string;
  isHealthy: boolean;
  confidence: number;
  severity?: string;
  recommendation?: string;
  lowConfidence: boolean;
  top: {
    name: string;
    confidence: number;
  }[];
  description?: string;
  symptoms: string[];
  prevention: string[];
  management: string[];
};

type UiMessage = ChatMessage & {
  image?: string;
  scan?: ScanSummary;
};

/* =========================================================
   CHAT TYPES
========================================================= */

type StoredConversation = {
  id: string;
  title: string;
  specialistId: string;
  specialistName: string;
  messages: UiMessage[];
  createdAt: string;
  updatedAt: string;
};

/* =========================================================
   PREDICTION HISTORY
========================================================= */

type StoredPrediction = {
  id: string;
  prediction: string;
  displayName: string;
  confidence: number;
  severity: string;
  recommendation?: string;
  description?: string;
  symptoms: string[];
  prevention: string[];
  management: string[];
  image?: string;
  fileName?: string;
  createdAt: string;
};

/* =========================================================
   ID HELPERS
========================================================= */

function createChatId() {
  return `chat_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 8)}`;
}

function createPredictionId() {
  return `prediction_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 8)}`;
}

/* =========================================================
   CHAT STORAGE
========================================================= */

function hasUserMessage(chat: { messages: UiMessage[] }) {
  return chat.messages.some(
    (message) => message.role === "user"
  );
}

function readChats(): StoredConversation[] {
  if (typeof window === "undefined") return [];

  try {
    const value = localStorage.getItem(CHAT_HISTORY_KEY);

    if (!value) return [];

    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (chat) =>
        chat &&
        chat.id &&
        Array.isArray(chat.messages) &&
        hasUserMessage(chat)
    );
  } catch {
    return [];
  }
}

function withoutOldImages(
  chats: StoredConversation[],
  keep: number
): StoredConversation[] {
  return chats.map((chat, index) =>
    index < keep
      ? chat
      : {
          ...chat,
          messages: chat.messages.map((message) =>
            message.image
              ? {
                  ...message,
                  image: undefined,
                }
              : message
          ),
        }
  );
}

function saveChats(chats: StoredConversation[]) {
  if (typeof window === "undefined") return;

  const cleaned = chats
    .filter(hasUserMessage)
    .slice(0, 100);

  const attempts = [
    cleaned,
    withoutOldImages(cleaned, 10),
    withoutOldImages(cleaned, 0),
  ];

  for (const attempt of attempts) {
    try {
      localStorage.setItem(
        CHAT_HISTORY_KEY,
        JSON.stringify(attempt)
      );

      return;
    } catch {
      // Try smaller version.
    }
  }
}

/* =========================================================
   PREDICTION HISTORY STORAGE
========================================================= */

function readPredictionHistory(): StoredPrediction[] {
  if (typeof window === "undefined") return [];

  try {
    const value = localStorage.getItem(
      PREDICTION_HISTORY_KEY
    );

    if (!value) return [];

    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) return [];

    return parsed;
  } catch {
    return [];
  }
}

function savePredictionHistory(
  prediction: StoredPrediction
) {
  if (typeof window === "undefined") return;

  try {
    const existing = readPredictionHistory();

    const updated = [
      prediction,
      ...existing.filter(
        (item) => item.id !== prediction.id
      ),
    ].slice(0, 100);

    localStorage.setItem(
      PREDICTION_HISTORY_KEY,
      JSON.stringify(updated)
    );
  } catch {
    // Ignore storage errors.
  }
}

/* =========================================================
   TEXT HELPERS
========================================================= */

function makeChatTitle(
  message: string,
  specialist: Specialist
) {
  const text = message.trim().replace(/\s+/g, " ");

  if (!text) {
    return specialist.id === "general"
      ? "New chat"
      : `${specialist.name} chat`;
  }

  return text.length > 45
    ? `${text.substring(0, 45)}…`
    : text;
}

function prettifyClassName(name: string) {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function findSpecialist(
  disease: string
): Specialist {
  const raw = disease.toLowerCase().trim();
  const clean = raw.replace(/[_\s]+/g, "-");

  const found =
    SPECIALISTS.find(
      (item) =>
        item.id === clean ||
        item.name.toLowerCase() === raw
    ) ??
    SPECIALISTS.find(
      (item) =>
        item.id !== "general" &&
        clean.includes(item.id)
    );

  if (found) return found;

  const name = prettifyClassName(disease);

  return {
    id: clean,
    name,
    description: `Focused chat for ${name}`,
    icon: "coronavirus",
  };
}

/* =========================================================
   WELCOME
========================================================= */

function getWelcomeMessage(
  specialist: Specialist
): UiMessage {
  if (specialist.id === "general") {
    return {
      role: "assistant",
      content:
        "Hello! I'm WheatGuard AI.\n\n" +
        "Ask me anything about wheat diseases, symptoms, " +
        "prevention, treatment, fungicides, crop management, " +
        "or your AI scan results.\n\n" +
        "Tap **+** to add a leaf photo or choose a specific disease.",
      timestamp: new Date().toISOString(),
    };
  }

  return {
    role: "assistant",
    content:
      `You're now chatting about **${specialist.name}**.\n\n` +
      `I can help you with symptoms, diagnosis, treatment, ` +
      `prevention, fungicides and crop management related to ` +
      `${specialist.name}.`,
    timestamp: new Date().toISOString(),
  };
}

/* =========================================================
   API MESSAGE CONVERSION
========================================================= */

function toApiMessages(
  messages: UiMessage[]
): ChatMessage[] {
  return messages.map((message) => {
    let content = message.content;

    if (message.scan) {
      const scan = message.scan;

      content +=
        `\n\nImage analysis: ${scan.displayName} ` +
        `(${scan.confidence.toFixed(1)}% confidence)` +
        (scan.severity
          ? `, severity: ${scan.severity}`
          : "") +
        "." +
        (scan.recommendation
          ? ` Recommendation: ${scan.recommendation}`
          : "");
    }

    return {
      role: message.role,
      content,
      timestamp: message.timestamp,
    };
  });
}

/* =========================================================
   IMAGE HELPERS
========================================================= */

function makeThumbnail(
  file: File
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      try {
        const scale = Math.min(
          1,
          THUMBNAIL_MAX_SIDE /
            Math.max(
              image.width,
              image.height
            )
        );

        const canvas =
          document.createElement("canvas");

        canvas.width = Math.max(
          1,
          Math.round(image.width * scale)
        );

        canvas.height = Math.max(
          1,
          Math.round(image.height * scale)
        );

        const context =
          canvas.getContext("2d");

        if (!context) {
          throw new Error(
            "Canvas is not available."
          );
        }

        context.drawImage(
          image,
          0,
          0,
          canvas.width,
          canvas.height
        );

        resolve(
          canvas.toDataURL(
            "image/jpeg",
            0.72
          )
        );
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new Error("Could not read this image.")
      );
    };

    image.src = url;
  });
}

function readAsDataUrl(
  file: File
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () =>
      resolve(String(reader.result));

    reader.onerror = () =>
      reject(reader.error);

    reader.readAsDataURL(file);
  });
}

/* =========================================================
   PREDICTION HELPERS
========================================================= */

function toPercent(value: number) {
  return value <= 1 ? value * 100 : value;
}

function buildScanSummary(
  prediction: PredictionResponse
): ScanSummary {
  const info = prediction.disease_info;
  const className = String(
    prediction.prediction ?? ""
  );

  return {
    displayName:
      info?.display_name ||
      prettifyClassName(className) ||
      "Unknown",

    isHealthy:
      className.toLowerCase().includes("healthy"),

    confidence: toPercent(
      Number(
        prediction.confidence_percentage ?? 0
      )
    ),

    severity: prediction.severity
      ? String(prediction.severity)
      : undefined,

    recommendation:
      prediction.recommendation
        ? String(prediction.recommendation)
        : undefined,

    lowConfidence:
      Boolean(prediction.low_confidence),

    top: (
      prediction.top_predictions ?? []
    )
      .slice(0, 3)
      .map((item) => ({
        name: prettifyClassName(
          String(item.class_name)
        ),
        confidence: toPercent(
          Number(
            item.confidence_percentage ?? 0
          )
        ),
      })),

    description:
      info?.description || undefined,

    symptoms: (
      info?.symptoms ?? []
    ).slice(0, 5),

    prevention: (
      info?.prevention ?? []
    ).slice(0, 5),

    management: (
      info?.management ?? []
    ).slice(0, 5),
  };
}

function scanIntro(
  scan: ScanSummary
) {
  const confidence =
    `${scan.confidence.toFixed(1)}% confidence`;

  const base = scan.isHealthy
    ? `This leaf looks **${scan.displayName}** (${confidence}).`
    : `This looks like **${scan.displayName}** (${confidence}).`;

  return scan.lowConfidence
    ? `${base} I'm not very sure, so treat this as a first guess.`
    : base;
}

function scanFollowUps(
  scan: ScanSummary
) {
  if (scan.isHealthy) {
    return [
      "How do I keep my wheat healthy?",
      "Which early warning signs should I watch for?",
    ];
  }

  return [
    `How do I treat ${scan.displayName}?`,
    `How can I prevent ${scan.displayName}?`,
    "Which fungicides work best?",
  ];
}

function severityClass(
  severity: string
) {
  const value = severity.toLowerCase();

  if (
    value.includes("critical") ||
    value.includes("severe") ||
    value.includes("high")
  ) {
    return "bg-danger-soft text-danger";
  }

  if (
    value.includes("moderate") ||
    value.includes("medium")
  ) {
    return "bg-warning-soft dark:bg-warning/15 text-warning";
  }

  if (
    value.includes("low") ||
    value.includes("mild")
  ) {
    return "bg-blue-100 text-blue-700";
  }

  if (
    value.includes("none") ||
    value.includes("healthy")
  ) {
    return "bg-brand-100 dark:bg-brand-900/50 text-brand-800 dark:text-brand-300";
  }

  return "bg-surface-muted text-ink";
}

/* =========================================================
   DATE GROUPING
========================================================= */

function groupByDate(
  chats: StoredConversation[]
) {
  const day = 86_400_000;

  const startOfToday =
    new Date().setHours(
      0,
      0,
      0,
      0
    );

  const groups = [
    {
      label: "Today",
      items: [] as StoredConversation[],
    },
    {
      label: "Yesterday",
      items: [] as StoredConversation[],
    },
    {
      label: "Previous 7 days",
      items: [] as StoredConversation[],
    },
    {
      label: "Older",
      items: [] as StoredConversation[],
    },
  ];

  const sorted = [...chats].sort(
    (a, b) =>
      b.updatedAt.localeCompare(
        a.updatedAt
      )
  );

  for (const chat of sorted) {
    const time = new Date(
      chat.updatedAt
    ).getTime();

    const index =
      time >= startOfToday
        ? 0
        : time >= startOfToday - day
        ? 1
        : time >=
          startOfToday - 7 * day
        ? 2
        : 3;

    groups[index].items.push(chat);
  }

  return groups.filter(
    (group) => group.items.length > 0
  );
}

/* =========================================================
   MARKDOWN MESSAGE
========================================================= */

type Block =
  | {
      type: "p";
      lines: string[];
    }
  | {
      type: "h";
      text: string;
    }
  | {
      type: "ul";
      items: string[];
    }
  | {
      type: "ol";
      start: number;
      items: string[];
    };

function parseBlocks(
  content: string
): Block[] {
  const blocks: Block[] = [];

  let current: Block | null = null;

  for (const raw of content
    .replace(/\r\n/g, "\n")
    .split("\n")) {
    const line = raw.trim();

    if (!line) {
      current = null;
      continue;
    }

    const heading =
      line.match(/^#{1,4}\s+(.*)$/);

    const bullet =
      line.match(/^[-*•]\s+(.*)$/);

    const numbered =
      line.match(/^(\d+)[.)]\s+(.*)$/);

    if (heading) {
      blocks.push({
        type: "h",
        text: heading[1],
      });

      current = null;
    } else if (bullet) {
      if (current?.type === "ul") {
        current.items.push(bullet[1]);
      } else {
        current = {
          type: "ul",
          items: [bullet[1]],
        };

        blocks.push(current);
      }
    } else if (numbered) {
      if (current?.type === "ol") {
        current.items.push(numbered[2]);
      } else {
        current = {
          type: "ol",
          start: Number(numbered[1]),
          items: [numbered[2]],
        };

        blocks.push(current);
      }
    } else if (current?.type === "p") {
      current.lines.push(line);
    } else {
      current = {
        type: "p",
        lines: [line],
      };

      blocks.push(current);
    }
  }

  return blocks;
}

function renderInline(
  text: string
): ReactNode[] {
  return text
    .split(
      /(\*\*[^*]+\*\*|`[^`]+`)/
    )
    .map((part, index) => {
      if (
        part.length > 4 &&
        part.startsWith("**") &&
        part.endsWith("**")
      ) {
        return (
          <strong key={index}>
            {part.slice(2, -2)}
          </strong>
        );
      }

      if (
        part.length > 2 &&
        part.startsWith("`") &&
        part.endsWith("`")
      ) {
        return (
          <code
            key={index}
            className="rounded bg-surface-muted px-1.5 py-0.5 text-[0.9em]"
          >
            {part.slice(1, -1)}
          </code>
        );
      }

      return part;
    });
}

function MessageText({
  content,
}: {
  content: string;
}) {
  const blocks = useMemo(
    () => parseBlocks(content),
    [content]
  );

  return (
    <div className="space-y-3 leading-7">
      {blocks.map(
        (block, index) => {
          if (block.type === "h") {
            return (
              <p
                key={index}
                className="pt-1 font-semibold"
              >
                {renderInline(
                  block.text
                )}
              </p>
            );
          }

          if (block.type === "ul") {
            return (
              <ul
                key={index}
                className="list-disc space-y-1.5 pl-5 marker:text-brand-600"
              >
                {block.items.map(
                  (item, i) => (
                    <li
                      key={i}
                      className="pl-1"
                    >
                      {renderInline(
                        item
                      )}
                    </li>
                  )
                )}
              </ul>
            );
          }

          if (block.type === "ol") {
            return (
              <ol
                key={index}
                start={block.start}
                className="list-decimal space-y-1.5 pl-5 marker:font-medium marker:text-brand-600"
              >
                {block.items.map(
                  (item, i) => (
                    <li
                      key={i}
                      className="pl-1"
                    >
                      {renderInline(
                        item
                      )}
                    </li>
                  )
                )}
              </ol>
            );
          }

          return (
            <p key={index}>
              {block.lines.map(
                (line, i) => (
                  <span key={i}>
                    {i > 0 && <br />}
                    {renderInline(line)}
                  </span>
                )
              )}
            </p>
          );
        }
      )}
    </div>
  );
}

/* =========================================================
   ICON
========================================================= */

function Icon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined ${className}`}
    >
      {name}
    </span>
  );
}

/* =========================================================
   AVATAR
========================================================= */

function AssistantAvatar() {
  return (
    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-900 text-white">
      <Icon
        name="grass"
        className="text-[18px]"
      />
    </div>
  );
}

/* =========================================================
   COPY
========================================================= */

function CopyButton({
  text,
}: {
  text: string;
}) {
  const [copied, setCopied] =
    useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        text
      );

      setCopied(true);

      window.setTimeout(
        () => setCopied(false),
        1500
      );
    } catch {
      // Clipboard unavailable.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={
        copied ? "Copied" : "Copy answer"
      }
      title={
        copied ? "Copied" : "Copy"
      }
      className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8a8f8c] hover:bg-surface-muted hover:text-ink"
    >
      <Icon
        name={
          copied
            ? "check"
            : "content_copy"
        }
        className="text-[18px]"
      />
    </button>
  );
}

/* =========================================================
   SCAN RESULT CARD
========================================================= */

function ScanResultCard({
  scan,
}: {
  scan: ScanSummary;
}) {
  const [open, setOpen] =
    useState(false);

  const sections = [
    {
      title: "Symptoms",
      icon: "visibility",
      items: scan.symptoms,
    },
    {
      title: "Prevention",
      icon: "shield",
      items: scan.prevention,
    },
    {
      title: "Management",
      icon: "healing",
      items: scan.management,
    },
  ].filter(
    (section) =>
      section.items.length > 0
  );

  const hasDetails =
    Boolean(scan.description) ||
    sections.length > 0;

  return (
    <div className="mt-3 w-full max-w-[520px] overflow-hidden rounded-2xl border border-[#dfe6e2] bg-surface">
      <div className="flex items-start gap-3.5 p-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            scan.isHealthy
              ? "bg-brand-100 dark:bg-brand-900/50 text-brand-800 dark:text-brand-300"
              : "bg-brand-900 text-white"
          }`}
        >
          <Icon
            name={
              scan.isHealthy
                ? "check_circle"
                : "biotech"
            }
            className="text-[24px]"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">
            Detected condition
          </p>

          <p className="text-lg font-semibold leading-snug">
            {scan.displayName}
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-[#e9f4ef] px-2.5 py-0.5 text-xs font-semibold text-brand-900">
              {scan.confidence.toFixed(1)}%
              confidence
            </span>

            {scan.severity && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${severityClass(
                  scan.severity
                )}`}
              >
                Severity: {scan.severity}
              </span>
            )}
          </div>
        </div>
      </div>

      {scan.lowConfidence && (
        <div className="mx-4 mb-3 flex gap-2 rounded-xl bg-warning-soft dark:bg-warning/10 px-3 py-2.5 text-[13px] leading-5 text-warning">
          <Icon
            name="warning"
            className="text-[18px]"
          />

          <p>
            Low confidence. Try a sharper,
            closer photo of a single leaf
            in daylight.
          </p>
        </div>
      )}

      {scan.top.length > 1 && (
        <div className="space-y-2.5 border-t border-surface-muted px-4 py-3.5">
          <p className="text-xs font-medium text-muted">
            What the model considered
          </p>

          {scan.top.map(
            (item, index) => (
              <div
                key={`${item.name}-${index}`}
              >
                <div className="mb-1 flex justify-between text-[13px]">
                  <span className="truncate">
                    {item.name}
                  </span>

                  <span className="font-medium text-brand-600">
                    {item.confidence.toFixed(
                      1
                    )}
                    %
                  </span>
                </div>

                <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-brand-600"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          item.confidence
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )
          )}
        </div>
      )}

      {scan.recommendation && (
        <div className="border-t border-surface-muted bg-surface-muted px-4 py-3.5">
          <p className="text-xs font-medium text-muted">
            Recommendation
          </p>

          <p className="mt-1 text-[14px] leading-6">
            {scan.recommendation}
          </p>
        </div>
      )}

      {hasDetails && (
        <>
          <button
            type="button"
            onClick={() =>
              setOpen((value) => !value)
            }
            className="flex w-full items-center justify-between border-t border-surface-muted px-4 py-3 text-[13px] font-medium text-brand-900 hover:bg-surface-muted"
          >
            {open
              ? "Hide details"
              : "Show symptoms, prevention and management"}

            <Icon
              name={
                open
                  ? "expand_less"
                  : "expand_more"
              }
              className="text-[20px]"
            />
          </button>

          {open && (
            <div className="space-y-4 border-t border-surface-muted px-4 py-4">
              {scan.description && (
                <p className="text-[13px] leading-6 text-muted">
                  {scan.description}
                </p>
              )}

              {sections.map(
                (section) => (
                  <div
                    key={
                      section.title
                    }
                  >
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                      <Icon
                        name={
                          section.icon
                        }
                        className="text-[17px] text-brand-600"
                      />

                      {section.title}
                    </p>

                    <ul className="mt-1.5 space-y-1 text-[13px] leading-5 text-muted">
                      {section.items.map(
                        (
                          item,
                          index
                        ) => (
                          <li
                            key={index}
                            className="flex gap-2"
                          >
                            <span className="text-brand-600">
                              •
                            </span>

                            <span>
                              {item}
                            </span>
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* =========================================================
   MENU ROW
========================================================= */

function MenuRow({
  icon,
  title,
  subtitle,
  onClick,
  selected = false,
  primary = false,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  onClick: () => void;
  selected?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-surface-muted ${
        selected
          ? "bg-[#eef6f2]"
          : ""
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          primary
            ? "bg-brand-900 text-white"
            : selected
            ? "bg-surface text-brand-900"
            : "bg-[#eef3f0] text-brand-900"
        }`}
      >
        <Icon
          name={icon}
          className="text-[20px]"
        />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {title}
        </span>

        {subtitle && (
          <span className="block truncate text-xs text-muted">
            {subtitle}
          </span>
        )}
      </span>

      {selected && (
        <Icon
          name="check"
          className="text-[19px] text-brand-900"
        />
      )}
    </button>
  );
}

/* =========================================================
   PREDICTION HISTORY ITEM
========================================================= */

function PredictionHistoryItem({
  prediction,
  onClick,
}: {
  prediction: StoredPrediction;
  onClick: () => void;
}) {
  const date = new Date(
    prediction.createdAt
  );

  const dateText =
    date.toLocaleDateString(
      "en-US",
      {
        month: "short",
        day: "numeric",
        year: "numeric",
      }
    );

  const timeText =
    date.toLocaleTimeString(
      "en-US",
      {
        hour: "numeric",
        minute: "2-digit",
      }
    );

  const severity =
    prediction.severity.toLowerCase();

  const severityClassName =
    severity.includes("critical") ||
    severity.includes("severe") ||
    severity.includes("high")
      ? "border-danger/20 bg-danger-soft text-danger"
      : severity.includes("moderate") ||
        severity.includes("medium")
      ? "border-warning/30 bg-warning-soft dark:bg-warning/10 text-warning"
      : severity.includes("none") ||
        severity.includes("healthy")
      ? "border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-900/40 text-brand-800 dark:text-brand-300"
      : "border-line bg-surface-muted text-ink";

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-line bg-surface p-2.5 text-left hover:bg-[#f6f9f7]"
    >
      <div className="flex gap-3">
        {/* THUMBNAIL */}

        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#eef3f0]">
          {prediction.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={prediction.image}
              alt={prediction.displayName}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Icon
                name="image"
                className="text-[22px] text-[#8b968f]"
              />
            </div>
          )}
        </div>

        {/* DETAILS */}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-[14px] font-semibold text-ink">
              {prediction.displayName}
            </p>

            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${severityClassName}`}
            >
              {prediction.severity}
            </span>
          </div>

          <div className="mt-1 flex items-center justify-between">
            <span className="text-[12px] text-muted">
              Confidence
            </span>

            <span className="text-[12px] font-semibold text-brand-900">
              {prediction.confidence.toFixed(
                1
              )}
              %
            </span>
          </div>

          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-brand-600"
              style={{
                width: `${Math.min(
                  100,
                  Math.max(
                    0,
                    prediction.confidence
                  )
                )}%`,
              }}
            />
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted">
              {prediction.fileName ||
                "Leaf image"}
            </span>

            <span className="shrink-0 text-xs text-muted">
              {dateText} · {timeText}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

/* =========================================================
   PREDICTION DETAILS MODAL
========================================================= */

function PredictionDetails({
  prediction,
  onClose,
}: {
  prediction: StoredPrediction;
  onClose: () => void;
}) {
  const date = new Date(
    prediction.createdAt
  );

  const sections = [
    {
      title: "Symptoms",
      icon: "visibility",
      items: prediction.symptoms,
    },
    {
      title: "Prevention",
      icon: "shield",
      items: prediction.prevention,
    },
    {
      title: "Management",
      icon: "healing",
      items: prediction.management,
    },
  ].filter(
    (section) =>
      section.items.length > 0
  );

  return (
    <div
      className="absolute inset-0 z-[100] flex items-end justify-center bg-black/30 p-2 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div className="max-h-[92vh] w-full max-w-[650px] overflow-hidden rounded-2xl border border-[#e0e5e2] bg-surface shadow-2xl">
        {/* HEADER */}

        <div className="flex items-center justify-between border-b border-surface-muted px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">
              Prediction details
            </p>

            <h3 className="truncate text-base font-semibold">
              {prediction.displayName}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close prediction details"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-surface-muted"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* BODY */}

        <div className="max-h-[calc(92vh-64px)] overflow-y-auto p-4">
          {/* IMAGE */}

          {prediction.image && (
            <div className="mb-4 overflow-hidden rounded-2xl border border-[#e2e7e4] bg-canvas">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={prediction.image}
                alt={prediction.displayName}
                className="max-h-[300px] w-full object-contain"
              />
            </div>
          )}

          {/* BASIC INFORMATION */}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl bg-canvas p-3">
              <p className="text-xs text-muted">
                Prediction
              </p>

              <p className="mt-1 text-sm font-semibold">
                {prediction.displayName}
              </p>
            </div>

            <div className="rounded-xl bg-canvas p-3">
              <p className="text-xs text-muted">
                Confidence
              </p>

              <p className="mt-1 text-sm font-semibold text-brand-900">
                {prediction.confidence.toFixed(
                  1
                )}
                %
              </p>
            </div>

            <div className="rounded-xl bg-canvas p-3">
              <p className="text-xs text-muted">
                Severity
              </p>

              <p className="mt-1 text-sm font-semibold">
                {prediction.severity}
              </p>
            </div>

            <div className="rounded-xl bg-canvas p-3">
              <p className="text-xs text-muted">
                Date
              </p>

              <p className="mt-1 text-sm font-semibold">
                {date.toLocaleDateString(
                  "en-US",
                  {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  }
                )}
              </p>
            </div>
          </div>

          {/* TIME */}

          <div className="mt-2 rounded-xl bg-canvas p-3">
            <p className="text-xs text-muted">
              Analysis time
            </p>

            <p className="mt-1 text-sm font-semibold">
              {date.toLocaleTimeString(
                "en-US",
                {
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                }
              )}
            </p>
          </div>

          {/* CONFIDENCE */}

          <div className="mt-5">
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-muted">
                Model confidence
              </span>

              <span className="font-semibold text-brand-900">
                {prediction.confidence.toFixed(
                  1
                )}
                %
              </span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-brand-600"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      0,
                      prediction.confidence
                    )
                  )}%`,
                }}
              />
            </div>
          </div>

          {/* DESCRIPTION */}

          {prediction.description && (
            <div className="mt-5">
              <h4 className="text-sm font-semibold">
                Description
              </h4>

              <p className="mt-1.5 text-sm leading-6 text-muted">
                {prediction.description}
              </p>
            </div>
          )}

          {/* RECOMMENDATION */}

          {prediction.recommendation && (
            <div className="mt-4 rounded-xl bg-[#f0f7f3] p-3.5">
              <p className="text-xs font-semibold text-brand-900">
                Recommendation
              </p>

              <p className="mt-1 text-sm leading-6 text-[#39443e]">
                {prediction.recommendation}
              </p>
            </div>
          )}

          {/* SYMPTOMS / PREVENTION / MANAGEMENT */}

          <div className="mt-5 space-y-5">
            {sections.map(
              (section) => (
                <div
                  key={
                    section.title
                  }
                >
                  <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                    <Icon
                      name={
                        section.icon
                      }
                      className="text-[18px] text-brand-600"
                    />

                    {section.title}
                  </h4>

                  <ul className="mt-2 space-y-1.5">
                    {section.items.map(
                      (
                        item,
                        index
                      ) => (
                        <li
                          key={index}
                          className="flex gap-2 text-sm leading-5 text-muted"
                        >
                          <span className="text-brand-600">
                            •
                          </span>

                          <span>
                            {item}
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )
            )}
          </div>

          {/* FILE NAME */}

          {prediction.fileName && (
            <div className="mt-5 rounded-xl border border-line p-3">
              <p className="text-xs text-muted">
                Original file
              </p>

              <p className="mt-1 truncate text-sm font-medium">
                {prediction.fileName}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   START SCREEN
========================================================= */

function getHeading(
  specialist: Specialist
) {
  return specialist.id === "general"
    ? "What's on the agenda today?"
    : `What would you like to know about ${specialist.name}?`;
}

function getSuggestions(
  specialist: Specialist
) {
  if (specialist.id === "general") {
    return [
      "How do I tell yellow rust from brown rust?",
      "When should I spray fungicide?",
      "How can I prevent Septoria?",
    ];
  }

  if (specialist.id === "healthy") {
    return [
      "How do I keep my wheat healthy?",
      "Which early warning signs should I watch for?",
      "What does a good scouting routine look like?",
    ];
  }

  return [
    `What are the symptoms of ${specialist.name}?`,
    `How do I treat ${specialist.name}?`,
    `How can I prevent ${specialist.name}?`,
  ];
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

type Attachment = {
  file: File;
  previewUrl: string;
};

type PlusLayout = {
  placement: "up" | "down";
  maxHeight: number;
};

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

export function AssistantView() {
  const {
    lastResult,
    setLastResult,
  } = useApp();

  const searchParams =
    useSearchParams();

  /* =======================================================
     STATE
  ======================================================= */

  const [messages, setMessages] =
    useState<UiMessage[]>([]);

  const [input, setInput] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [
    loadingChatId,
    setLoadingChatId,
  ] = useState<string | null>(null);

  const [
    loadingLabel,
    setLoadingLabel,
  ] = useState<string | null>(null);

  const [progress, setProgress] =
    useState(0);

  const [
    selectedSpecialist,
    setSelectedSpecialist,
  ] = useState<Specialist>(
    SPECIALISTS[0]
  );

  const [
    conversations,
    setConversations,
  ] = useState<
    StoredConversation[]
  >([]);

  const [
    predictionHistory,
    setPredictionHistory,
  ] = useState<
    StoredPrediction[]
  >([]);

  const [
    selectedPrediction,
    setSelectedPrediction,
  ] =
    useState<StoredPrediction | null>(
      null
    );

  const [
    currentChatId,
    setCurrentChatId,
  ] = useState<string | null>(
    null
  );

  const [plusOpen, setPlusOpen] =
    useState(false);

  const [
    plusLayout,
    setPlusLayout,
  ] = useState<PlusLayout>({
    placement: "up",
    maxHeight: 420,
  });

  const [
    mobileSidebar,
    setMobileSidebar,
  ] = useState(false);

  const [
    llmEnabled,
    setLlmEnabled,
  ] = useState(false);

  const [
    attachment,
    setAttachment,
  ] = useState<Attachment | null>(
    null
  );

  const [notice, setNotice] =
    useState("");

  const [dragging, setDragging] =
    useState(false);

  const [isTouch, setIsTouch] =
    useState(false);

  /* =======================================================
     REFS
  ======================================================= */

  const initialized =
    useRef(false);

  const isTouchRef =
    useRef(false);

  const currentChatIdRef =
    useRef<string | null>(null);

  const attachmentRef =
    useRef<Attachment | null>(null);

  const noticeTimer =
    useRef<number | undefined>(
      undefined
    );

  const dragDepth =
    useRef(0);

  const mainRef =
    useRef<HTMLElement>(null);

  const scrollRef =
    useRef<HTMLDivElement>(null);

  const plusRef =
    useRef<HTMLDivElement>(null);

  const bottomRef =
    useRef<HTMLDivElement>(null);

  const inputRef =
    useRef<HTMLTextAreaElement>(null);

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  const cameraInputRef =
    useRef<HTMLInputElement>(null);

  /* =======================================================
     DERIVED
  ======================================================= */

  const hasUserMessages =
    messages.some(
      (message) =>
        message.role === "user"
    );

  const isEmpty =
    !hasUserMessages;

  const canSend =
    !loading &&
    (input.trim().length > 0 ||
      attachment !== null);

  const historyGroups = useMemo(
    () =>
      groupByDate(
        conversations.filter(
          hasUserMessage
        )
      ),
    [conversations]
  );

  /* =======================================================
     DEVICE
  ======================================================= */

  useEffect(() => {
    const touch =
      window.matchMedia(
        "(pointer: coarse)"
      ).matches;

    isTouchRef.current = touch;
    setIsTouch(touch);
  }, []);

  /* =======================================================
     INITIALIZE
  ======================================================= */

  useEffect(() => {
    if (initialized.current)
      return;

    initialized.current = true;

    const storedChats =
      readChats();

    const storedPredictions =
      readPredictionHistory();

    setConversations(
      storedChats
    );

    setPredictionHistory(
      storedPredictions
    );

    let pending: {
      disease?: string;
      chatId?: string;
      predictionId?: string;
    } | null = null;

    try {
      const raw =
        sessionStorage.getItem(
          PENDING_CHAT_KEY
        );

      if (raw) {
        pending = JSON.parse(raw);

        sessionStorage.removeItem(
          PENDING_CHAT_KEY
        );
      }
    } catch {
      pending = null;
    }

    if (pending?.chatId) {
      const existing =
        storedChats.find(
          (chat) =>
            chat.id ===
            pending?.chatId
        );

      if (existing) {
        openStoredConversation(
          existing,
          storedChats
        );

        return;
      }
    }

    const requestedDisease =
      searchParams.get("disease") ||
      pending?.disease;

    if (requestedDisease) {
      createConversation(
        findSpecialist(
          requestedDisease
        ),
        storedChats
      );

      return;
    }

    if (
      OPEN_LAST_CHAT_ON_START &&
      storedChats.length > 0
    ) {
      openStoredConversation(
        storedChats[0],
        storedChats
      );

      return;
    }

    createConversation(
      SPECIALISTS[0],
      storedChats
    );
  }, [searchParams]);

  /* =======================================================
     SAVE CHATS
  ======================================================= */

  useEffect(() => {
    if (!initialized.current)
      return;

    saveChats(
      conversations
    );
  }, [conversations]);

  /* =======================================================
     AUTO SCROLL
  ======================================================= */

  useEffect(() => {
    if (isEmpty) return;

    const container =
      scrollRef.current;

    const lastIndex =
      messages.length - 1;

    if (
      container &&
      messages[lastIndex]?.role ===
        "assistant"
    ) {
      const element =
        container.querySelector<HTMLElement>(
          `[data-message-index="${lastIndex}"]`
        );

      if (element) {
        element.scrollIntoView({
          behavior: "smooth",
          block:
            element.offsetHeight >
            container.clientHeight - 48
              ? "start"
              : "end",
        });

        return;
      }
    }

    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [
    messages,
    loading,
    isEmpty,
  ]);

  /* =======================================================
     TEXTAREA
  ======================================================= */

  useEffect(() => {
    const element =
      inputRef.current;

    if (!element) return;

    element.style.height =
      "auto";

    element.style.height =
      `${Math.min(
        element.scrollHeight,
        200
      )}px`;
  }, [
    input,
    isEmpty,
  ]);

  /* =======================================================
     PLUS CLOSE
  ======================================================= */

  useEffect(() => {
    if (!plusOpen) return;

    function onPointerDown(
      event: MouseEvent
    ) {
      if (
        !plusRef.current?.contains(
          event.target as Node
        )
      ) {
        setPlusOpen(false);
      }
    }

    function onKeyDown(
      event: KeyboardEvent
    ) {
      if (
        event.key === "Escape"
      ) {
        setPlusOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      onPointerDown
    );

    document.addEventListener(
      "keydown",
      onKeyDown
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        onPointerDown
      );

      document.removeEventListener(
        "keydown",
        onKeyDown
      );
    };
  }, [plusOpen]);

  /* =======================================================
     CLEANUP
  ======================================================= */

  useEffect(() => {
    return () => {
      if (
        attachmentRef.current
      ) {
        URL.revokeObjectURL(
          attachmentRef.current
            .previewUrl
        );
      }

      window.clearTimeout(
        noticeTimer.current
      );
    };
  }, []);

  /* =======================================================
     SMALL HELPERS
  ======================================================= */

  function focusComposer(
    force = false
  ) {
    if (
      isTouchRef.current &&
      !force
    ) {
      return;
    }

    window.setTimeout(
      () =>
        inputRef.current?.focus(),
      50
    );
  }

  function setActiveChat(
    id: string | null
  ) {
    currentChatIdRef.current =
      id;

    setCurrentChatId(id);
  }

  function showNotice(
    text: string
  ) {
    setNotice(text);

    window.clearTimeout(
      noticeTimer.current
    );

    noticeTimer.current =
      window.setTimeout(
        () => setNotice(""),
        5000
      );
  }

  function appendMessage(
    chatId: string,
    message: UiMessage,
    patch: Partial<StoredConversation> = {}
  ) {
    if (
      currentChatIdRef.current ===
      chatId
    ) {
      setMessages(
        (previous) => [
          ...previous,
          message,
        ]
      );
    }

    setConversations(
      (previous) =>
        previous.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                ...patch,
                messages: [
                  ...chat.messages,
                  message,
                ],
                updatedAt:
                  new Date().toISOString(),
              }
            : chat
        )
    );
  }

  /* =======================================================
     ATTACHMENTS
  ======================================================= */

  function clearAttachment() {
    if (
      attachmentRef.current
    ) {
      URL.revokeObjectURL(
        attachmentRef.current
          .previewUrl
      );
    }

    attachmentRef.current =
      null;

    setAttachment(null);
  }

  function attachFile(
    file:
      | File
      | null
      | undefined
  ) {
    if (!file) return;

    if (
      !ALLOWED_IMAGE_TYPES.includes(
        file.type
      )
    ) {
      showNotice(
        "Use a JPG, PNG or WEBP photo."
      );

      return;
    }

    if (
      file.size >
      MAX_IMAGE_BYTES
    ) {
      showNotice(
        "That photo is over 10 MB. Choose a smaller one."
      );

      return;
    }

    if (
      attachmentRef.current
    ) {
      URL.revokeObjectURL(
        attachmentRef.current
          .previewUrl
      );
    }

    const next: Attachment = {
      file,
      previewUrl:
        URL.createObjectURL(
          file
        ),
    };

    attachmentRef.current =
      next;

    setNotice("");
    setAttachment(next);
    setPlusOpen(false);

    focusComposer(true);
  }

  function handlePaste(
    event: React.ClipboardEvent<HTMLTextAreaElement>
  ) {
    const file = Array.from(
      event.clipboardData.files
    ).find((item) =>
      item.type.startsWith(
        "image/"
      )
    );

    if (file) {
      event.preventDefault();

      attachFile(file);
    }
  }

  function hasFiles(
    event: React.DragEvent
  ) {
    return Array.from(
      event.dataTransfer.types
    ).includes("Files");
  }

  function openPhotoPicker() {
    setPlusOpen(false);

    fileInputRef.current?.click();
  }

  function openCamera() {
    setPlusOpen(false);

    cameraInputRef.current?.click();
  }

  /* =======================================================
     PLUS
  ======================================================= */

  function togglePlus() {
    if (plusOpen) {
      setPlusOpen(false);
      return;
    }

    const button =
      plusRef.current?.getBoundingClientRect();

    const bounds =
      mainRef.current?.getBoundingClientRect();

    if (button && bounds) {
      const below =
        Math.min(
          window.innerHeight,
          bounds.bottom
        ) -
        button.bottom -
        20;

      const above =
        button.top -
        Math.max(
          0,
          bounds.top
        ) -
        20;

      const down =
        below >= 380 ||
        below >= above;

      setPlusLayout({
        placement: down
          ? "down"
          : "up",

        maxHeight: Math.max(
          300,
          Math.min(
            600,
            down
              ? below
              : above
          )
        ),
      });
    }

    setPlusOpen(true);
  }

  /* =======================================================
     CREATE CHAT
  ======================================================= */

  function createConversation(
    specialist: Specialist,
    existingChats = conversations
  ) {
    const now =
      new Date().toISOString();

    const welcome =
      getWelcomeMessage(
        specialist
      );

    const id =
      createChatId();

    const conversation: StoredConversation =
      {
        id,
        title:
          specialist.id ===
          "general"
            ? "New chat"
            : `${specialist.name} chat`,
        specialistId:
          specialist.id,
        specialistName:
          specialist.name,
        messages: [welcome],
        createdAt: now,
        updatedAt: now,
      };

    setActiveChat(id);

    setSelectedSpecialist(
      specialist
    );

    setMessages([welcome]);

    setConversations([
      conversation,
      ...existingChats.filter(
        hasUserMessage
      ),
    ]);

    setInput("");
    setPlusOpen(false);
    setMobileSidebar(false);

    focusComposer();
  }

  /* =======================================================
     OPEN CHAT
  ======================================================= */

  function openStoredConversation(
    conversation: StoredConversation,
    allChats = conversations
  ) {
    const specialist =
      SPECIALISTS.find(
        (item) =>
          item.id ===
          conversation.specialistId
      ) ?? {
        id:
          conversation.specialistId,
        name:
          conversation.specialistName,
        description:
          `Focused chat for ${conversation.specialistName}`,
        icon: "coronavirus",
      };

    setActiveChat(
      conversation.id
    );

    setSelectedSpecialist(
      specialist
    );

    setMessages(
      conversation.messages
    );

    setConversations(
      allChats.filter(
        hasUserMessage
      )
    );

    setPlusOpen(false);
    setMobileSidebar(false);

    focusComposer();
  }

  /* =======================================================
     SPECIALIST
  ======================================================= */

  function chooseSpecialist(
    specialist: Specialist
  ) {
    setPlusOpen(false);

    const chatId =
      currentChatIdRef.current;

    if (
      !hasUserMessages &&
      chatId
    ) {
      if (
        specialist.id ===
        selectedSpecialist.id
      ) {
        focusComposer();
        return;
      }

      const welcome =
        getWelcomeMessage(
          specialist
        );

      setSelectedSpecialist(
        specialist
      );

      setMessages([welcome]);

      setConversations(
        (previous) =>
          previous.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  specialistId:
                    specialist.id,
                  specialistName:
                    specialist.name,
                  title:
                    specialist.id ===
                    "general"
                      ? "New chat"
                      : `${specialist.name} chat`,
                  messages: [
                    welcome,
                  ],
                  updatedAt:
                    new Date().toISOString(),
                }
              : chat
          )
      );

      focusComposer();

      return;
    }

    createConversation(
      specialist
    );
  }

  function handleNewChat() {
    if (!hasUserMessages) {
      chooseSpecialist(
        SPECIALISTS[0]
      );

      setMobileSidebar(false);

      return;
    }

    createConversation(
      SPECIALISTS[0]
    );
  }

  function deleteConversation(
    event: React.MouseEvent,
    id: string
  ) {
    event.stopPropagation();

    const remaining =
      conversations.filter(
        (chat) =>
          chat.id !== id
      );

    if (
      id ===
      currentChatIdRef.current
    ) {
      createConversation(
        SPECIALISTS[0],
        remaining
      );
    } else {
      setConversations(
        remaining
      );
    }
  }

  /* =======================================================
     AI CONTEXT
  ======================================================= */

  function buildContext(
    fresh?: PredictionResponse | null
  ) {
    const context: Record<
      string,
      unknown
    > = {
      specialist: {
        id:
          selectedSpecialist.id,
        name:
          selectedSpecialist.name,
      },
    };

    if (
      selectedSpecialist.id !==
      "general"
    ) {
      context.focus_disease =
        selectedSpecialist.name;
    }

    const source =
      fresh ?? lastResult;

    if (source) {
      context.last_prediction = {
        prediction:
          source.prediction,
        confidence_percentage:
          source.confidence_percentage,
        severity:
          source.severity,
        recommendation:
          source.recommendation,
      };

      if (source.ai_report) {
        context.ai_report =
          source.ai_report;
      }
    }

    return context;
  }

  /* =======================================================
     ASK ASSISTANT
  ======================================================= */

  async function askAssistant(
    chatId: string,
    history: UiMessage[],
    fresh?: PredictionResponse | null
  ) {
    try {
      const response =
        await sendChat({
          messages:
            toApiMessages(
              history
            ),
          context:
            buildContext(fresh),
        });

      setLlmEnabled(
        response.llm_enabled ??
          false
      );

      appendMessage(
        chatId,
        response.message
      );
    } catch (error) {
      appendMessage(
        chatId,
        {
          role: "assistant",
          content:
            error instanceof
            Error
              ? `⚠ ${error.message}`
              : "Unable to get a response. Please check that the backend is running.",
          timestamp:
            new Date().toISOString(),
        }
      );
    }
  }

  /* =======================================================
     SEND PHOTO
  ======================================================= */

  async function sendWithPhoto(
    chatId: string,
    text: string,
    file: File,
    isFirst: boolean
  ) {
    let thumbnail:
      | string
      | undefined;

    try {
      thumbnail =
        await makeThumbnail(
          file
        );
    } catch {
      thumbnail =
        undefined;
    }

    const userMessage: UiMessage =
      {
        role: "user",
        content:
          text ||
          "Identify the disease in this photo.",
        timestamp:
          new Date().toISOString(),
        image: thumbnail,
      };

    appendMessage(
      chatId,
      userMessage,
      isFirst
        ? {
            title: text
              ? makeChatTitle(
                  text,
                  selectedSpecialist
                )
              : "Photo analysis",
          }
        : undefined
    );

    let prediction:
      PredictionResponse;

    try {
      setLoadingLabel(
        "Uploading photo…"
      );

      prediction =
        await predictImage(
          file,
          {
            includeGradcam: true,
            topK: 3,

            onProgress: (
              value: number
            ) => {
              setProgress(
                value
              );

              if (
                value >= 100
              ) {
                setLoadingLabel(
                  "Analyzing the leaf…"
                );
              }
            },
          }
        );
    } catch (error) {
      appendMessage(
        chatId,
        {
          role: "assistant",
          content:
            `⚠ ${
              error instanceof
              Error
                ? error.message
                : "The photo could not be analyzed."
            }\n\n` +
            "Try a sharper, closer photo of a single leaf, and check that the backend is running.",
          timestamp:
            new Date().toISOString(),
        }
      );

      return;
    }

    const scan =
      buildScanSummary(
        prediction
      );

    /* =====================================================
       SAVE PREDICTION HISTORY
    ===================================================== */

    const predictionHistoryItem: StoredPrediction =
      {
        id: createPredictionId(),

        prediction: String(
          prediction.prediction ??
            ""
        ),

        displayName:
          scan.displayName,

        confidence:
          scan.confidence,

        severity:
          scan.severity ||
          "None",

        recommendation:
          scan.recommendation,

        description:
          scan.description,

        symptoms:
          scan.symptoms,

        prevention:
          scan.prevention,

        management:
          scan.management,

        image: thumbnail,

        fileName: file.name,

        createdAt:
          new Date().toISOString(),
      };

    savePredictionHistory(
      predictionHistoryItem
    );

    setPredictionHistory(
      (previous) => [
        predictionHistoryItem,
        ...previous,
      ].slice(0, 100)
    );

    /* =====================================================
       CHAT SCAN MESSAGE
    ===================================================== */

    const scanMessage: UiMessage =
      {
        role: "assistant",
        content:
          scanIntro(scan),
        timestamp:
          new Date().toISOString(),
        scan,
      };

    appendMessage(
      chatId,
      scanMessage,
      isFirst && !text
        ? {
            title: `${scan.displayName} scan`,
          }
        : undefined
    );

    /* =====================================================
       SHARE WITH APP
    ===================================================== */

    readAsDataUrl(file)
      .then((source) =>
        setLastResult(
          prediction,
          source
        )
      )
      .catch(() =>
        setLastResult(
          prediction,
          undefined
        )
      );

    if (text) {
      setLoadingLabel(null);

      await askAssistant(
        chatId,
        [
          ...messages,
          userMessage,
          scanMessage,
        ],
        prediction
      );
    }
  }

  /* =======================================================
     SEND
  ======================================================= */

  async function send(
    text: string,
    file: File | null
  ) {
    const clean =
      text.trim();

    if (
      (!clean && !file) ||
      loading
    ) {
      return;
    }

    const chatId =
      currentChatIdRef.current;

    if (!chatId) return;

    const isFirst =
      !hasUserMessages;

    window.clearTimeout(
      noticeTimer.current
    );

    setNotice("");
    setInput("");
    setProgress(0);
    setLoading(true);
    setLoadingChatId(chatId);
    setLoadingLabel(null);

    try {
      if (file) {
        await sendWithPhoto(
          chatId,
          clean,
          file,
          isFirst
        );
      } else {
        const userMessage:
          UiMessage = {
            role: "user",
            content: clean,
            timestamp:
              new Date().toISOString(),
          };

        appendMessage(
          chatId,
          userMessage,
          isFirst
            ? {
                title:
                  makeChatTitle(
                    clean,
                    selectedSpecialist
                  ),
              }
            : undefined
        );

        await askAssistant(
          chatId,
          [
            ...messages,
            userMessage,
          ]
        );
      }
    } finally {
      setLoading(false);
      setLoadingChatId(null);
      setLoadingLabel(null);
      setProgress(0);

      focusComposer(true);
    }
  }

  function submitComposer() {
    const file =
      attachmentRef.current
        ?.file ?? null;

    if (
      (!input.trim() && !file) ||
      loading
    ) {
      return;
    }

    const text = input;

    clearAttachment();

    void send(
      text,
      file
    );
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (
      event.key !== "Enter" ||
      event.shiftKey
    ) {
      return;
    }

    if (
      isTouchRef.current
    ) {
      return;
    }

    if (
      event.nativeEvent
        .isComposing
    ) {
      return;
    }

    event.preventDefault();

    submitComposer();
  }

  /* =======================================================
     UI VALUES
  ======================================================= */

  const showDiseaseChip =
    selectedSpecialist.id !==
    "general";

  const placeholder =
    attachment
      ? "Add a question about this photo (optional)"
      : showDiseaseChip
      ? `Ask about ${selectedSpecialist.name}`
      : "Ask anything";

  /* =======================================================
     PLUS MENU
  ======================================================= */

  const plusMenu = (
    <div
      role="menu"
      aria-label="Add to chat"
      style={{
        maxHeight:
          plusLayout.maxHeight,
      }}
      className={`absolute left-0 z-40 w-[390px] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.16)] ${
        plusLayout.placement ===
        "down"
          ? "top-full mt-3"
          : "bottom-full mb-3"
      }`}
    >
      {/* UPLOAD */}

      <MenuRow
        primary
        icon="add_photo_alternate"
        title="Upload a photo"
        subtitle="Find out which disease a leaf has"
        onClick={
          openPhotoPicker
        }
      />

      {/* CAMERA */}

      {isTouch && (
        <MenuRow
          icon="photo_camera"
          title="Take a photo"
          subtitle="Use your camera in the field"
          onClick={
            openCamera
          }
        />
      )}

      <div className="mx-2 my-1.5 border-t border-surface-muted" />

      {/* CHAT TYPES */}

      <p className="px-3 pb-1 pt-1.5 text-xs font-medium text-muted">
        {hasUserMessages
          ? "Start a new chat about"
          : "Chat about a disease"}
      </p>

      {SPECIALISTS.map(
        (specialist) => (
          <MenuRow
            key={
              specialist.id
            }
            icon={
              specialist.icon
            }
            title={
              specialist.name
            }
            subtitle={
              specialist.description
            }
            selected={
              selectedSpecialist.id ===
              specialist.id
            }
            onClick={() =>
              chooseSpecialist(
                specialist
              )
            }
          />
        )
      )}

      {/* PREDICTIONS */}

      <div className="mx-2 my-2 border-t border-surface-muted" />

      <div className="flex items-center justify-between px-3 pb-1 pt-1">
        <p className="text-xs font-medium text-muted">
          Recent Predictions
        </p>

        {predictionHistory.length >
          0 && (
          <span className="rounded-full bg-[#e9f4ef] px-2 py-0.5 text-xs font-semibold text-brand-900">
            {
              predictionHistory.length
            }
          </span>
        )}
      </div>

      {predictionHistory.length ===
      0 ? (
        <div className="px-3 py-5 text-center">
          <Icon
            name="image_search"
            className="text-[30px] text-[#a0aaa4]"
          />

          <p className="mt-1 text-xs text-muted">
            No predictions yet
          </p>

          <p className="mt-0.5 text-xs text-[#a0aaa4]">
            Upload a leaf photo
            to see results here.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5 px-1">
          {predictionHistory
            .slice(0, 10)
            .map(
              (
                prediction
              ) => (
                <PredictionHistoryItem
                  key={
                    prediction.id
                  }
                  prediction={
                    prediction
                  }
                  onClick={() => {
                    setSelectedPrediction(
                      prediction
                    );

                    setPlusOpen(
                      false
                    );
                  }}
                />
              )
            )}
        </div>
      )}
    </div>
  );

  /* =======================================================
     COMPOSER
  ======================================================= */

  const composer = (
    <div>
      {notice && (
        <p
          role="alert"
          className="mb-2 rounded-xl bg-danger-soft px-3.5 py-2 text-sm text-danger"
        >
          {notice}
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();

          submitComposer();
        }}
        className="rounded-[28px] border border-line bg-surface shadow-[0_2px_10px_rgba(0,0,0,0.04)] focus-within:border-[#c9d3ce] focus-within:shadow-[0_6px_24px_rgba(0,0,0,0.08)]"
      >
        {/* ATTACHMENT / DISEASE */}

        {(attachment ||
          showDiseaseChip) && (
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
            {attachment && (
              <div className="relative h-14 w-14 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    attachment.previewUrl
                  }
                  alt="Photo to analyze"
                  className="h-full w-full rounded-xl border border-line object-cover"
                />

                <button
                  type="button"
                  onClick={
                    clearAttachment
                  }
                  aria-label="Remove photo"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white"
                >
                  <Icon
                    name="close"
                    className="text-[14px]"
                  />
                </button>
              </div>
            )}

            {showDiseaseChip && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e9f4ef] py-1 pl-2.5 pr-2.5 text-sm font-medium text-brand-900">
                <Icon
                  name={
                    selectedSpecialist.icon
                  }
                  className="text-[17px]"
                />

                {
                  selectedSpecialist.name
                }

                {isEmpty && (
                  <button
                    type="button"
                    onClick={() =>
                      chooseSpecialist(
                        SPECIALISTS[0]
                      )
                    }
                    className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-[#d3e8de]"
                  >
                    <Icon
                      name="close"
                      className="text-[15px]"
                    />
                  </button>
                )}
              </span>
            )}
          </div>
        )}

        <div className="flex items-end gap-1.5 px-2.5 py-2">
          {/* PLUS */}

          <div
            ref={plusRef}
            className="relative shrink-0"
          >
            <button
              type="button"
              onClick={
                togglePlus
              }
              aria-label="Add a photo or choose a disease"
              aria-haspopup="menu"
              aria-expanded={
                plusOpen
              }
              className={`flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-surface-muted ${focusRing} ${
                plusOpen
                  ? "bg-surface-muted"
                  : ""
              }`}
            >
              <Icon
                name="add"
                className={`text-[30px] transition-transform ${
                  plusOpen
                    ? "rotate-45"
                    : ""
                }`}
              />
            </button>

            {plusOpen &&
              plusMenu}
          </div>

          {/* TEXTAREA */}

          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) =>
              setInput(
                event.target.value
              )
            }
            onKeyDown={
              handleKeyDown
            }
            onPaste={
              handlePaste
            }
            rows={1}
            aria-label="Message"
            placeholder={
              placeholder
            }
            className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-1 py-[9px] text-[16px] leading-[22px] text-ink outline-none placeholder:text-muted"
          />

          {/* SEND */}

          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send message"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-900 text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-[#eceeed] disabled:text-[#a7adaa] ${focusRing}`}
          >
            {loading ? (
              <Icon
                name="progress_activity"
                className="animate-spin text-[22px]"
              />
            ) : (
              <Icon
                name="arrow_upward"
                className="text-[22px]"
              />
            )}
          </button>
        </div>
      </form>
    </div>
  );

  const disclaimer = (
    <p className="mt-2.5 text-center text-xs text-muted">
      WheatGuard AI can make mistakes.
      Verify important agricultural
      decisions with an agronomist.
    </p>
  );

  const showLoader =
    loading &&
    loadingChatId ===
      currentChatId;

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="flex h-full min-h-[650px] overflow-hidden bg-[#fcfcfc] text-ink">
      {/* ===================================================
          PREDICTION DETAILS
      =================================================== */}

      {selectedPrediction && (
        <PredictionDetails
          prediction={
            selectedPrediction
          }
          onClose={() =>
            setSelectedPrediction(
              null
            )
          }
        />
      )}

      {/* ===================================================
          FILE INPUTS
      =================================================== */}

      <input
        ref={fileInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(event) => {
          attachFile(
            event.target.files?.[0]
          );

          event.target.value = "";
        }}
      />

      <input
        ref={cameraInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        capture="environment"
        className="hidden"
        onChange={(event) => {
          attachFile(
            event.target.files?.[0]
          );

          event.target.value = "";
        }}
      />

      {/* ===================================================
          MOBILE OVERLAY
      =================================================== */}

      {mobileSidebar && (
        <button
          type="button"
          aria-label="Close chat history"
          onClick={() =>
            setMobileSidebar(
              false
            )
          }
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
        />
      )}

      {/* ===================================================
          SIDEBAR
      =================================================== */}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-line bg-[#f7f7f6] transition-transform lg:static lg:translate-x-0 ${
          mobileSidebar
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 pb-1 pt-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-900 text-white">
              <Icon
                name="grass"
                className="text-[18px]"
              />
            </div>

            <span className="text-[15px] font-semibold">
              WheatGuard AI
            </span>
          </div>

          <button
            type="button"
            onClick={() =>
              setMobileSidebar(
                false
              )
            }
            aria-label="Close chat history"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#666] hover:bg-line lg:hidden"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* NEW CHAT */}

        <div className="px-3 pb-2 pt-3">
          <button
            type="button"
            onClick={
              handleNewChat
            }
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-line ${focusRing}`}
          >
            <Icon
              name="edit_square"
              className="text-[20px]"
            />

            New chat
          </button>
        </div>

        {/* HISTORY */}

        <nav
          aria-label="Chat history"
          className="flex-1 overflow-y-auto px-3 pb-3"
        >
          {historyGroups.length ===
          0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted">
              Your chats will
              show up here.
            </p>
          ) : (
            historyGroups.map(
              (group) => (
                <div
                  key={
                    group.label
                  }
                  className="mb-3"
                >
                  <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted">
                    {
                      group.label
                    }
                  </p>

                  <div className="space-y-0.5">
                    {group.items.map(
                      (
                        conversation
                      ) => {
                        const isDisease =
                          conversation.specialistId !==
                          "general";

                        const specialist =
                          SPECIALISTS.find(
                            (item) =>
                              item.id ===
                              conversation.specialistId
                          );

                        return (
                          <div
                            key={
                              conversation.id
                            }
                            className={`group flex items-center rounded-xl ${
                              conversation.id ===
                              currentChatId
                                ? "bg-[#e9f0ec]"
                                : "hover:bg-line"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                openStoredConversation(
                                  conversation
                                )
                              }
                              className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left ${focusRing}`}
                            >
                              <Icon
                                name={
                                  isDisease
                                    ? specialist?.icon ??
                                      "coronavirus"
                                    : "chat_bubble_outline"
                                }
                                className={`text-[18px] ${
                                  isDisease
                                    ? "text-brand-700"
                                    : "text-muted"
                                }`}
                              />

                              <span className="min-w-0 flex-1 truncate text-sm">
                                {
                                  conversation.title
                                }
                              </span>
                            </button>

                            <button
                              type="button"
                              title="Delete chat"
                              aria-label={`Delete chat: ${conversation.title}`}
                              onClick={(
                                event
                              ) =>
                                deleteConversation(
                                  event,
                                  conversation.id
                                )
                              }
                              className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-danger"
                            >
                              <Icon
                                name="delete"
                                className="text-[18px]"
                              />
                            </button>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              )
            )
          )}
        </nav>

        {/* FOOTER */}

        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-xl p-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-900 text-xs font-bold text-white">
              WG
            </div>

            <div>
              <p className="text-sm font-medium">
                WheatGuard AI
              </p>

              <p className="text-xs text-muted">
                Agronomy assistant
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ===================================================
          MAIN
      =================================================== */}

      <main
        ref={mainRef}
        onDragEnter={(event) => {
          if (!hasFiles(event))
            return;

          event.preventDefault();

          dragDepth.current +=
            1;

          setDragging(true);
        }}
        onDragOver={(event) => {
          if (hasFiles(event))
            event.preventDefault();
        }}
        onDragLeave={(event) => {
          if (!hasFiles(event))
            return;

          dragDepth.current =
            Math.max(
              0,
              dragDepth.current -
                1
            );

          if (
            dragDepth.current ===
            0
          ) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          if (!hasFiles(event))
            return;

          event.preventDefault();

          dragDepth.current = 0;

          setDragging(false);

          attachFile(
            event.dataTransfer
              .files?.[0]
          );
        }}
        className="relative flex min-w-0 flex-1 flex-col"
      >
        {/* DROP */}

        {dragging && (
          <div className="pointer-events-none absolute inset-3 z-50 flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-brand-600 bg-white/90">
            <Icon
              name="add_photo_alternate"
              className="text-[40px] text-brand-900"
            />

            <p className="text-base font-medium text-brand-900">
              Drop a photo to
              identify the disease
            </p>
          </div>
        )}

        {/* HEADER */}

        <header
          className={`flex h-14 shrink-0 items-center justify-between gap-3 border-b px-3 sm:px-5 ${
            isEmpty
              ? "border-transparent"
              : "border-line"
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setMobileSidebar(
                  true
                )
              }
              aria-label="Open chat history"
              className={`flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted lg:hidden ${focusRing}`}
            >
              <Icon name="menu" />
            </button>

            <span className="text-[15px] font-semibold lg:hidden">
              WheatGuard AI
            </span>

            {showDiseaseChip && (
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-[#e9f4ef] py-1 pl-2 pr-3 text-[13px] font-medium text-brand-900">
                <Icon
                  name={
                    selectedSpecialist.icon
                  }
                  className="text-[16px]"
                />

                <span className="truncate">
                  {
                    selectedSpecialist.name
                  }
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {llmEnabled && (
              <span className="hidden items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-[#666] sm:flex">
                <Icon
                  name="auto_awesome"
                  className="text-[15px]"
                />
                OpenRouter
              </span>
            )}

            {!isEmpty && (
              <button
                type="button"
                onClick={
                  handleNewChat
                }
                title="New chat"
                aria-label="New chat"
                className={`flex h-10 w-10 items-center justify-center rounded-lg text-[#666] hover:bg-surface-muted ${focusRing}`}
              >
                <Icon name="edit_square" />
              </button>
            )}
          </div>
        </header>

        {/* =================================================
            EMPTY
        ================================================= */}

        {isEmpty ? (
          <div className="flex flex-1 overflow-y-auto px-4 pb-20 sm:px-6">
            <div className="m-auto w-full max-w-[720px] py-6">
              <h1 className="mb-8 text-center text-[28px] leading-tight text-ink sm:text-[34px]">
                {getHeading(
                  selectedSpecialist
                )}
              </h1>

              {composer}

              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={
                    openPhotoPicker
                  }
                  className={`inline-flex items-center gap-1.5 rounded-full border border-[#cfe0d7] bg-[#f1f7f4] px-3.5 py-2 text-sm font-medium text-brand-900 hover:bg-[#e4f0e9] ${focusRing}`}
                >
                  <Icon
                    name="add_photo_alternate"
                    className="text-[18px]"
                  />

                  Identify a disease
                  from a photo
                </button>

                {getSuggestions(
                  selectedSpecialist
                ).map(
                  (suggestion) => (
                    <button
                      key={
                        suggestion
                      }
                      type="button"
                      onClick={() => {
                        setInput(
                          suggestion
                        );

                        focusComposer(
                          true
                        );
                      }}
                      className={`rounded-full border border-line bg-surface px-3.5 py-2 text-sm text-muted hover:bg-surface-muted ${focusRing}`}
                    >
                      {suggestion}
                    </button>
                  )
                )}
              </div>

              <div className="mt-8">
                {disclaimer}
              </div>
            </div>
          </div>
        ) : (
          /* =================================================
             CONVERSATION
          ================================================= */

          <>
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto"
            >
              <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-8 sm:px-6">
                {messages.map(
                  (
                    message,
                    index
                  ) => {
                    const isUser =
                      message.role ===
                      "user";

                    const isLast =
                      index ===
                      messages.length -
                        1;

                    if (isUser) {
                      return (
                        <div
                          key={`${message.timestamp}-${index}`}
                          data-message-index={
                            index
                          }
                          className="mb-7 flex justify-end"
                        >
                          <div
                            className={`max-w-[85%] rounded-3xl bg-surface-muted text-[15px] text-ink sm:max-w-[80%] ${
                              message.image
                                ? "p-1.5"
                                : "px-4 py-2.5"
                            }`}
                          >
                            {message.image && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={
                                  message.image
                                }
                                alt="Photo you sent"
                                className="max-h-60 w-auto max-w-full rounded-[18px] object-cover"
                              />
                            )}

                            <p
                              className={`whitespace-pre-wrap leading-7 ${
                                message.image
                                  ? "px-2.5 pb-1 pt-1.5"
                                  : ""
                              }`}
                            >
                              {
                                message.content
                              }
                            </p>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={`${message.timestamp}-${index}`}
                        data-message-index={
                          index
                        }
                        className="group mb-7 flex gap-3.5"
                      >
                        <AssistantAvatar />

                        <div className="min-w-0 flex-1 text-[15px] text-[#252826]">
                          <MessageText
                            content={
                              message.content
                            }
                          />

                          {message.scan && (
                            <ScanResultCard
                              scan={
                                message.scan
                              }
                            />
                          )}

                          {message.scan &&
                            isLast &&
                            !loading && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {scanFollowUps(
                                  message.scan
                                ).map(
                                  (
                                    question
                                  ) => (
                                    <button
                                      key={
                                        question
                                      }
                                      type="button"
                                      onClick={() =>
                                        void send(
                                          question,
                                          null
                                        )
                                      }
                                      className={`rounded-full border border-[#dfe6e2] bg-surface px-3.5 py-1.5 text-[13px] text-brand-900 hover:bg-[#f0f6f3] ${focusRing}`}
                                    >
                                      {
                                        question
                                      }
                                    </button>
                                  )
                                )}
                              </div>
                            )}

                          <div className="-ml-2 mt-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                            <CopyButton
                              text={
                                message.content
                              }
                            />
                          </div>
                        </div>
                      </div>
                    );
                  }
                )}

                {/* LOADING */}

                {showLoader && (
                  <div
                    className="mb-7 flex gap-3.5"
                    role="status"
                    aria-live="polite"
                  >
                    <AssistantAvatar />

                    {loadingLabel ? (
                      <div className="w-full max-w-[280px] pt-1.5">
                        <p className="text-sm text-[#5f6b65]">
                          {
                            loadingLabel
                          }

                          {loadingLabel.startsWith(
                            "Uploading"
                          ) &&
                            progress >
                              0 &&
                            progress <
                              100 &&
                            ` ${Math.round(
                              progress
                            )}%`}
                        </p>

                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e9ecea]">
                          <div
                            className="h-full rounded-full bg-brand-600 transition-[width] duration-200"
                            style={
                              progress >
                                0 &&
                              progress <
                                100
                                ? {
                                    width: `${progress}%`,
                                  }
                                : undefined
                            }
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 pt-3.5">
                        {[0, 150, 300].map(
                          (
                            delay
                          ) => (
                            <span
                              key={
                                delay
                              }
                              className="h-2 w-2 animate-bounce rounded-full bg-[#9aa39e]"
                              style={{
                                animationDelay: `${delay}ms`,
                              }}
                            />
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div
                  ref={bottomRef}
                />
              </div>
            </div>

            {/* COMPOSER */}

            <div className="shrink-0 px-3 pb-3 pt-1 sm:px-6">
              <div className="mx-auto w-full max-w-3xl">
                {composer}

                {disclaimer}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}