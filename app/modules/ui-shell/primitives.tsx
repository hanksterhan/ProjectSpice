import { useState, type ButtonHTMLAttributes, type ImgHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
};

type TextInputProps = {
  label: string;
  name: string;
  placeholder?: string;
  defaultValue?: string;
};

type TabsProps = {
  tabs: Array<{
    id: string;
    label: string;
    selected?: boolean;
  }>;
};

type EmptyStateProps = {
  title: string;
  body: string;
  actionLabel?: string;
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
}: TextInputProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name} placeholder={placeholder} defaultValue={defaultValue} />
    </label>
  );
}

export function Tabs({ tabs }: TabsProps) {
  return (
    <div className="tabs" role="tablist" aria-label="Recipe view">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={tab.selected ? "tab active" : "tab"}
          type="button"
          role="tab"
          aria-selected={tab.selected ? "true" : "false"}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, body, actionLabel }: EmptyStateProps) {
  return (
    <section className="empty-state" aria-labelledby="empty-state-title">
      <h2 id="empty-state-title">{title}</h2>
      <p>{body}</p>
      {actionLabel ? (
        <Button type="button" variant="primary">
          {actionLabel}
        </Button>
      ) : null}
    </section>
  );
}

export function RecipeImage({ src, title, alt, className = "", ...props }: RecipeImageProps) {
  const [hasError, setHasError] = useState(false);
  const shouldUseFallback = !src || hasError || src.includes("/mock-images/");
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

  if (shouldUseFallback) {
    return (
      <div className={`image-fallback ${className}`.trim()} aria-label={`${title} image`}>
        <span>{initials || "PS"}</span>
      </div>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt ?? title}
      onError={() => setHasError(true)}
      {...props}
    />
  );
}
