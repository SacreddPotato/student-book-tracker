import { QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { AppBackend } from "../core/backend/types";
import {
  getTranslation,
  type Language,
  type TranslationKey,
} from "../core/i18n";
import { createAppQueryClient } from "./query-client";

export type ScreenId = "students" | "books" | "logs" | "settings";
export type NavigationBlocker = (target: ScreenId) => boolean | Promise<boolean>;
export type Notice = { id: string; tone: "success" | "info" | "error"; message: string };

type I18nValue = {
  language: Language;
  setLanguage(language: Language): void;
  t(key: TranslationKey, values?: Record<string, string | number>): string;
};
type NavigationValue = {
  screen: ScreenId;
  requestScreen(target: ScreenId): Promise<boolean>;
  setBlocker(blocker: NavigationBlocker | null): void;
};
type NoticeValue = {
  notices: Notice[];
  announce(message: string, tone?: Notice["tone"]): void;
  dismiss(id: string): void;
};

const BackendContext = createContext<AppBackend | null>(null);
const I18nContext = createContext<I18nValue | null>(null);
const NavigationContext = createContext<NavigationValue | null>(null);
const NoticeContext = createContext<NoticeValue | null>(null);

export function AppProviders({
  backend,
  children,
  initialLanguage = "en",
}: {
  backend: AppBackend;
  children: ReactNode;
  initialLanguage?: Language;
}) {
  const [queryClient] = useState(createAppQueryClient);
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [screen, setScreen] = useState<ScreenId>("students");
  const blocker = useRef<NavigationBlocker | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const noticeSequence = useRef(0);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  const requestScreen = useCallback(async (target: ScreenId) => {
    if (target === screen) return true;
    if (blocker.current && !(await blocker.current(target))) return false;
    setScreen(target);
    return true;
  }, [screen]);

  const navigation = useMemo<NavigationValue>(() => ({
    screen,
    requestScreen,
    setBlocker(next) { blocker.current = next; },
  }), [requestScreen, screen]);
  const i18n = useMemo<I18nValue>(() => ({
    language,
    setLanguage,
    t: (key, values) => getTranslation(language, key, values),
  }), [language]);
  const noticeValue = useMemo<NoticeValue>(() => ({
    notices,
    announce(message, tone = "success") {
      const id = `notice-${++noticeSequence.current}`;
      setNotices((current) => [...current, { id, message, tone }]);
      window.setTimeout(() => {
        setNotices((current) => current.filter((notice) => notice.id !== id));
      }, 4000);
    },
    dismiss(id) {
      setNotices((current) => current.filter((notice) => notice.id !== id));
    },
  }), [notices]);

  return (
    <QueryClientProvider client={queryClient}>
      <BackendContext value={backend}>
        <I18nContext value={i18n}>
          <NavigationContext value={navigation}>
            <NoticeContext value={noticeValue}>{children}</NoticeContext>
          </NavigationContext>
        </I18nContext>
      </BackendContext>
    </QueryClientProvider>
  );
}

function required<T>(value: T | null, name: string): T {
  if (!value) throw new Error(`${name} must be used inside AppProviders.`);
  return value;
}

export const useBackend = () => required(useContext(BackendContext), "useBackend");
export const useI18n = () => required(useContext(I18nContext), "useI18n");
export const useNavigation = () => required(useContext(NavigationContext), "useNavigation");
export const useNotices = () => required(useContext(NoticeContext), "useNotices");
