import type { Recipe } from "~/modules/recipe-domain";

const cookbookChapterOverrides: Record<string, string[]> = {
  "51-hour-focaccia": [
    "aerated"
  ],
  "72-hour-short-rib": [
    "fatty"
  ],
  "a-respectable-wedge-salad": [
    "Vegetables & Salad"
  ],
  "all-purpose-barbecue-sauce": [
    "Condiments",
    "Staples From Scratch"
  ],
  "arancini": [
    "crunchy"
  ],
  "asian-pear-salad": [
    "crunchy"
  ],
  "asparagus-soup": [
    "fluid"
  ],
  "austin-breakfast-tacos": [
    "Breakfast"
  ],
  "avocado-and-egg-toast": [
    "Appetizers/Snacks"
  ],
  "bagel-loaf": [
    "Breads & Starches"
  ],
  "banana-hot-fudge-sundae": [
    "Dessert"
  ],
  "basic-sourdough-bread": [
    "Breads & Starches"
  ],
  "basic-stock-out-of-anything": [
    "Staples From Scratch"
  ],
  "beef-pho": [
    "Soup"
  ],
  "beer-battered-fish": [
    "Fish"
  ],
  "better-than-popeyes-chicken-sandwich": [
    "Pasta & Sandwiches"
  ],
  "big-boy-miche": [
    "Breads & Starches"
  ],
  "birria-tacos": [
    "fluid"
  ],
  "bourbon-challah-french-toast-casserole": [
    "aerated"
  ],
  "brazilian-churrasco-style-picanha": [
    "chewy"
  ],
  "breakfast-sandwiches": [
    "Breakfast"
  ],
  "broccolini-with-toasted-peanuts-and-chili-oil": [
    "Vegetables & Salad"
  ],
  "brown-sugar-boba-tea": [
    "chewy"
  ],
  "browned-butter-cornbread": [
    "Breads & Starches"
  ],
  "browned-butter-basted-fried-eggs": [
    "Breakfast"
  ],
  "burger-and-sandwich-buns": [
    "Breads & Starches"
  ],
  "butter-chicken-wings": [
    "creamy"
  ],
  "buttermilk-biscuits": [
    "Breads & Starches"
  ],
  "butternut-risotto": [
    "creamy"
  ],
  "cacio-e-pepe": [
    "Pasta & Sandwiches"
  ],
  "cajun-puffed-beef-tendons": [
    "aerated"
  ],
  "caldo-de-res": [
    "fluid"
  ],
  "caramelized-onion-miso-soup": [
    "fluid"
  ],
  "carbonara": [
    "Pasta & Sandwiches"
  ],
  "carbonara-tteokbokki": [
    "chewy"
  ],
  "charred-kale": [
    "Vegetables & Salad"
  ],
  "chashu": [
    "Meat"
  ],
  "cheese-board-that-everyone-will-eat": [
    "Appetizers/Snacks"
  ],
  "cheese-foam": [
    "aerated"
  ],
  "chewy-fudge-brownies": [
    "chewy"
  ],
  "chicken-breasts-that-are-actually-good": [
    "Meat"
  ],
  "chicken-katsu": [
    "Meat"
  ],
  "chicken-nuggets": [
    "Meat"
  ],
  "chicken-parmesan": [
    "Meat"
  ],
  "chicken-pot-pie": [
    "creamy"
  ],
  "chicken-thigh-ballotine": [
    "fatty"
  ],
  "chicken-tortilla-soup": [
    "Soup"
  ],
  "chinese-sticky-rice": [
    "chewy"
  ],
  "churros": [
    "crunchy"
  ],
  "ch-vre": [
    "Cheese",
    "Staples From Scratch"
  ],
  "ciabatta": [
    "aerated"
  ],
  "cinnamon-toast": [
    "Breakfast"
  ],
  "cobb-salad": [
    "Vegetables & Salad"
  ],
  "coffee-ice-cream": [
    "Dessert"
  ],
  "compound-butters": [
    "Staples From Scratch"
  ],
  "congee": [
    "Breakfast"
  ],
  "cortado-ice-cream-sandwiches": [
    "chewy"
  ],
  "crispy-shallots": [
    "crunchy"
  ],
  "crudit-plate": [
    "crunchy"
  ],
  "cubano-bread": [
    "Breads & Starches"
  ],
  "cubanos": [
    "Pasta & Sandwiches"
  ],
  "diner-style-milkshakes": [
    "fluid"
  ],
  "dinner-rolls": [
    "Breads & Starches"
  ],
  "dutch-baby": [
    "aerated"
  ],
  "egg-drop-soup": [
    "Soup"
  ],
  "eggs-benedict": [
    "Breakfast"
  ],
  "english-muffins": [
    "Breads & Starches"
  ],
  "esquites": [
    "Vegetables & Salad"
  ],
  "everything-bagel-crackers": [
    "crunchy"
  ],
  "extra-tall-frittata": [
    "aerated"
  ],
  "extracted-animal-fat": [
    "Staples From Scratch"
  ],
  "fat-ass-pork-chop": [
    "chewy"
  ],
  "flavored-mayos": [
    "Condiments",
    "Staples From Scratch"
  ],
  "flour-tortillas": [
    "Breads & Starches"
  ],
  "french-fries": [
    "crunchy"
  ],
  "french-onion-soup": [
    "Soup"
  ],
  "french-toast": [
    "Breakfast"
  ],
  "fresh-pasta": [
    "Breads & Starches"
  ],
  "fried-brussels-sprouts": [
    "Vegetables & Salad"
  ],
  "fried-cauliflower": [
    "creamy"
  ],
  "fried-fish-tacos": [
    "Fish"
  ],
  "giant-baseball-cookies": [
    "chewy"
  ],
  "ginger-beer": [
    "aerated"
  ],
  "graham-crackers": [
    "Breads & Starches"
  ],
  "gravlax-sm-rrebr-d": [
    "Fish"
  ],
  "grilled-branzino": [
    "Fish"
  ],
  "grilled-cheese": [
    "Pasta & Sandwiches"
  ],
  "grilled-pork-secreto": [
    "fatty"
  ],
  "grocery-store-white-bread": [
    "Breads & Starches"
  ],
  "hamachi-crudo": [
    "fatty"
  ],
  "hazelnut-praline-cannoli": [
    "crunchy"
  ],
  "hokkaido-milk-bread-cinnamon-rolls": [
    "Breakfast"
  ],
  "homemade-roast-beef": [
    "chewy"
  ],
  "honey-butter-chicken-biscuits": [
    "Pasta & Sandwiches"
  ],
  "horseradish-chive-cream": [
    "Condiments",
    "Staples From Scratch"
  ],
  "hot-dog-buns": [
    "Breads & Starches"
  ],
  "hot-sauce": [
    "Condiments",
    "Staples From Scratch"
  ],
  "italian-beef": [
    "fluid"
  ],
  "italian-hot-chocolate": [
    "fluid"
  ],
  "jalape-o-salsa": [
    "Condiments",
    "Staples From Scratch"
  ],
  "jjolmyeon": [
    "chewy"
  ],
  "josh-s-jungle-juice": [
    "fluid"
  ],
  "kate-s-lemon-chicken": [
    "fatty"
  ],
  "katsu-sauce": [
    "Condiments",
    "Staples From Scratch"
  ],
  "ketchup": [
    "Condiments",
    "Staples From Scratch"
  ],
  "key-lime-pie": [
    "Dessert"
  ],
  "lacto-fermented-vegetables": [
    "Staples From Scratch"
  ],
  "ladyfingers": [
    "Breads & Starches"
  ],
  "lamb-shawarma": [
    "fatty"
  ],
  "lavender-cr-me-br-l-e": [
    "creamy"
  ],
  "lechon-pork-belly": [
    "fatty"
  ],
  "lighter-than-air-glazed-donuts": [
    "aerated"
  ],
  "maine-style-lobster-rolls": [
    "Fish"
  ],
  "matzoh-ball-soup": [
    "fluid"
  ],
  "mayonnaise": [
    "Condiments",
    "Staples From Scratch"
  ],
  "mezcal-tanghulu": [
    "crunchy"
  ],
  "milk-braised-pork": [
    "creamy"
  ],
  "minestrone": [
    "fluid"
  ],
  "mojo-braised-pulled-pork": [
    "Meat"
  ],
  "mom-s-chicken-fried-steak": [
    "Meat"
  ],
  "mom-s-chicken-noodle-soup": [
    "Soup"
  ],
  "mom-s-pot-roast": [
    "Meat"
  ],
  "mozzarella": [
    "Cheese",
    "Staples From Scratch"
  ],
  "my-famous-multipurpose-dough": [
    "Breads & Starches"
  ],
  "my-favorite-smoothie": [
    "fluid"
  ],
  "nashville-hot-honey-karaage": [
    "crunchy"
  ],
  "new-york-bagels": [
    "chewy"
  ],
  "nut-butters": [
    "Staples From Scratch"
  ],
  "one-pound-of-butter-mashed-potatoes": [
    "creamy"
  ],
  "parmesan-and-nut-crusted-salmon": [
    "Fish"
  ],
  "pastrami-bacon": [
    "chewy"
  ],
  "peanut-butter-cookies": [
    "Dessert"
  ],
  "perfect-pork-chops": [
    "Meat"
  ],
  "perfect-soft-boiled-eggs": [
    "Breakfast"
  ],
  "perfectly-baked-mac-and-cheese": [
    "creamy"
  ],
  "pesto-gnocchi": [
    "Pasta & Sandwiches"
  ],
  "pesto-sauce": [
    "Condiments",
    "Staples From Scratch"
  ],
  "pickled-anything": [
    "Staples From Scratch"
  ],
  "pommes-gaufrettes": [
    "crunchy"
  ],
  "potato-gnocchi": [
    "Breads & Starches"
  ],
  "potatoes-dauphinoise": [
    "creamy"
  ],
  "prawn-toast": [
    "crunchy"
  ],
  "pretzel-sticks": [
    "Appetizers/Snacks"
  ],
  "puffed-potatoes": [
    "aerated"
  ],
  "puffed-rice-crackers": [
    "aerated"
  ],
  "ranch-dressing": [
    "Condiments",
    "Staples From Scratch"
  ],
  "restaurant-style-duck-breasts": [
    "Meat"
  ],
  "ricotta": [
    "Cheese",
    "Staples From Scratch"
  ],
  "ricotta-pancakes": [
    "Breakfast"
  ],
  "roasted-chicken": [
    "Meat"
  ],
  "roasted-mushroom-soup-with-garlic-chantilly-cream": [
    "Soup"
  ],
  "root-vegetable-salad": [
    "creamy"
  ],
  "rose-water-baklava": [
    "crunchy"
  ],
  "russian-tea-cakes": [
    "Dessert"
  ],
  "salted-butter-and-jam-toast": [
    "Breakfast"
  ],
  "sauce-gribiche": [
    "Condiments",
    "Staples From Scratch"
  ],
  "schnitzel": [
    "crunchy"
  ],
  "sfogliatelle": [
    "aerated"
  ],
  "shoyu-ramen": [
    "Soup"
  ],
  "simple-jams": [
    "Staples From Scratch"
  ],
  "smash-burgers": [
    "Pasta & Sandwiches"
  ],
  "smashed-patatas-bravas": [
    "Appetizers/Snacks"
  ],
  "smoked-salted-caramel-candies": [
    "chewy"
  ],
  "sourdough-starter": [
    "Breads & Starches"
  ],
  "spicy-curry-puffed-chickpeas": [
    "aerated"
  ],
  "spicy-soup-base-caramel-corn": [
    "crunchy"
  ],
  "steak-sandwiches": [
    "Pasta & Sandwiches"
  ],
  "sticky-buns": [
    "Dessert"
  ],
  "strawberry-shortcake": [
    "Dessert"
  ],
  "tempura": [
    "crunchy"
  ],
  "texas-smoked-brisket": [
    "fatty"
  ],
  "texas-toast-smashburgers": [
    "fatty"
  ],
  "the-easiest-crispy-skin-fish": [
    "Fish"
  ],
  "the-greatest-caesar-salad-of-your-life": [
    "Vegetables & Salad"
  ],
  "the-ideal-steak-for-two": [
    "fluid"
  ],
  "the-perfect-blt": [
    "Pasta & Sandwiches"
  ],
  "the-perfect-potato-salad": [
    "creamy"
  ],
  "the-perfect-steak": [
    "Meat"
  ],
  "the-simplest-chocolate-cake": [
    "Dessert"
  ],
  "the-ultimate-chocolate-chip-cookie": [
    "Dessert"
  ],
  "tiramisu": [
    "Dessert"
  ],
  "tom-kha-gai": [
    "creamy"
  ],
  "tomato-soup": [
    "Soup"
  ],
  "traditional-consomm": [
    "fluid"
  ],
  "tres-leches": [
    "creamy"
  ],
  "tuna-melt-allison-s-heart": [
    "Pasta & Sandwiches"
  ],
  "ultimate-breakfast-sausage": [
    "fatty"
  ],
  "unsalted-butter": [
    "Staples From Scratch"
  ],
  "watermelon-gazpacho": [
    "Soup"
  ],
  "whipped-ricotta-garlic-dip": [
    "Appetizers/Snacks"
  ]
};

export function getCookbookChapterOverrides(recipe: Recipe): string[] {
  return cookbookChapterOverrides[recipe.id] ?? [];
}
