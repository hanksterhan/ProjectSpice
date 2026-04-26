const RULES: Array<{ aisle: string; keywords: string[] }> = [
  {
    aisle: "Produce",
    keywords: [
      "onion", "garlic", "shallot", "scallion", "leek", "chive",
      "tomato", "potato", "carrot", "celery", "spinach", "kale",
      "lettuce", "arugula", "chard", "broccoli", "cauliflower",
      "cabbage", "zucchini", "squash", "pumpkin", "cucumber",
      "bell pepper", "jalapeño", "jalapeno", "chili", "chile", "mushroom",
      "avocado", "lemon", "lime", "orange", "grapefruit",
      "apple", "pear", "peach", "plum", "cherry", "apricot",
      "grape", "strawberries", "strawberry", "blueberries", "blueberry",
      "raspberries", "raspberry", "blackberries", "blackberry",
      "mango", "pineapple", "banana", "watermelon", "melon",
      "fig", "pomegranate", "kiwi", "corn", "asparagus",
      "artichoke", "fennel", "radish", "beet", "turnip",
      "parsnip", "sweet potato", "yam", "eggplant",
      "okra", "snap pea", "snow pea", "green bean", "edamame",
      "sprout", "watercress", "endive", "ginger", "turmeric root",
      "fresh basil", "fresh parsley", "fresh cilantro",
      "fresh mint", "fresh dill", "fresh thyme", "fresh rosemary",
    ],
  },
  {
    aisle: "Dairy & Eggs",
    keywords: [
      "milk", "cream", "half-and-half", "half and half",
      "butter", "ghee", "cheese", "cheddar", "parmesan",
      "mozzarella", "brie", "ricotta", "gouda", "feta",
      "gruyère", "gruyere", "provolone", "goat cheese",
      "cream cheese", "sour cream", "crème fraîche", "creme fraiche",
      "yogurt", "kefir", "egg",
    ],
  },
  {
    aisle: "Meat & Poultry",
    keywords: [
      "chicken", "turkey", "duck", "beef", "steak", "ground beef",
      "pork", "bacon", "ham", "prosciutto", "pancetta", "sausage",
      "chorizo", "salami", "pepperoni", "lamb", "veal", "venison",
      "bison", "rabbit", "ribs", "tenderloin", "sirloin",
      "chuck", "brisket", "short rib",
    ],
  },
  {
    aisle: "Seafood",
    keywords: [
      "salmon", "tuna", "tilapia", "cod", "halibut",
      "bass", "trout", "mahi", "swordfish", "snapper",
      "sardine", "anchovy", "shrimp", "prawn", "scallop",
      "crab", "lobster", "clam", "mussel", "oyster",
      "squid", "octopus", "caviar", "lox",
    ],
  },
  {
    aisle: "Bakery",
    keywords: [
      "bread", "sourdough", "baguette", "dinner roll", "hamburger bun",
      "tortilla", "pita", "naan", "flatbread", "bagel",
      "croissant", "brioche", "focaccia", "ciabatta",
      "english muffin", "breadcrumb", "panko",
    ],
  },
  {
    aisle: "Canned & Jarred",
    keywords: [
      "canned tomato", "tomato sauce", "tomato paste", "diced tomatoes",
      "crushed tomatoes", "whole tomatoes", "coconut milk",
      "coconut cream", "black beans", "kidney beans", "white beans",
      "cannellini", "pinto beans", "navy beans", "chickpeas",
      "lentils", "chicken broth", "beef broth", "vegetable broth",
      "olives", "capers", "artichoke hearts",
      "roasted peppers", "sun-dried tomatoes", "water chestnuts",
      "bamboo shoots", "pumpkin puree", "applesauce",
      "fish sauce", "soy sauce", "tamari", "worcestershire",
      "hot sauce", "vinegar", "balsamic",
      "mustard", "ketchup", "mayonnaise", "pickles",
      "hoisin", "oyster sauce", "teriyaki", "bbq sauce",
      "tahini", "peanut butter", "almond butter", "nut butter",
      "miso", "sriracha",
    ],
  },
  {
    aisle: "Oils",
    keywords: [
      "olive oil", "vegetable oil", "canola oil", "sesame oil",
      "coconut oil", "avocado oil", "cooking spray", "cooking oil",
      "neutral oil",
    ],
  },
  {
    aisle: "Spices & Seasonings",
    keywords: [
      "kosher salt", "sea salt", "black pepper", "white pepper",
      "red pepper flakes", "paprika", "smoked paprika", "cumin",
      "coriander", "turmeric", "curry", "garam masala", "chili powder",
      "cayenne", "dried oregano", "dried basil", "dried thyme",
      "dried rosemary", "dried sage", "dried dill",
      "marjoram", "bay leaf", "bay leaves", "allspice",
      "cloves", "cinnamon", "nutmeg", "cardamom", "star anise",
      "fennel seeds", "caraway", "mustard seeds", "poppy seeds",
      "sesame seeds", "onion powder", "garlic powder",
      "everything bagel", "old bay", "za'atar", "sumac",
    ],
  },
  {
    aisle: "Frozen",
    keywords: ["frozen peas", "frozen corn", "frozen spinach", "frozen edamame",
      "frozen berries", "frozen fruit", "ice cream", "gelato", "sorbet"],
  },
  {
    aisle: "Pantry",
    keywords: [
      "all-purpose flour", "whole wheat flour", "bread flour", "flour",
      "cornmeal", "cornstarch", "arrowroot",
      "baking powder", "baking soda", "yeast",
      "granulated sugar", "brown sugar", "powdered sugar", "confectioners",
      "vanilla extract", "vanilla bean", "chocolate chips", "cocoa powder",
      "dark chocolate", "bittersweet chocolate",
      "pasta", "spaghetti", "penne", "rigatoni", "linguine",
      "fettuccine", "lasagna noodle", "egg noodle", "ramen noodle",
      "basmati rice", "jasmine rice", "white rice", "brown rice",
      "wild rice", "quinoa", "couscous", "farro", "barley",
      "rolled oats", "steel-cut oats", "oats", "granola", "cereal",
      "crackers", "almonds", "walnuts", "pecans",
      "cashews", "pistachios", "pine nuts", "hazelnuts", "peanuts",
      "sunflower seeds", "pumpkin seeds", "flax seeds", "chia seeds",
      "raisins", "dried cranberries", "dried apricots", "dried fruit",
      "honey", "molasses", "maple syrup", "corn syrup",
      "white wine", "red wine", "sake", "mirin", "marsala", "sherry",
      "gelatin", "pectin", "nutritional yeast", "shredded coconut",
    ],
  },
];

export const AISLE_ORDER: string[] = [
  "Produce",
  "Dairy & Eggs",
  "Meat & Poultry",
  "Seafood",
  "Bakery",
  "Canned & Jarred",
  "Oils",
  "Spices & Seasonings",
  "Frozen",
  "Pantry",
  "Other",
];

// Flatten keywords sorted longest-first so compound terms win over single words
// (e.g. "tomato paste" beats "tomato", "garlic powder" beats "garlic")
const SORTED_PAIRS: Array<{ kw: string; aisle: string }> = [];
for (const { aisle, keywords } of RULES) {
  for (const kw of keywords) {
    SORTED_PAIRS.push({ kw, aisle });
  }
}
SORTED_PAIRS.sort((a, b) => b.kw.length - a.kw.length);

export function categorizeAisle(name: string): string {
  const lower = name.toLowerCase();
  for (const { kw, aisle } of SORTED_PAIRS) {
    if (lower.includes(kw)) return aisle;
  }
  return "Other";
}
