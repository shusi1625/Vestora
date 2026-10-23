import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";

import { InlineNotice } from "@/components/common/InlineNotice";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DataCondition } from "@/lib/types";
import { ACCOUNTS, type AccountKey } from "@/prototype/fixtures";
import {
  DATA_CONDITION_OPTIONS,
  NETWORK_STATE_OPTIONS,
  NETWORK_SWITCH_OPTIONS,
  SCREEN_SCENARIOS,
  TX_OUTCOME_OPTIONS,
  WALLET_STATE_OPTIONS,
  getScreenId,
  type NetworkSimState,
  type NetworkSwitchResult,
  type TxOutcome,
  type WalletSimState,
} from "@/prototype/scenarios";

import { useScenario } from "@/providers/scenario-context";

const ACCOUNT_KEYS: AccountKey[] = ["A", "B", "C"];

type FieldProps = {
  label: string;
  value: string;
  options: { value: string; key: string }[];
  onChange: (value: string) => void;
};

const Field = ({ label, value, options, onChange }: FieldProps) => {
  const { t } = useTranslation();

  return (
    <label className="space-y-1">
      <span className="block text-caption font-medium text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {t(option.key)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
};

/**
 * 프로토타입 상태 전환 패널.
 * 명세 14장의 대표 상태 시안을 실제 화면에서 바로 재현하기 위한 도구입니다.
 * 입력한 가격·주소·필터는 상태를 바꿔도 초기화하지 않습니다.
 */
export const ScenarioPanel = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { scenario, setScenario, setScreenScenario, resetScenario } = useScenario();
  const [open, setOpen] = useState(false);

  const screenId = getScreenId(location.pathname);
  const screenOptions = screenId ? SCREEN_SCENARIOS[screenId] : null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-caption font-semibold shadow-floating transition-colors duration-fast hover:bg-accent"
      >
        <SlidersHorizontal aria-hidden className="size-3.5" />
        {t("proto.panel.open")}
      </button>
    );
  }

  return (
    <aside
      className="fixed bottom-4 right-4 z-40 max-h-[80vh] w-[min(92vw,340px)] overflow-y-auto rounded-lg border border-border bg-card p-3 shadow-floating"
      aria-label={t("proto.panel.title")}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <p className="text-body-sm font-semibold">{t("proto.panel.title")}</p>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={resetScenario}>
            <RotateCcw aria-hidden className="size-3.5" />
            {t("proto.panel.reset")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setOpen(false)}
            aria-label={t("common.close")}
          >
            <X aria-hidden className="size-3.5" />
          </Button>
        </div>
      </header>

      <InlineNotice tone="muted" className="mb-3">
        {t("proto.panel.note")}
      </InlineNotice>

      <div className="space-y-2.5">
        <Field
          label={t("proto.field.wallet")}
          value={scenario.wallet}
          options={WALLET_STATE_OPTIONS}
          onChange={(value) => setScenario({ wallet: value as WalletSimState })}
        />
        <label className="space-y-1">
          <span className="block text-caption font-medium text-muted-foreground">
            {t("proto.field.account")}
          </span>
          <Select
            value={scenario.account}
            onValueChange={(value) => setScenario({ account: value as AccountKey })}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {ACCOUNTS[key].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <Field
          label={t("proto.field.network")}
          value={scenario.network}
          options={NETWORK_STATE_OPTIONS}
          onChange={(value) => setScenario({ network: value as NetworkSimState })}
        />
        <Field
          label={t("proto.field.networkSwitch")}
          value={scenario.networkSwitchResult}
          options={NETWORK_SWITCH_OPTIONS}
          onChange={(value) =>
            setScenario({ networkSwitchResult: value as NetworkSwitchResult })
          }
        />
        <Field
          label={t("proto.field.data")}
          value={scenario.dataCondition}
          options={DATA_CONDITION_OPTIONS}
          onChange={(value) => setScenario({ dataCondition: value as DataCondition })}
        />
        <Field
          label={t("proto.field.txOutcome")}
          value={scenario.txOutcome}
          options={TX_OUTCOME_OPTIONS}
          onChange={(value) => setScenario({ txOutcome: value as TxOutcome })}
        />
        {screenId && screenOptions ? (
          <Field
            label={t("proto.field.screen")}
            value={scenario.screens[screenId]}
            options={screenOptions}
            onChange={(value) => setScreenScenario(screenId, value)}
          />
        ) : (
          <p className="text-caption text-muted-foreground">{t("proto.panel.noScreen")}</p>
        )}
        <p className="border-t border-border pt-2 text-caption text-muted-foreground">
          {t("proto.panel.accountHint")}
        </p>
      </div>
    </aside>
  );
};
