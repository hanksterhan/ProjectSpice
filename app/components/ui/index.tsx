import { useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Link } from "react-router";
import { appImageSrcSet, appImageUrl } from "~/lib/image-url";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const toneClass: Record<Tone, string> = {
  neutral: "border-rule bg-paper-2 text-ink",
  accent: "border-transparent bg-primary text-primary-foreground",
  success: "border-transparent bg-ok text-white",
  warning: "border-transparent bg-warn text-white",
  danger: "border-transparent bg-err text-white",
};

const feedbackToneClass: Record<Tone, string> = {
  neutral: "border-rule bg-paper-2 text-ink",
  accent: "border-info/30 bg-info/10 text-info",
  success: "border-ok/30 bg-ok/10 text-ok",
  warning: "border-warn/30 bg-warn/10 text-warn",
  danger: "border-err/30 bg-err/10 text-err",
};

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

export function Button({
  className,
  variant = "secondary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "ps-control inline-flex items-center justify-center gap-2 border font-medium transition-colors focus-visible:ps-focus-ring disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "min-h-8 px-3 text-xs",
        size === "md" && "px-4 text-sm",
        size === "lg" && "min-h-11 px-5 text-base",
        variant === "primary" && "border-transparent bg-primary text-primary-foreground hover:opacity-90",
        variant === "secondary" && "border-rule bg-paper-2 text-ink hover:bg-paper-3",
        variant === "ghost" && "border-transparent bg-transparent text-ink-2 hover:bg-paper-3 hover:text-ink",
        variant === "danger" && "border-transparent bg-err text-white hover:opacity-90",
        className
      )}
      {...props}
    />
  );
}

type ChipProps = ComponentPropsWithoutRef<"span"> & {
  tone?: Tone;
  selected?: boolean;
};

export function Chip({ className, tone = "neutral", selected = false, ...props }: ChipProps) {
  return (
    <span
      className={cx(
        "inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
        selected ? toneClass.accent : toneClass[tone],
        className
      )}
      {...props}
    />
  );
}

type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
};

type SegmentedControlProps<T extends string> = {
  label: string;
  value: T;
  options: Array<SegmentedOption<T>>;
  onChange: (value: T) => void;
  className?: string;
};

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx("inline-flex rounded-lg border border-rule bg-paper-3 p-1", className)}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          className={cx(
            "ps-control min-h-8 rounded-md px-3 text-sm font-medium transition-colors focus-visible:ps-focus-ring disabled:cursor-not-allowed disabled:opacity-50",
            option.value === value ? "bg-paper-2 text-ink shadow-sm" : "text-ink-3 hover:text-ink"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type ImageFallbackProps = ComponentPropsWithoutRef<"div"> & {
  label?: string;
  imageKey?: string | null;
  src?: string | null;
  alt?: string;
  widths?: number[];
};

export function ImageFallback({
  className,
  label = "ProjectSpice",
  imageKey,
  src,
  alt = "",
  widths = [192, 384, 768],
  ...props
}: ImageFallbackProps) {
  const [failed, setFailed] = useState(false);
  const imageSrc = src ?? appImageUrl(imageKey, { width: widths[1] ?? widths[0], format: "webp" });
  const srcSet = src ? undefined : appImageSrcSet(imageKey, widths);

  if (imageSrc && !failed) {
    return (
      <img
        src={imageSrc}
        srcSet={srcSet}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cx("h-full w-full object-cover", className)}
      />
    );
  }

  return (
    <div
      aria-label={alt || label}
      className={cx(
        "flex h-full w-full items-center justify-center bg-paper-3 text-xs font-semibold uppercase text-ink-4",
        className
      )}
      {...props}
    >
      {label}
    </div>
  );
}

type AlertProps = ComponentPropsWithoutRef<"div"> & {
  tone?: Tone;
  title?: ReactNode;
};

export function Alert({ className, tone = "neutral", title, children, ...props }: AlertProps) {
  const role = tone === "danger" ? "alert" : "status";
  return (
    <div
      role={props.role ?? role}
      className={cx("rounded-md border px-4 py-3 text-sm", feedbackToneClass[tone], className)}
      {...props}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : undefined}>{children}</div>}
    </div>
  );
}

export function LoadingState({
  label = "Loading",
  className,
}: {
  label?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-center gap-3 text-sm text-ink-3", className)} role="status">
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-rule border-t-primary"
      />
      <span>{label}</span>
    </div>
  );
}

export function ProgressBar({
  current,
  total,
  label,
  className,
}: {
  current: number;
  total: number;
  label?: ReactNode;
  className?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <div className={cx("space-y-1", className)}>
      <div className="flex justify-between gap-3 text-xs text-ink-3">
        <span>{label ?? `${current} / ${total}`}</span>
        <span>{pct}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-paper-3"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("ps-surface px-5 py-10 text-center", className)}>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-ink-3">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function FeedbackToast({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        "rounded-md border px-3 py-2 text-xs font-medium shadow-[var(--shadow-2)]",
        feedbackToneClass[tone],
        className
      )}
    >
      {children}
    </div>
  );
}

export function ModalFrame({
  title,
  description,
  children,
  className,
  role = "dialog",
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  role?: "dialog" | "alertdialog";
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <section
        role={role}
        aria-modal="true"
        className={cx("ps-surface w-full max-w-lg p-5 shadow-[var(--shadow-3)]", className)}
      >
        <div className="space-y-1">
          <h2 className="ps-display text-xl text-ink">{title}</h2>
          {description && <p className="text-sm text-ink-3">{description}</p>}
        </div>
        <div className="mt-4">{children}</div>
      </section>
    </div>
  );
}

export type RecipeSummary = {
  id: string;
  title: string;
  imageKey?: string | null;
  href?: string;
  meta?: ReactNode;
  tags?: string[];
  badge?: ReactNode;
};

export function RecipeCard({ recipe, className }: { recipe: RecipeSummary; className?: string }) {
  const content = (
    <>
      <div className="aspect-[4/3] overflow-hidden bg-paper-3">
        <ImageFallback imageKey={recipe.imageKey} alt={recipe.title} label="Recipe" />
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-start gap-2">
          <h3 className="line-clamp-2 flex-1 text-sm font-semibold leading-snug text-ink">
            {recipe.title}
          </h3>
          {recipe.badge}
        </div>
        {recipe.meta && <p className="text-xs text-ink-3">{recipe.meta}</p>}
        {recipe.tags && recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {recipe.tags.slice(0, 2).map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
          </div>
        )}
      </div>
    </>
  );

  const classes = cx(
    "ps-surface block overflow-hidden transition hover:border-ink-4 hover:shadow-md",
    className
  );
  return recipe.href ? <Link to={recipe.href} className={classes}>{content}</Link> : <article className={classes}>{content}</article>;
}

export function RecipeRow({ recipe, className }: { recipe: RecipeSummary; className?: string }) {
  const content = (
    <>
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-paper-3">
        <ImageFallback imageKey={recipe.imageKey} alt={recipe.title} label="Recipe" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-ink">{recipe.title}</h3>
          {recipe.badge}
        </div>
        {recipe.meta && <p className="truncate text-xs text-ink-3">{recipe.meta}</p>}
      </div>
      {recipe.tags && recipe.tags.length > 0 && (
        <div className="hidden max-w-[14rem] flex-wrap justify-end gap-1.5 sm:flex">
          {recipe.tags.slice(0, 3).map((tag) => (
            <Chip key={tag}>{tag}</Chip>
          ))}
        </div>
      )}
    </>
  );
  const classes = cx("ps-row flex items-center gap-3 border-b border-rule px-3 py-2", className);
  return recipe.href ? <Link to={recipe.href} className={classes}>{content}</Link> : <div className={classes}>{content}</div>;
}

export function FilterGroup({
  title,
  children,
  actions,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase text-ink-3">{title}</h2>
        {actions}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow && <p className="text-xs font-semibold uppercase text-ink-3">{eyebrow}</p>}
        <h1 className="ps-display text-2xl text-ink">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
