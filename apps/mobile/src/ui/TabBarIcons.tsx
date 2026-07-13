/**
 * The five bottom-tab glyphs (Home, Calendar, Log, Chat, Profile) traced from
 * the Pulse Dashboard design. Each is a 24×24 stroked icon; when `active` it is
 * stroked with the brand gradient, otherwise a faint white.
 */
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop, type SvgProps } from "react-native-svg";
import { color, gradient } from "./theme";

export type TabKey = "home" | "calendar" | "log" | "chat" | "profile";

const SW = 2;

/** Shared <Defs> gradient; id is unique per icon so ids never collide. */
function Grad({ id }: { id: string }) {
  return (
    <Defs>
      <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={gradient.brandColors[0]} />
        <Stop offset="0.55" stopColor={gradient.brandColors[1]} />
        <Stop offset="1" stopColor={gradient.brandColors[2]} />
      </LinearGradient>
    </Defs>
  );
}

function useStroke(key: TabKey, active: boolean): { stroke: string; grad: React.ReactNode } {
  if (!active) return { stroke: color.iconInactive, grad: null };
  const id = `tg-${key}`;
  return { stroke: `url(#${id})`, grad: <Grad id={id} /> };
}

const base: SvgProps = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none" };

export function TabIcon({ tab, active }: { tab: TabKey; active: boolean }) {
  const { stroke, grad } = useStroke(tab, active);

  switch (tab) {
    case "home":
      return (
        <Svg {...base}>
          {grad}
          <Path d="M4 11 L12 4 L20 11 V20 H14 V15 H10 V20 H4 Z" stroke={stroke} strokeWidth={SW} strokeLinejoin="round" />
        </Svg>
      );
    case "calendar":
      return (
        <Svg {...base}>
          {grad}
          <Rect x={4} y={5} width={16} height={15} rx={3} stroke={stroke} strokeWidth={SW} />
          <Path d="M4 10 H20 M8 3 V6 M16 3 V6" stroke={stroke} strokeWidth={SW} strokeLinecap="round" />
        </Svg>
      );
    case "log":
      return (
        <Svg {...base}>
          {grad}
          <Rect x={4} y={4} width={16} height={16} rx={5} stroke={stroke} strokeWidth={SW} />
          <Path d="M12 9 V15 M9 12 H15" stroke={stroke} strokeWidth={SW} strokeLinecap="round" />
        </Svg>
      );
    case "chat":
      return (
        <Svg {...base}>
          {grad}
          <Path
            d="M4 6 a2 2 0 0 1 2 -2 H18 a2 2 0 0 1 2 2 V15 a2 2 0 0 1 -2 2 H10 L6 21 V17 H6 a2 2 0 0 1 -2 -2 Z"
            stroke={stroke}
            strokeWidth={SW}
            strokeLinejoin="round"
          />
        </Svg>
      );
    case "profile":
      return (
        <Svg {...base}>
          {grad}
          <Circle cx={12} cy={8} r={4} stroke={stroke} strokeWidth={SW} />
          <Path d="M4 20.5 C4 16.5 8 14.5 12 14.5 C16 14.5 20 16.5 20 20.5" stroke={stroke} strokeWidth={SW} strokeLinecap="round" />
        </Svg>
      );
  }
}
