import { useCallback, useMemo, useState, type ReactNode } from "react";

import {
  ScenarioContext,
  initialScenario,
  readInitialScenario,
  type ScenarioContextValue,
  type ScenarioState,
} from "./scenario-context";
import type { ScreenId } from "@/prototype/scenarios";

/**
 * 프로토타입 전용 시나리오 제공자.
 * 명세의 상태 시안을 화면에서 즉시 재현할 수 있게 지갑·네트워크·데이터·거래 결과를 제어합니다.
 */
export const ScenarioProvider = ({ children }: { children: ReactNode }) => {
  const [scenario, setState] = useState<ScenarioState>(() =>
    readInitialScenario(window.location.search),
  );

  const setScenario = useCallback((patch: Partial<ScenarioState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setScreenScenario = useCallback((screen: ScreenId, value: string) => {
    setState((prev) => ({ ...prev, screens: { ...prev.screens, [screen]: value } }));
  }, []);

  const resetScenario = useCallback(() => setState(initialScenario), []);

  const value = useMemo<ScenarioContextValue>(
    () => ({ scenario, setScenario, setScreenScenario, resetScenario }),
    [scenario, setScenario, setScreenScenario, resetScenario],
  );

  return <ScenarioContext.Provider value={value}>{children}</ScenarioContext.Provider>;
};
