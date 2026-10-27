import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

type Align = "left" | "right" | "center";

const ALIGN: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

/**
 * Shared table cells. Every list page used to define its own `Th`/`Td`
 * (19 copies) and almost none set `scope`, so screen readers could not
 * associate a cell with its column header. Use these instead.
 */
export function Th({
  children,
  className = "",
  align = "left",
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & {
  children?: ReactNode;
  align?: Align;
}) {
  return (
    <th
      scope="col"
      className={`label-text px-14 py-12 font-normal whitespace-nowrap ${ALIGN[align]} ${className}`.trim()}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
  align = "left",
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & {
  children?: ReactNode;
  align?: Align;
}) {
  return (
    <td
      className={`px-14 py-12 align-middle ${ALIGN[align]} ${className}`.trim()}
      {...rest}
    >
      {children}
    </td>
  );
}
