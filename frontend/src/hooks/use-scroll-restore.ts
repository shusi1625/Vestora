import { useEffect } from "react";

/**
 * 목록 화면의 스크롤 위치를 세션 동안 기억합니다.
 * 상세 화면을 다녀와도 보던 위치로 돌아올 수 있게 합니다.
 */
export function useScrollRestore(key: string) {
  useEffect(() => {
    const storageKey = `vestora:scroll:${key}`;
    const saved = window.sessionStorage.getItem(storageKey);
    if (saved) {
      const top = Number(saved);
      if (Number.isFinite(top) && top > 0) {
        window.requestAnimationFrame(() => window.scrollTo({ top, behavior: "auto" }));
      }
    }

    const onScroll = () => {
      window.sessionStorage.setItem(storageKey, String(window.scrollY));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, [key]);
}
