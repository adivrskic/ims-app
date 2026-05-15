"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import styles from "./CornerButton.module.css";

type Variant = "primary" | "ghost" | "accent" | "danger";
type Size = "default" | "sm";

interface BaseProps {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}

type ButtonProps = BaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

interface LinkProps extends BaseProps {
  href: string;
  prefetch?: boolean;
  target?: string;
  rel?: string;
}

function classNames({
  variant = "primary",
  size = "default",
  loading,
  fullWidth,
  disabled,
  className,
}: {
  variant: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const isDisabled = disabled || loading;
  return [
    "bracket-hover",
    styles.btn,
    styles[variant],
    size === "sm" ? styles.sm : "",
    isDisabled ? styles.disabled : "",
    fullWidth ? styles.full : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function CornerButton({
  children,
  variant = "primary",
  size = "default",
  loading,
  fullWidth,
  ariaLabel,
  disabled,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      className={classNames({ variant, size, loading, fullWidth, disabled, className })}
      type={type}
      disabled={isDisabled}
      aria-label={ariaLabel}
      aria-busy={loading ? "true" : undefined}
      {...props}
    >
      <span className={styles.label}>{children}</span>
      {loading && <span className={styles.spinner} aria-hidden="true" />}
    </button>
  );
}

export function CornerLink({
  children,
  variant = "primary",
  size = "default",
  fullWidth,
  ariaLabel,
  className,
  href,
  prefetch,
  target,
  rel,
}: LinkProps) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      target={target}
      rel={rel}
      aria-label={ariaLabel}
      className={classNames({ variant, size, fullWidth, className })}
    >
      <span className={styles.label}>{children}</span>
    </Link>
  );
}
