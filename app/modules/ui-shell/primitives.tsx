import {
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ImgHTMLAttributes,
  type InputHTMLAttributes,
} from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
};

type TextInputProps = {
  label: string;
  name: string;
  placeholder?: string;
  defaultValue?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "name" | "placeholder">;

type TabsProps = {
  tabs: Array<{
    id: string;
    label: string;
    href?: string;
    selected?: boolean;
  }>;
};

type EmptyStateProps = {
  title: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
};

type RecipeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt"> & {
  title: string;
  alt?: string;
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonProps) {
  return <button className={`button button-${variant} ${className}`.trim()} {...props} />;
}

export function TextInput({
  label,
  name,
  placeholder,
  defaultValue,
  ...props
}: TextInputProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        placeholder={placeholder}
        defaultValue={defaultValue}
        {...props}
      />
    </label>
  );
}

export function Tabs({ tabs }: TabsProps) {
  return (
    <div
      className="tabs"
      role="tablist"
      aria-label="Recipe view"
      style={{ "--tab-count": tabs.length } as CSSProperties}
    >
      {tabs.map((tab) => (
        tab.href ? (
          <a
            key={tab.id}
            className={tab.selected ? "tab active" : "tab"}
            href={tab.href}
            role="tab"
            aria-selected={tab.selected ? "true" : "false"}
          >
            {tab.label}
          </a>
        ) : (
          <button
            key={tab.id}
            className={tab.selected ? "tab active" : "tab"}
            type="button"
            role="tab"
            aria-selected={tab.selected ? "true" : "false"}
          >
            {tab.label}
          </button>
        )
      ))}
    </div>
  );
}

export function EmptyState({ title, body, actionLabel, actionHref }: EmptyStateProps) {
  return (
    <section className="empty-state" aria-labelledby="empty-state-title">
      <h2 id="empty-state-title">{title}</h2>
      <p>{body}</p>
      {actionLabel && actionHref ? (
        <a className="button button-primary" href={actionHref}>
          {actionLabel}
        </a>
      ) : actionLabel ? (
        <Button type="button" variant="primary">
          {actionLabel}
        </Button>
      ) : null}
    </section>
  );
}

export function getDisplayImageSrc(src: string | undefined): string | undefined {
  if (!src) {
    return undefined;
  }

  try {
    const url = new URL(src);

    if (url.hostname === "spice.h6nk.dev") {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return src;
  }

  return src;
}

export function RecipeImage({ src, title, alt, className = "", ...props }: RecipeImageProps) {
  const [hasError, setHasError] = useState(false);
  const displaySrc = getDisplayImageSrc(src);
  const shouldUseFallback = !displaySrc || hasError || displaySrc.includes("/mock-images/");
  const fallbackLabel =
    title.length <= 3
      ? title.toUpperCase()
      : title
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((word) => word[0]?.toUpperCase())
          .join("");

  if (shouldUseFallback) {
    return (
      <div className={`image-fallback ${className}`.trim()} aria-label={`${title} image`}>
        <span>{fallbackLabel || "PS"}</span>
      </div>
    );
  }

  return (
    <img
      className={className}
      src={displaySrc}
      alt={alt ?? title}
      onError={() => setHasError(true)}
      {...props}
    />
  );
}
