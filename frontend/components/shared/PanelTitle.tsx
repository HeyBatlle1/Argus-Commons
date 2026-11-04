'use client';

/** Editorial panel heading: roman numeral, serif title, mono kicker. */
export function PanelTitle({
  numeral, title, kicker, right,
}: { numeral?: string; title: string; kicker?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 px-4 pt-3 pb-2.5 border-b border-argus-border flex-shrink-0">
      <div className="flex items-baseline gap-2 min-w-0">
        {numeral && <span className="numeral text-[13px]">{numeral}</span>}
        <h2 className="display text-[19px] leading-none text-argus-textBright italic whitespace-nowrap">{title}</h2>
        {kicker && <span className="kicker truncate ml-1">{kicker}</span>}
      </div>
      {right && <div className="flex items-center gap-2 flex-shrink-0">{right}</div>}
    </div>
  );
}
