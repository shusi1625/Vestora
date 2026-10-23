import type { StatusTone } from "@/lib/status";

/**
 * 상태 톤별 클래스. 색만으로 상태를 구분하지 않도록 라벨과 항상 함께 사용합니다.
 * (Tailwind가 정적 클래스를 인식할 수 있게 문자열을 그대로 나열합니다.)
 */
export const toneChipClass: Record<StatusTone, string> = {
  claimable: "border-claimable-border bg-claimable-bg text-claimable",
  scheduled: "border-scheduled-border bg-scheduled-bg text-scheduled",
  warning: "border-warning-border bg-warning-bg text-warning",
  void: "border-void-border bg-void-bg text-void",
  listed: "border-listed-border bg-listed-bg text-listed",
  muted: "border-border bg-muted text-muted-foreground",
};

export const toneDotClass: Record<StatusTone, string> = {
  claimable: "bg-claimable",
  scheduled: "bg-scheduled",
  warning: "bg-warning",
  void: "bg-void",
  listed: "bg-listed",
  muted: "bg-muted-foreground",
};

export const toneTextClass: Record<StatusTone, string> = {
  claimable: "text-claimable",
  scheduled: "text-scheduled",
  warning: "text-warning",
  void: "text-void",
  listed: "text-listed",
  muted: "text-muted-foreground",
};

export const toneSurfaceClass: Record<StatusTone, string> = {
  claimable: "border-claimable-border bg-claimable-bg",
  scheduled: "border-scheduled-border bg-scheduled-bg",
  warning: "border-warning-border bg-warning-bg",
  void: "border-void-border bg-void-bg",
  listed: "border-listed-border bg-listed-bg",
  muted: "border-border bg-muted",
};
