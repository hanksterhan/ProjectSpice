import type { Recipe, RecipeDraft } from "./recipe.types";

export const validRecipeFixture: Recipe = {
  id: "weeknight-sesame-chicken-bowls",
  title: "Weeknight Sesame Chicken Bowls",
  description: "A fast, saucy rice bowl with crisp cucumber and scallions.",
  yield: {
    quantity: 4,
    unit: "servings",
  },
  times: {
    prepMinutes: 15,
    cookMinutes: 20,
    totalMinutes: 35,
  },
  imageUrl: "https://images.example.com/weeknight-sesame-chicken-bowls.jpg",
  ingredients: [
    {
      id: "main-ingredients",
      title: "Chicken and bowls",
      items: [
        {
          id: "chicken-thighs",
          raw: "1 1/2 lb boneless chicken thighs, cut into bite-size pieces",
          quantity: 1.5,
          unit: "lb",
          item: "boneless chicken thighs",
          preparation: "cut into bite-size pieces",
        },
        {
          id: "jasmine-rice",
          raw: "3 cups cooked jasmine rice",
          quantity: 3,
          unit: "cups",
          item: "cooked jasmine rice",
        },
        {
          id: "cucumber",
          raw: "1 Persian cucumber, thinly sliced",
          quantity: 1,
          item: "Persian cucumber",
          preparation: "thinly sliced",
        },
      ],
    },
    {
      id: "sauce",
      title: "Sesame sauce",
      items: [
        {
          id: "soy-sauce",
          raw: "1/4 cup soy sauce",
          quantity: 0.25,
          unit: "cup",
          item: "soy sauce",
        },
        {
          id: "toasted-sesame-oil",
          raw: "2 tsp toasted sesame oil",
          quantity: 2,
          unit: "tsp",
          item: "toasted sesame oil",
        },
        {
          id: "chili-crisp",
          raw: "Chili crisp, optional",
          item: "chili crisp",
          optional: true,
        },
      ],
    },
  ],
  directions: [
    {
      id: "cook",
      title: "Cook",
      steps: [
        {
          id: "mix-sauce",
          order: 1,
          text: "Whisk the soy sauce, sesame oil, and a splash of water in a small bowl.",
          ingredientRefs: ["soy-sauce", "toasted-sesame-oil"],
        },
        {
          id: "brown-chicken",
          order: 2,
          text: "Brown the chicken in a hot skillet until cooked through.",
          timerMinutes: 8,
          ingredientRefs: ["chicken-thighs"],
        },
        {
          id: "finish-bowls",
          order: 3,
          text: "Toss the chicken with sauce, then serve over rice with cucumber.",
          ingredientRefs: ["jasmine-rice", "cucumber"],
        },
      ],
    },
  ],
  variations: [
    {
      id: "turkey-bowls",
      title: "Turkey sesame bowls",
      directions: [
        {
          id: "turkey-bowls-directions",
          steps: [
            {
              id: "swap-turkey",
              order: 1,
              text: "Use ground turkey instead of chicken and brown it before adding sauce.",
            },
          ],
        },
      ],
    },
  ],
  notes: ["Add steamed snap peas for a greener bowl."],
  source: {
    type: "manual",
    name: "Project Spice test kitchen",
    url: "https://spice.h6nk.dev/recipes/weeknight-sesame-chicken-bowls",
  },
  tags: ["weeknight", "chicken", "rice bowl"],
  version: 1,
  createdAt: "2026-05-27T07:00:00.000Z",
  updatedAt: "2026-05-27T07:00:00.000Z",
};

const { imageUrl: _imageUrl, ...validRecipeWithoutImage } = validRecipeFixture;

export const validRecipeWithoutImageFixture: Recipe = {
  ...validRecipeWithoutImage,
  id: "weeknight-sesame-chicken-bowls-no-image",
};

export const validRecipeDraftFixture: RecipeDraft = {
  title: "Lemony White Bean Toasts",
  description: "Creamy beans over crisp toast with herbs and lemon.",
  yield: {
    quantity: 2,
    unit: "servings",
  },
  times: {
    prepMinutes: 10,
    cookMinutes: 5,
    totalMinutes: 15,
  },
  ingredients: [
    {
      id: "toast-ingredients",
      items: [
        {
          id: "white-beans",
          raw: "1 can cannellini beans, drained",
          quantity: 1,
          unit: "can",
          item: "cannellini beans",
          preparation: "drained",
        },
      ],
    },
  ],
  directions: [
    {
      id: "assemble",
      steps: [
        {
          id: "warm-beans",
          order: 1,
          text: "Warm the beans with olive oil, lemon zest, and a pinch of salt.",
        },
      ],
    },
  ],
  variations: [
    {
      id: "herby-white-bean-toasts",
      title: "Herby white bean toasts",
      directions: [
        {
          id: "herby-white-bean-toasts-directions",
          steps: [
            {
              id: "add-herbs",
              order: 1,
              text: "Fold in chopped parsley and chives before spooning the beans onto toast.",
            },
          ],
        },
      ],
    },
  ],
  source: {
    type: "ai",
    name: "Generated draft",
  },
  tags: ["quick", "vegetarian"],
};
