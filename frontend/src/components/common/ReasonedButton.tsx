import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ReasonedButtonProps = ButtonProps & {
  /** 실행할 수 없는 이유. 비활성 버튼에는 항상 이유를 함께 노출합니다. */
  disabledReason?: string | null;
  reasonClassName?: string;
  /** 버튼을 감싸는 컨테이너 클래스(레이아웃용) */
  wrapperClassName?: string;
};

export const ReasonedButton = ({
  disabledReason,
  reasonClassName,
  wrapperClassName,
  disabled,
  children,
  ...props
}: ReasonedButtonProps) => {
  const blocked = Boolean(disabled) || Boolean(disabledReason);

  return (
    <span className={cn("inline-flex flex-col items-start gap-1", wrapperClassName)}>
      <Button {...props} disabled={blocked}>
        {children}
      </Button>
      {disabledReason ? (
        <span className={cn("text-caption text-warning", reasonClassName)}>
          {disabledReason}
        </span>
      ) : null}
    </span>
  );
};
