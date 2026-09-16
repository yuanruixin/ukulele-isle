import {
  isVirtualInput,
  type TunerDevice,
  type TunerStatus,
  type TunerTelemetry,
} from "../../hooks/useTuner";

const STATUS_TEXT: Record<TunerStatus, string> = {
  idle: "未开始",
  starting: "启动中",
  listening: "聆听中",
  error: "出错",
};

const PERMISSION_TEXT: Record<string, string> = {
  granted: "已授权",
  prompt: "待授权（点击下方按钮）",
  denied: "已拒绝 —— 请在浏览器地址栏放开麦克风权限",
  unknown: "未知（浏览器不支持查询）",
};

function Row({
  label,
  value,
  wrap,
  danger,
}: {
  label: string;
  value: string;
  wrap?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="text-secondary w-[52px] shrink-0">{label}</span>
      <span
        className={`min-w-0 flex-1 tabular-nums ${wrap ? "" : "truncate"}`}
        style={danger ? { color: "#ff3b30" } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

interface Props {
  status: TunerStatus;
  device: TunerDevice | null;
  permission: string;
  inputs: MediaDeviceInfo[];
  deviceId: string;
  onSelectDevice: (id: string) => void;
  telemetry: TunerTelemetry;
  log: string[];
}

/**
 * 信号诊断面板：把「输入设备 → 波形 → 基频检测 → 判定」的每一步摊开显示，
 * 用于定位「听到声音却没有读数」究竟卡在哪一环。
 */
export default function TunerDiagnostics({
  status,
  device,
  permission,
  inputs,
  deviceId,
  onSelectDevice,
  telemetry,
  log,
}: Props) {
  const pct = Math.min(100, Math.round(telemetry.rms * 1250));
  const virtual = isVirtualInput(device?.label);
  // 推荐一个真实设备（名字里没有虚拟关键词的第一个）
  const suggestion = inputs.find(
    (d) => d.deviceId !== deviceId && d.label && !isVirtualInput(d.label),
  );

  return (
    <section className="card px-3.5 py-2 text-[11px] leading-[1.5]">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold">信号诊断</span>
        <span className="text-secondary">{STATUS_TEXT[status]}</span>
      </div>

      <div className="space-y-0.5">
        {/* 输入设备选择 */}
        <div className="flex items-center gap-2">
          <span className="text-secondary w-[52px] shrink-0">麦克风</span>
          <select
            value={deviceId}
            onChange={(e) => onSelectDevice(e.target.value)}
            aria-label="选择输入设备"
            className="min-w-0 flex-1 truncate rounded-md px-1.5 py-[2px] text-[11px] outline-none"
            style={{
              background: "var(--bg)",
              color: "var(--text)",
              border: "0.5px solid var(--border)",
            }}
          >
            <option value="">系统默认</option>
            {inputs.map((d, i) => (
              <option key={d.deviceId || `input-${i}`} value={d.deviceId}>
                {d.label || `输入设备 ${i + 1}`}
              </option>
            ))}
          </select>
        </div>

        <Row
          label="权限"
          value={PERMISSION_TEXT[permission] ?? permission}
          danger={permission === "denied"}
        />
        <Row
          label="电平"
          value={`RMS ${telemetry.rms.toFixed(4)} · 峰值 ${telemetry.peak.toFixed(3)}`}
        />
        <Row
          label="基频"
          value={
            telemetry.freq
              ? `${telemetry.freq.toFixed(1)} Hz · 置信度 ${telemetry.clarity.toFixed(2)}`
              : `未检出 · 置信度 ${telemetry.clarity.toFixed(2)}`
          }
        />
        <Row
          label="帧"
          value={`${telemetry.frames} 帧 · 采纳 ${telemetry.adopted}${
            device ? ` · ${device.sampleRate}Hz` : ""
          }`}
        />
      </div>

      {/* 虚拟声卡告警：这类设备不采集真实声音，波形恒为 0 */}
      {virtual && (
        <div
          className="mt-1.5 rounded-md px-2 py-1.5 text-[10px] leading-[1.45]"
          style={{ background: "rgba(255, 159, 10, 0.14)", color: "#b45309" }}
        >
          当前输入是<strong>虚拟音频设备</strong>（{device?.label}），它收不到真实声音，
          所以电平一直是 0。请在系统「声音 → 输入」里选择麦克风
          {suggestion && (
            <>
              ，或
              <button
                type="button"
                onClick={() => onSelectDevice(suggestion.deviceId)}
                className="mx-0.5 font-semibold underline"
              >
                切到「{suggestion.label}」
              </button>
            </>
          )}
          。
        </div>
      )}

      {/* 电平条 */}
      <div
        className="mt-1.5 h-1 w-full overflow-hidden rounded-full"
        style={{ background: "var(--border)" }}
        aria-hidden
      >
        <div
          className="h-full rounded-full transition-[width] duration-75 ease-out"
          style={{ width: `${pct}%`, background: "var(--accent)" }}
        />
      </div>

      {/* 判定 */}
      <p className="mt-1.5 font-medium break-words">{telemetry.verdict}</p>

      {/* 日志：最近几次判定（最新在上） */}
      <div
        className="mt-1 border-t pt-0.5"
        style={{ borderColor: "var(--border)" }}
        aria-label="判定日志"
      >
        <div className="max-h-[32px] space-y-0.5 overflow-hidden font-mono text-[10px] leading-[1.45]">
          {log.length === 0 ? (
            <div className="text-secondary">—</div>
          ) : (
            log.map((line, i) => (
              <div
                key={`${line}-${i}`}
                className="truncate"
                style={{ opacity: i === 0 ? 1 : 0.55 }}
              >
                {line}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
