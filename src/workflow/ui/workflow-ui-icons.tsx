import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export function WorkflowLogoIcon({ size = 15 }: { size?: number }) {
  return (
    <Svg size={size} stroke="#fff" strokeWidth="2.1">
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M8 6h6a2 2 0 0 1 2 2v2M8 18h6a2 2 0 0 0 2-2v-2" />
    </Svg>
  );
}

export function ValidateIcon({ size = 15 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </Svg>
  );
}

export function SaveIcon({ size = 15 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </Svg>
  );
}

export function RunIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M7 5.5v13l11-6.5z" />
    </svg>
  );
}

export function ReloadIcon({ size = 15 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </Svg>
  );
}

export function InspectorIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M11 4H4v16h16v-7" />
      <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" />
    </Svg>
  );
}

export function DeleteIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth="1.8">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </Svg>
  );
}

export function EmptyInspectorIcon({ size = 22 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth="1.8">
      <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0H5a2 2 0 0 1-2-2v-4m6 6h10a2 2 0 0 0 2-2v-4" />
    </Svg>
  );
}

export function PencilIcon({ size = 13 }: { size?: number }) {
  return (
    <Svg size={size} stroke="#9aa0aa" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </Svg>
  );
}

export function RunPanelIcon({ size = 15 }: { size?: number }) {
  return (
    <Svg size={size} stroke="#5b5bd6">
      <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
    </Svg>
  );
}

export function DuplicateIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth="1.8">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </Svg>
  );
}

export function StatusCheckIcon({ size = 13 }: { size?: number }) {
  return (
    <Svg size={size} stroke="#10b981" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" />
    </Svg>
  );
}

export function BigPlayIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M7 5.5v13l11-6.5z" />
    </svg>
  );
}
