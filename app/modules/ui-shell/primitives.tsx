import {
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ImgHTMLAttributes,
  type InputHTMLAttributes,
} from "react";
import { Star } from "lucide-react";

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

type RatingStarsProps = {
  rating?: number;
  className?: string;
};

type FavoriteStarProps = {
  favorite?: boolean;
  className?: string;
  decorative?: boolean;
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonProps) {
  return <button className={`button button-${variant} ${className}`.trim()} {...props} />;
}

export function RatingStars({ rating, className = "" }: RatingStarsProps) {
  const normalizedRating = rating === undefined ? 0 : Math.max(0, Math.min(10, rating));
  const filledStars = normalizedRating / 2;
  const starFillPercents = getRatingStarFillPercents(rating);
  const label =
    rating === undefined
      ? "Unrated"
      : `${rating.toFixed(1)} out of 10, ${filledStars.toFixed(1)} out of 5 stars`;

  return (
    <div className={`recipe-rating ${className}`.trim()} aria-label={label}>
      {starFillPercents.map((fillPercent, index) => {
        return (
          <span className="rating-star-shell" key={index}>
            <Star aria-hidden="true" className="rating-star empty" />
            <span className="rating-star-fill" style={{ width: `${fillPercent}%` }}>
              <Star aria-hidden="true" className="rating-star filled" />
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function FavoriteStar({
  favorite = false,
  className = "",
  decorative = false,
}: FavoriteStarProps) {
  return (
    <span
      className={`favorite-star ${favorite ? "filled" : "empty"} ${className}`.trim()}
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : favorite ? "Favorite recipe" : "Not a favorite recipe"}
      title={decorative ? undefined : favorite ? "Favorite" : "Not a favorite"}
    >
      <Star aria-hidden="true" size={20} strokeWidth={2.4} />
    </span>
  );
}

export function getRatingStarFillPercents(rating?: number): number[] {
  const normalizedRating = rating === undefined ? 0 : Math.max(0, Math.min(10, rating));
  const filledStars = normalizedRating / 2;

  return Array.from({ length: 5 }, (_, index) =>
    Math.max(0, Math.min(1, filledStars - index)) * 100,
  );
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
  const {
    decoding = "async",
    loading = "lazy",
    sizes = "(max-width: 720px) 45vw, (max-width: 1180px) 22vw, 16vw",
    ...imageProps
  } = props;

  if (shouldUseFallback) {
    return (
      <div className={`image-fallback ${className}`.trim()} aria-label={`${title} image`}>
        <MissingRecipeImageIcon />
      </div>
    );
  }

  return (
    <img
      className={className}
      src={displaySrc}
      alt={alt ?? title}
      decoding={decoding}
      loading={loading}
      onError={() => setHasError(true)}
      sizes={sizes}
      {...imageProps}
    />
  );
}

function MissingRecipeImageIcon() {
  return (
    <svg
      aria-hidden="true"
      className="image-fallback-icon"
      focusable="false"
      viewBox="0 0 48 48"
    >
      <rect x="8" y="10" width="32" height="28" rx="2" />
      <circle cx="18" cy="19" r="4" />
      <path d="m10 34 11-11 8 8" />
      <path d="m25 27 6-6 7 7" />
    </svg>
  );
}
