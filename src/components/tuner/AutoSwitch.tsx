import { memo } from "react";
import Switch from "../ui/Switch";

interface Props {
  /** 是否开启 */
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}

/**
 * 调音器的「自动识别弦」开关：就是通用开关（components/ui/Switch.tsx）
 * 加了一句固定文案。页面里只用这一个开关样式，改外观请改通用那个。
 */
function AutoSwitch({ on, disabled, onChange }: Props) {
  return (
    <Switch on={on} disabled={disabled} onChange={onChange} label="自动识别弦" />
  );
}

export default memo(AutoSwitch);
